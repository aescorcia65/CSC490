import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabase";
import { Eye, EyeOff, Loader2, Moon, Sun } from "lucide-react";
import MedTrackHeartLogo from "./MedTrackHeartLogo";

export default function MobileAuth({ defaultTab = "login" }) {
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("client");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // Theme tokens
  const t = dark ? {
    page:    "#0f172a",
    card:    "#1e293b",
    border:  "rgba(255,255,255,.10)",
    text:    "#f1f5f9",
    sub:     "#94a3b8",
    inputBg: "rgba(255,255,255,.06)",
    inputBd: "rgba(255,255,255,.14)",
    tabBg:   "rgba(255,255,255,.06)",
    pillBg:  "rgba(255,255,255,.08)",
    pillBd:  "rgba(255,255,255,.14)",
    divider: "rgba(255,255,255,.08)",
  } : {
    page:    "#f0f6ff",
    card:    "#ffffff",
    border:  "#e2e8f0",
    text:    "#0f172a",
    sub:     "#64748b",
    inputBg: "#f8fafc",
    inputBd: "#e2e8f0",
    tabBg:   "#f1f5f9",
    pillBg:  "#f8fafc",
    pillBd:  "#e2e8f0",
    divider: "#f1f5f9",
  };

  const accent = "#3b82f6";

  async function handleLogin(e) {
    e.preventDefault();
    setErr(""); setInfo("");
    if (!email || !password) { setErr("Please enter your email and password."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message);
    } catch { setErr("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setErr(""); setInfo("");
    if (!email || !password) { setErr("Please fill in all fields."); return; }
    if (password !== confirmPassword) { setErr("Passwords do not match."); return; }
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { role } },
      });
      if (error) { setErr(error.message); return; }
      if (data?.user && !data?.session) {
        setInfo("Check your email to confirm your account, then sign in.");
        setTab("login");
      }
    } catch { setErr("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  const inp = {
    width: "100%",
    boxSizing: "border-box",
    background: t.inputBg,
    border: `1.5px solid ${t.inputBd}`,
    borderRadius: 12,
    padding: "14px 16px",
    color: t.text,
    fontSize: 16,
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color .15s",
  };

  const submitBtn = {
    width: "100%",
    padding: "15px 0",
    background: `linear-gradient(135deg, #3b82f6, #6366f1)`,
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.75 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: "0 4px 14px rgba(59,130,246,.35)",
  };

  const lbl = {
    fontSize: 13,
    fontWeight: 600,
    color: t.sub,
    marginBottom: 7,
    display: "block",
    letterSpacing: ".03em",
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: t.page,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "0 18px 48px",
      fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
      boxSizing: "border-box",
      transition: "background .2s",
    }}>
      {/* Top bar */}
      <div style={{
        width: "100%",
        maxWidth: 440,
        paddingTop: "max(20px, env(safe-area-inset-top, 20px))",
        paddingBottom: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <button
          type="button"
          onClick={() => navigate("/")}
          style={{
            background: t.pillBg,
            border: `1px solid ${t.pillBd}`,
            borderRadius: 999,
            color: t.sub,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "inherit",
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          ← Home
        </button>

        <button
          type="button"
          onClick={() => setDark(d => !d)}
          aria-label="Toggle dark mode"
          style={{
            background: t.pillBg,
            border: `1px solid ${t.pillBd}`,
            borderRadius: 999,
            color: t.sub,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "inherit",
            padding: "8px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {dark ? <Sun size={14} color="#fbbf24" /> : <Moon size={14} />}
          {dark ? "Light" : "Dark"}
        </button>
      </div>

      {/* Logo */}
      <div style={{
        width: "100%",
        maxWidth: 440,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "20px 0 6px",
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 13,
          background: "linear-gradient(135deg,#3b82f6,#6366f1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 16px rgba(59,130,246,.4)",
          flexShrink: 0,
        }}>
          <MedTrackHeartLogo size={24} style={{ color: "#fff" }} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: t.text, letterSpacing: "-.3px" }}>
            Med<span style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Track</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: t.sub, textTransform: "uppercase", marginTop: 1 }}>Health Management</div>
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: "100%",
        maxWidth: 440,
        background: t.card,
        borderRadius: 20,
        border: `1px solid ${t.border}`,
        padding: "24px 22px 28px",
        marginTop: 16,
        boxSizing: "border-box",
        boxShadow: dark ? "0 8px 32px rgba(0,0,0,.4)" : "0 4px 24px rgba(15,23,42,.08)",
        transition: "background .2s, box-shadow .2s",
      }}>

        {/* Heading */}
        <h1 style={{
          fontSize: 22,
          fontWeight: 800,
          color: t.text,
          margin: "0 0 4px",
          letterSpacing: "-.4px",
        }}>
          {tab === "login" ? "Welcome back" : "Create account"}
        </h1>
        <p style={{ fontSize: 14, color: t.sub, margin: "0 0 22px" }}>
          {tab === "login" ? "Sign in to your MedTrack account" : "Join MedTrack today"}
        </p>

        {/* Tabs */}
        <div style={{
          display: "flex",
          background: t.tabBg,
          borderRadius: 12,
          padding: 4,
          marginBottom: 24,
          gap: 4,
          border: `1px solid ${t.border}`,
        }}>
          {[["login","Sign In"],["signup","Sign Up"]].map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => { setTab(v); setErr(""); setInfo(""); }}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 9,
                border: "none",
                background: tab === v
                  ? dark ? accent : "#fff"
                  : "transparent",
                color: tab === v
                  ? dark ? "#fff" : accent
                  : t.sub,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "inherit",
                cursor: "pointer",
                boxShadow: tab === v && !dark ? "0 1px 4px rgba(15,23,42,.08)" : "none",
                transition: "all .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Alerts */}
        {err && (
          <div style={{
            background: dark ? "rgba(239,68,68,.12)" : "#fef2f2",
            border: `1px solid ${dark ? "rgba(239,68,68,.3)" : "#fecaca"}`,
            borderRadius: 10,
            padding: "11px 14px",
            color: dark ? "#fca5a5" : "#dc2626",
            fontSize: 13,
            marginBottom: 18,
          }}>{err}</div>
        )}
        {info && (
          <div style={{
            background: dark ? "rgba(34,197,94,.12)" : "#f0fdf4",
            border: `1px solid ${dark ? "rgba(34,197,94,.3)" : "#bbf7d0"}`,
            borderRadius: 10,
            padding: "11px 14px",
            color: dark ? "#86efac" : "#16a34a",
            fontSize: 13,
            marginBottom: 18,
          }}>{info}</div>
        )}

        {tab === "login" ? (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={lbl}>Email address</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inp}
              />
            </div>
            <div>
              <label style={lbl}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ ...inp, paddingRight: 50 }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.sub, cursor: "pointer", padding: 4 }}>
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" style={{ ...submitBtn, marginTop: 4 }} disabled={busy}>
              {busy ? <Loader2 size={18} style={{ animation: "ma-spin .7s linear infinite" }} /> : "Sign In"}
            </button>
            <p style={{ textAlign: "center", fontSize: 13, color: t.sub, margin: "4px 0 0" }}>
              No account?{" "}
              <button type="button" onClick={() => { setTab("signup"); setErr(""); }}
                style={{ background: "none", border: "none", color: accent, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13, padding: 0 }}>
                Sign up
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={lbl}>Email address</label>
              <input type="email" autoComplete="email" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} autoComplete="new-password"
                  placeholder="At least 6 characters"
                  value={password} onChange={e => setPassword(e.target.value)}
                  style={{ ...inp, paddingRight: 50 }} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.sub, cursor: "pointer", padding: 4 }}>
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label style={lbl}>Confirm password</label>
              <input type={showPw ? "text" : "password"} autoComplete="new-password"
                placeholder="Re-enter password"
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>I am a</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[["client","Patient"],["doctor","Doctor"],["pharmacist","Pharmacist"]].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setRole(val)}
                    style={{
                      padding: "10px 4px",
                      borderRadius: 10,
                      border: `1.5px solid ${role === val ? accent : t.inputBd}`,
                      background: role === val ? (dark ? "rgba(59,130,246,.15)" : "#eff6ff") : t.inputBg,
                      color: role === val ? accent : t.sub,
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      lineHeight: 1.4,
                      textAlign: "center",
                    }}>{label}</button>
                ))}
              </div>
            </div>
            <button type="submit" style={{ ...submitBtn, marginTop: 6 }} disabled={busy}>
              {busy ? <Loader2 size={18} style={{ animation: "ma-spin .7s linear infinite" }} /> : "Create Account"}
            </button>
            <p style={{ textAlign: "center", fontSize: 13, color: t.sub, margin: "2px 0 0" }}>
              Have an account?{" "}
              <button type="button" onClick={() => { setTab("login"); setErr(""); }}
                style={{ background: "none", border: "none", color: accent, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13, padding: 0 }}>
                Sign in
              </button>
            </p>
          </form>
        )}
      </div>

      <style>{`@keyframes ma-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
