import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Download, X, HeartPulse, Siren } from "lucide-react";
import { supabase } from "../../supabase";
import { useIsMobile } from "../../hooks/useIsMobile";
import HealthProfile from "./settings/HealthProfile";
import EmergencyContact from "./settings/EmergencyContact";
import { downloadTextAsPdf } from "../../lib/pdfExport";

export default function HealthRecordsPage({ userId }) {
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)";
  const [rx, setRx] = useState([]);
  const [docModal, setDocModal] = useState(null);

  useEffect(() => {
    if (!userId) return;
    supabase.from("prescriptions").select("id,status,created_at,notes").eq("patient_id", userId).order("created_at", { ascending: false }).limit(15)
      .then(({ data }) => setRx(data || []));
  }, [userId]);

  function downloadPrescriptionPdf(p) {
    const body = [
      "Prescription summary",
      "",
      `Recorded: ${new Date(p.created_at).toLocaleString()}`,
      `Status: ${p.status}`,
      "",
      "Clinical notes are not included in this file. View the full record in Prescriptions in the portal.",
    ].join("\n");
    downloadTextAsPdf({
      title: "MedTrack — Prescription",
      body,
      filename: `prescription-${p.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}`,
    });
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "26px 22px 44px" }}>
        <motion.div className="au" style={{ marginBottom: 22 }}>
          <h2 style={{ color: t1, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, margin: "0 0 6px" }}>Health Records</h2>
          <p style={{ color: t3, fontSize: 13, lineHeight: 1.6, margin: 0 }}>Medical history, allergies, conditions, and documents.</p>
        </motion.div>

        <motion.section className="au card" style={{ padding: 0, marginBottom: 14, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--b0)", display: "flex", alignItems: "center", gap: 10 }}>
            <HeartPulse size={20} color="var(--ro)" />
            <p style={{ color: t1, fontSize: 14, fontWeight: 700, margin: 0 }}>Medical history & vitals</p>
          </div>
          <HealthProfile userId={userId} t1={t1} t2={t2} t3={t3} />
        </motion.section>

        <motion.section className="au card" style={{ padding: 0, marginBottom: 14, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--b0)", display: "flex", alignItems: "center", gap: 10 }}>
            <Siren size={18} color="var(--am)" />
            <p style={{ color: t1, fontSize: 14, fontWeight: 700, margin: 0 }}>Emergency contact</p>
          </div>
          <EmergencyContact userId={userId} t1={t1} t2={t2} t3={t3} />
        </motion.section>

        <motion.section className="au card" style={{ padding: 18 }}>
          <h3 style={{ color: t1, fontSize: 15, fontWeight: 700, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={18} color="var(--p)" /> Documents
          </h3>
          {rx.length === 0 ? (
            <p style={{ color: t3, fontSize: 13 }}>No prescription documents yet. They will appear when your care team adds prescriptions.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {rx.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setDocModal(p)} className="card" style={{ width: "100%", padding: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", border: "1px solid var(--b0)", background: "var(--s2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <p style={{ color: t1, fontSize: 13, fontWeight: 600, margin: 0 }}>Prescription · {new Date(p.created_at).toLocaleDateString()}</p>
                      <p style={{ color: t3, fontSize: 11, margin: "4px 0 0" }}>Status: {p.status}</p>
                    </div>
                    <span style={{ color: "var(--p)", fontSize: 12, fontWeight: 600 }}>View</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>

      <AnimatePresence>
        {docModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDocModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", borderRadius: 18, padding: 22, maxWidth: 440, width: "100%", border: "1px solid var(--b1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <h3 style={{ color: t1, fontSize: 16, fontWeight: 700, margin: 0 }}>Prescription record</h3>
                <button type="button" onClick={() => setDocModal(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: t3 }}><X size={18} /></button>
              </div>
              <p style={{ color: t3, fontSize: 12, margin: "0 0 8px" }}>Created {new Date(docModal.created_at).toLocaleString()}</p>
              <p style={{ color: t1, fontSize: 13, lineHeight: 1.6, margin: 0 }}>{docModal.notes || "No clinical notes attached to this prescription."}</p>
              <button type="button" onClick={() => downloadPrescriptionPdf(docModal)} style={{ marginTop: 16, width: "100%", padding: "10px 14px", borderRadius: 11, border: "none", background: "var(--p)", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Download size={16} /> Download PDF
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
