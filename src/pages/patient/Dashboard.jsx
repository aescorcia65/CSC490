import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Calendar, Plus, Clock, Check, AlertCircle, Flame, Loader2, TrendingUp, Bell, CheckCircle2, Pencil, Stethoscope, Sparkles, Trash2, X, ChevronRight, Info, AlertTriangle, Shield } from "lucide-react";
import { supabase } from "../../supabase";
import { COLS, TIPS, PRESCRIPTION_STATUS_LABELS } from "../../lib/constants";
import { to12h } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useClock } from "../../hooks/useClock";
import Ring from "../../components/common/Ring";
import AppointmentRow from "../../components/appointments/AppointmentRow";
import { logMedicationTaken, unlogMedicationTaken, getAdherenceStreak, getDailyAdherence, getWeekStart } from "../../lib/adherence";

// Fetch drug info from OpenFDA (free, no key needed)
async function fetchDrugInfo(medName) {
  const name = medName.replace(/\s*\(.*?\)\s*/g, "").trim(); // strip brand name in parens
  const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(name)}"+openfda.generic_name:"${encodeURIComponent(name)}"&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // fallback: search by generic name only
      const res2 = await fetch(`https://api.fda.gov/drug/label.json?search=${encodeURIComponent(name)}&limit=1`);
      if (!res2.ok) return null;
      const d2 = await res2.json();
      return d2.results?.[0] || null;
    }
    const d = await res.json();
    return d.results?.[0] || null;
  } catch { return null; }
}

