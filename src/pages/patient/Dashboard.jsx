import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Pill, Calendar, Plus, CheckCircle2, Check, Flame, TrendingUp, MessageCircle, AlertTriangle, ChevronRight, ChevronDown, Pencil, Clock, Bell, Lightbulb, Moon, Sun, Utensils, Sparkles, Stethoscope, X } from "lucide-react";
import { supabase } from "../../supabase";
import { TIPS } from "../../lib/constants";
import { to12h, to12hNoSeconds, to24h } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useClock } from "../../hooks/useClock";
import Ring from "../../components/common/Ring";
import { logMedicationTaken, unlogMedicationTaken, getAdherenceStreak, doseRowLogged, patchMedDoseToggle } from "../../lib/adherence";
import { expandDoseTimesForToday, timeHMToMins, ringMaxSecForMedSpacing } from "../../lib/medScheduleGroups";
import { openExternalLink } from "../../lib/openExternalLink";

const DASHBOARD_HEALTH_TIPS_URL = "https://medlineplus.gov/druginformation.html";
const HEALTH_TIP_DISMISS_STORAGE_KEY = "mt_dashboard_health_tip_dismissed";

function formatInApprox(sec) {
  if (sec == null || sec < 0) return "—";
  const s = Math.floor(sec);
  if (s < 60) return "in less than a minute";
  const hours = s / 3600;
  if (hours >= 1) {
    const h = Math.round(hours);
    return `in ${h} hour${h === 1 ? "" : "s"}`;
  }
  const m = Math.max(1, Math.round(s / 60));
  return `in ${m} minute${m === 1 ? "" : "s"}`;
}

function formatCountdownHM(sec) {
  if (sec == null || sec < 0) return "—";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secRem = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(secRem).padStart(2, "0")}`;
  return `${m}:${String(secRem).padStart(2, "0")}`;
}

const NEXT_HOUR_SEC = 3600;
const NEXT_DOSE_RING_FALLBACK_SEC = 8 * 3600;

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Normalize Supabase date or ISO string to YYYY-MM-DD for local parsing */
function appointmentDateOnly(appt) {
  if (!appt?.date) return null;
  const s = String(appt.date).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function calendarDaysFromTodayFor(apptWhen, now) {
  if (!apptWhen) return null;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startAppt = new Date(apptWhen.getFullYear(), apptWhen.getMonth(), apptWhen.getDate());
  return Math.round((startAppt.getTime() - startToday.getTime()) / 86400000);
}

function appointmentDateTime(appt) {
  const dateOnly = appointmentDateOnly(appt);
  if (!dateOnly) return null;
  let rawTime = String(appt.time != null && appt.time !== "" ? appt.time : "12:00").trim();
  if (!/^\d{2}:\d{2}/.test(rawTime) && /AM|PM/i.test(rawTime)) {
    rawTime = to24h(rawTime);
  }
  const normalizedTime = /^\d{2}:\d{2}(:\d{2})?$/.test(rawTime)
    ? (rawTime.length === 5 ? `${rawTime}:00` : rawTime)
    : "12:00:00";
  const dt = new Date(`${dateOnly}T${normalizedTime}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function summarizeNextDoseMeds(medsAtSlot) {
  if (!medsAtSlot?.length) return "";
  if (medsAtSlot.length === 1) return medsAtSlot[0].name;
  if (medsAtSlot.length === 2) return `${medsAtSlot[0].name} · ${medsAtSlot[1].name}`;
  return `${medsAtSlot.length} medications at this time`;
}

function shortPillName(name) {
  const s = String(name).replace(/\s*\([^)]*\)\s*/g, "").trim() || String(name);
  return s.length > 24 ? `${s.slice(0, 22)}…` : s;
}

function formatDueSoonNames(meds) {
  if (!meds.length) return "";
  const parts = meds.slice(0, 4).map((m) => shortPillName(m.name));
  if (meds.length > 4) parts.push(`+${meds.length - 4}`);
  return parts.join(" · ");
}

function formatNextUpMedLine(medsAtSlot) {
  if (!medsAtSlot?.length) return null;
  if (medsAtSlot.length === 1) return medsAtSlot[0].name;
  if (medsAtSlot.length === 2) return `${medsAtSlot[0].name} · ${medsAtSlot[1].name}`;
  return `${medsAtSlot[0].name} · ${medsAtSlot[1].name} +${medsAtSlot.length - 2} more`;
}

function sameMedIdSet(a, b) {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((m) => m.id));
  return b.every((m) => ids.has(m.id));
}

function buildTodaysDoseRows(meds) {
  const rows = [];
  const seenByName = new Set();
  const seenById = new Set();
  for (const m of meds) {
    for (const slotTime of expandDoseTimesForToday(m)) {
      const nameKey = `${String(m.name || "").toLowerCase().trim()}|${slotTime}`;
      const idKey = `${String(m.id || "").trim()}|${slotTime}`;
      if (seenByName.has(nameKey) || seenById.has(idKey)) continue;
      seenByName.add(nameKey);
      seenById.add(idKey);
      rows.push({ med: m, slotTime });
    }
  }
  rows.sort((a, b) => {
    const d = timeHMToMins(a.slotTime) - timeHMToMins(b.slotTime);
    if (d !== 0) return d;
    return String(a.med.name || "").localeCompare(String(b.med.name || ""), undefined, { sensitivity: "base", numeric: true });
  });
  return rows;
}

