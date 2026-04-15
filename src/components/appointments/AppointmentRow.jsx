import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { supabase } from "../../supabase";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  normalizeRescheduleRequest,
  STAGE,
  buildPatientReschedulePayload,
  patientRescheduleStatusLabel,
  patientRequestSummary,
  needsPatientRescheduleAction,
} from "../../lib/appointmentReschedule";
import PatientRescheduleStatus from "./PatientRescheduleStatus";

export default function AppointmentRow({ appt, onCancel, onApptUpdate, onOpenReschedule }) {
  const apptDate = new Date(appt.date + "T" + appt.time);
  const [showReschedule, setShowReschedule] = useState(false);
  const [reqDate, setReqDate] = useState("");
  const [reqTime, setReqTime] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)";
  const norm = normalizeRescheduleRequest(appt.reschedule_request);
  const pendingPatient = needsPatientRescheduleAction(norm);

  async function cancel() {
    setBusy(true);
    await supabase.from("appointments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", appt.id);
    onCancel(appt.id);
    setBusy(false);
  }

  async function requestReschedule() {
    if (!reqDate || !reqTime) return;
    setBusy(true);
    const payload = buildPatientReschedulePayload({ date: reqDate, time: reqTime, message: reqNote });
    await supabase.from("appointments").update({
      reschedule_request: payload,
      status: "rescheduled",
      updated_at: new Date().toISOString(),
    }).eq("id", appt.id);
    if (appt.doctor_id) {
      await supabase.from("notifications").insert({
        user_id: appt.doctor_id,
        type: "general",
        title: "Reschedule requested",
        body: `A patient requested a new time for "${appt.type}". Open their chart to review.`,
        related_id: appt.id,
      }).catch(() => {});
    }
    onApptUpdate?.(appt.id, { reschedule_request: payload, status: "rescheduled" });
    setDone(true);
    setBusy(false);
    setShowReschedule(false);
  }

  const showRescheduleBadge = appt.status === "rescheduled" && norm && !pendingPatient;

  return (
    <div style={{ borderRadius: 14, background: "var(--s2)", border: "1px solid var(--b0)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMob ? 8 : 14, padding: isMob ? "10px 10px" : "12px 14px" }}>
        <div style={{ flexShrink: 0, textAlign: "center", minWidth: 40, padding: "8px 0", borderRadius: 11, background: "var(--pd)" }}>
          <p style={{ color: "var(--p)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", margin: 0 }}>{apptDate.toLocaleDateString("en-US", { month: "short" })}</p>
          <p style={{ color: "var(--p)", fontSize: 18, fontWeight: 800, fontFamily: "'Playfair Display',serif", lineHeight: 1, margin: 0 }}>{apptDate.getDate()}</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <p style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0 }}>{appt.type}</p>
            {showRescheduleBadge && (
              <span style={{ padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "rgba(217,119,6,.1)", border: "1px solid rgba(217,119,6,.2)", color: "var(--am)" }}>
                {patientRescheduleStatusLabel(norm)}
              </span>
            )}
            {pendingPatient && (
              <span style={{ padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "rgba(37,99,235,.1)", border: "1px solid rgba(37,99,235,.2)", color: "var(--p)" }}>
                Awaiting your response
              </span>
            )}
          </div>
          <p style={{ color: t3, fontSize: 12, marginTop: 2 }}>{apptDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{appt.notes ? ` · ${appt.notes}` : ""}</p>
          {norm?.stage === STAGE.AWAITING_DOCTOR && patientRequestSummary(norm) && (
            <p style={{ color: "var(--am)", fontSize: 11, marginTop: 4, fontWeight: 600 }}>You asked for: {patientRequestSummary(norm)}</p>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
          {appt.status !== "cancelled" && !pendingPatient && norm?.stage !== STAGE.RECEPTIONIST && (
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => setShowReschedule((s) => !s)}
              style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid var(--b1)", background: "transparent", color: t2, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Reschedule
            </motion.button>
          )}
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} disabled={busy} onClick={cancel}
            style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid rgba(185,28,28,.2)", background: "rgba(185,28,28,.06)", color: "var(--ro)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {busy ? "..." : "Cancel"}
          </motion.button>
        </div>
      </div>

      <PatientRescheduleStatus
        appt={appt}
        t1={t1}
        t2={t2}
        t3={t3}
        onApptUpdate={(id, partial) => onApptUpdate?.(id, partial)}
        onOpenReschedule={(a) => {
          setReqDate("");
          setReqTime("");
          setReqNote("");
          setDone(false);
          setShowReschedule(true);
          onOpenReschedule?.(a);
        }}
      />

      <AnimatePresence>
        {showReschedule && !done && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--b0)" }}>
              <p style={{ color: t3, fontSize: 11.5, marginBottom: 8, marginTop: 12 }}>Pick a preferred new date and time. Your doctor will confirm or suggest an alternative.</p>
              <div className="flex flex-col sm:flex-row gap-2" style={{ marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t3, marginBottom: 4 }}>Date</label>
                  <input className="inp" type="date" value={reqDate} min={new Date().toISOString().split("T")[0]} onChange={(e) => setReqDate(e.target.value)} style={{ width: "100%", borderRadius: 10, fontSize: 13 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t3, marginBottom: 4 }}>Time</label>
                  <input className="inp" type="time" value={reqTime} onChange={(e) => setReqTime(e.target.value)} style={{ width: "100%", borderRadius: 10, fontSize: 13 }} />
                </div>
              </div>
              <input className="inp" type="text" value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="Optional note to your doctor" style={{ width: "100%", borderRadius: 10, fontSize: 13, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn" disabled={busy || !reqDate || !reqTime} onClick={requestReschedule}
                  style={{ padding: "9px 16px", fontSize: 12.5, borderRadius: 10, flexShrink: 0 }}>
                  {busy ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }} /> : "Send request"}
                </motion.button>
                <button type="button" onClick={() => setShowReschedule(false)} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid var(--b1)", background: "transparent", color: t3, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        )}
        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "10px 14px", borderTop: "1px solid var(--b0)" }}>
            <p style={{ color: "var(--gr)", fontSize: 12, fontWeight: 600, margin: 0 }}>Reschedule request sent to your doctor.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
