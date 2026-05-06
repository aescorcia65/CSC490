import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../supabase";
import { MedAutocomplete, DosageSelector, FrequencySelect } from "../common/MedicationInputs";
import { parseStoredDosage } from "../../lib/medicationDatabase";
import { evaluatePrescriptionSubmissionSafety } from "../../lib/prescriptionSafety";

function medRowsFromPrescriptionLines(lines) {
  return (lines || []).map((row) => {
    const name = String(row?.medication_name || "").trim();
    const parsed = parseStoredDosage(row?.dosage || "");
    const doseAmt = row?.dosage_amount != null ? String(row.dosage_amount) : parsed.amount;
    const doseUnit = row?.dosage_unit || parsed.unit || "mg";
    return {
      medication_name: name,
      dosage_amount: doseAmt,
      dosage_unit: doseUnit,
      frequency: row?.frequency || "",
      instructions: row?.instructions || "",
      commonDosages: row?.commonDosages || [],
    };
  });
}

export default function PrescribeModal({
  patient,
  patientProfile,
  doctor,
  onClose,
  onSuccess,
  editPrescription = null,
  editMedicationLines = null,
}) {
  const emptyMed = () => ({
    medication_name: "",
    dosage_amount: "",
    dosage_unit: "mg",
    frequency: "",
    instructions: "",
    commonDosages: [],
  });

  const [meds, setMeds] = useState([emptyMed()]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const t1 = "var(--t1)", t3 = "var(--t3)";
  const isEdit = !!editPrescription?.id;

  useEffect(() => {
    if (isEdit && Array.isArray(editMedicationLines) && editMedicationLines.length) {
      const loaded = medRowsFromPrescriptionLines(editMedicationLines);
      setMeds(loaded.length ? loaded : [emptyMed()]);
      setNotes(editPrescription?.notes || "");
    } else {
      setMeds([emptyMed()]);
      setNotes("");
    }
  }, [isEdit, editPrescription?.id, editPrescription?.notes, editMedicationLines]);

  function addRow() {
    setMeds((m) => [...m, emptyMed()]);
  }
  function removeRow(i) {
    setMeds((m) => (m.length > 1 ? m.filter((_, j) => j !== i) : m));
  }

  function updateMed(i, field, value) {
    setMeds((ms) => ms.map((x, j) => (j === i ? { ...x, [field]: value } : x)));
  }

  function handleMedSelect(i, med) {
    setMeds((ms) =>
      ms.map((x, j) =>
        j === i
          ? {
              ...x,
              medication_name: med.name,
              dosage_amount: med.defaultDosage,
              dosage_unit: med.defaultUnit,
              commonDosages: med.commonDosages || [],
            }
          : x,
      ),
    );
  }

  async function submit(e) {
    e?.preventDefault();
    const valid = meds.filter((m) => m.medication_name?.trim());
    if (!valid.length) {
      setErr("Please add at least one medication.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const pharmacistId = patientProfile?.primary_pharmacist_id || null;
      const medRows = valid.map((m) => ({
        medication_name: m.medication_name.trim(),
        dosage: m.dosage_amount ? `${m.dosage_amount} ${m.dosage_unit}`.trim() : null,
        frequency: m.frequency?.trim() || null,
        instructions: m.instructions?.trim() || null,
      }));
      const safety = evaluatePrescriptionSubmissionSafety(
        valid.map((m) => ({
          medication_name: m.medication_name.trim(),
          dosage: m.dosage_amount ? `${m.dosage_amount} ${m.dosage_unit}`.trim() : null,
          frequency: m.frequency?.trim() || null,
          instructions: m.instructions?.trim() || null,
        })),
      );
      const review_status = safety.unsafe ? "pending_review" : "approved";
      const safety_review_issues = safety.unsafe ? safety.reasons : null;

      let rxId = editPrescription?.id || null;

      if (isEdit && rxId) {
        const { error: upRxErr } = await supabase
          .from("prescriptions")
          .update({
            notes: notes.trim() || null,
            status: "pending_pharmacist",
            review_status,
            pharmacist_review_note: null,
            safety_review_issues,
            updated_at: new Date().toISOString(),
          })
          .eq("id", rxId)
          .eq("doctor_id", doctor.id);
        if (upRxErr) throw upRxErr;
        await supabase.from("prescription_medications").delete().eq("prescription_id", rxId);
      } else {
        const { data: rx, error: rxErr } = await supabase
          .from("prescriptions")
          .insert({
            patient_id: patient.id,
            doctor_id: doctor.id,
            pharmacist_id: pharmacistId,
            status: "pending_pharmacist",
            notes: notes.trim() || null,
            review_status,
            pharmacist_review_note: null,
            safety_review_issues,
          })
          .select("id")
          .single();
        if (rxErr) throw rxErr;
        rxId = rx?.id;
      }

      if (!rxId) throw new Error("Missing prescription id.");

      const insertRows = medRows.map((m) => ({ prescription_id: rxId, ...m }));
      await supabase.from("prescription_medications").insert(insertRows);

      const medNames = valid.map((m) => m.medication_name.trim()).join(", ");
      const docName = doctor.first_name || doctor.email?.split("@")[0] || "Doctor";

      const notifPromises = [];
      if (pharmacistId) {
        notifPromises.push(
          supabase.from("notifications").insert({
            user_id: pharmacistId,
            type: "general",
            title: safety.unsafe ? "Prescription needs safety review" : "New prescription received",
            body: `Dr. ${docName} sent a prescription for ${patient.fullName || "a patient"}: ${medNames}.`,
            related_id: rxId,
          }),
        );
      }
      notifPromises.push(
        supabase.from("notifications").insert({
          user_id: doctor.id,
          type: "general",
          title: isEdit ? "Prescription updated" : "Prescription sent to pharmacy",
          body: isEdit
            ? `You updated: ${medNames} for ${patient.fullName || "patient"}.`
            : `You sent: ${medNames} for ${patient.fullName || "patient"}${pharmacistId ? "" : " (no pharmacist assigned yet)"}.`,
          related_id: rxId,
        }),
      );
      Promise.allSettled(notifPromises);

      onSuccess?.();
      onClose();
    } catch (e) {
      setErr(e.message || "Could not create prescription.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="mo"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 28, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 28, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
        style={{ maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ color: t1, fontSize: 18, fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontWeight: 600 }}>
            {isEdit ? "Update prescription" : "New prescription"} — {patient?.fullName || "Patient"}
          </h2>
          <button
            onClick={onClose}
            type="button"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              border: "1px solid var(--b1)",
              background: "var(--s2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: t3,
            }}
          >
            <X size={13} />
          </button>
        </div>

        {!patientProfile?.primary_pharmacist_id && (
          <p
            style={{
              color: "var(--am)",
              fontSize: 12,
              marginBottom: 12,
              padding: "8px 12px",
              background: "rgba(245,158,11,.1)",
              borderRadius: 8,
            }}
          >
            This patient has no primary pharmacist. The prescription will be unassigned until a pharmacist claims it.
          </p>
        )}

        <form onSubmit={submit}>
          {meds.map((m, i) => (
            <div key={i} style={{ marginBottom: 14, padding: 12, background: "var(--s2)", borderRadius: 12, border: "1px solid var(--b0)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: t3, fontSize: 11, fontWeight: 600 }}>Medication {i + 1}</span>
                <button type="button" onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "var(--ro)", cursor: "pointer", padding: 0 }}>
                  <Trash2 size={12} />
                </button>
              </div>

              <MedAutocomplete
                value={m.medication_name}
                onChange={(v) => updateMed(i, "medication_name", v)}
                onSelect={(med) => handleMedSelect(i, med)}
                style={{ marginBottom: 8 }}
              />

              <label style={{ color: t3, fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" }}>Dosage</label>
              <DosageSelector
                dosageAmount={m.dosage_amount}
                dosageUnit={m.dosage_unit}
                commonDosages={m.commonDosages}
                onAmountChange={(v) => updateMed(i, "dosage_amount", v)}
                onUnitChange={(v) => updateMed(i, "dosage_unit", v)}
                style={{ marginBottom: 8 }}
              />

              <label style={{ color: t3, fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" }}>Frequency</label>
              <FrequencySelect value={m.frequency} onChange={(v) => updateMed(i, "frequency", v)} style={{ marginBottom: 8 }} />

              <label style={{ color: t3, fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" }}>
                Instructions (optional)
              </label>
              <input
                className="inp"
                placeholder="e.g. Take with food, avoid alcohol..."
                value={m.instructions}
                onChange={(e) => updateMed(i, "instructions", e.target.value)}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            style={{
              marginBottom: 14,
              padding: "8px 14px",
              borderRadius: 9,
              border: "1px dashed var(--b1)",
              background: "transparent",
              color: t3,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Plus size={12} /> Add medication
          </button>

          <div style={{ marginBottom: 14 }}>
            <label className="lbl" style={{ marginBottom: 6 }}>
              Notes (optional)
            </label>
            <textarea className="inp" rows={2} placeholder="Prescription notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {err && <p style={{ color: "var(--ro)", fontSize: 12, marginBottom: 12 }}>{err}</p>}

          <div style={{ display: "flex", gap: 9 }}>
            <button type="button" className="bto" style={{ flex: 1 }} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-doc" style={{ flex: 1 }} disabled={busy}>
              {busy ? <Loader2 size={14} className="auth-spin" /> : isEdit ? "Save & resubmit" : "Send to pharmacist"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
