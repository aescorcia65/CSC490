/**
 * Patient portal: new-message sounds (separate from doctor mt_* keys and notification prefs).
 * Stored in localStorage so tones stay distinct from the doctor app.
 *
 * Uses one shared AudioContext + resume() so browsers allow playback after a user gesture.
 */

const STORAGE_KEY = "pt_messaging_sound_v1";

let sharedCtx = null;

/** Short silent buffer + destination tap — helps Safari/iOS unlock the graph after resume(). */
function primePatientAudioOutput(ctx) {
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

export async function ensurePatientMessagingAudioUnlocked() {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!sharedCtx) sharedCtx = new AC();
  if (sharedCtx.state === "suspended") {
    try {
      await sharedCtx.resume();
    } catch {
      /* ignore */
    }
  }
  primePatientAudioOutput(sharedCtx);
}

function getPatientAudioContext() {
  if (typeof window === "undefined") return null;
  return sharedCtx;
}

/** Resume + prime only if the user already unlocked audio (sharedCtx exists). Used for realtime inbound sounds. */
async function resumePatientAudioIfPrimed() {
  if (!sharedCtx) return;
  if (sharedCtx.state === "suspended") {
    try {
      await sharedCtx.resume();
    } catch {
      return;
    }
  }
  primePatientAudioOutput(sharedCtx);
}

/** Preset id -> { label, desc, tones: [freq, wave, delaySec, durSec][] } */
export const PATIENT_MESSAGING_SOUND_PRESETS = {
  breeze: {
    label: "Breeze",
    desc: "Soft rising notes",
    tones: [
      [392, "sine", 0, 0.1],
      [494, "sine", 0.08, 0.12],
      [587, "sine", 0.2, 0.14],
    ],
  },
  dew: {
    label: "Dew",
    desc: "Gentle two-drop",
    tones: [
      [523, "sine", 0, 0.09],
      [659, "sine", 0.11, 0.11],
    ],
  },
  marimba: {
    label: "Marimba",
    desc: "Warm wooden taps",
    tones: [
      [329, "triangle", 0, 0.1],
      [392, "triangle", 0.12, 0.1],
      [493, "triangle", 0.24, 0.11],
    ],
  },
  crystal: {
    label: "Crystal",
    desc: "Bright clear ping",
    tones: [
      [784, "sine", 0, 0.07],
      [1047, "sine", 0.08, 0.09],
    ],
  },
  hush: {
    label: "Hush",
    desc: "Very subtle",
    tones: [[440, "sine", 0, 0.22]],
  },
};

export const DEFAULT_PATIENT_MESSAGING_SOUND = {
  enabled: true,
  preset: "breeze",
  volume: 0.75,
};

export function loadPatientMessagingSoundSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PATIENT_MESSAGING_SOUND };
    const p = JSON.parse(raw);
    const preset = PATIENT_MESSAGING_SOUND_PRESETS[p.preset] ? p.preset : DEFAULT_PATIENT_MESSAGING_SOUND.preset;
    const vol = typeof p.volume === "number" ? p.volume : DEFAULT_PATIENT_MESSAGING_SOUND.volume;
    const volume = Math.min(1, Math.max(0.05, vol));
    const enabled = p.enabled !== false;
    return { enabled, preset, volume };
  } catch {
    return { ...DEFAULT_PATIENT_MESSAGING_SOUND };
  }
}

export function savePatientMessagingSoundSettings(partial) {
  const next = { ...loadPatientMessagingSoundSettings(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  try {
    window.dispatchEvent(new CustomEvent("pt-messaging-sound", { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * Preview / inbound chime using Web Audio (distinct timbres from doctor portal).
 * @param {string} presetId
 * @param {number} volume 0–1
 * @param {{ fromUserGesture?: boolean }} [options] Pass fromUserGesture: true from click/tap handlers so a context can be created under autoplay rules.
 */
export async function playPatientMessagingSound(presetId, volume, options = {}) {
  const { fromUserGesture = false } = options;
  const profile = PATIENT_MESSAGING_SOUND_PRESETS[presetId] || PATIENT_MESSAGING_SOUND_PRESETS.breeze;
  const gain = Math.min(1, Math.max(0.05, Number(volume) || 0.75));

  if (fromUserGesture) {
    await ensurePatientMessagingAudioUnlocked();
  } else {
    await resumePatientAudioIfPrimed();
  }

  const ctx = getPatientAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  primePatientAudioOutput(ctx);
  if (ctx.state !== "running") return;

  const peak = 0.38 * gain;
  const t0 = ctx.currentTime + 0.01;
  try {
    profile.tones.forEach(([freq, wave, delay, dur]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = freq;
      o.type = wave || "sine";
      g.gain.setValueAtTime(0, t0 + delay);
      g.gain.linearRampToValueAtTime(peak, t0 + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + delay + dur);
      o.start(t0 + delay);
      o.stop(t0 + delay + dur + 0.04);
    });
  } catch {
    /* ignore */
  }
}

let lastInboundChimeKey = "";
let lastInboundChimeAt = 0;

/** Dedupe when hook + message page both see the same INSERT. */
export async function playPatientInboundChimeDeduped(messageId, presetId, volume, options = {}) {
  const key = messageId != null ? String(messageId) : `${Date.now()}`;
  const now = Date.now();
  if (key && lastInboundChimeKey === key && now - lastInboundChimeAt < 4000) return;
  lastInboundChimeKey = key;
  lastInboundChimeAt = now;
  await playPatientMessagingSound(presetId, volume, options);
}
