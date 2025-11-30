import * as THREE from 'three';

/**
 * CarvePhysics - All carving physics systems
 *
 * Contains: edge control, angulation, board flex, arc tracking,
 * edge bite, carve rail, grip system, wash-out, edge catch, flow state
 */

/**
 * Update edge angle based on input with spring-damper physics
 * @param {number} dt - Delta time
 * @param {number} maxEdge - Maximum edge angle in radians
 */
export function updateEdgeAngle(dt, maxEdge = 1.15) {
  // Target edge from steer input
  // Lean forward slightly increases edge commitment
  const leanBonus = this.input.lean > 0 ? this.input.lean * 0.1 : 0;
  this.targetEdgeAngle = this.input.steer * maxEdge * (1 + leanBonus);

  // Spring-damper for edge angle (smooth, physical feel)
  const edgeSpring = 70;  // Snappier response
  const edgeDamp = 8 + this.smoothedRailStrength * 5;

  const edgeError = this.targetEdgeAngle - this.edgeAngle;
  const springForce = edgeError * edgeSpring;
  const dampForce = -this.edgeVelocity * edgeDamp;
  const edgeAccel = springForce + dampForce;

  this.edgeVelocity += edgeAccel * dt;
  this.edgeAngle += this.edgeVelocity * dt;

  // Soft clamp edge angle
  if (Math.abs(this.edgeAngle) > maxEdge) {
    this.edgeAngle = Math.sign(this.edgeAngle) * maxEdge;
    this.edgeVelocity *= 0.5;
  }
}

/**
 * Update angulation system - proper body position for deep edge hold
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} speed2D - Current 2D speed
 * @param {number} edgeChangeRate - Rate of edge angle change
 */
export function updateAngulation(dt, absEdge, speed2D, edgeChangeRate) {
  // Proper angulation lets you hold deeper edges without washing out
  const angulationNeeded = (absEdge * speed2D) / 25;
  this.targetAngulation = Math.min(angulationNeeded, 1.0);

  // Angulation capacity based on smoothness of edge changes
  const smoothnessThreshold = 3.0; // rad/s - above this is "jerky"
  if (edgeChangeRate > smoothnessThreshold) {
    // Jerky input degrades angulation capacity
    const jerkPenalty = (edgeChangeRate - smoothnessThreshold) * 0.3 * dt;
    this.angulationCapacity = Math.max(0.4, this.angulationCapacity - jerkPenalty);
  } else {
    // Smooth carving restores capacity
    this.angulationCapacity = Math.min(1.0, this.angulationCapacity + 0.8 * dt);
  }

  // Angulation follows target smoothly
  const effectiveTargetAng = this.targetAngulation * this.angulationCapacity;
  this.angulation = THREE.MathUtils.lerp(this.angulation, effectiveTargetAng, 4 * dt);
}

/**
 * Update board flex system - stores energy for transitions
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} speed2D - Current 2D speed
 */
export function updateBoardFlex(dt, absEdge, speed2D) {
  // Board flexes under carving load - stores energy for transitions
  const carveLoad = absEdge * speed2D * 0.02 * (1 + this.carveRailStrength);
  const targetFlex = Math.min(carveLoad, 1.0);

  // Flex builds during carves
  this.boardFlex = THREE.MathUtils.lerp(this.boardFlex, targetFlex, this.flexStiffness * dt);

  // Accumulate flex energy (like winding a spring)
  if (this.boardFlex > 0.2 && absEdge > 0.4) {
    const energyGain = this.boardFlex * this.carvePerfection * dt * 0.8;
    this.flexEnergy = Math.min(this.flexEnergy + energyGain, this.maxFlexEnergy);
  }
}

/**
 * Update arc shape tracking - determines turn type (C-turn, J-turn, wiggle)
 * @param {number} absEdge - Absolute edge angle
 */
export function updateArcTracking(absEdge) {
  if (absEdge > 0.3) {
    if (this.arcHeadingChange === 0) {
      // Starting new arc
      this.arcStartHeading = this.heading;
    }
    this.arcHeadingChange = Math.abs(this.normalizeAngle(this.heading - this.arcStartHeading));
  }
}

