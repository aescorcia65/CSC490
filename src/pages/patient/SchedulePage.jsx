import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Pill, Pencil, Trash2, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { COLS } from "../../lib/constants";
import { to12h } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { logMedicationTaken, unlogMedicationTaken, doseRowLogged, patchMedDoseToggle } from "../../lib/adherence";
import { groupMedicationsByDayPeriod } from "../../lib/medScheduleGroups";
import { supabase } from "../../supabase";
import { buildPatientRescheduleRequestPayload, hasActiveRescheduleRequest, normalizeRescheduleRequest } from "../../lib/rescheduleRequest";

export default function SchedulePage({ meds, setMeds, onEdit, onDelete, userId, scrollToSection }) {
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t3 = "var(--t3)", b1 = "var(--b1)";
  const periodBlocks = useMemo(() => groupMedicationsByDayPeriod(meds), [meds]);

  const [appointments, setAppointments] = useState([]);
  const [apptLoading, setApptLoading] = useState(false);
  const [rescheduleAppt, setRescheduleAppt] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", time: "" });
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleDone, setRescheduleDone] = useState(false);
  const [doctorNames, setDoctorNames] = useState({});
  const apptsRef = useRef(null);
  const medsRef = useRef(null);

  useEffect(() => {
    if (!scrollToSection) return;
    const t = requestAnimationFrame(() => {
      const el = scrollToSection === "meds" ? medsRef.current : scrollToSection === "appts" ? apptsRef.current : null;
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(t);
  }, [scrollToSection]);

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
          if (["scheduled", "rescheduled"].includes(payload.new.status)) {
            setAppointments(prev => prev.some(a => a.id === payload.new.id) ? prev : [...prev, payload.new].sort((a, b) => a.date.localeCompare(b.date)));
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
      }).subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  async function requestReschedule() {
    if (!rescheduleAppt || !rescheduleForm.date || !rescheduleForm.time || rescheduleBusy) return;
    setRescheduleBusy(true);
    const timeNorm = rescheduleForm.time.length === 5 ? `${rescheduleForm.time}:00` : rescheduleForm.time;
    const payload = buildPatientRescheduleRequestPayload({ date: rescheduleForm.date, time: timeNorm });
    await supabase.from("appointments").update({
      status: "scheduled",
      reschedule_request: payload,
      updated_at: new Date().toISOString(),
    }).eq("id", rescheduleAppt.id);
    setAppointments(prev => prev.map(a => a.id === rescheduleAppt.id ? { ...a, status: "scheduled", reschedule_request: payload } : a));
    setRescheduleBusy(false);
    setRescheduleDone(true);
    setTimeout(() => { setRescheduleAppt(null); setRescheduleDone(false); setRescheduleForm({ date: "", time: "" }); }, 2000);
  }

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
    if (!result.ok) {
      setMeds((ms) => ms.map((m) => (m.id === id ? patchMedDoseToggle(m, slotTime, wasLogged) : m)));
      if (typeof window !== "undefined") {
        window.alert(`Could not save this dose.\n\n${result.error || "Unknown error."}`);
      }
    }
  }, [meds, userId, setMeds]);

  const STATUS_CONFIG = {
    scheduled: { label: "Confirmed", color: "var(--gr)", bg: "rgba(5,150,105,.1)", border: "rgba(5,150,105,.25)", icon: CheckCircle2 },
    rescheduled: { label: "Reschedule Pending", color: "var(--am)", bg: "rgba(217,119,6,.1)", border: "rgba(217,119,6,.25)", icon: AlertCircle },
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "26px 22px 44px" }}>

        <motion.div ref={apptsRef} id="patient-schedule-appts" className="au" style={{ marginBottom: 10, scrollMarginTop: 24 }}>
          <h2 style={{ color: t1, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, letterSpacing: "-.3px", marginBottom: 4 }}>Appointments</h2>
          <p style={{ color: t3, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>Your upcoming appointments with your doctor.</p>
          {apptLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: t3, padding: "12px 0" }}>
              <Loader2 size={15} style={{ animation: "spin360 .7s linear infinite" }} />
              <span style={{ fontSize: 13 }}>Loading…</span>
            </div>
          ) : appointments.length === 0 ? (
            <div className="card" style={{ padding: "28px 20px", textAlign: "center" }}>
              <Calendar size={24} color={t3} style={{ margin: "0 auto 8px", opacity: .2, display: "block" }} />
              <p style={{ color: t3, fontSize: 13 }}>No upcoming appointments.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {appointments.map(appt => {
                const isPending = hasActiveRescheduleRequest(appt);
                const cfg = isPending ? STATUS_CONFIG.rescheduled : STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled;
                const StatusIcon = cfg.icon;
                const apptDate = new Date(appt.date + "T12:00:00");
                const isPast = apptDate < new Date();
                const n = normalizeRescheduleRequest(appt.reschedule_request);
                return (
                  <motion.div key={appt.id} className="card" style={{ padding: isMob ? "12px 14px" : "14px 18px", opacity: isPast ? 0.6 : 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 42, padding: "6px 6px", borderRadius: 10, background: isPast ? "var(--b0)" : "rgba(14,116,144,.08)", border: `1px solid ${isPast ? "var(--b0)" : "rgba(14,116,144,.15)"}` }}>
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
                        {isPending && n?.patient && (
                          <p style={{ color: "var(--am)", fontSize: 11, margin: "4px 0 0", fontWeight: 600 }}>
                            {n.phase === "doctor_counter" && n.doctor
                              ? `Doctor suggested: ${new Date(n.doctor.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${new Date("2000-01-01T" + n.doctor.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                              : `Requested: ${new Date(n.patient.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${new Date("2000-01-01T" + n.patient.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                          </p>
                        )}
                      </div>
                      {!isPast && !isPending && (
                        <button onClick={() => { setRescheduleAppt(appt); setRescheduleForm({ date: "", time: "" }); }} style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: `1px solid ${b1}`, background: "var(--s2)", color: t3, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                          <Pencil size={11} /> Reschedule
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--gr)", fontSize: 13, fontWeight: 600 }}>
                    <CheckCircle2 size={16} /> Request sent to your doctor.
                  </div>
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

        <motion.div ref={medsRef} id="patient-schedule-meds" className="au" style={{ marginBottom: 16, marginTop: 28, scrollMarginTop: 24 }}>
          <h2 style={{ color: t1, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, letterSpacing: "-.3px", marginBottom: 4 }}>Medications</h2>
          <p style={{ color: t3, fontSize: 13, lineHeight: 1.6, marginBottom: 4 }}>Your medications organised by time of day.</p>
        </motion.div>
        {periodBlocks.map((block, pi) => {
          const { rows, label, rangeLabel } = block;
          if (!rows.length) return null;
          const done = rows.filter((r) => doseRowLogged(r.med, r.slotTime)).length;
          return (
            <motion.div key={block.id} className="au" style={{ animationDelay: `${pi * .07}s`, marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
                <span style={{ color: t1, fontSize: 13, fontWeight: 600 }}>{label}</span>
                <span style={{ color: t3, fontSize: 12 }}>· {rangeLabel}</span>
                <span style={{ marginLeft: "auto", color: t3, fontSize: 11 }}>{done}/{rows.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {rows.map(({ med, slotTime }) => {
                  const col = COLS[med.color] || COLS.blue;
                  const rowKey = `${med.id}-${slotTime}`;
                  const logged = doseRowLogged(med, slotTime);
                  return (
                    <div key={rowKey} className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col.a, borderRadius: "18px 0 0 18px" }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: col.a, width: isMob ? 46 : 54, marginLeft: 6, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{to12h(slotTime)}</span>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: col.d, border: `1px solid ${col.b}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Pill size={14} color={col.a} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: t1, fontSize: 13, fontWeight: 600 }}>{med.name}</p>
                        <p style={{ color: t3, fontSize: 11, marginTop: 1 }}>{med.dosage} · {med.freq}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        <span className="hidden sm:flex items-center gap-1.5">
                          <button onClick={() => onEdit && onEdit(med)} title="Edit" style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--b1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--p)"; e.currentTarget.style.color = "var(--p)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.color = t3; }}><Pencil size={12} /></button>
                          <button onClick={() => onDelete && onDelete(med.id)} title="Delete" style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--b1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ro)"; e.currentTarget.style.color = "var(--ro)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.color = t3; }}><Trash2 size={12} /></button>
                        </span>
                        <button className="whitespace-nowrap" onClick={() => toggle(med.id, slotTime)} style={{ padding: "5px 14px", borderRadius: 99, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", transition: "all .18s", background: logged ? "rgba(16,185,129,.12)" : "var(--s2)", color: logged ? "var(--gr)" : "var(--t3)" }}>
                          {logged ? "Taken ✓" : "Mark taken"}
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
          <div className="card au" style={{ padding: 64, textAlign: "center" }}>
            <Pill size={28} color={t3} style={{ margin: "0 auto 10px", opacity: .18, display: "block" }} />
            <p style={{ color: t3, fontSize: 13 }}>No medications in your schedule yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}