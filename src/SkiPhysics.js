import * as THREE from 'three';

/**
 * SkiPhysics - Skiing physics system
 *
 * Key differences from snowboarding:
 * - Two independent skis (can edge independently or together)
 * - Narrower stance, forward-facing
 * - Parallel turns (both skis same edge) vs wedge/snowplow
 * - More agile turns, different weight distribution
 * - Poles for balance and pushing (future feature)
 */

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

export const SKI_CONFIG = {
  // Ski geometry (each ski)
  skiLength: 1.7,  // meters
  skiWidth: 0.08,  // meters (much narrower than snowboard)
  sidecutRadius: 14,  // meters - longer radius than snowboard for stability

  // Stance
  stanceWidth: 0.3,  // meters - hip-width stance
  bindingAngle: 15,  // degrees - slight forward cant

  // Edge angle limits
  maxEdgeAngle: 70 * (Math.PI / 180),  // ~1.22 rad - can edge deeper than snowboard
  minEdgeForCarve: 10 * (Math.PI / 180),

  // Response rates - skis are more responsive
  edgeResponseRate: 10.0,  // Faster than snowboard

  // Grip parameters
  baseGripCoefficient: 1.3,  // Higher base grip with two edges
  edgeSharpness: 0.95,

  // Parallel turn vs wedge
  parallelThreshold: 0.8,  // How similar both ski angles need to be for parallel
  wedgeMaxAngle: 25 * (Math.PI / 180),  // Max wedge angle for snowplow
  wedgeBrakePower: 2.5,  // How much wedge slows you down

  // Carving bonus
  parallelCarveBonus: 1.2,  // Extra grip when both skis carve together
  carvingAcceleration: 2.0,  // Speed gain from pumping turns

  // Agility
  turnInitiationSpeed: 1.3,  // Faster turn initiation than snowboard
  recoveryRate: 1.5,  // Faster recovery from mistakes
};

// =============================================================================
// STATE INITIALIZATION
// =============================================================================

/**
 * Initialize ski state on the player controller
 */
export function initSkiState() {
  this.ski = {
    // Individual ski states
    leftSki: {
      edgeAngle: 0,
      targetEdgeAngle: 0,
      pressure: 0.5,  // 0-1, weight on this ski
      isCarving: false,
    },
    rightSki: {
      edgeAngle: 0,
      targetEdgeAngle: 0,
      pressure: 0.5,
      isCarving: false,
    },

    // Combined state
    turnType: 'neutral',  // 'parallel', 'wedge', 'stem', 'neutral'
    isParallel: true,
    wedgeAngle: 0,  // Angle between skis (0 = parallel, positive = wedge)

    // Turn state
    turnPhase: 'neutral',  // 'initiation', 'shaping', 'finish', 'neutral'
    turnDirection: 0,  // -1 = left, 1 = right
    turnQuality: 1.0,

    // Carve state
    isCarving: false,
    carveQuality: 1.0,
    effectiveTurnRadius: Infinity,
    gForce: 0,

    // Speed control
    isBraking: false,  // Wedge/snowplow active
    brakeIntensity: 0,

    // Pole plant (future feature)
    leftPoleDown: false,
    rightPoleDown: false,

    // Visual feedback
    sprayIntensity: 0,
    leftSpray: 0,
    rightSpray: 0,
  };
}

// =============================================================================
// EDGE CONTROL
// =============================================================================

/**
 * Calculate target edge angles for both skis based on input
 * In skiing, both skis typically edge in the same direction for parallel turns
 */
