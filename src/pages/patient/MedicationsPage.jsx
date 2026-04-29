import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Pencil, Trash2, AlertCircle, Loader2, Package, History, Info, X, AlertTriangle } from "lucide-react";
import { COLS, PRESCRIPTION_STATUS_LABELS } from "../../lib/constants";
import { REFILL_STATUS_LABEL, refillStatusChipStyle } from "../../lib/refillRequestConstants";
import { expandDoseTimesForToday, groupMedicationsByDayPeriod, timeHMToMins } from "../../lib/medScheduleGroups";
import { to12h, to12hNoSeconds, formatOverdueDurationMinutes } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { logMedicationTaken, unlogMedicationTaken, doseRowLogged, patchMedDoseToggle, allDoseSlotsLogged } from "../../lib/adherence";
import { supabase } from "../../supabase";
import { useAuth } from "../../contexts/AuthContext";

const FDA_LABEL_ENDPOINT = "https://api.fda.gov/drug/label.json";

function isRefillRequestsTableMissing(error) {
  if (!error) return false;
  const msg = String(error.message || "").toLowerCase();
  const code = String(error.code || "");
  return (
    code === "42P01"
    || code === "PGRST205"
    || code === "PGRST204"
    || msg.includes("does not exist")
    || msg.includes("schema cache")
    || msg.includes("could not find the table")
    || msg.includes("undefined table")
  );
}

function fdaSearchTerms(medName) {
  const raw = String(medName || "").trim();
  if (!raw) return [];
  const add = (arr, s) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t.length < 2) return;
    if (!arr.some((x) => x.toLowerCase() === t.toLowerCase())) arr.push(t);
  };
  const out = [];
  const paren = raw.match(/\(([^)]+)\)/);
  if (paren) add(out, paren[1]);
  add(out, raw.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim());
  add(out, raw);
  return out;
}

