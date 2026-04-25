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

export function buildVideoCallUrlFromRoom(roomId) {
  const room = String(roomId || "").trim();
  if (!room) return "";
  return `https://meet.jit.si/${encodeURIComponent(room)}`;
}

export function createVideoApprovalMessageBody({ roomId, windowStartIso, windowEndIso }) {
  if (!roomId || !windowStartIso || !windowEndIso) return "";
  return `${VIDEO_CALL_APPROVAL_PREFIX}|${roomId}|${windowStartIso}|${windowEndIso}`;
}

export function parseVideoApprovalMessageBody(value) {
  const raw = String(value || "");
  if (!raw.startsWith(`${VIDEO_CALL_APPROVAL_PREFIX}|`)) return null;
  const parts = raw.split("|");
  if (parts.length < 4) return null;
  const [, roomId, windowStartIso, windowEndIso] = parts;
  const startMs = Date.parse(windowStartIso);
  const endMs = Date.parse(windowEndIso);
  if (!roomId || Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) return null;
  return {
    roomId,
    windowStartIso,
    windowEndIso,
    windowStartMs: startMs,
    windowEndMs: endMs,
  };
}
