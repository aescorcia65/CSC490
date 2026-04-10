import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { supabase } from "../../../supabase";
import OkBanner from "../../../components/common/OkBanner";

export default function EmergencyContact({ userId, t1, t2, t3 }) {
  const [f, setF] = useState({ name: "", relationship: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        const { data } = await supabase.from("profiles").select("emergency_contact").eq("id", userId).single();
        if (data?.emergency_contact) setF({ name: "", relationship: "", phone: "", email: "", ...data.emergency_contact });
      } catch (e) {} finally { setLoading(false); }
    })();
  }, [userId]);

  async function save() {
    if (!userId) return;
    setBusy(true); setSaved(false);
    try {
      await supabase.from("profiles").update({ emergency_contact: { name: f.name, relationship: f.relationship, phone: f.phone, email: f.email }, updated_at: new Date().toISOString() }).eq("id", userId);
      setSaved(true); setTimeout(() => setSaved(false), 2800);
    } catch (e) {} finally { setBusy(false); }
  }

  if (loading) return <div style={{ padding: "24px 18px", display: "flex", alignItems: "center", gap: 10, color: t3 }}><Loader2 size={16} style={{ animation: "spin360 .7s linear infinite" }} /> Loading...</div>;

  return (
    <div style={{ padding: "16px 18px 22px", borderTop: "1px solid var(--b0)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {[["Contact name", "name", "e.g. Sarah Johnson", "text"], ["Relationship", "relationship", "e.g. Spouse, Parent, GP", "text"], ["Phone number", "phone", "e.g. +1 555 000 0000", "tel"], ["Email (optional)", "email", "caregiver@email.com", "email"]].map(([label, key, ph, type]) => (
          <div key={key}>
            <label className="lbl">{label}</label>
            <input className="inp" type={type} value={f[key]} placeholder={ph} onChange={e => setF(p => ({ ...p, [key]: e.target.value }))} />
          </div>
        ))}
      </div>
      <AnimatePresence>{saved && <div style={{ marginBottom: 12 }}><OkBanner msg="Emergency contact saved." /></div>}</AnimatePresence>
      <button className="btn" style={{ width: "100%", padding: "11px" }} disabled={busy} onClick={save}>
        {busy ? <><Loader2 size={14} style={{ animation: "spin360 .7s linear infinite", marginRight: 7 }} />Saving...</> : "Save Emergency Contact"}
      </button>
    </div>
  );
}
