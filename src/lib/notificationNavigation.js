
export function notificationTextBlob(n) {
  return `${n?.title || ""} ${n?.body || ""}`.toLowerCase();
}

export function notificationSuggestsPrescription(n) {
  if (n?.type === "prescription_ready") return true;
  const b = notificationTextBlob(n);
  return /prescription|pharmacist|pharmacy|claimed|refill|\brx\b|pickup|prior auth|medication|status update|processing|filled|ready for/.test(b);
}

export function notificationSuggestsChat(n) {
  const b = notificationTextBlob(n);
  return /\bmessage\b|chat|inbox|sent a message/.test(b);
}
