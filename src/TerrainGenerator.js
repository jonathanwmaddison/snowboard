import * as THREE from 'three';
import { SimplexNoise } from './SimplexNoise.js';

export class TerrainGenerator {
  constructor(sceneManager, physicsWorld) {
    this.sceneManager = sceneManager;
    this.physicsWorld = physicsWorld;
    this.mesh = null;
    this.body = null;

    // Mountain parameters
    this.length = 1000;  // meters downhill
    this.width = 200;    // meters wide
    this.segmentsX = 400;
    this.segmentsZ = 1000;

    // Noise generators
    this.noise = new SimplexNoise(12345);
    this.detailNoise = new SimplexNoise(67890);

    // Mountain profile
    this.peakHeight = 300;

    // Trail parameters
    this.trailWidth = 40;

    // === TERRAIN FEATURES for carve gameplay ===
    // These create rhythm opportunities and scoring zones
    this.features = [];
    this.generateFeatures();

    // === SNOW CONDITIONS (ice, powder, groomed) ===
    // Creates challenge zones that affect grip and speed
    this.snowZones = [];
    this.generateSnowZones();

    // === GRIND RAILS ===
    this.rails = [];
    this.railMeshes = [];
    this.generateRails();
  }

  /**
   * Generate terrain features that reward carving
   */
  generateFeatures() {
    this.features = [];

    // Add guaranteed kicker near the start so players can find it easily
    const startZ = -this.length / 2 + 150;
    const startTrailX = this.getTrailCenterX(startZ);
    this.features.push({
      type: 'kicker',
      x: startTrailX,
      z: startZ,
      width: 12,
      length: 16,
      height: 4,
      angle: 0.45
    });

    // Feature placement along the trail
    const featureSpacing = 60; // Average spacing between features
    let z = -this.length / 2 + 200; // Start after the guaranteed kicker

    while (z < this.length / 2 - 100) {
      const trailX = this.getTrailCenterX(z);

      // Randomize spacing
      const spacing = featureSpacing * (0.7 + Math.random() * 0.6);

      // Choose feature type based on position and randomness
      const rand = Math.random();
      let feature;

      if (rand < 0.35) {
        // ROLLER - Undulation that syncs with carve rhythm
        feature = {
          type: 'roller',
          x: trailX,
          z: z,
          width: 30 + Math.random() * 15,
          length: 15 + Math.random() * 10,
          height: 1.5 + Math.random() * 1.5,
          // Optimal carve transition at the peak
          peakZ: z
        };
      } else if (rand < 0.6) {
        // BANK - Natural wall for carving into
        const side = Math.random() > 0.5 ? 1 : -1;
        feature = {
          type: 'bank',
          x: trailX + side * (this.trailWidth * 0.3),
          z: z,
          side: side,
          width: 12 + Math.random() * 8,
          length: 25 + Math.random() * 15,
          height: 2 + Math.random() * 2,
          angle: 0.3 + Math.random() * 0.3 // Bank angle in radians
        };
      } else if (rand < 0.8) {
        // COMPRESSION ZONE - Dip that amplifies G-forces
        feature = {
          type: 'compression',
          x: trailX,
          z: z,
          width: 25 + Math.random() * 10,
          length: 20 + Math.random() * 10,
          depth: 1 + Math.random() * 1.5
        };
      } else if (rand < 0.85) {
        // TERRAIN WAVE - Series of gentle undulations
        feature = {
          type: 'wave',
          x: trailX,
          z: z,
          width: 35,
          length: 40 + Math.random() * 20,
          amplitude: 0.8 + Math.random() * 0.6,
          frequency: 3 + Math.floor(Math.random() * 2) // Number of waves
        };
      } else {
        // KICKER - Jump ramp for big air! (~15% of features)
        feature = {
          type: 'kicker',
          x: trailX + (Math.random() - 0.5) * 6, // Slight offset from center
          width: 10 + Math.random() * 4,    // 10-14m wide
          z: z,
          length: 14 + Math.random() * 6,   // 14-20m long ramp
          height: 3 + Math.random() * 2,    // 3-5m tall
          angle: 0.4 + Math.random() * 0.15 // Takeoff angle ~23-32 degrees
        };
      }

      this.features.push(feature);
      z += spacing;
    }
  }

