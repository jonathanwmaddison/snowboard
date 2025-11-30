/**
 * @fileoverview PlayerState - Organized state management for the player physics system.
 *
 * This module provides a clean, typed state structure that replaces the flat
 * property list in PlayerController. State is organized into logical groups
 * that can be passed to pure physics functions.
 *
 * Architecture:
 * - State is organized into sub-objects by domain
 * - Factory functions create default state
 * - State can be serialized/deserialized for debugging
 * - Physics functions receive specific state slices, not the whole player
 */

import * as THREE from 'three';

// =============================================================================
// BOARD CONFIGURATION (static, rarely changes)
// =============================================================================

/**
 * @typedef {Object} BoardConfig
 * @property {number} length - Board length in meters
 * @property {number} width - Board width in meters
 * @property {number} sidecutRadius - Sidecut radius in meters
 * @property {number} maxEdgeLowSpeed - Max edge angle at low speed (radians)
 * @property {number} maxEdgeHighSpeed - Max edge angle at high speed (radians)
 * @property {number} highSpeedThreshold - Speed where max edge starts reducing (m/s)
 * @property {number} carveRailThreshold - Edge angle to engage carve rail (radians)
 */

/**
 * Creates default board configuration
 * @returns {BoardConfig}
 */
export function createBoardConfig() {
  return {
    length: 1.6,
    width: 0.3,
    sidecutRadius: 7,
    maxEdgeLowSpeed: 1.2,
    maxEdgeHighSpeed: 0.6,
    highSpeedThreshold: 30,
    carveRailThreshold: 0.5,
  };
}

// =============================================================================
// CORE PHYSICS STATE (position, velocity, orientation)
// =============================================================================

/**
 * @typedef {Object} CoreState
 * @property {THREE.Vector3} velocity - Current velocity vector
 * @property {number} heading - Direction facing (radians, 0 = down slope)
 * @property {number} headingVelocity - Rate of heading change (rad/s)
 * @property {number} currentSpeed - Scalar 2D speed (m/s)
 * @property {number} mass - Player mass (kg)
 * @property {number} turnMomentum - Turn momentum accumulator
 * @property {number} turnInertia - Turn inertia for smoothing
 */

/**
 * Creates default core state
 * @returns {CoreState}
 */
export function createCoreState() {
  return {
    velocity: new THREE.Vector3(),
    heading: 0,
    headingVelocity: 0,
    currentSpeed: 0,
    mass: 75,
    turnMomentum: 0,
    turnInertia: 0,
  };
}

// =============================================================================
// TERRAIN CONTACT STATE
// =============================================================================

/**
 * @typedef {Object} TerrainState
 * @property {boolean} isGrounded - Whether player is on ground
 * @property {boolean} wasGrounded - Whether player was grounded last frame
 * @property {THREE.Vector3} groundNormal - Surface normal at contact point
 * @property {number} groundHeight - Y position of ground
 * @property {number} airTime - Time spent in air (seconds)
 */

/**
 * Creates default terrain state
 * @returns {TerrainState}
 */
export function createTerrainState() {
  return {
    isGrounded: false,
    wasGrounded: false,
    groundNormal: new THREE.Vector3(0, 1, 0),
    groundHeight: 0,
    airTime: 0,
  };
}

// =============================================================================
// EDGE STATE (edge angle and dynamics)
// =============================================================================

/**
 * @typedef {Object} EdgeState
 * @property {number} edgeAngle - Current edge angle (radians)
 * @property {number} targetEdgeAngle - Target edge angle from input
 * @property {number} edgeVelocity - Rate of edge angle change (rad/s)
 * @property {number} slipAngle - Angle between heading and velocity
 * @property {number} lastAbsEdge - Last absolute edge angle (for smoothing)
 */

/**
 * Creates default edge state
 * @returns {EdgeState}
 */
export function createEdgeState() {
  return {
    edgeAngle: 0,
    targetEdgeAngle: 0,
    edgeVelocity: 0,
    slipAngle: 0,
    lastAbsEdge: 0,
  };
}

// =============================================================================
// CARVE RAIL STATE (rail engagement system)
// =============================================================================

