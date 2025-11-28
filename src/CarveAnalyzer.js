/**
 * CarveAnalyzer - Deep analysis of carving technique
 *
 * This system understands the PHASES of a carved turn:
 * 1. INITIATION - Committing to the new edge, weight transfer begins
 * 2. LOADING - Edge engages, turn begins, G-force builds
 * 3. APEX - Peak of the turn, maximum edge angle, highest G-force
 * 4. UNLOADING - Rising out, G-force decreasing, preparing for transition
 *
 * A "perfect" carve has smooth progression through all phases with:
 * - Clean initiation (decisive edge switch)
 * - Progressive loading (no sudden jerks)
 * - Held apex (sustained edge at peak)
 * - Controlled unloading (smooth exit, not bailing)
 *
 * This analysis enables:
 * - Phase-specific audio/visual feedback
 * - Perfect carve detection
 * - Style analysis (aggressive vs smooth)
 * - Carve shape scoring
 */

export class CarveAnalyzer {
  constructor() {
    // === TURN PHASE STATE ===
    this.currentPhase = 'neutral';  // neutral, initiation, loading, apex, unloading
    this.phaseStartTime = 0;
    this.phaseProgress = 0;         // 0-1 progress through current phase

    // === CURRENT TURN DATA ===
    this.turnStartTime = 0;
    this.turnDirection = 0;         // +1 toeside, -1 heelside
    this.turnDuration = 0;

    // Edge angle tracking
    this.edgeAngleHistory = [];
    this.maxEdgeAngle = 0;
    this.edgeAngleAtApex = 0;
    this.timeToApex = 0;

    // Position/arc tracking
    this.turnPath = [];             // {x, z, time, edgeAngle, speed}
    this.turnStartPos = null;
    this.apexPos = null;

    // G-force simulation
    this.currentGForce = 0;
    this.peakGForce = 0;
    this.gForceHistory = [];

    // === PERFECT CARVE METRICS ===
    this.initiationQuality = 0;     // How clean was the edge switch
    this.loadingQuality = 0;        // How smooth was the buildup
    this.apexQuality = 0;           // How well held at peak
    this.unloadingQuality = 0;      // How controlled the exit
    this.arcSymmetry = 0;           // How symmetric is the turn shape
    this.overallPerfection = 0;     // Combined score 0-1

    // === STYLE ANALYSIS ===
    this.carveStyle = 'neutral';    // aggressive, smooth, technical
    this.styleIntensity = 0;

    // === THRESHOLDS ===
    this.minEdgeForTurn = 0.25;     // ~14 degrees to count as turning
    this.apexThreshold = 0.85;      // % of max edge to consider "at apex"
    this.perfectThreshold = 0.8;    // Overall score needed for "perfect"

    // === CALLBACKS ===
    this.onPhaseChange = null;
    this.onPerfectCarve = null;
    this.onTurnComplete = null;

    // === HISTORY FOR GHOST/COMPARISON ===
    this.completedTurns = [];
    this.bestTurn = null;
  }

  /**
   * Main update - call every frame during grounded state
   */
  update(dt, playerState) {
    const {
      edgeAngle,
      speed,
      position,
      heading,
      carveRailStrength,
      isGrounded
    } = playerState;

    if (!isGrounded) {
      this.resetTurn();
      return;
    }

    const absEdge = Math.abs(edgeAngle);
    const edgeSign = Math.sign(edgeAngle);
    const time = performance.now() / 1000;

    // Calculate simulated G-force
    this.updateGForce(absEdge, speed);

    // Detect turn state
    const inTurn = absEdge > this.minEdgeForTurn && speed > 3;
    const directionChanged = edgeSign !== 0 && edgeSign !== this.turnDirection;

    // === STATE MACHINE ===
    if (!inTurn && this.currentPhase !== 'neutral') {
      // Exited turn
      this.completeTurn();
    } else if (inTurn && directionChanged && this.turnDirection !== 0) {
      // Edge switch - complete old turn, start new
      this.completeTurn();
      this.startTurn(edgeSign, position, time);
    } else if (inTurn && this.currentPhase === 'neutral') {
      // Starting fresh turn
      this.startTurn(edgeSign, position, time);
    } else if (inTurn) {
      // Continue current turn
      this.updateTurn(dt, absEdge, speed, position, time);
    }

    // Record history
    if (inTurn) {
      this.edgeAngleHistory.push(absEdge);
      this.gForceHistory.push(this.currentGForce);

      // Limit history size
      if (this.edgeAngleHistory.length > 300) {
        this.edgeAngleHistory.shift();
        this.gForceHistory.shift();
      }

      // Track path
      this.turnPath.push({
        x: position.x,
        z: position.z,
        time: time - this.turnStartTime,
        edgeAngle: absEdge,
        speed: speed
      });
    }
  }