  /**
   * Generate snow condition zones (ice, powder, groomed)
   * Ice = challenging, low grip but faster
   * Powder = forgiving, high grip but slower
   * Groomed = default balanced conditions
   */
  generateSnowZones() {
    this.snowZones = [];

    let z = -this.length / 2 + 80;
    while (z < this.length / 2 - 100) {
      const trailX = this.getTrailCenterX(z);

      // Random zone type with weighted probability
      const rand = Math.random();
      let zoneType;

      if (rand < 0.15) {
        // ICE PATCH - challenging! Appears on shaded/steep sections
        zoneType = 'ice';
      } else if (rand < 0.30) {
        // POWDER - off the groomed line, forgiving but slow
        zoneType = 'powder';
      } else if (rand < 0.40) {
        // SLUSH - late day conditions, unpredictable
        zoneType = 'slush';
      } else {
        // Skip - leave as groomed (don't add zone)
        z += 40 + Math.random() * 60;
        continue;
      }

      // Zone dimensions
      const zoneWidth = 15 + Math.random() * 20;
      const zoneLength = 20 + Math.random() * 30;

      // Position offset from trail center
      const xOffset = (Math.random() - 0.5) * this.trailWidth * 0.6;

      this.snowZones.push({
        type: zoneType,
        x: trailX + xOffset,
        z: z,
        width: zoneWidth,
        length: zoneLength,
        // Properties based on type
        gripMultiplier: this.getZoneGrip(zoneType),
        speedMultiplier: this.getZoneSpeed(zoneType),
        dragMultiplier: this.getZoneDrag(zoneType)
      });

      // Space between zones
      z += zoneLength + 50 + Math.random() * 80;
    }
  }

  getZoneGrip(type) {
    switch (type) {
      case 'ice': return 0.4;      // Very low grip - hard to hold edge
      case 'powder': return 1.2;   // High grip - forgiving
      case 'slush': return 0.7;    // Unpredictable grip
      default: return 1.0;
    }
  }

  getZoneSpeed(type) {
    switch (type) {
      case 'ice': return 1.15;     // Fast! Low friction
      case 'powder': return 0.7;   // Slow - snow resistance
      case 'slush': return 0.85;   // Slightly slow
      default: return 1.0;
    }
  }

  getZoneDrag(type) {
    switch (type) {
      case 'ice': return 0.7;      // Less drag
      case 'powder': return 1.8;   // High drag
      case 'slush': return 1.3;    // Medium drag
      default: return 1.0;
    }
  }

  /**
   * Generate grind rails along the course
   * Rails placed after kickers for style combos
   */
  generateRails() {
    this.rails = [];

    // Place rails after some kickers for jump-to-grind combos
    for (const feature of this.features) {
      if (feature.type === 'kicker') {
        // 60% chance to place a rail after a kicker
        if (Math.random() < 0.6) {
          const railZ = feature.z + feature.length + 8; // Landing zone
          const trailX = this.getTrailCenterX(railZ);

          // Rail parameters
          const railLength = 8 + Math.random() * 6; // 8-14m long
          const railHeight = 0.8 + Math.random() * 0.4; // 0.8-1.2m high
          const railAngle = (Math.random() - 0.5) * 0.3; // Slight angle variation

          // Offset from center (sometimes left, sometimes right, sometimes center)
          const offsetChoice = Math.random();
          let xOffset = 0;
          if (offsetChoice < 0.33) {
            xOffset = -6 - Math.random() * 4; // Left
          } else if (offsetChoice < 0.66) {
            xOffset = 6 + Math.random() * 4; // Right
          }

          this.rails.push({
            x: trailX + xOffset,
            z: railZ,
            length: railLength,
            height: railHeight,
            angle: railAngle, // Direction rail points (down the slope)
            width: 0.15, // Rail width (hitbox)
            type: 'flat' // flat, down, kinked
          });
        }
      }
    }

    // Add some standalone rails along the trail
    let z = -this.length / 2 + 250;
    while (z < this.length / 2 - 150) {
      if (Math.random() < 0.3) { // 30% chance at each position
        const trailX = this.getTrailCenterX(z);
        const side = Math.random() > 0.5 ? 1 : -1;
        const railLength = 10 + Math.random() * 8;

        this.rails.push({
          x: trailX + side * (8 + Math.random() * 6),
          z: z,
          length: railLength,
          height: 0.6 + Math.random() * 0.6,
          angle: (Math.random() - 0.5) * 0.2, // Slight angle
          width: 0.15,
          type: Math.random() < 0.2 ? 'down' : 'flat'
        });
      }
      z += 80 + Math.random() * 60;
    }
  }

