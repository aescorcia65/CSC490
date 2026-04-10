import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { AlertCircle, HeartPulse, Loader2 } from "lucide-react";
import { supabase } from "../../../supabase";
import OkBanner from "../../../components/common/OkBanner";
import TagList from "./TagList";
import AddRow from "./AddRow";

export default function HealthProfile({ userId, t1, t2, t3 }) {
  const [dob, setDob] = useState(""); const [bloodType, setBloodType] = useState(""); const [weight, setWeight] = useState(""); const [height, setHeight] = useState("");
  const [allergies, setAllergies] = useState([]); const [conditions, setConditions] = useState([]);
  const [allergyInp, setAllergyInp] = useState(""); const [condInp, setCondInp] = useState("");
  const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false); const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        const { data: d } = await supabase.from("profiles").select("dob,blood_type,weight,height,allergies,medical_conditions").eq("id", userId).single();
        if (d) { setDob(d.dob || ""); setBloodType(d.blood_type || ""); setWeight(d.weight || ""); setHeight(d.height || ""); setAllergies(d.allergies || []); setConditions(d.medical_conditions || []); }
      } catch (e) {} finally { setLoading(false); }
    })();
  }, [userId]);

  function addAllergy() { const v = allergyInp.trim(); if (!v || allergies.includes(v)) return; setAllergies(a => [...a, v]); setAllergyInp(""); }
  function removeAllergy(item) { setAllergies(a => a.filter(x => x !== item)); }
  function addCondition() { const v = condInp.trim(); if (!v || conditions.includes(v)) return; setConditions(c => [...c, v]); setCondInp(""); }
  function removeCondition(item) { setConditions(c => c.filter(x => x !== item)); }

  async function saveProfile() {
    if (!userId) return; setBusy(true); setSaved(false);
    try { await supabase.from("profiles").update({ dob, blood_type: bloodType, weight, height, allergies, medical_conditions: conditions, updated_at: new Date().toISOString() }).eq("id", userId); setSaved(true); setTimeout(() => setSaved(false), 2800); }
    catch (e) {} finally { setBusy(false); }
  }

  if (loading) return <div style={{ padding: "24px 18px", display: "flex", alignItems: "center", gap: 10, color: t3 }}><Loader2 size={16} style={{ animation: "spin360 .7s linear infinite" }} /> Loading profile...</div>;

  return (
    <div style={{ padding: "16px 18px 22px", borderTop: "1px solid var(--b0)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
        {[["Date of birth", dob, setDob, "e.g. 1985-04-22", "date"], ["Blood type", bloodType, setBloodType, "e.g. O+", "text"], ["Weight", weight, setWeight, "e.g. 72 kg", "text"], ["Height", height, setHeight, "e.g. 175 cm", "text"]].map(([label, val, setter, ph, type]) => (
          <div key={label}>
            <label className="lbl">{label}</label>
            <input className="inp" type={type} value={val} placeholder={ph} onChange={e => setter(e.target.value)} />
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.22)", display: "flex", alignItems: "center", justifyContent: "center" }}><AlertCircle size={11} color="var(--ro)" /></div>
          <label className="lbl" style={{ marginBottom: 0 }}>Known Allergies</label>
        </div>
        <TagList items={allergies} onRemove={removeAllergy} type="allergy" t3={t3} />
        <AddRow value={allergyInp} onChange={setAllergyInp} onAdd={addAllergy} placeholder="e.g. Penicillin, Peanuts, Latex" btnColor="var(--ro)" t3={t3} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.22)", display: "flex", alignItems: "center", justifyContent: "center" }}><HeartPulse size={11} color="var(--am)" /></div>
          <label className="lbl" style={{ marginBottom: 0 }}>Medical Conditions</label>
        </div>
        <TagList items={conditions} onRemove={removeCondition} type="condition" t3={t3} />
        <AddRow value={condInp} onChange={setCondInp} onAdd={addCondition} placeholder="e.g. Asthma, Type 2 Diabetes, Hypertension" btnColor="var(--am)" t3={t3} />
      </div>
      <AnimatePresence>{saved && <div style={{ marginBottom: 12 }}><OkBanner msg="Health profile saved successfully." /></div>}</AnimatePresence>
      <button className="btn" style={{ width: "100%", padding: "11px" }} disabled={busy} onClick={saveProfile}>
        {busy ? <><Loader2 size={14} style={{ animation: "spin360 .7s linear infinite", marginRight: 7 }} />Saving...</> : "Save Health Profile"}
      </button>
    </div>
  );
}
