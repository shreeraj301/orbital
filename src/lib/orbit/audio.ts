/** Layered Web Audio voices for launch, impact, and scene changes. */

export class OrbitAudio {
  muted = false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private delay: DelayNode | null = null
  private noise: AudioBuffer | null = null
  private lastHit = 0

  unlock(): void {
    if (this.muted || typeof AudioContext === "undefined") return
    if (!this.ctx) this.build()
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume()
  }

  private build(): void {
    const ctx = new AudioContext()
    this.ctx = ctx

    const master = ctx.createGain()
    master.gain.value = 0.8
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 16
    comp.ratio.value = 3
    comp.attack.value = 0.003
    comp.release.value = 0.2
    master.connect(comp)
    comp.connect(ctx.destination)
    this.master = master

    const delay = ctx.createDelay(0.4)
    delay.delayTime.value = 0.12
    const feedback = ctx.createGain()
    feedback.gain.value = 0.2
    const damp = ctx.createBiquadFilter()
    damp.type = "lowpass"
    damp.frequency.value = 2400
    const wet = ctx.createGain()
    wet.gain.value = 0.32
    delay.connect(damp)
    damp.connect(feedback)
    feedback.connect(delay)
    damp.connect(wet)
    wet.connect(master)
    this.delay = delay

    const length = Math.floor(ctx.sampleRate)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let seed = 0x6a09e667
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      data[i] = ((seed & 0xffff) / 32768 - 1) * 0.6
    }
    this.noise = buffer
  }

  private context(): AudioContext | null {
    if (this.muted || !this.ctx || this.ctx.state === "closed" || !this.master) return null
    if (this.ctx.state === "suspended") void this.ctx.resume()
    return this.ctx
  }

  private tone(
    freq: number,
    freqEnd: number,
    type: OscillatorType,
    peak: number,
    dur: number,
    when = 0,
    attack = 0.012,
  ): void {
    const ctx = this.context()
    if (!ctx || !this.master) return
    const t = ctx.currentTime + when
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(36, freq), t)
    if (Math.abs(freqEnd - freq) > 0.5) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(36, freqEnd), t + Math.max(0.02, dur * 0.92))
    }
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(attack, dur * 0.45))
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain)
    gain.connect(this.master)
    if (this.delay) {
      const send = ctx.createGain()
      send.gain.value = 0.16
      gain.connect(send)
      send.connect(this.delay)
    }
    osc.start(t)
    osc.stop(t + dur + 0.04)
  }

  private air(freq: number, type: BiquadFilterType, q: number, peak: number, dur: number): void {
    const ctx = this.context()
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(freq, t)
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.01, dur * 0.4))
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  launch(speed: number): void {
    this.unlock()
    const lift = 0.82 + Math.min(0.75, Math.max(0, speed) / 480)
    this.tone(210 * lift, 640 * lift, "sine", 0.07, 0.2, 0, 0.014)
    this.tone(315 * lift, 920 * lift, "triangle", 0.03, 0.15, 0.012, 0.01)
    this.air(1500 * Math.min(1.4, lift), "bandpass", 0.65, 0.04, 0.1)
  }

  place(): void {
    this.unlock()
    this.tone(523.25, 523.25, "sine", 0.055, 0.24)
    this.tone(784, 622, "sine", 0.026, 0.2, 0.035)
    this.air(1900, "highpass", 0.5, 0.018, 0.05)
  }

  nudge(): void {
    this.unlock()
    this.tone(220, 146, "sine", 0.05, 0.11)
    this.air(880, "bandpass", 0.85, 0.028, 0.07)
  }

  merge(magnitude: number): void {
    this.unlock()
    const ctx = this.context()
    if (!ctx) return
    if (ctx.currentTime - this.lastHit < 0.07) return
    this.lastHit = ctx.currentTime
    const heft = Math.min(1, Math.max(0, magnitude) / 90)
    this.tone(128 - heft * 36, 42, "sine", 0.085 + heft * 0.04, 0.4, 0, 0.008)
    this.tone(210, 74, "triangle", 0.032, 0.28, 0.015)
    this.air(360 + (1 - heft) * 280, "lowpass", 0.55, 0.07 + heft * 0.05, 0.22)
    if (heft > 0.28) this.tone(698, 392, "sine", 0.02, 0.14, 0.02)
  }

  bounce(magnitude: number): void {
    this.unlock()
    const ctx = this.context()
    if (!ctx) return
    if (ctx.currentTime - this.lastHit < 0.045) return
    this.lastHit = ctx.currentTime
    const lift = 1 + Math.min(0.55, Math.max(0, magnitude) / 220)
    this.tone(540 * lift, 360 * lift, "triangle", 0.042, 0.07, 0, 0.004)
    this.tone(810 * lift, 620 * lift, "sine", 0.026, 0.08, 0.032, 0.004)
    this.air(2600, "highpass", 0.8, 0.03, 0.045)
  }

  scene(): void {
    this.unlock()
    this.tone(392, 392, "sine", 0.032, 0.16)
    this.tone(523.25, 523.25, "sine", 0.024, 0.18, 0.055)
    this.tone(659.25, 784, "triangle", 0.018, 0.22, 0.11)
  }
}
