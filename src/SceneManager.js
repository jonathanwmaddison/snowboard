import * as THREE from 'three';

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();

    // Create gradient sky
    this.createSky();

    // Enhanced fog for mountain atmosphere
    this.scene.fog = new THREE.FogExp2(0xc4d4e8, 0.0008);

    // Renderer with enhanced settings
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Enable shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    document.body.appendChild(this.renderer.domElement);

    // Lighting setup
    this.setupLighting();

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    // Debug state
    this.wireframeEnabled = false;
    this.collidersVisible = false;
    this.colliderMeshes = [];
  }

  createSky() {
    // Create a large sphere for the sky dome
    const skyGeo = new THREE.SphereGeometry(2000, 32, 32);

    // Shader material for gradient sky
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0066cc) },
        bottomColor: { value: new THREE.Color(0xc4d4e8) },
        offset: { value: 20 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // Add distant mountains silhouette
    this.addDistantMountains();
  }

  addDistantMountains() {
    // Create silhouette mountains in the distance
    const mountainGeo = new THREE.BufferGeometry();
    const positions = [];
    const baseY = -200;

    // Create jagged mountain profile
    const numPeaks = 20;
    const width = 4000;
    const depth = -1500;

    for (let i = 0; i <= numPeaks; i++) {
      const x = (i / numPeaks - 0.5) * width;
      const peakHeight = 200 + Math.random() * 400;

      // Add triangle for each peak
      if (i > 0) {
        const prevX = ((i - 1) / numPeaks - 0.5) * width;
        const prevHeight = 200 + Math.sin(i * 1.5) * 150 + Math.random() * 200;

        // Triangle base
        positions.push(prevX, baseY, depth);
        positions.push(x, baseY, depth);
        positions.push((prevX + x) / 2, baseY + peakHeight, depth);
      }
    }

    mountainGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    mountainGeo.computeVertexNormals();

    const mountainMat = new THREE.MeshBasicMaterial({
      color: 0x6688aa,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });

    const mountains = new THREE.Mesh(mountainGeo, mountainMat);
    this.scene.add(mountains);
  }

  setupLighting() {
    // Hemisphere light for natural sky/ground ambient
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0xffffff, 0.6);
    hemiLight.position.set(0, 500, 0);
    this.scene.add(hemiLight);

    // Main directional light (sun) with shadows
    this.sunLight = new THREE.DirectionalLight(0xfffaf0, 1.5);
    this.sunLight.position.set(200, 400, -300);
    this.sunLight.castShadow = true;

    // Shadow camera setup for large terrain
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 1500;
    this.sunLight.shadow.camera.left = -400;
    this.sunLight.shadow.camera.right = 400;
    this.sunLight.shadow.camera.top = 400;
    this.sunLight.shadow.camera.bottom = -400;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;

    this.scene.add(this.sunLight);

    // Secondary fill light (bounce light from snow)
    const fillLight = new THREE.DirectionalLight(0xc4d4ff, 0.4);
    fillLight.position.set(-100, 50, 100);
    this.scene.add(fillLight);

    // Subtle rim light for depth
    const rimLight = new THREE.DirectionalLight(0xffeecc, 0.3);
    rimLight.position.set(0, 100, 500);
    this.scene.add(rimLight);
  }

  updateShadowCamera(playerPosition) {
    // Move shadow camera to follow player for better shadow quality
    if (this.sunLight && playerPosition) {
      const offset = new THREE.Vector3(200, 400, -300);
      this.sunLight.position.copy(playerPosition).add(offset);
      this.sunLight.target.position.copy(playerPosition);
      this.sunLight.target.updateMatrixWorld();
    }
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