/**
 * Update edge bite progression - progressive grip for sustained carves
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 */
export function updateEdgeBite(dt, absEdge) {
  if (absEdge > this.carveRailThreshold && this.smoothedRailStrength > 0.3) {
    // Bite builds faster with good angulation and perfection
    const biteGain = this.edgeBiteRate * this.angulation * this.carvePerfection * dt;
    this.edgeBite = Math.min(this.edgeBite + biteGain, this.maxEdgeBite);
  } else {
    // Bite decays smoothly when not in deep carve
    this.edgeBite = Math.max(0, this.edgeBite - 1.5 * dt);
  }

  // Track peak edge angle for this carve
  if (absEdge > this.peakEdgeAngle) {
    this.peakEdgeAngle = absEdge;
  }
}

/**
 * Detect and handle edge transitions (the "pop")
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} edgeSign - Sign of edge angle
 * @param {number} speed2D - Current 2D speed
 * @param {number} maxEdge - Maximum edge angle
 * @param {THREE.Vector3} forward - Forward direction vector
 * @returns {boolean} Whether an edge transition occurred
 */
export function handleEdgeTransition(dt, absEdge, edgeSign, speed2D, maxEdge, forward) {
  const currentEdgeSide = absEdge > 0.15 ? edgeSign : 0;
  const edgeSwitched = currentEdgeSide !== 0 &&
                       this.previousEdgeSide !== 0 &&
                       currentEdgeSide !== this.previousEdgeSide;

  // Check for edge catch on transition
  if (edgeSwitched && speed2D > 6 && !this.isEdgeCaught && !this.isWashingOut) {
    const caught = checkEdgeCatch.call(this, speed2D, maxEdge, forward);
    if (caught) {
      this.previousEdgeSide = currentEdgeSide;
      this.lastEdgeChangeTime += dt;
      return true;
    }
  }

  // Good transition (not caught, completed previous carve)
  if (edgeSwitched && speed2D > 5 && !this.isEdgeCaught) {
    processGoodTransition.call(this, absEdge, speed2D, maxEdge, forward);
  }

  this.previousEdgeSide = currentEdgeSide;
  this.lastEdgeChangeTime += dt;

  return edgeSwitched;
}

/**
 * Check if an edge catch occurred
 * @private
 */
function checkEdgeCatch(speed2D, maxEdge, forward) {
  // Calculate how "violent" the transition was
  const transitionViolence = Math.abs(this.edgeAngle - this.previousEdgeSide * maxEdge);

  // Check heading vs velocity alignment
  const velHeading = Math.atan2(-this.velocity.x, this.velocity.z);
  const headingMismatch = Math.abs(this.normalizeAngle(velHeading - this.heading));

  // Risk factors for edge catch
  const speedFactor = Math.max(0, (speed2D - 8) / 15);
  const violenceFactor = transitionViolence > 0.8 ? (transitionViolence - 0.8) * 1.5 : 0;
  const alignmentFactor = headingMismatch > 0.2 ? (headingMismatch - 0.2) * 3 : 0;
  const commitmentFactor = this.carveCommitment > 0.3 ? this.carveCommitment * 0.8 : 0;

  // Combined risk
  const catchRisk = (speedFactor * 0.4 + violenceFactor * 0.4 +
                     alignmentFactor * 0.4 + commitmentFactor) * (1 + speedFactor * 0.5);

  if (catchRisk > 0.25 && Math.random() < catchRisk * 0.8) {
    // EDGE CATCH!
    this.isEdgeCaught = true;
    this.edgeCatchSeverity = Math.min(catchRisk * 1.5, 1.0);
    this.edgeCatchTime = 0.4 + this.edgeCatchSeverity * 0.5;
    this.carveChainCount = 0;
    this.carveCommitment = 0;
    return true;
  }
  return false;
}

/**
 * Process a good edge transition (the satisfying "pop")
 * @private
 */
