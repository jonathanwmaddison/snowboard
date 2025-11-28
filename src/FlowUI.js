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

        /* === TURN PHASE INDICATOR === */
        .phase-indicator {
          position: absolute;
          bottom: 100px;
          left: 30px;
          display: flex;
          gap: 6px;
          align-items: center;
          opacity: 0;
          transition: opacity 0.3s;
        }

        .phase-indicator.active {
          opacity: 0.8;
        }

        .phase-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          transition: all 0.15s;
        }

        .phase-dot.active {
          width: 8px;
          height: 8px;
          background: rgba(150, 220, 255, 0.9);
          box-shadow: 0 0 10px rgba(150, 220, 255, 0.6);
        }

        .phase-label {
          font-size: 9px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-left: 6px;
          min-width: 60px;
        }

        /* === G-FORCE DISPLAY === */
        .gforce-display {
          position: absolute;
          bottom: 130px;
          left: 30px;
          opacity: 0;
          transition: opacity 0.3s;
        }

        .gforce-display.active {
          opacity: 0.7;
        }

        .gforce-value {
          font-size: 18px;
          font-weight: 200;
          color: white;
        }

        .gforce-unit {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.5);
          margin-left: 2px;
        }

        /* === PERFECT CARVE FLASH === */
        .perfect-flash {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          background: radial-gradient(ellipse at center,
            rgba(255, 220, 100, 0.2) 0%,
            transparent 70%
          );
          opacity: 0;
        }

        .perfect-flash.show {
          animation: perfectPulse 0.6s ease-out;
        }

        @keyframes perfectPulse {
          0% { opacity: 0; }
          30% { opacity: 1; }
          100% { opacity: 0; }
        }

        /* === STYLE BADGE === */
        .style-badge {
          position: absolute;
          top: 120px;
          right: 30px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 2px;
          padding: 4px 10px;
          border-radius: 10px;
          opacity: 0;
          transform: translateX(10px);
          transition: all 0.3s;
        }

        .style-badge.active {
          opacity: 0.8;
          transform: translateX(0);
        }

        .style-badge.aggressive {
          color: rgba(255, 150, 150, 1);
          background: rgba(255, 150, 150, 0.15);
          border: 1px solid rgba(255, 150, 150, 0.3);
        }

        .style-badge.smooth {
          color: rgba(150, 255, 200, 1);
          background: rgba(150, 255, 200, 0.15);
          border: 1px solid rgba(150, 255, 200, 0.3);
        }

        .style-badge.technical {
          color: rgba(200, 150, 255, 1);
          background: rgba(200, 150, 255, 0.15);
          border: 1px solid rgba(200, 150, 255, 0.3);
        }

        /* === RISK METER (right side) === */
        .risk-meter {
          position: absolute;
          right: 30px;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 150px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }

        .risk-fill {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top,
            rgba(100, 255, 100, 0.8) 0%,
            rgba(255, 255, 100, 0.8) 50%,
            rgba(255, 100, 100, 0.9) 100%
          );
          border-radius: 4px;
          transition: height 0.1s ease-out;
        }

        .risk-pulse {
          position: absolute;
          bottom: 0;
          left: -5px;
          right: -5px;
          height: 100%;
          background: rgba(255, 100, 100, 0);
          border-radius: 8px;
          animation: none;
        }

        .risk-meter.danger .risk-pulse {
          animation: riskPulse 0.3s ease-in-out infinite;
        }

        @keyframes riskPulse {
          0%, 100% { background: rgba(255, 100, 100, 0); }
          50% { background: rgba(255, 100, 100, 0.4); }
        }

        .risk-label {
          position: absolute;
          right: 50px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.5);
          font-size: 9px;
          letter-spacing: 1px;
          text-transform: uppercase;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          transition: color 0.2s;
        }

        .risk-label.danger {
          color: rgba(255, 150, 150, 0.9);
        }

        /* === SNOW CONDITION INDICATOR === */
        .snow-indicator {
          position: absolute;
          bottom: 30px;
          right: 30px;
          display: flex;
          align-items: center;
          gap: 6px;
          opacity: 0;
          transform: translateX(10px);
          transition: all 0.3s;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .snow-indicator.visible {
          opacity: 0.8;
          transform: translateX(0);
        }

        .snow-indicator.ice {
          color: rgba(150, 200, 255, 1);
        }

        .snow-indicator.powder {
          color: rgba(255, 255, 255, 1);
        }

        .snow-indicator.slush {
          color: rgba(200, 200, 220, 1);
        }

        .snow-icon {
          font-size: 14px;
        }

        /* === GATE CHALLENGE DISPLAY === */
        .gate-display {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -150%);
          text-align: center;
          opacity: 0;
          transition: opacity 0.3s;
        }

        .gate-display.active {
          opacity: 1;
        }

        .gate-timer {
          font-size: 32px;
          font-weight: 200;
          color: white;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
          font-variant-numeric: tabular-nums;
        }

        .gate-count {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.7);
          margin-top: 4px;
        }

        .gate-status {
          font-size: 12px;
          margin-top: 8px;
          padding: 4px 12px;
          border-radius: 12px;
          display: inline-block;
        }

        .gate-status.cleared {
          color: rgba(100, 255, 150, 1);
          background: rgba(100, 255, 150, 0.2);
        }

        .gate-status.missed {
          color: rgba(255, 100, 100, 1);
          background: rgba(255, 100, 100, 0.2);
        }

        .gate-status.perfect {
          color: rgba(255, 220, 100, 1);
          background: rgba(255, 220, 100, 0.2);
          animation: perfectGlow 0.5s ease-out;
        }

        @keyframes perfectGlow {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      </style>

      <div class="flow-pulse" id="flow-pulse"></div>
      <div class="perfect-flash" id="perfect-flash"></div>

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

      <div class="phase-indicator" id="phase-indicator">
        <div class="phase-dot" id="phase-init"></div>
        <div class="phase-dot" id="phase-load"></div>
        <div class="phase-dot" id="phase-apex"></div>
        <div class="phase-dot" id="phase-unload"></div>
        <span class="phase-label" id="phase-label">neutral</span>
      </div>

      <div class="gforce-display" id="gforce-display">
        <span class="gforce-value" id="gforce-value">1.0</span>
        <span class="gforce-unit">G</span>
      </div>

      <div class="style-badge" id="style-badge">smooth</div>

      <div class="risk-meter" id="risk-meter">
        <div class="risk-fill" id="risk-fill"></div>
        <div class="risk-pulse" id="risk-pulse"></div>
      </div>
      <div class="risk-label" id="risk-label">GRIP</div>

      <div class="snow-indicator" id="snow-indicator">
        <span class="snow-icon" id="snow-icon"></span>
        <span class="snow-text" id="snow-text">GROOMED</span>
      </div>

      <div class="gate-display" id="gate-display">
        <div class="gate-timer" id="gate-timer">0:00.00</div>
        <div class="gate-count" id="gate-count">0/0</div>
        <div class="gate-status" id="gate-status"></div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Cache element references
    this.flowFill = document.getElementById('flow-fill');
    this.flowGlow = document.getElementById('flow-glow');
    this.flowPulseEl = document.getElementById('flow-pulse');
    this.perfectFlash = document.getElementById('perfect-flash');
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
    this.phaseIndicator = document.getElementById('phase-indicator');
    this.phaseInit = document.getElementById('phase-init');
    this.phaseLoad = document.getElementById('phase-load');
    this.phaseApex = document.getElementById('phase-apex');
    this.phaseUnload = document.getElementById('phase-unload');
    this.phaseLabel = document.getElementById('phase-label');
    this.gforceDisplay = document.getElementById('gforce-display');
    this.gforceValue = document.getElementById('gforce-value');
    this.styleBadge = document.getElementById('style-badge');

    // Risk meter elements
    this.riskMeter = document.getElementById('risk-meter');
    this.riskFill = document.getElementById('risk-fill');
    this.riskLabel = document.getElementById('risk-label');

    // Snow condition elements
    this.snowIndicator = document.getElementById('snow-indicator');
    this.snowIcon = document.getElementById('snow-icon');
    this.snowText = document.getElementById('snow-text');

    // Gate display elements
    this.gateDisplay = document.getElementById('gate-display');
    this.gateTimer = document.getElementById('gate-timer');
    this.gateCount = document.getElementById('gate-count');
    this.gateStatus = document.getElementById('gate-status');

    // Track last perfect state for flash trigger
    this.wasPerfect = false;

    // Last gate status for animation
    this.lastGateCleared = 0;
    this.lastGateMissed = 0;
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

    // === TURN PHASE (from CarveAnalyzer) ===
    const turnPhase = flowState.turnPhase || 'neutral';
    const gForce = flowState.gForce || 1.0;
    const isPerfect = flowState.isPerfect || false;
    const carveStyle = flowState.carveStyle || 'smooth';

    // Show phase indicator when in a turn
    if (turnPhase !== 'neutral') {
      this.phaseIndicator.classList.add('active');
      this.phaseLabel.textContent = turnPhase;

      // Light up the appropriate phase dot
      this.phaseInit.classList.toggle('active', turnPhase === 'initiation');
      this.phaseLoad.classList.toggle('active', turnPhase === 'loading');
      this.phaseApex.classList.toggle('active', turnPhase === 'apex');
      this.phaseUnload.classList.toggle('active', turnPhase === 'unloading');
    } else {
      this.phaseIndicator.classList.remove('active');
    }

    // === G-FORCE DISPLAY ===
    if (gForce > 1.2) {
      this.gforceDisplay.classList.add('active');
      this.gforceValue.textContent = gForce.toFixed(1);
    } else {
      this.gforceDisplay.classList.remove('active');
    }

    // === PERFECT CARVE FLASH ===
    if (isPerfect && !this.wasPerfect) {
      this.perfectFlash.classList.remove('show');
      void this.perfectFlash.offsetWidth;
      this.perfectFlash.classList.add('show');
    }
    this.wasPerfect = isPerfect;

    // === STYLE BADGE ===
    if (turnPhase !== 'neutral' && carveStyle) {
      this.styleBadge.classList.add('active');
      this.styleBadge.textContent = carveStyle;
      this.styleBadge.className = 'style-badge active ' + carveStyle;
    } else {
      this.styleBadge.classList.remove('active');
    }

    // === RISK METER ===
    const riskLevel = flowState.riskLevel || 0;
    if (this.riskFill) {
      this.riskFill.style.height = `${riskLevel * 100}%`;

      // Danger state at high risk
      if (riskLevel > 0.7) {
        this.riskMeter.classList.add('danger');
        this.riskLabel.classList.add('danger');
        this.riskLabel.textContent = 'DANGER';
      } else if (riskLevel > 0.4) {
        this.riskMeter.classList.remove('danger');
        this.riskLabel.classList.remove('danger');
        this.riskLabel.textContent = 'CAUTION';
      } else {
        this.riskMeter.classList.remove('danger');
        this.riskLabel.classList.remove('danger');
        this.riskLabel.textContent = 'GRIP';
      }
    }

    // === SNOW CONDITION ===
    const snowCondition = flowState.snowCondition || { type: 'groomed', intensity: 0 };
    if (this.snowIndicator) {
      if (snowCondition.type !== 'groomed' && snowCondition.intensity > 0.2) {
        this.snowIndicator.classList.add('visible');
        this.snowIndicator.className = 'snow-indicator visible ' + snowCondition.type;

        switch (snowCondition.type) {
          case 'ice':
            this.snowText.textContent = 'ICE';
            break;
          case 'powder':
            this.snowText.textContent = 'POWDER';
            break;
          case 'slush':
            this.snowText.textContent = 'SLUSH';
            break;
        }
      } else {
        this.snowIndicator.classList.remove('visible');
      }
    }

    // === GATE DISPLAY ===
    const gateState = flowState.gateState;
    if (this.gateDisplay && gateState) {
      if (gateState.isRunning || gateState.totalGates > 0) {
        this.gateDisplay.classList.add('active');

        // Timer
        const minutes = Math.floor(gateState.elapsedTime / 60);
        const seconds = gateState.elapsedTime % 60;
        this.gateTimer.textContent = `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;

        // Gate count
        this.gateCount.textContent = `${gateState.gatesCleared}/${gateState.totalGates}`;

        // Status updates on gate events
        if (gateState.gatesCleared > this.lastGateCleared) {
          this.gateStatus.textContent = 'CLEARED';
          this.gateStatus.className = 'gate-status cleared';
          this.lastGateCleared = gateState.gatesCleared;
        } else if (gateState.gatesMissed > this.lastGateMissed) {
          this.gateStatus.textContent = 'MISSED';
          this.gateStatus.className = 'gate-status missed';
          this.lastGateMissed = gateState.gatesMissed;
        }

        // Course complete
        if (!gateState.isRunning && gateState.currentGate >= gateState.totalGates) {
          if (gateState.gatesMissed === 0) {
            this.gateStatus.textContent = 'PERFECT!';
            this.gateStatus.className = 'gate-status perfect';
          }
        }
      } else {
        this.gateDisplay.classList.remove('active');
        this.lastGateCleared = 0;
        this.lastGateMissed = 0;
      }
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
