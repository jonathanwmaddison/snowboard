import * as THREE from 'three';
import { PlayerModelGLB } from './PlayerModelGLB.js';
import { createSnowboardGeometry } from './SnowboardGeometry.js';

/**
 * PlayerAnimation - Animation state, visual updates, mesh creation, and particles
 */

/**
 * Initialize default animation state
 * @returns {Object} Animation state object
 */
export function createAnimState() {
  return {
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
}

/**
 * Create visual mesh - delegates to GLB or placeholder
 */
export function createVisualMesh() {
  if (this.playerModelGLB && this.playerModelGLB.loaded) {
    createVisualMeshGLB.call(this);
  } else {
    createPlaceholderMesh.call(this);
  }
}

/**
 * Create placeholder mesh until GLB loads
 */
export function createPlaceholderMesh() {
  const boardGeometry = createSnowboardGeometry();
  const boardMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.4,
    metalness: 0.2,
  });
  this.boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);

  this.animState = createAnimState();

  this.mesh = new THREE.Group();
  this.mesh.add(this.boardMesh);

  // Simple capsule placeholder for rider
  const riderGeometry = new THREE.CapsuleGeometry(0.2, 1.0, 4, 8);
  const riderMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
  const riderMesh = new THREE.Mesh(riderGeometry, riderMaterial);
  riderMesh.position.y = 0.7;
  this.mesh.add(riderMesh);

  this.riderGroup = riderMesh;
  this.lowerBodyGroup = new THREE.Group();
  this.upperBodyGroup = new THREE.Group();

  this.sceneManager.add(this.mesh);
}

/**
 * Create visual mesh with GLB model
 */
export function createVisualMeshGLB() {
  if (!this.playerModelGLB || !this.playerModelGLB.loaded) {
    console.warn('GLB model not loaded');
    return;
  }

  const boardGeometry = createSnowboardGeometry();
  const boardMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.4,
    metalness: 0.2,
  });
  this.boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);

  this.animState = createAnimState();

  this.mesh = new THREE.Group();
  this.mesh.add(this.boardMesh);

  // Position character on board
  const characterGroup = this.playerModelGLB.mesh;
  characterGroup.position.set(0, 0.006, 0);
  characterGroup.rotation.set(0, 0, 0);
  this.mesh.add(characterGroup);

  // Set up dummy groups for compatibility
  this.riderGroup = characterGroup;
  this.lowerBodyGroup = new THREE.Group();
  this.upperBodyGroup = new THREE.Group();

  // Apply initial snowboard stance
  this.playerModelGLB.applySnowboardStance();

  this.sceneManager.add(this.mesh);
  console.log('GLB mesh added to scene, children:', this.mesh.children.length);
}

/**
 * Load GLB model
 * @param {string} url - URL of the GLB model
 * @returns {Promise<PlayerModelGLB>}
 */
export async function loadGLBModel(url) {
  console.log('Loading GLB model:', url);
  this.glbModelUrl = url;

  // Clean up existing mesh
  if (this.mesh) {
    this.sceneManager.scene.remove(this.mesh);
    this.mesh = null;
  }
  if (this.playerModelGLB) {
    this.playerModelGLB.dispose();
    this.playerModelGLB = null;
  }

  // Load the new model
  this.playerModelGLB = new PlayerModelGLB();
  await this.playerModelGLB.load(url);

  console.log('GLB loaded, mapped bones:', Object.keys(this.playerModelGLB.bones));

  // Create the visual mesh with the loaded model
  createVisualMeshGLB.call(this);

  // Re-sync position
  if (this.body) {
    const pos = this.body.translation();
    this.mesh.position.set(pos.x, pos.y, pos.z);
    this.mesh.rotation.y = this.heading;
  }

  console.log('GLB model loaded and active at position:', this.mesh.position);
  return this.playerModelGLB;
}

/**
 * Create collider mesh for debug visualization
 */