function processGoodTransition(absEdge, speed2D, maxEdge, forward) {
  const transitionSpeed = Math.abs(this.edgeAngle - this.previousEdgeSide * maxEdge);
  const speedBonus = Math.min(speed2D / 20, 1.5);

  // Timing sweet spot calculation
  const timeSinceLastSwitch = this.lastEdgeChangeTime;
  let timingMultiplier = 1.0;

  if (timeSinceLastSwitch < 0.3) {
    timingMultiplier = 0.4; // Panic wiggling
  } else if (timeSinceLastSwitch < 0.5) {
    timingMultiplier = 0.7 + (timeSinceLastSwitch - 0.3) * 1.5;
  } else if (timeSinceLastSwitch <= 1.2) {
    // Sweet spot! Peak at 0.8s
    const sweetSpotCenter = 0.8;
    const distFromCenter = Math.abs(timeSinceLastSwitch - sweetSpotCenter);
    timingMultiplier = 1.0 + (0.35 - distFromCenter) * 0.5;
  } else if (timeSinceLastSwitch <= 1.8) {
    timingMultiplier = 1.0 - (timeSinceLastSwitch - 1.2) * 0.5;
  } else {
    timingMultiplier = 0.5; // Lost rhythm
  }

  // Arc shape determination
  const headingDeg = this.arcHeadingChange * (180 / Math.PI);
  if (headingDeg > 60) {
    this.arcType = 'c-turn';
  } else if (headingDeg > 30) {
    this.arcType = 'j-turn';
  } else {
    this.arcType = 'wiggle';
  }

  const arcShapeMultiplier = this.arcType === 'c-turn' ? 1.3 :
                              this.arcType === 'j-turn' ? 1.0 : 0.5;

  // Carve chain bonus
  const cleanCarve = this.peakEdgeAngle > 0.5 && this.carveHoldTime > 0.3;
  const completedArc = this.carveArcProgress > 0.25;
  const goodTiming = timingMultiplier > 0.9;

  if (cleanCarve && completedArc && this.arcType !== 'wiggle' && goodTiming) {
    this.carveChainCount = Math.min(this.carveChainCount + 1, 10);

    // Flow state update
    const flowGain = this.flowBuildRate * arcShapeMultiplier * timingMultiplier *
                     (1 + this.carvePerfection);
    this.flowMomentum = Math.min(this.flowMomentum + flowGain, 1.5);
  } else if (!cleanCarve || this.arcType === 'wiggle') {
    this.carveChainCount = Math.max(0, this.carveChainCount - 1);
    this.flowMomentum = Math.max(0, this.flowMomentum - 0.2);
  } else if (!goodTiming) {
    this.flowMomentum = Math.max(0, this.flowMomentum - 0.1);
  }

  const chainMultiplier = 1.0 + this.carveChainCount * 0.1;

  // Flex energy release
  const flexBoost = this.flexEnergy * 2.5;
  const arcBonus = completedArc ? 1.0 : 0.5;

  this.edgeTransitionBoost = (transitionSpeed * speedBonus * 3.5 + flexBoost) *
                              chainMultiplier * arcBonus * arcShapeMultiplier *
                              timingMultiplier * (1 + this.flowState * 0.3);
  this.lastEdgeChangeTime = 0;

  // Carve energy from good edge changes
  const carveQuality = Math.min(1, this.peakEdgeAngle / 0.8) * arcBonus;
  this.carveEnergy = Math.min(this.carveEnergy + 0.3 * carveQuality * chainMultiplier, 1.5);

  // Release flex energy on transition
  this.flexEnergy *= 0.3;
  this.boardFlex = 0;

  // Reset carve tracking for next carve
  this.peakEdgeAngle = 0;
  this.carveHoldTime = 0;
  this.carveRailStrength = 0;
  this.carveCommitment = 0;
  this.carveArcProgress = 0;
  this.arcHeadingChange = 0;
  this.edgeBite = 0;
}

/**
 * Update edge catch consequences
 * @param {number} dt - Delta time
 * @param {THREE.Vector3} forward - Forward direction
 * @param {THREE.Vector3} right - Right direction
 */
export function updateEdgeCatchConsequences(dt, forward, right) {
  if (!this.isEdgeCaught) return;

  const stumbleForce = this.edgeCatchSeverity * 20;

  // Thrown forward and sideways
  this.velocity.x += forward.x * stumbleForce * dt * -1.0;
  this.velocity.z += forward.z * stumbleForce * dt * -1.0;

  const stumbleDir = this.edgeAngle > 0 ? 1 : -1;
  this.velocity.x += right.x * stumbleDir * stumbleForce * dt * 0.5;
  this.velocity.z += right.z * stumbleDir * stumbleForce * dt * 0.5;

  // Massive speed loss
  const catchSpeedLoss = 1 - (this.edgeCatchSeverity * 0.4 * dt * 60);
  this.velocity.x *= catchSpeedLoss;
  this.velocity.z *= catchSpeedLoss;

  // Heading gets yanked
  this.headingVelocity += (Math.random() - 0.5) * this.edgeCatchSeverity * 8;

  // Compression spikes
  this.targetCompression = 0.8;

  // Edge forced flat
  this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, 0, 20 * dt);

  // Recovery timer
  this.edgeCatchTime -= dt;
  if (this.edgeCatchTime <= 0) {
    this.isEdgeCaught = false;
    this.edgeCatchSeverity = 0;
    this.isRecovering = true;
    this.recoveryTime = 0.7;
  }
}

