import { motion } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";

export default function OkBanner({ msg, loginLight, onDismiss }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ display: "flex", gap: 9, padding: "12px 14px", borderRadius: 11,
        background: "rgba(16,185,129,.09)", border: "1px solid rgba(16,185,129,.24)", marginBottom: 12 }}>
      <CheckCircle2 size={14} color="#10b981" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ color: loginLight ? "#065f46" : "#10b981", fontSize: 13, lineHeight: 1.55, flex: 1 }}>{msg}</p>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#10b981", padding: 0, lineHeight: 0 }}>
          <X size={12} />
        </button>
      )}
    </motion.div>
  );
}
