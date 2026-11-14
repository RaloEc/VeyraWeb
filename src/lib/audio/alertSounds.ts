class AlertSoundPlayer {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public play(level: 'normal' | 'strict' | 'critical' | string = 'normal') {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      if (level === 'critical') {
        this.playCritical(ctx);
      } else if (level === 'strict') {
        this.playStrict(ctx);
      } else {
        this.playNormal(ctx);
      }
    } catch (err) {
      console.warn('[AlertSoundPlayer] Error playing sound:', err);
    }
  }

  private playTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainVal = 0.2
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(gainVal, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  private playNormal(ctx: AudioContext) {
    const now = ctx.currentTime;
    this.playTone(ctx, 587.33, now, 0.22, 'sine', 0.2); // D5
    this.playTone(ctx, 880.0, now + 0.14, 0.45, 'sine', 0.22); // A5
  }

  private playStrict(ctx: AudioContext) {
    const now = ctx.currentTime;
    this.playTone(ctx, 523.25, now, 0.16, 'triangle', 0.22); // C5
    this.playTone(ctx, 659.25, now + 0.11, 0.16, 'triangle', 0.24); // E5
    this.playTone(ctx, 783.99, now + 0.22, 0.4, 'triangle', 0.28); // G5
  }

  private playCritical(ctx: AudioContext) {
    const now = ctx.currentTime;
    // Insistent dual pulse
    this.playTone(ctx, 880, now, 0.1, 'square', 0.14);
    this.playTone(ctx, 880, now + 0.13, 0.1, 'square', 0.14);
    this.playTone(ctx, 1174.66, now + 0.3, 0.14, 'square', 0.18);
    this.playTone(ctx, 1174.66, now + 0.46, 0.25, 'square', 0.2);
  }
}

export const alertSoundPlayer = new AlertSoundPlayer();

