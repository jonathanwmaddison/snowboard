import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * PlayerModelGLB - Load external rigged character models
 *
 * Supports models rigged with Mixamo skeleton (industry standard)
 * Works with Ready Player Me, Quaternius, Sketchfab models, etc.
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

      // Center horizontally and place feet at Y=0
      model.position.x = -center.x;
      model.position.z = -center.z;
      model.position.y = -box.min.y;
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
          return;
        }
      }
    }
  }

  storeInitialRotations() {
    for (const [key, bone] of Object.entries(this.bones)) {
      this.initialRotations[key] = bone.rotation.clone();
    }
  }

  // Face sideways for snowboard stance
  applySnowboardStance() {
    if (!this.loaded || !this.model) return;
    this.model.rotation.y = Math.PI / 2;

    // Arms down at sides - rotate Y to swing back to body sides
    if (this.bones.leftArm) {
      this.bones.leftArm.rotation.set(0, 1.4, 1.5);
    }
    if (this.bones.rightArm) {
      this.bones.rightArm.rotation.set(0, -1.4, -1.5);
    }
  }

  // SIMPLE: Just tilt the whole character - no bone stuff
  applyPose(animState, edgeAngle, isGrounded) {
    if (!this.loaded || !this.model) return;

    // Lean into turns - tilt whole body
    const lean = -edgeAngle * 0.3;

    // Keep facing sideways, add lean
    this.model.rotation.y = Math.PI / 2;
    this.model.rotation.z = lean;
  }

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
