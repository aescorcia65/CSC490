import { supabase } from "../supabase";
import { normalizeTimeHM, expandDoseTimesForToday } from "./medScheduleGroups";

function formatPostgrestDoseError(err) {
  const msg = String(err?.message || err || "Unknown error");
  const code = String(err?.code || "");
  if (/permission denied|row-level security|violates row-level/i.test(msg) || code === "42501") {
    return `${msg} (Supabase RLS blocked this. Run the SQL migration for medication_logs in the Supabase SQL editor.)`;
  }
  if (/relation|does not exist/i.test(msg) && /medication_logs/i.test(msg)) {
    return `${msg} (Create the medication_logs table — see supabase/migrations in the repo.)`;
  }
  return msg;
}

/** @returns {{ ok: true } | { ok: false, error: string }} */
let reloadDebounceTimer = null;
/** @type {Array<() => void>} */
let reloadDebounceResolvers = [];

export async function reloadAfterDoseMark(loadUserMeds) {
  // Wait long enough for PostgREST reads to include the new dose row.
  // This prevents the common transient 1→0→1 bounce after tapping "log dose".
  // Debounce: rapid taps coalesce into one refresh.
  return new Promise((resolve) => {
    reloadDebounceResolvers.push(resolve);
    if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer);
    reloadDebounceTimer = setTimeout(async () => {
      reloadDebounceTimer = null;
      const completes = [...reloadDebounceResolvers];
      reloadDebounceResolvers.length = 0;
      try {
        await loadUserMeds();
      } catch (e) {
        console.error("reloadAfterDoseMark:", e);
      } finally {
        completes.forEach((r) => r());
      }
    }, 1300);
  });
}