export function createColliderMesh() {
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

/**
 * Create spray particle system
 */
export function createSprayParticles() {
  const geometry = new THREE.BufferGeometry();

  this.sprayPositions = new Float32Array(this.maxParticles * 3);
  const sizes = new Float32Array(this.maxParticles);

  for (let i = 0; i < this.maxParticles; i++) {
    this.sprayPositions[i * 3] = 0;
    this.sprayPositions[i * 3 + 1] = -1000;
    this.sprayPositions[i * 3 + 2] = 0;
    sizes[i] = 0;

    this.sprayVelocities.push(new THREE.Vector3());
    this.sprayLifetimes.push(0);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(this.sprayPositions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

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

/**
 * Update spray particles
 * @param {number} dt - Delta time
 * @param {number} speed - Current speed
 * @param {boolean} isCarving - Whether currently carving
 * @param {number} edgeAngle - Current edge angle
 */
export function updateSprayParticles(dt, speed, isCarving, edgeAngle) {
  if (!this.sprayParticles) return;

  const pos = this.body.translation();
  const positions = this.sprayParticles.geometry.attributes.position.array;
  const sizes = this.sprayParticles.geometry.attributes.size.array;

  // Spawn new particles when grounded and moving
  if (this.isGrounded && speed > 3) {
    const carveIntensity = isCarving ? (Math.abs(edgeAngle) * 2 + this.carveRailStrength * 3) : 0;
    const spawnRate = Math.min(speed * 0.4, 10) + carveIntensity * 4;
    const particlesToSpawn = Math.floor(spawnRate * dt * 60);

    for (let i = 0; i < particlesToSpawn; i++) {
      const idx = this.nextParticleIndex;
      this.nextParticleIndex = (this.nextParticleIndex + 1) % this.maxParticles;

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

      // Spawn position
      const spawnX = pos.x + boardRight.x * side * 0.2 + boardBack.x * 0.5 + (Math.random() - 0.5) * 0.3;
      const spawnY = pos.y + 0.05;
      const spawnZ = pos.z + boardRight.z * side * 0.2 + boardBack.z * 0.5 + (Math.random() - 0.5) * 0.3;

      positions[idx * 3] = spawnX;
      positions[idx * 3 + 1] = spawnY;
      positions[idx * 3 + 2] = spawnZ;

      // Velocity
      const carveBoost = isCarving ? 1 + this.carveRailStrength * 1.5 : 1;
      const spraySpeed = (speed * 0.2 + Math.random() * 2.5) * carveBoost;
      this.sprayVelocities[idx].set(
        boardRight.x * side * spraySpeed + (Math.random() - 0.5) * 2,
        (1.5 + Math.random() * 2.5) * carveBoost,
        boardRight.z * side * spraySpeed + (Math.random() - 0.5) * 2
      );

      // Add board velocity
      this.sprayVelocities[idx].x -= this.velocity.x * 0.1;
      this.sprayVelocities[idx].z -= this.velocity.z * 0.1;

      this.sprayLifetimes[idx] = 0.4 + Math.random() * 0.4;
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

/**
 * Update mesh position and orientation
 */
export function updateMesh() {
  const pos = this.body.translation();
  this.mesh.position.set(pos.x, pos.y, pos.z);

  if (!this.animState) return;

  const dt = 0.016;
  const speed2D = this.currentSpeed;
  const absEdge = Math.abs(this.edgeAngle);
  const edgeSign = Math.sign(this.edgeAngle);

  // Update animation state
  updateAnimationState.call(this, dt, speed2D, absEdge, edgeSign);

  // Apply rider animation
  applyRiderAnimation.call(this, dt);

  // Board orientation
  if (this.isGrounded) {
    // Heading rotation
    const headingQuat = new THREE.Quaternion();
    headingQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.heading);

    // Slope alignment
    const worldUp = new THREE.Vector3(0, 1, 0);
    const slopeQuat = new THREE.Quaternion();
    slopeQuat.setFromUnitVectors(worldUp, this.groundNormal);

    this.mesh.quaternion.copy(headingQuat);
    this.mesh.quaternion.premultiply(slopeQuat);

    // Edge angle tilt
    if (absEdge > 0.001) {
      const boardForward = new THREE.Vector3(0, 0, 1);
      boardForward.applyQuaternion(this.mesh.quaternion);

      const edgeQuat = new THREE.Quaternion();
      edgeQuat.setFromAxisAngle(boardForward, this.edgeAngle);
      this.mesh.quaternion.premultiply(edgeQuat);
    }

    // Weight shift
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

/**
 * Update animation state based on physics
 * @param {number} dt - Delta time
 * @param {number} speed2D - Current 2D speed
 * @param {number} absEdge - Absolute edge angle
 * @param {number} edgeSign - Sign of edge angle
 */
export function updateAnimationState(dt, speed2D, absEdge, edgeSign) {
  const anim = this.animState;

  // G-force calculation
  let gForce = 1.0;
  if (absEdge > 0.1 && speed2D > 3) {
    const turnRadius = this.sidecutRadius / Math.max(Math.sin(absEdge), 0.1);
    const lateralG = (speed2D * speed2D) / (turnRadius * 9.81);
    gForce = Math.sqrt(1 + lateralG * lateralG);
  }

  anim.gForceCompression = THREE.MathUtils.lerp(anim.gForceCompression, gForce, 12 * dt);

  // Leg compression from G-force
  const minKneeAngle = 0.6;
  const maxKneeAngle = 1.9;

  const speedBend = Math.min(speed2D / 20, 1) * 0.25;
  const gCompression = Math.min((anim.gForceCompression - 1) * 0.7, 0.9);
  let baseKneeAngle = minKneeAngle + speedBend + gCompression * (maxKneeAngle - minKneeAngle);
  baseKneeAngle += this.compression * 0.5;

  // Front vs back leg differential
  const weightShift = edgeSign * absEdge * 0.55;
  const speedMod = Math.min(speed2D / 12, 1);

  anim.targetFrontKnee = baseKneeAngle + weightShift * speedMod;
  anim.targetBackKnee = baseKneeAngle - weightShift * speedMod * 0.85;

  anim.targetFrontKnee = THREE.MathUtils.clamp(anim.targetFrontKnee, minKneeAngle, maxKneeAngle);
  anim.targetBackKnee = THREE.MathUtils.clamp(anim.targetBackKnee, minKneeAngle, maxKneeAngle);

  // Braking stance
  if (this.input.lean < -0.1) {
    const brakeAmount = Math.abs(this.input.lean);
    anim.targetBackKnee -= brakeAmount * 0.25;
    anim.targetFrontKnee += brakeAmount * 0.15;
  }

  // Edge transition "pop"
  if (this.edgeTransitionBoost > 0.3) {
    const popExtend = this.edgeTransitionBoost * 0.5;
    anim.targetFrontKnee -= popExtend;
    anim.targetBackKnee -= popExtend;
  }

  // Ankle flex
  if (edgeSign > 0) {
    anim.targetFrontAnkle = 0.25 + absEdge * 0.3;
    anim.targetBackAnkle = 0.15 + absEdge * 0.2;
  } else if (edgeSign < 0) {
    anim.targetFrontAnkle = 0.1 - absEdge * 0.1;
    anim.targetBackAnkle = 0.05 - absEdge * 0.15;
  } else {
    anim.targetFrontAnkle = 0.15;
    anim.targetBackAnkle = 0.1;
  }

  // Hip height
  const avgKnee = (anim.targetFrontKnee + anim.targetBackKnee) / 2;
  anim.targetHipHeight = 0.55 - avgKnee * 0.15;

  // Hip lateral shift
  const targetHipShift = edgeSign * absEdge * 0.12 * speedMod;
  anim.hipShift = THREE.MathUtils.lerp(anim.hipShift, targetHipShift, 10 * dt);

  // Leg spread
  anim.legSpread = THREE.MathUtils.lerp(anim.legSpread, -edgeSign * absEdge * 0.15, 8 * dt);

  // Angulation
  const speedFactor = Math.min(speed2D / 20, 1);
  const carveIntensity = absEdge * this.carveRailStrength;

  anim.targetAngulation = -edgeSign * absEdge * 0.5 * (0.5 + speedFactor * 0.5);
  anim.targetAngulation *= (1 + (anim.gForceCompression - 1) * 0.3);

  if (this.carveRailStrength > 0.5) {
    anim.targetAngulation *= 1 + this.carveRailStrength * 0.4;
  }

  // Counter-rotation
  const turnRate = this.headingVelocity;
  anim.targetCounterRotation = -turnRate * 0.15;

  if (absEdge > 0.3 && this.carveHoldTime > 0.3) {
    anim.targetCounterRotation += edgeSign * 0.25;
  }

  // Head look
  anim.targetHeadLook = -edgeSign * 0.35 + turnRate * 0.1;
  if (this.carveRailStrength > 0.3) {
    anim.targetHeadLook -= edgeSign * 0.2;
  }

  // Arm dynamics
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

  // Style flair
  if (this.carveChainCount > 2) {
    anim.styleFlair = Math.min(anim.styleFlair + dt * 0.5, 1);
  } else {
    anim.styleFlair *= 0.98;
  }

  // Failure state overrides
  if (this.isWashingOut) {
    const wobblePhase = Date.now() * 0.015;
    anim.targetAngulation += Math.sin(wobblePhase) * this.washOutIntensity * 0.5;
    anim.leftArmPose = Math.sin(wobblePhase * 1.2) * this.washOutIntensity;
    anim.rightArmPose = Math.cos(wobblePhase * 1.1) * this.washOutIntensity;
    anim.targetHeadLook += Math.sin(wobblePhase * 0.8) * this.washOutIntensity * 0.3;
    anim.targetFrontKnee += Math.sin(wobblePhase * 2) * this.washOutIntensity * 0.3;
    anim.targetBackKnee += Math.cos(wobblePhase * 2) * this.washOutIntensity * 0.3;
  }

  if (this.isEdgeCaught) {
    const catchPhase = Date.now() * 0.02;
    anim.targetAngulation = Math.sin(catchPhase) * this.edgeCatchSeverity * 0.5;
    anim.leftArmPose = Math.sin(catchPhase * 2) * this.edgeCatchSeverity;
    anim.rightArmPose = -Math.sin(catchPhase * 2 + 1) * this.edgeCatchSeverity;
    anim.targetFrontKnee = 1.3 + this.edgeCatchSeverity * 0.3;
    anim.targetBackKnee = 1.3 + this.edgeCatchSeverity * 0.3;
  }

  if (this.isRecovering) {
    const recoverPhase = Date.now() * 0.01;
    anim.targetAngulation *= 0.5;
    anim.targetAngulation += Math.sin(recoverPhase) * 0.1;
  }

  // Smooth all values
  anim.frontKneeAngle = THREE.MathUtils.lerp(anim.frontKneeAngle, anim.targetFrontKnee, 12 * dt);
  anim.backKneeAngle = THREE.MathUtils.lerp(anim.backKneeAngle, anim.targetBackKnee, 12 * dt);
  anim.frontAnkleAngle = THREE.MathUtils.lerp(anim.frontAnkleAngle, anim.targetFrontAnkle, 10 * dt);
  anim.backAnkleAngle = THREE.MathUtils.lerp(anim.backAnkleAngle, anim.targetBackAnkle, 10 * dt);
  anim.hipHeight = THREE.MathUtils.lerp(anim.hipHeight, anim.targetHipHeight, 10 * dt);
  anim.angulation = THREE.MathUtils.lerp(anim.angulation, anim.targetAngulation, 8 * dt);
  anim.counterRotation = THREE.MathUtils.lerp(anim.counterRotation, anim.targetCounterRotation, 6 * dt);
  anim.headLook = THREE.MathUtils.lerp(anim.headLook, anim.targetHeadLook, 10 * dt);
}

/**
 * Apply rider animation to GLB model
 * @param {number} dt - Delta time
 */
export function applyRiderAnimation(dt) {
  if (this.playerModelGLB && this.playerModelGLB.loaded) {
    const physicsState = {
      edgeAngle: this.edgeAngle,
      speed: this.currentSpeed,
      compression: this.compression,
      carveRailStrength: this.carveRailStrength,
      flowState: this.flowState || 0,
      steerInput: this.input.steer,
      isGrounded: this.isGrounded,
      airTime: this.airTime,
      pitch: this.pitch,
      roll: this.roll,
      spinVelocity: this.spinVelocity,
      leanInput: this.input.lean,
    };
    this.playerModelGLB.applyPose(physicsState, dt);
  }
}

/**
 * Reset animation state to defaults
 */
export function resetAnimState() {
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
