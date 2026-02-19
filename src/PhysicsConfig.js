/**
 * PhysicsConfig - Centralized physics tuning system
 *
 * This file contains ALL tunable physics parameters for easy AI editing.
 * Each parameter has:
 *   - name: Human-readable name
 *   - value: Current value
 *   - min/max: Valid range
 *   - step: Increment for UI sliders
 *   - description: What it does (for AI context)
 *   - category: Group for organization
 *
 * To tune physics, simply modify the 'value' field of any parameter.
 * The UI overlay (press '~' in-game) allows real-time adjustment.
 */

// ============================================================================
// PHYSICS CONFIGURATION
// ============================================================================

export const PHYSICS_CONFIG = {

  // ==========================================================================
  // EDGE CONTROL - How the board responds to steering input
  // ==========================================================================
  edge: {
    maxEdgeAngle: {
      name: 'Max Edge Angle',
      value: 1.15,
      min: 0.5,
      max: 1.5,
      step: 0.05,
      unit: 'rad',
      description: 'Maximum edge angle in radians (~66 degrees). Higher = deeper carves possible.',
      category: 'edge'
    },
    edgeSpringBase: {
      name: 'Edge Spring (Base)',
      value: 70,
      min: 30,
      max: 120,
      step: 5,
      unit: '',
      description: 'Spring stiffness for edge response. Higher = snappier edge changes.',
      category: 'edge'
    },
    edgeSpringEngaging: {
      name: 'Edge Spring (Engaging)',
      value: 90,
      min: 50,
      max: 150,
      step: 5,
      unit: '',
      description: 'Spring stiffness when first engaging an edge. Creates initial "bite".',
      category: 'edge'
    },
    edgeDampingBase: {
      name: 'Edge Damping (Base)',
      value: 8,
      min: 2,
      max: 20,
      step: 1,
      unit: '',
      description: 'Base damping on edge changes. Higher = smoother but slower.',
      category: 'edge'
    },
    edgeDampingRailBonus: {
      name: 'Edge Damping (Rail Bonus)',
      value: 6,
      min: 0,
      max: 15,
      step: 1,
      unit: '',
      description: 'Extra damping when locked into carve rail. Stabilizes deep carves.',
      category: 'edge'
    },
    biteImpulse: {
      name: 'Bite Impulse',
      value: 15,
      min: 0,
      max: 40,
      step: 2,
      unit: '',
      description: 'Impulse when first engaging edge. Creates satisfying initial snap.',
      category: 'edge'
    },
    leanEdgeBonus: {
      name: 'Lean Edge Bonus',
      value: 0.15,
      min: 0,
      max: 0.4,
      step: 0.02,
      unit: '',
      description: 'How much forward lean increases max edge angle.',
      category: 'edge'
    },
    leanEdgePenalty: {
      name: 'Back Weight Edge Penalty',
      value: 0.2,
      min: 0,
      max: 0.5,
      step: 0.02,
      unit: '',
      description: 'How much back weight reduces max edge angle.',
      category: 'edge'
    }
  },

  // ==========================================================================
  // CARVE RAIL - The "locked in" carving feel
  // ==========================================================================
  carveRail: {
    threshold: {
      name: 'Rail Threshold',
      value: 0.5,
      min: 0.2,
      max: 0.8,
      step: 0.05,
      unit: 'rad',
      description: 'Edge angle needed to engage carve rail. Lower = easier to lock in.',
      category: 'carveRail'
    },
    buildRate: {
      name: 'Rail Build Rate',
      value: 3.0,
      min: 1,
      max: 8,
      step: 0.5,
      unit: '/s',
      description: 'How fast rail strength builds when carving. Higher = quicker lock-in.',
      category: 'carveRail'
    },
    decayRate: {
      name: 'Rail Decay Rate',
      value: 2.0,
      min: 0.5,
      max: 5,
      step: 0.25,
      unit: '/s',
      description: 'How fast rail strength decays when not carving.',
      category: 'carveRail'
    },
    minSpeedForRail: {
      name: 'Min Speed for Rail',
      value: 8,
      min: 3,
      max: 15,
      step: 1,
      unit: 'm/s',
      description: 'Minimum speed needed to engage carve rail.',
      category: 'carveRail'
    }
  },

  // ==========================================================================
  // EDGE TRANSITIONS - The "pop" between edges
  // ==========================================================================
  transition: {
    basePopStrength: {
      name: 'Base Pop Strength',
      value: 3.5,
      min: 1,
      max: 8,
      step: 0.5,
      unit: '',
      description: 'Base forward boost on edge transition.',
      category: 'transition'
    },
    flexPopMultiplier: {
      name: 'Flex Pop Multiplier',
      value: 3.0,
      min: 1,
      max: 6,
      step: 0.5,
      unit: '',
      description: 'How much stored flex energy boosts the pop.',
      category: 'transition'
    },
    gForcePopMultiplier: {
      name: 'G-Force Pop Multiplier',
      value: 0.08,
      min: 0,
      max: 0.2,
      step: 0.01,
      unit: '',
      description: 'Extra pop from high G-force carves.',
      category: 'transition'
    },
    compressionPopMultiplier: {
      name: 'Compression Pop Multiplier',
      value: 2.5,
      min: 0,
      max: 5,
      step: 0.25,
      unit: '',
      description: 'Extra pop from releasing compression.',
      category: 'transition'
    },
    timingSweetSpotCenter: {
      name: 'Timing Sweet Spot',
      value: 0.8,
      min: 0.4,
      max: 1.5,
      step: 0.1,
      unit: 's',
      description: 'Optimal time between edge switches for max bonus.',
      category: 'transition'
    },
    timingTooFastPenalty: {
      name: 'Too Fast Penalty',
      value: 0.4,
      min: 0.1,
      max: 0.8,
      step: 0.1,
      unit: '',
      description: 'Multiplier when switching edges too quickly (panic wiggling).',
      category: 'transition'
    },
    chainBonusPerCarve: {
      name: 'Chain Bonus Per Carve',
      value: 0.12,
      min: 0.05,
      max: 0.25,
      step: 0.01,
      unit: '',
      description: 'Extra multiplier per consecutive clean carve (max 10).',
      category: 'transition'
    }
  },

  // ==========================================================================
  // GRIP SYSTEM - How well the board holds the edge
  // ==========================================================================
  grip: {
    baseGrip: {
      name: 'Base Grip',
      value: 0.7,
      min: 0.4,
      max: 0.9,
      step: 0.05,
      unit: '',
      description: 'Base grip coefficient. Higher = less sliding.',
      category: 'grip'
    },
    edgeGripMultiplier: {
      name: 'Edge Grip Multiplier',
      value: 0.3,
      min: 0.1,
      max: 0.5,
      step: 0.05,
      unit: '',
      description: 'Extra grip per radian of edge angle.',
      category: 'grip'
    },
    railGripBonus: {
      name: 'Rail Grip Bonus',
      value: 0.15,
      min: 0,
      max: 0.3,
      step: 0.02,
      unit: '',
      description: 'Extra grip from carve rail engagement.',
      category: 'grip'
    },
    biteGripBonus: {
      name: 'Bite Grip Bonus',
      value: 0.12,
      min: 0,
      max: 0.25,
      step: 0.02,
      unit: '',
      description: 'Extra grip from edge bite progression.',
      category: 'grip'
    },
    angulationGripMultiplier: {
      name: 'Angulation Grip Multiplier',
      value: 0.15,
      min: 0,
      max: 0.3,
      step: 0.02,
      unit: '',
      description: 'Extra grip from good body angulation.',
      category: 'grip'
    },
    flowGripBonus: {
      name: 'Flow State Grip Bonus',
      value: 0.08,
      min: 0,
      max: 0.2,
      step: 0.02,
      unit: '',
      description: 'Extra grip when in flow state.',
      category: 'grip'
    },
    maxGrip: {
      name: 'Max Grip',
      value: 0.98,
      min: 0.85,
      max: 1.0,
      step: 0.01,
      unit: '',
      description: 'Maximum possible grip. 1.0 = no sliding ever.',
      category: 'grip'
    }
  },

  // ==========================================================================
  // BOARD FLEX - Energy storage and release
  // ==========================================================================
  flex: {
    stiffness: {
      name: 'Flex Stiffness',
      value: 8,
      min: 3,
      max: 15,
      step: 1,
      unit: '',
      description: 'How quickly board flex responds. Higher = stiffer board.',
      category: 'flex'
    },
    maxFlexEnergy: {
      name: 'Max Flex Energy',
      value: 1.5,
      min: 0.5,
      max: 3,
      step: 0.25,
      unit: '',
      description: 'Maximum energy the board can store.',
      category: 'flex'
    },
    energyGainRate: {
      name: 'Energy Gain Rate',
      value: 1.0,
      min: 0.3,
      max: 2,
      step: 0.1,
      unit: '/s',
      description: 'How fast flex energy accumulates during carves.',
      category: 'flex'
    },
    energyRetention: {
      name: 'Energy Retention on Pop',
      value: 0.25,
      min: 0,
      max: 0.5,
      step: 0.05,
      unit: '',
      description: 'How much flex energy is retained after transition (0 = all released).',
      category: 'flex'
    }
  },

  // ==========================================================================
  // TURN PHYSICS - How turns work
  // ==========================================================================
  turn: {
    sidecutRadius: {
      name: 'Sidecut Radius',
      value: 7,
      min: 4,
      max: 15,
      step: 0.5,
      unit: 'm',
      description: 'Board sidecut radius. Smaller = tighter natural turn radius.',
      category: 'turn'
    },
    turnResponseBase: {
      name: 'Turn Response Rate',
      value: 10,
      min: 4,
      max: 20,
      step: 1,
      unit: '',
      description: 'How fast heading responds to edge angle.',
      category: 'turn'
    },
    pressureTurnTightening: {
      name: 'Pressure Turn Tightening',
      value: 0.25,
      min: 0,
      max: 0.5,
      step: 0.05,
      unit: '',
      description: 'How much forward lean tightens the turn.',
      category: 'turn'
    },
    railTurnBoost: {
      name: 'Rail Turn Boost',
      value: 0.3,
      min: 0,
      max: 0.6,
      step: 0.05,
      unit: '',
      description: 'Turn rate boost when locked into rail.',
      category: 'turn'
    },
    maxTurnRate: {
      name: 'Max Turn Rate',
      value: 3.5,
      min: 2,
      max: 5,
      step: 0.25,
      unit: 'rad/s',
      description: 'Maximum heading change rate.',
      category: 'turn'
    },
    lowSpeedTurnMultiplier: {
      name: 'Low Speed Turn Multiplier',
      value: 3.0,
      min: 1,
      max: 5,
      step: 0.5,
      unit: '',
      description: 'Turn rate multiplier at low speeds for easier control.',
      category: 'turn'
    }
  },

  // ==========================================================================
  // FLOW STATE - "In the zone" mechanics
  // ==========================================================================
  flow: {
    buildRate: {
      name: 'Flow Build Rate',
      value: 0.18,
      min: 0.05,
      max: 0.4,
      step: 0.02,
      unit: '/transition',
      description: 'How fast flow state builds with good carves.',
      category: 'flow'
    },
    decayRate: {
      name: 'Flow Decay Rate',
      value: 0.3,
      min: 0.1,
      max: 0.8,
      step: 0.05,
      unit: '/s',
      description: 'How fast flow state decays without carving.',
      category: 'flow'
    },
    accelerationBonus: {
      name: 'Flow Acceleration Bonus',
      value: 0.6,
      min: 0,
      max: 1,
      step: 0.1,
      unit: '',
      description: 'Extra carve acceleration in flow state.',
      category: 'flow'
    },
    popBonus: {
      name: 'Flow Pop Bonus',
      value: 0.4,
      min: 0,
      max: 0.8,
      step: 0.1,
      unit: '',
      description: 'Extra transition pop in flow state.',
      category: 'flow'
    }
  },

  // ==========================================================================
  // G-FORCE & ACCELERATION - Speed generation from carving
  // ==========================================================================
  acceleration: {
    carveAccelBase: {
      name: 'Carve Acceleration Base',
      value: 2.5,
      min: 0.5,
      max: 5,
      step: 0.25,
      unit: '',
      description: 'Base acceleration from carving (pumping physics).',
      category: 'acceleration'
    },
    gForceAccelCurve: {
      name: 'G-Force Accel Curve',
      value: 0.8,
      min: 0.3,
      max: 1.5,
      step: 0.1,
      unit: '',
      description: 'How G-force scales acceleration above 1G.',
      category: 'acceleration'
    },
    pressureAccelBonus: {
      name: 'Pressure Acceleration Bonus',
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      unit: '',
      description: 'Extra acceleration from forward pressure.',
      category: 'acceleration'
    },
    biteAccelBonus: {
      name: 'Bite Acceleration Bonus',
      value: 1.2,
      min: 0,
      max: 2.5,
      step: 0.2,
      unit: '',
      description: 'Extra acceleration from sustained edge bite.',
      category: 'acceleration'
    },
    maxGForce: {
      name: 'Max G-Force',
      value: 3.0,
      min: 1.5,
      max: 5,
      step: 0.5,
      unit: 'G',
      description: 'G-force cap for physics calculations.',
      category: 'acceleration'
    },
    tuckAcceleration: {
      name: 'Tuck Acceleration',
      value: 2.0,
      min: 0.5,
      max: 4,
      step: 0.25,
      unit: 'm/s²',
      description: 'Forward acceleration when tucking (W key).',
      category: 'acceleration'
    }
  },

  // ==========================================================================
  // EDGE BITE - Progressive grip buildup
  // ==========================================================================
  edgeBite: {
    buildRate: {
      name: 'Bite Build Rate',
      value: 2.0,
      min: 0.5,
      max: 5,
      step: 0.25,
      unit: '/s',
      description: 'How fast edge bite builds during sustained carves.',
      category: 'edgeBite'
    },
    maxBite: {
      name: 'Max Bite',
      value: 1.0,
      min: 0.5,
      max: 2,
      step: 0.1,
      unit: '',
      description: 'Maximum edge bite level.',
      category: 'edgeBite'
    },
    decayRate: {
      name: 'Bite Decay Rate',
      value: 1.8,
      min: 0.5,
      max: 4,
      step: 0.2,
      unit: '/s',
      description: 'How fast edge bite decays when not carving.',
      category: 'edgeBite'
    },
    pressureBiteBonus: {
      name: 'Pressure Bite Bonus',
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      unit: '/s',
      description: 'Extra bite buildup from forward pressure.',
      category: 'edgeBite'
    }
  },

  // ==========================================================================
  // ANGULATION - Body position affecting grip
  // ==========================================================================
  angulation: {
    speedEdgeFactor: {
      name: 'Speed-Edge Factor',
      value: 25,
      min: 15,
      max: 40,
      step: 2,
      unit: '',
      description: 'Divisor for angulation needed calc. Lower = more angulation needed.',
      category: 'angulation'
    },
    smoothnessThreshold: {
      name: 'Smoothness Threshold',
      value: 3.0,
      min: 1,
      max: 6,
      step: 0.5,
      unit: 'rad/s',
      description: 'Edge change rate above which is considered jerky.',
      category: 'angulation'
    },
    capacityRecoveryRate: {
      name: 'Capacity Recovery Rate',
      value: 0.8,
      min: 0.2,
      max: 2,
      step: 0.1,
      unit: '/s',
      description: 'How fast angulation capacity recovers with smooth carving.',
      category: 'angulation'
    },
    jerkPenaltyRate: {
      name: 'Jerk Penalty Rate',
      value: 0.3,
      min: 0.1,
      max: 0.6,
      step: 0.05,
      unit: '',
      description: 'How much jerky input degrades angulation capacity.',
      category: 'angulation'
    }
  },

  // ==========================================================================
  // COMPRESSION - Visual stance and physics response
  // ==========================================================================
  compression: {
    baseCompression: {
      name: 'Base Compression',
      value: 0.1,
      min: 0,
      max: 0.3,
      step: 0.02,
      unit: '',
      description: 'Neutral stance compression level.',
      category: 'compression'
    },
    edgeCompression: {
      name: 'Edge Compression',
      value: 0.3,
      min: 0.1,
      max: 0.5,
      step: 0.05,
      unit: '',
      description: 'Compression per radian of edge angle.',
      category: 'compression'
    },
    gForceCompression: {
      name: 'G-Force Compression',
      value: 0.25,
      min: 0.1,
      max: 0.5,
      step: 0.05,
      unit: '',
      description: 'Compression per G above 1G.',
      category: 'compression'
    },
    springStiffness: {
      name: 'Spring Stiffness',
      value: 20,
      min: 10,
      max: 40,
      step: 2,
      unit: '',
      description: 'Compression spring stiffness.',
      category: 'compression'
    },
    damping: {
      name: 'Damping',
      value: 8,
      min: 3,
      max: 15,
      step: 1,
      unit: '',
      description: 'Compression damping.',
      category: 'compression'
    }
  },

  // ==========================================================================
  // DRAG & SPEED LIMITS
  // ==========================================================================
  speed: {
    baseDrag: {
      name: 'Base Drag',
      value: 0.999,
      min: 0.99,
      max: 1,
      step: 0.001,
      unit: '',
      description: 'Base velocity retention per frame.',
      category: 'speed'
    },
    edgeDrag: {
      name: 'Edge Drag',
      value: 0.001,
      min: 0,
      max: 0.005,
      step: 0.0005,
      unit: '',
      description: 'Extra drag per radian of edge angle.',
      category: 'speed'
    },
    slideDrag: {
      name: 'Slide Drag',
      value: 0.003,
      min: 0,
      max: 0.01,
      step: 0.001,
      unit: '',
      description: 'Extra drag per radian of slip angle.',
      category: 'speed'
    },
    maxSpeed: {
      name: 'Max Speed',
      value: 55,
      min: 30,
      max: 80,
      step: 5,
      unit: 'm/s',
      description: 'Maximum speed cap.',
      category: 'speed'
    },
    gravityMultiplier: {
      name: 'Gravity Multiplier',
      value: 5.5,
      min: 3,
      max: 10,
      step: 0.5,
      unit: '',
      description: 'Slope gravity strength.',
      category: 'speed'
    }
  },

  // ==========================================================================
  // RISK & FAILURE - Wash-out and edge catch
  // ==========================================================================
  risk: {
    washOutThreshold: {
      name: 'Wash-Out Threshold',
      value: 0.25,
      min: 0.1,
      max: 0.5,
      step: 0.05,
      unit: 'rad',
      description: 'Over-edge amount before wash-out starts.',
      category: 'risk'
    },
    edgeCatchRiskThreshold: {
      name: 'Edge Catch Risk Threshold',
      value: 0.25,
      min: 0.1,
      max: 0.5,
      step: 0.05,
      unit: '',
      description: 'Risk level at which edge catch can occur.',
      category: 'risk'
    },
    angulationProtection: {
      name: 'Angulation Protection',
      value: 0.5,
      min: 0,
      max: 0.8,
      step: 0.1,
      unit: '',
      description: 'How much good angulation prevents wash-out.',
      category: 'risk'
    },
    wobbleThreshold: {
      name: 'Wobble Threshold',
      value: 0.5,
      min: 0.3,
      max: 0.8,
      step: 0.05,
      unit: '',
      description: 'Risk level above which wobble starts.',
      category: 'risk'
    }
  }
};

