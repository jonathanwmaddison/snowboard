/**
 * @fileoverview CarvePhysicsPure - Pure functional carving physics.
 *
 * This module contains pure functions that operate on explicit state objects
 * instead of using `this` binding. This makes the functions:
 * - Testable in isolation
 * - Tree-shakeable
 * - Easier to understand (dependencies are explicit)
 * - Reusable across different contexts
 *
 * Each function takes state slices as parameters and returns updated state
 * or computed values. Functions do not mutate input state directly.
 */

import * as THREE from 'three';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** @type {Object} Default physics configuration */
export const CARVE_CONFIG = {
  // Edge physics
  maxEdge: 1.15,
  edgeSpring: 70,
  baseDamping: 8,
  railDampingBonus: 5,

  // Rail system
  railThreshold: 0.5,
  railBuildRate: 2.0,
  railDecayRate: 3.0,

  // Grip
  baseGrip: 0.7,
  maxGrip: 0.98,
  edgeGripFactor: 0.3,
  railGripBonus: 0.15,
  biteGripBonus: 0.12,
  angulationGripBonus: 0.08,
  flowGripBonus: 0.08,

  // Transition timing
  sweetSpotCenter: 0.8,
  sweetSpotRadius: 0.4,
  panicThreshold: 0.3,
  slowThreshold: 1.8,

  // Arc classification (degrees)
  cTurnThreshold: 60,
  jTurnThreshold: 30,

  // Flow
  flowBuildRate: 0.15,
  flowDecayRate: 0.3,
  flowQualityThreshold: 0.7,

  // Risk
  washOutSpeedThreshold: 8,
  edgeCatchThreshold: 0.4,
};

// =============================================================================
// EDGE ANGLE PHYSICS
// =============================================================================

/**
 * Calculate target edge angle from input
 *
 * @param {number} steerInput - Steering input (-1 to 1)
 * @param {number} leanInput - Lean input (-1 to 1)
 * @param {boolean} ridingSwitch - Whether riding switch
 * @param {number} maxEdge - Maximum edge angle (radians)
 * @returns {number} Target edge angle (radians)
 */
export function calculateTargetEdge(steerInput, leanInput, ridingSwitch, maxEdge = CARVE_CONFIG.maxEdge) {
  const effectiveSteer = ridingSwitch ? -steerInput : steerInput;
  const leanBonus = Math.max(0, leanInput) * 0.1;
  return effectiveSteer * maxEdge * (1 + leanBonus);
}

/**
 * Update edge angle using spring-damper physics
 *
 * @param {Object} edgeState - Current edge state
 * @param {number} edgeState.edgeAngle - Current edge angle
 * @param {number} edgeState.targetEdgeAngle - Target edge angle
 * @param {number} edgeState.edgeVelocity - Current edge velocity
 * @param {number} railStrength - Current rail strength for damping
 * @param {number} dt - Delta time (seconds)
 * @param {number} maxEdge - Maximum edge angle
 * @returns {Object} Updated edge state { edgeAngle, edgeVelocity }
 */
export function updateEdgeAngle(edgeState, railStrength, dt, maxEdge = CARVE_CONFIG.maxEdge) {
  const { edgeAngle, targetEdgeAngle, edgeVelocity } = edgeState;

  // Spring-damper coefficients
  const spring = CARVE_CONFIG.edgeSpring;
  const damp = CARVE_CONFIG.baseDamping + railStrength * CARVE_CONFIG.railDampingBonus;

  // Calculate forces
  const error = targetEdgeAngle - edgeAngle;
  const springForce = error * spring;
  const dampForce = -edgeVelocity * damp;
  const totalForce = springForce + dampForce;

  // Integrate
  let newVelocity = edgeVelocity + totalForce * dt;
  let newAngle = edgeAngle + newVelocity * dt;

  // Soft clamp
  if (Math.abs(newAngle) > maxEdge) {
    newAngle = Math.sign(newAngle) * maxEdge;
    newVelocity *= 0.5;
  }

  return {
    edgeAngle: newAngle,
    edgeVelocity: newVelocity,
  };
}

// =============================================================================
// CARVE RAIL SYSTEM
// =============================================================================

