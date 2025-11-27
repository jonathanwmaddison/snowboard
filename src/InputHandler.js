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
      toggleFreeCamera: null
    };

    // Gamepad state
    this.gamepadIndex = null;

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

    // Send continuous input updates
    if (this.callbacks.steer) this.callbacks.steer(steer);
    if (this.callbacks.lean) this.callbacks.lean(lean);
  }

  setCallback(action, callback) {
    this.callbacks[action] = callback;
  }
}
