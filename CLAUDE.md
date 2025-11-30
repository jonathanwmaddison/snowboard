# Snowboard Carving Physics System

## Overview

This is a snowboard game focused on **killer carves**. The physics system rewards deep, committed edge angles and smooth edge-to-edge transitions.

## Key Components

### Player Physics System (4 files)

The physics engine is split into modular files for maintainability:

| File | Lines | Purpose |
|------|-------|---------|
| `PlayerController.js` | ~780 | Core class, state, init, main update loop, ground detection |
| `CarvePhysics.js` | ~490 | Edge control, grip, rail system, wash-out, flow state, turn physics |
| `AirGrindPhysics.js` | ~260 | Air physics, grinding, jumping, landing |
| `PlayerAnimation.js` | ~500 | Animation state, visual mesh, particles |

### PlayerController (`src/PlayerController.js`)

Core class that orchestrates all physics systems. Contains all state variables and the main update loop.

**Core State**
- `sidecutRadius = 7` meters - determines natural turn radius (aggressive for killer carves)
- `velocity`, `heading`, `edgeAngle` - primary movement state
- `isGrounded`, `groundNormal`, `groundHeight` - terrain interaction

**Main Update Loop**
- Ground detection via raycasting
- Delegates to CarvePhysics for grounded physics
- Delegates to AirGrindPhysics for air/grind physics
- Delegates to PlayerAnimation for visual updates

### CarvePhysics (`src/CarvePhysics.js`)

All carving-related physics systems as exportable functions.

**Edge Angle System** (`updateEdgeAngle`)
- `maxEdge = 1.15` radians (~66 degrees) - allows deep carves
- Spring-damper physics for smooth, responsive edge control
- Tracks `peakEdgeAngle` for carve quality scoring

**Carve Rail System** (`updateCarveRail`)
- `carveRailThreshold = 0.5` - edge angle to engage rail mode
- `carveRailStrength` builds over time in deep carves (0-1)
- `carveHoldTime` tracks sustained carve duration
- Rail mode increases grip and stabilizes edge angle

**Edge Transition System** (`handleEdgeTransition`)
- Detects edge-to-edge switches (the "pop")
- `edgeTransitionBoost` gives forward acceleration burst
- Calculates timing multiplier for rhythm rewards
- Determines arc shape (C-turn/J-turn/wiggle)

**Carve Chain Bonus**
- `carveChainCount` tracks consecutive clean carves (0-10)
- Clean carve = peak edge > 0.5 rad AND hold time > 0.3s
- Chain multiplier: 1.0 to 2.0x boost on transitions

**Grip System** (`calculateGrip`)
- Base grip: 0.7
- Edge grip bonus: `absEdge * 0.3`
- Rail grip bonus: `carveRailStrength * 0.15`
- Edge bite bonus: up to 12% for sustained carves
- Angulation bonus: proper form adds grip
- Max grip: 0.98 (nearly locked in during deep carves)

**Angulation System** (`updateAngulation`)
- Proper body angulation allows deeper edge hold without washing out
- `angulationNeeded = (absEdge * speed) / 25` - more needed at high speed + deep edge
- Jerky input degrades `angulationCapacity` (bad form)
- Good angulation adds grip bonus and reduces wash-out risk by up to 50%

**Board Flex System** (`updateBoardFlex`)
- Board stores energy when flexed under carving load
- `flexEnergy` accumulates during sustained deep carves
- Released as extra "pop" boost on edge transitions (flexBoost = flexEnergy * 2.5)
- Creates satisfying snap when transitioning between edges

**Carve Flow State** (`updateFlowState`)
- "In the zone" state that builds with consecutive perfect carves
- `flowState` (0-1) provides: +50% carve acceleration, +8% grip, +30% transition boost
- `flowMomentum` builds with clean carves (good arc + good timing)
- Decays over time without perfect carves - maintains rhythm rewards

**Arc Shape Tracking** (`updateArcTracking`)
- Tracks heading change to classify turn type
- C-turn (>60°): Full carve, 1.3x multiplier - rewards completing the arc
- J-turn (30-60°): Partial turn, 1.0x multiplier
- Wiggle (<30°): Uncommitted, 0.5x multiplier - penalizes nervous wiggling

