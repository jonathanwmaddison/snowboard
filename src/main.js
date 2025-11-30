import { SceneManager } from './SceneManager.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { PlayerController } from './PlayerController.js';
import { CameraController } from './CameraController.js';
import { CameraControllerV2 } from './CameraControllerV2.js';
import { UIOverlay } from './UIOverlay.js';
import { InputHandler } from './InputHandler.js';
import { CarveMarks } from './CarveMarks.js';
import { FlowScore } from './FlowScore.js';
import { FlowUI } from './FlowUI.js';
import { AudioSystem } from './AudioSystem.js';
import { CarveAnalyzer } from './CarveAnalyzer.js';
import { Atmosphere } from './Atmosphere.js';
import { GateSystem } from './GateSystem.js';
import { AvalancheSystem } from './AvalancheSystem.js';

class Game {
  constructor() {
    this.sceneManager = null;
    this.physicsWorld = null;
    this.terrain = null;
    this.player = null;
    this.cameraController = null;
    this.carveMarks = null;
    this.ui = null;
    this.input = null;

    // Flow scoring system
    this.flowScore = null;
    this.flowUI = null;
    this.audioSystem = null;
    this.carveAnalyzer = null;
    this.atmosphere = null;
    this.gateSystem = null;
    this.avalancheSystem = null;
    this.zenMode = false;
    this.previousEdgeSide = 0;
    this.challengeMode = false;  // Gate challenge active

    // Best run tracking
    this.bestRunScore = 0;

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
      await this.player.loadGLBModel('/biped/Character_output.glb');
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

    // Create carve marks system
    this.carveMarks = new CarveMarks(this.sceneManager);

    // Create flow scoring system
    this.flowScore = new FlowScore();
    this.flowUI = new FlowUI();

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

    // Create gate challenge system
    this.gateSystem = new GateSystem(this.sceneManager, this.terrain);

    // Setup gate callbacks
    this.gateSystem.onGateCleared = (data) => {
      console.log(`Gate ${data.index + 1} cleared! (${data.totalCleared} total)`);
      // Add score bonus for gate
      this.flowScore.addBonus(50 + data.speedBonus * 50, 'Gate cleared');
    };

    this.gateSystem.onGateMissed = (data) => {
      console.log(`Gate ${data.index + 1} MISSED! (${data.totalMissed} total)`);
    };

    this.gateSystem.onCourseComplete = (data) => {
      const status = data.isPerfect ? 'PERFECT RUN!' : `${data.missed} gates missed`;
      console.log(`Course complete! Time: ${data.time.toFixed(2)}s - ${status}`);
      if (data.isNewBest) {
        console.log('NEW BEST TIME!');
      }
    };

    // Create avalanche system
    this.avalancheSystem = new AvalancheSystem(this.sceneManager, this.terrain, this.audioSystem);

    // Setup avalanche callbacks
    this.avalancheSystem.onAvalancheStart = (avalanche) => {
      console.log('AVALANCHE! Outrun it!');
    };

    this.avalancheSystem.onPlayerCaught = (intensity) => {
      console.log('Caught in avalanche!');
      // Player wipeout handled in game loop
    };

    // Create UI
    this.ui = new UIOverlay();
    this.ui.init(() => this.restart());

    // Setup input
    this.input = new InputHandler();
    this.setupInput();

    console.log('Initialization complete!');
    console.log('=== CONTROLS (v2) ===');
    console.log('A/D or ←/→ = Turn | W = Tuck | S = Brake');
    console.log('Space = Jump (hold to charge)');
    console.log('IN AIR: A/D = Spin, W = Front flip, S = Back flip');
    console.log('R = Restart, Z = Zen mode, G = Gates, Y = Avalanche!');
    console.log('V = Toggle camera (v1/v2), C = Cycle camera mode');
    console.log('P = Toggle carve physics (v1 original / v2 realistic)');
    console.log('T = Toggle sport (snowboard / ski)');
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

    this.input.setCallback('toggleZenMode', () => {
      this.zenMode = !this.zenMode;
      this.flowUI.setZenMode(this.zenMode);
      console.log('Zen Mode:', this.zenMode ? 'ON - just carve, no score' : 'OFF');
    });

    this.input.setCallback('startChallenge', () => {
      this.startGateChallenge();
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

    // Manual avalanche trigger (for testing)
    this.input.setCallback('triggerAvalanche', () => {
      this.avalancheSystem.triggerManual(this.player.getPosition());
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

  startGateChallenge() {
    // Generate course starting near player position
    const playerPos = this.player.getPosition();
    const startZ = playerPos.z + 30;  // Start gates ahead of player

    // Cycle through course types
    const types = ['slalom', 'gs', 'freeride'];
    const currentType = this.gateSystem.courseType;
    const nextIndex = (types.indexOf(currentType) + 1) % types.length;
    const newType = types[nextIndex];

    this.gateSystem.generateCourse(startZ, newType);
    this.challengeMode = true;

    console.log(`${newType.toUpperCase()} challenge started! ${this.gateSystem.gates.length} gates`);
    console.log('Press G again to cycle course types');
  }

  restart() {
    // Check if this was a best run before resetting
    const currentScore = this.flowScore.currentScore;
    if (currentScore > this.bestRunScore) {
      this.bestRunScore = currentScore;
      // Save current trails as ghost
      this.carveMarks.saveAsGhost();
      console.log('New best run:', currentScore, '- Ghost saved!');
    }

    this.player.reset();
    this.flowScore.reset();
    this.carveAnalyzer.reset();
    this.avalancheSystem.reset();
    if (this.challengeMode) {
      this.gateSystem.resetCourse();
    }
    console.log('Player reset to start position');
  }

  gameLoop(currentTime) {
    if (!this.isRunning) return;

    // Calculate delta time (clamped to prevent spiral of death)
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    // Update input
    this.input.update();

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

    // Update avalanche system
    const avalancheState = this.avalancheSystem.update(
      deltaTime,
      playerPos,
      this.player.currentSpeed
    );

    // Handle avalanche catching player
    if (avalancheState.caught) {
      // Slow player down significantly when caught in avalanche
      this.player.applyAvalancheEffect(avalancheState.intensity);
    }

    // Update avalanche audio rumble
    this.audioSystem.setAvalancheRumble(avalancheState.rumbleIntensity);

    // Update gate challenge system
    if (this.challengeMode) {
      this.gateSystem.update(deltaTime, playerPos, this.player.currentSpeed);
    }

    // Update flow UI with analyzer state for phase display
    const flowDisplayState = this.flowScore.getDisplayState();
    flowDisplayState.turnPhase = analyzerState.phase;
    flowDisplayState.gForce = analyzerState.currentGForce;
    flowDisplayState.isPerfect = analyzerState.isPerfect;
    flowDisplayState.carveStyle = analyzerState.carveStyle;

    // Add risk and snow condition state
    flowDisplayState.riskLevel = this.player.riskLevel;
    flowDisplayState.snowCondition = this.player.currentSnowCondition;

    // Add input values for balance meter
    flowDisplayState.steer = this.player.input.steer;
    flowDisplayState.lean = this.player.input.lean;

    // Add new carve physics state
    flowDisplayState.flowState = this.player.flowState;
    flowDisplayState.angulation = this.player.angulation;
    flowDisplayState.boardFlex = this.player.boardFlex;
    flowDisplayState.flexEnergy = this.player.flexEnergy;
    flowDisplayState.edgeBite = this.player.edgeBite;
    flowDisplayState.arcType = this.player.arcType;
    flowDisplayState.carveChainCount = this.player.carveChainCount;

    // Add v2 physics state if active
    flowDisplayState.carvePhysicsVersion = this.player.carvePhysicsVersion;
    flowDisplayState.sportType = this.player.sportType;
    if (this.player.v2) {
      flowDisplayState.v2 = {
        isCarving: this.player.v2.isCarving,
        isSkidding: this.player.v2.isSkidding,
        slipAngle: this.player.v2.slipAngle,
        turnPhase: this.player.v2.turnPhase,
        gForce: this.player.v2.gForce,
        carveQuality: this.player.v2.carveQuality,
        pressureDistribution: this.player.v2.pressureDistribution,
        currentEdge: this.player.v2.currentEdge,
        isSwitch: this.player.v2.isSwitch,
        effectiveTurnRadius: this.player.v2.effectiveTurnRadius
      };
    }

    // Add ski state if skiing
    if (this.player.ski) {
      flowDisplayState.ski = {
        turnType: this.player.ski.turnType,
        isCarving: this.player.ski.isCarving,
        isBraking: this.player.ski.isBraking,
        wedgeAngle: this.player.ski.wedgeAngle,
        gForce: this.player.ski.gForce,
        leftEdge: this.player.ski.leftSki.edgeAngle,
        rightEdge: this.player.ski.rightSki.edgeAngle,
        carveQuality: this.player.ski.carveQuality,
      };
    }

    // Add gate state if challenge is active
    if (this.challengeMode) {
      flowDisplayState.gateState = this.gateSystem.getState();
    }

    // Add avalanche state
    if (avalancheState.active) {
      flowDisplayState.avalanche = this.avalancheSystem.getState();
    }

    this.flowUI.update(flowDisplayState);

    // Detect edge transitions for audio
    const absEdge = Math.abs(this.player.edgeAngle);
    const currentEdgeSide = absEdge > 0.15 ? Math.sign(this.player.edgeAngle) : 0;
    const transitioned = currentEdgeSide !== 0 &&
                         this.previousEdgeSide !== 0 &&
                         currentEdgeSide !== this.previousEdgeSide;
    this.previousEdgeSide = currentEdgeSide;

    // Update audio system
    this.audioSystem.update(deltaTime, {
      edgeAngle: this.player.edgeAngle,
      speed: this.player.currentSpeed,
      isGrounded: this.player.isGrounded,
      carveRailStrength: this.player.carveRailStrength,
      flowLevel: flowDisplayState.flowLevel,
      transitioned: transitioned,
      terrainSync: terrainState.terrainSync
    });

    // Pass camera input from gamepad right stick
    this.cameraController.setCameraInput(this.cameraOrbit, this.cameraPitch);

    // Pass flow state to v2 camera for visual effects
    if (this.cameraVersion === 2) {
      this.cameraControllerV2.setFlowState(this.player.flowState || 0);
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
      this.player.wasGrounded
    );

    // Update UI
    this.ui.update(this.player.getSpeedKmh());

    // Update shadow camera to follow player
    this.sceneManager.updateShadowCamera(this.player.getPosition());

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
window.loadCharacter = () => window.loadModel('/biped/Character_output.glb');
