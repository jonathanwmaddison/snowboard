/**
 * FlowUI - Visual display for the carving flow system
 *
 * Design philosophy: Unobtrusive, beautiful, informative without being distracting.
 * The UI should feel like part of the mountain experience, not a game overlay.
 */

export class FlowUI {
  constructor() {
    this.container = null;
    this.flowMeter = null;
    this.scoreDisplay = null;
    this.chainDisplay = null;
    this.multiplierDisplay = null;
    this.scorePopup = null;
    this.metricsDisplay = null;

    // Zen mode hides scoring
    this.zenMode = false;

    // Animation state
    this.lastFlowLevel = 0;
    this.pulseOpacity = 0;

    this.init();
  }

  init() {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'flow-ui';
    this.container.innerHTML = `
      <style>
        #flow-ui {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          font-family: 'Segoe UI', system-ui, sans-serif;
          z-index: 100;
        }

        /* === FLOW METER (left side arc) === */
        .flow-meter {
          position: absolute;
          left: 30px;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 200px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }

        .flow-meter-fill {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top,
            rgba(100, 200, 255, 0.6) 0%,
            rgba(150, 220, 255, 0.8) 50%,
            rgba(200, 240, 255, 1.0) 100%
          );
          border-radius: 4px;
          transition: height 0.15s ease-out;
          box-shadow: 0 0 15px rgba(150, 220, 255, 0.5);
        }

        .flow-meter-glow {
          position: absolute;
          bottom: 0;
          left: -10px;
          right: -10px;
          background: radial-gradient(ellipse at center bottom,
            rgba(150, 220, 255, 0.4) 0%,
            transparent 70%
          );
          border-radius: 50%;
          pointer-events: none;
          transition: height 0.15s ease-out, opacity 0.15s;
        }

        .flow-label {
          position: absolute;
          left: 50px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.7);
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }

        /* === SCORE (top right) === */
        .score-container {
          position: absolute;
          top: 20px;
          right: 30px;
          text-align: right;
        }

        .score-value {
          font-size: 42px;
          font-weight: 200;
          color: white;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
          letter-spacing: -1px;
        }

        .score-label {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-top: -5px;
        }

        /* === CHAIN/MULTIPLIER (below score) === */
        .chain-container {
          position: absolute;
          top: 85px;
          right: 30px;
          text-align: right;
          opacity: 0;
          transform: translateX(10px);
          transition: opacity 0.3s, transform 0.3s;
        }

        .chain-container.active {
          opacity: 1;
          transform: translateX(0);
        }

        .chain-value {
          font-size: 18px;
          font-weight: 300;
          color: rgba(255, 220, 150, 0.9);
        }

        .multiplier-badge {
          display: inline-block;
          background: rgba(255, 220, 150, 0.2);
          border: 1px solid rgba(255, 220, 150, 0.4);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          color: rgba(255, 220, 150, 0.9);
          margin-left: 8px;
        }

        /* === SCORE POPUP (center, fades up) === */
        .score-popup {
          position: absolute;
          top: 35%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 28px;
          font-weight: 300;
          color: white;
          text-shadow: 0 2px 20px rgba(100, 200, 255, 0.5);
          opacity: 0;
          transition: opacity 0.2s, transform 0.5s ease-out;
          pointer-events: none;
        }

        .score-popup.show {
          opacity: 1;
          animation: scoreFloat 1.5s ease-out forwards;
        }

        @keyframes scoreFloat {
          0% {
            opacity: 0;
            transform: translate(-50%, -30%) scale(0.8);
          }
          20% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -80%) scale(1);
          }
        }

        .score-popup .bonus-text {
          display: block;
          font-size: 12px;
          color: rgba(150, 220, 255, 0.8);
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-top: 5px;
        }

        /* === CARVE METRICS (bottom left, subtle) === */
        .metrics-container {
          position: absolute;
          bottom: 30px;
          left: 30px;
          opacity: 0.6;
          transition: opacity 0.3s;
        }

        .metrics-container:hover {
          opacity: 1;
        }

        .metric-bar {
          display: flex;
          align-items: center;
          margin-bottom: 6px;
        }

        .metric-label {
          font-size: 9px;
          color: rgba(255, 255, 255, 0.5);
          width: 50px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .metric-track {
          width: 60px;
          height: 3px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          overflow: hidden;
        }

        .metric-fill {
          height: 100%;
          background: rgba(150, 200, 255, 0.6);
          border-radius: 2px;
          transition: width 0.2s ease-out;
        }

        .metric-fill.arc { background: rgba(150, 255, 200, 0.6); }
        .metric-fill.edge { background: rgba(255, 200, 150, 0.6); }
        .metric-fill.rhythm { background: rgba(200, 150, 255, 0.6); }

        /* === ZEN MODE === */
        .flow-ui.zen .score-container,
        .flow-ui.zen .chain-container,
        .flow-ui.zen .score-popup,
        .flow-ui.zen .metrics-container {
          display: none;
        }

        .flow-ui.zen .flow-meter {
          opacity: 0.5;
        }

        /* === SCREEN PULSE EFFECT === */
        .flow-pulse {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          background: radial-gradient(ellipse at center,
            rgba(150, 220, 255, 0) 0%,
            rgba(150, 220, 255, 0.05) 50%,
            rgba(150, 220, 255, 0.1) 100%
          );
          opacity: 0;
          transition: opacity 0.1s;
        }

        /* === TERRAIN SYNC INDICATOR === */
        .terrain-sync {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 100px;
          height: 100px;
          border: 2px solid rgba(255, 220, 150, 0);
          border-radius: 50%;
          pointer-events: none;
          transition: all 0.2s;
        }

        .terrain-sync.active {
          border-color: rgba(255, 220, 150, 0.4);
          box-shadow: 0 0 30px rgba(255, 220, 150, 0.3);
          animation: terrainPulse 0.5s ease-out;
        }

        @keyframes terrainPulse {
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
        }
      </style>

      <div class="flow-pulse" id="flow-pulse"></div>

      <div class="flow-meter">
        <div class="flow-meter-fill" id="flow-fill"></div>
        <div class="flow-meter-glow" id="flow-glow"></div>
      </div>
      <div class="flow-label">FLOW</div>

      <div class="score-container">
        <div class="score-value" id="score-value">0</div>
        <div class="score-label">Score</div>
      </div>

      <div class="chain-container" id="chain-container">
        <span class="chain-value"><span id="chain-value">0</span> chain</span>
        <span class="multiplier-badge" id="multiplier-badge">x1.0</span>
      </div>

      <div class="score-popup" id="score-popup">
        <span id="popup-value">+100</span>
        <span class="bonus-text" id="popup-bonus"></span>
      </div>

      <div class="metrics-container">
        <div class="metric-bar">
          <span class="metric-label">Arc</span>
          <div class="metric-track">
            <div class="metric-fill arc" id="metric-arc"></div>
          </div>
        </div>
        <div class="metric-bar">
          <span class="metric-label">Edge</span>
          <div class="metric-track">
            <div class="metric-fill edge" id="metric-edge"></div>
          </div>
        </div>
        <div class="metric-bar">
          <span class="metric-label">Rhythm</span>
          <div class="metric-track">
            <div class="metric-fill rhythm" id="metric-rhythm"></div>
          </div>
        </div>
      </div>

      <div class="terrain-sync" id="terrain-sync"></div>
    `;

    document.body.appendChild(this.container);

    // Cache element references
    this.flowFill = document.getElementById('flow-fill');
    this.flowGlow = document.getElementById('flow-glow');
    this.flowPulseEl = document.getElementById('flow-pulse');
    this.scoreValue = document.getElementById('score-value');
    this.chainContainer = document.getElementById('chain-container');
    this.chainValue = document.getElementById('chain-value');
    this.multiplierBadge = document.getElementById('multiplier-badge');
    this.scorePopup = document.getElementById('score-popup');
    this.popupValue = document.getElementById('popup-value');
    this.popupBonus = document.getElementById('popup-bonus');
    this.metricArc = document.getElementById('metric-arc');
    this.metricEdge = document.getElementById('metric-edge');
    this.metricRhythm = document.getElementById('metric-rhythm');
    this.terrainSync = document.getElementById('terrain-sync');
  }

