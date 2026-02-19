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
    carveRailStrength: 0,
    // Speed tuck state
    tuckAmount: 0,        // 0-1 how tucked the rider is
    targetTuckAmount: 0,
    forwardLean: 0,       // Forward body lean for tuck
    targetForwardLean: 0,
    armTuck: 0,           // How tucked in the arms are
    targetArmTuck: 0
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

  // Add board glow mesh for flex energy visualization
  createBoardGlow.call(this);

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

  // Add board glow mesh for flex energy visualization
  createBoardGlow.call(this);

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
 * Create board glow mesh for flex energy visualization
 * Shows energy building up in the board during carves
 */
export function createBoardGlow() {
  // Create a slightly larger board shape for the glow
  const glowGeometry = createSnowboardGeometry();
  glowGeometry.scale(1.08, 1.5, 1.04); // Slightly larger

  // Glow material with additive blending
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  this.boardGlowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  this.boardGlowMesh.position.y = 0.01; // Slightly above board
  this.mesh.add(this.boardGlowMesh);

  // Create edge glow particles for extra effect
  const edgeParticleCount = 50;
  const edgeGeometry = new THREE.BufferGeometry();
  const edgePositions = new Float32Array(edgeParticleCount * 3);
  const edgeSizes = new Float32Array(edgeParticleCount);

  for (let i = 0; i < edgeParticleCount; i++) {
    // Position along board edge
    const t = (i / edgeParticleCount) * Math.PI * 2;
    edgePositions[i * 3] = Math.cos(t) * 0.15;     // X - across board
    edgePositions[i * 3 + 1] = 0.02;               // Y - slightly above
    edgePositions[i * 3 + 2] = Math.sin(t) * 0.7;  // Z - along board
    edgeSizes[i] = 0;
  }

  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
  edgeGeometry.setAttribute('size', new THREE.BufferAttribute(edgeSizes, 1));

  const edgeMaterial = new THREE.PointsMaterial({
    color: 0x88ffff,
    size: 0.08,
    transparent: true,
    opacity: 0,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  this.boardGlowParticles = new THREE.Points(edgeGeometry, edgeMaterial);
  this.mesh.add(this.boardGlowParticles);

  // Initialize glow state
  this.boardGlowIntensity = 0;
  this.boardGlowPulse = 0;
}

/**
 * Update board glow based on flex energy
 * @param {number} dt - Delta time
 * @param {number} flexEnergy - Current flex energy (0-1)
 * @param {number} boardFlex - Current board flex amount
 * @param {number} carveRailStrength - Current rail strength
 */
export function updateBoardGlow(dt, flexEnergy, boardFlex, carveRailStrength) {
  if (!this.boardGlowMesh) return;

  // Target intensity based on flex energy
  const targetIntensity = flexEnergy * 0.8 + boardFlex * 0.3 * carveRailStrength;

  // Smooth approach to target (faster buildup, slower decay)
  const lerpRate = targetIntensity > this.boardGlowIntensity ? 8 : 3;
  this.boardGlowIntensity = THREE.MathUtils.lerp(this.boardGlowIntensity, targetIntensity, lerpRate * dt);

  // Pulsing effect that increases with energy
  this.boardGlowPulse += dt * (4 + flexEnergy * 8);
  const pulse = 1 + Math.sin(this.boardGlowPulse) * 0.2 * this.boardGlowIntensity;

  // Update main glow mesh
  const glowOpacity = this.boardGlowIntensity * 0.4 * pulse;
  this.boardGlowMesh.material.opacity = Math.min(glowOpacity, 0.6);

  // Color shifts from cyan to white as energy builds
  const colorIntensity = Math.min(this.boardGlowIntensity * 1.5, 1);
  const r = 0.3 + colorIntensity * 0.7;
  const g = 1.0;
  const b = 1.0;
  this.boardGlowMesh.material.color.setRGB(r, g, b);

  // Update edge particles
  if (this.boardGlowParticles && this.boardGlowIntensity > 0.1) {
    const positions = this.boardGlowParticles.geometry.attributes.position.array;
    const sizes = this.boardGlowParticles.geometry.attributes.size.array;

    for (let i = 0; i < sizes.length; i++) {
      // Animate particles along board edge
      const t = (i / sizes.length) * Math.PI * 2 + this.boardGlowPulse * 0.5;

      // Oval path along board edge
      positions[i * 3] = Math.cos(t) * 0.12;
      positions[i * 3 + 2] = Math.sin(t) * 0.68;

      // Height varies with pulse
      positions[i * 3 + 1] = 0.02 + Math.sin(t * 2 + this.boardGlowPulse) * 0.03 * this.boardGlowIntensity;

      // Size pulses with energy
      sizes[i] = 0.04 + this.boardGlowIntensity * 0.08 * (0.5 + Math.sin(t + this.boardGlowPulse * 2) * 0.5);
    }

    this.boardGlowParticles.geometry.attributes.position.needsUpdate = true;
    this.boardGlowParticles.geometry.attributes.size.needsUpdate = true;
    this.boardGlowParticles.material.opacity = this.boardGlowIntensity * 0.6;
  } else if (this.boardGlowParticles) {
    this.boardGlowParticles.material.opacity = 0;
  }
}

/**
 * Create spray particle system with enhanced visuals
 */
export function createSprayParticles() {
  const geometry = new THREE.BufferGeometry();

  this.sprayPositions = new Float32Array(this.maxParticles * 3);
  const sizes = new Float32Array(this.maxParticles);
  const opacities = new Float32Array(this.maxParticles);

  for (let i = 0; i < this.maxParticles; i++) {
    this.sprayPositions[i * 3] = 0;
    this.sprayPositions[i * 3 + 1] = -1000;
    this.sprayPositions[i * 3 + 2] = 0;
    sizes[i] = 0;
    opacities[i] = 0;

    this.sprayVelocities.push(new THREE.Vector3());
    this.sprayLifetimes.push(0);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(this.sprayPositions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

  // Enhanced shader material for soft, glowing snow particles
  const material = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(0xffffff) },
      glowColor: { value: new THREE.Color(0xccddff) }
    },
    vertexShader: `
      attribute float size;
      attribute float opacity;
      varying float vOpacity;
      varying float vSize;

      void main() {
        vOpacity = opacity;
        vSize = size;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 glowColor;
      varying float vOpacity;
      varying float vSize;

      void main() {
        // Soft circular particle with glow
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);

        // Soft falloff
        float alpha = smoothstep(0.5, 0.0, dist) * vOpacity;

        // Bright core with soft glow
        float core = smoothstep(0.3, 0.0, dist);
        vec3 color = mix(glowColor, baseColor, core);

        // Add sparkle for larger particles
        float sparkle = step(0.95, fract(sin(dot(gl_PointCoord, vec2(12.9898, 78.233))) * 43758.5453));
        color += sparkle * 0.5 * step(0.15, vSize);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  this.sprayParticles = new THREE.Points(geometry, material);
  this.sprayParticles.frustumCulled = false;
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
  const opacities = this.sprayParticles.geometry.attributes.opacity?.array;

  // Get carve quality for visual intensity
  const carveQuality = this.carvePerfection || 0;
  const flowBonus = (this.flowState || 0) * 0.5;
  const absEdge = Math.abs(edgeAngle);
  const gForce = this.currentGForce || 1.0;

  // Spawn new particles when grounded and moving
  if (this.isGrounded && speed > 3) {
    // Enhanced intensity based on carve quality, commitment, and G-force
    const baseIntensity = absEdge * 2.5 + this.carveRailStrength * 4;
    const qualityBonus = carveQuality * 3;
    const gForceBonus = gForce > 1.3 ? (gForce - 1) * 4 : 0;
    const carveIntensity = isCarving ? (baseIntensity + qualityBonus + gForceBonus) * (1 + flowBonus) : 0;

    // More particles during deep, quality carves - dramatically more at high G
    const baseSpawnRate = Math.min(speed * 0.6, 15);
    const carveSpawnBonus = carveIntensity * 8;
    const spawnRate = baseSpawnRate + carveSpawnBonus;
    const particlesToSpawn = Math.floor(spawnRate * dt * 60);

    for (let i = 0; i < particlesToSpawn; i++) {
      const idx = this.nextParticleIndex;
      this.nextParticleIndex = (this.nextParticleIndex + 1) % this.maxParticles;

      const side = Math.sign(edgeAngle) || (Math.random() > 0.5 ? 1 : -1);

      // Board forward direction (direction of travel)
      const boardForward = new THREE.Vector3(
        -Math.sin(this.heading),
        0,
        Math.cos(this.heading)
      );

      // Board right direction (perpendicular to travel)
      const boardRight = new THREE.Vector3(
        Math.cos(this.heading),
        0,
        Math.sin(this.heading)
      );

      // Spawn at the carving edge contact point
      const edgeOffset = side * 0.25 * (1 + absEdge * 0.5);
      const backOffset = 0.4 + Math.random() * 0.3;

      const spawnX = pos.x + boardRight.x * edgeOffset - boardForward.x * backOffset + (Math.random() - 0.5) * 0.15;
      const spawnY = pos.y + 0.02;
      const spawnZ = pos.z + boardRight.z * edgeOffset - boardForward.z * backOffset + (Math.random() - 0.5) * 0.15;

      positions[idx * 3] = spawnX;
      positions[idx * 3 + 1] = spawnY;
      positions[idx * 3 + 2] = spawnZ;

      // Enhanced velocity - spray PERPENDICULAR to carve direction (away from turn)
      // More dramatic spray during high-G carves
      const gForceMultiplier = gForce > 1.2 ? 1 + (gForce - 1) * 0.8 : 1;
      const carveBoost = isCarving ? (1.5 + this.carveRailStrength * 2.5 + carveQuality * 1.5) * gForceMultiplier : 1;
      const baseSpraySpeed = (speed * 0.3 + Math.random() * 4) * carveBoost;

      // Main spray direction is perpendicular to velocity (away from the carve)
      const perpendicularSpeed = baseSpraySpeed * (0.9 + Math.random() * 0.4);
      const upwardSpeed = (2.5 + Math.random() * 4 + absEdge * 3) * carveBoost;
      const backwardSpeed = speed * 0.18 * (0.5 + Math.random() * 0.5);

      // Add some randomness for a more natural spray pattern
      const randomSpread = (1 + carveIntensity * 0.3);

      this.sprayVelocities[idx].set(
        boardRight.x * side * perpendicularSpeed - boardForward.x * backwardSpeed + (Math.random() - 0.5) * 2 * randomSpread,
        upwardSpeed,
        boardRight.z * side * perpendicularSpeed - boardForward.z * backwardSpeed + (Math.random() - 0.5) * 2 * randomSpread
      );

      // Particle size scales with carve intensity and G-force
      const baseSize = 0.1 + Math.random() * 0.15;
      const intensitySize = (absEdge * 0.12 + this.carveRailStrength * 0.15) * carveBoost;
      const gForceSize = gForce > 1.5 ? (gForce - 1.5) * 0.1 : 0;
      sizes[idx] = baseSize + intensitySize + gForceSize;

      // Set initial opacity
      if (opacities) {
        opacities[idx] = 0.8 + Math.random() * 0.2;
      }

      // Longer lifetime for dramatic sprays
      this.sprayLifetimes[idx] = 0.6 + Math.random() * 0.6 + carveQuality * 0.3 + gForceSize * 2;
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
      if (this.sprayLifetimes[i] < 0.3) {
        sizes[i] *= 0.92;
        if (opacities) {
          opacities[i] *= 0.9;
        }
      }

      // Kill if too old
      if (this.sprayLifetimes[i] <= 0) {
        positions[i * 3 + 1] = -1000;
        sizes[i] = 0;
        if (opacities) {
          opacities[i] = 0;
        }
      }
    }
  }

  this.sprayParticles.geometry.attributes.position.needsUpdate = true;
  this.sprayParticles.geometry.attributes.size.needsUpdate = true;
  if (this.sprayParticles.geometry.attributes.opacity) {
    this.sprayParticles.geometry.attributes.opacity.needsUpdate = true;
  }
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

  // Update board glow based on flex energy
  updateBoardGlow.call(this, dt, this.flexEnergy || 0, this.boardFlex || 0, this.carveRailStrength || 0);

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

  // G-force calculation - enhanced for more dramatic feel
  let gForce = 1.0;
  if (absEdge > 0.1 && speed2D > 3) {
    const turnRadius = this.sidecutRadius / Math.max(Math.sin(absEdge), 0.1);
    const lateralG = (speed2D * speed2D) / (turnRadius * 9.81);
    gForce = Math.sqrt(1 + lateralG * lateralG);
  }

  // Faster response to G-force changes for snappier feel
  const gForceLerpRate = gForce > anim.gForceCompression ? 18 : 10; // Fast up, slower release
  anim.gForceCompression = THREE.MathUtils.lerp(anim.gForceCompression, gForce, gForceLerpRate * dt);

  // === SPEED TUCK SYSTEM ===
  // Rider tucks at high speeds when going relatively straight and leaning forward
  const tuckSpeedThreshold = 18;  // Start tucking above this speed
  const tuckMaxSpeed = 35;        // Full tuck at this speed
  const isGoingStraight = absEdge < 0.25; // Low edge angle = straight line
  const wantsTuck = this.input.lean > 0.3; // Forward lean input

  // Calculate target tuck amount
  if (speed2D > tuckSpeedThreshold && isGoingStraight && wantsTuck && this.isGrounded) {
    const speedTuckFactor = Math.min((speed2D - tuckSpeedThreshold) / (tuckMaxSpeed - tuckSpeedThreshold), 1);
    const leanTuckFactor = Math.min((this.input.lean - 0.3) / 0.7, 1);
    anim.targetTuckAmount = speedTuckFactor * leanTuckFactor;
  } else {
    anim.targetTuckAmount = 0;
  }

  // Smooth tuck transitions
  const tuckLerpRate = anim.targetTuckAmount > anim.tuckAmount ? 4 : 6; // Slower to tuck, faster to untuck
  anim.tuckAmount = THREE.MathUtils.lerp(anim.tuckAmount, anim.targetTuckAmount, tuckLerpRate * dt);

  // Forward body lean for tuck position
  anim.targetForwardLean = anim.tuckAmount * 0.4; // Max 0.4 radians forward lean
  anim.forwardLean = THREE.MathUtils.lerp(anim.forwardLean, anim.targetForwardLean, 5 * dt);

  // Arm tuck - arms come in closer to body
  anim.targetArmTuck = anim.tuckAmount;
  anim.armTuck = THREE.MathUtils.lerp(anim.armTuck, anim.targetArmTuck, 6 * dt);

  // Leg compression from G-force - more dramatic range
  const minKneeAngle = 0.55; // Slightly more extended at rest
  const maxKneeAngle = 2.1;  // Can compress more during high-G

  const speedBend = Math.min(speed2D / 18, 1) * 0.3; // More bend at speed

  // Enhanced G-force compression curve - exponential feel
  const gExcess = Math.max(0, anim.gForceCompression - 1);
  const gCompression = gExcess * 0.5 + gExcess * gExcess * 0.25; // Quadratic curve for drama
  const clampedGCompression = Math.min(gCompression, 1.1);

  let baseKneeAngle = minKneeAngle + speedBend + clampedGCompression * (maxKneeAngle - minKneeAngle);
  baseKneeAngle += this.compression * 0.5;

  // Extra "pump" compression during high-quality carves
  if (this.carveRailStrength > 0.6 && anim.gForceCompression > 1.5) {
    const carveBonus = (this.carveRailStrength - 0.6) * (anim.gForceCompression - 1.5) * 0.3;
    baseKneeAngle += carveBonus;
  }

  // Speed tuck adds extra knee bend for low crouching position
  const tuckKneeBend = anim.tuckAmount * 0.6;
  baseKneeAngle += tuckKneeBend;

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
  const speedFactor = Math.min(speed2D / 18, 1);
  const carveIntensity = absEdge * this.carveRailStrength;

  // Enhanced angulation - more dramatic lean during high-G carves
  anim.targetAngulation = -edgeSign * absEdge * 0.55 * (0.5 + speedFactor * 0.5);

  // G-force amplifies angulation exponentially for dramatic effect
  const gBonus = Math.max(0, anim.gForceCompression - 1);
  anim.targetAngulation *= (1 + gBonus * 0.4 + gBonus * gBonus * 0.15);

  // Rail lock amplifies angulation further
  if (this.carveRailStrength > 0.5) {
    anim.targetAngulation *= 1 + this.carveRailStrength * 0.5;
  }

  // Flow state adds subtle extra lean (confidence)
  if (this.flowState > 0.5) {
    anim.targetAngulation *= 1 + (this.flowState - 0.5) * 0.2;
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

  // Arm dynamics - modified by tuck state
  const tuckArmBlend = 1 - anim.armTuck; // 0 = full tuck, 1 = normal arms

  if (anim.armTuck > 0.2) {
    // During tuck: arms pulled in close to body, slightly forward
    const tuckArmTarget = 0.3 + anim.armTuck * 0.4; // Arms tucked forward
    anim.leftArmPose = THREE.MathUtils.lerp(anim.leftArmPose, tuckArmTarget, 6 * dt);
    anim.rightArmPose = THREE.MathUtils.lerp(anim.rightArmPose, tuckArmTarget, 6 * dt);
  } else if (edgeSign > 0) {
    anim.leftArmPose = THREE.MathUtils.lerp(anim.leftArmPose, (-0.7 - carveIntensity * 0.4) * tuckArmBlend, 8 * dt);
    anim.rightArmPose = THREE.MathUtils.lerp(anim.rightArmPose, (0.5 + carveIntensity * 0.3) * tuckArmBlend, 8 * dt);
  } else if (edgeSign < 0) {
    anim.rightArmPose = THREE.MathUtils.lerp(anim.rightArmPose, (-0.6 - carveIntensity * 0.4) * tuckArmBlend, 8 * dt);
    anim.leftArmPose = THREE.MathUtils.lerp(anim.leftArmPose, (0.4 + carveIntensity * 0.3) * tuckArmBlend, 8 * dt);
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
      // Speed tuck state
      tuckAmount: this.animState?.tuckAmount || 0,
      forwardLean: this.animState?.forwardLean || 0,
      armTuck: this.animState?.armTuck || 0,
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
    // Reset tuck state
    this.animState.tuckAmount = 0;
    this.animState.targetTuckAmount = 0;
    this.animState.forwardLean = 0;
    this.animState.targetForwardLean = 0;
    this.animState.armTuck = 0;
    this.animState.targetArmTuck = 0;
  }
}

// =============================================================================
// SKI VISUALS
// =============================================================================

/**
 * Create ski geometry (two individual skis)
 */
export function createSkiGeometry() {
  const skiGroup = new THREE.Group();

  // Ski dimensions
  const skiLength = 1.7;
  const skiWidth = 0.08;
  const skiThickness = 0.02;
  const stanceWidth = 0.25;  // Distance between skis (hip width)

  // Material
  const skiMaterial = new THREE.MeshStandardMaterial({
    color: 0x2244aa,
    roughness: 0.3,
    metalness: 0.4,
  });

  const bindingMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.6,
    metalness: 0.3,
  });

  // Create left ski - rotated 90 degrees so tips point forward
  const leftSki = createSingleSki(skiLength, skiWidth, skiThickness, skiMaterial, bindingMaterial);
  leftSki.rotation.y = Math.PI / 2;  // Rotate 90 degrees - tips forward
  leftSki.position.x = -stanceWidth / 2;
  skiGroup.add(leftSki);

  // Create right ski - rotated 90 degrees so tips point forward
  const rightSki = createSingleSki(skiLength, skiWidth, skiThickness, skiMaterial, bindingMaterial);
  rightSki.rotation.y = Math.PI / 2;  // Rotate 90 degrees - tips forward
  rightSki.position.x = stanceWidth / 2;
  skiGroup.add(rightSki);

  // Store references for animation
  skiGroup.userData.leftSki = leftSki;
  skiGroup.userData.rightSki = rightSki;

  return skiGroup;
}

/**
 * Create a single ski with binding
 */
function createSingleSki(length, width, thickness, skiMaterial, bindingMaterial) {
  const ski = new THREE.Group();

  // Ski body - slightly curved shape
  const shape = new THREE.Shape();
  const halfLen = length / 2;
  const halfWidth = width / 2;

  // Create ski profile (top view)
  shape.moveTo(-halfLen + 0.1, -halfWidth * 0.6);  // Tail
  shape.quadraticCurveTo(-halfLen, 0, -halfLen + 0.1, halfWidth * 0.6);
  shape.lineTo(halfLen - 0.15, halfWidth);  // Side
  shape.quadraticCurveTo(halfLen, 0, halfLen - 0.15, -halfWidth);  // Tip
  shape.lineTo(-halfLen + 0.1, -halfWidth * 0.6);  // Back to tail

  const extrudeSettings = {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
  };

  const skiGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  skiGeometry.rotateX(-Math.PI / 2);  // Lay flat
  skiGeometry.translate(0, thickness / 2, 0);

  const skiMesh = new THREE.Mesh(skiGeometry, skiMaterial);
  ski.add(skiMesh);

  // Metal edge
  const edgeGeometry = new THREE.BoxGeometry(length - 0.1, 0.003, width + 0.005);
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.2,
    metalness: 0.9,
  });
  const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
  edge.position.y = 0.001;
  ski.add(edge);

  // Binding
  const bindingGroup = new THREE.Group();

  // Toe piece
  const toePiece = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.04, width * 1.2),
    bindingMaterial
  );
  toePiece.position.set(0.1, thickness + 0.02, 0);
  bindingGroup.add(toePiece);

  // Heel piece
  const heelPiece = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.05, width * 1.1),
    bindingMaterial
  );
  heelPiece.position.set(-0.12, thickness + 0.025, 0);
  bindingGroup.add(heelPiece);

  ski.add(bindingGroup);

  return ski;
}

/**
 * Update sport visuals - switch between snowboard and skis
 */
export function updateSportVisuals() {
  if (!this.mesh || !this.boardMesh) return;

  // Remove current board/ski mesh
  this.mesh.remove(this.boardMesh);
  if (this.boardMesh.geometry) {
    this.boardMesh.geometry.dispose();
  }
  if (this.boardMesh.material) {
    if (Array.isArray(this.boardMesh.material)) {
      this.boardMesh.material.forEach(m => m.dispose());
    } else {
      this.boardMesh.material.dispose();
    }
  }

  // Create new equipment based on sport type
  if (this.sportType === 'ski') {
    // Create ski mesh
    this.boardMesh = createSkiGeometry();

    // Rotate character to face forward for skiing (facing downhill)
    if (this.playerModelGLB) {
      this.playerModelGLB.setStanceRotation(0.15);  // Nearly forward facing (just ~8 degrees offset)
    }
    if (this.riderGroup && !this.playerModelGLB) {
      this.riderGroup.rotation.y = -Math.PI / 2 + 0.15;  // Rotate placeholder too
    }

    console.log('Switched to ski visuals (character facing forward)');
  } else {
    // Create snowboard mesh
    const boardGeometry = createSnowboardGeometry();
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.4,
      metalness: 0.2,
    });
    this.boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);

    // Reset character to sideways stance for snowboarding (90 degrees)
    if (this.playerModelGLB) {
      this.playerModelGLB.setStanceRotation(Math.PI / 2);  // 90 degrees - sideways
    }
    if (this.riderGroup && !this.playerModelGLB) {
      this.riderGroup.rotation.y = 0;  // Reset placeholder
    }

    console.log('Switched to snowboard visuals');
  }

  this.mesh.add(this.boardMesh);
}
