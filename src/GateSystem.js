import * as THREE from 'three';

/**
 * GateSystem - Slalom/GS gate challenge system
 *
 * Creates challenging gate courses that reward precise carving.
 * Gates are placed to encourage rhythm and flow.
 */

export class GateSystem {
  constructor(sceneManager, terrain) {
    this.sceneManager = sceneManager;
    this.terrain = terrain;

    // Gate configuration
    this.gateWidth = 8;           // Width between gate poles
    this.gateSpacing = 25;        // Distance between gates
    this.courseLength = 400;      // Length of course
    this.alternateOffset = 12;    // How far gates alternate left/right

    // Gate state
    this.gates = [];
    this.currentGateIndex = 0;
    this.gatesCleared = 0;
    this.gatesMissed = 0;

    // Timing
    this.courseStartTime = 0;
    this.courseEndTime = 0;
    this.isRunning = false;
    this.bestTime = Infinity;

    // Course types
    this.courseType = 'slalom';   // 'slalom', 'gs', 'freeride'

    // Visual meshes
    this.gateMeshes = [];
    this.gateMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      emissive: 0x331100,
      roughness: 0.6
    });
    this.clearedMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff44,
      emissive: 0x003311,
      roughness: 0.6
    });
    this.missedMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0x330000,
      roughness: 0.6
    });

    // Gate pole geometry (reused)
    this.poleGeometry = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 8);
    this.flagGeometry = new THREE.PlaneGeometry(0.8, 0.5);

    // Callbacks
    this.onGateCleared = null;
    this.onGateMissed = null;
    this.onCourseComplete = null;
  }

  /**
   * Generate a gate course starting at given Z position
   */
  generateCourse(startZ, type = 'slalom') {
    this.clearCourse();
    this.courseType = type;

    // Adjust parameters based on course type
    let spacing, offset, width;
    switch (type) {
      case 'gs':
        spacing = 35;
        offset = 18;
        width = 10;
        break;
      case 'freeride':
        spacing = 45;
        offset = 15;
        width = 12;
        break;
      default: // slalom
        spacing = 25;
        offset = 12;
        width = 8;
    }

    let z = startZ;
    let side = 1;  // Alternates: 1 = right, -1 = left
    let gateIndex = 0;

    while (z < startZ + this.courseLength) {
      const trailCenterX = this.terrain.getTrailCenterX(z);

      // Offset from center based on alternating pattern
      const gateX = trailCenterX + side * offset;

      // Get terrain height at gate position
      const gateY = this.terrain.getHeightAt(gateX, z);

      this.gates.push({
        index: gateIndex,
        x: gateX,
        z: z,
        y: gateY,
        width: width,
        side: side,
        cleared: false,
        missed: false,
        checkZone: { minZ: z - 3, maxZ: z + 3 }  // Detection zone
      });

      // Create visual gate
      this.createGateMesh(gateX, gateY, z, width, side);

      // Alternate sides
      side *= -1;
      z += spacing;
      gateIndex++;
    }

    // Reset state
    this.currentGateIndex = 0;
    this.gatesCleared = 0;
    this.gatesMissed = 0;
    this.isRunning = false;
  }

  /**
   * Create visual mesh for a gate
   */
  createGateMesh(x, y, z, width, side) {
    const group = new THREE.Group();

    // Inner pole (the one you pass close to)
    const innerPole = new THREE.Mesh(this.poleGeometry, this.gateMaterial.clone());
    const innerX = x - side * (width / 2);
    innerPole.position.set(innerX, y + 1.25, z);
    group.add(innerPole);

    // Outer pole
    const outerPole = new THREE.Mesh(this.poleGeometry, this.gateMaterial.clone());
    const outerX = x + side * (width / 2);
    outerPole.position.set(outerX, y + 1.25, z);
    group.add(outerPole);

    // Flag/panel between poles (helps visibility)
    const flagMaterial = new THREE.MeshBasicMaterial({
      color: side > 0 ? 0xff4400 : 0x0044ff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const flag = new THREE.Mesh(this.flagGeometry, flagMaterial);
    flag.position.set(x, y + 2.2, z);
    flag.rotation.y = Math.PI / 2;  // Face downhill
    flag.scale.x = width / 0.8;
    group.add(flag);

    this.sceneManager.add(group);
    this.gateMeshes.push({
      group: group,
      innerPole: innerPole,
      outerPole: outerPole,
      flag: flag
    });
  }

  /**
   * Update gate detection - call each frame
   */
  update(dt, playerPos, playerSpeed) {
    if (this.gates.length === 0) return;

    // Start timing when player enters first gate zone
    if (!this.isRunning && this.currentGateIndex === 0) {
      const firstGate = this.gates[0];
      if (playerPos.z >= firstGate.checkZone.minZ) {
        this.isRunning = true;
        this.courseStartTime = performance.now();
      }
    }

    if (!this.isRunning) return;

    // Check current and next few gates (in case of high speed)
    for (let i = this.currentGateIndex; i < Math.min(this.currentGateIndex + 3, this.gates.length); i++) {
      const gate = this.gates[i];
      if (gate.cleared || gate.missed) continue;

      // Check if player has passed gate Z
      if (playerPos.z >= gate.z) {
        // Check if player passed through the gate
        const gateLeft = gate.x - gate.side * (gate.width / 2);
        const gateRight = gate.x + gate.side * (gate.width / 2);
        const minX = Math.min(gateLeft, gateRight);
        const maxX = Math.max(gateLeft, gateRight);

        if (playerPos.x >= minX && playerPos.x <= maxX) {
          // Cleared!
          this.clearGate(i, playerSpeed);
        } else {
          // Missed!
          this.missGate(i);
        }

        // Move to next gate if this was the current one
        if (i === this.currentGateIndex) {
          this.currentGateIndex++;
        }
      }
    }

    // Check for course completion
    if (this.currentGateIndex >= this.gates.length && this.isRunning) {
      this.completeCourse();
    }
  }

  /**
   * Mark gate as cleared
   */
  clearGate(index, speed) {
    const gate = this.gates[index];
    gate.cleared = true;
    this.gatesCleared++;

    // Update visuals
    const mesh = this.gateMeshes[index];
    if (mesh) {
      mesh.innerPole.material = this.clearedMaterial.clone();
      mesh.outerPole.material = this.clearedMaterial.clone();
      mesh.flag.material.color.setHex(0x00ff44);
    }

    // Calculate bonus based on how close to inner pole
    const innerPoleX = gate.x - gate.side * (gate.width / 2);
    // Speed bonus
    const speedBonus = Math.min(1, speed / 30);

    if (this.onGateCleared) {
      this.onGateCleared({
        index: index,
        speedBonus: speedBonus,
        totalCleared: this.gatesCleared
      });
    }
  }

  /**
   * Mark gate as missed
   */
  missGate(index) {
    const gate = this.gates[index];
    gate.missed = true;
    this.gatesMissed++;

    // Update visuals
    const mesh = this.gateMeshes[index];
    if (mesh) {
      mesh.innerPole.material = this.missedMaterial.clone();
      mesh.outerPole.material = this.missedMaterial.clone();
      mesh.flag.material.color.setHex(0xff0000);
    }

    if (this.onGateMissed) {
      this.onGateMissed({
        index: index,
        totalMissed: this.gatesMissed
      });
    }
  }

  /**
   * Course completed
   */
  completeCourse() {
    this.isRunning = false;
    this.courseEndTime = performance.now();

    const totalTime = (this.courseEndTime - this.courseStartTime) / 1000;
    const isPerfect = this.gatesMissed === 0;
    const isNewBest = totalTime < this.bestTime && isPerfect;

    if (isNewBest) {
      this.bestTime = totalTime;
    }

    if (this.onCourseComplete) {
      this.onCourseComplete({
        time: totalTime,
        cleared: this.gatesCleared,
        missed: this.gatesMissed,
        totalGates: this.gates.length,
        isPerfect: isPerfect,
        isNewBest: isNewBest,
        bestTime: this.bestTime
      });
    }
  }

  /**
   * Get current course state
   */
  getState() {
    const elapsedTime = this.isRunning ?
      (performance.now() - this.courseStartTime) / 1000 : 0;

    return {
      isRunning: this.isRunning,
      currentGate: this.currentGateIndex,
      totalGates: this.gates.length,
      gatesCleared: this.gatesCleared,
      gatesMissed: this.gatesMissed,
      elapsedTime: elapsedTime,
      bestTime: this.bestTime === Infinity ? null : this.bestTime,
      courseType: this.courseType,
      // Next gate info for UI
      nextGate: this.currentGateIndex < this.gates.length ?
        this.gates[this.currentGateIndex] : null
    };
  }

  /**
   * Get next gate position for UI indicator
   */
  getNextGatePosition() {
    if (this.currentGateIndex >= this.gates.length) return null;
    const gate = this.gates[this.currentGateIndex];
    return new THREE.Vector3(gate.x, gate.y + 1.5, gate.z);
  }

  /**
   * Reset course (keep gates, reset progress)
   */
  resetCourse() {
    this.currentGateIndex = 0;
    this.gatesCleared = 0;
    this.gatesMissed = 0;
    this.isRunning = false;
    this.courseStartTime = 0;

    // Reset gate states and visuals
    for (let i = 0; i < this.gates.length; i++) {
      this.gates[i].cleared = false;
      this.gates[i].missed = false;

      const mesh = this.gateMeshes[i];
      if (mesh) {
        mesh.innerPole.material = this.gateMaterial.clone();
        mesh.outerPole.material = this.gateMaterial.clone();
        const gate = this.gates[i];
        mesh.flag.material.color.setHex(gate.side > 0 ? 0xff4400 : 0x0044ff);
      }
    }
  }

  /**
   * Clear all gates
   */
  clearCourse() {
    for (const mesh of this.gateMeshes) {
      this.sceneManager.scene.remove(mesh.group);
      mesh.innerPole.geometry.dispose();
      mesh.innerPole.material.dispose();
      mesh.outerPole.geometry.dispose();
      mesh.outerPole.material.dispose();
      mesh.flag.geometry.dispose();
      mesh.flag.material.dispose();
    }
    this.gates = [];
    this.gateMeshes = [];
    this.currentGateIndex = 0;
    this.gatesCleared = 0;
    this.gatesMissed = 0;
    this.isRunning = false;
  }

  dispose() {
    this.clearCourse();
    this.poleGeometry.dispose();
    this.flagGeometry.dispose();
    this.gateMaterial.dispose();
    this.clearedMaterial.dispose();
    this.missedMaterial.dispose();
  }
}