export function calculateSkiEdgeAngles(dt, steerInput, leanInput) {
  const config = SKI_CONFIG;
  const ski = this.ski;

  const absInput = Math.abs(steerInput);

  // Base edge angle from input magnitude (same as snowboard)
  let targetAngle = 0;
  if (absInput < 0.2) {
    targetAngle = THREE.MathUtils.mapLinear(absInput, 0, 0.2, 0, 20 * Math.PI / 180);
  } else if (absInput < 0.5) {
    targetAngle = THREE.MathUtils.mapLinear(absInput, 0.2, 0.5, 20 * Math.PI / 180, 40 * Math.PI / 180);
  } else if (absInput < 0.8) {
    targetAngle = THREE.MathUtils.mapLinear(absInput, 0.5, 0.8, 40 * Math.PI / 180, 55 * Math.PI / 180);
  } else {
    targetAngle = THREE.MathUtils.mapLinear(absInput, 0.8, 1.0, 55 * Math.PI / 180, config.maxEdgeAngle);
  }

  const turnDirection = Math.sign(steerInput);

  // Check for wedge/snowplow (back weight + no turn input or opposite inputs)
  const isWedgeInput = leanInput < -0.3 && absInput < 0.3;

  if (isWedgeInput) {
    // Wedge position - skis form a "V" shape, both on inside edges
    const wedgeIntensity = Math.abs(leanInput + 0.3) / 0.7;
    const wedgeEdge = wedgeIntensity * config.wedgeMaxAngle;

    // Both skis edge inward (left ski = positive edge, right ski = negative edge)
    ski.leftSki.targetEdgeAngle = wedgeEdge;
    ski.rightSki.targetEdgeAngle = -wedgeEdge;
    ski.wedgeAngle = wedgeEdge * 2;
    ski.turnType = 'wedge';
    ski.isBraking = true;
    ski.brakeIntensity = wedgeIntensity;
  } else {
    // Parallel skiing - both skis edge in same direction
    // In a left turn (steerInput < 0), both skis go onto left edges
    // In a right turn (steerInput > 0), both skis go onto right edges

    const edgeAngle = targetAngle * turnDirection;

    ski.leftSki.targetEdgeAngle = edgeAngle;
    ski.rightSki.targetEdgeAngle = edgeAngle;
    ski.wedgeAngle = 0;
    ski.turnType = absInput > 0.1 ? 'parallel' : 'neutral';
    ski.isBraking = false;
    ski.brakeIntensity = 0;
  }

  // Apply edge response rate (smooth transition)
  const responseRate = config.edgeResponseRate;

  ski.leftSki.edgeAngle += (ski.leftSki.targetEdgeAngle - ski.leftSki.edgeAngle) * responseRate * dt;
  ski.rightSki.edgeAngle += (ski.rightSki.targetEdgeAngle - ski.rightSki.edgeAngle) * responseRate * dt;

  // Clamp edge angles
  ski.leftSki.edgeAngle = THREE.MathUtils.clamp(ski.leftSki.edgeAngle, -config.maxEdgeAngle, config.maxEdgeAngle);
  ski.rightSki.edgeAngle = THREE.MathUtils.clamp(ski.rightSki.edgeAngle, -config.maxEdgeAngle, config.maxEdgeAngle);

  // Update turn direction
  ski.turnDirection = turnDirection;

  // Check if parallel (both skis edging similarly)
  const edgeDiff = Math.abs(ski.leftSki.edgeAngle - ski.rightSki.edgeAngle);
  ski.isParallel = edgeDiff < 10 * Math.PI / 180;
}

// =============================================================================
// PRESSURE DISTRIBUTION
// =============================================================================

/**
 * Update weight distribution between skis
 */
export function updateSkiPressure(dt, leanInput, steerInput) {
  const ski = this.ski;

  // Default: even pressure
  let leftPressure = 0.5;
  let rightPressure = 0.5;

  // In turns, weight shifts to outside ski
  // Left turn (steerInput < 0) = more weight on right ski
  // Right turn (steerInput > 0) = more weight on left ski
  if (Math.abs(steerInput) > 0.1) {
    const turnPressureShift = Math.abs(steerInput) * 0.3;  // Up to 30% shift
    if (steerInput < 0) {
      rightPressure += turnPressureShift;
      leftPressure -= turnPressureShift;
    } else {
      leftPressure += turnPressureShift;
      rightPressure -= turnPressureShift;
    }
  }

  // Forward/back weight affects both skis
  // Forward lean = more pressure on tips (affects turn initiation)
  // Back lean = more pressure on tails (skids more easily)
  const forwardBack = leanInput * 0.2;

  // Smooth pressure changes
  const pressureRate = 5.0;
  ski.leftSki.pressure = THREE.MathUtils.lerp(ski.leftSki.pressure, leftPressure, pressureRate * dt);
  ski.rightSki.pressure = THREE.MathUtils.lerp(ski.rightSki.pressure, rightPressure, pressureRate * dt);
}

// =============================================================================
// TURN RADIUS & GRIP
// =============================================================================

/**
 * Calculate effective turn radius from ski edge angles
 * Uses weighted average of both skis
 */
export function calculateSkiTurnRadius() {
  const config = SKI_CONFIG;
  const ski = this.ski;

  // Get average edge angle weighted by pressure
  const leftWeight = ski.leftSki.pressure;
  const rightWeight = ski.rightSki.pressure;
  const totalWeight = leftWeight + rightWeight;

  const avgEdgeAngle = (
    Math.abs(ski.leftSki.edgeAngle) * leftWeight +
    Math.abs(ski.rightSki.edgeAngle) * rightWeight
  ) / totalWeight;

  if (avgEdgeAngle < config.minEdgeForCarve) {
    return Infinity;
  }

  // Sidecut geometry: radius = sidecutRadius / sin(edgeAngle)
  const sinEdge = Math.sin(avgEdgeAngle);
  let radius = config.sidecutRadius / Math.max(sinEdge, 0.15);

  // Parallel carving is more efficient
  if (ski.isParallel && !ski.isBraking) {
    radius *= 0.9;  // Tighter turns when skis work together
  }

  // Minimum radius
  return Math.max(radius, 3.0);
}

