/**
 * @fileoverview Type definitions for the snowboard physics system.
 *
 * This file contains JSDoc type definitions that provide type safety
 * and documentation for the physics state objects. These types are
 * designed to make the codebase maintainable and self-documenting.
 *
 * Architecture:
 * - PlayerState: Core movement and physics state
 * - CarveState: Edge control, carving, and grip state
 * - AirState: Airborne rotation and jump state
 * - SkiState: Ski-specific state (alternative sport mode)
 * - InputState: User input from all sources
 * - TerrainContact: Ground detection and surface info
 */

import * as THREE from 'three';

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * @typedef {Object} InputState
 * @property {number} steer - Steering input (-1 to 1, left to right)
 * @property {number} lean - Forward/back lean (-1 to 1, back to forward)
 * @property {boolean} jump - Jump button pressed
 * @property {boolean} switchStance - Switch stance button pressed
 * @property {boolean} shift - Shift modifier held
 */

/**
 * Creates a default InputState
 * @returns {InputState}
 */
export function createInputState() {
  return {
    steer: 0,
    lean: 0,
    jump: false,
    switchStance: false,
    shift: false,
  };
}

// =============================================================================
// TERRAIN CONTACT TYPES
// =============================================================================

/**
 * @typedef {Object} TerrainContact
 * @property {boolean} isGrounded - Whether player is on ground
 * @property {boolean} wasGrounded - Whether player was grounded last frame
 * @property {THREE.Vector3} groundNormal - Surface normal at contact point
 * @property {number} groundHeight - Y position of ground at player position
 * @property {number} airTime - Time spent in air (seconds)
 */

/**
 * Creates a default TerrainContact
 * @returns {TerrainContact}
 */
export function createTerrainContact() {
  return {
    isGrounded: false,
    wasGrounded: false,
    groundNormal: new THREE.Vector3(0, 1, 0),
    groundHeight: 0,
    airTime: 0,
  };
}

// =============================================================================
// SNOW CONDITION TYPES
// =============================================================================

/**
 * @typedef {'groomed' | 'powder' | 'ice' | 'crud' | 'slush'} SnowType
 */

/**
 * @typedef {Object} SnowCondition
 * @property {SnowType} type - Type of snow surface
 * @property {number} gripMultiplier - Grip modifier (0.5 to 1.5)
 * @property {number} speedMultiplier - Speed modifier (0.8 to 1.2)
 * @property {number} dragMultiplier - Drag modifier (0.8 to 1.5)
 * @property {number} intensity - Condition intensity (0 to 1)
 */

/**
 * Creates a default SnowCondition (groomed corduroy)
 * @returns {SnowCondition}
 */
export function createSnowCondition() {
  return {
    type: 'groomed',
    gripMultiplier: 1.0,
    speedMultiplier: 1.0,
    dragMultiplier: 1.0,
    intensity: 0,
  };
}

// =============================================================================
// CORE PHYSICS STATE
// =============================================================================

/**
 * @typedef {Object} PhysicsState
 * @property {THREE.Vector3} velocity - Current velocity vector
 * @property {number} heading - Direction facing (radians, 0 = down slope)
 * @property {number} headingVelocity - Rate of heading change (rad/s)
 * @property {number} currentSpeed - Scalar speed (m/s)
 * @property {number} mass - Player mass (kg)
 */

/**
 * Creates a default PhysicsState
 * @returns {PhysicsState}
 */
export function createPhysicsState() {
  return {
    velocity: new THREE.Vector3(),
    heading: 0,
    headingVelocity: 0,
    currentSpeed: 0,
    mass: 75,
  };
}

// =============================================================================
// EDGE & CARVE STATE (V1 system)
// =============================================================================

/**
 * @typedef {Object} EdgeState
 * @property {number} edgeAngle - Current edge angle (radians, negative=heelside, positive=toeside)
 * @property {number} targetEdgeAngle - Target edge angle from input
 * @property {number} edgeVelocity - Rate of edge angle change (rad/s)
 * @property {number} slipAngle - Angle between heading and velocity
 * @property {number} peakEdgeAngle - Maximum edge angle reached in current carve
 */

/**
 * Creates a default EdgeState
 * @returns {EdgeState}
 */
