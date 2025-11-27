import * as THREE from 'three';

export class PlayerController {
  constructor(sceneManager, physicsWorld) {
    this.sceneManager = sceneManager;
    this.physicsWorld = physicsWorld;

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
    this.sidecutRadius = 8; // meters - more aggressive for responsive turning

    // Edge angle limits
    this.maxEdgeAngleLowSpeed = 1.1; // ~63 degrees at low speed
    this.maxEdgeAngleHighSpeed = 0.5; // ~29 degrees at high speed
    this.highSpeedThreshold = 30; // m/s where we reach max restriction

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

    // Collider mesh for debug
    this.colliderMesh = null;
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
  }

  createVisualMesh() {
    // Board
    const boardGeometry = new THREE.BoxGeometry(this.boardWidth, 0.03, this.boardLength);
    const boardMaterial = new THREE.MeshLambertMaterial({ color: 0x1a4d8c });
    this.boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);

    // Rider
    const riderGeometry = new THREE.CapsuleGeometry(0.12, 0.65, 4, 8);
    const riderMaterial = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
    const riderMesh = new THREE.Mesh(riderGeometry, riderMaterial);
    riderMesh.position.y = 0.5;

    this.mesh = new THREE.Group();
    this.mesh.add(this.boardMesh);
    this.mesh.add(riderMesh);
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
    } else {
      this.updateAirPhysics(dt, pos);
    }

    // Update physics body position
    this.body.setNextKinematicTranslation({
      x: pos.x + this.velocity.x * dt,
      y: pos.y + this.velocity.y * dt,
      z: pos.z + this.velocity.z * dt
    });

    // Calculate speed
    this.currentSpeed = Math.sqrt(
      this.velocity.x * this.velocity.x +
      this.velocity.z * this.velocity.z
    );

    // Update visuals
    this.updateMesh();

    // Reset if fallen
    if (pos.y < -250) {
      this.reset();
    }
  }

  onLanding(dt) {
    // Landing impact - absorb some vertical velocity
    const impactSpeed = Math.abs(this.velocity.y);

    if (impactSpeed > 15) {
      // Hard landing - lose some speed
      const speedLoss = (impactSpeed - 15) * 0.03;
      this.velocity.x *= (1 - speedLoss);
      this.velocity.z *= (1 - speedLoss);
    }

    // Landing while turning - slight speed boost if aligned well
    const speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (speed2D > 5 && Math.abs(this.slipAngle) < 0.3) {
      // Clean landing bonus
      const forward = new THREE.Vector3(
        -Math.sin(this.heading),
        0,
        Math.cos(this.heading)
      );
      this.velocity.x += forward.x * 0.5;
      this.velocity.z += forward.z * 0.5;
    }

    this.velocity.y = 0;
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

    // === EDGE ANGLE WITH MOMENTUM ===
    const maxEdge = 1.05; // ~60 degrees max
    this.targetEdgeAngle = this.input.steer * maxEdge;

    // Edge transition speed - faster when changing direction, slower when holding
    const edgeChanging = Math.sign(this.targetEdgeAngle) !== Math.sign(this.edgeAngle);
    const edgeLerpSpeed = edgeChanging ? 18 : 12; // Faster edge-to-edge transitions

    this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, this.targetEdgeAngle, edgeLerpSpeed * dt);

    const absEdge = Math.abs(this.edgeAngle);
    const edgeSign = Math.sign(this.edgeAngle);

    // === CARVED TURN PHYSICS WITH MOMENTUM ===
    if (speed2D > 0.3) {
      let targetAngularVel = 0;

      if (absEdge > 0.03) {
        // Calculate turn radius from edge angle (sidecut geometry)
        const sinEdge = Math.sin(absEdge);
        const turnRadius = this.sidecutRadius / Math.max(sinEdge, 0.08);

        // Base angular velocity from physics: v/r
        const baseAngularVel = speed2D / turnRadius;

        // Speed affects turn feel:
        // - Low speed: more direct, responsive
        // - High speed: smoother, more committed turns
        const speedFactor = THREE.MathUtils.lerp(1.3, 0.9, Math.min(speed2D / 35, 1));

        // Input intensity boost - harder input = tighter turn
        const inputIntensity = Math.pow(Math.abs(this.input.steer), 0.8);
        const inputBoost = 1 + inputIntensity * 0.6;

        // Lean affects turn initiation - forward lean helps initiate
        const leanBoost = this.input.lean > 0.2 ? 1 + this.input.lean * 0.3 : 1;

        targetAngularVel = baseAngularVel * speedFactor * inputBoost * leanBoost * edgeSign;
      }

      // Smooth angular velocity with momentum (prevents jerky turns)
      const angularLerp = absEdge > 0.3 ? 8 : 12; // Committed edge = more momentum
      this.headingVelocity = THREE.MathUtils.lerp(this.headingVelocity, targetAngularVel, angularLerp * dt);

      // Clamp max turn rate
      const maxAngularVel = 3.2;
      this.headingVelocity = THREE.MathUtils.clamp(this.headingVelocity, -maxAngularVel, maxAngularVel);

      this.heading += this.headingVelocity * dt;
    } else {
      // Slow speed - direct steering for control
      this.headingVelocity *= 0.9;
      this.heading += this.input.steer * 1.5 * dt;
    }

    // === GRAVITY / SLOPE ACCELERATION ===
    const slopeDir = this.getSlopeDirection();
    const slopeSteepness = 1 - this.groundNormal.y;
    const gravityAccel = g * slopeSteepness * 5.5;

    // === VELOCITY COMPONENTS ===
    const forwardSpeed = this.velocity.dot(forward);
    const lateralSpeed = this.velocity.dot(right);

    // Track slip angle for feedback
    if (speed2D > 1) {
      const velDir = Math.atan2(-this.velocity.x, this.velocity.z);
      this.slipAngle = this.normalizeAngle(velDir - this.heading);
    }

    // === GRIP BASED ON EDGE ANGLE AND SPEED ===
    // More edge = more grip, but speed creates forces that can break grip
    const baseGrip = 0.65;
    const edgeGripBonus = absEdge * 0.35; // Edge adds up to 35% more grip
    const speedGripPenalty = Math.max(0, (speed2D - 15) * 0.008);

    // Sharp turns at high speed can break traction
    const turnStress = Math.abs(this.headingVelocity) * speed2D * 0.003;

    let finalGrip = baseGrip + edgeGripBonus - speedGripPenalty - turnStress;
    finalGrip = THREE.MathUtils.clamp(finalGrip, 0.4, 0.98);

    // Apply grip - reduce lateral velocity
    const newLateralSpeed = lateralSpeed * (1 - finalGrip);

    // === RECONSTRUCT VELOCITY ===
    this.velocity.x = forward.x * forwardSpeed + right.x * newLateralSpeed;
    this.velocity.z = forward.z * forwardSpeed + right.z * newLateralSpeed;

    // === APPLY GRAVITY ===
    this.velocity.x += slopeDir.x * gravityAccel * dt;
    this.velocity.z += slopeDir.z * gravityAccel * dt;

    // === DRAG - Edge and carving affects resistance ===
    // Flat base = fastest, carving = some resistance, sliding = most resistance
    const baseDrag = 0.998;
    const carveDrag = absEdge * 0.002;
    const slideDrag = Math.abs(this.slipAngle) * 0.005;
    const drag = baseDrag - carveDrag - slideDrag;
    this.velocity.x *= drag;
    this.velocity.z *= drag;

    // === RIDER INPUT: LEAN (tuck/brake) ===
    if (this.input.lean > 0.1) {
      // Tuck forward - reduces drag, slight acceleration feel
      const thrust = this.input.lean * 2.5;
      this.velocity.x += forward.x * thrust * dt;
      this.velocity.z += forward.z * thrust * dt;
    }

    if (this.input.lean < -0.1) {
      // Lean back / brake - apply friction
      const brakeStrength = Math.abs(this.input.lean);
      const brakeFactor = 1 - brakeStrength * dt * 5;
      this.velocity.x *= brakeFactor;
      this.velocity.z *= brakeFactor;
    }

    // === SPEED LIMITS ===
    const maxSpeed = 50;
    if (speed2D > maxSpeed) {
      const scale = maxSpeed / speed2D;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // === GROUND FOLLOWING ===
    const targetY = this.groundHeight + 0.15;
    const yDiff = targetY - pos.y;

    // Smoother ground following with speed-based response
    const groundResponse = 15 + speed2D * 0.5;
    if (yDiff > 0) {
      this.velocity.y = yDiff * groundResponse;
    } else if (yDiff > -0.5) {
      this.velocity.y = yDiff * groundResponse * 0.6;
    }

    // === JUMP - Ollie with speed boost ===
    if (this.input.jump) {
      // Jump power scales slightly with speed
      const jumpPower = 6.5 + Math.min(speed2D * 0.05, 1.5);
      this.velocity.y = jumpPower;

      // Small forward boost when jumping
      if (this.input.lean > 0) {
        this.velocity.x += forward.x * 2;
        this.velocity.z += forward.z * 2;
      }

      this.input.jump = false;
    }
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

    // Gravity - slightly floaty for game feel
    const gravity = 18;
    this.velocity.y -= gravity * dt;

    // === AIR CONTROL ===
    // Spins! More control when tucked
    const spinRate = 2.5;
    const tuckBonus = this.input.lean > 0.3 ? 1 + this.input.lean * 0.5 : 1;

    if (Math.abs(this.input.steer) > 0.1) {
      this.heading += this.input.steer * spinRate * tuckBonus * dt;
      // Also rotate edge angle for style
      this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, this.input.steer * 0.5, 3 * dt);
    } else {
      // Edge relaxes when not steering
      this.edgeAngle *= 0.92;
    }

    // Forward/back flip influence (subtle)
    if (Math.abs(this.input.lean) > 0.3) {
      // Small pitch adjustment for tricks
      const pitchInfluence = this.input.lean * 0.5 * dt;
      // This affects landing - could add proper rotation later
    }

    // Minimal air drag
    this.velocity.x *= 0.998;
    this.velocity.z *= 0.998;

    // Terminal velocity
    if (this.velocity.y < -35) {
      this.velocity.y = -35;
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
    // Sample points along board direction for better terrain following
    const sampleDist = 0.7;

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

      // Speed-adaptive smoothing - faster = smoother to prevent jitter
      const speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      const lerpFactor = THREE.MathUtils.lerp(0.2, 0.1, Math.min(speed2D / 30, 1));

      this.groundNormal.lerp(normal, lerpFactor);
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

    // Method based on research: Quaternion.FromToRotation approach
    // Step 1: Create heading rotation (around world Y axis)
    const headingQuat = new THREE.Quaternion();
    headingQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.heading);

    // Step 2: Create slope alignment rotation
    // This rotates from world-up to ground normal
    const worldUp = new THREE.Vector3(0, 1, 0);
    const slopeQuat = new THREE.Quaternion();
    slopeQuat.setFromUnitVectors(worldUp, this.groundNormal);

    // Step 3: Combine rotations
    // Apply heading first, then tilt to match slope
    // Final = slopeQuat * headingQuat
    this.mesh.quaternion.copy(headingQuat);
    this.mesh.quaternion.premultiply(slopeQuat);

    // Step 4: Apply edge angle (carving tilt) around board's forward axis
    if (Math.abs(this.edgeAngle) > 0.001) {
      // Get board's forward direction in world space
      const boardForward = new THREE.Vector3(0, 0, 1);
      boardForward.applyQuaternion(this.mesh.quaternion);

      const edgeQuat = new THREE.Quaternion();
      edgeQuat.setFromAxisAngle(boardForward, this.edgeAngle);
      this.mesh.quaternion.premultiply(edgeQuat);
    }

    // Collider mesh
    this.colliderMesh.position.copy(this.mesh.position);
    this.colliderMesh.quaternion.copy(this.mesh.quaternion);
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
