import * as THREE from 'three';

export class CarveMarks {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;

    // Trail configuration
    this.maxPoints = 500;        // Max points per trail
    this.maxTrails = 20;         // Max concurrent trails
    this.minEdgeAngle = 0.25;    // Minimum edge angle to leave marks (~14 degrees)
    this.minSpeed = 3;           // Minimum speed to leave marks

    // Trail storage
    this.trails = [];            // Array of trail objects
    this.activeTrail = null;     // Currently being drawn
    this.lastPosition = new THREE.Vector3();
    this.pointSpacing = 0.3;     // Minimum distance between points

    // Visual settings
    this.trailWidth = 0.15;      // Width of carve mark
    this.trailLifetime = 15;     // Seconds before fade starts
    this.fadeDuration = 5;       // Seconds to fully fade

    // === QUALITY-BASED COLORS ===
    // Trails change color based on carve quality
    this.colors = {
      poor: new THREE.Color(0x667788),      // Gray-blue - skidded/weak
      decent: new THREE.Color(0x8899aa),    // Light blue - okay carve
      good: new THREE.Color(0x88bbdd),      // Brighter blue - good carve
      great: new THREE.Color(0x99ddff),     // Cyan - great carve
      perfect: new THREE.Color(0xaaffff),   // Bright cyan - perfect carve
    };

    // === GHOST LINE SYSTEM ===
    this.ghostTrails = [];       // Best run trails (semi-transparent)
    this.recordingGhost = false;
    this.ghostOpacity = 0.25;

