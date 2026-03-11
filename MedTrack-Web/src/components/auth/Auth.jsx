import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HeartPulse, Mail, RefreshCw, ArrowRight, Loader2, Eye, EyeOff, KeyRound,
  AlertCircle, CheckCircle2, X
} from "lucide-react";
import { supabase } from "../../supabase";
import { PILLS_BG } from "../../lib/constants";

function ErrBanner({ msg, loginLight, onDismiss }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ display: "flex", gap: 9, padding: "12px 14px", borderRadius: 11,
        background: "rgba(239,68,68,.09)", border: "1px solid rgba(239,68,68,.22)", marginBottom: 12 }}>
      <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }}/>
      <p style={{ color: loginLight ? "#b91c1c" : "#ef4444", fontSize: 13, lineHeight: 1.55, flex: 1 }}>{msg}</p>
      {onDismiss && <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 0, lineHeight: 0 }}><X size={12}/></button>}
    </motion.div>
  );
}

function OkBanner({ msg, loginLight, onDismiss }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ display: "flex", gap: 9, padding: "12px 14px", borderRadius: 11,
        background: "rgba(16,185,129,.09)", border: "1px solid rgba(16,185,129,.24)", marginBottom: 12 }}>
      <CheckCircle2 size={14} color="#10b981" style={{ flexShrink: 0, marginTop: 1 }}/>
      <p style={{ color: loginLight ? "#065f46" : "#10b981", fontSize: 13, lineHeight: 1.55, flex: 1 }}>{msg}</p>
      {onDismiss && <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#10b981", padding: 0, lineHeight: 0 }}><X size={12}/></button>}
    </motion.div>
  );
}

