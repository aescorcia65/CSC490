/**
 * Apply a Supabase postgres_changes payload to a local notification list
 * so INSERT / UPDATE / DELETE stay in sync without a full refetch.
 */
export function mergeNotificationRows(prev, payload, maxLen = 50) {
  const ev = payload?.eventType;
  const row = payload?.new;
  const oldRow = payload?.old;
  if (ev === "INSERT" && row?.id) {
    return prev.some((n) => n.id === row.id) ? prev : [row, ...prev].slice(0, maxLen);
  }
  if (ev === "UPDATE" && row?.id) {
    if (!prev.some((n) => n.id === row.id)) return [row, ...prev].slice(0, maxLen);
    return prev.map((n) => (n.id === row.id ? { ...n, ...row } : n));
  }
  if (ev === "DELETE" && oldRow?.id) {
    return prev.filter((n) => n.id !== oldRow.id);
  }
  return prev;
}
