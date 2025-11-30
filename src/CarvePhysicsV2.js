import * as THREE from 'three';

/**
 * CarvePhysicsV2 - Realistic snowboard carving physics
 *
 * Based on real snowboard mechanics:
 * - Stance-aware edge selection (regular/goofy, switch)
 * - Pressure distribution (fore/aft weight transfer)
 * - Skid vs carve physics based on grip availability
 * - Turn phases (initiation, apex, exit)
 * - Proper centripetal force calculations
 */

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

export const V2_CONFIG = {
  // Board geometry
  sidecutRadius: 7.5,  // meters - determines natural turn radius
  effectiveEdgeLength: 1.2,  // meters
  boardFlex: 0.7,  // 0-1, affects how board bends under load

  // Edge angle limits
  maxEdgeAngle: 80 * (Math.PI / 180),  // ~1.4 rad - deep euro-carve territory
  minEdgeForCarve: 15 * (Math.PI / 180),  // Below this is flat base

  // Response rates
  edgeResponseRate: 8.0,  // How fast edge angle changes
  edgeResponseRateSwitch: 6.8,  // 15% slower in switch

  // Pressure distribution
  neutralPressure: 0.5,  // 0 = all back, 1 = all front
  maxPressureShift: 0.25,  // Max deviation from neutral (0.25-0.75 range)

  // Grip parameters
  baseGripCoefficient: 1.2,  // Base snow grip (increased for better feel)
  edgeSharpness: 0.95,  // Edge condition (0-1)
  snowHardness: 0.5,  // Snow condition (0=powder, 1=ice) - softer default

  // Switch penalties
  switchResponsePenalty: 0.85,  // 15% slower response
  switchEdgeLimitPenalty: 0.90,  // 10% lower max stable edge
  switchGripPenalty: 0.92,  // 8% less grip before slip

  // Skid parameters
  skidFriction: 0.8,  // Friction coefficient when skidding - this is what slows you down!
  skidRecoveryRate: 2.0,  // How fast grip recovers after skid

  // Turn phases timing
  initiationDuration: 0.3,  // seconds
  apexHoldMin: 0.4,  // minimum time at apex

  // Input mapping (WASD hold duration)
  tapEdgeAngle: 25 * (Math.PI / 180),  // Quick tap = shallow edge
  holdRampTime: 1.5,  // seconds to reach max edge from tap
  doubleTapEdgeAngle: 55 * (Math.PI / 180),  // Double-tap = aggressive
  doubleTapWindow: 0.3,  // seconds

  // Lateral grip (always applied, prevents sideways sliding)
  baseLateralGrip: 0.85,  // Minimum grip even when not carving
};

// =============================================================================
// STATE INITIALIZATION
// =============================================================================

/**
 * Initialize v2 carve state on the player controller
 */
export function initV2State() {
  // Stance
  this.v2 = {
    // Stance configuration
    stance: 'regular',  // 'regular' or 'goofy'
    isSwitch: false,
    switchTransitionTime: 0,

    // Edge state
    currentEdge: 'flat',  // 'toeside', 'heelside', 'flat'
    physicalEdgeAngle: 0,  // Actual edge angle in radians
    targetEdgeAngle: 0,
    edgeEngageTime: 0,  // How long current edge has been engaged

    // Pressure distribution (0 = all back, 1 = all front)
    pressureDistribution: 0.5,
    targetPressure: 0.5,

    // Turn state
    turnPhase: 'neutral',  // 'initiation', 'apex', 'exit', 'neutral'
    turnPhaseTime: 0,
    turnDirection: 0,  // -1 = left, 0 = straight, 1 = right

    // Carve vs skid
    isCarving: true,  // Start in carve mode
    isSkidding: false,
    slipAngle: 0,  // Angle between board heading and velocity
    carveQuality: 1.0,  // 0-1, how clean the carve is (start high)

    // Physics state
    effectiveTurnRadius: Infinity,
    requiredCentripetal: 0,
    availableGrip: 0,
    gripDeficit: 0,  // How much grip we're lacking (causes skid)

    // Input tracking (for WASD hold duration)
    leftHoldTime: 0,
    rightHoldTime: 0,
    lastLeftTap: 0,
    lastRightTap: 0,
    leftWasPressed: false,
    rightWasPressed: false,

    // Metrics
    gForce: 0,
    inclination: 0,  // Body lean angle from vertical

    // Visual feedback
    sprayIntensity: 0,
    edgeScrapeIntensity: 0,
  };
}

