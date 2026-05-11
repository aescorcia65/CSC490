import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Pill,
  Loader2,
  Flame,
  TrendingUp,
  Trophy,
  Info,
  Sparkles,
  Lightbulb,
  ChevronRight,
  ChevronDown,
  Calendar,
  LineChart,
  X,
} from "lucide-react";
import { supabase } from "../../supabase";
import { COLS } from "../../lib/constants";
import { useIsMobile } from "../../hooks/useIsMobile";
import Ring from "../../components/common/Ring";
import { expandDoseTimesForToday } from "../../lib/medScheduleGroups";
import {
  getDailyAdherence,
  getAdherenceStreak,
  getMedicationAdherence,
  getBestAdherenceStreak,
  getWeekStart,
  localDateStr,
  doseRowLogged,
} from "../../lib/adherence";
import { openExternalLink } from "../../lib/openExternalLink";

const ACCENT = "var(--pl)";
const PAGE_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

const MED_ROW_COLORS = ["blue", "rose", "cyan", "emerald", "amber"];

const ADHERENCE_TIP_RESOURCES = [
  {
    text: "Take medications at the same time daily",
    href: "https://www.nia.nih.gov/health/medicines-and-medication-management/taking-medicines-safely-you-age",
  },
  {
    text: "Use reminders to stay on track",
    href: "https://www.fda.gov/drugs/information-consumers-and-patients-drugs/find-information-about-drug",
  },
  {
    text: "Keep your medications with you when traveling",
    href: "https://www.nia.nih.gov/health/safe-use-medicines-older-adults",
  },
  {
    text: "Mark doses as taken right after you take them",
    href: "https://www.ncbi.nlm.nih.gov/books/NBK361023/",
  },
];

const LEARN_MORE_INSIGHTS_HREF = "https://www.fda.gov/drugs/resources-drugs/information-consumers-and-patients-drugs";
const LEARN_MORE_MORE_TIPS_HREF = "https://medlineplus.gov/druginformation.html";

function externalLinkProps(url) {
  return {
    href: url,
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: (e) => {
      e.preventDefault();
      void openExternalLink(url);
    },
  };
}

function countTodayDoses(meds) {
  let total = 0;
  let taken = 0;
  for (const m of meds) {
    const slots = expandDoseTimesForToday(m);
    if (!slots.length) continue;
    total += slots.length;
    for (const s of slots) {
      if (doseRowLogged(m, s)) taken += 1;
    }
  }
  return { total, taken };
}

function statusLabel(pct) {
  if (pct >= 80) return { text: "Good", color: "var(--gr)" };
  if (pct >= 50) return { text: "Fair", color: "var(--am)" };
  return { text: "Needs improvement", color: "var(--ro)" };
}

function weekDayLabels() {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

const DAY_FULL_NAME = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

function buildWeekChartRows(weekStart, dailyRows, todayPct, todayStr) {
  const byDate = Object.fromEntries(
    (dailyRows || []).map((d) => {
      const k = typeof d.log_date === "string" ? d.log_date.slice(0, 10) : localDateStr(d.log_date);
      return [k, Math.round(Number(d.adherence_pct) || 0)];
    })
  );
  const labels = weekDayLabels();
  const out = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(weekStart);
    dt.setDate(weekStart.getDate() + i);
    const key = localDateStr(dt);
    const isToday = key === todayStr;
    const v = isToday ? todayPct : (byDate[key] ?? 0);
    out.push({
      key,
      d: labels[i],
      v,
      isToday,
    });
  }
  return out;
}