  /**
   * Check if position is on a rail
   * Returns rail info or null
   */
  getRailAt(x, y, z) {
    for (const rail of this.rails) {
      // Get rail endpoints
      const railStartZ = rail.z - rail.length / 2;
      const railEndZ = rail.z + rail.length / 2;

      // Check Z bounds (along rail)
      if (z < railStartZ || z > railEndZ) continue;

      // Calculate rail position at this Z
      const t = (z - railStartZ) / rail.length;
      const railX = rail.x + Math.sin(rail.angle) * (z - rail.z);
      const railY = this.calculateHeight(rail.x, rail.z) + rail.height;

      // Height check - must be near the rail (above it or landing on it)
      const heightDiff = y - railY;
      if (heightDiff < -0.3 || heightDiff > 1.5) continue;

      // X distance check (width of rail hitbox)
      const xDist = Math.abs(x - railX);
      if (xDist > 0.8) continue; // Generous hitbox for gameplay

      return {
        rail: rail,
        railX: railX,
        railY: railY,
        railZ: z,
        progress: t,
        distance: xDist
      };
    }
    return null;
  }

  /**
   * Get snow condition at a position
   * Returns { type, gripMultiplier, speedMultiplier, dragMultiplier, intensity }
   */
  getSnowCondition(x, z) {
    // Default groomed conditions
    const condition = {
      type: 'groomed',
      gripMultiplier: 1.0,
      speedMultiplier: 1.0,
      dragMultiplier: 1.0,
      intensity: 0  // 0 = not in zone, 1 = center of zone
    };

    // Check all snow zones
    for (const zone of this.snowZones) {
      const dx = x - zone.x;
      const dz = z - zone.z;

      // Elliptical zone check
      const normalizedX = dx / (zone.width / 2);
      const normalizedZ = dz / (zone.length / 2);
      const distSq = normalizedX * normalizedX + normalizedZ * normalizedZ;

      if (distSq < 1) {
        // Inside zone - calculate intensity (1 at center, 0 at edge)
        const dist = Math.sqrt(distSq);
        const intensity = 1 - dist;

        // Blend with default based on intensity (smooth transition)
        condition.type = zone.type;
        condition.intensity = intensity;
        condition.gripMultiplier = 1 + (zone.gripMultiplier - 1) * intensity;
        condition.speedMultiplier = 1 + (zone.speedMultiplier - 1) * intensity;
        condition.dragMultiplier = 1 + (zone.dragMultiplier - 1) * intensity;

        break; // Use first matching zone
      }
    }

    return condition;
  }

  // Get the X position of the trail center at a given Z
  getTrailCenterX(z) {
    // Trail weaves left and right using sine waves
    const t = (z + this.length / 2) / this.length; // 0 to 1 down the mountain

    // Combine multiple sine waves for interesting path
    const wave1 = Math.sin(t * Math.PI * 4) * 35;      // 2 full S-curves
    const wave2 = Math.sin(t * Math.PI * 2 + 1) * 20;  // Longer wave
    const wave3 = Math.sin(t * Math.PI * 7) * 10;      // Quick wiggles

    return wave1 + wave2 + wave3 * (1 - t); // Less wiggle at bottom
  }

  // Get distance from trail center (0 = center, 1 = edge, >1 = off trail)
  getTrailDistance(x, z) {
    const trailX = this.getTrailCenterX(z);
    const distFromCenter = Math.abs(x - trailX);
    return distFromCenter / (this.trailWidth / 2);
  }

  // Calculate trail curvature at a given Z position
  // Returns curvature value and direction (+/- for left/right turn)
  getTrailCurvature(z) {
    const delta = 5;  // Sample distance
    const x0 = this.getTrailCenterX(z - delta);
    const x1 = this.getTrailCenterX(z);
    const x2 = this.getTrailCenterX(z + delta);

    // Second derivative approximation for curvature
    const curvature = (x2 - 2 * x1 + x0) / (delta * delta);

    return curvature;
  }