/**
 * @typedef {Object} CarveRailState
 * @property {number} carveRailStrength - How engaged the carve rail is (0-1)
 * @property {number} carveHoldTime - Time current carve has been held (seconds)
 * @property {number} smoothedRailStrength - Smoothed rail strength for physics
 * @property {number} smoothedGrip - Smoothed grip value
 */

/**
 * Creates default carve rail state
 * @returns {CarveRailState}
 */
export function createCarveRailState() {
  return {
    carveRailStrength: 0,
    carveHoldTime: 0,
    smoothedRailStrength: 0,
    smoothedGrip: 0.7,
  };
}

// =============================================================================
// CARVE CHAIN STATE (consecutive carve tracking)
// =============================================================================

/**
 * @typedef {Object} CarveChainState
 * @property {number} carveChainCount - Consecutive clean carves (0-10)
 * @property {number} carvePerfection - Current carve quality (0-1)
 * @property {number} peakEdgeAngle - Maximum edge angle in current carve
 * @property {number} carveEnergy - Accumulated carve energy
 * @property {number} lastCarveDirection - Direction of last carve (-1 or 1)
 * @property {number} carveCommitment - Current carve commitment level
 * @property {number} carveDirection - Current carve direction
 * @property {number} carveArcProgress - Progress through current arc
 * @property {number} carveEntrySpeed - Speed when carve started
 * @property {number} carveEntryEdge - Edge angle when carve started
 * @property {number} turnShapeQuality - Quality of turn shape
 * @property {number} lastEdgeAngleDelta - Last change in edge angle
 */

/**
 * Creates default carve chain state
 * @returns {CarveChainState}
 */
export function createCarveChainState() {
  return {
    carveChainCount: 0,
    carvePerfection: 0,
    peakEdgeAngle: 0,
    carveEnergy: 0,
    lastCarveDirection: 0,
    carveCommitment: 0,
    carveDirection: 0,
    carveArcProgress: 0,
    carveEntrySpeed: 0,
    carveEntryEdge: 0,
    turnShapeQuality: 1,
    lastEdgeAngleDelta: 0,
  };
}

// =============================================================================
// ANGULATION STATE (body position for edge hold)
// =============================================================================

/**
 * @typedef {Object} AngulationState
 * @property {number} angulation - Current body angulation (0-1)
 * @property {number} targetAngulation - Target angulation based on conditions
 * @property {number} angulationCapacity - Available angulation capacity (0.4-1)
 */

/**
 * Creates default angulation state
 * @returns {AngulationState}
 */
export function createAngulationState() {
  return {
    angulation: 0,
    targetAngulation: 0,
    angulationCapacity: 1.0,
  };
}

// =============================================================================
// BOARD FLEX STATE (energy storage in board)
// =============================================================================

/**
 * @typedef {Object} BoardFlexState
 * @property {number} boardFlex - Current board flex (0-1)
 * @property {number} flexEnergy - Stored flex energy for pop
 * @property {number} maxFlexEnergy - Maximum flex energy capacity
 * @property {number} flexStiffness - Board stiffness (higher = faster response)
 */

/**
 * Creates default board flex state
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

// =============================================================================
// FLOW STATE (rhythm and momentum)
// =============================================================================

/**
 * @typedef {Object} FlowState
 * @property {number} flowState - Current flow level (0-1)
 * @property {number} flowMomentum - Flow momentum from consecutive carves
 * @property {number} flowDecayRate - Rate flow decays without good carves
 * @property {number} flowBuildRate - Rate flow builds with good carves
 * @property {number} turnRhythm - Turn rhythm quality
 * @property {number} rhythmPhase - Current phase in rhythm cycle
 */

/**
 * Creates default flow state
 * @returns {FlowState}
 */
export function createFlowState() {
  return {
    flowState: 0,
    flowMomentum: 0,
    flowDecayRate: 0.3,
    flowBuildRate: 0.15,
    turnRhythm: 0,
    rhythmPhase: 0,
  };
}

// =============================================================================
// ARC TRACKING STATE (turn shape classification)
// =============================================================================

