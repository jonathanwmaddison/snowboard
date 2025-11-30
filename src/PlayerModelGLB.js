import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * SpringDamper - Smooth value transitions with spring physics
 */
class SpringDamper {
  constructor(stiffness = 12, damping = 0.7) {
    this.value = 0;
    this.velocity = 0;
    this.target = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  update(dt) {
    const force = (this.target - this.value) * this.stiffness;
    this.velocity += force * dt;
    this.velocity *= Math.pow(1 - this.damping, dt * 60);
    this.value += this.velocity * dt;
    return this.value;
  }

  set(value) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
}

/**
 * SpringDamper3 - Three-component spring for Euler rotations
 */
class SpringDamper3 {
  constructor(stiffness = 12, damping = 0.7) {
    this.x = new SpringDamper(stiffness, damping);
    this.y = new SpringDamper(stiffness, damping);
    this.z = new SpringDamper(stiffness, damping);
  }

  setTarget(x, y, z) {
    this.x.target = x;
    this.y.target = y;
    this.z.target = z;
  }

  update(dt) {
    return {
      x: this.x.update(dt),
      y: this.y.update(dt),
      z: this.z.update(dt)
    };
  }

  set(x, y, z) {
    this.x.set(x);
    this.y.set(y);
    this.z.set(z);
  }
}

/**
 * PlayerModelGLB - Load external rigged character models with procedural animation
 *
 * Supports models rigged with Mixamo skeleton (industry standard)
 * Works with Ready Player Me, Quaternius, Sketchfab models, etc.
 *
 * Uses DIRECT BONE ROTATIONS (FK) instead of IK for reliable, predictable animation.
 * All bone rotations are set explicitly based on physics state.
 */
export class PlayerModelGLB {
  constructor() {
    this.mesh = null;
    this.skeleton = null;
    this.bones = {};
    this.mixer = null;
    this.animations = {};
    this.loaded = false;
    this.model = null;

    // === SPRING-DAMPED BONE CONTROLLERS ===
    // Direct FK (forward kinematics) - set bone rotations directly
    this.springs = {
      // Spine chain
      hips: new SpringDamper3(10, 0.6),
      spine: new SpringDamper3(12, 0.65),
      spine1: new SpringDamper3(14, 0.65),
      spine2: new SpringDamper3(16, 0.7),
      neck: new SpringDamper3(18, 0.75),
      head: new SpringDamper3(20, 0.8),
      // Arms
      leftArm: new SpringDamper3(10, 0.6),
      leftForeArm: new SpringDamper3(10, 0.6),
      rightArm: new SpringDamper3(10, 0.6),
      rightForeArm: new SpringDamper3(10, 0.6),
      // Legs
      leftUpLeg: new SpringDamper3(12, 0.65),
      leftLeg: new SpringDamper3(12, 0.65),
      leftFoot: new SpringDamper3(10, 0.6),
      rightUpLeg: new SpringDamper3(12, 0.65),
      rightLeg: new SpringDamper3(12, 0.65),
      rightFoot: new SpringDamper3(10, 0.6),
    };

    // Animation tuning parameters
    this.animConfig = {
      // Spine lean - how much body leans into turns
      spineLeanMultiplier: 0.6,
      spineTuckMultiplier: 0.2,
      spineCounterRotation: 0.3,

      // Leg compression - INCREASED for visibility
      legCompressionBase: 0.8,        // Base knee bend (snowboard stance)
      legCompressionMax: 0.8,         // Max additional bend from g-force
      legEdgeMultiplier: 0.4,         // Edge angle → leg angle difference

      // Arm balance
      armBalanceMultiplier: 0.7,
      armSpeedTuck: 0.3,

      // Head stabilization
      headCounterLean: 0.6,
      headLookAhead: 0.4,
    };

    // Bone mapping from various skeleton standards to our animation system
    this.boneMap = {
      // Spine/Torso
      hips: ['mixamorigHips', 'Hips', 'pelvis', 'Pelvis', 'hip', 'Root', 'root'],
      spine: ['mixamorigSpine', 'Spine', 'spine', 'Spine1', 'spine_01'],
      spine1: ['mixamorigSpine1', 'Spine1', 'spine1', 'Spine2', 'spine_02'],
      spine2: ['mixamorigSpine2', 'Spine2', 'spine2', 'Chest', 'spine_03', 'chest'],
      neck: ['mixamorigNeck', 'Neck', 'neck', 'neck_01'],
      head: ['mixamorigHead', 'Head', 'head'],

      // Left Arm
      leftShoulder: ['mixamorigLeftShoulder', 'LeftShoulder', 'shoulder_L', 'L_Shoulder', 'clavicle_l'],
      leftArm: ['mixamorigLeftArm', 'LeftArm', 'upperarm_L', 'L_UpperArm', 'LeftUpperArm', 'upperarm_l'],
      leftForeArm: ['mixamorigLeftForeArm', 'LeftForeArm', 'lowerarm_L', 'L_LowerArm', 'LeftLowerArm', 'lowerarm_l'],
      leftHand: ['mixamorigLeftHand', 'LeftHand', 'hand_L', 'L_Hand', 'hand_l'],

      // Right Arm
      rightShoulder: ['mixamorigRightShoulder', 'RightShoulder', 'shoulder_R', 'R_Shoulder', 'clavicle_r'],
      rightArm: ['mixamorigRightArm', 'RightArm', 'upperarm_R', 'R_UpperArm', 'RightUpperArm', 'upperarm_r'],
      rightForeArm: ['mixamorigRightForeArm', 'RightForeArm', 'lowerarm_R', 'R_LowerArm', 'RightLowerArm', 'lowerarm_r'],
      rightHand: ['mixamorigRightHand', 'RightHand', 'hand_R', 'R_Hand', 'hand_r'],

      // Left Leg
      leftUpLeg: ['mixamorigLeftUpLeg', 'LeftUpLeg', 'thigh_L', 'L_Thigh', 'LeftThigh', 'thigh_l'],
      leftLeg: ['mixamorigLeftLeg', 'LeftLeg', 'shin_L', 'L_Shin', 'LeftShin', 'LeftLowerLeg', 'calf_l'],
      leftFoot: ['mixamorigLeftFoot', 'LeftFoot', 'foot_L', 'L_Foot', 'foot_l'],
      leftToeBase: ['mixamorigLeftToeBase', 'LeftToeBase', 'toe_L', 'L_Toe', 'ball_l'],

      // Right Leg
      rightUpLeg: ['mixamorigRightUpLeg', 'RightUpLeg', 'thigh_R', 'R_Thigh', 'RightThigh', 'thigh_r'],
      rightLeg: ['mixamorigRightLeg', 'RightLeg', 'shin_R', 'R_Shin', 'RightShin', 'RightLowerLeg', 'calf_r'],
      rightFoot: ['mixamorigRightFoot', 'RightFoot', 'foot_R', 'R_Foot', 'foot_r'],
      rightToeBase: ['mixamorigRightToeBase', 'RightToeBase', 'toe_R', 'R_Toe', 'ball_r'],
    };

    // Store initial bone rotations
    this.initialRotations = {};
  }

