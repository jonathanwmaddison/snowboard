import { describe, it, expect } from 'vitest';
import {
  calculateTargetEdge,
  updateEdgeAngle,
  updateCarveRail,
  calculateGrip,
  calculateRequiredAngulation,
  updateAngulationCapacity,
  updateAngulation,
  updateBoardFlex,
  releaseFlexEnergy,
  updateFlowState,
  updateArcTracking,
  classifyArcShape,
  updateEdgeBite,
  detectEdgeTransition,
  calculateTransitionTiming,
  updateCarveChain,
  calculateCarvePerfection,
  calculateTurnRadius,
  calculateGForce,
  calculateCarveAcceleration,
  checkWashOut,
  checkEdgeCatch,
  updateRiskState,
  normalizeAngle,
  clamp,
  lerp,
  CARVE_CONFIG,
} from '../src/CarvePhysicsPure.js';

describe('Edge Angle Physics', () => {
  describe('calculateTargetEdge', () => {
    it('maps steer input to edge angle', () => {
      const edge = calculateTargetEdge(1, 0, false, 1.15);
      expect(edge).toBe(1.15);
    });

    it('inverts steer when riding switch', () => {
      const normal = calculateTargetEdge(1, 0, false, 1.15);
      const switchMode = calculateTargetEdge(1, 0, true, 1.15);
      expect(switchMode).toBe(-normal);
    });

    it('adds lean bonus when leaning forward', () => {
      const noLean = calculateTargetEdge(1, 0, false, 1.0);
      const withLean = calculateTargetEdge(1, 1, false, 1.0);
      expect(withLean).toBeGreaterThan(noLean);
    });

    it('ignores negative lean (backward)', () => {
      const noLean = calculateTargetEdge(1, 0, false, 1.0);
      const backLean = calculateTargetEdge(1, -1, false, 1.0);
      expect(backLean).toBe(noLean);
    });
  });

  describe('updateEdgeAngle', () => {
    it('moves edge toward target', () => {
      const edgeState = { edgeAngle: 0, targetEdgeAngle: 1.0, edgeVelocity: 0 };
      const result = updateEdgeAngle(edgeState, 0, 0.016);
      expect(result.edgeAngle).toBeGreaterThan(0);
    });

    it('clamps edge at max', () => {
      const edgeState = { edgeAngle: 1.1, targetEdgeAngle: 2.0, edgeVelocity: 5 };
      const result = updateEdgeAngle(edgeState, 0, 0.1, 1.15);
      expect(Math.abs(result.edgeAngle)).toBeLessThanOrEqual(1.15);
    });

    it('applies damping with rail strength', () => {
      const edgeState = { edgeAngle: 0.5, targetEdgeAngle: 0.5, edgeVelocity: 2 };
      const withRail = updateEdgeAngle(edgeState, 1.0, 0.016);
      const withoutRail = updateEdgeAngle(edgeState, 0, 0.016);
      // Higher rail = more damping = slower velocity decay
      expect(Math.abs(withRail.edgeVelocity)).toBeLessThan(Math.abs(withoutRail.edgeVelocity));
    });
  });
});

describe('Carve Rail System', () => {
  describe('updateCarveRail', () => {
    it('builds rail strength when edge exceeds threshold', () => {
      const railState = { carveRailStrength: 0, carveHoldTime: 0, smoothedRailStrength: 0 };
      const result = updateCarveRail(railState, 0.7, 0.5, 0.1);
      expect(result.carveRailStrength).toBeGreaterThan(0);
      expect(result.carveHoldTime).toBeGreaterThan(0);
    });

    it('decays rail strength below threshold', () => {
      const railState = { carveRailStrength: 0.8, carveHoldTime: 1.0, smoothedRailStrength: 0.8 };
      const result = updateCarveRail(railState, 0.3, 0.5, 0.1);
      expect(result.carveRailStrength).toBeLessThan(0.8);
      expect(result.carveHoldTime).toBe(0);
    });

    it('smooths rail strength', () => {
      const railState = { carveRailStrength: 1.0, carveHoldTime: 0, smoothedRailStrength: 0 };
      const result = updateCarveRail(railState, 0.8, 0.5, 0.016);
      expect(result.smoothedRailStrength).toBeGreaterThan(0);
      expect(result.smoothedRailStrength).toBeLessThan(1.0);
    });
  });
});