function todayStr() {
  return localDateStr(new Date());
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function localDateStr(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Stable key for merging medication_logs rows with user_medications (UUID string variants). */
export function medicationIdMatchKey(id) {
  if (id == null) return "";
  const s = String(id).trim();
  // Lowercase canonical form so Map lookup matches Postgres uuid text
  try {
    if (/^[0-9a-f-]{36}$/i.test(s)) return s.replace(/-/g, "").toLowerCase();
  } catch {/* ignore */}
  return s.toLowerCase();
}

export function doseRowLogged(med, slotHM) {
  if (med.loggedAllDay) return true;
  const slot = normalizeTimeHM(String(slotHM));
  return (med.loggedSlotTimes || []).includes(slot);
}

export function allDoseSlotsLogged(med) {
  const slots = expandDoseTimesForToday(med);
  if (!slots.length) return false;
  return slots.every((s) => doseRowLogged(med, s));
}

/** Postgres duplicate-key style errors (legacy table: one row per user/med/day). */
function isUniqueViolation(err) {
  if (!err) return false;
  const c = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  return (
    c === "23505"
    || msg.includes("duplicate")
    || msg.includes("unique constraint")
    || msg.includes("already exists")
  );
}

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
 * Mark dose taken: INSERT today's row for the specific dose slot, or UPDATE if it exists.
 *
 * Older DB schemas sometimes had UNIQUE (user_id, medication_id, scheduled_date) without
 * dose_slot — second dose same day hits duplicate errors. Migrate legacy rows with dose_slot=""
 * into the clicked slot before INSERT, and require per-slot UNIQUE in Postgres (see migration).
 */
export async function logMedicationTaken(userId, medicationId, doseSlotHM) {
  if (!userId) return { ok: false, error: "Not signed in." };

  const day = todayStr();
  const takenAt = new Date().toISOString();
  const useWholeDay = doseSlotHM == null || String(doseSlotHM).trim() === "";
  const slotNorm = useWholeDay ? "" : normalizeTimeHM(String(doseSlotHM));

  const base = {
    user_id: userId,
    medication_id: medicationId,
    scheduled_date: day,
    taken_at: takenAt,
    dose_slot: slotNorm,
  };

  /** PostgREST update returns error=null even when 0 rows match — verify with .select() */
  async function bump() {
    const { data, error } = await supabase.from("medication_logs")
      .update({ taken_at: takenAt })
      .eq("user_id", userId)
      .eq("medication_id", medicationId)
      .eq("scheduled_date", day)
      .eq("dose_slot", slotNorm)
      .select("id");
    if (error) return { ok: false, error };
    if (!(data?.length)) return { ok: false };
    return { ok: true };
  }

  async function migrateLegacyBlankRowToSlot() {
    if (useWholeDay) return false;
    const { data, error } = await supabase.from("medication_logs")
      .update({ taken_at: takenAt, dose_slot: slotNorm })
      .eq("user_id", userId)
      .eq("medication_id", medicationId)
      .eq("scheduled_date", day)
      .eq("dose_slot", "")
      .select("id");
    if (error) {
      console.error("migrateLegacyBlankRowToSlot:", error.message);
      return false;
    }
    return !!(data?.length);
  }

  async function insertBase() {
    const { data, error } = await supabase.from("medication_logs").insert(base).select("id");
    if (error) return error;
    if (!(data?.length)) return { message: "Insert returned no rows (check RLS or constraints)." };
    return null;
  }

  // If logging a concrete time: turn an old blanket row (dose_slot = '') into this slot instead of inserting.
  const migratedFirst = await migrateLegacyBlankRowToSlot();
  if (migratedFirst) return { ok: true };

  let error = await insertBase();
  if (!error) return { ok: true };
  if (isUniqueViolation(error)) {
    await migrateLegacyBlankRowToSlot(); // concurrent insert may have left blank row
    const dupErr = await insertBase();
    if (!dupErr) return { ok: true };
    const bumpRes = await bump();
    if (bumpRes.ok) return { ok: true };
    console.error("logMedicationTaken duplicate unresolved:", dupErr?.message || dupErr);
    return {
      ok: false,
      error: "Could not save this dose (often: only one dose per medication per day is allowed in Supabase until you run supabase/migrations/20260428200000_medication_logs_unique_per_slot.sql). Ask your Admin to migrate the medication_logs constraint.",
    };
  }

  // If dose_slot column missing (schema not migrated yet), fall back to inserting without it.
  if (/dose_slot|schema cache|Could not find/i.test(String(error?.message || ""))) {
    const fallback = { user_id: userId, medication_id: medicationId, scheduled_date: day, taken_at: takenAt };
    const { data: fbData, error: fe } = await supabase.from("medication_logs").insert(fallback).select("id");
    if (!fe && fbData?.length) return { ok: true };
    if (!fe && !fbData?.length) return { ok: false, error: formatPostgrestDoseError({ message: "Insert returned no rows (check RLS)." }) };
    if (fe && isUniqueViolation(fe)) {
      const { data: ud, error: ue } = await supabase.from("medication_logs")
        .update({ taken_at: takenAt })
        .eq("user_id", userId)
        .eq("medication_id", medicationId)
        .eq("scheduled_date", day)
        .select("id");
      if (!ue && ud?.length) return { ok: true };
      return { ok: false, error: formatPostgrestDoseError(ue || fe) };
    }
    error = fe;
  }

  if (/outcome|column|schema|PGRST/i.test(String(error?.message || ""))) {
    const { data: dd, error: e2 } = await supabase.from("medication_logs").insert({ ...base, outcome: "taken" }).select("id");
    if (!e2 && dd?.length) return { ok: true };
    if (!e2 && !dd?.length) return { ok: false, error: formatPostgrestDoseError({ message: "Insert returned no rows." }) };
    if (e2 && isUniqueViolation(e2)) {
      const migrated = await migrateLegacyBlankRowToSlot();
      if (!migrated) {
        const bumpRes = await bump();
        if (!bumpRes.ok) {
          const msg = bumpRes.error?.message ? formatPostgrestDoseError(bumpRes.error) : "Could not update dose row.";
          return { ok: false, error: msg };
        }
        return { ok: true };
      }
      const dupErr = await insertBase();
      return dupErr ? { ok: false, error: formatPostgrestDoseError(dupErr) } : { ok: true };
    }
    if (e2) error = e2;
  }

  console.error("logMedicationTaken:", error?.message, error?.code || "", error?.details || "");
  return { ok: false, error: formatPostgrestDoseError(error) };
}

/**
 * Remove today's log for a specific dose slot. If no slot provided, removes all rows for the day.
 * Filtering by dose_slot ensures other logged slots for the same medication are not affected.
 */
export async function unlogMedicationTaken(userId, medicationId, doseSlotHM) {
  if (!userId) return { ok: false, error: "Not signed in." };

  const useWholeDay = doseSlotHM == null || String(doseSlotHM).trim() === "";
  const slotNorm = useWholeDay ? null : normalizeTimeHM(String(doseSlotHM));

  let q = supabase.from("medication_logs")
    .delete()
    .eq("user_id", userId)
    .eq("medication_id", medicationId)
    .eq("scheduled_date", todayStr());

  // When a specific slot is provided, only delete that slot's row so other
  // logged slots for the same medication are not wiped.
  if (slotNorm !== null) q = q.eq("dose_slot", slotNorm);

  const { error } = await q;
  if (error) console.error("unlogMedicationTaken error:", error);
  return error ? { ok: false, error: formatPostgrestDoseError(error) } : { ok: true };
}

/**
 * Record missed or skipped (same-day slot). Replaces any same-slot log for that day.
 */
export async function logMedicationDoseOutcome(userId, medicationId, doseSlotHM, outcome) {
  const o = String(outcome || "").toLowerCase();
  if (o !== "missed" && o !== "skipped") return false;
  const useWholeDay = doseSlotHM == null || String(doseSlotHM).trim() === "";
  const slotNorm = useWholeDay ? "" : normalizeTimeHM(String(doseSlotHM));
  const day = todayStr();
  if (!useWholeDay) {
    await supabase
      .from("medication_logs")
      .delete()
      .eq("user_id", userId)
      .eq("medication_id", medicationId)
      .eq("scheduled_date", day)
      .eq("dose_slot", "");
  }
  let q = supabase
    .from("medication_logs")
    .delete()
    .eq("user_id", userId)
    .eq("medication_id", medicationId)
    .eq("scheduled_date", day);
  if (!useWholeDay) q = q.eq("dose_slot", slotNorm);
  await q;
  const payload = {
    user_id: userId,
    medication_id: medicationId,
    scheduled_date: day,
    taken_at: new Date().toISOString(),
    dose_slot: slotNorm,
  };
  let { error } = await supabase.from("medication_logs").insert({ ...payload, outcome: o });
  if (error && /outcome|schema|column/i.test(String(error.message || ""))) {
    ({ error } = await supabase.from("medication_logs").insert(payload));
  }
  if (error) console.error("logMedicationDoseOutcome:", error);
  return !error;
}

/**
 * Recent dose log rows for persistence / history (taken = row exists; taken_at = timestamp).
 */
export async function loadMedicationDoseLogRows(userId, opts = {}) {
  if (!userId) return [];
  const lookback = Number.isFinite(opts.lookbackDays) ? opts.lookbackDays : 90;
  const start = new Date();
  start.setDate(start.getDate() - lookback);
  const startStr = fmtDate(start);
  const { data, error } = await supabase
    .from("medication_logs")
    .select("medication_id, scheduled_date, dose_slot, taken_at, user_id")
    .eq("user_id", userId)
    .gte("scheduled_date", startStr)
    .order("scheduled_date", { ascending: false })
    .order("taken_at", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("loadMedicationDoseLogRows:", error.message);
    return [];
  }
  return data || [];
}

export async function loadTodaysTakenSlots(userId) {
  const { data, error } = await supabase
    .from("medication_logs")
    .select("medication_id, dose_slot")
    .eq("user_id", userId)
    .eq("scheduled_date", todayStr());
  if (error) {
    console.error("loadTodaysTakenSlots error:", error);
    return new Map();
  }
  const map = new Map();
  for (const row of data || []) {
    const id = medicationIdMatchKey(row.medication_id);
    if (!id) continue;
    if (!map.has(id)) map.set(id, { all: false, slots: new Set() });
    const e = map.get(id);
    const ds = row.dose_slot != null ? String(row.dose_slot) : "";
    if (ds === "") e.all = true;
    else e.slots.add(normalizeTimeHM(ds));
  }
  return map;
}

export async function loadTodaysTaken(userId) {
  const m = await loadTodaysTakenSlots(userId);
  return new Set(m.keys());
}

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

export function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
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
