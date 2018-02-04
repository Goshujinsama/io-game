/**
 * Phaser snake
 * @param  {Phaser.Game} game      game object
 * @param  {String} spriteKey Phaser sprite key
 * @param  {Number} x         coordinate
 * @param  {Number} y         coordinate
 */
Snake = function(game, spriteKey, x, y) {
    this.game = game;
    //create an array of snakes in the game object and add this snake
    if (!this.game.snakes) {
        this.game.snakes = [];
    }
    this.game.snakes.push(this);
    this.debug = false;
    this.snakeLength = 0;
    this.spriteKey = spriteKey;

    //various quantities that can be changed
    this.scale = 0.6;
    this.fastSpeed = 200;
    this.slowSpeed = 130;
    this.speed = this.slowSpeed;
    this.rotationSpeed = 40;

    //initialize groups and arrays
    this.collisionGroup = this.game.physics.p2.createCollisionGroup();
    this.sections = [];
    //the head path is an array of points that the head of the snake has
    //traveled through
    this.headPath = [];
    this.food = [];

    this.preferredDistance = 17 * this.scale;
    this.queuedSections = 0;

    this.sectionGroup = this.game.add.group();
    //add the head of the snake
    this.head = this.addSectionAtPosition(x,y);
    this.head.name = "head";
    this.head.snake = this;

    this.lastHeadPosition = new Phaser.Point(this.head.body.x, this.head.body.y);
    //add 30 sections behind the head
    this.initSections(30);

    this.onDestroyedCallbacks = [];
    this.onDestroyedContexts = [];
}

