/** DB-backed lifecycle for virtual visits (`appointments.virtual_visit_status`). */
import { getAppointmentVideoWindow, isVideoStyleVisitType } from "./videoCall";

/** @readonly */
export const VS = Object.freeze({
  PENDING: "pending",
  CHECKED_IN: "checked_in",
  WAITING_FOR_DOCTOR: "waiting_for_doctor",
  VIDEO_STARTED: "video_started",
  // WebRTC in-app call statuses
  CALL_STARTED: "call_started",  // doctor opened the call, patient can join
  CALL_ENDED: "call_ended",      // call finished — never show Join Call again
  COMPLETED: "completed",
  DENIED: "denied",
  CANCELLED: "cancelled",
});

/** Safe default when DB row has no column yet or null. */
export function getEffectiveVirtualVisitStatus(appointmentLike) {
  if (!appointmentLike || !isVideoStyleVisitType(appointmentLike)) return null;
  const raw = appointmentLike.virtual_visit_status;
  if (raw && typeof raw === "string" && raw.trim()) return raw.trim();
  return VS.PENDING;
}

export function overlapMs(aStart, aEnd, bStart, bEnd) {
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return 0;
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

/**
 * Pick the patient's appointment row with this doctor whose video window overlaps the given anchor window (e.g. from Start Video).
 */
export function findOverlappingVirtualAppointment(doctorPatientAppointments, doctorId, patientId, anchorWindowStartMs, anchorWindowEndMs) {
  const rows = (doctorPatientAppointments || []).filter((a) => {
    if (!a || String(a.doctor_id) !== String(doctorId) || String(a.patient_id) !== String(patientId)) return false;
    if (!["scheduled", "rescheduled"].includes(String(a.status || ""))) return false;
    if (!isVideoStyleVisitType(a)) return false;
    return true;
  });
  for (const a of rows) {
    const w = getAppointmentVideoWindow(a);
    if (!w) continue;
    if (overlapMs(w.windowStartMs, w.windowEndMs, anchorWindowStartMs, anchorWindowEndMs) > 0) return a;
  }
  return null;
}

/**
 * When the anchor window does not overlap (stale list, clock skew, or synthetic anchor edge cases),
 * prefer the patient’s active virtual booking that is waiting in queue for this doctor.
 */
export function findVirtualAppointmentForDoctorVideoStart(
  doctorPatientAppointments,
  doctorId,
  patientId,
  anchorWindowStartMs,
  anchorWindowEndMs,
) {
  const byOverlap = findOverlappingVirtualAppointment(
    doctorPatientAppointments,
    doctorId,
    patientId,
    anchorWindowStartMs,
    anchorWindowEndMs,
  );
  if (byOverlap) return byOverlap;

  const rows = (doctorPatientAppointments || []).filter((a) => {
    if (!a || String(a.doctor_id) !== String(doctorId) || String(a.patient_id) !== String(patientId)) return false;
    if (!["scheduled", "rescheduled"].includes(String(a.status || ""))) return false;
    if (!isVideoStyleVisitType(a)) return false;
    return true;
  });

  const waiting = rows
    .filter((a) => {
      const s = getEffectiveVirtualVisitStatus(a);
      return s === VS.WAITING_FOR_DOCTOR || s === VS.CHECKED_IN;
    })
    .map((a) => ({ a, w: getAppointmentVideoWindow(a) }))
    .filter((x) => x.w)
    .sort((x, y) => x.w.startMs - y.w.startMs);

  if (waiting.length) return waiting[0].a;

  const anchorMidMs =
    Number.isFinite(anchorWindowStartMs) && Number.isFinite(anchorWindowEndMs)
      ? Math.round((anchorWindowStartMs + anchorWindowEndMs) / 2)
      : Date.now();
  const ranked = rows
    .map((a) => {
      const w = getAppointmentVideoWindow(a);
      if (!w) return null;
      const portalEndMs = w.portalEndMs ?? w.windowEndMs;
      const inPortal = anchorMidMs >= w.windowStartMs && anchorMidMs <= portalEndMs;
      const status = getEffectiveVirtualVisitStatus(a);
      const statusScore =
        status === VS.WAITING_FOR_DOCTOR || status === VS.CHECKED_IN
          ? 0
          : status === VS.PENDING
            ? 1
            : 2;
      const dist = Math.abs(w.startMs - anchorMidMs);
      return { a, inPortal, statusScore, dist };
    })
    .filter(Boolean)
    .sort((x, y) => {
      if (x.inPortal !== y.inPortal) return x.inPortal ? -1 : 1;
      if (x.statusScore !== y.statusScore) return x.statusScore - y.statusScore;
      return x.dist - y.dist;
    });

  return ranked.length ? ranked[0].a : null;
}

/** When ending a session, overlap may fail until `resolveDoctorPatientInviteWindowMs` aligns; prefer the active `video_started` row. */
export function findVirtualAppointmentForDoctorVideoEnd(doctorPatientAppointments, doctorId, patientId, anchorWindowStartMs, anchorWindowEndMs) {
  const byOverlap = findOverlappingVirtualAppointment(
    doctorPatientAppointments,
    doctorId,
    patientId,
    anchorWindowStartMs,
    anchorWindowEndMs,
  );
  if (byOverlap) return byOverlap;

  const rows = (doctorPatientAppointments || []).filter((a) => {
    if (!a || String(a.doctor_id) !== String(doctorId) || String(a.patient_id) !== String(patientId)) return false;
    if (!["scheduled", "rescheduled"].includes(String(a.status || ""))) return false;
    if (!isVideoStyleVisitType(a)) return false;
    return true;
  });

  const started = rows
    .filter((a) => getEffectiveVirtualVisitStatus(a) === VS.VIDEO_STARTED)
    .map((a) => ({ a, w: getAppointmentVideoWindow(a) }))
    .filter((x) => x.w)
    .sort((x, y) => x.w.startMs - y.w.startMs);

  return started.length ? started[0].a : null;
}

export function isAppointmentVideoStartedInDb(apptLike) {
  return getEffectiveVirtualVisitStatus(apptLike) === VS.VIDEO_STARTED;
}
