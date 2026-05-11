/** Virtual visit intake — stored in profiles.pre_visit_intake (JSON) + allergies / medical_conditions on profile. */

/**
 * Required fields saved on submit (stored in pre_visit_intake unless noted).
 * - Full name: profiles first_name / last_name (or pre_visit_intake.full_legal_name)
 * - dob: date_of_birth_iso (YYYY-MM-DD) in intake
 * - Address, insurance, conditions: intake + medical_conditions array on profile
 * - Reason: chief_complaint
 */

import { downloadTextAsPdf } from "./pdfExport";
import { supabase } from "../supabase";
import { buildVideoRoomId, createVideoWaitingCheckinMessageBody, isVideoStyleVisitType } from "./videoCall";
import { VS } from "./virtualVisitStatus";

/**
 * Patient enters the waiting room: chat check-in row + persist `waiting_for_doctor` + notify doctor.
 */
export async function patientEnterVirtualWaitingRoom({ userId, appt, videoWindow }) {
  if (!userId || !appt?.id || !appt?.doctor_id || !videoWindow) {
    return { error: new Error("Missing appointment or visit window.") };
  }
  if (!isVideoStyleVisitType(appt)) return { error: new Error("Not a virtual visit.") };
  const roomId = buildVideoRoomId(userId, appt.doctor_id);
  const body = createVideoWaitingCheckinMessageBody({
    roomId,
    windowStartIso: new Date(videoWindow.windowStartMs).toISOString(),
    windowEndIso: new Date(videoWindow.windowEndMs).toISOString(),
  });
  if (!body) return { error: new Error("Could not build check-in.") };
  const { error: msgErr } = await supabase.from("patient_messages").insert({
    sender_id: userId,
    recipient_id: appt.doctor_id,
    body,
  });
  if (msgErr) return { error: msgErr };

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("appointments")
    .update({
      virtual_visit_status: VS.WAITING_FOR_DOCTOR,
      checked_in_at: now,
    })
    .eq("id", appt.id);

  if (!upErr) {
    await supabase.from("notifications").insert({
      user_id: appt.doctor_id,
      type: "general",
      title: "Patient checked in",
      body: "Patient has checked in and is waiting to be seen.",
      related_id: appt.id,
    });
  }

  return { error: upErr || null };
}

export function isDoctorRefillNewerThanIntake(profile) {
  const i = profile?.pre_visit_intake;
  if (!i?.doctor_refill_requested_at) return false;
  const refillMs = new Date(i.doctor_refill_requested_at).getTime();
  const doneAt = i.completed_at ? new Date(i.completed_at).getTime() : 0;
  return refillMs > doneAt;
}

export function isVirtualVisitCheckInComplete(profile) {
  if (!profile?.pre_visit_intake?.completed_at) return false;
  if (isDoctorRefillNewerThanIntake(profile)) return false;
  const i = profile.pre_visit_intake;
  const fn = String(profile.first_name || "").trim();
  const ln = String(profile.last_name || "").trim();
  const nameOk = fn && ln && fn.length >= 1 && ln.length >= 1;
  const dobOk = !!(i.date_of_birth_iso || i.date_of_birth);
  const addrOk = String(i.home_address || "").trim().length >= 4;
  const insOk = String(i.insurance_info || "").trim().length >= 2;
  const condOk =
    Array.isArray(profile.medical_conditions) &&
    profile.medical_conditions.some((x) => String(x || "").trim().length > 0);
  const chiefOk = String(i.chief_complaint || "").trim().length >= 3;
  return nameOk && dobOk && addrOk && insOk && condOk && chiefOk;
}

/** Export text content for PDF (same fields as legacy plain export). */
export function buildVirtualVisitCheckInExportText(profile) {
  const i = profile?.pre_visit_intake || {};
  const lines = [];
  lines.push("MedTrack — Virtual visit check-in");
  lines.push("");
  const nameParts = [
    profile?.first_name,
    profile?.middle_name_in_intake ?? i.middle_name,
    profile?.last_name,
  ].filter(Boolean);
  lines.push(`Name: ${nameParts.join(" ").replace(/\s+/g, " ").trim() || i.full_legal_name || ""}`);
  if (i.date_of_birth_iso || i.date_of_birth) lines.push(`Date of birth: ${i.date_of_birth_iso || i.date_of_birth}`);
  lines.push(`Address: ${i.home_address || ""}`);
  lines.push(`Insurance: ${i.insurance_info || ""}`);
  lines.push("");
  lines.push(`Health conditions: ${Array.isArray(profile?.medical_conditions) ? profile.medical_conditions.join("; ") : ""}`);
  lines.push("");
  lines.push(`Reason for visit today: ${i.chief_complaint || ""}`);
  lines.push("");
  lines.push(`Completed: ${i.completed_at || ""}`);
  return lines.join("\n");
}

/** PDF download for patient or doctor portal (not plain .txt). */
export function downloadVirtualVisitCheckInPdf(profile, filenamePrefix = "medtrack-check-in") {
  const text = buildVirtualVisitCheckInExportText(profile);
  const date = new Date().toISOString().slice(0, 10);
  downloadTextAsPdf({
    body: text,
    filename: `${filenamePrefix}-${date}`,
  });
}

/**
 * Doctor requests patient to submit a new check-in: stamp profile + reset virtual visit rows to pending.
 */
export async function doctorRequestCheckInRefill(patientId, doctorId) {
  if (!patientId || !doctorId) return { error: new Error("Missing id") };

  const { data: prof, error: pErr } = await supabase.from("profiles").select("pre_visit_intake").eq("id", patientId).maybeSingle();
  if (pErr) return { error: pErr };
  const prev = prof?.pre_visit_intake && typeof prof.pre_visit_intake === "object" ? prof.pre_visit_intake : {};
  const next = { ...prev, doctor_refill_requested_at: new Date().toISOString() };

  const { error: uErr } = await supabase
    .from("profiles")
    .update({ pre_visit_intake: next, updated_at: new Date().toISOString() })
    .eq("id", patientId);
  if (uErr) return { error: uErr };

  const { data: appts } = await supabase
    .from("appointments")
    .select("id,type,status")
    .eq("patient_id", patientId)
    .eq("doctor_id", doctorId)
    .in("status", ["scheduled", "rescheduled"]);
  const targets = (appts || []).filter((a) => isVideoStyleVisitType(a));
  await Promise.all(
    targets.map((a) =>
      supabase.from("appointments").update({ virtual_visit_status: VS.PENDING, updated_at: new Date().toISOString() }).eq("id", a.id),
    ),
  );

  await supabase.from("notifications").insert({
    user_id: patientId,
    type: "general",
    title: "New check-in requested",
    body: "Your doctor requested a new check-in form.",
  });

  return { error: null };
}

/**
 * Deletes the patient's virtual check-in from the chart: clears `pre_visit_intake` and
 * intake-derived allergies/conditions so the patient sees a blank form with no stale auto-fill.
 * Requires Supabase RLS allowing the acting user to update this patient's `profiles` row.
 */
export async function doctorClearPatientVirtualVisitCheckIn(patientId) {
  if (!patientId) return { error: new Error("Missing patient id") };
  const { error } = await supabase
    .from("profiles")
    .update({
      pre_visit_intake: null,
      allergies: [],
      medical_conditions: [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", patientId);
  return { error };
}

