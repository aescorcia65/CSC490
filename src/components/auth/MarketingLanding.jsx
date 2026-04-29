import { useEffect, useLayoutEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useInView, useScroll, useTransform } from "framer-motion";
import {
  Bell, Pill, MessageSquareText, CalendarClock, Activity,
  LayoutDashboard, TrendingUp, Settings, ArrowRight, ChevronDown,
  Sun, Moon, Clock, Calendar, Plus, MessageCircle, Stethoscope,
  CheckCircle2, Flame, Utensils, Sparkles,
} from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import MedTrackHeartLogo from "./MedTrackHeartLogo";
import FloatingPillMascot from "./FloatingPillMascot";
import MarketingSiteHeader from "./MarketingSiteHeader";
import PortalPreviewCards from "./PortalPreviewCards";

const font = "'Inter',system-ui,-apple-system,sans-serif";
const gradBtn = "linear-gradient(90deg,#1D4ED8 0%,#2563EB 42%,#0EA5E9 100%)";

const HERO_ROTATING_WORDS = ["beautifully", "safely", "smartly"];

const WALKTHROUGH_CARDS = [
  { I: Bell, title: "Smart Medication Reminders", desc: "Never miss a dose with clear, timely reminder flows." },
  { I: Sparkles, title: "AI Health Guidance", desc: "Get practical, personalized support for day-to-day care questions." },
  { I: Pill, title: "Refill Tracking", desc: "See refill status quickly and stay ahead of medication gaps." },
  { I: MessageSquareText, title: "Secure Doctor and Pharmacist Messaging", desc: "Communicate with care teams in one secure, connected space." },
  { I: CalendarClock, title: "Appointment Tracking", desc: "Keep visits organized with simple scheduling and follow-up visibility." },
  { I: Activity, title: "Adherence Progress", desc: "Track routine consistency and understand trends over time." },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Create Your Profile", desc: "Set up your account and choose your care role in minutes." },
  { step: "02", title: "Manage Meds & Appointments", desc: "Add medications, schedules, refills, and visits in one dashboard." },
  { step: "03", title: "Get Reminders & Support", desc: "Receive timely nudges and fast guidance when you need it." },
];

const PORTAL_PREVIEWS = [
  { I: Activity, title: "Patient Portal", desc: "Track medications, reminders, refills, and care updates daily." },
  { I: Stethoscope, title: "Doctor Portal", desc: "Review patient activity, coordinate care, and message quickly." },
  { I: Pill, title: "Pharmacist Portal", desc: "Monitor refill flow and communicate with patients efficiently." },
];

/** Three benefit highlights — same card layout as “How It Works” (eyebrow + title + body). */
const BENEFITS_HIGHLIGHTS = [
  {
    title: "Schedules & reminders",
    text: "Stay organized with schedules and reminders so fewer doses are missed.",
  },
  {
    title: "One connected dashboard",
    text: "Track refills and health tasks in one connected, professional dashboard.",
  },
  {
    title: "Reach your care team",
    text: "Reach your care team faster and feel more in control of your health.",
  },
];

