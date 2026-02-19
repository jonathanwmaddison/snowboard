import * as THREE from 'three';

/**
 * AirGrindPhysics - Air physics, grinding, jumping, and landing systems
 */

/**
 * Handle landing from air
 * @param {number} dt - Delta time
 */
export function onLanding(dt) {
  const impactSpeed = Math.abs(this.velocity.y);
  const speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

  // Check landing alignment
  const pitchMisalign = Math.abs(this.pitch);
  const rollMisalign = Math.abs(this.roll);

  // Calculate heading vs velocity alignment
  let headingMisalign = 0;
  if (speed2D > 3) {
    const velHeading = Math.atan2(-this.velocity.x, this.velocity.z);
    headingMisalign = Math.abs(this.normalizeAngle(velHeading - this.heading));
  }

  // Landing quality (0 = crash, 1 = perfect)
  let landingQuality = 1.0;

  // Pitch penalty (nose/tail crash)
  if (pitchMisalign > 0.5) {
    landingQuality -= (pitchMisalign - 0.5) * 0.8;
  }

  // Roll penalty (edge catch)
  if (rollMisalign > 0.4) {
    landingQuality -= (rollMisalign - 0.4) * 0.6;
  }

  // Heading misalignment (landing sideways)
  if (headingMisalign > 0.8) {
    landingQuality -= (headingMisalign - 0.8) * 0.3;
  }

  landingQuality = Math.max(0, landingQuality);

  // Impact effects
  if (impactSpeed > 12) {
    const baseSpeedLoss = (impactSpeed - 12) * 0.025;
    const qualityMod = 2 - landingQuality;
    const speedLoss = baseSpeedLoss * qualityMod;

    this.velocity.x *= (1 - speedLoss);
    this.velocity.z *= (1 - speedLoss);
  }

  // Clean landing bonus
  if (landingQuality > 0.8 && speed2D > 8 && this.airTime > 0.5) {
    const forward = new THREE.Vector3(
      -Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );

    const stompBonus = 1.0 + this.airTime * 0.3;
    this.velocity.x += forward.x * stompBonus;
    this.velocity.z += forward.z * stompBonus;
  }

  // Alignment correction
  if (speed2D > 5 && headingMisalign > 0.2) {
    const velHeading = Math.atan2(-this.velocity.x, this.velocity.z);
    const correction = this.normalizeAngle(velHeading - this.heading);
    const correctionRate = Math.min(speed2D * 0.015, 0.4);
    this.heading += correction * correctionRate;
  }

  // Bad landing wobble
  if (landingQuality < 0.6) {
    this.headingVelocity += (Math.random() - 0.5) * (1 - landingQuality) * 2;
  }

  // Reset rotation state
  this.velocity.y = 0;
  this.pitch = 0;
  this.roll = 0;
  this.pitchVelocity = 0;
  this.rollVelocity = 0;

  // Landing compression
  const landingCompression = Math.min(impactSpeed * 0.08, 0.7);
  this.compression = landingCompression;
  this.compressionVelocity = impactSpeed * 0.1;

  // Perfect landing gets quick recovery
  if (landingQuality > 0.8) {
    this.compressionVelocity = impactSpeed * 0.15;
  }
}

/**
 * Update air physics
 * @param {number} dt - Delta time
 * @param {THREE.Vector3} pos - Current position
 */