/**
 * Update carve commitment system
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} edgeSign - Sign of edge angle
 * @param {number} speed2D - Current 2D speed
 */
export function updateCarveCommitment(dt, absEdge, edgeSign, speed2D) {
  if (absEdge > 0.4 && speed2D > 10 && !this.isWashingOut && !this.isEdgeCaught) {
    if (this.carveCommitment < 0.3) {
      this.carveEntrySpeed = speed2D;
      this.carveEntryEdge = absEdge;
      this.carveDirection = edgeSign;
    }

    const commitRate = absEdge * 2;
    this.carveCommitment = Math.min(this.carveCommitment + commitRate * dt, 1.0);
    this.carveArcProgress += Math.abs(this.headingVelocity) * dt * 0.3;
  } else if (!this.isWashingOut && !this.isEdgeCaught) {
    // Check for bail penalty
    if (this.carveCommitment > 0.5 && this.carveArcProgress < 0.3) {
      const bailPenalty = this.carveCommitment * 0.5;
      this.carveChainCount = Math.max(0, this.carveChainCount - 2);
      this.velocity.x *= (1 - bailPenalty * 0.1);
      this.velocity.z *= (1 - bailPenalty * 0.1);
      this.headingVelocity += (Math.random() - 0.5) * bailPenalty * 1.5;
    }

    this.carveCommitment *= Math.pow(0.1, dt * 2);
    this.carveArcProgress *= 0.9;
  }
}

/**
 * Update carve rail system - lock into deep carves
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} speed2D - Current 2D speed
 */
export function updateCarveRail(dt, absEdge, speed2D) {
  if (absEdge > this.carveRailThreshold && speed2D > 8) {
    this.carveHoldTime += dt;

    const targetRail = Math.min(1, (absEdge - this.carveRailThreshold) * 2);
    this.carveRailStrength = THREE.MathUtils.lerp(this.carveRailStrength, targetRail, 3 * dt);

    // Track carve perfection
    const edgeStability = Math.max(0, 1 - Math.abs(this.edgeVelocity) * 0.5);
    this.carvePerfection = THREE.MathUtils.lerp(this.carvePerfection, edgeStability, 3 * dt);
  } else {
    this.carveRailStrength = Math.max(0, this.carveRailStrength - 2.0 * dt);
    this.carvePerfection = Math.max(0, this.carvePerfection - 1.5 * dt);
  }

  // Smooth the rail strength
  this.smoothedRailStrength = THREE.MathUtils.lerp(
    this.smoothedRailStrength,
    this.carveRailStrength,
    5 * dt
  );
}

/**
 * Apply edge transition boost
 * @param {number} dt - Delta time
 * @param {THREE.Vector3} forward - Forward direction
 */
export function applyEdgeTransitionBoost(dt, forward) {
  if (this.edgeTransitionBoost > 0.05) {
    const boostApplication = this.edgeTransitionBoost * dt * 6;
    this.velocity.x += forward.x * boostApplication;
    this.velocity.z += forward.z * boostApplication;
    this.edgeTransitionBoost *= Math.pow(0.15, dt);
  } else {
    this.edgeTransitionBoost = 0;
  }
}

/**
 * Calculate grip based on all carving factors
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} edgeSign - Sign of edge angle
 * @param {number} speed2D - Current 2D speed
 * @param {THREE.Vector3} right - Right direction vector
 * @returns {number} Final grip value
 */