  /**
   * Start a new turn
   */
  startTurn(direction, position, time) {
    this.turnDirection = direction;
    this.turnStartTime = time;
    this.turnStartPos = { x: position.x, z: position.z };
    this.turnPath = [];
    this.edgeAngleHistory = [];
    this.gForceHistory = [];
    this.maxEdgeAngle = 0;
    this.peakGForce = 0;

    // Reset quality metrics
    this.initiationQuality = 0;
    this.loadingQuality = 0;
    this.apexQuality = 0;
    this.unloadingQuality = 0;

    this.setPhase('initiation', time);
  }

  /**
   * Update during an active turn
   */
  updateTurn(dt, absEdge, speed, position, time) {
    const elapsed = time - this.turnStartTime;
    this.turnDuration = elapsed;

    // Track maximum edge angle
    if (absEdge > this.maxEdgeAngle) {
      this.maxEdgeAngle = absEdge;
      this.timeToApex = elapsed;
      this.apexPos = { x: position.x, z: position.z };
      this.edgeAngleAtApex = absEdge;
    }

    // Track peak G-force
    if (this.currentGForce > this.peakGForce) {
      this.peakGForce = this.currentGForce;
    }

    // Determine current phase based on edge angle progression
    const edgeRatio = absEdge / Math.max(this.maxEdgeAngle, 0.3);
    const phaseTime = time - this.phaseStartTime;

    switch (this.currentPhase) {
      case 'initiation':
        // Initiation: first 0.2s or until edge reaches 50% of eventual max
        this.initiationQuality = this.analyzeInitiation(dt);
        if (phaseTime > 0.2 || edgeRatio > 0.5) {
          this.setPhase('loading', time);
        }
        break;

      case 'loading':
        // Loading: edge angle increasing toward apex
        this.loadingQuality = this.analyzeLoading();
        // Transition to apex when edge angle peaks or stabilizes
        if (absEdge >= this.maxEdgeAngle * this.apexThreshold && phaseTime > 0.15) {
          this.setPhase('apex', time);
        }
        break;

      case 'apex':
        // Apex: holding near max edge angle
        this.apexQuality = this.analyzeApex(dt, absEdge);
        // Transition to unloading when edge starts decreasing significantly
        if (absEdge < this.maxEdgeAngle * 0.7 && phaseTime > 0.1) {
          this.setPhase('unloading', time);
        }
        break;

      case 'unloading':
        // Unloading: edge angle decreasing, exiting turn
        this.unloadingQuality = this.analyzeUnloading();
        break;
    }

    // Continuous style analysis
    this.analyzeStyle(absEdge, speed);
  }

  /**
   * Complete a turn and calculate final scores
   */
  completeTurn() {
    if (this.turnDuration < 0.3) {
      // Too short to count
      this.resetTurn();
      return;
    }

    // Calculate arc symmetry
    this.arcSymmetry = this.analyzeArcSymmetry();

    // Calculate overall perfection score
    this.overallPerfection = this.calculateOverallPerfection();

    // Create turn record
    const turnRecord = {
      direction: this.turnDirection,
      duration: this.turnDuration,
      maxEdgeAngle: this.maxEdgeAngle,
      peakGForce: this.peakGForce,
      path: [...this.turnPath],
      initiationQuality: this.initiationQuality,
      loadingQuality: this.loadingQuality,
      apexQuality: this.apexQuality,
      unloadingQuality: this.unloadingQuality,
      arcSymmetry: this.arcSymmetry,
      overallPerfection: this.overallPerfection,
      style: this.carveStyle,
      timestamp: performance.now() / 1000
    };

    this.completedTurns.push(turnRecord);

    // Keep only last 50 turns
    if (this.completedTurns.length > 50) {
      this.completedTurns.shift();
    }

    // Track best turn
    if (!this.bestTurn || turnRecord.overallPerfection > this.bestTurn.overallPerfection) {
      this.bestTurn = turnRecord;
    }

    // Fire callbacks
    if (this.onTurnComplete) {
      this.onTurnComplete(turnRecord);
    }

    if (this.overallPerfection >= this.perfectThreshold && this.onPerfectCarve) {
      this.onPerfectCarve(turnRecord);
    }

    this.resetTurn();
  }

