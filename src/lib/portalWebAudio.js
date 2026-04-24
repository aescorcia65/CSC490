/**
 * Shared Web Audio for doctor / pharmacist in-app notification tones.
 * Browsers block playback until a user gesture; call ensurePortalAudioContext from pointerdown/touchstart.
 */

let sharedCtx = null;

function primeOutput(ctx) {
  if (!ctx || ctx.state !== "running") return;
  try {
    const dur = Math.max(0.02, 2 / ctx.sampleRate);
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    src.start(t);
    src.stop(t + dur);
  } catch {
    /* ignore */
  }
}

export async function ensurePortalAudioContext() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  if (sharedCtx.state === "suspended") {
    try {
      await sharedCtx.resume();
    } catch {
      return sharedCtx;
    }
  }
  primeOutput(sharedCtx);
  return sharedCtx;
}

/**
 * @param {Array<[number, string, number, number]>} tones [freq, wave, delay, dur]
 * @param {number} volume 0.1–1
 */
export async function playPortalNotificationSound(tones, volume = 0.7) {
  if (!tones?.length) return;
  const ctx = await ensurePortalAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  primeOutput(ctx);
  if (ctx.state !== "running") return;

  const v = Math.min(1, Math.max(0.05, Number(volume) || 0.7));
  const peak = 0.22 * v;
  const t0 = ctx.currentTime + 0.02;

  try {
    tones.forEach(([freq, wave, delay, dur]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = freq;
      o.type = wave || "sine";
      g.gain.setValueAtTime(0, t0 + delay);
      g.gain.linearRampToValueAtTime(peak, t0 + delay + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + delay + dur);
      o.start(t0 + delay);
      o.stop(t0 + delay + dur + 0.02);
    });
  } catch {
    /* ignore */
  }
}
