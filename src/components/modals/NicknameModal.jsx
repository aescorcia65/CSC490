import { useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { supabase } from "../../supabase";

export default function NicknameModal({ currentName, onSave, onClose, userId }) {
  const [val, setVal] = useState(currentName || "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = val.trim();
    if (!n) return;
    setBusy(true);
    try {
      const parts = n.split(" ");
      const first = parts[0];
      const last  = parts.slice(1).join(" ") || null;
      if (userId) {
        await supabase.from("profiles").update({
          first_name: first,
          last_name: last,
          updated_at: new Date().toISOString(),
        }).eq("id", userId);
      }
      onSave(n);
      onClose();
    } catch (e) {
      console.error("Save name:", e);
      onSave(n);
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <motion.div className="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="mo" onClick={e => e.stopPropagation()}
        initial={{ y: 28, opacity: 0, scale: .96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 28, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }} style={{ maxWidth: 360 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ color: "var(--t1)", fontSize: 18, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600 }}>What should we call you?</h2>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--b1)", background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)" }}>
            <X size={13} />
          </button>
        </div>
        <label className="lbl">Your preferred name</label>
        <input className="inp" value={val} placeholder="e.g. Jamie, Dr. Patel, or Alex"
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && val.trim() && save()} autoFocus />
        <p style={{ color: "var(--t3)", fontSize: 11, marginTop: 6, marginBottom: 18 }}>Saved to your profile and synced across devices.</p>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="bto" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn" style={{ flex: 1 }} disabled={!val.trim() || busy} onClick={save}>
            {busy ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }} /> : "Save"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
