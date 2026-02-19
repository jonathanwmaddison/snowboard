import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

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
    this.renderer.toneMappingExposure = 1.0;

    // Enable shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    document.body.appendChild(this.renderer.domElement);

    // Lighting setup
    this.setupLighting();

    // Post-processing
    this.composer = null;
    this.bloomPass = null;
    this.vignettePass = null;
    this.postProcessingEnabled = true;

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

    // Add sun disc
    this.addSunDisc();
  }

  addSunDisc() {
    // Sun position (matches directional light)
    const sunDirection = new THREE.Vector3(200, 400, -300).normalize();

    // Sun disc - bright glowing sphere
    const sunGeo = new THREE.CircleGeometry(80, 32);
    const sunMat = new THREE.ShaderMaterial({
      uniforms: {
        sunColor: { value: new THREE.Color(0xfffaf0) },
        glowColor: { value: new THREE.Color(0xffdd88) },
        glowIntensity: { value: 1.5 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunColor;
        uniform vec3 glowColor;
        uniform float glowIntensity;
        varying vec2 vUv;
        void main() {
          vec2 center = vec2(0.5);
          float dist = length(vUv - center);

          // Core sun - bright white center
          float core = smoothstep(0.5, 0.0, dist);

          // Soft glow around sun
          float glow = smoothstep(0.5, 0.2, dist) * 0.6;

          // Combine
          vec3 color = mix(glowColor, sunColor, core);
          float alpha = (core + glow) * glowIntensity;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    this.sunDisc = new THREE.Mesh(sunGeo, sunMat);
    this.sunDisc.position.copy(sunDirection.multiplyScalar(1800));
    this.sunDisc.lookAt(0, 0, 0);
    this.scene.add(this.sunDisc);

    // Sun lens flare / god rays effect (simple glow plane)
    const flareGeo = new THREE.PlaneGeometry(400, 400);
    const flareMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;
        void main() {
          vec2 center = vec2(0.5);
          float dist = length(vUv - center);

          // Soft radial glow
          float glow = smoothstep(0.5, 0.0, dist) * 0.15;

          // Animated rays
          float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
          float rays = sin(angle * 12.0 + time * 0.5) * 0.5 + 0.5;
          rays = pow(rays, 3.0) * smoothstep(0.5, 0.1, dist) * 0.08;

          vec3 color = vec3(1.0, 0.95, 0.8);
          float alpha = glow + rays;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    this.sunFlare = new THREE.Mesh(flareGeo, flareMat);
    this.sunFlare.position.copy(this.sunDisc.position);
    this.sunFlare.lookAt(0, 0, 0);
    this.scene.add(this.sunFlare);
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

    // Update composer size
    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }

  /**
   * Setup post-processing effects
   */
  setupPostProcessing(camera) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Create effect composer
    this.composer = new EffectComposer(this.renderer);

    // Render pass - renders the scene
    const renderPass = new RenderPass(this.scene, camera);
    this.composer.addPass(renderPass);

    // Bloom pass - subtle glow on bright areas
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.12,  // strength - restrained
      0.35,  // radius - tighter spread
      0.93   // threshold - only the brightest highlights
    );
    this.composer.addPass(this.bloomPass);

    // Custom vignette + color grading pass
    const VignetteShader = {
      uniforms: {
        tDiffuse: { value: null },
        vignetteIntensity: { value: 0.35 },
        vignetteSoftness: { value: 0.5 },
        saturation: { value: 1.1 },
        contrast: { value: 1.05 },
        brightness: { value: 0.02 },
        colorTint: { value: new THREE.Color(0xfff8f0) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float vignetteIntensity;
        uniform float vignetteSoftness;
        uniform float saturation;
        uniform float contrast;
        uniform float brightness;
        uniform vec3 colorTint;
        varying vec2 vUv;

        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          vec3 color = texel.rgb;

          // Brightness
          color += brightness;

          // Contrast
          color = (color - 0.5) * contrast + 0.5;

          // Saturation
          float gray = dot(color, vec3(0.299, 0.587, 0.114));
          color = mix(vec3(gray), color, saturation);

          // Subtle warm color tint
          color *= colorTint;

          // Vignette
          vec2 center = vUv - 0.5;
          float dist = length(center);
          float vignette = smoothstep(0.5, 0.5 - vignetteSoftness, dist);
          vignette = mix(1.0 - vignetteIntensity, 1.0, vignette);
          color *= vignette;

          gl_FragColor = vec4(color, texel.a);
        }
      `
    };

    this.vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignettePass);

    console.log('Post-processing enabled');
  }

  /**
   * Update post-processing for camera changes
   */
  updatePostProcessing(camera) {
    if (this.composer && this.composer.passes[0]) {
      this.composer.passes[0].camera = camera;
    }
  }

  /**
   * Set bloom intensity (for speed effects)
   */
  setBloomIntensity(intensity) {
    if (this.bloomPass) {
      this.bloomPass.strength = 0.08 + intensity * 0.18;
    }
  }

  /**
   * Update sun flare animation
   */
  updateSunFlare(time) {
    if (this.sunFlare && this.sunFlare.material.uniforms) {
      this.sunFlare.material.uniforms.time.value = time;
    }
  }

  render(camera) {
    // Update sun flare animation
    this.updateSunFlare(performance.now() / 1000);

    // Use composer if available, otherwise direct render
    if (this.postProcessingEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, camera);
    }
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