**Edge Bite Progression** (`updateEdgeBite`)
- Edge grip builds over time as edge "bites" into snow
- Faster bite buildup with good angulation and perfection
- Adds up to 12% extra grip for sustained carves
- Resets on edge transitions

**Transition Timing Sweet Spot**
- Optimal rhythm: 0.5-1.2 seconds between edge transitions
- Sweet spot center at 0.8s gives up to 1.175x multiplier
- Too fast (<0.3s): 0.4x penalty - panic wiggling
- Too slow (>1.8s): 0.5x penalty - lost rhythm/momentum

**Risk & Failure Systems** (`updateRiskAndWobble`, `updateEdgeCatchConsequences`)
- Wash-out: edge slips when speed doesn't match edge angle
- Edge catch: catching wrong edge during transition
- Risk level affects wobble and grip degradation

**Carve Acceleration** (`applyCarveAcceleration`)
- Deep carves generate speed (pumping physics)
- Based on G-force: `(speed^2) / turnRadius`
- Requires `carveRailStrength > 0.3` and `carvePerfection > 0.5`

**Turn Physics** (`updateTurnPhysics`)
- Sidecut-based turn radius calculation
- Turn inertia system for realistic momentum
- Heading velocity smoothing

### AirGrindPhysics (`src/AirGrindPhysics.js`)

Air physics, grinding, jumping, and landing systems.

**Air Physics** (`updateAirPhysics`)
- Gravity with ramp (increases over air time)
- Spin control (Y-axis rotation)
- Flip control (pitch - front/back flips)
- Roll/grab style
- Air steering (subtle trajectory adjustment)

**Jump System** (`initiateJump`)
- Tap = tiny hop, Hold = bigger ollie
- Charge bonus scales with hold time
- Tail pop bonus for proper ollie technique
- Compression snap adds extra height

**Landing** (`onLanding`)
- Landing quality based on pitch/roll/heading alignment
- Impact effects scale with fall speed
- Clean landing bonus for stomped landings
- Bad landing causes wobble and speed loss

**Grinding System** (`startGrind`, `updateGrindPhysics`, `endGrind`)
- Balance system using steer input
- Rail movement with low friction
- Pop off at rail end

### PlayerAnimation (`src/PlayerAnimation.js`)

Animation state, visual updates, mesh creation, and particles.

**Mesh Creation**
- `createVisualMesh` - delegates to GLB or placeholder
- `createPlaceholderMesh` - simple capsule until GLB loads
- `createVisualMeshGLB` - full GLB model setup
- `loadGLBModel` - async GLB loading

**Animation State** (`updateAnimationState`)
- G-force based leg compression
- Front/back leg differential for weight shift
- Ankle flex for edge pressure
- Hip height and lateral shift
- Angulation and counter-rotation
- Arm dynamics for balance
- Failure state overrides (wash-out, edge catch wobble)

**Visual Updates** (`updateMesh`)
- Position sync with physics body
- Board orientation (heading, slope alignment, edge tilt, weight shift)
- Air rotation (pitch, roll, heading)

**Spray Particles** (`createSprayParticles`, `updateSprayParticles`)
- Particle count scales with `carveRailStrength`
- `carveBoost` multiplier for spray velocity
- More dramatic during committed carves

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

### CameraControllerV2 (`src/CameraControllerV2.js`)

Centered chase camera system (v2). Stays behind the rider at all times. The original simple orbit camera is preserved in `CameraController.js` (v1).

**Camera Modes**
- **Chase** (default): Close follow, responsive
- **Cinematic**: Further back, slower follow
- **Action**: Close and intense, high FOV
- **Side**: Offset view from the side

**Dynamic Effects**
- **FOV scaling**: Widens during speed and deep carves
- **Distance scaling**: Camera pulls back at higher speeds
- **Height compression**: Camera lowers during high G-force

**Parameters**
- `lagStrength`: How fast orbit catches up to player heading
- `speedFovBoost` / `carveFovBoost`: FOV increase factors

