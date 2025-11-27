import * as THREE from 'three';

export class CameraController {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Camera positioning
    this.distance = 8;
    this.height = 3;
    this.lookAhead = 10;

    // Smoothing - lower = smoother but laggier
    this.positionLag = 0.08;
    this.lookAtLag = 0.12;

    // State
    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.smoothedHeading = 0;

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(deltaTime, playerPosition, playerVelocity, playerHeading) {
    // Get player speed
    const speed = playerVelocity.length();

    // Smooth the heading to avoid jerky camera
    let headingDiff = playerHeading - this.smoothedHeading;
    // Handle wrap-around
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    this.smoothedHeading += headingDiff * this.lookAtLag;

    // Camera sits behind player based on heading
    const behindX = -Math.sin(this.smoothedHeading) * this.distance;
    const behindZ = -Math.cos(this.smoothedHeading) * this.distance;

    // Target camera position
    const targetPos = new THREE.Vector3(
      playerPosition.x + behindX,
      playerPosition.y + this.height,
      playerPosition.z + behindZ
    );

    // Smooth camera position
    this.currentPosition.lerp(targetPos, this.positionLag);

    // Look at point - ahead of player
    const aheadX = Math.sin(this.smoothedHeading) * this.lookAhead;
    const aheadZ = Math.cos(this.smoothedHeading) * this.lookAhead;

    const targetLookAt = new THREE.Vector3(
      playerPosition.x + aheadX,
      playerPosition.y + 0.5,
      playerPosition.z + aheadZ
    );

    // Smooth look-at
    this.currentLookAt.lerp(targetLookAt, this.lookAtLag);

    // Apply
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
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