/**
 * Calculate available grip from both skis
 */
export function calculateSkiGrip(speed2D) {
  const config = SKI_CONFIG;
  const ski = this.ski;

  // Calculate grip for each ski
  const leftEdge = Math.abs(ski.leftSki.edgeAngle);
  const rightEdge = Math.abs(ski.rightSki.edgeAngle);

  // Base grip from edge engagement
  let leftGrip = config.baseGripCoefficient * (0.7 + leftEdge * 0.4);
  let rightGrip = config.baseGripCoefficient * (0.7 + rightEdge * 0.4);

  // Weight distribution affects individual ski grip
  leftGrip *= (0.5 + ski.leftSki.pressure);
  rightGrip *= (0.5 + ski.rightSki.pressure);

  // Parallel carving bonus - both skis working together
  if (ski.isParallel && leftEdge > config.minEdgeForCarve && rightEdge > config.minEdgeForCarve) {
    leftGrip *= config.parallelCarveBonus;
    rightGrip *= config.parallelCarveBonus;
  }

  // Combined grip (both skis contribute)
  const totalGrip = (leftGrip * ski.leftSki.pressure + rightGrip * ski.rightSki.pressure);

  // Normalize to 0-1 range
  return Math.min(totalGrip / 2, 0.98);
}

// =============================================================================
// CARVE VS SKID PHYSICS
// =============================================================================

/**
 * Determine if skis are carving or skidding
 */
export function updateSkiCarveState(dt, speed2D) {
  const config = SKI_CONFIG;
  const ski = this.ski;

  const radius = calculateSkiTurnRadius.call(this);
  ski.effectiveTurnRadius = radius;

  // Required vs available grip
  const requiredCentripetal = radius < Infinity ? (this.mass * speed2D * speed2D) / radius : 0;
  const normalForce = this.mass * 9.81;
  const availableGrip = calculateSkiGrip.call(this, speed2D) * normalForce;

  // G-force calculation
  ski.gForce = requiredCentripetal / normalForce;

  // Carve if we have enough grip
  const carveBuffer = 1.15;  // Some margin

  if (requiredCentripetal <= availableGrip * carveBuffer) {
    ski.isCarving = true;
    ski.carveQuality = Math.min(1, ski.carveQuality + dt * 1.5);

    // Individual ski carve state
    ski.leftSki.isCarving = Math.abs(ski.leftSki.edgeAngle) > config.minEdgeForCarve;
    ski.rightSki.isCarving = Math.abs(ski.rightSki.edgeAngle) > config.minEdgeForCarve;

    // Spray based on carve intensity
    ski.leftSpray = ski.leftSki.isCarving ? Math.abs(ski.leftSki.edgeAngle) * speed2D * 0.05 : 0;
    ski.rightSpray = ski.rightSki.isCarving ? Math.abs(ski.rightSki.edgeAngle) * speed2D * 0.05 : 0;
    ski.sprayIntensity = Math.max(ski.leftSpray, ski.rightSpray);
  } else {
    // Skidding
    ski.isCarving = false;
    ski.carveQuality = Math.max(0, ski.carveQuality - dt * 2.0);
    ski.leftSki.isCarving = false;
    ski.rightSki.isCarving = false;

    // More spray when skidding
    const skidAmount = (requiredCentripetal - availableGrip) / availableGrip;
    ski.sprayIntensity = skidAmount * speed2D * 0.2;
  }
}

// =============================================================================
// TURN PHYSICS
// =============================================================================

/**
 * Apply ski turn physics to heading
 */
export function applySkiTurnPhysics(dt, speed2D) {
  const config = SKI_CONFIG;
  const ski = this.ski;

  if (speed2D < 0.5) {
    this.headingVelocity *= 0.85;
    return;
  }

  const avgEdge = (Math.abs(ski.leftSki.edgeAngle) + Math.abs(ski.rightSki.edgeAngle)) / 2;

  if (avgEdge < config.minEdgeForCarve) {
    this.headingVelocity *= 0.9;
    return;
  }

  // Angular velocity from turn radius
  let angularVel = 0;

  if (ski.effectiveTurnRadius < Infinity) {
    angularVel = speed2D / ski.effectiveTurnRadius;
    angularVel *= ski.turnDirection;

    // Faster turn initiation for skis
    angularVel *= config.turnInitiationSpeed;

    // Reduce turn rate when skidding
    if (!ski.isCarving) {
      angularVel *= 0.7;
    }
  }

  // Smooth heading velocity
  const turnInertia = 1 + speed2D * 0.015;
  const turnResponse = 7 / turnInertia;

  this.headingVelocity = THREE.MathUtils.lerp(
    this.headingVelocity,
    angularVel,
    turnResponse * dt
  );

  // Clamp max turn rate (skis can turn faster than snowboard)
  const maxTurnRate = 3.5;
  this.headingVelocity = THREE.MathUtils.clamp(this.headingVelocity, -maxTurnRate, maxTurnRate);

  // Apply heading change
  this.heading += this.headingVelocity * dt;
}

