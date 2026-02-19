import { SceneManager } from './SceneManager.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { PlayerController } from './PlayerController.js';
import { CameraController } from './CameraController.js';
import { CameraControllerV2 } from './CameraControllerV2.js';
import { InputHandler } from './InputHandler.js';
import { CarveMarks } from './CarveMarks.js';
import { FlowScore } from './FlowScore.js';
import { AudioSystem } from './AudioSystem.js';
import { CarveAnalyzer } from './CarveAnalyzer.js';
import { Atmosphere } from './Atmosphere.js';

class Game {
  constructor() {
    this.sceneManager = null;
    this.physicsWorld = null;
    this.terrain = null;
    this.player = null;
    this.cameraController = null;
    this.carveMarks = null;
    this.input = null;

    // Flow scoring system
    this.flowScore = null;
    this.audioSystem = null;
    this.carveAnalyzer = null;
    this.atmosphere = null;
    this.previousEdgeSide = 0;
    this.wasEdgeCaught = false;  // Track edge catch for feedback

    this.lastTime = 0;
    this.isRunning = false;

    // Debug state
    this.wireframeEnabled = false;
    this.collidersVisible = false;

    // Camera input (gamepad right stick)
    this.cameraOrbit = 0;
    this.cameraPitch = 0;

    // Camera version (v1 = original, v2 = carve-reactive)
    this.cameraVersion = 2;  // Default to v2
    this.cameraControllerV1 = null;
    this.cameraControllerV2 = null;
  }

