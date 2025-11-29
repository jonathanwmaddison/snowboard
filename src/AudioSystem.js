/**
 * AudioSystem - Procedural audio feedback for carving
 *
 * Uses Web Audio API to generate dynamic sounds that respond to carve state.
 * The philosophy: audio should be subtle, satisfying, and never annoying.
 *
 * Sound elements:
 * - Edge cutting sound (filtered noise, pitch varies with speed/edge angle)
 * - Spray sound (soft white noise when carving deep)
 * - Transition "pop" (subtle click on edge changes)
 * - Flow state ambience (subtle tone that rises with flow level)
 */

export class AudioSystem {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.initialized = false;
    this.enabled = true;

    // Sound nodes
    this.edgeNoiseNode = null;
    this.edgeFilterNode = null;
    this.edgeGainNode = null;

    this.sprayNoiseNode = null;
    this.sprayFilterNode = null;
    this.sprayGainNode = null;

    this.flowOscNode = null;
    this.flowGainNode = null;

    // State tracking
    this.currentEdgeAngle = 0;
    this.currentSpeed = 0;
    this.currentFlowLevel = 0;
    this.isGrounded = false;

    // Wind sound
    this.windNoiseNode = null;
    this.windFilterNode = null;
    this.windGainNode = null;
  }

  /**
   * Initialize audio context (must be called on user interaction)
   */
  async init() {
    if (this.initialized) return;

    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();

      // Master volume
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.3; // Start quiet
      this.masterGain.connect(this.context.destination);

      // Create sound generators
      this.createEdgeSound();
      this.createSpraySound();
      this.createFlowAmbience();
      this.createWindSound();

      this.initialized = true;
      console.log('Audio system initialized');
    } catch (e) {
      console.warn('Audio system failed to initialize:', e);
    }
  }

  /**
   * Edge cutting sound - filtered noise that responds to carve depth
   */
  createEdgeSound() {
    // Create noise buffer
    const bufferSize = this.context.sampleRate * 2;
    const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // Pink-ish noise (less harsh than white)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    // Noise source (looping)
    this.edgeNoiseNode = this.context.createBufferSource();
    this.edgeNoiseNode.buffer = noiseBuffer;
    this.edgeNoiseNode.loop = true;

    // Bandpass filter - frequency shifts with edge angle
    this.edgeFilterNode = this.context.createBiquadFilter();
    this.edgeFilterNode.type = 'bandpass';
    this.edgeFilterNode.frequency.value = 800;
    this.edgeFilterNode.Q.value = 1.5;

    // Gain control
    this.edgeGainNode = this.context.createGain();
    this.edgeGainNode.gain.value = 0;

    // Connect: noise -> filter -> gain -> master
    this.edgeNoiseNode.connect(this.edgeFilterNode);
    this.edgeFilterNode.connect(this.edgeGainNode);
    this.edgeGainNode.connect(this.masterGain);

    this.edgeNoiseNode.start();
  }

  /**
   * Spray sound - soft whoosh during deep carves
   */
  createSpraySound() {
    const bufferSize = this.context.sampleRate * 2;
    const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // Very soft white noise
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.5;
    }

    this.sprayNoiseNode = this.context.createBufferSource();
    this.sprayNoiseNode.buffer = noiseBuffer;
    this.sprayNoiseNode.loop = true;

    // High-pass filter for airy sound
    this.sprayFilterNode = this.context.createBiquadFilter();
    this.sprayFilterNode.type = 'highpass';
    this.sprayFilterNode.frequency.value = 2000;
    this.sprayFilterNode.Q.value = 0.7;

    this.sprayGainNode = this.context.createGain();
    this.sprayGainNode.gain.value = 0;

    this.sprayNoiseNode.connect(this.sprayFilterNode);
    this.sprayFilterNode.connect(this.sprayGainNode);
    this.sprayGainNode.connect(this.masterGain);

    this.sprayNoiseNode.start();
  }

  /**
   * Flow ambience - subtle harmonic that rises with flow state
   */
  createFlowAmbience() {
    // Low sine wave - like a distant hum
    this.flowOscNode = this.context.createOscillator();
    this.flowOscNode.type = 'sine';
    this.flowOscNode.frequency.value = 110; // Low A

    this.flowGainNode = this.context.createGain();
    this.flowGainNode.gain.value = 0;

    // Add slight reverb feel with delay
    const delay = this.context.createDelay();
    delay.delayTime.value = 0.1;
    const feedback = this.context.createGain();
    feedback.gain.value = 0.3;

    this.flowOscNode.connect(this.flowGainNode);
    this.flowGainNode.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    this.flowGainNode.connect(this.masterGain);
    delay.connect(this.masterGain);

    this.flowOscNode.start();
  }

  /**
   * Wind sound - ambient noise based on speed
   */
  createWindSound() {
    const bufferSize = this.context.sampleRate * 2;
    const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // Brownian noise (very smooth)
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    this.windNoiseNode = this.context.createBufferSource();
    this.windNoiseNode.buffer = noiseBuffer;
    this.windNoiseNode.loop = true;

    this.windFilterNode = this.context.createBiquadFilter();
    this.windFilterNode.type = 'lowpass';
    this.windFilterNode.frequency.value = 400;
    this.windFilterNode.Q.value = 0.5;

    this.windGainNode = this.context.createGain();
    this.windGainNode.gain.value = 0;

    this.windNoiseNode.connect(this.windFilterNode);
    this.windFilterNode.connect(this.windGainNode);
    this.windGainNode.connect(this.masterGain);

    this.windNoiseNode.start();
  }

  /**
   * Play transition "pop" sound
   */
  playTransitionPop(intensity = 0.5) {
    if (!this.initialized || !this.enabled) return;

    // Quick filtered click
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.value = 200 + intensity * 300;

    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 2;

    gain.gain.setValueAtTime(0.15 * intensity, this.context.currentTime);
    gain.gain.exponentialDecayTo = 0.001;
    gain.gain.setTargetAtTime(0.001, this.context.currentTime, 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.context.currentTime + 0.15);
  }

  /**
   * Play terrain sync bonus sound
   */
  playTerrainSync() {
    if (!this.initialized || !this.enabled) return;

    // Pleasant harmonic "ding"
    const osc1 = this.context.createOscillator();
    const osc2 = this.context.createOscillator();
    const gain = this.context.createGain();

    osc1.type = 'sine';
    osc1.frequency.value = 440; // A4

    osc2.type = 'sine';
    osc2.frequency.value = 554.37; // C#5 (major third)

    gain.gain.setValueAtTime(0.1, this.context.currentTime);
    gain.gain.setTargetAtTime(0.001, this.context.currentTime, 0.3);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start();
    osc2.start();
    osc1.stop(this.context.currentTime + 0.5);
    osc2.stop(this.context.currentTime + 0.5);
  }

  /**
   * Update audio state based on game state
   */
  update(dt, state) {
    if (!this.initialized || !this.enabled) return;

    const {
      edgeAngle,
      speed,
      isGrounded,
      carveRailStrength,
      flowLevel,
      transitioned,
      terrainSync
    } = state;

    const absEdge = Math.abs(edgeAngle);
    const time = this.context.currentTime;

    // === EDGE CUTTING SOUND ===
    if (isGrounded && absEdge > 0.2 && speed > 3) {
      // Frequency rises with edge angle
      const targetFreq = 500 + absEdge * 800 + speed * 10;
      this.edgeFilterNode.frequency.setTargetAtTime(targetFreq, time, 0.1);

      // Volume based on edge depth and speed
      const targetGain = Math.min(0.3, absEdge * 0.3 * (speed / 20));
      this.edgeGainNode.gain.setTargetAtTime(targetGain, time, 0.05);
    } else {
      this.edgeGainNode.gain.setTargetAtTime(0, time, 0.1);
    }

    // === SPRAY SOUND ===
    if (isGrounded && carveRailStrength > 0.3 && speed > 8) {
      // More spray during deep carves
      const sprayIntensity = carveRailStrength * (speed / 25) * 0.15;
      this.sprayGainNode.gain.setTargetAtTime(sprayIntensity, time, 0.05);
      this.sprayFilterNode.frequency.setTargetAtTime(1500 + speed * 50, time, 0.1);
    } else {
      this.sprayGainNode.gain.setTargetAtTime(0, time, 0.15);
    }

    // === WIND SOUND ===
    const windIntensity = Math.min(0.2, speed / 50);
    this.windGainNode.gain.setTargetAtTime(windIntensity, time, 0.2);
    this.windFilterNode.frequency.setTargetAtTime(200 + speed * 15, time, 0.1);

    // === FLOW AMBIENCE ===
    if (flowLevel > 0.3) {
      // Harmonic rises with flow
      const flowIntensity = (flowLevel - 0.3) * 0.15;
      this.flowGainNode.gain.setTargetAtTime(flowIntensity, time, 0.5);
      // Pitch rises slightly
      this.flowOscNode.frequency.setTargetAtTime(110 + flowLevel * 30, time, 0.5);
    } else {
      this.flowGainNode.gain.setTargetAtTime(0, time, 0.5);
    }

    // === TRANSITION POP ===
    if (transitioned) {
      this.playTransitionPop(absEdge);
    }

    // === TERRAIN SYNC === (disabled - annoying ding)
    // if (terrainSync > 0.7) {
    //   this.playTerrainSync();
    // }
  }

  /**
   * Toggle audio on/off
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(enabled ? 0.3 : 0, this.context.currentTime, 0.1);
    }
  }

  /**
   * Set master volume (0-1)
   */
  setVolume(volume) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(volume * 0.3, this.context.currentTime, 0.1);
    }
  }

  /**
   * Resume audio context (needed after page interaction)
   */
  resume() {
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
  }
}