export function updateAirPhysics(dt, pos) {
  // Track air time
  this.airTime += dt;

  // Gravity with ramp - use moon gravity when on the moon for HUGE jumps!
  const moonGravityRatio = this.onMoon ? 0.165 : 1.0;  // Moon is 16.5% of Earth
  const baseGravity = 16 * moonGravityRatio;
  const gravityRamp = Math.min(this.airTime * 2, 6) * moonGravityRatio;
  const gravity = baseGravity + gravityRamp;
  this.velocity.y -= gravity * dt;

  // Spin control (Y-axis rotation)
  const baseSpin = this.spinVelocity;
  const tuckFactor = this.input.lean > 0.2 ? 1 + this.input.lean * 0.8 : 1;
  const spinInput = this.input.steer * 3.5 * tuckFactor;
  const targetSpin = baseSpin + spinInput;

  this.headingVelocity = THREE.MathUtils.lerp(this.headingVelocity, targetSpin, 4 * dt);
  this.spinVelocity *= 0.995;
  this.heading += this.headingVelocity * dt;

  // Flip control (pitch)
  if (Math.abs(this.input.lean) > 0.2) {
    const flipInput = -this.input.lean * 4.0;
    this.pitchVelocity = THREE.MathUtils.lerp(this.pitchVelocity, flipInput, 3 * dt);
  } else {
    this.pitchVelocity *= 0.97;
  }
  this.pitch += this.pitchVelocity * dt;

  // Roll/grab style
  if (Math.abs(this.input.steer) > 0.3) {
    const rollTarget = this.input.steer * 0.4;
    this.roll = THREE.MathUtils.lerp(this.roll, rollTarget, 5 * dt);
  } else {
    this.roll *= 0.95;
  }

  // Edge angle follows roll
  this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, this.roll * 0.5, 4 * dt);

  // Air drag
  const dragFactor = this.input.lean > 0.3 ? 0.999 : 0.997;
  this.velocity.x *= dragFactor;
  this.velocity.z *= dragFactor;

  // Terminal velocity (much lower on moon due to less gravity)
  const terminalVel = this.onMoon ? -15 : -40;
  if (this.velocity.y < terminalVel) {
    this.velocity.y = terminalVel;
  }

  // Air steering (subtle)
  if (Math.abs(this.input.steer) > 0.5) {
    const airSteer = this.input.steer * 0.5 * dt;
    const right = new THREE.Vector3(
      Math.cos(this.heading),
      0,
      Math.sin(this.heading)
    );
    this.velocity.x += right.x * airSteer;
    this.velocity.z += right.z * airSteer;
  }
}

/**
 * Initiate jump
 * @param {number} speed2D - Current 2D speed
 * @param {THREE.Vector3} forward - Forward direction
 */
export function initiateJump(speed2D, forward) {
  // Base tiny hop - boosted on moon!
  const moonBoost = this.onMoon ? 1.8 : 1.0;  // 80% higher jumps on moon
  let jumpPower = 2.5 * moonBoost;

  // Charge bonus
  const chargeBonus = this.jumpCharge * 3.0;
  jumpPower += chargeBonus;

  // Tail pop bonus
  if (this.weightForward < -0.2) {
    jumpPower += 0.5 + Math.abs(this.weightForward) * 0.5;
  }

  // Speed bonus
  jumpPower += Math.min(speed2D * 0.02, 1.0);

  // Compression snap bonus
  jumpPower += this.compression * 0.5;

  this.velocity.y = jumpPower;

  // Forward momentum from tuck
  if (this.input.lean > 0.2) {
    const tuckBoost = 1.5 + this.jumpCharge * 1.0;
    this.velocity.x += forward.x * tuckBoost;
    this.velocity.z += forward.z * tuckBoost;
  }

  // Carry spin momentum
  this.spinVelocity = this.headingVelocity * (0.5 + this.jumpCharge * 0.3);

  // Reset compression for extension visual
  this.compression = -0.3;
  this.compressionVelocity = -3;

  // Clear carve energy
  this.carveEnergy = 0;

  this.input.jump = false;
}

/**
 * Start grinding on a rail
 * @param {Object} railInfo - Rail information
 */
