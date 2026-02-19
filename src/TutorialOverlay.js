import './tutorial.css';

/**
 * TutorialOverlay - Welcome screen + toggleable help menu
 *
 * Shows a welcome tutorial on first load (per session).
 * Provides a help menu toggled with H key.
 */
export class TutorialOverlay {
  constructor() {
    this.tutorialEl = null;
    this.helpEl = null;
    this.helpHintEl = null;
    this.onDismiss = null;
    this.helpVisible = false;

    this._createTutorial();
    this._createHelp();
    this._createHelpHint();
  }

  // --- Tutorial (welcome screen) ---

  _createTutorial() {
    this.tutorialEl = document.createElement('div');
    this.tutorialEl.className = 'tutorial-overlay hidden';
    this.tutorialEl.innerHTML = `
      <div class="tutorial-title">Snowboard</div>
      <div class="tutorial-tagline">Carve deep. Chain turns. Find flow.</div>
      <div class="tutorial-controls">
        <div class="tutorial-column">
          <div class="tutorial-column-title">Movement</div>
          <div class="tutorial-row"><span class="tutorial-key">A / D</span><span class="tutorial-action">Turn (heel / toe)</span></div>
          <div class="tutorial-row"><span class="tutorial-key">W / S</span><span class="tutorial-action">Tuck / brake</span></div>
          <div class="tutorial-row"><span class="tutorial-key">Space</span><span class="tutorial-action">Jump (hold to charge)</span></div>
          <div class="tutorial-row"><span class="tutorial-key">R</span><span class="tutorial-action">Reset rider</span></div>
          <div class="tutorial-row"><span class="tutorial-key">H</span><span class="tutorial-action">Toggle help menu</span></div>
        </div>
        <div class="tutorial-column">
          <div class="tutorial-column-title">Camera & View</div>
          <div class="tutorial-row"><span class="tutorial-key">V</span><span class="tutorial-action">Toggle camera v1 / v2</span></div>
          <div class="tutorial-row"><span class="tutorial-key">C</span><span class="tutorial-action">Cycle v2 camera mode</span></div>
          <div class="tutorial-row"><span class="tutorial-key">U</span><span class="tutorial-action">FPS mode</span></div>
          <div class="tutorial-row"><span class="tutorial-key">Z</span><span class="tutorial-action">Zen mode (hide UI)</span></div>
          <div class="tutorial-row"><span class="tutorial-key">M</span><span class="tutorial-action">Toggle player model</span></div>
        </div>
        <div class="tutorial-column">
          <div class="tutorial-column-title">Modes & Toggles</div>
          <div class="tutorial-row"><span class="tutorial-key">P</span><span class="tutorial-action">Physics version</span></div>
          <div class="tutorial-row"><span class="tutorial-key">T</span><span class="tutorial-action">Board / ski mode</span></div>
          <div class="tutorial-row"><span class="tutorial-key">F</span><span class="tutorial-action">Flying / place block</span></div>
          <div class="tutorial-row"><span class="tutorial-key">B</span><span class="tutorial-action">Walking mode</span></div>
          <div class="tutorial-row"><span class="tutorial-key">N</span><span class="tutorial-action">Minecraft mode</span></div>
          <div class="tutorial-row"><span class="tutorial-key">Q / X</span><span class="tutorial-action">Crafting / build mode</span></div>
          <div class="tutorial-row"><span class="tutorial-key">1-9</span><span class="tutorial-action">Hotbar slots (Minecraft)</span></div>
          <div class="tutorial-row"><span class="tutorial-key">E</span><span class="tutorial-action">Interact</span></div>
          <div class="tutorial-row"><span class="tutorial-key">G</span><span class="tutorial-action">Start gate challenge</span></div>
          <div class="tutorial-row"><span class="tutorial-key">Y</span><span class="tutorial-action">Trigger avalanche</span></div>
        </div>
        <div class="tutorial-column">
          <div class="tutorial-column-title">Gamepad & Touch</div>
          <div class="tutorial-row"><span class="tutorial-key">L Stick</span><span class="tutorial-action">Steer / lean</span></div>
          <div class="tutorial-row"><span class="tutorial-key">R Stick</span><span class="tutorial-action">Camera (R3 reset)</span></div>
          <div class="tutorial-row"><span class="tutorial-key">A</span><span class="tutorial-action">Jump</span></div>
          <div class="tutorial-row"><span class="tutorial-key">B</span><span class="tutorial-action">Restart</span></div>
          <div class="tutorial-row"><span class="tutorial-key">LB / RB</span><span class="tutorial-action">Camera toggle / mode</span></div>
          <div class="tutorial-row"><span class="tutorial-key">Drag</span><span class="tutorial-action">Steer</span></div>
          <div class="tutorial-row"><span class="tutorial-key">2-finger</span><span class="tutorial-action">Jump</span></div>
        </div>
      </div>
      <div class="tutorial-prompt">Press any key to start. Press H anytime for full controls.</div>
    `;
    document.body.appendChild(this.tutorialEl);
  }

