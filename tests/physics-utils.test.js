import { describe, it, expect } from 'vitest';
import {
  calculateTurnRadius,
  calculateHeadingChangeRate,
  calculateTurnGForce,
  calculateTotalGForce,
  calculateGrip,
  calculateRequiredCentripetal,
  determineCarveState,
  calculateEdgeSpringForce,
  calculateTargetEdgeAngle,
  calculateTransitionTimingMultiplier,
  classifyArcShape,
  calculateCarveAcceleration,
  updateFlowState,
  calculateBoardFlex,
  accumulateFlexEnergy,
  calculateRequiredAngulation,
  updateAngulationCapacity,
  calculateSpeed2D,
  calculateSpeed3D,
  calculateSlopeAcceleration,
} from '../src/physics-utils.js';

describe('Turn Radius Calculations', () => {
  describe('calculateTurnRadius', () => {
    it('returns infinity for flat base (no edge)', () => {
      expect(calculateTurnRadius(7, 0)).toBe(Infinity);
      expect(calculateTurnRadius(7, 0.005)).toBe(Infinity);
    });

    it('decreases radius with deeper edge angle', () => {
      const radius30deg = calculateTurnRadius(7, Math.PI / 6);
      const radius60deg = calculateTurnRadius(7, Math.PI / 3);
      expect(radius60deg).toBeLessThan(radius30deg);
    });

    it('respects minimum radius clamp', () => {
      const extremeEdge = calculateTurnRadius(7, Math.PI / 2);
      expect(extremeEdge).toBeGreaterThanOrEqual(1.5);
    });

    it('applies flex and pressure modifiers', () => {
      const base = calculateTurnRadius(7, 0.5);
      const withFlex = calculateTurnRadius(7, 0.5, 0.9);
      const withPressure = calculateTurnRadius(7, 0.5, 1, 0.9);
      expect(withFlex).toBeLessThan(base);
      expect(withPressure).toBeLessThan(base);
    });
  });

  describe('calculateHeadingChangeRate', () => {
    it('returns zero for infinite radius', () => {
      expect(calculateHeadingChangeRate(10, Infinity)).toBe(0);
    });

    it('returns zero for zero radius', () => {
      expect(calculateHeadingChangeRate(10, 0)).toBe(0);
    });

    it('increases with speed', () => {
      const slow = calculateHeadingChangeRate(5, 10);
      const fast = calculateHeadingChangeRate(15, 10);
      expect(fast).toBeGreaterThan(slow);
    });

    it('increases with tighter radius', () => {
      const wide = calculateHeadingChangeRate(10, 20);
      const tight = calculateHeadingChangeRate(10, 5);
      expect(tight).toBeGreaterThan(wide);
    });
  });
});

describe('G-Force Calculations', () => {
  describe('calculateTurnGForce', () => {
    it('returns zero for infinite radius', () => {
      expect(calculateTurnGForce(10, Infinity)).toBe(0);
    });

    it('increases quadratically with speed', () => {
      const slow = calculateTurnGForce(5, 10);
      const fast = calculateTurnGForce(10, 10);
      // 10^2 / 5^2 = 4, so fast should be ~4x slow
      expect(fast / slow).toBeCloseTo(4);
    });

    it('returns realistic G values', () => {
      // 15 m/s at 10m radius = 2.25 G
      const gForce = calculateTurnGForce(15, 10, 10);
      expect(gForce).toBeCloseTo(2.25);
    });
  });

  describe('calculateTotalGForce', () => {
    it('includes gravity component', () => {
      const turnG = 1.5;
      const totalG = calculateTotalGForce(turnG, 0);
      // On flat ground, total = sqrt(1.5^2 + 1^2) ≈ 1.8
      expect(totalG).toBeCloseTo(Math.sqrt(turnG * turnG + 1));
    });
  });
});