export function createEdgeState() {
  return {
    edgeAngle: 0,
    targetEdgeAngle: 0,
    edgeVelocity: 0,
    slipAngle: 0,
    peakEdgeAngle: 0,
  };
}

/**
 * @typedef {Object} CarveRailState
 * @property {number} carveRailStrength - How engaged the carve rail is (0 to 1)
 * @property {number} carveHoldTime - Time current carve has been held (seconds)
 * @property {number} smoothedRailStrength - Smoothed rail strength for physics
 * @property {number} carveRailThreshold - Edge angle threshold to engage rail (radians)
 */

/**
 * Creates a default CarveRailState
 * @returns {CarveRailState}
 */
export function createCarveRailState() {
  return {
    carveRailStrength: 0,
    carveHoldTime: 0,
    smoothedRailStrength: 0,
    carveRailThreshold: 0.5,
  };
}

/**
 * @typedef {Object} CarveChainState
 * @property {number} carveChainCount - Consecutive clean carves (0 to 10)
 * @property {number} carveEnergy - Accumulated carve energy
 * @property {number} carvePerfection - Current carve quality (0 to 1)
 * @property {number} lastCarveDirection - Direction of last carve (-1 or 1)
 */

/**
 * Creates a default CarveChainState
 * @returns {CarveChainState}
 */
export function createCarveChainState() {
  return {
    carveChainCount: 0,
    carveEnergy: 0,
    carvePerfection: 0,
    lastCarveDirection: 0,
  };
}

/**
 * @typedef {Object} AngulationState
 * @property {number} angulation - Current body angulation (0 to 1)
 * @property {number} targetAngulation - Target angulation based on edge/speed
 * @property {number} angulationCapacity - Available angulation capacity (0 to 1)
 */

/**
 * Creates a default AngulationState
 * @returns {AngulationState}
 */
export function createAngulationState() {
  return {
    angulation: 0,
    targetAngulation: 0,
    angulationCapacity: 1.0,
  };
}

/**
 * @typedef {Object} BoardFlexState
 * @property {number} boardFlex - Current board flex amount (0 to 1)
 * @property {number} flexEnergy - Stored flex energy for pop (0 to maxFlexEnergy)
 * @property {number} maxFlexEnergy - Maximum flex energy capacity
 * @property {number} flexStiffness - Board stiffness (higher = faster response)
 */

/**
 * Creates a default BoardFlexState
 * @returns {BoardFlexState}
 */
export function createBoardFlexState() {
  return {
    boardFlex: 0,
    flexEnergy: 0,
    maxFlexEnergy: 1.5,
    flexStiffness: 8,
  };
}

/**
 * @typedef {Object} FlowState
 * @property {number} flowState - Current flow level (0 to 1)
 * @property {number} flowMomentum - Flow momentum from consecutive carves
 * @property {number} flowDecayRate - Rate flow decays without good carves
 * @property {number} flowBuildRate - Rate flow builds with good carves
 */

/**
 * Creates a default FlowState
 * @returns {FlowState}
 */
export function createFlowState() {
  return {
    flowState: 0,
    flowMomentum: 0,
    flowDecayRate: 0.3,
    flowBuildRate: 0.15,
  };
}

/**
 * @typedef {'none' | 'c-turn' | 'j-turn' | 'wiggle'} ArcType
 */

/**
 * @typedef {Object} ArcTrackingState
 * @property {number} arcHeadingChange - Total heading change in current arc (radians)
 * @property {number} arcStartHeading - Heading when arc started
 * @property {ArcType} arcType - Classification of current turn shape
 */

/**
 * Creates a default ArcTrackingState
 * @returns {ArcTrackingState}
 */
export function createArcTrackingState() {
  return {
    arcHeadingChange: 0,
    arcStartHeading: 0,
    arcType: 'none',
  };
}

/**
 * @typedef {Object} EdgeBiteState
 * @property {number} edgeBite - Current edge bite level (0 to 1)
 * @property {number} edgeBiteRate - Rate edge bite builds
 * @property {number} maxEdgeBite - Maximum edge bite
 */

/**
 * Creates a default EdgeBiteState
 * @returns {EdgeBiteState}
 */
export function createEdgeBiteState() {
  return {
    edgeBite: 0,
    edgeBiteRate: 2.0,
    maxEdgeBite: 1.0,
  };
}