  /**
   * Show the tutorial overlay.
   * @param {Function} onDismiss - Called once when the tutorial is dismissed
   */
  show(onDismiss) {
    if (sessionStorage.getItem('snowboard-tutorial-dismissed')) {
      // Already dismissed this session — skip
      this._setHelpHintVisible(true);
      if (onDismiss) onDismiss();
      return;
    }

    this.onDismiss = onDismiss;
    this.tutorialEl.classList.remove('hidden');
    this._setHelpHintVisible(false);

    // Bind dismiss handlers
    this._dismissHandler = () => this.dismiss();
    window.addEventListener('keydown', this._dismissHandler, { once: true });
    this.tutorialEl.addEventListener('click', this._dismissHandler, { once: true });
    window.addEventListener('gamepadconnected', this._dismissHandler, { once: true });
  }

  dismiss() {
    if (this.tutorialEl.classList.contains('hidden')) return;
    this.tutorialEl.classList.add('hidden');
    sessionStorage.setItem('snowboard-tutorial-dismissed', '1');
    this._setHelpHintVisible(true);

    // Clean up any remaining listeners
    window.removeEventListener('keydown', this._dismissHandler);
    this.tutorialEl.removeEventListener('click', this._dismissHandler);
    window.removeEventListener('gamepadconnected', this._dismissHandler);

    // After fade-out transition completes, call the callback
    setTimeout(() => {
      if (this.onDismiss) {
        this.onDismiss();
        this.onDismiss = null;
      }
    }, 400);
  }

  // --- Help menu (H key toggle) ---

