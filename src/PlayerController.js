import * as THREE from 'three';

export class PlayerController {
  constructor(sceneManager, physicsWorld, terrain = null) {
    this.sceneManager = sceneManager;
    this.physicsWorld = physicsWorld;
    this.terrain = terrain; // Reference for snow conditions

    this.body = null;
    this.collider = null;
    this.mesh = null;
    this.boardMesh = null;

    // Board dimensions
    this.boardLength = 1.6;
    this.boardWidth = 0.3;

    // Input state
    this.input = { steer: 0, lean: 0, jump: false };

    // Core physics - tuned for realistic feel
    this.mass = 75; // kg - rider + board

    // Snowboard sidecut geometry (determines natural turn radius)
    // Real values: 6-8m (aggressive), 10-13m (all-mountain), 15-17m (GS)
    this.sidecutRadius = 7; // meters - aggressive for killer carves

    // Edge angle limits
    this.maxEdgeAngleLowSpeed = 1.2; // ~69 degrees at low speed - deep carves!
    this.maxEdgeAngleHighSpeed = 0.6; // ~34 degrees at high speed
    this.highSpeedThreshold = 30; // m/s where we reach max restriction

    // === CARVE RAIL SYSTEM ===
    // When locked into a deep carve, you're "on rails"
    this.carveRailThreshold = 0.5; // Edge angle to engage rail mode
    this.carveRailStrength = 0;    // Current rail lock strength (0-1)
    this.carveHoldTime = 0;        // How long we've held a carve

    // === ARCADE STABILITY ASSISTS (from racing game research) ===
    // Reduced - was fighting player input too much
    this.steeringAssistStrength = 0.3; // 0 = off, 1 = full auto-steer (was 0.7)
    this.maxAutoSteerAngle = 0.15; // ~9 degrees (was 0.25)

    // Angular velocity damping (prevents spin-outs)
    this.angularDamping = 0.85; // Multiplied each frame when no input
    this.maxHeadingChangeRate = 3.5; // rad/s - increased for responsiveness

    // Movement state
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.headingVelocity = 0; // Track angular velocity for smoothing
    this.edgeAngle = 0; // Current edge tilt (radians, + = toeside, - = heelside)
    this.targetEdgeAngle = 0; // Target edge for smooth transitions
    this.slipAngle = 0; // Angle between velocity and board heading
    this.isGrounded = false;
    this.wasGrounded = false; // Track landing
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.groundHeight = 0;
    this.airTime = 0; // Track time in air

    this.startPosition = { x: 0, y: 5, z: 0 };
    this.currentSpeed = 0;

    // Turn state for smooth carving
    this.turnMomentum = 0; // Accumulated turn momentum

    // === WEIGHT TRANSFER SYSTEM ===
    // Simulates how riders shift weight for control
    this.weightForward = 0; // -1 (tail) to +1 (nose)
    this.weightSide = 0; // -1 (heelside) to +1 (toeside)
    this.effectivePressure = 1; // 0-1, how much edge is engaged

    // === AIR ROTATION STATE ===
    this.pitch = 0; // Forward/back rotation
    this.roll = 0; // Barrel roll
    this.pitchVelocity = 0;
    this.rollVelocity = 0;
    this.spinVelocity = 0; // Accumulated spin momentum

    // Collider mesh for debug
    this.colliderMesh = null;

    // === EDGE TRANSITION SYSTEM ===
    this.previousEdgeSide = 0; // -1 heelside, 0 flat, +1 toeside
    this.edgeTransitionBoost = 0; // Acceleration burst on edge switch
    this.lastEdgeChangeTime = 0;

    // === COMPRESSION SYSTEM ===
    // Simulates rider absorbing terrain and pumping
    this.compression = 0; // 0 = standing, 1 = fully compressed
    this.compressionVelocity = 0;
    this.targetCompression = 0;

    // === OLLIE PRE-LOAD ===
    this.jumpCharging = false;
    this.jumpCharge = 0; // 0-1 charge level
    this.maxChargeTime = 0.4; // seconds to full charge

    // === CARVE MOMENTUM ===
    // Pumping through turns builds speed
    this.carveEnergy = 0;
    this.lastCarveDirection = 0;
    this.carveChainCount = 0;     // Consecutive carves counter
    this.carvePerfection = 0;     // How clean the current carve is (0-1)
    this.peakEdgeAngle = 0;       // Max edge angle in current carve

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
    // Tracks how close to losing control
    this.riskLevel = 0;           // 0 = safe, 1 = about to bail
    this.wobbleAmount = 0;        // Visual instability
    this.isRecovering = false;    // In recovery state after near-miss
    this.recoveryTime = 0;

    // === CARVE FAILURE STATES ===
    // Wash out: edge slips when speed doesn't match edge angle
    this.isWashingOut = false;
    this.washOutIntensity = 0;    // 0-1, how bad the wash out is
    this.washOutDirection = 0;    // Which way we're sliding (-1 heel, +1 toe)

    // Edge catch: catching wrong edge during transition
    this.isEdgeCaught = false;
    this.edgeCatchSeverity = 0;   // 0-1, how bad (affects stumble)
    this.edgeCatchTime = 0;       // Recovery timer

    // Carve commitment: once you start, you gotta finish
    this.carveCommitment = 0;     // 0-1, how committed to current carve
    this.carveDirection = 0;      // Direction of committed carve
    this.carveArcProgress = 0;    // How much of the arc completed (0-1)
    this.carveEntrySpeed = 0;     // Speed when carve started
    this.carveEntryEdge = 0;      // Edge angle when committed

    // Turn shape tracking
    this.turnShapeQuality = 1;    // 1 = perfect arc, 0 = jerky mess
    this.lastEdgeAngleDelta = 0;  // For detecting jerky input
  }

  init(startPosition) {
    this.startPosition = { ...startPosition };
    const RAPIER = this.physicsWorld.RAPIER;

    // Create a simple kinematic body - we control position directly
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

    this.createVisualMesh();
    this.createColliderMesh();
    this.createSprayParticles();
  }

  createVisualMesh() {
    // === BOARD ===
    const boardGeometry = new THREE.BoxGeometry(this.boardWidth, 0.03, this.boardLength);
    const boardMaterial = new THREE.MeshLambertMaterial({ color: 0x1a4d8c });
    this.boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);