/**
 * @typedef {Object} EdgeTransitionState
 * @property {number} previousEdgeSide - Previous edge side (-1, 0, or 1)
 * @property {number} edgeTransitionBoost - Boost from edge transition
 * @property {number} lastEdgeChangeTime - Time since last edge change (seconds)
 */

/**
 * Creates a default EdgeTransitionState
 * @returns {EdgeTransitionState}
 */
export function createEdgeTransitionState() {
  return {
    previousEdgeSide: 0,
    edgeTransitionBoost: 0,
    lastEdgeChangeTime: 0,
  };
}

// =============================================================================
// COMBINED CARVE STATE (all V1 carving state)
// =============================================================================

/**
 * @typedef {Object} CarveState
 * @property {EdgeState} edge - Edge angle state
 * @property {CarveRailState} rail - Carve rail engagement state
 * @property {CarveChainState} chain - Carve chain bonus state
 * @property {AngulationState} angulation - Body angulation state
 * @property {BoardFlexState} flex - Board flex state
 * @property {FlowState} flow - Flow state tracking
 * @property {ArcTrackingState} arc - Arc shape tracking
 * @property {EdgeBiteState} bite - Edge bite progression
 * @property {EdgeTransitionState} transition - Edge transition tracking
 */

/**
 * Creates a complete CarveState with all sub-states
 * @returns {CarveState}
 */
export function createCarveState() {
  return {
    edge: createEdgeState(),
    rail: createCarveRailState(),
    chain: createCarveChainState(),
    angulation: createAngulationState(),
    flex: createBoardFlexState(),
    flow: createFlowState(),
    arc: createArcTrackingState(),
    bite: createEdgeBiteState(),
    transition: createEdgeTransitionState(),
  };
}

// =============================================================================
// RISK & FAILURE STATE
// =============================================================================

/**
 * @typedef {Object} RiskState
 * @property {number} riskLevel - Current risk level (0 to 1)
 * @property {number} wobbleAmount - Current wobble intensity
 * @property {boolean} isRecovering - Whether recovering from near-failure
 * @property {number} recoveryTime - Time spent recovering
 */

/**
 * Creates a default RiskState
 * @returns {RiskState}
 */
export function createRiskState() {
  return {
    riskLevel: 0,
    wobbleAmount: 0,
    isRecovering: false,
    recoveryTime: 0,
  };
}

/**
 * @typedef {Object} FailureState
 * @property {boolean} isWashingOut - Whether edge is washing out
 * @property {number} washOutIntensity - Wash-out severity (0 to 1)
 * @property {number} washOutDirection - Direction of wash-out
 * @property {boolean} isEdgeCaught - Whether edge has caught
 * @property {number} edgeCatchSeverity - Edge catch severity
 * @property {number} edgeCatchTime - Time since edge catch
 */

/**
 * Creates a default FailureState
 * @returns {FailureState}
 */
export function createFailureState() {
  return {
    isWashingOut: false,
    washOutIntensity: 0,
    washOutDirection: 0,
    isEdgeCaught: false,
    edgeCatchSeverity: 0,
    edgeCatchTime: 0,
  };
}

// =============================================================================
// AIR STATE
// =============================================================================

/**
 * @typedef {Object} AirRotationState
 * @property {number} pitch - Forward/back rotation (radians)
 * @property {number} roll - Side rotation (radians)
 * @property {number} pitchVelocity - Pitch rotation rate (rad/s)
 * @property {number} rollVelocity - Roll rotation rate (rad/s)
 * @property {number} spinVelocity - Y-axis spin rate (rad/s)
 */

/**
 * Creates a default AirRotationState
 * @returns {AirRotationState}
 */
export function createAirRotationState() {
  return {
    pitch: 0,
    roll: 0,
    pitchVelocity: 0,
    rollVelocity: 0,
    spinVelocity: 0,
  };
}

/**
 * @typedef {Object} JumpState
 * @property {boolean} jumpCharging - Whether jump is being charged
 * @property {number} jumpCharge - Current jump charge (0 to 1)
 * @property {number} maxChargeTime - Time to reach full charge (seconds)
 */

/**
 * Creates a default JumpState
 * @returns {JumpState}
 */
export function createJumpState() {
  return {
    jumpCharging: false,
    jumpCharge: 0,
    maxChargeTime: 0.4,
  };
}

