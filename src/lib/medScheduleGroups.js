import { FREQUENCY_OPTIONS } from "./medicationDatabase";

const FREQ_RANK = FREQUENCY_OPTIONS.reduce((acc, f, i) => {
  acc[f] = i;
  return acc;
}, {});

/** "8:00:00" | "08:00" -> "08:00" */
export function normalizeTimeHM(t) {
  const s = String(t || "08:00").trim();
  const parts = s.split(":");
  const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeHMToMins(hm) {
  const [h, mi] = normalizeTimeHM(hm).split(":").map(Number);
  return h * 60 + mi;
}

function minsToHM(mins) {
  let x = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(x / 60);
  const m = x % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addHoursHM(hm, hours) {
  return minsToHM(timeHMToMins(hm) + Math.round(hours * 60));
}

/** All clock times in a day, every `nHours` starting from anchor, until cycle repeats. */
function expandEveryNHours(anchorHM, nHours) {
  const first = normalizeTimeHM(anchorHM);
  const out = [];
  const seen = new Set();
  let t = first;
  while (!seen.has(t)) {
    seen.add(t);
    out.push(t);
    const next = addHoursHM(t, nHours);
    if (next === first) break;
    t = next;
  }
  return out.sort((a, b) => timeHMToMins(a) - timeHMToMins(b));
}

/**
 * Typical hours between doses for ring UI / spacing (null = use app default, e.g. once daily).
 * Matches the spacing used inside `expandDoseTimesForToday` for each frequency.
 */
export function getDoseSpacingHoursForMed(med) {
  const freq = String(med?.freq ?? "Once daily").trim() || "Once daily";
  if (/as needed|prn/i.test(freq)) return null;
  const everyM = /^every\s+(\d+)\s+hours?$/i.exec(freq);
  if (everyM) return Math.max(1, Math.min(24, parseInt(everyM[1], 10) || 8));
  switch (freq) {
    case "Every 4 hours":
      return 4;
    case "Every 6 hours":
      return 6;
    case "Every 8 hours":
      return 8;
    case "Every 12 hours":
      return 12;
    case "Twice daily":
      return 12;
    case "Three times daily":
      return 8;
    case "Four times daily":
      return 6;
    default:
      return null;
  }
}

/** Seconds to scale “next dose” ring: one dosing interval, clamped (falls back for PRN / once daily). */
export function ringMaxSecForMedSpacing(med, fallbackSec = 8 * 3600) {
  const h = getDoseSpacingHoursForMed(med);
  if (h == null) return fallbackSec;
  return Math.max(3600, Math.min(24 * 3600, h * 3600));
}

/**
 * All dose times today for one medication row (uses `time` as first/anchor dose and `freq`).
 */
export function expandDoseTimesForToday(med) {
  const anchor = normalizeTimeHM(med?.time);
  const freq = String(med?.freq ?? "Once daily").trim() || "Once daily";

  if (/as needed|prn/i.test(freq)) {
    return [anchor];
  }

  const everyM = /^every\s+(\d+)\s+hours?$/i.exec(freq);
  if (everyM) {
    const n = Math.max(1, Math.min(24, parseInt(everyM[1], 10) || 8));
    return expandEveryNHours(anchor, n);
  }

  switch (freq) {
    case "Every 4 hours":
      return expandEveryNHours(anchor, 4);
    case "Every 6 hours":
      return expandEveryNHours(anchor, 6);
    case "Every 8 hours":
      return expandEveryNHours(anchor, 8);
    case "Every 12 hours":
      return expandEveryNHours(anchor, 12);
    case "Twice daily": {
      const a = normalizeTimeHM(anchor);
      const b = addHoursHM(a, 12);
      return a === b ? [a] : [a, b].sort((x, y) => timeHMToMins(x) - timeHMToMins(y));
    }
    case "Three times daily": {
      const a = normalizeTimeHM(anchor);
      const times = [a, addHoursHM(a, 8), addHoursHM(a, 16)];
      return [...new Set(times)].sort((x, y) => timeHMToMins(x) - timeHMToMins(y));
    }
    case "Four times daily": {
      const a = normalizeTimeHM(anchor);
      const times = [a, addHoursHM(a, 6), addHoursHM(a, 12), addHoursHM(a, 18)];
      return [...new Set(times)].sort((x, y) => timeHMToMins(x) - timeHMToMins(y));
    }
    case "Once daily":
    case "At bedtime":
    case "With meals":
    case "Before meals":
    case "After meals":
    case "Once weekly":
    case "Twice weekly":
    case "Every other day":
    default:
      return [anchor];
  }
}

/** Time-of-day buckets (24h clock, minute precision). */
export const DAY_PERIOD_DEFS = [
  {
    id: "morning",
    label: "Morning",
    rangeLabel: "6 AM – 12 PM",
    inPeriod: (hm) => {
      const m = timeHMToMins(hm);
      return m >= 6 * 60 && m < 12 * 60;
    },
  },
  {
    id: "afternoon",
    label: "Afternoon",
    rangeLabel: "12 PM – 5 PM",
    inPeriod: (hm) => {
      const m = timeHMToMins(hm);
      return m >= 12 * 60 && m < 17 * 60;
    },
  },
  {
    id: "evening",
    label: "Evening",
    rangeLabel: "5 PM – 9 PM",
    inPeriod: (hm) => {
      const m = timeHMToMins(hm);
      return m >= 17 * 60 && m < 21 * 60;
    },
  },
  {
    id: "night",
    label: "Night",
    rangeLabel: "9 PM – 6 AM",
    inPeriod: (hm) => {
      const m = timeHMToMins(hm);
      return m >= 21 * 60 || m < 6 * 60;
    },
  },
];

/**
 * Build schedule rows grouped by time of day. Each row is one dose slot (expanded from freq).
 * @returns {Array<{ id: string, label: string, rangeLabel: string, rows: Array<{ med: object, slotTime: string }> }>}
 */
export function groupMedicationsByDayPeriod(meds) {
  const flat = [];
  for (const med of meds) {
    const slots = expandDoseTimesForToday(med);
    for (const slotTime of slots) {
      flat.push({ med, slotTime });
    }
  }

  return DAY_PERIOD_DEFS.map((p) => ({
    id: p.id,
    label: p.label,
    rangeLabel: p.rangeLabel,
    rows: flat.filter((r) => p.inPeriod(r.slotTime)).sort((a, b) => a.slotTime.localeCompare(b.slotTime)),
  })).filter((block) => block.rows.length > 0);
}

/** Normalize frequency label for grouping (trim; default Once daily). */
export function medFrequencyGroupKey(freq) {
  const f = String(freq ?? "").trim();
  return f || "Once daily";
}

/**
 * Group medications by their `freq` field, in the same order as the app's frequency dropdown.
 * Within each group, sort by reminder time.
 */
export function groupMedicationsByFrequency(meds) {
  const by = new Map();
  for (const m of meds) {
    const k = medFrequencyGroupKey(m.freq);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(m);
  }
  const keys = [...by.keys()].sort((a, b) => {
    const ia = FREQ_RANK[a];
    const ib = FREQ_RANK[b];
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.localeCompare(b);
  });
  return keys.map((label) => ({
    label,
    meds: [...by.get(label)].sort((x, y) => String(x.time).localeCompare(String(y.time))),
  }));
}
