import {
  VIDEO_CALL_APPROVAL_PREFIX,
  VIDEO_CALL_STARTED_PREFIX,
  VIDEO_VISIT_ENDED_PREFIX,
  VIDEO_WAITING_CHECKIN_PREFIX,
  VIDEO_WAITING_DISMISSED_PREFIX,
  buildVideoCallUrlFromRoom,
  parseVideoApprovalMessageBody,
  parseVideoWaitingCheckinMessageBody,
  parseVideoWaitingDismissedMessageBody,
} from "./videoCall";

function trimBody(body) {
  return String(body || "").trimStart();
}

function isPatientVideoProtocolFromDoctor(body, senderId, userId, doctorId) {
  const s = trimBody(body);
  if (!/^VIDEO_[A-Z_]+\|/.test(s)) return false;
  return String(senderId) === String(doctorId) && String(senderId) !== String(userId);
}

function isPatientOwnVideoProtocol(body, senderId, userId) {
  const s = trimBody(body);
  if (!/^VIDEO_[A-Z_]+\|/.test(s)) return false;
  return String(senderId) === String(userId);
}

function windowKeyFromRoomWindow(roomId, startMs, endMs) {
  return `${roomId}|${startMs}|${endMs}`;
}

function parseDoctorVideoKind(body) {
  const s = trimBody(body);
  if (s.startsWith(`${VIDEO_WAITING_CHECKIN_PREFIX}|`)) {
    const p = parseVideoWaitingCheckinMessageBody(s);
    if (p) return { kind: "checkin", parsed: p };
    return null;
  }
  if (s.startsWith(`${VIDEO_WAITING_DISMISSED_PREFIX}|`)) {
    const p = parseVideoWaitingDismissedMessageBody(s);
    if (p) return { kind: "dismissed", parsed: p };
    return null;
  }
  const approvalLike = s.startsWith(`${VIDEO_CALL_APPROVAL_PREFIX}|`) || s.startsWith(`${VIDEO_CALL_STARTED_PREFIX}|`) || s.startsWith(`${VIDEO_VISIT_ENDED_PREFIX}|`);
  if (!approvalLike) return null;
  const p = parseVideoApprovalMessageBody(s);
  if (!p) return null;
  if (p.eventType === "approved") return { kind: "ready", parsed: p };
  if (p.eventType === "started") return { kind: "join", parsed: p };
  if (p.eventType === "ended") return { kind: "ended", parsed: p };
  return null;
}

/**
 * Build ordered timeline for patient ↔ doctor thread: plain messages + deduped video visit cards.
 * @param {Array<Record<string, unknown>>} messages
 * @param {string} userId
 * @param {string} doctorId
 * @returns {Array<{ type: "message", msg: any } | { type: "videoCard", kind: string, msg: any, parsed: any, windowKey: string, showJoinButton?: boolean }>}
 */
export function buildPatientDoctorThreadItems(messages, userId, doctorId) {
  if (!userId || !doctorId) {
    return (messages || []).map((m) => ({ type: "message", msg: m }));
  }
  const sorted = [...(messages || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const endedAfterTsByWindow = new Map();
  for (const m of sorted) {
    if (!isPatientVideoProtocolFromDoctor(m.body, m.sender_id, userId, doctorId)) continue;
    const vk = parseDoctorVideoKind(m.body);
    if (!vk || vk.kind !== "ended" || !vk.parsed) continue;
    const wk = windowKeyFromRoomWindow(vk.parsed.roomId, vk.parsed.windowStartMs, vk.parsed.windowEndMs);
    const t = Date.parse(m.created_at || "");
    if (!Number.isFinite(t)) continue;
    const prev = endedAfterTsByWindow.get(wk) || 0;
    if (t > prev) endedAfterTsByWindow.set(wk, t);
  }

  const items = [];
  const lastCardKindByWindow = new Map();

  for (const m of sorted) {
    if (isPatientOwnVideoProtocol(m.body, m.sender_id, userId)) {
      continue;
    }

    if (isPatientVideoProtocolFromDoctor(m.body, m.sender_id, userId, doctorId)) {
      const vk = parseDoctorVideoKind(m.body);
      if (!vk || !vk.parsed) continue;
      const p = vk.parsed;
      const wk = windowKeyFromRoomWindow(p.roomId, p.windowStartMs, p.windowEndMs);

      if (vk.kind === "checkin" || vk.kind === "dismissed") {
        continue;
      }

      if (vk.kind === "ready") {
        if (lastCardKindByWindow.get(wk) === "ready") continue;
        lastCardKindByWindow.set(wk, "ready");
        items.push({ type: "videoCard", kind: "ready", msg: m, parsed: p, windowKey: wk });
        continue;
      }

      if (vk.kind === "join") {
        if (lastCardKindByWindow.get(wk) === "join") {
          const tail = items[items.length - 1];
          if (tail?.type === "videoCard" && tail.kind === "join" && tail.windowKey === wk) items.pop();
        }
        lastCardKindByWindow.set(wk, "join");
        const joinTs = Date.parse(m.created_at || "");
        const endedTs = endedAfterTsByWindow.get(wk) || 0;
        const showJoinButton = !Number.isFinite(joinTs) || !Number.isFinite(endedTs) || endedTs <= joinTs;
        items.push({ type: "videoCard", kind: "join", msg: m, parsed: p, windowKey: wk, showJoinButton });
        continue;
      }

      if (vk.kind === "ended") {
        lastCardKindByWindow.set(wk, "ended");
        items.push({ type: "videoCard", kind: "ended", msg: m, parsed: p, windowKey: wk });
        continue;
      }
    }

    items.push({ type: "message", msg: m });
  }

  return items;
}

export function joinUrlForVideoCard(parsed) {
  if (!parsed?.roomId) return "";
  return buildVideoCallUrlFromRoom(parsed.roomId);
}
