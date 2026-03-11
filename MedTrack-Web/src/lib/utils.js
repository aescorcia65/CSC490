export function to12h(t24) {
  if (!t24 || !t24.includes(":")) return t24;
  const [h, m] = t24.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function to24h(t12) {
  if (!t12) return "08:00";
  const m = t12.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return t12;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = m[3].toUpperCase();
  if (ap === "AM" && h === 12) h = 0;
  if (ap === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${min}`;
}
