import * as THREE from 'three';
import { SimplexNoise } from './SimplexNoise.js';

export class TerrainGenerator {
  constructor(sceneManager, physicsWorld) {
    this.sceneManager = sceneManager;
    this.physicsWorld = physicsWorld;
    this.mesh = null;
    this.body = null;

    // Mountain parameters
    this.length = 1400;  // meters (z-axis, downhill)
    this.width = 400;    // meters (x-axis)
    this.segmentsX = 250;
    this.segmentsZ = 700;

    // Noise generators
    this.terrainNoise = new SimplexNoise(12345);
    this.detailNoise = new SimplexNoise(67890);
    this.mogulNoise = new SimplexNoise(11111);
    this.groomNoise = new SimplexNoise(22222);

    // Mountain profile
    this.peakHeight = 450;
    this.baseHeight = 0;

    // Define ski trails
    this.trails = this.defineTrails();
  }

  defineTrails() {
    // Single main trail that weaves down the mountain
    return [
      {
        name: 'Main Run',
        difficulty: 'blue',
        color: 0x0066ff,
        groomed: true,
        width: 45,
        // Trail weaves left and right down the mountain
        path: [
          [0, -this.length/2 + 30],
          [40, -this.length/2 + 120],
          [60, -this.length/2 + 220],
          [30, -this.length/2 + 320],
          [-20, -this.length/2 + 420],
          [-50, -this.length/2 + 520],
          [-40, -this.length/2 + 620],
          [0, -this.length/2 + 720],
          [50, -this.length/2 + 820],
          [70, -this.length/2 + 920],
          [40, -this.length/2 + 1020],
          [-10, -this.length/2 + 1120],
          [-40, -this.length/2 + 1220],
          [-20, -this.length/2 + 1320],
          [0, this.length/2 - 50]
        ]
      }
    ];
  }

  generate() {
    const geometry = new THREE.PlaneGeometry(
      this.width,
      this.length,
      this.segmentsX,
      this.segmentsZ
    );

    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    // Pre-compute trail splines for smooth interpolation
    this.trailSplines = this.trails.map(trail => this.createTrailSpline(trail.path));

    // Generate terrain
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);

      const height = this.calculateHeight(x, z);
      positions.setY(i, height);

      const color = this.getTerrainColor(x, z, height);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.0,
      flatShading: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.sceneManager.add(this.mesh);

    // Add resort features
    this.addTrailSigns();
    this.addTrailBoundaries();
    this.addTrees();
    this.addRocks();
    this.addLiftTowers();

    this.createPhysicsCollider(geometry);

    const startZ = -this.length / 2 + 50;
    const startY = this.calculateHeight(0, startZ) + 2;