function fdaEscapePhrase(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function fdaLabelQuery(search) {
  if (!search?.trim()) return null;
  try {
    const q = new URLSearchParams();
    q.set("search", search);
    q.set("limit", "1");
    q.set("sort", "effective_time:desc");
    const url = `${FDA_LABEL_ENDPOINT}?${q.toString()}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) return null;
    return data.results?.[0] ?? null;
  } catch {
    return null;
  }
}

function fdaBrandOrGeneric(term) {
  const ph = fdaEscapePhrase(term);
  return `openfda.brand_name:"${ph}"+OR+openfda.generic_name:"${ph}"`;
}

async function fetchDrugInfo(medName) {
  const terms = fdaSearchTerms(medName);
  if (!terms.length) return null;

  const attempts = [];

  attempts.push(terms.map(fdaBrandOrGeneric).join("+OR+"));

  for (const t of terms) {
    const ph = fdaEscapePhrase(t);
    const lower = ph.toLowerCase();
    attempts.push(`openfda.brand_name:"${ph}"`);
    attempts.push(`openfda.generic_name:"${ph}"`);
    if (lower !== ph) {
      attempts.push(`openfda.brand_name:${lower}`);
      attempts.push(`openfda.generic_name:${lower}`);
    }
    if (!/\s/.test(t)) {
      attempts.push(`openfda.generic_name.exact:"${ph}"`);
    }
  }

  attempts.push(fdaEscapePhrase(terms[0]));

  const seen = new Set();
  for (const q of attempts) {
    if (!q || seen.has(q)) continue;
    seen.add(q);
    const row = await fdaLabelQuery(q);
    if (row) return row;
  }
  return null;
}

const FDA_SECTION_CHAR_CAP = 6000;

function fdaFirstString(data, ...fieldNames) {
  if (!data) return "";
  for (const name of fieldNames) {
    const v = data[name];
    if (!Array.isArray(v)) continue;
    const joined = v
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => x.replace(/\s+/g, " ").trim())
      .join("\n\n");
    if (joined) return joined.length > FDA_SECTION_CHAR_CAP ? `${joined.slice(0, FDA_SECTION_CHAR_CAP).trim()}…` : joined;
  }
  return "";
}

function fdaReadableChunks(text, maxChunks = 36) {
  const t = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return [];

  let chunks = t
    .split(/(?<=[.!?])\s+(?=[("(]|[A-Z][a-z]|\d)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (chunks.length <= 1) {
    chunks = t.split(/\s*;\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
  }

  if (chunks.length <= 1) {
    const m = t.match(/^(.+?\b(?:for|due to):)\s*(.+)$/i);
    if (m && m[2].length > 12) {
      const intro = m[1].trim();
      const rest = m[2].trim();
      const parts = rest
        .split(/\s*(?:,|\.(?:\s+|$)|\band\b)\s+/i)
        .map((p) => p.replace(/\.$/, "").trim())
        .filter((p) => p.length > 1);
      if (parts.length >= 2) chunks = [intro, ...parts];
    }
  }

  if (chunks.length <= 1) {
    const runOn = /\s+(?=(?:headache|toothache|backache)\b|menstrual\s+cramps\b|the\s+common\s+cold\b|muscular\s+aches\b|minor\s+pain\s+of\s+arthritis\b|temporarily\s+reduces\b)/gi;
    const spl = t.split(runOn).map((s) => s.trim()).filter(Boolean);
    if (spl.length >= 2) chunks = spl;
  }

  if (chunks.length <= 1) chunks = [t];

  const seen = new Set();
  const out = [];
  for (const c of chunks) {
    const key = c.slice(0, 96).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= maxChunks) break;
  }
  return out;
}

function FdaLabelSections({ data, t1, t3 }) {
  const boxed = fdaFirstString(data, "boxed_warning");
  const uses = fdaFirstString(data, "indications_and_usage", "purpose", "description");
  const warnings = fdaFirstString(data, "warnings", "warnings_and_cautions", "general_precautions");
  const adverse = fdaFirstString(data, "adverse_reactions", "adverse_reactions_table");
  const interact = fdaFirstString(data, "drug_interactions");
  const contra = fdaFirstString(data, "contraindications");

  const blocks = [
    boxed && { title: "Boxed warning", text: boxed, variant: "danger", Icon: AlertTriangle },
    uses && { title: "Uses", text: uses, variant: "neutral", Icon: Info },
    warnings && { title: "Warnings", text: warnings, variant: "warn", Icon: AlertTriangle },
    adverse && { title: "Side effects", text: adverse, variant: "neutral", Icon: Info },
    interact && { title: "Drug interactions", text: interact, variant: "neutral", Icon: Info },
    contra && { title: "Do not use", text: contra, variant: "warn", Icon: AlertTriangle },
  ].filter(Boolean);

  if (!blocks.length) {
    return <p style={{ color: t3, fontSize: 13 }}>Label text was returned but no standard sections were found.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {blocks.map(({ title, text, variant, Icon }) => {
        const chunks = fdaReadableChunks(text);
        const border =
          variant === "danger" ? "rgba(185,28,28,.28)" : variant === "warn" ? "rgba(180,83,9,.32)" : "var(--b0)";
        const bg =
          variant === "danger" ? "rgba(254,242,242,.45)" : variant === "warn" ? "rgba(255,251,235,.75)" : "var(--s2)";
        return (
          <section key={title} style={{ border: `1px solid ${border}`, borderRadius: 12, padding: "12px 14px", background: bg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {Icon ? <Icon size={15} style={{ flexShrink: 0, color: variant === "danger" ? "#b91c1c" : variant === "warn" ? "#b45309" : "var(--p)" }} strokeWidth={2.2} /> : null}
              <h4
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: t1,
                }}
              >
                {title}
              </h4>
            </div>
            {chunks.length <= 1 ? (
              <p style={{ margin: 0, fontSize: 13, color: t1, lineHeight: 1.65 }}>{chunks[0]}</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, color: t1, fontSize: 13, lineHeight: 1.55 }}>
                {chunks.map((c, i) => (
                  <li key={i} style={{ marginBottom: 5 }}>
                    {c.replace(/^[•\-–—]\s*/, "")}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default function MedicationsPage({ meds, setMeds, onEdit, onDelete, userId, focusMedicationId, onConsumedFocus }) {
  const { loadUserMeds } = useAuth();
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t3 = "var(--t3)", b1 = "var(--b1)";
  const now = new Date();
  const curMins = now.getHours() * 60 + now.getMinutes();
  const overdueDoseRows = useMemo(() => {
    const rows = [];
    for (const m of meds) {
      const slots = expandDoseTimesForToday(m);
      const past = slots
        .filter((s) => timeHMToMins(s) < curMins && !doseRowLogged(m, s))
        .sort((a, b) => timeHMToMins(a) - timeHMToMins(b));
      for (const slotTime of past) {
        rows.push({ med: m, slotTime });
      }
    }
    rows.sort((a, b) => {
      const d = timeHMToMins(a.slotTime) - timeHMToMins(b.slotTime);
      if (d !== 0) return d;
      return String(a.med.name || "").localeCompare(String(b.med.name || ""), undefined, { sensitivity: "base", numeric: true });
    });
    return rows;
  }, [meds, curMins]);

  const [prescriptions, setPrescriptions] = useState([]);
  const [rxLoading, setRxLoading] = useState(false);
  const [primaryPharmacistId, setPrimaryPharmacistId] = useState(null);
  const [patientDisplayName, setPatientDisplayName] = useState("Patient");
  const [refillBusy, setRefillBusy] = useState(null);
  const [refillNotice, setRefillNotice] = useState(null);
  const [refillRequests, setRefillRequests] = useState([]);
  const doseReloadTimerRef = useRef(null);
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [detailMed, setDetailMed] = useState(null);
  const [drugInfo, setDrugInfo] = useState(null);

  const periodBlocks = useMemo(() => groupMedicationsByDayPeriod(meds), [meds]);

  useEffect(() => {
    if (!focusMedicationId) return;
    const med = meds.find((x) => x.id === focusMedicationId);
    const slots = med ? expandDoseTimesForToday(med) : [];
    const anchor = slots[0] || "08:00";
    const target = `${focusMedicationId}-${anchor}`;
    const t = requestAnimationFrame(() => {
      document.querySelector(`[data-med-scroll="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      onConsumedFocus?.();
    });
    return () => cancelAnimationFrame(t);
  }, [focusMedicationId, onConsumedFocus, meds]);

  useEffect(() => {
    if (!userId) return;
    setRxLoading(true);
    (async () => {
      try {
        const [rxRes, profRes] = await Promise.all([
          supabase.from("prescriptions").select("id,status,created_at,notes,doctor_id,pharmacist_id").eq("patient_id", userId).order("created_at", { ascending: false }).limit(20),
          supabase.from("profiles").select("primary_pharmacist_id,first_name,last_name").eq("id", userId).maybeSingle(),
        ]);
        setPrescriptions(rxRes.data || []);
        const p = profRes.data;
        setPrimaryPharmacistId(p?.primary_pharmacist_id ?? null);
        setPatientDisplayName([p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Patient");
      } finally {
        setRxLoading(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("refill_requests")
      .select("id,prescription_id,status,request_date,pharmacist_note,medication_name")
      .eq("patient_id", userId)
      .order("request_date", { ascending: false })
      .limit(80)
      .then(({ data, error }) => {
        if (error) {
          console.error("refill_requests patient load:", error.message);
          setRefillRequests([]);
          return;
        }
        setRefillRequests(data || []);
      });
  }, [userId]);

  const latestRefillByPrescription = useMemo(() => {
    const m = {};
    for (const r of refillRequests) {
      const cur = m[r.prescription_id];
      if (!cur || new Date(r.request_date) > new Date(cur.request_date)) m[r.prescription_id] = r;
    }
    return m;
  }, [refillRequests]);

  useEffect(() => {
    if (!userId) return;
    setHistLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceStr = since.toISOString().slice(0, 10);
    supabase.from("medication_logs").select("medication_id,taken_at,scheduled_date,dose_slot").eq("user_id", userId).gte("scheduled_date", sinceStr).order("taken_at", { ascending: false }).limit(80)
      .then(({ data }) => { setHistory(data || []); setHistLoading(false); });
  }, [userId, meds]);

  const scheduleDoseReload = useCallback(() => {
    if (!userId) return;
    if (doseReloadTimerRef.current) clearTimeout(doseReloadTimerRef.current);
    doseReloadTimerRef.current = setTimeout(() => {
      doseReloadTimerRef.current = null;
      void loadUserMeds();
    }, 1200);
  }, [userId, loadUserMeds]);

  useEffect(() => () => {
    if (doseReloadTimerRef.current) clearTimeout(doseReloadTimerRef.current);
  }, []);

  const toggle = useCallback(async (id, slotTime) => {
    const med = meds.find((m) => m.id === id);
    if (!med || slotTime == null || String(slotTime).trim() === "") return;
    const wasLogged = doseRowLogged(med, slotTime);
    const turningOn = !wasLogged;
    setMeds((ms) => ms.map((m) => (m.id === id ? patchMedDoseToggle(m, slotTime, turningOn) : m)));
    if (!userId) return;
    const result = wasLogged
      ? await unlogMedicationTaken(userId, id, slotTime)
      : await logMedicationTaken(userId, id, slotTime);
    if (result.ok) scheduleDoseReload();
    else {
      setMeds((ms) => ms.map((m) => (m.id === id ? patchMedDoseToggle(m, slotTime, wasLogged) : m)));
      if (typeof window !== "undefined") {
        window.alert(`Could not save this dose.\n\n${result.error || "Unknown error."}`);
      }
    }
  }, [meds, userId, setMeds, scheduleDoseReload]);

  const logDetailPrimary = useCallback(async () => {
    const m = detailMed;
    if (!m || !userId) return;
    if (allDoseSlotsLogged(m)) {
      const prevSnap = { loggedAllDay: m.loggedAllDay, loggedSlotTimes: [...(m.loggedSlotTimes || [])], taken: m.taken };
      setMeds((ms) => ms.map((x) => (x.id === m.id ? { ...x, loggedAllDay: false, loggedSlotTimes: [], taken: false } : x)));
      const unres = await unlogMedicationTaken(userId, m.id);
      setDetailMed((dm) => (dm && dm.id === m.id ? { ...dm, loggedAllDay: false, loggedSlotTimes: [], taken: false } : dm));
      if (unres.ok) scheduleDoseReload();
      else {
        setMeds((ms) => ms.map((x) => (x.id === m.id ? { ...x, loggedAllDay: prevSnap.loggedAllDay, loggedSlotTimes: prevSnap.loggedSlotTimes, taken: prevSnap.taken } : x)));
        setDetailMed((dm) => (dm && dm.id === m.id ? { ...dm, loggedAllDay: prevSnap.loggedAllDay, loggedSlotTimes: prevSnap.loggedSlotTimes, taken: prevSnap.taken } : dm));
        if (typeof window !== "undefined") window.alert(`Could not update doses.\n\n${unres.error || "Try again."}`);
      }
      return;
    }
    const slots = expandDoseTimesForToday(m);
    const next = slots.find((s) => !doseRowLogged(m, s));
    if (!next) return;
    setMeds((ms) => ms.map((x) => (x.id === m.id ? patchMedDoseToggle(x, next, true) : x)));
    const logres = await logMedicationTaken(userId, m.id, next);
    setDetailMed((dm) => (dm && dm.id === m.id ? patchMedDoseToggle(dm, next, true) : dm));
    if (logres.ok) scheduleDoseReload();
    else {
      setMeds((ms) => ms.map((x) => (x.id === m.id ? patchMedDoseToggle(x, next, false) : x)));
      setDetailMed((dm) => (dm && dm.id === m.id ? patchMedDoseToggle(dm, next, false) : dm));
      if (typeof window !== "undefined") window.alert(`Could not save this dose.\n\n${logres.error || "Try again."}`);
    }
  }, [detailMed, userId, setMeds, scheduleDoseReload]);

  async function openDetail(med) {
    setDetailMed(med);
    setDrugInfo({ loading: true, data: null });
    const data = await fetchDrugInfo(med.name);
    setDrugInfo({ loading: false, data });
  }

  async function requestRefill(rx) {
    if (!userId || refillBusy) return;
    setRefillBusy(rx.id);
    setRefillNotice(null);
    try {
      const { data: fresh } = await supabase
        .from("prescriptions")
        .select("id,status,created_at,notes,doctor_id,pharmacist_id")
        .eq("id", rx.id)
        .eq("patient_id", userId)
        .maybeSingle();
      const row = fresh || rx;
      const statusLabel = PRESCRIPTION_STATUS_LABELS[row.status] || row.status;
      const dateStr = new Date(row.created_at).toLocaleDateString();
      const summary = `Prescription from ${dateStr} — ${statusLabel}${row.notes ? `. Notes: ${row.notes}` : ""}`;
      const pharmId = row.pharmacist_id || primaryPharmacistId;

      const notifRows = [
        {
          user_id: userId,
          type: "refill_upcoming",
          title: "Refill request sent",
          body: pharmId || row.doctor_id
            ? `We notified your care team. ${summary}`
            : `${summary}. Add your pharmacy under Settings → Care team so your pharmacist can see refill requests.`,
          related_id: row.id,
        },
      ];
      if (pharmId) {
        notifRows.push({
          user_id: pharmId,
          type: "refill_upcoming",
          title: "Refill requested",
          body: `${patientDisplayName} requested a refill. ${summary}`,
          related_id: row.id,
        });
      }
      if (row.doctor_id) {
        notifRows.push({
          user_id: row.doctor_id,
          type: "refill_upcoming",
          title: "Patient refill request",
          body: `${patientDisplayName} asked the pharmacy to refill a prescription. ${summary}`,
          related_id: row.id,
        });
      }

      const { data: pm } = await supabase.from("prescription_medications").select("medication_name,dosage").eq("prescription_id", row.id).limit(1).maybeSingle();
      const medName = pm?.medication_name || "Prescription";
      const dosage = pm?.dosage || null;

      const { data: prevDone, error: prevErr } = await supabase
        .from("refill_requests")
        .select("request_date")
        .eq("prescription_id", row.id)
        .eq("status", "completed")
        .order("request_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      let refillTableMissing = prevErr && isRefillRequestsTableMissing(prevErr);
      const lastRefillDate = !prevErr && prevDone?.request_date ? String(prevDone.request_date).slice(0, 10) : null;
      const daysSince = lastRefillDate ? (Date.now() - new Date(lastRefillDate).getTime()) / 86400000 : null;
      const refillTooSoon = daysSince != null && daysSince < 21;

      let refillQueueSaved = false;
      const { error: rrErr } = await supabase.from("refill_requests").insert({
        prescription_id: row.id,
        patient_id: userId,
        medication_name: medName,
        dosage,
        status: "pending",
        last_refill_date: lastRefillDate,
        refill_too_soon: refillTooSoon,
        safety_warning: null,
      });
      if (rrErr) {
        refillTableMissing = refillTableMissing || isRefillRequestsTableMissing(rrErr);
        if (refillTableMissing) {
          console.warn("requestRefill: refill_requests unavailable (run migration 022):", rrErr.message);
        } else {
          console.error("requestRefill refill_requests:", rrErr.message);
          setRefillNotice({
            type: "err",
            text: `Could not save refill request: ${rrErr.message || "Permission or validation error."}`,
          });
          return;
        }
      } else {
        refillQueueSaved = true;
        supabase
          .from("refill_requests")
          .select("id,prescription_id,status,request_date,pharmacist_note,medication_name")
          .eq("patient_id", userId)
          .order("request_date", { ascending: false })
          .limit(80)
          .then(({ data }) => setRefillRequests(data || []));
      }

      const { error: nErr } = await supabase.from("notifications").insert(notifRows);
      if (nErr) {
        console.error("requestRefill notifications:", nErr.message);
        setRefillNotice({ type: "err", text: "Could not send notifications. Please try again." });
        return;
      }

      const threadBody = `Refill requested: ${summary}`;
      const { error: mErr } = await supabase.from("prescription_messages").insert({
        prescription_id: row.id,
        sender_id: userId,
        body: threadBody,
      });
      if (mErr) console.error("requestRefill prescription_messages:", mErr.message);

      const notices = [];
      if (refillTableMissing) {
        notices.push(
          "Your care team was notified. To use the Refill requests queue in the pharmacist portal, open Supabase → SQL Editor → paste and run the file supabase/migrations/022_refill_requests.sql from this project."
        );
      }
      if (!pharmId) {
        notices.push(
          "No pharmacist is assigned to this prescription yet. Set your primary pharmacy in Settings → Care team so alerts go straight to your pharmacist."
        );
      }
      if (notices.length) {
        setRefillNotice({ type: "warn", text: notices.join(" ") });
      } else if (refillQueueSaved) {
        setRefillNotice(null);
      }
    } catch (e) {
      console.error("requestRefill:", e);
      setRefillNotice({ type: "err", text: "Something went wrong. Please try again." });
    } finally {
      setRefillBusy(null);
    }
  }

  const medNameById = useMemo(() => Object.fromEntries(meds.map((m) => [m.id, m.name])), [meds]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "26px 22px 44px" }}>
        <motion.div className="au" style={{ marginBottom: 20 }}>
          <h2 style={{ color: t1, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, letterSpacing: "-.3px", marginBottom: 4 }}>Medications</h2>
          <p style={{ color: t3, fontSize: 13, lineHeight: 1.6 }}>
            Organized by <strong style={{ color: t1, fontWeight: 600 }}>morning, afternoon, evening, and night</strong>. Medicines set to every few hours are split into the right part of the day from your reminder time.
          </p>
        </motion.div>

        {overdueDoseRows.length > 0 && (
          <motion.section className="card au" style={{ padding: 14, marginBottom: 18, borderColor: "rgba(185,28,28,.2)", background: "rgba(254,242,242,.6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <AlertCircle size={18} color="#b91c1c" />
              <span style={{ color: "#991b1b", fontSize: 13, fontWeight: 700 }}>Overdue today ({overdueDoseRows.length})</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {overdueDoseRows.map(({ med: m, slotTime }) => {
                const overdueMins = curMins - timeHMToMins(slotTime);
                const dur = formatOverdueDurationMinutes(overdueMins);
                const timeLabel = to12hNoSeconds(slotTime);
                const detail = `Overdue by ${dur} · scheduled ${timeLabel} · Log dose`;
                return (
                  <button
                    key={`${m.id}-${slotTime}`}
                    type="button"
                    onClick={() => toggle(m.id, slotTime)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(254,202,202,.9)", background: "var(--s1)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                  >
                    <span style={{ color: t1, fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                    <span style={{ color: "var(--ro)", fontSize: 12, fontWeight: 600, textAlign: "right", lineHeight: 1.35, maxWidth: "58%" }}>{detail}</span>
                  </button>
                );
              })}
            </div>
          </motion.section>
        )}

        <motion.div className="au" style={{ marginBottom: 22 }}>
          <h3 style={{ color: t1, fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Today&apos;s medications</h3>
          {periodBlocks.map((block, pi) => {
            const { rows } = block;
            if (!rows.length) return null;
            const takenCt = rows.filter((r) => doseRowLogged(r.med, r.slotTime)).length;
            const pendingCt = rows.length - takenCt;
            return (
              <motion.div key={block.id} className="au" style={{ animationDelay: `${pi * 0.07}s`, marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11, flexWrap: "wrap" }}>
                  <span style={{ color: t1, fontSize: 13, fontWeight: 700 }}>{block.label}</span>
                  <span style={{ color: t3, fontSize: 12 }}>· {block.rangeLabel}</span>
                  <span style={{ color: t3, fontSize: 12 }}>
                    · {rows.length} dose{rows.length !== 1 ? "s" : ""} · {takenCt}/{rows.length} logged
                    {pendingCt > 0 ? <span style={{ color: "#b45309", fontWeight: 600 }}> · {pendingCt} open</span> : null}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {rows.map(({ med, slotTime }) => {
                    const col = COLS[med.color] || COLS.blue;
                    const slotMins = timeHMToMins(slotTime);
                    const overdue = !doseRowLogged(med, slotTime) && slotMins < curMins;
                    const rowKey = `${med.id}-${slotTime}`;
                    const slotsToday = expandDoseTimesForToday(med);
                    const isAnchorSlot = slotsToday[0] === slotTime;
                    const scrollKey = `${med.id}-${slotsToday[0]}`;
                    return (
                      <div
                        key={rowKey}
                        {...(isAnchorSlot ? { "data-med-scroll": scrollKey } : {})}
                        className="card"
                        style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, position: "relative", overflow: "hidden", outline: focusMedicationId === med.id && isAnchorSlot ? "2px solid var(--p)" : undefined }}
                      >
                        <button type="button" onClick={() => openDetail(med)} style={{ position: "absolute", inset: 0, zIndex: 0, cursor: "pointer", border: "none", background: "transparent", padding: 0 }} aria-label={`View ${med.name} details`} />
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: overdue ? "#ef4444" : col.a, borderRadius: "18px 0 0 18px", zIndex: 1, pointerEvents: "none" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: col.a, width: isMob ? 46 : 54, marginLeft: 6, flexShrink: 0, fontVariantNumeric: "tabular-nums", zIndex: 2 }}>{to12h(slotTime)}</span>
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: col.d, border: `1px solid ${col.b}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 2 }}>
                          <Pill size={14} color={col.a} />
                        </div>
                        <div style={{ flex: 1, zIndex: 2, minWidth: 0 }}>
                          <p style={{ color: t1, fontSize: 13, fontWeight: 600 }}>{med.name}</p>
                          <p style={{ color: t3, fontSize: 11, marginTop: 1 }}>{med.dosage}{med.freq ? ` · ${med.freq}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap" style={{ zIndex: 2 }}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); openDetail(med); }} title="Drug information" style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--p)" }}>
                            <Info size={12} />
                          </button>
                          <span className="hidden sm:flex items-center gap-1.5">
                            <button type="button" onClick={(e) => { e.stopPropagation(); onEdit?.(med); }} title="Edit" style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${b1}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><Pencil size={12} /></button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); onDelete?.(med.id); }} title="Delete" style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${b1}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><Trash2 size={12} /></button>
                          </span>
                          <button type="button" className="whitespace-nowrap" onClick={(e) => { e.stopPropagation(); toggle(med.id, slotTime); }} style={{ padding: "5px 14px", borderRadius: 99, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: doseRowLogged(med, slotTime) ? "rgba(16,185,129,.12)" : "var(--s2)", color: doseRowLogged(med, slotTime) ? "var(--gr)" : "var(--t3)" }}>
                            {doseRowLogged(med, slotTime) ? "Taken ✓" : "Log dose"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
          {meds.length === 0 && (
            <div className="card au" style={{ padding: 48, textAlign: "center" }}>
              <Pill size={28} color={t3} style={{ margin: "0 auto 10px", opacity: 0.18, display: "block" }} />
              <p style={{ color: t3, fontSize: 13 }}>No medications yet. Add one from the dashboard.</p>
            </div>
          )}
        </motion.div>

        <motion.section className="au card" style={{ padding: 18, marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Package size={18} color="var(--p)" />
            <h3 style={{ color: t1, fontSize: 15, fontWeight: 700, margin: 0 }}>Refill requests</h3>
          </div>
          {refillNotice && (
            <p
              style={{
                color: refillNotice.type === "err" ? "#b91c1c" : "#b45309",
                fontSize: 12,
                margin: "0 0 12px",
                lineHeight: 1.45,
              }}
            >
              {refillNotice.text}
            </p>
          )}
          {rxLoading ? <Loader2 size={16} className="auth-spin" style={{ color: "var(--p)" }} /> : prescriptions.length === 0 ? (
            <p style={{ color: t3, fontSize: 13 }}>No prescriptions on file.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {prescriptions.filter((p) => p.status !== "picked_up").map((rx) => {
                const rr = latestRefillByPrescription[rx.id];
                const chip = rr ? refillStatusChipStyle(rr.status) : null;
                return (
                  <div key={rx.id} style={{ padding: 12, borderRadius: 12, border: "1px solid var(--b0)", background: "var(--s2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div>
                        <p style={{ color: t1, fontSize: 12, fontWeight: 700, margin: 0 }}>{new Date(rx.created_at).toLocaleDateString()}</p>
                        <p style={{ color: t3, fontSize: 11, margin: "4px 0 0" }}>{PRESCRIPTION_STATUS_LABELS[rx.status] || rx.status}</p>
                        {rr && chip && (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: chip.bg,
                                border: `1px solid ${chip.border}`,
                                color: chip.color,
                              }}
                            >
                              Refill: {REFILL_STATUS_LABEL[rr.status] || rr.status}
                            </span>
                            {rr.pharmacist_note && (
                              <p style={{ color: t3, fontSize: 11, margin: 0, lineHeight: 1.45 }}>
                                <strong style={{ color: t1 }}>Pharmacy:</strong> {rr.pharmacist_note}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <button type="button" disabled={!!refillBusy} onClick={() => requestRefill(rx)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--p)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: refillBusy ? "wait" : "pointer", flexShrink: 0 }}>
                        {refillBusy === rx.id ? <Loader2 size={12} style={{ animation: "spin360 .7s linear infinite" }} /> : "Request refill"}
                      </button>
                    </div>
                    {rx.notes && <p style={{ color: t3, fontSize: 11, marginTop: 8, lineHeight: 1.45 }}>{rx.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </motion.section>

        <motion.section className="au card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <History size={18} color="var(--tl)" />
            <h3 style={{ color: t1, fontSize: 15, fontWeight: 700, margin: 0 }}>Medication history</h3>
          </div>
          {histLoading ? <Loader2 size={16} className="auth-spin" style={{ color: "var(--p)" }} /> : history.length === 0 ? (
            <p style={{ color: t3, fontSize: 13 }}>No doses logged in the last 14 days.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {history.slice(0, 40).map((row) => (
                <li key={`${row.medication_id}-${row.taken_at}-${row.dose_slot ?? ""}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "8px 10px", borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b0)" }}>
                  <span style={{ color: t1, fontWeight: 600 }}>{medNameById[row.medication_id] || "Medication"}{row.dose_slot ? ` · ${to12h(row.dose_slot)}` : ""}</span>
                  <span style={{ color: t3 }}>{new Date(row.taken_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>

      <AnimatePresence>
        {detailMed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setDetailMed(null); setDrugInfo(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid var(--b1)" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ color: t1, fontSize: 16, fontWeight: 700, margin: 0 }}>{detailMed.name}</h3>
                  <p style={{ color: t3, fontSize: 12, margin: "4px 0 0" }}>{detailMed.dosage} · {detailMed.freq} · {to12h(detailMed.time)}</p>
                </div>
                <button type="button" onClick={() => { setDetailMed(null); setDrugInfo(null); }} style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid var(--b1)", background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
              </div>
              <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
                {drugInfo?.loading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: t3 }}><Loader2 size={16} style={{ animation: "spin360 .7s linear infinite" }} /> Loading drug information…</div>
                )}
                {!drugInfo?.loading && !drugInfo?.data && <p style={{ color: t3, fontSize: 13 }}>No FDA label match. Ask your clinician or pharmacist for details.</p>}
                {!drugInfo?.loading && drugInfo?.data && <FdaLabelSections data={drugInfo.data} t1={t1} t3={t3} />}
                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  <button type="button" className="btn" onClick={() => { logDetailPrimary(); }} style={{ flex: 1, minWidth: 120 }}>
                    {allDoseSlotsLogged(detailMed) ? "Clear today's logs" : detailMed.taken ? "Log next dose" : "Log dose now"}
                  </button>
                  <button type="button" className="bto" onClick={() => { onEdit?.(detailMed); setDetailMed(null); }} style={{ flex: 1, minWidth: 120 }}>Edit medication</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
