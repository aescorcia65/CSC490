export const MESSAGE_ATTACHMENTS_BUCKET =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_MESSAGE_ATTACHMENTS_BUCKET?.trim()) ||
  "message-attachments";