// =============================================================================
// EDGE SELECTION & MAPPING
// =============================================================================

/**
 * Maps input direction to the correct physical edge based on stance and switch
 * @param {number} inputDirection - -1 (left) to 1 (right)
 * @returns {string} 'toeside', 'heelside', or 'flat'
 */
export function getPhysicalEdge(inputDirection) {
  if (Math.abs(inputDirection) < 0.1) return 'flat';

  const { stance, isSwitch } = this.v2;

  // Determine if we want left or right turn
  const wantLeftTurn = inputDirection < 0;

  // Edge mapping depends on stance and switch state
  // Regular forward: left turn = heelside, right turn = toeside
  // Regular switch: left turn = toeside, right turn = heelside
  // Goofy forward: left turn = toeside, right turn = heelside
  // Goofy switch: left turn = heelside, right turn = toeside

  let edge;
  if (stance === 'regular') {
    if (!isSwitch) {
      edge = wantLeftTurn ? 'heelside' : 'toeside';
    } else {
      edge = wantLeftTurn ? 'toeside' : 'heelside';
    }
  } else {  // goofy
    if (!isSwitch) {
      edge = wantLeftTurn ? 'toeside' : 'heelside';
    } else {
      edge = wantLeftTurn ? 'heelside' : 'toeside';
    }
  }

  return edge;
}

/**
 * Calculate target edge angle from input
 * Supports both analog stick (magnitude) and WASD (hold duration)
 */
export function calculateTargetEdgeAngle(dt, inputMagnitude) {
  const config = V2_CONFIG;
  const v2 = this.v2;

  const absInput = Math.abs(inputMagnitude);

  // Analog stick mode: magnitude maps directly to edge angle
  if (this.inputMode === 'gamepad' || this.inputMode === 'analog') {
    // 0-20% = shallow, 20-50% = moderate, 50-80% = aggressive, 80-100% = deep
    let targetAngle = 0;
    if (absInput < 0.2) {
      targetAngle = THREE.MathUtils.mapLinear(absInput, 0, 0.2, 0, config.tapEdgeAngle);
    } else if (absInput < 0.5) {
      targetAngle = THREE.MathUtils.mapLinear(absInput, 0.2, 0.5, config.tapEdgeAngle, 45 * Math.PI / 180);
    } else if (absInput < 0.8) {
      targetAngle = THREE.MathUtils.mapLinear(absInput, 0.5, 0.8, 45 * Math.PI / 180, 65 * Math.PI / 180);
    } else {
      targetAngle = THREE.MathUtils.mapLinear(absInput, 0.8, 1.0, 65 * Math.PI / 180, config.maxEdgeAngle);
    }
    return targetAngle * Math.sign(inputMagnitude);
  }

  // WASD mode: hold duration determines edge angle
  const isLeft = inputMagnitude < -0.1;
  const isRight = inputMagnitude > 0.1;

  // Track hold times
  if (isLeft) {
    // Check for double-tap
    const now = performance.now() / 1000;
    if (!v2.leftWasPressed && (now - v2.lastLeftTap) < config.doubleTapWindow) {
      // Double tap detected - snap to aggressive angle
      v2.leftHoldTime = config.holdRampTime * 0.7;  // Start at 70% of ramp
    }
    if (!v2.leftWasPressed) {
      v2.lastLeftTap = now;
    }
    v2.leftHoldTime += dt;
    v2.rightHoldTime = 0;
  } else if (isRight) {
    const now = performance.now() / 1000;
    if (!v2.rightWasPressed && (now - v2.lastRightTap) < config.doubleTapWindow) {
      v2.rightHoldTime = config.holdRampTime * 0.7;
    }
    if (!v2.rightWasPressed) {
      v2.lastRightTap = now;
    }
    v2.rightHoldTime += dt;
    v2.leftHoldTime = 0;
  } else {
    v2.leftHoldTime = Math.max(0, v2.leftHoldTime - dt * 3);  // Quick release
    v2.rightHoldTime = Math.max(0, v2.rightHoldTime - dt * 3);
  }

  v2.leftWasPressed = isLeft;
  v2.rightWasPressed = isRight;

  // Calculate angle from hold time
  const holdTime = Math.max(v2.leftHoldTime, v2.rightHoldTime);
  let targetAngle;

  if (holdTime < 0.1) {
    targetAngle = 0;
  } else if (holdTime < 0.3) {
    // Initial tap - start at tap angle
    targetAngle = config.tapEdgeAngle;
  } else {
    // Progressive ramp
    const rampProgress = Math.min((holdTime - 0.3) / config.holdRampTime, 1);
    targetAngle = THREE.MathUtils.lerp(config.tapEdgeAngle, config.maxEdgeAngle * 0.85, rampProgress);
  }

  // Shift key intensifier (if available)
  if (this.input.shift) {
    targetAngle = Math.max(targetAngle, 70 * Math.PI / 180);
  }

  const direction = v2.leftHoldTime > v2.rightHoldTime ? -1 : 1;
  return targetAngle * direction;
}

