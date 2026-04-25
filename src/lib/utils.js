export function to12h(t24) {
  if (!t24 || !t24.includes(":")) return t24;
  const parts = String(t24).trim().split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  let sec = 0;
  if (parts.length >= 3 && parts[2] !== "") {
    sec = Number(String(parts[2]).replace(/\D.*$/, "")) || 0;
  }
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t24;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")} ${ampm}`;
}

export function to12hNoSeconds(t24) {
  if (!t24 || !String(t24).includes(":")) return t24;
  const parts = String(t24).trim().split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t24;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatOverdueDurationMinutes(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  if (m < 1) return "less than a minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${h} hr`;
  return `${h}h ${r}m`;
}

export function to24h(t12) {
  if (!t12) return "08:00";
  const m = t12.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM)/i);
  if (!m) return t12;
  let h = parseInt(m[1], 10);
  const min = m[2].padStart(2, "0");
  const ap = m[4].toUpperCase();
  if (ap === "AM" && h === 12) h = 0;
  if (ap === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${min}`;
}
