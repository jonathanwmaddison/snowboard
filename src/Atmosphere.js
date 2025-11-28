import * as THREE from 'three';

/**
 * Atmosphere - Dynamic weather and lighting for mood
 *
 * Creates an immersive mountain environment:
 * - Falling snow particles
 * - Dynamic fog based on altitude
 * - Subtle lighting changes
 * - Mountain ambiance
 */

export class Atmosphere {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;

    // Snow particles
    this.snowParticles = null;
    this.snowPositions = null;
    this.snowVelocities = [];
    this.maxSnowParticles = 3000;
    this.snowArea = { width: 150, height: 80, depth: 150 };

    // Fog settings
    this.fog = null;
    this.baseFogDensity = 0.0008;

    // Time of day (affects lighting)
    this.timeOfDay = 0.5; // 0 = dawn, 0.5 = midday, 1 = dusk
    this.lightColors = {
      dawn: new THREE.Color(0xffccaa),
      midday: new THREE.Color(0xffffff),
      afternoon: new THREE.Color(0xffeedd),
      dusk: new THREE.Color(0xffaa77)
    };

    // Current player position (for particle culling)
    this.playerPosition = new THREE.Vector3();

    // Wind affects snow direction
    this.windDirection = new THREE.Vector3(0.3, 0, 0.1);
    this.windStrength = 1.0;