/**
 * Update carve rail engagement
 *
 * @param {Object} railState - Current rail state
 * @param {number} railState.carveRailStrength - Current rail strength
 * @param {number} railState.carveHoldTime - Time in current carve
 * @param {number} railState.smoothedRailStrength - Smoothed rail strength
 * @param {number} absEdge - Absolute edge angle
 * @param {number} threshold - Rail engagement threshold
 * @param {number} dt - Delta time
 * @returns {Object} Updated rail state
 */
export function updateCarveRail(railState, absEdge, threshold, dt) {
  const { carveRailStrength, carveHoldTime, smoothedRailStrength } = railState;

  let newStrength = carveRailStrength;
  let newHoldTime = carveHoldTime;

  if (absEdge > threshold) {
    // Build rail strength
    newHoldTime += dt;
    const targetStrength = Math.min(1.0, absEdge / CARVE_CONFIG.maxEdge);
    const buildRate = CARVE_CONFIG.railBuildRate * (1 + newHoldTime * 0.5);
    newStrength = Math.min(1.0, newStrength + (targetStrength - newStrength) * buildRate * dt);
  } else {
    // Decay rail strength
    newHoldTime = 0;
    newStrength = Math.max(0, newStrength - CARVE_CONFIG.railDecayRate * dt);
  }

  // Smooth the rail strength for physics calculations
  const newSmoothed = THREE.MathUtils.lerp(smoothedRailStrength, newStrength, 5 * dt);

  return {
    carveRailStrength: newStrength,
    carveHoldTime: newHoldTime,
    smoothedRailStrength: newSmoothed,
  };
}

// =============================================================================
// GRIP CALCULATION
// =============================================================================

/**
 * Calculate total grip coefficient
 *
 * @param {Object} params - Grip calculation parameters
 * @param {number} params.absEdge - Absolute edge angle
 * @param {number} params.railStrength - Carve rail strength
 * @param {number} params.edgeBite - Edge bite level
 * @param {number} params.angulation - Angulation level
 * @param {number} params.flowState - Flow state level
 * @param {number} params.snowGripMultiplier - Snow condition multiplier
 * @returns {Object} Grip breakdown { totalGrip, breakdown }
 */
export function calculateGrip(params) {
  const {
    absEdge,
    railStrength,
    edgeBite,
    angulation,
    flowState,
    snowGripMultiplier = 1.0,
  } = params;

  // Base grip
  const base = CARVE_CONFIG.baseGrip;

  // Edge angle contribution
  const edgeGrip = absEdge * CARVE_CONFIG.edgeGripFactor;

  // Rail engagement bonus
  const railGrip = railStrength * CARVE_CONFIG.railGripBonus;

  // Edge bite bonus
  const biteGrip = edgeBite * CARVE_CONFIG.biteGripBonus;

  // Angulation bonus
  const angGrip = angulation * CARVE_CONFIG.angulationGripBonus;

  // Flow state bonus
  const flowGrip = flowState * CARVE_CONFIG.flowGripBonus;

  // Calculate total
  const rawGrip = (base + edgeGrip + railGrip + biteGrip + angGrip + flowGrip) * snowGripMultiplier;
  const totalGrip = Math.min(rawGrip, CARVE_CONFIG.maxGrip);

  return {
    totalGrip,
    breakdown: {
      base,
      edge: edgeGrip,
      rail: railGrip,
      bite: biteGrip,
      angulation: angGrip,
      flow: flowGrip,
      snow: snowGripMultiplier,
    },
  };
}

// =============================================================================
// ANGULATION SYSTEM
// =============================================================================

/**
 * Calculate required angulation based on edge angle and speed
 *
 * @param {number} absEdge - Absolute edge angle
 * @param {number} speed - Current speed (m/s)
 * @returns {number} Required angulation (0-1)
 */
export function calculateRequiredAngulation(absEdge, speed) {
  const angulationNeeded = (absEdge * speed) / 25;
  return Math.min(angulationNeeded, 1.0);
}

/**
 * Update angulation capacity based on input smoothness
 *
 * @param {number} currentCapacity - Current angulation capacity
 * @param {number} edgeChangeRate - Rate of edge change (rad/s)
 * @param {number} dt - Delta time
 * @returns {number} Updated capacity (0.4-1.0)
 */