export default function Auth() {
  const [tab, setTab] = useState("login");
  const [step, setStep] = useState("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => localStorage.getItem("mt_rem_email") || "");
  const [pw, setPw] = useState(() => localStorage.getItem("mt_rem_pw") || "");
  const [role, setRole] = useState("client");
  const [vis, setVis] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [resent, setResent] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [remember, setRemember] = useState(() => !!localStorage.getItem("mt_rem_email"));
  const [resetEmail, setResetEmail] = useState("");
  const [loginLight, setLoginLight] = useState(() => localStorage.getItem("mt_login_light") === "1");

  const pendingRef = useRef({ email: "", pw: "" });
  const pollRef = useRef(null);
  const tickRef = useRef(null);

  function toggleLoginTheme() {
    const next = !loginLight;
    setLoginLight(next);
    localStorage.setItem("mt_login_light", next ? "1" : "0");
  }

  function friendlyError(code, msg) {
    const m = (msg || "").toLowerCase();
    if (code === "auth/wrong-password" || code === "auth/invalid-credential" || m.includes("invalid login")) return "Incorrect password. Please try again or reset your password below.";
    if (code === "auth/user-not-found" || code === "auth/invalid-email" || m.includes("user not found")) return "No account found for that email address.";
    if (code === "auth/email-already-in-use" || m.includes("already registered")) return "An account with this email already exists. Try signing in instead.";
    if (code === "auth/weak-password" || m.includes("password")) return "Password must be at least 6 characters.";
    if (code === "auth/too-many-requests" || m.includes("too many")) return "Too many attempts. Please wait a few minutes and try again.";
    if (code === "auth/network-request-failed" || m.includes("network")) return "Network error. Check your connection and try again.";
    return (msg || "").replace("Firebase: ", "").replace(/\(auth\/.*?\)\.?/g, "").replace(/^Error\s*/, "").trim() || "Something went wrong. Please try again.";
  }

  function startPolling(em, password) {
    pendingRef.current = { email: em, pw: password };
    setElapsed(0);
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: pendingRef.current.email,
          password: pendingRef.current.pw,
        });
        if (!error && data?.session) {
          clearInterval(pollRef.current);
          clearInterval(tickRef.current);
        }
      } catch {}
    }, 5000);
  }

  function stopPolling() {
    clearInterval(pollRef.current);
    clearInterval(tickRef.current);
  }
  useEffect(() => () => stopPolling(), []);

  async function submit() {
    const em = email.trim();
    if (!em || !pw) return;
    if (tab === "signup" && !name.trim()) return;
    setBusy(true);
    setErr("");
    setInfo("");
    setResent(false);
    try {
      if (tab === "signup") {
        const roleValue = role === "client" ? "patient" : role;
        const { data, error } = await supabase.auth.signUp({
          email: em,
          password: pw,
          options: {
            data: { full_name: name.trim(), role: roleValue },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data?.user) {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            email: data.user.email,
            first_name: name.trim(),
            role: roleValue,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" });
        }
        if (data?.session) {
          // Session exists; auth state will update and LoginPage will redirect
        } else {
          setStep("verify");
          startPolling(em, pw);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
        if (error) throw error;
        if (remember) {
          localStorage.setItem("mt_rem_email", em);
          localStorage.setItem("mt_rem_pw", pw);
        } else {
          localStorage.removeItem("mt_rem_email");
          localStorage.removeItem("mt_rem_pw");
        }
      }
    } catch (e) {
      const code = e.code || e.message || "";
      const msg = e.message || "";
      setErr(friendlyError(code, msg));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    setErr("");
    setResent(false);
    try {
      await supabase.auth.resend({ type: "signup", email: pendingRef.current.email });
      setResent(true);
      stopPolling();
      startPolling(pendingRef.current.email, pendingRef.current.pw);
    } catch {
      setErr("Couldn't resend. Please wait a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReset() {
    const em = (resetEmail || email).trim();
    if (!em) {
      setErr("Enter your email address above first.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await supabase.auth.resetPasswordForEmail(em, { redirectTo: window.location.origin + "/" });
      setInfo(`✓ Reset link sent to ${em} — check your inbox (and spam folder).`);
    } catch (e) {
      setErr(friendlyError(e.code, e.message));
    } finally {
      setBusy(false);
    }
  }

  function backToForm() {
    stopPolling();
    setStep("form");
    setErr("");
    setInfo("");
    setResent(false);
    setElapsed(0);
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const L = loginLight;
  const rBg = L ? "#ffffff" : "#0d1117";
  const panelBorder = L ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.07)";
  const rT1 = L ? "#0a0e1a" : "#ffffff";
  const rT2 = L ? "#1a2d5a" : "#d4e4ff";
  const rT3 = L ? "#3d5490" : "#7a9acc";
  const rSub = L ? "rgba(37,99,235,.07)" : "rgba(255,255,255,.06)";
  const rSubBr = L ? "rgba(37,99,235,.18)" : "rgba(255,255,255,.10)";
  const rInpBg = L ? "#f4f7ff" : "rgba(255,255,255,.08)";
  const rInpBr = L ? "rgba(37,99,235,.25)" : "rgba(255,255,255,.18)";
  const rInpC = L ? "#0a0e1a" : "#ffffff";
  const rGlowA = L ? "rgba(37,99,235,.06)" : "rgba(37,99,235,.14)";
  const rGlowB = L ? "rgba(6,182,212,.04)" : "rgba(6,182,212,.08)";
  const INP = {
    width: "100%", padding: "13px 16px",
    background: rInpBg, border: `1.5px solid ${rInpBr}`,
    borderRadius: 12, color: rInpC,
    fontFamily: "'DM Sans',sans-serif", fontSize: 14.5,
    outline: "none", transition: "all .2s", caretColor: "#3b82f6", fontWeight: 400,
  };
  const LBL = {
    display: "block", fontSize: 11, fontWeight: 700,
    color: L ? "#1a2d5a" : "#d4e4ff",
    letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 8,
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: "'DM Sans',sans-serif", background: L ? "#eff2fc" : "#080b14", transition: "background .3s" }}>
      <style>{`
        .auth-inp::placeholder { color:${L ? "rgba(26,45,90,.45)" : "rgba(180,210,255,.55)"} !important }
        .auth-inp:focus { border-color:#3b82f6 !important; box-shadow:0 0 0 3.5px rgba(37,99,235,.2) !important; background:${L ? "#fff" : "rgba(255,255,255,.12)"} !important }
        .auth-tab { color:${L ? "#3d5490" : "#7a9acc"} }
        .auth-tab:hover:not(.auth-tab-on) { background:${L ? "rgba(37,99,235,.08)" : "rgba(255,255,255,.09)"} !important; color:${L ? "#0a0e1a" : "#d4e4ff"} !important }
        .auth-ghost:hover:not(:disabled) { background:${L ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.12)"} !important; color:${L ? "#0a0e1a" : "#d4e4ff"} !important }
        .left-feat { display:flex; align-items:center; gap:14px; padding:14px 16px; border-radius:14px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); transition:background .2s }
        .left-feat:hover { background:rgba(255,255,255,.13) }
      `}</style>

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }} id="auth-left-panel">
        <style>{`#auth-left-panel{display:none}@media(min-width:900px){#auth-left-panel{display:block}}`}</style>
        <img src={PILLS_BG} alt="medications"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%", filter: "saturate(.9) brightness(.68)" }}/>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(6,7,14,.95) 0%, rgba(6,7,14,.3) 45%, transparent 100%)" }}/>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(14,18,52,.35) 0%, transparent 55%)" }}/>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "48px 52px 56px", zIndex: 2 }}>
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 52 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(37,99,235,.25)", border: "1px solid rgba(37,99,235,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <HeartPulse size={20} color="#93c5fd"/>
            </div>
            <span style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 22, color: "#fff", fontStyle: "italic" }}>MedTrack</span>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(147,197,253,.9)", marginBottom: 14 }}>Personal Health Management</p>
            <h1 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 48, lineHeight: 1.08, color: "#fff", letterSpacing: "-.5px", marginBottom: 18, fontStyle: "italic", fontWeight: 600 }}>
              Your medications,<br/><span style={{ color: "#93c5fd" }}>always in order.</span>
            </h1>
            <p style={{ fontSize: 14, color: "rgba(200,218,255,.8)", lineHeight: 1.8, maxWidth: 390, marginBottom: 38 }}>
              A personal health companion that keeps prescriptions organised, sends smart reminders, and answers your questions whenever you need them.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                { I: () => null, t: "Email Reminders", d: "Get notified at exactly the right time" },
                { I: () => null, t: "AI Health Advisor", d: "Powered by real drug information" },
                { I: () => null, t: "Adherence Tracking", d: "Weekly insights to help you stay consistent" },
              ].map((f, i) => (
                <motion.div key={f.t} className="left-feat" initial={{ opacity: 0, x: -22 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(37,99,235,.2)", border: "1px solid rgba(37,99,235,.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} />
                  <div>
                    <p style={{ color: "rgba(226,235,255,.92)", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{f.t}</p>
                    <p style={{ color: "rgba(180,200,240,.65)", fontSize: 12 }}>{f.d}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 500, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "44px 48px", background: rBg, borderLeft: `1px solid ${panelBorder}`, minHeight: "100vh", position: "relative", overflow: "hidden", fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ position: "absolute", width: 420, height: 420, top: "-120px", right: "-110px", borderRadius: "50%", pointerEvents: "none", background: `radial-gradient(circle,${rGlowA} 0%,transparent 70%)` }}/>
        <div style={{ position: "absolute", width: 300, height: 300, bottom: "-80px", left: "-80px", borderRadius: "50%", pointerEvents: "none", background: `radial-gradient(circle,${rGlowB} 0%,transparent 70%)` }}/>
        <button onClick={toggleLoginTheme} style={{ position: "absolute", top: 20, right: 20, zIndex: 10, display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 99, border: `1px solid ${rInpBr}`, background: L ? "#f1f5ff" : "rgba(255,255,255,.07)", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: rT3, transition: "all .22s" }}>
          {L ? "Dark mode" : "Light mode"}
        </button>
        <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400, margin: "0 auto" }}>
          <div id="mob-logo" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
            <style>{`@media(min-width:900px){#mob-logo{display:none!important}}`}</style>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: L ? "rgba(37,99,235,.12)" : "rgba(37,99,235,.2)", border: "1px solid rgba(37,99,235,.38)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <HeartPulse size={16} color="#3b82f6"/>
            </div>
            <span style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, color: rT1, fontStyle: "italic" }}>MedTrack</span>
          </div>

          <AnimatePresence mode="wait">
            {step === "verify" && (
              <motion.div key="verify" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28 }}>
                <div style={{ position: "relative", width: 68, height: 68, marginBottom: 28 }}>
                  <div style={{ position: "absolute", inset: -12, borderRadius: 26, background: "rgba(6,182,212,.1)" }}/>
                  <div style={{ width: 68, height: 68, borderRadius: 20, background: "rgba(6,182,212,.1)", border: "1.5px solid rgba(6,182,212,.28)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <Mail size={28} color="#22d3ee"/>
                  </div>
                </div>
                <h2 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 28, fontStyle: "italic", color: rT1, fontWeight: 600, lineHeight: 1.1, marginBottom: 8 }}>Verify your email</h2>
                <p style={{ fontSize: 14, color: rT2, lineHeight: 1.7, marginBottom: 20 }}>
                  Confirmation link sent to <strong style={{ color: rT1 }}>{pendingRef.current.email}</strong>
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderRadius: 12, background: "rgba(6,182,212,.07)", border: "1px solid rgba(6,182,212,.2)", marginBottom: 20 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22d3ee", flexShrink: 0, display: "block" }}/>
                  <div>
                    <p style={{ color: "#22d3ee", fontSize: 13, fontWeight: 600 }}>Waiting for verification</p>
                    <p style={{ color: rT2, fontSize: 11, marginTop: 2 }}>Checking every 5s · {mm}:{ss} elapsed</p>
                  </div>
                </div>
                <AnimatePresence>
                  {err && <ErrBanner msg={err} loginLight={L}/>}
                  {resent && <OkBanner msg="Verification email resent successfully." loginLight={L}/>}
                </AnimatePresence>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button className="auth-ghost" disabled={busy} onClick={resendVerification} style={{ width: "100%", padding: 12, borderRadius: 11, background: L ? "rgba(0,0,0,.04)" : "rgba(255,255,255,.06)", border: `1px solid ${rInpBr}`, color: rT3, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .2s" }}>
                    {busy ? <Loader2 size={14} className="auth-spin"/> : <><RefreshCw size={13}/> Resend email</>}
                  </button>
                  <button onClick={backToForm} style={{ width: "100%", padding: 12, borderRadius: 11, background: "transparent", border: `1px solid ${rInpBr}`, color: rT3, fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <ArrowRight size={13} style={{ transform: "rotate(180deg)" }}/> Back to sign in
                  </button>
                </div>
              </motion.div>
            )}

            {step === "reset" && (
              <motion.div key="reset" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28 }}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: L ? "rgba(37,99,235,.1)" : "rgba(37,99,235,.14)", border: "1.5px solid rgba(37,99,235,.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                  <KeyRound size={26} color="#3b82f6"/>
                </div>
                <h2 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 28, fontStyle: "italic", color: rT1, fontWeight: 600, lineHeight: 1.1, marginBottom: 8 }}>Reset your password</h2>
                <p style={{ fontSize: 14, color: rT2, lineHeight: 1.65, marginBottom: 6 }}>Enter your email and we'll send you a link to create a new password.</p>
                <p style={{ fontSize: 12, color: rT3, lineHeight: 1.55, marginBottom: 20, padding: "9px 13px", borderRadius: 9, background: L ? "rgba(37,99,235,.06)" : "rgba(37,99,235,.08)", border: "1px solid rgba(37,99,235,.14)" }}>
                  The link will open a secure page where you can set a new password. It expires in 1 hour.
                </p>
                <div style={{ marginBottom: 18 }}>
                  <label style={LBL}>Email address</label>
                  <input className="auth-inp" style={INP} type="email" value={resetEmail || email} placeholder="you@example.com" onChange={(e) => setResetEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendReset()}/>
                </div>
                <AnimatePresence>
                  {err && <ErrBanner msg={err} loginLight={L}/>}
                  {info && <OkBanner msg={info} loginLight={L}/>}
                </AnimatePresence>
                {info ? (
                  <button onClick={backToForm} style={{ width: "100%", padding: 14, borderRadius: 12, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 18px rgba(37,99,235,.3)" }}>
                    <ArrowRight size={14} style={{ transform: "rotate(180deg)" }}/> Back to Sign In
                  </button>
                ) : (
                  <>
                    <button className="auth-btn" disabled={busy} onClick={sendReset} style={{ width: "100%", padding: 14, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 12, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 18px rgba(37,99,235,.3)", transition: "all .2s", marginBottom: 10 }}>
                      {busy ? <Loader2 size={15} className="auth-spin"/> : <><Mail size={14}/> Send Reset Link</>}
                    </button>
                    <button onClick={backToForm} style={{ marginTop: 10, width: "100%", padding: 12, borderRadius: 11, background: "transparent", border: `1px solid ${rInpBr}`, color: rT3, fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                      <ArrowRight size={13} style={{ transform: "rotate(180deg)" }}/> Back to sign in
                    </button>
                  </>
                )}
              </motion.div>
            )}

            {step === "form" && (
              <motion.div key="form" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.26 }}>
                <h2 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 40, fontStyle: "italic", fontWeight: 600, lineHeight: 1.06, color: rT1, letterSpacing: "-.4px", marginBottom: 10 }}>
                  {tab === "login" ? <>Welcome <span style={{ color: "#3b82f6" }}>back.</span></> : <>Get <span style={{ color: "#3b82f6" }}>started.</span></>}
                </h2>
                <p style={{ fontSize: 15, color: rT2, lineHeight: 1.65, marginBottom: 28, fontWeight: 400 }}>
                  {tab === "login" ? "Sign in to your health dashboard." : "Create your free account today."}
                </p>
                <AnimatePresence>
                  {info && <OkBanner msg={info} loginLight={L} onDismiss={() => setInfo("")}/>}
                </AnimatePresence>
                <div style={{ display: "flex", gap: 0, background: rSub, border: `1px solid ${rSubBr}`, borderRadius: 12, padding: 4, marginBottom: 26 }}>
                  {[["login", "Sign In"], ["signup", "Sign Up"]].map(([v, l]) => (
                    <button key={v} className={`auth-tab ${tab === v ? "auth-tab-on" : "auth-tab-off"}`} onClick={() => { setTab(v); setErr(""); setInfo(""); }} style={{ flex: 1, padding: 10, borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, transition: "all .18s", background: "transparent" }}>
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 17 }}>
                  <AnimatePresence>
                    {tab === "signup" && (
                      <motion.div key="nf" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                        <div style={{ marginBottom: 14 }}>
                          <label style={LBL}>Your name</label>
                          <input className="auth-inp" style={INP} type="text" value={name} placeholder="e.g. Jamie or Dr. Patel" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}/>
                        </div>
                        <label style={LBL}>I am a</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          {[["client", "Patient"], ["doctor", "Doctor"], ["pharmacist", "Pharmacist"]].map(([v, l]) => (
                            <button key={v} type="button" onClick={() => setRole(v)} style={{ flex: 1, padding: "10px 8px", borderRadius: 11, border: "1.5px solid", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .18s", borderColor: role === v ? "#2563eb" : rInpBr, background: role === v ? "rgba(37,99,235,.14)" : "transparent", color: role === v ? "#3b82f6" : rT3 }}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div>
                    <label style={LBL}>Email address</label>
                    <input className="auth-inp" style={INP} type="email" value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}/>
                  </div>
                  <div>
                    <label style={LBL}>Password</label>
                    <div style={{ position: "relative" }}>
                      <input className="auth-inp" style={{ ...INP, paddingRight: 46 }} type={vis ? "text" : "password"} value={pw} placeholder="••••••••" onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}/>
                      <button onClick={() => setVis(!vis)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: rT3, display: "flex", padding: 0 }}>
                        {vis ? <EyeOff size={16}/> : <Eye size={16}/>}
                      </button>
                    </div>
                  </div>
                  <AnimatePresence>
                    {tab === "login" && (
                      <motion.div key="rem" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <label onClick={() => setRemember(!remember)} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", userSelect: "none" }}>
                          <span style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .18s", background: remember ? "#2563eb" : "transparent", border: `2px solid ${remember ? "#2563eb" : rInpBr}`, boxShadow: remember ? "0 0 10px rgba(37,99,235,.4)" : "none" }}>
                            {remember && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: rT2 }}>Remember me</span>
                        </label>
                        <button onClick={() => { setStep("reset"); setResetEmail(email); setErr(""); setInfo(""); }} style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", cursor: "pointer", background: "none", border: "none", padding: 0, fontFamily: "inherit" }}>
                          Forgot password?
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {err && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <ErrBanner msg={err} loginLight={L}/>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <button className="auth-btn" disabled={busy || !email.trim() || !pw || (tab === "signup" && !name.trim())} onClick={submit} style={{ width: "100%", padding: 14, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 12, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(37,99,235,.28)", letterSpacing: ".01em", transition: "all .2s" }}>
                    {busy ? <Loader2 size={15} className="auth-spin"/> : tab === "login" ? "Sign In" : "Create Account"}
                  </button>
                  {tab === "signup" && (
                    <p style={{ fontSize: 12, color: rT3, textAlign: "center", lineHeight: 1.7 }}>A verification email will be sent to your address.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