  generate() {
    const geometry = new THREE.PlaneGeometry(
      this.width,
      this.length,
      this.segmentsX,
      this.segmentsZ
    );

    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    // Generate terrain
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);

      const height = this.calculateHeight(x, z);
      positions.setY(i, height);

      const color = this.getTerrainColor(x, z);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    // Custom shader for fine corduroy pattern
    const material = new THREE.ShaderMaterial({
      uniforms: {
        trailWidth: { value: this.trailWidth },
        trailLength: { value: this.length },
      },
      vertexShader: `
        varying vec3 vColor;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
          vColor = color;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vNormal = normalMatrix * normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float trailWidth;
        uniform float trailLength;

        varying vec3 vColor;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
          vec3 baseColor = vColor;

          // Detect if on trail by color (trail is slightly blue-tinted)
          float isTrail = step(0.01, baseColor.b - baseColor.r);

          // Fine corduroy pattern - lines running down the trail (along X)
          // ~3cm spacing for realistic groomed look
          float corduroyFreq = 200.0; // Very fine lines
          float corduroy = sin(vWorldPos.x * corduroyFreq);

          // Sharpen the pattern
          corduroy = smoothstep(-0.3, 0.3, corduroy);

          // Subtle brightness variation (5% difference)
          float corduroyEffect = mix(0.97, 1.03, corduroy) * isTrail + (1.0 - isTrail);

          // Apply corduroy to base color
          vec3 finalColor = baseColor * corduroyEffect;

          // Simple lighting
          vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
          float diffuse = max(dot(vNormal, lightDir), 0.0);
          float ambient = 0.4;
          float light = ambient + diffuse * 0.6;

          gl_FragColor = vec4(finalColor * light, 1.0);
        }
      `,
      vertexColors: true,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.sceneManager.add(this.mesh);

    // Add trees on sides
    this.addTrees();

    // Add trail markers
    this.addTrailMarkers();

    // Add grind rails
    this.addRailMeshes();

    this.createPhysicsCollider(geometry);

    // Spawn on trail
    const startZ = -this.length / 2 + 30;
    const startX = this.getTrailCenterX(startZ);
    const startY = this.calculateHeight(startX, startZ) + 2;

    return {
      startPosition: { x: startX, y: startY, z: startZ },
      length: this.length,
      width: this.width
    };
  }

  calculateHeight(x, z) {
    // Normalized position down the mountain (0 = top, 1 = bottom)
    const t = (z + this.length / 2) / this.length;

    // === BASE SLOPE ===
    // Mountain goes from peakHeight at top to 0 at bottom
    // Variable steepness for interest
    let baseHeight;
    if (t < 0.1) {
      // Gentle start
      baseHeight = this.peakHeight * (1 - t * 2);
    } else if (t < 0.4) {
      // Steeper section
      baseHeight = this.peakHeight * (0.8 - (t - 0.1) * 1.5);
    } else if (t < 0.7) {
      // Medium slope
      baseHeight = this.peakHeight * (0.35 - (t - 0.4) * 0.8);
    } else {
      // Runout
      baseHeight = this.peakHeight * (0.11 - (t - 0.7) * 0.35);
    }

    // === TRAIL DETECTION ===
    const trailDist = this.getTrailDistance(x, z);
    const onTrail = trailDist < 1.0;
    const trailBlend = Math.max(0, 1 - trailDist); // 1 at center, 0 at edge

    // === OFF-TRAIL TERRAIN ===
    // Bumpy natural terrain off the trail
    let offTrailHeight = 0;
    if (!onTrail) {
      // Large rolling hills
      offTrailHeight += this.noise.fbm(x * 0.01, z * 0.008, 4, 2.0, 0.5) * 15;
      // Medium bumps
      offTrailHeight += this.detailNoise.fbm(x * 0.03, z * 0.025, 3, 2.0, 0.5) * 5;
      // Small rough texture
      offTrailHeight += this.noise.noise2D(x * 0.1, z * 0.08) * 2;

      // Raise edges of mountain
      const edgeDist = Math.abs(x) / (this.width / 2);
      if (edgeDist > 0.6) {
        offTrailHeight += Math.pow((edgeDist - 0.6) / 0.4, 2) * 40;
      }
    }

    // === ON-TRAIL TERRAIN ===
    let trailHeight = 0;
    if (onTrail) {
      // Trail is carved INTO the mountain (lower than surroundings)
      const carveDepth = 3 * trailBlend;
      trailHeight -= carveDepth;

      // Groomed trail - completely flat cross-section for smooth carving
      // No corduroy physics bumps, no banking - just pure smooth snow

      // Enable kickers for jumps on the trail
      trailHeight += this.getFeatureHeight(x, z, trailBlend);
    }

    // === BLEND TRAIL AND OFF-TRAIL ===
    let height = baseHeight;
    if (onTrail) {
      height += trailHeight;
    } else {
      height += offTrailHeight;
      // Smooth transition at trail edge
      if (trailDist < 1.5) {
        const edgeBlend = (trailDist - 1.0) / 0.5;
        height = THREE.MathUtils.lerp(baseHeight + trailHeight, height, edgeBlend);
      }
    }

    return height;
  }

  /**
   * Calculate height contribution from terrain features
   */
  getFeatureHeight(x, z, trailBlend) {
    let featureHeight = 0;

    for (const feature of this.features) {
      const dx = x - feature.x;
      const dz = z - feature.z;

      switch (feature.type) {
        case 'roller': {
          // Smooth bump - sine wave shape
          const distZ = Math.abs(dz) / (feature.length / 2);
          const distX = Math.abs(dx) / (feature.width / 2);
          if (distZ < 1 && distX < 1) {
            // Smooth falloff on both axes
            const falloffZ = Math.cos(distZ * Math.PI / 2);
            const falloffX = Math.cos(distX * Math.PI / 2);
            const intensity = falloffZ * falloffX * trailBlend;
            featureHeight += feature.height * intensity;
          }
          break;
        }

        case 'bank': {
          // Angled wall on one side of trail
          const distZ = Math.abs(dz) / (feature.length / 2);
          const sideMatch = Math.sign(dx) === feature.side;
          const distFromEdge = Math.abs(dx) / (feature.width / 2);

          if (distZ < 1 && sideMatch && distFromEdge < 1) {
            const falloffZ = Math.cos(distZ * Math.PI / 2);
            // Bank rises toward the side
            const bankRise = (1 - distFromEdge) * feature.height;
            featureHeight += bankRise * falloffZ * trailBlend;
          }
          break;
        }

        case 'compression': {
          // Dip in terrain
          const distZ = Math.abs(dz) / (feature.length / 2);
          const distX = Math.abs(dx) / (feature.width / 2);
          if (distZ < 1 && distX < 1) {
            const falloffZ = Math.cos(distZ * Math.PI / 2);
            const falloffX = Math.cos(distX * Math.PI / 2);
            const intensity = falloffZ * falloffX * trailBlend;
            featureHeight -= feature.depth * intensity;
          }
          break;
        }

        case 'wave': {
          // Series of gentle undulations
          const distZ = (dz + feature.length / 2) / feature.length; // 0-1 along wave
          const distX = Math.abs(dx) / (feature.width / 2);
          if (distZ >= 0 && distZ <= 1 && distX < 1) {
            const wavePhase = distZ * feature.frequency * Math.PI * 2;
            const falloffX = Math.cos(distX * Math.PI / 2);
            const waveHeight = Math.sin(wavePhase) * feature.amplitude;
            featureHeight += waveHeight * falloffX * trailBlend;
          }
          break;
        }

        case 'kicker': {
          // Jump ramp - rises from ground level to peak, then drops off
          const distX = Math.abs(dx) / (feature.width / 2);

          if (distX < 1) {
            // Ramp profile: smooth rise to takeoff lip
            // dz < 0 means approaching (uphill), dz > 0 means past the lip
            const rampProgress = (dz + feature.length) / feature.length; // 0 at start, 1 at lip

            if (rampProgress >= 0 && rampProgress <= 1) {
              // Smooth ramp up using ease-in curve
              const rampHeight = feature.height * Math.pow(rampProgress, 1.5);
              // Smooth X falloff for width
              const falloffX = Math.cos(distX * Math.PI / 2);
              featureHeight += rampHeight * falloffX * trailBlend;
            } else if (rampProgress > 1 && rampProgress < 1.3) {
              // Lip - maintain height briefly then drop
              const lipProgress = (rampProgress - 1) / 0.3;
              const lipHeight = feature.height * (1 - lipProgress * lipProgress);
              const falloffX = Math.cos(distX * Math.PI / 2);
              featureHeight += lipHeight * falloffX * trailBlend;
            }
          }
          break;
        }
      }
    }

    return featureHeight;
  }

  /**
   * Get terrain state at position for carve resonance detection
   * Returns info about nearby features for scoring sync
   */
  getTerrainState(x, z, speed) {
    const state = {
      terrainSync: 0,        // 0-1, how well position syncs with features
      nearestFeature: null,
      featurePhase: 0,       // Where in feature we are (for rhythm)
      isOnFeature: false,
      featureType: null
    };

    // Find nearest relevant feature
    let nearestDist = Infinity;
    let nearestFeature = null;

    for (const feature of this.features) {
      const dz = z - feature.z;
      const dx = x - feature.x;

      // Check if we're in or near this feature
      const featureHalfLength = (feature.length || 20) / 2;
      const featureHalfWidth = (feature.width || 30) / 2;

      if (Math.abs(dz) < featureHalfLength * 1.5 && Math.abs(dx) < featureHalfWidth * 1.5) {
        const dist = Math.sqrt(dz * dz + dx * dx);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestFeature = feature;
        }
      }
    }

    if (nearestFeature) {
      state.nearestFeature = nearestFeature;
      state.featureType = nearestFeature.type;

      const dz = z - nearestFeature.z;
      const featureLength = nearestFeature.length || 20;

      // Calculate phase within feature (0 = entry, 0.5 = peak, 1 = exit)
      state.featurePhase = (dz / featureLength) + 0.5;
      state.featurePhase = Math.max(0, Math.min(1, state.featurePhase));

      state.isOnFeature = state.featurePhase > 0.1 && state.featurePhase < 0.9;

      // === TERRAIN SYNC SCORING ===
      // Different features have different "sync points"
      switch (nearestFeature.type) {
        case 'roller': {
          // Peak of roller is ideal transition point
          // Sync is highest at peak (phase ~0.5)
          const peakDist = Math.abs(state.featurePhase - 0.5);
          state.terrainSync = Math.max(0, 1 - peakDist * 4);
          break;
        }

        case 'bank': {
          // Entry to bank (phase 0.2-0.4) is ideal for committing to edge
          if (state.featurePhase > 0.2 && state.featurePhase < 0.5) {
            state.terrainSync = 1 - Math.abs(state.featurePhase - 0.35) * 5;
          }
          break;
        }

        case 'compression': {
          // Bottom of compression (phase ~0.5) rewards deep edge
          const compDist = Math.abs(state.featurePhase - 0.5);
          state.terrainSync = Math.max(0, 1 - compDist * 3) * 0.8;
          break;
        }

        case 'wave': {
          // Multiple sync points on wave peaks
          const waveFreq = nearestFeature.frequency || 3;
          const wavePhase = state.featurePhase * waveFreq;
          const wavePeak = Math.abs(Math.sin(wavePhase * Math.PI));
          state.terrainSync = wavePeak * 0.7;
          break;
        }
      }

      // Speed bonus - faster riding through features is more rewarding
      const speedBonus = Math.min(1, speed / 25) * 0.3;
      state.terrainSync = Math.min(1, state.terrainSync + speedBonus);
    }

    return state;
  }