**Flow State Integration**
- Camera receives flow state (0-1) from player
- Subtle FOV boost during high flow

| Mode | Distance | Height | FOV | Lag |
|------|----------|--------|-----|-----|
| Chase | 8m | 3.5m | 70° | 0.15 |
| Cinematic | 14m | 5m | 55° | 0.08 |
| Action | 5m | 2m | 85° | 0.20 |
| Side | 10m | 2m | 60° | 0.10 |

### PlayerModelV2 (`src/PlayerModelV2.js`)

Realistic snowboarder model (v2). A placeholder capsule model is used until a GLB model is loaded.

**Features**
- **Anatomically correct proportions**: ~1.75m tall rider with proper limb ratios
- **PBR materials**: MeshStandardMaterial with roughness/metalness for realistic lighting
- **Detailed clothing**: Technical snow jacket with collar, panels, and zipper; fitted pants; realistic boots
- **Articulated hands**: Full fingers with gloves, not just spheres
- **Detailed head**: Proper skull shape with helmet, vents, ear pads, and wrap-around goggles with reflective lens
- **Realistic snowboard**: Shaped board with sidecut, rocker profile, metal edges, graphic top sheet, and full bindings with highbacks, straps, and ratchets

**Body Hierarchy**
```
mesh (root)
├── boardGroup
│   ├── boardMesh (shaped with sidecut)
│   ├── graphics (stripes, logo)
│   ├── edges (metal)
│   └── bindings (front/back with highbacks, straps, ratchets)
└── riderGroup
    ├── lowerBodyGroup
    │   ├── boots (with soles, cuffs, lacing)
    │   ├── legs (shin + calf, knee + pad, thigh + quad)
    │   └── pelvisGroup (hips with waistband)
    └── upperBodyGroup
        ├── torsoGroup (chest, collar, zipper, shoulder panels)
        ├── arms (shoulder joint, upper arm, elbow, forearm, hands with fingers)
        └── headGroup (neck, gaiter, head, chin, helmet, vents, ear pads, goggles + strap)
```

**Customization Methods**
- `setJacketColor(hex)`: Change jacket color
- `setPantsColor(hex)`: Change pants color
- `setHelmetColor(hex)`: Change helmet color
- `setGoggleLensColor(hex)`: Change goggle lens color (affects reflection)

**Dimensions**
| Part | Length/Size |
|------|-------------|
| Total height | ~1.75m |
| Board length | 1.55m |
| Stance width | 0.52m |
| Binding angles | +15° / -12° (duck stance) |
| Thigh | 0.44m |
| Shin | 0.42m |
| Upper arm | 0.30m |
| Forearm | 0.26m |

### PlayerModelGLB (`src/PlayerModelGLB.js`)

Load external rigged 3D character models in GLB/GLTF format. Supports models rigged with **Mixamo skeleton** (industry standard). Works with Ready Player Me, Quaternius, Sketchfab, and most free character models.

**Loading Models**
```javascript
// From browser console:
loadSoldier()                    // Pre-downloaded soldier model
loadRobot()                      // Pre-downloaded robot model
loadModel('/path/to/model.glb')  // Any local GLB file
loadModel('https://...')         // Any remote URL
```

**Supported Skeleton Bones**
Auto-maps these Mixamo-standard bone names:
- Hips, Spine, Spine1, Spine2, Neck, Head
- LeftShoulder, LeftArm, LeftForeArm, LeftHand
- RightShoulder, RightArm, RightForeArm, RightHand
- LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase
- RightUpLeg, RightLeg, RightFoot, RightToeBase

