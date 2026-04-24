import { supabase } from "../supabase";
import { normalizeTimeHM, expandDoseTimesForToday } from "./medScheduleGroups";

/**
 * Get today's date string in YYYY-MM-DD (local time).
 */
function todayStr() {
  return localDateStr(new Date());
}

/**
 * Format a Date as YYYY-MM-DD.
 */
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Format a Date-like value as YYYY-MM-DD in local time.
 */
export function localDateStr(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** True if this scheduled time today is logged for the med (or legacy whole-day log). */
export function doseRowLogged(med, slotHM) {
  if (med.loggedAllDay) return true;
  const slot = normalizeTimeHM(String(slotHM));
  return (med.loggedSlotTimes || []).includes(slot);
}

/** Every expanded slot for today has a log. */
export function allDoseSlotsLogged(med) {
  const slots = expandDoseTimesForToday(med);
  if (!slots.length) return false;
  return slots.every((s) => doseRowLogged(med, s));
}

/** Optimistic local state after logging/unlogging one slot. */
export function patchMedDoseToggle(med, slotHM, nowLogged) {
  const slot = normalizeTimeHM(String(slotHM));
  let loggedAllDay = !!med.loggedAllDay;
  let loggedSlotTimes = [...(med.loggedSlotTimes || [])];
  if (nowLogged) {
    if (loggedAllDay) return med;
    if (!loggedSlotTimes.includes(slot)) loggedSlotTimes.push(slot);
  } else if (loggedAllDay) {
    loggedAllDay = false;
    const all = expandDoseTimesForToday(med).map((s) => normalizeTimeHM(s));
    loggedSlotTimes = all.filter((s) => s !== slot);
  } else {
    loggedSlotTimes = loggedSlotTimes.filter((s) => s !== slot);
  }
  const taken = loggedAllDay || loggedSlotTimes.length > 0;
  return { ...med, loggedAllDay, loggedSlotTimes, taken };
}

/**
 * Log one scheduled dose (HH:MM today) or whole day if doseSlotHM omitted.
 * Granular logs clear a legacy whole-day row for that med; whole-day clears all rows for that med.
 */
export async function logMedicationTaken(userId, medicationId, doseSlotHM) {
  const useWholeDay = doseSlotHM == null || String(doseSlotHM).trim() === "";
  const slotNorm = useWholeDay ? "" : normalizeTimeHM(String(doseSlotHM));

  if (!useWholeDay) {
    await supabase.from("medication_logs").delete()
      .eq("user_id", userId)
      .eq("medication_id", medicationId)
      .eq("scheduled_date", todayStr())
      .eq("dose_slot", "");
  } else {
    await supabase.from("medication_logs").delete()
      .eq("user_id", userId)
      .eq("medication_id", medicationId)
      .eq("scheduled_date", todayStr());
  }

  const { error } = await supabase.from("medication_logs").insert({
    user_id: userId,
    medication_id: medicationId,
    scheduled_date: todayStr(),
    taken_at: new Date().toISOString(),
    dose_slot: slotNorm,
  });
  if (error) console.error("logMedicationTaken error:", error);
  return !error;
}

/**
 * Un-log: one slot if doseSlotHM provided, otherwise all logs for that med today.
 */
export async function unlogMedicationTaken(userId, medicationId, doseSlotHM) {
  const useWholeDay = doseSlotHM == null || String(doseSlotHM).trim() === "";
  let q = supabase.from("medication_logs").delete()
    .eq("user_id", userId)
    .eq("medication_id", medicationId)
    .eq("scheduled_date", todayStr());
  if (!useWholeDay) q = q.eq("dose_slot", normalizeTimeHM(String(doseSlotHM)));
  const { error } = await q;
  if (error) console.error("unlogMedicationTaken error:", error);
  return !error;
}

/** Map medication_id -> { all: legacy whole-day, slots: Set<HH:MM> } */
export async function loadTodaysTakenSlots(userId) {
  const { data, error } = await supabase.from("medication_logs")
    .select("medication_id, dose_slot")
    .eq("user_id", userId)
    .eq("scheduled_date", todayStr());
  if (error) {
    console.error("loadTodaysTakenSlots error:", error);
    return new Map();
  }
  const map = new Map();
  for (const row of data || []) {
    const id = row.medication_id;
    if (!map.has(id)) map.set(id, { all: false, slots: new Set() });
    const e = map.get(id);
    const ds = row.dose_slot != null ? String(row.dose_slot) : "";
    if (ds === "") e.all = true;
    else e.slots.add(normalizeTimeHM(ds));
  }
  return map;
}

/**
 * Load today's medication IDs that have at least one log row.
 */
export async function loadTodaysTaken(userId) {
  const m = await loadTodaysTakenSlots(userId);
  return new Set(m.keys());
}

/**
 * Get daily adherence for a date range via the DB function.
 * Returns [{ log_date, taken_count, total_count, adherence_pct }]
 */
export async function getDailyAdherence(userId, startDate, endDate) {
  const { data, error } = await supabase.rpc("get_daily_adherence", {
    p_user_id: userId,
    p_start: fmtDate(startDate),
    p_end: fmtDate(endDate),
  });
  if (error) {
    console.error("getDailyAdherence error:", error);
    return [];
  }
  return data || [];
}

/**
 * Get the current adherence streak (consecutive 100% days before today).
 */
export async function getAdherenceStreak(userId) {
  const { data, error } = await supabase.rpc("get_adherence_streak", {
    p_user_id: userId,
  });
  if (error) {
    console.error("getAdherenceStreak error:", error);
    return 0;
  }
  return data ?? 0;
}

/**
 * Longest run of 100% adherence days in a lookback window (calendar consecutive).
 * Returns { days, endDate: 'YYYY-MM-DD' | null } where endDate is the last day of the best run.
 */
export async function getBestAdherenceStreak(userId, lookbackDays = 400) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);
  start.setHours(0, 0, 0, 0);
  const daily = await getDailyAdherence(userId, start, end);
  if (!daily?.length) return { days: 0, endDate: null };

  const rows = daily
    .map((d) => {
      const logDate = typeof d.log_date === "string" ? d.log_date.slice(0, 10) : localDateStr(d.log_date);
      return { date: logDate, pct: Math.round(Number(d.adherence_pct) || 0) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  let best = 0;
  let bestEnd = null;
  let cur = 0;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].pct >= 100) {
      cur += 1;
      if (cur > best) {
        best = cur;
        bestEnd = rows[i].date;
      }
    } else {
      cur = 0;
    }
  }

  return { days: best, endDate: bestEnd };
}

/**
 * Get per-medication adherence for a date range.
 * Returns [{ medication_id, medication_name, color, days_taken, total_days, adherence_pct }]
 */
export async function getMedicationAdherence(userId, startDate, endDate) {
  const { data, error } = await supabase.rpc("get_medication_adherence", {
    p_user_id: userId,
    p_start: fmtDate(startDate),
    p_end: fmtDate(endDate),
  });
  if (error) {
    console.error("getMedicationAdherence error:", error);
    return [];
  }
  return data || [];
}

/**
 * Compute the start of the current week (Monday).
 */
export function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const mon = new Date(now);
  mon.setDate(now.getDate() - diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

/**
 * Get short day label for a date.
 */
export function dayLabel(dateStr) {
  const today = todayStr();
  if (dateStr === today) return "Today";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}
