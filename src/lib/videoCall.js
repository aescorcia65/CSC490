function normalizeParticipantToken(value) {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
  return cleaned || "user";
}

export function buildVideoRoomId(participantAId, participantBId) {
  const a = normalizeParticipantToken(participantAId);
  const b = normalizeParticipantToken(participantBId);
  const [first, second] = [a, b].sort();
  return `medtrack-care-${first}-${second}`;
}

export function buildVideoCallUrl(participantAId, participantBId) {
  const room = buildVideoRoomId(participantAId, participantBId);
  return `https://meet.jit.si/${encodeURIComponent(room)}`;
}

export const VIDEO_CALL_APPROVAL_PREFIX = "VIDEO_CALL_APPROVED";
export const VIDEO_CALL_STARTED_PREFIX = "VIDEO_CALL_STARTED";
/** Doctor ends the active video session for this booking window — patient UI must stop offering Join until a new STARTED. */
export const VIDEO_VISIT_ENDED_PREFIX = "VIDEO_VISIT_ENDED";
export const VIDEO_WAITING_CHECKIN_PREFIX = "VIDEO_WAITING_CHECKIN";
/** Doctor removes patient from the virtual waiting list (without ending an active visit). */
export const VIDEO_WAITING_DISMISSED_PREFIX = "VIDEO_WAITING_DISMISSED";
export const VIDEO_WAITING_ROOM_EARLY_JOIN_MS = 30 * 60 * 1000;
export const VIDEO_VISIT_LATE_JOIN_MS = 50 * 60 * 1000;
/** After windowEndMs, keep visit in portals / reconnect for this long (strict message windows unchanged). */
export const VIDEO_VISIT_PORTAL_TAIL_MS = 6 * 60 * 60 * 1000;

export function buildVideoCallUrlFromRoom(roomId) {
  const room = String(roomId || "").trim();
  if (!room) return "";
  return `https://meet.jit.si/${encodeURIComponent(room)}`;
}

export function createVideoApprovalMessageBody({ roomId, windowStartIso, windowEndIso }) {
  if (!roomId || !windowStartIso || !windowEndIso) return "";
  return `${VIDEO_CALL_APPROVAL_PREFIX}|${roomId}|${windowStartIso}|${windowEndIso}`;
}

export function createVideoSessionMessageBody({ roomId, windowStartIso, windowEndIso, startedAtIso }) {
  if (!roomId || !windowStartIso || !windowEndIso) return "";
  const startedIso = startedAtIso || new Date().toISOString();
  return `${VIDEO_CALL_STARTED_PREFIX}|${roomId}|${windowStartIso}|${windowEndIso}|${startedIso}`;
}

export function createVideoSessionEndedMessageBody({ roomId, windowStartIso, windowEndIso, endedAtIso }) {
  if (!roomId || !windowStartIso || !windowEndIso) return "";
  const endedIso = endedAtIso || new Date().toISOString();
  return `${VIDEO_VISIT_ENDED_PREFIX}|${roomId}|${windowStartIso}|${windowEndIso}|${endedIso}`;
}

export function createVideoWaitingCheckinMessageBody({ roomId, windowStartIso, windowEndIso, checkedInAtIso }) {
  if (!roomId || !windowStartIso || !windowEndIso) return "";
  const checkinIso = checkedInAtIso || new Date().toISOString();
  return `${VIDEO_WAITING_CHECKIN_PREFIX}|${roomId}|${windowStartIso}|${windowEndIso}|${checkinIso}`;
}

export function createVideoWaitingDismissedMessageBody({ roomId, windowStartIso, windowEndIso, dismissedAtIso }) {
  if (!roomId || !windowStartIso || !windowEndIso) return "";
  const atIso = dismissedAtIso || new Date().toISOString();
  return `${VIDEO_WAITING_DISMISSED_PREFIX}|${roomId}|${windowStartIso}|${windowEndIso}|${atIso}`;
}