function doseRowsDueInNextHour(untakenRows, curSec) {
  return untakenRows
    .filter((r) => {
      const tsec = timeHMToMins(r.slotTime) * 60;
      if (tsec <= curSec) return false;
      return tsec - curSec <= NEXT_HOUR_SEC;
    })
    .sort((a, b) => timeHMToMins(a.slotTime) - timeHMToMins(b.slotTime));
}

export default function Dashboard({ user, meds, setMeds, onAdd, displayName, onEditName, onNavigateTab }) {
  const now = useClock();
  const isMob = useIsMobile();
  const hr = now.getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const name = displayName || user?.displayName || user?.email?.split("@")[0] || "there";
  const curMins = hr * 60 + now.getMinutes();
  const medList = Array.isArray(meds) ? meds : [];
  const medCount = medList.length;
  const todaysDoseRows = useMemo(() => buildTodaysDoseRows(medList), [medList]);
  const totalDoseSlots = todaysDoseRows.length;
  const takenDoseSlots = useMemo(() => todaysDoseRows.filter((r) => doseRowLogged(r.med, r.slotTime)).length, [todaysDoseRows]);
  const adherencePctSlots = totalDoseSlots ? Math.round((takenDoseSlots / totalDoseSlots) * 100) : 0;

  const [showMoreSidebarDoses, setShowMoreSidebarDoses] = useState(false);
  const healthTipDayKey = now.toDateString();
  const [healthTipDismissed, setHealthTipDismissed] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HEALTH_TIP_DISMISS_STORAGE_KEY);
      setHealthTipDismissed(saved === healthTipDayKey);
    } catch {
      setHealthTipDismissed(false);
    }
  }, [healthTipDayKey]);
  const pendingDoseRows = useMemo(() => todaysDoseRows.filter((r) => !doseRowLogged(r.med, r.slotTime)), [todaysDoseRows]);
  const sidebarDoseList = showMoreSidebarDoses ? pendingDoseRows : pendingDoseRows.slice(0, 4);
  const hasMoreSidebarDoses = pendingDoseRows.length > 4;

  const overdueDoseRows = useMemo(() => {
    const rows = [];
    const seenByName = new Set();
    const seenById = new Set();
    for (const m of medList) {
      const slots = expandDoseTimesForToday(m);
      const past = slots
        .filter((s) => timeHMToMins(s) < curMins && !doseRowLogged(m, s))
        .sort((a, b) => timeHMToMins(a) - timeHMToMins(b));
      for (const slotTime of past) {
        const nameKey = `${String(m.name || "").toLowerCase().trim()}|${slotTime}`;
        const idKey = `${String(m.id || "").trim()}|${slotTime}`;
        if (seenByName.has(nameKey) || seenById.has(idKey)) continue;
        seenByName.add(nameKey);
        seenById.add(idKey);
        rows.push({ med: m, slotTime });
      }
    }
    rows.sort((a, b) => {
      const d = timeHMToMins(a.slotTime) - timeHMToMins(b.slotTime);
      if (d !== 0) return d;
      return String(a.med.name || "").localeCompare(String(b.med.name || ""), undefined, { sensitivity: "base", numeric: true });
    });
    return rows;
  }, [medList, curMins]);

  const overdueDoseCount = overdueDoseRows.length;

  const [streak, setStreak] = useState(0);
  const [apptProvider, setApptProvider] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [notifPreview, setNotifPreview] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    getAdherenceStreak(user.id).then(setStreak);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const refreshNotifs = () => {
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null).then(({ count }) => setUnreadNotifCount(count || 0));
      supabase.from("notifications").select("id,title,body").eq("user_id", user.id).is("read_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setNotifPreview(data || null));
    };
    refreshNotifs();
    const ch = supabase.channel(`dash-n-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refreshNotifs).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const todayStr = localDateStr(new Date());
    supabase.from("appointments")
      .select("id,date,time,type,notes,status,doctor_id")
      .eq("patient_id", user.id)
      .in("status", ["scheduled", "rescheduled"])
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .limit(20)
      .then(({ data }) => setAppointments(data || []));

    const ch = supabase.channel(`pt-appt-dash-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `patient_id=eq.${user.id}` }, () => {
        const tStr = localDateStr(new Date());
        supabase.from("appointments").select("id,date,time,type,notes,status,doctor_id").eq("patient_id", user.id).in("status", ["scheduled", "rescheduled"]).gte("date", tStr).order("date", { ascending: true }).limit(20)
          .then(({ data }) => setAppointments(data || []));
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const { nextAppt, nextApptWhen } = useMemo(() => {
    const nowMs = now.getTime();
    const upcoming = appointments
      .map((appt) => ({ appt, when: appointmentDateTime(appt) }))
      .filter(({ when }) => when && when.getTime() >= nowMs)
      .sort((a, b) => a.when.getTime() - b.when.getTime());
    const first = upcoming[0];
    return first ? { nextAppt: first.appt, nextApptWhen: first.when } : { nextAppt: null, nextApptWhen: null };
  }, [appointments, now]);
  const daysToAppt = calendarDaysFromTodayFor(nextApptWhen, now);
  const apptDayLabel = daysToAppt == null || daysToAppt < 0
    ? null
    : daysToAppt === 0
      ? "Today"
      : daysToAppt === 1
        ? "Tomorrow"
        : `In ${daysToAppt} days`;

  useEffect(() => {
    const id = nextAppt?.doctor_id;
    if (!id) {
      setApptProvider(null);
      return;
    }
    let cancel = false;
    supabase.from("profiles").select("first_name,last_name,specialty,role").eq("id", id).single().then(({ data, error }) => {
      if (cancel || error || !data) return;
      const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
      const spec = typeof data.specialty === "string" && data.specialty.trim() ? data.specialty.trim() : "";
      let kindLabel = spec;
      if (!kindLabel && data.role === "doctor") kindLabel = "Physician";
      if (!kindLabel && data.role) kindLabel = data.role.charAt(0).toUpperCase() + data.role.slice(1);
      setApptProvider(fullName || kindLabel ? { fullName, kindLabel: kindLabel || "" } : null);
    });
    return () => { cancel = true; };
  }, [nextAppt?.doctor_id]);

  const nextDoseHero = useMemo(() => {
    const cur = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const slotSec = (hm) => timeHMToMins(hm) * 60;
    const allRows = buildTodaysDoseRows(medList);
    const untakenRows = allRows.filter((r) => !doseRowLogged(r.med, r.slotTime));
    // Only future (non-overdue) untaken rows drive the next-dose countdown.
    // Overdue doses remain visible in the schedule list but should not control the timer.
    const futureUntakenRows = untakenRows.filter((r) => slotSec(r.slotTime) > cur);

    if (!futureUntakenRows.length) {
      // All doses either taken or overdue — show next dose tomorrow (same schedule repeats).
      if (!medList.length) {
        return {
          ringLabel: "Next dose",
          centerMain: "—",
          timeHint: null,
          nextUpNames: null,
          statusLine: "No medications yet",
          namesSummary: "Add meds to see your schedule",
          dueSoonNames: null,
          ringPct: 100,
          firstMed: null,
          firstSlotTime: null,
          allComplete: false,
          secUntil: null,
        };
      }
      const sortedNextDay = [...allRows].sort((a, b) => slotSec(a.slotTime) - slotSec(b.slotTime));
      // Prefer tomorrow's first dose whose slot time was NOT missed today.
      // This prevents "Tomorrow at 12:00 AM" when midnight is a wrap-around dose
      // from "Three times daily" but the user has morning/afternoon doses scheduled.
      const missedSlotTimes = new Set(untakenRows.map((r) => r.slotTime));
      const first = sortedNextDay.find((r) => !missedSlotTimes.has(r.slotTime)) || sortedNextDay[0];
      if (!first) {
        return {
          ringLabel: "Next dose",
          centerMain: "—",
          timeHint: null,
          nextUpNames: null,
          statusLine: "No doses scheduled",
          namesSummary: null,
          dueSoonNames: null,
          ringPct: 100,
          firstMed: null,
          firstSlotTime: null,
          allComplete: false,
          secUntil: null,
        };
      }
      const tsec = slotSec(first.slotTime);
      const secUntil = 86400 - cur + tsec;
      const sameSlotMeds = sortedNextDay.filter((r) => r.slotTime === first.slotTime).map((r) => r.med);
      const ringMaxSec = ringMaxSecForMedSpacing(first.med, NEXT_DOSE_RING_FALLBACK_SEC);
      const ringPct = Math.min(100, Math.max(12, 100 - (secUntil / ringMaxSec) * 40));
      return {
        ringLabel: "Next dose",
        centerMain: formatInApprox(secUntil),
        timeHint: `Tomorrow at ${to12h(first.slotTime)}`,
        nextUpNames: formatNextUpMedLine(sameSlotMeds),
        // statusLine only renders when firstMed is null; shown as "all done" either way.
        statusLine: untakenRows.length === 0 ? "All medications taken today" : "No more doses today",
        namesSummary: null,
        dueSoonNames: null,
        ringPct,
        firstMed: first.med,
        firstSlotTime: first.slotTime,
        // Always true here: we are showing tomorrow's dose, not a same-day slot.
        // The "Upcoming" card uses allComplete to decide whether to display timeHint ("Tomorrow at X").
        allComplete: true,
        secUntil,
      };
    }

    // Sort future untaken rows by time; these are all strictly after "now".
    const sorted = [...futureUntakenRows].sort((a, b) => slotSec(a.slotTime) - slotSec(b.slotTime) || String(a.med.name).localeCompare(String(b.med.name), undefined, { sensitivity: "base", numeric: true }));
    const first = sorted[0];
    const tsec = slotSec(first.slotTime);
    const secUntil = tsec - cur; // Always positive: futureUntakenRows guarantees tsec > cur
    const ringMaxSec = ringMaxSecForMedSpacing(first.med, NEXT_DOSE_RING_FALLBACK_SEC);
    const ringPct = Math.min(100, Math.max(12, 100 - (secUntil / ringMaxSec) * 40));

    const primaryGroupMeds = sorted.filter((r) => r.slotTime === first.slotTime).map((r) => r.med);
    const nextUpNames = formatNextUpMedLine(primaryGroupMeds);

    const dueSoonRows = doseRowsDueInNextHour(futureUntakenRows, cur);
    let dueSoonNames = dueSoonRows.length ? formatDueSoonNames(dueSoonRows.map((r) => r.med)) : null;
    if (dueSoonRows.length && sameMedIdSet(primaryGroupMeds, dueSoonRows.map((r) => r.med))) {
      dueSoonNames = null;
    }

    let namesSummary = null;
    if (dueSoonNames) {
      const later = sorted.filter((r) => slotSec(r.slotTime) > cur + NEXT_HOUR_SEC);
      if (later.length) {
        const t0 = later[0].slotTime;
        const group = later.filter((r) => r.slotTime === t0).map((r) => r.med);
        namesSummary = `Then ${to12h(t0)} · ${summarizeNextDoseMeds(group)}`;
      }
    } else {
      const rest = sorted.filter((r) => r.slotTime !== first.slotTime);
      if (rest.length) {
        const line = rest.slice(0, 2).map((r) => r.med.name).join(", ");
        const more = rest.length - 2;
        namesSummary = more > 0 ? `Later: ${line} +${more} more` : `Later: ${line}`;
      } else {
        namesSummary = null;
      }
    }

    return {
      ringLabel: "Next dose",
      centerMain: formatInApprox(secUntil),
      timeHint: `Today at ${to12h(first.slotTime)}`,
      nextUpNames,
      statusLine: null,
      namesSummary,
      dueSoonNames,
      ringPct,
      firstMed: first.med,
      firstSlotTime: first.slotTime,
      allComplete: false,
      secUntil,
    };
  }, [medList, now]);

  const toggle = useCallback(async (id, slotTime) => {
    const med = medList.find((m) => m.id === id);
    if (!med || slotTime == null || String(slotTime).trim() === "") return;
    const wasLogged = doseRowLogged(med, slotTime);
    const turningOn = !wasLogged;
    setMeds((ms) => ms.map((m) => (m.id === id ? patchMedDoseToggle(m, slotTime, turningOn) : m)));
    const result = wasLogged
      ? await unlogMedicationTaken(user.id, id, slotTime)
      : await logMedicationTaken(user.id, id, slotTime);
    if (result.ok) {
      getAdherenceStreak(user.id).then(setStreak);
    } else {
      setMeds((ms) => ms.map((m) => (m.id === id ? patchMedDoseToggle(m, slotTime, wasLogged) : m)));
      if (typeof window !== "undefined") {
        window.alert(`Could not save this dose.\n\n${result.error || "Unknown error."}`);
      }
    }
  }, [medList, user?.id, setMeds]);

  const uiFont = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const cardSh = "var(--shadow-card-hover)";
  const healthTipIndex = now.getDate() % TIPS.length;
  const dailyHealthTipText = TIPS[healthTipIndex];
  const dosesRemainingToday = Math.max(0, totalDoseSlots - takenDoseSlots);
  const doseTrackerEncouragement = !totalDoseSlots
    ? { text: "Add your meds ", bg: "var(--s2)", color: "var(--t2)", border: "1px solid var(--b1)" }
    : takenDoseSlots >= totalDoseSlots
      ? { text: "Perfect! ", bg: "var(--auth-ok-bg)", color: "var(--auth-ok-text)", border: "1px solid var(--auth-ok-border)" }
      : adherencePctSlots >= 50
        ? { text: "You're on track! ", bg: "var(--auth-ok-bg)", color: "var(--auth-ok-text)", border: "1px solid var(--auth-ok-border)" }
        : { text: "Keep going!", bg: "rgba(251,191,36,.14)", color: "var(--am)", border: "1px solid rgba(251,191,36,.28)" };
  const greetVisual = hr < 12
    ? { Icon: Sun, bg: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", showStars: false }
    : hr < 17
      ? { Icon: Sun, bg: "linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)", showStars: false }
      : { Icon: Moon, bg: "#1e40af", showStars: true };

  const statCards = [
    {
      l: "Daily progress",
      v: `${takenDoseSlots}/${totalDoseSlots || 0}`,
      sub: totalDoseSlots ? (takenDoseSlots >= totalDoseSlots ? "Perfect — all doses logged! " : takenDoseSlots >= totalDoseSlots * 0.6 ? "You're on track! " : "You've got this — keep going!") : "Add meds to track progress",
      subColor: "#10b981",
      I: CheckCircle2,
      c: "#10b981",
      bg: "rgba(16,185,129,.12)",
      onClick: () => onNavigateTab?.("medications"),
    },
    {
      l: "Day streak",
      v: String(streak),
      sub: streak === 0 ? "Start your streak today!" : `${streak} day${streak === 1 ? "" : "s"} strong`,
      subColor: "#d97706",
      I: Flame,
      c: "#f59e0b",
      bg: "rgba(245,158,11,.14)",
      onClick: () => onNavigateTab?.("analytics"),
    },
    {
      l: "Adherence",
      v: `${adherencePctSlots}%`,
      sub: "You're doing great!",
      subColor: "#2563eb",
      I: TrendingUp,
      c: "#2563eb",
      bg: "rgba(37,99,235,.1)",
      onClick: () => onNavigateTab?.("analytics"),
    },
    {
      l: "Active medications",
      v: String(medCount),
      sub: "Manage medications →",
      subColor: "#7c3aed",
      I: Pill,
      c: "#7c3aed",
      bg: "rgba(124,58,237,.12)",
      onClick: () => onNavigateTab?.("medications"),
    },
  ];

  const quickActions = [
    { label: "Add Medication", icon: Plus, onClick: onAdd, bg: "var(--pd)", c: "var(--pl)", border: "1px solid var(--ph)" },
    { label: "Book Appointment", icon: Calendar, onClick: () => onNavigateTab?.("appointments"), bg: "rgba(239,68,68,.08)", c: "var(--ro)", border: "1px solid rgba(239,68,68,.22)" },
    { label: "Message Doctor", icon: MessageCircle, onClick: () => onNavigateTab?.("messages"), bg: "var(--pha-pd)", c: "var(--pha-p)", border: "1px solid rgba(124,58,237,.22)" },
    { label: "Care Hub", icon: Stethoscope, onClick: () => onNavigateTab?.("care-hub"), bg: "var(--pd)", c: "var(--pl)", border: "1px solid var(--ph)" },
  ];

  const apptLabel = nextAppt && nextApptWhen
    ? `${nextApptWhen.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${to12h(
        `${String(nextApptWhen.getHours()).padStart(2, "0")}:${String(nextApptWhen.getMinutes()).padStart(2, "0")}:${String(nextApptWhen.getSeconds()).padStart(2, "0")}`
      )}`
    : "None scheduled";

  const c1 = "var(--t1)";
  const cMuted = "var(--t3)";
  const cardBase = {
    background: "var(--s1)",
    border: "1px solid var(--b1)",
    borderRadius: 16,
    boxShadow: "var(--shadow-card)",
  };

  return (
    <div style={{ flex: 1, minHeight: 0, fontFamily: uiFont, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}>
      <div
        className="patient-dashboard-canvas"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: isMob ? "14px 12px 52px" : "16px 20px 48px",
          background: "var(--bg)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMob ? "1fr" : "minmax(0, 2fr) minmax(0, 1fr)",
            gap: 14,
            marginBottom: 16,
            alignItems: "start",
          }}
        >
            <motion.div
              className="au"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                ...cardBase,
                padding: isMob ? 16 : 18,
                ...(isMob ? {} : { gridColumn: 1, gridRow: 1 }),
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: greetVisual.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 14px rgba(30,64,175,.28)", position: "relative" }} aria-hidden>
                    <greetVisual.Icon size={26} color="#fff" strokeWidth={2.2} />
                    {greetVisual.showStars ? (
                      <Sparkles size={12} color="#fff" style={{ position: "absolute", top: 8, right: 10, opacity: 0.92 }} strokeWidth={2.2} />
                    ) : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, color: cMuted, fontSize: 15, fontWeight: 500 }}>{greet},</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                      <h1 style={{ margin: 0, fontSize: isMob ? 24 : 28, fontWeight: 700, color: c1, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{name}</h1>
                      {onEditName ? (
                        <button type="button" title="Edit name" onClick={onEditName} style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid var(--b1)", background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: cMuted }}>
                          <Pencil size={15} />
                        </button>
                      ) : null}
                    </div>
                    <p style={{ margin: "12px 0 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", color: cMuted, fontSize: 13, fontWeight: 500 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Calendar size={15} color={cMuted} strokeWidth={2} />
                        {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                      </span>
                      <span style={{ opacity: 0.35, userSelect: "none" }}>|</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Clock size={15} color={cMuted} strokeWidth={2} />
                        {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
              <div
                style={{
                  borderRadius: 16,
                  padding: isMob ? "14px 16px" : "16px 20px",
                  background: "var(--pd)",
                  border: "1px solid var(--ph)",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, var(--pl), var(--p))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "var(--shadow-card)" }} aria-hidden>
                  <Utensils size={22} color="#fff" strokeWidth={2.2} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: c1, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    Better with food
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "var(--pl)", flexShrink: 0 }} aria-hidden>
                      <Check size={12} color="#fff" strokeWidth={3} />
                    </span>
                  </p>
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: cMuted, lineHeight: 1.55, fontWeight: 500 }}>Some medications absorb better when taken with meals.</p>
                </div>
              </div>
            </motion.div>

            <section
              className="au"
              style={{
                ...cardBase,
                padding: isMob ? 14 : 16,
                ...(isMob ? {} : { gridColumn: 2, gridRow: 1, alignSelf: "start" }),
              }}
            >
              <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: c1 }}>Quick actions</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {quickActions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.onClick}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "12px 12px",
                      borderRadius: 12,
                      background: "var(--s1)",
                      cursor: "pointer",
                      color: a.c,
                      fontWeight: 600,
                      fontSize: 11,
                      textAlign: "left",
                      fontFamily: "inherit",
                      minHeight: 72,
                      border: a.border || "1px solid var(--b1)",
                      boxShadow: "var(--shadow-card)",
                    }}
                  >
                    <a.icon size={22} strokeWidth={2.2} />
                    {a.label}
                  </button>
                ))}
              </div>
            </section>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 16 }}>
          {statCards.map((s, si) => {
            const Inner = (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 999, background: s.bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <s.I size={20} color={s.c} strokeWidth={2.2} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: c1, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", margin: 0, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{s.v}</p>
                  <p style={{ color: cMuted, fontSize: 12, fontWeight: 600, margin: "6px 0 0" }}>{s.l}</p>
                  {s.sub ? <p style={{ color: s.subColor || "var(--t3)", fontSize: 11, fontWeight: 500, margin: "8px 0 0", lineHeight: 1.35 }}>{s.sub}</p> : null}
                  {si === 0 && totalDoseSlots > 0 ? (
                    <div style={{ marginTop: 12, height: 4, borderRadius: 4, background: "var(--b1)", overflow: "hidden" }}>
                      <div style={{ width: `${adherencePctSlots}%`, height: "100%", background: "var(--gr)", borderRadius: 4, transition: "width .35s ease" }} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
            const cardStyle = { textAlign: "left", ...cardBase, padding: "14px 16px", fontFamily: "inherit" };
            return (
              <motion.button type="button" key={s.l} className="au" whileHover={{ y: -2, boxShadow: cardSh }} onClick={s.onClick} style={{ ...cardStyle, cursor: "pointer" }}>{Inner}</motion.button>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMob ? "1fr" : "minmax(0, 2fr) minmax(0, 1fr)",
            gridTemplateRows: isMob ? "none" : "auto auto",
            gap: 14,
            marginBottom: 16,
            alignItems: "start",
          }}
        >
            <motion.div
              className="au"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 }}
              style={{
                ...cardBase,
                padding: isMob ? 16 : 18,
                ...(isMob ? {} : { gridColumn: 1, gridRow: 1 }),
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: isMob ? 12 : 16, flexWrap: "wrap" }}>
                <Ring size={isMob ? 72 : 80} stroke={5} color="var(--pl)" trackColor="var(--s3)" pct={totalDoseSlots ? adherencePctSlots : 0}>
                  <CheckCircle2 size={32} color="var(--pl)" strokeWidth={2.2} aria-hidden />
                </Ring>
                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <p style={{ margin: 0, lineHeight: 1.2 }}>
                    <span style={{ fontSize: isMob ? 24 : 28, fontWeight: 800, color: c1, fontVariantNumeric: "tabular-nums" }}>{takenDoseSlots} of {totalDoseSlots || 0}</span>
                    <span style={{ fontSize: isMob ? 15 : 16, fontWeight: 500, color: cMuted }}> doses taken today</span>
                  </p>
                </div>
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 600,
                    background: doseTrackerEncouragement.bg,
                    color: doseTrackerEncouragement.color,
                    border: doseTrackerEncouragement.border,
                    flexShrink: 0,
                    marginLeft: isMob ? 0 : "auto",
                  }}
                >
                  {doseTrackerEncouragement.text}
                </div>
              </div>
              <div style={{ height: 10, borderRadius: 10, background: "var(--b1)", marginTop: 14, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${totalDoseSlots ? adherencePctSlots : 0}%`, background: "var(--pl)", borderRadius: 10, transition: "width .35s ease" }} />
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab?.("medications")}
                style={{
                  marginTop: 14,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: 0,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(59,130,246,.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Calendar size={22} color="var(--pl)" strokeWidth={2} />
                </div>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: "var(--t2)" }}>
                  {!totalDoseSlots
                    ? "No doses scheduled today — add medications"
                    : dosesRemainingToday === 0
                      ? "All doses logged for today"
                      : `${dosesRemainingToday} dose${dosesRemainingToday === 1 ? "" : "s"} remaining today`}
                </span>
                <ChevronRight size={22} color={cMuted} style={{ flexShrink: 0 }} aria-hidden />
              </button>
            </motion.div>

            <motion.div
              className="au"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              style={{
                ...cardBase,
                padding: isMob ? 16 : 18,
                ...(isMob ? {} : { gridColumn: 1, gridRow: 2, alignSelf: "stretch" }),
              }}
            >
              <div style={{ display: "flex", flexDirection: isMob ? "column" : "row", alignItems: "center", gap: isMob ? 16 : 20 }}>
                <div className="patient-next-dose-ring" style={{ background: "var(--s1)", borderRadius: "50%", padding: 8, boxShadow: "var(--shadow-card)", flexShrink: 0 }}>
                  <Ring size={isMob ? 148 : 168} stroke={6} color="var(--pl)" trackColor="var(--s3)" pct={nextDoseHero.ringPct}>
                    <div style={{ textAlign: "center", padding: "6px 12px 0", maxWidth: 140 }}>
                      <p style={{ margin: 0, color: c1, fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.8 }}>NEXT DOSE</p>
                      <p style={{ margin: "10px 0 0", color: c1, fontSize: isMob ? 22 : 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                        {nextDoseHero.secUntil != null ? `in ${formatCountdownHM(nextDoseHero.secUntil)}` : nextDoseHero.centerMain}
                      </p>
                      {nextDoseHero.timeHint ? (
                        <p style={{ margin: "8px 0 0", color: cMuted, fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{nextDoseHero.timeHint}</p>
                      ) : null}
                    </div>
                  </Ring>
                </div>
                <div style={{ flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
                  {nextDoseHero.firstMed ? (
                    <>
                      <p style={{ margin: 0, fontSize: isMob ? 17 : 19, fontWeight: 800, color: c1, lineHeight: 1.25 }}>{nextDoseHero.firstMed.name}</p>
                      {nextDoseHero.firstMed.dosage ? (
                        <span style={{ display: "inline-block", marginTop: 10, padding: "6px 12px", borderRadius: 8, background: "var(--s2)", fontSize: 12, fontWeight: 700, color: "var(--t2)" }}>{nextDoseHero.firstMed.dosage}</span>
                      ) : null}
                      <p style={{ margin: "12px 0 0", display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: cMuted }}>
                        <Utensils size={16} color="var(--t3)" strokeWidth={2} />
                        With food
                      </p>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: cMuted }}>{nextDoseHero.statusLine || "Add medications to see your next dose."}</p>
                  )}
                  {nextDoseHero.namesSummary ? (
                    <p style={{ margin: "14px 0 0", fontSize: 13, fontWeight: 500, color: c1, lineHeight: 1.45 }}>{nextDoseHero.namesSummary}</p>
                  ) : null}
                  {nextDoseHero.dueSoonNames && !nextDoseHero.namesSummary ? (
                    <p style={{ margin: "14px 0 0", fontSize: 12, color: "var(--t2)" }}>
                      <span style={{ fontWeight: 700, color: cMuted, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Next hour</span>
                      {nextDoseHero.dueSoonNames}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onNavigateTab?.("medications")}
                    style={{
                      marginTop: "auto",
                      padding: "10px 0 0",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--pl)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      alignSelf: "flex-start",
                    }}
                  >
                    View full schedule <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </motion.div>

            <section
              className="au"
              style={{
                ...cardBase,
                padding: isMob ? 14 : 16,
                ...(isMob
                  ? {}
                  : {
                      gridColumn: 2,
                      gridRow: "1 / 3",
                      alignSelf: "stretch",
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                    }),
              }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: c1 }}>Today&apos;s doses</h2>
                  <button type="button" onClick={() => onNavigateTab?.("medications")} style={{ border: "none", background: "none", padding: 0, color: "var(--pl)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 2 }}>
                    View all <ChevronRight size={16} />
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, ...(isMob ? {} : { flex: 1, minHeight: 0 }) }}>
                  {!totalDoseSlots ? (
                    <p style={{ margin: 0, fontSize: 13, color: cMuted, textAlign: "center", padding: "12px 8px" }}>Add medications to see today&apos;s dose list.</p>
                  ) : sidebarDoseList.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: cMuted, textAlign: "center", padding: "12px 8px" }}>Every dose for today is logged.</p>
                  ) : (
                    sidebarDoseList.map((r, idx) => (
                      <div
                        key={`${r.med.id}-${r.slotTime}`}
                        style={{
                          border: "1px solid var(--b1)",
                          borderRadius: 10,
                          padding: isMob ? "10px 12px" : "8px 10px",
                          background: "var(--s2)",
                          display: "grid",
                          gridTemplateColumns: isMob ? "1fr" : "minmax(64px, auto) minmax(0, 1fr) auto",
                          columnGap: isMob ? 0 : 10,
                          rowGap: isMob ? 8 : 0,
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "4px 8px",
                            minWidth: 0,
                            gridColumn: isMob ? "1" : undefined,
                          }}
                        >
                          {idx === 0 ? (
                            <span style={{ padding: "1px 6px", borderRadius: 4, background: "var(--pd)", color: "var(--pl)", fontSize: 8, fontWeight: 800, letterSpacing: "0.06em", lineHeight: 1.4, flexShrink: 0 }}>UP NEXT</span>
                          ) : null}
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--pl)", fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{to12hNoSeconds(r.slotTime)}</p>
                        </div>
                        <div
                          style={{
                            minWidth: 0,
                            gridColumn: isMob ? "1" : undefined,
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "0 6px",
                            rowGap: 2,
                            lineHeight: 1.3,
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 700, color: c1 }}>{r.med.name}</span>
                          {r.med.dosage ? (
                            <>
                              <span style={{ color: "var(--b2)", fontWeight: 400, userSelect: "none" }} aria-hidden>
                                ·
                              </span>
                              <span style={{ fontSize: 12, color: cMuted, fontWeight: 600 }}>{r.med.dosage}</span>
                            </>
                          ) : null}
                          <span style={{ color: "var(--b2)", fontWeight: 400, userSelect: "none" }} aria-hidden>
                            ·
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: cMuted }}>
                            <Utensils size={12} color="var(--t3)" strokeWidth={2} />
                            With food
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggle(r.med.id, r.slotTime)}
                          style={{
                            width: isMob ? "100%" : "auto",
                            justifySelf: isMob ? "stretch" : "end",
                            padding: "8px 14px",
                            borderRadius: 9,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            background: "var(--pl)",
                            color: "#fff",
                            border: "none",
                            boxShadow: "var(--shadow-card)",
                            whiteSpace: "nowrap",
                            gridColumn: isMob ? "1" : undefined,
                          }}
                        >
                          Take dose
                        </button>
                      </div>
                    ))
                  )}
                </div>
                {hasMoreSidebarDoses ? (
                  <button
                    type="button"
                    onClick={() => setShowMoreSidebarDoses((v) => !v)}
                    style={{
                      marginTop: isMob ? 10 : "auto",
                      width: "100%",
                      padding: "10px",
                      borderRadius: 10,
                      border: "1px solid var(--b1)",
                      background: "var(--s1)",
                      color: "var(--pl)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {showMoreSidebarDoses ? "Show less" : "Show more"}
                    <ChevronDown size={16} style={{ transform: showMoreSidebarDoses ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                  </button>
                ) : null}
              </section>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMob ? "1fr" : healthTipDismissed ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {!healthTipDismissed && (
            <motion.div
              className="au"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ ...cardBase, padding: 16, background: "rgba(251, 146, 60, 0.12)", border: "1px solid rgba(251, 146, 60, 0.28)", position: "relative" }}
            >
              <button
                type="button"
                aria-label="Dismiss today’s tip"
                onClick={(e) => {
                  e.stopPropagation();
                  try {
                    localStorage.setItem(HEALTH_TIP_DISMISS_STORAGE_KEY, healthTipDayKey);
                  } catch {}
                  setHealthTipDismissed(true);
                }}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid rgba(251, 146, 60, 0.35)",
                  background: "var(--s2)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--am)",
                }}
              >
                <X size={15} strokeWidth={2.5} />
              </button>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, paddingRight: 28 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(245, 158, 11, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} aria-hidden>
                  <Lightbulb size={22} color="var(--am)" strokeWidth={2} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--am)" }}>Daily health tip</p>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--t2)", lineHeight: 1.55, fontWeight: 500 }}>{dailyHealthTipText}</p>
                  <button
                    type="button"
                    onClick={() => void openExternalLink(DASHBOARD_HEALTH_TIPS_URL)}
                    style={{
                      marginTop: 12,
                      padding: "8px 0 0",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--am)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    See more tips <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          <motion.button
            type="button"
            className="au"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            onClick={() => (overdueDoseCount ? onNavigateTab?.("medications", overdueDoseRows[0]?.med?.id) : onNavigateTab?.("medications"))}
            style={{
              ...cardBase,
              padding: 18,
              background: overdueDoseCount ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
              border: overdueDoseCount ? "1px solid rgba(248, 113, 113, 0.28)" : "1px solid rgba(74, 222, 128, 0.28)",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: overdueDoseCount ? "rgba(239, 68, 68, 0.12)" : "rgba(34, 197, 94, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {overdueDoseCount ? <AlertTriangle size={22} color="var(--ro)" strokeWidth={2} /> : <CheckCircle2 size={22} color="var(--gr)" strokeWidth={2.2} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: overdueDoseCount ? "var(--ro)" : "var(--gr)" }}>
                  {overdueDoseCount ? `${overdueDoseCount} overdue dose${overdueDoseCount === 1 ? "" : "s"}` : "No overdue doses"}
                </p>
                <div style={{ margin: "6px 0 0", color: overdueDoseCount ? "var(--t2)" : "var(--t2)", lineHeight: 1.45 }}>
                  {overdueDoseCount ? (
                    <>
                      {overdueDoseRows.slice(0, 4).map((r, i) => (
                        <p key={`${r.med.id}-${r.slotTime}`} style={{ margin: i ? "5px 0 0" : 0, fontSize: 12, fontWeight: 500 }}>
                          {r.med.name} · {to12hNoSeconds(r.slotTime)}
                        </p>
                      ))}
                      {overdueDoseRows.length > 4 ? (
                        <p style={{ margin: "5px 0 0", fontSize: 11, fontWeight: 600, opacity: 0.92 }}>+{overdueDoseRows.length - 4} more</p>
                      ) : null}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>You&apos;re on track with today&apos;s schedule.</p>
                  )}
                </div>
              </div>
              <ChevronRight size={20} color={overdueDoseCount ? "var(--ro)" : "var(--gr)"} style={{ flexShrink: 0, opacity: 0.7 }} aria-hidden />
            </div>
          </motion.button>

          <motion.button
            type="button"
            className="au"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            onClick={() => onNavigateTab?.("notifications")}
            style={{
              ...cardBase,
              padding: 18,
              background: "var(--pha-pd)",
              border: "1px solid color-mix(in srgb, var(--pha-p) 28%, transparent)",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "color-mix(in srgb, var(--pha-p) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Bell size={22} color="var(--pha-p)" strokeWidth={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>
                  {unreadNotifCount === 0 ? "No new alerts" : `${unreadNotifCount} new alert${unreadNotifCount === 1 ? "" : "s"}`}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 500, color: "var(--pha-p)", lineHeight: 1.45 }}>
                  {unreadNotifCount === 0 ? "You're all caught up on reminders." : "Action required"}
                </p>
              </div>
              <ChevronRight size={20} color="var(--pha-p)" style={{ flexShrink: 0, opacity: 0.7 }} aria-hidden />
            </div>
          </motion.button>
        </div>

        <section className="au" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: cMuted }}>Upcoming</h2>
          <motion.div className="au" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ ...cardBase, padding: isMob ? 18 : 22 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1px 1fr", gap: 0, alignItems: "stretch" }}>
              <button type="button" onClick={() => onNavigateTab?.("medications")} style={{ textAlign: "left", background: "transparent", border: "none", padding: isMob ? "0 0 16px" : "4px 20px 4px 4px", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(59,130,246,.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Pill size={20} color="var(--pl)" /></div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: cMuted }}>Next medication</p>
                    <p style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 700, color: c1 }}>{nextDoseHero.firstMed ? nextDoseHero.firstMed.name : "All caught up"}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: cMuted, lineHeight: 1.45 }}>
                      {nextDoseHero.firstMed
                        ? [
                            nextDoseHero.firstMed.dosage || null,
                            nextDoseHero.allComplete && nextDoseHero.timeHint ? nextDoseHero.timeHint : nextDoseHero.firstSlotTime ? `Today, ${to12h(nextDoseHero.firstSlotTime)}` : null,
                            "With food",
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "Nice work today"}
                    </p>
                    <p style={{ margin: "12px 0 0", fontSize: 12, fontWeight: 600, color: "var(--pl)", display: "inline-flex", alignItems: "center", gap: 4 }}>View schedule <ChevronRight size={14} /></p>
                  </div>
                  </div>
              </button>
              {!isMob ? <div style={{ background: "var(--b1)", width: 1, margin: "4px 0" }} aria-hidden /> : <div style={{ height: 1, background: "var(--b1)", margin: "0 0 16px" }} aria-hidden />}
              <button type="button" onClick={() => onNavigateTab?.("appointments")} style={{ textAlign: "left", background: "transparent", border: "none", padding: isMob ? 0 : "4px 4px 4px 20px", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(34,197,94,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Calendar size={20} color="var(--gr)" /></div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: cMuted }}>Next appointment</p>
                    <p style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 700, color: nextAppt ? "var(--gr)" : c1 }}>{apptLabel}</p>
                    {nextAppt && (
                      <>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--t3)" }}>
                          {[nextAppt.type, apptDayLabel].filter(Boolean).join(" · ")}
                        </p>
                        {(apptProvider?.fullName || apptProvider?.kindLabel) && (
                          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--t3)", lineHeight: 1.45 }}>
                            {apptProvider.fullName ? (
                              <>
                                <span style={{ fontWeight: 600, color: "var(--t1)" }}>Dr. {apptProvider.fullName}</span>
                                {apptProvider.kindLabel ? <span>{` · ${apptProvider.kindLabel}`}</span> : null}
                              </>
                            ) : (
                              <span style={{ fontWeight: 600, color: "var(--t1)" }}>{apptProvider.kindLabel}</span>
                            )}
                          </p>
                        )}
                      </>
                    )}
                    <p style={{ margin: "12px 0 0", fontSize: 12, fontWeight: 600, color: "var(--pl)", display: "inline-flex", alignItems: "center", gap: 4 }}>View all appointments <ChevronRight size={14} /></p>
                      </div>
                    </div>
              </button>
              </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
