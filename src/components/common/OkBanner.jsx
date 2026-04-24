import { motion } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";

export default function OkBanner({ msg, onDismiss }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ display: "flex", gap: 9, padding: "12px 14px", borderRadius: 11,
        background: "var(--auth-ok-bg)", border: "1px solid var(--auth-ok-border)", marginBottom: 12 }}>
      <CheckCircle2 size={14} color="var(--auth-ok-icon)" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ color: "var(--auth-ok-text)", fontSize: 13, lineHeight: 1.55, flex: 1 }}>{msg}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--auth-ok-icon)", padding: 0, lineHeight: 0 }}>
          <X size={12} />
        </button>
      )}
    </motion.div>
  );
}