export function calculateGrip(dt, absEdge, edgeSign, speed2D, right) {
  const baseGrip = 0.7;
  const edgeGrip = absEdge * 0.3;
  const railGrip = this.carveRailStrength * 0.15;
  const biteGrip = this.edgeBite * 0.12;
  const angulationGrip = this.angulation * absEdge * 0.15;

  // Speed-edge coupling
  let speedEdgeGrip = 1.0;
  const angulationBonus = this.angulation * 0.4;
  const minSpeedPerRadian = 12 * (1 - angulationBonus);
  const supportableEdge = speed2D / minSpeedPerRadian;

  // Wash out check
  const effectiveOverEdge = absEdge - supportableEdge;
  if (effectiveOverEdge > 0 && speed2D < 15) {
    const angulationProtection = this.angulation * 0.5;
    const washOutPenalty = Math.min(effectiveOverEdge * 1.5 * (1 - angulationProtection), 0.4);
    speedEdgeGrip -= washOutPenalty;

    const washOutThreshold = 0.25 + this.angulation * 0.2;
    if (effectiveOverEdge > washOutThreshold && speed2D < 8 && !this.isWashingOut && !this.isEdgeCaught) {
      this.isWashingOut = true;
      this.washOutIntensity = Math.min(effectiveOverEdge * 2.0 * (1 - angulationProtection), 0.8);
      this.washOutDirection = edgeSign;
    }
  }

  // High speed carving bonus
  if (speed2D > 15 && absEdge > 0.4) {
    const speedCarveBonus = Math.min((speed2D - 15) * 0.005, 0.15);
    speedEdgeGrip += speedCarveBonus;
  }

  speedEdgeGrip = Math.max(speedEdgeGrip, 0.5);

  // Handle wash out consequences
  if (this.isWashingOut) {
    updateWashOutConsequences.call(this, dt, right, speedEdgeGrip);
    speedEdgeGrip = Math.min(speedEdgeGrip, 0.25);
  }

  // Calculate base grip before snow condition
  let calculatedGrip = (baseGrip + edgeGrip + railGrip + biteGrip + angulationGrip) * speedEdgeGrip;

  // Apply snow condition modifier
  const snowGripMod = this.currentSnowCondition.gripMultiplier;
  calculatedGrip *= snowGripMod;

  // Flow state grip bonus
  const flowGripBonus = this.flowState * 0.08;
  calculatedGrip += flowGripBonus;

  let targetGrip = THREE.MathUtils.clamp(calculatedGrip, 0.3, 0.98);

  // Smooth grip transitions
  const gripChangeRate = targetGrip < this.smoothedGrip ? 8 : 5;
  this.smoothedGrip = THREE.MathUtils.lerp(this.smoothedGrip, targetGrip, gripChangeRate * dt);

  return this.smoothedGrip;
}

/**
 * Update wash out consequences
 * @private
 */
function updateWashOutConsequences(dt, right) {
  const slideForce = this.washOutIntensity * 15;
  this.velocity.x += right.x * this.washOutDirection * slideForce * dt;
  this.velocity.z += right.z * this.washOutDirection * slideForce * dt;

  this.headingVelocity += this.washOutDirection * this.washOutIntensity * 4 * dt;

  const speedLoss = 1 - (this.washOutIntensity * 0.25 * dt * 60);
  this.velocity.x *= speedLoss;
  this.velocity.z *= speedLoss;

  this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, 0, 12 * dt);
  this.targetCompression = 0.6 + this.washOutIntensity * 0.3;

  this.washOutIntensity -= dt * 1.8;
  if (this.washOutIntensity <= 0.1) {
    this.isWashingOut = false;
    this.washOutIntensity = 0;
    this.isRecovering = true;
    this.recoveryTime = 0.6;
    this.carveChainCount = 0;
  }
}

/**
 * Update risk calculation and effects
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} speed2D - Current 2D speed
 * @param {number} finalGrip - Current grip value
 * @param {number} speedEdgeGrip - Speed-edge grip factor
 * @returns {number} Modified grip after risk effects
 */
export function updateRiskAndWobble(dt, absEdge, speed2D, finalGrip, speedEdgeGrip) {
  const speedRisk = Math.max(0, (speed2D - 20) / 30);
  const edgeRisk = Math.pow(absEdge / 1.0, 2);
  const gripDeficit = Math.max(0, 0.6 - finalGrip);
  const speedEdgeMismatchRisk = (1 - speedEdgeGrip) * 0.6;
  const angulationRiskReduction = this.angulation * edgeRisk * 0.5;

  const conditionRisk = this.currentSnowCondition.type === 'ice' ?
    this.currentSnowCondition.intensity * 0.4 : 0;

  let targetRisk = (speedRisk * 0.3 + edgeRisk * 0.2 + gripDeficit * 0.2 +
                    speedEdgeMismatchRisk + conditionRisk - angulationRiskReduction) *
    (1 + speedRisk) * (1 - this.flowState * 0.2);

  if (this.isRecovering) {
    targetRisk *= 0.3;
  }

  this.riskLevel = THREE.MathUtils.lerp(this.riskLevel, targetRisk, 5 * dt);
  this.riskLevel = THREE.MathUtils.clamp(this.riskLevel, 0, 1);

  let modifiedGrip = finalGrip;

  // High risk effects
  if (this.riskLevel > 0.5) {
    const wobbleIntensity = (this.riskLevel - 0.5) * 2;
    const time = performance.now() / 1000;
    const wobbleFreq1 = Math.sin(time * 8.3) * 0.6;
    const wobbleFreq2 = Math.sin(time * 12.7) * 0.4;
    const targetWobble = wobbleIntensity * (wobbleFreq1 + wobbleFreq2) * 0.08;

    this.wobbleAmount = THREE.MathUtils.lerp(this.wobbleAmount, targetWobble, 10 * dt);
    this.headingVelocity += this.wobbleAmount * speed2D * 0.08;

    if (this.riskLevel > 0.8) {
      const gripPenalty = (this.riskLevel - 0.8) * 0.4;
      modifiedGrip *= (1 - gripPenalty);
    }
  } else {
    this.wobbleAmount *= 0.85;
  }

  // Recovery state management
  if (this.riskLevel > 0.9 && !this.isRecovering) {
    this.isRecovering = true;
    this.recoveryTime = 0.5;
  }

  if (this.isRecovering) {
    this.recoveryTime -= dt;
    if (this.recoveryTime <= 0) {
      this.isRecovering = false;
    }
  }

  return modifiedGrip;
}

