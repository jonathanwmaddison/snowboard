export class UIOverlay {
  constructor() {
    this.speedElement = document.getElementById('speed');
    this.fpsElement = document.getElementById('fps');
    this.restartBtn = document.getElementById('restart-btn');

    // FPS tracking
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.currentFps = 60;

    // Callbacks
    this.onRestart = null;
  }

  init(onRestart) {
    this.onRestart = onRestart;
    this.restartBtn.addEventListener('click', () => {
      if (this.onRestart) this.onRestart();
    });
  }

  update(speedKmh) {
    // Update speed
    this.speedElement.textContent = `Speed: ${Math.round(speedKmh)} km/h`;

    // Update FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.fpsElement.textContent = `FPS: ${this.currentFps}`;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }
}