    this.init();
  }

  init() {
    this.createSnow();
    this.createFog();
    this.setupLighting();
  }

  /**
   * Create falling snow particle system
   */
  createSnow() {
    const geometry = new THREE.BufferGeometry();

    this.snowPositions = new Float32Array(this.maxSnowParticles * 3);
    const sizes = new Float32Array(this.maxSnowParticles);
    const opacities = new Float32Array(this.maxSnowParticles);

    // Initialize particles in random positions around origin
    for (let i = 0; i < this.maxSnowParticles; i++) {
      this.snowPositions[i * 3] = (Math.random() - 0.5) * this.snowArea.width;
      this.snowPositions[i * 3 + 1] = Math.random() * this.snowArea.height;
      this.snowPositions[i * 3 + 2] = (Math.random() - 0.5) * this.snowArea.depth;

      // Random fall speed
      this.snowVelocities.push({
        y: -2 - Math.random() * 3, // Fall speed
        wobble: Math.random() * Math.PI * 2, // Phase offset for wobble
        wobbleSpeed: 1 + Math.random() * 2,
        wobbleAmount: 0.5 + Math.random() * 1
      });

      sizes[i] = 0.15 + Math.random() * 0.25;
      opacities[i] = 0.4 + Math.random() * 0.4;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Snow material - soft white particles
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.2,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.snowParticles = new THREE.Points(geometry, material);
    this.snowParticles.frustumCulled = false; // Always render
    this.scene.add(this.snowParticles);
  }

  /**
   * Create atmospheric fog
   */
  createFog() {
    // Exponential fog for distance fade
    this.fog = new THREE.FogExp2(0xd8e8f8, this.baseFogDensity);
    this.scene.fog = this.fog;
  }

  /**
   * Adjust scene lighting for atmosphere
   */
  setupLighting() {
    // Find existing directional light in scene
    this.scene.traverse((obj) => {
      if (obj.isDirectionalLight) {
        this.sunLight = obj;
      }
      if (obj.isAmbientLight) {
        this.ambientLight = obj;
      }
    });
  }

  /**
   * Update atmosphere each frame
   */
  update(dt, playerPosition) {
    this.playerPosition.copy(playerPosition);

    this.updateSnow(dt);
    this.updateFog(playerPosition);
  }

  /**
   * Update snow particle positions
   */
  updateSnow(dt) {
    if (!this.snowParticles) return;

    const positions = this.snowParticles.geometry.attributes.position.array;
    const time = performance.now() / 1000;

    for (let i = 0; i < this.maxSnowParticles; i++) {
      const vel = this.snowVelocities[i];

      // Base fall
      positions[i * 3 + 1] += vel.y * dt;

      // Wobble motion (makes snow float realistically)
      const wobble = Math.sin(time * vel.wobbleSpeed + vel.wobble) * vel.wobbleAmount;
      positions[i * 3] += wobble * dt;
      positions[i * 3 + 2] += Math.cos(time * vel.wobbleSpeed * 0.7 + vel.wobble) * vel.wobbleAmount * 0.5 * dt;

      // Wind effect
      positions[i * 3] += this.windDirection.x * this.windStrength * dt;
      positions[i * 3 + 2] += this.windDirection.z * this.windStrength * dt;

      // Respawn if below camera or too far
      if (positions[i * 3 + 1] < this.playerPosition.y - 20) {
        // Reset above player
        positions[i * 3] = this.playerPosition.x + (Math.random() - 0.5) * this.snowArea.width;
        positions[i * 3 + 1] = this.playerPosition.y + this.snowArea.height * 0.5 + Math.random() * this.snowArea.height * 0.5;
        positions[i * 3 + 2] = this.playerPosition.z + (Math.random() - 0.5) * this.snowArea.depth;
      }

      // Keep particles in area around player
      const dx = positions[i * 3] - this.playerPosition.x;
      const dz = positions[i * 3 + 2] - this.playerPosition.z;

      if (Math.abs(dx) > this.snowArea.width * 0.6) {
        positions[i * 3] = this.playerPosition.x + (Math.random() - 0.5) * this.snowArea.width * 0.5;
      }
      if (Math.abs(dz) > this.snowArea.depth * 0.6) {
        positions[i * 3 + 2] = this.playerPosition.z + (Math.random() - 0.5) * this.snowArea.depth * 0.5;
      }
    }

    this.snowParticles.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Update fog based on altitude and speed
   */
  updateFog(playerPosition) {
    if (!this.fog) return;

    // Increase fog at higher altitudes (mountain peak effect)
    const altitudeFactor = Math.max(0, playerPosition.y / 200);
    const targetDensity = this.baseFogDensity * (1 + altitudeFactor * 0.5);

    // Smooth transition
    this.fog.density = THREE.MathUtils.lerp(this.fog.density, targetDensity, 0.02);
  }

  /**
   * Set time of day (affects lighting color)
   */
  setTimeOfDay(time) {
    this.timeOfDay = Math.max(0, Math.min(1, time));

    // Interpolate light color based on time
    let lightColor;
    if (this.timeOfDay < 0.25) {
      // Dawn to morning
      lightColor = this.lightColors.dawn.clone().lerp(this.lightColors.midday, this.timeOfDay * 4);
    } else if (this.timeOfDay < 0.5) {
      // Morning to midday
      lightColor = this.lightColors.midday.clone();
    } else if (this.timeOfDay < 0.75) {
      // Midday to afternoon
      lightColor = this.lightColors.midday.clone().lerp(this.lightColors.afternoon, (this.timeOfDay - 0.5) * 4);
    } else {
      // Afternoon to dusk
      lightColor = this.lightColors.afternoon.clone().lerp(this.lightColors.dusk, (this.timeOfDay - 0.75) * 4);
    }

    if (this.sunLight) {
      this.sunLight.color.copy(lightColor);
    }

    // Adjust fog color to match
    if (this.fog) {
      const fogColor = new THREE.Color(0xd8e8f8).lerp(lightColor, 0.2);
      this.fog.color.copy(fogColor);
    }
  }

  /**
   * Set snow intensity (0 = none, 1 = heavy)
   */
  setSnowIntensity(intensity) {
    if (this.snowParticles) {
      this.snowParticles.material.opacity = intensity * 0.6;
      this.snowParticles.visible = intensity > 0.1;
    }
  }

  /**
   * Set wind (affects snow direction)
   */
  setWind(direction, strength) {
    this.windDirection.copy(direction).normalize();
    this.windStrength = strength;
  }

  /**
   * Clean up
   */
  dispose() {
    if (this.snowParticles) {
      this.scene.remove(this.snowParticles);
      this.snowParticles.geometry.dispose();
      this.snowParticles.material.dispose();
    }
    this.scene.fog = null;
  }
}