export function updateAngulationCapacity(currentCapacity, edgeChangeRate, dt) {
  const smoothnessThreshold = 3.0;

  if (edgeChangeRate > smoothnessThreshold) {
    const jerkPenalty = (edgeChangeRate - smoothnessThreshold) * 0.3 * dt;
    return Math.max(0.4, currentCapacity - jerkPenalty);
  }

  return Math.min(1.0, currentCapacity + 0.8 * dt);
}

/**
 * Update angulation state
 *
 * @param {Object} angState - Angulation state
 * @param {number} absEdge - Absolute edge angle
 * @param {number} speed - Current speed
 * @param {number} edgeChangeRate - Rate of edge change
 * @param {number} dt - Delta time
 * @returns {Object} Updated angulation state
 */
export function updateAngulation(angState, absEdge, speed, edgeChangeRate, dt) {
  const targetAngulation = calculateRequiredAngulation(absEdge, speed);
  const newCapacity = updateAngulationCapacity(angState.angulationCapacity, edgeChangeRate, dt);
  const effectiveTarget = targetAngulation * newCapacity;
  const newAngulation = THREE.MathUtils.lerp(angState.angulation, effectiveTarget, 4 * dt);

  return {
    angulation: newAngulation,
    targetAngulation,
    angulationCapacity: newCapacity,
  };
}

// =============================================================================
// BOARD FLEX SYSTEM
// =============================================================================

/**
 * Update board flex state
 *
 * @param {Object} flexState - Current flex state
 * @param {number} absEdge - Absolute edge angle
 * @param {number} speed - Current speed
 * @param {number} railStrength - Carve rail strength
 * @param {number} carvePerfection - Carve perfection (0-1)
 * @param {number} dt - Delta time
 * @returns {Object} Updated flex state
 */
export function updateBoardFlex(flexState, absEdge, speed, railStrength, carvePerfection, dt) {
  const { boardFlex, flexEnergy, maxFlexEnergy, flexStiffness } = flexState;

  // Calculate target flex based on carving load
  const carveLoad = absEdge * speed * 0.02 * (1 + railStrength);
  const targetFlex = Math.min(carveLoad, 1.0);

  // Flex follows target with spring behavior
  const newFlex = THREE.MathUtils.lerp(boardFlex, targetFlex, flexStiffness * dt);

  // Accumulate flex energy during deep sustained carves
  let newEnergy = flexEnergy;
  if (newFlex > 0.2 && absEdge > 0.4) {
    const energyGain = newFlex * carvePerfection * dt * 0.8;
    newEnergy = Math.min(flexEnergy + energyGain, maxFlexEnergy);
  }

  return {
    boardFlex: newFlex,
    flexEnergy: newEnergy,
    maxFlexEnergy,
    flexStiffness,
  };
}

/**
 * Release flex energy on edge transition
 *
 * @param {Object} flexState - Current flex state
 * @returns {Object} { boost, updatedFlexState }
 */
export function releaseFlexEnergy(flexState) {
  const boost = flexState.flexEnergy * 2.5;
  return {
    boost,
    updatedFlexState: {
      ...flexState,
      flexEnergy: 0,
    },
  };
}

// =============================================================================
// FLOW STATE SYSTEM
// =============================================================================

/**
 * Update flow state based on carve quality
 *
 * @param {Object} flowState - Current flow state
 * @param {number} carveQuality - Quality of current carve (0-1)
 * @param {number} dt - Delta time
 * @returns {Object} Updated flow state
 */
export function updateFlowState(flowState, carveQuality, dt) {
  const { flowState: currentFlow, flowMomentum, flowBuildRate, flowDecayRate } = flowState;

  let newFlow = currentFlow;
  let newMomentum = flowMomentum;

  if (carveQuality > CARVE_CONFIG.flowQualityThreshold) {
    // Good carving builds flow
    const gain = flowBuildRate * carveQuality * dt;
    newFlow = Math.min(1.0, currentFlow + gain);
    newMomentum = Math.min(1.0, flowMomentum + gain * 0.5);
  } else {
    // Poor carving decays flow
    const decay = flowDecayRate * (1 - carveQuality) * dt;
    newFlow = Math.max(0, currentFlow - decay);
    newMomentum = Math.max(0, flowMomentum - decay * 0.3);
  }

  return {
    ...flowState,
    flowState: newFlow,
    flowMomentum: newMomentum,
  };
}

