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

    // === CAMERA SHAKE ===
    this.shakeIntensity = 0;       // Current shake intensity (0-1)
    this.shakeDecay = 5;           // How fast shake decays
    this.shakeFrequency = 25;      // Shake oscillation frequency
    this.shakeOffset = new THREE.Vector3(); // Current shake offset
    this.shakeTime = 0;            // Time accumulator for shake

    // === RISK SHAKE ===
    this.riskLevel = 0;            // Player risk level for continuous shake
    this.riskShakeIntensity = 0;   // Smoothed risk shake

    // === G-FORCE ===
    this.gForce = 1.0;             // Current G-force for camera effects
    this.smoothedGForce = 1.0;     // Smoothed G-force
    this.gForceShakeIntensity = 0; // G-force based camera shake (subtle rumble)
    this.carveRailStrength = 0;    // For quality-dependent shake

    // === IMPACT EFFECTS ===
    this.landingImpact = 0;        // Landing impact intensity
    this.edgeCatchShake = 0;       // Edge catch shake intensity

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
   * Update camera in FPS (first-person) mode
   */
  updateFPSMode(deltaTime, playerPosition, playerHeading) {
    // Position camera at player's eye level
    const eyeHeight = 1.7;  // Eye height in meters

    // Camera position is at player's head
    this.camera.position.set(
      playerPosition.x,
      playerPosition.y + eyeHeight,
      playerPosition.z
    );

    // Look in the direction the player is facing
    const lookDistance = 10;
    const lookX = playerPosition.x - Math.sin(playerHeading) * lookDistance;
    const lookZ = playerPosition.z + Math.cos(playerHeading) * lookDistance;
    const lookY = playerPosition.y + eyeHeight;

    this.camera.lookAt(lookX, lookY, lookZ);

    // Set FOV for FPS (slightly wider for immersion)
    this.camera.fov = 90;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Main update - call every frame
   */
  update(deltaTime, playerPosition, playerVelocity, playerHeading, edgeAngle = 0, isGrounded = true, compression = 0, wasGrounded = true, fpsMode = false) {
    // === FPS MODE ===
    if (fpsMode) {
      this.updateFPSMode(deltaTime, playerPosition, playerHeading);
      return;
    }

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
    // Lower during high G-force/compression - more dramatic response
    // Use both player compression and G-force for camera lowering
    const gForceCompression = this.gForce > 1.2 ? (this.gForce - 1) * 0.6 : 0;
    const totalCompression = compression * 0.8 + gForceCompression;

    // Faster response when compressing, slower release for dramatic effect
    const compressionLerp = totalCompression > this.compressionEffect ? 0.15 : 0.06;
    this.compressionEffect = THREE.MathUtils.lerp(
      this.compressionEffect, totalCompression, compressionLerp
    );

    // Get terrain gradient for height adjustment
    if (this.terrain) {
      const gradient = this.terrain.getGradientAt?.(playerPosition.x, playerPosition.z);
      if (gradient) {
        this.terrainGradient = THREE.MathUtils.lerp(this.terrainGradient, gradient, 0.05);
      }
    }

    // Camera lowers more dramatically during high-G carves
    const heightReduction = this.compressionEffect * (1 + gForceCompression * 0.3);
    const targetHeight = activeMode.height - heightReduction +
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
    // Skip terrain check if in space (high altitude) or if terrain returns invalid
    const isInSpace = playerPosition.y > 150;
    if (this.terrain && !isInSpace) {
      const groundHeight = this.terrain.getHeightAt(
        this.smoothedPosition.x,
        this.smoothedPosition.z
      );
      if (groundHeight !== undefined && !isNaN(groundHeight)) {
        const minHeight = groundHeight + 1.5;
        if (this.smoothedPosition.y < minHeight) {
          this.smoothedPosition.y = minHeight;
        }
      }
    }

    // === NaN PROTECTION ===
    // Ensure camera position is valid
    if (isNaN(this.smoothedPosition.x) || isNaN(this.smoothedPosition.y) || isNaN(this.smoothedPosition.z)) {
      this.smoothedPosition.copy(playerPosition);
      this.smoothedPosition.y += activeMode.height;
      this.smoothedPosition.z -= activeMode.distance;
    }

    // === LOOK AT TARGET ===
    // Look slightly ahead of player based on velocity
    const lookAheadFactor = Math.min(this.currentSpeed / 50, 1) * 2;

    // Safely normalize velocity (handle zero/NaN cases)
    let velocityNorm = new THREE.Vector3(0, 0, 1);
    const velLength = playerVelocity.length();
    if (velLength > 0.1 && !isNaN(velLength)) {
      velocityNorm = playerVelocity.clone().divideScalar(velLength);
    }

    const targetLookAt = new THREE.Vector3(
      playerPosition.x + velocityNorm.x * lookAheadFactor,
      playerPosition.y + activeMode.lookAtHeight,
      playerPosition.z + velocityNorm.z * lookAheadFactor
    );

    // Validate lookAt target
    if (!isNaN(targetLookAt.x) && !isNaN(targetLookAt.y) && !isNaN(targetLookAt.z)) {
      this.smoothedLookAt.lerp(targetLookAt, this.lookAtSmoothing);
    }

    // Ensure lookAt is valid
    if (isNaN(this.smoothedLookAt.x) || isNaN(this.smoothedLookAt.y) || isNaN(this.smoothedLookAt.z)) {
      this.smoothedLookAt.copy(playerPosition);
    }

    // === DYNAMIC FOV ===
    const speedFovBoost = speedFactor * activeMode.speedFovBoost;
    const carveFovBoost = absEdge * activeMode.carveFovBoost;
    const flowFovBoost = this.flowIntensity * 5; // Subtle flow effect

    // G-force FOV boost - creates intense "zoom" feel during hard carves
    const gForceFovBoost = this.smoothedGForce > 1.3 ?
      (this.smoothedGForce - 1.3) * 8 : 0;

    const targetFov = activeMode.fovBase + speedFovBoost + carveFovBoost +
                      flowFovBoost + gForceFovBoost;

    // Faster FOV response when increasing (snap), slower when decreasing (smooth release)
    const fovLerp = targetFov > this.smoothedFov ? this.fovSmoothing * 1.5 : this.fovSmoothing;
    this.smoothedFov = THREE.MathUtils.lerp(this.smoothedFov, targetFov, fovLerp);

    // === CAMERA SHAKE ===
    this.updateShake(deltaTime);

    // === APPLY TO CAMERA ===
    this.camera.position.copy(this.smoothedPosition);
    this.camera.position.add(this.shakeOffset);
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
   * Update camera shake effects
   */
  updateShake(deltaTime) {
    this.shakeTime += deltaTime;

    // Decay one-shot shake effects
    this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * deltaTime);
    this.landingImpact = Math.max(0, this.landingImpact - 8 * deltaTime);
    this.edgeCatchShake = Math.max(0, this.edgeCatchShake - 4 * deltaTime);

    // Smooth risk-based continuous shake
    const targetRiskShake = this.riskLevel > 0.5 ? (this.riskLevel - 0.5) * 2 : 0;
    this.riskShakeIntensity = THREE.MathUtils.lerp(
      this.riskShakeIntensity, targetRiskShake, 5 * deltaTime
    );

    // === G-FORCE SHAKE (subtle rumble during hard carves) ===
    // Only shake during quality carves (high rail strength)
    const gForceThreshold = 1.5;
    const targetGForceShake = (this.smoothedGForce > gForceThreshold && this.carveRailStrength > 0.5)
      ? (this.smoothedGForce - gForceThreshold) * this.carveRailStrength * 0.4
      : 0;
    this.gForceShakeIntensity = THREE.MathUtils.lerp(
      this.gForceShakeIntensity, targetGForceShake, 8 * deltaTime
    );

    // Combine all shake sources
    const totalShake = this.shakeIntensity +
                       this.landingImpact * 0.5 +
                       this.edgeCatchShake * 0.8 +
                       this.riskShakeIntensity * 0.3 +
                       this.gForceShakeIntensity * 0.25;

    if (totalShake > 0.01) {
      // Multi-frequency shake for organic feel
      const freq1 = this.shakeFrequency;
      const freq2 = this.shakeFrequency * 1.7;
      const freq3 = this.shakeFrequency * 0.6;

      const shake1 = Math.sin(this.shakeTime * freq1);
      const shake2 = Math.sin(this.shakeTime * freq2 + 1.3);
      const shake3 = Math.sin(this.shakeTime * freq3 + 2.7);

      // Randomize direction each frame for chaotic feel during high intensity
      const chaos = totalShake > 0.3 ? (Math.random() - 0.5) * totalShake * 0.3 : 0;

      this.shakeOffset.set(
        (shake1 * 0.5 + shake2 * 0.3 + chaos) * totalShake * 0.15,
        (shake2 * 0.4 + shake3 * 0.4 + Math.abs(chaos)) * totalShake * 0.1,
        (shake3 * 0.3 + shake1 * 0.2 + chaos) * totalShake * 0.12
      );
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
  }

  /**
   * Trigger a one-shot camera shake
   * @param {number} intensity - Shake intensity (0-1)
   * @param {string} type - Type of shake: 'impact', 'edgeCatch', 'generic'
   */
  triggerShake(intensity, type = 'generic') {
    switch (type) {
      case 'impact':
        this.landingImpact = Math.max(this.landingImpact, intensity);
        break;
      case 'edgeCatch':
        this.edgeCatchShake = Math.max(this.edgeCatchShake, intensity);
        break;
      default:
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    }
  }

  /**
   * Set continuous risk level for wobble shake
   * @param {number} level - Risk level (0-1)
   */
  setRiskLevel(level) {
    this.riskLevel = level;
  }

  /**
   * Set flow state intensity (0-1) for visual effects
   */
  setFlowState(intensity) {
    this.flowIntensity = THREE.MathUtils.lerp(this.flowIntensity, intensity, 0.05);
  }

  /**
   * Set G-force for camera effects
   */
  setGForce(gForce) {
    this.gForce = gForce;
    // Smooth the G-force for visual effects
    const lerpRate = gForce > this.smoothedGForce ? 0.15 : 0.08;
    this.smoothedGForce = THREE.MathUtils.lerp(this.smoothedGForce, gForce, lerpRate);
  }

  /**
   * Set carve rail strength for quality-dependent effects
   */
  setCarveRailStrength(strength) {
    this.carveRailStrength = strength;
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