/**
 * @typedef {Object} CompressionState
 * @property {number} compression - Current leg compression (0 to 1)
 * @property {number} compressionVelocity - Rate of compression change
 * @property {number} targetCompression - Target compression level
 */

/**
 * Creates a default CompressionState
 * @returns {CompressionState}
 */
export function createCompressionState() {
  return {
    compression: 0,
    compressionVelocity: 0,
    targetCompression: 0,
  };
}

/**
 * @typedef {Object} AirState
 * @property {AirRotationState} rotation - Air rotation state
 * @property {JumpState} jump - Jump/ollie state
 * @property {CompressionState} compression - Leg compression state
 */

/**
 * Creates a complete AirState
 * @returns {AirState}
 */
export function createAirState() {
  return {
    rotation: createAirRotationState(),
    jump: createJumpState(),
    compression: createCompressionState(),
  };
}

// =============================================================================
// GRIND STATE
// =============================================================================

/**
 * @typedef {Object} GrindState
 * @property {boolean} isGrinding - Whether currently grinding
 * @property {Object|null} grindRail - Reference to current rail
 * @property {number} grindProgress - Progress along rail (0 to 1)
 * @property {number} grindBalance - Balance on rail (-1 to 1)
 * @property {number} grindTime - Time spent on current grind
 */

/**
 * Creates a default GrindState
 * @returns {GrindState}
 */
export function createGrindState() {
  return {
    isGrinding: false,
    grindRail: null,
    grindProgress: 0,
    grindBalance: 0,
    grindTime: 0,
  };
}

// =============================================================================
// SWITCH RIDING STATE
// =============================================================================

/**
 * @typedef {Object} SwitchState
 * @property {boolean} ridingSwitch - Whether riding switch
 * @property {number} switchBlend - Blend between regular and switch (0 to 1)
 * @property {number} smoothSwitchMult - Smoothed switch multiplier (-1 to 1)
 * @property {number} switchLockTime - Time until switch can change again
 */

/**
 * Creates a default SwitchState
 * @returns {SwitchState}
 */
export function createSwitchState() {
  return {
    ridingSwitch: false,
    switchBlend: 0,
    smoothSwitchMult: 1,
    switchLockTime: 0,
  };
}

// =============================================================================
// WEIGHT TRANSFER STATE
// =============================================================================

/**
 * @typedef {Object} WeightState
 * @property {number} weightForward - Forward weight shift (-1 to 1)
 * @property {number} weightSide - Side weight shift (-1 to 1)
 * @property {number} effectivePressure - Effective edge pressure (0 to 2)
 */

/**
 * Creates a default WeightState
 * @returns {WeightState}
 */
export function createWeightState() {
  return {
    weightForward: 0,
    weightSide: 0,
    effectivePressure: 1,
  };
}

// =============================================================================
// V2 CARVE STATE (realistic physics system)
// =============================================================================

/**
 * @typedef {'regular' | 'goofy'} Stance
 */

/**
 * @typedef {'toeside' | 'heelside' | 'flat'} EdgeSide
 */

/**
 * @typedef {'initiation' | 'apex' | 'exit' | 'neutral'} TurnPhase
 */

/**
 * @typedef {Object} V2CarveState
 * @property {Stance} stance - Rider's natural stance
 * @property {boolean} isSwitch - Whether riding switch
 * @property {number} switchTransitionTime - Time in switch transition
 * @property {EdgeSide} currentEdge - Current physical edge engaged
 * @property {number} physicalEdgeAngle - Actual edge angle (radians)
 * @property {number} targetEdgeAngle - Target edge angle from input
 * @property {number} edgeEngageTime - Time current edge has been engaged
 * @property {number} pressureDistribution - Weight fore/aft (0=back, 1=front)
 * @property {number} targetPressure - Target pressure distribution
 * @property {TurnPhase} turnPhase - Current phase of turn
 * @property {number} turnPhaseTime - Time in current phase
 * @property {number} turnDirection - Turn direction (-1=left, 0=straight, 1=right)
 * @property {boolean} isCarving - Whether in clean carve
 * @property {boolean} isSkidding - Whether skidding
 * @property {number} slipAngle - Slip angle (radians)
 * @property {number} carveQuality - Carve cleanliness (0 to 1)
 * @property {number} effectiveTurnRadius - Actual turn radius (meters)
 * @property {number} requiredCentripetal - Required centripetal force
 * @property {number} availableGrip - Available grip force
 * @property {number} gripDeficit - Grip shortfall (causes skid)
 * @property {number} gForce - Current G-force
 * @property {number} inclination - Body lean angle
 * @property {number} sprayIntensity - Snow spray intensity
 * @property {number} edgeScrapeIntensity - Edge scrape sound intensity
 */