export default function AnalyticsPage({ meds, userId, onNavigateTab }) {
  const isMob = useIsMobile();
  const t1 = "var(--t1)";
  const t2 = "var(--t2)";
  const t3 = "var(--t3)";

  const [chartData, setChartData] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState({ days: 0, endDate: null });
  const [medAdherence, setMedAdherence] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [histEntries, setHistEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("week");
  const [medSort, setMedSort] = useState("high");
  const [hoverBar, setHoverBar] = useState(null);

  const taken = meds.filter((m) => m.taken).length;
  const todayPct = meds.length ? Math.round((taken / meds.length) * 100) : 0;
  const { total: doseTotal, taken: doseTaken } = useMemo(() => countTodayDoses(meds), [meds]);

  const openHealthProgressHistory = useCallback(async () => {
    setHistoryOpen(true);
    if (!userId) {
      setHistEntries([]);
      return;
    }
    setHistLoading(true);
    try {
      const [{ data: logRows }, { data: apptRows }] = await Promise.all([
        supabase.from("medication_logs").select("*").eq("user_id", userId).order("taken_at", { ascending: false }).limit(160),
        supabase.from("appointments").select("date,time,type,status,notes,created_at").eq("patient_id", userId).order("created_at", { ascending: false }).limit(100),
      ]);
      const names = {};
      meds.forEach((m) => {
        if (m?.id) names[m.id] = m.name || "Medication";
      });
      const doseParts = (logRows || []).map((row) => ({
        kind: "dose",
        ts: new Date(row.taken_at || `${row.scheduled_date}T12:00:00`).getTime(),
        meta: {
          outcome: row.outcome || "logged",
          slot: row.dose_slot,
          medicationName: names[row.medication_id] || "Medication",
          scheduled_date: row.scheduled_date,
        },
      }));
      const visitParts = (apptRows || []).map((row) => {
        const iso = row.created_at || `${row.date}T${String(row.time || "12:00:00").slice(0, 8)}`;
        return {
          kind: "visit",
          ts: new Date(iso).getTime(),
          meta: { ...row },
        };
      });
      const merged = [...doseParts, ...visitParts].sort((a, b) => b.ts - a.ts);
      setHistEntries(merged);
    } finally {
      setHistLoading(false);
    }
  }, [userId, meds]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const today = new Date();
      const todayStr = localDateStr(today);
      const weekStart = getWeekStart();
      const weekSunday = new Date(weekStart);
      weekSunday.setDate(weekStart.getDate() + 6);
      weekSunday.setHours(23, 59, 59, 999);

      let dailyStart;
      let dailyEnd;
      if (range === "week") {
        dailyStart = weekStart;
        dailyEnd = weekSunday;
      } else {
        dailyStart = new Date();
        dailyStart.setDate(dailyStart.getDate() - 29);
        dailyStart.setHours(0, 0, 0, 0);
        dailyEnd = today;
      }

      const medRangeStart = range === "week" ? weekStart : dailyStart;
      const medRangeEnd = today;

      const [daily, str, perMed, best] = await Promise.all([
        getDailyAdherence(userId, dailyStart, dailyEnd),
        getAdherenceStreak(userId),
        getMedicationAdherence(userId, medRangeStart, medRangeEnd),
        getBestAdherenceStreak(userId),
      ]);

      if (cancelled) return;

      let rows;
      if (range === "week") {
        rows = buildWeekChartRows(weekStart, daily, todayPct, todayStr);
      } else {
        rows = (daily || []).map((d) => {
          const logDate = typeof d.log_date === "string" ? d.log_date.slice(0, 10) : localDateStr(d.log_date);
          return {
            d: new Date(`${logDate}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
            v: logDate === todayStr ? todayPct : Math.round(Number(d.adherence_pct) || 0),
            isToday: logDate === todayStr,
            key: logDate,
          };
        });
      }

      setChartData(rows);
      setStreak(str);
      setBestStreak(best);
      setMedAdherence(perMed || []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, todayPct, range]);

  const avg = chartData.length ? Math.round(chartData.reduce((s, w) => s + w.v, 0) / chartData.length) : 0;

  const sortedMeds = useMemo(() => {
    const list = [...medAdherence];
    list.sort((a, b) => (medSort === "high" ? b.adherence_pct - a.adherence_pct : a.adherence_pct - b.adherence_pct));
    return list;
  }, [medAdherence, medSort]);

  const medDetailById = useMemo(() => Object.fromEntries(meds.map((m) => [m.id, m])), [meds]);

  const prevAvgForInsight = useMemo(() => {
    if (range !== "week") return null;
    const weekStart = getWeekStart();
    const prevWeekEnd = new Date(weekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    const prevWeekStart = new Date(prevWeekEnd);
    prevWeekStart.setDate(prevWeekStart.getDate() - 6);
    return { prevWeekStart, prevWeekEnd };
  }, [range]);

  const [prevWeekAvgVal, setPrevWeekAvgVal] = useState(null);

  useEffect(() => {
    if (!userId || range !== "week" || !prevAvgForInsight) {
      setPrevWeekAvgVal(null);
      return;
    }
    let cancelled = false;
    getDailyAdherence(userId, prevAvgForInsight.prevWeekStart, prevAvgForInsight.prevWeekEnd).then((pd) => {
      if (cancelled || !pd?.length) {
        if (!cancelled) setPrevWeekAvgVal(0);
        return;
      }
      const v = Math.round(pd.reduce((s, d) => s + (Number(d.adherence_pct) || 0), 0) / pd.length);
      if (!cancelled) setPrevWeekAvgVal(v);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, range, prevAvgForInsight]);

  const insights = useMemo(() => {
    const out = [];
    if (range === "week" && chartData.length >= 3) {
      let bestI = 0;
      let bestV = -1;
      chartData.forEach((w, i) => {
        if (w.v > bestV) {
          bestV = w.v;
          bestI = i;
        }
      });
      if (bestV > 0) {
        const label = DAY_FULL_NAME[chartData[bestI].d] || chartData[bestI].d;
        out.push(`Your adherence is highest on ${label}s. Keep it up!`);
      }
    }
    out.push("You tend to miss doses in the evening. Try setting a reminder.");
    if (range === "week" && prevWeekAvgVal != null && avg > prevWeekAvgVal) {
      out.push(`You've improved ${avg - prevWeekAvgVal}% compared to last week. Awesome progress!`);
    } else if (range === "week" && prevWeekAvgVal != null && prevWeekAvgVal > avg) {
      out.push("Last week was stronger — small habits add up. You've got this.");
    } else if (out.length < 3) {
      out.push("Consistency beats perfection — log doses when you can.");
    }
    return out.slice(0, 3);
  }, [range, chartData, avg, prevWeekAvgVal]);

  const todayBadge =
    todayPct >= 80
      ? { t: "Excellent! ", bg: "rgba(22,163,74,.12)", c: "#15803d" }
      : todayPct >= 40
        ? { t: "Great start! ", bg: "rgba(22,163,74,.12)", c: "#15803d" }
        : todayPct > 0
          ? { t: "Keep going ", bg: "rgba(234,179,8,.15)", c: "#a16207" }
          : { t: "Log your first dose", bg: "rgba(59,130,246,.1)", c: ACCENT };

  const weekAvgBadge =
    avg >= 80
      ? { t: "On track ", bg: "rgba(22,163,74,.12)", c: "#15803d" }
      : avg >= 40
        ? { t: "Keep it up ", bg: "rgba(234,179,8,.18)", c: "#a16207" }
        : { t: "Room to grow", bg: "rgba(239,68,68,.1)", c: "#b91c1c" };

  const streakBadge =
    streak > 0
      ? { t: `${streak} day streak!`, bg: "rgba(22,163,74,.12)", c: "#15803d" }
      : { t: "Start a new streak!", bg: "rgba(239,68,68,.12)", c: "#b91c1c" };

  const bestBadge =
    bestStreak.days > 0
      ? { t: "New record! ", bg: "rgba(22,163,74,.12)", c: "#15803d" }
      : { t: "Build your record", bg: "rgba(100,116,139,.12)", c: t3 };

  const bestStreakDateLabel = bestStreak.endDate
    ? new Date(`${bestStreak.endDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const streakRingPct = Math.min(100, streak > 0 ? Math.max(15, streak * 14) : 8);
  const bestRingPct = Math.min(100, bestStreak.days > 0 ? Math.max(20, bestStreak.days * 10) : 10);

  const cardBase = {
    background: "var(--s1)",
    borderRadius: 18,
    boxShadow: "var(--shadow-card)",
    border: "1px solid var(--b1)",
  };

  if (loading) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 64 }}>
        <Loader2 size={24} className="auth-spin" style={{ color: ACCENT }} />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
        touchAction: "pan-y",
        fontFamily: PAGE_FONT,
        background: "linear-gradient(180deg, var(--bg) 0%, var(--bg2) 100%)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "28px 24px 48px" }}>
        {/* Header */}
        <motion.div
          className="au"
          style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "var(--pd)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LineChart size={22} color={ACCENT} strokeWidth={2.2} />
            </div>
            <div>
              <h2 style={{ color: t1, fontSize: isMob ? 22 : 26, fontWeight: 700, margin: 0, letterSpacing: "-.02em" }}>Analytics</h2>
              <p style={{ color: t3, fontSize: 14, margin: "6px 0 0", lineHeight: 1.5, maxWidth: 420 }}>
                Track your adherence. Build better habits.
              </p>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 0,
              padding: 4,
              borderRadius: 999,
              background: "var(--s1)",
              border: "1px solid var(--b1)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            {[
              { id: "week", label: "Weekly" },
              { id: "month", label: "Monthly" },
            ].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setRange(b.id)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  background: range === b.id ? ACCENT : "transparent",
                  color: range === b.id ? "#fff" : t2,
                  transition: "background .15s, color .15s",
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Summary cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMob ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
            gap: 14,
            marginBottom: 20,
          }}
        >
          {[
            {
              key: "today",
              ring: (
                <Ring pct={todayPct} size={76} sw={5} color={ACCENT} trackColor="#e2e8f0">
                  <span style={{ color: t1, fontSize: 15, fontWeight: 700 }}>{todayPct}%</span>
                </Ring>
              ),
              title: "Today Adherence",
              badge: todayBadge,
              spark: chartData.map((w) => w.v),
            },
            {
              key: "week",
              ring: (
                <Ring pct={avg} size={76} sw={5} color="#22c55e" trackColor="#e2e8f0">
                  <span style={{ color: t1, fontSize: 15, fontWeight: 700 }}>{avg}%</span>
                </Ring>
              ),
              title: range === "week" ? "Week average Adherence" : "Month average Adherence",
              badge: weekAvgBadge,
              spark: chartData.map((w) => w.v),
            },
            {
              key: "streak",
              ring: (
                <Ring pct={streakRingPct} size={76} sw={5} color="#f97316" trackColor="#e2e8f0">
                  <Flame size={28} color="#ea580c" />
                </Ring>
              ),
              title: (
                <>
                  <strong style={{ color: t1 }}>{streak} days</strong>
                  <span style={{ color: t3, fontWeight: 500 }}> Current streak</span>
                </>
              ),
              badge: streakBadge,
              dots: true,
            },
            {
              key: "best",
              ring: (
                <Ring pct={bestRingPct} size={76} sw={5} color="#a855f7" trackColor="#e2e8f0">
                  <Trophy size={26} color="#9333ea" />
                </Ring>
              ),
              title: (
                <>
                  <strong style={{ color: t1 }}>{bestStreak.days} days</strong>
                  <span style={{ color: t3, fontWeight: 500 }}> Best streak</span>
                </>
              ),
              badge: bestBadge,
              sub: bestStreakDateLabel ? `Achieved on ${bestStreakDateLabel}` : null,
            },
          ].map((s) => (
            <motion.div
              key={s.key}
              className="au"
              style={{ ...cardBase, padding: 18, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}
            >
              {s.ring}
              <p style={{ color: t2, fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.35 }}>{s.title}</p>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: s.badge.bg,
                  color: s.badge.c,
                }}
              >
                {s.badge.t}
              </span>
              {s.sub && (
                <p style={{ margin: 0, fontSize: 11, color: t3 }}>{s.sub}</p>
              )}
              {s.spark && (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22, marginTop: 4 }}>
                  {s.spark.slice(0, 7).map((v, i) => (
                    <div
                      key={i}
                      style={{
                        width: 4,
                        height: `${Math.max(15, v)}%`,
                        minHeight: 3,
                        borderRadius: 2,
                        background: s.key === "today" ? ACCENT : "#22c55e",
                        opacity: 0.35 + (i / 14),
                      }}
                    />
                  ))}
                </div>
              )}
              {s.dots && (
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ width: 5, height: 5, borderRadius: 99, background: i === 0 ? ACCENT : "#cbd5e1" }} />
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Daily chart */}
        <motion.div className="au" style={{ ...cardBase, padding: 0, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "20px 22px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ color: t1, fontSize: 16, fontWeight: 700, margin: 0 }}>Daily adherence</h3>
              <Info size={16} color={t3} style={{ opacity: 0.7 }} aria-hidden />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ color: ACCENT, fontSize: 14, fontWeight: 700 }}>{avg}% avg</span>
              <label style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  style={{
                    appearance: "none",
                    padding: "8px 32px 8px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--b1)",
                    background: "var(--s2)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 600,
                    color: t2,
                    cursor: "pointer",
                  }}
                >
                  <option value="week">This week</option>
                  <option value="month">Last 30 days</option>
                </select>
                <ChevronDown size={16} color={t3} style={{ position: "absolute", right: 10, pointerEvents: "none" }} />
              </label>
            </div>
          </div>

          <div style={{ padding: "8px 22px 0", position: "relative", minHeight: 220 }}>
            <div style={{ display: "flex", height: 200, gap: range === "month" ? 4 : 8, alignItems: "stretch" }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: 8, flexShrink: 0, width: 36 }}>
                {["100%", "75%", "50%", "25%", "0%"].map((lab) => (
                  <span key={lab} style={{ fontSize: 10, color: t3, fontWeight: 600, textAlign: "right" }}>
                    {lab}
                  </span>
                ))}
              </div>
              <div style={{ flex: 1, position: "relative", borderLeft: "1px dashed rgba(148,163,184,.5)", borderBottom: "1px solid rgba(148,163,184,.4)" }}>
                {[0, 25, 50, 75, 100].map((pct) => (
                  <div
                    key={pct}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: `${pct}%`,
                      borderTop: "1px dashed rgba(226,232,240,.9)",
                      pointerEvents: "none",
                    }}
                  />
                ))}
                <div style={{ display: "flex", gap: range === "month" ? 3 : 6, height: "100%", alignItems: "flex-end", padding: "0 6px 0 10px" }}>
                  {chartData.length === 0 ? (
                    <p style={{ color: t3, fontSize: 13, margin: "auto" }}>No data in this range yet.</p>
                  ) : (
                    chartData.map((w, i) => (
                      <div
                        key={w.key}
                        style={{
                          flex: range === "month" ? "0 0 18px" : 1,
                          minWidth: range === "month" ? 18 : 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          height: "100%",
                          position: "relative",
                        }}
                        onMouseEnter={() => setHoverBar(i)}
                        onMouseLeave={() => setHoverBar(null)}
                      >
                        {hoverBar === i && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: `calc(${Math.max(4, w.v)}% + 8px)`,
                              left: "50%",
                              transform: "translateX(-50%)",
                              background: ACCENT,
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 700,
                              padding: "6px 10px",
                              borderRadius: 8,
                              whiteSpace: "nowrap",
                              zIndex: 2,
                              boxShadow: "0 4px 12px rgba(0,82,255,.25)",
                            }}
                          >
                            {w.v}%
                          </div>
                        )}
                        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                          <motion.div
                            style={{
                              width: "100%",
                              borderRadius: "8px 8px 4px 4px",
                              background: w.isToday ? ACCENT : "#fb923c",
                              boxShadow: w.isToday ? "0 6px 16px rgba(0,82,255,.28)" : "none",
                            }}
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.max(3, w.v)}%` }}
                            transition={{ duration: 0.5, delay: range === "month" ? 0.01 * (i % 30) : 0.05 * i }}
                          />
                        </div>
                        <span
                          style={{
                            color: w.isToday ? ACCENT : t3,
                            fontSize: range === "month" ? 8 : 11,
                            fontWeight: w.isToday ? 700 : 600,
                            marginTop: 8,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {w.d}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              margin: 16,
              marginTop: 8,
              padding: "14px 18px",
              borderRadius: 14,
              background: "linear-gradient(90deg, rgba(0,82,255,.08), rgba(0,82,255,.04))",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Calendar size={20} color={ACCENT} />
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t1 }}>
                  You took {doseTaken} of {doseTotal || "—"} doses today
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: t3 }}>
                  {doseTotal > doseTaken ? `${doseTotal - doseTaken} dose${doseTotal - doseTaken === 1 ? "" : "s"} remaining` : doseTotal ? "All scheduled doses logged" : "Add medications to track doses"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab?.("medications")}
              style={{
                border: "none",
                background: "transparent",
                color: ACCENT,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              View today&apos;s schedule <ChevronRight size={16} />
            </button>
          </div>
        </motion.div>

        {/* By medication */}
        <motion.div className="au" style={{ ...cardBase, padding: "20px 22px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ color: t1, fontSize: 16, fontWeight: 700, margin: 0 }}>By medication</h3>
            <label style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <select
                value={medSort}
                onChange={(e) => setMedSort(e.target.value)}
                style={{
                  appearance: "none",
                  padding: "8px 30px 8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--b1)",
                  background: "var(--s2)",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 600,
                  color: t2,
                  cursor: "pointer",
                }}
              >
                <option value="high">Adherence (High to Low)</option>
                <option value="low">Adherence (Low to High)</option>
              </select>
              <ChevronDown size={15} color={t3} style={{ position: "absolute", right: 8, pointerEvents: "none" }} />
            </label>
          </div>
          {sortedMeds.length === 0 && meds.length === 0 && <p style={{ color: t3, fontSize: 14 }}>No medications added yet.</p>}
          {sortedMeds.length === 0 && meds.length > 0 && <p style={{ color: t3, fontSize: 14 }}>No adherence data in this range yet.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {sortedMeds.map((med, i) => {
              const colKey = med.color && COLS[med.color] ? med.color : MED_ROW_COLORS[i % MED_ROW_COLORS.length];
              const col = COLS[colKey] || COLS.blue;
              const st = statusLabel(med.adherence_pct);
              const um = medDetailById[med.medication_id];
              const subtitle = [um?.dosage, um?.freq && !/^once daily$/i.test(String(um.freq).trim()) ? um.freq : null].filter(Boolean).join(" · ") || "—";
              return (
                <button
                  key={med.medication_id}
                  type="button"
                  onClick={() => onNavigateTab?.("medications", med.medication_id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 4px",
                    border: "none",
                    borderTop: i === 0 ? "none" : "1px solid rgba(226,232,240,.9)",
                    background: "transparent",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: col.d,
                      border: `1px solid ${col.b}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Pill size={18} color={col.a} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t1 }}>{med.medication_name}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: t3 }}>{subtitle}</p>
                    <div style={{ marginTop: 10, height: 8, borderRadius: 99, overflow: "hidden", background: "#e2e8f0" }}>
                      <motion.div
                        style={{ height: "100%", borderRadius: 99, background: col.a }}
                        initial={{ width: 0 }}
                        animate={{ width: `${med.adherence_pct}%` }}
                        transition={{ duration: 0.6, delay: 0.04 * i }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: st.color }}>
                      {med.adherence_pct}% {st.text}
                    </span>
                    <ChevronRight size={18} color={t3} />
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>


        {/* Footer CTA */}
        <motion.div
          className="au"
          style={{
            ...cardBase,
            padding: "20px 24px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            background: "linear-gradient(135deg, var(--pd) 0%, var(--s2) 48%, var(--s1) 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "var(--pd)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Calendar size={24} color={ACCENT} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t1 }}>Track your progress over time</p>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: t3 }}>Consistency is key to better health outcomes.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void openHealthProgressHistory()}
            style={{
              padding: "12px 22px",
              borderRadius: 12,
              border: "none",
              background: ACCENT,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "var(--shadow-card)",
            }}
          >
            View full history <ChevronRight size={18} />
          </button>
        </motion.div>

        {historyOpen ? (
          <div
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "rgba(15,23,42,.52)",
              display: "flex",
              alignItems: "stretch",
              justifyContent: "center",
              padding: isMob ? 12 : 24,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setHistoryOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="health-progress-history-title"
              style={{
                ...cardBase,
                width: "100%",
                maxWidth: 620,
                maxHeight: isMob ? "92vh" : "88vh",
                marginTop: "auto",
                marginBottom: "auto",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: 0,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: "16px 18px",
                  borderBottom: "1px solid var(--b1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: "var(--pd)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Calendar size={20} color={ACCENT} />
                  <h2 id="health-progress-history-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t1 }}>
                    Health Progress History
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close history"
                  onClick={() => setHistoryOpen(false)}
                  style={{
                    border: `1px solid var(--b1)`,
                    background: "var(--s1)",
                    borderRadius: 10,
                    width: 36,
                    height: 36,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    color: t2,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px 18px" }}>
                {histLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: 32 }}>
                    <Loader2 size={22} className="auth-spin" style={{ color: ACCENT }} /> <span style={{ color: t3 }}>Loading timeline…</span>
                  </div>
                ) : histEntries.length === 0 ? (
                  <p style={{ color: t3, margin: 0, lineHeight: 1.55 }}>No medication logs or appointments found yet.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                    {histEntries.map((e, idx) =>
                      e.kind === "dose" ? (
                        <li
                          key={`dose-${e.meta.scheduled_date}-${e.meta.slot}-${idx}`}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 12,
                            border: "1px solid var(--b1)",
                            background: "var(--s2)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT, letterSpacing: "0.04em", textTransform: "uppercase" }}>Medication</span>
                            <span style={{ fontSize: 11, color: t3 }}>{new Date(e.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 600, color: t1 }}>{e.meta.medicationName}</p>
                          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: t3, lineHeight: 1.45 }}>
                            Status:{" "}
                            <span style={{ color: t1, fontWeight: 600 }}>{String(e.meta.outcome || "logged")}</span>
                            {e.meta.slot ? ` · scheduled slot ${String(e.meta.slot)}` : ""}
                            {e.meta.scheduled_date ? ` · day ${String(e.meta.scheduled_date)}` : ""}
                          </p>
                        </li>
                      ) : (
                        <li
                          key={`visit-${e.meta.date}-${idx}`}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 12,
                            border: "1px solid var(--b1)",
                            background: "var(--s2)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#059669", letterSpacing: "0.04em", textTransform: "uppercase" }}>Visit</span>
                            <span style={{ fontSize: 11, color: t3 }}>{new Date(e.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 600, color: t1 }}>
                            {(e.meta.type || "Appointment") + (e.meta.status ? ` · ${String(e.meta.status)}` : "")}
                          </p>
                          {e.meta.notes ? (
                            <p style={{ margin: "6px 0 0", fontSize: 13, color: t2, lineHeight: 1.45 }}>
                              <span style={{ color: t3, fontWeight: 600 }}>Reason:</span> {String(e.meta.notes)}
                            </p>
                          ) : null}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </div>

              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--b1)", background: "var(--s1)" }}>
                <button
                  type="button"
                  className="btn"
                  style={{ width: "100%", padding: "11px", borderRadius: 11, fontWeight: 600 }}
                  onClick={() => setHistoryOpen(false)}
                >
                  Back to Analytics
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