  _createHelp() {
    this.helpEl = document.createElement('div');
    this.helpEl.className = 'help-overlay hidden';
    this.helpEl.innerHTML = `
      <div class="help-panel">
        <div class="help-header">
          <div class="help-title">Controls</div>
          <div class="help-close">H to close</div>
        </div>
        <div class="help-columns">
          <div class="help-column">
            <div class="help-section-title">Movement</div>
            <div class="help-row"><span class="help-key">A / D</span><span class="help-action">Turn (heel / toe edge)</span></div>
            <div class="help-row"><span class="help-key">← / →</span><span class="help-action">Turn (arrow keys)</span></div>
            <div class="help-row"><span class="help-key">W</span><span class="help-action">Tuck / lean forward</span></div>
            <div class="help-row"><span class="help-key">S</span><span class="help-action">Brake / lean back</span></div>
            <div class="help-row"><span class="help-key">Space</span><span class="help-action">Jump (hold to charge)</span></div>
            <div class="help-row"><span class="help-key">R</span><span class="help-action">Reset position</span></div>

            <div class="help-section-title">Air Controls</div>
            <div class="help-row"><span class="help-key">A / D</span><span class="help-action">Spin</span></div>
            <div class="help-row"><span class="help-key">W</span><span class="help-action">Front flip</span></div>
            <div class="help-row"><span class="help-key">S</span><span class="help-action">Back flip</span></div>
          </div>
          <div class="help-column">
            <div class="help-section-title">Gamepad</div>
            <div class="help-row"><span class="help-key">L Stick</span><span class="help-action">Steer / lean</span></div>
            <div class="help-row"><span class="help-key">R Stick</span><span class="help-action">Camera orbit</span></div>
            <div class="help-row"><span class="help-key">R3</span><span class="help-action">Reset camera</span></div>
            <div class="help-row"><span class="help-key">A</span><span class="help-action">Jump</span></div>
            <div class="help-row"><span class="help-key">B</span><span class="help-action">Restart</span></div>
            <div class="help-row"><span class="help-key">Y</span><span class="help-action">Zen mode</span></div>
            <div class="help-row"><span class="help-key">Start</span><span class="help-action">Gate challenge</span></div>
            <div class="help-row"><span class="help-key">LB / RB</span><span class="help-action">Camera toggle / mode</span></div>

            <div class="help-section-title">Touch</div>
            <div class="help-row"><span class="help-key">Drag</span><span class="help-action">Steer / lean</span></div>
            <div class="help-row"><span class="help-key">2-finger</span><span class="help-action">Jump</span></div>
          </div>
          <div class="help-column">
            <div class="help-section-title">Camera</div>
            <div class="help-row"><span class="help-key">V</span><span class="help-action">Toggle camera version</span></div>
            <div class="help-row"><span class="help-key">C</span><span class="help-action">Cycle camera mode</span></div>
            <div class="help-row"><span class="help-key">U</span><span class="help-action">FPS mode</span></div>
            <div class="help-row"><span class="help-key">M</span><span class="help-action">Toggle rider model</span></div>

            <div class="help-section-title">Toggles</div>
            <div class="help-row"><span class="help-key">P</span><span class="help-action">Physics (v1 / v2)</span></div>
            <div class="help-row"><span class="help-key">T</span><span class="help-action">Sport (board / ski)</span></div>
            <div class="help-row"><span class="help-key">F</span><span class="help-action">Flying mode</span></div>
            <div class="help-row"><span class="help-key">B</span><span class="help-action">Walking mode</span></div>
            <div class="help-row"><span class="help-key">N</span><span class="help-action">Minecraft mode</span></div>
            <div class="help-row"><span class="help-key">Q / X</span><span class="help-action">Crafting / build mode</span></div>
            <div class="help-row"><span class="help-key">F</span><span class="help-action">Place block (build mode)</span></div>
            <div class="help-row"><span class="help-key">1-9</span><span class="help-action">Hotbar select (Minecraft)</span></div>
            <div class="help-row"><span class="help-key">E</span><span class="help-action">Interact</span></div>
            <div class="help-row"><span class="help-key">Z</span><span class="help-action">Zen mode (hide UI)</span></div>
            <div class="help-row"><span class="help-key">G</span><span class="help-action">Gate challenge</span></div>
            <div class="help-row"><span class="help-key">Y</span><span class="help-action">Trigger avalanche</span></div>
            <div class="help-row"><span class="help-key">1 / 2</span><span class="help-action">Wireframe / colliders</span></div>
            <div class="help-row"><span class="help-key">H</span><span class="help-action">This help menu</span></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.helpEl);

    // Click close button or outside the panel to dismiss
    this.helpEl.querySelector('.help-close').addEventListener('click', () => this.hideHelp());
    this.helpEl.addEventListener('click', (e) => {
      if (e.target === this.helpEl) this.hideHelp();
    });
  }

  _createHelpHint() {
    this.helpHintEl = document.createElement('button');
    this.helpHintEl.type = 'button';
    this.helpHintEl.className = 'help-hotkey hidden';
    this.helpHintEl.textContent = 'H Help';
    this.helpHintEl.setAttribute('aria-label', 'Toggle controls help');
    this.helpHintEl.addEventListener('click', () => this.toggleHelp());
    document.body.appendChild(this.helpHintEl);
  }

  _setHelpHintVisible(visible) {
    if (!this.helpHintEl) return;
    this.helpHintEl.classList.toggle('hidden', !visible);
  }

  showHelp() {
    this.helpVisible = true;
    this.helpEl.classList.remove('hidden');
    if (this.helpHintEl) this.helpHintEl.textContent = 'H Close';
  }

  hideHelp() {
    this.helpVisible = false;
    this.helpEl.classList.add('hidden');
    if (this.helpHintEl) this.helpHintEl.textContent = 'H Help';
  }

  toggleHelp() {
    if (this.helpVisible) {
      this.hideHelp();
    } else {
      this.showHelp();
    }
  }
}