Snake.prototype = {
	/**
	 * Give the snake starting segments
	 * @param  {Number} num number of snake sections to create
	 */
	initSections: function(num) {
		//create a certain number of sections behind the head
		//only use this once
		for (var i = 1 ; i <= num ; i++) {
			var x = this.head.body.x;
			var y = this.head.body.y + i * this.preferredDistance;
			this.addSectionAtPosition(x, y);
			//add a point to the head path so that the section stays there
			this.headPath.push(new Phaser.Point(x,y));
		}

	},
	/**
	 * Add a section to the snake at a given position
	 * @param  {Number} x coordinate
	 * @param  {Number} y coordinate
	 * @return {Phaser.Sprite}   new section
	 */
	addSectionAtPosition: function(x, y) {
	    //initialize a new section
	    var sec = this.game.add.sprite(x, y, this.spriteKey);
	    this.game.physics.p2.enable(sec, this.debug);
	    sec.body.setCollisionGroup(this.collisionGroup);
	    sec.body.collides([]);
	    sec.body.kinematic = true;

	    this.snakeLength++;
	    this.sectionGroup.add(sec);
	    sec.sendToBack();
	    sec.scale.setTo(this.scale);

	    this.sections.push(sec);

	    //add a circle body to this section
	    sec.body.clearShapes();
	    sec.body.addCircle(sec.width*0.5);

	    return sec;
	},
	/**
	 * Add to the queue of new sections
	 * @param  {Integer} amount Number of sections to add to queue
	 */
	addSectionsAfterLast: function(amount) {
	    this.queuedSections += amount;
	},
	/**
	 * Call from the main update loop
	 */
	update: function() {
	    var speed = this.speed;
	    this.head.body.moveForward(speed);

	    //remove the last element of an array that contains points which
	    //the head traveled through
	    //then move this point to the front of the array and change its value
	    //to be where the head is located
	    var point = this.headPath.pop();
	    point.setTo(this.head.body.x, this.head.body.y);
	    this.headPath.unshift(point);

	    //place each section of the snake on the path of the snake head,
	    //a certain distance from the section before it
	    var index = 0;
	    var lastIndex = null;
	    for (var i = 0 ; i < this.snakeLength ; i++) {

	        this.sections[i].body.x = this.headPath[index].x;
	        this.sections[i].body.y = this.headPath[index].y;

	        //hide sections if they are at the same position
	        if (lastIndex && index == lastIndex) {
	            this.sections[i].alpha = 0;
	        }
	        else {
	            this.sections[i].alpha = 1;
	        }

	        lastIndex = index;
	        //this finds the index in the head path array that the next point
	        //should be at
	        index = this.findNextPointIndex(index);
	    }

	    //continuously adjust the size of the head path array so that we
	    //keep only an array of points that we need
	    if (index >= this.headPath.length - 1) {
	        var lastPos = this.headPath[this.headPath.length - 1];
	        this.headPath.push(new Phaser.Point(lastPos.x, lastPos.y));
	    }
	    else {
	        this.headPath.pop();
	    }

	    //this calls onCycleComplete every time a cycle is completed
	    //a cycle is the time it takes the second section of a snake to reach
	    //where the head of the snake was at the end of the last cycle
	    var i = 0;
	    var found = false;
	    while (this.headPath[i].x != this.sections[1].body.x &&
	    this.headPath[i].y != this.sections[1].body.y) {
	        if (this.headPath[i].x == this.lastHeadPosition.x &&
	        this.headPath[i].y == this.lastHeadPosition.y) {
	            found = true;
	            break;
	        }
	        i++;
	    }
	    if (!found) {
	        this.lastHeadPosition = new Phaser.Point(this.head.body.x, this.head.body.y);
	        this.onCycleComplete();
	    }
	},
	/**
	 * Find in the headPath array which point the next section of the snake
	 * should be placed at, based on the distance between points
	 * @param  {Integer} currentIndex Index of the previous snake section
	 * @return {Integer}              new index
	 */
	findNextPointIndex: function(currentIndex) {
	    var pt = this.headPath[currentIndex];
	    //we are trying to find a point at approximately this distance away
	    //from the point before it, where the distance is the total length of
	    //all the lines connecting the two points
	    var prefDist = this.preferredDistance;
	    var len = 0;
	    var dif = len - prefDist;
	    var i = currentIndex;
	    var prevDif = null;
	    //this loop sums the distances between points on the path of the head
	    //starting from the given index of the function and continues until
	    //this sum nears the preferred distance between two snake sections
	    while (i+1 < this.headPath.length && (dif === null || dif < 0)) {
	        //get distance between next two points
	        var dist = Util.distanceFormula(
	            this.headPath[i].x, this.headPath[i].y,
	            this.headPath[i+1].x, this.headPath[i+1].y
	        );
	        len += dist;
	        prevDif = dif;
	        //we are trying to get the difference between the current sum and
	        //the preferred distance close to zero
	        dif = len - prefDist;
	        i++;
	    }

	    //choose the index that makes the difference closer to zero
	    //once the loop is complete
	    if (prevDif === null || Math.abs(prevDif) > Math.abs(dif)) {
	        return i;
	    }
	    else {
	        return i-1;
	    }
	},

	/**
	 * Called each time the snake's second section reaches where the
	 * first section was at the last call (completed a single cycle)
	 */
	onCycleComplete: function() {
	    if (this.queuedSections > 0) {
	        var lastSec = this.sections[this.sections.length - 1];
	        this.addSectionAtPosition(lastSec.body.x, lastSec.body.y);
	        this.queuedSections--;
	    }
	},

	/**
	 * Set snake scale
	 * @param  {Number} scale Scale
	 */
	setScale: function(scale) {
	    this.scale = scale;
	    this.preferredDistance = 17 * this.scale;

	    //scale sections and their bodies
	    for (var i = 0 ; i < this.sections.length ; i++) {
	        var sec = this.sections[i];
	        sec.scale.setTo(this.scale);
	        sec.body.data.shapes[0].radius = this.game.physics.p2.pxm(sec.width*0.5);
	    }
	},

	/**
	 * Increment length and scale
	 */
	incrementSize: function() {
	    this.addSectionsAfterLast(1);
	    this.setScale(this.scale * 1.01);
	},

	/**
	 * Destroy the snake
	 */
	destroy: function() {
		this.game.snakes.splice(this.game.snakes.indexOf(this), 1);
		this.sections.forEach(function(sec, index) {
			sec.destroy();
		});

		//call this snake's destruction callbacks
		for (var i = 0 ; i < this.onDestroyedCallbacks.length ; i++) {
			if (typeof this.onDestroyedCallbacks[i] == "function") {
				this.onDestroyedCallbacks[i].apply(
					this.onDestroyedContexts[i], [this]);
			}
		}
	},

	/**
	 * Add callback for when snake is destroyed
	 * @param  {Function} callback Callback function
	 * @param  {Object}   context  context of callback
	 */
	addDestroyedCallback: function(callback, context) {
		this.onDestroyedCallbacks.push(callback);
		this.onDestroyedContexts.push(context);
	}
};

