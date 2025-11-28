/**
 * FlowScore System
 *
 * Analyzes carving quality in real-time and generates a "flow state" score.
 * The philosophy: reward smooth, committed carving without punishing exploration.
 *
 * Metrics tracked:
 * - Arc Beauty: How clean and symmetric the turn shapes are
 * - Edge Commitment: Depth and consistency of edge angle
 * - Transition Timing: Crispness of edge-to-edge switches
 * - Chain Momentum: Building rhythm through consecutive carves
 * - Terrain Resonance: Syncing transitions with terrain features
 */

export class FlowScore {
  constructor() {
    // === CURRENT FLOW STATE ===
    this.flowLevel = 0;           // 0-1, current flow intensity
    this.flowMomentum = 0;        // Builds over time during good carving
    this.flowMultiplier = 1.0;    // Chain-based multiplier

    // === SCORING ===
    this.currentScore = 0;        // Total run score
    this.carveScore = 0;          // Current carve value (accumulates during turn)
    this.lastCarveScore = 0;      // Score of the completed carve

    // === CARVE ANALYSIS ===
    this.carveStartTime = 0;
    this.carveArcPoints = [];     // Track path for arc analysis
    this.peakEdgeAngle = 0;
    this.edgeAngleHistory = [];   // For consistency measurement
    this.transitionQuality = 0;   // How clean the last transition was

    // === CHAIN SYSTEM ===
    this.chainCount = 0;          // Consecutive good carves
    this.maxChain = 0;            // Best chain this run
    this.chainDecayTimer = 0;     // Time since last carve
    this.chainDecayTime = 1.5;    // Seconds before chain starts decaying

    // === FLOW THRESHOLDS ===
    // Carve must meet these to count as "clean"
    this.minEdgeForCarve = 0.4;      // ~23 degrees
    this.minHoldTime = 0.35;         // Seconds
    this.minArcQuality = 0.5;        // 0-1

    // === TERRAIN RESONANCE ===
    this.terrainSyncBonus = 0;       // Bonus for terrain-synced transitions
    this.lastTerrainPeak = 0;        // Track terrain undulations
    this.resonanceWindow = 0.3;      // Seconds of timing window

    // === VISUAL FEEDBACK STATE ===
    this.flowPulse = 0;              // Pulse effect on good carves
    this.showScorePopup = false;
    this.scorePopupValue = 0;
    this.scorePopupTimer = 0;

    // === METRICS FOR UI ===
    this.arcBeauty = 0;
    this.edgeCommitment = 0;
    this.rhythmScore = 0;

    // === STATE TRACKING ===
    this.inCarve = false;
    this.previousEdgeSide = 0;
    this.carveDirection = 0;         // +1 toeside, -1 heelside
  }

  /**
   * Main update - call every frame
   */
  update(dt, playerState, terrainState = null) {
    const {
      edgeAngle,
      speed,
      isGrounded,
      carveRailStrength,
      carvePerfection,
      position,
      heading
    } = playerState;

    // === DETECT CARVING STATE ===
    const absEdge = Math.abs(edgeAngle);
    const isCarving = isGrounded && absEdge > this.minEdgeForCarve && speed > 5;
    const edgeSide = absEdge > 0.15 ? Math.sign(edgeAngle) : 0;

    // === EDGE TRANSITION DETECTION ===
    const transitioned = edgeSide !== 0 &&
                         this.previousEdgeSide !== 0 &&
                         edgeSide !== this.previousEdgeSide;

    if (transitioned && speed > 5) {
      this.onEdgeTransition(dt, playerState, terrainState);
    }

    // === UPDATE CARVE TRACKING ===
    if (isCarving) {
      if (!this.inCarve) {
        // Starting new carve
        this.startCarve(edgeSide, position);
      }
      this.updateCarve(dt, playerState);
    } else if (this.inCarve) {
      // Carve ended without clean transition
      this.endCarve(false, playerState);
    }

    // === FLOW DYNAMICS ===
    this.updateFlow(dt, isCarving, carveRailStrength);

    // === CHAIN DECAY ===
    if (!isCarving) {
      this.chainDecayTimer += dt;
      if (this.chainDecayTimer > this.chainDecayTime + 2) {
        // Chain decays after extended non-carving
        this.chainCount = Math.max(0, this.chainCount - dt * 0.5);
        if (this.chainCount < 1) this.chainCount = 0;
      }
    }

    // === VISUAL FEEDBACK ===
    this.flowPulse *= Math.pow(0.1, dt); // Decay pulse
    if (this.scorePopupTimer > 0) {
      this.scorePopupTimer -= dt;
      if (this.scorePopupTimer <= 0) {
        this.showScorePopup = false;
      }
    }

    this.previousEdgeSide = edgeSide;
  }

  /**
   * Called when starting a new carve
   */
  startCarve(edgeSide, position) {
    this.inCarve = true;
    this.carveDirection = edgeSide;
    this.carveStartTime = performance.now() / 1000;
    this.carveScore = 0;
    this.peakEdgeAngle = 0;
    this.carveArcPoints = [{
      x: position.x,
      z: position.z,
      time: 0
    }];
    this.edgeAngleHistory = [];
  }

