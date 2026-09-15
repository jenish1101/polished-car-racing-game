/* Tiny WebAudio synth engine — no assets, all procedural. */

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  private failed = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined" || this.failed) return null;
    try {
      return this.build();
    } catch {
      // autoplay policy / blocked AudioContext — run the game silently
      this.failed = true;
      return null;
    }
  }

  private build(): AudioContext | null {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

      // noise buffer for crashes / skids
      const len = Math.floor(this.ctx.sampleRate * 1.2);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    this.ensure();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  startEngine() {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.engineOsc) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 70;
    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    osc2.frequency.value = 35;

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc2.start();
    gain.gain.setTargetAtTime(0.1, ctx.currentTime, 0.4);

    this.engineOsc = osc;
    this.engineOsc2 = osc2;
    this.engineGain = gain;
    this.engineFilter = filter;
  }

  /** intensity 0..1 */
  updateEngine(intensity: number, boosting: boolean) {
    if (!this.ctx || !this.engineOsc || !this.engineOsc2 || !this.engineFilter)
      return;
    const t = this.ctx.currentTime;
    const f = 58 + intensity * 90 + (boosting ? 28 : 0);
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(
      500 + intensity * 1400 + (boosting ? 900 : 0),
      t,
      0.1,
    );
  }

  stopEngine() {
    if (!this.ctx || !this.engineGain) return;
    const g = this.engineGain;
    const o1 = this.engineOsc;
    const o2 = this.engineOsc2;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    setTimeout(() => {
      try {
        o1?.stop();
        o2?.stop();
      } catch {
        /* noop */
      }
    }, 400);
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
  }

  private blip(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
  ) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo)
      o.frequency.exponentialRampToValueAtTime(
        slideTo,
        ctx.currentTime + dur * 0.9,
      );
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, q = 1) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  nearMiss(combo: number) {
    this.noise(0.28, 0.22, 900 + Math.min(combo, 10) * 90, 1.4);
    this.blip(500 + Math.min(combo, 12) * 55, 0.1, "triangle", 0.09);
  }
  pickup() {
    this.blip(660, 0.09, "square", 0.1, 1320);
    setTimeout(() => this.blip(990, 0.12, "square", 0.08, 1760), 60);
  }
  boost() {
    this.blip(180, 0.5, "sawtooth", 0.14, 900);
    this.noise(0.5, 0.16, 1800, 0.8);
  }
  smash() {
    this.noise(0.35, 0.4, 320, 0.7);
    this.blip(200, 0.25, "square", 0.14, 60);
  }
  crash() {
    this.noise(0.9, 0.5, 220, 0.5);
    this.noise(0.6, 0.35, 90, 0.4);
    this.blip(160, 0.7, "sawtooth", 0.18, 40);
  }
  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => this.blip(f, 0.14, "triangle", 0.09), i * 70),
    );
  }
  uiClick() {
    this.blip(440, 0.07, "square", 0.07, 880);
  }
}

export const audio = new GameAudio();