/** @param {{ variant?: "full" | "hero" }} props */
export default function MarketingLanding({ variant = "full" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [light] = useTheme();
  const [vw, setVw] = useState(() => window.innerWidth);
  const isMob = vw < 760;
  const isTab = vw >= 760 && vw < 1100;
  const showFeatures = variant === "full";
  const heroWordMeasureRef = useRef(null);
  const walkthroughStepRefs = useRef([]);
  const walkthroughStickyRef = useRef(null);
  const walkthroughMascotPivotRef = useRef(null);
  const [heroWordIdx, setHeroWordIdx] = useState(0);
  const [heroWordWidths, setHeroWordWidths] = useState({});
  const [activeWalkthroughIdx, setActiveWalkthroughIdx] = useState(0);
  const [walkthroughReduceMotion, setWalkthroughReduceMotion] = useState(false);

  const benefitsSectionRef = useRef(null);
  const takeControlRef = useRef(null);

  const takeControlInViewIo = useInView(takeControlRef, {
    once: true,
    amount: "some",
    margin: "0px 0px 120px 0px",
  });

  const [takeControlInViewLayout, setTakeControlInViewLayout] = useState(false);

  const peekSectionInViewport = useMemo(() => {
    return (ref, setSeen) => {
      const node = ref.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const H = window.innerHeight;
      if (r.bottom > 0 && r.top < H + 160) setSeen(true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!showFeatures) return;
    peekSectionInViewport(takeControlRef, setTakeControlInViewLayout);
  }, [showFeatures, vw, peekSectionInViewport]);

  useEffect(() => {
    if (!showFeatures) return;
    const onScrollOrResize = () => {
      peekSectionInViewport(takeControlRef, setTakeControlInViewLayout);
    };
    onScrollOrResize();
    requestAnimationFrame(() => requestAnimationFrame(onScrollOrResize));
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    document.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      document.removeEventListener("scroll", onScrollOrResize, { capture: true });
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [showFeatures, peekSectionInViewport]);

  /** CTA animates only when this block is in view (deck step 3). */
  const takeControlSeen = takeControlInViewIo || takeControlInViewLayout;

  const { scrollYProgress: benefitsDeckProgress } = useScroll({
    target: benefitsSectionRef,
    offset: ["start 1", "start 0.38"],
  });
  const portalRowScrollDim = useTransform(benefitsDeckProgress, [0, 1], [1, 0.6]);
  const benefitsDeckRiseY = useTransform(benefitsDeckProgress, [0, 1], [76, 0]);

  const walkSpringConfig = useMemo(
    () =>
      walkthroughReduceMotion
        ? { stiffness: 420, damping: 42, mass: 0.22 }
        : { stiffness: 190, damping: 26, mass: 0.48 },
    [walkthroughReduceMotion],
  );
  const walkAlignY = useMotionValue(0);
  const walkAimX = useMotionValue(typeof window !== "undefined" ? window.innerWidth * 0.7 : 600);
  const walkAimY = useMotionValue(typeof window !== "undefined" ? window.innerHeight * 0.45 : 400);
  const walkYSpring = useSpring(walkAlignY, useMemo(() => ({ ...walkSpringConfig, stiffness: walkSpringConfig.stiffness * 0.92 }), [walkSpringConfig]));

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /** Auth screens set `body { overflow: hidden }`; clear if still stuck so wheel/touch scroll works without focusing the page. */
  useEffect(() => {
    if (document.body.style.overflow === "hidden") {
      document.body.style.removeProperty("overflow");
    }
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setHeroWordIdx((i) => (i + 1) % HERO_ROTATING_WORDS.length);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = heroWordMeasureRef.current;
    if (!el) return;
    const next = {};
    const padX = 12 * 2;
    const borderX = 2;
    const slackX = 8;
    HERO_ROTATING_WORDS.forEach((word) => {
      el.textContent = word;
      next[word] = Math.ceil(el.getBoundingClientRect().width) + padX + borderX + slackX;
    });
    setHeroWordWidths(next);
  }, [isMob, isTab, light]);

  useEffect(() => {
    if (!showFeatures) return;
    const hash = location.hash.replace(/^#/, "");
    if (!hash) return;
    const id = requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [showFeatures, location.hash, location.pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncRm = () => setWalkthroughReduceMotion(mq.matches);
    syncRm();
    mq.addEventListener("change", syncRm);
    return () => mq.removeEventListener("change", syncRm);
  }, []);

  useEffect(() => {
    if (!showFeatures) return;
    let raf = 0;
    const updateWalkthrough = () => {
      const centerY = window.innerHeight * 0.5;
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      walkthroughStepRefs.current.forEach((el, idx) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const dist = Math.abs(mid - centerY);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });

      let nextAlign = 0;
      const cardEl = walkthroughStepRefs.current[bestIdx];
      if (!isMob && walkthroughStickyRef.current && cardEl) {
        const cr = cardEl.getBoundingClientRect();
        const sr = walkthroughStickyRef.current.getBoundingClientRect();
        const cardMid = cr.top + cr.height / 2;
        const anchorMid = sr.top + sr.height * 0.44;
        nextAlign = cardMid - anchorMid;
      }

      if (cardEl) {
        const cr = cardEl.getBoundingClientRect();
        walkAimX.set(cr.left + Math.min(64, cr.width * 0.12));
        walkAimY.set(cr.top + cr.height * 0.5);
      }

      walkAlignY.set(isMob ? 0 : nextAlign);

      setActiveWalkthroughIdx((prev) => (prev === bestIdx ? prev : bestIdx));
    };
    const onScrollOrResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateWalkthrough);
    };
    updateWalkthrough();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    document.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
    window.addEventListener("resize", onScrollOrResize);
    const vv = window.visualViewport;
    vv?.addEventListener("scroll", onScrollOrResize);
    vv?.addEventListener("resize", onScrollOrResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScrollOrResize);
      document.removeEventListener("scroll", onScrollOrResize, { capture: true });
      window.removeEventListener("resize", onScrollOrResize);
      vv?.removeEventListener("scroll", onScrollOrResize);
      vv?.removeEventListener("resize", onScrollOrResize);
    };
  }, [isMob, showFeatures]);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const learnMore = () => {
    if (showFeatures) scrollTo("about");
    else navigate({ pathname: "/", hash: "about" });
  };

  const heroWord = HERO_ROTATING_WORDS[heroWordIdx];
  const heroWordWidth = heroWordWidths[heroWord] || 168;

  const demoNow = new Date();
  const demoDateLine = `${demoNow.toLocaleDateString("en-US", { weekday: "short" })}, ${demoNow.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const demoTimeLine = demoNow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const demoDayPart = demoNow.getHours() < 12 ? "morning" : demoNow.getHours() < 17 ? "afternoon" : "evening";
  const DemoGreetIcon = demoNow.getHours() < 17 ? Sun : Moon;
  const demoGreetBg =
    demoNow.getHours() < 12
      ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
      : demoNow.getHours() < 17
        ? "linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)"
        : "#1e40af";

  const T1 = light ? "#0f172a" : "#f8fafc";
  const T2 = light ? "#475569" : "#cbd5e1";
  const T3 = light ? "#64748b" : "#94a3b8";
  const B1 = light ? "rgba(148,163,184,.28)" : "rgba(125,211,252,.2)";
  const pageBg = light
    ? "linear-gradient(180deg,#f3f5f9 0%,#eef1f7 38%,#f6f8fc 100%)"
    : "linear-gradient(170deg,#081423 0%,#0b1d33 45%,#081423 100%)";

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: pageBg,
        position: "relative",
        fontFamily: font,
        overflowX: "hidden",
        overflowY: "visible",
        touchAction: "manipulation",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: `linear-gradient(${light ? "rgba(59,130,246,.06)" : "rgba(125,211,252,.05)"} 1px, transparent 1px),linear-gradient(90deg, ${light ? "rgba(59,130,246,.06)" : "rgba(125,211,252,.05)"} 1px, transparent 1px)`,
          backgroundSize: "34px 34px",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1240,
          margin: "0 auto",
          padding: isMob
            ? "max(6px, env(safe-area-inset-top, 0px)) 14px 22px"
            : "max(6px, env(safe-area-inset-top, 0px)) 22px 26px",
        }}
      >
        <MarketingSiteHeader marginBottom={isMob ? 8 : 6} marketingScroll />

        <section
          id="top"
          style={{
            borderRadius: 18,
            padding: isMob ? "14px 12px 12px" : "16px 18px 14px",
            background: light ? "rgba(255,255,255,.78)" : "rgba(15,23,42,.44)",
            border: `1px solid ${B1}`,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMob ? "1fr" : isTab ? "1fr" : "1.05fr 1.2fr",
              gap: isMob ? 14 : isTab ? 20 : 28,
              alignItems: "start",
              position: "relative",
            }}
          >
            <div
              style={{
                minWidth: 0,
                position: "relative",
                zIndex: 5,
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
              }}
            >
              <span style={{ display: "inline-block", marginBottom: 8, padding: "4px 10px", borderRadius: 999, fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: light ? "#1d4ed8" : "#7dd3fc", background: light ? "rgba(255,255,255,.92)" : "rgba(15,23,42,.7)", border: `1px solid ${B1}` }}>
                Personal Health Platform
              </span>

              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "stretch",
                  gap: isMob ? 8 : 12,
                  marginTop: 2,
                }}
              >
                <div
                  style={{
                    alignSelf: "stretch",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    paddingRight: isMob ? 2 : 4,
                    minWidth: isMob ? 72 : 88,
                  }}
                >
                  <FloatingPillMascot
                    light={light}
                    variant="leanCool"
                    fit
                    maxWidth={isMob ? 112 : isTab ? 158 : 172}
                    fitObjectPosition="48% 28%"
                  />
                </div>

              <h1 style={{ flex: 1, minWidth: 0, margin: "0 0 8px", color: T1, fontSize: isMob ? 38 : 45, lineHeight: 1.08, letterSpacing: "-.62px", fontWeight: 800, position: "relative" }}>
                <span
                  ref={heroWordMeasureRef}
                  aria-hidden
                  style={{
                    position: "absolute",
                    visibility: "hidden",
                    whiteSpace: "nowrap",
                    fontWeight: 800,
                    fontSize: isMob ? 38 : 45,
                    lineHeight: 1.08,
                    letterSpacing: "-.62px",
                    pointerEvents: "none",
                  }}
                />
                <span style={{ color: T1 }}>Your </span>
                <span style={{ color: "#2563eb" }}>health,</span>
                <br />
                <motion.span
                  animate={{ width: heroWordWidth }}
                  transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.4 }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: heroWordWidth,
                    minHeight: "1.18em",
                    padding: "0.06em 12px",
                    marginRight: "0.06em",
                    borderRadius: 999,
                    border: `1px solid ${light ? "rgba(37,99,235,.42)" : "rgba(125,211,252,.52)"}`,
                    background: light ? "rgba(255,255,255,.97)" : "rgba(15,23,42,.78)",
                    boxShadow: light ? "0 1px 6px rgba(37,99,235,.08)" : "0 2px 8px rgba(14,165,233,.12)",
                    verticalAlign: "middle",
                    overflow: "hidden",
                    boxSizing: "border-box",
                  }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={heroWord}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                      style={{ display: "inline-block", fontWeight: 800, lineHeight: 1, color: light ? "#1d4ed8" : "#7dd3fc" }}
                    >
                      {heroWord}
                    </motion.span>
                  </AnimatePresence>
                </motion.span>
                <br />
                <span
                  style={{
                    background: "linear-gradient(90deg,#1D4ED8,#2563EB,#0EA5E9)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  organised.
                </span>
              </h1>
              </div>

              <p style={{ margin: "0 0 10px", maxWidth: 460, color: T2, fontSize: isMob ? 14.5 : 15.5, lineHeight: 1.58 }}>
                A smarter way to manage medications, reminders, and your health.
              </p>

              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <button type="button" onClick={() => navigate("/signup")} style={{ border: "none", borderRadius: 12, padding: "11px 18px", background: gradBtn, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 10px 24px rgba(37,99,235,.3)", display: "inline-flex", alignItems: "center", gap: 8 }}>Get Started <ArrowRight size={17} strokeWidth={2.5} aria-hidden /></button>
                <button type="button" onClick={learnMore} style={{ border: `1px solid ${B1}`, borderRadius: 12, padding: "11px 16px", background: light ? "#fff" : "rgba(15,23,42,.7)", color: T1, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Learn More</button>
              </div>

              {showFeatures ? (
                <div style={{ display: "flex", justifyContent: "center", marginTop: isMob ? 8 : 10 }}>
                  <motion.button
                    type="button"
                    aria-label="Scroll down to Guided Health Workflow"
                    onClick={() => scrollTo("about")}
                    style={{
                      display: "inline-flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: T3,
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      padding: "10px 20px",
                      fontFamily: font,
                    }}
                  >
                    Scroll
                    <motion.span
                      aria-hidden
                      animate={{ y: [0, 6, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
                      style={{ display: "flex", color: light ? "#2563eb" : "#7dd3fc" }}
                    >
                      <ChevronDown size={24} strokeWidth={2.25} />
                    </motion.span>
                  </motion.button>
                </div>
              ) : null}
            </div>

            <div style={{ position: "relative", zIndex: 1, alignSelf: "stretch", display: "flex", flexDirection: "column", minHeight: isMob ? undefined : 0 }}>
              <div style={{ flex: 1, minHeight: 0, borderRadius: 18, overflow: "hidden", border: `1px solid ${B1}`, background: light ? "rgba(255,255,255,.96)" : "rgba(15,23,42,.8)", boxShadow: light ? "0 18px 34px rgba(15,23,42,.12)" : "0 20px 36px rgba(2,6,23,.5)" }}>
                <div style={{ height: 34, background: light ? "#f8fafc" : "rgba(15,23,42,.95)", borderBottom: `1px solid ${B1}`, display: "flex", alignItems: "center", padding: "0 12px", gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#f87171" }} />
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#facc15" }} />
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#4ade80" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "158px 1fr", minHeight: isMob ? 280 : 360 }}>
                  {!isMob && (
                    <aside style={{ borderRight: `1px solid ${B1}`, padding: "10px 8px", background: light ? "#f8fafc" : "rgba(2,6,23,.45)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontWeight: 700, color: T1, fontSize: 13 }}>
                        <span style={{ width: 18, height: 18, borderRadius: 6, background: gradBtn, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><MedTrackHeartLogo size={9} /></span>
                        MedTrack
                      </div>
                      {[["Dashboard", LayoutDashboard], ["Medications", Pill], ["Reminders", Bell], ["Messages", MessageSquareText], ["Appointments", CalendarClock], ["Settings", Settings]].map(([label, I], idx) => (
                        <div key={label} style={{ marginBottom: 4, borderRadius: 8, padding: "6px 7px", display: "flex", alignItems: "center", gap: 7, background: idx === 0 ? (light ? "rgba(37,99,235,.1)" : "rgba(14,165,233,.14)") : "transparent", color: idx === 0 ? (light ? "#1d4ed8" : "#7dd3fc") : T2, fontSize: 11, fontWeight: idx === 0 ? 700 : 500 }}>
                          <I size={13} />
                          {label}
                        </div>
                      ))}
                    </aside>
                  )}

                  <main
                    style={{
                      padding: isMob ? 10 : 11,
                      background: light ? "#f1f5f9" : "rgba(15,23,42,.42)",
                      fontFamily: font,
                      overflow: "hidden",
                    }}
                  >
                    {(() => {
                      const cardBg = light ? "#ffffff" : "rgba(15,23,42,.75)";
                      const cardBase = {
                        background: cardBg,
                        border: `1px solid ${light ? "rgba(148,163,184,.2)" : B1}`,
                        borderRadius: 14,
                        boxShadow: light ? "0 1px 2px rgba(15,23,42,.05)" : "0 2px 10px rgba(0,0,0,.2)",
                      };
                      const c1 = T1;
                      const cMuted = T3;
                      const qaBorder = light ? "1px solid rgba(148,163,184,.18)" : "1px solid rgba(148,163,184,.2)";
                      const qaBg = light ? "#f8fafc" : "rgba(15,23,42,.55)";
                      const quickDemo = [
                        { label: "Add med", Icon: Plus, ac: light ? "#2563eb" : "#7dd3fc" },
                        { label: "Appointment", Icon: Calendar, ac: light ? "#dc2626" : "#f87171" },
                        { label: "Message", Icon: MessageCircle, ac: light ? "#7c3aed" : "#c4b5fd" },
                        { label: "Care Hub", Icon: Stethoscope, ac: light ? "#2563eb" : "#7dd3fc" },
                      ];
                      const statDemo = [
                        { l: "Daily progress", v: "3/4", I: CheckCircle2, c: "#10b981", bg: "rgba(16,185,129,.12)" },
                        { l: "Day streak", v: "5", I: Flame, c: "#f59e0b", bg: "rgba(245,158,11,.14)" },
                        { l: "Adherence", v: "85%", I: TrendingUp, c: "#2563eb", bg: "rgba(37,99,235,.1)" },
                        { l: "Medications", v: "4", I: Pill, c: "#7c3aed", bg: "rgba(124,58,237,.12)" },
                      ];
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: isMob ? "1fr" : "1fr minmax(0, 200px)",
                              gap: 9,
                              alignItems: "stretch",
                            }}
                          >
                            <div style={{ ...cardBase, padding: "12px 13px" }}>
                              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                                <div
                                  style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: "50%",
                                    background: demoGreetBg,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                  aria-hidden
                                >
                                  <DemoGreetIcon size={20} color="#fff" strokeWidth={2.2} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ margin: 0, color: cMuted, fontSize: 11, fontWeight: 500, lineHeight: 1.3 }}>
                                    Good {demoDayPart},
                                  </p>
                                  <h2 style={{ margin: "4px 0 0", fontSize: isMob ? 17 : 18, fontWeight: 700, color: c1, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                                    Alex
                                  </h2>
                                  <p
                                    style={{
                                      margin: "8px 0 0",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      flexWrap: "wrap",
                                      color: cMuted,
                                      fontSize: 10,
                                      fontWeight: 500,
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                      <Calendar size={12} color={cMuted} strokeWidth={2} aria-hidden />
                                      {demoDateLine}
                                    </span>
                                    <span style={{ color: cMuted, opacity: 0.35, userSelect: "none", lineHeight: 1 }} aria-hidden>
                                      |
                                    </span>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                      <Clock size={12} color={cMuted} strokeWidth={2} aria-hidden />
                                      {demoTimeLine}
                                    </span>
                                  </p>
                                  <div
                                    style={{
                                      marginTop: 10,
                                      paddingTop: 10,
                                      borderTop: `1px solid ${light ? "rgba(148,163,184,.22)" : "rgba(148,163,184,.18)"}`,
                                    }}
                                  >
                                    <p style={{ margin: 0, fontSize: 10, color: cMuted, lineHeight: 1.45, display: "flex", alignItems: "flex-start", gap: 6 }}>
                                      <Utensils size={12} color={cMuted} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                                      <span>Some meds absorb better with food.</span>
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <section style={{ ...cardBase, padding: "11px 11px" }}>
                              <h3 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: cMuted, letterSpacing: "0.04em", textTransform: "uppercase" }}>Quick actions</h3>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                {quickDemo.map((a) => (
                                  <div
                                    key={a.label}
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "flex-start",
                                      gap: 5,
                                      padding: "8px 9px",
                                      borderRadius: 10,
                                      background: qaBg,
                                      border: qaBorder,
                                      color: a.ac,
                                      fontWeight: 600,
                                      fontSize: 9,
                                      lineHeight: 1.2,
                                      minHeight: 0,
                                    }}
                                  >
                                    <a.Icon size={16} strokeWidth={2} />
                                    {a.label}
                                  </div>
                                ))}
                              </div>
                            </section>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                            {statDemo.map((s) => (
                              <div key={s.l} style={{ ...cardBase, padding: "10px 11px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                                  <div style={{ width: 32, height: 32, borderRadius: 999, background: s.bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <s.I size={15} color={s.c} strokeWidth={2.2} />
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ color: c1, fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums", margin: 0, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{s.v}</p>
                                    <p style={{ color: cMuted, fontSize: 10, fontWeight: 600, margin: "3px 0 0" }}>{s.l}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div
                            style={{
                              ...cardBase,
                              padding: "9px 12px",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              boxShadow: light ? "inset 3px 0 0 #2563eb, 0 1px 2px rgba(15,23,42,.05)" : "inset 3px 0 0 #38bdf8, 0 2px 10px rgba(0,0,0,.2)",
                            }}
                          >
                            <Pill size={15} color={light ? "#2563eb" : "#7dd3fc"} strokeWidth={2} aria-hidden />
                            <p style={{ margin: 0, fontSize: 11, color: c1, lineHeight: 1.35 }}>
                              <span style={{ fontWeight: 700 }}>Next dose</span>
                              <span style={{ color: cMuted, fontWeight: 500 }}> · Amoxicillin · </span>
                              <span style={{ color: light ? "#2563eb" : "#7dd3fc", fontWeight: 700 }}>1:24</span>
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </main>
                </div>
              </div>
            </div>
          </div>
        </section>

        {showFeatures ? (
        <div
          style={{
            marginTop: 16,
            borderRadius: 16,
            background: light ? "linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%)" : "linear-gradient(180deg,#071427 0%,#0b1b32 100%)",
            border: `1px solid ${B1}`,
            boxShadow: light ? "0 10px 24px rgba(15,23,42,.06)" : "0 14px 26px rgba(2,6,23,.42)",
            overflow: "visible",
          }}
        >
          <section id="about" style={{ maxWidth: 1120, margin: "0 auto", padding: isMob ? "40px 16px 44px" : "52px 24px 60px" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: isMob ? 28 : 34, color: T1, letterSpacing: "-.5px" }}>Guided Health Workflow</h2>
            <p style={{ margin: "0 0 22px", color: T2, lineHeight: 1.65, maxWidth: 760 }}>
              Your MedTrack assistant stays with you while you scroll, guiding each core feature in a clean health-tech flow.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMob ? "1fr" : "minmax(232px, 300px) minmax(0, 1fr)",
                gap: isMob ? 20 : 32,
                alignItems: isMob ? "stretch" : "start",
              }}
            >
              {isMob ? (
                <div
                  ref={walkthroughMascotPivotRef}
                  style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}
                >
                  <motion.div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <FloatingPillMascot light={light} variant="walkthrough" width={124} aimX={walkAimX} aimY={walkAimY} />
                  </motion.div>
                </div>
              ) : (
                <div
                  ref={walkthroughStickyRef}
                  style={{
                    position: "sticky",
                    top: 120,
                    alignSelf: "start",
                    minHeight: 220,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "16px 12px",
                    overflow: "visible",
                  }}
                >
                  <div
                    ref={walkthroughMascotPivotRef}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      minHeight: 200,
                    }}
                  >
                    <motion.div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        willChange: "transform",
                        y: walkYSpring,
                      }}
                    >
                      <FloatingPillMascot
                        light={light}
                        variant="walkthrough"
                        width={isTab ? 138 : 156}
                        aimX={walkAimX}
                        aimY={walkAimY}
                      />
                    </motion.div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {WALKTHROUGH_CARDS.map(({ I, title, desc }, idx) => {
                  const isActive = idx === activeWalkthroughIdx;
                  const walkEase = [0.4, 0, 0.2, 1];
                  const activeBorder = light ? "rgba(37,99,235,.55)" : "rgba(125,211,252,.5)";
                  const inactiveBorder = light ? "rgba(148,163,184,.35)" : "rgba(125,211,252,.18)";
                  return (
                    <motion.div
                      key={title}
                      ref={(el) => {
                        walkthroughStepRefs.current[idx] = el;
                      }}
                      initial={walkthroughReduceMotion ? false : { y: 12 }}
                      whileInView={walkthroughReduceMotion ? undefined : { y: 0 }}
                      viewport={{ once: false, amount: 0.26, margin: "-6% 0px -6% 0px" }}
                      animate={{
                        opacity: isActive ? 1 : isMob ? 0.94 : 0.9,
                        scale: isActive ? (isMob ? 1.01 : 1.035) : 1,
                      }}
                      transition={{ duration: walkthroughReduceMotion ? 0.12 : 0.42, ease: walkEase }}
                      style={{
                        borderRadius: 16,
                        padding: isMob ? "16px 16px 15px" : "18px 18px 16px",
                        background: light ? "rgba(255,255,255,.94)" : "rgba(15,23,42,.74)",
                        border: `2px solid ${isActive ? activeBorder : inactiveBorder}`,
                        boxShadow: isActive
                          ? light
                            ? "0 0 0 1px rgba(37,99,235,.12), 0 14px 40px rgba(37,99,235,.16), 0 8px 20px rgba(15,23,42,.08)"
                            : "0 0 0 1px rgba(125,211,252,.2), 0 16px 44px rgba(2,6,23,.55), 0 0 28px rgba(56,189,248,.12)"
                          : light
                            ? "0 6px 18px rgba(15,23,42,.06)"
                            : "0 8px 20px rgba(2,6,23,.3)",
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: light ? "rgba(37,99,235,.11)" : "rgba(14,165,233,.16)",
                          marginBottom: 10,
                        }}
                      >
                        <I size={19} color={light ? "#1d4ed8" : "#7dd3fc"} />
                      </div>
                      <h3 style={{ margin: "0 0 6px", fontSize: 18, color: light ? "#0f172a" : "#e2e8f0" }}>{title}</h3>
                      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.68, color: light ? "#475569" : "#94a3b8" }}>{desc}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </section>

          <section id="how-it-works" style={{ maxWidth: 1100, margin: "0 auto", padding: isMob ? "8px 16px 40px" : "8px 24px 52px" }}>
            <h2 style={{ margin: "0 0 18px", fontSize: isMob ? 27 : 32, color: T1, letterSpacing: "-.4px" }}>How It Works</h2>
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 14 }}>
              {HOW_IT_WORKS.map(({ step, title, desc }, idx) => {
                const ease = [0.4, 0, 0.2, 1];
                const cardShadow = light ? "0 4px 16px rgba(15,23,42,.06)" : "0 6px 18px rgba(2,6,23,.32)";
                const cardShadowHover = light ? "0 14px 32px rgba(15,23,42,.13)" : "0 16px 36px rgba(2,6,23,.46)";
                return (
                  <motion.div
                    key={step}
                    initial={walkthroughReduceMotion ? false : { opacity: 0, y: 16 }}
                    whileInView={walkthroughReduceMotion ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: false, amount: 0.22, margin: "0px 0px -8% 0px" }}
                    transition={{
                      duration: walkthroughReduceMotion ? 0.01 : 0.52,
                      delay: walkthroughReduceMotion ? 0 : idx * 0.09,
                      ease,
                    }}
                    whileHover={
                      walkthroughReduceMotion
                        ? undefined
                        : {
                            y: -3,
                            boxShadow: cardShadowHover,
                            transition: { duration: 0.22, ease },
                          }
                    }
                    style={{
                      borderRadius: 16,
                      padding: "18px 16px",
                      background: light ? "#ffffff" : "rgba(15,23,42,.7)",
                      border: `1px solid ${light ? "#dbeafe" : "rgba(148,163,184,.2)"}`,
                      boxShadow: cardShadow,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: light ? "#2563eb" : "#7dd3fc", marginBottom: 8 }}>STEP {step}</div>
                    <h3 style={{ margin: "0 0 6px", fontSize: 17, color: light ? "#0f172a" : "#e2e8f0" }}>{title}</h3>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: light ? "#475569" : "#94a3b8" }}>{desc}</p>
                  </motion.div>
                );
              })}
            </div>
          </section>

          <section
            id="portals"
            style={{ maxWidth: 1100, margin: "0 auto", padding: isMob ? "8px 16px 40px" : "8px 24px 48px", overflow: "visible" }}
          >
            <motion.div
              style={
                walkthroughReduceMotion
                  ? undefined
                  : {
                      opacity: portalRowScrollDim,
                      willChange: "opacity",
                    }
              }
            >
              <div>
                <h2 style={{ margin: "0 0 16px", fontSize: isMob ? 27 : 32, color: T1, letterSpacing: "-.4px" }}>Portal Preview</h2>
                <PortalPreviewCards
                  items={PORTAL_PREVIEWS}
                  light={light}
                  reduceMotion={walkthroughReduceMotion}
                  isMob={isMob}
                />
              </div>
            </motion.div>
          </section>

          <section
            id="benefits"
            ref={benefitsSectionRef}
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: isMob ? "8px 16px 40px" : "8px 24px 52px",
            }}
          >
            <motion.div
              style={
                walkthroughReduceMotion
                  ? undefined
                  : { y: benefitsDeckRiseY, willChange: "transform" }
              }
            >
              <h2 style={{ margin: "0 0 18px", fontSize: isMob ? 27 : 32, color: T1, letterSpacing: "-.4px" }}>Benefits</h2>
              <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 14 }}>
                {BENEFITS_HIGHLIGHTS.map(({ title, text }, idx) => {
                  const ease = [0.4, 0, 0.2, 1];
                  const cardShadow = light ? "0 4px 16px rgba(15,23,42,.06)" : "0 6px 18px rgba(2,6,23,.32)";
                  const cardShadowHover = light ? "0 14px 32px rgba(15,23,42,.13)" : "0 16px 36px rgba(2,6,23,.46)";
                  return (
                    <motion.div
                      key={title}
                      initial={walkthroughReduceMotion ? false : { opacity: 0, y: 16 }}
                      whileInView={walkthroughReduceMotion ? undefined : { opacity: 1, y: 0 }}
                      viewport={{ once: false, amount: 0.22, margin: "0px 0px -8% 0px" }}
                      transition={{
                        duration: walkthroughReduceMotion ? 0.01 : 0.52,
                        delay: walkthroughReduceMotion ? 0 : idx * 0.09,
                        ease,
                      }}
                      whileHover={
                        walkthroughReduceMotion
                          ? undefined
                          : {
                              y: -3,
                              boxShadow: cardShadowHover,
                              transition: { duration: 0.22, ease },
                            }
                      }
                      style={{
                        borderRadius: 16,
                        padding: "18px 16px",
                        background: light ? "#ffffff" : "rgba(15,23,42,.7)",
                        border: `1px solid ${light ? "#dbeafe" : "rgba(148,163,184,.2)"}`,
                        boxShadow: cardShadow,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: light ? "#2563eb" : "#7dd3fc", marginBottom: 8 }}>
                        BENEFIT {String(idx + 1).padStart(2, "0")}
                      </div>
                      <h3 style={{ margin: "0 0 6px", fontSize: 17, color: light ? "#0f172a" : "#e2e8f0" }}>{title}</h3>
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: light ? "#475569" : "#94a3b8" }}>{text}</p>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </section>

          <div
            ref={takeControlRef}
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: isMob ? "0 16px 48px" : "0 24px 56px",
              position: "relative",
              marginTop: isMob ? 20 : 28,
              overflow: "visible",
            }}
          >
            <div
              style={{
                borderRadius: 24,
                padding: isMob ? "24px 18px" : "30px 32px",
                background: light ? "linear-gradient(120deg,#dbeafe,#e0f2fe 60%,#ffffff)" : "linear-gradient(130deg,#0f172a,#1d4ed8 85%)",
                border: `1px solid ${light ? "#bfdbfe" : "rgba(125,211,252,.25)"}`,
                position: "relative",
                zIndex: 1,
              }}
            >
              <motion.h2
                initial={walkthroughReduceMotion ? false : { opacity: 0, x: -52 }}
                animate={
                  walkthroughReduceMotion || takeControlSeen ? { opacity: 1, x: 0 } : { opacity: 0, x: -52 }
                }
                transition={{ duration: 0.74, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  margin: "0 0 10px",
                  fontSize: isMob ? 26 : 34,
                  lineHeight: 1.15,
                  color: T1,
                  letterSpacing: "-.55px",
                  willChange: "transform, opacity",
                }}
              >
                Take control of your health in one simple dashboard.
              </motion.h2>
              <motion.p
                initial={walkthroughReduceMotion ? false : { opacity: 0 }}
                animate={walkthroughReduceMotion || takeControlSeen ? { opacity: 1 } : { opacity: 0 }}
                transition={{
                  duration: 0.64,
                  delay: walkthroughReduceMotion ? 0 : 0.22,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  margin: "0 0 18px",
                  maxWidth: 680,
                  color: light ? "#334155" : "#dbeafe",
                  lineHeight: 1.7,
                  fontSize: 15,
                  willChange: "opacity",
                }}
              >
                Join MedTrack to keep medication, appointments, communication, and reminders connected in one professional health-tech experience.
              </motion.p>
              <motion.button
                type="button"
                onClick={() => navigate("/signup")}
                initial={walkthroughReduceMotion ? false : { opacity: 0, scale: 0.95 }}
                animate={
                  walkthroughReduceMotion || takeControlSeen
                    ? { opacity: 1, scale: 1 }
                    : { opacity: 0, scale: 0.95 }
                }
                transition={{
                  duration: 0.52,
                  delay: walkthroughReduceMotion ? 0 : 0.4,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  border: "none",
                  borderRadius: 14,
                  padding: "12px 18px",
                  background: gradBtn,
                  color: "#fff",
                  fontFamily: font,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                  boxShadow: "0 12px 28px rgba(37,99,235,.3)",
                  willChange: "transform, opacity",
                }}
              >
                Sign Up
              </motion.button>
            </div>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}
