import { describe, it, expect } from 'vitest';
import {
  createInputState,
  createTerrainContact,
  createSnowCondition,
  createPhysicsState,
  createEdgeState,
  createCarveState,
  createAirState,
  createV2CarveState,
  createSkiState,
  createCompletePlayerState,
  validateEdgeAngle,
  validateNormalized,
  normalizeAngle,
} from '../src/types.js';

describe('State Factory Functions', () => {
  describe('createInputState', () => {
    it('creates default input state with zero values', () => {
      const state = createInputState();
      expect(state.steer).toBe(0);
      expect(state.lean).toBe(0);
      expect(state.jump).toBe(false);
      expect(state.switchStance).toBe(false);
      expect(state.shift).toBe(false);
    });
  });

  describe('createTerrainContact', () => {
    it('creates terrain contact with default values', () => {
      const state = createTerrainContact();
      expect(state.isGrounded).toBe(false);
      expect(state.wasGrounded).toBe(false);
      expect(state.groundNormal.y).toBe(1);
      expect(state.groundHeight).toBe(0);
      expect(state.airTime).toBe(0);
    });
  });

  describe('createSnowCondition', () => {
    it('creates groomed snow condition by default', () => {
      const state = createSnowCondition();
      expect(state.type).toBe('groomed');
      expect(state.gripMultiplier).toBe(1.0);
      expect(state.speedMultiplier).toBe(1.0);
      expect(state.dragMultiplier).toBe(1.0);
    });
  });

  describe('createPhysicsState', () => {
    it('creates physics state with default mass', () => {
      const state = createPhysicsState();
      expect(state.mass).toBe(75);
      expect(state.heading).toBe(0);
      expect(state.currentSpeed).toBe(0);
      expect(state.velocity).toBeDefined();
    });
  });

  describe('createEdgeState', () => {
    it('creates edge state with zero angles', () => {
      const state = createEdgeState();
      expect(state.edgeAngle).toBe(0);
      expect(state.targetEdgeAngle).toBe(0);
      expect(state.edgeVelocity).toBe(0);
      expect(state.peakEdgeAngle).toBe(0);
    });
  });

  describe('createCarveState', () => {
    it('creates complete carve state with all sub-states', () => {
      const state = createCarveState();
      expect(state.edge).toBeDefined();
      expect(state.rail).toBeDefined();
      expect(state.chain).toBeDefined();
      expect(state.angulation).toBeDefined();
      expect(state.flex).toBeDefined();
      expect(state.flow).toBeDefined();
      expect(state.arc).toBeDefined();
      expect(state.bite).toBeDefined();
      expect(state.transition).toBeDefined();
    });

    it('has correct default rail threshold', () => {
      const state = createCarveState();
      expect(state.rail.carveRailThreshold).toBe(0.5);
    });
  });

  describe('createAirState', () => {
    it('creates air state with rotation, jump, and compression', () => {
      const state = createAirState();
      expect(state.rotation).toBeDefined();
      expect(state.jump).toBeDefined();
      expect(state.compression).toBeDefined();
      expect(state.rotation.pitch).toBe(0);
      expect(state.jump.maxChargeTime).toBe(0.4);
    });
  });

  describe('createV2CarveState', () => {
    it('creates V2 state with regular stance by default', () => {
      const state = createV2CarveState();
      expect(state.stance).toBe('regular');
      expect(state.isSwitch).toBe(false);
      expect(state.currentEdge).toBe('flat');
      expect(state.turnPhase).toBe('neutral');
      expect(state.isCarving).toBe(true);
      expect(state.carveQuality).toBe(1.0);
    });

    it('has pressure distribution at neutral (0.5)', () => {
      const state = createV2CarveState();
      expect(state.pressureDistribution).toBe(0.5);
      expect(state.targetPressure).toBe(0.5);
    });
  });

  describe('createSkiState', () => {
    it('creates ski state with two independent skis', () => {
      const state = createSkiState();
      expect(state.leftSki).toBeDefined();
      expect(state.rightSki).toBeDefined();
      expect(state.leftSki.edgeAngle).toBe(0);
      expect(state.rightSki.edgeAngle).toBe(0);
      expect(state.turnType).toBe('neutral');
      expect(state.isParallel).toBe(true);
    });
  });

  describe('createCompletePlayerState', () => {
    it('creates complete player state with all sub-states', () => {
      const state = createCompletePlayerState();
      expect(state.input).toBeDefined();
      expect(state.physics).toBeDefined();
      expect(state.terrain).toBeDefined();
      expect(state.snow).toBeDefined();
      expect(state.carve).toBeDefined();
      expect(state.v2).toBeDefined();
      expect(state.air).toBeDefined();
      expect(state.grind).toBeDefined();
      expect(state.switch).toBeDefined();
      expect(state.weight).toBeDefined();
      expect(state.risk).toBeDefined();
      expect(state.failure).toBeDefined();
      expect(state.ski).toBeDefined();
      expect(state.board).toBeDefined();
    });
  });
});

describe('Validation Functions', () => {
  describe('validateEdgeAngle', () => {
    it('clamps edge angle to max value', () => {
      expect(validateEdgeAngle(2.0, 1.15)).toBe(1.15);
      expect(validateEdgeAngle(-2.0, 1.15)).toBe(-1.15);
    });

    it('passes through valid angles', () => {
      expect(validateEdgeAngle(0.5, 1.15)).toBe(0.5);
      expect(validateEdgeAngle(-0.5, 1.15)).toBe(-0.5);
    });

    it('handles NaN and invalid values', () => {
      expect(validateEdgeAngle(NaN)).toBe(0);
      expect(validateEdgeAngle(undefined)).toBe(0);
    });

    it('uses default max edge of 1.15', () => {
      expect(validateEdgeAngle(1.5)).toBe(1.15);
    });
  });

  describe('validateNormalized', () => {
    it('clamps values to [0, 1]', () => {
      expect(validateNormalized(1.5)).toBe(1);
      expect(validateNormalized(-0.5)).toBe(0);
    });

    it('passes through valid values', () => {
      expect(validateNormalized(0.5)).toBe(0.5);
      expect(validateNormalized(0)).toBe(0);
      expect(validateNormalized(1)).toBe(1);
    });

    it('handles NaN', () => {
      expect(validateNormalized(NaN)).toBe(0);
    });
  });

  describe('normalizeAngle', () => {
    it('normalizes angles to [-PI, PI]', () => {
      expect(normalizeAngle(0)).toBe(0);
      expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI);
      expect(normalizeAngle(-Math.PI)).toBeCloseTo(-Math.PI);
    });

    it('wraps angles greater than PI', () => {
      expect(normalizeAngle(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5);
      expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0);
      expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    });

    it('wraps angles less than -PI', () => {
      expect(normalizeAngle(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5);
      expect(normalizeAngle(-2 * Math.PI)).toBeCloseTo(0);
    });
  });
});
