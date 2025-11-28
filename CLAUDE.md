# Snowboard Carving Physics System

## Overview

This is a snowboard game focused on **killer carves**. The physics system rewards deep, committed edge angles and smooth edge-to-edge transitions.

## Key Components

### PlayerController (`src/PlayerController.js`)

The core physics engine handling all snowboard mechanics.

**Sidecut Geometry** (line 25)
- `sidecutRadius = 7` meters - determines natural turn radius
- Aggressive setting for responsive carving

**Edge Angle System** (lines 494-510)
- `maxEdge = 1.15` radians (~66 degrees) - allows deep carves
- Edge angle directly controlled by steer input
- Tracks `peakEdgeAngle` for carve quality scoring

**Carve Rail System** (lines 32-36, 554-570)
- `carveRailThreshold = 0.5` - edge angle to engage rail mode
- `carveRailStrength` builds over time in deep carves (0-1)
- `carveHoldTime` tracks sustained carve duration
- Rail mode increases grip and stabilizes edge angle

**Carve Chain Bonus** (lines 525-543)
- `carveChainCount` tracks consecutive clean carves (0-10)
- Clean carve = peak edge > 0.5 rad AND hold time > 0.3s
- Chain multiplier: 1.0 to 2.0x boost on transitions

**Edge Transition Boost** (lines 519-548, 572-578)
- Detects edge-to-edge switches (the "pop")
- `edgeTransitionBoost` gives forward acceleration burst
- Bigger boost from deeper previous carve and higher chain count

**Carve Acceleration** (lines 665-676)
- Deep carves generate speed (pumping physics)
- Based on G-force: `(speed^2) / turnRadius`
- Requires `carveRailStrength > 0.3` and `carvePerfection > 0.5`

**Grip System** (lines 653-663)
- Base grip: 0.7
- Edge grip bonus: `absEdge * 0.3`
- Rail grip bonus: `carveRailStrength * 0.15`
- Max grip: 0.98 (nearly locked in during deep carves)

**Compression System** (lines 580-598)
- G-force based compression during carves
- `carveGForce = (speed * absEdge) / 15`
- Deeper/faster = more rider compression
- Edge switch triggers extension "pop"

### CarveMarks (`src/CarveMarks.js`)

Visual trail system showing carve marks in snow.

**Trail Generation** (lines 40-70)
- Spawns when: grounded AND `edgeAngle > 0.25` AND `speed > 3`
- Position calculated at board edge contact point
- `carveIntensity` affects trail width/opacity

**Trail Rendering** (lines 110-170)
- Ribbon geometry built from point array
- Two vertices per point (left/right edge)
- Width varies with carve intensity

**Trail Lifecycle** (lines 180-210)
- `trailLifetime = 15` seconds before fade starts
- `fadeDuration = 5` seconds to fully disappear
- Max 20 concurrent trails, 500 points each

### Snow Spray Particles (`src/PlayerController.js:225-310`)

- Particle count scales with `carveRailStrength`
- `carveBoost` multiplier for spray velocity
- More dramatic during committed carves

## Physics Flow

```
Input (steer)
  -> Edge Angle
  -> Carve Detection (rail threshold check)
  -> Rail Strength builds
  -> Grip increases + Carve Acceleration
  -> Edge Switch detected
  -> Chain Count updates + Transition Boost
  -> Compression/Extension animation
```

## Tuning Parameters

| Parameter | Value | Effect |
|-----------|-------|--------|
| `sidecutRadius` | 7m | Tighter = sharper turns |
| `maxEdge` | 1.15 rad | Higher = deeper carves possible |
| `carveRailThreshold` | 0.5 rad | Lower = easier to engage rail |
| `carveChainCount` max | 10 | Higher = more reward for chains |
| `baseGrip` | 0.7 | Lower = more slide, higher = more grip |

## Controls

- **A/D**: Steer (edge angle)
- **W/S**: Lean forward/back (weight transfer)
- **Space**: Jump (hold to charge ollie)
- **R**: Reset position
