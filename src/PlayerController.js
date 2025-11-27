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
    this.headingVelocity = 0; // Track angular velocity for damping
    this.edgeAngle = 0; // Current edge tilt (radians, + = toeside, - = heelside)
    this.slipAngle = 0; // Angle between velocity and board heading
    this.isGrounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.groundHeight = 0;

    this.startPosition = { x: 0, y: 5, z: 0 };
    this.currentSpeed = 0;

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

    // Ground detection
    this.checkGround(pos);

    if (this.isGrounded) {
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

  updateGroundedPhysics(dt, pos) {
    const g = 9.81;

    // === CURRENT SPEED ===
    const speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

    // === BOARD DIRECTION VECTORS ===
    // Note: Using negative sin to match THREE.js rotation convention
    // (positive heading = counter-clockwise rotation when viewed from above)
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

    // === SIMPLE EDGE ANGLE FROM INPUT ===
    // Direct mapping: steer input -> edge angle
    const maxEdge = 0.8; // ~46 degrees max
    const targetEdge = this.input.steer * maxEdge;

    // Smooth but responsive edge transitions
    this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, targetEdge, 10 * dt);

    const absEdge = Math.abs(this.edgeAngle);

    // === SIMPLE TURNING ===
    // Turn rate proportional to edge angle and speed
    if (speed2D > 0.3) {
      // Base turn rate
      const turnRate = this.input.steer * 2.0;

      // Speed affects turn feel
      const speedMod = Math.min(1.5, 0.5 + speed2D * 0.05);

      this.heading += turnRate * speedMod * dt;
    }

    // === GRAVITY / SLOPE ACCELERATION ===
    const slopeDir = this.getSlopeDirection();
    const slopeSteepness = 1 - this.groundNormal.y;
    const gravityAccel = g * slopeSteepness * 6;

    // === VELOCITY HANDLING ===
    // Split into forward and lateral components
    const forwardSpeed = this.velocity.dot(forward);
    const lateralSpeed = this.velocity.dot(right);

    // Lateral grip: edge angle increases grip
    // More edge = velocity follows board direction more closely
    const lateralGrip = 0.85 + absEdge * 0.1; // 85-95% grip
    const adjustedLateral = lateralSpeed * (1 - lateralGrip);

    // Reconstruct velocity - mostly follows board direction
    this.velocity.x = forward.x * forwardSpeed + right.x * adjustedLateral;
    this.velocity.z = forward.z * forwardSpeed + right.z * adjustedLateral;

    // === APPLY GRAVITY ===
    this.velocity.x += slopeDir.x * gravityAccel * dt;
    this.velocity.z += slopeDir.z * gravityAccel * dt;

    // === SIMPLE DRAG ===
    const drag = 0.995;
    this.velocity.x *= drag;
    this.velocity.z *= drag;

    // === RIDER INPUT: LEAN ===
    if (this.input.lean > 0.1) {
      const thrust = this.input.lean * 4;
      this.velocity.x += forward.x * thrust * dt;
      this.velocity.z += forward.z * thrust * dt;
    }

    if (this.input.lean < -0.1) {
      const brakeStrength = Math.abs(this.input.lean) * 0.8;
      const brakeFactor = 1 - brakeStrength * dt * 3;
      this.velocity.x *= brakeFactor;
      this.velocity.z *= brakeFactor;
    }

    // === SPEED LIMITS ===
    const maxSpeed = 40;
    if (speed2D > maxSpeed) {
      const scale = maxSpeed / speed2D;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // === GROUND FOLLOWING ===
    const targetY = this.groundHeight + 0.15;
    const yDiff = targetY - pos.y;

    if (yDiff > 0) {
      this.velocity.y = yDiff * 20;
    } else if (yDiff > -0.5) {
      this.velocity.y = yDiff * 10;
    }

    // === JUMP ===
    if (this.input.jump) {
      this.velocity.y = 6;
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
    // Simple air physics
    this.velocity.y -= 20 * dt; // Gravity (slightly higher for snappy feel)

    // Maintain some air control
    if (Math.abs(this.input.steer) > 0.1) {
      this.heading += this.input.steer * 1.5 * dt;
    }

    // Air drag
    this.velocity.x *= 0.995;
    this.velocity.z *= 0.995;

    // Edge angle relaxes in air
    this.edgeAngle *= 0.95;
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
    // Sample 3 points: center-front, center-back, and center
    // This gives us a plane that represents the local terrain slope
    const sampleDist = 0.6; // Half board length

    const points = [];
    const offsets = [
      { x: 0, z: sampleDist },   // front
      { x: 0, z: -sampleDist },  // back
      { x: sampleDist, z: 0 }    // right side
    ];

    for (const offset of offsets) {
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
      // Calculate normal from the 3 points using cross product
      // v1 = back - front, v2 = right - front
      const v1 = points[1].clone().sub(points[0]); // back to front vector
      const v2 = points[2].clone().sub(points[0]); // right to front vector

      // Normal = v2 × v1 (order matters for correct "up" direction)
      const normal = new THREE.Vector3().crossVectors(v2, v1).normalize();

      // Ensure normal points upward
      if (normal.y < 0) normal.negate();

      // Smooth interpolation to avoid jitter (research recommends this)
      this.groundNormal.lerp(normal, 0.15);
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
    this.slipAngle = 0;
    this.currentSpeed = 0;
    this.isGrounded = false;
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
