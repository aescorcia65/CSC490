
export const MESSAGE_NOTIF_STORAGE_KEY = "mt_message_notif_v1";

export const SOUND_OPTIONS = [
  { id: "default", label: "Default" },
  { id: "chime", label: "Soft chime" },
  { id: "alert", label: "Alert tone" },
];

export const DEFAULT_MESSAGE_NOTIF_SETTINGS = {
  masterEnabled: true,
  soundId: "default",
  volume: 0.75,
  notifyDoctorMessage: true,
  notifyPharmacistMessage: true,
  notifyAppointment: true,
  notifyMedication: true,
};

export function loadMessageNotifSettings() {
  try {
    const raw = localStorage.getItem(MESSAGE_NOTIF_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MESSAGE_NOTIF_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_MESSAGE_NOTIF_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_MESSAGE_NOTIF_SETTINGS };
  }
}

export function saveMessageNotifSettings(partial) {
  const next = { ...loadMessageNotifSettings(), ...partial };
  localStorage.setItem(MESSAGE_NOTIF_STORAGE_KEY, JSON.stringify(next));
  try {
    window.dispatchEvent(new CustomEvent("mt-message-notif-settings", { detail: next }));
  } catch {
  }
  return next;
}

let audioCtx = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  return audioCtx;
}

function primeNotifAudioOutput(ctx) {
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
  }
}

export async function ensureMessageNotifAudioUnlocked() {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
    }
  }
  primeNotifAudioOutput(audioCtx);
}

function playTone(ctx, freq, start, dur, gain, type = "sine") {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

export async function playMessageNotificationSound(soundId, volume = 0.75) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  if (v <= 0) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  primeNotifAudioOutput(ctx);
  if (ctx.state !== "running") return;
  const t0 = ctx.currentTime + 0.02;
  const baseGain = 0.22 * v;

  if (soundId === "chime") {
    playTone(ctx, 523.25, t0, 0.18, baseGain * 0.9, "sine");
    playTone(ctx, 659.25, t0 + 0.12, 0.2, baseGain * 0.85, "sine");
    playTone(ctx, 783.99, t0 + 0.26, 0.28, baseGain * 0.8, "sine");
    return;
  }
  if (soundId === "alert") {
    for (let i = 0; i < 3; i++) {
      playTone(ctx, 880, t0 + i * 0.11, 0.08, baseGain * 1.1, "square");
    }
    return;
  }
  playTone(ctx, 523.25, t0, 0.14, baseGain, "sine");
  playTone(ctx, 659.25, t0 + 0.13, 0.16, baseGain * 0.95, "sine");
}

export function shouldPlayMessageFromSender(settings, senderIsDoctor) {
  if (!settings?.masterEnabled) return false;
  if (senderIsDoctor) return !!settings.notifyDoctorMessage;
  return !!settings.notifyPharmacistMessage;
}

export function notificationRowSoundCategory(row) {
  const type = String(row?.type || "");
  const title = String(row?.title || "");
  if (/appointment|reschedule/i.test(title) || /appointment/i.test(type)) return "appointment";
  if (type === "take_med" || type === "refill_upcoming" || type === "prescription_ready") return "medication";
  if (/dose|medication|refill|prescription|pill/i.test(title)) return "medication";
  return null;
}

export function shouldPlayNotificationCategory(settings, category) {
  if (!settings?.masterEnabled || category == null) return false;
  if (category === "appointment") return !!settings.notifyAppointment;
  if (category === "medication") return !!settings.notifyMedication;
  return false;
}
