import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { supabase } from "../../supabase";
import { hasActiveRescheduleRequest } from "../../lib/rescheduleRequest";
import { useIsMobile } from "../../hooks/useIsMobile";

export default function AppointmentRow({ appt, onCancel, onRescheduled }) {
  const apptDate = new Date(appt.date + "T" + appt.time);
  const [showReschedule, setShowReschedule] = useState(false);
  const [reqText, setReqText] = useState(appt.reschedule_request || "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)";

  async function cancel() {
    setBusy(true);
    await supabase.from("appointments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", appt.id);
    onCancel(appt.id); setBusy(false);
  }

  async function requestReschedule() {
    if (!reqText.trim()) return;
    setBusy(true);
    const t = appt.time && String(appt.time).length === 5 ? `${appt.time}:00` : (appt.time || "12:00:00");
    await supabase
      .from("appointments")
      .update({
        reschedule_request: { v: 2, phase: "patient_proposed", patient: { date: appt.date, time: t }, message: reqText.trim() },
        status: "scheduled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", appt.id);
    setDone(true);
    setBusy(false);
    onRescheduled(appt.id, reqText.trim());
  }

  return (
    <div style={{ borderRadius: 14, background: "var(--s2)", border: "1px solid var(--b0)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMob ? 8 : 14, padding: isMob ? "10px 10px" : "12px 14px" }}>
        <div style={{ flexShrink: 0, textAlign: "center", minWidth: 40, padding: "8px 0", borderRadius: 11, background: "var(--pd)" }}>
          <p style={{ color: "var(--p)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", margin: 0 }}>{apptDate.toLocaleDateString("en-US", { month: "short" })}</p>
          <p style={{ color: "var(--p)", fontSize: 18, fontWeight: 800, fontFamily: "'Playfair Display',serif", lineHeight: 1, margin: 0 }}>{apptDate.getDate()}</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <p style={{ color: t1, fontSize: 13.5, fontWeight: 700, margin: 0 }}>{appt.type}</p>
            {hasActiveRescheduleRequest(appt) && (
              <span style={{ padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "rgba(217,119,6,.1)", border: "1px solid rgba(217,119,6,.2)", color: "var(--am)" }}>
                Reschedule requested
              </span>
            )}
          </div>
          <p style={{ color: t3, fontSize: 12, marginTop: 2 }}>{apptDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{appt.notes ? ` · ${appt.notes}` : ""}</p>
        </div>
        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
          {!hasActiveRescheduleRequest(appt) && (
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }} onClick={() => setShowReschedule(s => !s)}
              style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid var(--b1)", background: "transparent", color: t2, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Reschedule
            </motion.button>
          )}
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }} disabled={busy} onClick={cancel}
            style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid rgba(185,28,28,.2)", background: "rgba(185,28,28,.06)", color: "var(--ro)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {busy ? "..." : "Cancel"}
          </motion.button>
        </div>
      </div>
      <AnimatePresence>
        {showReschedule && !done && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--b0)" }}>
              <p style={{ color: t3, fontSize: 11.5, marginBottom: 8, marginTop: 12 }}>Suggest a new date and time — your doctor will confirm:</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input className="inp" value={reqText} onChange={e => setReqText(e.target.value)}
                  placeholder="e.g. March 25 at 2pm, or any Tuesday morning"
                  style={{ flex: 1, borderRadius: 10, fontSize: 13 }} />
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }} className="btn" disabled={busy || !reqText.trim()} onClick={requestReschedule}
                  style={{ padding: "9px 16px", fontSize: 12.5, borderRadius: 10, flexShrink: 0 }}>
                  {busy ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }} /> : "Send"}
                </motion.button>
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
