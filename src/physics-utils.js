/**
 * @fileoverview Pure physics calculation functions.
 *
 * These functions are stateless and side-effect free, making them
 * easy to test and reason about. They extract the core math from
 * the physics systems.
 */

// =============================================================================
// TURN RADIUS CALCULATIONS
// =============================================================================

/**
 * Calculate effective turn radius based on sidecut geometry and edge angle.
 *
 * The sidecut radius is the natural turn radius when the board is flat.
 * As edge angle increases, the effective radius decreases (tighter turn).
 *
 * Formula: effective_radius = sidecut_radius * cos(edge_angle)
 *
 * @param {number} sidecutRadius - Board sidecut radius in meters
 * @param {number} edgeAngle - Current edge angle in radians
 * @param {number} [flexModifier=1] - Board flex modifier (0.8 - 1.2)
 * @param {number} [pressureEffect=1] - Pressure distribution effect (0.9 - 1.1)
 * @returns {number} Effective turn radius in meters
 */
export function calculateTurnRadius(sidecutRadius, edgeAngle, flexModifier = 1, pressureEffect = 1) {
  const absEdge = Math.abs(edgeAngle);

  // Flat base = infinite radius (straight line)
  if (absEdge < 0.01) {
    return Infinity;
  }

  // Base calculation from sidecut geometry
  const baseRadius = sidecutRadius * Math.cos(absEdge);

  // Apply modifiers
  const effectiveRadius = baseRadius * flexModifier * pressureEffect;

  // Minimum radius clamp (physically impossible to turn tighter)
  return Math.max(effectiveRadius, 1.5);
}

/**
 * Calculate heading change rate for a given speed and turn radius.
 *
 * @param {number} speed - Current speed in m/s
 * @param {number} turnRadius - Turn radius in meters
 * @returns {number} Heading change rate in rad/s
 */
export function calculateHeadingChangeRate(speed, turnRadius) {
  if (turnRadius === Infinity || turnRadius === 0) {
    return 0;
  }
  return speed / turnRadius;
}

// =============================================================================
// G-FORCE CALCULATIONS
// =============================================================================

/**
 * Calculate centripetal G-force during a turn.
 *
 * G-force from turning = v² / (r * g)
 *
 * @param {number} speed - Speed in m/s
 * @param {number} turnRadius - Turn radius in meters
 * @param {number} [gravity=9.81] - Gravity constant
 * @returns {number} G-force (1 = normal gravity)
 */
export function calculateTurnGForce(speed, turnRadius, gravity = 9.81) {
  if (turnRadius === Infinity || turnRadius === 0) {
    return 0;
  }

  const centripetalAccel = (speed * speed) / turnRadius;
  return centripetalAccel / gravity;
}

/**
 * Calculate total G-force including slope angle.
 *
 * @param {number} turnGForce - G-force from turning
 * @param {number} slopeAngle - Slope angle in radians (0 = flat)
 * @returns {number} Total effective G-force
 */
export function calculateTotalGForce(turnGForce, slopeAngle) {
  const gravityComponent = Math.cos(slopeAngle);
  return Math.sqrt(turnGForce * turnGForce + gravityComponent * gravityComponent);
}

// =============================================================================
// GRIP CALCULATIONS
// =============================================================================

/**
 * Calculate available grip based on edge angle and conditions.
 *
 * @param {number} edgeAngle - Edge angle in radians
 * @param {number} baseGrip - Base grip coefficient (0.7 typical)
 * @param {number} [snowMultiplier=1] - Snow condition multiplier
 * @param {number} [edgeSharpness=1] - Edge sharpness (0-1)
 * @returns {number} Total grip coefficient
 */
export function calculateGrip(edgeAngle, baseGrip, snowMultiplier = 1, edgeSharpness = 1) {
  const absEdge = Math.abs(edgeAngle);

  // Edge angle contribution (deeper edge = more grip)
  const edgeGrip = absEdge * 0.3;

  // Combine factors
  const totalGrip = (baseGrip + edgeGrip) * snowMultiplier * edgeSharpness;

  // Clamp to realistic range
  return Math.min(totalGrip, 0.98);
}

/**
 * Calculate required centripetal force for the current turn.
 *
 * Force = mass * v² / radius
 *
 * @param {number} mass - Mass in kg
 * @param {number} speed - Speed in m/s
 * @param {number} turnRadius - Turn radius in meters
 * @returns {number} Required centripetal force in Newtons
 */
export function calculateRequiredCentripetal(mass, speed, turnRadius) {
  if (turnRadius === Infinity) {
    return 0;
  }
  return mass * speed * speed / turnRadius;
}

/**
 * Calculate available grip force based on grip coefficient and normal force.
 *
 * @param {number} gripCoefficient - Grip coefficient (0-1)
 * @param {number} normalForce - Normal force in Newtons
 * @returns {number} Available grip force in Newtons
 */
export function calculateAvailableGrip(gripCoefficient, normalForce) {
  return gripCoefficient * normalForce;
}

