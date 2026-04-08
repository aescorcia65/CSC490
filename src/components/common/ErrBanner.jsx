import { motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";

export default function ErrBanner({ msg, loginLight, onDismiss }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ display: "flex", gap: 9, padding: "12px 14px", borderRadius: 11,
        background: "rgba(239,68,68,.09)", border: "1px solid rgba(239,68,68,.22)", marginBottom: 12 }}>
      <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ color: loginLight ? "#b91c1c" : "#ef4444", fontSize: 13, lineHeight: 1.55, flex: 1 }}>{msg}</p>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 0, lineHeight: 0 }}>
          <X size={12} />
        </button>
      )}
    </motion.div>
  );
}
