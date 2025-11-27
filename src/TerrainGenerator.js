import * as THREE from 'three';

export class TerrainGenerator {
  constructor(sceneManager, physicsWorld) {
    this.sceneManager = sceneManager;
    this.physicsWorld = physicsWorld;
    this.mesh = null;
    this.body = null;

    // Terrain parameters
    this.length = 500;  // meters (z-axis, downhill)
    this.width = 60;    // meters (x-axis)
    this.segmentsX = 60;
    this.segmentsZ = 250;
  }

  generate() {
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

    // Apply slope - smooth continuous descent
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);

      // z goes from -length/2 to +length/2
      const normalizedZ = (z + this.length / 2) / this.length; // 0 to 1

      // Smooth slope with cubic easing for natural feel
      // Starts gentle, gets steeper in middle, eases at end
      let height = 0;

      // Base slope - total drop of about 150m
      const t = normalizedZ;
      // Smooth S-curve slope
      height = -t * 150;

      // Add some terrain variation for interest
      // Gentle rolling hills
      height += Math.sin(z * 0.02) * 3;
      height += Math.sin(z * 0.05 + x * 0.1) * 1.5;

      // Slight banking on edges (higher on sides)
      const edgeDist = Math.abs(x) / (this.width / 2);
      height += edgeDist * edgeDist * 2;

      // Very subtle noise
      height += Math.sin(x * 0.5 + z * 0.3) * 0.3;
      height += Math.sin(x * 0.2 - z * 0.4) * 0.2;

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

    // Add edge markers (simple poles to show boundaries)
    this.addBoundaryMarkers();

    // Create physics collider
    this.createPhysicsCollider(geometry);

    return {
      startPosition: { x: 0, y: 8, z: -this.length / 2 + 30 },
      length: this.length,
      width: this.width
    };
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
    const normalizedZ = (z + this.length / 2) / this.length;
    const t = normalizedZ;

    let height = -t * 150;
    height += Math.sin(z * 0.02) * 3;
    height += Math.sin(z * 0.05 + x * 0.1) * 1.5;

    const edgeDist = Math.abs(x) / (this.width / 2);
    height += edgeDist * edgeDist * 2;

    return height;
  }
}