  async init() {
    console.log('Initializing Snowboard Prototype...');

    // Create core systems
    this.sceneManager = new SceneManager();
    this.physicsWorld = new PhysicsWorld();
    await this.physicsWorld.init();

    // Create terrain
    this.terrain = new TerrainGenerator(this.sceneManager, this.physicsWorld);
    const terrainInfo = this.terrain.generate();

    // Create player (with terrain reference for snow conditions)
    this.player = new PlayerController(this.sceneManager, this.physicsWorld, this.terrain);
    this.player.init(terrainInfo.startPosition);

    // Load the biped character model
    try {
      await this.player.loadGLBModel(`${import.meta.env.BASE_URL}biped/Character_output.glb`);
      console.log('Biped character loaded successfully');
    } catch (err) {
      console.warn('Failed to load character model, using default:', err);
    }

    // Create both camera controllers (v1 = simple orbit, v2 = carve-reactive)
    this.cameraControllerV1 = new CameraController(this.sceneManager, this.terrain);
    this.cameraControllerV2 = new CameraControllerV2(this.sceneManager, this.terrain);

    // Set active camera based on version
    this.cameraController = this.cameraVersion === 2 ? this.cameraControllerV2 : this.cameraControllerV1;
    this.cameraController.setInitialPosition(this.player.getPosition());

    // Setup post-processing with the active camera
    this.sceneManager.setupPostProcessing(this.cameraController.camera);

    // Create carve marks system
    this.carveMarks = new CarveMarks(this.sceneManager);

    // Create flow scoring system
    this.flowScore = new FlowScore();

    // Create audio system (init on first user interaction)
    this.audioSystem = new AudioSystem();
    window.addEventListener('click', () => this.audioSystem.init(), { once: true });
    window.addEventListener('keydown', () => this.audioSystem.init(), { once: true });

    // Create carve analyzer for deep turn analysis
    this.carveAnalyzer = new CarveAnalyzer();

    // Setup perfect carve callback
    this.carveAnalyzer.onPerfectCarve = (turnRecord) => {
      console.log('PERFECT CARVE!', turnRecord.overallPerfection.toFixed(2));
      // Could trigger special visual/audio here
    };

    // Create atmosphere (weather, snow particles)
    this.atmosphere = new Atmosphere(this.sceneManager);

    // Setup input
    this.input = new InputHandler();
    this.setupInput();

    console.log('Initialization complete!');
    console.log('=== CONTROLS ===');
    console.log('A/D or ←/→ = Turn | W = Tuck | S = Brake');
    console.log('Space = Jump (hold to charge)');
    console.log('IN AIR: A/D = Spin, W = Front flip, S = Back flip');
    console.log('R = Restart | V = Toggle camera | C = Cycle camera mode');
    console.log('P = Toggle physics (v1/v2) | T = Toggle sport (snowboard/ski)');
    console.log('B = Walking mode | F = Flying mode | E = Interact (rocket)');
    console.log('Gamepad: L-stick control, R-stick camera, A jump');

    // Start game loop
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  setupInput() {
    this.input.setCallback('steer', (value) => {
      this.player.setInput('steer', value);
    });

    this.input.setCallback('lean', (value) => {
      this.player.setInput('lean', value);
    });

    this.input.setCallback('jump', (value) => {
      this.player.setInput('jump', value);
    });

    this.input.setCallback('restart', () => {
      this.restart();
    });

    this.input.setCallback('toggleWireframe', () => {
      this.wireframeEnabled = !this.wireframeEnabled;
      this.sceneManager.toggleWireframe(this.wireframeEnabled);
      console.log('Wireframe:', this.wireframeEnabled ? 'ON' : 'OFF');
    });

    this.input.setCallback('toggleColliders', () => {
      this.collidersVisible = !this.collidersVisible;
      this.sceneManager.toggleColliders(this.collidersVisible);
      console.log('Colliders:', this.collidersVisible ? 'VISIBLE' : 'HIDDEN');
    });

    // Camera control (gamepad right stick)
    this.input.setCallback('cameraOrbit', (value) => {
      this.cameraOrbit = value;
    });

    this.input.setCallback('cameraPitch', (value) => {
      this.cameraPitch = value;
    });

    this.input.setCallback('cameraReset', () => {
      this.cameraController.resetCamera();
    });

    // Camera version toggle (v1 <-> v2)
    this.input.setCallback('toggleCameraVersion', () => {
      this.toggleCameraVersion();
    });

    // Camera mode cycle (v2 only: chase, cinematic, action, side)
    this.input.setCallback('cycleCameraMode', () => {
      if (this.cameraVersion === 2) {
        this.cameraControllerV2.cycleMode();
      } else {
        console.log('Camera modes only available in v2. Press V to switch.');
      }
    });

    // Carve physics toggle (v1 <-> v2)
    this.input.setCallback('toggleCarvePhysics', () => {
      const version = this.player.toggleCarvePhysicsVersion();
      console.log(`Carve Physics: V${version} ${version === 2 ? '(realistic - pressure/skid model)' : '(original - rail/flow model)'}`);
    });

    // Sport type toggle (snowboard <-> ski)
    this.input.setCallback('toggleSportType', () => {
      const sport = this.player.toggleSportType();
      console.log(`Sport: ${sport} ${sport === 'ski' ? '(parallel turns, wedge brake)' : '(carving, edge transitions)'}`);
    });

    // Flying mode toggle
    this.input.setCallback('toggleFlying', () => {
      this.player.toggleFlying();
    });

    // Interact (E key) - for rocket launch etc
    this.input.setCallback('interact', () => {
      this.player.tryInteract();
    });

    // Walking mode toggle
    this.input.setCallback('toggleWalking', () => {
      this.player.toggleWalking();
    });

    // Minecraft mode toggle
    this.input.setCallback('toggleMinecraft', () => {
      this.player.toggleMinecraft();
    });

    // FPS mode toggle
    this.input.setCallback('toggleFPS', () => {
      this.player.toggleFPS();
    });

    // Crafting toggle (Q key)
    this.input.setCallback('toggleCrafting', () => {
      if (this.player.minecraftMode && this.player.minecraftMode.isEnabled()) {
        this.player.minecraftMode.toggleCrafting();
      }
    });

    // Build mode toggle (X key)
    this.input.setCallback('toggleBuildMode', () => {
      if (this.player.minecraftMode && this.player.minecraftMode.isEnabled()) {
        this.player.minecraftMode.toggleBuildMode();
      }
    });

    // Place block (F key in build mode)
    this.input.setCallback('placeBlock', () => {
      if (this.player.minecraftMode && this.player.minecraftMode.isEnabled() && this.player.minecraftMode.buildMode) {
        this.player.minecraftMode.placeBlock();
      }
    });

    // Hotbar selection (number keys)
    this.input.setCallback('hotkey', (num) => {
      if (this.player.minecraftMode && this.player.minecraftMode.isEnabled()) {
        this.player.minecraftMode.handleHotkey(num);
      }
    });

  }

  toggleCameraVersion() {
    this.cameraVersion = this.cameraVersion === 1 ? 2 : 1;

    // Get current player state for seamless transition
    const playerPos = this.player.getPosition();
    const playerHeading = this.player.getHeading();

    // Switch active camera
    this.cameraController = this.cameraVersion === 2 ? this.cameraControllerV2 : this.cameraControllerV1;
    this.cameraController.setInitialPosition(playerPos, playerHeading);

    console.log(`Camera: V${this.cameraVersion} ${this.cameraVersion === 2 ? '(carve-reactive)' : '(simple orbit)'}`);
    if (this.cameraVersion === 2) {
      console.log('Press C to cycle camera modes');
    }
  }

  restart() {
    this.player.reset();
    this.flowScore.reset();
    this.carveAnalyzer.reset();
    console.log('Player reset to start position');
  }

  /**
   * Update gamepad haptic feedback
   */
  updateHaptics(deltaTime) {
    // Get gamepads
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gamepad = null;

    for (const gp of gamepads) {
      if (gp && gp.connected) {
        gamepad = gp;
        break;
      }
    }

    if (!gamepad || !gamepad.vibrationActuator) return;

    // Calculate haptic intensities
    let strongMagnitude = 0;
    let weakMagnitude = 0;

    // Carve rumble - subtle continuous vibration during deep carves
    if (this.player.isGrounded && this.player.carveRailStrength > 0.3) {
      const carveIntensity = this.player.carveRailStrength * 0.15;
      const speedBonus = Math.min(this.player.currentSpeed / 60, 0.1);
      weakMagnitude = Math.max(weakMagnitude, carveIntensity + speedBonus);
    }

    // Edge transition pop - quick pulse
    if (this.player.lastTimingMultiplier !== undefined && this.player.lastTimingMultiplier > 0) {
      // This gets set during transitions
    }

    // Risk/wobble rumble - stronger shake when at risk
    if (this.player.riskLevel > 0.5) {
      const riskIntensity = (this.player.riskLevel - 0.5) * 0.4;
      strongMagnitude = Math.max(strongMagnitude, riskIntensity);
      weakMagnitude = Math.max(weakMagnitude, riskIntensity * 0.7);
    }

    // Landing impact - brief strong pulse
    if (this.player.isGrounded && !this.player.wasGrounded && this.player.airTime > 0.3) {
      const impactIntensity = Math.min(this.player.airTime * 0.5, 1);
      strongMagnitude = Math.max(strongMagnitude, impactIntensity);
      weakMagnitude = Math.max(weakMagnitude, impactIntensity * 0.8);
    }

    // Edge catch - strong brief rumble
    if (this.player.isEdgeCaught && !this.wasEdgeCaught) {
      strongMagnitude = 0.8;
      weakMagnitude = 0.6;
    }

    // Apply vibration if any intensity
    if (strongMagnitude > 0.01 || weakMagnitude > 0.01) {
      try {
        gamepad.vibrationActuator.playEffect('dual-rumble', {
          duration: 50,
          strongMagnitude: Math.min(strongMagnitude, 1),
          weakMagnitude: Math.min(weakMagnitude, 1)
        });
      } catch (e) {
        // Vibration not supported or failed
      }
    }
  }

  gameLoop(currentTime) {
    if (!this.isRunning) return;

    // Calculate delta time (clamped to prevent spiral of death)
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    // Update input
    this.input.update();

    // Check if E key is held for mining (minecraft mode)
    this.player.setMining(this.input.keys['KeyE'] || false);

    // Update physics
    this.physicsWorld.step(deltaTime);

    // Update player
    this.player.update(deltaTime);

    // Get player position
    const playerPos = this.player.getPosition();

    // Build player state object for all systems
    const playerState = {
      edgeAngle: this.player.edgeAngle,
      speed: this.player.currentSpeed,
      isGrounded: this.player.isGrounded,
      carveRailStrength: this.player.carveRailStrength,
      carvePerfection: this.player.carvePerfection,
      position: playerPos,
      heading: this.player.heading,
      // New carve physics state
      flowState: this.player.flowState,
      angulation: this.player.angulation,
      boardFlex: this.player.boardFlex,
      edgeBite: this.player.edgeBite
    };

    // Update carve analyzer (deep turn analysis)
    this.carveAnalyzer.update(deltaTime, playerState);
    const analyzerState = this.carveAnalyzer.getState();

    // Pass carve quality to carve marks for colored trails
    this.carveMarks.setCarveQuality(analyzerState.overallPerfection, analyzerState.phase);

    // Update carve marks
    this.carveMarks.update(
      deltaTime,
      playerPos,
      this.player.getHeading(),
      this.player.edgeAngle,
      this.player.currentSpeed,
      this.player.isGrounded
    );

    // Get terrain state for flow scoring (terrain resonance)
    const terrainState = this.terrain.getTerrainState(
      playerPos.x,
      playerPos.z,
      this.player.currentSpeed
    );

    // Update flow scoring system
    this.flowScore.update(deltaTime, playerState, terrainState);

    // Update atmosphere (snow particles, fog)
    this.atmosphere.update(deltaTime, playerPos);

    // Detect edge transitions for audio
    const absEdge = Math.abs(this.player.edgeAngle);
    const currentEdgeSide = absEdge > 0.15 ? Math.sign(this.player.edgeAngle) : 0;
    const transitioned = currentEdgeSide !== 0 &&
                         this.previousEdgeSide !== 0 &&
                         currentEdgeSide !== this.previousEdgeSide;
    this.previousEdgeSide = currentEdgeSide;

    // === EDGE CATCH FEEDBACK ===
    if (this.player.isEdgeCaught && !this.wasEdgeCaught) {
      const severity = this.player.edgeCatchSeverity || 0.5;
      if (this.cameraVersion === 2) {
        this.cameraControllerV2.triggerShake(severity, 'edgeCatch');
      }
      this.audioSystem.playEdgeCatch(severity);
    }
    this.wasEdgeCaught = this.player.isEdgeCaught;

    // === LANDING FEEDBACK ===
    if (this.player.isGrounded && !this.player.wasGrounded) {
      const impactIntensity = Math.min(this.player.airTime * 0.3, 1);
      if (impactIntensity > 0.1) {
        if (this.cameraVersion === 2) {
          this.cameraControllerV2.triggerShake(impactIntensity, 'impact');
        }
        this.audioSystem.playLandingImpact(impactIntensity);
      }
    }

    // === RISK LEVEL CAMERA SHAKE ===
    if (this.cameraVersion === 2) {
      this.cameraControllerV2.setRiskLevel(this.player.riskLevel || 0);
    }

    // Update audio system
    this.audioSystem.update(deltaTime, {
      edgeAngle: this.player.edgeAngle,
      speed: this.player.currentSpeed,
      isGrounded: this.player.isGrounded,
      carveRailStrength: this.player.carveRailStrength,
      flowLevel: this.player.flowState || 0,
      transitioned: transitioned,
      terrainSync: terrainState.terrainSync,
      timingQuality: this.player.lastTimingMultiplier || 1.0,
      flexEnergy: this.player.flexEnergy || 0,
      riskLevel: this.player.riskLevel || 0,
      gForce: this.player.currentGForce || 1.0
    });

    // === GAMEPAD HAPTICS ===
    this.updateHaptics(deltaTime);

    // Pass camera input from gamepad right stick
    this.cameraController.setCameraInput(this.cameraOrbit, this.cameraPitch);

    // Pass flow state, G-force, and carve strength to v2 camera for visual effects
    if (this.cameraVersion === 2) {
      this.cameraControllerV2.setFlowState(this.player.flowState || 0);
      this.cameraControllerV2.setGForce(this.player.currentGForce || 1.0);
      this.cameraControllerV2.setCarveRailStrength(this.player.carveRailStrength || 0);
    }

    // Update camera with additional state for dynamic effects
    this.cameraController.update(
      deltaTime,
      this.player.getPosition(),
      this.player.getVelocity(),
      this.player.getHeading(),
      this.player.edgeAngle,
      this.player.isGrounded,
      this.player.compression,
      this.player.wasGrounded,
      this.player.fpsMode  // FPS mode flag
    );

    // Update shadow camera to follow player
    this.sceneManager.updateShadowCamera(this.player.getPosition());

    // Update bloom intensity based on speed (more bloom at high speed)
    const speedKmh = this.player.getSpeedKmh();
    const speedBloom = Math.min(1, (speedKmh - 30) / 70); // Ramp from 30-100 km/h
    this.sceneManager.setBloomIntensity(Math.max(0, speedBloom));

    // Update terrain shader (snow sparkle animation)
    this.terrain.updateShader(
      performance.now() / 1000,
      this.cameraController.camera.position
    );

    // Render
    this.sceneManager.render(this.cameraController.camera);

    // Next frame
    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

// Start the game
const game = new Game();
game.init().catch(console.error);

// Expose game to window for debugging and GLB model loading
window.game = game;

// Helper functions for loading GLB models from console
window.loadModel = async (url) => {
  console.log('Loading model from:', url);
  await game.player.loadGLBModel(url);
  console.log('Model loaded! Press M to toggle between models.');
};

// Reload character if needed
window.loadCharacter = () => window.loadModel(`${import.meta.env.BASE_URL}biped/Character_output.glb`);
