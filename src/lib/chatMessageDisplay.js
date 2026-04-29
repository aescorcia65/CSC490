import {
  VIDEO_CALL_STARTED_PREFIX,
  VIDEO_VISIT_ENDED_PREFIX,
  parseVideoApprovalMessageBody,
  buildVideoCallUrlFromRoom,
} from "./videoCall";

/**
 * System protocol strings (VIDEO_*) are stored for sync/real-time; most are hidden in chat UI.
 * @typedef {"plain"|"hidden"|"video_started_invite"} ChatDisplayKind
 */

/**
 * @param {string} rawBody
 * @param {{ role: "patient" | "doctor" | "pharmacist", isMine: boolean }}
 * @returns {{ kind: ChatDisplayKind, line: string, joinUrl?: string }}
 */
export function getProtocolChatDisplay(rawBody, { role, isMine }) {
  const s = String(rawBody || "").trimStart();
  if (!s) return { kind: "plain", line: "" };

  if (/^VIDEO_[A-Z_]+\|/.test(s)) {
    if (
      role === "patient" &&
      !isMine &&
      s.startsWith(`${VIDEO_CALL_STARTED_PREFIX}|`)
    ) {
      const parsed = parseVideoApprovalMessageBody(s);
      if (parsed?.eventType === "started" && parsed.roomId) {
        const joinUrl = buildVideoCallUrlFromRoom(parsed.roomId);
        if (joinUrl) return { kind: "video_started_invite", line: "", joinUrl };
      }
    }
    return { kind: "hidden", line: "" };
  }

  return { kind: "plain", line: s };
}

/**
 * If notification preview text would expose a protocol string, return a safe preview.
 */
export function formatChatNotificationPreview(rawBody) {
  const trimmed = String(rawBody || "").trimStart();
  if (/^VIDEO_[A-Z_]+\|/.test(trimmed)) {
    if (trimmed.startsWith(`${VIDEO_CALL_STARTED_PREFIX}|`))
      return "Your doctor started the video visit — tap Join in Messages.";
    if (trimmed.startsWith(`${VIDEO_VISIT_ENDED_PREFIX}|`)) return "Your doctor ended the video visit.";
    return "Video visit update — open Appointments.";
  }
  return s;
}