    // Materials
    const pantsMaterial = new THREE.MeshLambertMaterial({ color: 0x222244 });
    const jacketMaterial = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
    const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xffcc88 });
    const bootMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const gloveMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });

    // === ARTICULATED RIDER ===
    // Stance: ~shoulder width apart, angled (duck stance typical: +15/-15 degrees)
    const bindingAngleFront = 0.26; // ~15 degrees outward
    const bindingAngleBack = -0.26; // ~15 degrees outward

    // Leg segment lengths (realistic proportions)
    this.thighLength = 0.22;
    this.shinLength = 0.22;
    this.bootHeight = 0.12;

    // === STANCE WIDTH ===
    // Binding positions along board (z-axis)
    // Typical stance: shoulder width, ~0.5m for this scale
    const stanceWidth = 0.22;  // Distance from center to each binding

    // === BOOTS (on bindings) - these stay fixed to board ===
    const bootGeometry = new THREE.BoxGeometry(0.1, 0.08, 0.16);

    this.frontBoot = new THREE.Mesh(bootGeometry, bootMaterial);
    this.frontBoot.position.set(0, 0.06, stanceWidth);
    this.frontBoot.rotation.y = bindingAngleFront;

    this.backBoot = new THREE.Mesh(bootGeometry, bootMaterial);
    this.backBoot.position.set(0, 0.06, -stanceWidth);
    this.backBoot.rotation.y = bindingAngleBack;

    // === LEGS WITH PROPER JOINT HIERARCHY ===
    // Each leg: ankle pivot → shin → knee pivot → thigh
    // This allows realistic IK-style bending

    const thighGeometry = new THREE.CapsuleGeometry(0.05, this.thighLength, 4, 8);
    const shinGeometry = new THREE.CapsuleGeometry(0.045, this.shinLength, 4, 8);
    const kneeGeometry = new THREE.SphereGeometry(0.04, 6, 6);

    // === FRONT LEG (hierarchical) ===
    // Ankle pivot (at top of boot)
    this.frontAnklePivot = new THREE.Group();
    this.frontAnklePivot.position.set(0, this.bootHeight, stanceWidth);

    // Shin connects to ankle
    this.frontShin = new THREE.Mesh(shinGeometry, pantsMaterial);
    this.frontShin.position.y = this.shinLength / 2 + 0.02;
    this.frontAnklePivot.add(this.frontShin);

    // Knee pivot (at top of shin)
    this.frontKneePivot = new THREE.Group();
    this.frontKneePivot.position.y = this.shinLength + 0.04;
    this.frontAnklePivot.add(this.frontKneePivot);

    // Knee cap visual
    this.frontKnee = new THREE.Mesh(kneeGeometry, pantsMaterial);
    this.frontKneePivot.add(this.frontKnee);

    // Thigh connects to knee
    this.frontThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
    this.frontThigh.position.y = this.thighLength / 2 + 0.02;
    this.frontKneePivot.add(this.frontThigh);

    // === BACK LEG (hierarchical) ===
    this.backAnklePivot = new THREE.Group();
    this.backAnklePivot.position.set(0, this.bootHeight, -stanceWidth);

    this.backShin = new THREE.Mesh(shinGeometry, pantsMaterial);
    this.backShin.position.y = this.shinLength / 2 + 0.02;
    this.backAnklePivot.add(this.backShin);

    this.backKneePivot = new THREE.Group();
    this.backKneePivot.position.y = this.shinLength + 0.04;
    this.backAnklePivot.add(this.backKneePivot);

    this.backKnee = new THREE.Mesh(kneeGeometry, pantsMaterial);
    this.backKneePivot.add(this.backKnee);

    this.backThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
    this.backThigh.position.y = this.thighLength / 2 + 0.02;
    this.backKneePivot.add(this.backThigh);

    // === HIPS (connects legs to torso, key for angulation) ===
    const hipsGeometry = new THREE.BoxGeometry(0.22, 0.1, 0.18);
    this.hipsMesh = new THREE.Mesh(hipsGeometry, pantsMaterial);
    this.hipsMesh.position.y = 0.40;

    // === TORSO (upper body for counter-rotation) ===
    const torsoGeometry = new THREE.CapsuleGeometry(0.09, 0.25, 4, 8);
    this.torsoMesh = new THREE.Mesh(torsoGeometry, jacketMaterial);
    this.torsoMesh.position.y = 0.62;

    // === SHOULDERS (for arm attachment) ===
    const shouldersGeometry = new THREE.BoxGeometry(0.28, 0.07, 0.1);
    this.shouldersMesh = new THREE.Mesh(shouldersGeometry, jacketMaterial);
    this.shouldersMesh.position.y = 0.78;

    // === ARMS (rebuilt for natural hanging/board-aligned pose) ===
    // Arms hang down by default, rotate forward/back along board axis
    const upperArmGeometry = new THREE.CapsuleGeometry(0.04, 0.18, 4, 8);
    const forearmGeometry = new THREE.CapsuleGeometry(0.035, 0.16, 4, 8);
    const handGeometry = new THREE.SphereGeometry(0.045, 6, 4);

    // Left arm - shoulder pivot point
    this.leftShoulderPivot = new THREE.Group();
    this.leftShoulderPivot.position.set(-0.14, 0.78, 0);

    // Upper arm hangs down from shoulder
    this.leftUpperArm = new THREE.Mesh(upperArmGeometry, jacketMaterial);
    this.leftUpperArm.position.y = -0.12; // Hangs down
    this.leftShoulderPivot.add(this.leftUpperArm);

    // Elbow pivot (at bottom of upper arm)
    this.leftElbowPivot = new THREE.Group();
    this.leftElbowPivot.position.y = -0.22;
    this.leftShoulderPivot.add(this.leftElbowPivot);

    // Forearm
    this.leftForearm = new THREE.Mesh(forearmGeometry, jacketMaterial);
    this.leftForearm.position.y = -0.1;
    this.leftElbowPivot.add(this.leftForearm);

    // Hand
    this.leftHand = new THREE.Mesh(handGeometry, gloveMaterial);
    this.leftHand.position.y = -0.2;
    this.leftElbowPivot.add(this.leftHand);

    // Right arm - shoulder pivot point
    this.rightShoulderPivot = new THREE.Group();
    this.rightShoulderPivot.position.set(0.14, 0.78, 0);

    // Upper arm hangs down
    this.rightUpperArm = new THREE.Mesh(upperArmGeometry, jacketMaterial);
    this.rightUpperArm.position.y = -0.12;
    this.rightShoulderPivot.add(this.rightUpperArm);

    // Elbow pivot
    this.rightElbowPivot = new THREE.Group();
    this.rightElbowPivot.position.y = -0.22;
    this.rightShoulderPivot.add(this.rightElbowPivot);

    // Forearm
    this.rightForearm = new THREE.Mesh(forearmGeometry, jacketMaterial);
    this.rightForearm.position.y = -0.1;
    this.rightElbowPivot.add(this.rightForearm);

    // Hand
    this.rightHand = new THREE.Mesh(handGeometry, gloveMaterial);
    this.rightHand.position.y = -0.2;
    this.rightElbowPivot.add(this.rightHand);

    // === HEAD (with neck for look direction) ===
    const neckGeometry = new THREE.CylinderGeometry(0.03, 0.035, 0.06, 8);
    this.neckMesh = new THREE.Mesh(neckGeometry, skinMaterial);
    this.neckMesh.position.y = 0.84;

    const headGeometry = new THREE.SphereGeometry(0.085, 10, 8);
    this.headMesh = new THREE.Mesh(headGeometry, skinMaterial);
    this.headMesh.position.y = 0.94;

    // Helmet/goggles for style
    const helmetGeometry = new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const helmetMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
    this.helmetMesh = new THREE.Mesh(helmetGeometry, helmetMaterial);
    this.helmetMesh.position.y = 0.94;

    const goggleGeometry = new THREE.BoxGeometry(0.15, 0.04, 0.06);
    const goggleMaterial = new THREE.MeshLambertMaterial({ color: 0x222288 });
    this.goggleMesh = new THREE.Mesh(goggleGeometry, goggleMaterial);
    this.goggleMesh.position.set(0, 0.95, 0.07);

    // === ASSEMBLE RIDER ===
    this.riderGroup = new THREE.Group();

    // Lower body group (follows board more closely)
    this.lowerBodyGroup = new THREE.Group();
    this.lowerBodyGroup.add(this.frontBoot);
    this.lowerBodyGroup.add(this.backBoot);
    this.lowerBodyGroup.add(this.frontAnklePivot);
    this.lowerBodyGroup.add(this.backAnklePivot);
    this.lowerBodyGroup.add(this.hipsMesh);

    // Upper body group (counter-rotates)
    this.upperBodyGroup = new THREE.Group();
    this.upperBodyGroup.add(this.torsoMesh);
    this.upperBodyGroup.add(this.shouldersMesh);
    this.upperBodyGroup.add(this.leftShoulderPivot);
    this.upperBodyGroup.add(this.rightShoulderPivot);
    this.upperBodyGroup.add(this.neckMesh);
    this.upperBodyGroup.add(this.headMesh);
    this.upperBodyGroup.add(this.helmetMesh);
    this.upperBodyGroup.add(this.goggleMesh);

    this.riderGroup.add(this.lowerBodyGroup);
    this.riderGroup.add(this.upperBodyGroup);

    // === ANIMATION STATE ===
    this.animState = {
      // Angulation (upper body tilt away from turn)
      angulation: 0,
      targetAngulation: 0,

      // Counter-rotation (shoulders vs hips)
      counterRotation: 0,
      targetCounterRotation: 0,

      // Anticipation (looking into next turn)
      headLook: 0,
      targetHeadLook: 0,

      // Arm positions (-1 to 1 for various poses)
      leftArmPose: 0,
      rightArmPose: 0,

      // === DETAILED LEG STATE ===
      // Knee bend angles (radians, 0 = straight, positive = bent back)
      frontKneeAngle: 0.65,       // Current front knee bend - always athletic
      backKneeAngle: 0.65,        // Current back knee bend
      targetFrontKnee: 0.65,      // Target front knee
      targetBackKnee: 0.65,       // Target back knee

      // Ankle flex (radians, positive = toes up/shin forward)
      frontAnkleAngle: 0.1,
      backAnkleAngle: 0.1,
      targetFrontAnkle: 0.1,
      targetBackAnkle: 0.1,

      // Hip height (computed from knee bend)
      hipHeight: 0.5,
      targetHipHeight: 0.5,

      // Hip shift (lateral movement over board)
      hipShift: 0,

      // Leg lateral spread (for edging)
      legSpread: 0,

      // Style flair (accumulated from good carves)
      styleFlair: 0,

      // G-force compression (reactive to carving forces)
      gForceCompression: 0
    };

    this.mesh = new THREE.Group();
    this.mesh.add(this.boardMesh);
    this.mesh.add(this.riderGroup);
    this.sceneManager.add(this.mesh);
  }

  createColliderMesh() {
    const geometry = new THREE.BoxGeometry(0.6, 0.2, 1.2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.5
    });
    this.colliderMesh = new THREE.Mesh(geometry, material);
    this.sceneManager.addColliderMesh(this.colliderMesh);
  }

  createSprayParticles() {
    // Create point geometry for snow spray
    const geometry = new THREE.BufferGeometry();

    // Initialize position buffer
    this.sprayPositions = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);

    // Initialize all particles as inactive (at origin with size 0)
    for (let i = 0; i < this.maxParticles; i++) {
      this.sprayPositions[i * 3] = 0;
      this.sprayPositions[i * 3 + 1] = -1000; // Below terrain
      this.sprayPositions[i * 3 + 2] = 0;
      sizes[i] = 0;

      this.sprayVelocities.push(new THREE.Vector3());
      this.sprayLifetimes.push(0);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.sprayPositions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Simple white material for snow
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true
    });

    this.sprayParticles = new THREE.Points(geometry, material);
    this.sceneManager.add(this.sprayParticles);

    this.nextParticleIndex = 0;
  }

  updateSprayParticles(dt, speed, isCarving, edgeAngle) {
    if (!this.sprayParticles) return;

    const pos = this.body.translation();
    const positions = this.sprayParticles.geometry.attributes.position.array;
    const sizes = this.sprayParticles.geometry.attributes.size.array;

    // Spawn new particles when grounded and moving
    if (this.isGrounded && speed > 3) {
      // More particles during carves and at higher speeds
      // KILLER CARVES = KILLER SPRAY
      const carveIntensity = isCarving ? (Math.abs(edgeAngle) * 2 + this.carveRailStrength * 3) : 0;
      const spawnRate = Math.min(speed * 0.4, 10) + carveIntensity * 4;
      const particlesToSpawn = Math.floor(spawnRate * dt * 60);

      for (let i = 0; i < particlesToSpawn; i++) {
        const idx = this.nextParticleIndex;
        this.nextParticleIndex = (this.nextParticleIndex + 1) % this.maxParticles;

        // Spawn at board edge (based on edge angle)
        const side = Math.sign(edgeAngle) || (Math.random() > 0.5 ? 1 : -1);
        const boardRight = new THREE.Vector3(
          Math.cos(this.heading),
          0,
          Math.sin(this.heading)
        );
        const boardBack = new THREE.Vector3(
          Math.sin(this.heading),
          0,
          -Math.cos(this.heading)
        );

        // Spawn position - at edge of board, slightly behind
        const spawnX = pos.x + boardRight.x * side * 0.2 + boardBack.x * 0.5 + (Math.random() - 0.5) * 0.3;
        const spawnY = pos.y + 0.05;
        const spawnZ = pos.z + boardRight.z * side * 0.2 + boardBack.z * 0.5 + (Math.random() - 0.5) * 0.3;

        positions[idx * 3] = spawnX;
        positions[idx * 3 + 1] = spawnY;
        positions[idx * 3 + 2] = spawnZ;

        // Velocity - spray outward and up
        // More dramatic spray during deep carves!
        const carveBoost = isCarving ? 1 + this.carveRailStrength * 1.5 : 1;
        const spraySpeed = (speed * 0.2 + Math.random() * 2.5) * carveBoost;
        this.sprayVelocities[idx].set(
          boardRight.x * side * spraySpeed + (Math.random() - 0.5) * 2,
          (1.5 + Math.random() * 2.5) * carveBoost,
          boardRight.z * side * spraySpeed + (Math.random() - 0.5) * 2
        );

        // Add some of the board's velocity
        this.sprayVelocities[idx].x -= this.velocity.x * 0.1;
        this.sprayVelocities[idx].z -= this.velocity.z * 0.1;

        this.sprayLifetimes[idx] = 0.4 + Math.random() * 0.4; // 0.4-0.8 seconds
        sizes[idx] = 0.1 + Math.random() * 0.15;
      }
    }

    // Update existing particles
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.sprayLifetimes[i] > 0) {
        this.sprayLifetimes[i] -= dt;

        // Apply velocity and gravity
        positions[i * 3] += this.sprayVelocities[i].x * dt;
        positions[i * 3 + 1] += this.sprayVelocities[i].y * dt;
        positions[i * 3 + 2] += this.sprayVelocities[i].z * dt;

        // Gravity
        this.sprayVelocities[i].y -= 12 * dt;

        // Air resistance
        this.sprayVelocities[i].multiplyScalar(0.98);

        // Fade out
        if (this.sprayLifetimes[i] < 0.2) {
          sizes[i] *= 0.95;
        }

        // Kill if too old
        if (this.sprayLifetimes[i] <= 0) {
          positions[i * 3 + 1] = -1000;
          sizes[i] = 0;
        }
      }
    }

    this.sprayParticles.geometry.attributes.position.needsUpdate = true;
    this.sprayParticles.geometry.attributes.size.needsUpdate = true;
  }

  update(deltaTime) {
    if (!this.body) return;

    const dt = Math.min(deltaTime, 0.033); // Cap at ~30fps minimum
    const position = this.body.translation();
    const pos = new THREE.Vector3(position.x, position.y, position.z);

    // Track previous grounded state
    this.wasGrounded = this.isGrounded;

    // Ground detection
    this.checkGround(pos);

    // Landing detection
    if (this.isGrounded && !this.wasGrounded) {
      this.onLanding(dt);
    }

    if (this.isGrounded) {
      this.airTime = 0;
      this.updateGroundedPhysics(dt, pos);

      // Very stable ground following - just stay on ground
      const targetY = this.groundHeight + 0.15;
      this.velocity.y = 0;

      this.body.setNextKinematicTranslation({
        x: pos.x + this.velocity.x * dt,
        y: targetY, // Snap directly to ground - no bounce
        z: pos.z + this.velocity.z * dt
      });
    } else {
      this.updateAirPhysics(dt, pos);

      // In air, use velocity
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
    this.updateMesh();

    // Update particle effects
    const isCarving = this.isGrounded && Math.abs(this.edgeAngle) > 0.3;
    this.updateSprayParticles(dt, this.currentSpeed, isCarving, this.edgeAngle);

    // Reset if fallen off terrain
    if (pos.y < -100) {
      this.reset();
    }
  }

  onLanding(dt) {
    const impactSpeed = Math.abs(this.velocity.y);
    const speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

    // === CHECK LANDING ALIGNMENT ===
    // Good landing: board roughly level and aligned with velocity
    const pitchMisalign = Math.abs(this.pitch);
    const rollMisalign = Math.abs(this.roll);

    // Calculate how aligned board heading is with velocity direction
    let headingMisalign = 0;
    if (speed2D > 3) {
      const velHeading = Math.atan2(-this.velocity.x, this.velocity.z);
      headingMisalign = Math.abs(this.normalizeAngle(velHeading - this.heading));
    }

    // === LANDING QUALITY (0 = crash, 1 = perfect) ===
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

    // === IMPACT EFFECTS ===
    if (impactSpeed > 12) {
      // Hard landing - quality affects speed loss
      const baseSpeedLoss = (impactSpeed - 12) * 0.025;
      const qualityMod = 2 - landingQuality; // Bad landing = more speed loss
      const speedLoss = baseSpeedLoss * qualityMod;

      this.velocity.x *= (1 - speedLoss);
      this.velocity.z *= (1 - speedLoss);
    }

    // === CLEAN LANDING BONUS ===
    if (landingQuality > 0.8 && speed2D > 8 && this.airTime > 0.5) {
      // Style points! Clean landing after good air time
      const forward = new THREE.Vector3(
        -Math.sin(this.heading),
        0,
        Math.cos(this.heading)
      );

      // Small speed boost for stomped landing
      const stompBonus = 1.0 + this.airTime * 0.3;
      this.velocity.x += forward.x * stompBonus;
      this.velocity.z += forward.z * stompBonus;
    }

    // === ALIGNMENT CORRECTION ===
    // Board tries to align with velocity on landing (natural behavior)
    if (speed2D > 5 && headingMisalign > 0.2) {
      const velHeading = Math.atan2(-this.velocity.x, this.velocity.z);
      const correction = this.normalizeAngle(velHeading - this.heading);

      // Gradually correct, more at higher speeds
      const correctionRate = Math.min(speed2D * 0.015, 0.4);
      this.heading += correction * correctionRate;
    }

    // === BAD LANDING WOBBLE ===
    if (landingQuality < 0.6) {
      // Add some instability from bad landing
      this.headingVelocity += (Math.random() - 0.5) * (1 - landingQuality) * 2;
    }

    // Reset rotation state
    this.velocity.y = 0;
    this.pitch = 0;
    this.roll = 0;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;

    // === LANDING COMPRESSION ===
    // Absorb impact with compression based on fall speed and quality
    const landingCompression = Math.min(impactSpeed * 0.08, 0.7);
    this.compression = landingCompression;
    this.compressionVelocity = impactSpeed * 0.1; // Bounce back velocity

    // Perfect landing gets a quick recovery (feels snappy)
    if (landingQuality > 0.8) {
      this.compressionVelocity = impactSpeed * 0.15;
    }
  }

  updateGroundedPhysics(dt, pos) {
    const g = 9.81;

    // === CURRENT SPEED ===
    const speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

    // === BOARD DIRECTION VECTORS ===
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

    // === WEIGHT TRANSFER (simplified) ===
    this.weightForward = THREE.MathUtils.lerp(this.weightForward, this.input.lean * 0.8, 8 * dt);

    // === EDGE ANGLE - direct and responsive ===
    const maxEdge = 1.15; // ~66 degrees max - deep carves!
    this.targetEdgeAngle = this.input.steer * maxEdge;

    // Fast edge response - faster at low speeds, slightly slower when railing
    const baseEdgeLerpSpeed = 15;
    const railSlowdown = this.carveRailStrength * 0.3; // Rail mode stabilizes edge
    const edgeLerpSpeed = baseEdgeLerpSpeed * (1 - railSlowdown);
    this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, this.targetEdgeAngle, edgeLerpSpeed * dt);

    const absEdge = Math.abs(this.edgeAngle);
    const edgeSign = Math.sign(this.edgeAngle);

    // Track peak edge angle for this carve
    if (absEdge > this.peakEdgeAngle) {
      this.peakEdgeAngle = absEdge;
    }

    // === EDGE TRANSITION DETECTION ===
    // Detect when we switch from one edge to another (the "pop")
    const currentEdgeSide = absEdge > 0.15 ? edgeSign : 0;
    const edgeSwitched = currentEdgeSide !== 0 &&
                         this.previousEdgeSide !== 0 &&
                         currentEdgeSide !== this.previousEdgeSide;

    // === EDGE CATCH DETECTION ===
    // Catching an edge = bad news. Happens when:
    // 1. Transitioning too fast at high speed
    // 2. Heading misaligned with velocity (sideways to motion)
    // 3. Switching edges while still committed to previous carve
    if (edgeSwitched && speed2D > 6 && !this.isEdgeCaught && !this.isWashingOut) {
      // Calculate how "violent" the transition was
      const transitionViolence = Math.abs(this.edgeAngle - this.previousEdgeSide * maxEdge);

      // Check heading vs velocity alignment
      const velHeading = Math.atan2(-this.velocity.x, this.velocity.z);
      const headingMismatch = Math.abs(this.normalizeAngle(velHeading - this.heading));

      // Risk factors for edge catch - MORE AGGRESSIVE
      const speedFactor = Math.max(0, (speed2D - 8) / 15); // Kicks in earlier
      const violenceFactor = transitionViolence > 0.8 ? (transitionViolence - 0.8) * 1.5 : 0;
      const alignmentFactor = headingMismatch > 0.2 ? (headingMismatch - 0.2) * 3 : 0;
      const commitmentFactor = this.carveCommitment > 0.3 ? this.carveCommitment * 0.8 : 0;

      // Combined risk - higher base values
      const catchRisk = (speedFactor * 0.4 + violenceFactor * 0.4 +
                         alignmentFactor * 0.4 + commitmentFactor) * (1 + speedFactor * 0.5);

      // Deterministic with small random element - happens more reliably
      if (catchRisk > 0.25 && Math.random() < catchRisk * 0.8) {
        // EDGE CATCH! Bad times.
        this.isEdgeCaught = true;
        this.edgeCatchSeverity = Math.min(catchRisk * 1.5, 1.0);
        this.edgeCatchTime = 0.4 + this.edgeCatchSeverity * 0.5; // 0.4-0.9s recovery

        // Immediate consequences
        this.carveChainCount = 0; // Chain broken
        this.carveCommitment = 0;
      }
    }

    // === EDGE CATCH CONSEQUENCES ===
    if (this.isEdgeCaught) {
      // Stumble! Board catches, momentum kills you
      const stumbleForce = this.edgeCatchSeverity * 20;

      // Thrown forward HARD and sideways
      this.velocity.x += forward.x * stumbleForce * dt * -1.0; // Heavy braking
      this.velocity.z += forward.z * stumbleForce * dt * -1.0;

      // Sideways stumble
      const stumbleDir = this.edgeAngle > 0 ? 1 : -1;
      this.velocity.x += right.x * stumbleDir * stumbleForce * dt * 0.5;
      this.velocity.z += right.z * stumbleDir * stumbleForce * dt * 0.5;

      // MASSIVE speed loss - this is a crash
      const catchSpeedLoss = 1 - (this.edgeCatchSeverity * 0.4 * dt * 60);
      this.velocity.x *= catchSpeedLoss;
      this.velocity.z *= catchSpeedLoss;

      // Heading gets yanked violently
      this.headingVelocity += (Math.random() - 0.5) * this.edgeCatchSeverity * 8;

      // Compression spikes MAX (impact absorption)
      this.targetCompression = 0.8;

      // Edge forced flat instantly
      this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, 0, 20 * dt);

      // Recovery timer
      this.edgeCatchTime -= dt;
      if (this.edgeCatchTime <= 0) {
        this.isEdgeCaught = false;
        this.edgeCatchSeverity = 0;
        this.isRecovering = true;
        this.recoveryTime = 0.7; // Long recovery
      }
    }

    // === CARVE COMMITMENT SYSTEM ===
    // Once you commit to a carve, you need to follow through
    if (absEdge > 0.4 && speed2D > 10 && !this.isWashingOut && !this.isEdgeCaught) {
      // Building commitment
      if (this.carveCommitment < 0.3) {
        // Just starting - record entry conditions
        this.carveEntrySpeed = speed2D;
        this.carveEntryEdge = absEdge;
        this.carveDirection = edgeSign;
      }

      // Commitment builds the deeper you go
      const commitRate = absEdge * 2;
      this.carveCommitment = Math.min(this.carveCommitment + commitRate * dt, 1.0);

      // Track arc progress (simplified - based on heading change)
      this.carveArcProgress += Math.abs(this.headingVelocity) * dt * 0.3;
    } else if (!this.isWashingOut && !this.isEdgeCaught) {
      // Exiting carve - check if we completed it properly
      if (this.carveCommitment > 0.5 && this.carveArcProgress < 0.3) {
        // Bailed on a committed carve! Penalty.
        const bailPenalty = this.carveCommitment * 0.5;
        this.carveChainCount = Math.max(0, this.carveChainCount - 2);

        // Small speed penalty for bailing
        this.velocity.x *= (1 - bailPenalty * 0.1);
        this.velocity.z *= (1 - bailPenalty * 0.1);

        // Wobble from unclean exit
        this.headingVelocity += (Math.random() - 0.5) * bailPenalty * 1.5;
      }

      // Decay commitment when not carving
      this.carveCommitment *= Math.pow(0.1, dt * 2);
      this.carveArcProgress *= 0.9;
    }

    // Good transition (not caught, completed previous carve)
    if (edgeSwitched && speed2D > 5 && !this.isEdgeCaught) {
      // Edge-to-edge transition - the satisfying "pop"!
      // Faster transitions and higher speeds = more pop
      const transitionSpeed = Math.abs(this.edgeAngle - this.previousEdgeSide * maxEdge);
      const speedBonus = Math.min(speed2D / 20, 1.5);

      // === CARVE CHAIN BONUS ===
      // Consecutive clean carves build multiplier
      const cleanCarve = this.peakEdgeAngle > 0.5 && this.carveHoldTime > 0.3;
      const completedArc = this.carveArcProgress > 0.25;

      if (cleanCarve && completedArc) {
        this.carveChainCount = Math.min(this.carveChainCount + 1, 10);
      } else if (!cleanCarve) {
        this.carveChainCount = Math.max(0, this.carveChainCount - 1);
      }

      // Chain multiplier: 1.0 at 0, up to 2.0 at 10 chains
      const chainMultiplier = 1.0 + this.carveChainCount * 0.1;

      // Calculate the boost (reduced if didn't complete arc)
      const arcBonus = completedArc ? 1.0 : 0.5;
      this.edgeTransitionBoost = transitionSpeed * speedBonus * 3.5 * chainMultiplier * arcBonus;
      this.lastEdgeChangeTime = 0;

      // Carve energy from good edge changes - more from deep carves
      const carveQuality = Math.min(1, this.peakEdgeAngle / 0.8) * arcBonus;
      this.carveEnergy = Math.min(this.carveEnergy + 0.3 * carveQuality * chainMultiplier, 1.5);

      // Reset carve tracking for next carve
      this.peakEdgeAngle = 0;
      this.carveHoldTime = 0;
      this.carveRailStrength = 0;
      this.carveCommitment = 0;
      this.carveArcProgress = 0;
    }

    this.previousEdgeSide = currentEdgeSide;
    this.lastEdgeChangeTime += dt;

    // === CARVE RAIL SYSTEM ===
    // Deep carves build "rail" strength - you lock into the turn
    if (absEdge > this.carveRailThreshold && speed2D > 8) {
      this.carveHoldTime += dt;

      // Rail strength builds over time in deep carve
      const targetRail = Math.min(1, (absEdge - this.carveRailThreshold) * 2);
      this.carveRailStrength = THREE.MathUtils.lerp(this.carveRailStrength, targetRail, 3 * dt);

      // Track carve perfection (how steady the edge is held)
      const edgeStability = 1 - Math.abs(this.edgeAngle - this.targetEdgeAngle) * 2;
      this.carvePerfection = THREE.MathUtils.lerp(this.carvePerfection, edgeStability, 2 * dt);
    } else {
      // Not in deep carve - decay rail
      this.carveRailStrength *= Math.pow(0.1, dt);
      this.carvePerfection *= 0.95;
    }

    // === APPLY EDGE TRANSITION BOOST ===
    if (this.edgeTransitionBoost > 0.1) {
      // Burst of acceleration in forward direction
      this.velocity.x += forward.x * this.edgeTransitionBoost * dt * 8;
      this.velocity.z += forward.z * this.edgeTransitionBoost * dt * 8;
      this.edgeTransitionBoost *= 0.85; // Decay quickly
    }

    // === COMPRESSION SYSTEM ===
    // Compress during hard carves, extend on transitions
    // G-force based compression - deeper/faster carves = more compression
    const carveGForce = speed2D > 5 && absEdge > 0.3
      ? (speed2D * absEdge) / 15
      : 0;

    if (absEdge > 0.4) {
      // Carving - compress into the turn based on G-forces
      const gCompression = Math.min(carveGForce * 0.3, 0.4);
      this.targetCompression = 0.25 + absEdge * 0.35 + gCompression;
    } else if (edgeSwitched) {
      // Edge switch - momentary extension (the "pop" feeling)
      // Bigger pop from deeper previous carve
      this.targetCompression = -0.25 - this.carveEnergy * 0.15;
    } else {
      // Neutral - slight crouch for stability
      this.targetCompression = 0.1;
    }

    // Jump charging increases compression
    if (this.jumpCharging) {
      this.targetCompression = 0.4 + this.jumpCharge * 0.4;
    }

    // Smooth compression with spring dynamics
    const compressionSpring = 20;
    const compressionDamp = 8;
    const compressionForce = (this.targetCompression - this.compression) * compressionSpring;
    this.compressionVelocity += compressionForce * dt;
    this.compressionVelocity *= (1 - compressionDamp * dt);
    this.compression += this.compressionVelocity * dt;
    this.compression = THREE.MathUtils.clamp(this.compression, -0.3, 0.8);

    // === EFFECTIVE PRESSURE (simplified) ===
    this.effectivePressure = 0.8 + absEdge * 0.2;

    // === CARVED TURN PHYSICS ===
    if (speed2D > 0.5) {
      let targetAngularVel = 0;

      if (absEdge > 0.05) {
        // Turn radius from sidecut geometry
        const sinEdge = Math.sin(absEdge);
        const turnRadius = this.sidecutRadius / Math.max(sinEdge, 0.1);

        // Angular velocity: v/r with boost for responsiveness
        const baseAngularVel = (speed2D / turnRadius) * 1.3;

        targetAngularVel = baseAngularVel * edgeSign;
      }

      // Responsive angular velocity
      this.headingVelocity = THREE.MathUtils.lerp(this.headingVelocity, targetAngularVel, 10 * dt);

      // Clamp max turn rate
      this.headingVelocity = THREE.MathUtils.clamp(this.headingVelocity, -3.5, 3.5);

      this.heading += this.headingVelocity * dt;
    } else {
      // Slow speed - direct pivot
      this.headingVelocity *= 0.8;
      this.heading += this.input.steer * 3.0 * dt;
    }

    // === GRAVITY / SLOPE ===
    const slopeDir = this.getSlopeDirection();
    const slopeSteepness = 1 - this.groundNormal.y;
    const gravityAccel = g * slopeSteepness * 5.5;

    // === VELOCITY COMPONENTS ===
    const forwardSpeed = this.velocity.dot(forward);
    const lateralSpeed = this.velocity.dot(right);

    // Track slip angle
    if (speed2D > 1) {
      const velDir = Math.atan2(-this.velocity.x, this.velocity.z);
      this.slipAngle = this.normalizeAngle(velDir - this.heading);
    }

    // === GET SNOW CONDITIONS ===
    if (this.terrain) {
      this.currentSnowCondition = this.terrain.getSnowCondition(pos.x, pos.z);
    }

    // === GRIP SYSTEM (enhanced for carving + snow conditions) ===
    const baseGrip = 0.7;
    const edgeGrip = absEdge * 0.3; // More grip from deeper edges

    // Rail mode adds significant extra grip - you're locked in!
    const railGrip = this.carveRailStrength * 0.15;

    // === SPEED-EDGE COUPLING ===
    // Deep edges require speed to sustain (centrifugal force physics)
    // High speeds require edge angle to hold grip
    let speedEdgeGrip = 1.0;

    // How much speed is needed per radian of edge angle
    // AGGRESSIVE: need 15 m/s to hold 1 rad (~57°) of edge
    const minSpeedPerRadian = 15;  // Below this ratio, you wash out
    const maxSpeedPerRadian = 25;  // Above this ratio, you slide out

    // What edge angle is supportable at current speed?
    const supportableEdge = speed2D / minSpeedPerRadian;
    // What edge angle is required at current speed?
    const requiredEdge = speed2D / maxSpeedPerRadian;

    // === WASH OUT: Too much edge for speed ===
    if (absEdge > supportableEdge && speed2D < 20) {
      const overEdge = absEdge - supportableEdge;
      // Aggressive penalty curve
      const washOutPenalty = Math.min(overEdge * 2.0, 0.6);
      speedEdgeGrip -= washOutPenalty;

      // TRIGGER WASH OUT STATE - lower threshold, happens more easily
      if (overEdge > 0.15 && !this.isWashingOut && !this.isEdgeCaught) {
        this.isWashingOut = true;
        this.washOutIntensity = Math.min(overEdge * 2.5, 1.0);
        this.washOutDirection = edgeSign;
      }
    }

    // === SLIDE OUT: Not enough edge for speed ===
    if (absEdge < requiredEdge && speed2D > 10) {
      const underEdge = requiredEdge - absEdge;
      // More aggressive penalty
      const slideOutPenalty = Math.min(underEdge * 1.5, 0.5);
      speedEdgeGrip -= slideOutPenalty;

      // TRIGGER SLIDE OUT STATE - lower threshold
      if (underEdge > 0.15 && speed2D > 12 && !this.isWashingOut && !this.isEdgeCaught) {
        this.isWashingOut = true;
        this.washOutIntensity = Math.min(underEdge * 2.0, 0.9);
        this.washOutDirection = edgeSign || (Math.random() > 0.5 ? 1 : -1);
      }
    }

    speedEdgeGrip = Math.max(speedEdgeGrip, 0.4); // Floor to prevent complete loss

    // === WASH OUT CONSEQUENCES ===
    if (this.isWashingOut) {
      // Board slides sideways HARD, losing control
      const slideForce = this.washOutIntensity * 15;
      this.velocity.x += right.x * this.washOutDirection * slideForce * dt;
      this.velocity.z += right.z * this.washOutDirection * slideForce * dt;

      // Heading gets yanked toward slide direction
      this.headingVelocity += this.washOutDirection * this.washOutIntensity * 4 * dt;

      // Speed bleeds off RAPIDLY - major consequence
      const speedLoss = 1 - (this.washOutIntensity * 0.25 * dt * 60);
      this.velocity.x *= speedLoss;
      this.velocity.z *= speedLoss;

      // Edge angle forced toward flat (can't hold edge during wash out)
      this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, 0, 12 * dt);

      // Compression spikes hard (absorbing the chaos)
      this.targetCompression = 0.6 + this.washOutIntensity * 0.3;

      // Recovery: intensity decays slower
      this.washOutIntensity -= dt * 1.8;
      if (this.washOutIntensity <= 0.1) {
        this.isWashingOut = false;
        this.washOutIntensity = 0;
        // Enter recovery state - longer
        this.isRecovering = true;
        this.recoveryTime = 0.6;
        // Break carve chain completely
        this.carveChainCount = 0;
      }

      // Kill grip during wash out
      speedEdgeGrip = Math.min(speedEdgeGrip, 0.25);
    }

    // Calculate base grip before snow condition
    let calculatedGrip = (baseGrip + edgeGrip + railGrip) * speedEdgeGrip;

    // Apply snow condition modifier
    // Ice reduces grip, powder increases it
    const snowGripMod = this.currentSnowCondition.gripMultiplier;
    calculatedGrip *= snowGripMod;

    let finalGrip = THREE.MathUtils.clamp(calculatedGrip, 0.3, 0.98);

    // === RISK CALCULATION ===
    // Risk increases when: high speed + deep edge + low grip surface
    const speedRisk = Math.max(0, (speed2D - 20) / 30);  // Risk ramps up after 20 m/s
    const edgeRisk = Math.pow(absEdge / 1.0, 2);         // Deeper edges = more risk
    const gripDeficit = Math.max(0, 0.6 - finalGrip);   // Risk if grip is low

    // Speed-edge mismatch risk (NEW)
    // Adds risk when edge doesn't match speed
    const speedEdgeMismatchRisk = (1 - speedEdgeGrip) * 0.6;

    // Ice massively increases risk
    const conditionRisk = this.currentSnowCondition.type === 'ice' ?
      this.currentSnowCondition.intensity * 0.4 : 0;

    // Combined risk
    let targetRisk = (speedRisk * 0.3 + edgeRisk * 0.2 + gripDeficit * 0.2 +
                      speedEdgeMismatchRisk + conditionRisk) *
      (1 + speedRisk);  // Speed multiplies overall risk

    // Recovery reduces risk buildup
    if (this.isRecovering) {
      targetRisk *= 0.3;
    }

    // Smooth risk changes
    this.riskLevel = THREE.MathUtils.lerp(this.riskLevel, targetRisk, 5 * dt);
    this.riskLevel = THREE.MathUtils.clamp(this.riskLevel, 0, 1);

    // === HIGH RISK EFFECTS ===
    if (this.riskLevel > 0.5) {
      // Add wobble that increases with risk
      const wobbleIntensity = (this.riskLevel - 0.5) * 2;
      this.wobbleAmount = wobbleIntensity * (Math.random() - 0.5) * 0.15;

      // Wobble affects heading slightly
      this.headingVelocity += this.wobbleAmount * speed2D * 0.1;

      // At extreme risk, grip fails more
      if (this.riskLevel > 0.8) {
        finalGrip *= 0.8;  // Grip degrades when pushing too hard
      }
    } else {
      this.wobbleAmount *= 0.9;  // Decay wobble
    }

    // === RECOVERY STATE ===
    if (this.riskLevel > 0.9 && !this.isRecovering) {
      // Near-bail - enter recovery
      this.isRecovering = true;
      this.recoveryTime = 0.5;  // 0.5s recovery period
    }

    if (this.isRecovering) {
      this.recoveryTime -= dt;
      if (this.recoveryTime <= 0) {
        this.isRecovering = false;
      }
    }

    // Apply grip
    const newLateralSpeed = lateralSpeed * (1 - finalGrip);

    // === CARVE ACCELERATION ===
    // Deep, clean carves actually generate speed (pumping physics)
    if (this.carveRailStrength > 0.3 && this.carvePerfection > 0.5) {
      // The faster you're going and deeper the carve, the more G-force
      const gForce = (speed2D * speed2D) / (this.sidecutRadius / Math.max(Math.sin(absEdge), 0.1));
      const normalizedG = Math.min(gForce / 100, 1); // Cap the effect

      // Carve acceleration - like pumping in the turn
      const carveAccel = normalizedG * this.carveRailStrength * this.carvePerfection * 2.0;
      this.velocity.x += forward.x * carveAccel * dt;
      this.velocity.z += forward.z * carveAccel * dt;
    }

    // === RECONSTRUCT VELOCITY ===
    this.velocity.x = forward.x * forwardSpeed + right.x * newLateralSpeed;
    this.velocity.z = forward.z * forwardSpeed + right.z * newLateralSpeed;

    // === GRAVITY ===
    this.velocity.x += slopeDir.x * gravityAccel * dt;
    this.velocity.z += slopeDir.z * gravityAccel * dt;

    // === DRAG (affected by snow conditions) ===
    const baseDrag = 0.999;
    const carveDrag = absEdge * 0.001;
    const slideDrag = Math.abs(this.slipAngle) * 0.003;

    // Snow condition drag modifier
    // Ice = less drag (faster), Powder = more drag (slower)
    const snowDragMod = (this.currentSnowCondition.dragMultiplier - 1) * 0.003;

    const drag = baseDrag - carveDrag - slideDrag - snowDragMod;
    this.velocity.x *= drag;
    this.velocity.z *= drag;

    // === WEIGHT-BASED THRUST/BRAKE ===
    if (this.input.lean > 0.1) {
      // Tuck - reduces drag, compresses for speed
      const tuck = this.input.lean;
      const thrust = tuck * 2.0;
      this.velocity.x += forward.x * thrust * dt;
      this.velocity.z += forward.z * thrust * dt;
    }

    if (this.input.lean < -0.1) {
      // Stand up / brake - scrubbing snow to slow down
      const brakeStrength = Math.abs(this.input.lean);
      // Much stronger braking - like scrubbing/skidding
      const brakeFactor = 1 - brakeStrength * dt * 12;
      this.velocity.x *= brakeFactor;
      this.velocity.z *= brakeFactor;

      // Also add extra drag when leaning back hard (sitting back = big speed scrub)
      if (brakeStrength > 0.5) {
        const extraDrag = (brakeStrength - 0.5) * dt * 8;
        this.velocity.x *= (1 - extraDrag);
        this.velocity.z *= (1 - extraDrag);
      }
    }

    // === SPEED LIMITS ===
    const maxSpeed = 55;
    if (speed2D > maxSpeed) {
      const scale = maxSpeed / speed2D;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // === OLLIE PRE-LOAD SYSTEM ===
    // Holding jump charges the ollie, releasing pops
    if (this.input.jump && !this.jumpCharging) {
      // Start charging
      this.jumpCharging = true;
      this.jumpCharge = 0;
    } else if (this.input.jump && this.jumpCharging) {
      // Continue charging
      this.jumpCharge = Math.min(this.jumpCharge + dt / this.maxChargeTime, 1.0);
    } else if (!this.input.jump && this.jumpCharging) {
      // Released - pop!
      this.initiateJump(speed2D, forward);
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

  initiateJump(speed2D, forward) {
    // === CHARGE-BASED OLLIE ===
    // Charge level dramatically affects pop power
    const chargeBonus = this.jumpCharge * 4.0; // 0-4 extra meters of pop

    // Base jump power
    let jumpPower = 5.0 + chargeBonus;

    // Weight position affects style
    if (this.weightForward < -0.2) {
      // Tail pop - proper ollie (best pop)
      jumpPower += 1.5 + Math.abs(this.weightForward) * 1.5;
    } else if (this.weightForward > 0.3) {
      // Nose pop - nollie (slightly less pop)
      jumpPower += 0.5;
    }

    // Speed bonus (going fast = more pop from momentum)
    jumpPower += Math.min(speed2D * 0.05, 2.0);

    // Carve energy bonus (pumping through turns builds pop)
    jumpPower += this.carveEnergy * 2.0;

    // === EXTENSION SNAP ===
    // The "pop" - sudden extension from compression
    const extensionSnap = this.compression * 2.0; // More compressed = more snap
    jumpPower += extensionSnap;

    this.velocity.y = jumpPower;

    // Forward momentum from tuck (pump into jump)
    if (this.input.lean > 0.2) {
      const tuckBoost = 1.5 + this.jumpCharge * 1.0;
      this.velocity.x += forward.x * tuckBoost;
      this.velocity.z += forward.z * tuckBoost;
    }

    // Carry spin momentum into air (more from charged jumps)
    this.spinVelocity = this.headingVelocity * (0.5 + this.jumpCharge * 0.3);

    // Reset compression for the extension visual
    this.compression = -0.3;
    this.compressionVelocity = -3; // Snap up

    // Clear carve energy on jump (spent it)
    this.carveEnergy = 0;

    this.input.jump = false;
  }

  // Helper to normalize angle to [-PI, PI]
  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  updateAirPhysics(dt, pos) {
    // Track air time
    this.airTime += dt;

    // Gravity - slightly floaty for game feel, increases over time
    const baseGravity = 16;
    const gravityRamp = Math.min(this.airTime * 2, 6); // Ramps up over time
    const gravity = baseGravity + gravityRamp;
    this.velocity.y -= gravity * dt;

    // === SPIN CONTROL (Y-axis rotation) ===
    // Carry momentum from ground, plus air input
    const baseSpin = this.spinVelocity;

    // Tuck increases spin control (like pulling arms in)
    const tuckFactor = this.input.lean > 0.2 ? 1 + this.input.lean * 0.8 : 1;

    // Input adds to spin
    const spinInput = this.input.steer * 3.5 * tuckFactor;

    // Combine momentum and input
    const targetSpin = baseSpin + spinInput;
    this.headingVelocity = THREE.MathUtils.lerp(this.headingVelocity, targetSpin, 4 * dt);

    // Spin dampens slowly in air
    this.spinVelocity *= 0.995;

    this.heading += this.headingVelocity * dt;

    // === FLIP CONTROL (pitch - front/back flips) ===
    if (Math.abs(this.input.lean) > 0.2) {
      // Forward lean = front flip, back lean = back flip
      const flipInput = -this.input.lean * 4.0; // Negative because forward lean = nose down
      this.pitchVelocity = THREE.MathUtils.lerp(this.pitchVelocity, flipInput, 3 * dt);
    } else {
      // No input - pitch stabilizes slowly
      this.pitchVelocity *= 0.97;
    }
    this.pitch += this.pitchVelocity * dt;

    // === ROLL/GRAB STYLE ===
    // Edge input creates roll in air (style grabs)
    if (Math.abs(this.input.steer) > 0.3) {
      const rollTarget = this.input.steer * 0.4;
      this.roll = THREE.MathUtils.lerp(this.roll, rollTarget, 5 * dt);
    } else {
      this.roll *= 0.95;
    }

    // Edge angle follows roll for visual
    this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, this.roll * 0.5, 4 * dt);

    // === AIR DRAG ===
    // Tuck reduces drag
    const dragFactor = this.input.lean > 0.3 ? 0.999 : 0.997;
    this.velocity.x *= dragFactor;
    this.velocity.z *= dragFactor;

    // === TERMINAL VELOCITY ===
    if (this.velocity.y < -40) {
      this.velocity.y = -40;
    }

    // === AIR STEERING (subtle) ===
    // Can slightly adjust trajectory in air
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

  checkGround(pos) {
    const RAPIER = this.physicsWorld.RAPIER;

    // Cast ray downward from board center
    const ray = new RAPIER.Ray(
      { x: pos.x, y: pos.y + 1, z: pos.z },
      { x: 0, y: -1, z: 0 }
    );

    const hit = this.physicsWorld.world.castRay(ray, 3, true, undefined, undefined, this.collider);

    if (hit && hit.timeOfImpact < 1.5) {
      this.isGrounded = true;
      this.groundHeight = pos.y + 1 - hit.timeOfImpact;

      // Get ground normal using 3-point sampling for stability
      this.sampleGroundNormal(pos, RAPIER);
    } else {
      this.isGrounded = false;
    }
  }

  sampleGroundNormal(pos, RAPIER) {
    // Sample points along board direction for terrain following
    const sampleDist = 0.8;

    // Board-relative offsets
    const cosH = Math.cos(this.heading);
    const sinH = Math.sin(this.heading);

    // Transform local offsets to world space based on heading
    const localOffsets = [
      { x: 0, z: sampleDist },   // front of board
      { x: 0, z: -sampleDist },  // back of board
      { x: sampleDist, z: 0 }    // side
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

      // Very smooth normal following - prevents board rotation jitter
      // Use very slow lerp to avoid picking up mesh interpolation noise
      this.groundNormal.lerp(normal, 0.02);
      this.groundNormal.normalize();
    }
  }

  getSlopeDirection() {
    // Project down vector onto slope plane
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

  updateMesh() {
    const pos = this.body.translation();
    this.mesh.position.set(pos.x, pos.y, pos.z);

    if (!this.animState) return;

    const dt = 0.016; // Approximate frame time for animation smoothing
    const speed2D = this.currentSpeed;
    const absEdge = Math.abs(this.edgeAngle);
    const edgeSign = Math.sign(this.edgeAngle);

    // === UPDATE ANIMATION STATE ===
    this.updateAnimationState(dt, speed2D, absEdge, edgeSign);

    // === APPLY RIDER ANIMATION ===
    this.applyRiderAnimation(dt);

    // === BOARD ORIENTATION ===
    if (this.isGrounded) {
      // Step 1: Heading rotation
      const headingQuat = new THREE.Quaternion();
      headingQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.heading);

      // Step 2: Slope alignment
      const worldUp = new THREE.Vector3(0, 1, 0);
      const slopeQuat = new THREE.Quaternion();
      slopeQuat.setFromUnitVectors(worldUp, this.groundNormal);

      this.mesh.quaternion.copy(headingQuat);
      this.mesh.quaternion.premultiply(slopeQuat);

      // Step 3: Edge angle (carving tilt)
      if (absEdge > 0.001) {
        const boardForward = new THREE.Vector3(0, 0, 1);
        boardForward.applyQuaternion(this.mesh.quaternion);

        const edgeQuat = new THREE.Quaternion();
        edgeQuat.setFromAxisAngle(boardForward, this.edgeAngle);
        this.mesh.quaternion.premultiply(edgeQuat);
      }

      // Step 4: Weight shift
      if (Math.abs(this.weightForward) > 0.1) {
        const boardRight = new THREE.Vector3(1, 0, 0);
        boardRight.applyQuaternion(this.mesh.quaternion);

        const pressQuat = new THREE.Quaternion();
        pressQuat.setFromAxisAngle(boardRight, this.weightForward * 0.15);
        this.mesh.quaternion.premultiply(pressQuat);
      }
    } else {
      // Airborne
      const euler = new THREE.Euler(this.pitch, -this.heading, this.roll, 'YXZ');
      this.mesh.quaternion.setFromEuler(euler);

      if (absEdge > 0.001) {
        const boardForward = new THREE.Vector3(0, 0, 1);
        boardForward.applyQuaternion(this.mesh.quaternion);

        const edgeQuat = new THREE.Quaternion();
        edgeQuat.setFromAxisAngle(boardForward, this.edgeAngle);
        this.mesh.quaternion.premultiply(edgeQuat);
      }
    }

    this.colliderMesh.position.copy(this.mesh.position);
    this.colliderMesh.quaternion.copy(this.mesh.quaternion);
  }

  updateAnimationState(dt, speed2D, absEdge, edgeSign) {
    const anim = this.animState;

    // === G-FORCE CALCULATION ===
    // This is the key driver for realistic leg compression!
    // G = v² / r, where r = sidecutRadius / sin(edgeAngle)
    let gForce = 1.0; // Base 1G standing
    if (absEdge > 0.1 && speed2D > 3) {
      const turnRadius = this.sidecutRadius / Math.max(Math.sin(absEdge), 0.1);
      const lateralG = (speed2D * speed2D) / (turnRadius * 9.81);
      gForce = Math.sqrt(1 + lateralG * lateralG); // Combined vertical + lateral
    }

    // Smooth G-force for animation (don't want jitter)
    anim.gForceCompression = THREE.MathUtils.lerp(anim.gForceCompression, gForce, 12 * dt);

    // === LEG COMPRESSION FROM G-FORCE ===
    // Higher G = deeper knee bend (absorbing the force)
    // Snowboarders ALWAYS ride with bent knees - never straight legs!
    const minKneeAngle = 0.6;  // Athletic stance - always bent
    const maxKneeAngle = 1.9;  // Deep compression squat

    // Speed-based base bend - faster = more ready position
    const speedBend = Math.min(speed2D / 20, 1) * 0.25;

    // Base knee bend from G-force - this is the MAIN driver
    // More aggressive multiplier for dramatic response
    const gCompression = Math.min((anim.gForceCompression - 1) * 0.7, 0.9);
    let baseKneeAngle = minKneeAngle + speedBend + gCompression * (maxKneeAngle - minKneeAngle);

    // Add compression from physics system
    baseKneeAngle += this.compression * 0.5;

    // === FRONT VS BACK LEG DIFFERENTIAL ===
    // In a carve, weight distribution shifts:
    // - Toeside (edge > 0): More weight on front/downhill leg
    // - Heelside (edge < 0): More weight on back leg
    // The loaded leg compresses MORE
    const weightShift = edgeSign * absEdge * 0.55;  // More dramatic difference
    const speedMod = Math.min(speed2D / 12, 1);  // Kicks in earlier

    // Front leg: compresses more on toeside
    anim.targetFrontKnee = baseKneeAngle + weightShift * speedMod;
    // Back leg: compresses more on heelside (nearly as much)
    anim.targetBackKnee = baseKneeAngle - weightShift * speedMod * 0.85;

    // Clamp knee angles
    anim.targetFrontKnee = THREE.MathUtils.clamp(anim.targetFrontKnee, minKneeAngle, maxKneeAngle);
    anim.targetBackKnee = THREE.MathUtils.clamp(anim.targetBackKnee, minKneeAngle, maxKneeAngle);

    // === BRAKING STANCE ===
    // When leaning back to brake, rider shifts weight back and stands taller
    if (this.input.lean < -0.1) {
      const brakeAmount = Math.abs(this.input.lean);
      // Back leg extends more (takes the load), front leg relaxes
      anim.targetBackKnee -= brakeAmount * 0.25;
      anim.targetFrontKnee += brakeAmount * 0.15;
    }

    // === EDGE TRANSITION "POP" ===
    // When switching edges, legs extend momentarily (the satisfying pop!)
    if (this.edgeTransitionBoost > 0.3) {
      const popExtend = this.edgeTransitionBoost * 0.5;
      anim.targetFrontKnee -= popExtend;
      anim.targetBackKnee -= popExtend;
    }

    // === ANKLE FLEX ===
    // Shin angle relative to boot - crucial for edge pressure
    // Positive = shin forward (flexed), negative = shin back
    // Toeside: shins drive forward into the boot
    // Heelside: shins stay more upright
    if (edgeSign > 0) {
      // Toeside - aggressive forward ankle flex
      anim.targetFrontAnkle = 0.25 + absEdge * 0.3;
      anim.targetBackAnkle = 0.15 + absEdge * 0.2;
    } else if (edgeSign < 0) {
      // Heelside - less forward flex, slight backward pressure
      anim.targetFrontAnkle = 0.1 - absEdge * 0.1;
      anim.targetBackAnkle = 0.05 - absEdge * 0.15;
    } else {
      // Neutral stance
      anim.targetFrontAnkle = 0.15;
      anim.targetBackAnkle = 0.1;
    }

    // === HIP HEIGHT (computed from leg geometry) ===
    // Lower hips = more compressed stance
    const avgKnee = (anim.targetFrontKnee + anim.targetBackKnee) / 2;
    anim.targetHipHeight = 0.55 - avgKnee * 0.15;

    // === HIP LATERAL SHIFT ===
    // Hips move over the working edge
    const targetHipShift = edgeSign * absEdge * 0.12 * speedMod;
    anim.hipShift = THREE.MathUtils.lerp(anim.hipShift, targetHipShift, 10 * dt);

    // === LEG SPREAD (knees apart/together for edging) ===
    // Toeside: knees drive inward toward snow
    // Heelside: knees push outward
    anim.legSpread = THREE.MathUtils.lerp(anim.legSpread, -edgeSign * absEdge * 0.15, 8 * dt);

    // === ANGULATION ===
    const speedFactor = Math.min(speed2D / 20, 1);
    const carveIntensity = absEdge * this.carveRailStrength;

    // Upper body tilts AWAY from turn - more with G-force
    anim.targetAngulation = -edgeSign * absEdge * 0.5 * (0.5 + speedFactor * 0.5);
    anim.targetAngulation *= (1 + (anim.gForceCompression - 1) * 0.3);

    if (this.carveRailStrength > 0.5) {
      anim.targetAngulation *= 1 + this.carveRailStrength * 0.4;
    }

    // === COUNTER-ROTATION ===
    const turnRate = this.headingVelocity;
    anim.targetCounterRotation = -turnRate * 0.15;

    if (absEdge > 0.3 && this.carveHoldTime > 0.3) {
      anim.targetCounterRotation += edgeSign * 0.25;
    }

    // === HEAD LOOK ===
    anim.targetHeadLook = -edgeSign * 0.35 + turnRate * 0.1;
    if (this.carveRailStrength > 0.3) {
      anim.targetHeadLook -= edgeSign * 0.2;
    }

    // === ARM DYNAMICS ===
    if (edgeSign > 0) {
      anim.leftArmPose = THREE.MathUtils.lerp(anim.leftArmPose, -0.7 - carveIntensity * 0.4, 8 * dt);
      anim.rightArmPose = THREE.MathUtils.lerp(anim.rightArmPose, 0.5 + carveIntensity * 0.3, 8 * dt);
    } else if (edgeSign < 0) {
      anim.rightArmPose = THREE.MathUtils.lerp(anim.rightArmPose, -0.6 - carveIntensity * 0.4, 8 * dt);
      anim.leftArmPose = THREE.MathUtils.lerp(anim.leftArmPose, 0.4 + carveIntensity * 0.3, 8 * dt);
    } else {
      anim.leftArmPose = THREE.MathUtils.lerp(anim.leftArmPose, 0, 5 * dt);
      anim.rightArmPose = THREE.MathUtils.lerp(anim.rightArmPose, 0, 5 * dt);
    }

    // === STYLE FLAIR ===
    if (this.carveChainCount > 2) {
      anim.styleFlair = Math.min(anim.styleFlair + dt * 0.5, 1);
    } else {
      anim.styleFlair *= 0.98;
    }

    // === FAILURE STATE OVERRIDES ===
    if (this.isWashingOut) {
      const wobblePhase = Date.now() * 0.015;
      anim.targetAngulation += Math.sin(wobblePhase) * this.washOutIntensity * 0.5;
      anim.leftArmPose = Math.sin(wobblePhase * 1.2) * this.washOutIntensity;
      anim.rightArmPose = Math.cos(wobblePhase * 1.1) * this.washOutIntensity;
      anim.targetHeadLook += Math.sin(wobblePhase * 0.8) * this.washOutIntensity * 0.3;
      // Legs scramble
      anim.targetFrontKnee += Math.sin(wobblePhase * 2) * this.washOutIntensity * 0.3;
      anim.targetBackKnee += Math.cos(wobblePhase * 2) * this.washOutIntensity * 0.3;
    }

    if (this.isEdgeCaught) {
      const catchPhase = Date.now() * 0.02;
      anim.targetAngulation = Math.sin(catchPhase) * this.edgeCatchSeverity * 0.5;
      anim.leftArmPose = Math.sin(catchPhase * 2) * this.edgeCatchSeverity;
      anim.rightArmPose = -Math.sin(catchPhase * 2 + 1) * this.edgeCatchSeverity;
      // Deep compression on catch
      anim.targetFrontKnee = 1.3 + this.edgeCatchSeverity * 0.3;
      anim.targetBackKnee = 1.3 + this.edgeCatchSeverity * 0.3;
    }

    if (this.isRecovering) {
      const recoverPhase = Date.now() * 0.01;
      anim.targetAngulation *= 0.5;
      anim.targetAngulation += Math.sin(recoverPhase) * 0.1;
    }

    // === SMOOTH ALL VALUES ===
    // Knee angles - responsive but smooth
    anim.frontKneeAngle = THREE.MathUtils.lerp(anim.frontKneeAngle, anim.targetFrontKnee, 12 * dt);
    anim.backKneeAngle = THREE.MathUtils.lerp(anim.backKneeAngle, anim.targetBackKnee, 12 * dt);

    // Ankle angles
    anim.frontAnkleAngle = THREE.MathUtils.lerp(anim.frontAnkleAngle, anim.targetFrontAnkle, 10 * dt);
    anim.backAnkleAngle = THREE.MathUtils.lerp(anim.backAnkleAngle, anim.targetBackAnkle, 10 * dt);

    // Hip height
    anim.hipHeight = THREE.MathUtils.lerp(anim.hipHeight, anim.targetHipHeight, 10 * dt);

    // Upper body
    anim.angulation = THREE.MathUtils.lerp(anim.angulation, anim.targetAngulation, 8 * dt);
    anim.counterRotation = THREE.MathUtils.lerp(anim.counterRotation, anim.targetCounterRotation, 6 * dt);
    anim.headLook = THREE.MathUtils.lerp(anim.headLook, anim.targetHeadLook, 10 * dt);
  }

  applyRiderAnimation(dt) {
    if (!this.riderGroup || !this.animState) return;

    const anim = this.animState;
    const absEdge = Math.abs(this.edgeAngle);
    const edgeSign = Math.sign(this.edgeAngle);

    // === APPLY LEG IK-STYLE ANIMATION ===
    // The key insight: ankle pivot rotates shin, knee pivot rotates thigh
    // This creates realistic knee bend geometry

    // Front leg
    const frontKnee = anim.frontKneeAngle;
    const frontAnkle = anim.frontAnkleAngle;

    // Ankle pivot - shin tilts forward/back
    this.frontAnklePivot.rotation.x = -frontAnkle;
    // Add lateral tilt for edging (knees in/out)
    this.frontAnklePivot.rotation.z = anim.legSpread;

    // Knee pivot - thigh angles relative to shin
    // When knee bends, thigh rotates back from vertical
    this.frontKneePivot.rotation.x = frontKnee;

    // Back leg
    const backKnee = anim.backKneeAngle;
    const backAnkle = anim.backAnkleAngle;

    this.backAnklePivot.rotation.x = -backAnkle;
    this.backAnklePivot.rotation.z = anim.legSpread;
    this.backKneePivot.rotation.x = backKnee;

    // === HIP POSITION ===
    // Hips sit at the top of the thighs
    // Height computed from leg bend
    const avgKnee = (frontKnee + backKnee) / 2;
    const hipY = this.bootHeight + this.shinLength + this.thighLength - avgKnee * 0.18;

    this.hipsMesh.position.y = hipY;
    this.hipsMesh.position.x = anim.hipShift;
    this.hipsMesh.rotation.y = anim.counterRotation * 0.3;

    // Forward/back hip shift based on weight distribution
    const hipZ = (frontKnee - backKnee) * 0.05;
    this.hipsMesh.position.z = hipZ;

    // === LOWER BODY LATERAL SHIFT ===
    this.lowerBodyGroup.position.x = anim.hipShift * 0.5;

    // === UPPER BODY ===
    const upperBodyY = hipY - 0.42; // Offset from hip position
    this.upperBodyGroup.position.y = upperBodyY;
    this.upperBodyGroup.position.x = anim.hipShift * 0.3;

    // === TORSO - ANGULATION (the key carve look!) ===
    this.torsoMesh.rotation.z = anim.angulation;
    this.torsoMesh.rotation.y = anim.counterRotation;

    // Forward lean - more when compressed
    const forwardLean = avgKnee * 0.15 + this.currentSpeed * 0.003;
    this.torsoMesh.rotation.x = forwardLean;

    // Update torso position to follow hip height
    this.torsoMesh.position.y = 0.68 + upperBodyY * 0.3;

    // Shoulders - more counter-rotation than hips
    this.shouldersMesh.rotation.y = anim.counterRotation * 1.5;
    this.shouldersMesh.rotation.z = anim.angulation * 0.8;
    this.shouldersMesh.position.y = 0.86 + upperBodyY * 0.4;

    // === ARM ANIMATION (athletic carving stance) ===
    // Arms held FORWARD in ready position, not hanging down
    // Snowboarders keep arms out front for balance and control
    const leftPose = anim.leftArmPose;
    const rightPose = anim.rightArmPose;

    // Position shoulders with body
    this.leftShoulderPivot.position.y = 0.86 + upperBodyY * 0.4;
    this.rightShoulderPivot.position.y = 0.86 + upperBodyY * 0.4;

    // BASE ATHLETIC STANCE: Arms forward and slightly out
    // rotation.x: negative = forward, positive = back
    // rotation.z: positive (left) / negative (right) = out to side

    // Left arm - base position: forward and slightly out
    let leftArmForward = -0.8;  // Forward
    let leftArmOut = 0.4;       // Slightly out from body
    let leftElbow = 0.6;        // Relaxed bend

    // Right arm - base position: forward and slightly out
    let rightArmForward = -0.7;
    let rightArmOut = -0.4;
    let rightElbow = 0.6;

    // === CARVING ARM ADJUSTMENTS ===
    if (absEdge > 0.15) {
      const carveAmount = absEdge * 1.2;

      if (edgeSign > 0) {
        // TOESIDE CARVE
        // Lead arm (left) drops down and points into turn
        leftArmForward = -1.0 - carveAmount * 0.3;  // More forward/down
        leftArmOut = 0.2;                            // Closer to body
        leftElbow = 0.3;                             // Straighter, reaching

        // Trail arm (right) lifts up and back for balance
        rightArmForward = -0.3 + carveAmount * 0.4;  // Back
        rightArmOut = -0.6 - carveAmount * 0.2;      // Out for balance
        rightElbow = 0.8;                             // More bent

      } else {
        // HEELSIDE CARVE
        // Lead arm (right) points into turn
        rightArmForward = -1.0 - carveAmount * 0.3;
        rightArmOut = -0.2;
        rightElbow = 0.3;

        // Trail arm (left) up and back
        leftArmForward = -0.3 + carveAmount * 0.4;
        leftArmOut = 0.6 + carveAmount * 0.2;
        leftElbow = 0.8;
      }
    }

    // Apply arm positions
    this.leftShoulderPivot.rotation.x = leftArmForward;
    this.leftShoulderPivot.rotation.z = leftArmOut;
    this.leftElbowPivot.rotation.x = leftElbow;

    this.rightShoulderPivot.rotation.x = rightArmForward;
    this.rightShoulderPivot.rotation.z = rightArmOut;
    this.rightElbowPivot.rotation.x = rightElbow;

    // Style flair - trailing arm gets extra flourish
    if (anim.styleFlair > 0.3) {
      const flair = (anim.styleFlair - 0.3) * 0.8;
      if (edgeSign > 0) {
        this.rightShoulderPivot.rotation.z -= flair * 0.3;
        this.rightShoulderPivot.rotation.x += flair * 0.2;
      } else if (edgeSign < 0) {
        this.leftShoulderPivot.rotation.z += flair * 0.3;
        this.leftShoulderPivot.rotation.x += flair * 0.2;
      }
    }

    // === HEAD / NECK ===
    const headY = 1.04 + upperBodyY * 0.5;
    this.headMesh.position.y = headY;
    this.headMesh.rotation.y = anim.headLook;
    this.headMesh.rotation.z = anim.angulation * 0.25;

    this.neckMesh.position.y = headY - 0.1;
    this.neckMesh.rotation.y = anim.headLook * 0.5;

    this.helmetMesh.position.y = headY;
    this.goggleMesh.position.y = headY + 0.01;

    // === AIR ANIMATIONS ===
    if (!this.isGrounded) {
      const tuckAmount = Math.max(0, this.input.lean) * 0.5;

      // Pull knees up in air
      this.frontAnklePivot.rotation.x = -0.3 - tuckAmount * 0.4;
      this.frontKneePivot.rotation.x = 0.8 + tuckAmount * 0.5;

      this.backAnklePivot.rotation.x = -0.3 - tuckAmount * 0.4;
      this.backKneePivot.rotation.x = 0.8 + tuckAmount * 0.5;

      // Arms stay forward and athletic in air
      // Base air position: arms out for stability
      this.leftShoulderPivot.rotation.x = -0.6;
      this.leftShoulderPivot.rotation.z = 0.5;
      this.leftElbowPivot.rotation.x = 0.5;

      this.rightShoulderPivot.rotation.x = -0.6;
      this.rightShoulderPivot.rotation.z = -0.5;
      this.rightElbowPivot.rotation.x = 0.5;

      // Arms tuck in for spins
      if (Math.abs(this.headingVelocity) > 1) {
        const spinTuck = Math.min(Math.abs(this.headingVelocity) * 0.2, 0.5);
        // Pull arms in toward chest for faster spin
        this.leftShoulderPivot.rotation.x = -0.8;
        this.leftShoulderPivot.rotation.z = 0.3 - spinTuck * 0.2;
        this.leftElbowPivot.rotation.x = 1.0;

        this.rightShoulderPivot.rotation.x = -0.8;
        this.rightShoulderPivot.rotation.z = -0.3 + spinTuck * 0.2;
        this.rightElbowPivot.rotation.x = 1.0;
      }

      // Grab poses - reach for board
      if (tuckAmount > 0.3 && absEdge > 0.3) {
        if (edgeSign > 0) {
          // Method/melon - back hand reaches down for toeside edge
          this.rightShoulderPivot.rotation.x = 0.3;   // Down toward board
          this.rightShoulderPivot.rotation.z = -0.6;  // Out to reach edge
          this.rightElbowPivot.rotation.x = 0.2;      // Straight arm reaching
        } else {
          // Indy - front hand reaches for heelside edge
          this.leftShoulderPivot.rotation.x = 0.3;
          this.leftShoulderPivot.rotation.z = 0.6;
          this.leftElbowPivot.rotation.x = 0.2;
        }
      }
    }
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

    // Reset animation state
    if (this.animState) {
      this.animState.angulation = 0;
      this.animState.targetAngulation = 0;
      this.animState.counterRotation = 0;
      this.animState.targetCounterRotation = 0;
      this.animState.headLook = 0;
      this.animState.targetHeadLook = 0;
      this.animState.leftArmPose = 0;
      this.animState.rightArmPose = 0;
      this.animState.frontKneeAngle = 0.65;
      this.animState.backKneeAngle = 0.65;
      this.animState.targetFrontKnee = 0.65;
      this.animState.targetBackKnee = 0.65;
      this.animState.frontAnkleAngle = 0.1;
      this.animState.backAnkleAngle = 0.1;
      this.animState.targetFrontAnkle = 0.1;
      this.animState.targetBackAnkle = 0.1;
      this.animState.hipHeight = 0.5;
      this.animState.targetHipHeight = 0.5;
      this.animState.hipShift = 0;
      this.animState.legSpread = 0;
      this.animState.styleFlair = 0;
      this.animState.gForceCompression = 1;
    }
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