/**
 * Determine if the board is carving or skidding.
 *
 * Carving: required centripetal <= available grip
 * Skidding: required centripetal > available grip
 *
 * @param {number} requiredCentripetal - Required centripetal force
 * @param {number} availableGrip - Available grip force
 * @returns {{isCarving: boolean, isSkidding: boolean, gripDeficit: number}}
 */
export function determineCarveState(requiredCentripetal, availableGrip) {
  const gripDeficit = Math.max(0, requiredCentripetal - availableGrip);
  const isCarving = gripDeficit === 0;
  const isSkidding = gripDeficit > 0;

  return {
    isCarving,
    isSkidding,
    gripDeficit,
  };
}

// =============================================================================
// EDGE PHYSICS
// =============================================================================

/**
 * Calculate spring-damper force for edge angle.
 *
 * @param {number} currentAngle - Current edge angle
 * @param {number} targetAngle - Target edge angle
 * @param {number} velocity - Current edge velocity
 * @param {number} springConstant - Spring constant (default 70)
 * @param {number} dampingConstant - Damping constant (default 8)
 * @returns {{force: number, newVelocity: number}}
 */
export function calculateEdgeSpringForce(
  currentAngle,
  targetAngle,
  velocity,
  springConstant = 70,
  dampingConstant = 8
) {
  const error = targetAngle - currentAngle;
  const springForce = error * springConstant;
  const dampingForce = -velocity * dampingConstant;
  const totalForce = springForce + dampingForce;

  return {
    force: totalForce,
    newVelocity: velocity + totalForce,
  };
}

/**
 * Calculate edge angle from steering input.
 *
 * @param {number} steerInput - Steering input (-1 to 1)
 * @param {number} maxEdge - Maximum edge angle in radians
 * @param {number} [leanInput=0] - Lean input for bonus
 * @param {boolean} [isSwitch=false] - Whether riding switch
 * @returns {number} Target edge angle in radians
 */
export function calculateTargetEdgeAngle(steerInput, maxEdge, leanInput = 0, isSwitch = false) {
  // Flip steer when switch so controls remain consistent
  const effectiveSteer = isSwitch ? -steerInput : steerInput;

  // Lean forward adds edge commitment
  const leanBonus = Math.max(0, leanInput) * 0.1;

  return effectiveSteer * maxEdge * (1 + leanBonus);
}

// =============================================================================
// TRANSITION TIMING
// =============================================================================

/**
 * Calculate timing multiplier for edge transitions.
 *
 * Optimal timing is around 0.8 seconds between transitions.
 * Too fast = panic wiggling, too slow = lost momentum.
 *
 * @param {number} timeSinceLastTransition - Time in seconds
 * @param {number} [sweetSpotCenter=0.8] - Optimal timing
 * @param {number} [sweetSpotRadius=0.4] - Timing tolerance
 * @returns {number} Timing multiplier (0.4 to 1.175)
 */
export function calculateTransitionTimingMultiplier(
  timeSinceLastTransition,
  sweetSpotCenter = 0.8,
  sweetSpotRadius = 0.4
) {
  // Too fast (panic wiggling)
  if (timeSinceLastTransition < 0.3) {
    return 0.4;
  }

  // Too slow (lost momentum)
  if (timeSinceLastTransition > 1.8) {
    return 0.5;
  }

  // Calculate distance from sweet spot
  const distanceFromOptimal = Math.abs(timeSinceLastTransition - sweetSpotCenter);

  if (distanceFromOptimal <= sweetSpotRadius) {
    // In the sweet spot - boost based on how close to center
    const sweetSpotQuality = 1 - distanceFromOptimal / sweetSpotRadius;
    return 1.0 + sweetSpotQuality * 0.175;
  }

  // Outside sweet spot but not penalized
  return 1.0;
}

/**
 * Classify arc shape based on heading change.
 *
 * @param {number} headingChange - Total heading change in radians
 * @returns {{type: string, multiplier: number}}
 */
export function classifyArcShape(headingChange) {
  const absChange = Math.abs(headingChange);
  const degreeChange = absChange * (180 / Math.PI);

  if (degreeChange >= 60) {
    return { type: 'c-turn', multiplier: 1.3 };
  }

  if (degreeChange >= 30) {
    return { type: 'j-turn', multiplier: 1.0 };
  }

  return { type: 'wiggle', multiplier: 0.5 };
}

// =============================================================================
// CARVE ENERGY & FLOW
// =============================================================================

/**
 * Calculate carve acceleration based on G-force (pumping physics).
 *
 * Deep carves at high speed generate forward acceleration.
 *
 * @param {number} gForce - Current G-force
 * @param {number} railStrength - Carve rail strength (0-1)
 * @param {number} carvePerfection - Carve perfection (0-1)
 * @param {number} flowState - Flow state (0-1)
 * @returns {number} Acceleration in m/s²
 */
export function calculateCarveAcceleration(gForce, railStrength, carvePerfection, flowState) {
  // Minimum requirements to gain speed from carving
  if (railStrength < 0.3 || carvePerfection < 0.5) {
    return 0;
  }

  // Base acceleration from G-force
  const baseAccel = Math.min(gForce * 0.5, 3.0);

  // Perfection scales the acceleration
  const perfectionMult = 0.5 + carvePerfection * 0.5;

  // Flow state bonus
  const flowBonus = 1 + flowState * 0.5;

  return baseAccel * perfectionMult * flowBonus;
}

