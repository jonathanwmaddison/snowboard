import RAPIER from '@dimforge/rapier3d-compat';

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.bodies = new Map();
    this.colliders = new Map();
    this.fixedTimeStep = 1 / 60; // 60Hz physics
    this.accumulator = 0;
  }

  async init() {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this.RAPIER = RAPIER;
  }

  step(deltaTime) {
    this.accumulator += deltaTime;

    // Fixed timestep physics
    while (this.accumulator >= this.fixedTimeStep) {
      this.world.step();
      this.accumulator -= this.fixedTimeStep;
    }
  }

  createRigidBody(desc) {
    return this.world.createRigidBody(desc);
  }

  createCollider(desc, body) {
    return this.world.createCollider(desc, body);
  }

  getRigidBodyDesc(type) {
    switch (type) {
      case 'dynamic':
        return this.RAPIER.RigidBodyDesc.dynamic();
      case 'kinematic':
        return this.RAPIER.RigidBodyDesc.kinematicPositionBased();
      case 'fixed':
      default:
        return this.RAPIER.RigidBodyDesc.fixed();
    }
  }

  getColliderDesc(shape, params) {
    switch (shape) {
      case 'cuboid':
        return this.RAPIER.ColliderDesc.cuboid(params.hx, params.hy, params.hz);
      case 'ball':
        return this.RAPIER.ColliderDesc.ball(params.radius);
      case 'capsule':
        return this.RAPIER.ColliderDesc.capsule(params.halfHeight, params.radius);
      case 'trimesh':
        return this.RAPIER.ColliderDesc.trimesh(params.vertices, params.indices);
      default:
        throw new Error(`Unknown shape: ${shape}`);
    }
  }
}
