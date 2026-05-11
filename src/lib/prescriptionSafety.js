import { findMedication } from "./medicationDatabase";

/**
 * Heuristic clinical safety flags for pharmacist review (demo rules).
 * @param {{ medication_name?: string, dosage?: string|null, frequency?: string|null, instructions?: string|null }} line
 * @returns {{ unsafe: boolean, reasons: string[] }}
 */
export function evaluatePrescriptionLineSafety(line) {
  const reasons = [];
  const name = String(line?.medication_name || "").trim();
  const dosage = String(line?.dosage || "").trim().toLowerCase();
  const frequency = String(line?.frequency || "").trim();
  const instructions = String(line?.instructions || "").trim().toLowerCase();

  const intervalHours = (() => {
    const m = frequency.match(/^Every\s+(\d+)\s+hours?$/i);
    return m ? Number(m[1]) : null;
  })();

  if (intervalHours !== null && intervalHours <= 1) {
    reasons.push("Very frequent dosing (every hour or less) needs pharmacist verification.");
  }

  if (frequency === "Four times daily" && /900\s*mg|1000\s*mg|1500\s*mg|2000\s*mg/.test(dosage) && /acetaminophen|tylenol/i.test(name)) {
    reasons.push("High acetaminophen dose with QID frequency may exceed safe limits.");
  }

  const durMo = instructions.match(/\b(\d+)\s*months?\b/i);
  const durDay = instructions.match(/\b(\d+)\s*days?\b/i);
  const durWk = instructions.match(/\b(\d+)\s*weeks?\b/i);
  if (durMo && Number(durMo[1]) > 6) {
    reasons.push("Duration longer than 6 months in instructions should be confirmed.");
  }
  if (durDay && Number(durDay[1]) > 120 && !/prophylaxis|maintenance/i.test(instructions)) {
    reasons.push("Extended duration (over 120 days) should be reviewed.");
  }
  if (durWk && Number(durWk[1]) > 24) {
    reasons.push("Course longer than 24 weeks should be reviewed.");
  }

  const amt = parseFloat((dosage.match(/^([0-9.]+)/) || [])[1] || "");
  if (Number.isFinite(amt) && amt > 2000 && /mg\b/.test(dosage)) {
    reasons.push("Unusually high mg strength — confirm dosing.");
  }

  const med = findMedication(name);
  if (med && /ibuprofen|advil/i.test(med.name) && Number.isFinite(amt) && amt > 800) {
    reasons.push("Ibuprofen strength above typical max single dose.");
  }

  return { unsafe: reasons.length > 0, reasons };
}

/**
 * @param {Array<{ medication_name?: string, dosage?: string|null, frequency?: string|null, instructions?: string|null }>} medLines
 */
export function evaluatePrescriptionSubmissionSafety(medLines) {
  const lines = medLines || [];
  const per = lines.map((row) => ({ row, ...evaluatePrescriptionLineSafety(row) }));
  const unsafe = per.some((p) => p.unsafe);
  const reasons = per.flatMap((p) => p.reasons);
  return { unsafe, reasons, perLine: per };
}
