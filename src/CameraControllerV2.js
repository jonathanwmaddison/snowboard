import * as THREE from 'three';

/**
 * CameraControllerV2 - Centered chase camera system
 *
 * Features:
 * - Stays centered behind the rider at all times
 * - Dynamic FOV that widens during speed/deep carves
 * - Multiple camera modes (chase, cinematic, action, side)
 * - Flow state visual effects
 * - Speed-based distance scaling
 * - Terrain-aware height adjustment
 * - G-force compression response
 */
export class CameraControllerV2 {
  constructor(sceneManager, terrain = null) {
    this.sceneManager = sceneManager;
    this.terrain = terrain;

    // === CAMERA MODES ===
    // All modes keep camera centered behind rider (follows general momentum)
    this.modes = {
      chase: {
        distance: 8,
        height: 3.5,
        lookAtHeight: 1,
        fovBase: 70,
        lagStrength: 0.08,    // How fast camera catches up to smoothed direction
        speedFovBoost: 12,    // FOV increase at max speed
        carveFovBoost: 8,     // FOV increase during deep carves
      },
      cinematic: {
        distance: 14,
        height: 5,
        lookAtHeight: 0.5,
        fovBase: 55,
        lagStrength: 0.05,
        speedFovBoost: 8,
        carveFovBoost: 5,
      },
      action: {
        distance: 5,
        height: 2,
        lookAtHeight: 1.2,
        fovBase: 85,
        lagStrength: 0.12,
        speedFovBoost: 18,
        carveFovBoost: 12,
      },
      side: {
        distance: 10,
        height: 2,
        lookAtHeight: 1,
        fovBase: 60,
        lagStrength: 0.06,
        speedFovBoost: 10,
        carveFovBoost: 6,
        sideOffset: Math.PI / 2.5, // Offset angle (side view)
      }
    };

    this.currentMode = 'chase';
    this.modeTransition = 0; // 0-1 for smooth mode switching
    this.targetMode = 'chase';
    this.modeTransitionSpeed = 2.0;

    // === CAMERA SETUP ===
    this.camera = new THREE.PerspectiveCamera(
      this.modes.chase.fovBase,
      window.innerWidth / window.innerHeight,
      0.5,
      3000
    );

    // === ORBIT/POSITION STATE ===
    this.orbitAngle = 0;           // Base orbit around player
    this.smoothedDirection = 0;    // Smoothed velocity direction (general trajectory)

    // === SMOOTHED VALUES ===
    this.smoothedPosition = new THREE.Vector3();
    this.smoothedLookAt = new THREE.Vector3();
    this.smoothedFov = this.modes.chase.fovBase;
    this.smoothedDistance = this.modes.chase.distance;
    this.smoothedHeight = this.modes.chase.height;

    // === MANUAL CONTROL (gamepad right stick) ===
    this.manualOrbitOffset = 0;
    this.manualPitchOffset = 0;
    this.manualOrbitInput = 0;
    this.manualPitchInput = 0;
    this.cameraSpeed = 2.5;
    this.pitchMin = -0.4;
    this.pitchMax = 0.9;

    // === FLOW STATE EFFECTS ===
    this.flowIntensity = 0;        // 0-1 based on player flow state
    this.flowPulse = 0;            // Subtle rhythmic pulse

    // === SPEED TRACKING ===
    this.currentSpeed = 0;
    this.maxSpeedRef = 80;         // Reference max speed for scaling

    // === COMPRESSION/G-FORCE ===
    this.compressionEffect = 0;    // Lowers camera during high G

    // === TERRAIN GRADIENT ===
    this.terrainGradient = 0;      // Slope steepness affects camera

    // Smoothing rates
    this.positionSmoothing = 0.08;
    this.heightSmoothing = 0.05;
    this.lookAtSmoothing = 0.12;
    this.fovSmoothing = 0.06;

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Switch camera mode with smooth transition
   */
  setMode(modeName) {
    if (this.modes[modeName] && modeName !== this.targetMode) {
      this.targetMode = modeName;
      console.log(`Camera mode: ${modeName.toUpperCase()}`);
    }
  }

  /**
   * Cycle through available modes
   */
  cycleMode() {
    const modeNames = Object.keys(this.modes);
    const currentIndex = modeNames.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % modeNames.length;
    this.setMode(modeNames[nextIndex]);
  }

  /**
   * Main update - call every frame
   */
  update(deltaTime, playerPosition, playerVelocity, playerHeading, edgeAngle = 0, isGrounded = true, compression = 0, wasGrounded = true) {
    const mode = this.modes[this.currentMode];
    const targetModeSettings = this.modes[this.targetMode];

    // === MODE TRANSITION ===
    if (this.currentMode !== this.targetMode) {
      this.modeTransition += this.modeTransitionSpeed * deltaTime;
      if (this.modeTransition >= 1) {
        this.currentMode = this.targetMode;
        this.modeTransition = 0;
      }
    }

    // Interpolate mode settings during transition
    const t = this.modeTransition;
    const activeMode = {
      distance: THREE.MathUtils.lerp(mode.distance, targetModeSettings.distance, t),
      height: THREE.MathUtils.lerp(mode.height, targetModeSettings.height, t),
      lookAtHeight: THREE.MathUtils.lerp(mode.lookAtHeight, targetModeSettings.lookAtHeight, t),
      fovBase: THREE.MathUtils.lerp(mode.fovBase, targetModeSettings.fovBase, t),
      lagStrength: THREE.MathUtils.lerp(mode.lagStrength, targetModeSettings.lagStrength, t),
      speedFovBoost: THREE.MathUtils.lerp(mode.speedFovBoost, targetModeSettings.speedFovBoost, t),
      carveFovBoost: THREE.MathUtils.lerp(mode.carveFovBoost, targetModeSettings.carveFovBoost, t),
      sideOffset: THREE.MathUtils.lerp(mode.sideOffset || 0, targetModeSettings.sideOffset || 0, t),
    };

    // === MANUAL CAMERA CONTROL ===
    this.manualOrbitOffset += this.manualOrbitInput * this.cameraSpeed * deltaTime;
    this.manualPitchOffset += this.manualPitchInput * this.cameraSpeed * deltaTime;
    this.manualPitchOffset = Math.max(this.pitchMin, Math.min(this.pitchMax, this.manualPitchOffset));

    // === SPEED TRACKING ===
    this.currentSpeed = playerVelocity.length() * 3.6; // Convert to km/h
    const speedFactor = Math.min(this.currentSpeed / this.maxSpeedRef, 1.0);
    const absEdge = Math.abs(edgeAngle);

    // === ORBIT ANGLE ===
    // Follow smoothed velocity direction (general trajectory/momentum)
    // Two-stage smoothing: first smooth the direction, then smooth the camera orbit

    let instantDirection = this.smoothedDirection; // Fallback
    if (playerVelocity.lengthSq() > 1) {
      instantDirection = Math.atan2(playerVelocity.x, playerVelocity.z);
    }

    // First: smooth the direction itself (tracks general momentum)
    let dirDiff = instantDirection - this.smoothedDirection;
    while (dirDiff > Math.PI) dirDiff -= Math.PI * 2;
    while (dirDiff < -Math.PI) dirDiff += Math.PI * 2;
    this.smoothedDirection += dirDiff * 0.03; // Very slow - general trajectory

    // Second: camera orbit follows the smoothed direction
    let orbitDiff = this.smoothedDirection - this.orbitAngle;
    while (orbitDiff > Math.PI) orbitDiff -= Math.PI * 2;
    while (orbitDiff < -Math.PI) orbitDiff += Math.PI * 2;
    this.orbitAngle += orbitDiff * activeMode.lagStrength;

    // Final orbit combines: base + manual + side offset (stays centered behind rider)
    const effectiveOrbit = this.orbitAngle + this.manualOrbitOffset + activeMode.sideOffset;

    // === DYNAMIC DISTANCE ===
    // Further back at higher speeds
    const speedDistanceBoost = speedFactor * 3;
    const targetDistance = activeMode.distance + speedDistanceBoost;
    this.smoothedDistance = THREE.MathUtils.lerp(
      this.smoothedDistance, targetDistance, 0.04
    );

    // === DYNAMIC HEIGHT ===
    // Lower during high G-force/compression
    this.compressionEffect = THREE.MathUtils.lerp(
      this.compressionEffect, compression * 0.8, 0.1
    );

    // Get terrain gradient for height adjustment
    if (this.terrain) {
      const gradient = this.terrain.getGradientAt?.(playerPosition.x, playerPosition.z);
      if (gradient) {
        this.terrainGradient = THREE.MathUtils.lerp(this.terrainGradient, gradient, 0.05);
      }
    }

    const targetHeight = activeMode.height - this.compressionEffect +
                         this.terrainGradient * 0.5;
    this.smoothedHeight = THREE.MathUtils.lerp(
      this.smoothedHeight, targetHeight, this.heightSmoothing
    );

    // === PITCH OFFSET EFFECTS ===
    const pitchFactor = Math.cos(this.manualPitchOffset);
    const heightFactor = Math.sin(this.manualPitchOffset);
    const effectiveDistance = this.smoothedDistance * pitchFactor;
    const effectiveHeight = this.smoothedHeight + this.smoothedDistance * heightFactor;

    // === TARGET CAMERA POSITION ===
    const targetX = playerPosition.x - Math.sin(effectiveOrbit) * effectiveDistance;
    const targetZ = playerPosition.z - Math.cos(effectiveOrbit) * effectiveDistance;
    const targetY = playerPosition.y + effectiveHeight;

    // === SMOOTH CAMERA POSITION ===
    this.smoothedPosition.x = THREE.MathUtils.lerp(
      this.smoothedPosition.x, targetX, this.positionSmoothing
    );
    this.smoothedPosition.z = THREE.MathUtils.lerp(
      this.smoothedPosition.z, targetZ, this.positionSmoothing
    );
    this.smoothedPosition.y = THREE.MathUtils.lerp(
      this.smoothedPosition.y, targetY, this.heightSmoothing
    );

    // === KEEP CAMERA ABOVE GROUND ===
    if (this.terrain) {
      const groundHeight = this.terrain.getHeightAt(
        this.smoothedPosition.x,
        this.smoothedPosition.z
      );
      const minHeight = groundHeight + 1.5;
      if (this.smoothedPosition.y < minHeight) {
        this.smoothedPosition.y = minHeight;
      }
    }

    // === LOOK AT TARGET ===
    // Look slightly ahead of player based on velocity
    const lookAheadFactor = Math.min(this.currentSpeed / 50, 1) * 2;
    const velocityNorm = playerVelocity.clone().normalize();

    const targetLookAt = new THREE.Vector3(
      playerPosition.x + velocityNorm.x * lookAheadFactor,
      playerPosition.y + activeMode.lookAtHeight,
      playerPosition.z + velocityNorm.z * lookAheadFactor
    );

    this.smoothedLookAt.lerp(targetLookAt, this.lookAtSmoothing);

    // === DYNAMIC FOV ===
    const speedFovBoost = speedFactor * activeMode.speedFovBoost;
    const carveFovBoost = absEdge * activeMode.carveFovBoost;
    const flowFovBoost = this.flowIntensity * 5; // Subtle flow effect

    const targetFov = activeMode.fovBase + speedFovBoost + carveFovBoost + flowFovBoost;
    this.smoothedFov = THREE.MathUtils.lerp(this.smoothedFov, targetFov, this.fovSmoothing);

    // === APPLY TO CAMERA ===
    this.camera.position.copy(this.smoothedPosition);
    this.camera.lookAt(this.smoothedLookAt);

    // Update FOV
    if (Math.abs(this.camera.fov - this.smoothedFov) > 0.1) {
      this.camera.fov = this.smoothedFov;
      this.camera.updateProjectionMatrix();
    }

    // === FLOW PULSE (subtle effect) ===
    this.flowPulse += deltaTime * 2;
    if (this.flowPulse > Math.PI * 2) this.flowPulse -= Math.PI * 2;
  }

  /**
   * Set flow state intensity (0-1) for visual effects
   */
  setFlowState(intensity) {
    this.flowIntensity = THREE.MathUtils.lerp(this.flowIntensity, intensity, 0.05);
  }

  /**
   * Set manual camera input (gamepad right stick)
   */
  setCameraInput(orbit, pitch) {
    this.manualOrbitInput = orbit;
    this.manualPitchInput = pitch;
  }

  /**
   * Reset camera to default orientation
   */
  resetCamera() {
    this.manualOrbitOffset = 0;
    this.manualPitchOffset = 0;
  }

  /**
   * Set initial camera position
   */
  setInitialPosition(playerPosition, playerHeading = 0) {
    const mode = this.modes[this.currentMode];
    this.orbitAngle = playerHeading;
    this.smoothedDirection = playerHeading;

    this.smoothedPosition.set(
      playerPosition.x - Math.sin(playerHeading) * mode.distance,
      playerPosition.y + mode.height,
      playerPosition.z - Math.cos(playerHeading) * mode.distance
    );

    this.smoothedLookAt.set(
      playerPosition.x,
      playerPosition.y + mode.lookAtHeight,
      playerPosition.z
    );

    this.smoothedFov = mode.fovBase;
    this.smoothedDistance = mode.distance;
    this.smoothedHeight = mode.height;

    this.camera.position.copy(this.smoothedPosition);
    this.camera.lookAt(this.smoothedLookAt);
    this.camera.fov = mode.fovBase;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Get current mode name
   */
  getCurrentMode() {
    return this.currentMode;
  }

  /**
   * Get all available mode names
   */
  getModeNames() {
    return Object.keys(this.modes);
  }

  /**
   * Get camera debug info
   */
  getDebugInfo() {
    return {
      mode: this.currentMode,
      fov: this.smoothedFov.toFixed(1),
      distance: this.smoothedDistance.toFixed(1),
      height: this.smoothedHeight.toFixed(1),
      flow: this.flowIntensity.toFixed(2),
    };
  }
}