/**
 * Creates a default V2CarveState
 * @returns {V2CarveState}
 */
export function createV2CarveState() {
  return {
    stance: 'regular',
    isSwitch: false,
    switchTransitionTime: 0,
    currentEdge: 'flat',
    physicalEdgeAngle: 0,
    targetEdgeAngle: 0,
    edgeEngageTime: 0,
    pressureDistribution: 0.5,
    targetPressure: 0.5,
    turnPhase: 'neutral',
    turnPhaseTime: 0,
    turnDirection: 0,
    isCarving: true,
    isSkidding: false,
    slipAngle: 0,
    carveQuality: 1.0,
    effectiveTurnRadius: Infinity,
    requiredCentripetal: 0,
    availableGrip: 0,
    gripDeficit: 0,
    gForce: 0,
    inclination: 0,
    sprayIntensity: 0,
    edgeScrapeIntensity: 0,
  };
}

// =============================================================================
// SKI STATE
// =============================================================================

/**
 * @typedef {Object} IndividualSkiState
 * @property {number} edgeAngle - Ski edge angle (radians)
 * @property {number} targetEdgeAngle - Target edge angle
 * @property {number} pressure - Weight on this ski (0 to 1)
 * @property {boolean} isCarving - Whether this ski is carving
 */

/**
 * @typedef {'parallel' | 'wedge' | 'stem' | 'neutral'} SkiTurnType
 */

/**
 * @typedef {Object} SkiState
 * @property {IndividualSkiState} leftSki - Left ski state
 * @property {IndividualSkiState} rightSki - Right ski state
 * @property {SkiTurnType} turnType - Current turn type
 * @property {boolean} isParallel - Whether skis are parallel
 * @property {number} wedgeAngle - Angle between skis
 * @property {boolean} isBraking - Whether in snowplow brake
 * @property {number} brakeIntensity - Brake intensity (0 to 1)
 * @property {boolean} isCarving - Overall carving state
 * @property {number} carveQuality - Carve quality (0 to 1)
 * @property {number} gForce - Current G-force
 * @property {number} effectiveTurnRadius - Turn radius (meters)
 */

/**
 * Creates a default SkiState
 * @returns {SkiState}
 */
export function createSkiState() {
  return {
    leftSki: {
      edgeAngle: 0,
      targetEdgeAngle: 0,
      pressure: 0.5,
      isCarving: false,
    },
    rightSki: {
      edgeAngle: 0,
      targetEdgeAngle: 0,
      pressure: 0.5,
      isCarving: false,
    },
    turnType: 'neutral',
    isParallel: true,
    wedgeAngle: 0,
    isBraking: false,
    brakeIntensity: 0,
    isCarving: false,
    carveQuality: 0,
    gForce: 0,
    effectiveTurnRadius: Infinity,
  };
}

// =============================================================================
// BOARD CONFIGURATION
// =============================================================================

/**
 * @typedef {Object} BoardConfig
 * @property {number} length - Board length (meters)
 * @property {number} width - Board width (meters)
 * @property {number} sidecutRadius - Sidecut radius (meters)
 * @property {number} flex - Board flex (0=soft, 1=stiff)
 * @property {number} effectiveEdge - Effective edge length (meters)
 */

/**
 * Creates a default BoardConfig
 * @returns {BoardConfig}
 */
export function createBoardConfig() {
  return {
    length: 1.6,
    width: 0.3,
    sidecutRadius: 7,
    flex: 0.7,
    effectiveEdge: 1.2,
  };
}

// =============================================================================
// PHYSICS CONFIG (tunable parameters)
// =============================================================================

