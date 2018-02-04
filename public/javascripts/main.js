var socket; // define a global variable called socket 

canvas_width = window.innerWidth * window.devicePixelRatio;
canvas_height = window.innerHeight * window.devicePixelRatio;

game = new Phaser.Game(canvas_width,canvas_height, Phaser.CANVAS, 'gameDiv');

//the enemy player list 
var players = [];

var gameProperties = { 
	gameWidth: 4000,
	gameHeight: 4000,
	game_elemnt: "gameDiv",
	in_game: false,
};

var main = function(game) {}

// this function is fired when we connect
function onSocketConnected () {
	console.log("connected to server"); 
	gameProperties.in_game = true;
	socket.emit('new_player', {x: 0, y: 0, angle: 0});
}

// When the server notifies us of client disconnection, we find the disconnected
// enemy and remove from our game
function onRemovePlayer (data) {
	var remove_player = findplayerbyid(data.id);
	// Player not found
	if (!remove_player) {
		console.log('Player not found: ', data.id)
		return;
	}
	
	remove_player.avatar.destroy();
	players.splice(players.indexOf(remove_player), 1);
}

// this is the enemy class. 
var player = function (data) {
	console.log("new player", data);
	this.x = data.x;
	this.y = data.y;
	this.id = data.id;
	this.angle = data.angle;
	
	this.avatar = game.add.graphics(this.x , this.y);
	this.avatar.radius = data.size;

	// set a fill and line style
	this.avatar.beginFill(0xffd900);
	this.avatar.lineStyle(2, 0xffd900, 1);
	this.avatar.drawCircle(0, 0, this.avatar.radius * 2);
	this.avatar.endFill();
	this.avatar.anchor.setTo(0.5,0.5);
	this.avatar.body_size = this.avatar.radius;
	//set the initial size;
	this.avatar.initial_size = this.avatar.radius;
	this.avatar.type = "player_body";
	this.avatar.id = this.id;

	// draw a shape
	game.physics.p2.enableBody(this.avatar, true);
	this.avatar.body.clearShapes();
	this.avatar.body.addCircle(this.avatar.body_size, 0, 0); 
	this.avatar.body.data.shapes[0].sensor = true;
	
	if (this.id == socket.id) {
		//enable collision and when it makes a contact with another body, call player_coll
		this.avatar.body.onBeginContact.add(onPlayerCollision, this);
		//We need this line to make camera follow player
		game.camera.follow(this.avatar, Phaser.Camera.FOLLOW_TOPDOWN_TIGHT, 0.5, 0.5);
	}
}

//we call this function when the main player colides with some other bodies.
function onPlayerCollision (body, bodyB, shapeA, shapeB, equation) {
	console.log("collision");
	
	//the id of the collided body that player made contact with 
	var key = body.sprite.id; 
	//the type of the body the player made contact with 
	var type = body.sprite.type; 
	
	if (type == "player_body") {
		//send the player collision
		console.log("sending collision");
		socket.emit('player_collision', {id: key}); 
	}
	else
	{
		console.log("type: ", type);	
	}
}

//Server will tell us when a new enemy player connects to the server.
//We create a new enemy in our game.
function onNewPlayer (data) {
	var new_player = new player(data); 
	players.push(new_player);
}

//Server tells us there is a new enemy movement. We find the moved enemy
//and sync the enemy movement with the server
function onMovePlayer (data) {
	var move_player = findplayerbyid(data.id); 
	
	if (!move_player) {
		return;
	}
	
	var new_pointer = {
		x: data.x,
		y: data.y, 
		worldX: data.x,
		worldY: data.y, 
	}
	
	//check if the server enemy size is not equivalent to the client
	if (data.size != move_player.avatar.body_size) {
		move_player.avatar.body_size = data.size; 
		var new_scale = move_player.avatar.body_size / move_player.initial_size; 
		move_player.avatar.scale.set(new_scale);
		move_player.avatar.body.clearShapes();
		move_player.avatar.body.addCircle(move_player.avatar.body_size, 0 , 0); 
		move_player.avatar.body.data.shapes[0].sensor = true;
	}
		
	playerPhysics.movetoPointer(move_player.avatar, 10000, new_pointer);
}

main.prototype = {
	preload: function() {
		game.stage.disableVisibilityChange = true;
		game.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
		game.world.setBounds(0, 0, gameProperties.gameWidth, gameProperties.gameHeight, false, false, false, false);
		game.physics.startSystem(Phaser.Physics.P2JS);
		game.physics.p2.setBoundsToWorld(false, false, false, false, false)
		game.physics.p2.gravity.y = 0;
		game.physics.p2.applyGravity = false; 
		game.physics.p2.enableBody(game.physics.p2.walls, false); 
		//game.physics.p2.setImpactEvents(true);
  },
	
	//this function is fired once when we load the game
	create: function () {
		game.stage.backgroundColor = 0xE1A193;

		socket = io.connect(); // send a connection request to the server
		console.log("client started");
		socket.on("connect", onSocketConnected);

		//listen to new enemy connections
		socket.on("new_player", onNewPlayer);
		//listen to enemy movement 
		socket.on("move_player", onMovePlayer);
		// when received remove_player, remove the player passed; 
		socket.on('remove_player', onRemovePlayer);
	},

	update: function() {
		for (var i = 0; i < players.length; i++) {
			players[i].avatar.body.angle = playerPhysics.updateVelocity(players[i].avatar, 10000);
		}
		
		// emit the player input
		
		//move the player when the player is made 
		if (gameProperties.in_game) {
		
			//we're making a new mouse pointer and sending this input to 
			//the server.
			var pointer = game.input.mousePointer;
					
			//Send a new position data to the server 
			socket.emit('player_input', {
				pointer_x: pointer.x, 
				pointer_y: pointer.y, 
				pointer_worldx: pointer.worldX, 
				pointer_worldy: pointer.worldY, 
			});
		}
	}
}

//This is where we use the socket id. 
//Search through enemies list to find the right enemy of the id.
function findplayerbyid (id) {
	for (var i = 0; i < players.length; i++) {
		if (players[i].id == id) {
			return players[i]; 
		}
	}
}

// wrap the game states.
var gameBootstrapper = {
	init: function(gameContainerElementId){
		game.state.add('main', main);
		game.state.start('main'); 
	}
};

//call the init function in the wrapper and specifiy the division id 
gameBootstrapper.init("gameDiv");