export function parseVideoApprovalMessageBody(value) {
  const raw = String(value || "");
  const startedPrefix = `${VIDEO_CALL_STARTED_PREFIX}|`;
  const approvalPrefix = `${VIDEO_CALL_APPROVAL_PREFIX}|`;
  const endedPrefix = `${VIDEO_VISIT_ENDED_PREFIX}|`;
  const isStarted = raw.startsWith(startedPrefix);
  const isApproval = raw.startsWith(approvalPrefix);
  const isEnded = raw.startsWith(endedPrefix);
  if (!isStarted && !isApproval && !isEnded) return null;
  const parts = raw.split("|");
  if (parts.length < 4) return null;
  const [, roomId, windowStartIso, windowEndIso, atIsoMaybe] = parts;
  const startMs = Date.parse(windowStartIso);
  const endMs = Date.parse(windowEndIso);
  if (!roomId || Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) return null;
  const startedAtIso = isStarted ? atIsoMaybe || null : null;
  const startedAtMs = startedAtIso ? Date.parse(startedAtIso) : NaN;
  const endedAtIso = isEnded ? atIsoMaybe || null : null;
  const endedAtMs = endedAtIso ? Date.parse(endedAtIso) : NaN;
  return {
    roomId,
    windowStartIso,
    windowEndIso,
    windowStartMs: startMs,
    windowEndMs: endMs,
    startedAtIso: startedAtIso && !Number.isNaN(startedAtMs) ? startedAtIso : null,
    startedAtMs: startedAtIso && !Number.isNaN(startedAtMs) ? startedAtMs : null,
    endedAtIso: endedAtIso && !Number.isNaN(endedAtMs) ? endedAtIso : null,
    endedAtMs: endedAtIso && !Number.isNaN(endedAtMs) ? endedAtMs : null,
    eventType: isStarted ? "started" : isEnded ? "ended" : "approved",
  };
}

export function parseVideoWaitingCheckinMessageBody(value) {
  return parseVideoWindowEventMessage(value, VIDEO_WAITING_CHECKIN_PREFIX, "checkin");
}

export function parseVideoWaitingDismissedMessageBody(value) {
  return parseVideoWindowEventMessage(value, VIDEO_WAITING_DISMISSED_PREFIX, "dismissed");
}

/**
 * @param {string} prefix
 * @param {"checkin" | "dismissed"} kind
 */
function parseVideoWindowEventMessage(value, prefix, kind) {
  const raw = String(value || "");
  if (!raw.startsWith(`${prefix}|`)) return null;
  const parts = raw.split("|");
  if (parts.length < 4) return null;
  const [, roomId, windowStartIso, windowEndIso, atIsoMaybe] = parts;
  const startMs = Date.parse(windowStartIso);
  const endMs = Date.parse(windowEndIso);
  if (!roomId || Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) return null;
  const atIso = atIsoMaybe || null;
  const atMs = atIso ? Date.parse(atIso) : NaN;
  return {
    kind,
    roomId,
    windowStartIso,
    windowEndIso,
    windowStartMs: startMs,
    windowEndMs: endMs,
    atIso: atIso && !Number.isNaN(atMs) ? atIso : null,
    atMs: atIso && !Number.isNaN(atMs) ? atMs : null,
    // backward-compatible aliases for checkin parser
    checkedInAtIso: atIso && !Number.isNaN(atMs) ? atIso : null,
    checkedInAtMs: atIso && !Number.isNaN(atMs) ? atMs : null,
  };
}

function normalizeTimeValue(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s.length === 5 && s[2] === ":") return `${s}:00`;
  return s.length >= 8 ? s.slice(0, 8) : s;
}

/**
 * True for online/video visits. Accepts "Virtual …", "Video …", "telehealth", etc.
 * In-person visits (label often has no "video" / "virtual") are excluded.
 */
export function isVideoStyleVisitType(appointmentOrType) {
  const t = String(
    typeof appointmentOrType === "string" ? appointmentOrType : appointmentOrType?.type || "",
  ).toLowerCase();
  if (!t) return false;
  return t.includes("virtual") || t.includes("video") || t.includes("telehealth");
}

export function getAppointmentVideoWindow(appointment, opts = {}) {
  if (!appointment) return null;
  if (!isVideoStyleVisitType(appointment)) return null;
  const date = String(appointment.date || "");
  const time = normalizeTimeValue(appointment.time);
  if (!date || !time) return null;
  const startMs = Date.parse(`${date}T${time}`);
  if (Number.isNaN(startMs)) return null;
  const earlyJoinMs = Number.isFinite(opts.earlyJoinMs) ? opts.earlyJoinMs : VIDEO_WAITING_ROOM_EARLY_JOIN_MS;
  const lateJoinMs = Number.isFinite(opts.lateJoinMs) ? opts.lateJoinMs : VIDEO_VISIT_LATE_JOIN_MS;
  const portalTailMs = Number.isFinite(opts.portalTailMs) ? opts.portalTailMs : VIDEO_VISIT_PORTAL_TAIL_MS;
  const windowEndMs = startMs + lateJoinMs;
  return {
    startMs,
    windowStartMs: startMs - earlyJoinMs,
    windowEndMs,
    portalEndMs: windowEndMs + portalTailMs,
  };
}
