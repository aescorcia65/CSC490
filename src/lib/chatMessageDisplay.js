import { VIDEO_VISIT_ENDED_PREFIX, VIDEO_CALL_STARTED_PREFIX } from "./videoCall";

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

  // All VIDEO_* protocol rows are used only for appointment/realtime sync.
  // They must never appear in the chat thread for any role.
  if (/^VIDEO_[A-Z_]+\|/.test(s)) {
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
  return trimmed;
}