describe('Grip Calculation', () => {
  describe('calculateGrip', () => {
    it('returns base grip with no modifiers', () => {
      const result = calculateGrip({
        absEdge: 0,
        railStrength: 0,
        edgeBite: 0,
        angulation: 0,
        flowState: 0,
      });
      expect(result.totalGrip).toBe(CARVE_CONFIG.baseGrip);
    });

    it('increases grip with edge angle', () => {
      const noEdge = calculateGrip({ absEdge: 0, railStrength: 0, edgeBite: 0, angulation: 0, flowState: 0 });
      const withEdge = calculateGrip({ absEdge: 0.8, railStrength: 0, edgeBite: 0, angulation: 0, flowState: 0 });
      expect(withEdge.totalGrip).toBeGreaterThan(noEdge.totalGrip);
    });

    it('is capped at max grip', () => {
      const result = calculateGrip({
        absEdge: 1.5,
        railStrength: 1.0,
        edgeBite: 1.0,
        angulation: 1.0,
        flowState: 1.0,
        snowGripMultiplier: 1.5,
      });
      expect(result.totalGrip).toBe(CARVE_CONFIG.maxGrip);
    });

    it('provides breakdown of grip sources', () => {
      const result = calculateGrip({
        absEdge: 0.5,
        railStrength: 0.5,
        edgeBite: 0.5,
        angulation: 0.5,
        flowState: 0.5,
      });
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.base).toBe(CARVE_CONFIG.baseGrip);
    });
  });
});

describe('Angulation System', () => {
  describe('calculateRequiredAngulation', () => {
    it('returns zero at zero edge', () => {
      expect(calculateRequiredAngulation(0, 20)).toBe(0);
    });

    it('increases with edge and speed', () => {
      const low = calculateRequiredAngulation(0.3, 10);
      const high = calculateRequiredAngulation(0.6, 20);
      expect(high).toBeGreaterThan(low);
    });

    it('caps at 1.0', () => {
      expect(calculateRequiredAngulation(2.0, 50)).toBe(1.0);
    });
  });

  describe('updateAngulationCapacity', () => {
    it('degrades with jerky input', () => {
      const newCap = updateAngulationCapacity(1.0, 5.0, 0.016);
      expect(newCap).toBeLessThan(1.0);
    });

    it('recovers with smooth input', () => {
      const newCap = updateAngulationCapacity(0.5, 1.0, 0.1);
      expect(newCap).toBeGreaterThan(0.5);
    });

    it('has minimum of 0.4', () => {
      const newCap = updateAngulationCapacity(0.4, 10.0, 1.0);
      expect(newCap).toBe(0.4);
    });
  });

  describe('updateAngulation', () => {
    it('returns updated angulation state', () => {
      const angState = { angulation: 0, targetAngulation: 0, angulationCapacity: 1.0 };
      const result = updateAngulation(angState, 0.8, 15, 1.0, 0.016);
      expect(result.angulation).toBeGreaterThan(0);
      expect(result.targetAngulation).toBeGreaterThan(0);
    });
  });
});

describe('Board Flex System', () => {
  describe('updateBoardFlex', () => {
    it('increases flex under carving load', () => {
      const flexState = { boardFlex: 0, flexEnergy: 0, maxFlexEnergy: 1.5, flexStiffness: 8 };
      const result = updateBoardFlex(flexState, 0.8, 20, 0.8, 0.9, 0.1);
      expect(result.boardFlex).toBeGreaterThan(0);
    });

    it('accumulates energy during deep carves', () => {
      const flexState = { boardFlex: 0.6, flexEnergy: 0, maxFlexEnergy: 1.5, flexStiffness: 8 };
      const result = updateBoardFlex(flexState, 0.8, 20, 0.8, 0.9, 0.1);
      expect(result.flexEnergy).toBeGreaterThan(0);
    });

    it('respects max energy', () => {
      const flexState = { boardFlex: 1.0, flexEnergy: 1.4, maxFlexEnergy: 1.5, flexStiffness: 8 };
      const result = updateBoardFlex(flexState, 1.0, 30, 1.0, 1.0, 1.0);
      expect(result.flexEnergy).toBeLessThanOrEqual(1.5);
    });
  });

  describe('releaseFlexEnergy', () => {
    it('returns boost and resets energy', () => {
      const flexState = { boardFlex: 0.5, flexEnergy: 1.0, maxFlexEnergy: 1.5, flexStiffness: 8 };
      const result = releaseFlexEnergy(flexState);
      expect(result.boost).toBe(2.5); // energy * 2.5
      expect(result.updatedFlexState.flexEnergy).toBe(0);
    });
  });
});