  async load(url) {
    const loader = new GLTFLoader();

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          console.log('GLB model loaded:', url);
          this.processModel(gltf);
          resolve(this);
        },
        (progress) => {
          const percent = (progress.loaded / progress.total * 100).toFixed(1);
          console.log(`Loading model: ${percent}%`);
        },
        (error) => {
          console.error('Error loading GLB model:', error);
          reject(error);
        }
      );
    });
  }

  processModel(gltf) {
    this.mesh = new THREE.Group();
    const model = gltf.scene;

    console.log('Processing model, children:', model.children.length);

    // Find the skeleton and map bones
    let meshCount = 0;
    let boneCount = 0;

    model.traverse((child) => {
      if (child.isMesh) {
        meshCount++;
        child.castShadow = true;
        child.receiveShadow = true;

        if (child.material) {
          child.material.side = THREE.DoubleSide;
          child.material.needsUpdate = true;
        }
      }

      if (child.isBone) {
        boneCount++;
        this.mapBone(child);
      }
    });

    console.log(`Found ${meshCount} meshes, ${boneCount} bones`);

    // Store animations if present
    if (gltf.animations && gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        this.animations[clip.name] = this.mixer.clipAction(clip);
        console.log('Found animation:', clip.name);
      });
    }

    // Scale and position the model
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y;
    console.log('Model height:', height);

    if (height > 0 && height < 100) {
      const targetHeight = 1.7;
      const scale = targetHeight / height;
      model.scale.setScalar(scale);

      // Re-calculate bounding box after scaling
      box.setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());

      // Center horizontally and place feet at Y=0, lowered a bit
      model.position.x = -center.x;
      model.position.z = -center.z;
      model.position.y = -box.min.y - 0.12;
    }

    this.mesh.add(model);
    this.model = model;
    this.loaded = true;

    this.storeInitialRotations();

    console.log('Mapped bones:', Object.keys(this.bones));
  }

  mapBone(bone) {
    const boneName = bone.name.toLowerCase();

    for (const [key, aliases] of Object.entries(this.boneMap)) {
      for (const alias of aliases) {
        if (boneName === alias.toLowerCase() || bone.name === alias) {
          this.bones[key] = bone;
          console.log(`Mapped bone: ${bone.name} → ${key}`);
          return;
        }
      }
    }
    // Log unmapped bones for debugging
    console.log(`Unmapped bone: ${bone.name}`);
  }

  storeInitialRotations() {
    for (const [key, bone] of Object.entries(this.bones)) {
      this.initialRotations[key] = bone.rotation.clone();
    }
  }

  // Face sideways for snowboard stance and set initial pose
  applySnowboardStance() {
    if (!this.loaded || !this.model) return;
    this.model.rotation.y = Math.PI / 2;

    // Apply initial snowboard stance pose
    this.applyBaseStance();
  }

  /**
   * Apply base snowboard stance - knees bent, arms relaxed
   */
  applyBaseStance() {
    const cfg = this.animConfig;

    // Set initial spring targets for base stance
    // Legs bent for snowboard stance
    const baseBend = cfg.legCompressionBase;

    // Thighs rotated forward (hip flexion)
    this.springs.leftUpLeg.set(-baseBend * 0.6, 0, 0);
    this.springs.rightUpLeg.set(-baseBend * 0.6, 0, 0);

    // Knees bent (knee flexion)
    this.springs.leftLeg.set(baseBend * 1.2, 0, 0);
    this.springs.rightLeg.set(baseBend * 1.2, 0, 0);

    // Feet flat on board (negative X tilts toes down)
    this.springs.leftFoot.set(-0.5, 0, 0);
    this.springs.rightFoot.set(-0.5, 0, 0);

    // Arms down at sides (rotate down from T-pose)
    this.springs.leftArm.set(1.2, 0, 0);
    this.springs.leftForeArm.set(0, 0, 0);
    this.springs.rightArm.set(1.2, 0, 0);
    this.springs.rightForeArm.set(0, 0, 0);

    // Spine neutral
    this.springs.hips.set(0, 0, 0);
    this.springs.spine.set(0, 0, 0);
    this.springs.spine1.set(0, 0, 0);
    this.springs.spine2.set(0, 0, 0);
    this.springs.neck.set(0, 0, 0);
    this.springs.head.set(0, 0, 0);
  }

  /**
   * Apply physics-driven procedural animation using direct bone rotations (FK)
   *
   * @param {Object} physics - Physics state from PlayerController
   * @param {number} physics.edgeAngle - Current edge angle in radians
   * @param {number} physics.speed - Current speed in m/s
   * @param {number} physics.compression - Leg compression 0-1
   * @param {number} physics.carveRailStrength - Carve lock strength 0-1
   * @param {number} physics.flowState - Flow state 0-1
   * @param {number} physics.steerInput - Raw steer input -1 to 1
   * @param {boolean} physics.isGrounded - Whether rider is on snow
   * @param {number} physics.airTime - Time in air (seconds)
   * @param {number} physics.pitch - Forward/back rotation in air
   * @param {number} physics.roll - Barrel roll rotation in air
   * @param {number} physics.spinVelocity - Spin angular velocity
   * @param {number} physics.leanInput - Forward/back lean input -1 to 1
   * @param {number} dt - Delta time in seconds
   */
  applyPose(physics, dt = 0.016) {
    if (!this.loaded || !this.model) return;

    // Extract physics values with defaults
    const {
      edgeAngle = 0,
      speed = 0,
      compression = 0,
      flowState = 0,
      steerInput = 0,
      isGrounded = true,
      airTime = 0,
      leanInput = 0,
    } = typeof physics === 'object' ? physics : { edgeAngle: physics };

    // Backwards compatibility: if called with old signature
    const edge = typeof physics === 'number' ? physics : edgeAngle;
    const spd = speed;

    // Branch to air or ground animation
    if (!isGrounded && airTime > 0.1) {
      this.applyAirPose(physics, dt);
      return;
    }

    // Debug: log physics values occasionally
    if (!this._frameCount) this._frameCount = 0;
    this._frameCount++;
    if (this._frameCount % 120 === 1) {
      console.log('applyPose called - edge:', edge.toFixed(2), 'speed:', spd.toFixed(1), 'compression:', compression.toFixed(2));
    }

    // Normalize speed for animation (0-1 range, maxing around 25 m/s)
    const speedNorm = Math.min(spd / 25, 1);
    const cfg = this.animConfig;

    // === SPINE CHAIN ===
    const spineLean = -edge * cfg.spineLeanMultiplier;
    const spineTuck = speedNorm * cfg.spineTuckMultiplier;
    const counterRot = edge * cfg.spineCounterRotation;

    this.springs.hips.setTarget(0, 0, spineLean * 0.3);
    this.springs.spine.setTarget(spineTuck * 0.3, counterRot * 0.2, spineLean * 0.5);
    this.springs.spine1.setTarget(spineTuck * 0.5, counterRot * 0.4, spineLean * 0.7);
    this.springs.spine2.setTarget(spineTuck * 0.7, counterRot * 0.6, spineLean * 0.9);

    // === NECK/HEAD ===
    const headCounterLean = spineLean * cfg.headCounterLean;
    const headLook = steerInput * cfg.headLookAhead;

    this.springs.neck.setTarget(0, headLook * 0.3, -headCounterLean * 0.4);
    this.springs.head.setTarget(0, headLook * 0.7, -headCounterLean * 0.6);

    // === LEGS (DIRECT FK) ===
    const baseCompression = cfg.legCompressionBase;
    const gCompression = compression * cfg.legCompressionMax;
    const totalBend = baseCompression + gCompression;

    // Edge angle shifts weight between legs
    const legDiff = edge * cfg.legEdgeMultiplier;

    // Front leg (left) - thigh, knee, flat foot
    const frontThighBend = -totalBend * 0.6 - legDiff * 0.15;
    const frontKneeBend = totalBend * 1.2 + legDiff * 0.2;

    this.springs.leftUpLeg.setTarget(frontThighBend, 0, 0);
    this.springs.leftLeg.setTarget(frontKneeBend, 0, 0);
    this.springs.leftFoot.setTarget(-0.5, 0, 0);

    // Back leg (right) - thigh, knee, flat foot
    const backThighBend = -totalBend * 0.6 + legDiff * 0.15;
    const backKneeBend = totalBend * 1.2 - legDiff * 0.2;

    this.springs.rightUpLeg.setTarget(backThighBend, 0, 0);
    this.springs.rightLeg.setTarget(backKneeBend, 0, 0);
    this.springs.rightFoot.setTarget(-0.5, 0, 0);

    // === ARMS (DIRECT FK) - Arms down at sides ===
    // Slight sway with edge angle but mostly relaxed
    const armSway = edge * 0.1;

    // Front arm (left) - down at side (X rotation)
    this.springs.leftArm.setTarget(1.2 + armSway * 0.1, 0, 0);
    this.springs.leftForeArm.setTarget(0.1, 0, 0);

    // Back arm (right) - down at side (both arms use positive X)
    this.springs.rightArm.setTarget(1.2 - armSway * 0.1, 0, 0);
    this.springs.rightForeArm.setTarget(0.1, 0, 0);

    // === UPDATE ALL BONE SPRINGS ===
    this.updateAllBoneSprings(dt);

    // Keep model facing sideways (snowboard stance)
    this.model.rotation.y = Math.PI / 2;

    // Subtle whole-body lean for extreme angles
    this.model.rotation.z = -edge * 0.1;
  }

  /**
   * Update all bone springs and apply to skeleton
   */
  updateAllBoneSprings(dt) {
    // Debug: log every call
    if (!this._updateLogCount) this._updateLogCount = 0;
    this._updateLogCount++;
    if (this._updateLogCount % 120 === 1) {
      console.log('updateAllBoneSprings called, bones:', Object.keys(this.bones).length, 'springs:', Object.keys(this.springs).length);
    }

    let appliedCount = 0;
    for (const [boneName, spring] of Object.entries(this.springs)) {
      const bone = this.bones[boneName];
      if (!spring || !bone) continue;

      const rot = spring.update(dt);
      const initial = this.initialRotations[boneName];

      if (initial) {
        bone.rotation.x = initial.x + rot.x;
        bone.rotation.y = initial.y + rot.y;
        bone.rotation.z = initial.z + rot.z;
      } else {
        bone.rotation.x = rot.x;
        bone.rotation.y = rot.y;
        bone.rotation.z = rot.z;
      }
      appliedCount++;
    }

    // Debug: log once on first frame
    if (!this._debugLogged) {
      this._debugLogged = true;
      console.log('Bones found:', Object.keys(this.bones));
      console.log('Springs defined:', Object.keys(this.springs));
      console.log('Applied rotations to', appliedCount, 'bones');
    }

    // Force skeleton update for SkinnedMesh
    if (this.bones.hips) {
      this.bones.hips.updateMatrixWorld(true);
    }
  }

  /**
   * Apply air/trick animation using direct FK
   */
  applyAirPose(physics, dt) {
    const {
      airTime = 0,
      pitch = 0,
      roll = 0,
      spinVelocity = 0,
      leanInput = 0,
      steerInput = 0,
    } = physics;

    // Air time affects tuck intensity (longer air = more committed tuck)
    const airCommitment = Math.min(airTime / 1.5, 1);
    const tuckAmount = Math.max(0, leanInput) * 0.5 + airCommitment * 0.3;

    // === SPINE/HEAD ===
    this.springs.hips.setTarget(tuckAmount * 0.2, 0, roll * 0.1);
    this.springs.spine.setTarget(tuckAmount * 0.3, spinVelocity * 0.05, roll * 0.15);
    this.springs.spine1.setTarget(tuckAmount * 0.4, spinVelocity * 0.08, roll * 0.2);
    this.springs.spine2.setTarget(tuckAmount * 0.5, spinVelocity * 0.1, roll * 0.25);
    this.springs.neck.setTarget(-tuckAmount * 0.2, steerInput * 0.3, -roll * 0.3);
    this.springs.head.setTarget(-tuckAmount * 0.3, steerInput * 0.4, -roll * 0.4);

    // === LEGS - Tuck in air, feet flat ===
    const kneeTuck = 0.5 + tuckAmount * 0.8;

    this.springs.leftUpLeg.setTarget(-kneeTuck * 0.5, 0, 0);
    this.springs.leftLeg.setTarget(kneeTuck * 1.5, 0, 0);
    this.springs.leftFoot.setTarget(-0.5, 0, 0);

    this.springs.rightUpLeg.setTarget(-kneeTuck * 0.5, 0, 0);
    this.springs.rightLeg.setTarget(kneeTuck * 1.5, 0, 0);
    this.springs.rightFoot.setTarget(-0.5, 0, 0);

    // === ARMS - Down at sides with slight movement ===
    // Left arm (X rotation to bring down)
    this.springs.leftArm.setTarget(1.2, 0, 0);
    this.springs.leftForeArm.setTarget(0.15, 0, 0);

    // Right arm (both use positive X)
    this.springs.rightArm.setTarget(1.2, 0, 0);
    this.springs.rightForeArm.setTarget(0.15, 0, 0);

    // Update all bones
    this.updateAllBoneSprings(dt);

    // Model rotation for whole-body orientation
    this.model.rotation.y = Math.PI / 2;
    this.model.rotation.z = roll * 0.15;
    this.model.rotation.x = pitch * 0.1;
  }

  /**
   * Update loop - call each frame
   */
  update(dt) {
    if (this.mixer) {
      this.mixer.update(dt);
    }
  }

  playAnimation(name, fadeTime = 0.3) {
    if (this.animations[name]) {
      Object.values(this.animations).forEach(action => {
        action.fadeOut(fadeTime);
      });
      this.animations[name].reset().fadeIn(fadeTime).play();
    }
  }

  dispose() {
    if (this.mesh) {
      this.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
  }
}

export const SAMPLE_MODELS = {
  readyPlayerMe: 'https://models.readyplayer.me/64c3c2e5e85e8b5b1c2b3a4d.glb',
};