    // Material for trails (will be cloned with vertex colors)
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Ghost material
    this.ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0xffdd88,
      transparent: true,
      opacity: this.ghostOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Current carve quality (set externally by CarveAnalyzer)
    this.currentCarveQuality = 0.5;
    this.currentPhase = 'neutral';
  }

  // Called each frame from PlayerController
  update(dt, position, heading, edgeAngle, speed, isGrounded) {
    // Update existing trails (fade out old ones)
    this.updateTrails(dt);

    // Check if we should be carving
    const isCarving = isGrounded &&
                      Math.abs(edgeAngle) > this.minEdgeAngle &&
                      speed > this.minSpeed;

    if (isCarving) {
      // Calculate edge position (where the edge contacts snow)
      const edgeSide = Math.sign(edgeAngle);
      const edgeOffset = edgeSide * this.trailWidth * 0.5;

      // Board perpendicular direction
      const perpX = Math.cos(heading);
      const perpZ = Math.sin(heading);

      const edgePosition = new THREE.Vector3(
        position.x + perpX * edgeOffset,
        position.y - 0.05, // Slightly below board
        position.z + perpZ * edgeOffset
      );

      // Calculate carve intensity (affects width and opacity)
      const intensity = Math.min(1, (Math.abs(edgeAngle) - this.minEdgeAngle) * 2);
      const speedFactor = Math.min(1, speed / 20);
      const carveIntensity = intensity * (0.5 + speedFactor * 0.5);

      // Check if we should add a new point
      const distFromLast = edgePosition.distanceTo(this.lastPosition);

      if (distFromLast > this.pointSpacing) {
        if (!this.activeTrail) {
          // Start new trail
          this.startNewTrail(edgeSide);
        }

        this.addPoint(edgePosition, heading, carveIntensity, edgeSide);
        this.lastPosition.copy(edgePosition);
      }
    } else {
      // Not carving - end active trail
      if (this.activeTrail) {
        this.endTrail();
      }
    }
  }

  startNewTrail(edgeSide) {
    // Remove oldest trail if at max
    if (this.trails.length >= this.maxTrails) {
      const oldTrail = this.trails.shift();
      if (oldTrail.mesh) {
        this.sceneManager.scene.remove(oldTrail.mesh);
        oldTrail.mesh.geometry.dispose();
      }
    }

    this.activeTrail = {
      points: [],
      edgeSide: edgeSide,
      mesh: null,
      geometry: null,
      age: 0,
      fading: false
    };

    this.trails.push(this.activeTrail);
  }

  addPoint(position, heading, intensity, edgeSide) {
    if (!this.activeTrail) return;

    // Don't exceed max points
    if (this.activeTrail.points.length >= this.maxPoints) {
      this.endTrail();
      this.startNewTrail(edgeSide);
    }

    // Get color based on current carve quality
    const color = this.getQualityColor(this.currentCarveQuality);

    this.activeTrail.points.push({
      position: position.clone(),
      heading: heading,
      intensity: intensity,
      quality: this.currentCarveQuality,
      phase: this.currentPhase,
      color: color.clone(),
      width: this.trailWidth * (0.7 + intensity * 0.6) // Width varies with intensity
    });

    // Rebuild mesh with new point
    this.rebuildTrailMesh(this.activeTrail);
  }

  /**
   * Get color based on carve quality (0-1)
   */
  getQualityColor(quality) {
    if (quality >= 0.9) return this.colors.perfect;
    if (quality >= 0.75) return this.colors.great;
    if (quality >= 0.6) return this.colors.good;
    if (quality >= 0.4) return this.colors.decent;
    return this.colors.poor;
  }

  /**
   * Set current carve quality (called from game loop with CarveAnalyzer data)
   */
  setCarveQuality(quality, phase) {
    this.currentCarveQuality = quality;
    this.currentPhase = phase;
  }

  rebuildTrailMesh(trail) {
    if (trail.points.length < 2) return;

    // Remove old mesh
    if (trail.mesh) {
      this.sceneManager.scene.remove(trail.mesh);
      trail.mesh.geometry.dispose();
    }

    // Build ribbon geometry
    const points = trail.points;
    const vertices = [];
    const colors = [];
    const indices = [];
    const uvs = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      // Calculate perpendicular direction
      let perpX, perpZ;
      if (i < points.length - 1) {
        // Direction to next point
        const next = points[i + 1];
        const dx = next.position.x - p.position.x;
        const dz = next.position.z - p.position.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        perpX = -dz / len;
        perpZ = dx / len;
      } else {
        // Use heading for last point
        perpX = Math.cos(p.heading);
        perpZ = Math.sin(p.heading);
      }

      // Two vertices per point (left and right edge of ribbon)
      const halfWidth = p.width * 0.5;

      vertices.push(
        p.position.x + perpX * halfWidth,
        p.position.y,
        p.position.z + perpZ * halfWidth,

        p.position.x - perpX * halfWidth,
        p.position.y,
        p.position.z - perpZ * halfWidth
      );

      // Vertex colors based on quality
      const color = p.color || this.colors.decent;
      colors.push(color.r, color.g, color.b);
      colors.push(color.r, color.g, color.b);

      // UVs for potential texture
      const v = i / (points.length - 1);
      uvs.push(0, v, 1, v);

      // Indices (two triangles per segment)
      if (i < points.length - 1) {
        const base = i * 2;
        indices.push(
          base, base + 1, base + 2,
          base + 1, base + 3, base + 2
        );
      }
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    trail.geometry = geometry;
    trail.mesh = new THREE.Mesh(geometry, this.material.clone());
    trail.mesh.renderOrder = -1; // Render behind other objects

    this.sceneManager.scene.add(trail.mesh);
  }

  endTrail() {
    if (this.activeTrail && this.activeTrail.points.length >= 2) {
      // Trail will now age and fade
      this.activeTrail.fading = false;
    }
    this.activeTrail = null;
  }

  updateTrails(dt) {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const trail = this.trails[i];

      // Don't age the active trail
      if (trail === this.activeTrail) continue;

      trail.age += dt;

      // Start fading after lifetime
      if (trail.age > this.trailLifetime) {
        trail.fading = true;
        const fadeProgress = (trail.age - this.trailLifetime) / this.fadeDuration;

        if (fadeProgress >= 1) {
          // Fully faded - remove
          if (trail.mesh) {
            this.sceneManager.scene.remove(trail.mesh);
            trail.mesh.geometry.dispose();
            trail.mesh.material.dispose();
          }
          this.trails.splice(i, 1);
        } else if (trail.mesh) {
          // Fade opacity
          trail.mesh.material.opacity = 0.6 * (1 - fadeProgress);
        }
      }
    }
  }

  // === GHOST LINE SYSTEM ===

  /**
   * Save current trails as ghost (best run)
   */
  saveAsGhost() {
    // Clear old ghost
    this.clearGhost();

    // Copy all current trails as ghost
    for (const trail of this.trails) {
      if (trail.points.length >= 2) {
        const ghostTrail = {
          points: trail.points.map(p => ({
            position: p.position.clone(),
            heading: p.heading,
            width: p.width * 0.8, // Slightly thinner
            color: new THREE.Color(0xffdd88) // Golden ghost color
          })),
          mesh: null
        };

        // Build ghost mesh
        this.buildGhostMesh(ghostTrail);
        this.ghostTrails.push(ghostTrail);
      }
    }
  }

  /**
   * Build mesh for ghost trail
   */
  buildGhostMesh(ghostTrail) {
    const points = ghostTrail.points;
    const vertices = [];
    const indices = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      let perpX, perpZ;
      if (i < points.length - 1) {
        const next = points[i + 1];
        const dx = next.position.x - p.position.x;
        const dz = next.position.z - p.position.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        perpX = -dz / len;
        perpZ = dx / len;
      } else {
        perpX = Math.cos(p.heading);
        perpZ = Math.sin(p.heading);
      }

      const halfWidth = p.width * 0.5;

      vertices.push(
        p.position.x + perpX * halfWidth,
        p.position.y + 0.02, // Slightly above ground
        p.position.z + perpZ * halfWidth,
        p.position.x - perpX * halfWidth,
        p.position.y + 0.02,
        p.position.z - perpZ * halfWidth
      );

      if (i < points.length - 1) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);

    ghostTrail.mesh = new THREE.Mesh(geometry, this.ghostMaterial.clone());
    ghostTrail.mesh.renderOrder = -2; // Behind regular trails

    this.sceneManager.scene.add(ghostTrail.mesh);
  }

  /**
   * Clear ghost trails
   */
  clearGhost() {
    for (const ghost of this.ghostTrails) {
      if (ghost.mesh) {
        this.sceneManager.scene.remove(ghost.mesh);
        ghost.mesh.geometry.dispose();
        ghost.mesh.material.dispose();
      }
    }
    this.ghostTrails = [];
  }

  /**
   * Toggle ghost visibility
   */
  setGhostVisible(visible) {
    for (const ghost of this.ghostTrails) {
      if (ghost.mesh) {
        ghost.mesh.visible = visible;
      }
    }
  }

  // Clean up all trails
  dispose() {
    for (const trail of this.trails) {
      if (trail.mesh) {
        this.sceneManager.scene.remove(trail.mesh);
        trail.mesh.geometry.dispose();
        trail.mesh.material.dispose();
      }
    }
    this.clearGhost();
    this.trails = [];
    this.activeTrail = null;
    this.material.dispose();
  }
}