export function startGrind(railInfo) {
  this.isGrinding = true;
  this.grindRail = railInfo.rail;
  this.grindProgress = railInfo.progress;
  this.grindBalance = 0;
  this.grindTime = 0;
  this.isGrounded = false;

  // Align heading to rail direction
  const railAngle = railInfo.rail.angle;
  const headingDiff = this.normalizeAngle(railAngle - this.heading);

  if (Math.abs(headingDiff) > Math.PI / 2) {
    this.heading = this.normalizeAngle(railAngle + Math.PI);
  } else {
    this.heading = THREE.MathUtils.lerp(this.heading, railAngle, 0.5);
  }

  // Convert velocity to rail direction
  const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
  const forward = new THREE.Vector3(
    -Math.sin(this.heading),
    0,
    Math.cos(this.heading)
  );
  this.velocity.set(forward.x * speed, 0, forward.z * speed);

  // Reset air rotation
  this.pitch = 0;
  this.roll = 0;
  this.pitchVelocity = 0;
  this.rollVelocity = 0;

  console.log('Started grinding!');
}

/**
 * Update grinding physics
 * @param {number} dt - Delta time
 * @param {THREE.Vector3} pos - Current position
 */
export function updateGrindPhysics(dt, pos) {
  if (!this.grindRail) {
    this.endGrind();
    return;
  }

  this.grindTime += dt;
  const rail = this.grindRail;

  // Balance system
  const balanceDrift = (Math.random() - 0.5) * 0.5 * dt;
  const speedWobble = (this.currentSpeed / 30) * (Math.random() - 0.5) * dt;
  this.grindBalance += balanceDrift + speedWobble;

  // Steer input corrects balance
  this.grindBalance -= this.input.steer * 3 * dt;

  // Balance affects edge angle visually
  this.edgeAngle = this.grindBalance * 0.8;

  // Check balance fail
  if (Math.abs(this.grindBalance) > 1.0) {
    console.log('Lost balance on rail!');
    this.endGrind();

    const right = new THREE.Vector3(
      Math.cos(this.heading),
      0,
      Math.sin(this.heading)
    );
    const fallDir = Math.sign(this.grindBalance);
    this.velocity.x += right.x * fallDir * 3;
    this.velocity.z += right.z * fallDir * 3;
    this.velocity.y = -2;
    return;
  }

  // Rail movement
  const grindFriction = 0.995;
  const speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

  const forward = new THREE.Vector3(
    -Math.sin(this.heading),
    0,
    Math.cos(this.heading)
  );

  this.velocity.x = forward.x * speed2D * grindFriction;
  this.velocity.z = forward.z * speed2D * grindFriction;

  // Slope boost
  const slopeBoost = 2.0;
  this.velocity.x += forward.x * slopeBoost * dt;
  this.velocity.z += forward.z * slopeBoost * dt;

  // Calculate position along rail
  const railStartZ = rail.z - rail.length / 2;
  const railEndZ = rail.z + rail.length / 2;
  const railX = rail.x + Math.sin(rail.angle) * (pos.z - rail.z);
  const railY = this.terrain.calculateHeight(rail.x, rail.z) + rail.height;

  const newX = railX + this.grindBalance * 0.3;
  const newZ = pos.z + this.velocity.z * dt;

  // Check if still on rail
  if (newZ < railStartZ || newZ > railEndZ) {
    console.log('Grind complete! Style points!');
    this.endGrind();
    this.velocity.y = 3;
    return;
  }

  // Update progress
  this.grindProgress = (newZ - railStartZ) / rail.length;

  // Set position
  this.body.setNextKinematicTranslation({
    x: newX,
    y: railY + 0.15,
    z: newZ
  });

  // Update speed
  this.currentSpeed = Math.sqrt(
    this.velocity.x * this.velocity.x +
    this.velocity.z * this.velocity.z
  );

  // Update visuals
  this.updateMesh();

  // Grind spray
  this.updateSprayParticles(dt, this.currentSpeed * 0.5, true, this.grindBalance);
}

/**
 * End grinding
 */
export function endGrind() {
  this.isGrinding = false;
  this.grindRail = null;
  this.grindProgress = 0;
  this.grindBalance = 0;
}
