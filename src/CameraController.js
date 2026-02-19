import * as THREE from 'three';

export class CameraController {
  constructor(sceneManager, terrain = null) {
    this.sceneManager = sceneManager;
    this.terrain = terrain;

    // Simple fixed camera settings
    this.distance = 8;      // Distance behind player
    this.height = 4;        // Height above player
    this.lookAtHeight = 1;  // Look at player's torso

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.5,
      3000
    );

    // === ORBIT SYSTEM ===
    // Camera orbits around player like a lazy susan
    // This angle slowly follows player heading
    this.orbitAngle = 0;
    this.orbitSpeed = 0.04; // How fast orbit catches up to player heading

    // === MANUAL CAMERA CONTROL (gamepad right stick) ===
    this.manualOrbitOffset = 0;      // Horizontal rotation offset
    this.manualPitchOffset = 0;      // Vertical angle offset
    this.manualOrbitInput = 0;       // Current right stick X input
    this.manualPitchInput = 0;       // Current right stick Y input
    this.cameraSpeed = 2.5;          // Radians per second at full stick
    this.pitchMin = -0.3;            // Look up limit (radians)
    this.pitchMax = 0.8;             // Look down limit (radians)

    // === SMOOTHED POSITION ===
    this.smoothedPosition = new THREE.Vector3();
    this.smoothedLookAt = new THREE.Vector3();

    // Smoothing rates
    this.positionSmoothing = 0.08;
    this.heightSmoothing = 0.04;  // Height is extra smooth
    this.lookAtSmoothing = 0.12;

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(deltaTime, playerPosition, playerVelocity, playerHeading, edgeAngle = 0, isGrounded = true, compression = 0, wasGrounded = true) {
    // === STEP 0: MANUAL CAMERA CONTROL ===
    // Apply right stick input - camera stays where you put it
    this.manualOrbitOffset += this.manualOrbitInput * this.cameraSpeed * deltaTime;
    this.manualPitchOffset += this.manualPitchInput * this.cameraSpeed * deltaTime;

    // Clamp pitch
    this.manualPitchOffset = Math.max(this.pitchMin, Math.min(this.pitchMax, this.manualPitchOffset));

    // === STEP 1: ORBIT ANGLE ===
    // Slowly rotate orbit to stay behind player's heading
    let angleDiff = playerHeading - this.orbitAngle;

    // Normalize angle difference to -PI to PI
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Orbit slowly catches up - this is what makes turns feel smooth
    this.orbitAngle += angleDiff * this.orbitSpeed;

    // Final orbit angle includes manual offset
    const effectiveOrbit = this.orbitAngle + this.manualOrbitOffset;

    // Pitch affects height and distance
    const pitchFactor = Math.cos(this.manualPitchOffset);
    const heightFactor = Math.sin(this.manualPitchOffset);
    const effectiveDistance = this.distance * pitchFactor;
    const effectiveHeight = this.height + this.distance * heightFactor;

    // === STEP 2: TARGET CAMERA POSITION ===
    // Camera sits at orbit angle, behind and above player
    const targetX = playerPosition.x - Math.sin(effectiveOrbit) * effectiveDistance;
    const targetZ = playerPosition.z - Math.cos(effectiveOrbit) * effectiveDistance;
    const targetY = playerPosition.y + effectiveHeight;

    // === STEP 3: SMOOTH CAMERA POSITION ===
    // XZ follows with standard smoothing
    this.smoothedPosition.x = THREE.MathUtils.lerp(
      this.smoothedPosition.x, targetX, this.positionSmoothing
    );
    this.smoothedPosition.z = THREE.MathUtils.lerp(
      this.smoothedPosition.z, targetZ, this.positionSmoothing
    );
    // Y (height) uses extra smoothing to avoid bobbing
    this.smoothedPosition.y = THREE.MathUtils.lerp(
      this.smoothedPosition.y, targetY, this.heightSmoothing
    );

    // === STEP 4: KEEP CAMERA ABOVE GROUND ===
    if (this.terrain) {
      const groundHeight = this.terrain.getHeightAt(
        this.smoothedPosition.x,
        this.smoothedPosition.z
      );
      const minHeight = groundHeight + 2.8;
      if (this.smoothedPosition.y < minHeight) {
        this.smoothedPosition.y = minHeight;
      }
    }

    // === STEP 5: LOOK AT PLAYER ===
    // Always look directly at the player - keeps them centered
    const targetLookAt = new THREE.Vector3(
      playerPosition.x,
      playerPosition.y + this.lookAtHeight,
      playerPosition.z
    );

    this.smoothedLookAt.lerp(targetLookAt, this.lookAtSmoothing);

    // === STEP 6: APPLY ===
    this.camera.position.copy(this.smoothedPosition);
    this.camera.lookAt(this.smoothedLookAt);
  }

  setCameraInput(orbit, pitch) {
    this.manualOrbitInput = orbit;
    this.manualPitchInput = pitch;
  }

  resetCamera() {
    this.manualOrbitOffset = 0;
    this.manualPitchOffset = 0;
  }

  setInitialPosition(playerPosition, playerHeading = 0) {
    this.orbitAngle = playerHeading;

    // Set camera behind player
    this.smoothedPosition.set(
      playerPosition.x - Math.sin(playerHeading) * this.distance,
      playerPosition.y + this.height,
      playerPosition.z - Math.cos(playerHeading) * this.distance
    );

    // Clamp above terrain so initial spawn camera can't start under snow.
    if (this.terrain) {
      const groundHeight = this.terrain.getHeightAt(
        this.smoothedPosition.x,
        this.smoothedPosition.z
      );
      if (groundHeight !== undefined && !isNaN(groundHeight)) {
        const minHeight = groundHeight + 2.8;
        if (this.smoothedPosition.y < minHeight) {
          this.smoothedPosition.y = minHeight;
        }
      }
    }

    // Look at player
    this.smoothedLookAt.set(
      playerPosition.x,
      playerPosition.y + this.lookAtHeight,
      playerPosition.z
    );

    this.camera.position.copy(this.smoothedPosition);
    this.camera.lookAt(this.smoothedLookAt);
  }
}
