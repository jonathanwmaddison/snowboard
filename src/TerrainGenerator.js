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
    this.segmentsX = 200;
    this.segmentsZ = 500;

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
  }

  /**
   * Generate terrain features that reward carving
   */
  generateFeatures() {
    this.features = [];

    // Feature placement along the trail
    const featureSpacing = 60; // Average spacing between features
    let z = -this.length / 2 + 100; // Start after initial section

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
      } else {
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
      }

      this.features.push(feature);
      z += spacing;
    }
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

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.0,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.sceneManager.add(this.mesh);

    // Add trees on sides
    this.addTrees();

    // Add trail markers
    this.addTrailMarkers();

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

      // Groomed corduroy pattern
      const corduroy = Math.sin(z * 6) * 0.08 * trailBlend;
      trailHeight += corduroy;

      // Very subtle variation
      trailHeight += this.detailNoise.noise2D(x * 0.05, z * 0.04) * 0.3 * (1 - trailBlend);

      // Banked edges - trail edges are slightly raised
      const bankHeight = Math.pow(1 - trailBlend, 2) * 1.5;
      trailHeight += bankHeight;

      // === ADD TERRAIN FEATURES ===
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
        case 'roller':
          // Peak of roller is ideal transition point
          // Sync is highest at peak (phase ~0.5)
          const peakDist = Math.abs(state.featurePhase - 0.5);
          state.terrainSync = Math.max(0, 1 - peakDist * 4);
          break;

        case 'bank':
          // Entry to bank (phase 0.2-0.4) is ideal for committing to edge
          if (state.featurePhase > 0.2 && state.featurePhase < 0.5) {
            state.terrainSync = 1 - Math.abs(state.featurePhase - 0.35) * 5;
          }
          break;

        case 'compression':
          // Bottom of compression (phase ~0.5) rewards deep edge
          const compDist = Math.abs(state.featurePhase - 0.5);
          state.terrainSync = Math.max(0, 1 - compDist * 3) * 0.8;
          break;

        case 'wave':
          // Multiple sync points on wave peaks
          const waveFreq = nearestFeature.frequency || 3;
          const wavePhase = state.featurePhase * waveFreq;
          const wavePeak = Math.abs(Math.sin(wavePhase * Math.PI));
          state.terrainSync = wavePeak * 0.7;
          break;
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

    if (onTrail) {
      // GROOMED TRAIL - very distinct corduroy pattern
      const corduroySine = Math.sin(z * 6);
      const corduroyValue = (corduroySine + 1) * 0.5; // 0 to 1

      // Alternating light and dark stripes
      const ridgeColor = { r: 0.95, g: 0.96, b: 0.98 };  // Bright
      const valleyColor = { r: 0.80, g: 0.84, b: 0.92 }; // Darker blue-gray

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
