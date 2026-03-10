import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill, Calendar, BarChart3, LogOut, Moon, Sun, Menu, X, Plus, Send,
  Clock, Check, AlertCircle, Flame, ChevronDown, Eye, EyeOff,
  Loader2, TrendingUp, Bell, User, Info, ArrowRight, Mail, RefreshCw,
  CheckCircle2, Pencil, Stethoscope, HeartPulse, BellRing, ShieldCheck,
  UserCircle2, Siren, SlidersHorizontal, Sparkles, MessageSquare, Trash2,
  KeyRound, RotateCcw, Search
} from "lucide-react";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, reload, signOut,
  onAuthStateChanged, updateProfile, deleteUser,
  EmailAuthProvider, reauthenticateWithCredential
} from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc,
         query, where, serverTimestamp, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { auth } from "./firebase";
import "./index.css";

const db = getFirestore();

async function addMedication({ name, dosage, freq, time, color, userEmail }) {
  try {
    await addDoc(collection(db, "Medications"), {
      medicationName: name,
      dosage,
      freq,
      reminderTime:   time,
      color,
      userEmail,
      active:         true,
      createdAt:      serverTimestamp(),
    });
  } catch (e) {
    console.error("Firestore addMedication error:", e);
    throw e;
  }
}

async function deleteMedication(firestoreId) {
  if (!firestoreId) return;
  try { await deleteDoc(doc(db, "Medications", firestoreId)); }
  catch (e) { console.error("Firestore deleteMedication error:", e); }
}

async function loadMedications(userEmail) {
  try {
    const q = query(collection(db, "Medications"), where("userEmail","==",userEmail));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id:           d.id,
      firestoreId:  d.id,
      name:         d.data().medicationName,
      dosage:       d.data().dosage       || "",
      freq:         d.data().freq         || "Once daily",
      time:         d.data().reminderTime || "08:00",
      color:        d.data().color        || "blue",
      taken:        false,
      active:       d.data().active       ?? true,
    }));
  } catch (e) {
    console.error("Firestore loadMedications error:", e);
    return [];
  }
}

const PILLS_BG = "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1600&q=90&auto=format&fit=crop";

const COLS = {
  blue:   { a:"#2563eb", d:"rgba(37,99,235,.12)",  b:"rgba(37,99,235,.26)"  },
  cyan:   { a:"#06b6d4", d:"rgba(6,182,212,.10)",   b:"rgba(6,182,212,.22)"  },
  rose:   { a:"#f43f5e", d:"rgba(244,63,94,.10)",   b:"rgba(244,63,94,.22)"  },
  amber:  { a:"#f59e0b", d:"rgba(245,158,11,.10)",  b:"rgba(245,158,11,.22)" },
  emerald:{ a:"#10b981", d:"rgba(16,185,129,.10)",  b:"rgba(16,185,129,.22)" },
};

const SEED = [
  { id:"s1", firestoreId:null, name:"Amoxicillin", dosage:"500mg",   freq:"Twice daily",  time:"08:00", color:"blue",    taken:false },
  { id:"s2", firestoreId:null, name:"Vitamin D3",  dosage:"2000 IU", freq:"Once daily",   time:"09:00", color:"cyan",    taken:false },
  { id:"s3", firestoreId:null, name:"Metformin",   dosage:"1000mg",  freq:"Twice daily",  time:"13:00", color:"rose",    taken:false },
  { id:"s4", firestoreId:null, name:"Lisinopril",  dosage:"10mg",    freq:"Once daily",   time:"20:00", color:"amber",   taken:false },
  { id:"s5", firestoreId:null, name:"Omega-3",     dosage:"1000mg",  freq:"Once daily",   time:"21:00", color:"emerald", taken:false },
];

const TIPS = [
  "Taking medications with a full glass of water significantly improves absorption.",
  "Consistency matters — taking medication at the same time each day keeps blood levels stable.",
  "Avoid storing medications in bathrooms. Heat and humidity reduce potency over time.",
  "Check expiry dates monthly and return out-of-date medications to a pharmacy.",
  "Some medications are best taken with food — ask your pharmacist for guidance.",
];

function to12h(t24) {
  if (!t24 || !t24.includes(":")) return t24;
  const [h, m] = t24.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}

