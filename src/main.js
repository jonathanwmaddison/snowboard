import { SceneManager } from './SceneManager.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { PlayerController } from './PlayerController.js';
import { CameraController } from './CameraController.js';
import { UIOverlay } from './UIOverlay.js';
import { InputHandler } from './InputHandler.js';
import { CarveMarks } from './CarveMarks.js';
import { FlowScore } from './FlowScore.js';
import { FlowUI } from './FlowUI.js';
import { AudioSystem } from './AudioSystem.js';

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
    this.zenMode = false;
    this.previousEdgeSide = 0;

    this.lastTime = 0;
    this.isRunning = false;

    // Debug state
    this.wireframeEnabled = false;
    this.collidersVisible = false;
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

    // Create player
    this.player = new PlayerController(this.sceneManager, this.physicsWorld);
    this.player.init(terrainInfo.startPosition);

    // Create camera with terrain reference for ground collision
    this.cameraController = new CameraController(this.sceneManager, this.terrain);
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

    // Create UI
    this.ui = new UIOverlay();
    this.ui.init(() => this.restart());

    // Setup input
    this.input = new InputHandler();
    this.setupInput();

    console.log('Initialization complete!');
    console.log('Controls: A/D to steer, W/S to lean, Space to jump, R to restart');
    console.log('         Z to toggle Zen Mode');
    console.log('Debug: 1 for wireframe, 2 for colliders');

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

  }

  restart() {
    this.player.reset();
    this.flowScore.reset();
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

    // Update carve marks
    this.carveMarks.update(
      deltaTime,
      this.player.getPosition(),
      this.player.getHeading(),
      this.player.edgeAngle,
      this.player.currentSpeed,
      this.player.isGrounded
    );

    // Get terrain state for flow scoring (terrain resonance)
    const playerPos = this.player.getPosition();
    const terrainState = this.terrain.getTerrainState(
      playerPos.x,
      playerPos.z,
      this.player.currentSpeed
    );

    // Update flow scoring system
    const playerState = {
      edgeAngle: this.player.edgeAngle,
      speed: this.player.currentSpeed,
      isGrounded: this.player.isGrounded,
      carveRailStrength: this.player.carveRailStrength,
      carvePerfection: this.player.carvePerfection,
      position: playerPos,
      heading: this.player.heading
    };
    this.flowScore.update(deltaTime, playerState, terrainState);

    // Update flow UI
    const flowDisplayState = this.flowScore.getDisplayState();
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