  getTerrainColor(x, z) {
    const trailDist = this.getTrailDistance(x, z);
    const onTrail = trailDist < 1.0;
    const trailBlend = Math.max(0, 1 - trailDist);

    // Check for snow condition zones
    const snowCondition = this.getSnowCondition(x, z);

    if (onTrail) {
      // GROOMED TRAIL - corduroy stripes running DOWN the trail
      // Use X position relative to trail center for vertical lines
      const trailCenterX = this.getTrailCenterX(z);
      const relativeX = x - trailCenterX;

      // Fine corduroy lines ~30cm apart (like real grooming)
      const corduroyFreq = 20; // ~30cm wavelength
      const corduroySine = Math.sin(relativeX * corduroyFreq);

      // Softer stripes for natural look
      const corduroyValue = (corduroySine + 1) * 0.5;

      // Subtle but visible contrast
      let ridgeColor = { r: 0.98, g: 0.98, b: 1.0 };   // Bright
      let valleyColor = { r: 0.88, g: 0.90, b: 0.95 }; // Slight shadow

      // Modify colors based on snow condition
      if (snowCondition.intensity > 0) {
        const intensity = snowCondition.intensity;

        switch (snowCondition.type) {
          case 'ice':
            // ICE - blue-ish, shiny, menacing
            ridgeColor = {
              r: THREE.MathUtils.lerp(ridgeColor.r, 0.75, intensity),
              g: THREE.MathUtils.lerp(ridgeColor.g, 0.85, intensity),
              b: THREE.MathUtils.lerp(ridgeColor.b, 1.0, intensity)
            };
            valleyColor = {
              r: THREE.MathUtils.lerp(valleyColor.r, 0.6, intensity),
              g: THREE.MathUtils.lerp(valleyColor.g, 0.75, intensity),
              b: THREE.MathUtils.lerp(valleyColor.b, 0.95, intensity)
            };
            break;

          case 'powder':
            // POWDER - bright white, fluffy looking
            ridgeColor = {
              r: THREE.MathUtils.lerp(ridgeColor.r, 1.0, intensity),
              g: THREE.MathUtils.lerp(ridgeColor.g, 1.0, intensity),
              b: THREE.MathUtils.lerp(ridgeColor.b, 1.0, intensity)
            };
            valleyColor = {
              r: THREE.MathUtils.lerp(valleyColor.r, 0.95, intensity),
              g: THREE.MathUtils.lerp(valleyColor.g, 0.97, intensity),
              b: THREE.MathUtils.lerp(valleyColor.b, 1.0, intensity)
            };
            break;

          case 'slush':
            // SLUSH - darker, wet looking
            ridgeColor = {
              r: THREE.MathUtils.lerp(ridgeColor.r, 0.82, intensity),
              g: THREE.MathUtils.lerp(ridgeColor.g, 0.85, intensity),
              b: THREE.MathUtils.lerp(ridgeColor.b, 0.88, intensity)
            };
            valleyColor = {
              r: THREE.MathUtils.lerp(valleyColor.r, 0.7, intensity),
              g: THREE.MathUtils.lerp(valleyColor.g, 0.74, intensity),
              b: THREE.MathUtils.lerp(valleyColor.b, 0.8, intensity)
            };
            break;
        }
      }

      const r = THREE.MathUtils.lerp(valleyColor.r, ridgeColor.r, corduroyValue);
      const g = THREE.MathUtils.lerp(valleyColor.g, ridgeColor.g, corduroyValue);
      const b = THREE.MathUtils.lerp(valleyColor.b, ridgeColor.b, corduroyValue);

      // Blend with edge color
      const edgeFade = Math.pow(trailBlend, 0.5);
      return {
        r: THREE.MathUtils.lerp(0.9, r, edgeFade),
        g: THREE.MathUtils.lerp(0.92, g, edgeFade),
        b: THREE.MathUtils.lerp(0.95, b, edgeFade)
      };
    } else {
      // OFF-TRAIL - fresh powder / natural snow
      const noise = this.detailNoise.noise2D(x * 0.05, z * 0.04) * 0.05;
      return {
        r: 0.96 + noise,
        g: 0.97 + noise,
        b: 1.0
      };
    }
  }