// =============================================================================
// ARC SHAPE TRACKING
// =============================================================================

/**
 * Update arc tracking state
 *
 * @param {Object} arcState - Current arc state
 * @param {number} heading - Current heading
 * @param {number} absEdge - Absolute edge angle
 * @returns {Object} Updated arc state
 */
export function updateArcTracking(arcState, heading, absEdge) {
  let { arcHeadingChange, arcStartHeading, arcType } = arcState;

  if (absEdge > 0.3) {
    if (arcHeadingChange === 0) {
      // Starting new arc
      arcStartHeading = heading;
    }
    arcHeadingChange = Math.abs(normalizeAngle(heading - arcStartHeading));
  }

  return {
    arcHeadingChange,
    arcStartHeading,
    arcType,
  };
}

/**
 * Classify arc shape and get multiplier
 *
 * @param {number} headingChange - Total heading change (radians)
 * @returns {Object} { type, multiplier }
 */
export function classifyArcShape(headingChange) {
  const degrees = Math.abs(headingChange) * (180 / Math.PI);

  if (degrees >= CARVE_CONFIG.cTurnThreshold) {
    return { type: 'c-turn', multiplier: 1.3 };
  }
  if (degrees >= CARVE_CONFIG.jTurnThreshold) {
    return { type: 'j-turn', multiplier: 1.0 };
  }
  return { type: 'wiggle', multiplier: 0.5 };
}

// =============================================================================
// EDGE BITE PROGRESSION
// =============================================================================

/**
 * Update edge bite state
 *
 * @param {Object} biteState - Current bite state
 * @param {number} absEdge - Absolute edge angle
 * @param {number} railStrength - Rail strength
 * @param {number} angulation - Angulation level
 * @param {number} carvePerfection - Carve perfection
 * @param {number} threshold - Rail threshold
 * @param {number} dt - Delta time
 * @returns {Object} Updated bite state
 */
export function updateEdgeBite(biteState, absEdge, railStrength, angulation, carvePerfection, threshold, dt) {
  const { edgeBite, edgeBiteRate, maxEdgeBite } = biteState;

  let newBite = edgeBite;

  if (absEdge > threshold && railStrength > 0.3) {
    const biteGain = edgeBiteRate * angulation * carvePerfection * dt;
    newBite = Math.min(edgeBite + biteGain, maxEdgeBite);
  } else {
    newBite = Math.max(0, edgeBite - 1.5 * dt);
  }

  return {
    edgeBite: newBite,
    edgeBiteRate,
    maxEdgeBite,
  };
}

// =============================================================================
// EDGE TRANSITION DETECTION
// =============================================================================

/**
 * Detect edge transition and calculate rewards
 *
 * @param {Object} transitionState - Current transition state
 * @param {number} currentEdgeSide - Current edge side (-1, 0, 1)
 * @param {number} absEdge - Absolute edge angle
 * @param {number} dt - Delta time
 * @returns {Object} { occurred, transitionState, timing }
 */
export function detectEdgeTransition(transitionState, currentEdgeSide, absEdge, dt) {
  const { previousEdgeSide, lastEdgeChangeTime } = transitionState;

  const newEdgeSide = absEdge > 0.15 ? currentEdgeSide : 0;
  const edgeSwitched =
    newEdgeSide !== 0 && previousEdgeSide !== 0 && newEdgeSide !== previousEdgeSide;

  if (edgeSwitched) {
    return {
      occurred: true,
      transitionState: {
        previousEdgeSide: newEdgeSide,
        edgeTransitionBoost: 0, // Will be calculated by caller
        lastEdgeChangeTime: 0,
      },
      timeSinceLastTransition: lastEdgeChangeTime,
    };
  }

  return {
    occurred: false,
    transitionState: {
      previousEdgeSide: newEdgeSide !== 0 ? newEdgeSide : previousEdgeSide,
      edgeTransitionBoost: Math.max(0, transitionState.edgeTransitionBoost - 2 * dt),
      lastEdgeChangeTime: lastEdgeChangeTime + dt,
    },
    timeSinceLastTransition: lastEdgeChangeTime + dt,
  };
}

/**
 * Calculate transition timing multiplier
 *
 * @param {number} timeSinceLastTransition - Time since last transition (seconds)
 * @returns {number} Timing multiplier (0.4 to 1.175)
 */