// =============================================================================
// PRESSURE DISTRIBUTION
// =============================================================================

/**
 * Update pressure distribution based on input and turn phase
 * @param {number} dt - Delta time
 * @param {number} leanInput - Forward/back input (-1 to 1)
 */
export function updatePressureDistribution(dt, leanInput) {
  const config = V2_CONFIG;
  const v2 = this.v2;

  // Base target from input
  // Forward input (W/up) = weight forward (0.75)
  // Back input (S/down) = weight back (0.25)
  const inputPressure = config.neutralPressure + leanInput * config.maxPressureShift;

  // Automatic pressure shifts based on turn phase
  let phaseAdjustment = 0;
  switch (v2.turnPhase) {
    case 'initiation':
      // Weight forward to drive the turn
      phaseAdjustment = 0.1;
      break;
    case 'apex':
      // Centered pressure
      phaseAdjustment = 0;
      break;
    case 'exit':
      // Slight weight back to release
      phaseAdjustment = -0.05;
      break;
  }

  v2.targetPressure = THREE.MathUtils.clamp(
    inputPressure + phaseAdjustment,
    config.neutralPressure - config.maxPressureShift,
    config.neutralPressure + config.maxPressureShift
  );

  // Smooth pressure changes
  const pressureRate = 4.0;
  v2.pressureDistribution = THREE.MathUtils.lerp(
    v2.pressureDistribution,
    v2.targetPressure,
    pressureRate * dt
  );
}

// =============================================================================
// TURN RADIUS & CENTRIPETAL FORCE
// =============================================================================

/**
 * Calculate effective turn radius from edge angle and board geometry
 * Uses inverse sin relationship for more realistic sidecut behavior
 */
export function calculateEffectiveTurnRadius(edgeAngle) {
  const config = V2_CONFIG;
  const absEdge = Math.abs(edgeAngle);

  if (absEdge < config.minEdgeForCarve) {
    return Infinity;  // Flat base, no turn
  }

  // Sidecut geometry: radius = sidecutRadius / sin(edgeAngle)
  // This gives larger radii at shallow angles (correct behavior)
  const sinEdge = Math.sin(absEdge);
  let radius = config.sidecutRadius / Math.max(sinEdge, 0.15);

  // Board flex modifier - more flex = tighter turns possible
  const flexModifier = 1 - (config.boardFlex * 0.15 * (absEdge / config.maxEdgeAngle));
  radius *= flexModifier;

  // Pressure distribution affects radius
  // Forward pressure = tighter turn (shorter lever arm)
  // Back pressure = looser turn
  const pressureEffect = 1 + (0.5 - this.v2.pressureDistribution) * 0.2;
  radius *= pressureEffect;

  // Minimum 4m radius at extreme edge angles
  return Math.max(radius, 4.0);
}

/**
 * Calculate required centripetal force for current speed and radius
 * F_centripetal = m × v² / r
 */
