import * as THREE from 'three';

/**
 * AvalancheSystem - Dynamic avalanche hazards
 *
 * Creates dramatic avalanche events that chase the player down the mountain.
 *
 * Features:
 * - Procedural snow debris particles (chunks, powder cloud)
 * - Physics-based movement following terrain
 * - Player collision detection (getting caught = crash)
 * - Trigger zones on steep slopes
 * - Audio integration for rumble sounds
 */

export class AvalancheSystem {
  constructor(sceneManager, terrain, audioSystem) {
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;
    this.terrain = terrain;
    this.audioSystem = audioSystem;

    // Avalanche state
    this.active = false;
    this.avalanches = [];  // Can have multiple avalanches

    // Particle settings
    this.maxDebrisParticles = 500;
    this.maxDustParticles = 1000;

    // Trigger zones (generated along steep sections)
    this.triggerZones = [];
    this.triggeredZones = new Set();

    // Callbacks
    this.onPlayerCaught = null;
    this.onAvalancheStart = null;
    this.onAvalancheEnd = null;

    this.init();
  }

  init() {
    this.generateTriggerZones();
  }

  /**
   * Generate trigger zones on steep terrain sections
   */
  generateTriggerZones() {
    const terrainLength = this.terrain.length;
    const startZ = -terrainLength / 2 + 100;
    const endZ = terrainLength / 2 - 200;

    // Check steep sections and place trigger zones
    for (let z = startZ; z < endZ; z += 150) {
      // Sample slope steepness
      const trailX = this.terrain.getTrailCenterX(z);
      const h1 = this.terrain.calculateHeight(trailX, z - 10);
      const h2 = this.terrain.calculateHeight(trailX, z + 10);
      const slope = (h1 - h2) / 20;  // Rise over run

      // Steep sections (slope > 0.3) have avalanche risk
      if (slope > 0.25) {
        // Random chance to place trigger
        if (Math.random() < 0.4) {
          this.triggerZones.push({
            x: trailX + (Math.random() - 0.5) * 60,
            z: z,
            radius: 30 + Math.random() * 20,
            slope: slope,
            // Avalanche spawns uphill from trigger
            spawnZ: z - 80 - Math.random() * 40,
            spawnWidth: 60 + Math.random() * 40
          });
        }
      }
    }

    console.log(`Avalanche system: ${this.triggerZones.length} trigger zones`);
  }

