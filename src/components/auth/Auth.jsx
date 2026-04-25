import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, RefreshCw, ArrowRight, Loader2, Eye, EyeOff, KeyRound,
  AlertCircle, CheckCircle2, X, Sun, Moon, Bell, TrendingUp, Lock, Brain,
} from "lucide-react";
import { supabase } from "../../supabase";
import { useTheme } from "../../hooks/useTheme";
import MedTrackHeartLogo from "./MedTrackHeartLogo";
import AuthHeroGlassHeart from "./AuthHeroGlassHeart";

function useIsMobile() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w < 640;
}

function useIsTablet() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w >= 640 && w < 960;
}

function ErrBanner({ msg, onDismiss }) {
  return (
    <motion.div initial={{ opacity:0, y:-6, scale:.97 }} animate={{ opacity:1, y:0, scale:1 }}
      exit={{ opacity:0 }} transition={{ type:"spring", damping:20, stiffness:300 }}
      style={{ display:"flex", gap:9, padding:"12px 14px", borderRadius:12,
        background:"var(--auth-err-bg)", border:"1px solid var(--auth-err-border)", marginBottom:12 }}>
      <AlertCircle size={14} color="var(--auth-err-icon)" style={{ flexShrink:0, marginTop:1 }}/>
      <p style={{ color:"var(--auth-err-text)", fontSize:13, lineHeight:1.55, flex:1 }}>{msg}</p>
      {onDismiss && <button type="button" onClick={onDismiss} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--auth-err-icon)", padding:0, lineHeight:0 }}><X size={12}/></button>}
    </motion.div>
  );
}

function OkBanner({ msg, onDismiss }) {
  return (
    <motion.div initial={{ opacity:0, y:-6, scale:.97 }} animate={{ opacity:1, y:0, scale:1 }}
      exit={{ opacity:0 }}
      style={{ display:"flex", gap:9, padding:"12px 14px", borderRadius:12,
        background:"var(--auth-ok-bg)", border:"1px solid var(--auth-ok-border)", marginBottom:12 }}>
      <CheckCircle2 size={14} color="var(--auth-ok-icon)" style={{ flexShrink:0, marginTop:1 }}/>
      <p style={{ color:"var(--auth-ok-text)", fontSize:13, lineHeight:1.55, flex:1 }}>{msg}</p>
      {onDismiss && <button type="button" onClick={onDismiss} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--auth-ok-icon)", padding:0, lineHeight:0 }}><X size={12}/></button>}
    </motion.div>
  );
}

const font = "'Inter',system-ui,-apple-system,sans-serif";
const gradBtn = "linear-gradient(90deg,#1D4ED8 0%,#2563EB 42%,#0EA5E9 100%)";
const accent = "#2563EB";
const OAUTH_SIGNUP_KEY = "mt_oauth_signup";

