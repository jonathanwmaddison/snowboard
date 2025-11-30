import * as THREE from 'three';

// Import physics modules
import * as CarvePhysics from './CarvePhysics.js';
import * as AirGrindPhysics from './AirGrindPhysics.js';
import * as PlayerAnimation from './PlayerAnimation.js';

export class PlayerController {
  constructor(sceneManager, physicsWorld, terrain = null) {
    this.sceneManager = sceneManager;
    this.physicsWorld = physicsWorld;
    this.terrain = terrain;

    this.body = null;
    this.collider = null;
    this.mesh = null;
    this.boardMesh = null;

    // Board dimensions
    this.boardLength = 1.6;
    this.boardWidth = 0.3;

    // Input state
    this.input = { steer: 0, lean: 0, jump: false };

    // Core physics
    this.mass = 75;

    // Snowboard sidecut geometry
    this.sidecutRadius = 7;

    // Edge angle limits
    this.maxEdgeAngleLowSpeed = 1.2;
    this.maxEdgeAngleHighSpeed = 0.6;
    this.highSpeedThreshold = 30;

    // === CARVE RAIL SYSTEM ===
    this.carveRailThreshold = 0.5;
    this.carveRailStrength = 0;
    this.carveHoldTime = 0;

    // === ARCADE STABILITY ASSISTS ===
    this.steeringAssistStrength = 0.3;
    this.maxAutoSteerAngle = 0.15;

    // Angular velocity damping
    this.angularDamping = 0.85;
    this.maxHeadingChangeRate = 3.5;

    // Movement state
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.headingVelocity = 0;
    this.edgeAngle = 0;
    this.targetEdgeAngle = 0;
    this.slipAngle = 0;
    this.isGrounded = false;
    this.wasGrounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.groundHeight = 0;
    this.airTime = 0;

    this.startPosition = { x: 0, y: 5, z: 0 };
    this.currentSpeed = 0;

    // Turn state
    this.turnMomentum = 0;

    // === WEIGHT TRANSFER SYSTEM ===
    this.weightForward = 0;
    this.weightSide = 0;
    this.effectivePressure = 1;

    // === AIR ROTATION STATE ===
    this.pitch = 0;
    this.roll = 0;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;
    this.spinVelocity = 0;

    // Collider mesh
    this.colliderMesh = null;

    // === EDGE TRANSITION SYSTEM ===
    this.previousEdgeSide = 0;
    this.edgeTransitionBoost = 0;
    this.lastEdgeChangeTime = 0;

    // === COMPRESSION SYSTEM ===
    this.compression = 0;
    this.compressionVelocity = 0;
    this.targetCompression = 0;

    // === OLLIE PRE-LOAD ===
    this.jumpCharging = false;
    this.jumpCharge = 0;
    this.maxChargeTime = 0.4;

    // === CARVE MOMENTUM ===
    this.carveEnergy = 0;
    this.lastCarveDirection = 0;
    this.carveChainCount = 0;
    this.carvePerfection = 0;
    this.peakEdgeAngle = 0;

    // Snow spray particles
    this.sprayParticles = null;
    this.sprayPositions = null;
    this.sprayVelocities = [];
    this.sprayLifetimes = [];
    this.maxParticles = 200;

    // === SNOW CONDITION STATE ===
    this.currentSnowCondition = {
      type: 'groomed',
      gripMultiplier: 1.0,
      speedMultiplier: 1.0,
      dragMultiplier: 1.0,
      intensity: 0
    };

    // === RISK/STABILITY STATE ===
    this.riskLevel = 0;
    this.wobbleAmount = 0;
    this.isRecovering = false;
    this.recoveryTime = 0;

    // === CARVE FAILURE STATES ===
    this.isWashingOut = false;
    this.washOutIntensity = 0;
    this.washOutDirection = 0;

    this.isEdgeCaught = false;
    this.edgeCatchSeverity = 0;
    this.edgeCatchTime = 0;

    // Carve commitment
    this.carveCommitment = 0;
    this.carveDirection = 0;
    this.carveArcProgress = 0;
    this.carveEntrySpeed = 0;
    this.carveEntryEdge = 0;

    // Turn shape tracking
    this.turnShapeQuality = 1;
    this.lastEdgeAngleDelta = 0;

    // === ANGULATION SYSTEM ===
    this.angulation = 0;
    this.targetAngulation = 0;
    this.angulationCapacity = 1.0;

    // === BOARD FLEX SYSTEM ===
    this.boardFlex = 0;
    this.flexEnergy = 0;
    this.maxFlexEnergy = 1.5;
    this.flexStiffness = 8;

    // === CARVE FLOW STATE ===
    this.flowState = 0;
    this.flowMomentum = 0;
    this.flowDecayRate = 0.3;
    this.flowBuildRate = 0.15;

    // === ARC SHAPE TRACKING ===
    this.arcHeadingChange = 0;
    this.arcStartHeading = 0;
    this.arcType = 'none';

    // === EDGE BITE PROGRESSION ===
    this.edgeBite = 0;
    this.edgeBiteRate = 2.0;
    this.maxEdgeBite = 1.0;

    // === SMOOTHING SYSTEMS ===
    this.edgeVelocity = 0;
    this.turnInertia = 0;
    this.smoothedGrip = 0.7;
    this.lastAbsEdge = 0;
    this.smoothedRailStrength = 0;

    // Turn rhythm tracking
    this.turnRhythm = 0;
    this.rhythmPhase = 0;

    // === GRINDING SYSTEM ===
    this.isGrinding = false;
    this.grindRail = null;
    this.grindProgress = 0;
    this.grindBalance = 0;
    this.grindTime = 0;
    this.grindSparks = [];

    // === SWITCH RIDING ===
    this.ridingSwitch = false;
    this.switchBlend = 0;
    this.smoothSwitchMult = 1; // Smooth multiplier for physics (-1 to 1)
    this.switchLockTime = 0; // Prevents rapid switch flickering

    // === GLB MODEL ===
    this.playerModelGLB = null;
    this.glbModelUrl = null;
  }

