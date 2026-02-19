export class InputHandler {
  constructor() {
    this.keys = {};
    this.callbacks = {
      steer: null,
      lean: null,
      jump: null,
      restart: null,
      toggleWireframe: null,
      toggleColliders: null,
      toggleFreeCamera: null,
      toggleZenMode: null,
      startChallenge: null,
      cameraOrbit: null,
      cameraPitch: null,
      cameraReset: null,
      toggleCameraVersion: null,
      cycleCameraMode: null,
      toggleCarvePhysics: null,
      togglePlayerModel: null,
      toggleSportType: null,
      triggerAvalanche: null,
      toggleFlying: null,
      interact: null,  // E key for rocket launch
      toggleWalking: null,  // B key for walking mode
      toggleMinecraft: null,  // N key for minecraft mode
      toggleFPS: null,  // U key for first-person view
      toggleCrafting: null,  // Q key for crafting menu
      toggleBuildMode: null,  // X key for build mode
      placeBlock: null,  // Right-click or F to place block
      hotkey: null  // Number keys 1-9 for hotbar
    };

    // Smoothed input state
    this.smoothSteer = 0;
    this.smoothLean = 0;

    // Gamepad state
    this.gamepadIndex = null;
    this.gamepadJumpPressed = false;
    this.gamepadButtonStates = {}; // Track button press states for debouncing

    // Touch state
    this.touchActive = false;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchCurrentX = 0;
    this.touchCurrentY = 0;
    this.touchSteer = 0;
    this.touchLean = 0;

    // Mouse drag state (for trackpad)
    this.mouseActive = false;
    this.mouseStartX = 0;
    this.mouseStartY = 0;

    // Pointer lock state
    this.pointerLocked = false;
    this.pointerSteer = 0;
    this.pointerLean = 0;

    // Sensitivity (pixels to travel for full input)
    this.touchSensitivity = 80;
    this.pointerSensitivity = 0.008; // For pointer lock (multiplier on movement delta)

    this.init();
  }

  init() {
    // Keyboard events
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Gamepad events
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
      console.log('🎮 Gamepad connected:', e.gamepad.id);
      console.log('   L-stick: Steer/Lean | R-stick: Camera (R3 to reset)');
      console.log('   A: Jump | B: Restart | Y: Zen | Start: Gates');
    });

    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = null;
      this.gamepadButtonStates = {};
      console.log('🎮 Gamepad disconnected');
    });

    // Touch events
    window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this.onTouchEnd(e));
    window.addEventListener('touchcancel', (e) => this.onTouchEnd(e));

    // Mouse drag events (for trackpad/mouse)
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));

    // Pointer lock events
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    document.addEventListener('pointerlockerror', () => {
      console.log('Pointer lock failed');
    });

    // Click canvas to request pointer lock
    window.addEventListener('click', (e) => {
      if (!this.pointerLocked && e.target.tagName === 'CANVAS') {
        document.body.requestPointerLock();
      }
    });
  }

  onPointerLockChange() {
    this.pointerLocked = document.pointerLockElement === document.body;
    if (this.pointerLocked) {
      console.log('Pointer locked - move trackpad to control, ESC to exit');
      // Reset values
      this.pointerSteer = 0;
      this.pointerLean = 0;
    } else {
      console.log('Pointer unlocked');
      this.pointerSteer = 0;
      this.pointerLean = 0;
    }
  }

  onMouseDown(e) {
    // Only activate on left click
    if (e.button !== 0) return;

    this.mouseActive = true;
    this.mouseStartX = e.clientX;
    this.mouseStartY = e.clientY;
  }

  onMouseMove(e) {
    // Pointer lock mode - STICKY incremental control
    if (this.pointerLocked) {
      const deltaX = e.movementX;
      const deltaY = e.movementY;

      // Accumulate - STICKY, no spring back
      // Left/right trackpad = edge angle (steer)
      this.pointerSteer += deltaX * this.pointerSensitivity;
      // Forward/back trackpad = weight distribution (lean)
      this.pointerLean -= deltaY * this.pointerSensitivity;

      // Clamp to -1 to 1
      this.pointerSteer = Math.max(-1, Math.min(1, this.pointerSteer));
      this.pointerLean = Math.max(-1, Math.min(1, this.pointerLean));

      // NO decay - stays where you put it
      return;
    }

    // Regular drag mode
    if (!this.mouseActive) return;

    const deltaX = e.clientX - this.mouseStartX;
    const deltaY = e.clientY - this.mouseStartY;

    // Map to steer/lean
    this.touchSteer = Math.max(-1, Math.min(1, deltaX / this.touchSensitivity));
    this.touchLean = Math.max(-1, Math.min(1, -deltaY / this.touchSensitivity));
  }

  onMouseUp(e) {
    if (e.button !== 0) return;

    this.mouseActive = false;
    this.touchSteer = 0;
    this.touchLean = 0;
  }

  onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.touchActive = true;
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchCurrentX = touch.clientX;
    this.touchCurrentY = touch.clientY;

    // Double tap to jump (detect quick second touch)
    if (e.touches.length === 2) {
      if (this.callbacks.jump) this.callbacks.jump(true);
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    if (!this.touchActive) return;

    const touch = e.touches[0];
    this.touchCurrentX = touch.clientX;
    this.touchCurrentY = touch.clientY;

    // Calculate delta from start position
    const deltaX = this.touchCurrentX - this.touchStartX;
    const deltaY = this.touchCurrentY - this.touchStartY;

    // Map to steer/lean with sensitivity
    // Horizontal drag = steer (edge angle)
    this.touchSteer = Math.max(-1, Math.min(1, deltaX / this.touchSensitivity));
    // Vertical drag = lean (up = forward lean, down = back)
    this.touchLean = Math.max(-1, Math.min(1, -deltaY / this.touchSensitivity));
  }

  onTouchEnd(e) {
    if (e.touches.length === 0) {
      this.touchActive = false;
      // Smooth return to center
      this.touchSteer = 0;
      this.touchLean = 0;

      // Release jump
      if (this.callbacks.jump) this.callbacks.jump(false);
    }
  }

  onKeyDown(e) {
    this.keys[e.code] = true;

    // Single-press actions
    switch (e.code) {
      case 'Space':
        if (this.callbacks.jump) this.callbacks.jump(true);
        break;
      case 'KeyR':
        if (this.callbacks.restart) this.callbacks.restart();
        break;
      case 'Digit1':
        if (this.callbacks.toggleWireframe) this.callbacks.toggleWireframe();
        break;
      case 'Digit2':
        if (this.callbacks.toggleColliders) this.callbacks.toggleColliders();
        break;
      case 'Digit3':
        if (this.callbacks.toggleFreeCamera) this.callbacks.toggleFreeCamera();
        break;
      case 'KeyZ':
        if (this.callbacks.toggleZenMode) this.callbacks.toggleZenMode();
        break;
      case 'KeyG':
        if (this.callbacks.startChallenge) this.callbacks.startChallenge();
        break;
      case 'KeyV':
        if (this.callbacks.toggleCameraVersion) this.callbacks.toggleCameraVersion();
        break;
      case 'KeyC':
        if (this.callbacks.cycleCameraMode) this.callbacks.cycleCameraMode();
        break;
      case 'KeyP':
        if (this.callbacks.toggleCarvePhysics) this.callbacks.toggleCarvePhysics();
        break;
      case 'KeyM':
        if (this.callbacks.togglePlayerModel) this.callbacks.togglePlayerModel();
        break;
      case 'KeyT':
        if (this.callbacks.toggleSportType) this.callbacks.toggleSportType();
        break;
      case 'KeyY':
        if (this.callbacks.triggerAvalanche) this.callbacks.triggerAvalanche();
        break;
      case 'KeyF':
        if (this.callbacks.toggleFlying) this.callbacks.toggleFlying();
        break;
      case 'KeyE':
        if (this.callbacks.interact) this.callbacks.interact();
        break;
      case 'KeyB':
        if (this.callbacks.toggleWalking) this.callbacks.toggleWalking();
        break;
      case 'KeyN':
        if (this.callbacks.toggleMinecraft) this.callbacks.toggleMinecraft();
        break;
      case 'KeyU':
        if (this.callbacks.toggleFPS) this.callbacks.toggleFPS();
        break;
      case 'KeyQ':
        if (this.callbacks.toggleCrafting) this.callbacks.toggleCrafting();
        break;
      case 'KeyX':
        if (this.callbacks.toggleBuildMode) this.callbacks.toggleBuildMode();
        break;
      case 'KeyF':
        // F also places blocks in build mode (in addition to flying toggle)
        if (this.callbacks.placeBlock) this.callbacks.placeBlock();
        break;
      // Number keys 1-9 for hotbar
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9':
        if (this.callbacks.hotkey) {
          const num = parseInt(e.code.replace('Digit', ''));
          this.callbacks.hotkey(num);
        }
        break;
    }
  }

  onKeyUp(e) {
    this.keys[e.code] = false;

    // Handle jump release (triggers the actual jump)
    if (e.code === 'Space') {
      if (this.callbacks.jump) this.callbacks.jump(false);
    }
  }

  update() {
    // === SIMPLE CONTROL SCHEME (v2) ===
    // WASD or Arrow keys for steering and lean
    // A/D or Left/Right = Edge angle (heel/toe) - controls turn direction
    // W/S or Up/Down = Weight forward/back - affects turn tightness and ollie

    // Steer target (edge angle)
    let steerTarget = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steerTarget -= 1;   // Heelside turn
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steerTarget += 1;  // Toeside turn

    // Lean target (weight distribution)
    let leanTarget = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) leanTarget += 1;      // Weight forward
    if (this.keys['KeyS'] || this.keys['ArrowDown']) leanTarget -= 1;    // Weight back

    // Smooth the inputs (prevents instant max edge - feels more physical)
    const steerSmoothRate = 0.22;  // Responsive but not instant
    const leanSmoothRate = 0.18;

    this.smoothSteer += (steerTarget - this.smoothSteer) * steerSmoothRate;
    this.smoothLean += (leanTarget - this.smoothLean) * leanSmoothRate;

    let steer = this.smoothSteer;
    let lean = this.smoothLean;

    // Gamepad input (overrides keyboard if connected)
    if (this.gamepadIndex !== null) {
      const gamepad = navigator.getGamepads()[this.gamepadIndex];
      if (gamepad) {
        // Left stick for steering/lean
        const deadzone = 0.15;
        const stickX = gamepad.axes[0];
        const stickY = gamepad.axes[1];

        if (Math.abs(stickX) > deadzone) {
          steer = stickX;
        }
        if (Math.abs(stickY) > deadzone) {
          lean = -stickY; // Invert Y (push forward = lean forward)
        }

        // A button (Xbox) / X button (PlayStation) for jump - with proper release detection
        const jumpButton = gamepad.buttons[0];
        if (jumpButton.pressed && !this.gamepadJumpPressed) {
          this.gamepadJumpPressed = true;
          if (this.callbacks.jump) this.callbacks.jump(true);
        } else if (!jumpButton.pressed && this.gamepadJumpPressed) {
          this.gamepadJumpPressed = false;
          if (this.callbacks.jump) this.callbacks.jump(false);
        }

        // Helper for debounced button press detection
        const isButtonJustPressed = (index) => {
          const wasPressed = this.gamepadButtonStates[index] || false;
          const isPressed = gamepad.buttons[index] && gamepad.buttons[index].pressed;
          this.gamepadButtonStates[index] = isPressed;
          return isPressed && !wasPressed;
        };

        // B button (Xbox) / Circle (PlayStation) for restart
        if (isButtonJustPressed(1)) {
          if (this.callbacks.restart) this.callbacks.restart();
        }

        // Y button (Xbox) / Triangle (PlayStation) for zen mode
        if (isButtonJustPressed(3)) {
          if (this.callbacks.toggleZenMode) this.callbacks.toggleZenMode();
        }

        // Start button / Options for gate challenge
        if (isButtonJustPressed(9)) {
          if (this.callbacks.startChallenge) this.callbacks.startChallenge();
        }

        // Select/Back button for restart (alternative)
        if (isButtonJustPressed(8)) {
          if (this.callbacks.restart) this.callbacks.restart();
        }

        // Right stick for camera control (axes 2 and 3)
        const rightStickX = gamepad.axes[2] || 0;
        const rightStickY = gamepad.axes[3] || 0;

        if (Math.abs(rightStickX) > deadzone) {
          if (this.callbacks.cameraOrbit) this.callbacks.cameraOrbit(rightStickX);
        } else {
          if (this.callbacks.cameraOrbit) this.callbacks.cameraOrbit(0);
        }

        if (Math.abs(rightStickY) > deadzone) {
          if (this.callbacks.cameraPitch) this.callbacks.cameraPitch(rightStickY);
        } else {
          if (this.callbacks.cameraPitch) this.callbacks.cameraPitch(0);
        }

        // Right stick click (R3) to reset camera
        if (isButtonJustPressed(11)) {
          if (this.callbacks.cameraReset) this.callbacks.cameraReset();
        }

        // Left bumper (LB) to toggle camera version
        if (isButtonJustPressed(4)) {
          if (this.callbacks.toggleCameraVersion) this.callbacks.toggleCameraVersion();
        }

        // Right bumper (RB) to cycle camera mode
        if (isButtonJustPressed(5)) {
          if (this.callbacks.cycleCameraMode) this.callbacks.cycleCameraMode();
        }
      }
    }

    // Pointer lock input (highest priority)
    if (this.pointerLocked) {
      steer = this.pointerSteer;
      lean = this.pointerLean;
    }
    // Touch/mouse drag input
    else if (this.touchActive || this.mouseActive) {
      steer = this.touchSteer;
      lean = this.touchLean;
    }

    // Send continuous input updates
    if (this.callbacks.steer) this.callbacks.steer(steer);
    if (this.callbacks.lean) this.callbacks.lean(lean);
  }

  setCallback(action, callback) {
    this.callbacks[action] = callback;
  }
}