// ============================================================================
// PRESETS - Different physics "feels"
// ============================================================================

export const PHYSICS_PRESETS = {
  default: {
    name: 'Default',
    description: 'Balanced feel for all skill levels'
  },
  arcade: {
    name: 'Arcade',
    description: 'Forgiving, easy to carve, big rewards',
    overrides: {
      'edge.edgeSpringBase': 80,
      'carveRail.threshold': 0.4,
      'carveRail.buildRate': 4.0,
      'grip.baseGrip': 0.75,
      'transition.basePopStrength': 4.5,
      'risk.washOutThreshold': 0.4,
      'risk.angulationProtection': 0.7
    }
  },
  simulation: {
    name: 'Simulation',
    description: 'More realistic, requires precision',
    overrides: {
      'edge.edgeSpringBase': 55,
      'carveRail.threshold': 0.55,
      'carveRail.buildRate': 2.5,
      'grip.baseGrip': 0.65,
      'transition.basePopStrength': 2.5,
      'risk.washOutThreshold': 0.2,
      'risk.angulationProtection': 0.3
    }
  },
  aggressive: {
    name: 'Aggressive',
    description: 'High speed, high risk, big rewards',
    overrides: {
      'edge.maxEdgeAngle': 1.3,
      'acceleration.carveAccelBase': 3.5,
      'acceleration.gForceAccelCurve': 1.0,
      'transition.basePopStrength': 5.0,
      'speed.maxSpeed': 70,
      'risk.washOutThreshold': 0.2,
      'flow.buildRate': 0.25
    }
  },
  beginner: {
    name: 'Beginner',
    description: 'Very forgiving, hard to fail',
    overrides: {
      'edge.edgeSpringBase': 60,
      'edge.maxEdgeAngle': 1.0,
      'carveRail.threshold': 0.35,
      'grip.baseGrip': 0.8,
      'grip.maxGrip': 0.95,
      'risk.washOutThreshold': 0.5,
      'risk.edgeCatchRiskThreshold': 0.5,
      'speed.maxSpeed': 40
    }
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a config value by path (e.g., 'edge.maxEdgeAngle')
 */
export function getConfig(path) {
  const parts = path.split('.');
  let obj = PHYSICS_CONFIG;
  for (const part of parts) {
    obj = obj[part];
    if (obj === undefined) return undefined;
  }
  return obj?.value ?? obj;
}

/**
 * Set a config value by path
 */
export function setConfig(path, value) {
  const parts = path.split('.');
  let obj = PHYSICS_CONFIG;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj[parts[i]];
  }
  const param = obj[parts[parts.length - 1]];
  if (param) {
    param.value = Math.max(param.min, Math.min(param.max, value));
    return true;
  }
  return false;
}

/**
 * Apply a preset
 */
export function applyPreset(presetName) {
  const preset = PHYSICS_PRESETS[presetName];
  if (!preset) return false;

  // Reset to defaults first
  if (presetName !== 'default') {
    // Reset would require storing defaults separately
  }

  // Apply overrides
  if (preset.overrides) {
    for (const [path, value] of Object.entries(preset.overrides)) {
      setConfig(path, value);
    }
  }

  console.log(`Applied physics preset: ${preset.name}`);
  return true;
}

/**
 * Export current config as JSON (for saving)
 */
export function exportConfig() {
  const exported = {};
  for (const [category, params] of Object.entries(PHYSICS_CONFIG)) {
    exported[category] = {};
    for (const [name, param] of Object.entries(params)) {
      exported[category][name] = param.value;
    }
  }
  return JSON.stringify(exported, null, 2);
}

/**
 * Import config from JSON
 */
export function importConfig(json) {
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    for (const [category, params] of Object.entries(data)) {
      for (const [name, value] of Object.entries(params)) {
        setConfig(`${category}.${name}`, value);
      }
    }
    return true;
  } catch (e) {
    console.error('Failed to import config:', e);
    return false;
  }
}

/**
 * Get all params in a category
 */
export function getCategoryParams(category) {
  return PHYSICS_CONFIG[category] || {};
}

/**
 * Get all categories
 */
export function getCategories() {
  return Object.keys(PHYSICS_CONFIG);
}

// Make config accessible from console
if (typeof window !== 'undefined') {
  window.PHYSICS_CONFIG = PHYSICS_CONFIG;
  window.PHYSICS_PRESETS = PHYSICS_PRESETS;
  window.getConfig = getConfig;
  window.setConfig = setConfig;
  window.applyPreset = applyPreset;
  window.exportConfig = exportConfig;
  window.importConfig = importConfig;
}