/**
 * @typedef {Object} CarvePhysicsConfig
 * @property {number} maxEdge - Maximum edge angle (radians)
 * @property {number} carveRailThreshold - Edge angle to engage rail
 * @property {number} baseGrip - Base grip coefficient
 * @property {number} maxGrip - Maximum possible grip
 * @property {number} edgeSpring - Edge spring constant
 * @property {number} edgeDamp - Edge damping coefficient
 * @property {number} sweetSpotCenter - Optimal transition timing (seconds)
 * @property {number} sweetSpotRadius - Sweet spot timing tolerance
 */

/**
 * Creates default CarvePhysicsConfig
 * @returns {CarvePhysicsConfig}
 */
export function createCarvePhysicsConfig() {
  return {
    maxEdge: 1.15,
    carveRailThreshold: 0.5,
    baseGrip: 0.7,
    maxGrip: 0.98,
    edgeSpring: 70,
    edgeDamp: 8,
    sweetSpotCenter: 0.8,
    sweetSpotRadius: 0.4,
  };
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * @typedef {Object} GripCalculation
 * @property {number} totalGrip - Final calculated grip (0 to maxGrip)
 * @property {number} baseGrip - Base grip contribution
 * @property {number} edgeGrip - Edge angle grip contribution
 * @property {number} railGrip - Rail strength grip contribution
 * @property {number} biteGrip - Edge bite grip contribution
 * @property {number} angulationGrip - Angulation grip contribution
 * @property {number} flowGrip - Flow state grip contribution
 */

/**
 * @typedef {Object} TransitionResult
 * @property {boolean} occurred - Whether transition happened
 * @property {number} boost - Speed boost from transition
 * @property {number} timingMultiplier - Timing quality multiplier
 * @property {number} arcMultiplier - Arc shape multiplier
 * @property {number} flexBoost - Flex energy release boost
 * @property {boolean} chainIncreased - Whether chain count increased
 */

/**
 * @typedef {Object} TurnPhysicsResult
 * @property {number} turnRadius - Calculated turn radius (meters)
 * @property {number} headingChange - Heading change this frame (radians)
 * @property {number} gForce - G-force from turn
 * @property {number} carveAcceleration - Speed gained from carving
 */

// =============================================================================
// COMPLETE PLAYER STATE (composition of all states)
// =============================================================================

/**
 * @typedef {Object} CompletePlayerState
 * @property {InputState} input - User input state
 * @property {PhysicsState} physics - Core physics state
 * @property {TerrainContact} terrain - Ground contact state
 * @property {SnowCondition} snow - Current snow conditions
 * @property {CarveState} carve - V1 carving state
 * @property {V2CarveState} v2 - V2 realistic carving state
 * @property {AirState} air - Airborne state
 * @property {GrindState} grind - Grinding state
 * @property {SwitchState} switch - Switch riding state
 * @property {WeightState} weight - Weight distribution state
 * @property {RiskState} risk - Risk/stability state
 * @property {FailureState} failure - Failure state
 * @property {SkiState} ski - Ski mode state
 * @property {BoardConfig} board - Board configuration
 */

/**
 * Creates a complete player state with all sub-states initialized
 * @returns {CompletePlayerState}
 */
export function createCompletePlayerState() {
  return {
    input: createInputState(),
    physics: createPhysicsState(),
    terrain: createTerrainContact(),
    snow: createSnowCondition(),
    carve: createCarveState(),
    v2: createV2CarveState(),
    air: createAirState(),
    grind: createGrindState(),
    switch: createSwitchState(),
    weight: createWeightState(),
    risk: createRiskState(),
    failure: createFailureState(),
    ski: createSkiState(),
    board: createBoardConfig(),
  };
}

// =============================================================================
// TYPE GUARDS & VALIDATORS
// =============================================================================

/**
 * Validates that a value is a valid edge angle
 * @param {number} angle - Angle to validate
 * @param {number} maxEdge - Maximum allowed edge angle
 * @returns {number} Clamped valid edge angle
 */
export function validateEdgeAngle(angle, maxEdge = 1.15) {
  if (typeof angle !== 'number' || isNaN(angle)) return 0;
  return Math.max(-maxEdge, Math.min(maxEdge, angle));
}

/**
 * Validates that a value is in range [0, 1]
 * @param {number} value - Value to validate
 * @returns {number} Clamped value
 */
export function validateNormalized(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Normalizes an angle to [-PI, PI]
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle
 */
export function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}