export function calculateRequiredCentripetal(speed, radius) {
  if (radius === Infinity) return 0;
  return this.mass * (speed * speed) / radius;
}

/**
 * Calculate body inclination angle required for balance
 * tan(inclination) = v² / (r × g)
 */
export function calculateRequiredInclination(speed, radius) {
  if (radius === Infinity) return 0;
  const g = 9.81;
  const tanInclination = (speed * speed) / (radius * g);
  return Math.atan(tanInclination);
}

// =============================================================================
// GRIP & SKID PHYSICS
// =============================================================================

/**
 * Calculate available grip from snow conditions and edge engagement
 */
export function calculateAvailableGrip(edgeAngle, normalForce) {
  const config = V2_CONFIG;
  const v2 = this.v2;
  const absEdge = Math.abs(edgeAngle);

  // Base grip coefficient (higher = more forgiving)
  let grip = config.baseGripCoefficient;

  // Edge penetration - sharper edges and softer snow = better grip
  const edgePenetration = config.edgeSharpness * (1 - config.snowHardness * 0.3);
  grip *= edgePenetration;

  // Edge angle bonus - deeper edge = more grip (generous curve)
  // More grip at any edge angle, with a wide optimal range
  const optimalEdge = 45 * Math.PI / 180;  // ~45° is optimal
  if (absEdge < optimalEdge) {
    // Build up to full grip
    grip *= 0.7 + 0.3 * (absEdge / optimalEdge);
  } else {
    // Maintain high grip even past optimal
    const overEdge = (absEdge - optimalEdge) / (config.maxEdgeAngle - optimalEdge);
    grip *= 1 - overEdge * 0.15;  // Only 15% loss at max edge
  }

  // Normal force effect (gentle scaling)
  grip *= Math.min(normalForce / (this.mass * 9.81), 1.3);

  // Switch penalty
  if (v2.isSwitch) {
    grip *= config.switchGripPenalty;
  }

  // Carve quality bonus - sustained clean carve builds grip
  grip *= 0.9 + v2.carveQuality * 0.1;

  return grip * normalForce;
}

/**
 * Determine if carving or skidding and calculate slip angle
 */
export function updateCarveSkidState(dt, speed, requiredCentripetal, availableGrip) {
  const v2 = this.v2;

  v2.requiredCentripetal = requiredCentripetal;
  v2.availableGrip = availableGrip;

  // Give carving a 20% buffer - we carve unless we REALLY exceed grip
  // This makes the feel more forgiving and "arcadey"
  const carveBuffer = 1.2;

  if (requiredCentripetal <= availableGrip * carveBuffer) {
    // Pure carve - board follows the arc exactly
    v2.isCarving = true;
    v2.isSkidding = false;
    v2.slipAngle = 0;
    v2.gripDeficit = 0;

    // Carve quality builds faster
    v2.carveQuality = Math.min(1, v2.carveQuality + dt * 1.0);

    // Visual feedback
    v2.sprayIntensity = Math.abs(this.v2.physicalEdgeAngle) * speed * 0.05;
    v2.edgeScrapeIntensity = 0;
  } else {
    // Skidding - board drifts, friction scrubs speed
    v2.isCarving = false;
    v2.isSkidding = true;
    v2.gripDeficit = requiredCentripetal - availableGrip;

    // Calculate slip angle based on grip deficit (less aggressive)
    const deficitRatio = v2.gripDeficit / Math.max(requiredCentripetal, 1);
    v2.slipAngle = Math.min(deficitRatio * 0.3, 0.5);  // Max ~30° slip

    // Carve quality degrades slower
    v2.carveQuality = Math.max(0, v2.carveQuality - dt * 1.0);

    // Visual feedback
    v2.sprayIntensity = v2.slipAngle * speed * 0.3;
    v2.edgeScrapeIntensity = v2.slipAngle * 0.5;
  }
}

// =============================================================================
// TURN PHASE MANAGEMENT
// =============================================================================

/**
 * Update turn phase based on edge angle and arc progress
 */
