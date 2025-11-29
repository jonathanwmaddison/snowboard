import * as THREE from 'three';
import { PlayerModelV2 } from './PlayerModelV2.js';
import { PlayerModelGLB } from './PlayerModelGLB.js';

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

    // === ANGULATION SYSTEM ===
    // Proper body angulation allows deeper edge hold without washing out
    // Like bending at hips/knees to keep center of mass over the edge
    this.angulation = 0;           // 0-1, how much body is angulating
    this.targetAngulation = 0;
    this.angulationCapacity = 1.0; // Degrades with fatigue/bad form

    // === BOARD FLEX SYSTEM ===
    // Board stores energy when loaded, releases on transitions
    this.boardFlex = 0;            // Current flex amount (0-1)
    this.flexEnergy = 0;           // Stored energy from flex
    this.maxFlexEnergy = 1.5;      // Cap on stored energy
    this.flexStiffness = 8;        // How quickly board flexes/rebounds

    // === CARVE FLOW STATE ===
    // "In the zone" - everything clicking
    this.flowState = 0;            // 0-1, current flow level
    this.flowMomentum = 0;         // Accumulated flow from perfect carves
    this.flowDecayRate = 0.3;      // How fast flow decays without perfect carves
    this.flowBuildRate = 0.15;     // How fast flow builds with perfect carves

    // === ARC SHAPE TRACKING ===
    // C-turn (complete) vs J-turn (early exit) vs S-wiggle (no commitment)
    this.arcHeadingChange = 0;     // Total heading change in current arc
    this.arcStartHeading = 0;      // Heading when arc started
    this.arcType = 'none';         // 'c-turn', 'j-turn', 'wiggle', 'none'

    // === EDGE BITE PROGRESSION ===
    // Edge grip builds over time during sustained carve
    this.edgeBite = 0;             // Current edge grip progression (0-1)
    this.edgeBiteRate = 2.0;       // How fast bite builds
    this.maxEdgeBite = 1.0;        // Maximum additional grip from bite

    // === SMOOTHING SYSTEMS ===
    // Track velocities for spring-damper smoothing (eliminates choppiness)
    this.edgeVelocity = 0;         // Rate of edge angle change
    this.turnInertia = 0;          // Accumulated turn momentum
    this.smoothedGrip = 0.7;       // Smoothed grip value (prevents sudden grip changes)
    this.lastAbsEdge = 0;          // For tracking edge rate of change
    this.smoothedRailStrength = 0; // Smoothed rail strength

    // Turn rhythm tracking
    this.turnRhythm = 0;           // 0-1, how "in rhythm" the carving is
    this.rhythmPhase = 0;          // Current phase in the carve cycle

    // === GRINDING SYSTEM ===
    this.isGrinding = false;
    this.grindRail = null;         // Current rail being ground
    this.grindProgress = 0;        // 0-1 progress along rail
    this.grindBalance = 0;         // -1 to 1, must stay near 0
    this.grindTime = 0;            // Time spent on this grind
    this.grindSparks = [];         // Spark particle data

    // === MODEL VERSION ===
    // 1 = original simple model, 2 = realistic detailed model, 3 = external GLB model
    this.modelVersion = 2;  // Default to V2 realistic model
    this.playerModelV2 = null;
    this.playerModelGLB = null;
    this.glbModelUrl = null;  // URL for external GLB model
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
    if (this.modelVersion === 2) {
      this.createVisualMeshV2();
      return;
    }

    if (this.modelVersion === 3 && this.playerModelGLB) {
      this.createVisualMeshGLB();
      return;
    }

    // === V1 MODEL (original simple) ===
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

  createVisualMeshV2() {
    // === V2 REALISTIC MODEL ===
    this.playerModelV2 = new PlayerModelV2();

    // Get dimensions from V2 model for animation compatibility
    const dims = this.playerModelV2.getDimensions();
    this.thighLength = dims.thighLength;
    this.shinLength = dims.shinLength;
    this.bootHeight = dims.bootHeight;

    // Reference V2 model components for animation system
    // Board
    this.boardMesh = this.playerModelV2.boardGroup;

    // Rider group
    this.riderGroup = this.playerModelV2.riderGroup;

    // Lower body
    this.lowerBodyGroup = this.playerModelV2.lowerBodyGroup;
    this.frontBoot = this.playerModelV2.frontBoot;
    this.backBoot = this.playerModelV2.backBoot;
    this.frontAnklePivot = this.playerModelV2.frontAnklePivot;
    this.backAnklePivot = this.playerModelV2.backAnklePivot;
    this.frontKneePivot = this.playerModelV2.frontKneePivot;
    this.backKneePivot = this.playerModelV2.backKneePivot;
    this.frontShin = this.playerModelV2.frontShin;
    this.backShin = this.playerModelV2.backShin;
    this.frontThigh = this.playerModelV2.frontThigh;
    this.backThigh = this.playerModelV2.backThigh;
    this.frontKnee = this.playerModelV2.frontKnee;
    this.backKnee = this.playerModelV2.backKnee;
    this.hipsMesh = this.playerModelV2.hipsMesh;

    // Upper body
    this.upperBodyGroup = this.playerModelV2.upperBodyGroup;
    this.torsoMesh = this.playerModelV2.torsoMesh;
    this.shouldersMesh = this.playerModelV2.shouldersMesh;
    this.leftShoulderPivot = this.playerModelV2.leftShoulderPivot;
    this.rightShoulderPivot = this.playerModelV2.rightShoulderPivot;
    this.leftUpperArm = this.playerModelV2.leftUpperArm;
    this.rightUpperArm = this.playerModelV2.rightUpperArm;
    this.leftElbowPivot = this.playerModelV2.leftElbowPivot;
    this.rightElbowPivot = this.playerModelV2.rightElbowPivot;
    this.leftForearm = this.playerModelV2.leftForearm;
    this.rightForearm = this.playerModelV2.rightForearm;
    this.leftHand = this.playerModelV2.leftHand;
    this.rightHand = this.playerModelV2.rightHand;
    this.neckMesh = this.playerModelV2.neckMesh;
    this.headMesh = this.playerModelV2.headMesh;
    this.helmetMesh = this.playerModelV2.helmetMesh;
    this.goggleMesh = this.playerModelV2.goggleMesh;

    // For V2, torsoMesh is inside torsoGroup, so we reference the group
    this.torsoGroup = this.playerModelV2.torsoGroup;
    this.headGroup = this.playerModelV2.headGroup;
    this.pelvisGroup = this.playerModelV2.pelvisGroup;

    // === ANIMATION STATE (same as V1) ===
    this.animState = {
      angulation: 0,
      targetAngulation: 0,
      counterRotation: 0,
      targetCounterRotation: 0,
      headLook: 0,
      targetHeadLook: 0,
      leftArmPose: 0,
      rightArmPose: 0,
      frontKneeAngle: 0.65,
      backKneeAngle: 0.65,
      targetFrontKnee: 0.65,
      targetBackKnee: 0.65,
      frontAnkleAngle: 0.1,
      backAnkleAngle: 0.1,
      targetFrontAnkle: 0.1,
      targetBackAnkle: 0.1,
      hipHeight: 0.5,
      targetHipHeight: 0.5,
      hipShift: 0,
      legSpread: 0,
      styleFlair: 0,
      gForceCompression: 0
    };

    // Main mesh group
    this.mesh = this.playerModelV2.mesh;
    this.sceneManager.add(this.mesh);
  }

  createVisualMeshGLB() {
    // === V3 GLB MODEL (external rigged character) ===
    if (!this.playerModelGLB || !this.playerModelGLB.loaded) {
      console.warn('GLB model not loaded, falling back to V2');
      this.modelVersion = 2;
      this.createVisualMeshV2();
      return;
    }

    // Create a simple board to go with the character
    const boardGeometry = new THREE.BoxGeometry(0.26, 0.012, 1.55);
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.4,
      metalness: 0.2,
    });
    this.boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);

    // Animation state (same structure as V1/V2)
    this.animState = {
      angulation: 0,
      targetAngulation: 0,
      counterRotation: 0,
      targetCounterRotation: 0,
      headLook: 0,
      targetHeadLook: 0,
      leftArmPose: 0,
      rightArmPose: 0,
      frontKneeAngle: 0.65,
      backKneeAngle: 0.65,
      targetFrontKnee: 0.65,
      targetBackKnee: 0.65,
      frontAnkleAngle: 0.1,
      backAnkleAngle: 0.1,
      targetFrontAnkle: 0.1,
      targetBackAnkle: 0.1,
      hipHeight: 0.5,
      targetHipHeight: 0.5,
      hipShift: 0,
      legSpread: 0,
      styleFlair: 0,
      gForceCompression: 0,
      carveRailStrength: 0
    };

    // Combine board and character
    this.mesh = new THREE.Group();
    this.mesh.add(this.boardMesh);

    // Position character on board (board top is at 0.006m)
    const characterGroup = this.playerModelGLB.mesh;
    characterGroup.position.set(0, 0.006, 0);  // Feet exactly on board top
    characterGroup.rotation.set(0, 0, 0);
    this.mesh.add(characterGroup);

    // Set up dummy groups for compatibility
    this.riderGroup = characterGroup;
    this.lowerBodyGroup = new THREE.Group();
    this.upperBodyGroup = new THREE.Group();

    // Apply initial snowboard stance pose
    this.playerModelGLB.applySnowboardStance();

    this.sceneManager.add(this.mesh);
    console.log('GLB mesh added to scene, children:', this.mesh.children.length);
  }

  toggleModelVersion() {
    // Clean up current model
    if (this.mesh) {
      this.sceneManager.scene.remove(this.mesh);
      if (this.playerModelV2) {
        this.playerModelV2.dispose();
        this.playerModelV2 = null;
      }
      if (this.playerModelGLB) {
        this.playerModelGLB.dispose();
        this.playerModelGLB = null;
      }
    }

    // Toggle version: 1 -> 2 -> 3 -> 1
    // Only go to 3 if a GLB model URL is set
    if (this.modelVersion === 1) {
      this.modelVersion = 2;
    } else if (this.modelVersion === 2 && this.glbModelUrl) {
      this.modelVersion = 3;
    } else {
      this.modelVersion = 1;
    }

    // Create new model
    this.createVisualMesh();

    // Re-sync position
    if (this.body) {
      const pos = this.body.translation();
      this.mesh.position.set(pos.x, pos.y, pos.z);
      this.mesh.rotation.y = this.heading;
    }

    console.log(`Switched to player model V${this.modelVersion}`);
    return this.modelVersion;
  }

  async loadGLBModel(url) {
    console.log('Loading GLB model:', url);
    this.glbModelUrl = url;

    // Clean up existing models
    if (this.mesh) {
      this.sceneManager.scene.remove(this.mesh);
      this.mesh = null;
    }
    if (this.playerModelV2) {
      this.playerModelV2.dispose();
      this.playerModelV2 = null;
    }
    if (this.playerModelGLB) {
      this.playerModelGLB.dispose();
      this.playerModelGLB = null;
    }

    // Load the new model
    this.playerModelGLB = new PlayerModelGLB();
    await this.playerModelGLB.load(url);

    console.log('GLB loaded, mapped bones:', Object.keys(this.playerModelGLB.bones));

    // Switch to GLB mode
    this.modelVersion = 3;
    this.createVisualMeshGLB();

    // Re-sync position
    if (this.body) {
      const pos = this.body.translation();
      this.mesh.position.set(pos.x, pos.y, pos.z);
      this.mesh.rotation.y = this.heading;
    }

    console.log('GLB model loaded and active at position:', this.mesh.position);
    return this.playerModelGLB;
  }

  // Customization methods for V2 model
  setJacketColor(color) {
    if (this.playerModelV2) {
      this.playerModelV2.setJacketColor(color);
    }
  }

  setPantsColor(color) {
    if (this.playerModelV2) {
      this.playerModelV2.setPantsColor(color);
    }
  }

  setHelmetColor(color) {
    if (this.playerModelV2) {
      this.playerModelV2.setHelmetColor(color);
    }
  }

  setGoggleLensColor(color) {
    if (this.playerModelV2) {
      this.playerModelV2.setGoggleLensColor(color);
    }
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

    // Ground detection - but skip if we're moving upward (just jumped)
    if (this.velocity.y <= 0) {
      this.checkGround(pos);
    } else {
      // Rising - definitely not grounded
      this.isGrounded = false;
    }

    // Landing detection
    if (this.isGrounded && !this.wasGrounded) {
      this.onLanding(dt);
    }

    // === GRIND RAIL DETECTION ===
    if (this.terrain && !this.isGrounded) {
      const railInfo = this.terrain.getRailAt(pos.x, pos.y, pos.z);
      if (railInfo && !this.isGrinding) {
        // Check if we're landing on the rail (descending or close enough)
        if (this.velocity.y <= 0 || Math.abs(pos.y - railInfo.railY) < 0.3) {
          this.startGrind(railInfo);
        }
      }
    }

    // Handle grinding physics
    if (this.isGrinding) {
      this.updateGrindPhysics(dt, pos);
      return; // Skip normal physics while grinding
    }

    if (this.isGrounded) {
      this.airTime = 0;
      this.updateGroundedPhysics(dt, pos);

      // Very stable ground following - just stay on ground
      const targetY = this.groundHeight + 0.15;

      // Smooth ground following - prevent sudden Y jumps
      const yChange = targetY - pos.y;
      const maxYChangePerFrame = 0.3; // Max smooth ground change per frame

      let newY;
      if (Math.abs(yChange) > maxYChangePerFrame) {
        // Terrain changed too suddenly - smooth it out
        // Follow gradually rather than teleporting
        newY = pos.y + Math.sign(yChange) * maxYChangePerFrame;
      } else {
        // Normal smooth ground following
        newY = targetY;
      }

      // Only zero Y velocity if we didn't just jump
      // (jumping sets isGrounded = false and velocity.y > 0)
      if (this.isGrounded) {
        this.velocity.y = 0;
        this.body.setNextKinematicTranslation({
          x: pos.x + this.velocity.x * dt,
          y: newY,
          z: pos.z + this.velocity.z * dt
        });
      } else {
        // We just jumped - let the air physics handle it next frame
        this.body.setNextKinematicTranslation({
          x: pos.x + this.velocity.x * dt,
          y: pos.y + this.velocity.y * dt,
          z: pos.z + this.velocity.z * dt
        });
      }
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

    // === WEIGHT TRANSFER (smooth) ===
    this.weightForward = THREE.MathUtils.lerp(this.weightForward, this.input.lean * 0.8, 6 * dt);

    // === DIRECT EDGE CONTROL (v2 simplified) ===
    // Steer input directly controls edge angle - simple and responsive
    const maxEdge = 1.15; // ~66 degrees max - deep carves!

    // Target edge from steer input
    // Lean forward slightly increases edge commitment (optional modifier)
    const leanBonus = this.input.lean > 0 ? this.input.lean * 0.1 : 0;
    this.targetEdgeAngle = this.input.steer * maxEdge * (1 + leanBonus);

    // Spring-damper for edge angle (smooth, physical feel)
    const edgeSpring = 70;  // Snappier response
    const edgeDamp = 8 + this.smoothedRailStrength * 5;

    const edgeError = this.targetEdgeAngle - this.edgeAngle;
    const springForce = edgeError * edgeSpring;
    const dampForce = -this.edgeVelocity * edgeDamp;
    const edgeAccel = springForce + dampForce;

    this.edgeVelocity += edgeAccel * dt;
    this.edgeAngle += this.edgeVelocity * dt;

    // Soft clamp edge angle
    if (Math.abs(this.edgeAngle) > maxEdge) {
      this.edgeAngle = Math.sign(this.edgeAngle) * maxEdge;
      this.edgeVelocity *= 0.5;
    }

    const absEdge = Math.abs(this.edgeAngle);
    const edgeSign = Math.sign(this.edgeAngle);

    // Track edge rate of change for smoothness detection
    const edgeChangeRate = Math.abs(absEdge - this.lastAbsEdge) / dt;
    this.lastAbsEdge = absEdge;

    // === ANGULATION SYSTEM ===
    // Proper angulation lets you hold deeper edges without washing out
    // High speed + deep edge REQUIRES angulation to stay balanced
    const angulationNeeded = (absEdge * speed2D) / 25;
    this.targetAngulation = Math.min(angulationNeeded, 1.0);

    // Angulation capacity based on SMOOTHNESS of edge changes (not absolute position)
    // Jerky/rapid edge changes = bad form = reduced capacity
    const smoothnessThreshold = 3.0; // rad/s - above this is "jerky"
    if (edgeChangeRate > smoothnessThreshold) {
      // Jerky input degrades angulation capacity
      const jerkPenalty = (edgeChangeRate - smoothnessThreshold) * 0.3 * dt;
      this.angulationCapacity = Math.max(0.4, this.angulationCapacity - jerkPenalty);
    } else {
      // Smooth carving restores capacity
      this.angulationCapacity = Math.min(1.0, this.angulationCapacity + 0.8 * dt);
    }

    // Angulation follows target smoothly (spring-damper would be overkill here)
    const effectiveTargetAng = this.targetAngulation * this.angulationCapacity;
    this.angulation = THREE.MathUtils.lerp(this.angulation, effectiveTargetAng, 4 * dt);

    // === BOARD FLEX SYSTEM ===
    // Board flexes under carving load - stores energy for transitions
    const carveLoad = absEdge * speed2D * 0.02 * (1 + this.carveRailStrength);
    const targetFlex = Math.min(carveLoad, 1.0);

    // Flex builds during carves
    this.boardFlex = THREE.MathUtils.lerp(this.boardFlex, targetFlex, this.flexStiffness * dt);

    // Accumulate flex energy (like winding a spring)
    if (this.boardFlex > 0.2 && absEdge > 0.4) {
      const energyGain = this.boardFlex * this.carvePerfection * dt * 0.8;
      this.flexEnergy = Math.min(this.flexEnergy + energyGain, this.maxFlexEnergy);
    }

    // === ARC SHAPE TRACKING ===
    // Track total heading change to determine turn shape
    if (absEdge > 0.3) {
      if (this.arcHeadingChange === 0) {
        // Starting new arc
        this.arcStartHeading = this.heading;
      }
      this.arcHeadingChange = Math.abs(this.normalizeAngle(this.heading - this.arcStartHeading));
    }

    // === EDGE BITE PROGRESSION ===
    // Edge grip builds over time as edge "bites" into snow
    if (absEdge > this.carveRailThreshold && this.smoothedRailStrength > 0.3) {
      // Bite builds faster with good angulation and perfection
      const biteGain = this.edgeBiteRate * this.angulation * this.carvePerfection * dt;
      this.edgeBite = Math.min(this.edgeBite + biteGain, this.maxEdgeBite);
    } else {
      // Bite decays SMOOTHLY when not in deep carve (not exponential - linear is smoother)
      this.edgeBite = Math.max(0, this.edgeBite - 1.5 * dt);
    }

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

      // === TRANSITION TIMING SWEET SPOT ===
      // There's an optimal rhythm to carving - not too fast, not too slow
      // Sweet spot: 0.5-1.2 seconds between transitions
      // Too fast (<0.4s): rushing, not completing arcs properly
      // Too slow (>1.5s): losing momentum, stalling in the turn
      const timeSinceLastSwitch = this.lastEdgeChangeTime;
      let timingMultiplier = 1.0;

      if (timeSinceLastSwitch < 0.3) {
        // Way too fast - panic wiggling
        timingMultiplier = 0.4;
      } else if (timeSinceLastSwitch < 0.5) {
        // Slightly rushed
        timingMultiplier = 0.7 + (timeSinceLastSwitch - 0.3) * 1.5; // 0.7 -> 1.0
      } else if (timeSinceLastSwitch <= 1.2) {
        // Sweet spot! Optimal timing
        // Peak at 0.8s (sweet spot center)
        const sweetSpotCenter = 0.8;
        const distFromCenter = Math.abs(timeSinceLastSwitch - sweetSpotCenter);
        timingMultiplier = 1.0 + (0.35 - distFromCenter) * 0.5; // Up to 1.175 bonus
      } else if (timeSinceLastSwitch <= 1.8) {
        // A bit slow - losing some momentum
        timingMultiplier = 1.0 - (timeSinceLastSwitch - 1.2) * 0.5; // 1.0 -> 0.7
      } else {
        // Too slow - stalled, lost the rhythm
        timingMultiplier = 0.5;
      }

      // === ARC SHAPE DETERMINATION ===
      // C-turn: >60° heading change (full carve)
      // J-turn: 30-60° (partial, early exit)
      // Wiggle: <30° (uncommitted)
      const headingDeg = this.arcHeadingChange * (180 / Math.PI);
      if (headingDeg > 60) {
        this.arcType = 'c-turn';
      } else if (headingDeg > 30) {
        this.arcType = 'j-turn';
      } else {
        this.arcType = 'wiggle';
      }

      // Arc shape affects rewards
      const arcShapeMultiplier = this.arcType === 'c-turn' ? 1.3 :
                                  this.arcType === 'j-turn' ? 1.0 : 0.5;

      // === CARVE CHAIN BONUS ===
      // Consecutive clean carves build multiplier
      const cleanCarve = this.peakEdgeAngle > 0.5 && this.carveHoldTime > 0.3;
      const completedArc = this.carveArcProgress > 0.25;
      const goodTiming = timingMultiplier > 0.9; // Good timing to count for chain

      if (cleanCarve && completedArc && this.arcType !== 'wiggle' && goodTiming) {
        this.carveChainCount = Math.min(this.carveChainCount + 1, 10);

        // === FLOW STATE UPDATE ===
        // Perfect carves with good arc AND good timing build flow
        const flowGain = this.flowBuildRate * arcShapeMultiplier * timingMultiplier *
                         (1 + this.carvePerfection);
        this.flowMomentum = Math.min(this.flowMomentum + flowGain, 1.5);
      } else if (!cleanCarve || this.arcType === 'wiggle') {
        this.carveChainCount = Math.max(0, this.carveChainCount - 1);
        // Bad carves hurt flow
        this.flowMomentum = Math.max(0, this.flowMomentum - 0.2);
      } else if (!goodTiming) {
        // Timing was off but carve was ok - small penalty
        this.flowMomentum = Math.max(0, this.flowMomentum - 0.1);
      }

      // Chain multiplier: 1.0 at 0, up to 2.0 at 10 chains
      const chainMultiplier = 1.0 + this.carveChainCount * 0.1;

      // === FLEX ENERGY RELEASE ===
      // Board flex releases stored energy as extra pop!
      const flexBoost = this.flexEnergy * 2.5;

      // Calculate the boost (reduced if didn't complete arc or bad timing)
      const arcBonus = completedArc ? 1.0 : 0.5;
      this.edgeTransitionBoost = (transitionSpeed * speedBonus * 3.5 + flexBoost) *
                                  chainMultiplier * arcBonus * arcShapeMultiplier *
                                  timingMultiplier * (1 + this.flowState * 0.3);
      this.lastEdgeChangeTime = 0;

      // Carve energy from good edge changes - more from deep carves
      const carveQuality = Math.min(1, this.peakEdgeAngle / 0.8) * arcBonus;
      this.carveEnergy = Math.min(this.carveEnergy + 0.3 * carveQuality * chainMultiplier, 1.5);

      // Release flex energy on transition (spent on the pop)
      this.flexEnergy *= 0.3; // Keep some residual
      this.boardFlex = 0; // Board snaps back

      // Reset carve tracking for next carve
      this.peakEdgeAngle = 0;
      this.carveHoldTime = 0;
      this.carveRailStrength = 0;
      this.carveCommitment = 0;
      this.carveArcProgress = 0;
      this.arcHeadingChange = 0;
      this.edgeBite = 0; // Reset bite for new edge
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
      // Use edge velocity for smoothness detection (lower = more perfect)
      const edgeStability = Math.max(0, 1 - Math.abs(this.edgeVelocity) * 0.5);
      this.carvePerfection = THREE.MathUtils.lerp(this.carvePerfection, edgeStability, 3 * dt);
    } else {
      // Not in deep carve - decay rail SMOOTHLY (linear, not exponential)
      this.carveRailStrength = Math.max(0, this.carveRailStrength - 2.0 * dt);
      this.carvePerfection = Math.max(0, this.carvePerfection - 1.5 * dt);
    }

    // Smooth the rail strength for use in other systems (prevents choppiness)
    this.smoothedRailStrength = THREE.MathUtils.lerp(
      this.smoothedRailStrength,
      this.carveRailStrength,
      5 * dt
    );

    // === APPLY EDGE TRANSITION BOOST ===
    // Smooth application over time for buttery feel
    if (this.edgeTransitionBoost > 0.05) {
      // Burst of acceleration in forward direction - spread over frames
      const boostApplication = this.edgeTransitionBoost * dt * 6;
      this.velocity.x += forward.x * boostApplication;
      this.velocity.z += forward.z * boostApplication;

      // Smooth exponential decay
      this.edgeTransitionBoost *= Math.pow(0.15, dt); // Smooth decay over ~0.3s
    } else {
      this.edgeTransitionBoost = 0;
    }

    // === COMPRESSION SYSTEM ===
    // Compress during hard carves, extend on transitions
    // G-force based compression - deeper/faster carves = more compression
    const carveGForce = speed2D > 5 && absEdge > 0.3
      ? (speed2D * absEdge) / 15
      : 0;

    // Calculate ideal target compression
    let idealCompression = 0.1; // Default neutral

    if (absEdge > 0.4) {
      // Carving - compress into the turn based on G-forces
      const gCompression = Math.min(carveGForce * 0.3, 0.4);
      idealCompression = 0.25 + absEdge * 0.35 + gCompression;
    } else if (edgeSwitched) {
      // Edge switch - momentary extension (the "pop" feeling)
      // Bigger pop from deeper previous carve + flex energy
      idealCompression = -0.25 - this.carveEnergy * 0.15 - this.flexEnergy * 0.1;
    }

    // Jump charging increases compression
    if (this.jumpCharging) {
      idealCompression = 0.4 + this.jumpCharge * 0.4;
    }

    // Smoothly approach target compression (prevents jarring changes)
    const compressionApproachRate = edgeSwitched ? 15 : 6; // Faster for pop, slower otherwise
    this.targetCompression = THREE.MathUtils.lerp(
      this.targetCompression,
      idealCompression,
      compressionApproachRate * dt
    );

    // Smooth compression with spring dynamics
    const compressionSpring = 18;  // Slightly softer spring
    const compressionDamp = 7;
    const compressionForce = (this.targetCompression - this.compression) * compressionSpring;
    this.compressionVelocity += compressionForce * dt;
    this.compressionVelocity *= (1 - compressionDamp * dt);
    this.compression += this.compressionVelocity * dt;
    this.compression = THREE.MathUtils.clamp(this.compression, -0.3, 0.8);

    // === EFFECTIVE PRESSURE (simplified) ===
    this.effectivePressure = 0.8 + absEdge * 0.2;

    // === CARVED TURN PHYSICS WITH INERTIA ===
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

      // === TURN INERTIA SYSTEM ===
      // The board has rotational momentum - doesn't instantly change turn rate
      // More inertia at higher speeds (harder to change direction when fast)
      const speedInertia = 1 + speed2D * 0.03; // 1.0 at 0 m/s, ~2.5 at 50 m/s

      // Rail mode increases inertia (you're locked into the turn arc)
      const railInertia = 1 + this.smoothedRailStrength * 0.8;

      // Combined inertia factor affects how quickly turn rate can change
      const totalInertia = speedInertia * railInertia;

      // Smooth turn rate change based on inertia (higher = slower response)
      const turnResponseRate = 8 / totalInertia;

      // Track turn momentum - builds up during sustained turns
      if (Math.abs(targetAngularVel) > 0.3) {
        // Building turn momentum
        const momentumBuild = Math.sign(targetAngularVel) * 0.5 * dt;
        this.turnInertia = THREE.MathUtils.clamp(
          this.turnInertia + momentumBuild,
          -1, 1
        );
      } else {
        // Decay momentum when not turning hard
        this.turnInertia *= (1 - 2 * dt);
      }

      // Turn momentum contributes to angular velocity (sustains turn through transitions)
      const momentumContribution = this.turnInertia * 0.3;

      // Apply smooth turn rate change
      this.headingVelocity = THREE.MathUtils.lerp(
        this.headingVelocity,
        targetAngularVel + momentumContribution,
        turnResponseRate * dt
      );

      // Soft clamp max turn rate (with smooth falloff, not hard cutoff)
      const maxTurnRate = 3.5;
      if (Math.abs(this.headingVelocity) > maxTurnRate) {
        this.headingVelocity *= 0.95; // Gentle reduction
      }

      this.heading += this.headingVelocity * dt;
    } else {
      // Slow speed - direct pivot but still smooth
      this.headingVelocity *= 0.85;
      this.heading += this.input.steer * 2.5 * dt;
      this.turnInertia *= 0.9; // Decay momentum
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

    // === FLOW STATE UPDATE ===
    // Flow builds from momentum, decays over time
    const targetFlow = Math.min(this.flowMomentum, 1.0);
    this.flowState = THREE.MathUtils.lerp(this.flowState, targetFlow, 3 * dt);

    // Flow momentum decays when not being refreshed by good carves
    this.flowMomentum = Math.max(0, this.flowMomentum - this.flowDecayRate * dt);

    // === GRIP SYSTEM (enhanced for carving + snow conditions) ===
    const baseGrip = 0.7;
    const edgeGrip = absEdge * 0.3; // More grip from deeper edges

    // Rail mode adds significant extra grip - you're locked in!
    const railGrip = this.carveRailStrength * 0.15;

    // === EDGE BITE BONUS ===
    // Progressive grip from sustained edge engagement
    const biteGrip = this.edgeBite * 0.12;

    // === ANGULATION BONUS ===
    // Proper angulation increases effective grip at deep edge angles
    // Without angulation, deep edges are unstable
    const angulationGrip = this.angulation * absEdge * 0.15;

    // === SPEED-EDGE COUPLING (simplified for v2) ===
    // At low speeds, deep edges can wash out (not enough centrifugal force)
    // At high speeds, carving works great - that's the reward for going fast!
    let speedEdgeGrip = 1.0;

    // Angulation lets you hold more edge at lower speeds
    const angulationBonus = this.angulation * 0.4;
    const minSpeedPerRadian = 12 * (1 - angulationBonus);  // Below this, wash out risk

    // What edge angle is supportable at current speed?
    const supportableEdge = speed2D / minSpeedPerRadian;

    // === WASH OUT: Too much edge for speed (low speed only) ===
    const effectiveOverEdge = absEdge - supportableEdge;
    if (effectiveOverEdge > 0 && speed2D < 15) {
      const angulationProtection = this.angulation * 0.5;
      const washOutPenalty = Math.min(effectiveOverEdge * 1.5 * (1 - angulationProtection), 0.4);
      speedEdgeGrip -= washOutPenalty;

      // Only trigger full wash-out at very low speeds with extreme edge
      const washOutThreshold = 0.25 + this.angulation * 0.2;
      if (effectiveOverEdge > washOutThreshold && speed2D < 8 && !this.isWashingOut && !this.isEdgeCaught) {
        this.isWashingOut = true;
        this.washOutIntensity = Math.min(effectiveOverEdge * 2.0 * (1 - angulationProtection), 0.8);
        this.washOutDirection = edgeSign;
      }
    }

    // High speed carving is REWARDED - more grip from speed + edge combo
    if (speed2D > 15 && absEdge > 0.4) {
      const speedCarveBonus = Math.min((speed2D - 15) * 0.005, 0.15);
      speedEdgeGrip += speedCarveBonus;
    }

    speedEdgeGrip = Math.max(speedEdgeGrip, 0.5); // Higher floor for more forgiving feel

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
    // Now includes edge bite and angulation bonuses!
    let calculatedGrip = (baseGrip + edgeGrip + railGrip + biteGrip + angulationGrip) * speedEdgeGrip;

    // Apply snow condition modifier
    // Ice reduces grip, powder increases it
    const snowGripMod = this.currentSnowCondition.gripMultiplier;
    calculatedGrip *= snowGripMod;

    // === FLOW STATE GRIP BONUS ===
    // When in flow, everything feels more locked in
    const flowGripBonus = this.flowState * 0.08;
    calculatedGrip += flowGripBonus;

    let targetGrip = THREE.MathUtils.clamp(calculatedGrip, 0.3, 0.98);

    // === SMOOTH GRIP TRANSITIONS ===
    // Grip changes smoothly to prevent choppy feel
    // Faster response when grip is dropping (safety), slower when building
    const gripChangeRate = targetGrip < this.smoothedGrip ? 8 : 5;
    this.smoothedGrip = THREE.MathUtils.lerp(this.smoothedGrip, targetGrip, gripChangeRate * dt);
    let finalGrip = this.smoothedGrip;

    // === RISK CALCULATION ===
    // Risk increases when: high speed + deep edge + low grip surface
    const speedRisk = Math.max(0, (speed2D - 20) / 30);  // Risk ramps up after 20 m/s
    const edgeRisk = Math.pow(absEdge / 1.0, 2);         // Deeper edges = more risk
    const gripDeficit = Math.max(0, 0.6 - finalGrip);   // Risk if grip is low

    // Speed-edge mismatch risk
    // Adds risk when edge doesn't match speed
    const speedEdgeMismatchRisk = (1 - speedEdgeGrip) * 0.6;

    // Angulation reduces risk at deep edges
    const angulationRiskReduction = this.angulation * edgeRisk * 0.5;

    // Ice massively increases risk
    const conditionRisk = this.currentSnowCondition.type === 'ice' ?
      this.currentSnowCondition.intensity * 0.4 : 0;

    // Combined risk (angulation helps, flow helps)
    let targetRisk = (speedRisk * 0.3 + edgeRisk * 0.2 + gripDeficit * 0.2 +
                      speedEdgeMismatchRisk + conditionRisk - angulationRiskReduction) *
      (1 + speedRisk) * (1 - this.flowState * 0.2);  // Flow reduces overall risk

    // Recovery reduces risk buildup
    if (this.isRecovering) {
      targetRisk *= 0.3;
    }

    // Smooth risk changes
    this.riskLevel = THREE.MathUtils.lerp(this.riskLevel, targetRisk, 5 * dt);
    this.riskLevel = THREE.MathUtils.clamp(this.riskLevel, 0, 1);

    // === HIGH RISK EFFECTS ===
    if (this.riskLevel > 0.5) {
      // Add SMOOTH wobble that increases with risk
      // Use sine waves instead of random for smoother feel
      const wobbleIntensity = (this.riskLevel - 0.5) * 2;
      const time = performance.now() / 1000;
      const wobbleFreq1 = Math.sin(time * 8.3) * 0.6;
      const wobbleFreq2 = Math.sin(time * 12.7) * 0.4;
      const targetWobble = wobbleIntensity * (wobbleFreq1 + wobbleFreq2) * 0.08;

      // Smooth the wobble
      this.wobbleAmount = THREE.MathUtils.lerp(this.wobbleAmount, targetWobble, 10 * dt);

      // Wobble affects heading slightly
      this.headingVelocity += this.wobbleAmount * speed2D * 0.08;

      // At extreme risk, grip fails more (but smoothly)
      if (this.riskLevel > 0.8) {
        const gripPenalty = (this.riskLevel - 0.8) * 0.4; // 0 to 0.08
        finalGrip *= (1 - gripPenalty);
      }
    } else {
      this.wobbleAmount *= 0.85;  // Decay wobble smoothly
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
      // Enhanced by flow state and proper angulation
      const flowBonus = 1 + this.flowState * 0.5;  // Up to 50% more acceleration in flow
      const angulationBonus = 1 + this.angulation * 0.3; // Better form = more efficient
      const carveAccel = normalizedG * this.carveRailStrength * this.carvePerfection * 2.0 *
                          flowBonus * angulationBonus;
      this.velocity.x += forward.x * carveAccel * dt;
      this.velocity.z += forward.z * carveAccel * dt;
    }

    // === BOARD FLEX ENERGY BOOST ===
    // During sustained carves, flex energy provides subtle forward push
    if (this.boardFlex > 0.3 && this.flexEnergy > 0.3) {
      const flexPush = this.flexEnergy * this.boardFlex * 0.5 * dt;
      this.velocity.x += forward.x * flexPush;
      this.velocity.z += forward.z * flexPush;
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

    // === WEIGHT-BASED TUCK ===
    // Leaning forward into a tuck reduces drag for speed
    if (this.input.lean > 0.1) {
      const tuck = this.input.lean;
      const thrust = tuck * 2.0;
      this.velocity.x += forward.x * thrust * dt;
      this.velocity.z += forward.z * thrust * dt;
    }
    // === BRAKING (lean back to slow down) ===
    // Leaning back shifts weight to tail, creating drag and scrubbing speed
    if (this.input.lean < -0.2 && speed2D > 2) {
      const brakeIntensity = Math.abs(this.input.lean + 0.2) / 0.8; // 0-1 based on how far back

      // Brake force scales with speed (more effective at higher speeds)
      const brakePower = brakeIntensity * speed2D * 0.15;

      // Apply deceleration
      this.velocity.x -= (this.velocity.x / speed2D) * brakePower * dt;
      this.velocity.z -= (this.velocity.z / speed2D) * brakePower * dt;

      // Braking reduces carve effectiveness (can't carve while braking hard)
      if (brakeIntensity > 0.5) {
        this.carveRailStrength *= (1 - brakeIntensity * 0.5 * dt * 10);
      }

      // Compression from braking stance
      this.targetCompression = Math.max(this.targetCompression, brakeIntensity * 0.4);
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
    // === JUMP SYSTEM ===
    // Tap = tiny hop, Hold = bigger ollie

    // Base tiny hop (tap space)
    let jumpPower = 2.5;

    // Charge bonus (hold space for bigger jump)
    const chargeBonus = this.jumpCharge * 3.0; // 0-3 extra
    jumpPower += chargeBonus;

    // Weight position affects style (small bonus)
    if (this.weightForward < -0.2) {
      // Tail pop - proper ollie
      jumpPower += 0.5 + Math.abs(this.weightForward) * 0.5;
    }

    // Small speed bonus
    jumpPower += Math.min(speed2D * 0.02, 1.0);

    // Compression snap (small bonus)
    jumpPower += this.compression * 0.5;

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

  // === GRINDING SYSTEM ===
  startGrind(railInfo) {
    this.isGrinding = true;
    this.grindRail = railInfo.rail;
    this.grindProgress = railInfo.progress;
    this.grindBalance = 0;
    this.grindTime = 0;
    this.isGrounded = false; // Not on ground, on rail

    // Lock Y position to rail
    const railY = railInfo.railY;

    // Align heading to rail direction (with some of player's original direction)
    const railAngle = railInfo.rail.angle;
    const headingDiff = this.normalizeAngle(railAngle - this.heading);

    // If approaching from opposite direction, flip rail angle
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

  updateGrindPhysics(dt, pos) {
    if (!this.grindRail) {
      this.endGrind();
      return;
    }

    this.grindTime += dt;
    const rail = this.grindRail;

    // === BALANCE SYSTEM ===
    // Player must balance using steer input
    // Balance drifts based on speed and slight randomness
    const balanceDrift = (Math.random() - 0.5) * 0.5 * dt;
    const speedWobble = (this.currentSpeed / 30) * (Math.random() - 0.5) * dt;
    this.grindBalance += balanceDrift + speedWobble;

    // Steer input corrects balance
    this.grindBalance -= this.input.steer * 3 * dt;

    // Balance affects edge angle visually
    this.edgeAngle = this.grindBalance * 0.8;

    // === CHECK BALANCE FAIL ===
    if (Math.abs(this.grindBalance) > 1.0) {
      // Fell off rail!
      console.log('Lost balance on rail!');
      this.endGrind();

      // Add sideways velocity from falling off
      const right = new THREE.Vector3(
        Math.cos(this.heading),
        0,
        Math.sin(this.heading)
      );
      const fallDir = Math.sign(this.grindBalance);
      this.velocity.x += right.x * fallDir * 3;
      this.velocity.z += right.z * fallDir * 3;
      this.velocity.y = -2; // Start falling
      return;
    }

    // === RAIL MOVEMENT ===
    // Slide along rail with reduced friction
    const grindFriction = 0.995; // Very low friction on rail
    const speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

    // Keep velocity aligned to rail
    const forward = new THREE.Vector3(
      -Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );

    this.velocity.x = forward.x * speed2D * grindFriction;
    this.velocity.z = forward.z * speed2D * grindFriction;

    // Gravity component along rail (if rail is angled down)
    const slopeBoost = 2.0; // Slight acceleration on rails
    this.velocity.x += forward.x * slopeBoost * dt;
    this.velocity.z += forward.z * slopeBoost * dt;

    // Calculate new position along rail
    const railStartZ = rail.z - rail.length / 2;
    const railEndZ = rail.z + rail.length / 2;
    const railX = rail.x + Math.sin(rail.angle) * (pos.z - rail.z);
    const railY = this.terrain.calculateHeight(rail.x, rail.z) + rail.height;

    // Update position - lock to rail
    const newX = railX + this.grindBalance * 0.3; // Slight X wobble from balance
    const newZ = pos.z + this.velocity.z * dt;

    // Check if still on rail
    if (newZ < railStartZ || newZ > railEndZ) {
      // Reached end of rail
      console.log('Grind complete! Style points!');
      this.endGrind();

      // Pop off the end
      this.velocity.y = 3;
      return;
    }

    // Update progress
    this.grindProgress = (newZ - railStartZ) / rail.length;

    // Set position
    this.body.setNextKinematicTranslation({
      x: newX,
      y: railY + 0.15, // Slight offset above rail
      z: newZ
    });

    // Update speed
    this.currentSpeed = Math.sqrt(
      this.velocity.x * this.velocity.x +
      this.velocity.z * this.velocity.z
    );

    // Update visuals
    this.updateMesh();

    // Grind spray/sparks (reuse snow spray with different color intent)
    this.updateSprayParticles(dt, this.currentSpeed * 0.5, true, this.grindBalance);
  }

  endGrind() {
    this.isGrinding = false;
    this.grindRail = null;
    this.grindProgress = 0;
    this.grindBalance = 0;
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

    // Handle GLB model animation separately
    if (this.modelVersion === 3 && this.playerModelGLB) {
      this.animState.carveRailStrength = this.carveRailStrength;
      this.playerModelGLB.applyPose(this.animState, this.edgeAngle, this.isGrounded);
      this.playerModelGLB.update(dt);
      return;
    }

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

    // Forward/back hip shift based on weight distribution
    const hipZ = (frontKnee - backKnee) * 0.05;

    if (this.modelVersion === 2 && this.pelvisGroup) {
      // V2: Animate pelvis group
      this.pelvisGroup.position.y = hipY;
      this.pelvisGroup.position.x = anim.hipShift;
      this.pelvisGroup.position.z = hipZ;
      this.pelvisGroup.rotation.y = anim.counterRotation * 0.3;
    } else {
      // V1: Animate hips mesh directly
      this.hipsMesh.position.y = hipY;
      this.hipsMesh.position.x = anim.hipShift;
      this.hipsMesh.rotation.y = anim.counterRotation * 0.3;
      this.hipsMesh.position.z = hipZ;
    }

    // === LOWER BODY LATERAL SHIFT ===
    this.lowerBodyGroup.position.x = anim.hipShift * 0.5;

    // === UPPER BODY ===
    const upperBodyY = hipY - 0.42; // Offset from hip position
    this.upperBodyGroup.position.y = upperBodyY;
    this.upperBodyGroup.position.x = anim.hipShift * 0.3;

    // Forward lean - more when compressed
    const forwardLean = avgKnee * 0.15 + this.currentSpeed * 0.003;

    // === TORSO - ANGULATION (the key carve look!) ===
    if (this.modelVersion === 2 && this.torsoGroup) {
      // V2: Animate torso group for smoother results
      this.torsoGroup.rotation.z = anim.angulation;
      this.torsoGroup.rotation.y = anim.counterRotation;
      this.torsoGroup.rotation.x = forwardLean;
      this.torsoGroup.position.y = upperBodyY * 0.3;
    } else {
      // V1: Animate torso mesh directly
      this.torsoMesh.rotation.z = anim.angulation;
      this.torsoMesh.rotation.y = anim.counterRotation;
      this.torsoMesh.rotation.x = forwardLean;
      this.torsoMesh.position.y = 0.68 + upperBodyY * 0.3;

      // Shoulders - more counter-rotation than hips
      this.shouldersMesh.rotation.y = anim.counterRotation * 1.5;
      this.shouldersMesh.rotation.z = anim.angulation * 0.8;
      this.shouldersMesh.position.y = 0.86 + upperBodyY * 0.4;
    }

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

    if (this.modelVersion === 2 && this.headGroup) {
      // V2: Animate the head group
      this.headGroup.position.y = upperBodyY * 0.3;
      this.headGroup.rotation.y = anim.headLook;
      this.headGroup.rotation.z = anim.angulation * 0.25;
    } else {
      // V1: Animate individual meshes
      this.headMesh.position.y = headY;
      this.headMesh.rotation.y = anim.headLook;
      this.headMesh.rotation.z = anim.angulation * 0.25;

      this.neckMesh.position.y = headY - 0.1;
      this.neckMesh.rotation.y = anim.headLook * 0.5;

      this.helmetMesh.position.y = headY;
      this.goggleMesh.position.y = headY + 0.01;
    }

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
