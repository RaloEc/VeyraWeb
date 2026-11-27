import confetti from 'canvas-confetti';
import { toast } from 'sonner';

const FALLBACK_COLORS = ['#3ab0b0', '#5ce1e6', '#2b8f8f'];
const CELEBRATION_EMOJIS = ['✨', '✅', '⭐', '🎉'];

type ConfettiShape = ReturnType<typeof confetti.shapeFromText>;
let cachedEmojiShapes: ConfettiShape[] | null = null;
let sharedAudioContext: AudioContext | null = null;

function getAccentConfettiColors(): string[] {
  if (typeof window === 'undefined') return FALLBACK_COLORS;
  const styles = getComputedStyle(document.documentElement);
  const primary = styles.getPropertyValue('--accent-primary').trim();
  const muted = styles.getPropertyValue('--accent-muted').trim();
  const hexColors = [primary, muted].filter((c) => /^#[0-9a-f]{3,8}$/i.test(c));
  return hexColors.length > 0 ? hexColors : FALLBACK_COLORS;
}

function getEmojiShapes(): ConfettiShape[] {
  if (cachedEmojiShapes) return cachedEmojiShapes;
  if (typeof window === 'undefined' || typeof confetti.shapeFromText !== 'function') {
    return [];
  }
  try {
    cachedEmojiShapes = CELEBRATION_EMOJIS.map((text) =>
      confetti.shapeFromText({ text, scalar: 1.6 })
    );
    return cachedEmojiShapes;
  } catch {
    return [];
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

export function playCompletionSound(isGrandFinale = false): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = isGrandFinale
      ? [
          { freq: 1046.5, start: 0, duration: 0.14, gain: 0.08 }, // C6
          { freq: 1318.51, start: 0.07, duration: 0.14, gain: 0.08 }, // E6
          { freq: 1567.98, start: 0.14, duration: 0.16, gain: 0.085 }, // G6
          { freq: 2093.0, start: 0.21, duration: 0.26, gain: 0.09 }, // C7
        ]
      : [
          { freq: 1046.5, start: 0, duration: 0.12, gain: 0.07 }, // C6
          { freq: 1318.51, start: 0.065, duration: 0.18, gain: 0.08 }, // E6
        ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      gainNode.gain.setValueAtTime(0.0001, now + note.start);
      gainNode.gain.exponentialRampToValueAtTime(note.gain, now + note.start + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    }
  } catch {
    // Ignore audio errors if blocked by browser policy
  }
}

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function launchFireworksShow(
  colors: string[],
  shapes: confetti.Options['shapes'],
  totalBursts: number,
  intervalMs: number,
  ticks: number
): void {
  let fired = 0;

  const fireNext = () => {
    if (fired >= totalBursts) return false;
    fired += 1;

    const progress = fired / totalBursts;
    const particleCount = Math.max(20, Math.round(42 * (1 - progress * 0.35)));

    confetti({
      particleCount,
      startVelocity: randomInRange(24, 34),
      spread: 360,
      ticks,
      gravity: 0.82,
      zIndex: 100,
      origin: { x: randomInRange(0.15, 0.85), y: randomInRange(0.18, 0.55) },
      colors,
      shapes,
      scalar: randomInRange(0.95, 1.15),
    });

    return fired < totalBursts;
  };

  fireNext();
  const interval = window.setInterval(() => {
    if (!fireNext()) {
      window.clearInterval(interval);
    }
  }, intervalMs);
}

export function triggerReminderCompletionCelebration(options?: {
  allTodayCompleted?: boolean;
}): void {
  const allTodayCompleted = Boolean(options?.allTodayCompleted);
  const colors = getAccentConfettiColors();
  const emojiShapes = getEmojiShapes();
  const shapes = ['circle', 'square', 'star', ...emojiShapes] as unknown as confetti.Options['shapes'];

  playCompletionSound(allTodayCompleted);

  if (allTodayCompleted) {
    launchFireworksShow(colors, shapes, 10, 210, 95);
    toast.success('¡Todo listo por hoy! 🎉', {
      description: 'Completaste todas tus actividades pendientes.',
    });
    return;
  }

  // Individual reminder: 5 firework explosions
  launchFireworksShow(colors, shapes, 5, 220, 88);
}
