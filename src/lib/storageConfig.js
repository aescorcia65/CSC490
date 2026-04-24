/** Must match bucket id in Supabase Storage (see supabase/manual/01_message_attachments_storage.sql). */
export const MESSAGE_ATTACHMENTS_BUCKET =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_MESSAGE_ATTACHMENTS_BUCKET?.trim()) ||
  "message-attachments";