export default function Dashboard({ user, meds, setMeds, onAdd, onEdit, onDelete, onChat, displayName, onEditName }) {
  const now = useClock();
  const isMob = useIsMobile();
  const activeMeds = meds.filter(m => m.active !== false);
  const taken = activeMeds.filter(m => m.taken).length;
  const total = activeMeds.length;
  const pct = total ? Math.round(taken / total * 100) : 0;
  const hr = now.getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const tip = TIPS[now.getDate() % TIPS.length];
  const name = displayName || user?.displayName || user?.email?.split("@")[0] || "there";
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)";
  const toMins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const curMins = hr * 60 + now.getMinutes();
  const nextMed = [...activeMeds].filter(m => !m.taken && toMins(m.time) > curMins).sort((a, b) => toMins(a.time) - toMins(b.time))[0];
  const overdueMeds = [...activeMeds].filter(m => !m.taken && toMins(m.time) < curMins);

  const [streak, setStreak] = useState(0);
  const [weekAvg, setWeekAvg] = useState(0);
  const [modal, setModal] = useState(null);
  const [drugInfo, setDrugInfo] = useState(null); // { med, data, loading }

  async function openDrugInfo(med) {
    setDrugInfo({ med, data: null, loading: true });
    const data = await fetchDrugInfo(med.name);
    setDrugInfo({ med, data, loading: false });
  } // { title, content }

  const refreshAdherenceStats = useCallback(async () => {
    if (!user?.id) return;
    const weekStart = getWeekStart();
    const today = new Date();
    const [daily, str] = await Promise.all([
      getDailyAdherence(user.id, weekStart, today),
      getAdherenceStreak(user.id),
    ]);
    const avg = (daily && daily.length)
      ? Math.round(daily.reduce((s, row) => s + (row.adherence_pct || 0), 0) / daily.length)
      : 0;
    setWeekAvg(avg);
    setStreak(str ?? 0);
  }, [user?.id]);

  const toggle = useCallback(async (id) => {
    const med = meds.find(m => m.id === id);
    if (!med || med.active === false) return;
    const wasTaken = med.taken;
    setMeds(ms => ms.map(m => m.id === id ? { ...m, taken: !m.taken } : m));
    const ok = wasTaken
      ? await unlogMedicationTaken(user.id, id)
      : await logMedicationTaken(user.id, id);
    if (!ok) {
      setMeds(ms => ms.map(m => m.id === id ? { ...m, taken: wasTaken } : m));
      return;
    }
    await refreshAdherenceStats();
  }, [meds, user?.id, setMeds, refreshAdherenceStats]);

  const [prescriptions, setPrescriptions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [careTeam, setCareTeam] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [pRes, nRes, aRes] = await Promise.all([
        supabase.from("prescriptions").select("id,status,created_at,notes").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("notifications").select("id,type,title,body,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("appointments").select("id,date,time,type,notes,status,reschedule_request,doctor_id").eq("patient_id", user.id).in("status", ["scheduled", "rescheduled"]).order("date", { ascending: true }).limit(10),
      ]);
      setPrescriptions(pRes.data || []); setNotifications(nRes.data || []); setAppointments(aRes.data || []);
      refreshAdherenceStats();
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
  }, [user?.id, refreshAdherenceStats]);

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
      else if (payload.eventType === "UPDATE") { if (payload.new.status === "cancelled") setAppointments(prev => prev.filter(a => a.id !== payload.new.id)); else setAppointments(prev => prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a)); }
      else if (payload.eventType === "DELETE") setAppointments(prev => prev.filter(a => a.id !== payload.old.id));
    }).subscribe());
    channels.push(supabase.channel(`pt-ml-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "medication_logs", filter: `user_id=eq.${user.id}` }, () => {
      refreshAdherenceStats();
    }).subscribe());
    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, [user?.id, refreshAdherenceStats]);

  const ringColor = pct >= 80 ? "var(--gr)" : pct >= 40 ? "var(--am)" : "var(--ro)";
  const progressGrad = pct >= 80 ? "linear-gradient(90deg,#059669,#10b981)" : pct >= 40 ? "linear-gradient(90deg,#b45309,#d97706)" : "linear-gradient(90deg,#b91c1c,#dc2626)";

  function openMedsModal() {
    setModal({ title: "Today's Medications", kind: "meds" });
  }

  function openApptsModal() {
    setModal({
      title: "Upcoming Appointments",
      content: appointments.length === 0
        ? <p style={{ color: t3, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No upcoming appointments.</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {appointments.map(appt => (
              <AppointmentRow key={appt.id} appt={appt}
                onCancel={id => setAppointments(as => as.filter(a => a.id !== id))}
                onRescheduled={(id, req) => setAppointments(as => as.map(a => a.id === id ? { ...a, reschedule_request: req, status: "rescheduled" } : a))} />
            ))}
          </div>
    });
  }

  function openRxModal() {
    setModal({
      title: "Prescriptions",
      content: prescriptions.length === 0
        ? <p style={{ color: t3, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No prescriptions found.</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {prescriptions.map(pr => (
              <div key={pr.id} style={{ padding: "10px 14px", borderRadius: 12, background: "var(--s2)", border: "1px solid var(--b0)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: t3, fontSize: 12 }}>{new Date(pr.created_at).toLocaleDateString()}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: pr.status === "ready" ? "rgba(5,150,105,.12)" : (pr.status === "filled" || pr.status === "picked_up") ? "var(--pd)" : "rgba(217,119,6,.12)", color: pr.status === "ready" ? "var(--gr)" : (pr.status === "filled" || pr.status === "picked_up") ? "var(--p)" : "var(--am)" }}>
                    {PRESCRIPTION_STATUS_LABELS[pr.status] || pr.status}
                  </span>
                </div>
                {pr.notes && <p style={{ color: t2, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{pr.notes}</p>}
              </div>
            ))}
          </div>
    });
  }

  function openNotifModal() {
    setModal({
      title: "Notifications",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notifications.length === 0 && <p style={{ color: t3, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No notifications.</p>}
          {notifications.map(n => (
            <motion.div key={n.id} layout style={{ padding: "10px 12px", borderRadius: 11, background: n.read_at ? "var(--s2)" : "rgba(37,99,235,.06)", border: `1px solid ${n.read_at ? "var(--b0)" : "rgba(37,99,235,.14)"}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: t1, fontSize: 12.5, fontWeight: n.read_at ? 500 : 700, margin: 0 }}>{n.title}</p>
                {n.body && <p style={{ color: t3, fontSize: 11.5, marginTop: 3, marginBottom: 0, lineHeight: 1.5 }}>{n.body}</p>}
              </div>
              <button onClick={async () => {
                if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
                setNotifications(prev => prev.filter(x => x.id !== n.id));
              }} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: t3, padding: 2, display: "flex", opacity: .5 }}><X size={13} /></button>
            </motion.div>
          ))}
        </div>
      )
    });
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
            { l: "Week avg", v: `${weekAvg}%`, I: TrendingUp, c: "var(--p)", bg: "var(--pd)", onClick: null },
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
            <motion.div className="au" whileHover={{ x: 2 }} onClick={() => setModal({
              title: "My Care Team",
              content: (
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
              )
            })} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 16, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
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
        <motion.div className="au d5 relative overflow-hidden rounded-[20px] border border-[rgba(8,145,178,0.14)] bg-gradient-to-br from-[rgba(8,145,178,0.07)] to-[rgba(6,182,212,0.04)] shadow-[0_2px_12px_rgba(8,145,178,0.06)]">
          <div className="flex items-start gap-4 px-5 py-[18px] sm:px-[22px]">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-[rgba(8,145,178,0.2)] bg-[rgba(8,145,178,0.12)]">
              <Sparkles size={16} className="text-teal" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] text-teal">Health Tip</p>
              <p className="m-0 text-[13.5px] leading-[1.8] text-txt-2">{tip}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {modal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModal(null)} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
            <motion.div initial={{ y: 20, opacity: 0, scale: .97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }} onClick={e => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] border border-border-1 bg-[var(--bg)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="flex shrink-0 items-center justify-between border-b border-border-1 px-5 py-4">
                <h3 className="m-0 text-base font-bold text-txt-1">{modal.title}</h3>
                <button type="button" onClick={() => setModal(null)} className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-border-1 bg-surface-2 text-txt-3"><X size={13} /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3.5">
                {modal.kind === "meds" ? (
                  <div className="flex flex-col gap-2.5">
                    {activeMeds.length === 0 ? <p className="py-5 text-center text-[13px] text-txt-3">No medications yet.</p> :
                      [...activeMeds].sort((a, b) => a.time.localeCompare(b.time)).map((med) => {
                        const col = COLS[med.color] || COLS.blue;
                        const isOverdue = !med.taken && toMins(med.time) < curMins;
                        return (
                          <div key={med.id} className={`relative flex items-center gap-3 overflow-hidden rounded-[14px] border bg-surface-1 px-3.5 py-3 ${isOverdue ? "border-rose/20" : "border-border-1"}`}>
                            <div className="absolute bottom-0 left-0 top-0 w-1 rounded-l-[14px]" style={{ background: med.taken ? "rgba(16,185,129,.45)" : col.a }} />
                            <div className="ml-1.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border-[1.5px]" style={{ background: med.taken ? "rgba(16,185,129,.12)" : col.d, borderColor: med.taken ? "rgba(16,185,129,.35)" : col.b }}>
                              <Pill size={16} color={med.taken ? "var(--gr)" : col.a} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13.5px] font-bold text-txt-1">{med.name}</p>
                              <p className="mt-0.5 text-xs text-txt-3">{med.dosage}{med.freq ? ` · ${med.freq}` : ""} · {to12h(med.time)}</p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-1.5">
                              <button type="button" onClick={() => { setModal(null); openDrugInfo(med); }} title="Drug information" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-border-1 bg-transparent text-brand"><Info size={12} /></button>
                              {!isMob && <button type="button" onClick={() => onEdit(med)} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-border-1 bg-transparent text-txt-3"><Pencil size={12} /></button>}
                              {!isMob && <button type="button" onClick={() => onDelete(med.id)} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-rose/20 bg-rose/[0.05] text-rose"><Trash2 size={12} /></button>}
                              <button type="button" onClick={() => toggle(med.id)} title={med.taken ? "Mark not taken" : "Mark taken"} className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] transition-colors ${med.taken ? "border-0 bg-green shadow-[0_2px_10px_rgba(16,185,129,0.35)]" : "border border-border-0 bg-surface-2"}`}>
                                <Check size={16} strokeWidth={med.taken ? 2.75 : 2} color={med.taken ? "#fff" : "var(--t3)"} className={med.taken ? "drop-shadow-[0_0_1px_rgba(255,255,255,0.5)]" : ""} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  modal.content
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drug Info Modal */}
      <AnimatePresence>
        {drugInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrugInfo(null)}
            className="fixed inset-0 z-[90] box-border flex items-center justify-center bg-black/60 pt-[max(10px,env(safe-area-inset-top))] pr-[max(10px,env(safe-area-inset-right))] pb-[max(10px,env(safe-area-inset-bottom))] pl-[max(10px,env(safe-area-inset-left))] md:p-5"
          >
            <motion.div
              initial={{ y: 24, opacity: 0, scale: .97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className={`flex min-h-0 w-full max-w-lg flex-col border border-border-1 bg-[var(--bg)] shadow-[0_24px_64px_rgba(0,0,0,0.22)] ${isMob ? "max-h-[min(92dvh,900px)] rounded-[18px]" : "max-h-[min(88vh,820px)] rounded-[20px]"}`}
            >
              <div className={`flex shrink-0 items-start border-b border-border-1 ${isMob ? "gap-2.5 px-3.5 pb-3 pt-3.5" : "gap-3 px-5 pb-3.5 pt-4"}`}>
                <div className={`mt-0.5 flex shrink-0 items-center justify-center rounded-[11px] bg-brand-dim ${isMob ? "h-9 w-9" : "h-10 w-10"}`}>
                  <Info size={isMob ? 15 : 17} className="text-brand" />
                </div>
                <div className="min-w-0 flex-1 pr-1">
                  <h3 className={`break-words font-bold leading-snug text-txt-1 [overflow-wrap:anywhere] ${isMob ? "text-[15px]" : "text-[17px]"}`}>
                    {drugInfo.med.name}
                  </h3>
                  <p className={`mt-1.5 leading-[1.45] text-txt-3 ${isMob ? "text-xs" : "text-[13px]"}`}>
                    {drugInfo.med.dosage} · Drug information
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setDrugInfo(null)}
                  className={`flex shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-border-1 bg-surface-2 text-txt-3 md:mt-0 ${isMob ? "-mt-1 h-11 min-w-[44px] w-11" : "h-[34px] min-w-[34px] w-[34px]"}`}
                >
                  <X size={isMob ? 15 : 14} />
                </button>
              </div>
              <div
                className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${isMob ? "gap-[11px] px-3.5 pb-4 pt-3.5" : "gap-3.5 px-5 pb-5 pt-[18px]"}`}
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {drugInfo.loading && (
                  <div className="flex items-center justify-center gap-3 px-2 py-9 text-txt-3">
                    <Loader2 size={20} className="auth-spin shrink-0" />
                    <span className={`leading-snug ${isMob ? "text-sm" : "text-[13px]"}`}>Looking up drug information…</span>
                  </div>
                )}
                {!drugInfo.loading && !drugInfo.data && (
                  <div className="px-1 pb-2 pt-6 text-center">
                    <AlertTriangle size={isMob ? 32 : 28} className="mx-auto mb-3.5 block text-txt-3 opacity-30" />
                    <p className={`mb-2 font-semibold leading-snug text-txt-2 ${isMob ? "text-[15px]" : "text-sm"}`}>No information found</p>
                    <p className={`mx-auto max-w-[400px] leading-relaxed text-txt-3 [overflow-wrap:anywhere] ${isMob ? "text-sm" : "text-[13px]"}`}>
                      Drug information for "{drugInfo.med.name}" is not available in our database. Please consult your pharmacist or prescribing doctor.
                    </p>
                  </div>
                )}
                {!drugInfo.loading && drugInfo.data && (() => {
                  const d = drugInfo.data;
                  const sections = [
                    { icon: Shield, color: "var(--ro)", bg: "rgba(185,28,28,.06)", border: "rgba(185,28,28,.18)", title: "Warnings", content: d.warnings?.[0] || d.boxed_warning?.[0] },
                    { icon: AlertTriangle, color: "var(--am)", bg: "rgba(217,119,6,.06)", border: "rgba(217,119,6,.18)", title: "Side Effects", content: d.adverse_reactions?.[0] },
                    { icon: Info, color: "var(--p)", bg: "rgba(37,99,235,.05)", border: "rgba(37,99,235,.18)", title: "Indications & Usage", content: d.indications_and_usage?.[0] },
                    { icon: Pill, color: "var(--tl)", bg: "rgba(8,145,178,.06)", border: "rgba(8,145,178,.18)", title: "Dosage & Administration", content: d.dosage_and_administration?.[0] },
                    { icon: AlertCircle, color: "var(--ro)", bg: "rgba(185,28,28,.04)", border: "rgba(185,28,28,.14)", title: "Contraindications", content: d.contraindications?.[0] },
                    { icon: Info, color: "var(--t2)", bg: "var(--s2)", border: "var(--b1)", title: "Drug Interactions", content: d.drug_interactions?.[0] },
                    { icon: Info, color: "var(--t2)", bg: "var(--s2)", border: "var(--b1)", title: "Pregnancy & Nursing", content: d.pregnancy?.[0] || d.nursing_mothers?.[0] },
                  ].filter(s => s.content);
                  return sections.map(({ icon: Icon, color, bg, border, title, content }) => (
                    <div
                      key={title}
                      className={`shrink-0 overflow-hidden border ${isMob ? "rounded-xl" : "rounded-[14px]"}`}
                      style={{ background: bg, borderColor: border }}
                    >
                      <div className={`flex items-start gap-2.5 ${isMob ? "px-3.5 py-3" : "px-4 py-3"}`}>
                        <Icon size={isMob ? 15 : 14} color={color} className="mt-0.5 shrink-0" />
                        <span className={`font-bold uppercase tracking-wide ${isMob ? "text-[11px] leading-snug" : "text-xs leading-snug"}`} style={{ color }}>{title}</span>
                      </div>
                      <div className={isMob ? "px-3.5 pb-3.5" : "px-4 pb-4"}>
                        <p className={`m-0 break-words whitespace-pre-wrap text-txt-1 [overflow-wrap:anywhere] ${isMob ? "text-[15px] leading-relaxed" : "text-sm leading-[1.75]"}`}>
                          {content.replace(/^\d+\s+[A-Z\s&]+\n?/, "").trim()}
                        </p>
                      </div>
                    </div>
                  ));
                })()}
                <p className={`mt-auto shrink-0 text-center text-[11px] leading-normal text-txt-3 ${isMob ? "pb-[max(4px,env(safe-area-inset-bottom))]" : "pt-2"}`}>
                  Source: FDA Drug Label Database · Always follow your doctor&apos;s instructions.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