/**
 * Apply carve acceleration (pumping physics)
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} speed2D - Current 2D speed
 * @param {THREE.Vector3} forward - Forward direction
 */
export function applyCarveAcceleration(dt, absEdge, speed2D, forward) {
  if (this.carveRailStrength > 0.3 && this.carvePerfection > 0.5) {
    const gForce = (speed2D * speed2D) / (this.sidecutRadius / Math.max(Math.sin(absEdge), 0.1));
    const normalizedG = Math.min(gForce / 100, 1);

    const flowBonus = 1 + this.flowState * 0.5;
    const angulationBonus = 1 + this.angulation * 0.3;
    const carveAccel = normalizedG * this.carveRailStrength * this.carvePerfection * 2.0 *
                        flowBonus * angulationBonus;
    this.velocity.x += forward.x * carveAccel * dt;
    this.velocity.z += forward.z * carveAccel * dt;
  }

  // Board flex energy boost during sustained carves
  if (this.boardFlex > 0.3 && this.flexEnergy > 0.3) {
    const flexPush = this.flexEnergy * this.boardFlex * 0.5 * dt;
    this.velocity.x += forward.x * flexPush;
    this.velocity.z += forward.z * flexPush;
  }
}

/**
 * Update flow state
 * @param {number} dt - Delta time
 */
export function updateFlowState(dt) {
  const targetFlow = Math.min(this.flowMomentum, 1.0);
  this.flowState = THREE.MathUtils.lerp(this.flowState, targetFlow, 3 * dt);
  this.flowMomentum = Math.max(0, this.flowMomentum - this.flowDecayRate * dt);
}

/**
 * Update turn physics with inertia
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} edgeSign - Sign of edge angle
 * @param {number} speed2D - Current 2D speed
 */
export function updateTurnPhysics(dt, absEdge, edgeSign, speed2D) {
  if (speed2D > 0.5) {
    let targetAngularVel = 0;

    if (absEdge > 0.05) {
      const sinEdge = Math.sin(absEdge);
      const turnRadius = this.sidecutRadius / Math.max(sinEdge, 0.1);
      const baseAngularVel = (speed2D / turnRadius) * 1.3;
      targetAngularVel = baseAngularVel * edgeSign;
    }

    // Turn inertia system
    const speedInertia = 1 + speed2D * 0.03;
    const railInertia = 1 + this.smoothedRailStrength * 0.8;
    const totalInertia = speedInertia * railInertia;
    const turnResponseRate = 8 / totalInertia;

    // Track turn momentum
    if (Math.abs(targetAngularVel) > 0.3) {
      const momentumBuild = Math.sign(targetAngularVel) * 0.5 * dt;
      this.turnInertia = THREE.MathUtils.clamp(
        this.turnInertia + momentumBuild,
        -1, 1
      );
    } else {
      this.turnInertia *= (1 - 2 * dt);
    }

    const momentumContribution = this.turnInertia * 0.3;

    this.headingVelocity = THREE.MathUtils.lerp(
      this.headingVelocity,
      targetAngularVel + momentumContribution,
      turnResponseRate * dt
    );

    // Soft clamp max turn rate
    const maxTurnRate = 3.5;
    if (Math.abs(this.headingVelocity) > maxTurnRate) {
      this.headingVelocity *= 0.95;
    }

    this.heading += this.headingVelocity * dt;
  } else {
    this.headingVelocity *= 0.85;
    this.heading += this.input.steer * 2.5 * dt;
    this.turnInertia *= 0.9;
  }
}