  /**
   * Update UI with flow state
   */
  update(flowState) {
    if (this.zenMode) return;

    const {
      score,
      flowLevel,
      flowMultiplier,
      chainCount,
      arcBeauty,
      edgeCommitment,
      rhythmScore,
      flowPulse,
      showScorePopup,
      scorePopupValue,
      terrainSyncBonus
    } = flowState;

    // === FLOW METER ===
    const fillHeight = flowLevel * 100;
    this.flowFill.style.height = `${fillHeight}%`;
    this.flowGlow.style.height = `${fillHeight + 30}%`;
    this.flowGlow.style.opacity = flowLevel * 0.8;

    // === SCORE ===
    this.scoreValue.textContent = score.toLocaleString();

    // === CHAIN ===
    if (chainCount >= 2) {
      this.chainContainer.classList.add('active');
      this.chainValue.textContent = chainCount;
      this.multiplierBadge.textContent = `x${flowMultiplier.toFixed(1)}`;
    } else {
      this.chainContainer.classList.remove('active');
    }

    // === METRICS ===
    this.metricArc.style.width = `${arcBeauty * 100}%`;
    this.metricEdge.style.width = `${edgeCommitment * 100}%`;
    this.metricRhythm.style.width = `${rhythmScore * 100}%`;

    // === SCREEN PULSE ===
    this.flowPulseEl.style.opacity = flowPulse * 0.5;

    // === SCORE POPUP ===
    if (showScorePopup && scorePopupValue > 0) {
      this.popupValue.textContent = `+${scorePopupValue}`;

      // Bonus text based on quality
      let bonusText = '';
      if (terrainSyncBonus > 0.5) bonusText = 'Terrain Sync!';
      else if (flowMultiplier > 1.5) bonusText = `${flowMultiplier.toFixed(1)}x Chain!`;
      else if (arcBeauty > 0.8) bonusText = 'Clean Arc!';

      this.popupBonus.textContent = bonusText;

      // Trigger animation by removing and re-adding class
      this.scorePopup.classList.remove('show');
      void this.scorePopup.offsetWidth; // Force reflow
      this.scorePopup.classList.add('show');
    }

    // === TERRAIN SYNC ===
    if (terrainSyncBonus > 0.3) {
      this.terrainSync.classList.add('active');
      setTimeout(() => this.terrainSync.classList.remove('active'), 500);
    }
  }

  /**
   * Toggle zen mode (no scoring display)
   */
  setZenMode(enabled) {
    this.zenMode = enabled;
    if (enabled) {
      this.container.firstElementChild.classList.add('zen');
    } else {
      this.container.firstElementChild.classList.remove('zen');
    }
  }

  /**
   * Show run complete summary
   */
  showRunSummary(stats) {
    // TODO: End of run summary screen
    console.log('Run Complete:', stats);
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