BotSnake = function(game, spriteKey, x, y) {
	Snake.call(this, game, spriteKey, x, y);
	this.trend = 1;
}

BotSnake.prototype = Object.create(Snake.prototype);
BotSnake.prototype.constructor = BotSnake;

BotSnake.prototype.tempUpdate = BotSnake.prototype.update;
BotSnake.prototype.update = function() {
	this.head.body.setZeroRotation();

	//ensure that the bot keeps rotating in one direction for a
	//substantial amount of time before switching directions
	if (Util.randomInt(1,20) == 1) {
		this.trend *= -1;
	}
	this.head.body.rotateRight(this.trend * this.rotationSpeed);
	this.tempUpdate();
}

PlayerSnake = function(game, spriteKey, x, y) {
    Snake.call(this, game, spriteKey, x, y);
    this.cursors = game.input.keyboard.createCursorKeys();

    //handle the space key so that the player's snake can speed up
    var spaceKey = this.game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);
    var self = this;
    spaceKey.onDown.add(this.spaceKeyDown, this);
    spaceKey.onUp.add(this.spaceKeyUp, this);
    this.addDestroyedCallback(function() {
        spaceKey.onDown.remove(this.spaceKeyDown, this);
        spaceKey.onUp.remove(this.spaceKeyUp, this);
    }, this);
}

PlayerSnake.prototype = Object.create(Snake.prototype);
PlayerSnake.prototype.constructor = PlayerSnake;

//make this snake light up and speed up when the space key is down
PlayerSnake.prototype.spaceKeyDown = function() {
    this.speed = this.fastSpeed;
}
//make the snake slow down when the space key is up again
PlayerSnake.prototype.spaceKeyUp = function() {
    this.speed = this.slowSpeed;
}

PlayerSnake.prototype.tempUpdate = PlayerSnake.prototype.update;
PlayerSnake.prototype.update = function() {
    //find the angle that the head needs to rotate
    //through in order to face the mouse
    var mousePosX = this.game.input.activePointer.worldX;
    var mousePosY = this.game.input.activePointer.worldY;
    var headX = this.head.body.x;
    var headY = this.head.body.y;
    var angle = (180*Math.atan2(mousePosX-headX,mousePosY-headY)/Math.PI);
    if (angle > 0) {
        angle = 180-angle;
    }
    else {
        angle = -180-angle;
    }
    var dif = this.head.body.angle - angle;
    this.head.body.setZeroRotation();
    //allow arrow keys to be used
    if (this.cursors.left.isDown) {
        this.head.body.rotateLeft(this.rotationSpeed);
    }
    else if (this.cursors.right.isDown) {
        this.head.body.rotateRight(this.rotationSpeed);
    }
    //decide whether rotating left or right will angle the head towards
    //the mouse faster, if arrow keys are not used
    else if (dif < 0 && dif > -180 || dif > 180) {
        this.head.body.rotateRight(this.rotationSpeed);
    }
    else if (dif > 0 && dif < 180 || dif < -180) {
        this.head.body.rotateLeft(this.rotationSpeed);
    }

    //call the original snake update method
    this.tempUpdate();
}
