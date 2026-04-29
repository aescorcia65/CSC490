/** @typedef {{ date: string, time: string }} Slot */

function normTime(t) {
  const s = String(t || "").trim();
  if (!s) return "";
  if (s.length === 5 && s[2] === ":") return `${s}:00`;
  return s.length >= 8 ? s.slice(0, 8) : s;
}

/**
 * Normalizes DB `reschedule_request` JSON (v2 or legacy) for UI + actions.
 * @param {unknown} raw
 * @returns {null | { v: 2, phase: "patient_proposed" | "doctor_counter", patient: Slot, doctor: Slot | null, message?: string }}
 */
export function normalizeRescheduleRequest(raw) {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || !obj) return null;

  if (obj.v === 2 && obj.patient?.date && obj.patient?.time) {
    return {
      v: 2,
      phase: obj.phase === "doctor_counter" && obj.doctor?.date && obj.doctor?.time ? "doctor_counter" : "patient_proposed",
      patient: { date: String(obj.patient.date), time: normTime(obj.patient.time) },
      doctor:
        obj.doctor && obj.doctor.date && obj.doctor.time
          ? { date: String(obj.doctor.date), time: normTime(obj.doctor.time) }
          : null,
      message: typeof obj.message === "string" && obj.message.trim() ? obj.message.trim() : undefined,
    };
  }

  if (obj.date && obj.time) {
    return {
      v: 2,
      phase: "patient_proposed",
      patient: { date: String(obj.date), time: normTime(obj.time) },
      doctor: null,
      message: undefined,
    };
  }

  return null;
}

export function hasActiveRescheduleRequest(appt) {
  if (!appt?.reschedule_request) return false;
  if (appt.status === "cancelled" || appt.status === "completed") return false;
  if (appt.status !== "scheduled" && appt.status !== "rescheduled") return false;
  return !!normalizeRescheduleRequest(appt.reschedule_request);
}

export function buildPatientRescheduleRequestPayload({ date, time }) {
  return {
    v: 2,
    phase: "patient_proposed",
    patient: { date, time: normTime(time) },
    doctor: null,
  };
}

export function buildDoctorCounterPayload(patientSlot, doctorSlot) {
  return {
    v: 2,
    phase: "doctor_counter",
    patient: { date: patientSlot.date, time: normTime(patientSlot.time) },
    doctor: { date: doctorSlot.date, time: normTime(doctorSlot.time) },
  };
}