export function updateTurnPhase(dt, edgeAngle) {
  const config = V2_CONFIG;
  const v2 = this.v2;
  const absEdge = Math.abs(edgeAngle);

  // Determine turn direction
  if (absEdge > config.minEdgeForCarve) {
    v2.turnDirection = Math.sign(edgeAngle);
  } else {
    v2.turnDirection = 0;
  }

  // Phase transitions
  if (v2.turnDirection === 0) {
    // No turn - neutral or transitioning
    if (v2.turnPhase !== 'neutral') {
      v2.turnPhase = 'neutral';
      v2.turnPhaseTime = 0;
    }
  } else {
    v2.turnPhaseTime += dt;

    switch (v2.turnPhase) {
      case 'neutral':
        // Starting a new turn
        v2.turnPhase = 'initiation';
        v2.turnPhaseTime = 0;
        v2.edgeEngageTime = 0;
        break;

      case 'initiation':
        // Check if we've reached apex
        if (v2.turnPhaseTime > config.initiationDuration &&
            absEdge > 30 * Math.PI / 180) {
          v2.turnPhase = 'apex';
          v2.turnPhaseTime = 0;
        }
        break;

      case 'apex': {
        // Check if edge is releasing (starting exit)
        const edgeDecreasing = Math.abs(v2.targetEdgeAngle) < absEdge * 0.8;
        if (v2.turnPhaseTime > config.apexHoldMin && edgeDecreasing) {
          v2.turnPhase = 'exit';
          v2.turnPhaseTime = 0;
        }
        break;
      }

      case 'exit':
        // Check if turn is complete
        if (absEdge < config.minEdgeForCarve ||
            Math.sign(v2.targetEdgeAngle) !== v2.turnDirection) {
          v2.turnPhase = 'neutral';
          v2.turnPhaseTime = 0;
        }
        break;
    }
  }

  // Track total edge engagement time
  if (absEdge > config.minEdgeForCarve) {
    v2.edgeEngageTime += dt;
  } else {
    v2.edgeEngageTime = 0;
  }
}

// =============================================================================
// SWITCH RIDING
// =============================================================================

/**
 * Handle switch riding toggle and transitions
 */
export function updateSwitchState(dt, switchInput) {
  const v2 = this.v2;

  // Can only switch when near neutral edge (unweighted)
  const canSwitch = Math.abs(this.v2.physicalEdgeAngle) < 15 * Math.PI / 180;

  if (switchInput && canSwitch && v2.switchTransitionTime <= 0) {
    v2.isSwitch = !v2.isSwitch;
    v2.switchTransitionTime = 0.3;  // Brief transition period

    // Reset some state on switch
    v2.carveQuality *= 0.5;  // Lose some carve momentum
  }

  // Decrement transition timer
  if (v2.switchTransitionTime > 0) {
    v2.switchTransitionTime -= dt;
  }
}

/**
 * Get current response rate (affected by switch)
 */
export function getResponseRate() {
  const config = V2_CONFIG;
  if (this.v2.isSwitch) {
    return config.edgeResponseRate * config.switchResponsePenalty;
  }
  return config.edgeResponseRate;
}

/**
 * Get max stable edge angle (affected by switch)
 */
export function getMaxStableEdge() {
  const config = V2_CONFIG;
  if (this.v2.isSwitch) {
    return config.maxEdgeAngle * config.switchEdgeLimitPenalty;
  }
  return config.maxEdgeAngle;
}

// =============================================================================
// MAIN UPDATE FUNCTION
// =============================================================================

/**
 * Main v2 physics update - call this instead of v1 CarvePhysics functions
 * @param {number} dt - Delta time
 * @param {number} speed2D - Current 2D speed
 * @param {THREE.Vector3} forward - Forward direction vector
 * @param {THREE.Vector3} right - Right direction vector
 */
