import { supabase } from "../supabase";

function clip(s, max = 140) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function notifyRecipientNewChatMessage({ recipientId, senderName, messageText, relatedMessageId, title: titleOverride }) {
  if (!recipientId) return;
  const preview = clip(messageText) || "Open Messages to read.";
  const from = String(senderName || "Someone").trim() || "Someone";
  const title = String(titleOverride || "").trim() || `New message from ${from}`;
  void supabase
    .from("notifications")
    .insert({
      user_id: recipientId,
      type: "general",
      title,
      body: preview,
      related_id: relatedMessageId || null,
    })
    .then(({ error }) => {
      if (error) console.error("notifyRecipientNewChatMessage:", error.message);
    });
}
