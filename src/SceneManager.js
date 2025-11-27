import * as THREE from 'three';

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
    this.scene.fog = new THREE.Fog(0x87ceeb, 100, 500);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false; // Disabled for MVP performance
    document.body.appendChild(this.renderer.domElement);

    // Lighting - single directional light as per spec
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    this.scene.add(directionalLight);

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    // Debug state
    this.wireframeEnabled = false;
    this.collidersVisible = false;
    this.colliderMeshes = [];
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }

  add(object) {
    this.scene.add(object);
  }

  remove(object) {
    this.scene.remove(object);
  }

  toggleWireframe(enabled) {
    this.wireframeEnabled = enabled;
    this.scene.traverse((child) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.wireframe = enabled);
        } else {
          child.material.wireframe = enabled;
        }
      }
    });
  }

  addColliderMesh(mesh) {
    mesh.visible = this.collidersVisible;
    this.colliderMeshes.push(mesh);
    this.scene.add(mesh);
  }

  toggleColliders(visible) {
    this.collidersVisible = visible;
    this.colliderMeshes.forEach(mesh => {
      mesh.visible = visible;
    });
  }
}