export function updateCarvePhysicsV2(dt, speed2D, forward, right) {
  const v2 = this.v2;
  const config = V2_CONFIG;

  // Initialize v2 state if needed
  if (!v2) {
    initV2State.call(this);
  }

  // 1. Handle switch toggle
  updateSwitchState.call(this, dt, this.input.switchStance);

  // 2. Calculate target edge angle from input
  v2.targetEdgeAngle = calculateTargetEdgeAngle.call(this, dt, this.input.steer);

  // 3. Apply response lag to edge angle
  const responseRate = getResponseRate.call(this);
  const maxEdge = getMaxStableEdge.call(this);

  // Clamp target to max stable edge
  v2.targetEdgeAngle = THREE.MathUtils.clamp(
    v2.targetEdgeAngle,
    -maxEdge,
    maxEdge
  );

  // Smooth edge angle transition
  const edgeError = v2.targetEdgeAngle - v2.physicalEdgeAngle;
  v2.physicalEdgeAngle += edgeError * responseRate * dt;

  // 4. Update pressure distribution
  updatePressureDistribution.call(this, dt, this.input.lean);

  // 5. Determine physical edge (toeside/heelside/flat)
  v2.currentEdge = getPhysicalEdge.call(this, v2.physicalEdgeAngle);

  // 6. Calculate turn radius
  v2.effectiveTurnRadius = calculateEffectiveTurnRadius.call(this, v2.physicalEdgeAngle);

  // 7. Calculate forces
  const requiredCentripetal = calculateRequiredCentripetal.call(this, speed2D, v2.effectiveTurnRadius);

  // Normal force (affected by slope)
  const slopeAngle = Math.acos(Math.min(this.groundNormal.y, 1));
  const normalForce = this.mass * 9.81 * Math.cos(slopeAngle);

  const availableGrip = calculateAvailableGrip.call(this, v2.physicalEdgeAngle, normalForce);

  // 8. Update carve/skid state
  updateCarveSkidState.call(this, dt, speed2D, requiredCentripetal, availableGrip);

  // 9. Update turn phase
  updateTurnPhase.call(this, dt, v2.physicalEdgeAngle, this.headingVelocity);

  // 10. Calculate metrics
  v2.gForce = requiredCentripetal / (this.mass * 9.81);
  v2.inclination = calculateRequiredInclination.call(this, speed2D, v2.effectiveTurnRadius);

  // Sync with legacy systems for compatibility
  this.edgeAngle = v2.physicalEdgeAngle;
  this.carveRailStrength = v2.isCarving ? v2.carveQuality : 0;
  this.carvePerfection = v2.carveQuality;

  return {
    edgeAngle: v2.physicalEdgeAngle,
    turnRadius: v2.effectiveTurnRadius,
    isCarving: v2.isCarving,
    isSkidding: v2.isSkidding,
    slipAngle: v2.slipAngle,
    gForce: v2.gForce,
    turnPhase: v2.turnPhase,
  };
}

// =============================================================================
// VELOCITY & HEADING UPDATE
// =============================================================================

/**
 * Apply turn physics to velocity based on v2 state
 */
export function applyV2TurnPhysics(dt, speed2D) {
  const v2 = this.v2;
  const config = V2_CONFIG;

  if (speed2D < 0.5) {
    this.headingVelocity *= 0.85;
    return;
  }

  const absEdge = Math.abs(v2.physicalEdgeAngle);

  if (absEdge < config.minEdgeForCarve) {
    // Flat base - minimal steering
    this.headingVelocity *= 0.9;
    return;
  }

  // Calculate angular velocity from turn radius
  let angularVel = 0;

  if (v2.isCarving && v2.effectiveTurnRadius < Infinity) {
    // Pure carve - follow the arc
    angularVel = speed2D / v2.effectiveTurnRadius;

    // Direction based on edge (accounting for switch)
    const turnDir = v2.isSwitch ? -Math.sign(v2.physicalEdgeAngle) : Math.sign(v2.physicalEdgeAngle);
    angularVel *= turnDir;
  } else if (v2.isSkidding) {
    // Skidding - reduced turn rate, more friction
    const skidRadius = v2.effectiveTurnRadius * (1 + v2.slipAngle * 2);
    angularVel = speed2D / skidRadius;

    const turnDir = v2.isSwitch ? -Math.sign(v2.physicalEdgeAngle) : Math.sign(v2.physicalEdgeAngle);
    angularVel *= turnDir * (1 - v2.slipAngle * 0.5);  // Reduced turn authority when skidding
  }

  // Smooth heading velocity
  const turnInertia = 1 + speed2D * 0.02;
  const turnResponse = 6 / turnInertia;

  this.headingVelocity = THREE.MathUtils.lerp(
    this.headingVelocity,
    angularVel,
    turnResponse * dt
  );

  // Clamp max turn rate
  const maxTurnRate = 3.0;
  this.headingVelocity = THREE.MathUtils.clamp(this.headingVelocity, -maxTurnRate, maxTurnRate);

  // Apply heading change
  this.heading += this.headingVelocity * dt;
}

