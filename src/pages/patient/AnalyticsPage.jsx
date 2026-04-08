import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Pill, Loader2 } from "lucide-react";
import { COLS } from "../../lib/constants";
import { useIsMobile } from "../../hooks/useIsMobile";
import Ring from "../../components/common/Ring";
import { getDailyAdherence, getAdherenceStreak, getMedicationAdherence, getWeekStart, dayLabel } from "../../lib/adherence";

export default function AnalyticsPage({ meds, userId }) {
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)";

  const [weekData, setWeekData] = useState([]);
  const [streak, setStreak] = useState(0);
  const [medAdherence, setMedAdherence] = useState([]);
  const [loading, setLoading] = useState(true);

  const taken = meds.filter(m => m.taken).length;
  const todayPct = meds.length ? Math.round(taken / meds.length * 100) : 0;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const weekStart = getWeekStart();
      const today = new Date();

      const [daily, str, perMed] = await Promise.all([
        getDailyAdherence(userId, weekStart, today),
        getAdherenceStreak(userId),
        getMedicationAdherence(userId, weekStart, today),
      ]);

      if (cancelled) return;

      // Build week array from DB data, override today with live pct
      const todayStr = today.toISOString().slice(0, 10);
      const week = (daily || []).map(d => ({
        d: dayLabel(d.log_date),
        v: d.log_date === todayStr ? todayPct : d.adherence_pct,
        isToday: d.log_date === todayStr,
      }));
      setWeekData(week);
      setStreak(str);
      setMedAdherence(perMed || []);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [userId, todayPct]);

  const avg = weekData.length
    ? Math.round(weekData.reduce((s, w) => s + w.v, 0) / weekData.length)
    : 0;

  const streakMax = 30; // ring fills at 30-day streak
  const streakPct = Math.min(Math.round((streak / streakMax) * 100), 100);

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 64 }}>
        <Loader2 size={24} className="auth-spin" style={{ color: "var(--p)" }} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "26px 22px 44px" }}>
        <motion.div className="au" style={{ marginBottom: 26 }}>
          <h2 style={{ color: t1, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, letterSpacing: "-.3px" }}>Analytics</h2>
          <p style={{ color: t3, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>Track how consistently you stay on schedule.</p>
        </motion.div>

        {/* Summary rings */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 13 }}>
          {[
            { l: "Today", v: `${todayPct}%`, p: todayPct, c: "var(--p)" },
            { l: "Weekly avg", v: `${avg}%`, p: avg, c: "var(--tl)" },
            { l: "Streak", v: `${streak} day${streak !== 1 ? "s" : ""}`, p: streakPct, c: "var(--am)" },
          ].map((s, i) => (
            <motion.div key={s.l} className={`au card d${i + 1}`} style={{ padding: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
              <Ring pct={s.p} size={66} sw={5} color={s.c}>
                <span style={{ color: t1, fontSize: 11, fontWeight: 700 }}>{s.v}</span>
              </Ring>
              <p style={{ color: t3, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>{s.l}</p>
            </motion.div>
          ))}
        </div>

        {/* Weekly bar chart */}
        <motion.div className="au d3 card" style={{ padding: 22, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
            <h3 style={{ color: t1, fontSize: 14, fontWeight: 600 }}>Weekly Overview</h3>
            <span style={{ color: t3, fontSize: 11 }}>{avg}% average</span>
          </div>
          <div style={{ display: "flex", gap: 6, height: isMob ? 80 : 100, alignItems: "flex-end" }}>
            {weekData.length === 0 ? (
              <p style={{ color: t3, fontSize: 12, margin: "auto" }}>No data for this week yet.</p>
            ) : (
              weekData.map((w, i) => (
                <div key={w.d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                    <motion.div
                      style={{
                        width: "100%",
                        borderRadius: "6px 6px 3px 3px",
                        background: w.isToday
                          ? "linear-gradient(180deg,var(--p),var(--tl))"
                          : "var(--s2)",
                        boxShadow: w.isToday ? "0 0 14px rgba(37,99,235,.22)" : "none",
                      }}
                      initial={{ height: 0 }}
                      animate={{ height: `${w.v}%` }}
                      transition={{ duration: .7, delay: .07 * i }}
                    />
                  </div>
                  <span style={{ color: t3, fontSize: 9, fontWeight: 600 }}>{w.d}</span>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Per-medication adherence */}
        <motion.div className="au d4 card" style={{ padding: 22 }}>
          <h3 style={{ color: t1, fontSize: 14, fontWeight: 600, marginBottom: 16 }}>By Medication</h3>
          {medAdherence.length === 0 && meds.length === 0 && (
            <p style={{ color: t3, fontSize: 13 }}>No medications added yet.</p>
          )}
          {medAdherence.length === 0 && meds.length > 0 && (
            <p style={{ color: t3, fontSize: 13 }}>No adherence data recorded yet. Start marking medications as taken to see stats here.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {medAdherence.map((med, i) => {
              const col = COLS[med.color] || COLS.blue;
              return (
                <div key={med.medication_id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: col.d, border: `1px solid ${col.b}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Pill size={12} color={col.a} />
                  </div>
                  <span style={{ color: t2, fontSize: 12, fontWeight: 600, width: isMob ? 60 : 82, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {med.medication_name}
                  </span>
                  <div style={{ flex: 1, height: 5, borderRadius: 99, overflow: "hidden", background: "var(--b0)" }}>
                    <motion.div
                      style={{ height: "100%", borderRadius: 99, background: col.a }}
                      initial={{ width: 0 }}
                      animate={{ width: `${med.adherence_pct}%` }}
                      transition={{ duration: .7, delay: .07 * i }}
                    />
                  </div>
                  <span style={{
                    color: med.adherence_pct >= 80 ? "var(--gr)" : med.adherence_pct >= 40 ? "var(--am)" : "var(--t3)",
                    fontSize: 11, fontWeight: 700, width: 32, textAlign: "right",
                  }}>
                    {med.adherence_pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
