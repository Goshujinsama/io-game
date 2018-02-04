var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var p2 = require('p2');

var index = require('./routes/index');
var users = require('./routes/users');
var playerPhysics = require('./public/javascripts/player_physics.js');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// binds the serv object we created to socket.io
var io = require('socket.io')();
app.io = io;

var player_lst = [];

var startTime = (new Date()).getTime();
var lastTime;
var timeStep = 1/70;

var world = new p2.World({
  gravity : [0,0]
});

// A player “class”, which will be stored inside player list 
var Player = function (startAngle) {
  this.angle = startAngle
  this.speed = 500;
  //We need to intilaize with true.
  this.sendData = true;
	this.size = getRndInteger(40, 100); 
  this.dead = false;
}

//We call physics handler 60fps. The physics is calculated here. 
setInterval(physics_hanlder, 1000/60);

//Steps the physics world. 
function physics_hanlder() {
	var currentTime = (new Date()).getTime();
	timeElapsed = currentTime - startTime;
	var dt = lastTime ? (timeElapsed - lastTime) / 1000 : 0;
	dt = Math.min(1 / 10, dt);
	
	for (i = 0; i < player_lst.length; i++) {
		var existing_player = player_lst[i];
		
		playerPhysics.updateVelocity(existing_player, existing_player.speed);

		//when sendData is true, we send the data back to client. 
		if (!existing_player.sendData) {
			continue;
		}

		//every 50ms, we send the data. 
		setTimeout(function() {existing_player.sendData = true}, 50);
		//we set sendData to false when we send the data. 
		existing_player.sendData = false;

		var move_player_data = {
			id: existing_player.id, 
			x: existing_player.body.position[0],
			y: existing_player.body.position[1],
			angle: existing_player.body.angle,
			size: existing_player.size
		}

		//send to everyone
		io.emit('move_player', move_player_data);
	}
	
	world.step(timeStep);
}

//onNewplayer function is called whenever a server gets a message “new_player” from the client
function onNewplayer (data) {
	console.log(data);
	//form a new player object 
	var new_player = new Player(data.angle);
	
	new_player.body = new p2.Body ({
		mass: 0,
		position: [data.x, data.y],
		fixedRotation: true
	});
	
	world.addBody(new_player.body);
	
	console.log("created new player with id " + this.id);
	new_player.id = this.id;
	
	var current_info = {
		id: new_player.id, 
		x: new_player.body.position[0],
		y: new_player.body.position[1],
		angle: new_player.angle,
		size: new_player.size,
	};
	
	//send to the new player about everyone who is already connected. 	
	for (i = 0; i < player_lst.length; i++) {
		var existing_player = player_lst[i];
		var player_info = {
			id: existing_player.id,
			x: existing_player.body.position[0],
			y: existing_player.body.position[1], 
			angle: existing_player.angle,			
		};
		console.log("pushing player", player_info);
		//send message to the sender-client only
		this.emit("new_player", player_info);
	}
	
	//send to everyone
	io.emit('new_player', current_info);

	player_lst.push(new_player); 
}

//instead of listening to player positions, we listen to user inputs 
function onPlayerInput (data) {
	var move_player = find_playerid(this.id, this.room);
	
	if (!move_player || move_player.dead) {
		//console.log('no player'); 
		return;
	}

	//Make a new pointer with the new inputs from the client. 
	//contains player positions in server
	var serverPointer = {
		x: data.pointer_x,
		y: data.pointer_y,
		worldX: data.pointer_worldx,
		worldY: data.pointer_worldy
	}
	
	playerPhysics.movetoPointer(move_player, move_player.speed, serverPointer);
}

function onPlayerCollision (data) {
	if (this.id === data.id)
	{
		return;
	}
	
	var move_player = find_playerid(this.id); 
	var enemy_player = find_playerid(data.id); 
	
	if (!move_player || !enemy_player || move_player.dead || enemy_player.dead)
	{
		return
	}
	
	console.log("p1: ", move_player.id, " p2: ", enemy_player.id, " sizes: ", move_player.size, enemy_player.size);

	if (move_player.size == enemy_player.size)
	{
		return
	}
		
	//the main player size is less than the enemy size
	else if (move_player.size < enemy_player.size)
	{
		var gained_size = move_player.size / 2;
		enemy_player.size += gained_size; 
		playerKilled(move_player);
	}
	else
	{
		var gained_size = enemy_player.size / 2;
		move_player.size += gained_size;
		playerKilled(enemy_player);
	}
	
	console.log("someone ate someone!!!");
}

function playerKilled (player) {
	console.log("player died: ", player.id);
	io.emit('remove_player', {id: player.id});
	player.dead = true; 
}

function getRndInteger(min, max) {
	return Math.floor(Math.random() * (max - min + 1) ) + min;
}

//call when a client disconnects and tell the clients except sender to remove the disconnected player
function onClientdisconnect() {
	console.log('disconnect'); 

	var removePlayer = find_playerid(this.id); 
		
	if (removePlayer) {
		player_lst.splice(player_lst.indexOf(removePlayer), 1);
	}
	
	console.log("removing player " + this.id);
	
	//send message to every connected client except the sender
	this.broadcast.emit('remove_player', {id: this.id});
}

// find player by the the unique socket id 
function find_playerid(id) {

	for (var i = 0; i < player_lst.length; i++) {

		if (player_lst[i].id == id) {
			return player_lst[i]; 
		}
	}
	
	return false; 
}

// listen for a connection request from any client
io.sockets.on('connection', function(socket){
	console.log("socket connected"); 
	//output a unique socket.id 
	console.log(socket.id);
	
	// listen for disconnection; 
	socket.on('disconnect', onClientdisconnect); 
	// listen for new player
	socket.on("new_player", onNewplayer);
	// listen for player position update
	socket.on("player_input", onPlayerInput);
	//listen for player collision
	socket.on("player_collision", onPlayerCollision);
});

module.exports = app;
