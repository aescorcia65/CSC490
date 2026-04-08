import { useCallback } from "react";
import { motion } from "framer-motion";
import { Calendar, Pill, Pencil, Trash2 } from "lucide-react";
import { COLS } from "../../lib/constants";
import { to12h } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { logMedicationTaken, unlogMedicationTaken } from "../../lib/adherence";

export default function SchedulePage({ meds, setMeds, onEdit, onDelete, userId }) {
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t3 = "var(--t3)";
  const sorted = [...meds].sort((a, b) => a.time.localeCompare(b.time));

  const toggle = useCallback(async (id) => {
    const med = meds.find(m => m.id === id);
    if (!med) return;
    const wasTaken = med.taken;
    setMeds(ms => ms.map(m => m.id === id ? { ...m, taken: !m.taken } : m));
    if (userId) {
      if (wasTaken) await unlogMedicationTaken(userId, id);
      else await logMedicationTaken(userId, id);
    }
  }, [meds, userId, setMeds]);
  const periods = [
    { l: "Morning", r: "6 AM – 12 PM", fn: m => m.time >= "06:00" && m.time < "12:00" },
    { l: "Afternoon", r: "12 PM – 5 PM", fn: m => m.time >= "12:00" && m.time < "17:00" },
    { l: "Evening", r: "5 PM – 9 PM", fn: m => m.time >= "17:00" && m.time < "21:00" },
    { l: "Night", r: "9 PM onwards", fn: m => m.time >= "21:00" || m.time < "06:00" },
  ];
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "26px 22px 44px" }}>
        <motion.div className="au" style={{ marginBottom: 26 }}>
          <h2 style={{ color: t1, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, letterSpacing: "-.3px" }}>Schedule</h2>
          <p style={{ color: t3, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>Your medications organised by time of day.</p>
        </motion.div>
        {periods.map((p, pi) => {
          const list = sorted.filter(p.fn);
          if (!list.length) return null;
          return (
            <motion.div key={p.l} className="au" style={{ animationDelay: `${pi * .07}s`, marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
                <span style={{ color: t1, fontSize: 13, fontWeight: 600 }}>{p.l}</span>
                <span style={{ color: t3, fontSize: 12 }}>· {p.r}</span>
                <span style={{ marginLeft: "auto", color: t3, fontSize: 11 }}>{list.filter(m => m.taken).length}/{list.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {list.map(med => {
                  const col = COLS[med.color] || COLS.blue;
                  return (
                    <div key={med.id} className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col.a, borderRadius: "18px 0 0 18px" }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: col.a, width: isMob ? 46 : 54, marginLeft: 6, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{to12h(med.time)}</span>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: col.d, border: `1px solid ${col.b}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Pill size={14} color={col.a} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: t1, fontSize: 13, fontWeight: 600 }}>{med.name}</p>
                        <p style={{ color: t3, fontSize: 11, marginTop: 1 }}>{med.dosage} · {med.freq}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        <span className="hidden sm:flex items-center gap-1.5">
                          <button onClick={() => onEdit && onEdit(med)} title="Edit" style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--b1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--p)"; e.currentTarget.style.color = "var(--p)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.color = t3; }}><Pencil size={12} /></button>
                          <button onClick={() => onDelete && onDelete(med.id)} title="Delete" style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--b1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ro)"; e.currentTarget.style.color = "var(--ro)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.color = t3; }}><Trash2 size={12} /></button>
                        </span>
                        <button className="whitespace-nowrap" onClick={() => toggle(med.id)} style={{ padding: "5px 14px", borderRadius: 99, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", transition: "all .18s", background: med.taken ? "rgba(16,185,129,.12)" : "var(--s2)", color: med.taken ? "var(--gr)" : "var(--t3)" }}>
                          {med.taken ? "Taken ✓" : "Mark taken"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
        {meds.length === 0 && (
          <div className="card au" style={{ padding: 64, textAlign: "center" }}>
            <Calendar size={28} color={t3} style={{ margin: "0 auto 10px", opacity: .18, display: "block" }} />
            <p style={{ color: t3, fontSize: 13 }}>No medications in your schedule yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