describe('Flow State System', () => {
  describe('updateFlowState', () => {
    it('builds flow with good carving', () => {
      const flowState = { flowState: 0.5, flowMomentum: 0.5, flowBuildRate: 0.15, flowDecayRate: 0.3 };
      const result = updateFlowState(flowState, 0.9, 0.1);
      expect(result.flowState).toBeGreaterThan(0.5);
    });

    it('decays flow with poor carving', () => {
      const flowState = { flowState: 0.5, flowMomentum: 0.5, flowBuildRate: 0.15, flowDecayRate: 0.3 };
      const result = updateFlowState(flowState, 0.3, 0.1);
      expect(result.flowState).toBeLessThan(0.5);
    });

    it('caps at 1.0', () => {
      const flowState = { flowState: 0.99, flowMomentum: 0.99, flowBuildRate: 0.15, flowDecayRate: 0.3 };
      const result = updateFlowState(flowState, 1.0, 1.0);
      expect(result.flowState).toBe(1.0);
    });
  });
});

describe('Arc Shape Tracking', () => {
  describe('classifyArcShape', () => {
    it('classifies C-turns (>60°)', () => {
      const result = classifyArcShape(Math.PI / 2); // 90°
      expect(result.type).toBe('c-turn');
      expect(result.multiplier).toBe(1.3);
    });

    it('classifies J-turns (30-60°)', () => {
      const result = classifyArcShape(Math.PI / 4); // 45°
      expect(result.type).toBe('j-turn');
      expect(result.multiplier).toBe(1.0);
    });

    it('classifies wiggles (<30°)', () => {
      const result = classifyArcShape(Math.PI / 12); // 15°
      expect(result.type).toBe('wiggle');
      expect(result.multiplier).toBe(0.5);
    });
  });
});

describe('Edge Bite Progression', () => {
  describe('updateEdgeBite', () => {
    it('builds bite during deep carves', () => {
      const biteState = { edgeBite: 0, edgeBiteRate: 2.0, maxEdgeBite: 1.0 };
      const result = updateEdgeBite(biteState, 0.8, 0.8, 0.8, 0.9, 0.5, 0.1);
      expect(result.edgeBite).toBeGreaterThan(0);
    });

    it('decays without deep carve', () => {
      const biteState = { edgeBite: 0.5, edgeBiteRate: 2.0, maxEdgeBite: 1.0 };
      const result = updateEdgeBite(biteState, 0.3, 0.2, 0.5, 0.5, 0.5, 0.1);
      expect(result.edgeBite).toBeLessThan(0.5);
    });
  });
});

describe('Edge Transition Detection', () => {
  describe('detectEdgeTransition', () => {
    it('detects edge switch', () => {
      const state = { previousEdgeSide: -1, edgeTransitionBoost: 0, lastEdgeChangeTime: 0.8 };
      const result = detectEdgeTransition(state, 1, 0.6, 0.016);
      expect(result.occurred).toBe(true);
      expect(result.timeSinceLastTransition).toBe(0.8);
    });

    it('does not detect transition without edge switch', () => {
      const state = { previousEdgeSide: 1, edgeTransitionBoost: 0, lastEdgeChangeTime: 0.5 };
      const result = detectEdgeTransition(state, 1, 0.6, 0.016);
      expect(result.occurred).toBe(false);
    });

    it('increments time when no transition', () => {
      const state = { previousEdgeSide: 1, edgeTransitionBoost: 0, lastEdgeChangeTime: 0.5 };
      const result = detectEdgeTransition(state, 1, 0.6, 0.016);
      expect(result.transitionState.lastEdgeChangeTime).toBeGreaterThan(0.5);
    });
  });

  describe('calculateTransitionTiming', () => {
    it('penalizes panic wiggling', () => {
      expect(calculateTransitionTiming(0.2)).toBe(0.4);
    });

    it('penalizes slow transitions', () => {
      expect(calculateTransitionTiming(2.0)).toBe(0.5);
    });

    it('rewards sweet spot timing', () => {
      const mult = calculateTransitionTiming(0.8);
      expect(mult).toBeGreaterThan(1.1);
    });
  });
});

