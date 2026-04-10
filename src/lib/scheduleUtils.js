
export function freqToTimes(freq, firstTime = "08:00") {
  const f = (freq || "").toLowerCase().trim();
  const [fh, fm] = firstTime.split(":").map(Number);
  const start = fh * 60 + (fm || 0); // minutes since midnight

  function mins(m) {
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  function spread(count, intervalMins) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(mins(start + i * intervalMins));
    return out;
  }

  if (f.includes("once") || f.includes("once daily"))           return [firstTime];
  if (f.includes("twice") || f === "twice daily")               return spread(2, 12 * 60);
  if (f.includes("three"))                                       return spread(3, 8 * 60);
  if (f.includes("four"))                                        return spread(4, 6 * 60);
  if (f.includes("every 4"))                                     return spread(6, 4 * 60);
  if (f.includes("every 6"))                                     return spread(4, 6 * 60);
  if (f.includes("every 8"))                                     return spread(3, 8 * 60);
  if (f.includes("every 12"))                                    return spread(2, 12 * 60);
  if (f.includes("morning") && f.includes("night"))             return ["08:00", "21:00"];
  if (f.includes("with meals") || f.includes("after meals") || f.includes("before meals")) return ["08:00", "13:00", "18:30"];
  if (f.includes("bedtime") || f.includes("at bedtime"))        return ["21:00"];
  if (f.includes("weekly") && f.includes("twice"))              return [firstTime]; 
  if (f.includes("weekly") || f.includes("every other"))        return [firstTime];
  if (f.includes("as needed") || f.includes("prn"))             return [firstTime];
  return [firstTime]; 
}


export function dosesPerDay(freq) {
  return freqToTimes(freq).length;
}


export function getMedTimes(med) {
  if (Array.isArray(med.times) && med.times.length > 0) return med.times;
  return freqToTimes(med.freq, med.time || "08:00");
}


export function timeToMins(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return h * 60 + (m || 0);
}


export function fmt12(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}


export function doseStatus(hhmm, taken, now = new Date()) {
  if (taken) return "taken";
  const scheduledMins = timeToMins(hhmm);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (nowMins > scheduledMins + 30) return "missed";
  return "pending";
}

