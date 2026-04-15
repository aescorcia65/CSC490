import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Calendar, Plus, Clock, Check, AlertCircle, Flame, Loader2, TrendingUp, Bell, CheckCircle2, Pencil, Stethoscope, Sparkles, Trash2, X, ChevronRight, ChevronDown, Info, AlertTriangle, Shield } from "lucide-react";
import { supabase } from "../../supabase";
import { COLS, TIPS, PRESCRIPTION_STATUS_LABELS } from "../../lib/constants";
import { to12h } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useClock } from "../../hooks/useClock";
import Ring from "../../components/common/Ring";
import AppointmentRow from "../../components/appointments/AppointmentRow";
import {
  logMedicationTaken,
  unlogMedicationTaken,
  getAdherenceStreak,
  requiredDosesFromFrequency,
  loadTodaysDoseCounts,
  saveTodaysDoseCounts,
} from "../../lib/adherence";
import { fetchDrugLabelByName, getDrugDisplayNames, summarizePlainText } from "../../lib/openfda";

export default function Dashboard({ user, meds, setMeds, onAdd, onEdit, onDelete, onChat, displayName, onEditName }) {
  const now = useClock();
  const isMob = useIsMobile();
  const [doseCounts, setDoseCounts] = useState({});
  const [expandedDrugSections, setExpandedDrugSections] = useState({});
  const medWithProgress = meds.map((m) => {
    const required = requiredDosesFromFrequency(m.freq);
    const completed = Math.min(required, Math.max(0, Number(doseCounts[m.id] || 0)));
    return { ...m, requiredDoses: required, completedDoses: completed, taken: completed >= required };
  });
  const taken = medWithProgress.filter(m => m.taken).length;
  const total = meds.length;
  const pct = total ? Math.round(taken / total * 100) : 0;
  const hr = now.getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const tip = TIPS[now.getDate() % TIPS.length];
  const name = displayName || user?.displayName || user?.email?.split("@")[0] || "there";
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)";
  const toMins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const curMins = hr * 60 + now.getMinutes();
  const nextMed = [...medWithProgress].filter(m => !m.taken && toMins(m.time) > curMins).sort((a, b) => toMins(a.time) - toMins(b.time))[0];
  const overdueMeds = [...medWithProgress].filter(m => !m.taken && toMins(m.time) < curMins);

  const [streak, setStreak] = useState(0);
  const [modal, setModal] = useState(null);
  const [drugInfo, setDrugInfo] = useState(null); // { med, data, loading }
  const rxListRef = useRef(null);

  const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  useEffect(() => {
    if (!user?.id) {
      setDoseCounts({});
      return;
    }
    setDoseCounts(loadTodaysDoseCounts(user.id));
  }, [user?.id, dayKey]);

  async function openDrugInfo(med) {
    setDrugInfo({ med, data: null, loading: true });
    setExpandedDrugSections({});
    const data = await fetchDrugLabelByName(med.name);
    setDrugInfo({ med, data, loading: false });
  }

  const toggle = useCallback(async (id) => {
    const med = meds.find(m => m.id === id);
    if (!med || !user?.id) return;
    const required = requiredDosesFromFrequency(med.freq);
    const current = Math.max(0, Number(doseCounts[id] || 0));
    const next = current >= required ? Math.max(0, current - 1) : Math.min(required, current + 1);
    const prevWasComplete = current >= required;
    const nextIsComplete = next >= required;

    const nextCounts = { ...doseCounts, [id]: next };
    setDoseCounts(nextCounts);
    saveTodaysDoseCounts(user.id, nextCounts);
    setMeds(ms => ms.map(m => m.id === id ? { ...m, taken: nextIsComplete } : m));

    if (!prevWasComplete && nextIsComplete) await logMedicationTaken(user.id, id);
    if (prevWasComplete && !nextIsComplete) await unlogMedicationTaken(user.id, id);
  }, [meds, user?.id, setMeds, doseCounts]);

  const [prescriptions, setPrescriptions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [careTeam, setCareTeam] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [pRes, nRes, aRes] = await Promise.all([
        supabase.from("prescriptions").select("id,status,created_at,notes,prescription_medications(medication_name,dosage,frequency)").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("notifications").select("id,type,title,body,read_at,created_at,related_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("appointments").select("id,date,time,type,notes,status,reschedule_request,doctor_id").eq("patient_id", user.id).in("status", ["scheduled", "rescheduled"]).order("date", { ascending: true }).limit(10),
      ]);
      setPrescriptions(pRes.data || []); setNotifications(nRes.data || []); setAppointments(aRes.data || []);
      getAdherenceStreak(user.id).then(s => setStreak(s));
      const profRes = await supabase.from("profiles").select("primary_doctor_id,primary_pharmacist_id,care_team").eq("id", user.id).single();
      const pd = profRes.data?.primary_doctor_id;
      const pp = profRes.data?.primary_pharmacist_id;
      const rawTeam = profRes.data?.care_team;
      const teamList = [];
      if (Array.isArray(rawTeam) && rawTeam.length > 0) {
        const ids = [...new Set(rawTeam.map((e) => e?.doctor_id).filter(Boolean))];
        if (ids.length > 0) {
          const { data: docRows } = await supabase.from("profiles").select("id,first_name,last_name,role,specialty,pharmacy_name,email").in("id", ids);
          const byId = Object.fromEntries((docRows || []).map((d) => [d.id, d]));
          for (const entry of rawTeam) {
            const doc = entry?.doctor_id ? byId[entry.doctor_id] : null;
            if (doc) teamList.push({ ...doc, careLabel: entry.label || "Doctor" });
          }
        }
      } else if (pd) {
        const { data: solo } = await supabase.from("profiles").select("id,first_name,last_name,role,specialty,pharmacy_name,email").eq("id", pd).single();
        if (solo) teamList.push({ ...solo, careLabel: "Primary care" });
      }
      if (pp) {
        const { data: ph } = await supabase.from("profiles").select("id,first_name,last_name,role,specialty,pharmacy_name,email").eq("id", pp).single();
        if (ph) teamList.push({ ...ph, careLabel: null });
      }
      setCareTeam(teamList);
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channels = [];
    channels.push(supabase.channel(`pt-rx-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "prescriptions", filter: `patient_id=eq.${user.id}` }, (payload) => {
      if (payload.eventType === "INSERT") setPrescriptions(prev => prev.some(p => p.id === payload.new.id) ? prev : [payload.new, ...prev]);
      else if (payload.eventType === "UPDATE") setPrescriptions(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
      else if (payload.eventType === "DELETE") setPrescriptions(prev => prev.filter(p => p.id !== payload.old.id));
    }).subscribe());
    channels.push(supabase.channel(`pt-notif-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
      if (payload.eventType === "INSERT") setNotifications(prev => prev.some(n => n.id === payload.new.id) ? prev : [payload.new, ...prev]);
      else if (payload.eventType === "UPDATE") setNotifications(prev => prev.map(n => n.id === payload.new.id ? { ...n, ...payload.new } : n));
      else if (payload.eventType === "DELETE") setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
    }).subscribe());
    channels.push(supabase.channel(`pt-appt-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `patient_id=eq.${user.id}` }, (payload) => {
      if (payload.eventType === "INSERT") { if (["scheduled", "rescheduled"].includes(payload.new.status)) setAppointments(prev => prev.some(a => a.id === payload.new.id) ? prev : [...prev, payload.new]); }
      else if (payload.eventType === "UPDATE") {
        if (payload.new.status === "cancelled") setAppointments(prev => prev.filter(a => a.id !== payload.new.id));
        else {
          const row = payload.new;
          setAppointments(prev => {
            if (!["scheduled", "rescheduled"].includes(row.status)) return prev.filter(a => a.id !== row.id);
            const has = prev.some(a => a.id === row.id);
            if (has) return prev.map(a => a.id === row.id ? { ...a, ...row } : a);
            return [...prev, row].sort((a, b) => a.date.localeCompare(b.date));
          });
        }
      }
      else if (payload.eventType === "DELETE") setAppointments(prev => prev.filter(a => a.id !== payload.old.id));
    }).subscribe());
    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, [user?.id]);

  useEffect(() => {
    if (modal?.type !== "rx" || !modal.focusRxId) return;
    const id = modal.focusRxId;
    const t = setTimeout(() => {
      rxListRef.current?.querySelector(`[data-rx-row="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  }, [modal]);

  const ringColor = pct >= 80 ? "var(--gr)" : pct >= 40 ? "var(--am)" : "var(--ro)";
  const progressGrad = pct >= 80 ? "linear-gradient(90deg,#059669,#10b981)" : pct >= 40 ? "linear-gradient(90deg,#b45309,#d97706)" : "linear-gradient(90deg,#b91c1c,#dc2626)";

  function openMedsModal() {
    setModal({ type: "meds", title: "Today's Medications" });
  }

  function openApptsModal() {
    setModal({ type: "appts", title: "Upcoming Appointments" });
  }

  function openRxModal(focusRxId) {
    setModal({ type: "rx", title: "Prescriptions", focusRxId: focusRxId || null });
  }

  function openNotifModal() {
    setModal({ type: "notif", title: "Notifications" });
  }

  async function handlePatientNotificationClick(n) {
    if (!n.read_at) {
      const readAt = new Date().toISOString();
      await supabase.from("notifications").update({ read_at: readAt }).eq("id", n.id);
      setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, read_at: readAt } : x)));
    }
    const t = (n.title || "").toLowerCase();
    const ty = n.type || "";
    if (n.related_id && (ty === "prescription_ready" || t.includes("prescription") || t.includes("prescription chat"))) {
      setModal({ type: "rx", title: "Prescriptions", focusRxId: n.related_id });
      return;
    }
    if (t.includes("appointment") || t.includes("reschedule") || t.includes("alternative appointment")) {
      setModal({ type: "appts", title: "Appointments" });
    }
  }

  function renderModalContent() {
    if (!modal?.type) return null;

    if (modal.type === "meds") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {medWithProgress.length === 0 ? <p style={{ color: t3, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No medications yet.</p> :
            [...medWithProgress].sort((a, b) => a.time.localeCompare(b.time)).map((med) => {
              const col = COLS[med.color] || COLS.blue;
              const isOverdue = !med.taken && toMins(med.time) < curMins;
              return (
                <div key={med.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--s1)", border: `1px solid ${isOverdue ? "rgba(185,28,28,.2)" : "var(--b1)"}`, borderRadius: 14, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: med.taken ? "var(--b1)" : col.a, borderRadius: "14px 0 0 14px" }} />
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: med.taken ? "var(--s2)" : col.d, border: `1.5px solid ${med.taken ? "var(--b1)" : col.b}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 6 }}>
                    <Pill size={16} color={med.taken ? t3 : col.a} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{med.name}</p>
                    <p style={{ color: t3, fontSize: 12, marginTop: 2 }}>{med.dosage}{med.freq ? ` · ${med.freq}` : ""} · {to12h(med.time)}</p>
                    <p style={{ color: med.taken ? "var(--gr)" : t3, fontSize: 11, marginTop: 3, fontWeight: 600 }}>
                      {med.completedDoses}/{med.requiredDoses} dose{med.requiredDoses > 1 ? "s" : ""} complete
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => { setModal(null); openDrugInfo(med); }} title="Drug information" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--b1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--p)" }}><Info size={12} /></button>
                    {!isMob && <button onClick={() => onEdit(med)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--b1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><Pencil size={12} /></button>}
                    {!isMob && <button onClick={() => onDelete(med.id)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(185,28,28,.2)", background: "rgba(185,28,28,.05)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ro)" }}><Trash2 size={12} /></button>}
                    <button onClick={() => toggle(med.id)} style={{ width: 34, height: 34, borderRadius: 10, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: med.taken ? "var(--gr)" : "var(--s2)", transition: "all .2s" }}>
                      <Check size={14} color={med.taken ? "#fff" : t3} />
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      );
    }

    if (modal.type === "appts") {
      return appointments.length === 0
        ? <p style={{ color: t3, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No upcoming appointments.</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {appointments.map(appt => (
              <AppointmentRow key={appt.id} appt={appt}
                onCancel={id => setAppointments(as => as.filter(a => a.id !== id))}
                onApptUpdate={(id, partial) => setAppointments(as => as.map(a => a.id === id ? { ...a, ...partial } : a))}
              />
            ))}
          </div>;
    }

    if (modal.type === "rx") {
      return prescriptions.length === 0
        ? <p style={{ color: t3, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No prescriptions found.</p>
        : <div ref={rxListRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {prescriptions.map((pr) => {
              const lines = Array.isArray(pr.prescription_medications) ? pr.prescription_medications : [];
              const medTitle = lines.length
                ? lines.map((m) => [m.medication_name, m.dosage].filter(Boolean).join(" · ")).join(" · ")
                : "Prescription";
              const isFocus = modal.focusRxId && pr.id === modal.focusRxId;
              return (
                <div key={pr.id} data-rx-row={pr.id} style={{ padding: "12px 14px", borderRadius: 12, background: isFocus ? "rgba(37,99,235,.08)" : "var(--s2)", border: isFocus ? "1.5px solid rgba(37,99,235,.35)" : "1px solid var(--b0)", boxShadow: isFocus ? "0 0 0 2px rgba(37,99,235,.12)" : "none" }}>
                  <p style={{ color: t1, fontSize: 14, fontWeight: 700, margin: "0 0 6px", lineHeight: 1.35 }}>{medTitle}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ color: t3, fontSize: 12 }}>{new Date(pr.created_at).toLocaleDateString()}</span>
                    <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: pr.status === "ready" ? "rgba(5,150,105,.12)" : (pr.status === "filled" || pr.status === "picked_up") ? "var(--pd)" : "rgba(217,119,6,.12)", color: pr.status === "ready" ? "var(--gr)" : (pr.status === "filled" || pr.status === "picked_up") ? "var(--p)" : "var(--am)" }}>
                      {PRESCRIPTION_STATUS_LABELS[pr.status] || pr.status}
                    </span>
                  </div>
                  {lines.length > 1 && (
                    <ul style={{ color: t2, fontSize: 12, margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
                      {lines.map((m, mi) => (
                        <li key={m.id || `${pr.id}-${mi}-${m.medication_name}`}>{[m.medication_name, m.dosage, m.frequency].filter(Boolean).join(" · ")}</li>
                      ))}
                    </ul>
                  )}
                  {pr.notes && <p style={{ color: t2, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{pr.notes}</p>}
                </div>
              );
            })}
          </div>;
    }

    if (modal.type === "notif") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notifications.length === 0 && <p style={{ color: t3, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No notifications.</p>}
          {notifications.map(n => (
            <motion.div
              key={n.id}
              layout
              role="button"
              tabIndex={0}
              onClick={() => handlePatientNotificationClick(n)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handlePatientNotificationClick(n); } }}
              style={{ padding: "10px 12px", borderRadius: 11, background: n.read_at ? "var(--s2)" : "rgba(37,99,235,.06)", border: `1px solid ${n.read_at ? "var(--b0)" : "rgba(37,99,235,.14)"}`, display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
            >
              <div style={{ flex: 1 }}>
                <p style={{ color: t1, fontSize: 12.5, fontWeight: n.read_at ? 500 : 700, margin: 0 }}>{n.title}</p>
                {n.body && <p style={{ color: t3, fontSize: 11.5, marginTop: 3, marginBottom: 0, lineHeight: 1.5 }}>{n.body}</p>}
              </div>
              <button type="button" onClick={async (e) => {
                e.stopPropagation();
                setNotifications(prev => prev.filter(x => x.id !== n.id));
                if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
              }} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: t3, padding: 2, display: "flex", opacity: .5 }}><X size={13} /></button>
            </motion.div>
          ))}
        </div>
      );
    }

    if (modal.type === "care") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {careTeam.map(p => {
            const isDoc = p.role === "doctor";
            const nm = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;
            const specialty = isDoc ? (p.specialty || "Doctor") : (p.pharmacy_name || "Pharmacist");
            const detail = p.careLabel != null ? `${p.careLabel} · ${specialty}` : specialty;
            const color = isDoc ? "var(--p)" : "var(--pha-p)";
            const bg = isDoc ? "var(--pd)" : "rgba(124,58,237,.1)";
            return (
              <div key={`${p.id}-${p.careLabel ?? "ph"}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 13, background: "var(--s2)", border: "1px solid var(--b0)" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ color, fontSize: 16, fontWeight: 800, fontFamily: "'Playfair Display',serif" }}>{nm[0]?.toUpperCase() || "?"}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0 }}>{isDoc ? `Dr. ${nm}` : nm}</p>
                  <p style={{ color, fontSize: 12, marginTop: 2, fontWeight: 600 }}>{detail}</p>
                </div>
                <span style={{ padding: "3px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: bg, color, flexShrink: 0 }}>{p.careLabel != null ? p.careLabel : (isDoc ? "Doctor" : "Pharmacist")}</span>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  }

  return (
    <div style={{ flex: 1 }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "32px 24px 56px" }}>
        <motion.div className="au" style={{ marginBottom: 28 }}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div style={{ flex: 1 }}>
              <p style={{ color: "var(--p)", fontSize: 10.5, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", opacity: .7, marginBottom: 9 }}>
                {pct === 100 ? "All caught up for today" : pct > 50 ? "Good progress today" : "Your daily overview"}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ color: t1, fontSize: 32, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 700, letterSpacing: "-.4px", lineHeight: 1.1, margin: 0 }}>
                  {greet}, <span style={{ color: "var(--p)" }}>{name}.</span>
                </h1>
                <motion.button whileHover={{ scale: 1.1, rotate: 10 }} whileTap={{ scale: .9 }} onClick={onEditName}
                  style={{ width: 28, height: 28, borderRadius: 9, border: "1px solid var(--b1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, flexShrink: 0, transition: "border-color .15s, color .15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--p)"; e.currentTarget.style.color = "var(--p)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.color = t3; }}>
                  <Pencil size={11} />
                </motion.button>
              </div>
              <p style={{ color: t3, fontSize: 12.5, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                {" · "}{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
            </div>
            <div className="flex gap-2 shrink-0 mt-1">
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }} onClick={onChat}
                style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid var(--b1)", background: "var(--s1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--p)", transition: "all .15s", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                <Sparkles size={16} />
              </motion.button>
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }} onClick={onAdd}
                style={{ padding: "10px 20px", fontSize: 13.5, borderRadius: 12, display: "flex", alignItems: "center", gap: 7, fontWeight: 700 }} className="btn">
                <Plus size={14} /> Add
              </motion.button>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-6">
            <Ring pct={pct} color={ringColor} size={isMob ? 64 : 80} stroke={isMob ? 6 : 7} />
            <div style={{ flex: 1 }}>
              <p style={{ color: t1, fontSize: isMob ? 13 : 14.5, fontWeight: 700, margin: "0 0 5px" }}>
                {taken === 0 ? "No medications taken yet today"
                  : taken === total && total > 0 ? "All medications taken for today"
                  : `${taken} of ${total} medications taken`}
              </p>
              <div style={{ height: 6, borderRadius: 99, background: "var(--b0)", overflow: "hidden" }}>
                <motion.div style={{ height: "100%", borderRadius: 99, background: progressGrad }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1.2, ease: [.22, 1, .36, 1], delay: .3 }} />
              </div>
              {nextMed && (
                <p style={{ color: t3, fontSize: 12, marginTop: 6 }}>Next: <span style={{ color: t2, fontWeight: 600 }}>{nextMed.name}</span> at {to12h(nextMed.time)}</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Summary stat cards — all clickable ── */}
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { l: "Done today", v: `${taken}/${total}`, I: CheckCircle2, c: "var(--gr)", bg: "rgba(5,150,105,.1)", onClick: openMedsModal },
            { l: "Day streak", v: `${streak} day${streak !== 1 ? "s" : ""}`, I: Flame, c: "var(--am)", bg: "rgba(217,119,6,.1)", onClick: null },
            { l: "Adherence", v: `${pct}%`, I: TrendingUp, c: "var(--p)", bg: "var(--pd)", onClick: null },
            { l: "Medications", v: String(total), I: Pill, c: "var(--tl)", bg: "rgba(8,145,178,.1)", onClick: openMedsModal },
          ].map((s, i) => (
            <motion.div key={s.l} className={`au d${i + 1}`} whileHover={{ y: -3, boxShadow: "0 12px 32px rgba(0,0,0,.1)" }}
              onClick={s.onClick || undefined}
              style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "16px 15px", cursor: s.onClick ? "pointer" : "default", transition: "box-shadow .2s", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: s.bg, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${s.bg}` }}>
                <s.I size={16} color={s.c} />
              </div>
              <p style={{ color: t1, fontSize: 20, fontVariantNumeric: "tabular-nums", fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 700, marginBottom: 3 }}>{s.v}</p>
              <p style={{ color: t3, fontSize: 10, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase" }}>{s.l}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Quick summary rows — click to open detail modal ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {/* Medications row */}
          <motion.div className="au d3" whileHover={{ x: 2 }} onClick={openMedsModal} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 16, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(8,145,178,.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Pill size={16} color="var(--tl)" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0 }}>Today's Medications</p>
              <p style={{ color: t3, fontSize: 12, marginTop: 2 }}>{taken} of {total} taken{overdueMeds.length > 0 ? ` · ${overdueMeds.length} overdue` : ""}</p>
            </div>
            <ChevronRight size={16} color={t3} style={{ flexShrink: 0 }} />
          </motion.div>

          {/* Appointments row */}
          <motion.div className="au d4" whileHover={{ x: 2 }} onClick={openApptsModal} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 16, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(14,116,144,.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Calendar size={16} color="var(--doc-p)" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0 }}>Appointments</p>
              <p style={{ color: t3, fontSize: 12, marginTop: 2 }}>{appointments.length === 0 ? "No upcoming appointments" : `${appointments.length} upcoming`}</p>
            </div>
            <ChevronRight size={16} color={t3} style={{ flexShrink: 0 }} />
          </motion.div>

          {/* Prescriptions row */}
          {prescriptions.length > 0 && (
            <motion.div className="au d4" whileHover={{ x: 2 }} onClick={openRxModal} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 16, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--pd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Pill size={16} color="var(--p)" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0 }}>Prescriptions</p>
                <p style={{ color: t3, fontSize: 12, marginTop: 2 }}>{prescriptions.length} prescription{prescriptions.length !== 1 ? "s" : ""}</p>
              </div>
              <ChevronRight size={16} color={t3} style={{ flexShrink: 0 }} />
            </motion.div>
          )}

          {/* Notifications row */}
          {notifications.length > 0 && (
            <motion.div className="au d5" whileHover={{ x: 2 }} onClick={openNotifModal} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 16, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(217,119,6,.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
                <Bell size={16} color="var(--am)" />
                {notifications.filter(n => !n.read_at).length > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "var(--am)", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifications.filter(n => !n.read_at).length}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0 }}>Notifications</p>
                <p style={{ color: t3, fontSize: 12, marginTop: 2 }}>{notifications.filter(n => !n.read_at).length > 0 ? `${notifications.filter(n => !n.read_at).length} unread` : `${notifications.length} notification${notifications.length !== 1 ? "s" : ""}`}</p>
              </div>
              <ChevronRight size={16} color={t3} style={{ flexShrink: 0 }} />
            </motion.div>
          )}

          {/* Care team row */}
          {careTeam.length > 0 && (
            <motion.div className="au" whileHover={{ x: 2 }} onClick={() => setModal({ type: "care", title: "My Care Team" })} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 16, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--pd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Stethoscope size={16} color="var(--p)" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0 }}>My Care Team</p>
                <p style={{ color: t3, fontSize: 12, marginTop: 2 }}>{careTeam.length} member{careTeam.length !== 1 ? "s" : ""}</p>
              </div>
              <ChevronRight size={16} color={t3} style={{ flexShrink: 0 }} />
            </motion.div>
          )}
        </div>

        {/* Health tip */}
        <motion.div className="au d5" style={{ borderRadius: 20, overflow: "hidden", position: "relative", background: "linear-gradient(135deg,rgba(8,145,178,.07) 0%,rgba(6,182,212,.04) 100%)", border: "1px solid rgba(8,145,178,.14)", boxShadow: "0 2px 12px rgba(8,145,178,.06)" }}>
          <div style={{ padding: "18px 22px", display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: "rgba(8,145,178,.12)", border: "1px solid rgba(8,145,178,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={16} color="var(--tl)" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: "var(--tl)", fontSize: 10, fontWeight: 800, letterSpacing: ".13em", textTransform: "uppercase", marginBottom: 6 }}>Health Tip</p>
              <p style={{ color: t2, fontSize: 13.5, lineHeight: 1.8, margin: 0 }}>{tip}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {modal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <motion.div initial={{ y: 20, opacity: 0, scale: .97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }} onClick={e => e.stopPropagation()} style={{ background: "var(--bg)", borderRadius: 20, width: "100%", maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column", border: "1px solid var(--b1)", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <h3 style={{ color: t1, fontSize: 16, fontWeight: 700, margin: 0 }}>{modal.title}</h3>
                <button onClick={() => setModal(null)} style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--b1)", background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><X size={13} /></button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
                {renderModalContent()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drug Info Modal */}
      <AnimatePresence>
        {drugInfo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrugInfo(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <motion.div initial={{ y: 24, opacity: 0, scale: .97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }} onClick={e => e.stopPropagation()} style={{ background: "var(--bg)", borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column", border: "1px solid var(--b1)", boxShadow: "0 24px 64px rgba(0,0,0,.22)" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--pd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Info size={18} color="var(--p)" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: t3, fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", margin: "0 0 4px" }}>Medication</p>
                  <h3 style={{ color: t1, fontSize: 19, fontWeight: 800, margin: 0, lineHeight: 1.25 }}>{drugInfo.med.name}</h3>
                  <p style={{ color: t3, fontSize: 12, margin: "6px 0 0", lineHeight: 1.45 }}>{drugInfo.med.dosage}{drugInfo.med.freq ? ` · ${drugInfo.med.freq}` : ""} · FDA label (openFDA)</p>
                </div>
                <button onClick={() => setDrugInfo(null)} style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--b1)", background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, flexShrink: 0 }}><X size={13} /></button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                {drugInfo.loading && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: t3 }}>
                    <Loader2 size={18} style={{ animation: "spin360 .7s linear infinite" }} />
                    <span style={{ fontSize: 13 }}>Loading FDA label data…</span>
                  </div>
                )}
                {!drugInfo.loading && !drugInfo.data && (
                  <div style={{ textAlign: "center", padding: "32px 0" }}>
                    <AlertTriangle size={28} color={t3} style={{ opacity: .3, margin: "0 auto 12px", display: "block" }} />
                    <p style={{ color: t2, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No information found</p>
                    <p style={{ color: t3, fontSize: 13 }}>No matching entry in the FDA openFDA label database for “{drugInfo.med.name}”. Try spelling the brand or generic name, or ask your pharmacist. You can also search <a href="https://dailymed.nlm.nih.gov/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--p)" }}>DailyMed</a>.</p>
                  </div>
                )}
                {!drugInfo.loading && drugInfo.data && (() => {
                  const d = drugInfo.data;
                  const fdaNames = getDrugDisplayNames(d);
                  const strip = (c) => String(c || "").replace(/^\d+\s+[A-Z\s&]+\n?/, "").trim();
                  const sections = [
                    { icon: Info, color: "var(--p)", bg: "rgba(37,99,235,.05)", border: "rgba(37,99,235,.18)", title: "Usage", content: strip(d.indications_and_usage?.[0]) },
                    { icon: Pill, color: "var(--tl)", bg: "rgba(8,145,178,.06)", border: "rgba(8,145,178,.18)", title: "Dosage", content: strip(d.dosage_and_administration?.[0]) },
                    { icon: Shield, color: "var(--ro)", bg: "rgba(185,28,28,.06)", border: "rgba(185,28,28,.18)", title: "Warnings", content: strip(d.warnings?.[0] || d.boxed_warning?.[0]) },
                    { icon: AlertTriangle, color: "var(--am)", bg: "rgba(217,119,6,.06)", border: "rgba(217,119,6,.18)", title: "Side effects", content: strip(d.adverse_reactions?.[0]) },
                    { icon: AlertCircle, color: "var(--ro)", bg: "rgba(185,28,28,.04)", border: "rgba(185,28,28,.14)", title: "Contraindications", content: strip(d.contraindications?.[0]) },
                    { icon: Info, color: t2, bg: "var(--s2)", border: "var(--b1)", title: "Interactions", content: strip(d.drug_interactions?.[0]) },
                    { icon: Info, color: t2, bg: "var(--s2)", border: "var(--b1)", title: "Pregnancy & nursing", content: strip(d.pregnancy?.[0] || d.nursing_mothers?.[0]) },
                  ].filter((s) => s.content);
                  return (
                    <>
                  {(fdaNames.brandLine || fdaNames.genericLine) && (
                    <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--pd)", border: "1px solid rgba(37,99,235,.2)", marginBottom: 4 }}>
                      <p style={{ color: t1, fontSize: 12.5, fontWeight: 700, margin: "0 0 4px" }}>FDA product names</p>
                      {fdaNames.brandLine && <p style={{ color: t2, fontSize: 12, margin: 0, lineHeight: 1.5 }}><span style={{ color: t3, fontWeight: 600 }}>Brand:</span> {fdaNames.brandLine}</p>}
                      {fdaNames.genericLine && <p style={{ color: t2, fontSize: 12, margin: "6px 0 0", lineHeight: 1.5 }}><span style={{ color: t3, fontWeight: 600 }}>Generic:</span> {fdaNames.genericLine}</p>}
                    </div>
                  )}
                  {sections.map(({ icon: Icon, color, bg, border, title, content }) => {
                    const isOpen = !!expandedDrugSections[title];
                    const preview = summarizePlainText(content, 200);
                    return (
                    <div key={title} style={{ borderRadius: 14, border: `1px solid ${border}`, background: bg, overflow: "hidden" }}>
                      <button type="button" onClick={() => setExpandedDrugSections((prev) => ({ ...prev, [title]: !prev[title] }))}
                        style={{ width: "100%", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                        <Icon size={15} color={color} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: t1, fontSize: 13.5, fontWeight: 700 }}>{title}</span>
                            <span style={{ color: t3, fontSize: 10, fontWeight: 700 }}>{isOpen ? "Hide" : "Show full"}</span>
                          </div>
                          {!isOpen && (
                            <p style={{ color: t3, fontSize: 12, margin: "6px 0 0", lineHeight: 1.55 }}>{preview}</p>
                          )}
                        </div>
                        <ChevronDown size={16} color={color} style={{ flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s ease" }} />
                      </button>
                      <div style={{ maxHeight: isOpen ? 320 : 0, opacity: isOpen ? 1 : 0, overflowY: isOpen ? "auto" : "hidden", transition: "max-height .22s ease, opacity .2s ease", padding: isOpen ? "0 16px 14px" : "0 16px" }}>
                        <p style={{ color: t1, fontSize: 13, lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>
                          {content}
                        </p>
                      </div>
                    </div>
                  );
                  })}
                  </>
                  );
                })()}
                <p style={{ color: t3, fontSize: 11, textAlign: "center", marginTop: 4 }}>Source: U.S. FDA via openFDA. Educational only — follow your prescriber and pharmacist.</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