  /**
   * Reset turn state
   */
  resetTurn() {
    this.setPhase('neutral', performance.now() / 1000);
    this.turnDirection = 0;
    this.turnDuration = 0;
    this.turnPath = [];
  }

  /**
   * Set current phase with callback
   */
  setPhase(phase, time) {
    const previousPhase = this.currentPhase;
    this.currentPhase = phase;
    this.phaseStartTime = time;
    this.phaseProgress = 0;

    if (this.onPhaseChange && phase !== previousPhase) {
      this.onPhaseChange(phase, previousPhase);
    }
  }

  /**
   * Calculate simulated G-force
   */
  updateGForce(absEdge, speed) {
    if (speed < 1 || absEdge < 0.1) {
      this.currentGForce = 1.0;
      return;
    }

    // G-force from centripetal acceleration
    // F = mv²/r, where r is turn radius from sidecut geometry
    const sidecutRadius = 7; // meters
    const turnRadius = sidecutRadius / Math.max(Math.sin(absEdge), 0.1);
    const centripetal = (speed * speed) / turnRadius;
    const gFromTurn = centripetal / 9.81;

    // Total G-force (1g from gravity + centripetal)
    this.currentGForce = Math.sqrt(1 + gFromTurn * gFromTurn);
  }

  /**
   * Analyze initiation quality
   */
  analyzeInitiation(dt) {
    if (this.edgeAngleHistory.length < 3) return 0.5;

    // Good initiation: quick, decisive edge engagement
    const recent = this.edgeAngleHistory.slice(-5);
    const edgeGrowthRate = (recent[recent.length - 1] - recent[0]) / (recent.length * dt);

    // Fast engagement is good (0.5-2.0 rad/s is ideal range)
    const speedQuality = Math.min(1, edgeGrowthRate / 1.5);

    // Smooth engagement (no jerkiness)
    let jerkiness = 0;
    for (let i = 2; i < recent.length; i++) {
      const accel1 = recent[i - 1] - recent[i - 2];
      const accel2 = recent[i] - recent[i - 1];
      jerkiness += Math.abs(accel2 - accel1);
    }
    const smoothness = Math.max(0, 1 - jerkiness * 10);

    return speedQuality * 0.6 + smoothness * 0.4;
  }

  /**
   * Analyze loading phase quality
   */
  analyzeLoading() {
    if (this.edgeAngleHistory.length < 5) return 0.5;

    // Good loading: progressive, smooth increase in edge angle
    const angles = this.edgeAngleHistory;

    // Check for consistent progression (not jerky)
    let progressionScore = 0;
    let consistentIncrease = 0;

    for (let i = 1; i < angles.length; i++) {
      if (angles[i] >= angles[i - 1] - 0.02) {
        consistentIncrease++;
      }
    }
    progressionScore = consistentIncrease / (angles.length - 1);

    // Check smoothness (low variance in rate of change)
    const rates = [];
    for (let i = 1; i < angles.length; i++) {
      rates.push(angles[i] - angles[i - 1]);
    }
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((sum, r) => sum + Math.pow(r - avgRate, 2), 0) / rates.length;
    const smoothness = Math.max(0, 1 - variance * 100);

    return progressionScore * 0.5 + smoothness * 0.5;
  }

  /**
   * Analyze apex phase quality
   */
  analyzeApex(dt, currentEdge) {
    // Good apex: held steady at or near max edge angle
    const holdQuality = currentEdge / Math.max(this.maxEdgeAngle, 0.3);

    // G-force at apex should be high
    const gForceQuality = Math.min(1, this.currentGForce / 2.5);

    return holdQuality * 0.6 + gForceQuality * 0.4;
  }

