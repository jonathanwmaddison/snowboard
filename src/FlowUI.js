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

      <div class="risk-vignette" id="risk-vignette"></div>
      <div class="edge-catch-flash" id="edge-catch-flash"></div>
      <div class="timing-indicator" id="timing-indicator">
        <span class="timing-text" id="timing-text">PERFECT</span>
      </div>
      <div class="timing-burst" id="timing-burst">
        <div class="timing-burst-ring ring-1"></div>
        <div class="timing-burst-ring ring-2"></div>
        <div class="timing-burst-ring ring-3"></div>
        <div class="timing-burst-center"></div>
      </div>
      <div class="chain-celebration" id="chain-celebration"></div>

      <div class="air-trick-display" id="air-trick-display">
        <div class="trick-rotation" id="trick-rotation">360</div>
        <div class="trick-name" id="trick-name">SPIN</div>
      </div>

      <div class="landing-score" id="landing-score">
        <span class="landing-text" id="landing-text">CLEAN</span>
        <span class="landing-bonus" id="landing-bonus">+150</span>
      </div>

      <div class="speed-lines" id="speed-lines"></div>

      <div class="flex-meter" id="flex-meter">
        <div class="flex-fill" id="flex-fill"></div>
        <div class="flex-label">FLEX</div>
      </div>

      <div class="flow-zone-effect" id="flow-zone-effect"></div>
      <div class="edge-warning" id="edge-warning"></div>
      <div class="gforce-intensity" id="gforce-intensity"></div>
      <div class="flex-release-burst" id="flex-release-burst"></div>
      <div class="avalanche-warning" id="avalanche-warning"></div>
      <div class="jump-charge-indicator" id="jump-charge-indicator">
        <div class="jump-charge-ring" id="jump-charge-ring"></div>
        <div class="jump-charge-fill" id="jump-charge-fill"></div>
        <div class="jump-charge-icon">↑</div>
      </div>
      <div class="landing-shake-container" id="landing-shake-container"></div>
      <div class="landing-impact-flash" id="landing-impact-flash"></div>
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

    // New feedback elements
    this.riskVignette = document.getElementById('risk-vignette');
    this.edgeCatchFlash = document.getElementById('edge-catch-flash');
    this.timingIndicator = document.getElementById('timing-indicator');
    this.timingText = document.getElementById('timing-text');
    this.timingBurst = document.getElementById('timing-burst');
    this.chainCelebration = document.getElementById('chain-celebration');

    // Air trick elements
    this.airTrickDisplay = document.getElementById('air-trick-display');
    this.trickRotation = document.getElementById('trick-rotation');
    this.trickName = document.getElementById('trick-name');
    this.landingScore = document.getElementById('landing-score');
    this.landingText = document.getElementById('landing-text');
    this.landingBonus = document.getElementById('landing-bonus');

    // Speed lines
    this.speedLines = document.getElementById('speed-lines');

    // Flex meter
    this.flexMeter = document.getElementById('flex-meter');
    this.flexFill = document.getElementById('flex-fill');

    // New visual effect elements
    this.flowZoneEffect = document.getElementById('flow-zone-effect');
    this.edgeWarning = document.getElementById('edge-warning');
    this.gforceIntensity = document.getElementById('gforce-intensity');
    this.flexReleaseBurst = document.getElementById('flex-release-burst');
    this.avalancheWarning = document.getElementById('avalanche-warning');

    // Jump charge elements
    this.jumpChargeIndicator = document.getElementById('jump-charge-indicator');
    this.jumpChargeFill = document.getElementById('jump-charge-fill');
    this.jumpChargeRing = document.getElementById('jump-charge-ring');

    // Landing shake elements
    this.landingShakeContainer = document.getElementById('landing-shake-container');
    this.landingImpactFlash = document.getElementById('landing-impact-flash');

    // Track last perfect state for flash trigger
    this.wasPerfect = false;

    // Last gate status for animation
    this.lastGateCleared = 0;
    this.lastGateMissed = 0;

    // Last chain count for celebration trigger
    this.lastChainCount = 0;

    // Edge catch tracking
    this.wasEdgeCaught = false;

    // Flex energy tracking for release burst
    this.lastFlexEnergy = 0;

    // Air trick tracking
    this.wasAirborne = false;
    this.accumulatedSpin = 0;
    this.accumulatedFlip = 0;
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

    // === RISK VIGNETTE (screen edge darkening) ===
    if (this.riskVignette) {
      if (riskLevel > 0.4) {
        const vignetteIntensity = (riskLevel - 0.4) / 0.6; // 0 to 1
        const opacity = vignetteIntensity * 0.6;
        const spread = 30 - vignetteIntensity * 15; // Vignette spreads inward
        this.riskVignette.style.opacity = opacity;
        this.riskVignette.style.boxShadow = `inset 0 0 ${spread}vw ${spread * 0.5}vw rgba(180, 30, 30, 0.8)`;

        // Pulse effect at high risk
        if (riskLevel > 0.7) {
          const pulse = Math.sin(Date.now() * 0.008) * 0.2 + 0.8;
          this.riskVignette.style.opacity = opacity * pulse;
        }
      } else {
        this.riskVignette.style.opacity = 0;
      }
    }

    // === EDGE CATCH FLASH ===
    const isEdgeCaught = flowState.isEdgeCaught || false;
    if (this.edgeCatchFlash) {
      if (isEdgeCaught && !this.wasEdgeCaught) {
        this.edgeCatchFlash.classList.remove('show');
        void this.edgeCatchFlash.offsetWidth;
        this.edgeCatchFlash.classList.add('show');
      }
      this.wasEdgeCaught = isEdgeCaught;
    }

    // === CHAIN CELEBRATION ===
    const currentChain = chainCount || 0;
    if (this.chainCelebration && currentChain > this.lastChainCount && currentChain >= 3) {
      this.chainCelebration.classList.remove('show');
      void this.chainCelebration.offsetWidth;
      this.chainCelebration.classList.add('show');
      this.chainCelebration.textContent = `${currentChain}x CHAIN!`;

      // Different colors for chain milestones
      if (currentChain >= 8) {
        this.chainCelebration.style.color = '#ff0';
      } else if (currentChain >= 5) {
        this.chainCelebration.style.color = '#0ff';
      } else {
        this.chainCelebration.style.color = '#0f0';
      }
    }
    this.lastChainCount = currentChain;

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
   * Show timing feedback for edge transitions
   * @param {number} timingMultiplier - Timing quality (0.4-1.175)
   */
  showTimingFeedback(timingMultiplier) {
    if (this.zenMode || !this.timingIndicator) return;

    let text = '';
    let cssClass = '';

    if (timingMultiplier >= 1.1) {
      text = 'PERFECT!';
      cssClass = 'perfect';
    } else if (timingMultiplier >= 0.95) {
      text = 'GREAT';
      cssClass = 'good';
    } else if (timingMultiplier >= 0.7) {
      text = 'GOOD';
      cssClass = 'good';
    } else if (timingMultiplier < 0.5) {
      text = 'TOO FAST';
      cssClass = 'early';
    } else {
      // Don't show anything for mediocre timing
      return;
    }

    this.timingText.textContent = text;
    this.timingIndicator.className = 'timing-indicator ' + cssClass;

    // Trigger animation
    this.timingIndicator.classList.remove('show');
    void this.timingIndicator.offsetWidth;
    this.timingIndicator.classList.add('show');

    // Trigger visual burst effect for perfect and great timing
    if (timingMultiplier >= 0.95 && this.timingBurst) {
      this.triggerTimingBurst(timingMultiplier);
    }
  }

  /**
   * Trigger visual burst effect for great timing
   * @param {number} timingMultiplier - Timing quality
   */
  triggerTimingBurst(timingMultiplier) {
    if (!this.timingBurst) return;

    // Remove any existing animation
    this.timingBurst.classList.remove('show', 'perfect', 'great');
    void this.timingBurst.offsetWidth; // Force reflow

    // Add intensity class based on timing quality
    if (timingMultiplier >= 1.1) {
      this.timingBurst.classList.add('perfect');
    } else {
      this.timingBurst.classList.add('great');
    }

    // Trigger animation
    this.timingBurst.classList.add('show');
  }

  /**
   * Trigger edge catch visual feedback
   */
  triggerEdgeCatchFlash() {
    if (!this.edgeCatchFlash) return;
    this.edgeCatchFlash.classList.remove('show');
    void this.edgeCatchFlash.offsetWidth;
    this.edgeCatchFlash.classList.add('show');
  }

  /**
   * Update air trick display
   * @param {boolean} isAirborne - Whether player is in the air
   * @param {number} spinDegrees - Current spin rotation in degrees
   * @param {number} flipDegrees - Current flip rotation in degrees
   * @param {number} airTime - Time in air
   */
  updateAirTrick(isAirborne, spinDegrees, flipDegrees, airTime) {
    if (!this.airTrickDisplay) return;

    if (isAirborne && airTime > 0.2) {
      // Accumulate rotation
      this.accumulatedSpin += Math.abs(spinDegrees);
      this.accumulatedFlip += Math.abs(flipDegrees);

      // Round to nearest 180 for display
      const displaySpin = Math.floor(this.accumulatedSpin / 180) * 180;
      const displayFlip = Math.floor(this.accumulatedFlip / 180) * 180;

      // Build trick name
      let trickName = '';
      if (displayFlip >= 360) {
        trickName = displayFlip >= 720 ? 'DOUBLE FLIP' : 'FLIP';
      } else if (displayFlip >= 180) {
        trickName = 'RODEO';
      }

      if (displaySpin >= 180) {
        if (displaySpin >= 1080) trickName = '1080' + (trickName ? ' ' + trickName : '');
        else if (displaySpin >= 720) trickName = '720' + (trickName ? ' ' + trickName : '');
        else if (displaySpin >= 540) trickName = '540' + (trickName ? ' ' + trickName : '');
        else if (displaySpin >= 360) trickName = '360' + (trickName ? ' ' + trickName : '');
        else trickName = '180' + (trickName ? ' ' + trickName : '');
      }

      if (trickName) {
        this.trickRotation.textContent = displaySpin > 0 ? displaySpin + '°' : '';
        this.trickName.textContent = trickName;
        this.airTrickDisplay.classList.add('show');
      }

      this.wasAirborne = true;
    } else if (!isAirborne && this.wasAirborne) {
      // Just landed - hide after delay
      setTimeout(() => {
        this.airTrickDisplay.classList.remove('show');
      }, 1500);
      this.wasAirborne = false;
    }
  }

  /**
   * Reset air trick tracking (call on takeoff)
   */
  resetAirTrick() {
    this.accumulatedSpin = 0;
    this.accumulatedFlip = 0;
  }

  /**
   * Show landing score popup
   * @param {string} quality - 'perfect', 'clean', 'sketchy', 'crash'
   * @param {number} points - Points earned
   */
  showLandingScore(quality, points) {
    if (!this.landingScore || this.zenMode) return;

    const qualityText = {
      perfect: 'STOMPED!',
      clean: 'CLEAN',
      sketchy: 'SKETCHY',
      crash: 'CRASH'
    };

    const qualityClass = {
      perfect: 'perfect',
      clean: 'clean',
      sketchy: 'sketchy',
      crash: 'crash'
    };

    this.landingText.textContent = qualityText[quality] || 'LANDED';
    this.landingBonus.textContent = points > 0 ? `+${points}` : '';
    this.landingScore.className = 'landing-score ' + (qualityClass[quality] || '');

    this.landingScore.classList.remove('show');
    void this.landingScore.offsetWidth;
    this.landingScore.classList.add('show');
  }

  /**
   * Update speed lines effect
   * @param {number} speed - Current speed (0-100+)
   */
  updateSpeedLines(speed) {
    if (!this.speedLines) return;

    const threshold = 40; // Speed at which lines start appearing
    const maxSpeed = 80;

    if (speed > threshold) {
      const intensity = Math.min((speed - threshold) / (maxSpeed - threshold), 1);
      this.speedLines.style.opacity = intensity * 0.5;
      this.speedLines.classList.add('active');
    } else {
      this.speedLines.style.opacity = 0;
      this.speedLines.classList.remove('active');
    }
  }

  /**
   * Update flex meter
   * @param {number} flexEnergy - Current flex energy (0-1)
   * @param {number} boardFlex - Current board flex amount
   */
  updateFlexMeter(flexEnergy, boardFlex) {
    if (!this.flexFill) return;

    const displayFlex = Math.max(flexEnergy, boardFlex * 0.5);

    if (displayFlex > 0.1) {
      this.flexMeter.classList.add('active');
      this.flexFill.style.height = `${displayFlex * 100}%`;

      // Glow when charged
      if (flexEnergy > 0.5) {
        this.flexFill.classList.add('charged');
      } else {
        this.flexFill.classList.remove('charged');
      }
    } else {
      this.flexMeter.classList.remove('active');
    }
  }

  /**
   * Show run complete summary
   */
  showRunSummary(stats) {
    // TODO: End of run summary screen
    console.log('Run Complete:', stats);
  }

  /**
   * Update flow zone visual effect
   * @param {number} flowLevel - Current flow level (0-1)
   */
  updateFlowZone(flowLevel) {
    if (!this.flowZoneEffect || this.zenMode) return;

    if (flowLevel > 0.5) {
      this.flowZoneEffect.classList.add('active');
      if (flowLevel > 0.8) {
        this.flowZoneEffect.classList.add('high');
      } else {
        this.flowZoneEffect.classList.remove('high');
      }
    } else {
      this.flowZoneEffect.classList.remove('active', 'high');
    }
  }

  /**
   * Update edge warning visual (pre-edge-catch warning)
   * @param {number} riskLevel - Current risk level (0-1)
   */
  updateEdgeWarning(riskLevel) {
    if (!this.edgeWarning) return;

    if (riskLevel > 0.7) {
      this.edgeWarning.classList.add('active');
      if (riskLevel > 0.85) {
        this.edgeWarning.classList.add('danger');
      } else {
        this.edgeWarning.classList.remove('danger');
      }
    } else {
      this.edgeWarning.classList.remove('active', 'danger');
    }
  }

  /**
   * Update G-force intensity visual
   * @param {number} gForce - Current G-force (1+)
   */
  updateGForceIntensity(gForce) {
    if (!this.gforceIntensity) return;

    if (gForce > 1.5) {
      this.gforceIntensity.classList.add('active');
      if (gForce > 2.2) {
        this.gforceIntensity.classList.add('high');
      } else {
        this.gforceIntensity.classList.remove('high');
      }
    } else {
      this.gforceIntensity.classList.remove('active', 'high');
    }
  }

  /**
   * Trigger flex release burst visual
   */
  triggerFlexRelease() {
    if (!this.flexReleaseBurst || this.zenMode) return;

    this.flexReleaseBurst.classList.remove('show');
    void this.flexReleaseBurst.offsetWidth; // Force reflow
    this.flexReleaseBurst.classList.add('show');
  }

  /**
   * Update flex meter with release detection
   * @param {number} flexEnergy - Current flex energy (0-1)
   * @param {number} boardFlex - Current board flex amount
   */
  updateFlexMeterEnhanced(flexEnergy, boardFlex) {
    // Call base method
    this.updateFlexMeter(flexEnergy, boardFlex);

    // Detect flex energy release (significant drop)
    if (this.lastFlexEnergy > 0.4 && flexEnergy < 0.15) {
      this.triggerFlexRelease();
    }
    this.lastFlexEnergy = flexEnergy;
  }

  /**
   * Update avalanche proximity warning
   * @param {number} proximity - How close the avalanche is (0-1, 1 = very close)
   */
  updateAvalancheWarning(proximity) {
    if (!this.avalancheWarning) return;

    if (proximity > 0.3) {
      this.avalancheWarning.classList.add('active');
      if (proximity > 0.7) {
        this.avalancheWarning.classList.add('close');
      } else {
        this.avalancheWarning.classList.remove('close');
      }
    } else {
      this.avalancheWarning.classList.remove('active', 'close');
    }
  }

  /**
   * Trigger chain celebration with intensity based on chain count
   * @param {number} chainCount - Current chain count (3-10)
   */
  triggerChainCelebration(chainCount) {
    if (!this.chainCelebration || this.zenMode) return;
    if (chainCount < 3) return; // Only celebrate chains of 3+

    // Determine intensity level and text
    let intensityClass = '';
    let celebrationText = '';

    if (chainCount >= 10) {
      intensityClass = 'legendary';
      celebrationText = `${chainCount}x LEGENDARY!`;
    } else if (chainCount >= 8) {
      intensityClass = 'high';
      celebrationText = `${chainCount}x ON FIRE!`;
    } else if (chainCount >= 5) {
      intensityClass = 'medium';
      celebrationText = `${chainCount}x CHAIN!`;
    } else {
      celebrationText = `${chainCount}x COMBO`;
    }

    // Clear previous classes and reset animation
    this.chainCelebration.className = 'chain-celebration';
    this.chainCelebration.textContent = celebrationText;

    // Force reflow to restart animation
    void this.chainCelebration.offsetWidth;

    // Add appropriate intensity class
    if (intensityClass) {
      this.chainCelebration.classList.add(intensityClass);
    }

    // Trigger animation
    this.chainCelebration.classList.add('show');
  }

  /**
   * Update chain display and trigger celebrations
   * @param {number} chainCount - Current chain count
   */
  updateChainCount(chainCount) {
    // Only trigger celebration when chain increases past milestones
    const milestones = [3, 5, 8, 10];
    const lastMilestone = milestones.filter(m => m <= this.lastChainCount);
    const newMilestone = milestones.filter(m => m <= chainCount);

    // Trigger if we just passed a new milestone
    if (newMilestone.length > lastMilestone.length && chainCount > this.lastChainCount) {
      this.triggerChainCelebration(chainCount);
    }

    this.lastChainCount = chainCount;
  }

  /**
   * Update jump charge visual indicator
   * @param {boolean} isCharging - Whether jump is being charged
   * @param {number} chargeAmount - Current charge level (0-1)
   */
  updateJumpCharge(isCharging, chargeAmount) {
    if (!this.jumpChargeIndicator) return;

    if (isCharging && chargeAmount > 0) {
      this.jumpChargeIndicator.classList.add('visible');

      // Update fill based on charge amount
      const fillDegrees = chargeAmount * 360;
      if (this.jumpChargeFill) {
        this.jumpChargeFill.style.background = `conic-gradient(
          rgba(0, 255, 180, 0.9) ${fillDegrees}deg,
          rgba(0, 255, 180, 0.1) ${fillDegrees}deg
        )`;
      }

      // Pulse ring more intensely as charge builds
      if (this.jumpChargeRing) {
        const pulseIntensity = 0.3 + chargeAmount * 0.7;
        this.jumpChargeRing.style.opacity = pulseIntensity;
        this.jumpChargeRing.style.transform = `scale(${1 + chargeAmount * 0.3})`;
      }

      // Add full charge class for extra visual pop
      if (chargeAmount >= 1) {
        this.jumpChargeIndicator.classList.add('full');
      } else {
        this.jumpChargeIndicator.classList.remove('full');
      }
    } else {
      this.jumpChargeIndicator.classList.remove('visible', 'full');
    }
  }

  /**
   * Trigger landing screen shake
   * @param {number} intensity - Impact intensity (0-1)
   * @param {number} quality - Landing quality (0-1, 1 = perfect)
   */
  triggerLandingShake(intensity, quality = 0.5) {
    if (!this.landingShakeContainer || !this.container) return;

    // Determine shake intensity based on impact and quality
    // Big impacts = big shake, bad landings = more shake
    const shakeMagnitude = intensity * (1.5 - quality * 0.5);

    // Add shake class with appropriate intensity
    if (shakeMagnitude > 0.8) {
      this.container.classList.add('shake-heavy');
    } else if (shakeMagnitude > 0.4) {
      this.container.classList.add('shake-medium');
    } else if (shakeMagnitude > 0.15) {
      this.container.classList.add('shake-light');
    }

    // Remove classes after animation
    setTimeout(() => {
      this.container.classList.remove('shake-heavy', 'shake-medium', 'shake-light');
    }, 300);

    // Impact flash for big landings
    if (intensity > 0.5 && this.landingImpactFlash) {
      this.landingImpactFlash.classList.remove('show');
      void this.landingImpactFlash.offsetWidth; // Force reflow

      // Color based on quality
      if (quality > 0.7) {
        this.landingImpactFlash.classList.add('clean');
        this.landingImpactFlash.classList.remove('bad');
      } else if (quality < 0.3) {
        this.landingImpactFlash.classList.add('bad');
        this.landingImpactFlash.classList.remove('clean');
      } else {
        this.landingImpactFlash.classList.remove('clean', 'bad');
      }

      this.landingImpactFlash.classList.add('show');
    }
  }

  /**
   * Enhanced landing display with screen shake
   * @param {number} intensity - Impact intensity (0-1)
   * @param {number} quality - Landing quality (0-1)
   * @param {number} airTime - Time spent in air
   */
  triggerLandingFeedback(intensity, quality, airTime) {
    // Only trigger for significant air time
    if (airTime < 0.3) return;

    // Trigger shake
    this.triggerLandingShake(intensity, quality);

    // Determine quality text
    let qualityText = 'sketchy';
    if (quality > 0.9) qualityText = 'perfect';
    else if (quality > 0.7) qualityText = 'clean';
    else if (quality < 0.2) qualityText = 'crash';

    // Calculate bonus points
    const basePoints = Math.floor(airTime * 50);
    const qualityBonus = Math.floor(basePoints * quality);
    const totalPoints = basePoints + qualityBonus;

    // Show landing score popup
    if (airTime > 0.5) {
      this.showLandingScore(qualityText, totalPoints);
    }
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
