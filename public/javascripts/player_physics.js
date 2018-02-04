(function(exports) {
	
class Vector {
	constructor(x, y) {
		this.x = x || 0;
		this.y = y || 0;
	}

	length() {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}
	
	angle() {
		return Math.atan2(this.y, this.x);
	}

	scale(scalar) {
		return new Vector(this.x * scalar, this.y * scalar);
	}
	
	normalize() {
		return this.scale(1.0 / this.length());
	}
	
	accumulate(vec) {
		this.x += vec.x;
		this.y += vec.y;
	}

	static derivative(a, b) {
		return new Vector(b.x - a.x, b.y - a.y);
	}
	
	static distance(a, b) {
		return Vector.derivative(a, b).length();
	}
}
	
getPosition = function(display_object, world) {
	if (world !== undefined) {
		return new Vector(display_object.world.x, display_object.world.y);
	} else if (display_object.body.position === undefined) {
		return new Vector(display_object.x, display_object.y);
	} else {
		return new Vector(display_object.body.position[0], display_object.body.position[1]);		
	}
}

setVelocity = function(display_object, velocity) {
	if (display_object.body.position === undefined)
	{
		display_object.body.velocity.x = velocity.x;
		display_object.body.velocity.y = velocity.y;
	}
	else
	{
		display_object.body.velocity[0] = velocity.x;
		display_object.body.velocity[1] = velocity.y;
	}
}

const kp = 15.0;
const ki = 0.005;
const kd = 0.8;

exports.updateVelocity = function(displayObject, speed) {
	if (displayObject.set_point === undefined) {
		return displayObject.body.angle;
	}
	
	if (displayObject.lastError === undefined) {
		displayObject.lastError = new Vector();
	}
	
	if (displayObject.integral === undefined) {
		displayObject.integral = new Vector();
	}

	var error = Vector.derivative(getPosition(displayObject), displayObject.set_point);
	
	if (2.5 > error.length()) {
		setVelocity(displayObject, new Vector());
		return displayObject.body.angle;
	}
	
	displayObject.integral.accumulate(error);
	var derivative = Vector.derivative(error, displayObject.lastError);
	
	var velocity = error.scale(kp);
	velocity.accumulate(displayObject.integral.scale(ki));
	velocity.accumulate(derivative.scale(kd));
	
	displayObject.lastError = error;
	
	if (speed < velocity.length()) {
		velocity = velocity.normalize().scale(speed);
	}
	
	setVelocity(displayObject, velocity);

	return velocity.angle() * 180 / Math.PI;	
}

exports.movetoPointer = function(displayObject, speed, pointer, maxTime) {
	displayObject.set_point = new Vector(pointer.worldX, pointer.worldY);
}

})(typeof exports === 'undefined' ? this.playerPhysics={} : exports);