  /**
   * Analyze unloading phase quality
   */
  analyzeUnloading() {
    if (this.edgeAngleHistory.length < 5) return 0.5;

    // Good unloading: controlled, smooth decrease (not abrupt bail)
    const recent = this.edgeAngleHistory.slice(-10);

    // Check for smooth decrease (not jerky)
    let smoothDecrease = 0;
    for (let i = 1; i < recent.length; i++) {
      const decrease = recent[i - 1] - recent[i];
      // Should be decreasing, but not too fast (bail) or too slow (stuck)
      if (decrease > 0 && decrease < 0.1) {
        smoothDecrease++;
      }
    }

    return smoothDecrease / Math.max(recent.length - 1, 1);
  }

  /**
   * Analyze arc symmetry
   */
  analyzeArcSymmetry() {
    if (this.turnPath.length < 10) return 0.5;

    const path = this.turnPath;
    const midIndex = Math.floor(path.length / 2);

    // Compare first half to second half (mirrored)
    let symmetryScore = 0;
    const halfLength = Math.min(midIndex, path.length - midIndex);

    for (let i = 0; i < halfLength; i++) {
      const first = path[i];
      const second = path[path.length - 1 - i];

      // Compare edge angles (should be similar at symmetric points)
      const edgeDiff = Math.abs(first.edgeAngle - second.edgeAngle);
      const edgeSim = Math.max(0, 1 - edgeDiff * 2);

      symmetryScore += edgeSim;
    }

    return symmetryScore / halfLength;
  }

  /**
   * Calculate overall perfection score
   */
  calculateOverallPerfection() {
    // Weighted combination of all quality metrics
    const weights = {
      initiation: 0.15,
      loading: 0.20,
      apex: 0.30,
      unloading: 0.15,
      symmetry: 0.20
    };

    const score =
      this.initiationQuality * weights.initiation +
      this.loadingQuality * weights.loading +
      this.apexQuality * weights.apex +
      this.unloadingQuality * weights.unloading +
      this.arcSymmetry * weights.symmetry;

    // Bonus for deep carves
    const depthBonus = Math.min(0.1, this.maxEdgeAngle * 0.1);

    // Bonus for high G-force
    const gBonus = Math.min(0.1, (this.peakGForce - 1) * 0.05);

    return Math.min(1, score + depthBonus + gBonus);
  }

  /**
   * Analyze carving style
   */
  analyzeStyle(absEdge, speed) {
    // Aggressive: high edge angles, high speed, quick transitions
    // Smooth: moderate edge angles, flowing rhythm
    // Technical: precise edge control, consistent form

    const edgeIntensity = absEdge / 1.0;
    const speedIntensity = speed / 30;

    if (edgeIntensity > 0.7 && speedIntensity > 0.6) {
      this.carveStyle = 'aggressive';
      this.styleIntensity = (edgeIntensity + speedIntensity) / 2;
    } else if (this.loadingQuality > 0.7 && this.arcSymmetry > 0.7) {
      this.carveStyle = 'technical';
      this.styleIntensity = (this.loadingQuality + this.arcSymmetry) / 2;
    } else {
      this.carveStyle = 'smooth';
      this.styleIntensity = 0.5 + Math.min(0.5, (1 - Math.abs(edgeIntensity - 0.5)) * 0.5);
    }
  }

  /**
   * Get current state for UI/feedback
   */
  getState() {
    return {
      phase: this.currentPhase,
      phaseProgress: this.phaseProgress,
      turnDirection: this.turnDirection,
      turnDuration: this.turnDuration,
      currentGForce: this.currentGForce,
      peakGForce: this.peakGForce,
      maxEdgeAngle: this.maxEdgeAngle,

      // Quality metrics (live during turn)
      initiationQuality: this.initiationQuality,
      loadingQuality: this.loadingQuality,
      apexQuality: this.apexQuality,
      unloadingQuality: this.unloadingQuality,
      overallPerfection: this.overallPerfection,

      // Style
      carveStyle: this.carveStyle,
      styleIntensity: this.styleIntensity,

      // Is this a perfect carve?
      isPerfect: this.overallPerfection >= this.perfectThreshold,

      // Best turn reference
      bestTurnPerfection: this.bestTurn ? this.bestTurn.overallPerfection : 0
    };
  }

  /**
   * Get recent completed turns for analysis
   */
  getRecentTurns(count = 10) {
    return this.completedTurns.slice(-count);
  }

  /**
   * Reset all history
   */
  reset() {
    this.resetTurn();
    this.completedTurns = [];
    this.bestTurn = null;
  }
}
