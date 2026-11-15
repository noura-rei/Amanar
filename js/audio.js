// LUNA-01: Lunar South Pole Rover Exploration - Web Audio Synthesizer
// Synthesizes procedural audio (electric rover drive motors, vacuum chassis resonance, 
// neutron spectrometer ice clicks, and Apollo/Artemis telemetry quindar tones)

class LunaAudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;

    // Motor sound nodes
    this.motorOsc = null;
    this.motorGain = null;
    this.motorFilter = null;

    // Ambient chassis rumble
    this.rumbleOsc = null;
    this.rumbleGain = null;

    // Spectrometer click timer
    this.lastClickTime = 0;
    this.clickInterval = 1.5; // seconds
  }

  init() {
    if (this.isInitialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();

      // Master output gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Rover Electric Motor Synthesizer (dual harmonics)
      this.motorOsc = this.ctx.createOscillator();
      this.motorOsc.type = 'sawtooth';
      this.motorOsc.frequency.setValueAtTime(40, this.ctx.currentTime);

      this.motorFilter = this.ctx.createBiquadFilter();
      this.motorFilter.type = 'lowpass';
      this.motorFilter.frequency.setValueAtTime(180, this.ctx.currentTime);
      this.motorFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

      this.motorGain = this.ctx.createGain();
      this.motorGain.gain.setValueAtTime(0.001, this.ctx.currentTime);

      this.motorOsc.connect(this.motorFilter);
      this.motorFilter.connect(this.motorGain);
      this.motorGain.connect(this.masterGain);
      this.motorOsc.start();

      // Vacuum Frame Resonance (Sub-bass rumble through the chassis)
      this.rumbleOsc = this.ctx.createOscillator();
      this.rumbleOsc.type = 'sine';
      this.rumbleOsc.frequency.setValueAtTime(28, this.ctx.currentTime);

      this.rumbleGain = this.ctx.createGain();
      this.rumbleGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

      this.rumbleOsc.connect(this.rumbleGain);
      this.rumbleGain.connect(this.masterGain);
      this.rumbleOsc.start();

      this.isInitialized = true;
    } catch (e) {
      console.warn('AudioContext initialization deferred until user gesture:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const targetGain = this.isMuted ? 0.0 : 0.35;
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  // Update motor sound based on current rover speed (0 - 12 km/h)
  updateRoverSound(speedKmh, isAccelerating) {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;

    const absSpeed = Math.abs(speedKmh);
    const speedRatio = Math.min(absSpeed / 12.0, 1.0);

    // Motor pitch shifts from 45 Hz up to 320 Hz
    const targetFreq = 45 + speedRatio * 240 + (isAccelerating ? 35 : 0);
    const targetCutoff = 160 + speedRatio * 600;
    const targetGain = 0.02 + speedRatio * 0.16 + (isAccelerating ? 0.04 : 0);

    this.motorOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);
    this.motorFilter.frequency.setTargetAtTime(targetCutoff, this.ctx.currentTime, 0.08);
    this.motorGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.08);
  }

  // Play a Quindar tone (NASA Apollo/Artemis capcom radio tone)
  playQuindar(freq = 2524, duration = 0.12) {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }

  // Neutron spectrometer click (higher frequency when volatile ice concentration is high)
  triggerSpectrometerTick(iceConcentrationRatio) {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    const now = performance.now() / 1000;
    
    // Interval shortens from 2.0s down to 0.08s when right over water-ice deposits
    const minInterval = 0.08;
    const maxInterval = 2.2;
    const currentInterval = maxInterval - (iceConcentrationRatio * (maxInterval - minInterval));

    if (now - this.lastClickTime > currentInterval) {
      this.lastClickTime = now;
      this.playSpectrometerClick(iceConcentrationRatio);
    }
  }

  playSpectrometerClick(intensity = 0.5) {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      // Crisp detector click
      osc.frequency.setValueAtTime(1400 + Math.random() * 800, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.05 + intensity * 0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.02);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.02);
    } catch (e) {}
  }
}

export const audioManager = new LunaAudioManager();
