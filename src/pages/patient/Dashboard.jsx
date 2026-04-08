import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Calendar, Plus, Clock, Check, AlertCircle, Flame, Loader2, TrendingUp, Bell, CheckCircle2, Pencil, Stethoscope, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "../../supabase";
import { COLS, TIPS, PRESCRIPTION_STATUS_LABELS } from "../../lib/constants";
import { to12h } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useClock } from "../../hooks/useClock";
import Ring from "../../components/common/Ring";
import AppointmentRow from "../../components/appointments/AppointmentRow";
import { logMedicationTaken, unlogMedicationTaken, getAdherenceStreak } from "../../lib/adherence";

export default function Dashboard({ user, meds, setMeds, onAdd, onEdit, onDelete, onChat, displayName, onEditName }) {
  const now = useClock();
  const isMob = useIsMobile();
  const taken = meds.filter(m => m.taken).length;
  const total = meds.length;
  const pct = total ? Math.round(taken / total * 100) : 0;
  const hr = now.getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const tip = TIPS[now.getDate() % TIPS.length];
  const name = displayName || user?.displayName || user?.email?.split("@")[0] || "there";
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)";
  const toMins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const curMins = hr * 60 + now.getMinutes();
  const nextMed = [...meds].filter(m => !m.taken && toMins(m.time) > curMins).sort((a, b) => toMins(a.time) - toMins(b.time))[0];
  const overdueMeds = [...meds].filter(m => !m.taken && toMins(m.time) < curMins);

  const [streak, setStreak] = useState(0);

  // Persist taken/untaken to medication_logs
  const toggle = useCallback(async (id) => {
    const med = meds.find(m => m.id === id);
    if (!med) return;
    const wasTaken = med.taken;
    // Optimistic UI update
    setMeds(ms => ms.map(m => m.id === id ? { ...m, taken: !m.taken } : m));
    if (wasTaken) {
      await unlogMedicationTaken(user.id, id);
    } else {
      await logMedicationTaken(user.id, id);
    }
  }, [meds, user?.id, setMeds]);

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
      // Load adherence streak
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

    channels.push(
      supabase.channel(`pt-rx-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions", filter: `patient_id=eq.${user.id}` }, (payload) => {
          if (payload.eventType === "INSERT") {
            setPrescriptions(prev => prev.some(p => p.id === payload.new.id) ? prev : [payload.new, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setPrescriptions(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
          } else if (payload.eventType === "DELETE") {
            setPrescriptions(prev => prev.filter(p => p.id !== payload.old.id));
          }
        }).subscribe()
    );

    channels.push(
      supabase.channel(`pt-notif-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
          if (payload.eventType === "INSERT") {
            setNotifications(prev => prev.some(n => n.id === payload.new.id) ? prev : [payload.new, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setNotifications(prev => prev.map(n => n.id === payload.new.id ? { ...n, ...payload.new } : n));
          } else if (payload.eventType === "DELETE") {
            setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
          }
        }).subscribe()
    );

    channels.push(
      supabase.channel(`pt-appt-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `patient_id=eq.${user.id}` }, (payload) => {
          if (payload.eventType === "INSERT") {
            if (["scheduled", "rescheduled"].includes(payload.new.status)) {
              setAppointments(prev => prev.some(a => a.id === payload.new.id) ? prev : [...prev, payload.new]);
            }
          } else if (payload.eventType === "UPDATE") {
            if (payload.new.status === "cancelled") {
              setAppointments(prev => prev.filter(a => a.id !== payload.new.id));
            } else {
              setAppointments(prev => prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a));
            }
          } else if (payload.eventType === "DELETE") {
            setAppointments(prev => prev.filter(a => a.id !== payload.old.id));
          }
        }).subscribe()
    );

    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, [user?.id]);

  const ringColor = pct >= 80 ? "var(--gr)" : pct >= 40 ? "var(--am)" : "var(--ro)";
  const progressGrad = pct >= 80 ? "linear-gradient(90deg,#059669,#10b981)" : pct >= 40 ? "linear-gradient(90deg,#b45309,#d97706)" : "linear-gradient(90deg,#b91c1c,#dc2626)";

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
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
              <motion.button whileHover={{ scale: 1.06, y: -1 }} whileTap={{ scale: .94 }} onClick={onChat} title="Health Advisor"
                style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid var(--b1)", background: "var(--s1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--p)", transition: "all .15s", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--p)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,.2)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.06)"; }}>
                <Stethoscope size={17} />
              </motion.button>
              <motion.button whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: .97 }} className="btn" onClick={onAdd}
                style={{ padding: "10px 20px", fontSize: 13.5, borderRadius: 12, display: "flex", alignItems: "center", gap: 7, fontWeight: 700 }}>
                <Plus size={15} /> {!isMob && "Add Medication"}
              </motion.button>
            </div>
          </div>
        </motion.div>

        <motion.div className="au d1" style={{ marginBottom: 16, borderRadius: 24, overflow: "hidden", position: "relative", background: "linear-gradient(135deg,var(--s1) 0%,var(--s2) 100%)", border: "1px solid var(--b1)", boxShadow: "0 4px 24px rgba(0,0,0,.07)" }}>
          <div style={{ position: "absolute", right: -40, top: -40, width: 220, height: 220, borderRadius: "50%", border: "1px solid var(--b0)", opacity: .5, pointerEvents: "none" }} />
          <div className={`flex ${isMob ? "flex-col items-center text-center" : "items-center justify-between"} gap-5 relative z-[1]`}
            style={{ padding: isMob ? "22px 20px" : "26px 28px" }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: t3, fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 10 }}>Daily Adherence</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <motion.span key={pct} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  style={{ fontSize: isMob ? 44 : 64, lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 700, color: ringColor, letterSpacing: "-.02em" }}>
                  {pct}
                </motion.span>
                <span style={{ color: t2, fontSize: 26, fontWeight: 300 }}>%</span>
              </div>
              <p style={{ color: t2, fontSize: 13.5, marginBottom: 14, lineHeight: 1.5 }}>
                {taken === 0 && total > 0 ? "No medications taken yet today" : taken === total && total > 0 ? "All medications taken — great job!" : total === 0 ? "No medications added yet" : `${taken} of ${total} medications taken today`}
              </p>
              {nextMed ? (
                <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 10, background: "var(--pd)", border: "1px solid rgba(37,99,235,.22)" }}>
                  <Clock size={12} color="var(--p)" />
                  <span style={{ color: "var(--p)", fontSize: 12.5, fontWeight: 700 }}>Next: {nextMed.name} at {to12h(nextMed.time)}</span>
                </motion.div>
              ) : taken === total && total > 0 ? (
                <motion.div initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 10, background: "rgba(5,150,105,.1)", border: "1px solid rgba(5,150,105,.22)" }}>
                  <CheckCircle2 size={12} color="var(--gr)" />
                  <span style={{ color: "var(--gr)", fontSize: 12.5, fontWeight: 700 }}>All done for today!</span>
                </motion.div>
              ) : null}
              <div style={{ marginTop: 18, height: 6, width: 240, maxWidth: "100%", borderRadius: 99, overflow: "hidden", background: "var(--b0)" }}>
                <motion.div style={{ height: "100%", borderRadius: 99, background: progressGrad }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1.2, ease: [.22, 1, .36, 1], delay: .3 }} />
              </div>
              {overdueMeds.length > 0 && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .5 }} style={{ color: "var(--ro)", fontSize: 11.5, fontWeight: 600, marginTop: 10 }}>
                  {overdueMeds.length} medication{overdueMeds.length > 1 ? "s" : ""} overdue
                </motion.p>
              )}
            </div>
            <Ring pct={pct} size={isMob ? 80 : 108} sw={isMob ? 6 : 8} color={ringColor}>
              <div style={{ textAlign: "center" }}><span style={{ color: ringColor, fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{pct}%</span></div>
            </Ring>
          </div>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { l: "Done today", v: `${taken}/${total}`, I: CheckCircle2, c: "var(--gr)", bg: "rgba(5,150,105,.1)" },
            { l: "Day streak", v: `${streak} day${streak !== 1 ? "s" : ""}`, I: Flame, c: "var(--am)", bg: "rgba(217,119,6,.1)" },
            { l: "Adherence", v: `${pct}%`, I: TrendingUp, c: "var(--p)", bg: "var(--pd)" },
            { l: "Medications", v: String(total), I: Pill, c: "var(--tl)", bg: "rgba(8,145,178,.1)" },
          ].map((s, i) => (
            <motion.div key={s.l} className={`au d${i + 1}`} whileHover={{ y: -3, boxShadow: "0 12px 32px rgba(0,0,0,.1)" }}
              style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "16px 15px", cursor: "default", transition: "box-shadow .2s", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: s.bg, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${s.bg}` }}>
                <s.I size={16} color={s.c} />
              </div>
              <p style={{ color: t1, fontSize: 20, fontVariantNumeric: "tabular-nums", fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 700, marginBottom: 3 }}>{s.v}</p>
              <p style={{ color: t3, fontSize: 10, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase" }}>{s.l}</p>
            </motion.div>
          ))}
        </div>

        <motion.div className="au d3" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h3 style={{ color: t1, fontSize: 16, fontWeight: 700, letterSpacing: "-.02em", margin: 0 }}>Today's Schedule</h3>
              <p style={{ color: t3, fontSize: 12, marginTop: 3 }}>{taken}/{total} medications taken</p>
            </div>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }} onClick={onAdd}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10, border: "1px solid var(--b1)", background: "transparent", cursor: "pointer", color: t2, fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--p)"; e.currentTarget.style.color = "var(--p)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.color = t2; }}>
              <Plus size={13} /> Add
            </motion.button>
          </div>
          {total === 0 ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 20, padding: "56px 32px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: "var(--s2)", border: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Pill size={24} color={t3} style={{ opacity: .35 }} />
              </div>
              <p style={{ color: t2, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No medications yet</p>
              <p style={{ color: t3, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>Add your first medication to start tracking your schedule.</p>
              <motion.button whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: .97 }} className="btn" onClick={onAdd}
                style={{ padding: "10px 22px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Plus size={14} /> Add your first medication
              </motion.button>
            </motion.div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[...meds].sort((a, b) => a.time.localeCompare(b.time)).map((med, i) => {
                const col = COLS[med.color] || COLS.blue;
                const isOverdue = !med.taken && toMins(med.time) < curMins;
                return (
                  <motion.div key={med.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 + i * .04, duration: .3, ease: [.22, 1, .36, 1] }}
                    whileHover={{ y: -2, boxShadow: "0 10px 32px rgba(0,0,0,.1)" }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--s1)", border: `1px solid ${isOverdue ? "rgba(185,28,28,.2)" : "var(--b1)"}`, borderRadius: 18, position: "relative", overflow: "hidden", opacity: med.taken ? .65 : 1, cursor: "default", boxShadow: "0 2px 8px rgba(0,0,0,.04)", transition: "box-shadow .2s,border-color .2s,opacity .2s" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: med.taken ? "var(--b1)" : col.a, borderRadius: "18px 0 0 18px", opacity: med.taken ? .5 : 1, transition: "all .2s" }} />
                    <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: .92 }} onClick={() => toggle(med.id)}
                      style={{ width: 44, height: 44, borderRadius: 14, background: med.taken ? "var(--s2)" : col.d, border: `1.5px solid ${med.taken ? "var(--b1)" : col.b}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 6, cursor: "pointer", transition: "all .18s" }}>
                      <Pill size={18} color={med.taken ? t3 : col.a} />
                    </motion.div>
                    <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => toggle(med.id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <p style={{ color: t1, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: med.taken ? "line-through" : "none", opacity: med.taken ? .55 : 1, margin: 0 }}>{med.name}</p>
                        {isOverdue && <span style={{ flexShrink: 0, padding: "2px 7px", borderRadius: 6, background: "rgba(185,28,28,.1)", border: "1px solid rgba(185,28,28,.2)", color: "var(--ro)", fontSize: 10, fontWeight: 700 }}>Overdue</span>}
                        {med.taken && <span style={{ flexShrink: 0, padding: "2px 7px", borderRadius: 6, background: "rgba(5,150,105,.1)", border: "1px solid rgba(5,150,105,.2)", color: "var(--gr)", fontSize: 10, fontWeight: 700 }}>Taken</span>}
                      </div>
                      <p style={{ color: t3, fontSize: 12, marginTop: 3 }}>{med.dosage}{med.freq ? ` · ${med.freq}` : ""}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: isMob ? "4px 8px" : "6px 12px", borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b0)", flexShrink: 0 }}>
                      <Clock size={11} color={t3} />
                      <span style={{ color: t2, fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{to12h(med.time)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isMob && <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: .9 }} className="ibtn primary" onClick={e => { e.stopPropagation(); onEdit(med); }} title="Edit"><Pencil size={13} /></motion.button>}
                      {!isMob && <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: .9 }} className="ibtn danger" onClick={e => { e.stopPropagation(); onDelete(med.id); }} title="Delete"><Trash2 size={13} /></motion.button>}
                      <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: .93 }} onClick={() => toggle(med.id)}
                        title={med.taken ? "Mark as not taken" : "Mark as taken"}
                        style={{ width: 36, height: 36, borderRadius: 11, border: "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: med.taken ? "var(--gr)" : "var(--s2)", boxShadow: med.taken ? "0 4px 14px rgba(5,150,105,.35)" : "none", transition: "all .2s" }}>
                        <Check size={15} color={med.taken ? "#fff" : t3} />
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {appointments.length > 0 && (
          <motion.div className="au d4" style={{ marginBottom: 16 }}>
            <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 20, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
              <h3 style={{ color: t1, fontSize: 13.5, fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <Calendar size={14} color="var(--p)" /> Upcoming Appointments
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {appointments.map(appt => (
                  <AppointmentRow key={appt.id} appt={appt}
                    onCancel={id => setAppointments(as => as.filter(a => a.id !== id))}
                    onRescheduled={(id, req) => setAppointments(as => as.map(a => a.id === id ? { ...a, reschedule_request: req, status: "rescheduled" } : a))} />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {(prescriptions.length > 0 || notifications.length > 0) && (
          <motion.div className="au d4" style={{ marginBottom: 16, display: "grid", gridTemplateColumns: !isMob && prescriptions.length > 0 && notifications.length > 0 ? "1fr 1fr" : "1fr", gap: 12 }}>
            {prescriptions.length > 0 && (
              <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 20, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
                <h3 style={{ color: t1, fontSize: 13.5, fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}><Pill size={14} color="var(--p)" /> Prescriptions</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {prescriptions.map(pr => (
                    <div key={pr.id} style={{ padding: "9px 12px", borderRadius: 11, background: "var(--s2)", border: "1px solid var(--b0)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ color: t3, fontSize: 11.5 }}>{new Date(pr.created_at).toLocaleDateString()}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: pr.status === "ready" ? "rgba(5,150,105,.12)" : (pr.status === "filled" || pr.status === "picked_up") ? "var(--pd)" : "rgba(217,119,6,.12)", color: pr.status === "ready" ? "var(--gr)" : (pr.status === "filled" || pr.status === "picked_up") ? "var(--p)" : "var(--am)" }}>
                          {PRESCRIPTION_STATUS_LABELS[pr.status] || pr.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {notifications.length > 0 && (
              <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 20, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
                  <h3 style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Bell size={14} color="var(--am)" /> Notifications
                    {notifications.filter(n => !n.read_at).length > 0 && (
                      <span style={{ padding: "1px 7px", borderRadius: 99, fontSize: 10.5, fontWeight: 800, background: "var(--am)", color: "#fff" }}>{notifications.filter(n => !n.read_at).length}</span>
                    )}
                  </h3>
                  <div className="flex gap-1.5 flex-wrap">
                    {notifications.some(n => !n.read_at) && (
                      <button onClick={async () => {
                        const unread = notifications.filter(n => !n.read_at);
                        await Promise.all(unread.map(n => supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id)));
                        setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
                      }} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid var(--b1)", background: "transparent", color: t3, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600 }}>
                        Mark all read
                      </button>
                    )}
                    <button onClick={() => setNotifications([])} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(185,28,28,.2)", background: "rgba(185,28,28,.05)", color: "var(--ro)", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600 }}>Clear all</button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {notifications.map(n => (
                    <motion.div key={n.id} layout style={{ padding: "10px 12px", borderRadius: 11, background: n.read_at ? "var(--s2)" : "rgba(37,99,235,.06)", border: `1px solid ${n.read_at ? "var(--b0)" : "rgba(37,99,235,.14)"}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: t1, fontSize: 12.5, fontWeight: n.read_at ? 500 : 700, margin: 0 }}>{n.title}</p>
                        {n.body && <p style={{ color: t3, fontSize: 11.5, marginTop: 3, marginBottom: 0, lineHeight: 1.5 }}>{n.body}</p>}
                      </div>
                      <button onClick={async () => {
                        if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
                        setNotifications(prev => prev.filter(x => x.id !== n.id));
                      }} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: t3, padding: 2, display: "flex", alignItems: "center", justifyContent: "center", opacity: .5, marginTop: 1 }}
                        onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = ".5"}>
                        <X size={13} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {careTeam.length > 0 && (
          <motion.div className="au" style={{ marginBottom: 16, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 20, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
            <h3 style={{ color: t1, fontSize: 13.5, fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}><Stethoscope size={14} color="var(--p)" /> My Care Team</h3>
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
          </motion.div>
        )}

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
    </div>
  );
}