/**
 * @typedef {Object} ArcState
 * @property {number} arcHeadingChange - Total heading change in current arc
 * @property {number} arcStartHeading - Heading when arc started
 * @property {string} arcType - Classification: 'none', 'c-turn', 'j-turn', 'wiggle'
 */

/**
 * Creates default arc state
 * @returns {ArcState}
 */
export function createArcState() {
  return {
    arcHeadingChange: 0,
    arcStartHeading: 0,
    arcType: 'none',
  };
}

// =============================================================================
// EDGE BITE STATE (progressive grip)
// =============================================================================

/**
 * @typedef {Object} EdgeBiteState
 * @property {number} edgeBite - Current edge bite level (0-1)
 * @property {number} edgeBiteRate - Rate edge bite builds
 * @property {number} maxEdgeBite - Maximum edge bite
 */

/**
 * Creates default edge bite state
 * @returns {EdgeBiteState}
 */
export function createEdgeBiteState() {
  return {
    edgeBite: 0,
    edgeBiteRate: 2.0,
    maxEdgeBite: 1.0,
  };
}

// =============================================================================
// TRANSITION STATE (edge-to-edge switches)
// =============================================================================

/**
 * @typedef {Object} TransitionState
 * @property {number} previousEdgeSide - Previous edge side (-1, 0, or 1)
 * @property {number} edgeTransitionBoost - Boost from edge transition
 * @property {number} lastEdgeChangeTime - Time since last edge change (seconds)
 */

/**
 * Creates default transition state
 * @returns {TransitionState}
 */
export function createTransitionState() {
  return {
    previousEdgeSide: 0,
    edgeTransitionBoost: 0,
    lastEdgeChangeTime: 0,
  };
}

// =============================================================================
// RISK STATE (stability and near-failure)
// =============================================================================

/**
 * @typedef {Object} RiskState
 * @property {number} riskLevel - Current risk level (0-1)
 * @property {number} wobbleAmount - Current wobble intensity
 * @property {boolean} isRecovering - Whether recovering from near-failure
 * @property {number} recoveryTime - Time spent recovering
 */

/**
 * Creates default risk state
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

// =============================================================================
// FAILURE STATE (wash-out and edge catch)
// =============================================================================

/**
 * @typedef {Object} FailureState
 * @property {boolean} isWashingOut - Whether edge is washing out
 * @property {number} washOutIntensity - Wash-out severity (0-1)
 * @property {number} washOutDirection - Direction of wash-out
 * @property {boolean} isEdgeCaught - Whether edge has caught
 * @property {number} edgeCatchSeverity - Edge catch severity
 * @property {number} edgeCatchTime - Time since edge catch
 */

/**
 * Creates default failure state
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
// AIR ROTATION STATE
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
 * Creates default air rotation state
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

// =============================================================================
// JUMP STATE (ollie charging)
// =============================================================================

/**
 * @typedef {Object} JumpState
 * @property {boolean} jumpCharging - Whether jump is being charged
 * @property {number} jumpCharge - Current jump charge (0-1)
 * @property {number} maxChargeTime - Time to reach full charge (seconds)
 */

/**
 * Creates default jump state
 * @returns {JumpState}
 */
export function createJumpState() {
  return {
    jumpCharging: false,
    jumpCharge: 0,
    maxChargeTime: 0.4,
  };
}

// =============================================================================
// COMPRESSION STATE (leg compression for animation)
// =============================================================================

/**
 * @typedef {Object} CompressionState
 * @property {number} compression - Current leg compression (0-1)
 * @property {number} compressionVelocity - Rate of compression change
 * @property {number} targetCompression - Target compression level
 */

/**
 * Creates default compression state
 * @returns {CompressionState}
 */
export function createCompressionState() {
  return {
    compression: 0,
    compressionVelocity: 0,
    targetCompression: 0,
  };
}

// =============================================================================
// GRIND STATE (rail grinding)
// =============================================================================

/**
 * @typedef {Object} GrindState
 * @property {boolean} isGrinding - Whether currently grinding
 * @property {Object|null} grindRail - Reference to current rail
 * @property {number} grindProgress - Progress along rail (0-1)
 * @property {number} grindBalance - Balance on rail (-1 to 1)
 * @property {number} grindTime - Time spent on current grind
 * @property {Array} grindSparks - Spark particle array
 */

