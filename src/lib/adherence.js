import { supabase } from "../supabase";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function logDoseTaken(userId, medicationId, doseIndex = 0) {
  const { error } = await supabase.from("medication_logs").upsert(
    { user_id: userId, medication_id: medicationId, scheduled_date: todayStr(), dose_index: doseIndex, taken_at: new Date().toISOString() },
    { onConflict: "user_id,medication_id,scheduled_date,dose_index" }
  );
  if (error) console.error("logDoseTaken error:", error);
  return !error;
}

export async function unlogDoseTaken(userId, medicationId, doseIndex = 0) {
  const { error } = await supabase.from("medication_logs")
    .delete()
    .eq("user_id", userId).eq("medication_id", medicationId)
    .eq("scheduled_date", todayStr()).eq("dose_index", doseIndex);
  if (error) console.error("unlogDoseTaken error:", error);
  return !error;
}

export async function loadTodaysDoseLogs(userId) {
  const { data, error } = await supabase.from("medication_logs")
    .select("medication_id, dose_index")
    .eq("user_id", userId).eq("scheduled_date", todayStr());
  if (error) { console.error("loadTodaysDoseLogs error:", error); return []; }
  return data || [];
}

// Legacy compat
export async function logMedicationTaken(userId, medicationId) { return logDoseTaken(userId, medicationId, 0); }
export async function unlogMedicationTaken(userId, medicationId) { return unlogDoseTaken(userId, medicationId, 0); }
export async function loadTodaysTaken(userId) {
  const logs = await loadTodaysDoseLogs(userId);
  return new Set(logs.map(r => r.medication_id));
}

export async function getDailyAdherence(userId, startDate, endDate) {
  const { data, error } = await supabase.rpc("get_daily_adherence", { p_user_id: userId, p_start: fmtDate(startDate), p_end: fmtDate(endDate) });
  if (error) { console.error("getDailyAdherence error:", error); return []; }
  return data || [];
}

export async function getAdherenceStreak(userId) {
  const { data, error } = await supabase.rpc("get_adherence_streak", { p_user_id: userId });
  if (error) { console.error("getAdherenceStreak error:", error); return 0; }
  return data ?? 0;
}

export async function getMedicationAdherence(userId, startDate, endDate) {
  const { data, error } = await supabase.rpc("get_medication_adherence", { p_user_id: userId, p_start: fmtDate(startDate), p_end: fmtDate(endDate) });
  if (error) { console.error("getMedicationAdherence error:", error); return []; }
  return data || [];
}

export function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const mon = new Date(now);
  mon.setDate(now.getDate() - diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

export function dayLabel(dateStr) {
  const today = todayStr();
  if (dateStr === today) return "Today";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}