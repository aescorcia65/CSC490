import { supabase } from "../supabase";
import { VIDEO_WAITING_CHECKIN_PREFIX, buildVideoRoomId, getAppointmentVideoWindow, parseVideoWaitingCheckinMessageBody } from "./videoCall";

/**
 * Rebuild `videoCheckedInKeys` map (key: `${apptId}:${windowStartMs}`) from server check-in messages.
 */
export async function loadVideoCheckInKeyMapForPatient(userId, appointments) {
  if (!userId || !Array.isArray(appointments) || !appointments.length) return {};
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("patient_messages")
    .select("body,created_at")
    .eq("sender_id", userId)
    .like("body", `${VIDEO_WAITING_CHECKIN_PREFIX}|%`)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    console.error("loadVideoCheckInKeyMapForPatient:", error.message);
    return {};
  }
  const now = Date.now();
  const keys = {};
  for (const a of appointments) {
    const w = getAppointmentVideoWindow(a);
    if (!w) continue;
    const portalEnd = w.portalEndMs ?? w.windowEndMs;
    if (now > portalEnd) continue;
    const room = buildVideoRoomId(userId, a.doctor_id);
    for (const row of data || []) {
      const p = parseVideoWaitingCheckinMessageBody(row?.body || "");
      if (!p) continue;
      if (p.roomId !== room) continue;
      if (p.windowStartMs !== w.windowStartMs || p.windowEndMs !== w.windowEndMs) continue;
      if (now > portalEnd) continue;
      const k = `${a.id}:${w.windowStartMs}`;
      keys[k] = true;
      break;
    }
  }
  return keys;
}

export function isVirtualCheckInWindowOpen(appt, nowMs = Date.now()) {
  if (!appt) return false;
  const st = String(appt.status || "");
  if (st === "cancelled" || st === "completed") return false;
  const w = getAppointmentVideoWindow(appt);
  if (!w) return false;
  const end = w.portalEndMs ?? w.windowEndMs;
  return nowMs >= w.windowStartMs && nowMs <= end;
}