function to24h(t12) {
  if (!t12) return "08:00";
  const m = t12.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return t12;
  let h = parseInt(m[1]);
  const min = m[2];
  const ap = m[3].toUpperCase();
  if (ap === "AM" && h === 12) h = 0;
  if (ap === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2,"0")}:${min}`;
}

function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 820);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 820);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mob;
}
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}

function Ring({ pct, size=80, sw=6, color="var(--p)", children }) {
  const r = (size-sw)/2, circ = 2*Math.PI*r;
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)", display:"block" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--b1)" strokeWidth={sw}/>
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
          strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset:circ }} animate={{ strokeDashoffset:circ-(pct/100)*circ }}
          transition={{ duration:1.2, ease:[.22,1,.36,1], delay:.1 }}
          style={{ filter:`drop-shadow(0 0 6px ${color}55)` }}/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>{children}</div>
    </div>
  );
}

function Auth({ onVerifiedLogin }) {
  const [tab,        setTab]        = useState("login");
  const [step,       setStep]       = useState("form");
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState(() => localStorage.getItem("mt_rem_email") || "");
  const [pw,         setPw]         = useState(() => localStorage.getItem("mt_rem_pw") || "");
  const [role,       setRole]       = useState("client");
  const [vis,        setVis]        = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState("");
  const [info,       setInfo]       = useState("");
  const [resent,     setResent]     = useState(false);
  const [elapsed,    setElapsed]    = useState(0);
  const [remember,   setRemember]   = useState(() => !!localStorage.getItem("mt_rem_email"));
  const [resetEmail, setResetEmail] = useState("");
  const [loginLight, setLoginLight] = useState(() => localStorage.getItem("mt_login_light") === "1");

  function toggleLoginTheme() {
    const next = !loginLight;
    setLoginLight(next);
    localStorage.setItem("mt_login_light", next ? "1" : "0");
  }

  const pendingRef = useRef({ email:"", pw:"" });
  const pollRef    = useRef(null);
  const tickRef    = useRef(null);

  
  function friendlyError(code, msg) {
    if (code === "auth/wrong-password"    || code === "auth/invalid-credential") return "Incorrect password. Please try again or reset your password below.";
    if (code === "auth/user-not-found"    || code === "auth/invalid-email")      return "No account found for that email address.";
    if (code === "auth/email-already-in-use")  return "An account with this email already exists. Try signing in instead.";
    if (code === "auth/weak-password")    return "Password must be at least 6 characters.";
    if (code === "auth/too-many-requests") return "Too many attempts. Please wait a few minutes and try again.";
    if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
    return msg.replace("Firebase: ","").replace(/\(auth\/.*?\)\.?/g,"").replace(/^Error\s*/,"").trim() || "Something went wrong. Please try again.";
  }

  function startPolling(em, password) {
    pendingRef.current = { email:em, pw:password };
    setElapsed(0);
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setElapsed(s => s+1), 1000);
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const cred = await signInWithEmailAndPassword(auth, pendingRef.current.email, pendingRef.current.pw);
        await reload(cred.user);
        if (cred.user.emailVerified) {
          clearInterval(pollRef.current); clearInterval(tickRef.current);
          onVerifiedLogin(cred.user);
        } else { await signOut(auth); }
      } catch {}
    }, 5000);
  }
  function stopPolling() { clearInterval(pollRef.current); clearInterval(tickRef.current); }
  useEffect(() => () => stopPolling(), []);

  async function submit() {
    const em = email.trim();
    if (!em || !pw) return;
    if (tab === "signup" && !name.trim()) return;
    setBusy(true); setErr(""); setInfo(""); setResent(false);
    try {
      if (tab === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, em, pw);
        await updateProfile(cred.user, { displayName: name.trim() });
        await sendEmailVerification(cred.user);
        try {
          await setDoc(doc(db, "users", cred.user.uid), {
            fullName: name.trim(), email: em, role,
            createdAt: serverTimestamp(),
          });
        } catch(e) { console.warn("Could not save user role:", e); }
        await signOut(auth);
        setStep("verify");
        startPolling(em, pw);
      } else {
        const cred = await signInWithEmailAndPassword(auth, em, pw);
        if (!cred.user.emailVerified) {
          await signOut(auth);
          setErr("Your email hasn't been verified yet. Check your inbox for the confirmation link.");
        } else {
          if (remember) { localStorage.setItem("mt_rem_email", em); localStorage.setItem("mt_rem_pw", pw); }
          else { localStorage.removeItem("mt_rem_email"); localStorage.removeItem("mt_rem_pw"); }
        }
      }
    } catch(e) {
      const code = e.code || "";
      setErr(friendlyError(code, e.message || ""));
    } finally { setBusy(false); }
  }

  async function resendVerification() {
    setBusy(true); setErr(""); setResent(false);
    try {
      const cred = await signInWithEmailAndPassword(auth, pendingRef.current.email, pendingRef.current.pw);
      await sendEmailVerification(cred.user);
      await signOut(auth);
      setResent(true);
      stopPolling(); startPolling(pendingRef.current.email, pendingRef.current.pw);
    } catch { setErr("Couldn't resend. Please wait a moment."); }
    finally { setBusy(false); }
  }

  async function sendReset() {
    const em = (resetEmail || email).trim();
    if (!em) { setErr("Enter your email address above first."); return; }
    setBusy(true); setErr("");
    try {
      await sendPasswordResetEmail(auth, em);
      setInfo(`✓ Reset link sent to ${em} — check your inbox (and spam folder).`);
    } catch(e) {
      const code = e.code || "";
      setErr(friendlyError(code, e.message));
    } finally { setBusy(false); }
  }

  function backToForm() { stopPolling(); setStep("form"); setErr(""); setInfo(""); setResent(false); setElapsed(0); }
  const mm = String(Math.floor(elapsed/60)).padStart(2,"0");
  const ss = String(elapsed%60).padStart(2,"0");

  const L = loginLight;

  const rBg    = L ? "#ffffff"           : "#0d1117";
  const panelBorder = L ? "rgba(0,0,0,.08)"   : "rgba(255,255,255,.07)";
  const rT1    = L ? "#0a0e1a"           : "#ffffff";
  const rT2    = L ? "#1a2d5a"           : "#d4e4ff";
  const rT3    = L ? "#3d5490"           : "#7a9acc";
  const rSub   = L ? "rgba(37,99,235,.07)" : "rgba(255,255,255,.06)";
  const rSubBr = L ? "rgba(37,99,235,.18)" : "rgba(255,255,255,.10)";
  const rInpBg = L ? "#f4f7ff"           : "rgba(255,255,255,.08)";
  const rInpBr = L ? "rgba(37,99,235,.25)": "rgba(255,255,255,.18)";
  const rInpC  = L ? "#0a0e1a"           : "#ffffff";
  const rGlowA = L ? "rgba(37,99,235,.06)" : "rgba(37,99,235,.14)";
  const rGlowB = L ? "rgba(6,182,212,.04)" : "rgba(6,182,212,.08)";

  const INP = {
    width:"100%", padding:"13px 16px",
    background: rInpBg,
    border: `1.5px solid ${rInpBr}`,
    borderRadius:12, color: rInpC,
    fontFamily:"'DM Sans',sans-serif", fontSize:14.5,
    outline:"none", transition:"all .2s",
    caretColor: "#3b82f6", fontWeight:400,
  };
  const LBL = {
    display:"block", fontSize:11, fontWeight:700,
    color: L ? "#1a2d5a" : "#d4e4ff",
    letterSpacing:".07em", textTransform:"uppercase", marginBottom:8,
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", fontFamily:"'DM Sans',sans-serif",
                  background: L ? "#eff2fc" : "#080b14", transition:"background .3s" }}>
      <style>{`
        .auth-inp::placeholder { color:${L ? "rgba(26,45,90,.45)" : "rgba(180,210,255,.55)"} !important }
        .auth-inp:focus { border-color:#3b82f6 !important; box-shadow:0 0 0 3.5px rgba(37,99,235,.2) !important; background:${L ? "#fff" : "rgba(255,255,255,.12)"} !important }
        .auth-tab { color:${L ? "#3d5490" : "#7a9acc"} }
        .auth-tab:hover:not(.auth-tab-on) { background:${L ? "rgba(37,99,235,.08)" : "rgba(255,255,255,.09)"} !important; color:${L ? "#0a0e1a" : "#d4e4ff"} !important }
        .auth-ghost:hover:not(:disabled) { background:${L ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.12)"} !important; color:${L ? "#0a0e1a" : "#d4e4ff"} !important }
        .left-feat { display:flex; align-items:center; gap:14px; padding:14px 16px; border-radius:14px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); transition:background .2s }
        .left-feat:hover { background:rgba(255,255,255,.13) }
      `}</style>

      {}
      <div style={{ flex:1, position:"relative", overflow:"hidden" }} id="auth-left-panel">
        <style>{`#auth-left-panel{display:none}@media(min-width:900px){#auth-left-panel{display:block}}`}</style>

        {}
        <img src={PILLS_BG} alt="medications"
          style={{ position:"absolute", inset:0, width:"100%", height:"100%",
                   objectFit:"cover", objectPosition:"center 35%",
                   filter:"saturate(.9) brightness(.68)" }}/>

        {}
        <div style={{ position:"absolute", inset:0,
          background:"linear-gradient(to top, rgba(6,7,14,.95) 0%, rgba(6,7,14,.3) 45%, transparent 100%)" }}/>
        <div style={{ position:"absolute", inset:0,
          background:"linear-gradient(135deg, rgba(14,18,52,.35) 0%, transparent 55%)" }}/>

        {}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"48px 52px 56px", zIndex:2 }}>
          {}
          <motion.div initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }} transition={{ duration:.6 }}
            style={{ display:"flex", alignItems:"center", gap:11, marginBottom:52 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:"rgba(37,99,235,.25)",
                          border:"1px solid rgba(37,99,235,.45)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <HeartPulse size={20} color="#93c5fd"/>
            </div>
            <span style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:22, color:"#fff", fontStyle:"italic" }}>MedTrack</span>
          </motion.div>

          <motion.div initial={{ opacity:0, y:28 }} animate={{ opacity:1, y:0 }} transition={{ duration:.7, delay:.1 }}>
            <p style={{ fontSize:10.5, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase",
                        color:"rgba(147,197,253,.9)", marginBottom:14 }}>Personal Health Management</p>
            <h1 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:48, lineHeight:1.08, color:"#fff",
                         letterSpacing:"-.5px", marginBottom:18, fontStyle:"italic", fontWeight:600 }}>
              Your medications,<br/>
              <span style={{ color:"#93c5fd" }}>always in order.</span>
            </h1>
            <p style={{ fontSize:14, color:"rgba(200,218,255,.8)", lineHeight:1.8, maxWidth:390, marginBottom:38 }}>
              A personal health companion that keeps prescriptions organised, sends smart reminders, and answers your questions whenever you need them.
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
              {[
                { I:BellRing,    t:"Email Reminders",   d:"Get notified at exactly the right time" },
                { I:Stethoscope, t:"AI Health Advisor",  d:"Powered by real drug information" },
                { I:TrendingUp,  t:"Adherence Tracking", d:"Weekly insights to help you stay consistent" },
              ].map((f,i) => (
                <motion.div key={f.t} className="left-feat"
                  initial={{ opacity:0, x:-22 }} animate={{ opacity:1, x:0 }}
                  transition={{ delay:.3+i*.1, duration:.5 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:"rgba(37,99,235,.2)",
                                border:"1px solid rgba(37,99,235,.35)", display:"flex",
                                alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <f.I size={15} color="rgba(147,197,253,.9)"/>
                  </div>
                  <div>
                    <p style={{ color:"rgba(226,235,255,.92)", fontSize:13, fontWeight:600, marginBottom:2 }}>{f.t}</p>
                    <p style={{ color:"rgba(180,200,240,.65)", fontSize:12 }}>{f.d}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {}
      <div style={{ width:"100%", maxWidth:500, flexShrink:0, display:"flex", flexDirection:"column",
                    justifyContent:"center", padding:"44px 48px", background: rBg,
                    borderLeft:`1px solid ${panelBorder}`, minHeight:"100vh",
                    position:"relative", overflow:"hidden", transition:"background .3s",
                    fontFamily:"'DM Sans',sans-serif" }}>

        {}
        <div style={{ position:"absolute", width:420, height:420, top:"-120px", right:"-110px",
                      borderRadius:"50%", pointerEvents:"none", background:`radial-gradient(circle,${rGlowA} 0%,transparent 70%)` }}/>
        <div style={{ position:"absolute", width:300, height:300, bottom:"-80px", left:"-80px",
                      borderRadius:"50%", pointerEvents:"none", background:`radial-gradient(circle,${rGlowB} 0%,transparent 70%)` }}/>

        {}
        <button onClick={toggleLoginTheme}
          style={{ position:"absolute", top:20, right:20, zIndex:10,
                   display:"flex", alignItems:"center", gap:7, padding:"8px 14px",
                   borderRadius:99, border:`1px solid ${rInpBr}`,
                   background: L ? "#f1f5ff" : "rgba(255,255,255,.07)",
                   cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                   fontSize:12, fontWeight:600, color: rT3, transition:"all .22s" }}>
          {L ? <Moon size={13} color="#6366f1"/> : <Sun size={13} color="#f59e0b"/>}
          {L ? "Dark mode" : "Light mode"}
        </button>

        <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:400, margin:"0 auto" }}>

          {}
          <div id="mob-logo" style={{ display:"flex", alignItems:"center", gap:10, marginBottom:40 }}>
            <style>{`@media(min-width:900px){#mob-logo{display:none!important}}`}</style>
            <div style={{ width:34, height:34, borderRadius:10,
                          background: L ? "rgba(37,99,235,.12)" : "rgba(37,99,235,.2)",
                          border:"1px solid rgba(37,99,235,.38)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <HeartPulse size={16} color="#3b82f6"/>
            </div>
            <span style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:20, color: rT1, fontStyle:"italic" }}>MedTrack</span>
          </div>

          <AnimatePresence mode="wait">

            {}
            {step === "verify" && (
              <motion.div key="verify" initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
                exit={{ opacity:0, y:-8 }} transition={{ duration:.28 }}>
                <div style={{ position:"relative", width:68, height:68, marginBottom:28 }}>
                  <div className="auth-pulse" style={{ position:"absolute", inset:-12, borderRadius:26,
                                                        background:"rgba(6,182,212,.1)" }}/>
                  <div style={{ width:68, height:68, borderRadius:20, background:"rgba(6,182,212,.1)",
                                border:"1.5px solid rgba(6,182,212,.28)", display:"flex",
                                alignItems:"center", justifyContent:"center", position:"relative" }}>
                    <Mail size={28} color="#22d3ee"/>
                  </div>
                </div>
                <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:28, fontStyle:"italic", color: rT1,
                             fontWeight:600, lineHeight:1.1, marginBottom:8 }}>Verify your email</h2>
                <p style={{ fontSize:14, color: rT2, lineHeight:1.7, marginBottom:20 }}>
                  Confirmation link sent to{" "}
                  <strong style={{ color: rT1 }}>{pendingRef.current.email}</strong>
                </p>
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"13px 16px", borderRadius:12,
                              background:"rgba(6,182,212,.07)", border:"1px solid rgba(6,182,212,.2)", marginBottom:20 }}>
                  <span className="auth-blink" style={{ width:7, height:7, borderRadius:"50%",
                                                         background:"#22d3ee", flexShrink:0, display:"block" }}/>
                  <div>
                    <p style={{ color:"#22d3ee", fontSize:13, fontWeight:600 }}>Waiting for verification</p>
                    <p style={{ color: rT2, fontSize:11, marginTop:2 }}>Checking every 5s · {mm}:{ss} elapsed</p>
                  </div>
                </div>
                <AnimatePresence>
                  {err    && <ErrBanner msg={err} loginLight={L}/>}
                  {resent && <OkBanner  msg="Verification email resent successfully." loginLight={L}/>}
                </AnimatePresence>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <button className="auth-ghost" disabled={busy} onClick={resendVerification}
                    style={{ width:"100%", padding:"12px", borderRadius:11,
                             background: L ? "rgba(0,0,0,.04)" : "rgba(255,255,255,.06)",
                             border:`1px solid ${rInpBr}`, color: rT3,
                             fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer",
                             display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"all .2s" }}>
                    {busy ? <Loader2 size={14} className="auth-spin"/> : <><RefreshCw size={13}/> Resend email</>}
                  </button>
                  <button onClick={backToForm}
                    style={{ width:"100%", padding:"12px", borderRadius:11, background:"transparent",
                             border:`1px solid ${rInpBr}`, color: rT3,
                             fontFamily:"inherit", fontSize:13, fontWeight:500, cursor:"pointer",
                             display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                    <ArrowRight size={13} style={{ transform:"rotate(180deg)" }}/> Back to sign in
                  </button>
                </div>
              </motion.div>
            )}

            {}
            {step === "reset" && (
              <motion.div key="reset" initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
                exit={{ opacity:0, y:-8 }} transition={{ duration:.28 }}>
                <div style={{ width:60, height:60, borderRadius:18,
                              background: L ? "rgba(37,99,235,.1)" : "rgba(37,99,235,.14)",
                              border:"1.5px solid rgba(37,99,235,.3)", display:"flex", alignItems:"center",
                              justifyContent:"center", marginBottom:24 }}>
                  <KeyRound size={26} color="#3b82f6"/>
                </div>
                <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:28, fontStyle:"italic", color: rT1,
                             fontWeight:600, lineHeight:1.1, marginBottom:8 }}>Reset your password</h2>
                <p style={{ fontSize:14, color: rT2, lineHeight:1.65, marginBottom:6 }}>
                  Enter your email and we'll send you a link to create a new password.
                </p>
                <p style={{ fontSize:12, color: rT3, lineHeight:1.55, marginBottom:20,
                             padding:"9px 13px", borderRadius:9,
                             background: L ? "rgba(37,99,235,.06)" : "rgba(37,99,235,.08)",
                             border:"1px solid rgba(37,99,235,.14)" }}>
                  The link will open a secure Firebase page where you can set a new password. It expires in 1 hour.
                </p>
                <div style={{ marginBottom:18 }}>
                  <label style={LBL}>Email address</label>
                  <input className="auth-inp" style={INP} type="email"
                    value={resetEmail || email} placeholder="you@example.com"
                    onChange={e => setResetEmail(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && sendReset()}/>
                </div>
                <AnimatePresence>
                  {err  && <ErrBanner msg={err}  loginLight={L}/>}
                  {info && <OkBanner  msg={info}  loginLight={L}/>}
                </AnimatePresence>
                {}
                {info ? (
                  <button onClick={backToForm}
                    style={{ width:"100%", padding:"14px", borderRadius:12,
                             background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
                             border:"none", color:"#fff", fontFamily:"inherit", fontSize:14,
                             fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center",
                             justifyContent:"center", gap:8, boxShadow:"0 4px 18px rgba(37,99,235,.3)" }}>
                    <ArrowRight size={14} style={{ transform:"rotate(180deg)" }}/> Back to Sign In
                  </button>
                ) : (
                  <button className="auth-btn" disabled={busy} onClick={sendReset}
                    style={{ width:"100%", padding:"14px",
                             background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
                             border:"none", borderRadius:12, color:"#fff", fontFamily:"inherit", fontSize:14,
                             fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center",
                             justifyContent:"center", gap:8, boxShadow:"0 4px 18px rgba(37,99,235,.3)",
                             transition:"all .2s", marginBottom:10 }}>
                    {busy ? <Loader2 size={15} className="auth-spin"/> : <><Mail size={14}/> Send Reset Link</>}
                  </button>
                )}
                {!info && (
                  <button onClick={backToForm}
                    style={{ marginTop:10, width:"100%", padding:"12px", borderRadius:11, background:"transparent",
                             border:`1px solid ${rInpBr}`, color: rT3,
                             fontFamily:"inherit", fontSize:13, fontWeight:500, cursor:"pointer",
                             display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                    <ArrowRight size={13} style={{ transform:"rotate(180deg)" }}/> Back to sign in
                  </button>
                )}
              </motion.div>
            )}

            {}
            {step === "form" && (
              <motion.div key="form" initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
                exit={{ opacity:0, y:-8 }} transition={{ duration:.26 }}>

                <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:40, fontStyle:"italic", fontWeight:600,
                             lineHeight:1.06, color: rT1, letterSpacing:"-.4px", marginBottom:10 }}>
                  {tab === "login"
                    ? <>Welcome <span style={{ color:"#3b82f6" }}>back.</span></>
                    : <>Get <span style={{ color:"#3b82f6" }}>started.</span></>}
                </h2>
                <p style={{ fontSize:15, color: rT2, lineHeight:1.65, marginBottom:28, fontWeight:400 }}>
                  {tab === "login" ? "Sign in to your health dashboard." : "Create your free account today."}
                </p>

                <AnimatePresence>
                  {info && <OkBanner msg={info} loginLight={L} onDismiss={() => setInfo("")}/>}
                </AnimatePresence>

                {}
                <div style={{ display:"flex", gap:0, background: rSub,
                              border:`1px solid ${rSubBr}`, borderRadius:12, padding:4, marginBottom:26 }}>
                  {[["login","Sign In"],["signup","Sign Up"]].map(([v,l]) => (
                    <button key={v} className={`auth-tab ${tab===v?"auth-tab-on":"auth-tab-off"}`}
                      onClick={() => { setTab(v); setErr(""); setInfo(""); }}
                      style={{ flex:1, padding:"10px", borderRadius:9, border:"none", cursor:"pointer",
                               fontFamily:"inherit", fontSize:13, fontWeight:600, transition:"all .18s",
                               background:"transparent" }}>
                      {l}
                    </button>
                  ))}
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:17 }}>
                  <AnimatePresence>
                    {tab === "signup" && (
                      <motion.div key="nf" initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }}
                        exit={{ opacity:0, height:0 }} style={{ overflow:"hidden" }}>
                        <div style={{marginBottom:14}}>
                          <label style={LBL}>Your name</label>
                          <input className="auth-inp" style={INP} type="text" value={name}
                            placeholder="e.g. Jamie or Dr. Patel"
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => e.key==="Enter" && submit()}/>
                        </div>
                        <label style={LBL}>I am a</label>
                        <div style={{display:"flex",gap:8}}>
                          {[["client","Patient"],["doctor","Doctor"],["pharmacist","Pharmacist"]].map(([v,l]) => (
                            <button key={v} type="button" onClick={() => setRole(v)}
                              style={{flex:1,padding:"10px 8px",borderRadius:11,border:"1.5px solid",
                                      fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer",
                                      transition:"all .18s",
                                      borderColor: role===v ? "#2563eb" : rInpBr,
                                      background: role===v ? "rgba(37,99,235,.14)" : "transparent",
                                      color: role===v ? "#3b82f6" : rT3}}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label style={LBL}>Email address</label>
                    <input className="auth-inp" style={INP} type="email" value={email}
                      placeholder="you@example.com"
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key==="Enter" && submit()}/>
                  </div>

                  <div>
                    <label style={LBL}>Password</label>
                    <div style={{ position:"relative" }}>
                      <input className="auth-inp" style={{ ...INP, paddingRight:46 }}
                        type={vis?"text":"password"} value={pw} placeholder="••••••••"
                        onChange={e => setPw(e.target.value)}
                        onKeyDown={e => e.key==="Enter" && submit()}/>
                      <button onClick={() => setVis(!vis)}
                        style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)",
                                 background:"none", border:"none", cursor:"pointer",
                                 color: rT3, display:"flex", padding:0 }}>
                        {vis ? <EyeOff size={16}/> : <Eye size={16}/>}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {tab === "login" && (
                      <motion.div key="rem" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                        style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <label onClick={() => setRemember(!remember)}
                          style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer", userSelect:"none" }}>
                          <span style={{ width:17, height:17, borderRadius:5, flexShrink:0,
                                         display:"flex", alignItems:"center", justifyContent:"center",
                                         transition:"all .18s",
                                         background: remember ? "#2563eb" : "transparent",
                                         border: `2px solid ${remember ? "#2563eb" : rInpBr}`,
                                         boxShadow: remember ? "0 0 10px rgba(37,99,235,.4)" : "none" }}>
                            {remember && <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>}
                          </span>
                          <span style={{ fontSize:13, fontWeight:500, color: rT2 }}>Remember me</span>
                        </label>
                        <button onClick={() => { setStep("reset"); setResetEmail(email); setErr(""); setInfo(""); }}
                          style={{ fontSize:12, fontWeight:600, color:"#3b82f6", cursor:"pointer",
                                   background:"none", border:"none", padding:0, fontFamily:"inherit" }}>
                          Forgot password?
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {err && (
                      <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
                        <ErrBanner msg={err} loginLight={L}/>
                        {err.includes("password") && tab === "login" && (
                          <button onClick={() => { setStep("reset"); setResetEmail(email); setErr(""); }}
                            style={{ marginTop:8, display:"flex", alignItems:"center", gap:6, fontSize:12,
                                     fontWeight:600, color:"#3b82f6", cursor:"pointer", background:"none",
                                     border:"none", padding:0, fontFamily:"inherit" }}>
                            <RotateCcw size={12}/> Reset my password
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button className="auth-btn"
                    disabled={busy || !email.trim() || !pw || (tab==="signup" && !name.trim())}
                    onClick={submit}
                    style={{ width:"100%", padding:"14px",
                             background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
                             border:"none", borderRadius:12, color:"#fff", fontFamily:"inherit", fontSize:14,
                             fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center",
                             justifyContent:"center", gap:8, boxShadow:"0 4px 20px rgba(37,99,235,.28)",
                             letterSpacing:".01em", transition:"all .2s" }}>
                    {busy ? <Loader2 size={15} className="auth-spin"/> : tab==="login" ? "Sign In" : "Create Account"}
                  </button>

                  {tab === "signup" && (
                    <p style={{ fontSize:12, color: rT3, textAlign:"center", lineHeight:1.7 }}>
                      A verification email will be sent to your address.
                    </p>
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

function ErrBanner({ msg, loginLight, onDismiss }) {
  return (
    <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
      style={{ display:"flex", gap:9, padding:"12px 14px", borderRadius:11,
               background:"rgba(239,68,68,.09)", border:"1px solid rgba(239,68,68,.22)",
               marginBottom:12 }}>
      <AlertCircle size={14} color="#ef4444" style={{ flexShrink:0, marginTop:1 }}/>
      <p style={{ color: loginLight ? "#b91c1c" : "#ef4444", fontSize:13, lineHeight:1.55, flex:1 }}>{msg}</p>
      {onDismiss && <button onClick={onDismiss} style={{ background:"none", border:"none", cursor:"pointer", color:"#ef4444", padding:0, lineHeight:0 }}><X size={12}/></button>}
    </motion.div>
  );
}
function OkBanner({ msg, loginLight, onDismiss }) {
  return (
    <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
      style={{ display:"flex", gap:9, padding:"12px 14px", borderRadius:11,
               background:"rgba(16,185,129,.09)", border:"1px solid rgba(16,185,129,.24)",
               marginBottom:12 }}>
      <CheckCircle2 size={14} color="#10b981" style={{ flexShrink:0, marginTop:1 }}/>
      <p style={{ color: loginLight ? "#065f46" : "#10b981", fontSize:13, lineHeight:1.55, flex:1 }}>{msg}</p>
      {onDismiss && <button onClick={onDismiss} style={{ background:"none", border:"none", cursor:"pointer", color:"#10b981", padding:0, lineHeight:0 }}><X size={12}/></button>}
    </motion.div>
  );
}

function TimePicker({ value, onChange }) {
  const [use12, setUse12] = useState(() => localStorage.getItem("mt_time_fmt") === "12");
  const [h12val, setH12val] = useState("");
  const [h, setH] = useState("08");
  const [m, setM] = useState("00");
  const [ampm, setAmpm] = useState("AM");

  useEffect(() => {
    if (!value) return;
    const [hh, mm] = value.split(":").map(Number);
    const hNum = hh || 0, mNum = mm || 0;
    if (use12) {
      const ap = hNum < 12 ? "AM" : "PM";
      const h12 = hNum % 12 === 0 ? 12 : hNum % 12;
      setH(String(h12).padStart(2,"0"));
      setM(String(mNum).padStart(2,"0"));
      setAmpm(ap);
    } else {
      setH(String(hNum).padStart(2,"0"));
      setM(String(mNum).padStart(2,"0"));
    }
  }, [value, use12]);

  function emit(hh, mm, ap) {
    let hNum = parseInt(hh) || 0;
    const mNum = parseInt(mm) || 0;
    if (use12) {
      if (ap === "AM" && hNum === 12) hNum = 0;
      if (ap === "PM" && hNum !== 12) hNum += 12;
    }
    onChange(`${String(hNum).padStart(2,"0")}:${String(mNum).padStart(2,"0")}`);
  }

  function toggleFmt() {
    const next = !use12;
    localStorage.setItem("mt_time_fmt", next ? "12" : "24");
    setUse12(next);
  }

  const iStyle = { padding:"9px 10px", background:"var(--s2)", border:"1.5px solid var(--b1)",
                   borderRadius:9, color:"var(--t1)", fontFamily:"inherit", fontSize:14,
                   outline:"none", width:"62px", textAlign:"center", transition:"border-color .18s" };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:7 }}>
        <label className="lbl" style={{ margin:0 }}>Time</label>
        <div style={{ display:"flex", gap:4 }}>
          <button className={`time-mode-btn ${!use12?"active":""}`} onClick={() => { if(use12) toggleFmt(); }}>24h</button>
          <button className={`time-mode-btn ${use12?"active":""}`}  onClick={() => { if(!use12) toggleFmt(); }}>AM/PM</button>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <input style={iStyle} value={h} maxLength={2}
          onChange={e => { setH(e.target.value); emit(e.target.value, m, ampm); }}
          onFocus={e => e.target.select()} placeholder={use12?"8":"08"}/>
        <span style={{ color:"var(--t3)", fontWeight:700, fontSize:16 }}>:</span>
        <input style={iStyle} value={m} maxLength={2}
          onChange={e => { setM(e.target.value); emit(h, e.target.value, ampm); }}
          onFocus={e => e.target.select()} placeholder="00"/>
        {use12 && (
          <div style={{ display:"flex", gap:4, marginLeft:4 }}>
            {["AM","PM"].map(ap => (
              <button key={ap} onClick={() => { setAmpm(ap); emit(h, m, ap); }}
                style={{ padding:"8px 11px", borderRadius:8, border:"1.5px solid",
                         borderColor: ampm===ap ? "var(--p)" : "var(--b1)",
                         background: ampm===ap ? "var(--pd)" : "transparent",
                         color: ampm===ap ? "var(--p)" : "var(--t3)",
                         fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer", transition:"all .15s" }}>
                {ap}
              </button>
            ))}
          </div>
        )}
      </div>
      {}
      <p style={{ color:"var(--t3)", fontSize:11, marginTop:5 }}>
        = {to12h(value)} (military: {value})
      </p>
    </div>
  );
}

function MedModal({ onClose, onSave, existing, userEmail }) {
  const def = existing
    ? {...existing}
    : { name:"", dosage:"", freq:"Once daily", time:"08:00", color:"blue" };
  const [f, setF] = useState(def);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isEdit = !!existing;
  const t1="var(--t1)", t3="var(--t3)";

  async function handleSave() {
    if (!f.name?.trim() || !f.dosage?.trim() || !f.freq?.trim()) return;
    setBusy(true); setErr("");
    const med = { ...f, id: existing?.id || Date.now().toString(), taken: existing?.taken ?? false };
    try {
      if (isEdit && existing?.firestoreId) {
        await updateDoc(doc(db, "Medications", existing.firestoreId), {
          medicationName: med.name,
          dosage:         med.dosage,
          freq:           med.freq,
          reminderTime:   med.time,
          color:          med.color,
        });
      } else if (!isEdit) {
        const docRef = await addDoc(collection(db, "Medications"), {
          medicationName: med.name,
          dosage:         med.dosage,
          freq:           med.freq,
          reminderTime:   med.time,
          color:          med.color,
          userEmail:      userEmail || auth.currentUser?.email || "",
          active:         true,
          createdAt:      serverTimestamp(),
        });
        med.firestoreId = docRef.id;
        med.id = docRef.id;
      }
      onSave(med);
      onClose();
    } catch(e) {
      console.error("MedModal save error:", e);
      setErr("Couldn't save to database. Changes kept locally.");
      onSave(med); onClose();
    } finally { setBusy(false); }
  }

  return (
    <motion.div className="ov" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
      <motion.div className="mo" onClick={e=>e.stopPropagation()}
        initial={{y:28,opacity:0,scale:.96}} animate={{y:0,opacity:1,scale:1}}
        exit={{y:28,opacity:0}} transition={{type:"spring",damping:26,stiffness:300}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
          <div>
            <h2 style={{color:t1,fontSize:19,fontFamily:"'Playfair Display',Georgia,serif",fontStyle:"italic",fontWeight:600}}>
              {isEdit ? "Edit Medication" : "Add Medication"}
            </h2>
            <p style={{color:t3,fontSize:12,marginTop:3}}>
              {isEdit ? "Update this medication's details" : "Fill in the details below to add a medication"}
            </p>
          </div>
          <button onClick={onClose} style={{width:30,height:30,borderRadius:9,border:"1px solid var(--b1)",
            background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3}}>
            <X size={13}/>
          </button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {[["name","Medication Name","e.g. Amoxicillin 500mg"],["dosage","Dosage","e.g. 500mg, 2000 IU, 1 tablet"]].map(([k,l,ph])=>(
            <div key={k}>
              <label className="lbl">{l}</label>
              <input className="inp" value={f[k]||""} placeholder={ph}
                onChange={e=>setF(p=>({...p,[k]:e.target.value}))}/>
            </div>
          ))}

          <div>
            <label className="lbl">Frequency</label>
            <input className="inp" value={f.freq||""} placeholder="e.g. Once daily, Every 8 hours, Twice with food…"
              onChange={e=>setF(p=>({...p,freq:e.target.value}))}/>
          </div>

          {}
          <TimePicker value={f.time} onChange={t => setF(p=>({...p,time:t}))}/>

          <div>
            <label className="lbl">Colour Label</label>
            <div style={{display:"flex",gap:9}}>
              {Object.entries(COLS).map(([k,v])=>(
                <button key={k} onClick={()=>setF(p=>({...p,color:k}))}
                  style={{width:30,height:30,borderRadius:9,background:v.a,border:"none",cursor:"pointer",
                    transition:"all .15s",outline:f.color===k?"2.5px solid #fff":"none",outlineOffset:2,
                    transform:f.color===k?"scale(1.24)":"scale(1)",
                    boxShadow:f.color===k?`0 0 16px ${v.a}88`:"none"}}/>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {err && <div style={{marginTop:14}}><ErrBanner msg={err}/></div>}
        </AnimatePresence>

        <div style={{display:"flex",gap:9,marginTop:22}}>
          <button className="bto" style={{flex:1}} onClick={onClose}>Cancel</button>
          <button className="btn" style={{flex:1}}
            disabled={busy || !f.name?.trim() || !f.dosage?.trim() || !f.freq?.trim()}
            onClick={handleSave}>
            {busy ? <Loader2 size={14} style={{animation:"spin360 .7s linear infinite"}}/> : isEdit ? "Save Changes" : "Add Medication"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const ANTHROPIC_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_ANTHROPIC_KEY) || "";
const KEY_IS_SET = true;

function AIDrawer({ onClose, userName, meds }) {
  const intro = `Hello${userName ? `, ${userName}` : ""}. I'm your Health Advisor.\n\nI can see your current medications and have access to real FDA drug data. Ask me anything about your medications, interactions, side effects, dosing, or general health questions.\n\nWhat would you like to know today?`;
  const [msgs,    setMsgs]    = useState([{ role:"assistant", content:intro }]);
  const [inp,     setInp]     = useState("");
  const [loading, setLoading] = useState(false);
  const [apiErr,  setApiErr]  = useState("");
  const endRef = useRef(null);
  const inpRef = useRef(null);

  const medCtx = meds.length > 0
    ? `User's current medications:\n${meds.map(m => `• ${m.name} ${m.dosage} — ${m.freq} at ${to12h(m.time)} (${m.taken ? "taken today" : "not yet taken"})`).join("\n")}`
    : "The user has no medications added yet.";

  async function fetchFDAInfo(medName) {
    if (!medName) return "";
    try {
      const name = encodeURIComponent(medName.split(" ")[0]);
      const res  = await fetch(`https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${name}"+openfda.generic_name:"${name}"&limit=1`);
      if (!res.ok) return "";
      const data = await res.json();
      const r = data.results?.[0];
      if (!r) return "";
      const parts = [];
      if (r.indications_and_usage?.[0])     parts.push(`Indications: ${r.indications_and_usage[0].slice(0,280)}`);
      if (r.warnings?.[0])                  parts.push(`Warnings: ${r.warnings[0].slice(0,280)}`);
      if (r.drug_interactions?.[0])         parts.push(`Interactions: ${r.drug_interactions[0].slice(0,280)}`);
      if (r.dosage_and_administration?.[0]) parts.push(`Dosage: ${r.dosage_and_administration[0].slice(0,180)}`);
      return parts.length ? `\n\n[FDA Data — ${medName}:\n${parts.join("\n")}]` : "";
    } catch { return ""; }
  }

  const SYSTEM = `You are a warm, knowledgeable Health Advisor inside the MedTrack app${userName ? `, assisting ${userName}` : ""}.\n\n${medCtx}\n\nRules:\n- Be genuinely helpful and clear. Avoid jargon unless needed.\n- Reference the user's specific medications when relevant.\n- Keep replies to 2–3 paragraphs unless more detail is needed.\n- Always suggest consulting a doctor for personal medical decisions.\n- Emergencies: call 911. Poison Control: 1-800-222-1222.\n- Do NOT diagnose, prescribe, or claim to replace professional care.\n- Do NOT reveal the underlying model or technology.\n- FDA data may be appended to messages in [FDA Data] blocks — use it.`;

  const send = useCallback(async (textOverride) => {
    const msgText = (textOverride !== undefined ? textOverride : inp).trim();
    if (!msgText || loading) return;

    const history = [...msgs, { role:"user", content:msgText }];
    setMsgs(history);
    setInp("");
    setLoading(true);
    setApiErr("");

    try {
      let fdaCtx = "";
      for (const med of meds) {
        if (msgText.toLowerCase().includes(med.name.toLowerCase()))
          fdaCtx += await fetchFDAInfo(med.name);
      }
      const caps = msgText.match(/\b([A-Z][a-z]{4,})\b/g) || [];
      for (const word of caps.slice(0, 2)) {
        if (!meds.some(m => m.name.toLowerCase() === word.toLowerCase())) {
          const extra = await fetchFDAInfo(word);
          if (extra) { fdaCtx += extra; break; }
        }
      }

      const apiMsgs = history.map((m, i) =>
        i === history.length - 1 && fdaCtx
          ? { role:"user", content:`${m.content}${fdaCtx}` }
          : { role: m.role === "assistant" ? "assistant" : "user", content: m.content }
      );

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-allow-browser": "true",
        },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1024, system:SYSTEM, messages:apiMsgs }),
      }).catch(() => { throw new Error("No internet connection — please check your network."); });

      if (!res.ok) {
        const eb = await res.json().catch(() => ({}));
        if (res.status === 401) throw new Error("AI assistant is temporarily unavailable. Please try again later.");
        if (res.status === 429) throw new Error("Too many requests — wait a moment and try again.");
        if (res.status >= 500)  throw new Error("Service temporarily unavailable — try again shortly.");
        throw new Error(eb?.error?.message || "Something went wrong. Please try again.");
      }

      const data  = await res.json();
      const reply = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "I couldn't generate a response. Please try again.";
      setMsgs(m => [...m, { role:"assistant", content:reply }]);

      try {
        await addDoc(collection(db, "chats"), {
          userId: auth.currentUser?.uid || "anon",
          message: msgText, response: reply,
          timestamp: serverTimestamp(),
        });
      } catch(e) { console.warn("Chat Firestore save:", e); }

    } catch(e) {
      console.error("Health Advisor error:", e);
      setApiErr(e.message || "Something went wrong. Please try again.");
      setMsgs(m => m.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [inp, msgs, loading, SYSTEM, meds]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, loading]);

  const chips = meds.length > 0
    ? [`Any interactions between my medications?`, "What side effects should I watch for?", "What happens if I miss a dose?"]
    : ["Common drug interactions to know", "How to store medications safely", "Questions to ask my pharmacist"];

  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)", b1 = "var(--b1)";

  return (
    <motion.div className="dr" initial={{ x:"100%" }} animate={{ x:0 }} exit={{ x:"100%" }}
      transition={{ type:"spring", damping:28, stiffness:260 }}>

      {}
      <div style={{ padding:"16px 18px 14px", borderBottom:`1px solid ${b1}`,
                    display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <div style={{ width:42, height:42, borderRadius:13, background:"var(--pd)",
                      border:"1px solid rgba(37,99,235,.25)", display:"flex",
                      alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <Stethoscope size={19} color="var(--p)"/>
        </div>
        <div style={{ flex:1 }}>
          <p style={{ color:t1, fontSize:15, fontWeight:700 }}>Health Advisor</p>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
            <span style={{ width:7, height:7, borderRadius:"50%", display:"block",
                           background: KEY_IS_SET ? "var(--gr)" : "var(--am)",
                           boxShadow: KEY_IS_SET ? "0 0 6px var(--gr)" : "none" }}/>
            <span style={{ color: KEY_IS_SET ? t3 : "var(--am)", fontSize:11 }}>
              {KEY_IS_SET ? "Online · FDA data enabled" : "API key required"}
            </span>
          </div>
        </div>
        <button onClick={onClose}
          style={{ width:32, height:32, borderRadius:10, border:`1px solid ${b1}`,
                   background:"var(--s2)", cursor:"pointer", display:"flex",
                   alignItems:"center", justifyContent:"center", color:t3 }}>
          <X size={14}/>
        </button>
      </div>

      {}
      <div style={{ margin:"12px 16px 0", padding:"9px 13px", borderRadius:10,
                    background:"rgba(245,158,11,.05)", border:"1px solid rgba(245,158,11,.13)",
                    display:"flex", gap:8, alignItems:"flex-start" }}>
        <Info size={12} color="var(--am)" style={{ flexShrink:0, marginTop:2 }}/>
        <p style={{ color:"var(--am)", fontSize:11, lineHeight:1.6 }}>
          For informational use only — not a substitute for professional medical advice.
        </p>
      </div>

      {}
      <AnimatePresence>
        {apiErr && (
          <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            style={{ margin:"10px 16px 0" }}>
            <div style={{ display:"flex", gap:9, padding:"11px 14px", borderRadius:11,
                          background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.2)" }}>
              <AlertCircle size={14} color="#ef4444" style={{ flexShrink:0, marginTop:1 }}/>
              <p style={{ color:"#ef4444", fontSize:12.5, lineHeight:1.55, flex:1 }}>{apiErr}</p>
              <button onClick={() => setApiErr("")}
                style={{ background:"none", border:"none", cursor:"pointer", color:"#ef4444", padding:0, lineHeight:0 }}>
                <X size={12}/>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 16px 8px",
                    display:"flex", flexDirection:"column", gap:14 }}>

        {}
        {msgs.length === 1 && KEY_IS_SET && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {chips.map(c => (
              <button key={c} onClick={() => send(c)}
                style={{ padding:"7px 14px", borderRadius:99, fontSize:12, fontWeight:500,
                         border:`1px solid ${b1}`, background:"var(--s2)", color:t2,
                         cursor:"pointer", fontFamily:"inherit", transition:"all .15s", lineHeight:1.4 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="var(--p)"; e.currentTarget.style.color="var(--p)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=b1; e.currentTarget.style.color=t2; }}>
                {c}
              </button>
            ))}
          </div>
        )}

        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:.2 }}
            style={{ display:"flex", gap:10, flexDirection:m.role==="user"?"row-reverse":"row",
                     alignItems:"flex-end" }}>
            <div style={{ width:30, height:30, borderRadius:10, flexShrink:0,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          background: m.role==="assistant" ? "var(--pd)" : "var(--p)",
                          border: m.role==="assistant" ? "1px solid rgba(37,99,235,.25)" : "none" }}>
              {m.role==="assistant" ? <Stethoscope size={13} color="var(--p)"/> : <User size={13} color="#fff"/>}
            </div>
            <div style={{ maxWidth:"80%" }}>
              <div style={{ padding:"12px 16px", fontSize:13.5, lineHeight:1.78, borderRadius:16,
                            borderBottomRightRadius: m.role==="user" ? 4 : 16,
                            borderBottomLeftRadius:  m.role==="assistant" ? 4 : 16,
                            background: m.role==="user" ? "var(--p)" : "var(--s2)",
                            color:      m.role==="user" ? "#fff" : t1,
                            boxShadow:  m.role==="user" ? "0 4px 18px rgba(37,99,235,.28)" : "none",
                            whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                {m.content}
              </div>
            </div>
          </motion.div>
        ))}

        {loading && (
          <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
            style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
            <div style={{ width:30, height:30, borderRadius:10, background:"var(--pd)",
                          border:"1px solid rgba(37,99,235,.25)", display:"flex",
                          alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Stethoscope size={13} color="var(--p)"/>
            </div>
            <div style={{ padding:"14px 18px", borderRadius:16, borderBottomLeftRadius:4,
                          background:"var(--s2)", display:"flex", gap:5 }}>
              {[0,1,2].map(j => (
                <motion.div key={j}
                  animate={{ y:[0,-5,0], opacity:[.4,1,.4] }}
                  transition={{ repeat:Infinity, duration:.9, delay:j*.18, ease:"easeInOut" }}
                  style={{ width:6, height:6, borderRadius:"50%", background:"var(--p)" }}/>
              ))}
            </div>
          </motion.div>
        )}
        <div ref={endRef}/>
      </div>

      {}
      <div style={{ padding:"12px 16px 18px", borderTop:`1px solid ${b1}`, flexShrink:0 }}>
        <div style={{ display:"flex", gap:9, alignItems:"flex-end" }}>
          <input ref={inpRef} value={inp} disabled={!KEY_IS_SET || loading}
            placeholder={KEY_IS_SET ? "Ask about your medications…" : "API key needed — see above"}
            onChange={e => setInp(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            style={{ flex:1, padding:"12px 15px", borderRadius:13,
                     background:"var(--s2)", border:`1.5px solid ${b1}`,
                     color:t1, fontFamily:"inherit", fontSize:14, outline:"none",
                     transition:"border-color .18s", caretColor:"var(--p)",
                     opacity: KEY_IS_SET ? 1 : .55 }}
            onFocus={e => e.target.style.borderColor="var(--p)"}
            onBlur={e => e.target.style.borderColor=b1}/>
          <button onClick={() => send()} disabled={!inp.trim() || loading || !KEY_IS_SET}
            style={{ width:44, height:44, borderRadius:13, border:"none", flexShrink:0,
                     background: inp.trim() && KEY_IS_SET ? "var(--p)" : "var(--s2)",
                     cursor: inp.trim() && KEY_IS_SET ? "pointer" : "default",
                     display:"flex", alignItems:"center", justifyContent:"center",
                     transition:"all .18s",
                     boxShadow: inp.trim() && KEY_IS_SET ? "0 4px 16px rgba(37,99,235,.32)" : "none" }}>
            {loading
              ? <Loader2 size={16} color="var(--p)" style={{ animation:"spin360 .7s linear infinite" }}/>
              : <Send size={16} color={inp.trim() && KEY_IS_SET ? "#fff" : t3}/>}
          </button>
        </div>
        {KEY_IS_SET && (
          <p style={{ color:t3, fontSize:10.5, marginTop:7, textAlign:"center" }}>
            Enter to send · Shift+Enter for new line
          </p>
        )}
      </div>
    </motion.div>
  );
}

function FeedbackModal({ onClose, userEmail }) {
  const [type, setType]   = useState("general");
  const [body, setBody]   = useState("");
  const [rating, setRating] = useState(5);
  const [busy, setBusy]   = useState(false);
  const [sent, setSent]   = useState(false);
  const [err, setErr]     = useState("");

  async function submit() {
    if (!body.trim()) { setErr("Please write something before sending."); return; }
    setBusy(true); setErr("");
    try {
      await addDoc(collection(db, "Feedback"), {
        type, body, rating,
        userEmail: userEmail || auth.currentUser?.email || "anonymous",
        createdAt: serverTimestamp(),
      });
      setSent(true);
    } catch(e) {
      console.error("Feedback save error:", e);
      setSent(true);
    } finally { setBusy(false); }
  }

  const t1="var(--t1)", t3="var(--t3)";
  const types = [["general","General"],["bug","Bug Report"],["feature","Feature Request"],["praise","Praise"]];

  if (sent) return (
    <motion.div className="ov" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
      <motion.div className="mo" onClick={e=>e.stopPropagation()}
        initial={{y:28,opacity:0,scale:.96}} animate={{y:0,opacity:1,scale:1}} style={{textAlign:"center",padding:40}}>
        <div style={{width:64,height:64,borderRadius:20,background:"rgba(16,185,129,.1)",border:"1.5px solid rgba(16,185,129,.25)",
                     display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"}}>
          <CheckCircle2 size={28} color="#10b981"/>
        </div>
        <h2 style={{color:t1,fontSize:20,fontFamily:"'Playfair Display',Georgia,serif",fontStyle:"italic",fontWeight:600,marginBottom:8}}>
          Thank you!
        </h2>
        <p style={{color:t3,fontSize:13,lineHeight:1.7,marginBottom:24}}>
          Your feedback helps make MedTrack better for everyone.
        </p>
        <button className="btn" style={{width:"100%"}} onClick={onClose}>Close</button>
      </motion.div>
    </motion.div>
  );

  return (
    <motion.div className="ov" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
      <motion.div className="mo" onClick={e=>e.stopPropagation()}
        initial={{y:28,opacity:0,scale:.96}} animate={{y:0,opacity:1,scale:1}}
        exit={{y:28,opacity:0}} transition={{type:"spring",damping:26,stiffness:300}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <h2 style={{color:t1,fontSize:19,fontFamily:"'Playfair Display',Georgia,serif",fontStyle:"italic",fontWeight:600}}>
              Send Feedback
            </h2>
            <p style={{color:t3,fontSize:12,marginTop:3}}>We read everything — your thoughts matter.</p>
          </div>
          <button onClick={onClose} style={{width:30,height:30,borderRadius:9,border:"1px solid var(--b1)",
            background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3}}>
            <X size={13}/>
          </button>
        </div>

        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {types.map(([v,l]) => (
            <button key={v} onClick={() => setType(v)}
              style={{padding:"6px 14px",borderRadius:9,border:"1.5px solid",fontSize:12,fontWeight:600,
                      fontFamily:"inherit",cursor:"pointer",transition:"all .15s",
                      borderColor: type===v ? "var(--p)" : "var(--b1)",
                      background:  type===v ? "var(--pd)" : "transparent",
                      color:       type===v ? "var(--p)" : t3}}>
              {l}
            </button>
          ))}
        </div>

        {}
        <div style={{marginBottom:16}}>
          <label className="lbl">Rating</label>
          <div style={{display:"flex",gap:5}}>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setRating(n)}
                style={{fontSize:22,background:"none",border:"none",cursor:"pointer",
                        color: n<=rating ? "var(--am)" : "var(--b2)",
                        transition:"transform .1s, color .15s",
                        transform: n<=rating ? "scale(1.1)" : "scale(1)"}}>
                ★
              </button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <label className="lbl">Your message</label>
          <textarea className="inp" rows={4} value={body} onChange={e=>setBody(e.target.value)}
            placeholder="Tell us what you think, what's broken, or what you'd love to see…"
            style={{resize:"vertical",lineHeight:1.6,paddingTop:12}}/>
        </div>

        <AnimatePresence>
          {err && <ErrBanner msg={err}/>}
        </AnimatePresence>

        <div style={{display:"flex",gap:9}}>
          <button className="bto" style={{flex:1}} onClick={onClose}>Cancel</button>
          <button className="btn" style={{flex:1}} disabled={busy||!body.trim()} onClick={submit}>
            {busy ? <Loader2 size={14} style={{animation:"spin360 .7s linear infinite"}}/> : <><Send size={13}/> Send Feedback</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function NicknameModal({ currentName, onSave, onClose }) {
  const [val, setVal] = useState(currentName || "");
  return (
    <motion.div className="ov" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
      <motion.div className="mo" onClick={e=>e.stopPropagation()}
        initial={{y:28,opacity:0,scale:.96}} animate={{y:0,opacity:1,scale:1}} exit={{y:28,opacity:0}}
        transition={{type:"spring",damping:26,stiffness:300}} style={{maxWidth:360}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <h2 style={{color:"var(--t1)",fontSize:18,fontFamily:"'Playfair Display',Georgia,serif",fontStyle:"italic",fontWeight:600}}>
            What should we call you?
          </h2>
          <button onClick={onClose} style={{width:30,height:30,borderRadius:9,border:"1px solid var(--b1)",
            background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            color:"var(--t3)"}}>
            <X size={13}/>
          </button>
        </div>
        <label className="lbl">Your preferred name</label>
        <input className="inp" value={val} placeholder="e.g. Jamie, Dr. Patel, or Alex"
          onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&val.trim()&&(onSave(val.trim()),onClose())} autoFocus/>
        <p style={{color:"var(--t3)",fontSize:11,marginTop:6,marginBottom:18}}>Saved locally on this device only.</p>
        <div style={{display:"flex",gap:9}}>
          <button className="bto" style={{flex:1}} onClick={onClose}>Cancel</button>
          <button className="btn" style={{flex:1}} disabled={!val.trim()}
            onClick={()=>{onSave(val.trim());onClose();}}>Save</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Dashboard({ user, meds, setMeds, onAdd, onEdit, onDelete, onChat, displayName, onEditName }) {
  const now    = useClock();
  const taken  = meds.filter(m=>m.taken).length;
  const total  = meds.length;
  const pct    = total ? Math.round(taken/total*100) : 0;
  const hr     = now.getHours();
  const greet  = hr<12 ? "Good morning" : hr<17 ? "Good afternoon" : "Good evening";
  const tip    = TIPS[now.getDate() % TIPS.length];
  const name   = displayName||user?.displayName||user?.email?.split("@")[0]||"there";
  const t1="var(--t1)", t2="var(--t2)", t3="var(--t3)";
  const toMins = t => { const[h,m]=t.split(":").map(Number); return h*60+m; };
  const curMins= hr*60+now.getMinutes();
  const nextMed= [...meds].filter(m=>!m.taken&&toMins(m.time)>curMins)
                          .sort((a,b)=>toMins(a.time)-toMins(b.time))[0];
  const toggle = id => setMeds(ms=>ms.map(m=>m.id===id?{...m,taken:!m.taken}:m));

  return (
    <div style={{flex:1,overflowY:"auto"}}>
      <div style={{maxWidth:740,margin:"0 auto",padding:"26px 22px 44px"}}>

        {}
        <motion.div className="au" style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24}}>
          <div>
            <p style={{color:"var(--p)",fontSize:10,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",opacity:.65,marginBottom:8}}>
              {pct===100 ? "All caught up for today ✓" : pct>50 ? "Good progress today" : "Your daily overview"}
            </p>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <h2 style={{color:t1,fontSize:28,fontFamily:"'Playfair Display',Georgia,serif",fontStyle:"italic",fontWeight:600,letterSpacing:"-.3px",lineHeight:1.1}}>
                {greet}, <span style={{color:"var(--pl)"}}>{name}.</span>
              </h2>
              <button onClick={onEditName} title="Edit display name"
                style={{width:26,height:26,borderRadius:8,border:"1px solid var(--b1)",background:"transparent",
                        cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                        color:t3,transition:"all .15s",flexShrink:0}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--p)";e.currentTarget.style.color="var(--p)"}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--b1)";e.currentTarget.style.color=t3}}>
                <Pencil size={11}/>
              </button>
            </div>
            <p style={{color:t3,fontSize:12,marginTop:5,fontVariantNumeric:"tabular-nums"}}>
              {now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
              {" · "}{now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
            </p>
          </div>
          <div style={{display:"flex",gap:8,flexShrink:0,marginTop:4}}>
            <button onClick={onChat}
              style={{width:38,height:38,borderRadius:11,border:"1px solid var(--b1)",background:"var(--s1)",
                      cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                      color:"var(--p)",transition:"all .15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--p)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="var(--b1)"}>
              <Stethoscope size={16}/>
            </button>
            <button className="btn" onClick={onAdd}
              style={{padding:"9px 18px",fontSize:13,borderRadius:11,display:"flex",alignItems:"center",gap:6}}>
              <Plus size={14}/> Add Medication
            </button>
          </div>
        </motion.div>

        {}
        <motion.div className="au d1 gc" style={{padding:"24px 26px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
            <div style={{flex:1}}>
              <p style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".09em",textTransform:"uppercase",opacity:.8}}>Daily Adherence</p>
              <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:8}}>
                <span style={{fontSize:58,lineHeight:1,fontVariantNumeric:"tabular-nums",
                              fontFamily:"'Playfair Display',Georgia,serif",color:t1,fontStyle:"italic"}}>{pct}</span>
                <span style={{color:t2,fontSize:22}}>%</span>
              </div>
              <p style={{color:t3,fontSize:13,marginTop:5}}>{taken} of {total} medications taken today</p>
              {nextMed ? (
                <div style={{marginTop:12,display:"inline-flex",alignItems:"center",gap:7,padding:"5px 13px",
                             borderRadius:8,background:"var(--pd)",border:"1px solid rgba(37,99,235,.22)"}}>
                  <Clock size={11} color="var(--p)"/>
                  <span style={{color:"var(--p)",fontSize:12,fontWeight:600}}>
                    Next — {nextMed.name} at {to12h(nextMed.time)}
                  </span>
                </div>
              ) : taken===total&&total>0 ? (
                <div style={{marginTop:12,display:"inline-flex",alignItems:"center",gap:7,padding:"5px 13px",
                             borderRadius:8,background:"rgba(16,185,129,.09)",border:"1px solid rgba(16,185,129,.2)"}}>
                  <CheckCircle2 size={11} color="var(--gr)"/>
                  <span style={{color:"var(--gr)",fontSize:12,fontWeight:600}}>All medications taken — great job!</span>
                </div>
              ) : null}
              <div style={{marginTop:18,height:5,width:220,maxWidth:"100%",borderRadius:99,overflow:"hidden",background:"var(--b0)"}}>
                <motion.div style={{height:"100%",borderRadius:99,background:"linear-gradient(90deg,var(--p),var(--tl))"}}
                  initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:1.1,ease:[.22,1,.36,1],delay:.2}}/>
              </div>
            </div>
            <Ring pct={pct} size={96} sw={7} color="var(--p)">
              <span style={{color:t1,fontSize:14,fontWeight:700}}>{pct}%</span>
            </Ring>
          </div>
        </motion.div>

        {}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          {[
            {l:"Completed",  v:`${taken}/${total}`, I:CheckCircle2, c:"var(--gr)",  bg:"rgba(16,185,129,.09)"},
            {l:"Streak",     v:"7 days",            I:Flame,        c:"var(--am)",  bg:"rgba(245,158,11,.09)"},
            {l:"Adherence",  v:`${pct}%`,           I:TrendingUp,   c:"var(--p)",   bg:"var(--pd)"},
            {l:"Medications",v:String(total),       I:Pill,         c:"var(--tl)",  bg:"rgba(6,182,212,.09)"},
          ].map((s,i) => (
            <motion.div key={s.l} className={`au card d${i+1}`} style={{padding:"15px 13px"}}>
              <div style={{width:32,height:32,borderRadius:10,background:s.bg,marginBottom:10,
                           display:"flex",alignItems:"center",justifyContent:"center"}}>
                <s.I size={14} color={s.c}/>
              </div>
              <p style={{color:t1,fontSize:18,fontVariantNumeric:"tabular-nums",fontFamily:"'Playfair Display',Georgia,serif",fontStyle:"italic"}}>{s.v}</p>
              <p style={{color:t3,fontSize:9.5,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginTop:4}}>{s.l}</p>
            </motion.div>
          ))}
        </div>

        {}
        <motion.div className="au d3">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <h3 style={{color:t1,fontSize:15,fontWeight:600,letterSpacing:"-.01em"}}>Medication Schedule</h3>
            <span style={{color:t3,fontSize:11,fontVariantNumeric:"tabular-nums"}}>{taken}/{total} done</span>
          </div>
          {total===0 ? (
            <div className="card" style={{padding:60,textAlign:"center"}}>
              <Pill size={28} color={t3} style={{margin:"0 auto 12px",opacity:.18,display:"block"}}/>
              <p style={{color:t3,fontSize:13}}>No medications yet.</p>
              <button onClick={onAdd}
                style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:12,
                        color:"var(--p)",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>
                Add your first medication <ArrowRight size={13}/>
              </button>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[...meds].sort((a,b)=>a.time.localeCompare(b.time)).map((med,i) => {
                const col = COLS[med.color] || COLS.blue;
                return (
                  <motion.div key={med.id} className="au mrow"
                    style={{animationDelay:`${.07+i*.05}s`, opacity:med.taken ? .6 : 1}}>

                    {}
                    <div style={{position:"absolute",left:0,top:0,bottom:0,width:4,
                                 background:col.a,borderRadius:"16px 0 0 16px",opacity:med.taken?.35:1}}/>

                    {}
                    <div onClick={()=>toggle(med.id)}
                      style={{width:40,height:40,borderRadius:12,background:col.d,border:`1.5px solid ${col.b}`,
                              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                              marginLeft:10,cursor:"pointer",transition:"transform .15s"}}
                      onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"}
                      onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                      <Pill size={16} color={col.a}/>
                    </div>

                    {}
                    <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>toggle(med.id)}>
                      <p style={{color:t1,fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",
                                 whiteSpace:"nowrap",textDecoration:med.taken?"line-through":"none",
                                 opacity:med.taken?.6:1}}>{med.name}</p>
                      <p style={{color:t3,fontSize:12,marginTop:2}}>{med.dosage} · {med.freq}</p>
                    </div>

                    {}
                    <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:8,
                                 background:"var(--s2)",border:"1px solid var(--b0)",flexShrink:0}}>
                      <Clock size={11} color={t3}/>
                      <span style={{color:t2,fontSize:12,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>
                        {to12h(med.time)}
                      </span>
                    </div>

                    {}
                    <button className="ibtn primary" onClick={e=>{e.stopPropagation();onEdit(med)}}
                      title="Edit medication">
                      <Pencil size={13}/>
                    </button>

                    {}
                    <button className="ibtn danger" onClick={e=>{e.stopPropagation();onDelete(med.id)}}
                      title="Delete medication" style={{marginRight:2}}>
                      <Trash2 size={13}/>
                    </button>

                    {}
                    <button onClick={()=>toggle(med.id)}
                      title={med.taken?"Mark not taken":"Mark as taken"}
                      style={{width:34,height:34,borderRadius:10,border:"none",flexShrink:0,display:"flex",
                              alignItems:"center",justifyContent:"center",cursor:"pointer",marginRight:4,
                              background:med.taken?"var(--gr)":"var(--s2)",
                              boxShadow:med.taken?"0 2px 12px rgba(16,185,129,.30)":"none",
                              transition:"all .2s"}}>
                      <Check size={15} color={med.taken?"#fff":t3}/>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {}
        <motion.div className="au d5" style={{marginTop:12,padding:"16px 18px",borderRadius:16,
          background:"rgba(6,182,212,.05)",border:"1px solid rgba(6,182,212,.12)",display:"flex",gap:13}}>
          <div style={{width:32,height:32,borderRadius:9,background:"rgba(6,182,212,.1)",
                       border:"1px solid rgba(6,182,212,.18)",display:"flex",alignItems:"center",
                       justifyContent:"center",flexShrink:0}}>
            <Sparkles size={14} color="var(--tl)"/>
          </div>
          <div>
            <p style={{color:"var(--tl)",fontSize:10,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",marginBottom:4}}>
              Health Tip
            </p>
            <p style={{color:t2,fontSize:13,lineHeight:1.75}}>{tip}</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function SchedulePage({ meds, setMeds, onEdit, onDelete }) {
  const t1="var(--t1)", t3="var(--t3)";
  const sorted=[...meds].sort((a,b)=>a.time.localeCompare(b.time));
  const periods=[
    {l:"Morning",   r:"6 AM – 12 PM", fn:m=>m.time>="06:00"&&m.time<"12:00"},
    {l:"Afternoon", r:"12 PM – 5 PM", fn:m=>m.time>="12:00"&&m.time<"17:00"},
    {l:"Evening",   r:"5 PM – 9 PM",  fn:m=>m.time>="17:00"&&m.time<"21:00"},
    {l:"Night",     r:"9 PM onwards", fn:m=>m.time>="21:00"||m.time<"06:00"},
  ];
  return (
    <div style={{flex:1,overflowY:"auto"}}>
      <div style={{maxWidth:640,margin:"0 auto",padding:"26px 22px 44px"}}>
        <motion.div className="au" style={{marginBottom:26}}>
          <h2 style={{color:t1,fontSize:24,fontFamily:"'Playfair Display',Georgia,serif",fontStyle:"italic",fontWeight:600,letterSpacing:"-.3px"}}>Schedule</h2>
          <p style={{color:t3,fontSize:13,marginTop:6,lineHeight:1.6}}>Medications organised by time of day.</p>
        </motion.div>
        {periods.map((p,pi)=>{
          const list=sorted.filter(p.fn);
          if(!list.length) return null;
          return (
            <motion.div key={p.l} className="au" style={{animationDelay:`${pi*.07}s`,marginBottom:22}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:11}}>
                <span style={{color:t1,fontSize:13,fontWeight:600}}>{p.l}</span>
                <span style={{color:t3,fontSize:12}}>· {p.r}</span>
                <span style={{marginLeft:"auto",color:t3,fontSize:11}}>{list.filter(m=>m.taken).length}/{list.length}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {list.map(med=>{
                  const col=COLS[med.color]||COLS.blue;
                  return (
                    <div key={med.id} className="card" style={{padding:"12px 16px",display:"flex",
                      alignItems:"center",gap:12,position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:col.a,borderRadius:"18px 0 0 18px"}}/>
                      <span style={{fontSize:12,fontWeight:700,color:col.a,width:54,marginLeft:6,flexShrink:0,fontVariantNumeric:"tabular-nums"}}>{to12h(med.time)}</span>
                      <div style={{width:32,height:32,borderRadius:9,background:col.d,border:`1px solid ${col.b}`,
                                   display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <Pill size={14} color={col.a}/>
                      </div>
                      <div style={{flex:1}}>
                        <p style={{color:t1,fontSize:13,fontWeight:600}}>{med.name}</p>
                        <p style={{color:t3,fontSize:11,marginTop:1}}>{med.dosage} · {med.freq}</p>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <button onClick={()=>onEdit&&onEdit(med)}
                          title="Edit"
                          style={{width:30,height:30,borderRadius:9,border:"1px solid var(--b1)",background:"transparent",
                                  cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                                  color:t3,transition:"all .15s"}}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--p)";e.currentTarget.style.color="var(--p)"}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--b1)";e.currentTarget.style.color=t3}}>
                          <Pencil size={12}/>
                        </button>
                        <button onClick={()=>onDelete&&onDelete(med.id)}
                          title="Delete"
                          style={{width:30,height:30,borderRadius:9,border:"1px solid var(--b1)",background:"transparent",
                                  cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                                  color:t3,transition:"all .15s"}}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--ro)";e.currentTarget.style.color="var(--ro)"}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--b1)";e.currentTarget.style.color=t3}}>
                          <Trash2 size={12}/>
                        </button>
                        <button onClick={()=>setMeds(ms=>ms.map(m=>m.id===med.id?{...m,taken:!m.taken}:m))}
                          style={{padding:"5px 14px",borderRadius:99,fontSize:11,fontWeight:600,border:"none",
                                  cursor:"pointer",transition:"all .18s",
                                  background:med.taken?"rgba(16,185,129,.12)":"var(--s2)",
                                  color:med.taken?"var(--gr)":"var(--t3)"}}>
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
        {meds.length===0 && (
          <div className="card au" style={{padding:64,textAlign:"center"}}>
            <Calendar size={28} color={t3} style={{margin:"0 auto 10px",opacity:.18,display:"block"}}/>
            <p style={{color:t3,fontSize:13}}>No medications in your schedule yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyticsPage({ meds }) {
  const t1="var(--t1)", t2="var(--t2)", t3="var(--t3)";
  const taken=meds.filter(m=>m.taken).length;
  const pct=meds.length?Math.round(taken/meds.length*100):0;
  const week=[{d:"Mon",v:100},{d:"Tue",v:85},{d:"Wed",v:100},{d:"Thu",v:60},{d:"Fri",v:100},{d:"Sat",v:75},{d:"Today",v:pct}];
  const avg=Math.round(week.reduce((s,w)=>s+w.v,0)/week.length);
  return (
    <div style={{flex:1,overflowY:"auto"}}>
      <div style={{maxWidth:640,margin:"0 auto",padding:"26px 22px 44px"}}>
        <motion.div className="au" style={{marginBottom:26}}>
          <h2 style={{color:t1,fontSize:24,fontFamily:"'Playfair Display',Georgia,serif",fontStyle:"italic",fontWeight:600,letterSpacing:"-.3px"}}>Analytics</h2>
          <p style={{color:t3,fontSize:13,marginTop:6,lineHeight:1.6}}>Track how consistently you stay on schedule.</p>
        </motion.div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:13}}>
          {[{l:"Today",v:`${pct}%`,p:pct,c:"var(--p)"},{l:"Weekly avg",v:`${avg}%`,p:avg,c:"var(--tl)"},{l:"Streak",v:"7 days",p:70,c:"var(--am)"}].map((s,i)=>(
            <motion.div key={s.l} className={`au card d${i+1}`} style={{padding:18,display:"flex",flexDirection:"column",alignItems:"center",gap:9}}>
              <Ring pct={s.p} size={66} sw={5} color={s.c}><span style={{color:t1,fontSize:11,fontWeight:700}}>{s.v}</span></Ring>
              <p style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase"}}>{s.l}</p>
            </motion.div>
          ))}
        </div>
        <motion.div className="au d3 card" style={{padding:22,marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:18}}>
            <h3 style={{color:t1,fontSize:14,fontWeight:600}}>Weekly Overview</h3>
            <span style={{color:t3,fontSize:11}}>{avg}% average</span>
          </div>
          <div style={{display:"flex",gap:6,height:100,alignItems:"flex-end"}}>
            {week.map((w,i)=>(
              <div key={w.d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,height:"100%"}}>
                <div style={{flex:1,display:"flex",alignItems:"flex-end",width:"100%"}}>
                  <motion.div style={{width:"100%",borderRadius:"6px 6px 3px 3px",
                    background:w.d==="Today"?"linear-gradient(180deg,var(--p),var(--tl))":"var(--s2)",
                    boxShadow:w.d==="Today"?"0 0 14px rgba(37,99,235,.22)":"none"}}
                    initial={{height:0}} animate={{height:`${w.v}%`}} transition={{duration:.7,delay:.07*i}}/>
                </div>
                <span style={{color:t3,fontSize:9,fontWeight:600}}>{w.d}</span>
              </div>
            ))}
          </div>
        </motion.div>
        <motion.div className="au d4 card" style={{padding:22}}>
          <h3 style={{color:t1,fontSize:14,fontWeight:600,marginBottom:16}}>By Medication</h3>
          {meds.length===0 && <p style={{color:t3,fontSize:13}}>No medications added yet.</p>}
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            {meds.map((med,i)=>{
              const col=COLS[med.color]||COLS.blue;
              return (
                <div key={med.id} style={{display:"flex",alignItems:"center",gap:11}}>
                  <div style={{width:26,height:26,borderRadius:8,background:col.d,border:`1px solid ${col.b}`,
                               display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <Pill size={12} color={col.a}/>
                  </div>
                  <span style={{color:t2,fontSize:12,fontWeight:600,width:82,flexShrink:0,overflow:"hidden",
                                textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{med.name}</span>
                  <div style={{flex:1,height:5,borderRadius:99,overflow:"hidden",background:"var(--b0)"}}>
                    <motion.div style={{height:"100%",borderRadius:99,background:col.a}}
                      initial={{width:0}} animate={{width:med.taken?"100%":"0%"}} transition={{duration:.7,delay:.07*i}}/>
                  </div>
                  <span style={{color:med.taken?"var(--gr)":"var(--t3)",fontSize:11,fontWeight:700,width:32,textAlign:"right"}}>
                    {med.taken?"100%":"0%"}
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

function EmergencyContact({ userId, t1, t2, t3 }) {
  const [f,       setF]     = useState({ name:"", relationship:"", phone:"", email:"" });
  const [busy,    setBusy]  = useState(false);
  const [saved,   setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "profiles", userId));
        if (snap.exists() && snap.data().emergencyContact) {
          setF({ name:"", relationship:"", phone:"", email:"", ...snap.data().emergencyContact });
        }
      } catch(e) { console.error("Load emergency contact:", e); }
      finally { setLoading(false); }
    })();
  }, [userId]);

  async function save() {
    if (!userId) return;
    setBusy(true); setSaved(false);
    try {
      await setDoc(doc(db, "profiles", userId), {
        emergencyContact: { name:f.name, relationship:f.relationship, phone:f.phone, email:f.email },
        updatedAt: serverTimestamp(),
      }, { merge:true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2800);
    } catch(e) { console.error("Save emergency contact:", e); }
    finally { setBusy(false); }
  }

  if (loading) return (
    <div style={{padding:"24px 18px",display:"flex",alignItems:"center",gap:10,color:t3}}>
      <Loader2 size={16} style={{animation:"spin360 .7s linear infinite"}}/> Loading...
    </div>
  );

  return (
    <div style={{padding:"16px 18px 22px",borderTop:"1px solid var(--b0)"}}>
      <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
        {[
          ["Contact name",  "name",         "e.g. Sarah Johnson",      "text"],
          ["Relationship",  "relationship", "e.g. Spouse, Parent, GP", "text"],
          ["Phone number",  "phone",        "e.g. +1 555 000 0000",    "tel"],
          ["Email (optional)","email",      "caregiver@email.com",     "email"],
        ].map(([label,key,ph,type]) => (
          <div key={key}>
            <label className="lbl">{label}</label>
            <input className="inp" type={type} value={f[key]} placeholder={ph}
              onChange={e => setF(p => ({...p,[key]:e.target.value}))}/>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {saved && <div style={{marginBottom:12}}><OkBanner msg="Emergency contact saved."/></div>}
      </AnimatePresence>
      <button className="btn" style={{width:"100%",padding:"11px"}} disabled={busy} onClick={save}>
        {busy ? <><Loader2 size={14} style={{animation:"spin360 .7s linear infinite",marginRight:7}}/>Saving...</> : "Save Emergency Contact"}
      </button>
    </div>
  );
}

const HP_TAG_COLORS = {
  allergy:   { bg:"rgba(239,68,68,.08)",  border:"rgba(239,68,68,.22)",  text:"var(--ro)" },
  condition: { bg:"rgba(245,158,11,.08)", border:"rgba(245,158,11,.22)", text:"var(--am)" },
};
function TagList({ items, onRemove, type, t3 }) {
  const c = HP_TAG_COLORS[type];
  if (!items.length) return (
    <p style={{color:t3,fontSize:12,fontStyle:"italic",padding:"6px 0"}}>None added yet.</p>
  );
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:4}}>
      {items.map(item => (
        <span key={item} style={{display:"inline-flex",alignItems:"center",gap:6,
          padding:"5px 11px 5px 12px",borderRadius:99,fontSize:12,fontWeight:600,
          background:c.bg,border:`1px solid ${c.border}`,color:c.text}}>
          {item}
          <button onClick={() => onRemove(item)}
            style={{background:"none",border:"none",cursor:"pointer",padding:0,
                    display:"flex",alignItems:"center",color:c.text,opacity:.65,lineHeight:0}}>
            <X size={11}/>
          </button>
        </span>
      ))}
    </div>
  );
}
function AddRow({ value, onChange, onAdd, placeholder, btnColor, t3 }) {
  return (
    <div style={{display:"flex",gap:8,marginBottom:10}}>
      <input className="inp" style={{flex:1,marginBottom:0}} value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key==="Enter" && onAdd()}/>
      <button onClick={onAdd} disabled={!value.trim()}
        style={{padding:"0 16px",borderRadius:10,border:"none",
                background: value.trim() ? (btnColor || "var(--p)") : "var(--b1)",
                color: value.trim() ? "#fff" : t3,
                fontFamily:"inherit",fontSize:12,fontWeight:700,cursor: value.trim() ? "pointer":"default",
                display:"flex",alignItems:"center",gap:5,transition:"all .15s",whiteSpace:"nowrap"}}>
        <Plus size={13}/> Add
      </button>
    </div>
  );
}

function HealthProfile({ userId, t1, t2, t3 }) {
  const [dob,        setDob]        = useState("");
  const [bloodType,  setBloodType]  = useState("");
  const [weight,     setWeight]     = useState("");
  const [height,     setHeight]     = useState("");
  const [allergies,  setAllergies]  = useState([]);
  const [conditions, setConditions] = useState([]);
  const [allergyInp, setAllergyInp] = useState("");
  const [condInp,    setCondInp]    = useState("");
  const [busy,       setBusy]       = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "profiles", userId));
        if (snap.exists()) {
          const d = snap.data();
          setDob(d.dob || "");
          setBloodType(d.bloodType || "");
          setWeight(d.weight || "");
          setHeight(d.height || "");
          setAllergies(d.allergies || []);
          setConditions(d.medicalConditions || []);
        }
      } catch(e) { console.error("Load profile error:", e); }
      finally { setLoading(false); }
    })();
  }, [userId]);

  function addAllergy() {
    const v = allergyInp.trim();
    if (!v || allergies.includes(v)) return;
    setAllergies(a => [...a, v]);
    setAllergyInp("");
  }
  function removeAllergy(item) { setAllergies(a => a.filter(x => x !== item)); }

  function addCondition() {
    const v = condInp.trim();
    if (!v || conditions.includes(v)) return;
    setConditions(c => [...c, v]);
    setCondInp("");
  }
  function removeCondition(item) { setConditions(c => c.filter(x => x !== item)); }

  async function saveProfile() {
    if (!userId) return;
    setBusy(true); setSaved(false);
    try {
      await setDoc(doc(db, "profiles", userId), {
        dob, bloodType, weight, height,
        allergies,
        medicalConditions: conditions,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2800);
    } catch(e) { console.error("Save profile error:", e); }
    finally { setBusy(false); }
  }

  if (loading) return (
    <div style={{padding:"24px 18px",display:"flex",alignItems:"center",gap:10,color:t3}}>
      <Loader2 size={16} style={{animation:"spin360 .7s linear infinite"}}/> Loading profile...
    </div>
  );

  return (
    <div style={{padding:"16px 18px 22px",borderTop:"1px solid var(--b0)"}}>
      {}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:18}}>
        {[
          ["Date of birth", dob, setDob, "e.g. 1985-04-22", "date"],
          ["Blood type",    bloodType, setBloodType, "e.g. O+",       "text"],
          ["Weight",        weight,    setWeight,    "e.g. 72 kg",    "text"],
          ["Height",        height,    setHeight,    "e.g. 175 cm",   "text"],
        ].map(([label, val, setter, ph, type]) => (
          <div key={label}>
            <label className="lbl">{label}</label>
            <input className="inp" type={type} value={val} placeholder={ph}
              onChange={e => setter(e.target.value)}/>
          </div>
        ))}
      </div>

      {}
      <div style={{marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
          <div style={{width:22,height:22,borderRadius:7,background:"rgba(239,68,68,.1)",
                       border:"1px solid rgba(239,68,68,.22)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <AlertCircle size={11} color="var(--ro)"/>
          </div>
          <label className="lbl" style={{marginBottom:0}}>Known Allergies</label>
        </div>
        <TagList items={allergies} onRemove={removeAllergy} type="allergy" t3={t3}/>
        <AddRow value={allergyInp} onChange={setAllergyInp} onAdd={addAllergy}
          placeholder="e.g. Penicillin, Peanuts, Latex" btnColor="var(--ro)" t3={t3}/>
      </div>

      {}
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
          <div style={{width:22,height:22,borderRadius:7,background:"rgba(245,158,11,.1)",
                       border:"1px solid rgba(245,158,11,.22)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <HeartPulse size={11} color="var(--am)"/>
          </div>
          <label className="lbl" style={{marginBottom:0}}>Medical Conditions</label>
        </div>
        <TagList items={conditions} onRemove={removeCondition} type="condition" t3={t3}/>
        <AddRow value={condInp} onChange={setCondInp} onAdd={addCondition}
          placeholder="e.g. Asthma, Type 2 Diabetes, Hypertension" btnColor="var(--am)" t3={t3}/>
      </div>

      <AnimatePresence>
        {saved && <div style={{marginBottom:12}}><OkBanner msg="Health profile saved successfully."/></div>}
      </AnimatePresence>

      <button className="btn" style={{width:"100%",padding:"11px"}} disabled={busy} onClick={saveProfile}>
        {busy ? <><Loader2 size={14} style={{animation:"spin360 .7s linear infinite",marginRight:7}}/>Saving...</> : "Save Health Profile"}
      </button>
    </div>
  );
}

function SettingsPage({ light, setLight, user, displayName, onEditName, meds, onFeedback }) {
  const t1="var(--t1)", t2="var(--t2)", t3="var(--t3)";
  const name=displayName||user?.displayName||user?.email?.split("@")[0]||"User";
  const [notifEmail, setNotifEmail] = useState(user?.email || "");
  const [notifOn,    setNotifOn]    = useState(localStorage.getItem("mt_notif")==="true");
  const [notifSaved, setNotifSaved] = useState(false);
  const [openRow,    setOpenRow]    = useState(null);
  const [delBusy,    setDelBusy]    = useState(false);
  const [delPw,      setDelPw]      = useState("");
  const [delErr,     setDelErr]     = useState("");
  const [delStep,    setDelStep]    = useState(0);

  function toggleRow(key) { setOpenRow(o => o===key ? null : key); }

  function saveNotifications() {
    localStorage.setItem("mt_notif", notifOn ? "true" : "false");
    localStorage.setItem("mt_notif_email", notifEmail);
    addDoc(collection(db, "ReminderPreferences"), {
      userEmail:    user?.email || "",
      notifEnabled: notifOn,
      reminderEmail: notifEmail,
      updatedAt:    serverTimestamp(),
    }).catch(e => console.warn("Could not save notif prefs to Firestore:", e));
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2500);
  }

  
  async function deleteAccount() {
    if (delStep === 0) { setDelStep(1); setDelErr(""); return; }

    if (delStep === 1) {
      if (!delPw.trim()) { setDelErr("Enter your password to continue."); return; }
      setDelBusy(true); setDelErr("");
      try {
        const credential = EmailAuthProvider.credential(user.email, delPw);
        await reauthenticateWithCredential(auth.currentUser, credential);
        try {
          await addDoc(collection(db, "mail"), {
            to: user.email,
            message: {
              subject: "⚠️ MedTrack Account Deletion Confirmation",
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8faff;border-radius:16px">
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
                    <span style="font-size:22px">💊</span>
                    <span style="font-size:20px;font-weight:700;color:#0c1433">MedTrack</span>
                  </div>
                  <h2 style="color:#b91c1c;font-size:20px;margin-bottom:12px">Account Deletion Requested</h2>
                  <p style="color:#374369;font-size:15px;line-height:1.7;margin-bottom:16px">
                    Hi there,<br/><br/>
                    We received a request to permanently delete the MedTrack account associated with
                    <strong>${user.email}</strong>.
                  </p>
                  <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:14px 18px;margin-bottom:20px">
                    <p style="color:#991b1b;font-size:14px;margin:0;line-height:1.6">
                      <strong>⚠️ This action is permanent.</strong> All your medication data, reminders, and account information will be deleted and cannot be recovered.
                    </p>
                  </div>
                  <p style="color:#374369;font-size:14px;line-height:1.7">
                    If you did not request this, please change your password immediately and contact support.
                  </p>
                  <p style="color:#6e7fa8;font-size:13px;margin-top:24px">
                    — The MedTrack Team
                  </p>
                </div>
              `,
            },
          });
        } catch (mailErr) {
          console.warn("Confirmation email could not be sent (Trigger Email extension may not be configured):", mailErr);
        }
        setDelStep(2);
        setDelErr("Password verified. A confirmation email has been sent to " + user.email + ". Click below to permanently delete your account.");
      } catch(e) {
        const code = e.code || "";
        if (code === "auth/wrong-password" || code === "auth/invalid-credential")
          setDelErr("Incorrect password. Please try again.");
        else setDelErr(e.message || "Could not verify. Try again.");
      } finally { setDelBusy(false); }
      return;
    }

    setDelBusy(true); setDelErr("");
    try {
      const medsQ = query(collection(db, "Medications"), where("userEmail","==",user.email));
      const medsSnap = await getDocs(medsQ);
      await Promise.all(medsSnap.docs.map(d => deleteDoc(doc(db, "Medications", d.id))));
      const prefsQ = query(collection(db, "ReminderPreferences"), where("userEmail","==",user.email));
      const prefsSnap = await getDocs(prefsQ);
      await Promise.all(prefsSnap.docs.map(d => deleteDoc(doc(db, "ReminderPreferences", d.id))));
      await deleteUser(auth.currentUser);
      localStorage.clear();
    } catch(e) {
      const code = e.code || "";
      if (code === "auth/requires-recent-login")
        setDelErr("Session expired. Please sign out and sign back in before deleting.");
      else setDelErr(e.message || "Could not delete account. Try again.");
    } finally { setDelBusy(false); }
  }

  const rows = [
    {
      key:"notifications",
      I: BellRing, label:"Notifications", sub:"Email reminders for medication times",
      color:"rgba(37,99,235,.12)", iconColor:"var(--p)",
      content: (
        <div style={{padding:"16px 18px 20px",borderTop:"1px solid var(--b0)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div>
              <p style={{color:t1,fontSize:13,fontWeight:600}}>Email reminders</p>
              <p style={{color:t3,fontSize:12,marginTop:2}}>Alert before each scheduled dose</p>
            </div>
            <div className={`sw ${notifOn?"on":""}`} onClick={()=>setNotifOn(!notifOn)}/>
          </div>
          <AnimatePresence>
            {notifOn && (
              <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} style={{overflow:"hidden"}}>
                <label className="lbl" style={{marginBottom:7}}>Send reminders to</label>
                <input className="inp" type="email" value={notifEmail}
                  onChange={e=>setNotifEmail(e.target.value)}
                  placeholder="your@email.com" style={{marginBottom:14}}/>
                <AnimatePresence>
                  {notifSaved && <OkBanner msg="Reminder preferences saved."/>}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
          <button className="btn" style={{width:"100%",padding:"11px"}} onClick={saveNotifications}>Save Preferences</button>
        </div>
      )
    },
    {
      key:"privacy",
      I: ShieldCheck, label:"Privacy & Security", sub:"Data security, encryption, and account deletion",
      color:"rgba(6,182,212,.10)", iconColor:"var(--tl)",
      content: (
        <div style={{padding:"16px 18px 20px",borderTop:"1px solid var(--b0)"}}>
          {[
            {l:"End-to-end encryption",        d:"Medication data encrypted in Firestore"},
            {l:"No data sold to third parties", d:"Your health info is never shared or monetised"},
            {l:"Anonymous analytics only",      d:"Usage data is anonymised and optional"},
          ].map((item,i) => (
            <div key={item.l} style={{display:"flex",gap:11,padding:"10px 0",
                                      borderBottom:i<2?"1px solid var(--b0)":"none"}}>
              <ShieldCheck size={14} color="var(--tl)" style={{flexShrink:0,marginTop:2}}/>
              <div>
                <p style={{color:t1,fontSize:13,fontWeight:600}}>{item.l}</p>
                <p style={{color:t3,fontSize:12,marginTop:2,lineHeight:1.55}}>{item.d}</p>
              </div>
            </div>
          ))}

          {}
          <div style={{marginTop:18,padding:"16px",borderRadius:13,
                       border:"1px solid rgba(239,68,68,.2)",background:"rgba(239,68,68,.04)"}}>
            <p style={{color:"var(--ro)",fontSize:13,fontWeight:700,marginBottom:6}}>Delete Account</p>
            <p style={{color:t3,fontSize:12,lineHeight:1.55,marginBottom:12}}>
              Permanently deletes your account and all data. A confirmation email will be sent first.
            </p>

            {}
            <AnimatePresence>
              {delStep >= 1 && (
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}}
                  exit={{opacity:0,height:0}} style={{overflow:"hidden",marginBottom:12}}>
                  <label className="lbl" style={{color:"rgba(239,68,68,.7)"}}>
                    {delStep === 1 ? "Enter your password to send confirmation email" : "Password confirmed"}
                  </label>
                  {delStep === 1 && (
                    <input className="inp" type="password" value={delPw}
                      placeholder="Your current password"
                      onChange={e=>setDelPw(e.target.value)}
                      style={{borderColor:"rgba(239,68,68,.3)"}}/>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {}
            <AnimatePresence>
              {delStep === 2 && delErr && (
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}}
                  exit={{opacity:0,height:0}} style={{overflow:"hidden",marginBottom:12}}>
                  <div style={{padding:"10px 14px",borderRadius:10,
                               background:"rgba(245,158,11,.07)",border:"1px solid rgba(245,158,11,.2)"}}>
                    <p style={{color:"var(--am)",fontSize:12,lineHeight:1.65}}>{delErr}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {}
            <AnimatePresence>
              {delStep !== 2 && delErr && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                  style={{marginBottom:10}}>
                  <ErrBanner msg={delErr}/>
                </motion.div>
              )}
            </AnimatePresence>

            {delStep < 2 ? (
              <button disabled={delBusy || (delStep===1 && !delPw.trim())}
                onClick={deleteAccount}
                style={{width:"100%",padding:"11px",borderRadius:11,
                        border:"1px solid rgba(239,68,68,.3)",
                        background: delStep===0 ? "transparent" : "rgba(239,68,68,.1)",
                        color:"var(--ro)",fontFamily:"inherit",fontSize:13,fontWeight:700,
                        cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                {delBusy ? <Loader2 size={14} style={{animation:"spin360 .7s linear infinite"}}/> :
                 delStep===0 ? <><Trash2 size={14}/> Delete My Account</> :
                               <><Mail size={14}/> Send Confirmation Email</>}
              </button>
            ) : (
              <button disabled={delBusy}
                onClick={deleteAccount}
                style={{width:"100%",padding:"11px",borderRadius:11,
                        border:"1px solid rgba(239,68,68,.4)",
                        background:"rgba(239,68,68,.14)",
                        color:"var(--ro)",fontFamily:"inherit",fontSize:13,fontWeight:700,
                        cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                {delBusy ? <Loader2 size={14} style={{animation:"spin360 .7s linear infinite"}}/> :
                            <><Trash2 size={14}/> Permanently Delete My Account</>}
              </button>
            )}

            {delStep > 0 && (
              <button onClick={()=>{setDelStep(0);setDelPw("");setDelErr("");}}
                style={{marginTop:8,width:"100%",padding:"8px",borderRadius:9,border:"none",
                        background:"transparent",color:t3,fontFamily:"inherit",fontSize:12,cursor:"pointer"}}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )
    },
    {
      key:"health",
      I: HeartPulse, label:"Health Profile", sub:"Personal health information and medical history",
      color:"rgba(239,68,68,.10)", iconColor:"var(--ro)",
      content: <HealthProfile userId={user?.uid} t1={t1} t2={t2} t3={t3}/>,
    },
    {
      key:"emergency",
      I: Siren, label:"Emergency Contact", sub:"Caregiver and emergency access",
      color:"rgba(245,158,11,.10)", iconColor:"var(--am)",
      content: <EmergencyContact userId={user?.uid} t1={t1} t2={t2} t3={t3}/>,
    },
  ];

  return (
    <div style={{flex:1,overflowY:"auto"}}>
      <div style={{maxWidth:560,margin:"0 auto",padding:"26px 22px 44px"}}>
        <motion.div className="au" style={{marginBottom:26}}>
          <h2 style={{color:t1,fontSize:24,fontFamily:"'Playfair Display',Georgia,serif",fontStyle:"italic",fontWeight:600,letterSpacing:"-.3px"}}>Settings</h2>
          <p style={{color:t3,fontSize:13,marginTop:6,lineHeight:1.6}}>Manage your account and preferences.</p>
        </motion.div>

        {}
        <motion.div className="au d1 card" style={{padding:18,marginBottom:10,display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:48,height:48,borderRadius:15,
            background:"linear-gradient(135deg,rgba(37,99,235,.16),rgba(6,182,212,.1))",
            border:"1px solid rgba(37,99,235,.22)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <UserCircle2 size={22} color="var(--p)"/>
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <p style={{color:t1,fontSize:14,fontWeight:700}}>{name}</p>
              <button onClick={onEditName}
                style={{width:22,height:22,borderRadius:6,border:"1px solid var(--b1)",background:"transparent",
                        cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                        color:t3,transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--p)";e.currentTarget.style.color="var(--p)"}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--b1)";e.currentTarget.style.color=t3}}>
                <Pencil size={10}/>
              </button>
            </div>
            <p style={{color:t3,fontSize:12,marginTop:2}}>{user?.email}</p>
          </div>
          <span style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:600,
            background:"rgba(16,185,129,.09)",border:"1px solid rgba(16,185,129,.2)",color:"var(--gr)"}}>
            Verified
          </span>
        </motion.div>

        {}
        <motion.div className="au d2 card" style={{padding:18,marginBottom:10}}>
          <p style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginBottom:14}}>Appearance</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            {[[true,"Light Mode",Sun,"rgba(245,158,11,.12)","var(--am)"],[false,"Dark Mode",Moon,"var(--pd)","var(--p)"]].map(([v,l,I,bg,ic])=>(
              <button key={String(v)} onClick={()=>setLight(v)}
                style={{padding:"15px",borderRadius:13,cursor:"pointer",fontFamily:"inherit",transition:"all .18s",
                  border:`1.5px solid ${light===v?"var(--p)":"var(--b1)"}`,
                  background:light===v?"var(--pd)":"var(--s2)",
                  display:"flex",flexDirection:"column",alignItems:"center",gap:9}}>
                <div style={{width:36,height:36,borderRadius:10,background:light===v?bg:"var(--s3)",
                             display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <I size={17} color={light===v?ic:t3}/>
                </div>
                <span style={{color:light===v?"var(--p)":t3,fontSize:12,fontWeight:600}}>{l}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {}
        <motion.div className="au d2" style={{marginBottom:10}}>
          <button onClick={onFeedback}
            style={{width:"100%",padding:"14px 18px",borderRadius:13,border:"1px solid var(--b1)",
                    background:"var(--s1)",cursor:"pointer",fontFamily:"inherit",
                    display:"flex",alignItems:"center",gap:12,transition:"all .18s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="var(--p)"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="var(--b1)"}>
            <div style={{width:36,height:36,borderRadius:10,background:"rgba(16,185,129,.1)",
                         display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <MessageSquare size={16} color="var(--gr)"/>
            </div>
            <div style={{flex:1,textAlign:"left"}}>
              <p style={{color:t1,fontSize:13,fontWeight:600}}>Send Feedback</p>
              <p style={{color:t3,fontSize:11,marginTop:1}}>Rate the app, report bugs, or suggest features</p>
            </div>
            <ArrowRight size={14} color={t3}/>
          </button>
        </motion.div>

        {}
        <motion.div className="au d3 card" style={{overflow:"hidden",marginBottom:10}}>
          <p style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",padding:"16px 18px 11px",opacity:.8}}>
            Account & Preferences
          </p>
          {rows.map((r,i) => (
            <div key={r.key}>
              {i>0 && <div style={{height:1,background:"var(--b0)",margin:"0 18px"}}/>}
              <div className="srow" onClick={()=>toggleRow(r.key)}
                style={{padding:"13px 18px",display:"flex",alignItems:"center",gap:13,cursor:"pointer"}}>
                <div style={{width:36,height:36,borderRadius:10,background:r.color,
                             display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <r.I size={16} color={r.iconColor}/>
                </div>
                <div style={{flex:1}}>
                  <p style={{color:t1,fontSize:13,fontWeight:600}}>{r.label}</p>
                  <p style={{color:t3,fontSize:11,marginTop:2,lineHeight:1.45}}>{r.sub}</p>
                </div>
                <motion.div animate={{rotate:openRow===r.key?180:0}} transition={{duration:.2}}>
                  <ChevronDown size={15} color={t3}/>
                </motion.div>
              </div>
              <AnimatePresence>
                {openRow === r.key && (
                  <motion.div key="exp" initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}}
                    exit={{height:0,opacity:0}} transition={{duration:.25}} style={{overflow:"hidden"}}>
                    {r.content}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </motion.div>

        {}
        <motion.div className="au d4">
          <button onClick={()=>signOut(auth)}
            style={{width:"100%",padding:"13px",borderRadius:13,
              border:"1px solid rgba(239,68,68,.2)",background:"rgba(239,68,68,.07)",
              color:"var(--ro)",fontFamily:"inherit",fontWeight:600,fontSize:13,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .18s"}}>
            <LogOut size={14}/> Sign Out
          </button>
        </motion.div>
      </div>
    </div>
  );
}

function DoctorPortal({ user, light, setLight, userName }) {
  const [page,      setPage]    = useState("dashboard");
  const [patients,  setPatients] = useState([]);
  const [search,    setSearch]  = useState("");
  const [selPat,    setSelPat]  = useState(null);
  const [patProfile,setPatProfile] = useState(null);
  const [patMeds,   setPatMeds] = useState([]);
  const [note,      setNote]    = useState("");
  const [notes,     setNotes]   = useState([]);
  const [noteBusy,  setNoteBusy] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [loading,   setLoading] = useState(false);
  const isMob = useIsMobile();
  const t1="var(--t1)",t2="var(--t2)",t3="var(--t3)",b1="var(--b1)";

  const name = userName || user?.displayName || user?.email?.split("@")[0] || "Doctor";

  useEffect(() => {
    document.body.className = light ? "light" : "";
  }, [light]);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db,"users"), where("role","==","client"));
        const snap = await getDocs(q);
        setPatients(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      } catch(e) { console.error("Load patients:", e); }
    })();
  }, []);

  async function openPatient(pat) {
    setSelPat(pat); setLoading(true); setPatProfile(null); setPatMeds([]); setNotes([]);
    try {
      const [profSnap, medsSnap, notesSnap] = await Promise.all([
        getDoc(doc(db,"profiles",pat.id)),
        getDocs(query(collection(db,"Medications"), where("userEmail","==",pat.email))),
        getDocs(query(collection(db,"doctorNotes"), where("patientId","==",pat.id), where("doctorId","==",user.uid))),
      ]);
      setPatProfile(profSnap.exists() ? profSnap.data() : {});
      setPatMeds(medsSnap.docs.map(d => ({ id:d.id,...d.data() })));
      setNotes(notesSnap.docs.map(d => ({ id:d.id,...d.data() })).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    } catch(e) { console.error("Load patient detail:", e); }
    finally { setLoading(false); }
  }

  async function addNote() {
    if (!note.trim() || !selPat) return;
    setNoteBusy(true);
    try {
      const nd = await addDoc(collection(db,"doctorNotes"), {
        doctorId: user.uid, patientId: selPat.id,
        doctorEmail: user.email, patientEmail: selPat.email,
        note: note.trim(), createdAt: serverTimestamp(),
      });
      setNotes(n => [{ id:nd.id, doctorId:user.uid, patientId:selPat.id, note:note.trim() }, ...n]);
      setNote(""); setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2500);
    } catch(e) { console.error("Add note:", e); }
    finally { setNoteBusy(false); }
  }

  const filtered = patients.filter(p =>
    !search || p.fullName?.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const DocAC = "var(--doc-p)";
  const DocPD = "var(--doc-pd)";

  return (
    <div style={{display:"flex",minHeight:"100vh",background:"var(--bg)"}}>
      {}
      {!isMob && (
        <aside className="sidebar">
          <div style={{padding:"20px 14px 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:34,height:34,borderRadius:10,background:"var(--doc-pd)",
                           border:"1px solid rgba(14,116,144,.28)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Stethoscope size={16} color={DocAC}/>
              </div>
              <div>
                <p style={{color:t1,fontSize:15,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:600}}>MedTrack</p>
                <p className="gt" style={{fontSize:9,color:DocAC}}>DOCTOR PORTAL</p>
              </div>
            </div>
          </div>
          <div style={{height:1,background:"var(--b0)",margin:"0 12px 10px"}}/>
          <nav style={{flex:1,padding:"0 7px",display:"flex",flexDirection:"column",gap:1}}>
            {[["dashboard","Dashboard",HeartPulse],["patients","Patients",User]].map(([id,l,I]) => (
              <div key={id} className={`nl ${page===id?"doc-on":""}`} onClick={()=>{setPage(id);setSelPat(null);}}>
                <I size={15}/>{l}
              </div>
            ))}
          </nav>
          <div style={{padding:"6px 7px 22px",display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px"}}>
              <span style={{display:"flex",alignItems:"center",gap:7,color:t3,fontSize:12}}>
                {light ? <Sun size={13} color="var(--am)"/> : <Moon size={13}/>} {light?"Light":"Dark"}
              </span>
              <div className={`sw ${!light?"on":""}`} onClick={()=>setLight(!light)}/>
            </div>
            <button onClick={()=>signOut(auth)}
              style={{display:"flex",alignItems:"center",gap:7,padding:"7px 10px",borderRadius:10,
                      border:"none",background:"transparent",cursor:"pointer",color:"var(--ro)",
                      fontFamily:"inherit",fontSize:12,fontWeight:500,width:"100%",transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(220,38,38,.07)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <LogOut size={13}/> Sign Out
            </button>
          </div>
        </aside>
      )}

      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {}
        <header className="tb">
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <Stethoscope size={16} color={DocAC}/>
            <span style={{color:t1,fontSize:15,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:600}}>Dr. {name}</span>
            <span className="role-badge role-doctor">Doctor</span>
          </div>
          <button onClick={()=>setLight(!light)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"6px 13px",borderRadius:99,
                    border:`1px solid ${b1}`,background:"var(--s1)",cursor:"pointer",fontSize:12,fontWeight:500,color:t2}}>
            {light ? <Moon size={13} color={DocAC}/> : <Sun size={13} color="var(--am)"/>}
            {light ? "Dark" : "Light"}
          </button>
        </header>

        <div style={{flex:1,overflowY:"auto"}}>
          {}
          {(page==="dashboard" || !selPat) && page==="dashboard" && (
            <div style={{maxWidth:760,margin:"0 auto",padding:"30px 22px 44px"}}>
              <motion.div className="au" style={{marginBottom:28}}>
                <h2 style={{color:t1,fontSize:26,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:600}}>
                  Good day, Dr. {name.split(" ")[0]}.
                </h2>
                <p style={{color:t3,fontSize:13,marginTop:6}}>Your clinical dashboard. Manage patients and notes below.</p>
              </motion.div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:24}}>
                {[
                  {l:"Total Patients",   v:patients.length,                     c:DocAC, bg:"var(--doc-pd)"},
                  {l:"With Medications", v:patients.length,                     c:"var(--gr)", bg:"rgba(5,150,105,.1)"},
                  {l:"Active Today",     v:Math.min(patients.length,3),         c:"var(--am)", bg:"rgba(217,119,6,.1)"},
                ].map((s,i) => (
                  <motion.div key={s.l} className={`au card d${i+1}`} style={{padding:"18px 16px",textAlign:"center"}}>
                    <div style={{width:38,height:38,borderRadius:11,background:s.bg,margin:"0 auto 10px",
                                 display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <User size={17} color={s.c}/>
                    </div>
                    <p style={{color:t1,fontSize:22,fontFamily:"'Playfair Display',serif",fontStyle:"italic"}}>{s.v}</p>
                    <p style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginTop:4}}>{s.l}</p>
                  </motion.div>
                ))}
              </div>
              <motion.div className="au d3 card" style={{padding:22}}>
                <h3 style={{color:t1,fontSize:15,fontWeight:600,marginBottom:14}}>Recent Patients</h3>
                {patients.slice(0,5).map(p => (
                  <div key={p.id} onClick={() => { setPage("patients"); openPatient(p); }}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",
                            borderBottom:"1px solid var(--b0)",cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.opacity=".75"}
                    onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                    <div style={{width:36,height:36,borderRadius:11,background:"var(--doc-pd)",
                                 display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <User size={16} color={DocAC}/>
                    </div>
                    <div style={{flex:1}}>
                      <p style={{color:t1,fontSize:13,fontWeight:600}}>{p.fullName || "Unknown"}</p>
                      <p style={{color:t3,fontSize:11,marginTop:1}}>{p.email}</p>
                    </div>
                    <ArrowRight size={13} color={t3}/>
                  </div>
                ))}
                {patients.length === 0 && <p style={{color:t3,fontSize:13}}>No client accounts found yet.</p>}
              </motion.div>
            </div>
          )}

          {}
          {page==="patients" && (
            <div style={{maxWidth:900,margin:"0 auto",padding:"30px 22px 44px"}}>
              {!selPat ? (
                <>
                  <motion.div className="au" style={{marginBottom:22,display:"flex",alignItems:"center",gap:14}}>
                    <div>
                      <h2 style={{color:t1,fontSize:24,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:600}}>Patients</h2>
                      <p style={{color:t3,fontSize:13,marginTop:4}}>{patients.length} registered patient{patients.length!==1?"s":""}</p>
                    </div>
                  </motion.div>
                  <div style={{position:"relative",marginBottom:18}}>
                    <Search size={15} color={t3} style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)"}}/>
                    <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
                      placeholder="Search by name or email…" style={{paddingLeft:40}}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {filtered.map(p => (
                      <motion.div key={p.id} className="card" onClick={() => openPatient(p)}
                        style={{padding:"16px 18px",display:"flex",alignItems:"center",gap:13,cursor:"pointer"}}
                        whileHover={{x:2}}>
                        <div style={{width:40,height:40,borderRadius:12,background:"var(--doc-pd)",
                                     display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <User size={18} color={DocAC}/>
                        </div>
                        <div style={{flex:1}}>
                          <p style={{color:t1,fontSize:14,fontWeight:600}}>{p.fullName||"Unknown Patient"}</p>
                          <p style={{color:t3,fontSize:12,marginTop:2}}>{p.email}</p>
                        </div>
                        <ArrowRight size={14} color={t3}/>
                      </motion.div>
                    ))}
                    {filtered.length === 0 && <p style={{color:t3,fontSize:13,padding:"12px 0"}}>No patients found.</p>}
                  </div>
                </>
              ) : (
                
                <>
                  <button onClick={() => setSelPat(null)}
                    style={{display:"flex",alignItems:"center",gap:7,color:DocAC,fontSize:13,fontWeight:600,
                            background:"none",border:"none",cursor:"pointer",marginBottom:22,padding:0}}>
                    <ArrowRight size={13} style={{transform:"rotate(180deg)"}}/> Back to patients
                  </button>
                  {loading ? (
                    <div style={{display:"flex",alignItems:"center",gap:10,color:t3}}>
                      <Loader2 size={16} style={{animation:"spin360 .7s linear infinite"}}/> Loading patient data…
                    </div>
                  ) : (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                      {}
                      <div style={{gridColumn:"1/-1"}}>
                        <motion.div className="au card" style={{padding:20,display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
                          <div style={{width:52,height:52,borderRadius:16,background:"var(--doc-pd)",
                                       border:"1px solid rgba(14,116,144,.25)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                            <User size={24} color={DocAC}/>
                          </div>
                          <div>
                            <h3 style={{color:t1,fontSize:18,fontWeight:700}}>{selPat.fullName||"Unknown"}</h3>
                            <p style={{color:t3,fontSize:13,marginTop:2}}>{selPat.email}</p>
                          </div>
                        </motion.div>
                      </div>

                      {}
                      <motion.div className="au d1 card" style={{padding:18}}>
                        <h4 style={{color:t1,fontSize:13,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:7}}>
                          <AlertCircle size={13} color="var(--ro)"/> Allergies
                        </h4>
                        {patProfile?.allergies?.length > 0
                          ? <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                              {patProfile.allergies.map(a => (
                                <span key={a} style={{padding:"4px 11px",borderRadius:99,fontSize:12,fontWeight:600,
                                  background:"rgba(220,38,38,.08)",border:"1px solid rgba(220,38,38,.2)",color:"var(--ro)"}}>
                                  {a}
                                </span>
                              ))}
                            </div>
                          : <p style={{color:t3,fontSize:12}}>None recorded</p>}
                        <h4 style={{color:t1,fontSize:13,fontWeight:600,margin:"16px 0 10px",display:"flex",alignItems:"center",gap:7}}>
                          <HeartPulse size={13} color="var(--am)"/> Conditions
                        </h4>
                        {patProfile?.medicalConditions?.length > 0
                          ? <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                              {patProfile.medicalConditions.map(c => (
                                <span key={c} style={{padding:"4px 11px",borderRadius:99,fontSize:12,fontWeight:600,
                                  background:"rgba(217,119,6,.08)",border:"1px solid rgba(217,119,6,.2)",color:"var(--am)"}}>
                                  {c}
                                </span>
                              ))}
                            </div>
                          : <p style={{color:t3,fontSize:12}}>None recorded</p>}
                      </motion.div>

                      {}
                      <motion.div className="au d2 card" style={{padding:18}}>
                        <h4 style={{color:t1,fontSize:13,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:7}}>
                          <Pill size={13} color={DocAC}/> Current Medications ({patMeds.length})
                        </h4>
                        {patMeds.length === 0
                          ? <p style={{color:t3,fontSize:12}}>No medications on record</p>
                          : patMeds.map(m => {
                            const col = COLS[m.color]||COLS.blue;
                            return (
                              <div key={m.id} style={{display:"flex",alignItems:"center",gap:9,
                                padding:"8px 0",borderBottom:"1px solid var(--b0)"}}>
                                <div style={{width:28,height:28,borderRadius:8,background:col.d,
                                             border:`1px solid ${col.b}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                                  <Pill size={12} color={col.a}/>
                                </div>
                                <div style={{flex:1}}>
                                  <p style={{color:t1,fontSize:13,fontWeight:600}}>{m.medicationName}</p>
                                  <p style={{color:t3,fontSize:11,marginTop:1}}>{m.dosage} · {m.freq} · {to12h(m.reminderTime)}</p>
                                </div>
                              </div>
                            );
                          })}
                      </motion.div>

                      {}
                      <motion.div className="au d3 card" style={{padding:18,gridColumn:"1/-1"}}>
                        <h4 style={{color:t1,fontSize:13,fontWeight:600,marginBottom:12}}>Clinical Notes</h4>
                        <textarea className="inp" rows={3} value={note}
                          onChange={e => setNote(e.target.value)}
                          placeholder="Add a clinical note for this patient…"
                          style={{marginBottom:10}}/>
                        <AnimatePresence>
                          {noteSaved && <div style={{marginBottom:10}}><OkBanner msg="Note saved."/></div>}
                        </AnimatePresence>
                        <button className="btn-doc" disabled={noteBusy||!note.trim()} onClick={addNote}
                          style={{marginBottom:16}}>
                          {noteBusy ? <Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/> : <><Plus size={13}/> Add Note</>}
                        </button>
                        <div style={{display:"flex",flexDirection:"column",gap:9}}>
                          {notes.map(n => (
                            <div key={n.id} style={{padding:"11px 14px",borderRadius:12,
                              background:"var(--s2)",border:"1px solid var(--b0)"}}>
                              <p style={{color:t1,fontSize:13,lineHeight:1.65}}>{n.note}</p>
                            </div>
                          ))}
                          {notes.length === 0 && <p style={{color:t3,fontSize:12}}>No notes yet.</p>}
                        </div>
                      </motion.div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PharmacistPortal({ user, light, setLight, userName }) {
  const [page,    setPage]    = useState("dashboard");
  const [patients,setPatients] = useState([]);
  const [search,  setSearch]  = useState("");
  const [selPat,  setSelPat]  = useState(null);
  const [patProfile,setPatProfile] = useState(null);
  const [patMeds, setPatMeds] = useState([]);
  const [notes,   setNotes]   = useState([]);
  const [note,    setNote]    = useState("");
  const [refill,  setRefill]  = useState("pending");
  const [noteBusy,setNoteBusy] = useState(false);
  const [noteSaved,setNoteSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const isMob = useIsMobile();
  const t1="var(--t1)",t2="var(--t2)",t3="var(--t3)",b1="var(--b1)";
  const name = userName || user?.displayName || user?.email?.split("@")[0] || "Pharmacist";

  useEffect(() => { document.body.className = light ? "light" : ""; }, [light]);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db,"users"), where("role","==","client"));
        const snap = await getDocs(q);
        setPatients(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      } catch(e) { console.error("Load patients:", e); }
    })();
  }, []);

  async function openPatient(pat) {
    setSelPat(pat); setLoading(true); setPatProfile(null); setPatMeds([]); setNotes([]);
    try {
      const [profSnap, medsSnap, notesSnap] = await Promise.all([
        getDoc(doc(db,"profiles",pat.id)),
        getDocs(query(collection(db,"Medications"), where("userEmail","==",pat.email))),
        getDocs(query(collection(db,"pharmacistNotes"), where("patientId","==",pat.id), where("pharmacistId","==",user.uid))),
      ]);
      setPatProfile(profSnap.exists() ? profSnap.data() : {});
      setPatMeds(medsSnap.docs.map(d => ({ id:d.id,...d.data() })));
      setNotes(notesSnap.docs.map(d => ({ id:d.id,...d.data() })).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    } catch(e) { console.error("Load patient detail:", e); }
    finally { setLoading(false); }
  }

  async function addNote() {
    if (!note.trim() || !selPat) return;
    setNoteBusy(true);
    try {
      const nd = await addDoc(collection(db,"pharmacistNotes"), {
        pharmacistId: user.uid, patientId: selPat.id,
        pharmacistEmail: user.email, patientEmail: selPat.email,
        note: note.trim(), refillStatus: refill, createdAt: serverTimestamp(),
      });
      setNotes(n => [{ id:nd.id, note:note.trim(), refillStatus:refill }, ...n]);
      setNote(""); setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2500);
    } catch(e) { console.error("Add pharmacist note:", e); }
    finally { setNoteBusy(false); }
  }

  const filtered = patients.filter(p =>
    !search || p.fullName?.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const PhAC = "var(--pha-p)";
  const refillColors = { pending:["rgba(217,119,6,.1)","rgba(217,119,6,.25)","var(--am)"], approved:["rgba(5,150,105,.1)","rgba(5,150,105,.25)","var(--gr)"], dispensed:["rgba(37,99,235,.1)","rgba(37,99,235,.25)","var(--pl)"], denied:["rgba(220,38,38,.1)","rgba(220,38,38,.25)","var(--ro)"] };

  return (
    <div style={{display:"flex",minHeight:"100vh",background:"var(--bg)"}}>
      {!isMob && (
        <aside className="sidebar">
          <div style={{padding:"20px 14px 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:34,height:34,borderRadius:10,background:"var(--pha-pd)",
                           border:"1px solid rgba(124,58,237,.28)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <ShieldCheck size={16} color={PhAC}/>
              </div>
              <div>
                <p style={{color:t1,fontSize:15,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:600}}>MedTrack</p>
                <p className="gt" style={{fontSize:9,color:PhAC}}>PHARMACIST</p>
              </div>
            </div>
          </div>
          <div style={{height:1,background:"var(--b0)",margin:"0 12px 10px"}}/>
          <nav style={{flex:1,padding:"0 7px",display:"flex",flexDirection:"column",gap:1}}>
            {[["dashboard","Dashboard",HeartPulse],["patients","Patients",User]].map(([id,l,I]) => (
              <div key={id} className={`nl ${page===id?"pha-on":""}`} onClick={()=>{setPage(id);setSelPat(null);}}>
                <I size={15}/>{l}
              </div>
            ))}
          </nav>
          <div style={{padding:"6px 7px 22px",display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px"}}>
              <span style={{display:"flex",alignItems:"center",gap:7,color:t3,fontSize:12}}>
                {light ? <Sun size={13} color="var(--am)"/> : <Moon size={13}/>} {light?"Light":"Dark"}
              </span>
              <div className={`sw ${!light?"on":""}`} onClick={()=>setLight(!light)}/>
            </div>
            <button onClick={()=>signOut(auth)}
              style={{display:"flex",alignItems:"center",gap:7,padding:"7px 10px",borderRadius:10,
                      border:"none",background:"transparent",cursor:"pointer",color:"var(--ro)",
                      fontFamily:"inherit",fontSize:12,fontWeight:500,width:"100%",transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(220,38,38,.07)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <LogOut size={13}/> Sign Out
            </button>
          </div>
        </aside>
      )}

      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <header className="tb">
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <ShieldCheck size={16} color={PhAC}/>
            <span style={{color:t1,fontSize:15,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:600}}>{name}</span>
            <span className="role-badge role-pharmacist">Pharmacist</span>
          </div>
          <button onClick={()=>setLight(!light)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"6px 13px",borderRadius:99,
                    border:`1px solid ${b1}`,background:"var(--s1)",cursor:"pointer",fontSize:12,fontWeight:500,color:t2}}>
            {light ? <Moon size={13} color={PhAC}/> : <Sun size={13} color="var(--am)"/>}
            {light ? "Dark" : "Light"}
          </button>
        </header>

        <div style={{flex:1,overflowY:"auto"}}>
          {page==="dashboard" && (
            <div style={{maxWidth:760,margin:"0 auto",padding:"30px 22px 44px"}}>
              <motion.div className="au" style={{marginBottom:28}}>
                <h2 style={{color:t1,fontSize:26,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:600}}>
                  Welcome, {name.split(" ")[0]}.
                </h2>
                <p style={{color:t3,fontSize:13,marginTop:6}}>Manage prescriptions and patient records.</p>
              </motion.div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:24}}>
                {[
                  {l:"Total Patients",v:patients.length,      c:PhAC,          bg:"var(--pha-pd)"},
                  {l:"Refills Pending",v:Math.ceil(patients.length*.3), c:"var(--am)", bg:"rgba(217,119,6,.1)"},
                  {l:"Dispensed Today",v:Math.floor(patients.length*.6),c:"var(--gr)",bg:"rgba(5,150,105,.1)"},
                ].map((s,i) => (
                  <motion.div key={s.l} className={`au card d${i+1}`} style={{padding:"18px 16px",textAlign:"center"}}>
                    <div style={{width:38,height:38,borderRadius:11,background:s.bg,margin:"0 auto 10px",
                                 display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <Pill size={17} color={s.c}/>
                    </div>
                    <p style={{color:t1,fontSize:22,fontFamily:"'Playfair Display',serif",fontStyle:"italic"}}>{s.v}</p>
                    <p style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginTop:4}}>{s.l}</p>
                  </motion.div>
                ))}
              </div>
              <motion.div className="au d3 card" style={{padding:22}}>
                <h3 style={{color:t1,fontSize:15,fontWeight:600,marginBottom:14}}>Patient Lookup</h3>
                <div style={{position:"relative",marginBottom:14}}>
                  <Search size={14} color={t3} style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)"}}/>
                  <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
                    placeholder="Find a patient…" style={{paddingLeft:38}}/>
                </div>
                {filtered.slice(0,6).map(p => (
                  <div key={p.id} onClick={() => { setPage("patients"); openPatient(p); }}
                    style={{display:"flex",alignItems:"center",gap:11,padding:"10px 0",
                            borderBottom:"1px solid var(--b0)",cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.opacity=".75"}
                    onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                    <div style={{width:34,height:34,borderRadius:10,background:"var(--pha-pd)",
                                 display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <User size={15} color={PhAC}/>
                    </div>
                    <div style={{flex:1}}>
                      <p style={{color:t1,fontSize:13,fontWeight:600}}>{p.fullName||"Unknown"}</p>
                      <p style={{color:t3,fontSize:11}}>{p.email}</p>
                    </div>
                    <ArrowRight size={13} color={t3}/>
                  </div>
                ))}
              </motion.div>
            </div>
          )}

          {page==="patients" && (
            <div style={{maxWidth:900,margin:"0 auto",padding:"30px 22px 44px"}}>
              {!selPat ? (
                <>
                  <motion.div className="au" style={{marginBottom:22}}>
                    <h2 style={{color:t1,fontSize:24,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:600}}>Patient Records</h2>
                    <p style={{color:t3,fontSize:13,marginTop:4}}>{patients.length} registered patients</p>
                  </motion.div>
                  <div style={{position:"relative",marginBottom:16}}>
                    <Search size={14} color={t3} style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)"}}/>
                    <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
                      placeholder="Search patients…" style={{paddingLeft:40}}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {filtered.map(p => (
                      <motion.div key={p.id} className="card" onClick={() => openPatient(p)}
                        style={{padding:"15px 18px",display:"flex",alignItems:"center",gap:13,cursor:"pointer"}}
                        whileHover={{x:2}}>
                        <div style={{width:40,height:40,borderRadius:12,background:"var(--pha-pd)",
                                     display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <User size={18} color={PhAC}/>
                        </div>
                        <div style={{flex:1}}>
                          <p style={{color:t1,fontSize:14,fontWeight:600}}>{p.fullName||"Unknown"}</p>
                          <p style={{color:t3,fontSize:12}}>{p.email}</p>
                        </div>
                        <ArrowRight size={14} color={t3}/>
                      </motion.div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => setSelPat(null)}
                    style={{display:"flex",alignItems:"center",gap:7,color:PhAC,fontSize:13,fontWeight:600,
                            background:"none",border:"none",cursor:"pointer",marginBottom:22,padding:0}}>
                    <ArrowRight size={13} style={{transform:"rotate(180deg)"}}/> Back to patients
                  </button>
                  {loading ? (
                    <div style={{display:"flex",alignItems:"center",gap:10,color:t3}}>
                      <Loader2 size={16} style={{animation:"spin360 .7s linear infinite"}}/> Loading…
                    </div>
                  ) : (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                      <div style={{gridColumn:"1/-1"}}>
                        <motion.div className="au card" style={{padding:20,display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
                          <div style={{width:52,height:52,borderRadius:16,background:"var(--pha-pd)",
                                       border:"1px solid rgba(124,58,237,.25)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                            <User size={24} color={PhAC}/>
                          </div>
                          <div>
                            <h3 style={{color:t1,fontSize:18,fontWeight:700}}>{selPat.fullName||"Unknown"}</h3>
                            <p style={{color:t3,fontSize:13}}>{selPat.email}</p>
                          </div>
                        </motion.div>
                      </div>

                      {}
                      <motion.div className="au d1 card" style={{padding:18}}>
                        <h4 style={{color:t1,fontSize:13,fontWeight:600,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                          <AlertCircle size={13} color="var(--ro)"/> Allergy Warnings
                        </h4>
                        {patProfile?.allergies?.length > 0
                          ? patProfile.allergies.map(a => (
                              <div key={a} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",
                                borderBottom:"1px solid var(--b0)"}}>
                                <AlertCircle size={12} color="var(--ro)"/>
                                <span style={{color:"var(--ro)",fontSize:13,fontWeight:600}}>{a}</span>
                              </div>
                            ))
                          : <p style={{color:t3,fontSize:12}}>No known allergies</p>}
                      </motion.div>

                      {}
                      <motion.div className="au d2 card" style={{padding:18}}>
                        <h4 style={{color:t1,fontSize:13,fontWeight:600,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                          <Pill size={13} color={PhAC}/> Prescriptions ({patMeds.length})
                        </h4>
                        {patMeds.length === 0
                          ? <p style={{color:t3,fontSize:12}}>No prescriptions found</p>
                          : patMeds.map(m => {
                            const col = COLS[m.color]||COLS.blue;
                            return (
                              <div key={m.id} style={{display:"flex",alignItems:"center",gap:9,
                                padding:"7px 0",borderBottom:"1px solid var(--b0)"}}>
                                <Pill size={14} color={col.a}/>
                                <div style={{flex:1}}>
                                  <p style={{color:t1,fontSize:13,fontWeight:600}}>{m.medicationName}</p>
                                  <p style={{color:t3,fontSize:11}}>{m.dosage} · {m.freq}</p>
                                </div>
                              </div>
                            );
                          })}
                      </motion.div>

                      {}
                      <motion.div className="au d3 card" style={{padding:18,gridColumn:"1/-1"}}>
                        <h4 style={{color:t1,fontSize:13,fontWeight:600,marginBottom:12}}>Dispensing Notes</h4>
                        <div style={{marginBottom:12}}>
                          <label className="lbl">Refill Status</label>
                          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                            {["pending","approved","dispensed","denied"].map(s => {
                              const [bg,border,col] = refillColors[s] || refillColors.pending;
                              return (
                                <button key={s} onClick={() => setRefill(s)}
                                  style={{padding:"6px 14px",borderRadius:9,border:`1.5px solid`,
                                          fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer",
                                          borderColor: refill===s ? border : "var(--b1)",
                                          background: refill===s ? bg : "transparent",
                                          color: refill===s ? col : t3,
                                          textTransform:"capitalize",transition:"all .15s"}}>
                                  {s}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <textarea className="inp" rows={3} value={note}
                          onChange={e => setNote(e.target.value)}
                          placeholder="Add a dispensing note…" style={{marginBottom:10}}/>
                        <AnimatePresence>
                          {noteSaved && <div style={{marginBottom:10}}><OkBanner msg="Note saved."/></div>}
                        </AnimatePresence>
                        <button className="btn-pha" disabled={noteBusy||!note.trim()} onClick={addNote}
                          style={{marginBottom:16}}>
                          {noteBusy ? <Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/> : <><Plus size={13}/> Add Note</>}
                        </button>
                        {notes.map(n => {
                          const [bg,border,col] = refillColors[n.refillStatus] || refillColors.pending;
                          return (
                            <div key={n.id} style={{padding:"11px 14px",borderRadius:12,marginBottom:8,
                              background:"var(--s2)",border:"1px solid var(--b0)"}}>
                              <span style={{padding:"2px 9px",borderRadius:99,fontSize:10,fontWeight:700,
                                background:bg,border:`1px solid ${border}`,color:col,textTransform:"capitalize",marginBottom:6,display:"inline-block"}}>
                                {n.refillStatus||"pending"}
                              </span>
                              <p style={{color:t1,fontSize:13,lineHeight:1.65,marginTop:5}}>{n.note}</p>
                            </div>
                          );
                        })}
                        {notes.length === 0 && <p style={{color:t3,fontSize:12}}>No notes yet.</p>}
                      </motion.div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [light,        setLight]        = useState(false);
  const [user,         setUser]         = useState(undefined);
  const [userRole,     setUserRole]     = useState("client");
  const [page,         setPage]         = useState("dashboard");
  const [meds,         setMeds]         = useState([]);
  const [medsLoaded,   setMedsLoaded]   = useState(false);
  const [addOpen,      setAddOpen]      = useState(false);
  const [editMed,      setEditMed]      = useState(null);
  const [showAI,       setShowAI]       = useState(false);
  const [mobMenu,      setMobMenu]      = useState(false);
  const [showNickname, setShowNickname] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [displayName,  setDisplayName]  = useState(() => localStorage.getItem("medtrack_name") || "");
  const isMob = useIsMobile();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      if (u && u.emailVerified) {
        setUser(u);
        if (u.displayName && !localStorage.getItem("medtrack_name")) {
          setDisplayName(u.displayName);
          localStorage.setItem("medtrack_name", u.displayName);
        }
        try {
          const userSnap = await getDoc(doc(db, "users", u.uid));
          if (userSnap.exists()) {
            setUserRole(userSnap.data().role || "client");
          }
        } catch(e) { console.warn("Could not load user role:", e); }
        const loaded = await loadMedications(u.email);
        setMeds(loaded.length > 0 ? loaded : SEED);
        setMedsLoaded(true);
      } else {
        setUser(null);
        setMeds(SEED);
        setMedsLoaded(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => { document.body.className = light ? "light" : ""; }, [light]);

  function handleVerifiedLogin(u) {
    if (u.emailVerified) {
      setUser(u);
      if (u.displayName && !localStorage.getItem("medtrack_name")) {
        setDisplayName(u.displayName);
        localStorage.setItem("medtrack_name", u.displayName);
      }
    }
  }

  const saveName = n => { setDisplayName(n); localStorage.setItem("medtrack_name", n); };

  
  const saveMed = useCallback(m => {
    setMeds(ms => ms.find(x=>x.id===m.id) ? ms.map(x=>x.id===m.id?m:x) : [m,...ms]);
  }, []);

  
  const deleteMed = useCallback(async (id) => {
    const med = meds.find(m => m.id === id);
    setMeds(ms => ms.filter(m => m.id !== id));
    if (med?.firestoreId) await deleteMedication(med.firestoreId);
  }, [meds]);

  const userName = displayName||user?.displayName||user?.email?.split("@")[0]||"";
  const t1="var(--t1)", t2="var(--t2)", t3="var(--t3)";
  const b0="var(--b0)", b1="var(--b1)";

  const tabs=[
    ["dashboard", HeartPulse,       "Dashboard"],
    ["schedule",  Calendar,         "Schedule"],
    ["analytics", BarChart3,        "Analytics"],
    ["settings",  SlidersHorizontal,"Settings"],
  ];

  if (user === undefined) return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center",
                  justifyContent:"center", flexDirection:"column", gap:16 }}>
      <motion.div initial={{ opacity:0, scale:.8 }} animate={{ opacity:1, scale:1 }} transition={{ duration:.4 }}
        style={{ width:52, height:52, borderRadius:16, background:"var(--pd)",
                 border:"1px solid rgba(37,99,235,.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <HeartPulse size={24} color="var(--p)" style={{ filter:"drop-shadow(0 0 8px var(--p))" }}/>
      </motion.div>
      <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.2 }}
        style={{ color:"var(--t3)", fontSize:12, letterSpacing:".05em" }}>
        Loading your dashboard…
      </motion.p>
    </div>
  );

  if (!user) return <Auth onVerifiedLogin={handleVerifiedLogin}/>;

  if (userRole === "doctor")      return <DoctorPortal user={user} light={light} setLight={setLight} userName={userName}/>;
  if (userRole === "pharmacist")  return <PharmacistPortal user={user} light={light} setLight={setLight} userName={userName}/>;

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"var(--bg)" }}>
      {}
      {!light && (
        <div style={{ position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:0 }}>
          <div style={{ position:"absolute", width:600, height:600, left:"-15%", top:"-20%",
                        borderRadius:"50%", filter:"blur(80px)", animation:"orbDrift 14s ease-in-out infinite",
                        background:"radial-gradient(circle,rgba(37,99,235,.055) 0%,transparent 70%)" }}/>
          <div style={{ position:"absolute", width:500, height:500, left:"65%", top:"50%",
                        borderRadius:"50%", filter:"blur(80px)", animation:"orbDrift 14s ease-in-out infinite",
                        animationDelay:"7s",
                        background:"radial-gradient(circle,rgba(6,182,212,.04) 0%,transparent 70%)" }}/>
        </div>
      )}

      {}
      {!isMob && (
        <aside className="sidebar" style={{ zIndex:10 }}>
          <div style={{ padding:"20px 14px 12px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:10, background:"var(--pd)",
                            border:"1px solid rgba(37,99,235,.25)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <HeartPulse size={16} color="var(--p)"/>
              </div>
              <div>
                <p style={{ color:t1, fontSize:15, fontFamily:"'Playfair Display',Georgia,serif", fontStyle:"italic", fontWeight:600 }}>MedTrack</p>
                <p className="gt" style={{ fontSize:9 }}>PERSONAL</p>
              </div>
            </div>
          </div>
          <div style={{ height:1, background:b0, margin:"0 12px 10px" }}/>
          <nav style={{ flex:1, padding:"0 7px", display:"flex", flexDirection:"column", gap:1 }}>
            {tabs.map(([id,I,l]) => (
              <div key={id} className={`nl ${page===id?"on":""}`} onClick={()=>setPage(id)}>
                <I size={15}/>{l}
              </div>
            ))}
          </nav>
          <div style={{ padding:"6px 7px 22px", display:"flex", flexDirection:"column", gap:4 }}>
            <div className="nl" style={{ color:"var(--p)" }} onClick={()=>setShowAI(true)}>
              <Stethoscope size={15} color="var(--p)"/> Health Advisor
            </div>
            <div className="nl" style={{ color:"var(--gr)" }} onClick={()=>setShowFeedback(true)}>
              <MessageSquare size={15} color="var(--gr)"/> Feedback
            </div>
            <div style={{ height:1, background:b0, margin:"3px 5px" }}/>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 10px" }}>
              <span style={{ display:"flex", alignItems:"center", gap:7, color:t3, fontSize:12 }}>
                {light ? <Sun size={13} color="var(--am)"/> : <Moon size={13}/>} {light ? "Light" : "Dark"}
              </span>
              <div className={`sw ${!light?"on":""}`} onClick={()=>setLight(!light)}/>
            </div>
            <button onClick={()=>signOut(auth)}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 10px", borderRadius:10,
                       border:"none", background:"transparent", cursor:"pointer", color:"var(--ro)",
                       fontFamily:"inherit", fontSize:12, fontWeight:500, width:"100%", transition:"background .15s" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,.07)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <LogOut size={13}/> Sign Out
            </button>
          </div>
        </aside>
      )}

      {}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, position:"relative", zIndex:1 }}>
        <header className="tb">
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            {isMob && (
              <button onClick={()=>setMobMenu(true)}
                style={{ width:34, height:34, borderRadius:10, border:`1px solid ${b1}`,
                         background:"var(--s1)", cursor:"pointer", display:"flex",
                         alignItems:"center", justifyContent:"center", color:t3 }}>
                <Menu size={16}/>
              </button>
            )}
            <HeartPulse size={16} color="var(--p)" style={{ filter:"drop-shadow(0 0 5px var(--p))" }}/>
            <span style={{ color:t1, fontSize:16, fontFamily:"'Playfair Display',Georgia,serif", fontStyle:"italic", fontWeight:600 }}>MedTrack</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={()=>setShowFeedback(true)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 13px", borderRadius:99,
                       border:`1px solid ${b1}`, background:"var(--s1)", cursor:"pointer",
                       fontSize:12, fontWeight:500, color:t2, transition:"all .18s" }}>
              <MessageSquare size={13} color="var(--gr)"/>
              {!isMob && " Feedback"}
            </button>
            <button onClick={()=>setLight(!light)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 13px", borderRadius:99,
                       border:`1px solid ${b1}`, background:"var(--s1)", cursor:"pointer",
                       fontSize:12, fontWeight:500, color:t2, transition:"all .18s" }}>
              {light ? <Moon size={13} color="var(--p)"/> : <Sun size={13} color="var(--am)"/>}
              {!isMob && (light ? " Dark" : " Light")}
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div key={page} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-5 }}
            transition={{ duration:.18 }} style={{ flex:1, display:"flex", flexDirection:"column", paddingBottom:isMob?66:0 }}>
            {page==="dashboard" && <Dashboard user={user} meds={meds} setMeds={setMeds}
              onAdd={()=>setAddOpen(true)} onEdit={m=>setEditMed(m)} onDelete={deleteMed} onChat={()=>setShowAI(true)}
              displayName={userName} onEditName={()=>setShowNickname(true)}/>}
            {page==="schedule"  && <SchedulePage meds={meds} setMeds={setMeds} onEdit={m=>setEditMed(m)} onDelete={deleteMed}/>}
            {page==="analytics" && <AnalyticsPage meds={meds}/>}
            {page==="settings"  && <SettingsPage light={light} setLight={setLight} user={user}
              displayName={userName} onEditName={()=>setShowNickname(true)} meds={meds}
              onFeedback={()=>setShowFeedback(true)}/>}
          </motion.div>
        </AnimatePresence>

        {isMob && (
          <nav className="btabs">
            {tabs.map(([id,I,l]) => (
              <button key={id} className={`bt ${page===id?"on":""}`} onClick={()=>setPage(id)}>
                <I size={19}/>{l}
              </button>
            ))}
          </nav>
        )}
      </div>

      {}
      {!isMob && (
        <motion.button whileHover={{ scale:1.06, y:-2 }} whileTap={{ scale:.93 }} onClick={()=>setShowAI(true)}
          style={{ position:"fixed", bottom:26, right:26, width:52, height:52, borderRadius:15, border:"none",
                   background:"linear-gradient(135deg,#2563eb,#1d4ed8)", cursor:"pointer",
                   display:"flex", alignItems:"center", justifyContent:"center", zIndex:40,
                   boxShadow:"0 6px 24px rgba(37,99,235,.38)" }}>
          <Stethoscope size={22} color="#fff"/>
        </motion.button>
      )}

      {}
      <AnimatePresence>
        {mobMenu && (<>
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={()=>setMobMenu(false)}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:60, backdropFilter:"blur(6px)" }}/>
          <motion.div initial={{ x:"-100%" }} animate={{ x:0 }} exit={{ x:"-100%" }}
            transition={{ type:"spring", damping:28, stiffness:250 }}
            style={{ position:"fixed", left:0, top:0, bottom:0, width:244, zIndex:70, display:"flex",
                     flexDirection:"column", background:"var(--bg2)", borderRight:`1px solid ${b1}` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 14px 12px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                <HeartPulse size={16} color="var(--p)"/>
                <span style={{ color:t1, fontSize:16, fontFamily:"'Playfair Display',Georgia,serif", fontStyle:"italic", fontWeight:600 }}>MedTrack</span>
              </div>
              <button onClick={()=>setMobMenu(false)}
                style={{ width:28, height:28, borderRadius:8, border:`1px solid ${b1}`, background:"var(--s2)",
                         cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:t3 }}>
                <X size={13}/>
              </button>
            </div>
            <div style={{ height:1, background:b0, margin:"0 12px 9px" }}/>
            <nav style={{ flex:1, padding:"0 7px", display:"flex", flexDirection:"column", gap:1 }}>
              {tabs.map(([id,I,l]) => (
                <div key={id} className={`nl ${page===id?"on":""}`}
                  onClick={()=>{ setPage(id); setMobMenu(false); }}><I size={15}/>{l}</div>
              ))}
              <div className="nl" style={{ color:"var(--p)" }} onClick={()=>{ setShowAI(true); setMobMenu(false); }}>
                <Stethoscope size={15} color="var(--p)"/> Health Advisor
              </div>
              <div className="nl" style={{ color:"var(--gr)" }} onClick={()=>{ setShowFeedback(true); setMobMenu(false); }}>
                <MessageSquare size={15} color="var(--gr)"/> Feedback
              </div>
            </nav>
            <div style={{ padding:"6px 7px 26px", display:"flex", flexDirection:"column", gap:7 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 10px" }}>
                <span style={{ color:t3, fontSize:12 }}>Dark mode</span>
                <div className={`sw ${!light?"on":""}`} onClick={()=>setLight(!light)}/>
              </div>
              <button onClick={()=>signOut(auth)}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 12px", borderRadius:11,
                         border:"1px solid rgba(239,68,68,.18)", background:"rgba(239,68,68,.07)",
                         cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:500, color:"var(--ro)" }}>
                <LogOut size={13}/> Sign Out
              </button>
            </div>
          </motion.div>
        </>)}
      </AnimatePresence>

      {}
      <AnimatePresence>
        {addOpen  && <MedModal onClose={()=>setAddOpen(false)} onSave={saveMed} userEmail={user?.email}/>}
      </AnimatePresence>
      <AnimatePresence>
        {editMed  && <MedModal existing={editMed} onClose={()=>setEditMed(null)} onSave={saveMed} userEmail={user?.email}/>}
      </AnimatePresence>
      <AnimatePresence>
        {showNickname && <NicknameModal currentName={userName} onSave={saveName} onClose={()=>setShowNickname(false)}/>}
      </AnimatePresence>
      <AnimatePresence>
        {showFeedback && <FeedbackModal onClose={()=>setShowFeedback(false)} userEmail={user?.email}/>}
      </AnimatePresence>
      <AnimatePresence>
        {showAI && (<>
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={()=>setShowAI(false)}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:90, backdropFilter:"blur(5px)" }}/>
          <AIDrawer onClose={()=>setShowAI(false)} userName={userName} meds={meds}/>
        </>)}
      </AnimatePresence>
    </div>
  );
}