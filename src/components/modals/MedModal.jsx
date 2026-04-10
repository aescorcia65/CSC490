import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { supabase } from "../../supabase";
import { COLS } from "../../lib/constants";
import { findMedication, parseStoredDosage } from "../../lib/medicationDatabase";
import { MedAutocomplete, DosageSelector, FrequencySelect } from "../common/MedicationInputs";
import TimePicker from "../common/TimePicker";
import ErrBanner from "../common/ErrBanner";
import { freqToTimes } from "../../lib/scheduleUtils";

function buildForm(existing) {
  if (!existing) {
    return {
      name: "",
      dosage_amount: "",
      dosage_unit: "mg",
      commonDosages: [],
      freq: "Once daily",
      time: "08:00",
      color: "blue",
    };
  }
  const parsed = parseStoredDosage(existing.dosage);
  const med = findMedication(existing.name);
  return {
    name: existing.name || "",
    dosage_amount: parsed.amount,
    dosage_unit: parsed.unit,
    commonDosages: med?.commonDosages || [],
    freq: existing.freq || "Once daily",
    time: existing.time || "08:00",
    color: existing.color || "blue",
  };
}

export default function MedModal({ onClose, onSave, existing, userId }) {
  const [f, setF] = useState(() => buildForm(existing));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isEdit = !!existing;
  const t1 = "var(--t1)", t3 = "var(--t3)";

  useEffect(() => {
    setF(buildForm(existing));
  }, [existing]);

  const setName = useCallback((v) => {
    setF((p) => {
      const med = findMedication(v);
      return {
        ...p,
        name: v,
        commonDosages: med?.commonDosages || [],
      };
    });
  }, []);
  const handleMedSelect = useCallback((med) => {
    setF(p => ({
      ...p,
      name: med.name,
      dosage_amount: med.defaultDosage,
      dosage_unit: med.defaultUnit,
      commonDosages: med.commonDosages || [],
    }));
  }, []);

  function dosageDisplayString() {
    const amt = (f.dosage_amount || "").trim();
    if (!amt) return "";
    return `${amt} ${f.dosage_unit}`.trim();
  }

  async function handleSave() {
    const dosageStr = dosageDisplayString();
    if (!f.name?.trim() || !dosageStr || !f.freq?.trim()) return;
    setBusy(true); setErr("");
    const med = {
      name: f.name.trim(),
      dosage: dosageStr,
      freq: f.freq,
      time: f.time,
      times: freqToTimes(f.freq, f.time),
      color: f.color,
      id: existing?.id || Date.now().toString(),
      taken: existing?.taken ?? false,
    };
    const timesArr = freqToTimes(f.freq, f.time);
    try {
      if (isEdit && existing?.id) {
        await supabase.from("user_medications").update({
          medication_name: med.name, dosage: med.dosage, freq: med.freq,
          reminder_time: med.time, times: timesArr, color: med.color,
        }).eq("id", existing.id);
      } else if (!isEdit && userId) {
        const { data, error } = await supabase.from("user_medications").insert({
          user_id: userId, medication_name: med.name, dosage: med.dosage,
          freq: med.freq, reminder_time: med.time, times: timesArr, color: med.color, active: true,
        }).select("id").single();
        if (error) throw error;
        if (data?.id) { med.firestoreId = data.id; med.id = data.id; }
      }
      onSave(med); onClose();
    } catch (e) {
      setErr("Couldn't save to the database. Changes have been kept locally.");
      onSave(med); onClose();
    } finally { setBusy(false); }
  }

  const canSave = !!(f.name?.trim() && dosageDisplayString() && f.freq?.trim());

  return (
    <motion.div className="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="mo" onClick={e => e.stopPropagation()}
        initial={{ y: 28, opacity: 0, scale: .96 }} animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 28, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <h2 style={{ color: t1, fontSize: 19, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600 }}>
              {isEdit ? "Edit Medication" : "Add Medication"}
            </h2>
            <p style={{ color: t3, fontSize: 12, marginTop: 3 }}>
              {isEdit ? "Update this medication's details." : "Search a drug, choose dosage and unit, then set schedule."}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--b1)", background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}>
            <X size={13} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="lbl">Medication name</label>
            <MedAutocomplete
              value={f.name}
              onChange={setName}
              onSelect={handleMedSelect}
            />
          </div>
          <div>
            <label className="lbl">Dosage</label>
            <DosageSelector
              dosageAmount={f.dosage_amount}
              dosageUnit={f.dosage_unit}
              commonDosages={f.commonDosages}
              onAmountChange={(v) => setF(p => ({ ...p, dosage_amount: v }))}
              onUnitChange={(v) => setF(p => ({ ...p, dosage_unit: v }))}
            />
          </div>
          <div>
            <label className="lbl">Frequency</label>
            <FrequencySelect
              value={f.freq}
              onChange={(v) => setF(p => ({ ...p, freq: v }))}
            />
          </div>
          <TimePicker value={f.time} onChange={t => setF(p => ({ ...p, time: t }))} />
          <div>
            <label className="lbl">Colour Label</label>
            <div style={{ display: "flex", gap: 9 }}>
              {Object.entries(COLS).map(([k, v]) => (
                <button key={k} type="button" onClick={() => setF(p => ({ ...p, color: k }))}
                  style={{
                    width: 30, height: 30, borderRadius: 9, background: v.a, border: "none", cursor: "pointer", transition: "all .15s",
                    outline: f.color === k ? "2.5px solid #fff" : "none", outlineOffset: 2,
                    transform: f.color === k ? "scale(1.24)" : "scale(1)",
                    boxShadow: f.color === k ? `0 0 16px ${v.a}88` : "none"
                  }} />
              ))}
            </div>
          </div>
        </div>
        <AnimatePresence>
          {err && <div style={{ marginTop: 14 }}><ErrBanner msg={err} /></div>}
        </AnimatePresence>
        <div style={{ display: "flex", gap: 9, marginTop: 22 }}>
          <button type="button" className="bto" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button type="button" className="btn" style={{ flex: 1 }}
            disabled={busy || !canSave}
            onClick={handleSave}>
            {busy ? <Loader2 size={14} style={{ animation: "spin360 .7s linear infinite" }} /> : isEdit ? "Save Changes" : "Add Medication"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}