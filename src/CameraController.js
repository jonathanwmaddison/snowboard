import * as THREE from 'three';

export class CameraController {
  constructor(sceneManager, terrain = null) {
    this.sceneManager = sceneManager;
    this.terrain = terrain; // Reference to terrain for ground height checks

    // Base FOV that changes with speed
    this.baseFOV = 65;
    this.maxFOV = 85;
    this.currentFOV = this.baseFOV;

    this.camera = new THREE.PerspectiveCamera(
      this.baseFOV,
      window.innerWidth / window.innerHeight,
      0.5,
      3000
    );

    // Dynamic camera positioning (changes with speed)
    this.baseDistance = 7;
    this.maxDistance = 12;
    this.baseHeight = 2.5;
    this.maxHeight = 4;
    this.baseLookAhead = 8;
    this.maxLookAhead = 20;

    // Current dynamic values
    this.distance = this.baseDistance;
    this.height = this.baseHeight;
    this.lookAhead = this.baseLookAhead;

    // Smoothing - speed-adaptive
    this.positionLag = 0.06;
    this.lookAtLag = 0.1;

    // State
    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.smoothedHeading = 0;
    this.smoothedSpeed = 0;

    // Camera shake
    this.shakeIntensity = 0;
    this.shakeOffset = new THREE.Vector3();
    this.shakeTime = 0;

    // === G-FORCE CAMERA EFFECTS ===
    this.cameraRoll = 0; // Tilt into turns
    this.targetCameraRoll = 0;
    this.landingImpact = 0; // Compression on landing

    // Terrain-aware height
    this.terrainLookAheadHeight = 0;

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(deltaTime, playerPosition, playerVelocity, playerHeading, edgeAngle = 0, isGrounded = true, compression = 0, wasGrounded = true) {
    // Get player speed (horizontal only)
    const speed = Math.sqrt(playerVelocity.x ** 2 + playerVelocity.z ** 2);

    // Smooth speed for camera effects (prevents jarring changes)
    this.smoothedSpeed = THREE.MathUtils.lerp(this.smoothedSpeed, speed, 0.05);

    // === LANDING IMPACT DETECTION ===
    if (isGrounded && !wasGrounded) {
      // Just landed - add impact
      const impactSpeed = Math.abs(playerVelocity.y || 0);
      this.landingImpact = Math.min(impactSpeed * 0.03, 0.4);
    }
    // Decay landing impact
    this.landingImpact *= 0.9;

    // === SPEED-BASED DYNAMIC VALUES ===
    const speedFactor = Math.min(this.smoothedSpeed / 40, 1); // 0-1 based on 40 m/s max

    // FOV increases with speed for sense of velocity
    const targetFOV = THREE.MathUtils.lerp(this.baseFOV, this.maxFOV, speedFactor * 0.7);
    this.currentFOV = THREE.MathUtils.lerp(this.currentFOV, targetFOV, 0.03);
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();

    // Distance pulls back at higher speeds
    this.distance = THREE.MathUtils.lerp(this.baseDistance, this.maxDistance, speedFactor * 0.5);

    // Height rises slightly at speed for better overview
    this.height = THREE.MathUtils.lerp(this.baseHeight, this.maxHeight, speedFactor * 0.4);

    // Look further ahead at higher speeds
    this.lookAhead = THREE.MathUtils.lerp(this.baseLookAhead, this.maxLookAhead, speedFactor * 0.6);

    // === HEADING - ALWAYS BEHIND PLAYER ===
    // Camera always stays directly behind the player's heading
    let headingDiff = playerHeading - this.smoothedHeading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    // Fast tracking to stay behind player
    this.smoothedHeading += headingDiff * 0.25;

    // === CAMERA SHAKE ===
    this.updateShake(deltaTime, speed, edgeAngle, isGrounded);

    // === CAMERA POSITION - ALWAYS DIRECTLY BEHIND ===
    const behindX = -Math.sin(this.smoothedHeading) * this.distance;
    const behindZ = -Math.cos(this.smoothedHeading) * this.distance;

    // Target camera position - directly behind player
    const targetPos = new THREE.Vector3(
      playerPosition.x + behindX,
      playerPosition.y + this.height,
      playerPosition.z + behindZ
    );

    // Fast position tracking to stay behind
    this.currentPosition.lerp(targetPos, 0.15);

    // === KEEP CAMERA ABOVE GROUND ===
    if (this.terrain) {
      const groundHeight = this.terrain.getHeightAt(this.currentPosition.x, this.currentPosition.z);
      const minCameraHeight = groundHeight + 1.5; // At least 1.5m above ground
      if (this.currentPosition.y < minCameraHeight) {
        this.currentPosition.y = minCameraHeight;
      }
    }

    // === LOOK AT POINT - AHEAD OF PLAYER ===
    const aheadX = Math.sin(this.smoothedHeading) * this.lookAhead;
    const aheadZ = Math.cos(this.smoothedHeading) * this.lookAhead;

    const targetLookAt = new THREE.Vector3(
      playerPosition.x + aheadX,
      playerPosition.y + 0.5,
      playerPosition.z + aheadZ
    );

    // Fast look-at tracking
    this.currentLookAt.lerp(targetLookAt, 0.2);

    // === G-FORCE CAMERA ROLL ===
    // Tilt camera into turns like a motorcycle rider
    if (isGrounded && speed > 5) {
      // Roll into carves - stronger at higher speeds
      const speedRollMultiplier = Math.min(speed / 25, 1.2);
      this.targetCameraRoll = -edgeAngle * 0.25 * speedRollMultiplier;
    } else {
      // In air - slight roll for style
      this.targetCameraRoll = -edgeAngle * 0.1;
    }

    // Smooth roll transition
    this.cameraRoll = THREE.MathUtils.lerp(this.cameraRoll, this.targetCameraRoll, 0.08);

    // === APPLY WITH SHAKE AND ROLL ===
    this.camera.position.copy(this.currentPosition);
    this.camera.position.add(this.shakeOffset);

    // Landing impact lowers camera temporarily
    this.camera.position.y -= this.landingImpact;

    this.camera.lookAt(this.currentLookAt);

    // Apply G-force roll after lookAt
    this.camera.rotateZ(this.cameraRoll);
  }

  updateShake(deltaTime, speed, edgeAngle, isGrounded) {
    this.shakeTime += deltaTime;

    // Base shake from high speed (terrain vibration feel)
    let targetIntensity = 0;
    if (speed > 20 && isGrounded) {
      targetIntensity = (speed - 20) * 0.003; // Subtle shake above 20 m/s
    }

    // Extra shake during hard carves
    if (isGrounded && Math.abs(edgeAngle) > 0.5) {
      targetIntensity += Math.abs(edgeAngle) * 0.015;
    }

    // Smooth shake intensity
    this.shakeIntensity = THREE.MathUtils.lerp(this.shakeIntensity, targetIntensity, 0.1);

    // Generate shake using multiple sine waves for organic feel
    if (this.shakeIntensity > 0.001) {
      const t = this.shakeTime;
      this.shakeOffset.set(
        Math.sin(t * 23) * this.shakeIntensity + Math.sin(t * 37) * this.shakeIntensity * 0.5,
        Math.sin(t * 29) * this.shakeIntensity * 0.7,
        Math.sin(t * 31) * this.shakeIntensity * 0.3
      );
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
  }

  setInitialPosition(playerPosition, playerHeading = 0) {
    this.smoothedHeading = playerHeading;

    const behindX = -Math.sin(playerHeading) * this.distance;
    const behindZ = -Math.cos(playerHeading) * this.distance;

    this.currentPosition.set(
      playerPosition.x + behindX,
      playerPosition.y + this.height,
      playerPosition.z + behindZ
    );

    this.currentLookAt.copy(playerPosition);
    this.currentLookAt.y += 0.5;

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }
}
