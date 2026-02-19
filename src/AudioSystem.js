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

    // High-speed wind whistle
    this.windWhistleNode = null;
    this.windWhistleFilter = null;
    this.windWhistleGain = null;

    // Wind gust state
    this.windGustTime = 0;
    this.windGustIntensity = 0;

    // Avalanche rumble
    this.avalancheNoiseNode = null;
    this.avalancheFilterNode = null;
    this.avalancheGainNode = null;
    this.avalancheRumbleIntensity = 0;
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
      this.createAvalancheSound();

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

    // High-speed wind whistle - sharper, higher frequency for extreme speeds
    const whistleBufferSize = this.context.sampleRate * 2;
    const whistleBuffer = this.context.createBuffer(1, whistleBufferSize, this.context.sampleRate);
    const whistleOutput = whistleBuffer.getChannelData(0);

    // Pink noise base for whistle
    let wb0 = 0, wb1 = 0, wb2 = 0;
    for (let i = 0; i < whistleBufferSize; i++) {
      const white = Math.random() * 2 - 1;
      wb0 = 0.99765 * wb0 + white * 0.0990460;
      wb1 = 0.96300 * wb1 + white * 0.2965164;
      wb2 = 0.57000 * wb2 + white * 1.0526913;
      whistleOutput[i] = (wb0 + wb1 + wb2 + white * 0.1848) * 0.08;
    }

    this.windWhistleNode = this.context.createBufferSource();
    this.windWhistleNode.buffer = whistleBuffer;
    this.windWhistleNode.loop = true;

    // Bandpass filter for screaming wind whistle
    this.windWhistleFilter = this.context.createBiquadFilter();
    this.windWhistleFilter.type = 'bandpass';
    this.windWhistleFilter.frequency.value = 2000;
    this.windWhistleFilter.Q.value = 2;

    this.windWhistleGain = this.context.createGain();
    this.windWhistleGain.gain.value = 0;

    this.windWhistleNode.connect(this.windWhistleFilter);
    this.windWhistleFilter.connect(this.windWhistleGain);
    this.windWhistleGain.connect(this.masterGain);

    this.windWhistleNode.start();
  }

  /**
   * Avalanche rumble - deep, menacing low-frequency rumble
   */
  createAvalancheSound() {
    const bufferSize = this.context.sampleRate * 2;
    const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // Very low frequency rumble (brownian noise + modulation)
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Slower brownian for deeper rumble
      output[i] = (lastOut + (0.01 * white)) / 1.01;
      lastOut = output[i];
      // Add some grit
      output[i] += Math.sin(i * 0.001) * 0.1 * (Math.random() * 0.5 + 0.5);
      output[i] *= 5;
    }

    this.avalancheNoiseNode = this.context.createBufferSource();
    this.avalancheNoiseNode.buffer = noiseBuffer;
    this.avalancheNoiseNode.loop = true;

    // Very low pass filter for rumble
    this.avalancheFilterNode = this.context.createBiquadFilter();
    this.avalancheFilterNode.type = 'lowpass';
    this.avalancheFilterNode.frequency.value = 120;
    this.avalancheFilterNode.Q.value = 1.5;

    // Add some resonance for menace
    const resonanceFilter = this.context.createBiquadFilter();
    resonanceFilter.type = 'peaking';
    resonanceFilter.frequency.value = 60;
    resonanceFilter.Q.value = 3;
    resonanceFilter.gain.value = 8;

    this.avalancheGainNode = this.context.createGain();
    this.avalancheGainNode.gain.value = 0;

    this.avalancheNoiseNode.connect(this.avalancheFilterNode);
    this.avalancheFilterNode.connect(resonanceFilter);
    resonanceFilter.connect(this.avalancheGainNode);
    this.avalancheGainNode.connect(this.masterGain);

    this.avalancheNoiseNode.start();
  }

  /**
   * Play transition "pop" sound - enhanced with timing quality feedback
   * @param {number} intensity - Edge angle intensity
   * @param {number} timingQuality - How well timed the transition was (0-1.2)
   * @param {number} flexEnergy - Amount of flex energy released (0-1)
   */
  playTransitionPop(intensity = 0.5, timingQuality = 1.0, flexEnergy = 0) {
    if (!this.initialized || !this.enabled) return;

    const time = this.context.currentTime;

    // === PUNCHY ATTACK TRANSIENT ===
    // Sharp attack click for immediate feedback
    const click = this.context.createOscillator();
    const clickGain = this.context.createGain();
    const clickFilter = this.context.createBiquadFilter();

    click.type = 'square';
    click.frequency.value = 800 + timingQuality * 400;

    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 1200;
    clickFilter.Q.value = 3;

    const clickVol = 0.08 * intensity * (0.8 + timingQuality * 0.4);
    clickGain.gain.setValueAtTime(clickVol, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.masterGain);
    click.start(time);
    click.stop(time + 0.04);

    // === MAIN POP TONE ===
    const baseFreq = 220 + timingQuality * 180;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq + intensity * 150, time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, time + 0.12);

    filter.type = 'lowpass';
    filter.frequency.value = 800 + timingQuality * 600;
    filter.Q.value = 1.5 + timingQuality;

    const volume = 0.1 * intensity * (0.6 + timingQuality * 0.6);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.setTargetAtTime(0.001, time, 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.15);

    // === PERFECT TIMING DING (magical chime) ===
    if (timingQuality > 1.05) {
      this.playPerfectDing(intensity);
    }

    // === TOO FAST WARNING (discordant) ===
    if (timingQuality < 0.5) {
      this.playTooFastWarning(intensity);
    }

    // === FLEX ENERGY RELEASE (spring snap) ===
    if (flexEnergy > 0.3) {
      this.playFlexRelease(flexEnergy, intensity);
    }

    // === HARMONIC SHIMMER for great timing ===
    if (timingQuality > 0.9) {
      const harmonic = this.context.createOscillator();
      const harmGain = this.context.createGain();
      harmonic.type = 'sine';
      harmonic.frequency.value = baseFreq * 2;
      const harmVol = 0.04 * (timingQuality - 0.9) * 3;
      harmGain.gain.setValueAtTime(harmVol, time);
      harmGain.gain.setTargetAtTime(0.001, time, 0.15);
      harmonic.connect(harmGain);
      harmGain.connect(this.masterGain);
      harmonic.start(time);
      harmonic.stop(time + 0.25);
    }
  }

  /**
   * Play perfect timing "ding" - satisfying chime for nailing the rhythm
   */
  playPerfectDing(intensity = 1.0) {
    if (!this.initialized || !this.enabled) return;

    const time = this.context.currentTime;

    // Major chord arpeggio for that "achievement" feel
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5

    frequencies.forEach((freq, i) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      const startTime = time + i * 0.02;
      const vol = 0.06 * intensity * (1 - i * 0.15);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(startTime);
      osc.stop(startTime + 0.45);
    });
  }

  /**
   * Play "too fast" warning - subtle discordant buzz
   */
  playTooFastWarning(intensity = 1.0) {
    if (!this.initialized || !this.enabled) return;

    const time = this.context.currentTime;

    // Slightly dissonant, buzzy tone
    const osc1 = this.context.createOscillator();
    const osc2 = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc1.frequency.value = 150;
    osc2.type = 'sawtooth';
    osc2.frequency.value = 157; // Slight detune for unpleasant beating

    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 2;

    gain.gain.setValueAtTime(0.05 * intensity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.12);
    osc2.stop(time + 0.12);
  }

  /**
   * Play flex energy release - spring snap sound
   */
  playFlexRelease(flexEnergy, intensity = 1.0) {
    if (!this.initialized || !this.enabled) return;

    const time = this.context.currentTime;

    // Pitch rises quickly (spring releasing)
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100, time);
    osc.frequency.exponentialRampToValueAtTime(400 + flexEnergy * 300, time + 0.06);
    osc.frequency.exponentialRampToValueAtTime(200, time + 0.15);

    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;

    const vol = 0.08 * flexEnergy * intensity;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  /**
   * Play rising risk warning tone - pitch increases with risk level
   * @param {number} riskLevel - Current risk level (0-1)
   */
  playRiskWarning(riskLevel) {
    if (!this.initialized || !this.enabled) return;
    if (riskLevel < 0.5) return; // Only warn at high risk

    const time = this.context.currentTime;

    // Create or update risk warning oscillator
    if (!this.riskOsc) {
      this.riskOsc = this.context.createOscillator();
      this.riskGain = this.context.createGain();
      this.riskFilter = this.context.createBiquadFilter();

      this.riskOsc.type = 'sine';
      this.riskFilter.type = 'lowpass';
      this.riskFilter.Q.value = 1;

      this.riskOsc.connect(this.riskFilter);
      this.riskFilter.connect(this.riskGain);
      this.riskGain.connect(this.masterGain);
      this.riskGain.gain.value = 0;
      this.riskOsc.start();
    }

    // Pitch rises with risk (more urgent)
    const pitch = 200 + (riskLevel - 0.5) * 2 * 400; // 200-600 Hz
    this.riskOsc.frequency.setTargetAtTime(pitch, time, 0.1);
    this.riskFilter.frequency.setTargetAtTime(pitch * 2, time, 0.1);

    // Volume pulses at high risk
    const intensity = (riskLevel - 0.5) * 2; // 0-1
    const pulse = riskLevel > 0.7 ? Math.sin(time * 12) * 0.3 + 0.7 : 1;
    const targetGain = intensity * 0.08 * pulse;
    this.riskGain.gain.setTargetAtTime(targetGain, time, 0.05);
  }

  /**
   * Stop risk warning sound
   */
  stopRiskWarning() {
    if (this.riskGain) {
      this.riskGain.gain.setTargetAtTime(0, this.context.currentTime, 0.1);
    }
  }

  /**
   * Play edge catch sound - sharp, alarming scrape
   * @param {number} severity - How bad the catch was (0-1)
   */
  playEdgeCatch(severity = 0.5) {
    if (!this.initialized || !this.enabled) return;

    // Harsh filtered noise burst
    const bufferSize = this.context.sampleRate * 0.3;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);

    // Gritty noise with some tonal elements
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.context.sampleRate;
      const noise = (Math.random() * 2 - 1);
      const tone = Math.sin(t * 150 * Math.PI * 2) * 0.3;
      data[i] = (noise * 0.7 + tone) * Math.exp(-t * 8);
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300 + severity * 400;
    filter.Q.value = 1.5;

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.25 * severity, this.context.currentTime);
    gain.gain.setTargetAtTime(0.001, this.context.currentTime, 0.15);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  /**
   * Play landing impact sound
   * @param {number} intensity - Impact force (0-1)
   * @param {number} landingQuality - How clean the landing was (0-1, 1 = perfect stomp)
   */
  playLandingImpact(intensity = 0.5, landingQuality = 0.5) {
    if (!this.initialized || !this.enabled) return;

    const time = this.context.currentTime;

    // === BASS THUMP - The core impact ===
    const bassOsc = this.context.createOscillator();
    const bassGain = this.context.createGain();

    bassOsc.type = 'sine';
    // Lower frequency for bigger impacts
    const bassFreq = 60 + (1 - intensity) * 40;
    bassOsc.frequency.setValueAtTime(bassFreq + intensity * 30, time);
    bassOsc.frequency.exponentialRampToValueAtTime(bassFreq * 0.5, time + 0.2);

    // Volume scales with intensity
    const bassVol = 0.25 * intensity * (0.7 + landingQuality * 0.3);
    bassGain.gain.setValueAtTime(bassVol, time);
    bassGain.gain.setTargetAtTime(0.001, time, 0.1);

    bassOsc.connect(bassGain);
    bassGain.connect(this.masterGain);
    bassOsc.start(time);
    bassOsc.stop(time + 0.25);

    // === TRANSIENT CLICK - Sharp attack for impact feel ===
    const clickOsc = this.context.createOscillator();
    const clickGain = this.context.createGain();
    const clickFilter = this.context.createBiquadFilter();

    clickOsc.type = 'square';
    clickOsc.frequency.value = 120 + intensity * 80;

    clickFilter.type = 'lowpass';
    clickFilter.frequency.value = 400 + intensity * 200;
    clickFilter.Q.value = 2;

    const clickVol = 0.1 * intensity;
    clickGain.gain.setValueAtTime(clickVol, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    clickOsc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickOsc.start(time);
    clickOsc.stop(time + 0.05);

    // === SNOW CRUNCH - Textural layer ===
    if (intensity > 0.2) {
      const bufferSize = this.context.sampleRate * 0.2;
      const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const data = buffer.getChannelData(0);

      // Crunchy noise with some grittiness
      for (let i = 0; i < bufferSize; i++) {
        const t = i / this.context.sampleRate;
        const envelope = Math.exp(-t * 12);
        const noise = (Math.random() * 2 - 1);
        // Add some grit/crackle
        const crackle = Math.random() > 0.95 ? (Math.random() * 2 - 1) * 2 : 0;
        data[i] = (noise * 0.6 + crackle) * envelope * intensity;
      }

      const source = this.context.createBufferSource();
      source.buffer = buffer;

      const crunchFilter = this.context.createBiquadFilter();
      crunchFilter.type = 'bandpass';
      crunchFilter.frequency.value = 600 + intensity * 400;
      crunchFilter.Q.value = 0.8;

      const crunchGain = this.context.createGain();
      crunchGain.gain.value = 0.18 * intensity;

      source.connect(crunchFilter);
      crunchFilter.connect(crunchGain);
      crunchGain.connect(this.masterGain);
      source.start(time);
    }

    // === STOMP BONUS - Satisfying "thwack" for clean landings ===
    if (landingQuality > 0.7) {
      this.playLandingStomp(intensity, landingQuality);
    }

    // === BAD LANDING WARNING - Rough sound for poor landings ===
    if (landingQuality < 0.3 && intensity > 0.4) {
      this.playBadLanding(intensity);
    }
  }

  /**
   * Play satisfying stomp sound for clean landings
   */
  playLandingStomp(intensity, quality) {
    if (!this.initialized || !this.enabled) return;

    const time = this.context.currentTime;

    // Satisfying "thwack" harmonic
    const frequencies = [220, 330, 440]; // A major chord feeling

    frequencies.forEach((freq, i) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.8, time + 0.1);

      const vol = 0.05 * intensity * (quality - 0.7) * 3 * (1 - i * 0.2);
      const startTime = time + i * 0.008;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(startTime);
      osc.stop(startTime + 0.2);
    });

    // Add subtle reverb tail for perfect landings
    if (quality > 0.9) {
      const reverbOsc = this.context.createOscillator();
      const reverbGain = this.context.createGain();
      const delay = this.context.createDelay();

      reverbOsc.type = 'sine';
      reverbOsc.frequency.value = 330;

      delay.delayTime.value = 0.08;

      reverbGain.gain.setValueAtTime(0.03, time);
      reverbGain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

      reverbOsc.connect(delay);
      delay.connect(reverbGain);
      reverbGain.connect(this.masterGain);
      reverbOsc.start(time);
      reverbOsc.stop(time + 0.5);
    }
  }

  /**
   * Play rough sound for bad landings
   */
  playBadLanding(intensity) {
    if (!this.initialized || !this.enabled) return;

    const time = this.context.currentTime;

    // Discordant, rough noise burst
    const bufferSize = this.context.sampleRate * 0.25;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.context.sampleRate;
      const envelope = Math.exp(-t * 8);
      const noise = (Math.random() * 2 - 1);
      // Add wobble/instability
      const wobble = Math.sin(t * 200) * 0.3;
      data[i] = (noise + wobble) * envelope * intensity * 0.5;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300;
    filter.Q.value = 1.5;

    const gain = this.context.createGain();
    gain.gain.value = 0.12 * intensity;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(time);
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
      timingQuality,
      flexEnergy,
      riskLevel,
      gForce
    } = state;

    const absEdge = Math.abs(edgeAngle);
    const time = this.context.currentTime;

    // === EDGE CUTTING SOUND ===
    if (isGrounded && absEdge > 0.2 && speed > 3) {
      // Frequency rises with edge angle and G-force
      const gBonus = (gForce || 1) > 1.2 ? (gForce - 1) * 200 : 0;
      const targetFreq = 500 + absEdge * 800 + speed * 10 + gBonus;
      this.edgeFilterNode.frequency.setTargetAtTime(targetFreq, time, 0.1);

      // Volume based on edge depth, speed, and carve quality
      const qualityBonus = carveRailStrength * 0.15;
      const targetGain = Math.min(0.35, (absEdge * 0.3 + qualityBonus) * (speed / 20));
      this.edgeGainNode.gain.setTargetAtTime(targetGain, time, 0.05);

      // Q increases during deep carves (more resonant "bite")
      const targetQ = 1.5 + carveRailStrength * 2;
      this.edgeFilterNode.Q.setTargetAtTime(targetQ, time, 0.1);
    } else {
      this.edgeGainNode.gain.setTargetAtTime(0, time, 0.1);
    }

    // === SPRAY SOUND ===
    if (isGrounded && carveRailStrength > 0.3 && speed > 8) {
      // More spray during deep carves, enhanced by G-force
      const gBonus = (gForce || 1) > 1.3 ? (gForce - 1) * 0.1 : 0;
      const sprayIntensity = (carveRailStrength * (speed / 25) * 0.15) + gBonus;
      this.sprayGainNode.gain.setTargetAtTime(sprayIntensity, time, 0.05);
      this.sprayFilterNode.frequency.setTargetAtTime(1500 + speed * 50, time, 0.1);
    } else {
      this.sprayGainNode.gain.setTargetAtTime(0, time, 0.15);
    }

    // === WIND SOUND (enhanced for extreme speeds) ===
    const extremeSpeedThreshold = 25;
    const maxSpeed = 50;

    // Base wind - increases with speed, with extra boost at extreme speeds
    let windIntensity = Math.min(0.3, speed / 40);
    if (speed > extremeSpeedThreshold) {
      // Extra intensity for extreme speeds (exponential boost)
      const extremeFactor = (speed - extremeSpeedThreshold) / (maxSpeed - extremeSpeedThreshold);
      windIntensity += Math.pow(extremeFactor, 1.5) * 0.15;
    }

    // Wind gusts at high speeds - random fluctuations
    if (speed > 20) {
      this.windGustTime += dt || 0.016;
      const gustCycle = Math.sin(this.windGustTime * 2.5) * Math.sin(this.windGustTime * 0.7);
      const gustAmount = Math.max(0, gustCycle) * 0.08 * (speed / maxSpeed);
      windIntensity += gustAmount;
    }

    this.windGainNode.gain.setTargetAtTime(Math.min(0.45, windIntensity), time, 0.15);

    // Filter frequency rises with speed - more piercing at high speeds
    const baseWindFreq = 200 + speed * 18;
    const windQ = 0.5 + (speed / maxSpeed) * 1.5; // More resonance at high speeds
    this.windFilterNode.frequency.setTargetAtTime(baseWindFreq, time, 0.1);
    this.windFilterNode.Q.setTargetAtTime(windQ, time, 0.2);

    // High-speed wind whistle - screaming wind above extreme threshold
    if (this.windWhistleGain) {
      if (speed > extremeSpeedThreshold) {
        const whistleIntensity = Math.pow((speed - extremeSpeedThreshold) / (maxSpeed - extremeSpeedThreshold), 2) * 0.12;
        this.windWhistleGain.gain.setTargetAtTime(whistleIntensity, time, 0.1);

        // Whistle frequency rises dramatically with speed
        const whistleFreq = 1800 + (speed - extremeSpeedThreshold) * 80;
        const whistleQ = 3 + (speed / maxSpeed) * 5; // Sharper at extreme speeds
        this.windWhistleFilter.frequency.setTargetAtTime(whistleFreq, time, 0.08);
        this.windWhistleFilter.Q.setTargetAtTime(whistleQ, time, 0.1);
      } else {
        this.windWhistleGain.gain.setTargetAtTime(0, time, 0.2);
      }
    }

    // === FLOW AMBIENCE (enhanced) ===
    if (flowLevel > 0.3) {
      // Harmonic rises with flow - more layers at higher flow
      const flowIntensity = (flowLevel - 0.3) * 0.18;
      this.flowGainNode.gain.setTargetAtTime(flowIntensity, time, 0.3);

      // Pitch rises and adds slight vibrato at high flow
      const basePitch = 110 + flowLevel * 40;
      const vibrato = flowLevel > 0.7 ? Math.sin(time * 4) * 3 : 0;
      this.flowOscNode.frequency.setTargetAtTime(basePitch + vibrato, time, 0.2);
    } else {
      this.flowGainNode.gain.setTargetAtTime(0, time, 0.5);
    }

    // === TRANSITION POP ===
    if (transitioned) {
      this.playTransitionPop(absEdge, timingQuality || 1.0, flexEnergy || 0);
    }

    // === RISK WARNING ===
    if (riskLevel !== undefined) {
      if (riskLevel > 0.5) {
        this.playRiskWarning(riskLevel);
      } else {
        this.stopRiskWarning();
      }
    }

    // === G-FORCE INTENSITY SOUND ===
    // Subtle low rumble during high-G carves
    if (isGrounded && gForce > 1.5 && carveRailStrength > 0.4) {
      this.playGForceRumble(gForce, carveRailStrength);
    } else {
      this.stopGForceRumble();
    }

    // === AVALANCHE RUMBLE ===
    this.updateAvalancheRumble(this.avalancheRumbleIntensity);
  }

  /**
   * Play subtle G-force rumble during hard carves
   */
  playGForceRumble(gForce, railStrength) {
    if (!this.initialized || !this.enabled) return;

    const time = this.context.currentTime;

    // Create G-force rumble if not exists
    if (!this.gForceOsc) {
      this.gForceOsc = this.context.createOscillator();
      this.gForceGain = this.context.createGain();
      this.gForceFilter = this.context.createBiquadFilter();

      this.gForceOsc.type = 'sine';
      this.gForceOsc.frequency.value = 50;
      this.gForceFilter.type = 'lowpass';
      this.gForceFilter.frequency.value = 100;
      this.gForceFilter.Q.value = 2;

      this.gForceOsc.connect(this.gForceFilter);
      this.gForceFilter.connect(this.gForceGain);
      this.gForceGain.connect(this.masterGain);
      this.gForceGain.gain.value = 0;
      this.gForceOsc.start();
    }

    const intensity = Math.min((gForce - 1.5) * 0.5, 1) * railStrength;
    const targetGain = intensity * 0.06;
    this.gForceGain.gain.setTargetAtTime(targetGain, time, 0.1);

    // Frequency rises slightly with G-force
    const freq = 45 + (gForce - 1) * 20;
    this.gForceOsc.frequency.setTargetAtTime(freq, time, 0.1);
  }

  /**
   * Stop G-force rumble
   */
  stopGForceRumble() {
    if (this.gForceGain) {
      this.gForceGain.gain.setTargetAtTime(0, this.context.currentTime, 0.2);
    }
  }

  /**
   * Set avalanche rumble intensity (called from game loop)
   */
  setAvalancheRumble(intensity) {
    this.avalancheRumbleIntensity = intensity;
  }

  /**
   * Update avalanche rumble sound
   */
  updateAvalancheRumble(intensity) {
    if (!this.avalancheGainNode) return;

    const time = this.context.currentTime;

    if (intensity > 0.01) {
      // Rumble volume based on intensity (distance)
      const targetGain = Math.min(0.5, intensity * 0.5);
      this.avalancheGainNode.gain.setTargetAtTime(targetGain, time, 0.1);

      // Frequency shifts higher when closer (more urgent)
      const targetFreq = 80 + intensity * 80;
      this.avalancheFilterNode.frequency.setTargetAtTime(targetFreq, time, 0.1);
    } else {
      this.avalancheGainNode.gain.setTargetAtTime(0, time, 0.3);
    }
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
