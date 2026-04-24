import { motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";

export default function ErrBanner({ msg, onDismiss }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ display: "flex", gap: 9, padding: "12px 14px", borderRadius: 11,
        background: "var(--auth-err-bg)", border: "1px solid var(--auth-err-border)", marginBottom: 12 }}>
      <AlertCircle size={14} color="var(--auth-err-icon)" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ color: "var(--auth-err-text)", fontSize: 13, lineHeight: 1.55, flex: 1 }}>{msg}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--auth-err-icon)", padding: 0, lineHeight: 0 }}>
          <X size={12} />
        </button>
      )}
    </motion.div>
  );
}
