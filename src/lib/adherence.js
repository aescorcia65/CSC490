import { supabase } from "../supabase";

/**
 * Get today's date string in YYYY-MM-DD (local time).
 */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Format a Date as YYYY-MM-DD.
 */
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Log a medication as taken for today.
 * Uses upsert (the unique index prevents duplicates).
 */
export async function logMedicationTaken(userId, medicationId) {
  const { error } = await supabase.from("medication_logs").upsert(
    { user_id: userId, medication_id: medicationId, scheduled_date: todayStr(), taken_at: new Date().toISOString() },
    { onConflict: "user_id,medication_id,scheduled_date" }
  );
  if (error) console.error("logMedicationTaken error:", error);
  return !error;
}

/**
 * Un-log a medication (mark as not taken) for today.
 */
export async function unlogMedicationTaken(userId, medicationId) {
  const { error } = await supabase.from("medication_logs")
    .delete()
    .eq("user_id", userId)
    .eq("medication_id", medicationId)
    .eq("scheduled_date", todayStr());
  if (error) console.error("unlogMedicationTaken error:", error);
  return !error;
}

/**
 * Load today's taken medication IDs (set of medication_id).
 */
export async function loadTodaysTaken(userId) {
  const { data, error } = await supabase.from("medication_logs")
    .select("medication_id")
    .eq("user_id", userId)
    .eq("scheduled_date", todayStr());
  if (error) {
    console.error("loadTodaysTaken error:", error);
    return new Set();
  }
  return new Set((data || []).map(r => r.medication_id));
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