  addTrees() {
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
    const foliageGeo = new THREE.ConeGeometry(2.5, 7, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1a4d1a, roughness: 0.8 });

    const treeGroup = new THREE.Group();
    const spacing = 15;

    for (let z = -this.length / 2 + 30; z < this.length / 2 - 30; z += spacing) {
      for (let x = -this.width / 2 + 10; x < this.width / 2 - 10; x += spacing) {
        // Only place trees OFF the trail
        const trailDist = this.getTrailDistance(x, z);
        if (trailDist < 1.5) continue; // Keep buffer around trail

        // Random offset
        const ox = (this.noise.noise2D(x * 0.1, z * 0.1) - 0.5) * spacing * 0.6;
        const oz = (this.noise.noise2D(x * 0.15, z * 0.12) - 0.5) * spacing * 0.6;
        const treeX = x + ox;
        const treeZ = z + oz;

        // Skip some randomly
        if (this.detailNoise.noise2D(treeX * 0.05, treeZ * 0.05) < 0.2) continue;

        const height = this.calculateHeight(treeX, treeZ);
        const scale = 0.6 + Math.random() * 0.5;

        const tree = new THREE.Group();

        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.scale.setScalar(scale);
        trunk.position.y = 2 * scale;
        trunk.castShadow = true;
        tree.add(trunk);

        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.scale.setScalar(scale);
        foliage.position.y = 6 * scale;
        foliage.castShadow = true;
        tree.add(foliage);

        tree.position.set(treeX, height, treeZ);
        treeGroup.add(tree);
      }
    }

