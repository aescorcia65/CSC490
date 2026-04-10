import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Pill, Pencil, Trash2, Clock, CheckCircle2,
  AlertCircle, Loader2, XCircle, Check, AlertTriangle,
} from "lucide-react";
import { COLS } from "../../lib/constants";
import { useIsMobile } from "../../hooks/useIsMobile";
import { logDoseTaken, unlogDoseTaken, loadTodaysDoseLogs } from "../../lib/adherence";
import { getMedTimes, fmt12, doseStatus, timeToMins } from "../../lib/scheduleUtils";
import { supabase } from "../../supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function SchedulePage({ meds, setMeds, onEdit, onDelete, userId }) {
  const isMob = useIsMobile();
  const { doseLogs, setDoseLogs } = useAuth();
  const t1 = "var(--t1)", t3 = "var(--t3)", b1 = "var(--b1)";

  const [takenKeys, setTakenKeys] = useState(() => {
    const s = new Set();
    (doseLogs || []).forEach(r => s.add(`${r.medication_id}:${r.dose_index}`));
    return s;
  });
  const [toggling, setToggling] = useState(new Set());

  useEffect(() => {
    if (!userId) return;
    loadTodaysDoseLogs(userId).then(logs => {
      const s = new Set();
      logs.forEach(r => s.add(`${r.medication_id}:${r.dose_index}`));
      setTakenKeys(s);
      setDoseLogs(logs);
    });
  }, [userId]);

  const toggleDose = useCallback(async (medId, doseIndex) => {
    const key = `${medId}:${doseIndex}`;
    if (toggling.has(key)) return;
    const wasTaken = takenKeys.has(key);
    setTakenKeys(prev => { const n = new Set(prev); wasTaken ? n.delete(key) : n.add(key); return n; });
    setToggling(prev => new Set(prev).add(key));
    if (wasTaken) await unlogDoseTaken(userId, medId, doseIndex);
    else          await logDoseTaken(userId, medId, doseIndex);
    setToggling(prev => { const n = new Set(prev); n.delete(key); return n; });
  }, [takenKeys, toggling, userId]);

  const now = new Date();

  const doses = [];
  meds.forEach(med => {
    const times = getMedTimes(med);
    times.forEach((t, idx) => {
      const key = `${med.id}:${idx}`;
      doses.push({ med, time: t, doseIndex: idx, key, taken: takenKeys.has(key), totalDoses: times.length });
    });
  });
  doses.sort((a, b) => timeToMins(a.time) - timeToMins(b.time));

  const totalDoses   = doses.length;
  const takenCount   = doses.filter(d => d.taken).length;
  const missedCount  = doses.filter(d => !d.taken && doseStatus(d.time, false, now) === "missed").length;
  const pendingCount = totalDoses - takenCount - missedCount;

  const [appointments, setAppointments] = useState([]);
  const [apptLoading, setApptLoading]   = useState(false);
  const [rescheduleAppt, setRescheduleAppt] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", time: "" });
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleDone, setRescheduleDone] = useState(false);
  const [doctorNames, setDoctorNames] = useState({});
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setApptLoading(true);
    supabase.from("appointments")
      .select("id,date,time,type,notes,status,reschedule_request,doctor_id")
      .eq("patient_id", userId)
      .in("status", ["scheduled", "rescheduled"])
      .order("date", { ascending: true })
      .then(({ data }) => {
        const appts = data || [];
        setAppointments(appts);
        const docIds = [...new Set(appts.map(a => a.doctor_id).filter(Boolean))];
        if (docIds.length) {
          supabase.from("profiles").select("id,first_name,last_name").in("id", docIds)
            .then(({ data: docs }) => {
              const map = {};
              (docs || []).forEach(d => { map[d.id] = [d.first_name, d.last_name].filter(Boolean).join(" ") || "Doctor"; });
              setDoctorNames(map);
            });
        }
        setApptLoading(false);
      });

    const ch = supabase.channel(`patient-appts-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `patient_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          if (["scheduled", "rescheduled"].includes(payload.new.status))
            setAppointments(prev => prev.some(a => a.id === payload.new.id) ? prev : [...prev, payload.new].sort((a, b) => a.date.localeCompare(b.date)));
        } else if (payload.eventType === "UPDATE") {
          if (payload.new.status === "cancelled") setAppointments(prev => prev.filter(a => a.id !== payload.new.id));
          else setAppointments(prev => prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a));
        } else if (payload.eventType === "DELETE") {
          setAppointments(prev => prev.filter(a => a.id !== payload.old.id));
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  async function requestReschedule() {
    if (!rescheduleAppt || !rescheduleForm.date || !rescheduleForm.time || rescheduleBusy) return;
    setRescheduleBusy(true);
    await supabase.from("appointments").update({
      status: "rescheduled",
      reschedule_request: { date: rescheduleForm.date, time: rescheduleForm.time },
      updated_at: new Date().toISOString(),
    }).eq("id", rescheduleAppt.id);
    setAppointments(prev => prev.map(a => a.id === rescheduleAppt.id ? { ...a, status: "rescheduled", reschedule_request: rescheduleForm } : a));
    setRescheduleBusy(false);
    setRescheduleDone(true);
    setTimeout(() => { setRescheduleAppt(null); setRescheduleDone(false); setRescheduleForm({ date: "", time: "" }); }, 2000);
  }

  async function cancelAppointment(apptId) {
    setCancelBusy(true);
    await supabase.from("appointments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", apptId);
    setAppointments(prev => prev.filter(a => a.id !== apptId));
    setCancelConfirm(null);
    setCancelBusy(false);
  }

  const STATUS_CONFIG = {
    scheduled:   { label: "Confirmed",         color: "var(--gr)", bg: "rgba(5,150,105,.1)",  border: "rgba(5,150,105,.25)",  icon: CheckCircle2 },
    rescheduled: { label: "Reschedule Pending", color: "var(--am)", bg: "rgba(217,119,6,.1)",  border: "rgba(217,119,6,.25)",  icon: AlertCircle  },
  };

  function getDoseStyle(dose) {
    const st = doseStatus(dose.time, dose.taken, now);
    if (st === "taken")  return { color: "var(--gr)", bg: "rgba(5,150,105,.1)",  border: "rgba(5,150,105,.25)", label: "Taken"   };
    if (st === "missed") return { color: "var(--ro)", bg: "rgba(185,28,28,.08)", border: "rgba(185,28,28,.2)",  label: "Missed"  };
    return                      { color: t3,          bg: "var(--s2)",           border: b1,                    label: "Pending" };
  }

  return (
    <div style={{ flex: 1 }}>
      <div style={{ maxWidth: 660, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "26px 22px 44px" }}>

        {/* Daily Summary */}
        {meds.length > 0 && (
          <motion.div className="au" style={{ marginBottom: 24 }}>
            <h2 style={{ color: t1, fontSize: 22, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, letterSpacing: "-.3px", marginBottom: 14 }}>Today's Schedule</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9, marginBottom: 10 }}>
              {[
                { label: "Total doses",  value: totalDoses,   color: t1,          bg: "var(--s2)" },
                { label: "Taken",        value: takenCount,   color: "var(--gr)", bg: "rgba(5,150,105,.08)" },
                { label: missedCount > 0 ? "Missed" : "Remaining", value: missedCount > 0 ? missedCount : pendingCount, color: missedCount > 0 ? "var(--ro)" : "var(--am)", bg: missedCount > 0 ? "rgba(185,28,28,.07)" : "rgba(217,119,6,.07)" },
              ].map(s => (
                <div key={s.label} style={{ padding: isMob ? "10px 12px" : "12px 16px", borderRadius: 14, background: s.bg, border: `1px solid ${b1}`, textAlign: "center" }}>
                  <p style={{ color: s.color, fontSize: isMob ? 22 : 26, fontWeight: 800, margin: 0, fontVariantNumeric: "tabular-nums" }}>{s.value}</p>
                  <p style={{ color: t3, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", margin: "3px 0 0" }}>{s.label}</p>
                </div>
              ))}
            </div>
            {totalDoses > 0 && (
              <div style={{ height: 5, borderRadius: 99, background: "var(--b0)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, background: "var(--gr)", width: `${Math.round(takenCount / totalDoses * 100)}%`, transition: "width .4s" }} />
              </div>
            )}
          </motion.div>
        )}

        {/* Dose Schedule */}
        {meds.length > 0 && (
          <motion.div className="au" style={{ marginBottom: 28 }}>
            <h3 style={{ color: t1, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Dose Schedule</h3>
            {doses.length === 0 ? (
              <div className="card" style={{ padding: "28px 20px", textAlign: "center" }}>
                <Pill size={24} color={t3} style={{ margin: "0 auto 8px", opacity: .2, display: "block" }} />
                <p style={{ color: t3, fontSize: 13 }}>No doses scheduled for today.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {doses.map(dose => {
                  const col = COLS[dose.med.color] || COLS.blue;
                  const st  = getDoseStyle(dose);
                  const statusLabel = doseStatus(dose.time, dose.taken, now);
                  const isToggling  = toggling.has(dose.key);
                  return (
                    <div key={dose.key} className="card" style={{ padding: isMob ? "11px 14px" : "12px 16px", display: "flex", alignItems: "center", gap: 11, position: "relative", overflow: "hidden", opacity: statusLabel === "missed" && !dose.taken ? 0.75 : 1 }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col.a, borderRadius: "18px 0 0 18px" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: col.a, minWidth: isMob ? 54 : 62, marginLeft: 7, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmt12(dose.time)}</span>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: col.d, border: `1px solid ${col.b}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Pill size={14} color={col.a} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: t1, fontSize: 13, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dose.med.name}</p>
                        <p style={{ color: t3, fontSize: 11, margin: "2px 0 0" }}>
                          {dose.med.dosage}{dose.totalDoses > 1 ? ` · Dose ${dose.doseIndex + 1} of ${dose.totalDoses}` : ""}
                        </p>
                      </div>
                      <span style={{ padding: "3px 9px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: st.bg, border: `1px solid ${st.border}`, color: st.color, flexShrink: 0, display: isMob ? "none" : "block" }}>{st.label}</span>
                      <span className="hidden sm:flex items-center gap-1.5" style={{ flexShrink: 0 }}>
                        <button onClick={() => onEdit && onEdit(dose.med)} title="Edit" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${b1}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--p)"; e.currentTarget.style.color = "var(--p)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = b1; e.currentTarget.style.color = t3; }}><Pencil size={11} /></button>
                        <button onClick={() => onDelete && onDelete(dose.med.id)} title="Delete" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${b1}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ro)"; e.currentTarget.style.color = "var(--ro)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = b1; e.currentTarget.style.color = t3; }}><Trash2 size={11} /></button>
                      </span>
                      <button
                        onClick={() => toggleDose(dose.med.id, dose.doseIndex)}
                        disabled={isToggling}
                        style={{ padding: isMob ? "6px 12px" : "5px 14px", borderRadius: 99, fontSize: 11, fontWeight: 700, border: "none", cursor: isToggling ? "default" : "pointer", transition: "all .18s", flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: dose.taken ? "rgba(5,150,105,.12)" : "var(--s2)", color: dose.taken ? "var(--gr)" : t3 }}
                      >
                        {isToggling
                          ? <Loader2 size={12} style={{ animation: "spin360 .7s linear infinite" }} />
                          : dose.taken
                            ? <><Check size={11} /> Taken</>
                            : statusLabel === "missed"
                              ? <><AlertTriangle size={11} color="var(--ro)" /> Missed</>
                              : "Mark taken"
                        }
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {meds.length === 0 && (
          <div className="card au" style={{ padding: 64, textAlign: "center", marginBottom: 28 }}>
            <Pill size={28} color={t3} style={{ margin: "0 auto 10px", opacity: .18, display: "block" }} />
            <p style={{ color: t3, fontSize: 13 }}>No medications in your schedule yet.</p>
          </div>
        )}

        {/* Appointments */}
        <motion.div className="au" style={{ marginBottom: 10 }}>
          <h2 style={{ color: t1, fontSize: 22, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, letterSpacing: "-.3px", marginBottom: 4 }}>Appointments</h2>
          <p style={{ color: t3, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>Your upcoming appointments with your doctor.</p>
          {apptLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: t3, padding: "12px 0" }}>
              <Loader2 size={15} style={{ animation: "spin360 .7s linear infinite" }} /><span style={{ fontSize: 13 }}>Loading…</span>
            </div>
          ) : appointments.length === 0 ? (
            <div className="card" style={{ padding: "28px 20px", textAlign: "center" }}>
              <Calendar size={24} color={t3} style={{ margin: "0 auto 8px", opacity: .2, display: "block" }} />
              <p style={{ color: t3, fontSize: 13 }}>No upcoming appointments.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {appointments.map(appt => {
                const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled;
                const StatusIcon = cfg.icon;
                const apptDate = new Date(appt.date + "T12:00:00");
                const isPast = apptDate < new Date();
                const isPending = appt.status === "rescheduled";
                return (
                  <motion.div key={appt.id} className="card" style={{ padding: isMob ? "12px 14px" : "14px 18px", opacity: isPast ? 0.6 : 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 42, padding: "6px", borderRadius: 10, background: isPast ? "var(--b0)" : "rgba(14,116,144,.08)", border: `1px solid ${isPast ? "var(--b0)" : "rgba(14,116,144,.15)"}` }}>
                        <p style={{ color: isPast ? t3 : "var(--doc-p)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", margin: 0 }}>{apptDate.toLocaleDateString("en-US", { month: "short" })}</p>
                        <p style={{ color: isPast ? t3 : t1, fontSize: 20, fontWeight: 800, fontFamily: "'Playfair Display',serif", lineHeight: 1, margin: 0 }}>{apptDate.getDate()}</p>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
                          <p style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0 }}>{appt.type}</p>
                          <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, display: "flex", alignItems: "center", gap: 4 }}>
                            <StatusIcon size={9} /> {cfg.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: t3, fontSize: 12 }}>
                          <Clock size={11} />
                          <span>{new Date("2000-01-01T" + appt.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {doctorNames[appt.doctor_id] && <><span>·</span><span>Dr. {doctorNames[appt.doctor_id]}</span></>}
                        </div>
                        {appt.notes && <p style={{ color: t3, fontSize: 11, margin: "4px 0 0" }}>{appt.notes}</p>}
                        {isPending && appt.reschedule_request && (
                          <p style={{ color: "var(--am)", fontSize: 11, margin: "4px 0 0", fontWeight: 600 }}>
                            Requested: {new Date(appt.reschedule_request.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} at {new Date("2000-01-01T" + appt.reschedule_request.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                      {!isPast && !isPending && (
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button onClick={() => { setRescheduleAppt(appt); setRescheduleForm({ date: "", time: "" }); }} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${b1}`, background: "var(--s2)", color: t3, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                            <Pencil size={11} /> Reschedule
                          </button>
                          <button onClick={() => setCancelConfirm(appt.id)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(185,28,28,.25)", background: "rgba(185,28,28,.06)", color: "var(--ro)", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                            <XCircle size={11} /> Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Reschedule Modal */}
        <AnimatePresence>
          {rescheduleAppt && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRescheduleAppt(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
              <motion.div initial={{ y: 20, opacity: 0, scale: .97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }} onClick={e => e.stopPropagation()} style={{ background: "var(--bg)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360, border: `1px solid ${b1}`, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
                <h3 style={{ color: t1, fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Request Reschedule</h3>
                <p style={{ color: t3, fontSize: 12, marginBottom: 18, lineHeight: 1.5 }}>Your doctor will review and confirm the new time.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t3, marginBottom: 5 }}>New Date</label>
                    <input className="inp w-full" type="date" value={rescheduleForm.date} min={new Date().toISOString().split("T")[0]} onChange={e => setRescheduleForm(f => ({ ...f, date: e.target.value }))} style={{ borderRadius: 11, fontSize: 16 }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t3, marginBottom: 5 }}>Preferred Time</label>
                    <input className="inp w-full" type="time" value={rescheduleForm.time} onChange={e => setRescheduleForm(f => ({ ...f, time: e.target.value }))} style={{ borderRadius: 11, fontSize: 16 }} />
                  </div>
                </div>
                {rescheduleDone ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--gr)", fontSize: 13, fontWeight: 600 }}><CheckCircle2 size={16} /> Request sent to your doctor.</div>
                ) : (
                  <div style={{ display: "flex", gap: 9 }}>
                    <button onClick={() => setRescheduleAppt(null)} style={{ flex: 1, padding: "10px", borderRadius: 11, border: `1px solid ${b1}`, background: "transparent", color: t3, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>Cancel</button>
                    <button onClick={requestReschedule} disabled={rescheduleBusy || !rescheduleForm.date || !rescheduleForm.time} style={{ flex: 1, padding: "10px", borderRadius: 11, border: "none", background: "var(--p)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: (!rescheduleForm.date || !rescheduleForm.time) ? 0.5 : 1 }}>
                      {rescheduleBusy ? <Loader2 size={14} style={{ animation: "spin360 .7s linear infinite" }} /> : "Send Request"}
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cancel Modal */}
        <AnimatePresence>
          {cancelConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCancelConfirm(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
              <motion.div initial={{ y: 20, opacity: 0, scale: .97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }} onClick={e => e.stopPropagation()} style={{ background: "var(--bg)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 340, border: `1px solid ${b1}`, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(185,28,28,.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <XCircle size={22} color="var(--ro)" />
                </div>
                <h3 style={{ color: t1, fontSize: 16, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>Cancel Appointment?</h3>
                <p style={{ color: t3, fontSize: 13, marginBottom: 20, lineHeight: 1.5, textAlign: "center" }}>This will cancel your appointment. Your doctor will be notified.</p>
                <div style={{ display: "flex", gap: 9 }}>
                  <button onClick={() => setCancelConfirm(null)} style={{ flex: 1, padding: "10px", borderRadius: 11, border: `1px solid ${b1}`, background: "transparent", color: t3, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>Keep it</button>
                  <button onClick={() => cancelAppointment(cancelConfirm)} disabled={cancelBusy} style={{ flex: 1, padding: "10px", borderRadius: 11, border: "none", background: "var(--ro)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {cancelBusy ? <Loader2 size={14} style={{ animation: "spin360 .7s linear infinite" }} /> : "Cancel appointment"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}