// =============================================================================
// BRAKING (WEDGE/SNOWPLOW)
// =============================================================================

/**
 * Apply wedge/snowplow braking
 */
export function applySkiBraking(dt, speed2D, forward) {
  const config = SKI_CONFIG;
  const ski = this.ski;

  if (!ski.isBraking || speed2D < 0.5) return;

  // Brake force proportional to wedge angle and intensity
  const brakeForce = ski.brakeIntensity * config.wedgeBrakePower * speed2D;

  // Apply deceleration
  const decel = brakeForce * dt;
  const currentSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

  if (currentSpeed > decel) {
    const scale = (currentSpeed - decel) / currentSpeed;
    this.velocity.x *= scale;
    this.velocity.z *= scale;
  }

  // Wedge also provides lateral stability
  this.velocity.x = forward.x * this.velocity.dot(forward);
  this.velocity.z = forward.z * this.velocity.dot(forward);

  // Big spray when braking
  ski.sprayIntensity = ski.brakeIntensity * speed2D * 0.3;
}

// =============================================================================
// GRIP APPLICATION
// =============================================================================

/**
 * Apply ski grip to eliminate lateral velocity
 */
export function applySkiGrip(dt, forward, right) {
  const ski = this.ski;

  // Calculate grip
  let grip;
  if (ski.isCarving) {
    grip = 0.90 + ski.carveQuality * 0.08;  // 90-98% grip
  } else if (ski.isBraking) {
    grip = 0.95;  // High grip when wedging
  } else {
    grip = 0.85;  // Base grip
  }

  // Apply grip to eliminate lateral velocity
  const forwardSpeed = this.velocity.dot(forward);
  const lateralSpeed = this.velocity.dot(right);
  const newLateral = lateralSpeed * (1 - grip);

  this.velocity.x = forward.x * forwardSpeed + right.x * newLateral;
  this.velocity.z = forward.z * forwardSpeed + right.z * newLateral;
}

// =============================================================================
// MAIN UPDATE FUNCTION
// =============================================================================

/**
 * Main ski physics update
 */
export function updateSkiPhysics(dt, speed2D, forward, right) {
  // Initialize ski state if needed
  if (!this.ski) {
    initSkiState.call(this);
  }

  // 1. Calculate edge angles from input
  calculateSkiEdgeAngles.call(this, dt, this.input.steer, this.input.lean);

  // 2. Update pressure distribution
  updateSkiPressure.call(this, dt, this.input.lean, this.input.steer);

  // 3. Update carve vs skid state
  updateSkiCarveState.call(this, dt, speed2D);

  // 4. Apply turn physics
  applySkiTurnPhysics.call(this, dt, speed2D);

  // 5. Apply braking if wedging
  applySkiBraking.call(this, dt, speed2D, forward);

  // 6. Apply grip
  applySkiGrip.call(this, dt, forward, right);

  // Sync with legacy state for animation compatibility
  // Use average of both ski edges for the unified edgeAngle
  this.edgeAngle = (this.ski.leftSki.edgeAngle + this.ski.rightSki.edgeAngle) / 2;
  this.carveRailStrength = this.ski.isCarving ? this.ski.carveQuality : 0;
  this.carvePerfection = this.ski.carveQuality;

  return {
    leftEdge: this.ski.leftSki.edgeAngle,
    rightEdge: this.ski.rightSki.edgeAngle,
    turnType: this.ski.turnType,
    isCarving: this.ski.isCarving,
    isBraking: this.ski.isBraking,
    gForce: this.ski.gForce,
  };
}

// =============================================================================
// CARVE ACCELERATION (PUMPING)
// =============================================================================

/**
 * Apply carve acceleration for skiing
 * Clean parallel carves generate speed
 */
export function applySkiCarveAcceleration(dt, speed2D, forward) {
  const config = SKI_CONFIG;
  const ski = this.ski;

  // Only accelerate during clean parallel carves
  if (!ski.isCarving || !ski.isParallel || ski.isBraking) return;

  // Acceleration based on G-force and carve quality
  if (ski.gForce > 0.3 && ski.carveQuality > 0.5) {
    const pumpAccel = ski.gForce * ski.carveQuality * config.carvingAcceleration * dt;
    this.velocity.x += forward.x * pumpAccel;
    this.velocity.z += forward.z * pumpAccel;
  }
}