export function calculateTransitionTiming(timeSinceLastTransition) {
  if (timeSinceLastTransition < CARVE_CONFIG.panicThreshold) {
    return 0.4; // Panic wiggling
  }

  if (timeSinceLastTransition > CARVE_CONFIG.slowThreshold) {
    return 0.5; // Lost momentum
  }

  const distanceFromOptimal = Math.abs(timeSinceLastTransition - CARVE_CONFIG.sweetSpotCenter);

  if (distanceFromOptimal <= CARVE_CONFIG.sweetSpotRadius) {
    const sweetSpotQuality = 1 - distanceFromOptimal / CARVE_CONFIG.sweetSpotRadius;
    return 1.0 + sweetSpotQuality * 0.175;
  }

  return 1.0;
}

// =============================================================================
// CARVE CHAIN SYSTEM
// =============================================================================

/**
 * Evaluate carve quality and update chain
 *
 * @param {Object} chainState - Current chain state
 * @param {number} peakEdge - Peak edge angle in the carve
 * @param {number} holdTime - Time carve was held
 * @param {number} arcMultiplier - Arc shape multiplier
 * @returns {Object} Updated chain state with quality assessment
 */
export function updateCarveChain(chainState, peakEdge, holdTime, arcMultiplier) {
  const { carveChainCount, carveEnergy } = chainState;

  // Determine if this was a "clean" carve
  const isCleanCarve = peakEdge > 0.5 && holdTime > 0.3;

  let newChainCount = carveChainCount;
  let newEnergy = carveEnergy;

  if (isCleanCarve) {
    newChainCount = Math.min(10, carveChainCount + 1);
    newEnergy = Math.min(1.0, carveEnergy + 0.15 * arcMultiplier);
  } else {
    newChainCount = Math.max(0, carveChainCount - 1);
    newEnergy = Math.max(0, carveEnergy - 0.1);
  }

  // Calculate chain multiplier (1.0 to 2.0)
  const chainMultiplier = 1.0 + newChainCount * 0.1;

  return {
    ...chainState,
    carveChainCount: newChainCount,
    carveEnergy: newEnergy,
    isCleanCarve,
    chainMultiplier,
  };
}

/**
 * Update carve perfection metric
 *
 * @param {number} absEdge - Absolute edge angle
 * @param {number} railStrength - Rail strength
 * @param {number} angulation - Angulation level
 * @param {number} angulationCapacity - Angulation capacity
 * @returns {number} Carve perfection (0-1)
 */
export function calculateCarvePerfection(absEdge, railStrength, angulation, angulationCapacity) {
  // Factors that contribute to a "perfect" carve
  const edgeFactor = Math.min(1.0, absEdge / 0.8);
  const railFactor = railStrength;
  const angFactor = angulation * angulationCapacity;

  // Weighted average
  return edgeFactor * 0.4 + railFactor * 0.35 + angFactor * 0.25;
}

// =============================================================================
// TURN RADIUS CALCULATION
// =============================================================================

/**
 * Calculate effective turn radius from sidecut and edge angle
 *
 * @param {number} sidecutRadius - Board sidecut radius (meters)
 * @param {number} absEdge - Absolute edge angle (radians)
 * @param {number} flexModifier - Board flex modifier (0.8-1.2)
 * @param {number} pressureEffect - Pressure distribution effect (0.9-1.1)
 * @returns {number} Effective turn radius (meters)
 */
export function calculateTurnRadius(sidecutRadius, absEdge, flexModifier = 1, pressureEffect = 1) {
  if (absEdge < 0.01) {
    return Infinity;
  }

  const baseRadius = sidecutRadius * Math.cos(absEdge);
  const effectiveRadius = baseRadius * flexModifier * pressureEffect;

  return Math.max(effectiveRadius, 1.5);
}

/**
 * Calculate G-force from turn
 *
 * @param {number} speed - Speed (m/s)
 * @param {number} turnRadius - Turn radius (meters)
 * @returns {number} G-force
 */
export function calculateGForce(speed, turnRadius) {
  if (turnRadius === Infinity) return 0;
  return (speed * speed) / (turnRadius * 9.81);
}

// =============================================================================
// CARVE ACCELERATION
// =============================================================================

