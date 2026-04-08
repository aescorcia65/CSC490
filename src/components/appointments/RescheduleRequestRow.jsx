import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "../../hooks/useIsMobile";

export default function RescheduleRequestRow({ appt, onConfirm, onCancel, onReject, t1, t3 }) {
  const isMob = useIsMobile();
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectMsg, setRejectMsg] = useState("Not available at that time, please call the office.");
  const [rejectBusy, setRejectBusy] = useState(false);

  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, background: "var(--s1)", border: "1px solid var(--b1)", marginBottom: 8 }}>
      <p style={{ color: t1, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{appt.type}</p>
      <p style={{ color: "var(--am)", fontSize: 12, marginBottom: 10 }}>
        Patient requested: <strong>{appt.reschedule_request}</strong>
      </p>
      {!showReject ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: t3, marginBottom: 4 }}>Approve — new date</label>
              <input className="inp" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ borderRadius: 10, fontSize: 13 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: t3, marginBottom: 4 }}>Approve — new time</label>
              <input className="inp" type="time" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ borderRadius: 10, fontSize: 13 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .97 }} className="btn-doc" disabled={busy || !newDate || !newTime}
              onClick={async () => { setBusy(true); await onConfirm(newDate, newTime); setBusy(false); }}
              style={{ padding: "8px 16px", fontSize: 12.5, borderRadius: 10, display: "flex", alignItems: "center", gap: 6 }}>
              {busy ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }} /> : "Approve new time"}
            </motion.button>
            <button onClick={() => setShowReject(true)}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.07)", color: "var(--ro)", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>
              Deny request
            </button>
            <button onClick={onCancel}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--b1)", background: "transparent", color: t3, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>
              Cancel appointment
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: t3, marginBottom: 4 }}>Message to patient</label>
            <input className="inp" type="text" value={rejectMsg} onChange={e => setRejectMsg(e.target.value)}
              style={{ borderRadius: 10, fontSize: 13, width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .97 }} disabled={rejectBusy || !rejectMsg.trim()}
              onClick={async () => { setRejectBusy(true); await onReject(rejectMsg.trim()); setRejectBusy(false); }}
              style={{ padding: "8px 16px", fontSize: 12.5, borderRadius: 10, border: "none", background: "rgba(239,68,68,.15)", color: "var(--ro)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              {rejectBusy ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }} /> : "Send & keep original time"}
            </motion.button>
            <button onClick={() => setShowReject(false)}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--b1)", background: "transparent", color: t3, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
