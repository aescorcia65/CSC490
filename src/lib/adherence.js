import { supabase } from "../supabase";

/**
 * Local calendar date as YYYY-MM-DD (not UTC).
 */
export function localDateStr(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function todayStr() {
  return localDateStr(new Date());
}

/**
 * Format a Date as YYYY-MM-DD (local).
 */
function fmtDate(d) {
  return localDateStr(d);
}

/** Postgres / PostgREST duplicate-key style errors */
function isUniqueViolation(err) {
  if (!err) return false;
  const c = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  return c === "23505" || msg.includes("duplicate") || msg.includes("unique constraint");
}

/**
 * Log a dose as taken for `scheduledDate` (defaults to today). Uses insert, then
 * update on unique conflict so saves work even when upsert/UPDATE policy is misconfigured.
 */
export async function logMedicationTaken(userId, medicationId, scheduledDateStr) {
  const scheduled = scheduledDateStr || todayStr();
  const row = {
    user_id: userId,
    medication_id: medicationId,
    scheduled_date: scheduled,
    taken_at: new Date().toISOString(),
  };
  const { error: insErr } = await supabase.from("medication_logs").insert(row);
  if (!insErr) return true;
  if (isUniqueViolation(insErr)) {
    const { error: upErr } = await supabase.from("medication_logs")
      .update({ taken_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("medication_id", medicationId)
      .eq("scheduled_date", scheduled);
    if (upErr) console.error("logMedicationTaken update error:", upErr);
    return !upErr;
  }
  console.error("logMedicationTaken insert error:", insErr);
  return false;
}

/**
 * Remove log for a calendar day (defaults to today).
 */
export async function unlogMedicationTaken(userId, medicationId, scheduledDateStr) {
  const scheduled = scheduledDateStr || todayStr();
  const { error } = await supabase.from("medication_logs")
    .delete()
    .eq("user_id", userId)
    .eq("medication_id", medicationId)
    .eq("scheduled_date", scheduled);
  if (error) console.error("unlogMedicationTaken error:", error);
  return !error;
}

/**
 * Load taken medication IDs for one calendar day (local).
 */
export async function loadTakenForDate(userId, dateStr) {
  const { data, error } = await supabase.from("medication_logs")
    .select("medication_id")
    .eq("user_id", userId)
    .eq("scheduled_date", dateStr);
  if (error) {
    console.error("loadTakenForDate error:", error);
    return new Set();
  }
  return new Set((data || []).map(r => r.medication_id));
}

/**
 * Load today's taken medication IDs (set of medication_id).
 */
export async function loadTodaysTaken(userId) {
  return loadTakenForDate(userId, todayStr());
}

async function countActiveMedications(userId) {
  const { count, error } = await supabase.from("user_medications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .or("active.eq.true,active.is.null");
  if (error) {
    console.error("countActiveMedications error:", error);
    return 0;
  }
  return count ?? 0;
}

function normalizePgDate(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.slice(0, 10);
  return localDateStr(new Date(v));
}

function enumerateLocalDates(startDate, endDate) {
  const out = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  while (cur <= end) {
    out.push(localDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

async function getDailyAdherenceFallback(userId, startDate, endDate) {
  const pStart = fmtDate(startDate);
  const pEnd = fmtDate(endDate);
  const totalActive = await countActiveMedications(userId);
  const { data: rows, error } = await supabase.from("medication_logs")
    .select("scheduled_date")
    .eq("user_id", userId)
    .gte("scheduled_date", pStart)
    .lte("scheduled_date", pEnd);
  if (error) {
    console.error("getDailyAdherenceFallback query error:", error);
    return [];
  }
  const takenByDay = {};
  for (const r of rows || []) {
    const k = normalizePgDate(r.scheduled_date);
    takenByDay[k] = (takenByDay[k] || 0) + 1;
  }
  const days = enumerateLocalDates(startDate, endDate);
  return days.map((log_date) => {
    const taken_count = takenByDay[log_date] || 0;
    const total_count = totalActive;
    const adherence_pct = total_count === 0
      ? 0
      : Math.min(100, Math.round((taken_count / total_count) * 100));
    return { log_date, taken_count, total_count, adherence_pct };
  });
}

/**
 * Get daily adherence for a date range via the DB function, with client fallback.
 */
export async function getDailyAdherence(userId, startDate, endDate) {
  const { data, error } = await supabase.rpc("get_daily_adherence", {
    p_user_id: userId,
    p_start: fmtDate(startDate),
    p_end: fmtDate(endDate),
  });
  if (!error && data != null) return data;
  if (error) console.error("getDailyAdherence RPC error:", error);
  return getDailyAdherenceFallback(userId, startDate, endDate);
}

async function getAdherenceStreakFallback(userId) {
  const mc = await countActiveMedications(userId);
  if (mc === 0) return 0;
  const start = new Date();
  start.setDate(start.getDate() - 800);
  const pStart = localDateStr(start);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const pEnd = localDateStr(yesterday);
  const { data: rows, error } = await supabase.from("medication_logs")
    .select("scheduled_date")
    .eq("user_id", userId)
    .gte("scheduled_date", pStart)
    .lte("scheduled_date", pEnd);
  if (error) {
    console.error("getAdherenceStreakFallback error:", error);
    return 0;
  }
  const takenByDay = {};
  for (const r of rows || []) {
    const k = normalizePgDate(r.scheduled_date);
    takenByDay[k] = (takenByDay[k] || 0) + 1;
  }
  let streak = 0;
  let d = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
  for (;;) {
    const ds = localDateStr(d);
    if ((takenByDay[ds] || 0) < mc) break;
    streak += 1;
    d.setDate(d.getDate() - 1);
    if (streak > 730) break;
  }
  return streak;
}

/**
 * Get the current adherence streak (consecutive 100% days before today).
 */
export async function getAdherenceStreak(userId) {
  const { data, error } = await supabase.rpc("get_adherence_streak", {
    p_user_id: userId,
  });
  if (!error && data != null) return data;
  if (error) console.error("getAdherenceStreak RPC error:", error);
  return getAdherenceStreakFallback(userId);
}

async function getMedicationAdherenceFallback(userId, startDate, endDate) {
  const pStart = fmtDate(startDate);
  const pEnd = fmtDate(endDate);
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const total_days = Math.round((end - start) / msPerDay) + 1;

  const { data: meds, error: me } = await supabase.from("user_medications")
    .select("id, medication_name, color")
    .eq("user_id", userId)
    .or("active.eq.true,active.is.null")
    .order("medication_name");
  if (me) {
    console.error("getMedicationAdherenceFallback meds error:", me);
    return [];
  }

  const { data: logs, error: le } = await supabase.from("medication_logs")
    .select("medication_id, scheduled_date")
    .eq("user_id", userId)
    .gte("scheduled_date", pStart)
    .lte("scheduled_date", pEnd);
  if (le) {
    console.error("getMedicationAdherenceFallback logs error:", le);
    return [];
  }

  const distinctDaysByMed = {};
  for (const r of logs || []) {
    const mid = r.medication_id;
    const day = normalizePgDate(r.scheduled_date);
    if (!distinctDaysByMed[mid]) distinctDaysByMed[mid] = new Set();
    distinctDaysByMed[mid].add(day);
  }

  return (meds || []).map((um) => {
    const days_taken = distinctDaysByMed[um.id]?.size ?? 0;
    const adherence_pct = total_days === 0
      ? 0
      : Math.min(100, Math.round((days_taken / total_days) * 100));
    return {
      medication_id: um.id,
      medication_name: um.medication_name,
      color: um.color || "blue",
      days_taken,
      total_days,
      adherence_pct,
    };
  });
}

/**
 * Get per-medication adherence for a date range.
 */
export async function getMedicationAdherence(userId, startDate, endDate) {
  const { data, error } = await supabase.rpc("get_medication_adherence", {
    p_user_id: userId,
    p_start: fmtDate(startDate),
    p_end: fmtDate(endDate),
  });
  if (!error && data != null) return data;
  if (error) console.error("getMedicationAdherence RPC error:", error);
  return getMedicationAdherenceFallback(userId, startDate, endDate);
}

/**
 * Compute the start of the current week (Monday).
 */
export function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const mon = new Date(now);
  mon.setDate(now.getDate() - diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

/**
 * Start of week (Monday) for any local calendar day.
 */
export function getWeekStartForDate(ref) {
  const d = ref instanceof Date ? ref : new Date(ref);
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Get short day label for a date.
 */
export function dayLabel(dateStr) {
  const norm = typeof dateStr === "string" ? dateStr.slice(0, 10) : localDateStr(new Date(dateStr));
  const today = todayStr();
  if (norm === today) return "Today";
  const d = new Date(norm + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}
