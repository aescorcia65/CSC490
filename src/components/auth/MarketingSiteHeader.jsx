import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import MedTrackHeartLogo from "./MedTrackHeartLogo";

const gradBtn = "linear-gradient(90deg,#1D4ED8 0%,#2563EB 42%,#0EA5E9 100%)";

/**
 * MedTrack marketing top bar: logo, Home · About, Sign in, Get Started.
 * @param {{ marginBottom?: number, marketingScroll?: boolean }} props
 * — When marketingScroll is true (home), Home & About smooth-scroll to #top / #about when already on `/`.
 */
export default function MarketingSiteHeader({ marginBottom = 20, marketingScroll = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [light] = useTheme();
  const [vw, setVw] = useState(() => window.innerWidth);
  const isMob = vw < 760;

  const pathname = location.pathname;
  const isHomeRoute = pathname === "/";

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const T1 = light ? "#0f172a" : "#f8fafc";
  const T2 = light ? "#475569" : "#cbd5e1";
  const B1 = light ? "rgba(148,163,184,.28)" : "rgba(125,211,252,.2)";
  const S1 = light ? "rgba(255,255,255,.92)" : "rgba(15,23,42,.74)";

  const goHome = () => {
    if (marketingScroll && pathname === "/") {
      document.getElementById("top")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    navigate("/");
  };

  const goAbout = () => {
    if (marketingScroll && pathname === "/") {
      document.getElementById("about")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    navigate({ pathname: "/", hash: "about" });
  };

  return (
    <header
      style={{
        minHeight: isMob ? 56 : 50,
        borderRadius: 14,
        background: S1,
        border: `1px solid ${B1}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: isMob ? "wrap" : "nowrap",
        rowGap: isMob ? 10 : 0,
        padding: isMob ? "8px 12px" : "0 12px",
        boxShadow: light ? "0 6px 18px rgba(15,23,42,.055)" : "0 10px 24px rgba(2,6,23,.36)",
        marginBottom,
      }}
    >
      <button
        type="button"
        onClick={() => navigate("/")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: T1,
          fontWeight: 800,
          flexShrink: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
          padding: 0,
          ...(isMob ? { order: 1 } : {}),
        }}
      >
        <span style={{ width: 30, height: 30, borderRadius: 8, background: gradBtn, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(37,99,235,.26)" }}>
          <MedTrackHeartLogo size={15} />
        </span>
        <span style={{ fontSize: 24, lineHeight: 1 }}>
          <span>Med</span>
          <span style={{ color: "#2563eb" }}>Track</span>
        </span>
      </button>

      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: isMob ? 12 : 26,
          flex: isMob ? "1 1 100%" : 1,
          order: isMob ? 3 : 0,
          minWidth: 0,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={goHome}
          style={{
            background: "none",
            border: "none",
            color: isHomeRoute ? "#2563eb" : T2,
            fontSize: isMob ? 13 : 14,
            fontWeight: isHomeRoute ? 700 : 600,
            cursor: "pointer",
            borderBottom: isHomeRoute ? "2px solid #2563eb" : "2px solid transparent",
            paddingBottom: isMob ? 5 : 6,
            paddingTop: 0,
            lineHeight: 1.25,
            whiteSpace: "nowrap",
            fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
          }}
        >
          Home
        </button>
        <button
          type="button"
          onClick={goAbout}
          style={{
            background: "none",
            border: "none",
            color: T2,
            fontSize: isMob ? 13 : 14,
            fontWeight: 600,
            cursor: "pointer",
            borderBottom: "2px solid transparent",
            paddingBottom: isMob ? 5 : 6,
            paddingTop: 0,
            lineHeight: 1.25,
            whiteSpace: "nowrap",
            fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
          }}
        >
          About
        </button>
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: isMob ? "auto" : undefined, ...(isMob ? { order: 2 } : {}) }}>
        <button
          type="button"
          onClick={() => navigate("/signin")}
          style={{
            border: `1px solid ${B1}`,
            borderRadius: 11,
            padding: isMob ? "7px 10px" : "8px 12px",
            background: light ? "#ffffff" : "rgba(15,23,42,.6)",
            color: T1,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => navigate("/signup")}
          style={{
            border: "none",
            borderRadius: 11,
            padding: isMob ? "7px 12px" : "8px 14px",
            background: gradBtn,
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 10px 24px rgba(37,99,235,.3)",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
          }}
        >
          Get Started <ArrowRight size={15} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </header>
  );
}