/**
 * Creates default grind state
 * @returns {GrindState}
 */
export function createGrindState() {
  return {
    isGrinding: false,
    grindRail: null,
    grindProgress: 0,
    grindBalance: 0,
    grindTime: 0,
    grindSparks: [],
  };
}

// =============================================================================
// SWITCH STATE (switch riding)
// =============================================================================

/**
 * @typedef {Object} SwitchState
 * @property {boolean} ridingSwitch - Whether riding switch
 * @property {number} switchBlend - Blend between regular and switch (0-1)
 * @property {number} smoothSwitchMult - Smoothed switch multiplier (-1 to 1)
 * @property {number} switchLockTime - Time until switch can change again
 */

/**
 * Creates default switch state
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
// WEIGHT STATE (weight distribution)
// =============================================================================

/**
 * @typedef {Object} WeightState
 * @property {number} weightForward - Forward weight shift (-1 to 1)
 * @property {number} weightSide - Side weight shift (-1 to 1)
 * @property {number} effectivePressure - Effective edge pressure (0-2)
 */

/**
 * Creates default weight state
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
// SNOW CONDITION STATE
// =============================================================================

/**
 * @typedef {Object} SnowState
 * @property {string} type - Snow type: 'groomed', 'powder', 'ice', 'crud', 'slush'
 * @property {number} gripMultiplier - Grip modifier (0.5-1.5)
 * @property {number} speedMultiplier - Speed modifier (0.8-1.2)
 * @property {number} dragMultiplier - Drag modifier (0.8-1.5)
 * @property {number} intensity - Condition intensity (0-1)
 */

/**
 * Creates default snow state
 * @returns {SnowState}
 */
export function createSnowState() {
  return {
    type: 'groomed',
    gripMultiplier: 1.0,
    speedMultiplier: 1.0,
    dragMultiplier: 1.0,
    intensity: 0,
  };
}

// =============================================================================
// INPUT STATE
// =============================================================================

/**
 * @typedef {Object} InputState
 * @property {number} steer - Steering input (-1 to 1)
 * @property {number} lean - Forward/back lean (-1 to 1)
 * @property {boolean} jump - Jump button pressed
 * @property {boolean} switchStance - Switch stance button pressed
 * @property {boolean} shift - Shift modifier held
 */

/**
 * Creates default input state
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
// BRAKE STATE
// =============================================================================

/**
 * @typedef {Object} BrakeState
 * @property {number} hockeyStopStrength - Hockey stop intensity (0-1)
 */

/**
 * Creates default brake state
 * @returns {BrakeState}
 */
export function createBrakeState() {
  return {
    hockeyStopStrength: 0,
  };
}

// =============================================================================
// COMPLETE CARVE STATE (V1 system - all carving-related state)
// =============================================================================

/**
 * @typedef {Object} CarveStateV1
 * @property {EdgeState} edge - Edge angle state
 * @property {CarveRailState} rail - Carve rail engagement
 * @property {CarveChainState} chain - Carve chain tracking
 * @property {AngulationState} angulation - Body angulation
 * @property {BoardFlexState} flex - Board flex
 * @property {FlowState} flow - Flow state
 * @property {ArcState} arc - Arc shape tracking
 * @property {EdgeBiteState} bite - Edge bite progression
 * @property {TransitionState} transition - Edge transitions
 * @property {RiskState} risk - Risk/stability
 * @property {FailureState} failure - Failure states
 */

/**
 * Creates complete V1 carve state
 * @returns {CarveStateV1}
 */
export function createCarveStateV1() {
  return {
    edge: createEdgeState(),
    rail: createCarveRailState(),
    chain: createCarveChainState(),
    angulation: createAngulationState(),
    flex: createBoardFlexState(),
    flow: createFlowState(),
    arc: createArcState(),
    bite: createEdgeBiteState(),
    transition: createTransitionState(),
    risk: createRiskState(),
    failure: createFailureState(),
  };
}

// =============================================================================
// COMPLETE AIR STATE
// =============================================================================

