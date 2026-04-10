import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import {
  HeartPulse, Mail, RefreshCw, ArrowRight, Loader2, Eye, EyeOff, KeyRound,
  AlertCircle, CheckCircle2, X, Sun, Moon, Bell, Stethoscope, TrendingUp,
  Shield, Pill, Activity
} from "lucide-react";
import { supabase } from "../../supabase";
import { useTheme } from "../../hooks/useTheme";

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

function ErrBanner({ msg, loginLight, onDismiss }) {
  return (
    <motion.div initial={{ opacity:0, y:-6, scale:.97 }} animate={{ opacity:1, y:0, scale:1 }}
      exit={{ opacity:0 }} transition={{ type:"spring", damping:20, stiffness:300 }}
      style={{ display:"flex", gap:9, padding:"12px 14px", borderRadius:12,
        background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", marginBottom:12 }}>
      <AlertCircle size={14} color="#ef4444" style={{ flexShrink:0, marginTop:1 }}/>
      <p style={{ color:loginLight?"#b91c1c":"#ef4444", fontSize:13, lineHeight:1.55, flex:1 }}>{msg}</p>
      {onDismiss && <button onClick={onDismiss} style={{ background:"none", border:"none", cursor:"pointer", color:"#ef4444", padding:0, lineHeight:0 }}><X size={12}/></button>}
    </motion.div>
  );
}

function OkBanner({ msg, loginLight, onDismiss }) {
  return (
    <motion.div initial={{ opacity:0, y:-6, scale:.97 }} animate={{ opacity:1, y:0, scale:1 }}
      exit={{ opacity:0 }}
      style={{ display:"flex", gap:9, padding:"12px 14px", borderRadius:12,
        background:"rgba(16,185,129,.1)", border:"1px solid rgba(16,185,129,.28)", marginBottom:12 }}>
      <CheckCircle2 size={14} color="#10b981" style={{ flexShrink:0, marginTop:1 }}/>
      <p style={{ color:loginLight?"#065f46":"#10b981", fontSize:13, lineHeight:1.55, flex:1 }}>{msg}</p>
      {onDismiss && <button onClick={onDismiss} style={{ background:"none", border:"none", cursor:"pointer", color:"#10b981", padding:0, lineHeight:0 }}><X size={12}/></button>}
    </motion.div>
  );
}

function FloatOrb({ icon: Icon, color, size, top, left, right, bottom, delay, floatY=18 }) {
  const maxFloat = Math.floor(size * 0.1);
  const clampedFloat = Math.min(floatY, maxFloat);
  return (
    <motion.div
      initial={{ opacity:0, scale:0.4, y:20 }}
      animate={{ opacity:1, scale:1, y:0 }}
      transition={{ delay, duration:0.9, type:"spring", damping:12 }}
      style={{ position:"absolute", top, left, right, bottom, zIndex:1,
        width:size, height:size, borderRadius:size*0.28,
        background:`linear-gradient(135deg,${color}dd 0%,${color}88 100%)`,
        border:`1px solid ${color}55`,
        boxShadow:`0 12px 40px ${color}55, 0 4px 12px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.35)`,
        display:"flex", alignItems:"center", justifyContent:"center",
        backdropFilter:"blur(10px)",
        overflow:"hidden" /* keep icon inside the box */ }}>
      <motion.div
        animate={{ y:[0,-clampedFloat,0], rotate:[-4,4,-4] }}
        transition={{ duration:3.5+delay, repeat:Infinity, ease:"easeInOut" }}>
        <Icon size={size*0.44} color="#fff"/>
      </motion.div>
    </motion.div>
  );
}

function Particle({ x, y, delay, size, color }) {
  return (
    <motion.div
      style={{ position:"absolute", left:`${x}%`, top:`${y}%`,
        width:size, height:size, borderRadius:"50%", background:color, pointerEvents:"none" }}
      animate={{ y:[0,-28,0], opacity:[0.3,0.8,0.3], scale:[1,1.4,1] }}
      transition={{ duration:3.5+delay, repeat:Infinity, delay, ease:"easeInOut" }}/>
  );
}

function TiltCard({ children, style, isMobile }) {
  const ref = useRef(null);
  const mx  = useMotionValue(0);
  const my  = useMotionValue(0);
  const sx  = useSpring(mx, { stiffness:100, damping:16 });
  const sy  = useSpring(my, { stiffness:100, damping:16 });
  const rotX = useTransform(sy, [-0.5,0.5], [7,-7]);
  const rotY = useTransform(sx, [-0.5,0.5], [-7,7]);
  const glowX = useTransform(sx, [-0.5,0.5], [0,100]);
  const glowY = useTransform(sy, [-0.5,0.5], [0,100]);

  const onMove = useCallback((e) => {
    if (isMobile) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left)/r.width  - 0.5);
    my.set((e.clientY - r.top) /r.height - 0.5);
  }, [mx, my, isMobile]);

  const onLeave = useCallback(() => { mx.set(0); my.set(0); }, [mx,my]);

  return (
    <motion.div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}
      style={{ ...style, rotateX: isMobile ? 0 : rotX, rotateY: isMobile ? 0 : rotY, transformStyle:"preserve-3d" }}>
      <motion.div style={{
        position:"absolute", inset:0, borderRadius:"inherit", pointerEvents:"none", zIndex:10,
        background: useTransform([glowX,glowY], ([gx,gy]) =>
          `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,.2) 0%, transparent 55%)`),
      }}/>
      {children}
    </motion.div>
  );
}

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
  const [mouse,setMouse] = useState({x:.5,y:.5});

  const isMob = useIsMobile();
  const isTab = useIsTablet();

  const toggleLoginTheme = () => setLoginTheme(!loginLight);

  const pendingRef = useRef({email:"",pw:""});
  const pollRef    = useRef(null);
  const tickRef    = useRef(null);

  useEffect(()=>{
    if (isMob) return;
    const h=(e)=>setMouse({x:e.clientX/window.innerWidth,y:e.clientY/window.innerHeight});
    window.addEventListener("mousemove",h);
    return ()=>window.removeEventListener("mousemove",h);
  },[isMob]);

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

  const mm=String(Math.floor(elapsed/60)).padStart(2,"0");
  const ss=String(elapsed%60).padStart(2,"0");
  const L=loginLight;

  const rT1 = L?"#0a0e1a":"#f0f6ff";
  const rT2 = L?"#1e3a6e":"#c8ddff";
  const rT3 = L?"#4060a0":"#6e90cc";
  const rSub   = L?"rgba(37,99,235,.07)":"rgba(255,255,255,.06)";
  const rSubBr = L?"rgba(37,99,235,.2)" :"rgba(255,255,255,.12)";
  const rInpBg = L?"rgba(240,245,255,.85)":"rgba(255,255,255,.07)";
  const rInpBr = L?"rgba(37,99,235,.22)" :"rgba(255,255,255,.15)";
  const rInpC  = L?"#0a0e1a":"#f0f6ff";

  const cardPad = isMob ? "28px 20px 24px" : isTab ? "36px 32px 30px" : "42px 42px 38px";
  const headingSize = isMob ? 30 : 38;
  const subSize = isMob ? 13.5 : 14.5;

  const INP={
    width:"100%",padding: isMob ? "12px 14px" : "14px 16px",
    background:rInpBg,border:`1.5px solid ${rInpBr}`,
    borderRadius:14,color:rInpC,
    fontFamily:"'DM Sans',sans-serif",fontSize: isMob ? 16 : 14.5,
    outline:"none",transition:"all .22s",caretColor:"#3b82f6",fontWeight:400,
  };
  const LBL={
    display:"block",fontSize:10.5,fontWeight:800,
    color:L?"#1e3a6e":"#94b8e8",
    letterSpacing:".1em",textTransform:"uppercase",marginBottom:8,
  };

  const bgStyle = L
    ? `radial-gradient(ellipse at ${mouse.x*100}% ${mouse.y*100}%, #dbeafe 0%, #e0e7ff 45%, #ede9fe 100%)`
    : `radial-gradient(ellipse at ${mouse.x*100}% ${mouse.y*100}%, #070c1a 0%, #05080f 55%, #030508 100%)`;

  const particles=[
    {x:12,y:18,delay:0,  size:4,color:L?"rgba(37,99,235,.4)" :"rgba(147,197,253,.45)"},
    {x:72,y:32,delay:.8, size:3,color:L?"rgba(99,102,241,.35)":"rgba(199,210,254,.4)"},
    {x:28,y:62,delay:1.4,size:5,color:L?"rgba(16,185,129,.3)" :"rgba(110,231,183,.38)"},
    {x:88,y:68,delay:.4, size:3,color:L?"rgba(245,158,11,.3)" :"rgba(253,211,77,.38)"},
    {x:52,y:85,delay:1.1,size:4,color:L?"rgba(37,99,235,.28)" :"rgba(147,197,253,.32)"},
    {x:8, y:48,delay:1.8,size:3,color:L?"rgba(139,92,246,.3)" :"rgba(196,181,253,.38)"},
    {x:42,y:10,delay:.6, size:3,color:L?"rgba(6,182,212,.3)"  :"rgba(103,232,249,.38)"},
    {x:90,y:22,delay:2.1,size:4,color:L?"rgba(16,185,129,.25)":"rgba(110,231,183,.3)"},
  ];

  return (
    <div style={{ minHeight:"100vh", display:"flex", fontFamily:"'DM Sans',sans-serif",
      background:bgStyle, transition:"background .7s ease" }}>
      <style>{`
        .auth-inp::placeholder{color:${L?"rgba(30,58,110,.38)":"rgba(147,197,253,.38)"}!important}
        .auth-inp:focus{border-color:#3b82f6!important;box-shadow:0 0 0 4px rgba(37,99,235,.18)!important;background:${L?"#fff":"rgba(255,255,255,.11)"}!important}
        .auth-tab{color:${L?"#4060a0":"#6e90cc"}}
        .auth-tab:hover:not(.auth-tab-on){background:${L?"rgba(37,99,235,.08)":"rgba(255,255,255,.08)"}!important;color:${L?"#0a0e1a":"#e0ecff"}!important}
        .auth-ghost:hover:not(:disabled){background:${L?"rgba(0,0,0,.06)":"rgba(255,255,255,.1)"}!important;color:${L?"#0a0e1a":"#e0ecff"}!important}
        .auth-spin{animation:spin360 .7s linear infinite}
        @keyframes spin360{to{transform:rotate(360deg)}}
      `}</style>

      {/* ── Left panel — hidden on mobile/tablet, shown on desktop ── */}
      <div style={{flex:1,position:"relative",overflow:"hidden",display:"none"}} id="auth-lp">
        <style>{`@media(min-width:960px){#auth-lp{display:flex!important;flex-direction:column;justify-content:center;padding:64px 56px}}`}</style>

        {/* Dot grid */}
        <div style={{position:"absolute",inset:0,zIndex:0,
          backgroundImage:L
            ?"radial-gradient(rgba(37,99,235,.22) 1.5px,transparent 1.5px)"
            :"radial-gradient(rgba(255,255,255,.08) 1.5px,transparent 1.5px)",
          backgroundSize:"28px 28px"}}/>

        {/* Parallax orbs */}
        <motion.div style={{position:"absolute",width:640,height:640,borderRadius:"50%",
          top:-120+(mouse.y*60),left:-140+(mouse.x*50),
          background:L
            ?"radial-gradient(circle,rgba(37,99,235,.2) 0%,rgba(99,102,241,.1) 50%,transparent 70%)"
            :"radial-gradient(circle,rgba(37,99,235,.14) 0%,rgba(99,102,241,.07) 50%,transparent 70%)",
          filter:"blur(70px)",pointerEvents:"none",zIndex:0}}
          animate={{scale:[1,1.06,1]}} transition={{duration:9,repeat:Infinity,ease:"easeInOut"}}/>
        <motion.div style={{position:"absolute",width:480,height:480,borderRadius:"50%",
          bottom:-80+((1-mouse.y)*40),right:-80+((1-mouse.x)*40),
          background:L
            ?"radial-gradient(circle,rgba(139,92,246,.16) 0%,rgba(16,185,129,.07) 50%,transparent 70%)"
            :"radial-gradient(circle,rgba(139,92,246,.1) 0%,rgba(16,185,129,.05) 50%,transparent 70%)",
          filter:"blur(60px)",pointerEvents:"none",zIndex:0}}
          animate={{scale:[1.06,1,1.06]}} transition={{duration:11,repeat:Infinity,ease:"easeInOut"}}/>

        {/* Particles */}
        {particles.map((p,i)=><Particle key={i} {...p}/>)}

        {/* Floating icon orbs */}
        <FloatOrb icon={HeartPulse} color="#2563eb" size={74} top="5%"  right="14%" delay={.2}  floatY={20}/>
        <FloatOrb icon={Shield}     color="#7c3aed" size={56} top="26%" right="5%"  delay={.5}  floatY={15}/>
        <FloatOrb icon={Pill}       color="#059669" size={50} top="50%" right="20%" delay={.8}  floatY={17}/>
        <FloatOrb icon={Activity}   color="#d97706" size={58} bottom="20%" right="6%" delay={1.0} floatY={22}/>
        <FloatOrb icon={Bell}       color="#0891b2" size={44} top="72%" right="28%" delay={.35} floatY={13}/>

        {/* Content */}
        <div style={{position:"relative",zIndex:2,maxWidth:490}}>
          {/* Logo */}
          <motion.div initial={{opacity:0,x:-30}} animate={{opacity:1,x:0}}
            transition={{duration:.7,ease:[.22,1,.36,1]}}
            style={{display:"flex",alignItems:"center",gap:14,marginBottom:54}}>
            <motion.div whileHover={{scale:1.1,rotate:8}} style={{
              width:54,height:54,borderRadius:17,
              background:"linear-gradient(135deg,#2563eb,#6366f1)",
              boxShadow:"0 14px 36px rgba(37,99,235,.45),inset 0 1px 0 rgba(255,255,255,.35)",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <HeartPulse size={27} color="#fff"/>
            </motion.div>
            <div>
              <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:28,fontStyle:"italic",fontWeight:800,letterSpacing:"-.4px",lineHeight:1.1}}>
                <span style={{color:L?"#1e3a8a":"#fff"}}>Med</span>
                <span style={{background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Track</span>
              </div>
              <div style={{fontSize:9.5,fontWeight:800,letterSpacing:".16em",textTransform:"uppercase",color:L?"rgba(37,99,235,.65)":"rgba(147,197,253,.65)",marginTop:2}}>HEALTH MANAGEMENT</div>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.div initial={{opacity:0,y:36}} animate={{opacity:1,y:0}}
            transition={{duration:.85,delay:.18,ease:[.22,1,.36,1]}}>
            <p style={{fontSize:11,fontWeight:800,letterSpacing:".16em",textTransform:"uppercase",
              color:L?"#2563eb":"rgba(147,197,253,.8)",marginBottom:18}}>Personal Health Platform</p>

            <h1 style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:52,lineHeight:1.06,
              letterSpacing:"-.6px",marginBottom:22,fontStyle:"italic",fontWeight:800}}>
              <span style={{color:L?"#0f172a":"#fff"}}>Your health,</span><br/>
              <span style={{background:"linear-gradient(135deg,#3b82f6 0%,#6366f1 50%,#8b5cf6 100%)",
                WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
                beautifully organised.
              </span>
            </h1>

            <p style={{fontSize:15.5,color:L?"#334155":"rgba(200,220,255,.72)",lineHeight:1.95,maxWidth:400,marginBottom:42,fontWeight:400}}>
              Track medications, get smart reminders, and consult your AI health advisor — all in one elegant dashboard.
            </p>

            {/* Feature cards */}
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              {[
                {I:Bell,       t:"Smart Reminders",   d:"Never miss a dose",           c:"#2563eb",g:"rgba(37,99,235,.12)", delay:.3},
                {I:Stethoscope,t:"AI Health Advisor",  d:"FDA-backed drug information", c:"#7c3aed",g:"rgba(124,58,237,.12)",delay:.42},
                {I:TrendingUp, t:"Adherence Tracking", d:"Weekly insights and streaks", c:"#059669",g:"rgba(5,150,105,.12)", delay:.54},
              ].map(f=>(
                <motion.div key={f.t}
                  initial={{opacity:0,x:-28}} animate={{opacity:1,x:0}}
                  transition={{delay:f.delay,duration:.65,ease:[.22,1,.36,1]}}
                  whileHover={{x:6,scale:1.015}}
                  style={{display:"flex",alignItems:"center",gap:14,padding:"15px 20px",borderRadius:20,
                    background:L?"rgba(255,255,255,.7)":"rgba(255,255,255,.055)",
                    border:`1px solid ${L?"rgba(37,99,235,.14)":"rgba(255,255,255,.1)"}`,
                    backdropFilter:"blur(18px)",cursor:"default",
                    boxShadow:L?"0 4px 24px rgba(37,99,235,.09)":"0 4px 24px rgba(0,0,0,.22)"}}>
                  <div style={{width:42,height:42,borderRadius:13,background:f.g,
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                    boxShadow:`0 6px 16px ${f.g}`}}>
                    <f.I size={19} color={f.c}/>
                  </div>
                  <div>
                    <p style={{color:L?"#0f172a":"rgba(226,235,255,.95)",fontSize:14,fontWeight:700,marginBottom:2}}>{f.t}</p>
                    <p style={{color:L?"#475569":"rgba(180,200,240,.6)",fontSize:12.5}}>{f.d}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        width:"100%",
        maxWidth: isMob ? "100%" : isTab ? "100%" : 560,
        flexShrink:0,
        display:"flex",
        flexDirection:"column",
        alignItems:"stretch",
        paddingLeft: isMob ? 16 : isTab ? 32 : 28,
        paddingRight: isMob ? 16 : isTab ? 32 : 28,
        paddingTop: 0,
        paddingBottom: isMob ? "max(24px, env(safe-area-inset-bottom, 0px))" : isTab ? 48 : 32,
        minHeight: "100dvh",
        position:"relative",
        overflow:"hidden",
      }}>

        {/* Behind-card parallax orbs */}
        <motion.div animate={{x:mouse.x*24-12,y:mouse.y*24-12}}
          transition={{type:"spring",damping:28,stiffness:55}}
          style={{position:"absolute",width:400,height:400,top:"-90px",right:"-90px",borderRadius:"50%",pointerEvents:"none",
            background:L?"radial-gradient(circle,rgba(37,99,235,.12) 0%,transparent 70%)":"radial-gradient(circle,rgba(37,99,235,.2) 0%,transparent 70%)",
            filter:"blur(55px)"}}/>
        <motion.div animate={{x:-(mouse.x*18-9),y:-(mouse.y*18-9)}}
          transition={{type:"spring",damping:28,stiffness:55}}
          style={{position:"absolute",width:320,height:320,bottom:"-70px",left:"-70px",borderRadius:"50%",pointerEvents:"none",
            background:L?"radial-gradient(circle,rgba(139,92,246,.09) 0%,transparent 70%)":"radial-gradient(circle,rgba(139,92,246,.16) 0%,transparent 70%)",
            filter:"blur(50px)"}}/>

        {/* Theme toggle: dedicated row so it stays clear of notch/status bar and never sits under the card */}
        <div
          style={{
            position: "relative",
            zIndex: 30,
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            width: "100%",
            paddingTop: "max(12px, env(safe-area-inset-top, 0px))",
            paddingBottom: isMob ? 12 : 10,
          }}
        >
          <motion.button whileHover={{scale:1.06,y:-2}} whileTap={{scale:.94}}
            onClick={toggleLoginTheme}
            type="button"
            aria-label={L ? "Switch to dark mode" : "Switch to light mode"}
            style={{
              display:"flex",alignItems:"center",gap:7,
              padding: isMob ? "10px 14px" : "9px 16px",
              borderRadius:99,
              border:`1px solid ${rInpBr}`,
              background:L?"rgba(255,255,255,.85)":"rgba(255,255,255,.09)",
              cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
              fontSize: isMob ? 12 : 12,
              fontWeight:700,
              color:rT3,backdropFilter:"blur(14px)",
              WebkitTapHighlightColor: "transparent",
              boxShadow:L?"0 4px 20px rgba(37,99,235,.14)":"0 4px 14px rgba(0,0,0,.35)"}}>
            {L?<Moon size={14}/>:<Sun size={14} color="#fbbf24"/>}
            {L?"Dark":"Light"}
          </motion.button>
        </div>

        {/* Card column: centered on tablet/desktop; top-aligned on mobile with even spacing */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: isMob ? "flex-start" : "center",
          alignItems: "center",
          width: "100%",
          minHeight: 0,
          position: "relative",
          zIndex: 2,
          paddingTop: isMob ? 8 : 0,
        }}>
        {/* 3D TILT CARD */}
        <TiltCard isMobile={isMob} style={{
          position:"relative",zIndex:2,
          width:"100%",
          maxWidth: isMob ? "100%" : 450,
          borderRadius: isMob ? 24 : 30,
          background:L
            ?"rgba(255,255,255,.88)"
            :"rgba(12,18,40,.82)",
          border:`1px solid ${L?"rgba(255,255,255,.95)":"rgba(255,255,255,.11)"}`,
          backdropFilter:"blur(32px)",WebkitBackdropFilter:"blur(32px)",
          boxShadow:L
            ?"0 4px 8px rgba(37,99,235,.05),0 24px 64px rgba(37,99,235,.18),0 1px 0 rgba(255,255,255,.95) inset"
            :"0 24px 80px rgba(0,0,0,.65),0 8px 32px rgba(0,0,0,.45),0 1px 0 rgba(255,255,255,.12) inset",
          padding: cardPad,
          overflow:"hidden",
        }}>
          {/* Top shimmer */}
          <div style={{position:"absolute",top:0,left:"12%",right:"12%",height:1.5,borderRadius:99,
            background:"linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent)",zIndex:11}}/>
          {/* Bottom subtle border */}
          <div style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:1,borderRadius:99,
            background:`linear-gradient(90deg,transparent,${L?"rgba(37,99,235,.15)":"rgba(255,255,255,.07)"},transparent)`,zIndex:11}}/>

          {/* Logo inside card */}
          <motion.div initial={{opacity:0,y:-12}} animate={{opacity:1,y:0}}
            transition={{duration:.55,ease:[.22,1,.36,1]}}
            style={{display:"flex",alignItems:"center",gap:12,marginBottom: isMob ? 24 : 34}}>
            <motion.div whileHover={{rotate:12,scale:1.12}}
              style={{width: isMob ? 38 : 44, height: isMob ? 38 : 44,borderRadius:14,
                background:"linear-gradient(135deg,#2563eb,#6366f1)",
                boxShadow:"0 8px 24px rgba(37,99,235,.42),inset 0 1px 0 rgba(255,255,255,.32)",
                display:"flex",alignItems:"center",justifyContent:"center"}}>
              <HeartPulse size={isMob ? 18 : 21} color="#fff"/>
            </motion.div>
            <div>
              <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize: isMob ? 18 : 21,fontStyle:"italic",fontWeight:800,letterSpacing:"-.3px"}}>
                <span style={{color:rT1}}>Med</span>
                <span style={{background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Track</span>
              </div>
              <div style={{fontSize:8.5,fontWeight:800,letterSpacing:".13em",textTransform:"uppercase",
                color:L?"rgba(37,99,235,.55)":"rgba(147,197,253,.5)",marginTop:1}}>HEALTH</div>
            </div>
          </motion.div>

          <AnimatePresence mode="wait">

            {/* Verify */}
            {step==="verify"&&(
              <motion.div key="verify" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
                exit={{opacity:0,y:-10}} transition={{duration:.28}}>
                <motion.div animate={{scale:[1,1.07,1],rotate:[0,4,-4,0]}}
                  transition={{duration:2.2,repeat:Infinity,ease:"easeInOut"}}
                  style={{width:66,height:66,borderRadius:22,
                    background:"linear-gradient(135deg,rgba(6,182,212,.22),rgba(6,182,212,.1))",
                    border:"1.5px solid rgba(6,182,212,.38)",
                    display:"flex",alignItems:"center",justifyContent:"center",marginBottom:24,
                    boxShadow:"0 10px 28px rgba(6,182,212,.25)"}}>
                  <Mail size={30} color="#22d3ee"/>
                </motion.div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:27,fontStyle:"italic",color:rT1,fontWeight:800,marginBottom:8}}>Check your email</h2>
                <p style={{fontSize:14,color:rT2,lineHeight:1.7,marginBottom:20}}>
                  Confirmation sent to <strong style={{color:rT1}}>{pendingRef.current.email}</strong>
                </p>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderRadius:13,
                  background:"rgba(6,182,212,.07)",border:"1px solid rgba(6,182,212,.2)",marginBottom:20}}>
                  <motion.span animate={{opacity:[1,.15,1]}} transition={{duration:1.2,repeat:Infinity}}
                    style={{width:7,height:7,borderRadius:"50%",background:"#22d3ee",flexShrink:0,display:"block"}}/>
                  <div>
                    <p style={{color:"#22d3ee",fontSize:13,fontWeight:700}}>Waiting for verification</p>
                    <p style={{color:rT2,fontSize:11,marginTop:1}}>Checking every 5s · {mm}:{ss}</p>
                  </div>
                </div>
                <AnimatePresence>
                  {err&&<ErrBanner msg={err} loginLight={L}/>}
                  {resent&&<OkBanner msg="Verification email resent." loginLight={L}/>}
                </AnimatePresence>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <motion.button whileHover={{scale:1.02,y:-1}} whileTap={{scale:.97}}
                    className="auth-ghost" disabled={busy} onClick={resendVerification}
                    style={{width:"100%",padding:13,borderRadius:13,
                      background:L?"rgba(0,0,0,.04)":"rgba(255,255,255,.06)",
                      border:`1px solid ${rInpBr}`,color:rT3,fontFamily:"inherit",
                      fontSize:13,fontWeight:600,cursor:"pointer",
                      display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    {busy?<Loader2 size={14} className="auth-spin"/>:<><RefreshCw size={13}/> Resend email</>}
                  </motion.button>
                  <motion.button whileHover={{scale:1.01}} onClick={backToForm}
                    style={{width:"100%",padding:12,borderRadius:12,background:"transparent",
                      border:`1px solid ${rInpBr}`,color:rT3,fontFamily:"inherit",
                      fontSize:13,fontWeight:500,cursor:"pointer",
                      display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                    <ArrowRight size={13} style={{transform:"rotate(180deg)"}}/> Back to sign in
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Reset */}
            {step==="reset"&&(
              <motion.div key="reset" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
                exit={{opacity:0,y:-10}} transition={{duration:.28}}>
                <motion.div whileHover={{rotate:10,scale:1.08}}
                  style={{width:60,height:60,borderRadius:19,
                    background:"linear-gradient(135deg,rgba(37,99,235,.18),rgba(99,102,241,.12))",
                    border:"1.5px solid rgba(37,99,235,.32)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    marginBottom:22,boxShadow:"0 10px 28px rgba(37,99,235,.2)"}}>
                  <KeyRound size={26} color="#3b82f6"/>
                </motion.div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:27,fontStyle:"italic",color:rT1,fontWeight:800,marginBottom:8}}>Reset password</h2>
                <p style={{fontSize:14,color:rT2,lineHeight:1.65,marginBottom:20}}>We'll send a secure link. It expires in 1 hour.</p>
                <div style={{marginBottom:18}}>
                  <label style={LBL}>Email address</label>
                  <input className="auth-inp" style={INP} type="email" value={resetEmail||email}
                    placeholder="you@example.com"
                    onChange={e=>setResetEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendReset()}/>
                </div>
                <AnimatePresence>
                  {err&&<ErrBanner msg={err} loginLight={L}/>}
                  {info&&<OkBanner msg={info} loginLight={L}/>}
                </AnimatePresence>
                {info?(
                  <motion.button whileHover={{scale:1.02,y:-2}} whileTap={{scale:.97}} onClick={backToForm}
                    style={{width:"100%",padding:15,borderRadius:14,background:"linear-gradient(135deg,#2563eb,#4f46e5)",
                      border:"none",color:"#fff",fontFamily:"inherit",fontSize:14,fontWeight:800,cursor:"pointer",
                      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                      boxShadow:"0 10px 30px rgba(37,99,235,.38)"}}>
                    <ArrowRight size={14} style={{transform:"rotate(180deg)"}}/> Back to Sign In
                  </motion.button>
                ):(
                  <>
                    <motion.button whileHover={{scale:1.02,y:-2}} whileTap={{scale:.97}}
                      className="auth-btn" disabled={busy} onClick={sendReset}
                      style={{width:"100%",padding:15,background:"linear-gradient(135deg,#2563eb,#4f46e5)",
                        border:"none",borderRadius:14,color:"#fff",fontFamily:"inherit",
                        fontSize:14,fontWeight:800,cursor:"pointer",
                        display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                        boxShadow:"0 10px 30px rgba(37,99,235,.38)",marginBottom:10}}>
                      {busy?<Loader2 size={15} className="auth-spin"/>:<><Mail size={14}/> Send Reset Link</>}
                    </motion.button>
                    <motion.button whileHover={{scale:1.01}} onClick={backToForm}
                      style={{width:"100%",padding:12,borderRadius:12,background:"transparent",
                        border:`1px solid ${rInpBr}`,color:rT3,fontFamily:"inherit",
                        fontSize:13,fontWeight:500,cursor:"pointer",
                        display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                      <ArrowRight size={13} style={{transform:"rotate(180deg)"}}/> Back to sign in
                    </motion.button>
                  </>
                )}
              </motion.div>
            )}

            {/* Form */}
            {step==="form"&&(
              <motion.div key="form" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
                exit={{opacity:0,y:-10}} transition={{duration:.28}}>

                <motion.h2 initial={{opacity:0}} animate={{opacity:1}} transition={{delay:.06}}
                  style={{fontFamily:"'Playfair Display',serif",
                    fontSize: headingSize,
                    fontStyle:"italic",
                    fontWeight:800,lineHeight:1.08,letterSpacing:"-.5px",marginBottom:7,
                    background:"linear-gradient(135deg,#1d4ed8 0%,#4f46e5 50%,#7c3aed 100%)",
                    WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
                  {tab==="login"?"Welcome back.":"Get started."}
                </motion.h2>
                <p style={{fontSize: subSize,color:rT2,lineHeight:1.65,marginBottom: isMob ? 20 : 26,fontWeight:400}}>
                  {tab==="login"?"Sign in to your health dashboard.":"Create your free account today."}
                </p>

                <AnimatePresence>
                  {info&&<OkBanner msg={info} loginLight={L} onDismiss={()=>setInfo("")}/>}
                </AnimatePresence>

                {/* Tab switcher */}
                <div style={{display:"flex",gap:0,background:rSub,border:`1px solid ${rSubBr}`,
                  borderRadius:15,padding:4,marginBottom: isMob ? 18 : 24}}>
                  {[["login","Sign In"],["signup","Sign Up"]].map(([v,l])=>(
                    <motion.button key={v} whileTap={{scale:.96}}
                      className={`auth-tab ${tab===v?"auth-tab-on":""}`}
                      onClick={()=>{setTab(v);setErr("");setInfo("");}}
                      style={{flex:1,padding:"11px 0",borderRadius:12,border:"none",cursor:"pointer",
                        fontFamily:"inherit",fontSize:13.5,fontWeight:700,transition:"all .2s",background:"transparent"}}>
                      {l}
                    </motion.button>
                  ))}
                </div>

                <div style={{display:"flex",flexDirection:"column",gap: isMob ? 13 : 16}}>
                  <AnimatePresence>
                    {tab==="signup"&&(
                      <motion.div key="nf" initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}}
                        exit={{opacity:0,height:0}} style={{overflow:"hidden"}}>
                        <div style={{marginBottom:14}}>
                          <label style={LBL}>Your name</label>
                          <input className="auth-inp" style={INP} type="text" value={name}
                            placeholder="e.g. Jamie or Dr. Patel"
                            onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                        </div>
                        <label style={LBL}>I am a</label>
                        <div style={{display:"flex",gap: isMob ? 6 : 8,marginBottom:4}}>
                          {[["client","Patient"],["doctor","Doctor"],["pharmacist","Pharmacist"]].map(([v,l])=>(
                            <motion.button key={v} whileHover={{y:-2,scale:1.02}} whileTap={{scale:.95}}
                              type="button" onClick={()=>setRole(v)}
                              style={{flex:1,padding: isMob ? "10px 4px" : "12px 8px",borderRadius:13,border:"1.5px solid",
                                fontFamily:"inherit",fontSize: isMob ? 11 : 12,fontWeight:700,cursor:"pointer",
                                transition:"all .18s",
                                borderColor:role===v?"#2563eb":rInpBr,
                                background:role===v?"rgba(37,99,235,.13)":"transparent",
                                color:role===v?"#3b82f6":rT3,
                                boxShadow:role===v?"0 4px 16px rgba(37,99,235,.2)":"none"}}>
                              {l}
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label style={LBL}>Email address</label>
                    <input className="auth-inp" style={INP} type="email" value={email}
                      placeholder="you@example.com" autoComplete="email"
                      onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                  </div>

                  <div>
                    <label style={LBL}>Password</label>
                    <div style={{position:"relative"}}>
                      <input className="auth-inp" style={{...INP,paddingRight:48}}
                        type={vis?"text":"password"} value={pw} placeholder="••••••••"
                        autoComplete={tab==="login"?"current-password":"new-password"}
                        onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                      <motion.button whileHover={{scale:1.12}} whileTap={{scale:.9}}
                        onClick={()=>setVis(!vis)}
                        style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",
                          background:"none",border:"none",cursor:"pointer",color:rT3,display:"flex",padding:0}}>
                        {vis?<EyeOff size={16}/>:<Eye size={16}/>}
                      </motion.button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {tab==="login"&&(
                      <motion.div key="rem" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                        style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <label onClick={()=>setRemember(!remember)}
                          style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer",userSelect:"none"}}>
                          <motion.span whileTap={{scale:.8}}
                            style={{width:18,height:18,borderRadius:6,flexShrink:0,
                              display:"flex",alignItems:"center",justifyContent:"center",
                              background:remember?"linear-gradient(135deg,#2563eb,#4f46e5)":"transparent",
                              border:`2px solid ${remember?"#2563eb":rInpBr}`,
                              boxShadow:remember?"0 4px 14px rgba(37,99,235,.38)":"none",
                              transition:"all .18s"}}>
                            {remember&&<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </motion.span>
                          <span style={{fontSize:13,fontWeight:500,color:rT2}}>Remember me</span>
                        </label>
                        <motion.button whileHover={{scale:1.05}}
                          onClick={()=>{setStep("reset");setResetEmail(email);setErr("");setInfo("");}}
                          style={{fontSize:12,fontWeight:700,color:"#3b82f6",cursor:"pointer",
                            background:"none",border:"none",padding:0,fontFamily:"inherit"}}>
                          Forgot password?
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {err&&(
                      <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
                        <ErrBanner msg={err} loginLight={L}/>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* CTA button */}
                  <motion.button
                    whileHover={{scale:1.025,y:-2}}
                    whileTap={{scale:.97}}
                    className="auth-btn"
                    disabled={busy||!email.trim()||!pw||(tab==="signup"&&!name.trim())}
                    onClick={submit}
                    style={{width:"100%",padding:"16px 0",
                      background:"linear-gradient(135deg,#2563eb 0%,#4f46e5 50%,#7c3aed 100%)",
                      border:"none",borderRadius:15,color:"#fff",fontFamily:"inherit",
                      fontSize:15,fontWeight:800,cursor:"pointer",
                      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                      boxShadow:"0 10px 32px rgba(37,99,235,.42)",letterSpacing:".02em",
                      transition:"opacity .2s,box-shadow .2s"}}>
                    {busy?<Loader2 size={16} className="auth-spin"/>:tab==="login"?"Sign In →":"Create Account →"}
                  </motion.button>

                  {tab==="signup"&&(
                    <p style={{fontSize:11.5,color:rT3,textAlign:"center",lineHeight:1.7}}>
                      A verification email will be sent to confirm your address.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </TiltCard>
        </div>
      </div>
    </div>
  );
}