describe('Grip Calculations', () => {
  describe('calculateGrip', () => {
    it('returns base grip at zero edge angle', () => {
      const grip = calculateGrip(0, 0.7);
      expect(grip).toBe(0.7);
    });

    it('increases with edge angle', () => {
      const flat = calculateGrip(0, 0.7);
      const edged = calculateGrip(0.5, 0.7);
      expect(edged).toBeGreaterThan(flat);
    });

    it('is capped at 0.98', () => {
      const maxGrip = calculateGrip(1.5, 0.9, 1.5, 1);
      expect(maxGrip).toBe(0.98);
    });

    it('applies snow and edge sharpness multipliers', () => {
      const base = calculateGrip(0.5, 0.7);
      const icy = calculateGrip(0.5, 0.7, 0.7);
      expect(icy).toBeLessThan(base);
    });
  });

  describe('calculateRequiredCentripetal', () => {
    it('returns zero for infinite radius', () => {
      expect(calculateRequiredCentripetal(75, 10, Infinity)).toBe(0);
    });

    it('calculates F = mv²/r', () => {
      // 75kg, 10m/s, 10m radius = 75 * 100 / 10 = 750N
      expect(calculateRequiredCentripetal(75, 10, 10)).toBe(750);
    });
  });

  describe('determineCarveState', () => {
    it('is carving when grip exceeds required force', () => {
      const result = determineCarveState(500, 750);
      expect(result.isCarving).toBe(true);
      expect(result.isSkidding).toBe(false);
      expect(result.gripDeficit).toBe(0);
    });

    it('is skidding when required force exceeds grip', () => {
      const result = determineCarveState(1000, 750);
      expect(result.isCarving).toBe(false);
      expect(result.isSkidding).toBe(true);
      expect(result.gripDeficit).toBe(250);
    });
  });
});

describe('Edge Physics', () => {
  describe('calculateEdgeSpringForce', () => {
    it('applies spring force toward target', () => {
      const result = calculateEdgeSpringForce(0, 1, 0);
      expect(result.force).toBeGreaterThan(0);
    });

    it('applies damping force against velocity', () => {
      const result = calculateEdgeSpringForce(0.5, 0.5, 5);
      expect(result.force).toBeLessThan(0); // Damping opposes velocity
    });
  });

  describe('calculateTargetEdgeAngle', () => {
    it('maps steer input to edge angle', () => {
      const edge = calculateTargetEdgeAngle(1, 1.15);
      expect(edge).toBe(1.15);
    });

    it('flips direction when switch', () => {
      const normal = calculateTargetEdgeAngle(1, 1.15, 0, false);
      const switchRide = calculateTargetEdgeAngle(1, 1.15, 0, true);
      expect(switchRide).toBe(-normal);
    });

    it('adds lean bonus when leaning forward', () => {
      const noLean = calculateTargetEdgeAngle(1, 1, 0);
      const withLean = calculateTargetEdgeAngle(1, 1, 1);
      expect(withLean).toBeGreaterThan(noLean);
    });
  });
});