/**
 * Calculate flow state change for this frame.
 *
 * @param {number} currentFlow - Current flow state (0-1)
 * @param {number} carveQuality - Quality of current carve (0-1)
 * @param {number} dt - Delta time in seconds
 * @param {number} [buildRate=0.15] - Flow build rate
 * @param {number} [decayRate=0.3] - Flow decay rate
 * @returns {number} New flow state (0-1)
 */
export function updateFlowState(currentFlow, carveQuality, dt, buildRate = 0.15, decayRate = 0.3) {
  // Good carving builds flow
  if (carveQuality > 0.7) {
    const gain = buildRate * carveQuality * dt;
    return Math.min(1, currentFlow + gain);
  }

  // Poor carving decays flow
  const decay = decayRate * (1 - carveQuality) * dt;
  return Math.max(0, currentFlow - decay);
}

// =============================================================================
// BOARD FLEX
// =============================================================================

/**
 * Calculate board flex based on carving load.
 *
 * @param {number} edgeAngle - Current edge angle in radians
 * @param {number} speed - Current speed in m/s
 * @param {number} railStrength - Carve rail strength (0-1)
 * @returns {number} Target flex level (0-1)
 */
export function calculateBoardFlex(edgeAngle, speed, railStrength) {
  const absEdge = Math.abs(edgeAngle);
  const carveLoad = absEdge * speed * 0.02 * (1 + railStrength);
  return Math.min(carveLoad, 1.0);
}

/**
 * Calculate flex energy accumulation.
 *
 * @param {number} currentEnergy - Current flex energy
 * @param {number} boardFlex - Current board flex
 * @param {number} edgeAngle - Edge angle in radians
 * @param {number} carvePerfection - Carve perfection (0-1)
 * @param {number} dt - Delta time in seconds
 * @param {number} maxEnergy - Maximum flex energy
 * @returns {number} New flex energy
 */
export function accumulateFlexEnergy(
  currentEnergy,
  boardFlex,
  edgeAngle,
  carvePerfection,
  dt,
  maxEnergy = 1.5
) {
  const absEdge = Math.abs(edgeAngle);

  // Only accumulate during deep sustained carves
  if (boardFlex > 0.2 && absEdge > 0.4) {
    const energyGain = boardFlex * carvePerfection * dt * 0.8;
    return Math.min(currentEnergy + energyGain, maxEnergy);
  }

  return currentEnergy;
}

// =============================================================================
// ANGULATION
// =============================================================================

/**
 * Calculate required angulation based on edge angle and speed.
 *
 * @param {number} edgeAngle - Edge angle in radians
 * @param {number} speed - Speed in m/s
 * @returns {number} Required angulation (0-1)
 */
export function calculateRequiredAngulation(edgeAngle, speed) {
  const absEdge = Math.abs(edgeAngle);
  const angulationNeeded = (absEdge * speed) / 25;
  return Math.min(angulationNeeded, 1.0);
}

/**
 * Update angulation capacity based on input smoothness.
 *
 * @param {number} currentCapacity - Current angulation capacity
 * @param {number} edgeChangeRate - Rate of edge change (rad/s)
 * @param {number} dt - Delta time in seconds
 * @param {number} [smoothnessThreshold=3.0] - Threshold for "jerky" input
 * @returns {number} Updated angulation capacity (0.4-1.0)
 */
export function updateAngulationCapacity(
  currentCapacity,
  edgeChangeRate,
  dt,
  smoothnessThreshold = 3.0
) {
  if (edgeChangeRate > smoothnessThreshold) {
    // Jerky input degrades capacity
    const jerkPenalty = (edgeChangeRate - smoothnessThreshold) * 0.3 * dt;
    return Math.max(0.4, currentCapacity - jerkPenalty);
  }

  // Smooth carving restores capacity
  return Math.min(1.0, currentCapacity + 0.8 * dt);
}

// =============================================================================
// SPEED CALCULATIONS
// =============================================================================

/**
 * Calculate speed from velocity vector.
 *
 * @param {number} vx - X velocity component
 * @param {number} vz - Z velocity component
 * @returns {number} Speed in m/s
 */
export function calculateSpeed2D(vx, vz) {
  return Math.sqrt(vx * vx + vz * vz);
}

/**
 * Calculate 3D speed including vertical component.
 *
 * @param {number} vx - X velocity
 * @param {number} vy - Y velocity
 * @param {number} vz - Z velocity
 * @returns {number} Total speed in m/s
 */
export function calculateSpeed3D(vx, vy, vz) {
  return Math.sqrt(vx * vx + vy * vy + vz * vz);
}

/**
 * Calculate gravity acceleration on a slope.
 *
 * @param {number} slopeAngle - Slope angle in radians
 * @param {number} [gravity=9.81] - Gravity constant
 * @returns {number} Downslope acceleration in m/s²
 */
export function calculateSlopeAcceleration(slopeAngle, gravity = 9.81) {
  return gravity * Math.sin(slopeAngle);
}