/**
 * @typedef {Object} AirStateComplete
 * @property {AirRotationState} rotation - Air rotation
 * @property {JumpState} jump - Jump charging
 * @property {CompressionState} compression - Leg compression
 * @property {GrindState} grind - Rail grinding
 */

/**
 * Creates complete air state
 * @returns {AirStateComplete}
 */
export function createAirStateComplete() {
  return {
    rotation: createAirRotationState(),
    jump: createJumpState(),
    compression: createCompressionState(),
    grind: createGrindState(),
  };
}

// =============================================================================
// COMPLETE PLAYER STATE
// =============================================================================

/**
 * @typedef {Object} PlayerStateComplete
 * @property {InputState} input - User input
 * @property {CoreState} core - Core physics (velocity, heading)
 * @property {TerrainState} terrain - Ground contact
 * @property {SnowState} snow - Snow conditions
 * @property {CarveStateV1} carve - V1 carving system
 * @property {AirStateComplete} air - Air/jump/grind
 * @property {SwitchState} switch - Switch riding
 * @property {WeightState} weight - Weight distribution
 * @property {BrakeState} brake - Braking
 * @property {BoardConfig} board - Board configuration
 */

/**
 * Creates complete player state with all sub-states
 * @returns {PlayerStateComplete}
 */
export function createPlayerState() {
  return {
    input: createInputState(),
    core: createCoreState(),
    terrain: createTerrainState(),
    snow: createSnowState(),
    carve: createCarveStateV1(),
    air: createAirStateComplete(),
    switch: createSwitchState(),
    weight: createWeightState(),
    brake: createBrakeState(),
    board: createBoardConfig(),
  };
}

// =============================================================================
// STATE SYNC UTILITIES
// =============================================================================

/**
 * Syncs state from organized structure back to flat PlayerController properties.
 * This is used during the transition period while physics functions still use `this`.
 *
 * @param {Object} player - PlayerController instance
 * @param {PlayerStateComplete} state - Organized state
 */