describe('Transition Timing', () => {
  describe('calculateTransitionTimingMultiplier', () => {
    it('penalizes panic wiggling (< 0.3s)', () => {
      const mult = calculateTransitionTimingMultiplier(0.2);
      expect(mult).toBe(0.4);
    });

    it('penalizes slow transitions (> 1.8s)', () => {
      const mult = calculateTransitionTimingMultiplier(2.0);
      expect(mult).toBe(0.5);
    });

    it('rewards sweet spot timing', () => {
      const mult = calculateTransitionTimingMultiplier(0.8);
      expect(mult).toBeGreaterThan(1.1);
    });

    it('returns 1.0 for okay but not optimal timing', () => {
      const mult = calculateTransitionTimingMultiplier(1.5);
      expect(mult).toBe(1.0);
    });
  });

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

describe('Carve Energy & Flow', () => {
  describe('calculateCarveAcceleration', () => {
    it('returns zero when rail strength too low', () => {
      expect(calculateCarveAcceleration(1.5, 0.2, 0.8, 0.5)).toBe(0);
    });

    it('returns zero when perfection too low', () => {
      expect(calculateCarveAcceleration(1.5, 0.5, 0.3, 0.5)).toBe(0);
    });

    it('increases with G-force', () => {
      const lowG = calculateCarveAcceleration(1.0, 0.5, 0.8, 0.5);
      const highG = calculateCarveAcceleration(2.0, 0.5, 0.8, 0.5);
      expect(highG).toBeGreaterThan(lowG);
    });

    it('increases with flow state', () => {
      const noFlow = calculateCarveAcceleration(1.5, 0.5, 0.8, 0);
      const fullFlow = calculateCarveAcceleration(1.5, 0.5, 0.8, 1);
      expect(fullFlow).toBeGreaterThan(noFlow);
    });
  });

  describe('updateFlowState', () => {
    it('builds flow during good carving', () => {
      const newFlow = updateFlowState(0.5, 0.9, 0.016);
      expect(newFlow).toBeGreaterThan(0.5);
    });

    it('decays flow during poor carving', () => {
      const newFlow = updateFlowState(0.5, 0.3, 0.016);
      expect(newFlow).toBeLessThan(0.5);
    });

    it('is capped at 1', () => {
      const newFlow = updateFlowState(0.99, 1.0, 1.0);
      expect(newFlow).toBe(1);
    });
  });
});

describe('Board Flex', () => {
  describe('calculateBoardFlex', () => {
    it('returns zero at zero edge angle', () => {
      expect(calculateBoardFlex(0, 15, 0.5)).toBe(0);
    });

    it('increases with edge angle and speed', () => {
      const low = calculateBoardFlex(0.3, 10, 0.5);
      const high = calculateBoardFlex(0.6, 20, 0.5);
      expect(high).toBeGreaterThan(low);
    });

    it('is capped at 1', () => {
      const maxFlex = calculateBoardFlex(1.5, 50, 1.0);
      expect(maxFlex).toBe(1.0);
    });
  });

  describe('accumulateFlexEnergy', () => {
    it('accumulates during deep carves', () => {
      const energy = accumulateFlexEnergy(0.5, 0.6, 0.8, 0.9, 0.016);
      expect(energy).toBeGreaterThan(0.5);
    });

    it('does not accumulate at shallow edge', () => {
      const energy = accumulateFlexEnergy(0.5, 0.6, 0.2, 0.9, 0.016);
      expect(energy).toBe(0.5);
    });

    it('respects max energy cap', () => {
      const energy = accumulateFlexEnergy(1.4, 1.0, 1.0, 1.0, 1.0, 1.5);
      expect(energy).toBe(1.5);
    });
  });
});

describe('Angulation', () => {
  describe('calculateRequiredAngulation', () => {
    it('returns zero at zero edge angle', () => {
      expect(calculateRequiredAngulation(0, 20)).toBe(0);
    });

    it('increases with edge angle and speed', () => {
      const low = calculateRequiredAngulation(0.3, 10);
      const high = calculateRequiredAngulation(0.6, 20);
      expect(high).toBeGreaterThan(low);
    });

    it('is capped at 1', () => {
      expect(calculateRequiredAngulation(1.5, 30)).toBe(1.0);
    });
  });

  describe('updateAngulationCapacity', () => {
    it('degrades with jerky input', () => {
      const newCap = updateAngulationCapacity(1.0, 5.0, 0.016);
      expect(newCap).toBeLessThan(1.0);
    });

    it('restores with smooth input', () => {
      const newCap = updateAngulationCapacity(0.5, 1.0, 0.016);
      expect(newCap).toBeGreaterThan(0.5);
    });

    it('has minimum of 0.4', () => {
      const newCap = updateAngulationCapacity(0.4, 10.0, 1.0);
      expect(newCap).toBe(0.4);
    });
  });
});

describe('Speed Calculations', () => {
  describe('calculateSpeed2D', () => {
    it('calculates pythagorean speed', () => {
      expect(calculateSpeed2D(3, 4)).toBe(5);
    });
  });

  describe('calculateSpeed3D', () => {
    it('calculates 3D pythagorean speed', () => {
      // 2² + 3² + 6² = 4 + 9 + 36 = 49 = 7²
      expect(calculateSpeed3D(2, 3, 6)).toBe(7);
    });
  });

  describe('calculateSlopeAcceleration', () => {
    it('returns zero on flat ground', () => {
      expect(calculateSlopeAcceleration(0)).toBe(0);
    });

    it('increases with steeper slopes', () => {
      const gentle = calculateSlopeAcceleration(0.1);
      const steep = calculateSlopeAcceleration(0.3);
      expect(steep).toBeGreaterThan(gentle);
    });

    it('equals gravity at 90 degrees', () => {
      const accel = calculateSlopeAcceleration(Math.PI / 2);
      expect(accel).toBeCloseTo(9.81);
    });
  });
});
