import * as THREE from 'three';

export class CameraController {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;

    // Base FOV that changes with speed
    this.baseFOV = 65;
    this.maxFOV = 85;
    this.currentFOV = this.baseFOV;

    this.camera = new THREE.PerspectiveCamera(
      this.baseFOV,
      window.innerWidth / window.innerHeight,
      0.1,
      1500
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

    // Terrain-aware height
    this.terrainLookAheadHeight = 0;

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(deltaTime, playerPosition, playerVelocity, playerHeading, edgeAngle = 0, isGrounded = true) {
    // Get player speed (horizontal only)
    const speed = Math.sqrt(playerVelocity.x ** 2 + playerVelocity.z ** 2);

    // Smooth speed for camera effects (prevents jarring changes)
    this.smoothedSpeed = THREE.MathUtils.lerp(this.smoothedSpeed, speed, 0.05);

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

    // === HEADING SMOOTHING ===
    // Faster smoothing at low speed, slower at high speed for stability
    const headingLagFactor = THREE.MathUtils.lerp(0.15, 0.06, speedFactor);
    let headingDiff = playerHeading - this.smoothedHeading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    this.smoothedHeading += headingDiff * headingLagFactor;

    // === CAMERA SHAKE ===
    this.updateShake(deltaTime, speed, edgeAngle, isGrounded);

    // === CAMERA POSITION ===
    // Offset slightly to the side during hard turns for better view
    const turnOffset = edgeAngle * 0.8; // Slight lateral offset when carving

    const behindX = -Math.sin(this.smoothedHeading) * this.distance;
    const behindZ = -Math.cos(this.smoothedHeading) * this.distance;

    // Add lateral offset perpendicular to heading
    const lateralX = Math.cos(this.smoothedHeading) * turnOffset;
    const lateralZ = -Math.sin(this.smoothedHeading) * turnOffset;

    // Target camera position
    const targetPos = new THREE.Vector3(
      playerPosition.x + behindX + lateralX,
      playerPosition.y + this.height,
      playerPosition.z + behindZ + lateralZ
    );

    // Speed-adaptive smoothing (smoother at high speed)
    const posLag = THREE.MathUtils.lerp(0.08, 0.04, speedFactor);
    this.currentPosition.lerp(targetPos, posLag);

    // === LOOK AT POINT ===
    const aheadX = Math.sin(this.smoothedHeading) * this.lookAhead;
    const aheadZ = Math.cos(this.smoothedHeading) * this.lookAhead;

    // Look target slightly lower at high speed for ground focus
    const lookHeightOffset = THREE.MathUtils.lerp(0.8, 0.3, speedFactor);

    const targetLookAt = new THREE.Vector3(
      playerPosition.x + aheadX,
      playerPosition.y + lookHeightOffset,
      playerPosition.z + aheadZ
    );

    // Smooth look-at
    const lookLag = THREE.MathUtils.lerp(0.12, 0.06, speedFactor);
    this.currentLookAt.lerp(targetLookAt, lookLag);

    // === APPLY WITH SHAKE ===
    this.camera.position.copy(this.currentPosition);
    this.camera.position.add(this.shakeOffset);
    this.camera.lookAt(this.currentLookAt);
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