    return {
      startPosition: { x: 0, y: startY, z: startZ },
      length: this.length,
      width: this.width
    };
  }

  createTrailSpline(pathPoints) {
    // Create smooth spline through trail control points
    const points = pathPoints.map(p => new THREE.Vector2(p[0], p[1]));
    return new THREE.SplineCurve(points);
  }

  getTrailInfo(x, z) {
    // Find which trail(s) this point is on and how centered
    let bestTrail = null;
    let bestDistance = Infinity;
    let onTrail = false;

    for (let i = 0; i < this.trails.length; i++) {
      const trail = this.trails[i];
      const spline = this.trailSplines[i];

      // Sample spline to find closest point
      const samples = 50;
      for (let t = 0; t <= 1; t += 1/samples) {
        const point = spline.getPoint(t);
        const dist = Math.sqrt((x - point.x) ** 2 + (z - point.y) ** 2);

        if (dist < bestDistance) {
          bestDistance = dist;
          bestTrail = trail;
        }
      }
    }

    if (bestTrail && bestDistance < bestTrail.width) {
      onTrail = true;
    }

    return {
      trail: bestTrail,
      distance: bestDistance,
      onTrail: onTrail,
      centeredness: bestTrail ? Math.max(0, 1 - bestDistance / bestTrail.width) : 0
    };
  }

  calculateHeight(x, z) {
    const normalizedZ = (z + this.length / 2) / this.length;
    const normalizedX = x / (this.width / 2);

    // Base mountain slope
    const slopeProfile = this.getSlopeProfile(normalizedZ);
    let baseHeight = this.peakHeight * (1 - slopeProfile);

    // Mountain structure
    const ridgeScale = 0.002;
    const ridges = this.terrainNoise.ridgeNoise(x * ridgeScale, z * ridgeScale, 4, 2.0, 0.5);
    const valleys = this.terrainNoise.fbm(x * 0.006, z * 0.004, 5, 2.0, 0.55);

    // Edge falloff
    const edgeDistance = Math.abs(normalizedX);
    let edgeProfile = 0;
    if (edgeDistance > 0.7) {
      edgeProfile = Math.pow((edgeDistance - 0.7) / 0.3, 2) * 200;
    }

    let height = baseHeight;
    height += ridges * 50;
    height += valleys * 25;
    height -= edgeProfile;

    // Get trail information
    const trailInfo = this.getTrailInfo(x, z);

    if (trailInfo.onTrail && trailInfo.trail) {
      const trail = trailInfo.trail;
      const centeredness = trailInfo.centeredness;

      // Smooth trail surface - reduce natural terrain variation
      const smoothFactor = centeredness * 0.8;

      // Groomed trails are smoother with visible corduroy
      if (trail.groomed) {
        // Strong corduroy grooming pattern - visible parallel ridges across the trail
        // Multiple frequencies for realistic groomer pattern
        const groomFreq1 = Math.sin(z * 8.0) * 0.12;  // Main corduroy ridges
        const groomFreq2 = Math.sin(z * 16.0) * 0.04; // Fine detail
        const groomPattern = (groomFreq1 + groomFreq2) * centeredness;
        height += groomPattern;

        // Groomed trails are much flatter - remove natural bumps
        // Only add minimal terrain variation
        const roughTerrain = this.detailNoise.fbm(x * 0.02, z * 0.015, 3, 2.0, 0.5) * 3;
        height += roughTerrain * (1 - smoothFactor * 0.9);

        // Slight cross-slope for drainage (edges slightly higher)
        const crossSlope = Math.pow(1 - centeredness, 2) * 0.5;
        height += crossSlope;
      } else {
        // Ungroomed = mogul field
        const mogulSize = trail.difficulty === 'double-black' ? 4.5 : 3.5;
        const mogulDensity = trail.difficulty === 'double-black' ? 0.15 : 0.12;
        const moguls = this.mogulNoise.fbm(x * mogulDensity, z * mogulDensity * 0.7, 3, 2.0, 0.6);
        height += moguls * mogulSize * centeredness;
      }

      // Trail banking - slightly raised edges for containment
      const edgeFactor = 1 - centeredness;
      height += edgeFactor * edgeFactor * 2;

      // Terrain park features
      if (trail.isTerrainPark) {
        height += this.addTerrainParkFeatures(x, z, trail, centeredness);
      }

      // Difficulty affects steepness
      if (trail.difficulty === 'green') {
        // Gentler slope for beginners
        height += normalizedZ * 30;
      } else if (trail.difficulty === 'black' || trail.difficulty === 'double-black') {
        // Steeper for experts
        height -= normalizedZ * 20;
      }
    } else {
      // Off-piste terrain - natural snow with some features
      const naturalBumps = this.detailNoise.fbm(x * 0.025, z * 0.02, 4, 2.0, 0.5);
      height += naturalBumps * 10;

      // Wind-blown features
      const windDrift = this.terrainNoise.noise2D(x * 0.01, z * 0.008);
      if (windDrift > 0.5) {
        height += (windDrift - 0.5) * 15;
      }
    }

    // Fine snow texture everywhere
    height += this.detailNoise.noise2D(x * 0.4, z * 0.3) * 0.15;

    return height;
  }

  addTerrainParkFeatures(x, z, trail, centeredness) {
    let featureHeight = 0;

    // Define park features along the trail
    const features = [
      { z: -this.length/2 + 280, type: 'jump', size: 3 },
      { z: -this.length/2 + 400, type: 'rail', size: 0.5 },
      { z: -this.length/2 + 500, type: 'jump', size: 4 },
      { z: -this.length/2 + 620, type: 'box', size: 0.8 },
      { z: -this.length/2 + 720, type: 'jump', size: 5 },
      { z: -this.length/2 + 850, type: 'halfpipe', size: 4 },
    ];

    for (const feature of features) {
      const dz = z - feature.z;

      if (feature.type === 'jump' && Math.abs(dz) < 20) {
        // Kicker ramp
        const t = (dz + 20) / 40;
        if (t > 0.3 && t < 0.7) {
          const rampT = (t - 0.3) / 0.4;
          featureHeight += Math.sin(rampT * Math.PI * 0.5) * feature.size * centeredness;
        } else if (t >= 0.7) {
          // Landing slope
          const landT = (t - 0.7) / 0.3;
          featureHeight += (1 - landT) * feature.size * 0.3 * centeredness;
        }
      } else if (feature.type === 'halfpipe' && Math.abs(dz) < 40) {
        // Halfpipe walls
        const pipeWidth = 12;
        const distFromCenter = Math.abs(x - 50); // Approximate trail center
        if (distFromCenter < pipeWidth) {
          const wallHeight = Math.pow(distFromCenter / pipeWidth, 2) * feature.size;
          featureHeight += wallHeight * centeredness;
        }
      }
    }

    return featureHeight;
  }

  getSlopeProfile(t) {
    if (t < 0.08) {
      return t * 0.4; // Summit plateau
    } else if (t < 0.25) {
      return 0.032 + (t - 0.08) * 1.2; // Upper mountain - steep
    } else if (t < 0.5) {
      return 0.236 + (t - 0.25) * 0.85; // Mid mountain
    } else if (t < 0.75) {
      return 0.4485 + (t - 0.5) * 1.1; // Lower steep section
    } else {
      return 0.7235 + (t - 0.75) * 0.6; // Base area - gentle runout
    }
  }

  getTerrainColor(x, z, height) {
    const trailInfo = this.getTrailInfo(x, z);

    // Base snow colors
    const freshSnow = { r: 0.98, g: 0.98, b: 1.0 };
    const groomedBase = { r: 0.88, g: 0.91, b: 0.96 };      // Base groomed color (slightly blue-gray)
    const groomedRidge = { r: 0.95, g: 0.96, b: 0.98 };     // Ridge tops (brighter)
    const groomedValley = { r: 0.82, g: 0.86, b: 0.93 };    // Valleys between ridges (darker)
    const packedSnow = { r: 0.80, g: 0.82, b: 0.88 };
    const icySnow = { r: 0.72, g: 0.80, b: 0.90 };
    const shadowSnow = { r: 0.70, g: 0.75, b: 0.88 };

    let color = { ...freshSnow };

    if (trailInfo.onTrail && trailInfo.trail) {
      const trail = trailInfo.trail;
      const centeredness = trailInfo.centeredness;

      if (trail.groomed) {
        // Groomed trail - very visible corduroy stripes
        // Use sine wave to create alternating light/dark stripes
        const corduroySine = Math.sin(z * 8.0);
        const corduroyPattern = (corduroySine + 1) * 0.5; // 0 to 1

        // Blend between valley (dark) and ridge (light) colors
        const baseColor = {
          r: THREE.MathUtils.lerp(groomedValley.r, groomedRidge.r, corduroyPattern),
          g: THREE.MathUtils.lerp(groomedValley.g, groomedRidge.g, corduroyPattern),
          b: THREE.MathUtils.lerp(groomedValley.b, groomedRidge.b, corduroyPattern)
        };

        // Apply centeredness - more visible corduroy pattern toward center
        color.r = THREE.MathUtils.lerp(freshSnow.r, baseColor.r, centeredness * 0.9);
        color.g = THREE.MathUtils.lerp(freshSnow.g, baseColor.g, centeredness * 0.9);
        color.b = THREE.MathUtils.lerp(freshSnow.b, baseColor.b, centeredness * 0.9);

        // Add subtle sparkle on ridge tops (sun catching the grooves)
        if (corduroySine > 0.7) {
          const sparkle = (corduroySine - 0.7) * 0.15 * centeredness;
          color.r = Math.min(1, color.r + sparkle);
          color.g = Math.min(1, color.g + sparkle);
          color.b = Math.min(1, color.b + sparkle * 0.5);
        }
      } else {
        // Mogul field - bumpy, icy, packed appearance
        const mogulShading = this.mogulNoise.noise2D(x * 0.12, z * 0.08);
        const mogulColor = mogulShading > 0 ? packedSnow : icySnow;
        const mogulBlend = Math.abs(mogulShading) * 0.5 + 0.3;

        color.r = THREE.MathUtils.lerp(freshSnow.r, mogulColor.r, centeredness * mogulBlend);
        color.g = THREE.MathUtils.lerp(freshSnow.g, mogulColor.g, centeredness * mogulBlend);
        color.b = THREE.MathUtils.lerp(freshSnow.b, mogulColor.b, centeredness * mogulBlend);

        // Icy highlights on mogul tops
        if (mogulShading > 0.4) {
          color.r -= 0.05;
          color.b += 0.03;
        }
      }

      // Terrain park has slightly different color (more worked snow)
      if (trail.isTerrainPark) {
        color.r -= 0.04;
        color.g -= 0.02;
        color.b += 0.02;
      }
    }

    // Slope-based shading
    const dx = this.calculateHeight(x + 1, z) - this.calculateHeight(x - 1, z);
    const dz = this.calculateHeight(x, z + 1) - this.calculateHeight(x, z - 1);
    const slope = Math.sqrt(dx * dx + dz * dz);

    // Shadow on north-facing slopes
    const shadowBlend = Math.max(0, Math.min(1, (dx + 0.8) * 0.4));
    color.r = THREE.MathUtils.lerp(shadowSnow.r, color.r, shadowBlend);
    color.g = THREE.MathUtils.lerp(shadowSnow.g, color.g, shadowBlend);
    color.b = THREE.MathUtils.lerp(shadowSnow.b, color.b, shadowBlend);

    // Icy on steep slopes
    if (slope > 1.8) {
      const iceBlend = Math.min(1, (slope - 1.8) * 0.4);
      color.r = THREE.MathUtils.lerp(color.r, icySnow.r, iceBlend);
      color.g = THREE.MathUtils.lerp(color.g, icySnow.g, iceBlend);
      color.b = THREE.MathUtils.lerp(color.b, icySnow.b, iceBlend);
    }

    // Subtle noise variation
    const variation = this.detailNoise.noise2D(x * 0.08, z * 0.08) * 0.025;
    color.r = Math.max(0, Math.min(1, color.r + variation));
    color.g = Math.max(0, Math.min(1, color.g + variation));
    color.b = Math.max(0, Math.min(1, color.b + variation));

    return color;
  }

  addTrailSigns() {
    const signGroup = new THREE.Group();

    for (const trail of this.trails) {
      // Sign at trail start
      const startPoint = trail.path[0];
      this.createTrailSign(signGroup, trail, startPoint[0], startPoint[1]);

      // Additional signs along the trail
      if (trail.path.length > 3) {
        const midIdx = Math.floor(trail.path.length / 2);
        const midPoint = trail.path[midIdx];
        this.createTrailSign(signGroup, trail, midPoint[0] + 15, midPoint[1]);
      }
    }

    this.sceneManager.add(signGroup);
  }

  createTrailSign(group, trail, x, z) {
    const height = this.calculateHeight(x, z);

    // Sign post
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 3, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, height + 1.5, z);
    post.castShadow = true;
    group.add(post);

    // Sign board
    const signGeo = new THREE.BoxGeometry(1.5, 0.8, 0.1);

    // Difficulty symbol colors
    let signColor;
    switch(trail.difficulty) {
      case 'green': signColor = 0x00aa44; break;
      case 'blue': signColor = 0x0066dd; break;
      case 'black': signColor = 0x111111; break;
      case 'double-black': signColor = 0x111111; break;
      default: signColor = 0x666666;
    }

    // Orange for terrain park
    if (trail.isTerrainPark) signColor = 0xff6600;

    const signMat = new THREE.MeshStandardMaterial({ color: signColor });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(x, height + 2.8, z);
    sign.castShadow = true;
    group.add(sign);

    // Difficulty symbol on sign
    let symbolGeo;
    const symbolMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

    if (trail.difficulty === 'green') {
      symbolGeo = new THREE.CircleGeometry(0.15, 16);
    } else if (trail.difficulty === 'blue') {
      symbolGeo = new THREE.BoxGeometry(0.25, 0.25, 0.02);
    } else if (trail.difficulty === 'black') {
      symbolGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        0, 0.2, 0.06,
        -0.17, -0.1, 0.06,
        0.17, -0.1, 0.06
      ]);
      symbolGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    } else if (trail.difficulty === 'double-black') {
      // Two diamonds
      symbolGeo = new THREE.BoxGeometry(0.15, 0.15, 0.02);
    }

    if (symbolGeo) {
      const symbol = new THREE.Mesh(symbolGeo, symbolMat);
      symbol.position.set(x - 0.4, height + 2.8, z + 0.06);
      if (trail.difficulty === 'blue') {
        symbol.rotation.z = Math.PI / 4; // Diamond orientation
      }
      group.add(symbol);

      // Second diamond for double-black
      if (trail.difficulty === 'double-black') {
        const symbol2 = new THREE.Mesh(symbolGeo.clone(), symbolMat);
        symbol2.position.set(x - 0.15, height + 2.8, z + 0.06);
        symbol2.rotation.z = Math.PI / 4;
        group.add(symbol2);
      }
    }
  }

  addTrailBoundaries() {
    const boundaryGroup = new THREE.Group();

    // Orange boundary poles along trail edges
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xff6600 });

    // Safety netting posts (taller, with "netting")
    const netPostGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
    const netPostMat = new THREE.MeshStandardMaterial({ color: 0xff4400 });

    for (const trail of this.trails) {
      const spline = this.trailSplines[this.trails.indexOf(trail)];

      // Place poles along trail edges
      for (let t = 0; t < 1; t += 0.05) {
        const point = spline.getPoint(t);
        const tangent = spline.getTangent(t);

        // Perpendicular direction
        const perpX = -tangent.y;
        const perpZ = tangent.x;

        // Left boundary
        const leftX = point.x - perpX * trail.width * 0.5;
        const leftZ = point.y - perpZ * trail.width * 0.5;
        const leftHeight = this.calculateHeight(leftX, leftZ);

        const leftPole = new THREE.Mesh(poleGeo, poleMat);
        leftPole.position.set(leftX, leftHeight + 0.75, leftZ);
        boundaryGroup.add(leftPole);

        // Right boundary
        const rightX = point.x + perpX * trail.width * 0.5;
        const rightZ = point.y + perpZ * trail.width * 0.5;
        const rightHeight = this.calculateHeight(rightX, rightZ);

        const rightPole = new THREE.Mesh(poleGeo, poleMat);
        rightPole.position.set(rightX, rightHeight + 0.75, rightZ);
        boundaryGroup.add(rightPole);
      }

      // Safety netting at dangerous spots (trail edges near trees/rocks)
      if (trail.difficulty === 'black' || trail.difficulty === 'double-black') {
        for (let t = 0.2; t < 0.8; t += 0.1) {
          const point = spline.getPoint(t);
          const tangent = spline.getTangent(t);
          const perpX = -tangent.y;
          const perpZ = tangent.x;

          // Net posts on both sides
          for (const side of [-1, 1]) {
            const netX = point.x + perpX * trail.width * 0.6 * side;
            const netZ = point.y + perpZ * trail.width * 0.6 * side;
            const netHeight = this.calculateHeight(netX, netZ);

            const netPost = new THREE.Mesh(netPostGeo, netPostMat);
            netPost.position.set(netX, netHeight + 1.25, netZ);
            boundaryGroup.add(netPost);
          }
        }
      }
    }

    this.sceneManager.add(boundaryGroup);
  }

  addTrees() {
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
    const foliageGeo = new THREE.ConeGeometry(3, 8, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1a3d1a, roughness: 0.8 });

    // Snow-covered foliage variant
    const snowFoliageMat = new THREE.MeshStandardMaterial({ color: 0x2a4d2a, roughness: 0.8 });

    const treeGroup = new THREE.Group();
    const treePositions = [];
    const spacing = 12;

    for (let z = -this.length / 2 + 50; z < this.length / 2 - 50; z += spacing) {
      for (let x = -this.width / 2 + 15; x < this.width / 2 - 15; x += spacing) {
        // Check if on any trail
        const trailInfo = this.getTrailInfo(x, z);
        if (trailInfo.onTrail) continue;

        // Also keep buffer zone around trails
        if (trailInfo.distance < trailInfo.trail?.width * 1.3) continue;

        // Random offset
        const offsetX = (this.terrainNoise.noise2D(x * 0.1, z * 0.1) - 0.5) * spacing * 0.7;
        const offsetZ = (this.terrainNoise.noise2D(x * 0.15, z * 0.15) - 0.5) * spacing * 0.7;

        const treeX = x + offsetX;
        const treeZ = z + offsetZ;

        // Probability
        const prob = this.detailNoise.noise2D(treeX * 0.04, treeZ * 0.04);
        if (prob < 0.15) continue;

        if (Math.abs(treeX) > this.width / 2 - 20) continue;

        const height = this.calculateHeight(treeX, treeZ);
        const normalizedHeight = height / this.peakHeight;
        if (normalizedHeight > 0.9 || normalizedHeight < 0.05) continue;

        treePositions.push({
          x: treeX,
          y: height,
          z: treeZ,
          scale: 0.6 + Math.random() * 0.7,
          snowy: Math.random() > 0.6
        });
      }
    }

    const maxTrees = 600;
    const treesToPlace = treePositions.slice(0, maxTrees);

    for (const pos of treesToPlace) {
      const tree = new THREE.Group();

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.scale.setScalar(pos.scale);
      trunk.position.y = 2 * pos.scale;
      trunk.castShadow = true;
      tree.add(trunk);

      const foliage = new THREE.Mesh(foliageGeo, pos.snowy ? snowFoliageMat : foliageMat);
      foliage.scale.setScalar(pos.scale);
      foliage.position.y = 7 * pos.scale;
      foliage.castShadow = true;
      tree.add(foliage);

      tree.position.set(pos.x, pos.y, pos.z);
      treeGroup.add(tree);
    }

    this.sceneManager.add(treeGroup);
  }

  addRocks() {
    const rockGeo1 = new THREE.DodecahedronGeometry(2, 0);
    const rockGeo2 = new THREE.IcosahedronGeometry(1.5, 0);
    const rockGeos = [rockGeo1, rockGeo2];

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.95,
      metalness: 0.1,
    });

    const rockGroup = new THREE.Group();

    for (let i = 0; i < 150; i++) {
      const x = (Math.random() - 0.5) * this.width * 0.9;
      const z = -this.length / 2 + Math.random() * this.length;

      const trailInfo = this.getTrailInfo(x, z);
      if (trailInfo.onTrail || trailInfo.distance < 20) continue;

      const height = this.calculateHeight(x, z);

      const rock = new THREE.Mesh(
        rockGeos[Math.floor(Math.random() * rockGeos.length)],
        rockMat
      );

      const scale = 0.4 + Math.random() * 1.2;
      rock.scale.setScalar(scale);
      rock.position.set(x, height + scale * 0.3, z);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rock.castShadow = true;
      rockGroup.add(rock);
    }

    this.sceneManager.add(rockGroup);
  }

  addLiftTowers() {
    // Ski lift towers along the side of the mountain
    const towerGroup = new THREE.Group();

    const towerGeo = new THREE.BoxGeometry(0.8, 12, 0.8);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x666666 });

    const crossbarGeo = new THREE.BoxGeometry(4, 0.3, 0.3);

    // Main lift line
    const liftX = -100;
    for (let z = -this.length / 2 + 100; z < this.length / 2 - 100; z += 80) {
      const height = this.calculateHeight(liftX, z);

      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(liftX, height + 6, z);
      tower.castShadow = true;
      towerGroup.add(tower);

      const crossbar = new THREE.Mesh(crossbarGeo, towerMat);
      crossbar.position.set(liftX, height + 11.5, z);
      towerGroup.add(crossbar);
    }

    this.sceneManager.add(towerGroup);
  }

  createPhysicsCollider(geometry) {
    const RAPIER = this.physicsWorld.RAPIER;

    const positions = geometry.attributes.position;
    const vertices = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      vertices[i * 3] = positions.getX(i);
      vertices[i * 3 + 1] = positions.getY(i);
      vertices[i * 3 + 2] = positions.getZ(i);
    }

    const indices = new Uint32Array(geometry.index.array);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    this.body = this.physicsWorld.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.15)
      .setRestitution(0.0);

    this.physicsWorld.createCollider(colliderDesc, this.body);
  }

  getHeightAt(x, z) {
    return this.calculateHeight(x, z);
  }
}
