import * as THREE from 'three';

export class TerrainGenerator {
  constructor(sceneManager, physicsWorld) {
    this.sceneManager = sceneManager;
    this.physicsWorld = physicsWorld;
    this.mesh = null;
    this.body = null;

    // Terrain parameters
    this.length = 600;  // meters (z-axis, downhill) - longer run
    this.width = 80;    // meters (x-axis) - wider for features
    this.segmentsX = 100;
    this.segmentsZ = 400;

    // Feature locations for procedural terrain park
    this.features = [];
  }

  generate() {
    // Define terrain features
    this.defineFeatures();

    // Create geometry
    const geometry = new THREE.PlaneGeometry(
      this.width,
      this.length,
      this.segmentsX,
      this.segmentsZ
    );

    // Rotate to be horizontal (facing up)
    geometry.rotateX(-Math.PI / 2);

    // Get position attribute
    const positions = geometry.attributes.position;

    // Apply slope and features
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);

      const height = this.calculateHeight(x, z);
      positions.setY(i, height);
    }

    geometry.computeVertexNormals();

    // Create material - snow with slight blue tint
    const material = new THREE.MeshLambertMaterial({
      color: 0xf8f8ff,
      side: THREE.DoubleSide
    });

    // Create mesh
    this.mesh = new THREE.Mesh(geometry, material);
    this.sceneManager.add(this.mesh);

    // Add edge markers and feature markers
    this.addBoundaryMarkers();
    this.addFeatureMarkers();

    // Create physics collider
    this.createPhysicsCollider(geometry);

    return {
      startPosition: { x: 0, y: 8, z: -this.length / 2 + 30 },
      length: this.length,
      width: this.width
    };
  }

  defineFeatures() {
    // Clear existing
    this.features = [];

    // === JUMPS (kickers) ===
    // First jump - small warm-up
    this.features.push({
      type: 'jump',
      x: 0,
      z: -this.length / 2 + 80,
      width: 12,
      length: 15,
      height: 2.5,
      angle: 25 // takeoff angle in degrees
    });

    // Medium jump - slightly off-center
    this.features.push({
      type: 'jump',
      x: -8,
      z: -this.length / 2 + 180,
      width: 14,
      length: 18,
      height: 3.5,
      angle: 30
    });

    // Big jump - center
    this.features.push({
      type: 'jump',
      x: 5,
      z: -this.length / 2 + 300,
      width: 16,
      length: 22,
      height: 5,
      angle: 35
    });

    // === ROLLERS (speed bumps) ===
    this.features.push({
      type: 'roller',
      x: 10,
      z: -this.length / 2 + 130,
      width: 20,
      length: 12,
      height: 1.8
    });

    this.features.push({
      type: 'roller',
      x: -12,
      z: -this.length / 2 + 250,
      width: 18,
      length: 10,
      height: 2
    });

    // === BANKS/BERMS ===
    this.features.push({
      type: 'bank',
      x: -20,
      z: -this.length / 2 + 220,
      width: 25,
      length: 40,
      height: 4,
      side: 'left'
    });

    this.features.push({
      type: 'bank',
      x: 22,
      z: -this.length / 2 + 350,
      width: 25,
      length: 45,
      height: 5,
      side: 'right'
    });

    // === SPINES/HIPS ===
    this.features.push({
      type: 'spine',
      x: 0,
      z: -this.length / 2 + 420,
      width: 30,
      length: 25,
      height: 4
    });

    // === FINAL BIG KICKER ===
    this.features.push({
      type: 'jump',
      x: 0,
      z: -this.length / 2 + 500,
      width: 20,
      length: 28,
      height: 6,
      angle: 40
    });
  }

  calculateHeight(x, z) {
    // z goes from -length/2 to +length/2
    const normalizedZ = (z + this.length / 2) / this.length;

    // === BASE SLOPE ===
    // Steeper at start, gentler in middle (terrain park area), steeper at end
    let height = 0;
    const t = normalizedZ;

    // Variable slope - steeper sections with flatter park areas
    if (t < 0.1) {
      // Starting run-in - moderate
      height = -t * 180;
    } else if (t < 0.7) {
      // Main terrain park - gentler slope
      height = -18 - (t - 0.1) * 140;
    } else {
      // Run-out - moderate
      height = -102 - (t - 0.7) * 200;
    }

    // === NATURAL TERRAIN VARIATION ===
    // Gentle rolling
    height += Math.sin(z * 0.015) * 2;
    height += Math.sin(z * 0.04 + x * 0.08) * 1;

    // Edge banking (higher on sides for natural bowl feel)
    const edgeDist = Math.abs(x) / (this.width / 2);
    height += edgeDist * edgeDist * 3;

    // Subtle noise for natural snow surface
    height += Math.sin(x * 0.4 + z * 0.25) * 0.25;
    height += Math.sin(x * 0.15 - z * 0.3) * 0.15;

    // === APPLY FEATURES ===
    for (const feature of this.features) {
      height += this.applyFeature(x, z, feature);
    }

    return height;
  }

  applyFeature(x, z, feature) {
    // Calculate distance from feature center
    const dx = x - feature.x;
    const dz = z - feature.z;

    // Check if point is within feature bounds
    const inX = Math.abs(dx) < feature.width / 2;
    const inZ = Math.abs(dz) < feature.length / 2;

    if (!inX || !inZ) return 0;

    // Normalized position within feature (0-1)
    const nx = (dx + feature.width / 2) / feature.width;
    const nz = (dz + feature.length / 2) / feature.length;

    // Soft edges using smoothstep
    const edgeFalloff = this.smoothEdge(nx, nz, 0.15);

    switch (feature.type) {
      case 'jump':
        return this.createJump(nx, nz, feature) * edgeFalloff;

      case 'roller':
        return this.createRoller(nx, nz, feature) * edgeFalloff;

      case 'bank':
        return this.createBank(nx, nz, feature, dx) * edgeFalloff;

      case 'spine':
        return this.createSpine(nx, nz, feature, dx) * edgeFalloff;

      default:
        return 0;
    }
  }

  createJump(nx, nz, feature) {
    // Jump profile: flat approach, curved transition, angled lip
    const h = feature.height;

    if (nz < 0.3) {
      // Flat approach
      return 0;
    } else if (nz < 0.7) {
      // Curved transition up
      const t = (nz - 0.3) / 0.4;
      // Smooth curve (quarter circle profile)
      return h * Math.sin(t * Math.PI / 2);
    } else {
      // Angled lip section
      const t = (nz - 0.7) / 0.3;
      // Maintain angle at top
      const lipAngle = (feature.angle || 30) * Math.PI / 180;
      return h + t * Math.tan(lipAngle) * (feature.length * 0.3);
    }
  }

  createRoller(nx, nz, feature) {
    // Smooth bump - sine wave profile
    const t = nz;
    return feature.height * Math.sin(t * Math.PI);
  }

  createBank(nx, nz, feature, dx) {
    // Banked turn - higher on one side
    const h = feature.height;
    const t = nz;

    // Smooth entry/exit
    const lengthProfile = Math.sin(t * Math.PI);

    // Side profile - banking
    let sideProfile;
    if (feature.side === 'left') {
      sideProfile = 1 - nx; // Higher on right side of feature (left turn)
    } else {
      sideProfile = nx; // Higher on left side of feature (right turn)
    }

    return h * lengthProfile * sideProfile * sideProfile;
  }

  createSpine(nx, nz, feature, dx) {
    // Spine - peak in the middle with slopes down both sides
    const h = feature.height;
    const t = nz;

    // Length profile
    const lengthProfile = Math.sin(t * Math.PI);

    // Cross profile - peaked in center
    const crossProfile = 1 - Math.abs(nx - 0.5) * 2;

    return h * lengthProfile * crossProfile * crossProfile;
  }

  smoothEdge(nx, nz, falloff) {
    // Smooth falloff at edges
    let edge = 1;

    if (nx < falloff) {
      edge *= nx / falloff;
    } else if (nx > 1 - falloff) {
      edge *= (1 - nx) / falloff;
    }

    if (nz < falloff) {
      edge *= nz / falloff;
    } else if (nz > 1 - falloff) {
      edge *= (1 - nz) / falloff;
    }

    // Smoothstep for nicer transitions
    return edge * edge * (3 - 2 * edge);
  }

  addFeatureMarkers() {
    // Add colored poles to mark jump takeoffs
    const jumpPoleGeo = new THREE.CylinderGeometry(0.15, 0.15, 4, 8);
    const jumpPoleMat = new THREE.MeshLambertMaterial({ color: 0x00ff00 }); // Green for jumps

    const bankPoleGeo = new THREE.CylinderGeometry(0.12, 0.12, 3, 8);
    const bankPoleMat = new THREE.MeshLambertMaterial({ color: 0x0088ff }); // Blue for banks

    for (const feature of this.features) {
      if (feature.type === 'jump') {
        // Mark jump lip with green poles
        const leftPole = new THREE.Mesh(jumpPoleGeo, jumpPoleMat);
        const rightPole = new THREE.Mesh(jumpPoleGeo, jumpPoleMat);

        const lipZ = feature.z + feature.length * 0.35;
        const poleY = this.calculateHeight(feature.x, lipZ) + 2;

        leftPole.position.set(feature.x - feature.width / 2, poleY, lipZ);
        rightPole.position.set(feature.x + feature.width / 2, poleY, lipZ);

        this.sceneManager.add(leftPole);
        this.sceneManager.add(rightPole);
      } else if (feature.type === 'bank') {
        // Mark bank entry/exit
        const bankX = feature.side === 'left' ? feature.x - feature.width / 2 : feature.x + feature.width / 2;
        const pole = new THREE.Mesh(bankPoleGeo, bankPoleMat);
        const poleY = this.calculateHeight(bankX, feature.z) + 1.5;
        pole.position.set(bankX, poleY, feature.z);
        this.sceneManager.add(pole);
      }
    }
  }

  addBoundaryMarkers() {
    const poleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3, 8);
    const poleMaterial = new THREE.MeshLambertMaterial({ color: 0xff4400 });

    // Place poles along edges
    for (let z = -this.length / 2; z < this.length / 2; z += 30) {
      // Left side
      const leftPole = new THREE.Mesh(poleGeometry, poleMaterial);
      leftPole.position.set(-this.width / 2 + 2, this.getHeightAt(-this.width / 2 + 2, z) + 1.5, z);
      this.sceneManager.add(leftPole);

      // Right side
      const rightPole = new THREE.Mesh(poleGeometry, poleMaterial);
      rightPole.position.set(this.width / 2 - 2, this.getHeightAt(this.width / 2 - 2, z) + 1.5, z);
      this.sceneManager.add(rightPole);
    }
  }

  createPhysicsCollider(geometry) {
    const RAPIER = this.physicsWorld.RAPIER;

    // Extract vertices and indices for trimesh
    const positions = geometry.attributes.position;
    const vertices = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      vertices[i * 3] = positions.getX(i);
      vertices[i * 3 + 1] = positions.getY(i);
      vertices[i * 3 + 2] = positions.getZ(i);
    }

    const indices = new Uint32Array(geometry.index.array);

    // Create fixed body for terrain
    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    this.body = this.physicsWorld.createRigidBody(bodyDesc);

    // Create trimesh collider
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.2)
      .setRestitution(0.0);

    this.physicsWorld.createCollider(colliderDesc, this.body);
  }

  getHeightAt(x, z) {
    return this.calculateHeight(x, z);
  }
}
