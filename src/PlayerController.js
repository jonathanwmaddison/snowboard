import * as THREE from 'three';

// Import physics modules
import * as CarvePhysics from './CarvePhysics.js';
import * as CarvePhysicsV2 from './CarvePhysicsV2.js';
import * as SkiPhysics from './SkiPhysics.js';
import * as AirGrindPhysics from './AirGrindPhysics.js';
import * as PlayerAnimation from './PlayerAnimation.js';
import { MinecraftMode } from './MinecraftMode.js';

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
    this.input = { steer: 0, lean: 0, jump: false, switchStance: false, shift: false };

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

    // === FLYING MODE ===
    this.isFlying = false;
    this.flySpeed = 30;  // Base fly speed

    // === WALKING MODE ===
    this.isWalking = false;
    this.walkSpeed = 5;  // Walking speed (m/s)

    // === SPACE ===
    this.spaceAltitude = 200;  // Height where space begins
    this.starField = null;  // Star particles for space
    this.asteroids = [];  // Asteroid meshes
    this.moon = null;  // The moon you can fly to
    this.moonPosition = new THREE.Vector3(0, 800, -2000);  // Moon location
    this.giantMeteor = null;  // Humongous meteor
    this.meteorTrail = null;  // Fire trail behind meteor
    this.blackHole = null;  // Black hole that sucks everything
    this.blackHolePosition = new THREE.Vector3(400, 500, -1200);  // Position in space
    this.blackHoleRadius = 80;  // Event horizon radius
    this.blackHolePullStrength = 800;  // Gravitational strength

    // === ROCKET & MOON MISSION ===
    this.rocket = null;
    this.rocketPosition = new THREE.Vector3(50, 0, -30);  // Near start
    this.isInRocket = false;
    this.rocketLaunching = false;
    this.rocketFlightTime = 0;
    this.rocketVelocity = new THREE.Vector3(0, 0, 0);  // For steering in space
    this.onMoon = false;
    this.moonGravity = 1.62;  // Moon gravity (vs Earth 9.81)
    this.earthGravity = 9.81;
    this.moonTerrain = null;  // Physical moon surface to walk on
    this.moonTerrainMesh = null;  // Visual moon terrain

    // === MINECRAFT MODE ===
    this.minecraftMode = null;  // Initialized after scene is ready
    this.isMiningKeyHeld = false;
    this.fpsMode = false;  // First-person view mode

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

    // G-force tracking for physics and animation
    this.currentGForce = 1.0;

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

    // === HOCKEY STOP STATE ===
    this.hockeyStopStrength = 0;

    // === GLB MODEL ===
    this.playerModelGLB = null;
    this.glbModelUrl = null;

    // === CARVE PHYSICS VERSION ===
    this.carvePhysicsVersion = 1;  // 1 = v1 (original), 2 = v2 (realistic)
    this.v2 = null;  // V2 state initialized on first use
    this.inputMode = 'keyboard';  // 'keyboard', 'gamepad', 'analog'

    // === SPORT TYPE ===
    this.sportType = 'snowboard';  // 'snowboard' or 'ski'
    this.ski = null;  // Ski state initialized on first use
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

    // Create the rocket ship
    this.createRocket();

    // Initialize Minecraft mode (but don't enable yet)
    if (this.sceneManager && this.sceneManager.scene) {
      this.minecraftMode = new MinecraftMode(this.sceneManager.scene, this.terrain);
    }
  }

  /**
   * Create rocket ship near the start
   */
  createRocket() {
    if (!this.sceneManager || !this.sceneManager.scene) return;
    const scene = this.sceneManager.scene;

    // Rocket body
    const rocketGroup = new THREE.Group();

    // Main body (cylinder)
    const bodyGeo = new THREE.CylinderGeometry(3, 4, 20, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      metalness: 0.8,
      roughness: 0.2
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 10;
    rocketGroup.add(body);

    // Nose cone
    const noseGeo = new THREE.ConeGeometry(3, 8, 16);
    const noseMat = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      metalness: 0.5,
      roughness: 0.3
    });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.y = 24;
    rocketGroup.add(nose);

    // Fins (4 of them)
    const finGeo = new THREE.BoxGeometry(0.5, 8, 5);
    const finMat = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      metalness: 0.5
    });
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(finGeo, finMat);
      const angle = (i / 4) * Math.PI * 2;
      fin.position.set(
        Math.cos(angle) * 4,
        4,
        Math.sin(angle) * 4
      );
      fin.rotation.y = angle;
      rocketGroup.add(fin);
    }

    // Window
    const windowGeo = new THREE.CircleGeometry(1.5, 16);
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      metalness: 0.9,
      roughness: 0.1
    });
    const window1 = new THREE.Mesh(windowGeo, windowMat);
    window1.position.set(0, 15, 3.1);
    rocketGroup.add(window1);

    // Engine glow (initially off)
    const engineGeo = new THREE.ConeGeometry(3, 6, 16);
    const engineMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0
    });
    const engine = new THREE.Mesh(engineGeo, engineMat);
    engine.position.y = -3;
    engine.rotation.x = Math.PI;
    engine.name = 'engineFlame';
    rocketGroup.add(engine);

    // Position rocket
    if (this.terrain) {
      const groundY = this.terrain.getHeightAt(this.rocketPosition.x, this.rocketPosition.z);
      this.rocketPosition.y = groundY;
    }
    rocketGroup.position.copy(this.rocketPosition);

    this.rocket = rocketGroup;
    scene.add(this.rocket);

    console.log('🚀 Rocket ready! Approach and press E to launch to the moon!');
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

    // === ROCKET LAUNCH SEQUENCE ===
    if (this.rocketLaunching) {
      this.updateRocketLaunch(dt, pos);
      return;
    }

    // === FLYING MODE ===
    if (this.isFlying) {
      this.updateFlyingPhysics(dt, pos);
      return;
    }

    // === WALKING MODE ===
    if (this.isWalking) {
      this.updateWalkingPhysics(dt, pos);
      // Update minecraft mode while walking (can mine/build while walking)
      if (this.minecraftMode && this.minecraftMode.isEnabled()) {
        this.minecraftMode.update(dt, pos, this.isMiningKeyHeld, this.heading);
      }
      return;
    }

    // === MINECRAFT MODE UPDATE ===
    if (this.minecraftMode && this.minecraftMode.isEnabled()) {
      this.minecraftMode.update(dt, pos, this.isMiningKeyHeld, this.heading);
    }

    if (this.isGrounded) {
      this.airTime = 0;
      this.updateGroundedPhysics(dt, pos);

      // Check if we just jumped (isGrounded will be false after jump)
      if (!this.isGrounded) {
        // Jump was initiated - don't reset velocity.y, let us become airborne
        this.body.setNextKinematicTranslation({
          x: pos.x + this.velocity.x * dt,
          y: pos.y + this.velocity.y * dt,
          z: pos.z + this.velocity.z * dt
        });
      } else {
        // Still grounded - follow terrain
        const targetY = this.groundHeight + 0.15;
        const yChange = targetY - pos.y;

        // Faster ground following, especially when above ground
        const maxYChangePerFrame = yChange > 0 ? 0.4 : 0.6;

        let newY;
        if (Math.abs(yChange) > maxYChangePerFrame) {
          newY = pos.y + Math.sign(yChange) * maxYChangePerFrame;
        } else {
          newY = targetY;
        }

        // Reset vertical velocity when grounded
        this.velocity.y = 0;
        this.body.setNextKinematicTranslation({
          x: pos.x + this.velocity.x * dt,
          y: newY,
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
    // Use moon gravity when on the moon!
    const g = this.onMoon ? this.moonGravity : this.earthGravity;
    let speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

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

    // Branch based on sport type first
    if (this.sportType === 'ski') {
      this.updateGroundedPhysicsSki(dt, pos, speed2D, forward, right);
      return;
    }

    // Branch based on carve physics version (snowboard)
    if (this.carvePhysicsVersion === 2) {
      this.updateGroundedPhysicsV2(dt, pos, speed2D, forward, right);
      return;
    }

    // === V1 PHYSICS (original snowboard) ===

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
    CarvePhysics.updateEdgeBite.call(this, dt, absEdge, speed2D);

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

    // Gravity / slope - reduced multiplier for more realistic acceleration
    const slopeDir = this.getSlopeDirection();
    const slopeSteepness = 1 - this.groundNormal.y;
    const gravityAccel = g * slopeSteepness * 3.5;

    // Get snow conditions
    if (this.terrain) {
      this.currentSnowCondition = this.terrain.getSnowCondition(pos.x, pos.z);
    }

    // === VELOCITY ALIGNMENT (SIMPLE AND SMOOTH) ===
    // The board should pull velocity toward its heading - this is what makes carving work
    // Deeper edge = stronger pull (more grip)
    // Back-weighted = weaker pull (allows skidding for speed control)

    let velDir = 0;
    if (speed2D > 0.5) {
      velDir = Math.atan2(-this.velocity.x, this.velocity.z);
      this.slipAngle = this.normalizeAngle(velDir - this.heading);
    } else {
      this.slipAngle = 0;
    }
    const absSlipAngle = Math.abs(this.slipAngle);

    // Flow state update
    CarvePhysics.updateFlowState.call(this, dt);

    // === CARVING - VELOCITY FOLLOWS HEADING ===
    // The core of carving: velocity smoothly aligns with where the board points
    // Deeper edge = tighter grip = velocity follows heading more precisely
    const edgeGrip = 0.4 + absEdge * 0.6;  // 0.4 flat to 1.0 at max edge

    // Back-weighting loosens the carve (allows drift/skid)
    const isBackWeighted = this.input.lean < -0.3;  // Need more S pressure to trigger
    const gripModifier = isBackWeighted ? 0.3 : 1.0;  // Significant grip loss when braking

    // Smooth, strong velocity alignment for clean carving feel
    if (speed2D > 0.5) {
      const alignStrength = edgeGrip * gripModifier * 8 * dt;  // Strong alignment
      const newVelDir = velDir + this.normalizeAngle(this.heading - velDir) * alignStrength;
      this.velocity.x = -Math.sin(newVelDir) * speed2D;
      this.velocity.z = Math.cos(newVelDir) * speed2D;
    }

    // === HOCKEY STOP (S + HARD TURN) ===
    // Requires commitment: strong back-weight AND significant edge angle
    // This is the emergency brake, not casual speed control
    if (isBackWeighted && absEdge > 0.4 && speed2D > 2) {
      // How committed are you to the stop?
      const brakeCommitment = Math.abs(this.input.lean + 0.3) / 0.7;  // 0 to 1
      const edgeCommitment = Math.min((absEdge - 0.4) / 0.6, 1);  // 0 to 1

      // Need both for effective stopping
      const stopPower = brakeCommitment * edgeCommitment;

      // Gradual friction buildup - not instant
      const frictionCoeff = 0.3 + absEdge * 0.4;
      const frictionForce = stopPower * frictionCoeff * speed2D * 3.0;  // Reduced from 8.0

      const speedLoss = frictionForce * dt;
      if (speed2D > speedLoss) {
        const scale = (speed2D - speedLoss) / speed2D;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }

      // Visual feedback
      this.targetCompression = Math.max(this.targetCompression, stopPower * 0.3);
    }

    // Recalculate speed after friction
    speed2D = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

    // Carve acceleration (pumping) - only when carving cleanly
    if (absSlipAngle < 0.15 && this.smoothedRailStrength > 0.3) {
      CarvePhysics.applyCarveAcceleration.call(this, dt, absEdge, speed2D, forward);
    }

    // Gravity
    this.velocity.x += slopeDir.x * gravityAccel * dt;
    this.velocity.z += slopeDir.z * gravityAccel * dt;

    // Air resistance only (slip friction handles the main speed control now)
    const speedDrag = speed2D > 20 ? Math.pow((speed2D - 20) / 50, 2) * 0.008 : 0;
    const drag = 0.999 - speedDrag;
    this.velocity.x *= drag;
    this.velocity.z *= drag;

    // Weight-based tuck
    if (this.input.lean > 0.1) {
      const tuck = this.input.lean;
      const thrust = tuck * 2.0;
      this.velocity.x += forward.x * thrust * dt;
      this.velocity.z += forward.z * thrust * dt;
    }

    // Hockey stop (S + A/D) - turns board perpendicular and scrubs speed
    const hockeyStopResult = CarvePhysics.updateHockeyStop.call(this, dt, absEdge, edgeSign, speed2D, forward, right);

    // Simple braking (S only, no steering) - only when NOT doing hockey stop
    if (!hockeyStopResult.isActive && this.input.lean < -0.2 && speed2D > 2) {
      const brakeIntensity = Math.abs(this.input.lean + 0.2) / 0.8;
      const brakePower = brakeIntensity * speed2D * 0.08;  // Gentler brake without hockey stop

      this.velocity.x -= (this.velocity.x / speed2D) * brakePower * dt;
      this.velocity.z -= (this.velocity.z / speed2D) * brakePower * dt;

      this.targetCompression = Math.max(this.targetCompression, brakeIntensity * 0.3);
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

  /**
   * V2 Grounded Physics - Realistic carving model
   */
  updateGroundedPhysicsV2(dt, pos, speed2D, forward, right) {
    // Use moon gravity when on the moon!
    const g = this.onMoon ? this.moonGravity : this.earthGravity;

    // Initialize v2 state if needed
    if (!this.v2) {
      CarvePhysicsV2.initV2State.call(this);
    }

    // Get snow conditions
    if (this.terrain) {
      this.currentSnowCondition = this.terrain.getSnowCondition(pos.x, pos.z);
    }

    // Switch detection from velocity
    const forwardSpeed = this.velocity.dot(forward);
    if (!this.v2.isSwitch) {
      this.ridingSwitch = forwardSpeed < -1;
    } else {
      this.ridingSwitch = true;
    }

    // === V2 CARVE PHYSICS ===
    const carveResult = CarvePhysicsV2.updateCarvePhysicsV2.call(this, dt, speed2D, forward, right);

    const absEdge = Math.abs(carveResult.edgeAngle);
    const edgeSign = Math.sign(carveResult.edgeAngle);

    // Update compression based on G-force
    this.updateCompression(dt, absEdge, speed2D);

    // Apply turn physics (heading changes)
    CarvePhysicsV2.applyV2TurnPhysics.call(this, dt, speed2D);

    // === PRESSURE-BASED PHYSICS ===
    // Back weight (S key) shifts pressure to rear foot
    // This loosens carve engagement and promotes skidding
    // Skidding is what creates friction to slow down (not artificial braking)
    // IMPORTANT: This must happen BEFORE applySkidFriction so the friction is applied correctly

    const backWeight = this.input.lean < 0 ? Math.abs(this.input.lean) : 0;

    if (backWeight > 0.1) {
      // Shift pressure distribution to back foot
      this.v2.pressureDistribution = THREE.MathUtils.lerp(
        this.v2.pressureDistribution,
        0.5 - backWeight * 0.3,  // Shift toward 0.2-0.5 range (back-weighted)
        5 * dt
      );

      // Back weight reduces carve grip - board wants to skid
      // This is the physical mechanism: rear-weighted = looser edge = drift
      this.v2.carveQuality = Math.max(0, this.v2.carveQuality - backWeight * dt * 3);

      // Increase slip angle proportional to back weight and any existing edge angle
      // More edge + back weight = bigger skid (hockey stop physics)
      // Even without edge, some slip angle from back-weighting (tail drag)
      const baseSlip = backWeight * 0.25;  // Base tail drag
      const edgeSlip = backWeight * absEdge * 0.8;  // Edge-enhanced skid
      const skidPotential = baseSlip + edgeSlip;
      this.v2.slipAngle = Math.max(this.v2.slipAngle, skidPotential);

      // Force skid mode when back-weighted
      // With edge: full hockey stop (more aggressive threshold)
      // Without edge: tail drag mode (still slows you down)
      if (backWeight > 0.3) {
        this.v2.isCarving = false;
        this.v2.isSkidding = true;
      } else if (backWeight > 0.15 && absEdge > 0.1) {
        // Lower thresholds when combining back-weight with any edge
        this.v2.isCarving = false;
        this.v2.isSkidding = true;
      }

      // Visual feedback - defensive crouch stance
      this.targetCompression = Math.max(this.targetCompression, backWeight * 0.3);
    }

    // Apply grip (carve mode) - this reduces lateral sliding
    CarvePhysicsV2.applyV2Grip.call(this, dt, forward, right);

    // Apply skid friction if skidding - THIS IS HOW SNOWBOARDERS SLOW DOWN
    // The back-weight handling above puts us in skid mode, then this applies friction
    CarvePhysicsV2.applySkidFriction.call(this, dt, speed2D, forward, right);

    // === GRAVITY & SLOPE - reduced multiplier for realistic acceleration ===
    const slopeDir = this.getSlopeDirection();
    const slopeSteepness = 1 - this.groundNormal.y;
    const gravityAccel = g * slopeSteepness * 3.5;

    this.velocity.x += slopeDir.x * gravityAccel * dt;
    this.velocity.z += slopeDir.z * gravityAccel * dt;

    // === DRAG - speed-based for natural terminal velocity ===
    const baseDrag = 0.998;
    const carveDrag = absEdge * 0.001;
    const skidDrag = this.v2.isSkidding ? this.v2.slipAngle * 0.008 : 0;
    const snowDragMod = (this.currentSnowCondition.dragMultiplier - 1) * 0.003;
    const speedDrag = speed2D > 15 ? Math.pow((speed2D - 15) / 50, 2) * 0.015 : 0;
    const drag = baseDrag - carveDrag - skidDrag - snowDragMod - speedDrag;
    this.velocity.x *= Math.max(drag, 0.95);
    this.velocity.z *= Math.max(drag, 0.95);

    // === WEIGHT-BASED ACCELERATION ===
    // Forward lean = tuck = acceleration
    if (this.input.lean > 0.1) {
      const tuck = this.input.lean;
      const thrust = tuck * 2.0;
      this.velocity.x += forward.x * thrust * dt;
      this.velocity.z += forward.z * thrust * dt;
    }

    // === CARVE ACCELERATION (pumping) ===
    // In v2, carve acceleration comes from G-force during clean carves
    if (this.v2.isCarving && this.v2.gForce > 0.3) {
      const pumpAccel = this.v2.gForce * this.v2.carveQuality * 1.5 * dt;
      this.velocity.x += forward.x * pumpAccel;
      this.velocity.z += forward.z * pumpAccel;
    }

    // === SPEED LIMITS ===
    const maxSpeed = 55;
    if (speed2D > maxSpeed) {
      const scale = maxSpeed / speed2D;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // === JUMP SYSTEM ===
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

    // === AIR ROTATION RESET ===
    this.pitch = THREE.MathUtils.lerp(this.pitch, 0, 5 * dt);
    this.roll = THREE.MathUtils.lerp(this.roll, 0, 5 * dt);
    this.pitchVelocity *= 0.9;
    this.rollVelocity *= 0.9;
    this.spinVelocity = this.headingVelocity * 0.3;

    // === SYNC LEGACY STATE FOR ANIMATION ===
    // The animation system uses these v1 values
    this.carveRailStrength = this.v2.isCarving ? this.v2.carveQuality : 0;
    this.smoothedRailStrength = this.carveRailStrength;
    this.carvePerfection = this.v2.carveQuality;
    this.weightForward = (this.v2.pressureDistribution - 0.5) * 2;  // Map 0-1 to -1 to 1
  }

  /**
   * Ski Grounded Physics
   */
  updateGroundedPhysicsSki(dt, pos, speed2D, forward, right) {
    // Use moon gravity when on the moon!
    const g = this.onMoon ? this.moonGravity : this.earthGravity;

    // Initialize ski state if needed
    if (!this.ski) {
      SkiPhysics.initSkiState.call(this);
    }

    // Get snow conditions
    if (this.terrain) {
      this.currentSnowCondition = this.terrain.getSnowCondition(pos.x, pos.z);
    }

    // Switch detection (skiing is always forward-facing)
    const forwardSpeed = this.velocity.dot(forward);
    this.ridingSwitch = forwardSpeed < -1;

    // === SKI PHYSICS ===
    const skiResult = SkiPhysics.updateSkiPhysics.call(this, dt, speed2D, forward, right);

    const absEdge = Math.abs(this.edgeAngle);

    // Update compression based on G-force
    this.updateCompression(dt, absEdge, speed2D);

    // === GRAVITY & SLOPE - reduced for realistic acceleration ===
    const slopeDir = this.getSlopeDirection();
    const slopeSteepness = 1 - this.groundNormal.y;
    const gravityAccel = g * slopeSteepness * 3.5;

    this.velocity.x += slopeDir.x * gravityAccel * dt;
    this.velocity.z += slopeDir.z * gravityAccel * dt;

    // === DRAG - speed-based for natural terminal velocity ===
    const baseDrag = 0.998;
    const carveDrag = absEdge * 0.0008;  // Less drag from edge on skis
    const skidDrag = !this.ski.isCarving ? 0.005 : 0;
    const snowDragMod = (this.currentSnowCondition.dragMultiplier - 1) * 0.003;
    const speedDrag = speed2D > 15 ? Math.pow((speed2D - 15) / 55, 2) * 0.012 : 0;
    const drag = baseDrag - carveDrag - skidDrag - snowDragMod - speedDrag;
    this.velocity.x *= Math.max(drag, 0.95);
    this.velocity.z *= Math.max(drag, 0.95);

    // === WEIGHT-BASED ACCELERATION ===
    // Forward lean = tuck = acceleration (same as snowboard)
    if (this.input.lean > 0.1) {
      const tuck = this.input.lean;
      const thrust = tuck * 2.0;
      this.velocity.x += forward.x * thrust * dt;
      this.velocity.z += forward.z * thrust * dt;
    }

    // === CARVE ACCELERATION (pumping) ===
    SkiPhysics.applySkiCarveAcceleration.call(this, dt, speed2D, forward);

    // === SPEED LIMITS ===
    const maxSpeed = 60;  // Skis can go a bit faster
    if (speed2D > maxSpeed) {
      const scale = maxSpeed / speed2D;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // === JUMP SYSTEM ===
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

    // === AIR ROTATION RESET ===
    this.pitch = THREE.MathUtils.lerp(this.pitch, 0, 5 * dt);
    this.roll = THREE.MathUtils.lerp(this.roll, 0, 5 * dt);
    this.pitchVelocity *= 0.9;
    this.rollVelocity *= 0.9;
    this.spinVelocity = this.headingVelocity * 0.3;

    // Weight forward mapped from ski pressure
    this.weightForward = this.input.lean;
  }

  updateCompression(dt, absEdge, speed2D) {
    // Use the physics-calculated G-force for compression
    const gForce = this.currentGForce || 1.0;

    let idealCompression = 0.1;

    if (absEdge > 0.3) {
      // G-force based compression - deeper carve + speed = more compression
      const gCompression = Math.min((gForce - 1) * 0.25, 0.5);
      const edgeCompression = absEdge * 0.3;

      // Pressure-based compression - forward lean = lower stance
      const pressureCompression = this.input.lean > 0 ? this.input.lean * 0.15 : 0;

      idealCompression = 0.2 + edgeCompression + gCompression + pressureCompression;
    }

    // Jump charging compression
    if (this.jumpCharging) {
      idealCompression = 0.4 + this.jumpCharge * 0.4;
    }

    // Flow state affects stance - more relaxed in flow
    if (this.flowState > 0.3) {
      idealCompression *= (1 - this.flowState * 0.1);  // Slightly less tense
    }

    // Faster approach rate for snappier feel
    const compressionApproachRate = 8;
    this.targetCompression = THREE.MathUtils.lerp(
      this.targetCompression,
      idealCompression,
      compressionApproachRate * dt
    );

    // Spring-damper with G-force reactive stiffness
    const compressionSpring = 20 + gForce * 5;  // Stiffer under G
    const compressionDamp = 8;
    const compressionForce = (this.targetCompression - this.compression) * compressionSpring;
    this.compressionVelocity += compressionForce * dt;
    this.compressionVelocity *= (1 - compressionDamp * dt);
    this.compression += this.compressionVelocity * dt;
    this.compression = THREE.MathUtils.clamp(this.compression, -0.3, 0.85);
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

    // More lenient ground detection - keeps player grounded during transitions
    // This prevents briefly "flying off" when going over small bumps or during edge changes
    if (hit && hit.timeOfImpact < 1.8) {
      this.isGrounded = true;
      this.groundHeight = pos.y + 1 - hit.timeOfImpact;
      this.sampleGroundNormal(pos, RAPIER);
    } else {
      // Only go airborne if we're actually significantly above ground
      // Small gaps should keep us grounded for smoother carving
      if (this.wasGrounded && this.airTime < 0.1) {
        // Give a brief grace period before going airborne
        this.isGrounded = true;
      } else {
        this.isGrounded = false;
      }
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
    } else if (key === 'switchStance') {
      this.input.switchStance = value;
    } else if (key === 'shift') {
      this.input.shift = value;
    }
  }

  /**
   * Toggle between carve physics v1 and v2
   * @returns {number} New version number
   */
  toggleCarvePhysicsVersion() {
    this.carvePhysicsVersion = this.carvePhysicsVersion === 1 ? 2 : 1;
    console.log(`Carve physics switched to v${this.carvePhysicsVersion}`);

    // Initialize v2 state if switching to v2
    if (this.carvePhysicsVersion === 2 && !this.v2) {
      CarvePhysicsV2.initV2State.call(this);
    }

    return this.carvePhysicsVersion;
  }

  /**
   * Set carve physics version directly
   * @param {number} version - 1 or 2
   */
  setCarvePhysicsVersion(version) {
    if (version !== 1 && version !== 2) return;
    this.carvePhysicsVersion = version;

    if (version === 2 && !this.v2) {
      CarvePhysicsV2.initV2State.call(this);
    }
  }

  /**
   * Toggle between snowboard and ski
   * @returns {string} New sport type
   */
  toggleSportType() {
    this.sportType = this.sportType === 'snowboard' ? 'ski' : 'snowboard';
    console.log(`Sport switched to: ${this.sportType}`);

    // Initialize ski state if switching to ski
    if (this.sportType === 'ski' && !this.ski) {
      SkiPhysics.initSkiState.call(this);
    }

    // Update the visual model
    PlayerAnimation.updateSportVisuals.call(this);

    return this.sportType;
  }

  /**
   * Set sport type directly
   * @param {string} sport - 'snowboard' or 'ski'
   */
  setSportType(sport) {
    if (sport !== 'snowboard' && sport !== 'ski') return;
    this.sportType = sport;

    if (sport === 'ski' && !this.ski) {
      SkiPhysics.initSkiState.call(this);
    }

    PlayerAnimation.updateSportVisuals.call(this);
  }

  /**
   * Toggle walking mode
   */
  toggleWalking() {
    this.isWalking = !this.isWalking;
    if (this.isWalking) {
      // Enter walking mode
      this.velocity.set(0, 0, 0);

      // Force to ground level
      const pos = this.getPosition();
      let groundY = 0;
      if (this.terrain) {
        groundY = this.terrain.getHeightAt(pos.x, pos.z) || 0;
      }
      if (this.onMoon && this.moonTerrainMesh) {
        groundY = this.moonPosition.y - 150;
      }

      this.body.setNextKinematicTranslation({
        x: pos.x,
        y: groundY + 1.0,  // Stand height
        z: pos.z
      });
      this.isGrounded = true;
      this.groundHeight = groundY;

      // Hide snowboard
      if (this.boardMesh) {
        this.boardMesh.visible = false;
      }
      console.log('🚶 Walking mode: ON (WASD to walk, Space to jump)');
    } else {
      // Show snowboard again
      if (this.boardMesh) {
        this.boardMesh.visible = true;
      }
      console.log('🏂 Walking mode: OFF - Back to snowboarding!');
    }
  }

  /**
   * Toggle Minecraft mode
   */
  toggleMinecraft() {
    if (this.minecraftMode) {
      this.minecraftMode.toggle();
    }
  }

  /**
   * Toggle FPS (first-person) view mode
   */
  toggleFPS() {
    this.fpsMode = !this.fpsMode;
    if (this.fpsMode) {
      // Hide player mesh in FPS mode
      if (this.mesh) this.mesh.visible = false;
      if (this.boardMesh) this.boardMesh.visible = false;
      console.log('👁️ FPS MODE: ON - First person view!');
    } else {
      // Show player mesh again
      if (this.mesh) this.mesh.visible = true;
      if (this.boardMesh && !this.isWalking) this.boardMesh.visible = true;
      console.log('👁️ FPS MODE: OFF - Third person view');
    }
  }

  /**
   * Set mining key state (called from InputHandler)
   */
  setMining(isHeld) {
    this.isMiningKeyHeld = isHeld;
  }

  /**
   * Update walking physics
   */
  updateWalkingPhysics(dt, pos) {
    // Direction based on heading
    const forward = new THREE.Vector3(
      -Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );

    // WASD movement - W/S is lean, A/D is steer
    let moveX = 0;
    let moveZ = 0;

    // W key = forward (lean > 0)
    if (this.input.lean > 0.1) {
      moveX = forward.x * this.input.lean;
      moveZ = forward.z * this.input.lean;
    }
    // S key = backward (lean < 0)
    if (this.input.lean < -0.1) {
      moveX = forward.x * this.input.lean * 0.5;  // Slower backward
      moveZ = forward.z * this.input.lean * 0.5;
    }

    // Turn with A/D (steer)
    this.heading += this.input.steer * 3.0 * dt;

    // Calculate new position
    const newX = pos.x + moveX * this.walkSpeed * dt;
    const newZ = pos.z + moveZ * this.walkSpeed * dt;

    // Get ground height at new position (use terrain directly for reliability)
    let groundY = 0;
    if (this.onMoon && this.moonTerrainMesh) {
      groundY = this.moonPosition.y - 150;
    } else if (this.terrain) {
      groundY = this.terrain.getHeightAt(newX, newZ) || 0;
    }

    // Check if jumping
    if (this.input.jump && this.isGrounded) {
      const jumpPower = this.onMoon ? 4 : 6;  // Lower jump power, moon has less gravity
      this.velocity.y = jumpPower;
      this.isGrounded = false;
      this.input.jump = false;
    }

    // Apply gravity when in air
    if (!this.isGrounded) {
      const g = this.onMoon ? this.moonGravity : this.earthGravity;
      this.velocity.y -= g * dt;

      const newY = pos.y + this.velocity.y * dt;

      // Check if we've landed
      if (newY <= groundY + 1.0) {
        this.isGrounded = true;
        this.velocity.y = 0;
        this.body.setNextKinematicTranslation({
          x: newX,
          y: groundY + 1.0,
          z: newZ
        });
      } else {
        this.body.setNextKinematicTranslation({
          x: newX,
          y: newY,
          z: newZ
        });
      }
    } else {
      // On ground - follow terrain
      this.body.setNextKinematicTranslation({
        x: newX,
        y: groundY + 1.0,
        z: newZ
      });
    }

    this.groundHeight = groundY;

    // Update mesh for walking pose
    const currentPos = this.getPosition();
    if (this.mesh) {
      // Hide mesh in FPS mode
      this.mesh.visible = !this.fpsMode;
      this.mesh.position.copy(currentPos);
      this.mesh.rotation.set(0, this.heading, 0);
    }

    // Update speed display
    this.currentSpeed = Math.sqrt(moveX * moveX + moveZ * moveZ) * this.walkSpeed;
  }

  /**
   * Toggle flying mode
   */
  toggleFlying() {
    this.isFlying = !this.isFlying;
    if (this.isFlying) {
      // Enter flying mode - stop normal physics
      this.isGrounded = false;
      this.velocity.set(0, 0, 0);
      // Hide snowboard
      if (this.boardMesh) {
        this.boardMesh.visible = false;
      }
      // Create star field for space
      this.createStarField();
      console.log('Flying mode: ON (WASD to move, Space up, Shift down)');
    } else {
      // Show snowboard again
      if (this.boardMesh) {
        this.boardMesh.visible = true;
      }
      // Remove star field
      this.removeStarField();
      // Reset scene background
      if (this.sceneManager && this.sceneManager.scene) {
        this.sceneManager.scene.background = new THREE.Color(0x87CEEB);  // Sky blue
      }
      console.log('Flying mode: OFF');
    }
  }

  /**
   * Try to interact with nearby objects (rocket, etc)
   */
  tryInteract() {
    if (!this.rocket) return;

    // Check distance to rocket
    const pos = this.getPosition();
    const distToRocket = pos.distanceTo(this.rocketPosition);

    if (distToRocket < 20 && !this.isInRocket && !this.rocketLaunching) {
      // Enter the rocket!
      this.isInRocket = true;
      this.rocketLaunching = true;
      this.rocketFlightTime = 0;
      this.rocketVelocity = new THREE.Vector3(0, 50, 0);  // Initial upward velocity

      // Hide player mesh
      if (this.mesh) this.mesh.visible = false;
      if (this.boardMesh) this.boardMesh.visible = false;

      // Start engine flame
      const engineFlame = this.rocket.getObjectByName('engineFlame');
      if (engineFlame) {
        engineFlame.material.opacity = 0.9;
      }

      console.log('🚀 ROCKET LAUNCH INITIATED! Destination: THE MOON!');
    } else if (!this.isInRocket) {
      console.log('Get closer to the rocket to board! (within 20m)');
    }
  }

  /**
   * Update rocket launch sequence
   */
  updateRocketLaunch(dt, pos) {
    if (!this.rocketLaunching || !this.rocket) return false;

    this.rocketFlightTime += dt;

    // Launch phases:
    // 0-2s: Rumble and liftoff
    // 2-8s: Accelerate through atmosphere
    // 8-15s: Coast to moon
    // 15s+: Land on moon

    const t = this.rocketFlightTime;

    if (t < 2) {
      // Rumble phase - small shakes
      this.rocket.position.x = this.rocketPosition.x + (Math.random() - 0.5) * 0.5;
      this.rocket.position.z = this.rocketPosition.z + (Math.random() - 0.5) * 0.5;
      this.rocket.position.y = this.rocketPosition.y + t * 0.5;  // Slow rise

      // Engine flame grows
      const engineFlame = this.rocket.getObjectByName('engineFlame');
      if (engineFlame) {
        engineFlame.scale.setScalar(1 + t * 0.5);
      }

    } else if (t < 8) {
      // Accelerate phase - can steer slightly during ascent
      const accelT = t - 2;
      const speed = 5 + accelT * accelT * 10;  // Quadratic acceleration
      this.rocket.position.y = this.rocketPosition.y + 1 + (accelT * speed);

      // Slight steering during ascent
      const steerPower = 15;
      this.rocket.position.x += this.input.steer * steerPower * dt;
      this.rocket.position.z += this.input.lean * steerPower * dt;

      // Tilt rocket based on steering
      this.rocket.rotation.z = -this.input.steer * 0.3;
      this.rocket.rotation.x = this.input.lean * 0.2;

      // Engine flame at full power
      const engineFlame = this.rocket.getObjectByName('engineFlame');
      if (engineFlame) {
        engineFlame.scale.setScalar(2 + Math.sin(t * 20) * 0.3);  // Flickering
      }

      // Create space effect as we go up
      if (this.rocket.position.y > this.spaceAltitude && !this.starField) {
        this.createStarField();
      }
      if (this.starField) {
        this.starField.visible = true;
        this.starField.material.opacity = Math.min((this.rocket.position.y - this.spaceAltitude) / 100, 0.95);
      }

      // Darken sky
      if (this.sceneManager && this.sceneManager.scene && this.rocket.position.y > this.spaceAltitude) {
        const spaceAmount = Math.min((this.rocket.position.y - this.spaceAltitude) / 200, 1);
        const skyColor = new THREE.Color();
        skyColor.lerpColors(new THREE.Color(0x87CEEB), new THREE.Color(0x000005), spaceAmount);
        this.sceneManager.scene.background = skyColor;
      }

    } else if (t < 15) {
      // Coast to moon - FULL STEERING CONTROL!
      const coastT = t - 8;

      // Initialize rocket velocity if needed
      if (!this.rocketVelocity) {
        this.rocketVelocity = new THREE.Vector3(0, 50, 0);
      }

      // Steering: A/D controls yaw (left/right), W/S controls pitch (up/down)
      const steerPower = 80;
      const right = new THREE.Vector3(1, 0, 0);
      const up = new THREE.Vector3(0, 1, 0);

      // Calculate forward direction from rocket rotation
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyEuler(this.rocket.rotation);

      // Apply steering to velocity
      this.rocketVelocity.add(right.multiplyScalar(this.input.steer * steerPower * dt));
      this.rocketVelocity.add(up.multiplyScalar(this.input.lean * steerPower * dt));

      // Also gravitate toward moon slightly
      const moonDir = this.moonPosition.clone().sub(this.rocket.position).normalize();
      const coastSpeed = 50 + coastT * 10;
      this.rocketVelocity.add(moonDir.multiplyScalar(coastSpeed * dt * 0.5));

      // Apply velocity
      this.rocket.position.add(this.rocketVelocity.clone().multiplyScalar(dt));

      // Tilt rocket based on steering (more dramatic in space!)
      this.rocket.rotation.z = THREE.MathUtils.lerp(this.rocket.rotation.z, -this.input.steer * 0.5, 3 * dt);
      this.rocket.rotation.x = THREE.MathUtils.lerp(this.rocket.rotation.x, this.input.lean * 0.4, 3 * dt);

      // Engine at lower power (coasting)
      const engineFlame = this.rocket.getObjectByName('engineFlame');
      if (engineFlame) {
        engineFlame.scale.setScalar(0.8 + Math.sin(t * 10) * 0.1);
      }

      // Show space objects
      for (const asteroid of this.asteroids) asteroid.visible = true;
      if (this.moon) this.moon.visible = true;
      if (this.giantMeteor) this.giantMeteor.visible = true;

    } else {
      // Landing on moon!
      const landT = t - 15;

      if (landT < 3) {
        // Slow descent to moon surface
        const moonSurfaceY = this.moonPosition.y - 140;  // Surface of moon
        const targetY = moonSurfaceY + 10 - landT * 3;
        this.rocket.position.y = Math.max(targetY, moonSurfaceY);
        this.rocket.position.x = this.moonPosition.x;
        this.rocket.position.z = this.moonPosition.z + 160;  // Land on near side

        // Retro burn
        const engineFlame = this.rocket.getObjectByName('engineFlame');
        if (engineFlame) {
          engineFlame.scale.setScalar(1.5 - landT * 0.3);
        }
      } else {
        // Landed! Exit rocket and start moon snowboarding
        this.rocketLaunching = false;
        this.onMoon = true;

        // Turn off engine
        const engineFlame = this.rocket.getObjectByName('engineFlame');
        if (engineFlame) {
          engineFlame.material.opacity = 0;
        }

        // Create moon terrain for walking/snowboarding
        this.createMoonTerrain();

        // Position player on moon terrain surface
        const moonSurfaceY = this.moonPosition.y - 150 + 5;  // Terrain is at moonPosition.y - 150
        this.body.setNextKinematicTranslation({
          x: this.moonPosition.x,
          y: moonSurfaceY + 2,
          z: this.moonPosition.z + 50
        });
        this.velocity.set(0, 0, 0);
        this.heading = 0;  // Face forward on moon

        // Show player
        if (this.mesh) this.mesh.visible = true;
        if (this.boardMesh) this.boardMesh.visible = true;
        this.isInRocket = false;

        // Start in walking mode on moon
        this.isWalking = true;
        if (this.boardMesh) this.boardMesh.visible = false;

        console.log('🌙 WELCOME TO THE MOON! Low gravity activated!');
        console.log('Press B to snowboard, WASD to walk. Gravity is only 16.5% of Earth!');
      }
    }

    // Update player position to follow rocket
    if (this.isInRocket) {
      this.body.setNextKinematicTranslation({
        x: this.rocket.position.x,
        y: this.rocket.position.y + 5,
        z: this.rocket.position.z
      });
    }

    return true;  // Still in rocket sequence
  }

  /**
   * Create walkable moon terrain surface
   */
  createMoonTerrain() {
    if (this.moonTerrain) return;  // Already created
    if (!this.sceneManager || !this.sceneManager.scene) return;

    const scene = this.sceneManager.scene;
    const RAPIER = this.physicsWorld.RAPIER;

    // Moon terrain size
    const terrainSize = 500;
    const terrainSegments = 32;  // Reduced for performance

    // Create visual mesh - grey lunar surface with craters
    const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);

    // Store heights for physics BEFORE rotating
    const heights = [];
    const posAttr = geometry.attributes.position;
    const nrows = terrainSegments + 1;
    const ncols = terrainSegments + 1;

    // Deform for lunar hills and craters
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getY(i);  // Y in plane geometry is Z in world

      // Base rolling hills
      let height = Math.sin(x * 0.02) * 5 + Math.cos(z * 0.015) * 4;

      // Add some craters (circular depressions)
      const craters = [
        { cx: 50, cz: 30, r: 40, d: 8 },
        { cx: -80, cz: -50, r: 30, d: 6 },
        { cx: 100, cz: -80, r: 50, d: 10 },
        { cx: -30, cz: 100, r: 35, d: 7 },
        { cx: 0, cz: -120, r: 60, d: 12 },
      ];

      for (const crater of craters) {
        const dist = Math.sqrt((x - crater.cx) ** 2 + (z - crater.cz) ** 2);
        if (dist < crater.r) {
          const t = dist / crater.r;
          if (t > 0.8) {
            height += (1 - (t - 0.8) / 0.2) * crater.d * 0.3;
          } else {
            height -= (1 - t / 0.8) * crater.d;
          }
        }
      }

      posAttr.setZ(i, height);
      heights.push(height);
    }
    geometry.computeVertexNormals();

    // Rotate to be horizontal (plane is created in XY, we need XZ)
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true
    });

    this.moonTerrainMesh = new THREE.Mesh(geometry, material);
    this.moonTerrainMesh.position.set(
      this.moonPosition.x,
      this.moonPosition.y - 150,
      this.moonPosition.z
    );
    this.moonTerrainMesh.receiveShadow = true;
    scene.add(this.moonTerrainMesh);

    // Create simple flat physics collider (box) instead of heightfield to avoid freeze
    const groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(
        this.moonPosition.x,
        this.moonPosition.y - 150 - 1,  // Slightly below terrain mesh
        this.moonPosition.z
      );

    const groundBody = this.physicsWorld.createRigidBody(groundBodyDesc);

    // Simple box collider for moon surface
    const boxDesc = RAPIER.ColliderDesc.cuboid(
      terrainSize / 2,  // Half-width X
      1,                // Thickness
      terrainSize / 2   // Half-width Z
    );

    this.moonTerrain = this.physicsWorld.createCollider(boxDesc, groundBody);

    console.log('🌙 Moon terrain created! Low gravity snowboarding awaits!');
  }

  /**
   * Create star field, asteroids, and moon for space effect
   */
  createStarField() {
    if (this.starField) return;
    if (!this.sceneManager || !this.sceneManager.scene) return;

    const scene = this.sceneManager.scene;

    // === STARS ===
    const starCount = 3000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const radius = 800 + Math.random() * 2000;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi) + 500;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      // Slight color variation (white to blue-white)
      const colorVar = 0.8 + Math.random() * 0.2;
      colors[i * 3] = colorVar;
      colors[i * 3 + 1] = colorVar;
      colors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMaterial = new THREE.PointsMaterial({
      size: 3,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      vertexColors: true
    });

    this.starField = new THREE.Points(geometry, starMaterial);
    this.starField.visible = false;
    scene.add(this.starField);

    // === ASTEROIDS ===
    const asteroidCount = 50;
    const asteroidMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.9,
      metalness: 0.1
    });

    for (let i = 0; i < asteroidCount; i++) {
      // Create irregular asteroid shape
      const size = 5 + Math.random() * 20;
      const asteroidGeo = new THREE.IcosahedronGeometry(size, 1);

      // Deform vertices for rocky look
      const posAttr = asteroidGeo.attributes.position;
      for (let j = 0; j < posAttr.count; j++) {
        const x = posAttr.getX(j);
        const y = posAttr.getY(j);
        const z = posAttr.getZ(j);
        const noise = 0.7 + Math.random() * 0.6;
        posAttr.setXYZ(j, x * noise, y * noise, z * noise);
      }
      asteroidGeo.computeVertexNormals();

      const asteroid = new THREE.Mesh(asteroidGeo, asteroidMaterial);

      // Position in space
      const dist = 200 + Math.random() * 600;
      const angle = Math.random() * Math.PI * 2;
      asteroid.position.set(
        Math.cos(angle) * dist,
        300 + Math.random() * 400,
        Math.sin(angle) * dist - 500
      );

      // Random rotation
      asteroid.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      // Store rotation speed for animation
      asteroid.userData.rotSpeed = {
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.02
      };

      asteroid.visible = false;
      scene.add(asteroid);
      this.asteroids.push(asteroid);
    }

    // === MOON ===
    const moonGeometry = new THREE.SphereGeometry(150, 32, 32);
    const moonMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.8,
      metalness: 0.0
    });

    this.moon = new THREE.Mesh(moonGeometry, moonMaterial);
    this.moon.position.copy(this.moonPosition);

    // Add craters to moon
    const craterMaterial = new THREE.MeshStandardMaterial({
      color: 0x999999,
      roughness: 0.9
    });
    for (let i = 0; i < 20; i++) {
      const craterSize = 10 + Math.random() * 30;
      const craterGeo = new THREE.SphereGeometry(craterSize, 8, 8);
      const crater = new THREE.Mesh(craterGeo, craterMaterial);

      // Position on moon surface
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      crater.position.set(
        140 * Math.sin(phi) * Math.cos(theta),
        140 * Math.cos(phi),
        140 * Math.sin(phi) * Math.sin(theta)
      );
      crater.scale.y = 0.3;  // Flatten into crater
      crater.lookAt(0, 0, 0);
      this.moon.add(crater);
    }

    this.moon.visible = false;
    scene.add(this.moon);

    // === GIANT METEOR - HUMONGOUS AND REALISTIC ===
    const meteorGroup = new THREE.Group();

    // Main meteor body - massive irregular shape
    const meteorSize = 250;  // HUGE - 250 meters
    const meteorGeo = new THREE.IcosahedronGeometry(meteorSize, 3);

    // Heavily deform for realistic rocky appearance
    const meteorPosAttr = meteorGeo.attributes.position;
    for (let j = 0; j < meteorPosAttr.count; j++) {
      const x = meteorPosAttr.getX(j);
      const y = meteorPosAttr.getY(j);
      const z = meteorPosAttr.getZ(j);

      // Multi-layered noise for realistic terrain
      const dist = Math.sqrt(x * x + y * y + z * z);
      const nx = x / dist;
      const ny = y / dist;
      const nz = z / dist;

      // Large features (mountains/valleys)
      const largeNoise = Math.sin(nx * 3) * Math.cos(ny * 2.5) * Math.sin(nz * 2.8) * 0.3;
      // Medium craters
      const medNoise = Math.sin(nx * 8 + ny * 5) * Math.cos(nz * 7) * 0.15;
      // Small detail
      const smallNoise = (Math.random() - 0.5) * 0.08;

      const totalNoise = 0.7 + largeNoise + medNoise + smallNoise;
      meteorPosAttr.setXYZ(j, x * totalNoise, y * totalNoise, z * totalNoise);
    }
    meteorGeo.computeVertexNormals();

    // Create realistic rocky material
    const meteorMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,  // Dark brown/grey rock
      roughness: 0.95,
      metalness: 0.2,
      flatShading: true  // Gives rocky faceted look
    });

    const meteorMesh = new THREE.Mesh(meteorGeo, meteorMaterial);
    meteorGroup.add(meteorMesh);

    // Add darker patches (iron deposits)
    for (let i = 0; i < 15; i++) {
      const patchSize = 20 + Math.random() * 50;
      const patchGeo = new THREE.SphereGeometry(patchSize, 6, 6);
      const patchMat = new THREE.MeshStandardMaterial({
        color: 0x2a1a10,  // Darker iron color
        roughness: 0.9,
        metalness: 0.4
      });
      const patch = new THREE.Mesh(patchGeo, patchMat);

      // Position on surface
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = meteorSize * 0.85;
      patch.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      patch.scale.set(1, 0.3, 1);  // Flatten
      patch.lookAt(0, 0, 0);
      meteorGroup.add(patch);
    }

    // Add impact craters
    for (let i = 0; i < 12; i++) {
      const craterSize = 15 + Math.random() * 40;
      const craterGeo = new THREE.TorusGeometry(craterSize, craterSize * 0.3, 8, 12);
      const craterMat = new THREE.MeshStandardMaterial({
        color: 0x3a2a1a,
        roughness: 1.0,
        metalness: 0.1
      });
      const crater = new THREE.Mesh(craterGeo, craterMat);

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = meteorSize * 0.9;
      crater.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      crater.lookAt(0, 0, 0);
      meteorGroup.add(crater);
    }

    // Glowing hot spots (heating from entry friction)
    for (let i = 0; i < 8; i++) {
      const hotSize = 10 + Math.random() * 25;
      const hotGeo = new THREE.SphereGeometry(hotSize, 8, 8);
      const hotMat = new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.6 + Math.random() * 0.3
      });
      const hotSpot = new THREE.Mesh(hotGeo, hotMat);

      // Position on leading edge
      const theta = Math.random() * Math.PI * 0.5 - Math.PI * 0.25;  // Front-facing
      const phi = Math.random() * Math.PI;
      const r = meteorSize * 0.95;
      hotSpot.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta) - meteorSize * 0.3
      );
      meteorGroup.add(hotSpot);
    }

    // Fire trail behind the meteor
    const trailParticleCount = 2000;
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(trailParticleCount * 3);
    const trailColors = new Float32Array(trailParticleCount * 3);
    const trailSizes = new Float32Array(trailParticleCount);

    for (let i = 0; i < trailParticleCount; i++) {
      // Trail extends behind the meteor
      const trailDist = Math.random() * 600;  // Long tail
      const spread = (trailDist / 600) * 150 + 20;  // Wider at back

      trailPositions[i * 3] = (Math.random() - 0.5) * spread;
      trailPositions[i * 3 + 1] = (Math.random() - 0.5) * spread;
      trailPositions[i * 3 + 2] = meteorSize + trailDist;  // Behind meteor

      // Color gradient: white/yellow at front to red/orange at back
      const t = trailDist / 600;
      if (t < 0.3) {
        // White/yellow hot
        trailColors[i * 3] = 1.0;
        trailColors[i * 3 + 1] = 0.9 - t;
        trailColors[i * 3 + 2] = 0.7 - t * 2;
      } else {
        // Orange/red cooler
        trailColors[i * 3] = 1.0 - (t - 0.3) * 0.3;
        trailColors[i * 3 + 1] = 0.5 - (t - 0.3) * 0.5;
        trailColors[i * 3 + 2] = 0.1;
      }

      trailSizes[i] = 8 + Math.random() * 15 * (1 - t * 0.5);
    }

    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    trailGeo.setAttribute('size', new THREE.BufferAttribute(trailSizes, 1));

    const trailMat = new THREE.PointsMaterial({
      size: 12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      vertexColors: true,
      blending: THREE.AdditiveBlending
    });

    this.meteorTrail = new THREE.Points(trailGeo, trailMat);
    meteorGroup.add(this.meteorTrail);

    // Position the meteor in space - visible from far away
    meteorGroup.position.set(-500, 600, -800);

    // Store rotation speed
    meteorGroup.userData.rotSpeed = {
      x: 0.002,
      y: 0.003,
      z: 0.001
    };
    // Store movement (slowly drifting through space)
    meteorGroup.userData.velocity = {
      x: 0.5,
      y: -0.1,
      z: 0.3
    };

    meteorGroup.visible = false;
    this.giantMeteor = meteorGroup;
    scene.add(this.giantMeteor);

    // === BLACK HOLE - COSMIC HORROR ===
    const blackHoleGroup = new THREE.Group();

    // Event horizon - pure black sphere
    const eventHorizonGeo = new THREE.SphereGeometry(this.blackHoleRadius, 32, 32);
    const eventHorizonMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: false
    });
    const eventHorizon = new THREE.Mesh(eventHorizonGeo, eventHorizonMat);
    blackHoleGroup.add(eventHorizon);

    // Photon sphere - slightly larger, dark with rim glow
    const photonSphereGeo = new THREE.SphereGeometry(this.blackHoleRadius * 1.2, 32, 32);
    const photonSphereMat = new THREE.MeshBasicMaterial({
      color: 0x110022,
      transparent: true,
      opacity: 0.7,
      side: THREE.BackSide
    });
    const photonSphere = new THREE.Mesh(photonSphereGeo, photonSphereMat);
    blackHoleGroup.add(photonSphere);

    // Accretion disk - glowing ring of matter being consumed
    const accretionInner = this.blackHoleRadius * 1.5;
    const accretionOuter = this.blackHoleRadius * 4;
    const accretionGeo = new THREE.RingGeometry(accretionInner, accretionOuter, 64, 8);

    // Create gradient colors for the accretion disk
    const accretionColors = new Float32Array(accretionGeo.attributes.position.count * 3);
    const accretionPos = accretionGeo.attributes.position;
    for (let i = 0; i < accretionPos.count; i++) {
      const x = accretionPos.getX(i);
      const y = accretionPos.getY(i);
      const dist = Math.sqrt(x * x + y * y);
      const t = (dist - accretionInner) / (accretionOuter - accretionInner);

      // Hot white/blue near center, orange/red at edges
      if (t < 0.3) {
        accretionColors[i * 3] = 1.0;  // R
        accretionColors[i * 3 + 1] = 0.9 + t * 0.3;  // G
        accretionColors[i * 3 + 2] = 1.0;  // B (white-blue)
      } else if (t < 0.6) {
        accretionColors[i * 3] = 1.0;  // R
        accretionColors[i * 3 + 1] = 0.7 - (t - 0.3) * 1.5;  // G
        accretionColors[i * 3 + 2] = 0.3 - (t - 0.3);  // B (yellow-orange)
      } else {
        accretionColors[i * 3] = 0.9 - (t - 0.6) * 0.5;  // R
        accretionColors[i * 3 + 1] = 0.2 - (t - 0.6) * 0.4;  // G
        accretionColors[i * 3 + 2] = 0.0;  // B (red-dark)
      }
    }
    accretionGeo.setAttribute('color', new THREE.BufferAttribute(accretionColors, 3));

    const accretionMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const accretionDisk = new THREE.Mesh(accretionGeo, accretionMat);
    accretionDisk.rotation.x = Math.PI * 0.4;  // Tilted view
    accretionDisk.name = 'accretionDisk';
    blackHoleGroup.add(accretionDisk);

    // Second accretion disk layer for depth
    const accretion2 = accretionDisk.clone();
    accretion2.rotation.x = Math.PI * 0.6;
    accretion2.rotation.z = Math.PI * 0.3;
    accretion2.material = accretionMat.clone();
    accretion2.material.opacity = 0.5;
    blackHoleGroup.add(accretion2);

    // Gravitational lensing ring (bright ring around the black)
    const lensRingGeo = new THREE.TorusGeometry(this.blackHoleRadius * 1.1, 3, 16, 64);
    const lensRingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    const lensRing = new THREE.Mesh(lensRingGeo, lensRingMat);
    lensRing.rotation.x = Math.PI / 2;
    blackHoleGroup.add(lensRing);

    // Particle jets shooting from poles
    const jetParticleCount = 500;
    for (let side = -1; side <= 1; side += 2) {
      const jetGeo = new THREE.BufferGeometry();
      const jetPositions = new Float32Array(jetParticleCount * 3);
      const jetColors = new Float32Array(jetParticleCount * 3);

      for (let i = 0; i < jetParticleCount; i++) {
        const dist = Math.random() * 400;
        const spread = (dist / 400) * 30;

        jetPositions[i * 3] = (Math.random() - 0.5) * spread;
        jetPositions[i * 3 + 1] = side * (this.blackHoleRadius + dist);
        jetPositions[i * 3 + 2] = (Math.random() - 0.5) * spread;

        // Blue-white jets
        const intensity = 1 - (dist / 400) * 0.7;
        jetColors[i * 3] = 0.5 * intensity;
        jetColors[i * 3 + 1] = 0.7 * intensity;
        jetColors[i * 3 + 2] = 1.0 * intensity;
      }

      jetGeo.setAttribute('position', new THREE.BufferAttribute(jetPositions, 3));
      jetGeo.setAttribute('color', new THREE.BufferAttribute(jetColors, 3));

      const jetMat = new THREE.PointsMaterial({
        size: 5,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.7,
        vertexColors: true,
        blending: THREE.AdditiveBlending
      });

      const jet = new THREE.Points(jetGeo, jetMat);
      jet.name = side === 1 ? 'jetTop' : 'jetBottom';
      blackHoleGroup.add(jet);
    }

    // Swirling matter particles being pulled in
    const swirlCount = 800;
    const swirlGeo = new THREE.BufferGeometry();
    const swirlPositions = new Float32Array(swirlCount * 3);
    const swirlColors = new Float32Array(swirlCount * 3);

    for (let i = 0; i < swirlCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = this.blackHoleRadius * 2 + Math.random() * this.blackHoleRadius * 6;
      const height = (Math.random() - 0.5) * 40;

      swirlPositions[i * 3] = Math.cos(angle) * dist;
      swirlPositions[i * 3 + 1] = height;
      swirlPositions[i * 3 + 2] = Math.sin(angle) * dist;

      // Store original angle for animation
      const t = (dist - this.blackHoleRadius * 2) / (this.blackHoleRadius * 6);
      swirlColors[i * 3] = 1.0 - t * 0.3;
      swirlColors[i * 3 + 1] = 0.6 - t * 0.4;
      swirlColors[i * 3 + 2] = 0.2;
    }

    swirlGeo.setAttribute('position', new THREE.BufferAttribute(swirlPositions, 3));
    swirlGeo.setAttribute('color', new THREE.BufferAttribute(swirlColors, 3));

    const swirlMat = new THREE.PointsMaterial({
      size: 4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      vertexColors: true,
      blending: THREE.AdditiveBlending
    });

    const swirlParticles = new THREE.Points(swirlGeo, swirlMat);
    swirlParticles.name = 'swirlParticles';
    blackHoleGroup.add(swirlParticles);

    // Position the black hole
    blackHoleGroup.position.copy(this.blackHolePosition);
    blackHoleGroup.visible = false;
    this.blackHole = blackHoleGroup;
    scene.add(this.blackHole);
  }

  /**
   * Remove space objects
   */
  removeStarField() {
    if (!this.sceneManager || !this.sceneManager.scene) return;
    const scene = this.sceneManager.scene;

    // Remove stars
    if (this.starField) {
      scene.remove(this.starField);
      if (this.starField.geometry) this.starField.geometry.dispose();
      if (this.starField.material) this.starField.material.dispose();
      this.starField = null;
    }

    // Remove asteroids
    for (const asteroid of this.asteroids) {
      scene.remove(asteroid);
      if (asteroid.geometry) asteroid.geometry.dispose();
    }
    this.asteroids = [];

    // Remove moon
    if (this.moon) {
      scene.remove(this.moon);
      if (this.moon.geometry) this.moon.geometry.dispose();
      this.moon = null;
    }

    // Remove giant meteor
    if (this.giantMeteor) {
      scene.remove(this.giantMeteor);
      this.giantMeteor = null;
      this.meteorTrail = null;
    }

    // Remove black hole
    if (this.blackHole) {
      scene.remove(this.blackHole);
      this.blackHole = null;
    }
  }

  /**
   * Flying physics - free movement in 3D space
   */
  updateFlyingPhysics(dt, pos) {
    // Direction based on heading
    const forward = new THREE.Vector3(
      -Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );

    const speed = this.flySpeed;

    // === BLACK HOLE GRAVITY - Apply FIRST before input ===
    // This ensures you get sucked in regardless of input!
    if (this.blackHole && this.blackHolePosition) {
      const distToBlackHole = pos.distanceTo(this.blackHolePosition);

      if (distToBlackHole < 1500 && distToBlackHole > 5) {
        // Direction toward black hole
        const pullDir = this.blackHolePosition.clone().sub(pos).normalize();

        // MASSIVE pull - exponentially stronger as you get closer
        // At 1500m: gentle pull. At 200m: UNSTOPPABLE
        const pullStrength = 50000 / (distToBlackHole * distToBlackHole);

        // Apply gravitational acceleration
        this.velocity.x += pullDir.x * pullStrength * dt;
        this.velocity.y += pullDir.y * pullStrength * dt;
        this.velocity.z += pullDir.z * pullStrength * dt;

        // Spin you around as you approach (spaghettification!)
        if (distToBlackHole < 500) {
          const spinIntensity = (500 - distToBlackHole) / 500;
          this.heading += spinIntensity * 3 * dt;
        }

        // Screen shake as doom approaches
        if (distToBlackHole < 300) {
          this.heading += (Math.random() - 0.5) * 0.3;
        }

        // CONSUMED BY THE VOID
        if (distToBlackHole < this.blackHoleRadius * 2) {
          console.log('☠️ CONSUMED BY THE BLACK HOLE! You have been spaghettified...');
          this.isFlying = false;
          if (this.boardMesh) this.boardMesh.visible = true;
          this.removeStarField();
          if (this.sceneManager && this.sceneManager.scene) {
            this.sceneManager.scene.background = new THREE.Color(0x87CEEB);
          }
          this.reset();
          return;
        }
      }
    }

    // === PLAYER INPUT (reduced when being sucked in) ===
    let inputStrength = 1.0;
    if (this.blackHolePosition) {
      const distToBlackHole = pos.distanceTo(this.blackHolePosition);
      if (distToBlackHole < 600) {
        // Input becomes weaker as you approach - you can't escape!
        inputStrength = Math.max(0.1, distToBlackHole / 600);
      }
    }

    // Forward/back from lean input (W/S)
    const moveAccel = this.input.lean * speed * 2 * inputStrength;
    this.velocity.x += forward.x * moveAccel * dt;
    this.velocity.z += forward.z * moveAccel * dt;

    // Vertical movement from jump (Space = up) or shift (down)
    if (this.input.jump) {
      this.velocity.y += speed * 2 * inputStrength * dt;
    }
    if (this.input.shift) {
      this.velocity.y -= speed * 2 * inputStrength * dt;
    }

    // Turn with A/D
    this.heading += this.input.steer * 2.0 * dt * inputStrength;

    // Air drag (so you eventually stop if not pressing anything)
    this.velocity.multiplyScalar(0.98);

    // Clamp velocity to prevent weird physics
    const maxVel = 200;
    const currentVel = this.velocity.length();
    if (currentVel > maxVel) {
      this.velocity.multiplyScalar(maxVel / currentVel);
    }

    // Check for NaN and reset if needed
    if (isNaN(this.velocity.x) || isNaN(this.velocity.y) || isNaN(this.velocity.z)) {
      this.velocity.set(0, 0, 0);
    }

    // Update position
    this.body.setNextKinematicTranslation({
      x: pos.x + this.velocity.x * dt,
      y: pos.y + this.velocity.y * dt,
      z: pos.z + this.velocity.z * dt
    });

    // Update speed display
    this.currentSpeed = Math.sqrt(
      this.velocity.x * this.velocity.x +
      this.velocity.z * this.velocity.z
    );

    // === FLYING POSE ===
    // Update mesh with flying orientation (horizontal, superman pose)
    if (this.mesh) {
      // Get current position from physics body
      const currentPos = this.body.translation();

      // Position mesh at player location
      this.mesh.position.set(currentPos.x, currentPos.y, currentPos.z);
      this.mesh.visible = true;  // Always visible when flying

      // Flying rotation: face forward, tilted horizontal
      const flyPitch = -Math.PI / 2 * 0.8;  // Tilt forward (almost horizontal)
      const bankAngle = -this.input.steer * 0.4;  // Bank into turns

      // Create rotation: heading + pitch + bank
      this.mesh.rotation.set(0, 0, 0);
      this.mesh.rotateY(this.heading);
      this.mesh.rotateX(flyPitch + this.input.lean * 0.2);  // Pitch based on movement
      this.mesh.rotateZ(bankAngle);
    }

    // === SPACE EFFECT ===
    const altitude = pos.y;
    const spaceStart = this.spaceAltitude;
    const spaceEnd = spaceStart + 100;

    if (this.sceneManager && this.sceneManager.scene) {
      const scene = this.sceneManager.scene;

      if (altitude > spaceStart) {
        const spaceAmount = Math.min((altitude - spaceStart) / (spaceEnd - spaceStart), 1);

        // Show and animate stars
        if (this.starField) {
          this.starField.visible = true;
          this.starField.material.opacity = spaceAmount * 0.95;
          this.starField.position.set(pos.x, 0, pos.z);
        }

        // Show and animate asteroids
        for (const asteroid of this.asteroids) {
          asteroid.visible = spaceAmount > 0.3;
          if (asteroid.visible) {
            // Rotate asteroids
            asteroid.rotation.x += asteroid.userData.rotSpeed.x;
            asteroid.rotation.y += asteroid.userData.rotSpeed.y;
            asteroid.rotation.z += asteroid.userData.rotSpeed.z;
          }
        }

        // Show moon
        if (this.moon) {
          this.moon.visible = spaceAmount > 0.2;
          // Slow moon rotation
          this.moon.rotation.y += 0.001;
        }

        // Show and animate giant meteor
        if (this.giantMeteor) {
          this.giantMeteor.visible = spaceAmount > 0.3;
          if (this.giantMeteor.visible) {
            // Rotate the meteor
            this.giantMeteor.rotation.x += this.giantMeteor.userData.rotSpeed.x;
            this.giantMeteor.rotation.y += this.giantMeteor.userData.rotSpeed.y;
            this.giantMeteor.rotation.z += this.giantMeteor.userData.rotSpeed.z;

            // Slowly drift through space
            this.giantMeteor.position.x += this.giantMeteor.userData.velocity.x;
            this.giantMeteor.position.y += this.giantMeteor.userData.velocity.y;
            this.giantMeteor.position.z += this.giantMeteor.userData.velocity.z;

            // Reset position if it drifts too far
            if (this.giantMeteor.position.x > 1500) {
              this.giantMeteor.position.set(-1000, 500 + Math.random() * 300, -600 - Math.random() * 400);
            }

            // Animate the fire trail particles (flickering)
            if (this.meteorTrail) {
              const trailPos = this.meteorTrail.geometry.attributes.position;
              for (let i = 0; i < trailPos.count; i++) {
                // Subtle random movement for fire effect
                trailPos.setX(i, trailPos.getX(i) + (Math.random() - 0.5) * 2);
                trailPos.setY(i, trailPos.getY(i) + (Math.random() - 0.5) * 2);
              }
              trailPos.needsUpdate = true;
            }
          }
        }

        // === BLACK HOLE - THE COSMIC DEVOURER ===
        if (this.blackHole) {
          this.blackHole.visible = spaceAmount > 0.4;

          if (this.blackHole.visible) {
            // Rotate accretion disk
            const accretionDisk = this.blackHole.getObjectByName('accretionDisk');
            if (accretionDisk) {
              accretionDisk.rotation.z += 0.02;
            }

            // Animate swirling particles
            const swirlParticles = this.blackHole.getObjectByName('swirlParticles');
            if (swirlParticles) {
              const swirlPos = swirlParticles.geometry.attributes.position;
              for (let i = 0; i < swirlPos.count; i++) {
                const x = swirlPos.getX(i);
                const z = swirlPos.getZ(i);
                const dist = Math.sqrt(x * x + z * z);
                const angle = Math.atan2(z, x);

                // Spiral inward while rotating
                const rotSpeed = 0.03 * (1 + (this.blackHoleRadius * 4 / dist));  // Faster near center
                const newAngle = angle + rotSpeed;
                const newDist = dist - 0.3;  // Spiral in

                // Reset if too close to center
                if (newDist < this.blackHoleRadius * 1.5) {
                  const resetDist = this.blackHoleRadius * 4 + Math.random() * this.blackHoleRadius * 4;
                  const resetAngle = Math.random() * Math.PI * 2;
                  swirlPos.setX(i, Math.cos(resetAngle) * resetDist);
                  swirlPos.setZ(i, Math.sin(resetAngle) * resetDist);
                } else {
                  swirlPos.setX(i, Math.cos(newAngle) * newDist);
                  swirlPos.setZ(i, Math.sin(newAngle) * newDist);
                }
              }
              swirlPos.needsUpdate = true;
            }

            // Animate jets (pulsing)
            const jetTop = this.blackHole.getObjectByName('jetTop');
            const jetBottom = this.blackHole.getObjectByName('jetBottom');
            if (jetTop && jetBottom) {
              const pulse = 0.7 + Math.sin(performance.now() * 0.005) * 0.3;
              jetTop.material.opacity = pulse;
              jetBottom.material.opacity = pulse;
            }

            // NOTE: Player gravity is now handled at the start of updateFlyingPhysics
            // This section only handles asteroid/meteor gravity for visuals

            // === GRAVITATIONAL PULL ON ASTEROIDS ===
            for (const asteroid of this.asteroids) {
              if (!asteroid.visible) continue;

              const asteroidDist = asteroid.position.distanceTo(this.blackHolePosition);
              if (asteroidDist < 600 && asteroidDist > this.blackHoleRadius) {
                const pullDir = this.blackHolePosition.clone().sub(asteroid.position).normalize();
                const pullStrength = 50 / (asteroidDist * asteroidDist) * 1000;

                asteroid.position.x += pullDir.x * pullStrength * dt;
                asteroid.position.y += pullDir.y * pullStrength * dt;
                asteroid.position.z += pullDir.z * pullStrength * dt;

                // Respawn if consumed
                if (asteroidDist < this.blackHoleRadius * 1.5) {
                  const respawnDist = 400 + Math.random() * 300;
                  const respawnAngle = Math.random() * Math.PI * 2;
                  asteroid.position.set(
                    this.blackHolePosition.x + Math.cos(respawnAngle) * respawnDist,
                    this.blackHolePosition.y + (Math.random() - 0.5) * 200,
                    this.blackHolePosition.z + Math.sin(respawnAngle) * respawnDist
                  );
                }
              }
            }

            // === GRAVITATIONAL PULL ON METEOR ===
            if (this.giantMeteor && this.giantMeteor.visible) {
              const meteorDist = this.giantMeteor.position.distanceTo(this.blackHolePosition);
              if (meteorDist < 800 && meteorDist > this.blackHoleRadius) {
                const pullDir = this.blackHolePosition.clone().sub(this.giantMeteor.position).normalize();
                const pullStrength = 30 / (meteorDist * meteorDist) * 1000;

                this.giantMeteor.userData.velocity.x += pullDir.x * pullStrength;
                this.giantMeteor.userData.velocity.y += pullDir.y * pullStrength;
                this.giantMeteor.userData.velocity.z += pullDir.z * pullStrength;

                // Respawn if consumed
                if (meteorDist < this.blackHoleRadius * 2) {
                  this.giantMeteor.position.set(-1000, 500 + Math.random() * 300, -600);
                  this.giantMeteor.userData.velocity = { x: 0.5, y: -0.1, z: 0.3 };
                }
              }
            }
          }
        }

        // Darken sky to space black
        const skyColor = new THREE.Color();
        const dayColor = new THREE.Color(0x87CEEB);
        const spaceColor = new THREE.Color(0x000005);  // Deep space black
        skyColor.lerpColors(dayColor, spaceColor, spaceAmount);
        scene.background = skyColor;

        // Reduce fog in space
        if (scene.fog) {
          scene.fog.density = 0.0008 * (1 - spaceAmount * 0.95);
        }

        // Increase fly speed in space (no air resistance!)
        this.flySpeed = 30 + spaceAmount * 50;  // Up to 80 in full space

      } else {
        // Below space threshold
        if (this.starField) this.starField.visible = false;
        for (const asteroid of this.asteroids) asteroid.visible = false;
        if (this.moon) this.moon.visible = false;
        if (this.giantMeteor) this.giantMeteor.visible = false;
        if (this.blackHole) this.blackHole.visible = false;

        scene.background = new THREE.Color(0x87CEEB);
        if (scene.fog) scene.fog.density = 0.0008;
        this.flySpeed = 30;
      }

      // Check if player reached the moon!
      if (this.moon && this.moon.visible) {
        const distToMoon = pos.distanceTo(this.moonPosition);
        if (distToMoon < 180 && !this.onMoon) {
          // Land on the moon!
          console.log('🌙 Landing on the MOON!');

          // Create moon terrain
          this.createMoonTerrain();

          // Exit flying mode and land
          this.isFlying = false;
          this.onMoon = true;

          // Position on moon surface
          const moonSurfaceY = this.moonPosition.y - 150 + 5;
          this.body.setNextKinematicTranslation({
            x: this.moonPosition.x,
            y: moonSurfaceY + 2,
            z: this.moonPosition.z
          });
          this.velocity.set(0, 0, 0);

          // Start in walking mode
          this.isWalking = true;
          if (this.boardMesh) this.boardMesh.visible = false;
          if (this.mesh) this.mesh.visible = true;

          console.log('🌙 WELCOME TO THE MOON! Low gravity activated!');
          console.log('Press B to snowboard, WASD to walk.');
          return;
        }
      }
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
    this.currentGForce = 1.0;

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

    // Reset hockey stop state
    this.hockeyStopStrength = 0;

    // Reset v2 carve state
    if (this.v2) {
      CarvePhysicsV2.initV2State.call(this);
    }

    // Reset ski state
    if (this.ski) {
      SkiPhysics.initSkiState.call(this);
    }

    // Reset animation state
    PlayerAnimation.resetAnimState.call(this);
  }

  /**
   * Apply avalanche effect - slows player and adds wobble
   */
  applyAvalancheEffect(intensity) {
    // Slow down significantly when caught
    const dragFactor = 1 - (intensity * 0.15); // Up to 15% speed reduction per frame
    this.velocity.multiplyScalar(dragFactor);
    this.currentSpeed *= dragFactor;

    // Add chaotic wobble
    this.wobbleAmount = Math.max(this.wobbleAmount, intensity * 0.8);
    this.riskLevel = Math.max(this.riskLevel, intensity);

    // Mess with heading (tumbling in snow)
    this.headingVelocity += (Math.random() - 0.5) * intensity * 2;

    // If caught hard enough, trigger wipeout
    if (intensity > 0.7) {
      this.isWashingOut = true;
      this.washOutIntensity = intensity;
      this.washOutDirection = Math.sign(Math.random() - 0.5);
    }
  }

  getPosition() {
    const pos = this.body.translation();
    const result = new THREE.Vector3(pos.x, pos.y, pos.z);
    // Protect against NaN
    if (isNaN(result.x)) result.x = this.startPosition.x;
    if (isNaN(result.y)) result.y = this.startPosition.y;
    if (isNaN(result.z)) result.z = this.startPosition.z;
    return result;
  }

  getVelocity() {
    // Return clean velocity (no NaN values)
    const vel = this.velocity.clone();
    if (isNaN(vel.x)) vel.x = 0;
    if (isNaN(vel.y)) vel.y = 0;
    if (isNaN(vel.z)) vel.z = 0;
    return vel;
  }

  getHeading() {
    return this.heading;
  }

  getSpeedKmh() {
    return this.currentSpeed * 3.6;
  }
}