export default function Auth() {
  const [tab,setTab]     = useState("login");
  const [step,setStep]   = useState("form");
  const [name,setName]   = useState("");
  const [email,setEmail] = useState(()=>localStorage.getItem("mt_rem_email")||"");
  const [pw,setPw]       = useState(()=>localStorage.getItem("mt_rem_pw")||"");
  const [role,setRole]   = useState("client");
  const [vis,setVis]     = useState(false);
  const [busy,setBusy]   = useState(false);
  const [err,setErr]     = useState("");
  const [info,setInfo]   = useState("");
  const [resent,setResent] = useState(false);
  const [elapsed,setElapsed] = useState(0);
  const [remember,setRemember] = useState(()=>!!localStorage.getItem("mt_rem_email"));
  const [resetEmail,setResetEmail] = useState("");
  const [loginLight,setLoginTheme] = useTheme();

  const isMob = useIsMobile();
  const isTab = useIsTablet();

  const toggleLoginTheme = () => setLoginTheme(!loginLight);

  const pendingRef = useRef({email:"",pw:""});
  const pollRef    = useRef(null);
  const tickRef    = useRef(null);

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.overflow;
    const prevHtmlOs = html.style.overscrollBehaviorY;
    body.style.overflow = "hidden";
    html.style.overscrollBehaviorY = "auto";
    return () => {
      body.style.overflow = prevBody;
      html.style.overscrollBehaviorY = prevHtmlOs;
    };
  }, []);

  function friendlyError(code,msg){
    const m=(msg||"").toLowerCase();
    if(m.includes("invalid login")||m.includes("invalid credential")||code==="auth/wrong-password") return "Incorrect email or password.";
    if(m.includes("user not found")||code==="auth/user-not-found") return "No account found for that email.";
    if(m.includes("already registered")||code==="auth/email-already-in-use") return "Email already in use. Try signing in.";
    if(m.includes("password")||code==="auth/weak-password") return "Password must be at least 6 characters.";
    if(m.includes("too many")||code==="auth/too-many-requests") return "Too many attempts. Wait a few minutes.";
    if(m.includes("network")||code==="auth/network-request-failed") return "Network error. Check your connection.";
    return (msg||"").replace("Firebase: ","").replace(/\(auth\/.*?\)\.?/g,"").replace(/^Error\s*/,"").trim()||"Something went wrong.";
  }

  function startPolling(em,password){
    pendingRef.current={email:em,pw:password};
    setElapsed(0);
    clearInterval(tickRef.current);
    tickRef.current=setInterval(()=>setElapsed(s=>s+1),1000);
    clearInterval(pollRef.current);
    pollRef.current=setInterval(async()=>{
      try{
        const{data,error}=await supabase.auth.signInWithPassword({email:pendingRef.current.email,password:pendingRef.current.pw});
        if(!error&&data?.session){clearInterval(pollRef.current);clearInterval(tickRef.current);}
      }catch{}
    },5000);
  }

  function stopPolling(){clearInterval(pollRef.current);clearInterval(tickRef.current);}
  useEffect(()=>()=>stopPolling(),[]);

  async function submit(){
    const em=email.trim();
    if(!em||!pw)return;
    if(tab==="signup"&&!name.trim())return;
    setBusy(true);setErr("");setInfo("");setResent(false);
    try{
      if(tab==="signup"){
        const roleValue=role==="client"?"patient":role;
        const{data,error}=await supabase.auth.signUp({
          email:em,password:pw,
          options:{data:{full_name:name.trim(),role:roleValue},emailRedirectTo:window.location.origin},
        });
        if(error)throw error;
        if(data?.user){
          await supabase.from("profiles").upsert({
            id:data.user.id,email:data.user.email,
            first_name:name.trim(),role:roleValue,
            updated_at:new Date().toISOString(),
          },{onConflict:"id"});
        }
        if(!data?.session){setStep("verify");startPolling(em,pw);}
      }else{
        const{data,error}=await supabase.auth.signInWithPassword({email:em,password:pw});
        if(error)throw error;
        if(remember){localStorage.setItem("mt_rem_email",em);localStorage.setItem("mt_rem_pw",pw);}
        else{localStorage.removeItem("mt_rem_email");localStorage.removeItem("mt_rem_pw");}
      }
    }catch(e){setErr(friendlyError(e.code||e.message,e.message));}
    finally{setBusy(false);}
  }

  async function resendVerification(){
    setBusy(true);setErr("");setResent(false);
    try{
      await supabase.auth.resend({type:"signup",email:pendingRef.current.email});
      setResent(true);stopPolling();startPolling(pendingRef.current.email,pendingRef.current.pw);
    }catch{setErr("Couldn't resend. Please wait a moment.");}
    finally{setBusy(false);}
  }

  async function sendReset(){
    const em=(resetEmail||email).trim();
    if(!em){setErr("Enter your email first.");return;}
    setBusy(true);setErr("");
    try{
      await supabase.auth.resetPasswordForEmail(em,{redirectTo:window.location.origin+"/"});
      setInfo(`✓ Reset link sent to ${em}.`);
    }catch(e){setErr(friendlyError(e.code,e.message));}
    finally{setBusy(false);}
  }

  function backToForm(){stopPolling();setStep("form");setErr("");setInfo("");setResent(false);setElapsed(0);}

  async function continueWithOAuth(provider){
    setErr("");
    setInfo("");
    setResent(false);
    setBusy(true);
    try{
      if(tab==="signup"){
        const roleValue=role==="client"?"patient":role;
        const pendingSignup={
          role: roleValue,
          firstName: name.trim() || "",
          ts: Date.now(),
        };
        localStorage.setItem(OAUTH_SIGNUP_KEY, JSON.stringify(pendingSignup));
      }else{
        localStorage.removeItem(OAUTH_SIGNUP_KEY);
      }

      const{error}=await supabase.auth.signInWithOAuth({
        provider,
        options:{
          redirectTo: `${window.location.origin}/`,
        },
      });
      if(error) throw error;
    }catch(e){
      setErr(friendlyError(e.code||e.message,e.message));
      setBusy(false);
    }
  }

  const mm=String(Math.floor(elapsed/60)).padStart(2,"0");
  const ss=String(elapsed%60).padStart(2,"0");
  const L=loginLight;

  const rT1 = L?"#0f172a":"#f8fafc";
  const rT2 = L?"#64748b":"#94a3b8";
  const rT3 = L?"#64748b":"#a5b4fc";
  const rInpBg = L?"#f8fafc":"rgba(255,255,255,.06)";
  const rInpBr = L?"#e2e8f0":"rgba(255,255,255,.14)";
  const rInpC  = L?"#0f172a":"#f1f5f9";

  const cardPad = isMob ? "28px 22px 32px" : isTab ? "36px 32px" : "40px 40px 36px";
  const headingSize = isMob ? 26 : 30;
  const subSize = 15;

  const INP={
    width:"100%",
    padding: isMob ? "14px 14px" : "15px 16px",
    background:rInpBg,
    border:`1px solid ${rInpBr}`,
    borderRadius:14,
    color:rInpC,
    fontFamily:font,
    fontSize: isMob ? 16 : 15,
    outline:"none",
    transition:"border-color .15s, box-shadow .15s",
    caretColor:accent,
    fontWeight:500,
    boxShadow: L ? "inset 0 1px 2px rgba(15,23,42,.04)" : "inset 0 1px 2px rgba(0,0,0,.12)",
  };
  const LBL={
    display:"block",
    fontSize:11,
    fontWeight:700,
    color:L?"#64748b":"#94a3b8",
    letterSpacing:".12em",
    textTransform:"uppercase",
    marginBottom:8,
    fontFamily:font,
  };
  const inpIconOffset = isMob ? 14 : 16;
  const inpPadLeftIco = isMob ? 44 : 46;

  const pageBg = L
    ? "linear-gradient(165deg,#eff6ff 0%,#e0f2fe 42%,#f0f9ff 100%)"
    : "linear-gradient(165deg,#0f172a 0%,#1e3a5f 50%,#020617 100%)";

  return (
    <div
      className="auth-login-scrollport"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        overflowX: "hidden",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        overscrollBehaviorY: "auto",
        fontFamily: font,
      }}
    >
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: isMob ? "column" : "row",
      alignItems: isMob ? "stretch" : "flex-start",
      width: "100%",
      position: "relative",
      background: pageBg,
    }}>
      <style>{`
        .auth-inp::placeholder{color:${L?"#94a3b8":"#64748b"}!important}
        .auth-inp:focus{border-color:${accent}!important;box-shadow:0 0 0 3px rgba(37,99,235,.2),${L?"inset 0 1px 2px rgba(15,23,42,.04)":"inset 0 1px 2px rgba(0,0,0,.15)"}!important;background:${L?"#fff":"rgba(255,255,255,.1)"}!important}
        .auth-ghost:hover:not(:disabled){background:${L?"rgba(15,23,42,.04)":"rgba(255,255,255,.08)"}!important}
        .auth-spin{animation:spin360 .7s linear infinite}
        @keyframes spin360{to{transform:rotate(360deg)}}
      `}</style>

      {/* ── Hero (desktop) ── */}
      <div style={{flex:1,position:"relative",overflow:"hidden",display:"none",alignSelf:isMob?"auto":"stretch"}} id="auth-lp">
        <style>{`
            content:"";
            position:absolute;inset:0;pointer-events:none;z-index:0;
            background-image:
              linear-gradient(${L?"rgba(37,99,235,.055)":"rgba(96,165,250,.06)"} 1px, transparent 1px),
              linear-gradient(90deg, ${L?"rgba(37,99,235,.055)":"rgba(96,165,250,.06)"} 1px, transparent 1px);
            background-size:28px 28px;
          }
          @media(min-width:960px){#auth-lp{display:flex!important;flex-direction:column;justify-content:flex-start;padding:max(22px, env(safe-area-inset-top)) 64px max(56px, env(safe-area-inset-bottom))}}
        `}</style>

        <div aria-hidden style={{
          position:"absolute",width:420,height:420,borderRadius:"50%",top:"-8%",left:"-12%",
          background:L?"radial-gradient(circle,rgba(37,99,235,.28) 0%,transparent 68%)":"radial-gradient(circle,rgba(37,99,235,.16) 0%,transparent 70%)",
          filter:"blur(56px)",pointerEvents:"none",zIndex:0,
        }}/>
        <div aria-hidden style={{
          position:"absolute",width:380,height:380,borderRadius:"50%",bottom:"-5%",right:"-8%",
          background:L?"radial-gradient(circle,rgba(14,165,233,.26) 0%,transparent 65%)":"radial-gradient(circle,rgba(14,165,233,.14) 0%,transparent 68%)",
          filter:"blur(52px)",pointerEvents:"none",zIndex:0,
        }}/>

        <div aria-hidden style={{
          position:"absolute",inset:0,zIndex:1,pointerEvents:"none",overflow:"hidden",
        }}>
          {[
            { t: "14%", l: "8%" },
            { t: "22%", l: "72%" },
            { t: "58%", l: "4%" },
            { t: "68%", l: "88%" },
            { t: "42%", l: "52%" },
          ].map((p, i) => (
            <span
              key={i}
              style={{
                position:"absolute",
                top:p.t,
                left:p.l,
                fontSize:22,
                fontWeight:300,
                color:L?"#2563eb":"#38bdf8",
                opacity:L?0.07:0.09,
                lineHeight:1,
                userSelect:"none",
              }}
            >
              +
            </span>
          ))}
        </div>

        <style>{`
          @media(min-width:960px){
          }
        `}</style>

        <div style={{
          position:"relative",zIndex:2,width:"100%",maxWidth:1040,
          display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:40,
        }}>
        <div style={{flex:"1 1 auto",minWidth:0,maxWidth:540}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:40}}>
            <div style={{
              width:48,height:48,borderRadius:14,
              background:gradBtn,
              boxShadow:"0 12px 32px rgba(37,99,235,.35)",
              display:"flex",alignItems:"center",justifyContent:"center",
              color:"#fff",
            }}>
              <MedTrackHeartLogo size={26}/>
            </div>
            <div>
              <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.3px",color:L?"#0f172a":"#f8fafc"}}>
                <span>Med</span>
                <span style={{background:gradBtn,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Track</span>
              </div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:".18em",textTransform:"uppercase",color:L?"#64748b":"#94a3b8",marginTop:3}}>
                HEALTH MANAGEMENT
              </div>
            </div>
          </div>

          <span style={{
            display:"inline-block",marginBottom:28,padding:"6px 12px",borderRadius:999,
            background:L?"rgba(255,255,255,.85)":"rgba(255,255,255,.08)",
            border:`1px solid ${L?"#e2e8f0":"rgba(255,255,255,.12)"}`,
            fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",
            color:L?"#2563EB":"#7dd3fc",
          }}>Personal Health Platform</span>

          <h1 style={{
            fontSize:"clamp(32px,3.6vw,44px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-.6px",margin:"0 0 28px",color:L?"#0f172a":"#f8fafc",
          }}>
            <span style={{color:L?"#0f172a":"#f8fafc"}}>Your </span>
            <span style={{color:L?"#2563EB":"#7dd3fc"}}>health,</span>
            <br/>
            <span style={{
              background:"linear-gradient(90deg,#1D4ED8,#2563EB,#0EA5E9)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            }}>beautifully organised.</span>
          </h1>

          <p style={{fontSize:16,color:L?"#475569":"#cbd5e1",lineHeight:1.75,maxWidth:440,margin:"0 0 clamp(48px, 7.5vh, 92px)",fontWeight:400}}>
            Medications, reminders, and AI health guidance — all in one place.
          </p>

          <div style={{display:"flex",flexWrap:"wrap",gap:"24px 16px",marginBottom:0}}>
            {[
              { I:Bell, t:"Smart Reminders", c:"#2563eb", bg:"rgba(37,99,235,.1)" },
              { I:Brain, t:"AI Health Advisor", c:"#0284c7", bg:"rgba(2,132,199,.1)" },
              { I:TrendingUp, t:"Adherence Tracking", c:"#059669", bg:"rgba(5,150,105,.1)" },
            ].map((f) => (
              <div
                key={f.t}
                style={{
                  flex:"1 1 140px",
                  display:"flex",alignItems:"center",gap:12,
                  padding:"14px 16px",borderRadius:16,
                  background:L?"rgba(255,255,255,.92)":"rgba(255,255,255,.06)",
                  border:`1px solid ${L?"#e2e8f0":"rgba(255,255,255,.1)"}`,
                  boxShadow:L?"0 4px 20px rgba(15,23,42,.06)":"0 4px 24px rgba(0,0,0,.2)",
                }}>
                <div style={{
                  width:40,height:40,borderRadius:12,background:f.bg,
                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                }}>
                  <f.I size={20} color={f.c} strokeWidth={2}/>
                </div>
                <span style={{fontSize:14,fontWeight:600,color:L?"#0f172a":"#f1f5f9"}}>{f.t}</span>
              </div>
            ))}
          </div>
        </div>

        <div id="auth-hero-mark" style={{display:"none",flexShrink:0,pointerEvents:"none",alignItems:"center",justifyContent:"center",alignSelf:"center",transform:"translateY(18px)",position:"relative"}} aria-hidden>
          <AuthHeroGlassHeart light={L} />
        </div>
        </div>
      </div>

      {/* ── Form column ── */}
      <div style={{
        width:"100%",
        maxWidth: isMob ? "100%" : isTab ? "100%" : 480,
        flexShrink:0,
        display:"flex",
        flexDirection:"column",
        alignItems:"stretch",
        paddingLeft: isMob ? 18 : isTab ? 28 : 32,
        paddingRight: isMob ? 18 : isTab ? 28 : 32,
        paddingBottom: isMob ? "max(24px, env(safe-area-inset-bottom))" : 32,
        minHeight: "100dvh",
        position:"relative",
        overflowX: "hidden",
        overflowY: isMob ? "visible" : "hidden",
      }}>
        <div aria-hidden style={{
          position:"absolute",width:320,height:320,top:"-60px",right:"-40px",borderRadius:"50%",pointerEvents:"none",
          background:L?"radial-gradient(circle,rgba(37,99,235,.18) 0%,transparent 70%)":"radial-gradient(circle,rgba(37,99,235,.1) 0%,transparent 70%)",
          filter:"blur(48px)",zIndex:0,
        }}/>
        <div aria-hidden style={{
          position:"absolute",width:280,height:280,bottom:"-40px",left:"-30px",borderRadius:"50%",pointerEvents:"none",
          background:L?"radial-gradient(circle,rgba(14,165,233,.14) 0%,transparent 70%)":"radial-gradient(circle,rgba(14,165,233,.08) 0%,transparent 70%)",
          filter:"blur(44px)",zIndex:0,
        }}/>

        <div style={{
          position:"relative",zIndex:30,flexShrink:0,
          display:"flex",justifyContent:"flex-end",alignItems:"center",
          width:"100%",
          paddingTop:"max(14px, env(safe-area-inset-top))",
          paddingBottom:10,
        }}>
          <button type="button" onClick={toggleLoginTheme}
            aria-label={L ? "Enable dark mode" : "Enable light mode"}
            style={{
              display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:999,
              border:`1px solid ${rInpBr}`,background:L?"rgba(255,255,255,.9)":"rgba(255,255,255,.08)",
              cursor:"pointer",fontFamily:font,fontSize:13,fontWeight:600,color:rT2,
              boxShadow:L?"0 2px 12px rgba(15,23,42,.06)":"none",
            }}>
            {L ? <Moon size={15} /> : <Sun size={15} color="#fbbf24" />}
            {L ? "Dark mode" : "Light mode"}
          </button>
        </div>

        <div style={{
          flex: isMob ? "0 0 auto" : 1,
          display:"flex",flexDirection:"column",justifyContent: "flex-start",
          alignItems:"center",width:"100%",position:"relative",zIndex:2,paddingTop: isMob ? 8 : 6,
        }}>
        <div style={{
          position:"relative",zIndex:2,width:"100%",maxWidth:440,
          borderRadius: isMob ? 20 : 24,
          background:L?"rgba(255,255,255,.94)":"rgba(15,23,42,.75)",
          border:`1px solid ${L?"#f1f5f9":"rgba(255,255,255,.1)"}`,
          backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
          boxShadow:L
            ?"0 4px 6px rgba(15,23,42,.04), 0 24px 48px rgba(37,99,235,.12)"
            :"0 24px 48px rgba(0,0,0,.45)",
          padding: cardPad,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom: isMob ? 22 : 28}}>
            <div style={{
              width: isMob ? 40 : 44,height: isMob ? 40 : 44,borderRadius:13,
              background:gradBtn,display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 8px 20px rgba(37,99,235,.3)",
              color:"#fff",
            }}>
              <MedTrackHeartLogo size={isMob ? 22 : 24}/>
            </div>
            <div>
              <div style={{fontSize: isMob ? 18 : 20,fontWeight:800,letterSpacing:"-.2px",color:rT1}}>
                <span>Med</span>
                <span style={{background:gradBtn,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Track</span>
              </div>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:".16em",textTransform:"uppercase",color:rT3,marginTop:2}}>
                HEALTH MANAGEMENT
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {step==="verify"&&(
              <motion.div key="verify" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.2}}>
                <div style={{width:56,height:56,borderRadius:16,background:"rgba(6,182,212,.12)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20}}>
                  <Mail size={26} color="#0891b2"/>
                </div>
                <h2 style={{fontSize:22,fontWeight:800,color:rT1,margin:"0 0 8px"}}>Check your email</h2>
                <p style={{fontSize:14,color:rT2,lineHeight:1.65,marginBottom:18}}>
                  Confirmation sent to <strong style={{color:rT1}}>{pendingRef.current.email}</strong>
                </p>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:12,background:"rgba(6,182,212,.08)",border:"1px solid rgba(6,182,212,.2)",marginBottom:18}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:"#06b6d4",flexShrink:0}}/>
                  <div>
                    <p style={{color:"#0891b2",fontSize:13,fontWeight:600,margin:0}}>Waiting for verification</p>
                    <p style={{color:rT2,fontSize:11,margin:0}}>Checking every 5s · {mm}:{ss}</p>
                  </div>
                </div>
                <AnimatePresence>
                  {err&&<ErrBanner msg={err}/>}
                  {resent&&<OkBanner msg="Verification email resent."/>}
                </AnimatePresence>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button type="button" className="auth-ghost" disabled={busy} onClick={resendVerification}
                    style={{width:"100%",padding:12,borderRadius:12,background:L?"#f8fafc":"rgba(255,255,255,.06)",border:`1px solid ${rInpBr}`,color:rT1,fontFamily:font,fontSize:14,fontWeight:600,cursor:busy?"wait":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    {busy?<Loader2 size={14} className="auth-spin"/>:<><RefreshCw size={14}/> Resend email</>}
                  </button>
                  <button type="button" onClick={backToForm}
                    style={{width:"100%",padding:11,borderRadius:12,background:"transparent",border:`1px solid ${rInpBr}`,color:rT2,fontFamily:font,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    <ArrowRight size={14} style={{transform:"rotate(180deg)"}}/> Back to sign in
                  </button>
                </div>
              </motion.div>
            )}

            {step==="reset"&&(
              <motion.div key="reset" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.2}}>
                <div style={{width:52,height:52,borderRadius:16,background:"rgba(37,99,235,.12)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:18}}>
                  <KeyRound size={24} color={accent}/>
                </div>
                <h2 style={{fontSize:22,fontWeight:800,color:rT1,margin:"0 0 8px"}}>Reset password</h2>
                <p style={{fontSize:14,color:rT2,lineHeight:1.6,marginBottom:18}}>We&apos;ll send a secure link. It expires in 1 hour.</p>
                <div style={{marginBottom:16}}>
                  <label style={LBL}>Email address</label>
                  <div style={{position:"relative"}}>
                    <Mail size={18} color={rT3} strokeWidth={2} style={{position:"absolute",left:inpIconOffset,top:"50%",transform:"translateY(-50%)",opacity:0.6,pointerEvents:"none"}}/>
                    <input className="auth-inp" style={{...INP,paddingLeft:inpPadLeftIco}} type="email" value={resetEmail||email} placeholder="you@example.com"
                      onChange={e=>setResetEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendReset()}/>
                  </div>
                </div>
                <AnimatePresence>
                  {err&&<ErrBanner msg={err}/>}
                  {info&&<OkBanner msg={info}/>}
                </AnimatePresence>
                {info?(
                  <button type="button" onClick={backToForm}
                    style={{width:"100%",padding:14,borderRadius:14,background:gradBtn,border:"none",color:"#fff",fontFamily:font,fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 10px 28px rgba(37,99,235,.35)"}}>
                    <ArrowRight size={16} style={{transform:"rotate(180deg)"}}/> Back to Sign In
                  </button>
                ):(
                  <>
                    <button type="button" className="auth-btn" disabled={busy} onClick={sendReset}
                      style={{width:"100%",padding:14,background:gradBtn,border:"none",borderRadius:14,color:"#fff",fontFamily:font,fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 10px 28px rgba(37,99,235,.35)",marginBottom:8}}>
                      {busy?<Loader2 size={15} className="auth-spin"/>:<><Mail size={15}/> Send reset link</>}
                    </button>
                    <button type="button" onClick={backToForm}
                      style={{width:"100%",padding:11,borderRadius:12,background:"transparent",border:`1px solid ${rInpBr}`,color:rT2,fontFamily:font,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <ArrowRight size={14} style={{transform:"rotate(180deg)"}}/> Back to sign in
                    </button>
                  </>
                )}
              </motion.div>
            )}

            {step==="form"&&(
              <motion.div key="form" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.2}}>
                <h2 style={{fontSize: headingSize,fontWeight:800,letterSpacing:"-.4px",margin:"0 0 6px",color:rT1}}>
                  {tab==="login"?"Welcome back":"Get started"}
                </h2>
                <p style={{fontSize: subSize,color:rT2,lineHeight:1.6,margin:"0 0 22px",fontWeight:400}}>
                  {tab==="login"?"Sign in to your health dashboard.":"Create your free account today."}
                </p>

                <AnimatePresence>
                  {info&&<OkBanner msg={info} onDismiss={()=>setInfo("")}/>}
                </AnimatePresence>

                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {tab==="signup"&&(
                    <>
                      <div>
                        <label style={LBL}>Your name</label>
                        <input className="auth-inp" style={INP} type="text" value={name} placeholder="e.g. Jamie or Dr. Patel"
                          onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                      </div>
                      <label style={LBL}>I am a</label>
                      <div style={{display:"flex",gap:8,marginTop:-4}}>
                        {[["client","Patient"],["doctor","Doctor"],["pharmacist","Pharmacist"]].map(([v,l])=>(
                          <button key={v} type="button" onClick={()=>setRole(v)}
                            style={{
                              flex:1,padding:"10px 6px",borderRadius:12,border:`1.5px solid ${role===v?accent:rInpBr}`,
                              fontFamily:font,fontSize:12,fontWeight:600,cursor:"pointer",
                              background:role===v?"rgba(37,99,235,.1)":"transparent",color:role===v?accent:rT2,
                            }}>{l}</button>
                        ))}
                      </div>
                    </>
                  )}

                  <div>
                    <label style={LBL}>Email address</label>
                    <div style={{position:"relative"}}>
                      <Mail size={18} color={rT3} strokeWidth={2} style={{position:"absolute",left:inpIconOffset,top:"50%",transform:"translateY(-50%)",opacity:0.55,pointerEvents:"none"}}/>
                      <input className="auth-inp" style={{...INP,paddingLeft:inpPadLeftIco}} type="email" value={email} placeholder="you@example.com" autoComplete="email"
                        onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                    </div>
                  </div>

                  <div>
                    <label style={LBL}>Password</label>
                    <div style={{position:"relative"}}>
                      <Lock size={18} color={rT3} strokeWidth={2} style={{position:"absolute",left:inpIconOffset,top:"50%",transform:"translateY(-50%)",opacity:0.55,pointerEvents:"none"}}/>
                      <input className="auth-inp" style={{...INP,paddingLeft:inpPadLeftIco,paddingRight:46}} type={vis?"text":"password"} value={pw} placeholder="••••••••"
                        autoComplete={tab==="login"?"current-password":"new-password"}
                        onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                      <button type="button" onClick={()=>setVis(!vis)}
                        style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:rT3,padding:0,display:"flex"}}>
                        {vis?<EyeOff size={17}/>:<Eye size={17}/>}
                      </button>
                    </div>
                  </div>

                  {tab==="login"&&(
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:2}}>
                      <label onClick={()=>setRemember(!remember)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none"}}>
                        <span style={{
                          width:18,height:18,borderRadius:5,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                          background:remember?gradBtn:"transparent",
                          border:`2px solid ${remember?accent:rInpBr}`,
                        }}>
                          {remember&&<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </span>
                        <span style={{fontSize:14,fontWeight:500,color:rT2}}>Remember me</span>
                      </label>
                      <button type="button" onClick={()=>{setStep("reset");setResetEmail(email);setErr("");setInfo("");}}
                        style={{fontSize:13,fontWeight:600,color:accent,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:font}}>
                        Forgot password?
                      </button>
                    </div>
                  )}

                  <AnimatePresence>
                    {err&&<motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}><ErrBanner msg={err}/></motion.div>}
                  </AnimatePresence>

                  <button type="button" className="auth-btn" disabled={busy||!email.trim()||!pw||(tab==="signup"&&!name.trim())} onClick={submit}
                    style={{
                      width:"100%",marginTop:4,padding:"15px 0",background:gradBtn,border:"none",borderRadius:14,color:"#fff",
                      fontFamily:font,fontSize:15,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                      boxShadow:"0 12px 32px rgba(37,99,235,.35)",opacity:busy?0.85:1,
                    }}>
                    {busy?<Loader2 size={17} className="auth-spin"/>:tab==="login"?(<>Sign in <ArrowRight size={18} strokeWidth={2.5}/></>):(<>Create account <ArrowRight size={18} strokeWidth={2.5}/></>)}
                  </button>


                  {tab==="signup"&&(
                    <p style={{fontSize:12,color:rT3,textAlign:"center",margin:0,lineHeight:1.6}}>
                      A verification email will be sent to confirm your address.
                    </p>
                  )}

                  <p style={{textAlign:"center",margin:"8px 0 0",fontSize:14,color:rT2,lineHeight:1.6}}>
                    {tab==="login"?(
                      <>Don&apos;t have an account?{" "}
                        <button type="button" onClick={()=>{setTab("signup");setErr("");setInfo("");}}
                          style={{background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:font,fontSize:14,fontWeight:700,color:accent}}>Sign up</button>
                      </>
                    ):(
                      <>Already have an account?{" "}
                        <button type="button" onClick={()=>{setTab("login");setErr("");setInfo("");}}
                          style={{background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:font,fontSize:14,fontWeight:700,color:accent}}>Sign in</button>
                      </>
                    )}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </div>
      </div>
    </div>
    </div>
  );
}