/**
 * Calculate acceleration gained from carving (pumping physics)
 *
 * @param {number} gForce - Current G-force
 * @param {number} railStrength - Rail strength
 * @param {number} carvePerfection - Carve perfection
 * @param {number} flowState - Flow state level
 * @returns {number} Acceleration (m/s²)
 */
export function calculateCarveAcceleration(gForce, railStrength, carvePerfection, flowState) {
  // Minimum requirements
  if (railStrength < 0.3 || carvePerfection < 0.5) {
    return 0;
  }

  const baseAccel = Math.min(gForce * 0.5, 3.0);
  const perfectionMult = 0.5 + carvePerfection * 0.5;
  const flowBonus = 1 + flowState * 0.5;

  return baseAccel * perfectionMult * flowBonus;
}

// =============================================================================
// RISK & FAILURE DETECTION
// =============================================================================

/**
 * Check for wash-out condition
 *
 * @param {number} speed - Current speed
 * @param {number} absEdge - Absolute edge angle
 * @param {number} grip - Current grip
 * @param {number} requiredGrip - Required grip for turn
 * @returns {Object} { isWashingOut, intensity, direction }
 */
export function checkWashOut(speed, absEdge, grip, requiredGrip) {
  if (speed < CARVE_CONFIG.washOutSpeedThreshold) {
    return { isWashingOut: false, intensity: 0, direction: 0 };
  }

  const gripDeficit = requiredGrip - grip;

  if (gripDeficit > 0.1) {
    return {
      isWashingOut: true,
      intensity: Math.min(1.0, gripDeficit * 2),
      direction: Math.sign(absEdge),
    };
  }

  return { isWashingOut: false, intensity: 0, direction: 0 };
}

/**
 * Check for edge catch on transition
 *
 * @param {number} speed - Current speed
 * @param {number} edgeChangeRate - Rate of edge change
 * @param {number} previousEdge - Previous edge angle
 * @param {number} currentEdge - Current edge angle
 * @returns {Object} { isCaught, severity }
 */
export function checkEdgeCatch(speed, edgeChangeRate, previousEdge, currentEdge) {
  // Edge catch happens when transitioning too quickly at high speed
  // and catching the "wrong" edge
  if (speed < 6) {
    return { isCaught: false, severity: 0 };
  }

  const transitionSpeed = Math.abs(edgeChangeRate);
  const crossedZero = Math.sign(previousEdge) !== Math.sign(currentEdge) && previousEdge !== 0;

  if (crossedZero && transitionSpeed > 4) {
    // Random chance based on speed and transition aggression
    const catchRisk = (transitionSpeed / 10) * (speed / 30);
    if (catchRisk > CARVE_CONFIG.edgeCatchThreshold) {
      return {
        isCaught: true,
        severity: Math.min(1.0, catchRisk),
      };
    }
  }

  return { isCaught: false, severity: 0 };
}

/**
 * Update risk state
 *
 * @param {Object} riskState - Current risk state
 * @param {number} gripDeficit - Current grip deficit
 * @param {number} edgeChangeRate - Rate of edge change
 * @param {number} dt - Delta time
 * @returns {Object} Updated risk state
 */
export function updateRiskState(riskState, gripDeficit, edgeChangeRate, dt) {
  let { riskLevel, wobbleAmount, isRecovering, recoveryTime } = riskState;

  // Risk increases with grip deficit and jerky input
  const riskIncrease = gripDeficit * 0.5 + Math.max(0, edgeChangeRate - 3) * 0.1;
  const riskDecrease = 0.3 * dt;

  riskLevel = Math.max(0, Math.min(1, riskLevel + riskIncrease * dt - riskDecrease));

  // Wobble based on risk
  wobbleAmount = riskLevel * 0.5;

  // Recovery logic
  if (riskLevel > 0.8 && !isRecovering) {
    isRecovering = true;
    recoveryTime = 0;
  }

  if (isRecovering) {
    recoveryTime += dt;
    if (recoveryTime > 0.5 && riskLevel < 0.3) {
      isRecovering = false;
    }
  }

  return { riskLevel, wobbleAmount, isRecovering, recoveryTime };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Normalize angle to [-PI, PI]
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle
 */
export function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Clamp value to range
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum
 * @param {number} max - Maximum
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
