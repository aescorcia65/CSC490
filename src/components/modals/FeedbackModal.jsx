import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, CheckCircle2, Send } from "lucide-react";
import { supabase } from "../../supabase";
import ErrBanner from "../common/ErrBanner";

export default function FeedbackModal({ onClose, userEmail }) {
  const [type, setType] = useState("general");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!body.trim()) { setErr("Please write something before sending."); return; }
    setBusy(true); setErr("");
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      await supabase.from("feedback").insert({
        user_id: u?.id ?? null, user_email: userEmail || u?.email || "anonymous",
        type, body, rating,
      });
      setSent(true);
    } catch (e) { setSent(true); } finally { setBusy(false); }
  }

  const t1 = "var(--t1)", t3 = "var(--t3)";
  const types = [["general", "General"], ["bug", "Bug Report"], ["feature", "Feature Request"], ["praise", "Praise"]];

  if (sent) return (
    <motion.div className="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="mo" onClick={e => e.stopPropagation()}
        initial={{ y: 28, opacity: 0, scale: .96 }} animate={{ y: 0, opacity: 1, scale: 1 }} style={{ textAlign: "center", padding: 40 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(16,185,129,.1)", border: "1.5px solid rgba(16,185,129,.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <CheckCircle2 size={28} color="#10b981" />
        </div>
        <h2 style={{ color: t1, fontSize: 20, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, marginBottom: 8 }}>Thank you!</h2>
        <p style={{ color: t3, fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>Your feedback helps make MedTrack better for everyone.</p>
        <button className="btn" style={{ width: "100%" }} onClick={onClose}>Close</button>
      </motion.div>
    </motion.div>
  );

  return (
    <motion.div className="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="mo" onClick={e => e.stopPropagation()}
        initial={{ y: 28, opacity: 0, scale: .96 }} animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 28, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ color: t1, fontSize: 19, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600 }}>Send Feedback</h2>
            <p style={{ color: t3, fontSize: 12, marginTop: 3 }}>We read everything — your thoughts matter.</p>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--b1)", background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}>
            <X size={13} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {types.map(([v, l]) => (
            <button key={v} onClick={() => setType(v)}
              style={{ padding: "6px 14px", borderRadius: 9, border: "1.5px solid", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", transition: "all .15s", borderColor: type === v ? "var(--p)" : "var(--b1)", background: type === v ? "var(--pd)" : "transparent", color: type === v ? "var(--p)" : t3 }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="lbl">Rating</label>
          <div style={{ display: "flex", gap: 5 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRating(n)}
                style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer", color: n <= rating ? "var(--am)" : "var(--b2)", transition: "transform .1s, color .15s", transform: n <= rating ? "scale(1.1)" : "scale(1)" }}>
                ⭐
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="lbl">Your message</label>
          <textarea className="inp" rows={4} value={body} onChange={e => setBody(e.target.value)}
            placeholder="Tell us what you think, what's broken, or what you'd love to see…"
            style={{ resize: "vertical", lineHeight: 1.6, paddingTop: 12 }} />
        </div>
        <AnimatePresence>{err && <ErrBanner msg={err} />}</AnimatePresence>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="bto" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn" style={{ flex: 1 }} disabled={busy || !body.trim()} onClick={submit}>
            {busy ? <Loader2 size={14} style={{ animation: "spin360 .7s linear infinite" }} /> : <><Send size={13} /> Send Feedback</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