describe('Carve Chain System', () => {
  describe('updateCarveChain', () => {
    it('increments chain on clean carve', () => {
      const chainState = { carveChainCount: 2, carveEnergy: 0.3 };
      const result = updateCarveChain(chainState, 0.8, 0.5, 1.0);
      expect(result.carveChainCount).toBe(3);
      expect(result.isCleanCarve).toBe(true);
    });

    it('decrements chain on poor carve', () => {
      const chainState = { carveChainCount: 3, carveEnergy: 0.5 };
      const result = updateCarveChain(chainState, 0.3, 0.1, 1.0);
      expect(result.carveChainCount).toBe(2);
      expect(result.isCleanCarve).toBe(false);
    });

    it('calculates chain multiplier', () => {
      const chainState = { carveChainCount: 5, carveEnergy: 0.5 };
      const result = updateCarveChain(chainState, 0.8, 0.5, 1.0);
      expect(result.chainMultiplier).toBe(1.6); // 1.0 + 6 * 0.1
    });
  });

  describe('calculateCarvePerfection', () => {
    it('returns 0 with no carve', () => {
      expect(calculateCarvePerfection(0, 0, 0, 1)).toBe(0);
    });

    it('returns high value with good carve', () => {
      const perfection = calculateCarvePerfection(1.0, 1.0, 1.0, 1.0);
      expect(perfection).toBeGreaterThan(0.9);
    });
  });
});

describe('Turn Physics', () => {
  describe('calculateTurnRadius', () => {
    it('returns infinity for flat base', () => {
      expect(calculateTurnRadius(7, 0)).toBe(Infinity);
    });

    it('decreases with deeper edge', () => {
      const shallow = calculateTurnRadius(7, 0.3);
      const deep = calculateTurnRadius(7, 0.8);
      expect(deep).toBeLessThan(shallow);
    });

    it('has minimum radius', () => {
      const extreme = calculateTurnRadius(7, Math.PI / 2);
      expect(extreme).toBeGreaterThanOrEqual(1.5);
    });
  });

  describe('calculateGForce', () => {
    it('returns 0 for infinite radius', () => {
      expect(calculateGForce(20, Infinity)).toBe(0);
    });

    it('increases with speed squared', () => {
      const slow = calculateGForce(10, 10);
      const fast = calculateGForce(20, 10);
      expect(fast / slow).toBeCloseTo(4);
    });
  });

  describe('calculateCarveAcceleration', () => {
    it('returns 0 with insufficient rail strength', () => {
      expect(calculateCarveAcceleration(1.5, 0.2, 0.8, 0.5)).toBe(0);
    });

    it('returns 0 with poor perfection', () => {
      expect(calculateCarveAcceleration(1.5, 0.5, 0.3, 0.5)).toBe(0);
    });

    it('increases with G-force', () => {
      const lowG = calculateCarveAcceleration(1.0, 0.5, 0.8, 0.5);
      const highG = calculateCarveAcceleration(2.0, 0.5, 0.8, 0.5);
      expect(highG).toBeGreaterThan(lowG);
    });
  });
});

describe('Risk & Failure', () => {
  describe('checkWashOut', () => {
    it('does not wash out at low speed', () => {
      const result = checkWashOut(5, 0.8, 0.5, 0.9);
      expect(result.isWashingOut).toBe(false);
    });

    it('washes out with grip deficit', () => {
      const result = checkWashOut(20, 0.8, 0.5, 0.8);
      expect(result.isWashingOut).toBe(true);
      expect(result.intensity).toBeGreaterThan(0);
    });
  });

  describe('updateRiskState', () => {
    it('increases risk with grip deficit', () => {
      const riskState = { riskLevel: 0.2, wobbleAmount: 0, isRecovering: false, recoveryTime: 0 };
      // Use higher grip deficit and shorter dt to see increase
      const result = updateRiskState(riskState, 0.5, 4.0, 0.016);
      expect(result.riskLevel).toBeGreaterThan(0.2);
    });

    it('triggers recovery at high risk', () => {
      const riskState = { riskLevel: 0.85, wobbleAmount: 0, isRecovering: false, recoveryTime: 0 };
      const result = updateRiskState(riskState, 0.5, 5.0, 0.016);
      expect(result.isRecovering).toBe(true);
    });
  });
});

describe('Utility Functions', () => {
  describe('normalizeAngle', () => {
    it('keeps angles in [-PI, PI]', () => {
      expect(normalizeAngle(0)).toBe(0);
      expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
      expect(normalizeAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI);
    });
  });

  describe('clamp', () => {
    it('clamps values', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('lerp', () => {
    it('interpolates correctly', () => {
      expect(lerp(0, 10, 0)).toBe(0);
      expect(lerp(0, 10, 1)).toBe(10);
      expect(lerp(0, 10, 0.5)).toBe(5);
    });
  });
});