  /**
   * Called every frame during a carve
   */
  updateCarve(dt, playerState) {
    const { edgeAngle, speed, position, carveRailStrength, carvePerfection } = playerState;
    const absEdge = Math.abs(edgeAngle);

    // Track peak edge angle
    if (absEdge > this.peakEdgeAngle) {
      this.peakEdgeAngle = absEdge;
    }

    // Track edge angle history for consistency
    this.edgeAngleHistory.push(absEdge);
    if (this.edgeAngleHistory.length > 30) {
      this.edgeAngleHistory.shift();
    }

    // Track arc points for shape analysis
    const carveTime = (performance.now() / 1000) - this.carveStartTime;
    if (this.carveArcPoints.length === 0 ||
        carveTime - this.carveArcPoints[this.carveArcPoints.length - 1].time > 0.1) {
      this.carveArcPoints.push({
        x: position.x,
        z: position.z,
        time: carveTime
      });
    }

    // === ACCUMULATE CARVE SCORE ===
    // Deep committed carves score more
    const edgeValue = Math.pow(absEdge / 1.0, 1.5); // Exponential reward for depth
    const railBonus = 1 + carveRailStrength * 0.5;
    const perfectionBonus = 1 + carvePerfection * 0.3;
    const speedBonus = 1 + Math.min(speed / 30, 1) * 0.5;

    this.carveScore += edgeValue * railBonus * perfectionBonus * speedBonus * dt * 100;

    // Update commitment metric
    this.edgeCommitment = Math.min(1, absEdge / 0.9) * carveRailStrength;
  }

  /**
   * Called when carve ends (either clean transition or bail)
   */
  endCarve(cleanTransition, playerState) {
    if (!this.inCarve) return;

    const carveTime = (performance.now() / 1000) - this.carveStartTime;

    // === ANALYZE CARVE QUALITY ===
    const arcQuality = this.analyzeArc();
    const edgeConsistency = this.analyzeEdgeConsistency();
    const holdTimeBonus = Math.min(1, carveTime / 1.0); // Up to 1 second is full bonus

    // Calculate final carve value
    let finalScore = this.carveScore;

    // Quality multipliers
    finalScore *= (0.5 + arcQuality * 0.5);
    finalScore *= (0.7 + edgeConsistency * 0.3);
    finalScore *= (0.6 + holdTimeBonus * 0.4);

    // Clean transition bonus
    if (cleanTransition) {
      finalScore *= (1 + this.transitionQuality * 0.3);
    }

    // Chain multiplier
    finalScore *= this.flowMultiplier;

    // Store for display
    this.lastCarveScore = Math.floor(finalScore);
    this.arcBeauty = arcQuality;

    // Add to total if it was a "valid" carve
    const validCarve = carveTime > this.minHoldTime &&
                       this.peakEdgeAngle > this.minEdgeForCarve &&
                       arcQuality > this.minArcQuality;

    if (validCarve) {
      this.currentScore += this.lastCarveScore;

      // Show score popup
      this.showScorePopup = true;
      this.scorePopupValue = this.lastCarveScore;
      this.scorePopupTimer = 1.5;

      // Pulse effect
      this.flowPulse = Math.min(1, this.lastCarveScore / 500);
    }

    this.inCarve = false;
  }

  /**
   * Called on edge-to-edge transition
   */
  onEdgeTransition(dt, playerState, terrainState) {
    const { speed, edgeAngle, carveRailStrength } = playerState;

    // End previous carve as clean transition
    this.endCarve(true, playerState);

    // === ANALYZE TRANSITION QUALITY ===
    // Fast, committed transitions score higher
    const edgeSpeed = Math.abs(edgeAngle) / 0.1; // How fast did we reach new edge
    const commitmentBonus = carveRailStrength;
    const speedBonus = Math.min(1, speed / 25);

    this.transitionQuality = Math.min(1,
      (edgeSpeed * 0.3 + commitmentBonus * 0.4 + speedBonus * 0.3)
    );

    // === TERRAIN RESONANCE ===
    if (terrainState && terrainState.terrainSync > 0) {
      // Transition happened near terrain feature
      this.terrainSyncBonus = terrainState.terrainSync;
      this.transitionQuality += this.terrainSyncBonus * 0.3;
    } else {
      this.terrainSyncBonus = 0;
    }

    // === UPDATE CHAIN ===
    const wasGoodCarve = this.lastCarveScore > 100;
    if (wasGoodCarve) {
      this.chainCount = Math.min(this.chainCount + 1, 20);
      this.chainDecayTimer = 0;

      // Update max chain
      if (this.chainCount > this.maxChain) {
        this.maxChain = Math.floor(this.chainCount);
      }
    } else if (this.lastCarveScore > 50) {
      // Mediocre carve - chain holds but doesn't grow
      this.chainDecayTimer = 0;
    } else {
      // Bad carve - chain takes a hit
      this.chainCount = Math.max(0, this.chainCount - 0.5);
    }

    // Update multiplier
    this.flowMultiplier = 1.0 + Math.floor(this.chainCount) * 0.1;

    // Pulse on good transition
    if (this.transitionQuality > 0.6) {
      this.flowPulse = Math.max(this.flowPulse, this.transitionQuality);
    }
  }