  /**
   * Check if player triggered an avalanche
   */
  checkTriggers(playerPos) {
    for (let i = 0; i < this.triggerZones.length; i++) {
      const zone = this.triggerZones[i];

      // Skip already triggered
      if (this.triggeredZones.has(i)) continue;

      // Check distance
      const dx = playerPos.x - zone.x;
      const dz = playerPos.z - zone.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < zone.radius) {
        // Trigger avalanche!
        this.triggeredZones.add(i);
        this.startAvalanche(zone.spawnZ, zone.x, zone.spawnWidth);
        return true;
      }
    }
    return false;
  }

  /**
   * Start an avalanche at a position
   */
  startAvalanche(z, centerX, width = 80) {
    console.log('AVALANCHE TRIGGERED!');

    const avalanche = {
      id: Date.now(),
      startTime: performance.now(),
      active: true,

      // Position (front of avalanche)
      z: z,
      centerX: centerX,
      width: width,

      // Movement
      speed: 15,  // Starts slow
      maxSpeed: 35,  // Gets faster than player!
      acceleration: 8,

      // Size grows as it moves
      length: 20,
      maxLength: 120,

      // Particles
      debrisGroup: new THREE.Group(),
      dustGroup: new THREE.Group(),
      debrisParticles: [],
      dustParticles: [],

      // Audio
      rumbleIntensity: 0
    };

    // Create debris particles (snow chunks)
    this.createDebrisParticles(avalanche);

    // Create dust cloud
    this.createDustCloud(avalanche);

    // Add to scene
    this.scene.add(avalanche.debrisGroup);
    this.scene.add(avalanche.dustGroup);

    this.avalanches.push(avalanche);
    this.active = true;

    if (this.onAvalancheStart) {
      this.onAvalancheStart(avalanche);
    }

    return avalanche;
  }

  /**
   * Create snow debris particles
   */
  createDebrisParticles(avalanche) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxDebrisParticles * 3);
    const sizes = new Float32Array(this.maxDebrisParticles);
    const velocities = [];

    // Initialize particles in avalanche area
    for (let i = 0; i < this.maxDebrisParticles; i++) {
      // Spread across width
      const x = avalanche.centerX + (Math.random() - 0.5) * avalanche.width;
      const z = avalanche.z - Math.random() * avalanche.length;
      const y = this.terrain.calculateHeight(x, z) + Math.random() * 3;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Varied sizes for chunks
      sizes[i] = 0.3 + Math.random() * 0.8;

      // Individual particle velocity
      velocities.push({
        x: (Math.random() - 0.5) * 5,
        y: Math.random() * 2,
        z: 5 + Math.random() * 10,  // Mostly downhill
        spin: Math.random() * 4 - 2,
        bounce: 0.3 + Math.random() * 0.3
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Snow chunk material
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.6,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false
    });

    avalanche.debrisMesh = new THREE.Points(geometry, material);
    avalanche.debrisGroup.add(avalanche.debrisMesh);
    avalanche.debrisVelocities = velocities;
  }

  /**
   * Create powder dust cloud behind debris
   */
  createDustCloud(avalanche) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxDustParticles * 3);
    const sizes = new Float32Array(this.maxDustParticles);
    const opacities = new Float32Array(this.maxDustParticles);

    for (let i = 0; i < this.maxDustParticles; i++) {
      // Dust starts behind the debris
      const x = avalanche.centerX + (Math.random() - 0.5) * avalanche.width * 1.5;
      const z = avalanche.z - avalanche.length - Math.random() * 30;
      const y = this.terrain.calculateHeight(x, z) + 2 + Math.random() * 15;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      sizes[i] = 2 + Math.random() * 4;
      opacities[i] = 0.2 + Math.random() * 0.3;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Soft dust material
    const material = new THREE.PointsMaterial({
      color: 0xeeeeff,
      size: 3,
      transparent: true,
      opacity: 0.3,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    avalanche.dustMesh = new THREE.Points(geometry, material);
    avalanche.dustGroup.add(avalanche.dustMesh);
  }

  /**
   * Update all avalanches
   */
  update(dt, playerPos, playerSpeed) {
    if (!this.active && this.avalanches.length === 0) {
      // Check for new triggers
      this.checkTriggers(playerPos);
      return { caught: false };
    }

    let playerCaught = false;
    let catchIntensity = 0;

    for (let i = this.avalanches.length - 1; i >= 0; i--) {
      const avalanche = this.avalanches[i];

      if (!avalanche.active) {
        // Clean up finished avalanche
        this.scene.remove(avalanche.debrisGroup);
        this.scene.remove(avalanche.dustGroup);
        avalanche.debrisMesh.geometry.dispose();
        avalanche.debrisMesh.material.dispose();
        avalanche.dustMesh.geometry.dispose();
        avalanche.dustMesh.material.dispose();
        this.avalanches.splice(i, 1);
        continue;
      }

      // Update avalanche movement
      this.updateAvalancheMovement(avalanche, dt);

      // Update particles
      this.updateDebrisParticles(avalanche, dt);
      this.updateDustCloud(avalanche, dt);

      // Check player collision
      const collision = this.checkPlayerCollision(avalanche, playerPos);
      if (collision.caught) {
        playerCaught = true;
        catchIntensity = Math.max(catchIntensity, collision.intensity);
      }

      // Check if avalanche has passed and faded
      if (avalanche.z > playerPos.z + 200) {
        avalanche.fadeOut = (avalanche.fadeOut || 0) + dt;
        if (avalanche.fadeOut > 3) {
          avalanche.active = false;
          if (this.onAvalancheEnd) {
            this.onAvalancheEnd(avalanche);
          }
        }
      }
    }

    this.active = this.avalanches.some(a => a.active);

    return {
      caught: playerCaught,
      intensity: catchIntensity,
      active: this.active,
      rumbleIntensity: this.getRumbleIntensity(playerPos)
    };
  }

  /**
   * Update avalanche position and speed
   */
  updateAvalancheMovement(avalanche, dt) {
    // Accelerate up to max speed
    avalanche.speed = Math.min(
      avalanche.maxSpeed,
      avalanche.speed + avalanche.acceleration * dt
    );

    // Move downhill (positive Z)
    avalanche.z += avalanche.speed * dt;

    // Grow in length as it picks up snow
    avalanche.length = Math.min(
      avalanche.maxLength,
      avalanche.length + dt * 15
    );

    // Slight lateral spread
    avalanche.width = Math.min(
      120,
      avalanche.width + dt * 3
    );

    // Update center X to follow terrain
    avalanche.centerX = THREE.MathUtils.lerp(
      avalanche.centerX,
      this.terrain.getTrailCenterX(avalanche.z),
      dt * 0.5
    );
  }

  /**
   * Update debris particle positions
   */
  updateDebrisParticles(avalanche, dt) {
    const positions = avalanche.debrisMesh.geometry.attributes.position.array;
    const velocities = avalanche.debrisVelocities;

    for (let i = 0; i < this.maxDebrisParticles; i++) {
      const vel = velocities[i];

      // Current position
      let x = positions[i * 3];
      let y = positions[i * 3 + 1];
      let z = positions[i * 3 + 2];

      // Apply velocity
      x += vel.x * dt;
      y += vel.y * dt;
      z += vel.z * dt + avalanche.speed * dt;

      // Gravity
      vel.y -= 15 * dt;

      // Ground collision
      const groundY = this.terrain.calculateHeight(x, z);
      if (y < groundY + 0.2) {
        y = groundY + 0.2;
        vel.y = Math.abs(vel.y) * vel.bounce;
        vel.x *= 0.8;
        vel.z *= 0.9;
      }

      // Keep particles in avalanche zone
      const relZ = z - avalanche.z;
      if (relZ > 10 || relZ < -avalanche.length - 20) {
        // Respawn at front
        z = avalanche.z - Math.random() * 10;
        x = avalanche.centerX + (Math.random() - 0.5) * avalanche.width;
        y = this.terrain.calculateHeight(x, z) + 1 + Math.random() * 3;
        vel.y = Math.random() * 3;
        vel.z = 5 + Math.random() * 10;
      }

      // Keep in width
      const relX = x - avalanche.centerX;
      if (Math.abs(relX) > avalanche.width * 0.6) {
        vel.x -= Math.sign(relX) * 5 * dt;
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    avalanche.debrisMesh.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Update dust cloud
   */
  updateDustCloud(avalanche, dt) {
    const positions = avalanche.dustMesh.geometry.attributes.position.array;

    for (let i = 0; i < this.maxDustParticles; i++) {
      let x = positions[i * 3];
      let y = positions[i * 3 + 1];
      let z = positions[i * 3 + 2];

      // Dust rises and spreads
      y += (2 + Math.random() * 3) * dt;
      x += (Math.random() - 0.5) * 8 * dt;
      z += avalanche.speed * 0.7 * dt;

      // Keep dust behind debris
      const relZ = z - avalanche.z;
      if (relZ > -5 || y > 40 || relZ < -avalanche.length - 60) {
        // Respawn behind debris
        z = avalanche.z - avalanche.length * 0.5 - Math.random() * 30;
        x = avalanche.centerX + (Math.random() - 0.5) * avalanche.width * 1.3;
        y = this.terrain.calculateHeight(x, z) + 2 + Math.random() * 5;
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    avalanche.dustMesh.geometry.attributes.position.needsUpdate = true;

    // Fade opacity based on avalanche age
    const age = (performance.now() - avalanche.startTime) / 1000;
    const fadeIn = Math.min(1, age / 2);
    const fadeOut = avalanche.fadeOut ? Math.max(0, 1 - avalanche.fadeOut / 3) : 1;
    avalanche.dustMesh.material.opacity = 0.35 * fadeIn * fadeOut;
  }

  /**
   * Check if player is caught in avalanche
   */
  checkPlayerCollision(avalanche, playerPos) {
    // Check if player is within avalanche bounds
    const relZ = playerPos.z - avalanche.z;
    const relX = playerPos.x - avalanche.centerX;

    // Player is in avalanche zone?
    const inZRange = relZ > -avalanche.length && relZ < 15;
    const inXRange = Math.abs(relX) < avalanche.width * 0.5;

    if (inZRange && inXRange) {
      // Calculate intensity (stronger near center/front)
      const zIntensity = 1 - Math.abs(relZ) / avalanche.length;
      const xIntensity = 1 - Math.abs(relX) / (avalanche.width * 0.5);
      const intensity = zIntensity * xIntensity;

      if (intensity > 0.3) {
        return { caught: true, intensity: intensity };
      }
    }

    return { caught: false, intensity: 0 };
  }

  /**
   * Get rumble intensity for audio (based on distance to nearest avalanche)
   */
  getRumbleIntensity(playerPos) {
    let maxIntensity = 0;

    for (const avalanche of this.avalanches) {
      if (!avalanche.active) continue;

      const dx = playerPos.x - avalanche.centerX;
      const dz = playerPos.z - avalanche.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Louder when closer, max at ~30m
      const intensity = Math.max(0, 1 - dist / 150);
      maxIntensity = Math.max(maxIntensity, intensity);
    }

    return maxIntensity;
  }

  /**
   * Manually trigger an avalanche (for testing or scripted events)
   */
  triggerManual(playerPos) {
    const spawnZ = playerPos.z - 100;
    const spawnX = this.terrain.getTrailCenterX(spawnZ);
    return this.startAvalanche(spawnZ, spawnX, 80);
  }

  /**
   * Reset all avalanches (on player restart)
   */
  reset() {
    for (const avalanche of this.avalanches) {
      this.scene.remove(avalanche.debrisGroup);
      this.scene.remove(avalanche.dustGroup);
      if (avalanche.debrisMesh) {
        avalanche.debrisMesh.geometry.dispose();
        avalanche.debrisMesh.material.dispose();
      }
      if (avalanche.dustMesh) {
        avalanche.dustMesh.geometry.dispose();
        avalanche.dustMesh.material.dispose();
      }
    }
    this.avalanches = [];
    this.triggeredZones.clear();
    this.active = false;
  }

  /**
   * Get current state for UI/debugging
   */
  getState() {
    return {
      active: this.active,
      count: this.avalanches.length,
      avalanches: this.avalanches.map(a => ({
        z: a.z,
        speed: a.speed,
        width: a.width,
        length: a.length
      }))
    };
  }
}
