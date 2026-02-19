import * as THREE from 'three';
import { getConfig } from './PhysicsConfig.js';

/**
 * CarvePhysics - All carving physics systems
 *
 * Contains: edge control, angulation, board flex, arc tracking,
 * edge bite, carve rail, grip system, wash-out, edge catch, flow state
 *
 * NOTE: Physics parameters are read from PhysicsConfig.js for easy tuning.
 * Press '~' in-game to open the tuning panel.
 */

/**
 * Update edge angle based on input with spring-damper physics
 * @param {number} dt - Delta time
 * @param {number} maxEdge - Maximum edge angle in radians (overridden by config)
 */
export function updateEdgeAngle(dt, maxEdge = 1.15) {
  // Read tunable parameters from config
  const cfgMaxEdge = getConfig('edge.maxEdgeAngle') || maxEdge;
  const cfgSpringBase = getConfig('edge.edgeSpringBase') || 70;
  const cfgSpringEngaging = getConfig('edge.edgeSpringEngaging') || 90;
  const cfgDampBase = getConfig('edge.edgeDampingBase') || 8;
  const cfgDampRailBonus = getConfig('edge.edgeDampingRailBonus') || 6;
  const cfgBiteImpulse = getConfig('edge.biteImpulse') || 15;
  const cfgLeanBonus = getConfig('edge.leanEdgeBonus') || 0.15;
  const cfgLeanPenalty = getConfig('edge.leanEdgePenalty') || 0.2;

  // Flip steer when switch so A/D still work correctly
  const steer = this.ridingSwitch ? -this.input.steer : this.input.steer;

  // Forward lean increases edge commitment, back weight loosens it
  const leanBonus = this.input.lean > 0 ? this.input.lean * cfgLeanBonus : 0;
  const leanPenalty = this.input.lean < 0 ? Math.abs(this.input.lean) * cfgLeanPenalty : 0;
  const effectiveMaxEdge = cfgMaxEdge * (1 + leanBonus - leanPenalty);

  this.targetEdgeAngle = steer * effectiveMaxEdge;

  // Dynamic spring-damper based on edge engagement
  // Smoother response overall with slight boost when initiating
  const isEngaging = Math.abs(this.edgeAngle) < 0.3 && Math.abs(steer) > 0.3;
  const baseSpring = isEngaging ? cfgSpringEngaging * 0.8 : cfgSpringBase * 0.75;
  const edgeSpring = baseSpring + this.smoothedRailStrength * 8;
  const edgeDamp = cfgDampBase * 1.2 + this.smoothedRailStrength * cfgDampRailBonus;

  const edgeError = this.targetEdgeAngle - this.edgeAngle;
  const springForce = edgeError * edgeSpring;
  const dampForce = -this.edgeVelocity * edgeDamp;

  // Softer initial "bite" impulse when first engaging edge
  let biteImpulse = 0;
  if (isEngaging && Math.abs(edgeError) > 0.25) {
    biteImpulse = Math.sign(edgeError) * cfgBiteImpulse * 0.7;
  }

  const edgeAccel = springForce + dampForce + biteImpulse;

  // Smooth the edge velocity changes slightly
  const smoothedAccel = edgeAccel * 0.85;
  this.edgeVelocity += smoothedAccel * dt;
  this.edgeAngle += this.edgeVelocity * dt;

  // Soft clamp edge angle
  if (Math.abs(this.edgeAngle) > cfgMaxEdge) {
    this.edgeAngle = Math.sign(this.edgeAngle) * cfgMaxEdge;
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
  // More flex from higher G-force (deeper carve + more speed)
  const gForceLoad = this.currentGForce || 1.0;
  const carveLoad = absEdge * speed2D * 0.025 * (1 + this.carveRailStrength) * Math.sqrt(gForceLoad);
  const targetFlex = Math.min(carveLoad, 1.2);

  // Flex builds during carves with progressive stiffness
  // Deeper into the carve = stiffer response (board loaded up)
  const dynamicStiffness = this.flexStiffness * (1 + this.boardFlex * 0.5);
  this.boardFlex = THREE.MathUtils.lerp(this.boardFlex, targetFlex, dynamicStiffness * dt);

  // Accumulate flex energy (like winding a spring)
  if (this.boardFlex > 0.2 && absEdge > 0.35) {
    // Energy gain scales with G-force - harder carve = more stored energy
    const gForceBonus = Math.max(1, gForceLoad);
    const energyGain = this.boardFlex * this.carvePerfection * gForceBonus * dt * 1.0;
    this.flexEnergy = Math.min(this.flexEnergy + energyGain, this.maxFlexEnergy);
  }

  // Slow energy decay when not actively flexing (board unloading)
  if (this.boardFlex < 0.2) {
    this.flexEnergy = Math.max(0, this.flexEnergy - 0.3 * dt);
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
 * @param {number} speed2D - Current 2D speed
 */
export function updateEdgeBite(dt, absEdge, speed2D = 0) {
  if (absEdge > this.carveRailThreshold && this.smoothedRailStrength > 0.3) {
    // Edge bite builds progressively - deeper edge + higher speed = faster bite
    const depthFactor = (absEdge - this.carveRailThreshold) * 2;
    const speedFactor = Math.min(speed2D / 20, 1.5);

    // Bite builds faster with good angulation, perfection, and G-force
    const gForceFactor = Math.max(1, (this.currentGForce || 1) * 0.8);
    const biteGain = this.edgeBiteRate * depthFactor * speedFactor *
                     this.angulation * this.carvePerfection * gForceFactor * dt;

    this.edgeBite = Math.min(this.edgeBite + biteGain, this.maxEdgeBite);

    // === PRESSURE-ENHANCED BITE ===
    // Forward pressure drives the edge deeper into the snow
    if (this.input.lean > 0.2 && absEdge > 0.5) {
      const pressureBiteBonus = this.input.lean * 0.5 * dt;
      this.edgeBite = Math.min(this.edgeBite + pressureBiteBonus, this.maxEdgeBite);
    }
  } else {
    // Bite decays smoothly when not in deep carve
    this.edgeBite = Math.max(0, this.edgeBite - 1.8 * dt);
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

  // Expose timing multiplier for UI feedback
  this.lastTimingMultiplier = timingMultiplier;

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

    // Flow state update - faster buildup for sustained rhythm
    const flowGain = this.flowBuildRate * 1.2 * arcShapeMultiplier * timingMultiplier *
                     (1 + this.carvePerfection);
    this.flowMomentum = Math.min(this.flowMomentum + flowGain, 1.5);
  } else if (!cleanCarve || this.arcType === 'wiggle') {
    this.carveChainCount = Math.max(0, this.carveChainCount - 1);
    this.flowMomentum = Math.max(0, this.flowMomentum - 0.2);
  } else if (!goodTiming) {
    this.flowMomentum = Math.max(0, this.flowMomentum - 0.1);
  }

  const chainMultiplier = 1.0 + this.carveChainCount * 0.08;

  // === REFINED TRANSITION MECHANICS ===
  // In real carving, edge-to-edge transitions maintain momentum, not add thrust
  // The "pop" feeling comes from weight shift, not forward acceleration
  const flexBoost = this.flexEnergy * 1.2;  // Reduced - flex maintains speed, doesn't add it
  const arcBonus = completedArc ? 1.0 : 0.7;

  // Small momentum maintenance from clean transitions
  const cleanTransitionBonus = cleanCarve ? 0.5 : 0;

  // Combine - much more subtle than before
  // This is about maintaining flow, not launching forward
  const baseMomentum = transitionSpeed * speedBonus * 0.8;
  this.edgeTransitionBoost = (baseMomentum + flexBoost + cleanTransitionBonus) *
                              chainMultiplier * arcBonus * arcShapeMultiplier *
                              timingMultiplier * (1 + this.flowState * 0.2);

  // Cap the boost to prevent flying off
  this.edgeTransitionBoost = Math.min(this.edgeTransitionBoost, 3.0);

  // Subtle compression change - not a dramatic pop
  this.targetCompression = Math.max(this.targetCompression - 0.05, 0);

  this.lastEdgeChangeTime = 0;

  // Carve energy from good edge changes
  const carveQuality = Math.min(1, this.peakEdgeAngle / 0.8) * arcBonus;
  this.carveEnergy = Math.min(this.carveEnergy + 0.35 * carveQuality * chainMultiplier, 1.5);

  // Release flex energy on transition
  this.flexEnergy *= 0.25;
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
 * More subtle application - maintains momentum rather than thrusting forward
 * @param {number} dt - Delta time
 * @param {THREE.Vector3} forward - Forward direction
 */
export function applyEdgeTransitionBoost(dt, forward) {
  if (this.edgeTransitionBoost > 0.02) {
    // Gentler application rate - smooth momentum maintenance
    const boostApplication = this.edgeTransitionBoost * dt * 3;
    this.velocity.x += forward.x * boostApplication;
    this.velocity.z += forward.z * boostApplication;
    // Smoother decay
    this.edgeTransitionBoost *= Math.pow(0.3, dt);
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
  // Read tunable parameters from config
  const cfgBaseGrip = getConfig('grip.baseGrip') || 0.7;
  const cfgEdgeGripMult = getConfig('grip.edgeGripMultiplier') || 0.3;
  const cfgRailGripBonus = getConfig('grip.railGripBonus') || 0.15;
  const cfgBiteGripBonus = getConfig('grip.biteGripBonus') || 0.12;
  const cfgAngulationGripMult = getConfig('grip.angulationGripMultiplier') || 0.15;
  const cfgFlowGripBonus = getConfig('grip.flowGripBonus') || 0.08;
  const cfgMaxGrip = getConfig('grip.maxGrip') || 0.98;

  const baseGrip = cfgBaseGrip;
  const edgeGrip = absEdge * cfgEdgeGripMult;
  const railGrip = this.carveRailStrength * cfgRailGripBonus;
  const biteGrip = this.edgeBite * cfgBiteGripBonus;
  const angulationGrip = this.angulation * absEdge * cfgAngulationGripMult;

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

  // Handle wash out consequences - gradual grip loss instead of abrupt cap
  if (this.isWashingOut) {
    updateWashOutConsequences.call(this, dt, right, speedEdgeGrip);
    // Gradual grip reduction based on wash-out intensity instead of hard cap
    const washOutGripCap = 0.25 + (1 - this.washOutIntensity) * 0.35;
    speedEdgeGrip = Math.min(speedEdgeGrip, washOutGripCap);
  }

  // Calculate base grip before snow condition
  let calculatedGrip = (baseGrip + edgeGrip + railGrip + biteGrip + angulationGrip) * speedEdgeGrip;

  // Apply snow condition modifier
  const snowGripMod = this.currentSnowCondition.gripMultiplier;
  calculatedGrip *= snowGripMod;

  // Flow state grip bonus
  const flowGripBonus = this.flowState * cfgFlowGripBonus;
  calculatedGrip += flowGripBonus;

  let targetGrip = THREE.MathUtils.clamp(calculatedGrip, 0.3, cfgMaxGrip);

  // Smooth grip transitions - slower rates for more natural feel
  // Grip loss is slightly faster than grip gain (feels more realistic)
  const gripDelta = Math.abs(targetGrip - this.smoothedGrip);
  const baseRate = targetGrip < this.smoothedGrip ? 6 : 4;
  // Larger changes smooth more slowly to prevent jerky grip shifts
  const adaptiveRate = baseRate * (1 - gripDelta * 0.5);
  this.smoothedGrip = THREE.MathUtils.lerp(this.smoothedGrip, targetGrip, Math.max(adaptiveRate, 2) * dt);

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
  // Use smoothed turn radius for stable G-force calculation
  const turnRadius = this.smoothedTurnRadius || (this.sidecutRadius / Math.max(Math.sin(absEdge), 0.15));
  const rawGForce = (speed2D * speed2D) / (turnRadius * 9.81);

  // Smooth the G-force to prevent spiky acceleration
  if (this.smoothedGForce === undefined) {
    this.smoothedGForce = 1.0;
  }
  this.smoothedGForce = THREE.MathUtils.lerp(this.smoothedGForce, rawGForce, 6 * dt);
  const normalizedG = Math.min(this.smoothedGForce, 3.0);  // Cap at 3G

  // Store G-force for animation/UI feedback
  this.currentGForce = normalizedG;

  if (this.carveRailStrength > 0.3 && this.carvePerfection > 0.5) {
    // === ENHANCED G-FORCE PUMPING ===
    // The "pump" comes from carving hard and using the G-force
    const flowBonus = 1 + this.flowState * 0.6;
    const angulationBonus = 1 + this.angulation * 0.4;

    // Pressure-based acceleration - forward lean drives harder
    const pressureBonus = this.input.lean > 0 ? 1 + this.input.lean * 0.5 : 1;

    // Progressive G-force acceleration - higher G = more pump potential
    const gForceCurve = normalizedG > 1.0 ? 1.0 + (normalizedG - 1.0) * 0.8 : normalizedG;

    const carveAccel = gForceCurve * this.carveRailStrength * this.carvePerfection * 2.5 *
                        flowBonus * angulationBonus * pressureBonus;
    this.velocity.x += forward.x * carveAccel * dt;
    this.velocity.z += forward.z * carveAccel * dt;
  }

  // Board flex energy boost during sustained carves
  if (this.boardFlex > 0.3 && this.flexEnergy > 0.3) {
    const flexPush = this.flexEnergy * this.boardFlex * 0.6 * dt;
    this.velocity.x += forward.x * flexPush;
    this.velocity.z += forward.z * flexPush;
  }

  // === EDGE BITE ACCELERATION ===
  // Deep sustained edge builds grip that translates to forward drive
  if (this.edgeBite > 0.5 && absEdge > 0.5) {
    const biteAccel = (this.edgeBite - 0.5) * this.carvePerfection * 1.2 * dt;
    this.velocity.x += forward.x * biteAccel;
    this.velocity.z += forward.z * biteAccel;
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
 * Hockey stop physics - pressing S + A/D turns board perpendicular and scrubs speed
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} edgeSign - Sign of edge angle
 * @param {number} speed2D - Current 2D speed
 * @param {THREE.Vector3} forward - Forward direction
 * @param {THREE.Vector3} right - Right direction
 * @returns {object} Hockey stop state { isActive, slipAngle, frictionForce }
 */
export function updateHockeyStop(dt, absEdge, edgeSign, speed2D, forward, right) {
  // Check if hockey stop conditions are met: S pressed + A or D pressed
  const isBraking = this.input.lean < -0.2;
  const hasSteering = Math.abs(this.input.steer) > 0.2;

  if (!isBraking || !hasSteering || speed2D < 2) {
    // Decay hockey stop state
    if (this.hockeyStopStrength > 0) {
      this.hockeyStopStrength = Math.max(0, this.hockeyStopStrength - 3 * dt);
    }
    return { isActive: false, slipAngle: 0, frictionForce: 0 };
  }

  // Initialize hockey stop state if needed
  if (this.hockeyStopStrength === undefined) {
    this.hockeyStopStrength = 0;
  }

  // Build hockey stop strength based on input intensity
  const brakeIntensity = Math.abs(this.input.lean + 0.2) / 0.8;  // 0 to 1
  const steerIntensity = Math.abs(this.input.steer);  // 0 to 1
  const combinedIntensity = brakeIntensity * steerIntensity;

  // Ramp up hockey stop strength
  this.hockeyStopStrength = THREE.MathUtils.lerp(
    this.hockeyStopStrength,
    combinedIntensity,
    4 * dt
  );

  // Calculate current slip angle (angle between velocity and board heading)
  const velHeading = Math.atan2(-this.velocity.x, this.velocity.z);
  const currentSlipAngle = this.normalizeAngle(velHeading - this.heading);

  // Target slip angle for hockey stop (perpendicular = 90 degrees = PI/2)
  // Direction based on steering input
  const targetSlipAngle = edgeSign * Math.PI * 0.45 * this.hockeyStopStrength;

  // Increase heading rotation to bring board perpendicular
  // This makes the board "swing out" for the hockey stop
  const swingRate = this.hockeyStopStrength * 4.0;  // Rotation speed
  const headingPush = edgeSign * swingRate * brakeIntensity;
  this.headingVelocity += headingPush * dt;

  // Calculate friction from sideways sliding
  // More perpendicular = more friction = more speed scrub
  const slipAngleMag = Math.abs(currentSlipAngle);
  const frictionCoeff = 0.4 + this.hockeyStopStrength * 0.3;  // 0.4 to 0.7
  const frictionForce = slipAngleMag * frictionCoeff * speed2D * this.hockeyStopStrength;

  // Apply friction to reduce speed
  const speedReduction = frictionForce * dt * 1.5;
  const velocityMag = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
  if (velocityMag > speedReduction) {
    const scale = (velocityMag - speedReduction) / velocityMag;
    this.velocity.x *= scale;
    this.velocity.z *= scale;
  }

  // Visual feedback - defensive crouch
  this.targetCompression = Math.max(this.targetCompression, this.hockeyStopStrength * 0.5);

  // Reduce carve rail strength during hockey stop
  this.carveRailStrength *= (1 - this.hockeyStopStrength * 0.8);

  return {
    isActive: true,
    slipAngle: currentSlipAngle,
    frictionForce: frictionForce
  };
}

/**
 * Calculate smoothed turn radius from edge angle
 * Uses a smoother curve to prevent volatile radius changes at shallow angles
 * @param {number} absEdge - Absolute edge angle in radians
 * @param {number} sidecutRadius - Board sidecut radius
 * @returns {number} Smoothed turn radius
 */
function calculateSmoothedTurnRadius(absEdge, sidecutRadius) {
  // At shallow angles, sin(edge) approaches 0 causing volatile radius
  // Use a blended approach: at shallow angles, use linear relationship
  // At deeper angles, use proper sin-based physics

  const shallowThreshold = 0.25; // ~14 degrees

  if (absEdge < shallowThreshold) {
    // Linear blend for shallow angles - prevents jumpy radius
    // Maps 0-0.25 rad to very wide turns smoothly
    const t = absEdge / shallowThreshold;
    const shallowRadius = sidecutRadius / 0.25; // radius at threshold
    const veryWideRadius = sidecutRadius * 8;   // radius when nearly flat
    return THREE.MathUtils.lerp(veryWideRadius, shallowRadius, t * t); // quadratic ease
  } else {
    // Standard physics for deeper edges
    const sinEdge = Math.sin(absEdge);
    return sidecutRadius / Math.max(sinEdge, 0.25);
  }
}

/**
 * Update turn physics with inertia
 *
 * Real carving physics: The sidecut geometry creates a natural arc when the board
 * is tilted on edge. At higher speeds, centripetal force physics dominate.
 * At lower speeds, direct body movement and weight shift control the turn.
 *
 * @param {number} dt - Delta time
 * @param {number} absEdge - Absolute edge angle
 * @param {number} edgeSign - Sign of edge angle
 * @param {number} speed2D - Current 2D speed
 */
export function updateTurnPhysics(dt, absEdge, edgeSign, speed2D) {
  // Initialize smoothed turn radius if needed
  if (this.smoothedTurnRadius === undefined) {
    this.smoothedTurnRadius = 50;
  }

  // Flip turn direction when switch
  const turnMult = this.ridingSwitch ? -1 : 1;

  // === DIRECT CONTROL COMPONENT ===
  // At low speeds (or any speed), edge angle directly influences heading
  // This is the "body steering" that happens in real snowboarding
  // More prominent at low speeds, fades as physics-based turning takes over
  const directControlStrength = Math.max(0, 1 - speed2D / 12); // Full at 0, gone by 12 m/s
  const directTurnRate = absEdge * edgeSign * turnMult * 2.5 * (1 + directControlStrength);

  if (speed2D > 0.3) {
    let physicsAngularVel = 0;

    if (absEdge > 0.03) {
      // Calculate target turn radius with smooth curve
      const targetRadius = calculateSmoothedTurnRadius(absEdge, this.sidecutRadius);

      // Smooth the turn radius to prevent jerky changes
      const radiusSmoothRate = absEdge > 0.3 ? 8 : 4;
      this.smoothedTurnRadius = THREE.MathUtils.lerp(
        this.smoothedTurnRadius,
        targetRadius,
        radiusSmoothRate * dt
      );

      // Physics-based turn rate from speed and radius
      const baseAngularVel = (speed2D / this.smoothedTurnRadius) * 1.2;
      physicsAngularVel = baseAngularVel * edgeSign * turnMult;

      // === PRESSURE-BASED TURN TIGHTENING ===
      if (this.input.lean > 0) {
        const pressureTightening = 1 + this.input.lean * 0.25;
        physicsAngularVel *= pressureTightening;
      }

      // === RAIL LOCK TURN BOOST ===
      if (this.smoothedRailStrength > 0.5) {
        const railTurnBoost = 1 + (this.smoothedRailStrength - 0.5) * 0.25;
        physicsAngularVel *= railTurnBoost;
      }
    } else {
      this.smoothedTurnRadius = THREE.MathUtils.lerp(this.smoothedTurnRadius, 80, 2 * dt);
    }

    // Blend physics-based and direct control based on speed
    // Low speed = more direct control, high speed = more physics
    const physicsWeight = Math.min(speed2D / 10, 1);
    const directWeight = 1 - physicsWeight * 0.7; // Direct control never fully disappears

    let targetAngularVel = physicsAngularVel * physicsWeight + directTurnRate * directWeight;

    // Turn inertia - smoother momentum buildup at higher speeds
    const speedInertia = 1 + speed2D * 0.02;
    const railInertia = 1 + this.smoothedRailStrength * 0.5;
    const totalInertia = speedInertia * railInertia;
    const turnResponseRate = 10 / totalInertia;

    // Track turn momentum
    if (Math.abs(targetAngularVel) > 0.2) {
      const momentumBuild = Math.sign(targetAngularVel) * 0.4 * dt;
      this.turnInertia = THREE.MathUtils.clamp(
        this.turnInertia + momentumBuild,
        -1.0, 1.0
      );
    } else {
      this.turnInertia *= (1 - 2 * dt);
    }

    const momentumContribution = this.turnInertia * (0.2 + this.flowState * 0.1);

    this.headingVelocity = THREE.MathUtils.lerp(
      this.headingVelocity,
      targetAngularVel + momentumContribution,
      turnResponseRate * dt
    );

    // Soft clamp max turn rate
    const maxTurnRate = 3.0 + this.smoothedRailStrength * 0.4;
    if (Math.abs(this.headingVelocity) > maxTurnRate) {
      this.headingVelocity *= 0.97;
    }

    this.heading += this.headingVelocity * dt;
  } else {
    // Very low speed - pure direct control, very responsive
    this.headingVelocity *= 0.8;
    this.heading += directTurnRate * dt;
    this.turnInertia *= 0.85;
    this.smoothedTurnRadius = THREE.MathUtils.lerp(this.smoothedTurnRadius, 50, 2 * dt);
  }
}
