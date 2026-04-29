import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { normalizeRescheduleRequest } from "../../lib/rescheduleRequest";

export default function RescheduleRequestRow({ appt, onApproveRequested, onDeny, onSuggest, t1, t3 }) {
  const isMob = useIsMobile();
  const n = normalizeRescheduleRequest(appt.reschedule_request);
  const isCounter = n?.phase === "doctor_counter" && n?.doctor;
  const [suggestDate, setSuggestDate] = useState(() => n?.patient?.date || "");
  const [suggestTime, setSuggestTime] = useState(() => (n?.patient?.time ? n.patient.time.slice(0, 5) : ""));
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectMsg, setRejectMsg] = useState("We can't accommodate that time. Your original appointment stays as scheduled.");
  const [rejectBusy, setRejectBusy] = useState(false);

  const patientLabel = n
    ? [n.patient?.date && new Date(n.patient.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }), n.patient?.time && new Date("2000-01-01T" + n.patient.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" at ")
    : "—";

  const docCounterLabel = isCounter
    ? [new Date(n.doctor.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), n.doctor?.time && new Date("2000-01-01T" + n.doctor.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })]
        .filter(Boolean)
        .join(" at ")
    : "";

  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, background: "var(--s1)", border: "1px solid var(--b1)", marginBottom: 8 }}>
      <p style={{ color: t1, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{appt.type}</p>
      <p style={{ color: "var(--t2)", fontSize: 12, marginBottom: 4 }}>
        Current (unchanged):{" "}
        <strong>
          {appt?.date
            ? new Date(appt.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + " at " + (appt.time ? new Date("2000-01-01T" + appt.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—")
            : "—"}
        </strong>
      </p>
      {n?.message && (
        <p style={{ color: t3, fontSize: 12, marginBottom: 8, fontStyle: "italic" }}>
          Patient note: {n.message}
        </p>
      )}
      {isCounter ? (
        <>
          <p style={{ color: t3, fontSize: 12, marginBottom: 6 }}>
            Patient requested: <strong style={{ color: "var(--t1)" }}>{patientLabel}</strong>
          </p>
          <p style={{ color: "var(--am)", fontSize: 12, marginBottom: 10 }}>
            You suggested: <strong>{docCounterLabel}</strong>
          </p>
        </>
      ) : (
        <p style={{ color: "var(--am)", fontSize: 12, marginBottom: 10 }}>
          Patient requested: <strong>{patientLabel}</strong>
        </p>
      )}
      {!showReject ? (
        <>
          {isCounter ? (
            <p style={{ color: t3, fontSize: 11.5, marginBottom: 10 }}>Waiting for the patient to accept or decline this time.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: t3, marginBottom: 4 }}>Suggest a different date</label>
                <input className="inp" type="date" value={suggestDate} onChange={e => setSuggestDate(e.target.value)} style={{ borderRadius: 10, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: t3, marginBottom: 4 }}>Suggest a different time</label>
                <input className="inp" type="time" value={suggestTime} onChange={e => setSuggestTime(e.target.value)} style={{ borderRadius: 10, fontSize: 13 }} />
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!isCounter && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="btn-doc"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onApproveRequested();
                  setBusy(false);
                }}
                style={{ padding: "8px 16px", fontSize: 12.5, borderRadius: 10, display: "flex", alignItems: "center", gap: 6 }}
              >
                {busy ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }} /> : "Approve requested time"}
              </motion.button>
            )}
            {!isCounter && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="btn-doc"
                disabled={busy || !suggestDate || !suggestTime}
                onClick={async () => {
                  setBusy(true);
                  const t = suggestTime.length === 5 ? `${suggestTime}:00` : suggestTime;
                  await onSuggest(suggestDate, t);
                  setBusy(false);
                }}
                style={{ padding: "8px 16px", fontSize: 12.5, borderRadius: 10, display: "flex", alignItems: "center", gap: 6, background: "var(--s2)", border: "1px solid var(--b1)", color: "var(--t1)" }}
              >
                Suggest a different time
              </motion.button>
            )}
            <button
              onClick={() => setShowReject(true)}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid rgba(239,68,68,.35)",
                background: "rgba(239,68,68,.07)",
                color: "var(--ro)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12.5,
              }}
            >
              {isCounter ? "Cancel suggestion" : "Deny request"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: t3, marginBottom: 4 }}>Message to patient</label>
            <input
              className="inp"
              type="text"
              value={rejectMsg}
              onChange={e => setRejectMsg(e.target.value)}
              style={{ borderRadius: 10, fontSize: 13, width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              disabled={rejectBusy || !rejectMsg.trim()}
              onClick={async () => {
                setRejectBusy(true);
                await onDeny(rejectMsg.trim());
                setRejectBusy(false);
              }}
              style={{
                padding: "8px 16px",
                fontSize: 12.5,
                borderRadius: 10,
                border: "none",
                background: "rgba(239,68,68,.15)",
                color: "var(--ro)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {rejectBusy ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }} /> : isCounter ? "Withdraw suggestion" : "Send & keep original time"}
            </motion.button>
            <button
              onClick={() => setShowReject(false)}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--b1)", background: "transparent", color: t3, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}
            >
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