export function syncStateToPlayer(player, state) {
  // Input
  player.input = state.input;

  // Core
  player.velocity = state.core.velocity;
  player.heading = state.core.heading;
  player.headingVelocity = state.core.headingVelocity;
  player.currentSpeed = state.core.currentSpeed;
  player.mass = state.core.mass;
  player.turnMomentum = state.core.turnMomentum;
  player.turnInertia = state.core.turnInertia;

  // Terrain
  player.isGrounded = state.terrain.isGrounded;
  player.wasGrounded = state.terrain.wasGrounded;
  player.groundNormal = state.terrain.groundNormal;
  player.groundHeight = state.terrain.groundHeight;
  player.airTime = state.terrain.airTime;

  // Edge
  player.edgeAngle = state.carve.edge.edgeAngle;
  player.targetEdgeAngle = state.carve.edge.targetEdgeAngle;
  player.edgeVelocity = state.carve.edge.edgeVelocity;
  player.slipAngle = state.carve.edge.slipAngle;
  player.lastAbsEdge = state.carve.edge.lastAbsEdge;

  // Carve Rail
  player.carveRailStrength = state.carve.rail.carveRailStrength;
  player.carveHoldTime = state.carve.rail.carveHoldTime;
  player.smoothedRailStrength = state.carve.rail.smoothedRailStrength;
  player.smoothedGrip = state.carve.rail.smoothedGrip;

  // Carve Chain
  player.carveChainCount = state.carve.chain.carveChainCount;
  player.carvePerfection = state.carve.chain.carvePerfection;
  player.peakEdgeAngle = state.carve.chain.peakEdgeAngle;
  player.carveEnergy = state.carve.chain.carveEnergy;
  player.lastCarveDirection = state.carve.chain.lastCarveDirection;
  player.carveCommitment = state.carve.chain.carveCommitment;
  player.carveDirection = state.carve.chain.carveDirection;
  player.carveArcProgress = state.carve.chain.carveArcProgress;
  player.carveEntrySpeed = state.carve.chain.carveEntrySpeed;
  player.carveEntryEdge = state.carve.chain.carveEntryEdge;
  player.turnShapeQuality = state.carve.chain.turnShapeQuality;
  player.lastEdgeAngleDelta = state.carve.chain.lastEdgeAngleDelta;

  // Angulation
  player.angulation = state.carve.angulation.angulation;
  player.targetAngulation = state.carve.angulation.targetAngulation;
  player.angulationCapacity = state.carve.angulation.angulationCapacity;

  // Board Flex
  player.boardFlex = state.carve.flex.boardFlex;
  player.flexEnergy = state.carve.flex.flexEnergy;
  player.maxFlexEnergy = state.carve.flex.maxFlexEnergy;
  player.flexStiffness = state.carve.flex.flexStiffness;

  // Flow
  player.flowState = state.carve.flow.flowState;
  player.flowMomentum = state.carve.flow.flowMomentum;
  player.flowDecayRate = state.carve.flow.flowDecayRate;
  player.flowBuildRate = state.carve.flow.flowBuildRate;
  player.turnRhythm = state.carve.flow.turnRhythm;
  player.rhythmPhase = state.carve.flow.rhythmPhase;

  // Arc
  player.arcHeadingChange = state.carve.arc.arcHeadingChange;
  player.arcStartHeading = state.carve.arc.arcStartHeading;
  player.arcType = state.carve.arc.arcType;

  // Edge Bite
  player.edgeBite = state.carve.bite.edgeBite;
  player.edgeBiteRate = state.carve.bite.edgeBiteRate;
  player.maxEdgeBite = state.carve.bite.maxEdgeBite;

  // Transition
  player.previousEdgeSide = state.carve.transition.previousEdgeSide;
  player.edgeTransitionBoost = state.carve.transition.edgeTransitionBoost;
  player.lastEdgeChangeTime = state.carve.transition.lastEdgeChangeTime;

  // Risk
  player.riskLevel = state.carve.risk.riskLevel;
  player.wobbleAmount = state.carve.risk.wobbleAmount;
  player.isRecovering = state.carve.risk.isRecovering;
  player.recoveryTime = state.carve.risk.recoveryTime;

  // Failure
  player.isWashingOut = state.carve.failure.isWashingOut;
  player.washOutIntensity = state.carve.failure.washOutIntensity;
  player.washOutDirection = state.carve.failure.washOutDirection;
  player.isEdgeCaught = state.carve.failure.isEdgeCaught;
  player.edgeCatchSeverity = state.carve.failure.edgeCatchSeverity;
  player.edgeCatchTime = state.carve.failure.edgeCatchTime;

  // Air Rotation
  player.pitch = state.air.rotation.pitch;
  player.roll = state.air.rotation.roll;
  player.pitchVelocity = state.air.rotation.pitchVelocity;
  player.rollVelocity = state.air.rotation.rollVelocity;
  player.spinVelocity = state.air.rotation.spinVelocity;

  // Jump
  player.jumpCharging = state.air.jump.jumpCharging;
  player.jumpCharge = state.air.jump.jumpCharge;
  player.maxChargeTime = state.air.jump.maxChargeTime;

  // Compression
  player.compression = state.air.compression.compression;
  player.compressionVelocity = state.air.compression.compressionVelocity;
  player.targetCompression = state.air.compression.targetCompression;

  // Grind
  player.isGrinding = state.air.grind.isGrinding;
  player.grindRail = state.air.grind.grindRail;
  player.grindProgress = state.air.grind.grindProgress;
  player.grindBalance = state.air.grind.grindBalance;
  player.grindTime = state.air.grind.grindTime;
  player.grindSparks = state.air.grind.grindSparks;

  // Switch
  player.ridingSwitch = state.switch.ridingSwitch;
  player.switchBlend = state.switch.switchBlend;
  player.smoothSwitchMult = state.switch.smoothSwitchMult;
  player.switchLockTime = state.switch.switchLockTime;

  // Weight
  player.weightForward = state.weight.weightForward;
  player.weightSide = state.weight.weightSide;
  player.effectivePressure = state.weight.effectivePressure;

  // Snow
  player.currentSnowCondition = state.snow;

  // Brake
  player.hockeyStopStrength = state.brake.hockeyStopStrength;

  // Board config
  player.boardLength = state.board.length;
  player.boardWidth = state.board.width;
  player.sidecutRadius = state.board.sidecutRadius;
  player.maxEdgeAngleLowSpeed = state.board.maxEdgeLowSpeed;
  player.maxEdgeAngleHighSpeed = state.board.maxEdgeHighSpeed;
  player.highSpeedThreshold = state.board.highSpeedThreshold;
  player.carveRailThreshold = state.board.carveRailThreshold;
}