/**
 * Apply skid friction to velocity
 * When skidding, the board slides sideways and scrubs speed
 * This is the PRIMARY mechanism for slowing down in snowboarding
 */
export function applySkidFriction(dt, speed2D, forward, right) {
  const v2 = this.v2;
  const config = V2_CONFIG;

  if (!v2.isSkidding || speed2D < 0.5) return;

  // Friction coefficient scales with slip angle and edge angle
  // More sideways = more friction = more speed scrubbed
  const absEdge = Math.abs(v2.physicalEdgeAngle);
  const frictionCoef = config.skidFriction * (1 + v2.slipAngle * 2) * (1 + absEdge * 0.5);

  // Normal force (weight on snow)
  const normalForce = this.mass * 9.81;

  // === LATERAL FRICTION ===
  // Friction opposes sideways sliding
  const lateralSpeed = this.velocity.dot(right);
  const lateralFriction = frictionCoef * normalForce * v2.slipAngle;
  const lateralDecel = lateralFriction / this.mass;

  // Apply lateral friction
  const lateralReduction = Math.min(Math.abs(lateralSpeed), lateralDecel * dt);
  this.velocity.x -= right.x * Math.sign(lateralSpeed) * lateralReduction;
  this.velocity.z -= right.z * Math.sign(lateralSpeed) * lateralReduction;

  // === FORWARD SPEED SCRUB ===
  // When board is angled across the fall line and skidding,
  // the sideways friction component also scrubs forward speed
  // This is how snowboarders actually slow down!
  const forwardSpeed = this.velocity.dot(forward);

  if (forwardSpeed > 0) {
    // Scrub rate depends on: slip angle, edge angle, and speed
    // Higher slip angle = board more sideways = more scrubbing
    // Higher edge angle = more edge digging in = more friction
    const scrubRate = v2.slipAngle * (1 + absEdge) * frictionCoef;
    const speedScrub = scrubRate * speed2D * dt;

    // Apply forward speed reduction
    const scrubAmount = Math.min(forwardSpeed, speedScrub);
    this.velocity.x -= forward.x * scrubAmount;
    this.velocity.z -= forward.z * scrubAmount;
  }

  // === VISUAL FEEDBACK ===
  // Spray intensity scales with how much speed we're scrubbing
  v2.sprayIntensity = v2.slipAngle * speed2D * 0.15 * (1 + absEdge);
  v2.edgeScrapeIntensity = v2.slipAngle * absEdge;
}

/**
 * Apply grip to lateral velocity (replaces v1 grip calculation)
 * Always applies baseline grip to prevent sideways sliding
 */
export function applyV2Grip(_dt, forward, right) {
  const v2 = this.v2;
  const config = V2_CONFIG;

  // Calculate grip based on state
  let grip;
  if (v2.isCarving) {
    // Nearly perfect grip in a clean carve
    grip = 0.92 + v2.carveQuality * 0.06;  // 92-98% grip
  } else {
    // Always have baseline grip even when skidding
    // This prevents the "ice skating" feel
    const edgeBonus = Math.abs(v2.physicalEdgeAngle) * 0.15;
    grip = config.baseLateralGrip + edgeBonus;  // 85-95%+ based on edge
  }

  // Apply grip to eliminate lateral velocity
  const forwardSpeed = this.velocity.dot(forward);
  const lateralSpeed = this.velocity.dot(right);
  const newLateral = lateralSpeed * (1 - grip);

  this.velocity.x = forward.x * forwardSpeed + right.x * newLateral;
  this.velocity.z = forward.z * forwardSpeed + right.z * newLateral;
}
