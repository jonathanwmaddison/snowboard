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

    // Material for trails
    this.material = new THREE.MeshBasicMaterial({
      color: 0x8899aa,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
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

    this.activeTrail.points.push({
      position: position.clone(),
      heading: heading,
      intensity: intensity,
      width: this.trailWidth * (0.7 + intensity * 0.6) // Width varies with intensity
    });

    // Rebuild mesh with new point
    this.rebuildTrailMesh(this.activeTrail);
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

  // Clean up all trails
  dispose() {
    for (const trail of this.trails) {
      if (trail.mesh) {
        this.sceneManager.scene.remove(trail.mesh);
        trail.mesh.geometry.dispose();
        trail.mesh.material.dispose();
      }
    }
    this.trails = [];
    this.activeTrail = null;
    this.material.dispose();
  }
}