/**
 * Syncs state from flat PlayerController properties to organized structure.
 *
 * @param {Object} player - PlayerController instance
 * @param {PlayerStateComplete} state - Organized state to update
 */
export function syncPlayerToState(player, state) {
  // Input
  state.input = player.input;

  // Core
  state.core.velocity = player.velocity;
  state.core.heading = player.heading;
  state.core.headingVelocity = player.headingVelocity;
  state.core.currentSpeed = player.currentSpeed;
  state.core.mass = player.mass;
  state.core.turnMomentum = player.turnMomentum;
  state.core.turnInertia = player.turnInertia;

  // Terrain
  state.terrain.isGrounded = player.isGrounded;
  state.terrain.wasGrounded = player.wasGrounded;
  state.terrain.groundNormal = player.groundNormal;
  state.terrain.groundHeight = player.groundHeight;
  state.terrain.airTime = player.airTime;

  // Edge
  state.carve.edge.edgeAngle = player.edgeAngle;
  state.carve.edge.targetEdgeAngle = player.targetEdgeAngle;
  state.carve.edge.edgeVelocity = player.edgeVelocity;
  state.carve.edge.slipAngle = player.slipAngle;
  state.carve.edge.lastAbsEdge = player.lastAbsEdge;

  // Carve Rail
  state.carve.rail.carveRailStrength = player.carveRailStrength;
  state.carve.rail.carveHoldTime = player.carveHoldTime;
  state.carve.rail.smoothedRailStrength = player.smoothedRailStrength;
  state.carve.rail.smoothedGrip = player.smoothedGrip;

  // Carve Chain
  state.carve.chain.carveChainCount = player.carveChainCount;
  state.carve.chain.carvePerfection = player.carvePerfection;
  state.carve.chain.peakEdgeAngle = player.peakEdgeAngle;
  state.carve.chain.carveEnergy = player.carveEnergy;
  state.carve.chain.lastCarveDirection = player.lastCarveDirection;
  state.carve.chain.carveCommitment = player.carveCommitment;
  state.carve.chain.carveDirection = player.carveDirection;
  state.carve.chain.carveArcProgress = player.carveArcProgress;
  state.carve.chain.carveEntrySpeed = player.carveEntrySpeed;
  state.carve.chain.carveEntryEdge = player.carveEntryEdge;
  state.carve.chain.turnShapeQuality = player.turnShapeQuality;
  state.carve.chain.lastEdgeAngleDelta = player.lastEdgeAngleDelta;

  // Angulation
  state.carve.angulation.angulation = player.angulation;
  state.carve.angulation.targetAngulation = player.targetAngulation;
  state.carve.angulation.angulationCapacity = player.angulationCapacity;

  // Board Flex
  state.carve.flex.boardFlex = player.boardFlex;
  state.carve.flex.flexEnergy = player.flexEnergy;
  state.carve.flex.maxFlexEnergy = player.maxFlexEnergy;
  state.carve.flex.flexStiffness = player.flexStiffness;

  // Flow
  state.carve.flow.flowState = player.flowState;
  state.carve.flow.flowMomentum = player.flowMomentum;
  state.carve.flow.flowDecayRate = player.flowDecayRate;
  state.carve.flow.flowBuildRate = player.flowBuildRate;
  state.carve.flow.turnRhythm = player.turnRhythm;
  state.carve.flow.rhythmPhase = player.rhythmPhase;

  // Arc
  state.carve.arc.arcHeadingChange = player.arcHeadingChange;
  state.carve.arc.arcStartHeading = player.arcStartHeading;
  state.carve.arc.arcType = player.arcType;

  // Edge Bite
  state.carve.bite.edgeBite = player.edgeBite;
  state.carve.bite.edgeBiteRate = player.edgeBiteRate;
  state.carve.bite.maxEdgeBite = player.maxEdgeBite;

  // Transition
  state.carve.transition.previousEdgeSide = player.previousEdgeSide;
  state.carve.transition.edgeTransitionBoost = player.edgeTransitionBoost;
  state.carve.transition.lastEdgeChangeTime = player.lastEdgeChangeTime;

  // Risk
  state.carve.risk.riskLevel = player.riskLevel;
  state.carve.risk.wobbleAmount = player.wobbleAmount;
  state.carve.risk.isRecovering = player.isRecovering;
  state.carve.risk.recoveryTime = player.recoveryTime;

  // Failure
  state.carve.failure.isWashingOut = player.isWashingOut;
  state.carve.failure.washOutIntensity = player.washOutIntensity;
  state.carve.failure.washOutDirection = player.washOutDirection;
  state.carve.failure.isEdgeCaught = player.isEdgeCaught;
  state.carve.failure.edgeCatchSeverity = player.edgeCatchSeverity;
  state.carve.failure.edgeCatchTime = player.edgeCatchTime;

  // Air Rotation
  state.air.rotation.pitch = player.pitch;
  state.air.rotation.roll = player.roll;
  state.air.rotation.pitchVelocity = player.pitchVelocity;
  state.air.rotation.rollVelocity = player.rollVelocity;
  state.air.rotation.spinVelocity = player.spinVelocity;

  // Jump
  state.air.jump.jumpCharging = player.jumpCharging;
  state.air.jump.jumpCharge = player.jumpCharge;
  state.air.jump.maxChargeTime = player.maxChargeTime;

  // Compression
  state.air.compression.compression = player.compression;
  state.air.compression.compressionVelocity = player.compressionVelocity;
  state.air.compression.targetCompression = player.targetCompression;

  // Grind
  state.air.grind.isGrinding = player.isGrinding;
  state.air.grind.grindRail = player.grindRail;
  state.air.grind.grindProgress = player.grindProgress;
  state.air.grind.grindBalance = player.grindBalance;
  state.air.grind.grindTime = player.grindTime;
  state.air.grind.grindSparks = player.grindSparks;

  // Switch
  state.switch.ridingSwitch = player.ridingSwitch;
  state.switch.switchBlend = player.switchBlend;
  state.switch.smoothSwitchMult = player.smoothSwitchMult;
  state.switch.switchLockTime = player.switchLockTime;

  // Weight
  state.weight.weightForward = player.weightForward;
  state.weight.weightSide = player.weightSide;
  state.weight.effectivePressure = player.effectivePressure;

  // Snow
  state.snow = player.currentSnowCondition;

  // Brake
  state.brake.hockeyStopStrength = player.hockeyStopStrength;

  // Board config
  state.board.length = player.boardLength;
  state.board.width = player.boardWidth;
  state.board.sidecutRadius = player.sidecutRadius;
  state.board.maxEdgeLowSpeed = player.maxEdgeAngleLowSpeed;
  state.board.maxEdgeHighSpeed = player.maxEdgeAngleHighSpeed;
  state.board.highSpeedThreshold = player.highSpeedThreshold;
  state.board.carveRailThreshold = player.carveRailThreshold;
}

// =============================================================================
// DEBUG UTILITIES
// =============================================================================

/**
 * Creates a serializable snapshot of player state for debugging
 * @param {PlayerStateComplete} state - Player state
 * @returns {Object} Serializable state snapshot
 */
export function createStateSnapshot(state) {
  return {
    timestamp: Date.now(),
    core: {
      velocity: { x: state.core.velocity.x, y: state.core.velocity.y, z: state.core.velocity.z },
      heading: state.core.heading,
      currentSpeed: state.core.currentSpeed,
    },
    terrain: {
      isGrounded: state.terrain.isGrounded,
      airTime: state.terrain.airTime,
    },
    carve: {
      edgeAngle: state.carve.edge.edgeAngle,
      railStrength: state.carve.rail.carveRailStrength,
      chainCount: state.carve.chain.carveChainCount,
      flowState: state.carve.flow.flowState,
      isWashingOut: state.carve.failure.isWashingOut,
    },
    switch: {
      ridingSwitch: state.switch.ridingSwitch,
    },
  };
}