**Recommended Free Model Sources**
- [Mixamo](https://www.mixamo.com/) - Auto-rig + 2000+ free animations
- [Ready Player Me](https://readyplayer.me/) - Customizable avatars, GLB export
- [Quaternius](https://quaternius.com/) - CC0 game-ready characters
- [Sketchfab Free Collection](https://sketchfab.com/tags/rigged-character) - Many free rigged characters
- [Characters3D](https://characters3d.com/) - Free GLB/GLTF characters

**Pre-downloaded Test Models** (in `public/models/`)
- `test-character.glb` - Three.js Soldier (2.1MB)
- `robot.glb` - Robot character (453KB)

**GLB Bone Rotation Notes**

Models typically come in T-pose. The model is rotated 90° on Y (`Math.PI/2`) to face sideways for snowboard stance. Bone rotations use Euler angles (X, Y, Z) via `SpringDamper3` for smooth animation.

| Body Part | Axis | Direction | Notes |
|-----------|------|-----------|-------|
| **Arms (both)** | X | +1.2 rad down | Both left AND right arms use positive X to rotate down from T-pose |
| **Thighs (UpLeg)** | X | negative = forward | Hip flexion for knee bend stance |
| **Shins (Leg)** | X | positive = bend | Knee flexion |
| **Feet** | X | 0 = flat | Keep at 0 for flat feet on board |
| **Spine** | Z | lean into turn | Negative edge → positive Z lean |
| **Spine** | X | forward tuck | Speed tuck |
| **Spine** | Y | counter-rotation | Twist opposite to turn direction |

**Key Learnings**
- Left and right arms do NOT mirror (both use +X to go down)
- Leg bones DO mirror (left uses -X for thigh forward, right uses +X)
- Feet should stay at (0,0,0) for flat on board
- Test one bone at a time when debugging
- The model's Y rotation affects which local axis does what

## Physics Flow

```
Input (steer)
  -> Edge Angle
  -> Angulation calculated (based on edge + speed)
  -> Carve Detection (rail threshold check)
  -> Rail Strength builds
  -> Edge Bite builds (progressive grip)
  -> Board Flex accumulates (stores energy)
  -> Grip increases (base + edge + rail + bite + angulation)
  -> Carve Acceleration (boosted by flow state)
  -> Edge Switch detected
  -> Arc Shape evaluated (C-turn/J-turn/wiggle)
  -> Transition Timing scored (sweet spot check)
  -> Flex Energy released (pop boost)
  -> Chain Count + Flow State updated
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
| `flowBuildRate` | 0.15 | Higher = faster flow buildup |
| `flowDecayRate` | 0.3 | Lower = flow persists longer |
| `edgeBiteRate` | 2.0 | Higher = faster progressive grip |
| `flexStiffness` | 8 | Higher = board responds faster |
| `sweetSpotCenter` | 0.8s | Optimal timing between transitions |

## Controls (v2 - Simplified)

Simple, intuitive controls focused on carving feel:

**Steering (Edge Angle)**
- **A** or **←**: Heelside edge (turn left)
- **D** or **→**: Toeside edge (turn right)
- Input controls edge angle directly with smooth spring-damper physics
- Deeper edge = tighter turn radius (sidecut geometry)

**Weight Distribution**
- **W** or **↑**: Lean forward (tuck for speed, increases edge commitment)
- **S** or **↓**: Lean back (BRAKE - scrubs speed, also charges ollie tail-pop)

**Actions**
- **Space**: Jump (hold to charge ollie for bigger pop)
- **R**: Reset position
- **Z**: Zen mode (hide UI)
- **G**: Start gate challenge (cycles: slalom → GS → freeride)
- **V**: Toggle camera version (v1 simple / v2 carve-reactive)
- **C**: Cycle camera mode (v2 only: chase → cinematic → action → side)
- **M**: Toggle player model (v1 simple / v2 realistic)

**Air Controls (while airborne)**
- **A/D** or **←/→**: Spin (rotate left/right) - tuck increases spin speed
- **W** or **↑**: Front flip
- **S** or **↓**: Back flip
- Combine steer + lean for stylish cork rotations

**Gamepad**
- **Left Stick**: Steer (X) and Lean (Y)
- **Right Stick**: Camera orbit and pitch
- **A/X Button**: Jump
- **B/Circle**: Restart
- **Y/Triangle**: Zen mode
- **Start**: Gate challenge
- **R3**: Reset camera
- **LB/L1**: Toggle camera version (v1/v2)
- **RB/R1**: Cycle camera mode (v2 only)

**Touch/Trackpad**
- Drag left/right to steer
- Drag up/down to lean
- Click canvas to enable pointer lock mode