  init(startPosition) {
    this.startPosition = { ...startPosition };
    const RAPIER = this.physicsWorld.RAPIER;

    // Create kinematic body
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(startPosition.x, startPosition.y, startPosition.z);

    this.body = this.physicsWorld.createRigidBody(bodyDesc);

    // Collider for ground detection
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.3, 0.1, 0.6)
      .setFriction(0.1)
      .setRestitution(0.0);

    this.collider = this.physicsWorld.createCollider(colliderDesc, this.body);

    this.velocity.set(0, 0, 0);
    this.heading = 0;

    PlayerAnimation.createVisualMesh.call(this);
    PlayerAnimation.createColliderMesh.call(this);
    PlayerAnimation.createSprayParticles.call(this);
  }

  update(deltaTime) {
    if (!this.body) return;

    const dt = Math.min(deltaTime, 0.033);
    const position = this.body.translation();
    const pos = new THREE.Vector3(position.x, position.y, position.z);

    this.wasGrounded = this.isGrounded;

    // Ground detection
    if (this.velocity.y <= 0) {
      this.checkGround(pos);
    } else {
      this.isGrounded = false;
    }

    // Landing detection
    if (this.isGrounded && !this.wasGrounded) {
      AirGrindPhysics.onLanding.call(this, dt);
    }

    // Grind rail detection
    if (this.terrain && !this.isGrounded) {
      const railInfo = this.terrain.getRailAt(pos.x, pos.y, pos.z);
      if (railInfo && !this.isGrinding) {
        if (this.velocity.y <= 0 || Math.abs(pos.y - railInfo.railY) < 0.3) {
          AirGrindPhysics.startGrind.call(this, railInfo);
        }
      }
    }

    // Handle grinding physics
    if (this.isGrinding) {
      AirGrindPhysics.updateGrindPhysics.call(this, dt, pos);
      return;
    }

    if (this.isGrounded) {
      this.airTime = 0;
      this.updateGroundedPhysics(dt, pos);

      // Ground following
      const targetY = this.groundHeight + 0.15;
      const yChange = targetY - pos.y;
      const maxYChangePerFrame = 0.3;

      let newY;
      if (Math.abs(yChange) > maxYChangePerFrame) {
        newY = pos.y + Math.sign(yChange) * maxYChangePerFrame;
      } else {
        newY = targetY;
      }

      if (this.isGrounded) {
        this.velocity.y = 0;
        this.body.setNextKinematicTranslation({
          x: pos.x + this.velocity.x * dt,
          y: newY,
          z: pos.z + this.velocity.z * dt
        });
      } else {
        this.body.setNextKinematicTranslation({
          x: pos.x + this.velocity.x * dt,
          y: pos.y + this.velocity.y * dt,
          z: pos.z + this.velocity.z * dt
        });
      }
    } else {
      AirGrindPhysics.updateAirPhysics.call(this, dt, pos);

      this.body.setNextKinematicTranslation({
        x: pos.x + this.velocity.x * dt,
        y: pos.y + this.velocity.y * dt,
        z: pos.z + this.velocity.z * dt
      });
    }

    // Calculate speed
    this.currentSpeed = Math.sqrt(
      this.velocity.x * this.velocity.x +
      this.velocity.z * this.velocity.z
    );

    // Update visuals
    PlayerAnimation.updateMesh.call(this);

    // Update particles
    const isCarving = this.isGrounded && Math.abs(this.edgeAngle) > 0.3;
    PlayerAnimation.updateSprayParticles.call(this, dt, this.currentSpeed, isCarving, this.edgeAngle);

    // Reset if fallen off terrain
    if (pos.y < -100) {
      this.reset();
    }
  }

  updateGroundedPhysics(dt, pos) {
    const g = 9.81;
    const speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

    // Direction vectors
    const forward = new THREE.Vector3(
      -Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );
    const right = new THREE.Vector3(
      Math.cos(this.heading),
      0,
      Math.sin(this.heading)
    );

    // Simple switch detection: are we going backwards?
    const forwardSpeed = this.velocity.dot(forward);
    this.ridingSwitch = forwardSpeed < -1;

    // Weight transfer
    this.weightForward = THREE.MathUtils.lerp(this.weightForward, this.input.lean * 0.8, 6 * dt);

    // Edge control
    const maxEdge = 1.15;
    CarvePhysics.updateEdgeAngle.call(this, dt, maxEdge);

    const absEdge = Math.abs(this.edgeAngle);
    const edgeSign = Math.sign(this.edgeAngle);

    // Track edge rate of change
    const edgeChangeRate = Math.abs(absEdge - this.lastAbsEdge) / dt;
    this.lastAbsEdge = absEdge;

    // Angulation system
    CarvePhysics.updateAngulation.call(this, dt, absEdge, speed2D, edgeChangeRate);

    // Board flex system
    CarvePhysics.updateBoardFlex.call(this, dt, absEdge, speed2D);

    // Arc shape tracking
    CarvePhysics.updateArcTracking.call(this, absEdge);

    // Edge bite progression
    CarvePhysics.updateEdgeBite.call(this, dt, absEdge);

    // Edge transition detection and handling
    CarvePhysics.handleEdgeTransition.call(this, dt, absEdge, edgeSign, speed2D, maxEdge, forward);

    // Edge catch consequences
    CarvePhysics.updateEdgeCatchConsequences.call(this, dt, forward, right);

    // Carve commitment
    CarvePhysics.updateCarveCommitment.call(this, dt, absEdge, edgeSign, speed2D);

    // Carve rail system
    CarvePhysics.updateCarveRail.call(this, dt, absEdge, speed2D);

    // Apply edge transition boost
    CarvePhysics.applyEdgeTransitionBoost.call(this, dt, forward);

    // Compression system
    this.updateCompression(dt, absEdge, speed2D);

    // Effective pressure
    this.effectivePressure = 0.8 + absEdge * 0.2;

    // Turn physics with inertia
    CarvePhysics.updateTurnPhysics.call(this, dt, absEdge, edgeSign, speed2D);

    // Gravity / slope
    const slopeDir = this.getSlopeDirection();
    const slopeSteepness = 1 - this.groundNormal.y;
    const gravityAccel = g * slopeSteepness * 5.5;

    // Velocity components (forwardSpeed already calculated above for switch detection)
    const lateralSpeed = this.velocity.dot(right);

    // Track slip angle
    if (speed2D > 1) {
      const velDir = Math.atan2(-this.velocity.x, this.velocity.z);
      this.slipAngle = this.normalizeAngle(velDir - this.heading);
    }

    // Get snow conditions
    if (this.terrain) {
      this.currentSnowCondition = this.terrain.getSnowCondition(pos.x, pos.z);
    }

    // Flow state update
    CarvePhysics.updateFlowState.call(this, dt);

    // Grip calculation
    let finalGrip = CarvePhysics.calculateGrip.call(this, dt, absEdge, edgeSign, speed2D, right);

    // Risk and wobble
    const angulationBonus = this.angulation * 0.4;
    const minSpeedPerRadian = 12 * (1 - angulationBonus);
    const supportableEdge = speed2D / minSpeedPerRadian;
    const effectiveOverEdge = absEdge - supportableEdge;
    let speedEdgeGrip = 1.0;
    if (effectiveOverEdge > 0 && speed2D < 15) {
      const angulationProtection = this.angulation * 0.5;
      speedEdgeGrip -= Math.min(effectiveOverEdge * 1.5 * (1 - angulationProtection), 0.4);
    }
    if (speed2D > 15 && absEdge > 0.4) {
      speedEdgeGrip += Math.min((speed2D - 15) * 0.005, 0.15);
    }
    speedEdgeGrip = Math.max(speedEdgeGrip, 0.5);

    finalGrip = CarvePhysics.updateRiskAndWobble.call(this, dt, absEdge, speed2D, finalGrip, speedEdgeGrip);

    // Apply grip
    const newLateralSpeed = lateralSpeed * (1 - finalGrip);

    // Reconstruct velocity first
    this.velocity.x = forward.x * forwardSpeed + right.x * newLateralSpeed;
    this.velocity.z = forward.z * forwardSpeed + right.z * newLateralSpeed;

    // Carve acceleration (after reconstruction so it's not overwritten)
    CarvePhysics.applyCarveAcceleration.call(this, dt, absEdge, speed2D, forward);

    // Gravity
    this.velocity.x += slopeDir.x * gravityAccel * dt;
    this.velocity.z += slopeDir.z * gravityAccel * dt;

    // Drag
    const baseDrag = 0.999;
    const carveDrag = absEdge * 0.001;
    const slideDrag = Math.abs(this.slipAngle) * 0.003;
    const snowDragMod = (this.currentSnowCondition.dragMultiplier - 1) * 0.003;
    const drag = baseDrag - carveDrag - slideDrag - snowDragMod;
    this.velocity.x *= drag;
    this.velocity.z *= drag;

    // Weight-based tuck
    if (this.input.lean > 0.1) {
      const tuck = this.input.lean;
      const thrust = tuck * 2.0;
      this.velocity.x += forward.x * thrust * dt;
      this.velocity.z += forward.z * thrust * dt;
    }

    // Braking
    if (this.input.lean < -0.2 && speed2D > 2) {
      const brakeIntensity = Math.abs(this.input.lean + 0.2) / 0.8;
      const brakePower = brakeIntensity * speed2D * 0.15;

      this.velocity.x -= (this.velocity.x / speed2D) * brakePower * dt;
      this.velocity.z -= (this.velocity.z / speed2D) * brakePower * dt;

      if (brakeIntensity > 0.5) {
        this.carveRailStrength *= (1 - brakeIntensity * 0.5 * dt * 10);
      }

      this.targetCompression = Math.max(this.targetCompression, brakeIntensity * 0.4);
    }

    // Speed limits
    const maxSpeed = 55;
    if (speed2D > maxSpeed) {
      const scale = maxSpeed / speed2D;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // Ollie pre-load system
    if (this.input.jump && !this.jumpCharging) {
      this.jumpCharging = true;
      this.jumpCharge = 0;
    } else if (this.input.jump && this.jumpCharging) {
      this.jumpCharge = Math.min(this.jumpCharge + dt / this.maxChargeTime, 1.0);
    } else if (!this.input.jump && this.jumpCharging) {
      AirGrindPhysics.initiateJump.call(this, speed2D, forward);
      this.isGrounded = false;
      this.jumpCharging = false;
      this.jumpCharge = 0;
    }

    // Decay carve energy
    this.carveEnergy *= 0.995;

    // Reset air rotation when grounded
    this.pitch = THREE.MathUtils.lerp(this.pitch, 0, 5 * dt);
    this.roll = THREE.MathUtils.lerp(this.roll, 0, 5 * dt);
    this.pitchVelocity *= 0.9;
    this.rollVelocity *= 0.9;

    // Store spin momentum for jumps
    this.spinVelocity = this.headingVelocity * 0.3;
  }

  updateCompression(dt, absEdge, speed2D) {
    const carveGForce = speed2D > 5 && absEdge > 0.3
      ? (speed2D * absEdge) / 15
      : 0;

    let idealCompression = 0.1;

    if (absEdge > 0.4) {
      const gCompression = Math.min(carveGForce * 0.3, 0.4);
      idealCompression = 0.25 + absEdge * 0.35 + gCompression;
    }

    if (this.jumpCharging) {
      idealCompression = 0.4 + this.jumpCharge * 0.4;
    }

    const compressionApproachRate = 6;
    this.targetCompression = THREE.MathUtils.lerp(
      this.targetCompression,
      idealCompression,
      compressionApproachRate * dt
    );

    const compressionSpring = 18;
    const compressionDamp = 7;
    const compressionForce = (this.targetCompression - this.compression) * compressionSpring;
    this.compressionVelocity += compressionForce * dt;
    this.compressionVelocity *= (1 - compressionDamp * dt);
    this.compression += this.compressionVelocity * dt;
    this.compression = THREE.MathUtils.clamp(this.compression, -0.3, 0.8);
  }

  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  checkGround(pos) {
    const RAPIER = this.physicsWorld.RAPIER;

    const ray = new RAPIER.Ray(
      { x: pos.x, y: pos.y + 1, z: pos.z },
      { x: 0, y: -1, z: 0 }
    );

    const hit = this.physicsWorld.world.castRay(ray, 3, true, undefined, undefined, this.collider);

    if (hit && hit.timeOfImpact < 1.5) {
      this.isGrounded = true;
      this.groundHeight = pos.y + 1 - hit.timeOfImpact;
      this.sampleGroundNormal(pos, RAPIER);
    } else {
      this.isGrounded = false;
    }
  }

  sampleGroundNormal(pos, RAPIER) {
    const sampleDist = 0.8;
    const cosH = Math.cos(this.heading);
    const sinH = Math.sin(this.heading);

    const localOffsets = [
      { x: 0, z: sampleDist },
      { x: 0, z: -sampleDist },
      { x: sampleDist, z: 0 }
    ];

    const worldOffsets = localOffsets.map(o => ({
      x: o.x * cosH - o.z * sinH,
      z: o.x * sinH + o.z * cosH
    }));

    const points = [];
    for (const offset of worldOffsets) {
      const ray = new RAPIER.Ray(
        { x: pos.x + offset.x, y: pos.y + 3, z: pos.z + offset.z },
        { x: 0, y: -1, z: 0 }
      );
      const hit = this.physicsWorld.world.castRay(ray, 6, true);
      if (hit) {
        points.push(new THREE.Vector3(
          pos.x + offset.x,
          pos.y + 3 - hit.timeOfImpact,
          pos.z + offset.z
        ));
      }
    }

    if (points.length >= 3) {
      const v1 = points[1].clone().sub(points[0]);
      const v2 = points[2].clone().sub(points[0]);
      const normal = new THREE.Vector3().crossVectors(v2, v1).normalize();

      if (normal.y < 0) normal.negate();

      this.groundNormal.lerp(normal, 0.02);
      this.groundNormal.normalize();
    }
  }

  getSlopeDirection() {
    const down = new THREE.Vector3(0, -1, 0);
    const normal = this.groundNormal;

    const dot = down.dot(normal);
    const slopeDir = down.clone().sub(normal.clone().multiplyScalar(dot));

    if (slopeDir.lengthSq() > 0.0001) {
      slopeDir.normalize();
    } else {
      slopeDir.set(0, 0, 1);
    }

    return slopeDir;
  }

  // Delegate to animation module
  updateMesh() {
    PlayerAnimation.updateMesh.call(this);
  }

  updateSprayParticles(dt, speed, isCarving, edgeAngle) {
    PlayerAnimation.updateSprayParticles.call(this, dt, speed, isCarving, edgeAngle);
  }

  async loadGLBModel(url) {
    return PlayerAnimation.loadGLBModel.call(this, url);
  }

  // Delegate to air/grind module
  startGrind(railInfo) {
    AirGrindPhysics.startGrind.call(this, railInfo);
  }

  endGrind() {
    AirGrindPhysics.endGrind.call(this);
  }

  setInput(key, value) {
    if (key === 'steer') {
      this.input.steer = Math.max(-1, Math.min(1, value));
    } else if (key === 'lean') {
      this.input.lean = Math.max(-1, Math.min(1, value));
    } else if (key === 'jump') {
      this.input.jump = value;
    }
  }

  reset() {
    this.body.setNextKinematicTranslation(this.startPosition);
    this.velocity.set(0, 0, 0);
    this.heading = 0;
    this.headingVelocity = 0;
    this.edgeAngle = 0;
    this.targetEdgeAngle = 0;
    this.slipAngle = 0;
    this.currentSpeed = 0;
    this.isGrounded = false;
    this.wasGrounded = false;
    this.airTime = 0;
    this.turnMomentum = 0;
    this.groundNormal.set(0, 1, 0);

    // Reset weight transfer
    this.weightForward = 0;
    this.weightSide = 0;
    this.effectivePressure = 1;

    // Reset air rotation
    this.pitch = 0;
    this.roll = 0;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;
    this.spinVelocity = 0;

    // Reset edge transition
    this.previousEdgeSide = 0;
    this.edgeTransitionBoost = 0;
    this.lastEdgeChangeTime = 0;

    // Reset compression
    this.compression = 0;
    this.compressionVelocity = 0;
    this.targetCompression = 0;

    // Reset ollie pre-load
    this.jumpCharging = false;
    this.jumpCharge = 0;

    // Reset carve momentum
    this.carveEnergy = 0;
    this.lastCarveDirection = 0;
    this.carveChainCount = 0;
    this.carvePerfection = 0;
    this.peakEdgeAngle = 0;
    this.carveRailStrength = 0;
    this.carveHoldTime = 0;

    // Reset risk/stability
    this.riskLevel = 0;
    this.wobbleAmount = 0;
    this.isRecovering = false;
    this.recoveryTime = 0;

    // Reset carve failure states
    this.isWashingOut = false;
    this.washOutIntensity = 0;
    this.washOutDirection = 0;
    this.isEdgeCaught = false;
    this.edgeCatchSeverity = 0;
    this.edgeCatchTime = 0;

    // Reset carve commitment
    this.carveCommitment = 0;
    this.carveDirection = 0;
    this.carveArcProgress = 0;
    this.carveEntrySpeed = 0;
    this.carveEntryEdge = 0;
    this.turnShapeQuality = 1;
    this.lastEdgeAngleDelta = 0;

    // Reset new carve physics systems
    this.angulation = 0;
    this.targetAngulation = 0;
    this.angulationCapacity = 1.0;
    this.boardFlex = 0;
    this.flexEnergy = 0;
    this.flowState = 0;
    this.flowMomentum = 0;
    this.arcHeadingChange = 0;
    this.arcStartHeading = 0;
    this.arcType = 'none';
    this.edgeBite = 0;

    // Reset smoothing systems
    this.edgeVelocity = 0;
    this.turnInertia = 0;
    this.smoothedGrip = 0.7;
    this.lastAbsEdge = 0;
    this.smoothedRailStrength = 0;
    this.turnRhythm = 0;
    this.rhythmPhase = 0;

    // Reset grinding state
    this.isGrinding = false;
    this.grindRail = null;
    this.grindProgress = 0;
    this.grindBalance = 0;
    this.grindTime = 0;

    // Reset switch state
    this.ridingSwitch = false;
    this.switchBlend = 0;
    this.smoothSwitchMult = 1;
    this.switchLockTime = 0;

    // Reset animation state
    PlayerAnimation.resetAnimState.call(this);
  }

  getPosition() {
    const pos = this.body.translation();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }

  getVelocity() {
    return this.velocity.clone();
  }

  getHeading() {
    return this.heading;
  }

  getSpeedKmh() {
    return this.currentSpeed * 3.6;
  }
}
