Below is a **tight, no-nonsense MVP spec** for a **browser-based 3D snowboarding prototype**. It’s written to help you validate *physics, controls, and feel*, not content or art polish.

---

# **MVP Specification — 3D Snowboarding Physics Prototype (Browser)**

**Version:** 0.1
**Goal:** Validate core movement physics, slope interactions, and camera feel for a future snowboarding game.
**Target Platform:** Modern desktop browsers (Chrome, Firefox, Safari).
**Tech:** WebGL / WebGPU via **Three.js** or **Babylon.js**; physics via **Cannon.js**, **Rapier**, or **Ammo.js**.

---

## **1. Core MVP Objectives**

1. **Get a board sliding on a slope with convincing physics.**
2. **Enable player steering, speed control, and edge control.**
3. **Demonstrate stable camera behavior while going fast downhill.**
4. **Run at 60fps on mid-range laptops.**
5. **No art polish required beyond placeholder assets.**

---

## **2. Required Features**

### **2.1 Terrain**

* One continuous slope:

  * Length ~300–500m; width ~50m.
  * Variations: gentle, medium, steep.
* Simple mesh, low poly.
* One optional “debug view” to show surface normals.
* No trees, obstacles, or textures beyond a flat color.

### **2.2 Player / Board Model**

* Capsule or rectangular board collider.
* Visual mesh optional; simple block OK.
* Board follows physics body orientation.

### **2.3 Movement System**

**Core physics behaviors to prototype:**

* Gravity + friction + drag.
* Slope alignment (board should naturally align to terrain).
* Edge control:

  * Slight tilt increases turning.
  * Flat board = straight, faster speed.
* Carving:

  * Turning radius influenced by speed and tilt.
* Speed handling:

  * Natural acceleration downhill.
  * Speed cap at high slope angles.

**Controls (keyboard/gamepad for MVP):**

* **A/D or left stick:** steer left/right (edge pressure).
* **W/S:** lean forward/back for speed control.
* **Space:** jump (simple vertical impulse).

No trick system.

### **2.4 Camera**

* Third-person following camera:

  * Offset behind and above board.
  * Smooth dampening (lerp).
  * Auto-rotate to match downhill direction.
* Debug toggle to switch to free camera.

### **2.5 Simple UI**

* Speed (km/h or m/s).
* FPS display.
* Restart button.

---

## **3. Performance Requirements**

* 60 FPS target.
* Terrain LOD is optional but nice.
* Disable shadows in MVP.
* Only one light source (directional).

---

## **4. Architecture**

### **4.1 Recommended Stack**

* Rendering: **Three.js**
* Physics: **Rapier.js** (fastest + stable on the web)
* State mgmt: local classes, no framework.
* Build: Vite or ESBuild.

### **4.2 Modules**

* `SceneManager`
* `PhysicsWorld`
* `PlayerController` (inputs → board forces)
* `CameraController`
* `TerrainGenerator`
* `UIOverlay`

### **4.3 Code Hooks**

* **Fixed time step physics** (e.g., 60Hz).
* **Render loop** with delta smoothing.

---

## **5. Debug Tools**

* Press `1`: toggle wireframe.
* Press `2`: show collider shapes.
* Press `R`: restart player at top of slope.
* Optional: freeze physics and drag player around.

---

## **6. Non-Goals (Not in MVP)**

* Characters, animation, tricks.
* Particle FX like snow spray.
* Sound.
* Level design.
* Multiplayer.
* Mobile support.

---

## **7. Acceptance Criteria**

Prototype is considered successful when:

1. The board:

   * Slides downhill correctly
   * Carves smooth arcs at high speed
   * Feels stable at 15–60 mph
2. Inputs feel responsive and predictable.
3. Camera remains comfortable at speed.
4. No physics jitter at >120fps or on slopes.

---

## **8. Future Extensions (Post-MVP)**

* Terrain sculpting tool.
* Obstacles / rails.
* Trick system.
* Procedural snow deformation.
* Snow particle spray.
* Full character model + animation blending.

---

If you want, I can also generate:

* a **folder structure**,
* sample **Three.js + Rapier** starter code,
* a **product roadmap**,
* or a **pitch deck** for this game idea.
