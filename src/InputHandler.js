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
      startChallenge: null
    };

    // Gamepad state
    this.gamepadIndex = null;

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
      console.log('Gamepad connected:', e.gamepad.id);
    });

    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = null;
      console.log('Gamepad disconnected');
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
    }
  }

  onKeyUp(e) {
    this.keys[e.code] = false;
  }

  update() {
    // Keyboard input
    let steer = 0;
    let lean = 0;

    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steer += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) lean += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) lean -= 1;

    // Gamepad input (overrides keyboard if connected)
    if (this.gamepadIndex !== null) {
      const gamepad = navigator.getGamepads()[this.gamepadIndex];
      if (gamepad) {
        // Left stick for steering
        const deadzone = 0.15;
        const stickX = gamepad.axes[0];
        const stickY = gamepad.axes[1];

        if (Math.abs(stickX) > deadzone) {
          steer = stickX;
        }
        if (Math.abs(stickY) > deadzone) {
          lean = -stickY; // Invert Y
        }

        // A button for jump
        if (gamepad.buttons[0].pressed) {
          if (this.callbacks.jump) this.callbacks.jump(true);
        }

        // Start button for restart
        if (gamepad.buttons[9].pressed) {
          if (this.callbacks.restart) this.callbacks.restart();
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