    this.sceneManager.add(treeGroup);
  }

  addTrailMarkers() {
    // Orange poles along trail edges
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xff6600 });

    const markerGroup = new THREE.Group();

    for (let z = -this.length / 2 + 50; z < this.length / 2 - 50; z += 40) {
      const trailX = this.getTrailCenterX(z);

      // Left marker
      const leftX = trailX - this.trailWidth / 2;
      const leftHeight = this.calculateHeight(leftX, z);
      const leftPole = new THREE.Mesh(poleGeo, poleMat);
      leftPole.position.set(leftX, leftHeight + 1, z);
      markerGroup.add(leftPole);

      // Right marker
      const rightX = trailX + this.trailWidth / 2;
      const rightHeight = this.calculateHeight(rightX, z);
      const rightPole = new THREE.Mesh(poleGeo, poleMat);
      rightPole.position.set(rightX, rightHeight + 1, z);
      markerGroup.add(rightPole);
    }

    this.sceneManager.add(markerGroup);
  }

  addRailMeshes() {
    // Create visual meshes for grind rails
    const railGroup = new THREE.Group();

    // Rail material - metallic look
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x888899,
      metalness: 0.8,
      roughness: 0.3
    });

    // Support post material
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.5,
      roughness: 0.6
    });

    for (const rail of this.rails) {
      // Main rail tube
      const railGeo = new THREE.CylinderGeometry(0.08, 0.08, rail.length, 8);
      railGeo.rotateX(Math.PI / 2); // Align along Z axis

      const railMesh = new THREE.Mesh(railGeo, railMat);
      const railY = this.calculateHeight(rail.x, rail.z) + rail.height;
      railMesh.position.set(rail.x, railY, rail.z);
      railMesh.rotation.y = rail.angle;
      railMesh.castShadow = true;
      railMesh.receiveShadow = true;
      railGroup.add(railMesh);

      // Store mesh reference for potential effects
      this.railMeshes.push(railMesh);

      // Support posts at ends
      const postGeo = new THREE.CylinderGeometry(0.05, 0.06, rail.height, 6);

      // Start post
      const startZ = rail.z - rail.length / 2;
      const startX = rail.x + Math.sin(rail.angle) * (-rail.length / 2);
      const startY = this.calculateHeight(startX, startZ);
      const startPost = new THREE.Mesh(postGeo, postMat);
      startPost.position.set(startX, startY + rail.height / 2, startZ);
      startPost.castShadow = true;
      railGroup.add(startPost);

      // End post
      const endZ = rail.z + rail.length / 2;
      const endX = rail.x + Math.sin(rail.angle) * (rail.length / 2);
      const endY = this.calculateHeight(endX, endZ);
      const endPost = new THREE.Mesh(postGeo, postMat);
      endPost.position.set(endX, endY + rail.height / 2, endZ);
      endPost.castShadow = true;
      railGroup.add(endPost);

      // Middle support for longer rails
      if (rail.length > 10) {
        const midY = this.calculateHeight(rail.x, rail.z);
        const midPost = new THREE.Mesh(postGeo, postMat);
        midPost.position.set(rail.x, midY + rail.height / 2, rail.z);
        midPost.castShadow = true;
        railGroup.add(midPost);
      }
    }

    this.sceneManager.add(railGroup);
  }

  createPhysicsCollider(geometry) {
    const RAPIER = this.physicsWorld.RAPIER;

    const positions = geometry.attributes.position;
    const vertices = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      vertices[i * 3] = positions.getX(i);
      vertices[i * 3 + 1] = positions.getY(i);
      vertices[i * 3 + 2] = positions.getZ(i);
    }

    const indices = new Uint32Array(geometry.index.array);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    this.body = this.physicsWorld.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.15)
      .setRestitution(0.0);

    this.physicsWorld.createCollider(colliderDesc, this.body);
  }

  getHeightAt(x, z) {
    return this.calculateHeight(x, z);
  }
}
