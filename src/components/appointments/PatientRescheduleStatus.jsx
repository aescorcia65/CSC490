import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { supabase } from "../../supabase";
import {
  normalizeRescheduleRequest,
  STAGE,
  formatSlotLine,
  patientRequestSummary,
  patientRescheduleStatusLabel,
} from "../../lib/appointmentReschedule";

/**
 * Patient UI when doctor proposed a different slot, or receptionist path.
 */
export default function PatientRescheduleStatus({ appt, t1, t2, t3, onApptUpdate, onOpenReschedule }) {
  const norm = normalizeRescheduleRequest(appt.reschedule_request);
  const [busy, setBusy] = useState(null);

  if (!norm) return null;

  if (norm.stage === STAGE.RECEPTIONIST) {
    return (
      <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(37,99,235,.06)", border: "1px solid rgba(37,99,235,.2)" }}>
        <p style={{ color: "var(--p)", fontSize: 11.5, fontWeight: 700, margin: "0 0 4px" }}>Reception follow-up</p>
        <p style={{ color: t3, fontSize: 11, margin: 0, lineHeight: 1.5 }}>Your clinic has been notified that you prefer to speak with reception about scheduling.</p>
      </div>
    );
  }

  if (norm.stage !== STAGE.AWAITING_PATIENT || !norm.doctorProposal?.date || !norm.doctorProposal?.time) {
    return (
      <p style={{ color: "var(--am)", fontSize: 11, margin: "6px 0 0", fontWeight: 600 }}>
        {patientRescheduleStatusLabel(norm)}
        {norm.stage === STAGE.AWAITING_DOCTOR && patientRequestSummary(norm) ? ` · ${patientRequestSummary(norm)}` : ""}
      </p>
    );
  }

  const prop = norm.doctorProposal;

  async function acceptProposal() {
    setBusy("accept");
    await supabase
      .from("appointments")
      .update({
        date: prop.date,
        time: prop.time,
        status: "scheduled",
        reschedule_request: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appt.id);
    onApptUpdate(appt.id, { date: prop.date, time: prop.time, status: "scheduled", reschedule_request: null });
    await supabase
      .from("notifications")
      .insert({
        user_id: appt.doctor_id,
        type: "general",
        title: "Reschedule confirmed",
        body: `The patient confirmed the new appointment time: ${formatSlotLine(prop.date, prop.time)}.`,
        related_id: appt.id,
      })
      .catch(() => {});
    setBusy(null);
  }

  async function declineProposal() {
    setBusy("decline");
    await supabase
      .from("appointments")
      .update({
        status: "scheduled",
        reschedule_request: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appt.id);
    onApptUpdate(appt.id, { status: "scheduled", reschedule_request: null });
    await supabase
      .from("notifications")
      .insert({
        user_id: appt.doctor_id,
        type: "general",
        title: "Patient declined suggested time",
        body: `They declined your alternative for ${appt.type}. They may send a new request.`,
        related_id: appt.id,
      })
      .catch(() => {});
    setBusy(null);
  }

  async function chooseReceptionist() {
    setBusy("rx");
    await supabase
      .from("appointments")
      .update({
        status: "scheduled",
        reschedule_request: { v: 2, stage: STAGE.RECEPTIONIST, patient: norm.patient, patientMessage: norm.patientMessage || "" },
        updated_at: new Date().toISOString(),
      })
      .eq("id", appt.id);
    onApptUpdate(appt.id, {
      status: "scheduled",
      reschedule_request: { v: 2, stage: STAGE.RECEPTIONIST, patient: norm.patient, patientMessage: norm.patientMessage || "" },
    });
    await supabase
      .from("notifications")
      .insert({
        user_id: appt.doctor_id,
        type: "general",
        title: "Patient prefers reception",
        body: `For "${appt.type}", the patient asked to speak with reception instead of confirming online.`,
        related_id: appt.id,
      })
      .catch(() => {});
    setBusy(null);
  }

  return (
    <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.25)" }}>
      <p style={{ color: "var(--am)", fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", margin: "0 0 6px" }}>Doctor suggested a different time</p>
      <p style={{ color: t1, fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>{formatSlotLine(prop.date, prop.time)}</p>
      {prop.message ? <p style={{ color: t2, fontSize: 12, margin: "0 0 10px", lineHeight: 1.5 }}>{prop.message}</p> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          disabled={busy}
          onClick={acceptProposal}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "none",
            background: "var(--gr)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 12.5,
            cursor: busy ? "default" : "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy === "accept" ? <Loader2 size={14} style={{ animation: "spin360 .7s linear infinite" }} /> : null}
          Accept this time
        </motion.button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          <button
            type="button"
            disabled={busy}
            onClick={declineProposal}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: `1px solid var(--b1)`,
              background: "var(--s2)",
              color: t2,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {busy === "decline" ? "…" : "Decline suggestion"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenReschedule?.(appt)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: `1px solid var(--b1)`,
              background: "var(--s2)",
              color: t2,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Another reschedule
          </button>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={chooseReceptionist}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(37,99,235,.25)",
            background: "rgba(37,99,235,.06)",
            color: "var(--p)",
            fontSize: 11,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {busy === "rx" ? "…" : "Speak with reception instead"}
        </button>
      </div>
    </div>
  );
}
