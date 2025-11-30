/**
 * FlowUI - Visual display for the carving flow system
 *
 * Design philosophy: Unobtrusive, beautiful, informative without being distracting.
 * The UI should feel like part of the mountain experience, not a game overlay.
 */

// Import CSS styles (Vite will handle bundling)
import './flow-ui.css';

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

      <div class="balance-meter" id="balance-meter">
        <div class="balance-crosshair"></div>
        <div class="balance-dot" id="balance-dot"></div>
        <div class="balance-labels">
          <span class="lbl-fwd">FWD</span>
          <span class="lbl-back">BACK</span>
          <span class="lbl-heel">HEEL</span>
          <span class="lbl-toe">TOE</span>
        </div>
        <div class="balance-label">BALANCE</div>
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

    // Balance meter elements
    this.balanceMeter = document.getElementById('balance-meter');
    this.balanceDot = document.getElementById('balance-dot');

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

    // === BALANCE METER ===
    if (this.balanceDot) {
      // Get steer and lean values from flowState (-1 to 1)
      const steer = flowState.steer || 0;  // Left/right (heel/toe edge)
      const lean = flowState.lean || 0;    // Forward/back

      // Convert to percentage position within the circle
      // Center is 50%, range is 10% to 90% (leaving padding)
      const x = 50 + (steer * 40);  // steer: -1 = 10%, 0 = 50%, 1 = 90%
      const y = 50 - (lean * 40);   // lean: -1 = 90%, 0 = 50%, 1 = 10% (inverted)

      this.balanceDot.style.left = `${x}%`;
      this.balanceDot.style.top = `${y}%`;

      // Color the dot based on edge angle
      if (steer < -0.3) {
        this.balanceDot.classList.add('edge-left');
        this.balanceDot.classList.remove('edge-right');
      } else if (steer > 0.3) {
        this.balanceDot.classList.add('edge-right');
        this.balanceDot.classList.remove('edge-left');
      } else {
        this.balanceDot.classList.remove('edge-left', 'edge-right');
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