  /**
   * Analyze the arc shape for beauty/cleanliness
   */
  analyzeArc() {
    if (this.carveArcPoints.length < 3) return 0.5;

    const points = this.carveArcPoints;

    // Calculate arc smoothness (deviation from ideal curve)
    let totalDeviation = 0;
    let segmentCount = 0;

    for (let i = 2; i < points.length; i++) {
      // Get three consecutive points
      const p0 = points[i - 2];
      const p1 = points[i - 1];
      const p2 = points[i];

      // Calculate vectors
      const v1x = p1.x - p0.x;
      const v1z = p1.z - p0.z;
      const v2x = p2.x - p1.x;
      const v2z = p2.z - p1.z;

      // Angle change (should be smooth/consistent)
      const angle1 = Math.atan2(v1z, v1x);
      const angle2 = Math.atan2(v2z, v2x);
      let angleDiff = Math.abs(angle2 - angle1);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

      // Normalize by expected curve rate
      const expectedCurve = 0.1; // Expected angle change per segment
      const deviation = Math.abs(angleDiff - expectedCurve) / expectedCurve;

      totalDeviation += Math.min(deviation, 2); // Cap extreme values
      segmentCount++;
    }

    if (segmentCount === 0) return 0.5;

    // Convert deviation to quality score
    const avgDeviation = totalDeviation / segmentCount;
    const quality = Math.max(0, 1 - avgDeviation * 0.5);

    return quality;
  }

  /**
   * Analyze edge angle consistency during carve
   */
  analyzeEdgeConsistency() {
    if (this.edgeAngleHistory.length < 5) return 0.5;

    const angles = this.edgeAngleHistory;

    // Calculate variance
    const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
    const variance = angles.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / angles.length;
    const stdDev = Math.sqrt(variance);

    // Lower variance = more consistent
    const consistency = Math.max(0, 1 - stdDev * 3);

    return consistency;
  }

  /**
   * Update overall flow state
   */
  updateFlow(dt, isCarving, carveRailStrength) {
    if (isCarving && carveRailStrength > 0.3) {
      // Build flow when carving well
      const buildRate = 0.3 + carveRailStrength * 0.5 + this.chainCount * 0.05;
      this.flowMomentum += buildRate * dt;
      this.flowLevel = Math.min(1, this.flowLevel + buildRate * dt * 0.5);
    } else {
      // Flow decays when not carving
      this.flowMomentum *= Math.pow(0.8, dt);
      this.flowLevel *= Math.pow(0.9, dt);
    }

    // Update rhythm metric
    this.rhythmScore = Math.min(1, this.chainCount / 8) * (0.5 + this.transitionQuality * 0.5);
  }

  /**
   * Add a bonus score (e.g., from gates)
   */
  addBonus(points, reason = '') {
    this.currentScore += points;

    // Show popup
    this.showScorePopup = true;
    this.scorePopupValue = points;
    this.scorePopupTimer = 1.2;
    this.flowPulse = Math.min(1, points / 200);

    if (reason) {
      console.log(`+${points} ${reason}`);
    }
  }

  /**
   * Reset for new run
   */
  reset() {
    this.flowLevel = 0;
    this.flowMomentum = 0;
    this.flowMultiplier = 1.0;
    this.currentScore = 0;
    this.carveScore = 0;
    this.lastCarveScore = 0;
    this.chainCount = 0;
    this.maxChain = 0;
    this.chainDecayTimer = 0;
    this.inCarve = false;
    this.previousEdgeSide = 0;
    this.flowPulse = 0;
    this.showScorePopup = false;
    this.arcBeauty = 0;
    this.edgeCommitment = 0;
    this.rhythmScore = 0;
    this.transitionQuality = 0;
    this.terrainSyncBonus = 0;
  }

  /**
   * Get state for UI display
   */
  getDisplayState() {
    return {
      score: Math.floor(this.currentScore),
      flowLevel: this.flowLevel,
      flowMultiplier: this.flowMultiplier,
      chainCount: Math.floor(this.chainCount),
      maxChain: this.maxChain,

      // Last carve metrics
      lastCarveScore: this.lastCarveScore,
      arcBeauty: this.arcBeauty,
      edgeCommitment: this.edgeCommitment,
      rhythmScore: this.rhythmScore,

      // Visual feedback
      flowPulse: this.flowPulse,
      showScorePopup: this.showScorePopup,
      scorePopupValue: this.scorePopupValue,

      // Terrain sync
      terrainSyncBonus: this.terrainSyncBonus
    };
  }
}
