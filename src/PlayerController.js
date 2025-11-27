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

    // Snow spray particles
    this.sprayParticles = null;
    this.sprayPositions = null;
    this.sprayVelocities = [];
    this.sprayLifetimes = [];
    this.maxParticles = 200;
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
      const spawnRate = Math.min(speed * 0.3, 8) + (isCarving ? 5 : 0);
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
        const spraySpeed = speed * 0.15 + Math.random() * 2;
        this.sprayVelocities[idx].set(
          boardRight.x * side * spraySpeed + (Math.random() - 0.5) * 1.5,
          1.5 + Math.random() * 2,
          boardRight.z * side * spraySpeed + (Math.random() - 0.5) * 1.5
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

    // Update particle effects
    const isCarving = this.isGrounded && Math.abs(this.edgeAngle) > 0.3;
    this.updateSprayParticles(dt, this.currentSpeed, isCarving, this.edgeAngle);

    // Reset if fallen
    if (pos.y < -250) {
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

    // === WEIGHT TRANSFER SIMULATION ===
    // Weight shifts based on input and current motion
    const targetWeightForward = this.input.lean * 0.8;
    const targetWeightSide = this.input.steer * 0.7;

    // Weight shifts gradually - heavier feel
    this.weightForward = THREE.MathUtils.lerp(this.weightForward, targetWeightForward, 6 * dt);
    this.weightSide = THREE.MathUtils.lerp(this.weightSide, targetWeightSide, 8 * dt);

    // === EDGE ANGLE FROM WEIGHT AND INPUT ===
    // Edge angle is combination of direct input and body position
    const maxEdge = 1.1; // ~63 degrees max
    const inputEdge = this.input.steer * maxEdge;
    const weightEdgeInfluence = this.weightSide * 0.2; // Weight adds subtle edge

    this.targetEdgeAngle = inputEdge + weightEdgeInfluence;

    // Edge transition - faster when unweighting, slower when pressuring
    const unweighting = Math.abs(this.input.lean) > 0.3 && this.input.lean < 0;
    const edgeChanging = Math.sign(this.targetEdgeAngle) !== Math.sign(this.edgeAngle);

    let edgeLerpSpeed;
    if (unweighting && edgeChanging) {
      edgeLerpSpeed = 22; // Fast edge-to-edge when unweighted
    } else if (edgeChanging) {
      edgeLerpSpeed = 14; // Medium when changing edges with weight
    } else {
      edgeLerpSpeed = 10; // Slower when holding edge (committed)
    }

    this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, this.targetEdgeAngle, edgeLerpSpeed * dt);

    const absEdge = Math.abs(this.edgeAngle);
    const edgeSign = Math.sign(this.edgeAngle);

    // === EFFECTIVE PRESSURE (how much the edge bites) ===
    // Forward weight = more front edge bite, back weight = more tail control
    const basePressure = 0.7;
    const weightPressure = Math.abs(this.weightForward) * 0.15;
    const edgePressure = absEdge * 0.2; // More edge = more pressure

    // Speed reduces effective pressure (harder to hold edge at speed)
    const speedPressureLoss = Math.max(0, (speed2D - 20) * 0.008);

    this.effectivePressure = THREE.MathUtils.clamp(
      basePressure + weightPressure + edgePressure - speedPressureLoss,
      0.4, 1.0
    );

    // === CARVED TURN PHYSICS ===
    if (speed2D > 0.3) {
      let targetAngularVel = 0;

      if (absEdge > 0.03) {
        // Turn radius from sidecut geometry
        const sinEdge = Math.sin(absEdge);
        const turnRadius = this.sidecutRadius / Math.max(sinEdge, 0.08);

        // Base angular velocity: v/r
        const baseAngularVel = speed2D / turnRadius;

        // === WEIGHT DISTRIBUTION AFFECTS TURN CHARACTER ===
        // Forward weight: tighter, more aggressive initiation
        // Back weight: looser, more drifty, better for speed scrubbing
        let weightTurnMod = 1.0;
        if (this.weightForward > 0.2) {
          // Nose press - tighter turns, quicker initiation
          weightTurnMod = 1.0 + this.weightForward * 0.4;
        } else if (this.weightForward < -0.2) {
          // Tail press - wider turns, more slide
          weightTurnMod = 1.0 + this.weightForward * 0.2; // Reduces turn rate
        }

        // Pressure affects how much edge angle translates to turning
        const pressureEffect = 0.6 + this.effectivePressure * 0.5;

        // Input intensity - progressive response
        const inputIntensity = Math.pow(Math.abs(this.input.steer), 0.85);
        const inputBoost = 1 + inputIntensity * 0.5;

        targetAngularVel = baseAngularVel * weightTurnMod * pressureEffect * inputBoost * edgeSign;
      }

      // Angular velocity smoothing with momentum
      const angularLerp = absEdge > 0.4 ? 6 : 10; // Deep edge = more committed
      this.headingVelocity = THREE.MathUtils.lerp(this.headingVelocity, targetAngularVel, angularLerp * dt);

      // Max turn rate - speed dependent
      const maxAngularVel = THREE.MathUtils.lerp(3.5, 2.5, Math.min(speed2D / 35, 1));
      this.headingVelocity = THREE.MathUtils.clamp(this.headingVelocity, -maxAngularVel, maxAngularVel);

      this.heading += this.headingVelocity * dt;
    } else {
      // Slow speed - pivot steering
      this.headingVelocity *= 0.85;
      this.heading += this.input.steer * 2.0 * dt;
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

    // === GRIP SYSTEM ===
    // Base grip + edge bonus - speed penalty - turn stress
    const baseGrip = 0.6;
    const edgeGrip = absEdge * this.effectivePressure * 0.4;
    const speedPenalty = Math.max(0, (speed2D - 12) * 0.006);
    const turnStress = Math.abs(this.headingVelocity) * speed2D * 0.002;

    // Tail weight reduces grip (more drifty)
    const weightGripMod = this.weightForward < -0.3 ? Math.abs(this.weightForward) * 0.15 : 0;

    let finalGrip = baseGrip + edgeGrip - speedPenalty - turnStress - weightGripMod;
    finalGrip = THREE.MathUtils.clamp(finalGrip, 0.35, 0.97);

    // Apply grip
    const newLateralSpeed = lateralSpeed * (1 - finalGrip);

    // === RECONSTRUCT VELOCITY ===
    this.velocity.x = forward.x * forwardSpeed + right.x * newLateralSpeed;
    this.velocity.z = forward.z * forwardSpeed + right.z * newLateralSpeed;

    // === GRAVITY ===
    this.velocity.x += slopeDir.x * gravityAccel * dt;
    this.velocity.z += slopeDir.z * gravityAccel * dt;

    // === DRAG ===
    const baseDrag = 0.9985;
    const carveDrag = absEdge * 0.0015;
    const slideDrag = Math.abs(this.slipAngle) * 0.004;
    const drag = baseDrag - carveDrag - slideDrag;
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
      // Stand up / brake
      const brakeStrength = Math.abs(this.input.lean);
      const brakeFactor = 1 - brakeStrength * dt * 4;
      this.velocity.x *= brakeFactor;
      this.velocity.z *= brakeFactor;
    }

    // === SPEED LIMITS ===
    const maxSpeed = 55;
    if (speed2D > maxSpeed) {
      const scale = maxSpeed / speed2D;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // === GROUND FOLLOWING ===
    this.updateGroundFollowing(pos, speed2D, dt);

    // === JUMP ===
    if (this.input.jump) {
      this.initiateJump(speed2D, forward);
    }

    // Reset air rotation when grounded
    this.pitch = THREE.MathUtils.lerp(this.pitch, 0, 5 * dt);
    this.roll = THREE.MathUtils.lerp(this.roll, 0, 5 * dt);
    this.pitchVelocity *= 0.9;
    this.rollVelocity *= 0.9;

    // Store spin momentum for jumps
    this.spinVelocity = this.headingVelocity * 0.3;
  }

  updateGroundFollowing(pos, speed2D, dt) {
    const targetY = this.groundHeight + 0.12;
    const yDiff = targetY - pos.y;

    // Much smoother ground following - use smooth interpolation
    // Higher speed = smoother to prevent jitter from terrain detail
    const smoothFactor = THREE.MathUtils.lerp(0.15, 0.08, Math.min(speed2D / 30, 1));

    if (yDiff > 0.01) {
      // Below target - smoothly rise
      // Use smooth interpolation instead of direct velocity assignment
      const targetVelY = yDiff * 8;
      this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, targetVelY, smoothFactor);
    } else if (yDiff > -0.2) {
      // Near target or slightly above - very gentle correction
      const targetVelY = yDiff * 5;
      this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, targetVelY, smoothFactor * 0.5);
    } else if (yDiff > -0.8) {
      // Above ground but not airborne - let gravity work
      this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -2, 0.1);
    }
    // If more than 0.8m above ground, we're airborne - handled by air physics
  }

  initiateJump(speed2D, forward) {
    // Jump power based on weight position
    // Nose weight = smaller pop, tail weight = bigger pop (ollie style)
    let jumpPower = 6.0;

    if (this.weightForward < -0.2) {
      // Tail pop - proper ollie
      jumpPower = 7.5 + Math.abs(this.weightForward) * 2;
    } else if (this.weightForward > 0.3) {
      // Nose pop - nollie
      jumpPower = 5.5;
    }

    // Speed bonus
    jumpPower += Math.min(speed2D * 0.04, 1.5);

    this.velocity.y = jumpPower;

    // Forward momentum from tuck
    if (this.input.lean > 0.2) {
      this.velocity.x += forward.x * 1.5;
      this.velocity.z += forward.z * 1.5;
    }

    // Carry spin momentum into air
    this.spinVelocity = this.headingVelocity * 0.5;

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
    // Wider sample for more stable normal at speed
    const speed2D = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    const sampleDist = THREE.MathUtils.lerp(0.6, 1.2, Math.min(speed2D / 25, 1));

    // Board-relative offsets
    const cosH = Math.cos(this.heading);
    const sinH = Math.sin(this.heading);

    // Transform local offsets to world space based on heading
    const localOffsets = [
      { x: 0, z: sampleDist },   // front of board
      { x: 0, z: -sampleDist },  // back of board
      { x: sampleDist * 0.7, z: 0 }    // side (narrower)
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

      // Much smoother normal interpolation - higher speed = slower changes
      // This prevents the visual jitter from rapid normal changes
      const lerpFactor = THREE.MathUtils.lerp(0.08, 0.03, Math.min(speed2D / 25, 1));

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

    if (this.isGrounded) {
      // === GROUNDED: Align to terrain + edge angle ===

      // Step 1: Heading rotation
      const headingQuat = new THREE.Quaternion();
      headingQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.heading);

      // Step 2: Slope alignment
      const worldUp = new THREE.Vector3(0, 1, 0);
      const slopeQuat = new THREE.Quaternion();
      slopeQuat.setFromUnitVectors(worldUp, this.groundNormal);

      // Combine
      this.mesh.quaternion.copy(headingQuat);
      this.mesh.quaternion.premultiply(slopeQuat);

      // Step 3: Edge angle (carving tilt)
      if (Math.abs(this.edgeAngle) > 0.001) {
        const boardForward = new THREE.Vector3(0, 0, 1);
        boardForward.applyQuaternion(this.mesh.quaternion);

        const edgeQuat = new THREE.Quaternion();
        edgeQuat.setFromAxisAngle(boardForward, this.edgeAngle);
        this.mesh.quaternion.premultiply(edgeQuat);
      }

      // Step 4: Subtle weight shift visual (nose/tail press)
      if (Math.abs(this.weightForward) > 0.1) {
        const boardRight = new THREE.Vector3(1, 0, 0);
        boardRight.applyQuaternion(this.mesh.quaternion);

        const pressQuat = new THREE.Quaternion();
        pressQuat.setFromAxisAngle(boardRight, this.weightForward * 0.15);
        this.mesh.quaternion.premultiply(pressQuat);
      }
    } else {
      // === AIRBORNE: Full rotation control ===

      // Build rotation from Euler angles for air tricks
      const euler = new THREE.Euler(
        this.pitch,           // X: front/back flip
        -this.heading,        // Y: spin
        this.roll,            // Z: barrel roll
        'YXZ'                 // Rotation order
      );
      this.mesh.quaternion.setFromEuler(euler);

      // Add edge angle styling
      if (Math.abs(this.edgeAngle) > 0.001) {
        const boardForward = new THREE.Vector3(0, 0, 1);
        boardForward.applyQuaternion(this.mesh.quaternion);

        const edgeQuat = new THREE.Quaternion();
        edgeQuat.setFromAxisAngle(boardForward, this.edgeAngle);
        this.mesh.quaternion.premultiply(edgeQuat);
      }
    }

    // Collider mesh follows
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
