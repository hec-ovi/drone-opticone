/**
 * Procedural WebAudio SFX. No audio assets: every cue is synthesized
 * (oscillators and filtered noise), so the whole game stays static files.
 * Safe headless: without an AudioContext every call is a no-op.
 */

export type SfxName =
  | 'click'
  | 'build'
  | 'spawn'
  | 'explosion'
  | 'alert'
  | 'sweep'
  | 'victory'
  | 'defeat'

export class SoundEngine {
  muted = false
  private ctx: AudioContext | null = null

  /** Call from a user gesture; browsers block audio before one. */
  resume(): void {
    if (typeof AudioContext === 'undefined') return
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private tone(
    freq: number,
    at: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; glideTo?: number } = {},
  ): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = opts.type ?? 'square'
    const t0 = ctx.currentTime + at
    osc.frequency.setValueAtTime(freq, t0)
    if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t0 + dur)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(opts.gain ?? 0.08, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  private noise(at: number, dur: number, cutoff: number, gainV: number): void {
    const ctx = this.ctx!
    const len = Math.ceil(ctx.sampleRate * dur)
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    const gain = ctx.createGain()
    const t0 = ctx.currentTime + at
    gain.gain.setValueAtTime(gainV, t0)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start(t0)
  }

  play(name: SfxName): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return
    switch (name) {
      case 'click':
        this.tone(880, 0, 0.05, { type: 'triangle', gain: 0.05 })
        break
      case 'build':
        this.tone(420, 0, 0.07, { type: 'triangle', gain: 0.06 })
        this.tone(620, 0.07, 0.09, { type: 'triangle', gain: 0.06 })
        break
      case 'spawn':
        this.tone(520, 0, 0.08, { type: 'triangle', gain: 0.07 })
        this.tone(780, 0.09, 0.12, { type: 'triangle', gain: 0.07 })
        break
      case 'explosion':
        this.noise(0, 0.7, 900, 0.22)
        this.tone(90, 0, 0.5, { type: 'sine', gain: 0.14, glideTo: 36 })
        break
      case 'alert':
        this.tone(760, 0, 0.11, { gain: 0.05, glideTo: 480 })
        this.tone(760, 0.16, 0.11, { gain: 0.05, glideTo: 480 })
        break
      case 'sweep':
        this.tone(1150, 0, 0.5, { type: 'sine', gain: 0.06, glideTo: 320 })
        break
      case 'victory':
        this.tone(392, 0, 0.14, { type: 'triangle', gain: 0.09 })
        this.tone(494, 0.14, 0.14, { type: 'triangle', gain: 0.09 })
        this.tone(587, 0.28, 0.14, { type: 'triangle', gain: 0.09 })
        this.tone(784, 0.42, 0.4, { type: 'triangle', gain: 0.11 })
        break
      case 'defeat':
        this.tone(196, 0, 0.5, { type: 'sawtooth', gain: 0.07, glideTo: 98 })
        this.noise(0.1, 1.1, 400, 0.1)
        break
    }
  }
}
