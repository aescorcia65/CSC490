import { useState, useEffect, useRef, useId, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Mail, RefreshCw, ArrowRight, ArrowLeft, Loader2, Eye, EyeOff, KeyRound,
  AlertCircle, CheckCircle2, X, Sun, Moon, Bell, TrendingUp, Lock, Brain, User, Users, ChevronDown,
} from "lucide-react";
import { supabase } from "../../supabase";
import { useTheme } from "../../hooks/useTheme";
import MedTrackHeartLogo from "./MedTrackHeartLogo";
import AuthHeroGlassHeart from "./AuthHeroGlassHeart";
import MarketingSiteHeader from "./MarketingSiteHeader";

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

/** Two tall QRS-style complexes; baseline 50. Path ends at SIGNUP_ECG_END_X so the cap sits on a short tail (glow isn’t clipped). */
const SIGNUP_ECG_END_X = 1012;
const SIGNUP_ECG_VB_W = 1024;
const SIGNUP_ECG_D =
  `M0,50 H60 L64,47 L68,50 L72,50 L76,26 L85,93 L91,5 L97,91 L103,18 L109,50 H360 L364,48 L368,50 L372,50 L376,26 L384,94 L390,6 L396,90 L402,19 L408,50 H${SIGNUP_ECG_END_X}`;

/** Traveling trace duration (linear sweep along full path, loops). */
const SIGNUP_ECG_TRAVEL_MS = 6000;

/**
 * Signup ECG: traveling dash via CSS; cap “heartbeat” via SVG SMIL (CSS transform on SVG `<g>` is unreliable).
 * `runAnimations`: false when tab hidden. SMIL beats omitted when `prefers-reduced-motion`.
 */
function SignupHeartbeatSvg({ L, signupEcgUid, runAnimations }) {
  const uid = signupEcgUid.replace(/[^a-zA-Z0-9_-]/g, "_");
  const capOuterR = L ? 10 : 13;
  const capInnerR = L ? 5.5 : 6.5;
  const capCoreR = L ? 2.5 : 2.8;
  const travelW = L ? 3 : 2.8;
  const pausedClass = runAnimations ? "" : ` signup-ecg-paused-${uid}`;
  const [allowBeat, setAllowBeat] = useState(() =>
    typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAllowBeat(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const beatOn = runAnimations && allowBeat;
  /** Dark mode: white trace on deep bg (sign-in hero style). */
  const ghostStroke = "rgba(255,255,255,0.14)";
  const traceStroke = "rgba(255,255,255,0.9)";
  /** Light mode: clinical cyan/teal on pale blue — white strokes vanish on this page. */
  const lmBaseline = "rgba(37,99,235,0.16)";
  const lmGhost = "rgba(59,130,246,0.32)";
  const lmHalo = "rgba(96,165,250,0.28)";
  const lmBody = "#1e40af";
  const lmMid = "#2563eb";
  const lmCrisp = "#3b82f6";
  const lmTravel = "#eff6ff";
  const lmCapOuter = "#2563eb";
  const lmCapMid = "#dbeafe";
  const r1 = capOuterR;
  const rBump1 = capOuterR + (L ? 4.2 : 5);
  const rBump2 = capOuterR + (L ? 2.4 : 3.2);
  const beatDur = "1.5s";
  const beatKeyTimes = "0;0.09;0.17;0.30;1";
  const smilScale = useMemo(
    () => (
      <animateTransform
        attributeName="transform"
        type="scale"
        values="1;1.28;0.95;1.18;1"
        keyTimes={beatKeyTimes}
        dur={beatDur}
        repeatCount="indefinite"
        calcMode="spline"
        keySplines="0.25 0.1 0.25 1;0.25 0.1 0.25 1;0.25 0.1 0.25 1;0.25 0.1 0.25 1"
      />
    ),
    [beatKeyTimes, beatDur],
  );
  const smilOuterR = useMemo(
    () => (
      <animate
        attributeName="r"
        values={`${r1};${rBump1};${r1};${rBump2};${r1}`}
        keyTimes={beatKeyTimes}
        dur={beatDur}
        repeatCount="indefinite"
        calcMode="spline"
        keySplines="0.25 0.1 0.25 1;0.25 0.1 0.25 1;0.25 0.1 0.25 1;0.25 0.1 0.25 1"
      />
    ),
    [r1, rBump1, rBump2, beatKeyTimes, beatDur],
  );
  return (
    <>
      <style>{`
        @keyframes signup_ecg_fadein_${uid} {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .signup-ecg-fadein-${uid} {
          animation: signup_ecg_fadein_${uid} 0.42s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .signup-ecg-fadein-${uid} { animation: none; opacity: 1; }
        }
      `}</style>
      <div style={{ width: "100%", height: "100%" }} className={runAnimations ? `signup-ecg-fadein-${uid}` : undefined}>
      <svg
        viewBox={`0 0 ${SIGNUP_ECG_VB_W} 100`}
        preserveAspectRatio="none"
        className={`signup-ecg-svg${pausedClass}`}
        data-signup-ecg={uid}
        style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
        aria-hidden
      >
        <style>{`
          @keyframes signup_ecg_travel_${uid} {
            to { stroke-dashoffset: -1; }
          }
          .signup-ecg-svg .signup-ecg-travel-${uid} {
            stroke-dasharray: 0.09 0.91;
            stroke-dashoffset: 0;
            animation: signup_ecg_travel_${uid} ${SIGNUP_ECG_TRAVEL_MS}ms linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .signup-ecg-svg .signup-ecg-travel-${uid} {
              animation: none !important;
            }
            .signup-ecg-svg .signup-ecg-travel-${uid} { stroke-dashoffset: 0; }
          }
          .signup-ecg-paused-${uid} .signup-ecg-travel-${uid} {
            animation-play-state: paused !important;
          }
        `}</style>
        <defs>
          <clipPath id={`${uid}-leftcap`}>
            <rect x="0" y="0" width="520" height="100" />
          </clipPath>
          <filter
            id={`${uid}-ecg-neon`}
            x="-45%"
            y="-45%"
            width="190%"
            height="190%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="
              0.9 0 0 0 0.15
              0 0.95 0 0 0.5
              0 0 1 0 0.95
              0 0 0 0.72 0"
              result="cyanGlow"
            />
            <feMerge>
              <feMergeNode in="cyanGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter
            id={`${uid}-ecg-neon-light`}
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="
              0.75 0 0 0 0.18
              0 0.45 0 0 0.22
              0 0 1 0 0.62
              0 0 0 0.52 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`${uid}-ecg-spark`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {L ? (
          <>
            <path
              fill="none"
              stroke={lmHalo}
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d={SIGNUP_ECG_D}
              opacity={1}
            />
            <path
              fill="none"
              stroke={lmGhost}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d={SIGNUP_ECG_D}
              opacity={1}
            />
            <path
              fill="none"
              stroke={lmBaseline}
              strokeWidth="5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              d="M0,50 H505"
              clipPath={`url(#${uid}-leftcap)`}
              opacity={1}
            />
            <g filter={`url(#${uid}-ecg-neon-light)`}>
              <path
                fill="none"
                stroke={lmBody}
                strokeWidth="3.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                d={SIGNUP_ECG_D}
              />
            </g>
            <path
              fill="none"
              stroke={lmMid}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d={SIGNUP_ECG_D}
              opacity={0.88}
            />
            <path
              fill="none"
              stroke={lmCrisp}
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d={SIGNUP_ECG_D}
              opacity={0.97}
            />
            <path
              pathLength={1}
              fill="none"
              stroke={lmTravel}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${uid}-ecg-neon-light)`}
              className={`signup-ecg-travel-${uid}`}
              d={SIGNUP_ECG_D}
              opacity={1}
            />
            <g transform={`translate(${SIGNUP_ECG_END_X},50)`}>
              <g>
                {beatOn ? smilScale : null}
                <circle cx={0} cy={0} r={capOuterR} fill={lmCapOuter} filter={`url(#${uid}-ecg-spark)`}>
                  {beatOn ? smilOuterR : null}
                  {beatOn ? (
                    <animate
                      attributeName="opacity"
                      values="0.55;1;0.6;0.92;0.55"
                      keyTimes={beatKeyTimes}
                      dur={beatDur}
                      repeatCount="indefinite"
                      calcMode="linear"
                    />
                  ) : null}
                </circle>
                <circle cx={0} cy={0} r={capInnerR} fill={lmCapMid} opacity={0.98} />
                <circle cx={0} cy={0} r={capCoreR} fill="#ffffff" opacity={1} />
              </g>
            </g>
          </>
        ) : (
          <>
            <path
              fill="none"
              stroke={ghostStroke}
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d={SIGNUP_ECG_D}
              opacity={1}
            />
            <path
              fill="none"
              stroke={ghostStroke}
              strokeWidth="7"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              d="M0,50 H505"
              clipPath={`url(#${uid}-leftcap)`}
              opacity={0.75}
            />
            <g filter={`url(#${uid}-ecg-neon)`}>
              <path
                fill="none"
                stroke={traceStroke}
                strokeWidth="4.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                d={SIGNUP_ECG_D}
              />
            </g>
            <path
              fill="none"
              stroke={traceStroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d={SIGNUP_ECG_D}
              opacity={0.95}
            />
            <path
              pathLength={1}
              fill="none"
              stroke={traceStroke}
              strokeWidth={travelW}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${uid}-ecg-neon)`}
              className={`signup-ecg-travel-${uid}`}
              d={SIGNUP_ECG_D}
              opacity={1}
            />
            <g transform={`translate(${SIGNUP_ECG_END_X},50)`}>
              <g>
                {beatOn ? smilScale : null}
                <circle cx={0} cy={0} r={capOuterR} fill="#ffffff" filter={`url(#${uid}-ecg-spark)`}>
                  {beatOn ? smilOuterR : null}
                  {beatOn ? (
                    <animate
                      attributeName="opacity"
                      values={L ? "0.5;1;0.55;0.92;0.5" : "0.5;1;0.55;0.95;0.5"}
                      keyTimes={beatKeyTimes}
                      dur={beatDur}
                      repeatCount="indefinite"
                      calcMode="linear"
                    />
                  ) : null}
                </circle>
                <circle cx={0} cy={0} r={capInnerR} fill="rgba(255,255,255,0.98)" opacity={0.98} />
                <circle cx={0} cy={0} r={capCoreR} fill="#ffffff" opacity={1} />
              </g>
            </g>
          </>
        )}
      </svg>
      </div>
    </>
  );
}

const font = "'Inter',system-ui,-apple-system,sans-serif";
const gradBtn = "linear-gradient(90deg,#1D4ED8 0%,#2563EB 42%,#0EA5E9 100%)";
const gradBtnHover = "linear-gradient(90deg,#1E40AF 0%,#2563EB 40%,#22D3EE 100%)";
const accent = "#2563EB";
const OAUTH_SIGNUP_KEY = "mt_oauth_signup";
const HERO_ROTATING_WORDS = ["beautifully", "safely", "smartly"];

export default function Auth({ authMode = "landing" }) {
  const navigate = useNavigate();
  const isLandingMode = authMode === "landing";
  const isDedicatedAuthPage = authMode === "signin" || authMode === "signup";
  const isSignupPage = authMode === "signup";
  const isSigninPage = authMode === "signin";
  const [tab,setTab]     = useState(authMode === "signup" ? "signup" : "login");
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
  const [heroWordIdx, setHeroWordIdx] = useState(0);

  const isMob = useIsMobile();
  const isTab = useIsTablet();
  const isDedicatedAuthMobile = (isSignupPage || isSigninPage) && isMob;
  const reducedMotionPref = useReducedMotion();
  const reducedMotion = reducedMotionPref === true;
  const [signupPageVisible, setSignupPageVisible] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "visible",
  );
  /** ECG uses CSS animations (not Framer); runs whenever signup tab is visible. */
  const signupEcgRun = isSignupPage && signupPageVisible;
  const signupSkipEnterMotion = isSignupPage && reducedMotion;

  const toggleLoginTheme = () => setLoginTheme(!loginLight);
  const scrollToSignIn = () => {
    if (isLandingMode) {
      navigate("/login");
      return;
    }
    setTab("login");
    setStep("form");
    setErr("");
    setInfo("");
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const scrollToSignUp = () => {
    if (isLandingMode) {
      navigate("/signup");
      return;
    }
    setTab("signup");
    setStep("form");
    setErr("");
    setInfo("");
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const pendingRef = useRef({email:"",pw:""});
  const pollRef    = useRef(null);
  const tickRef    = useRef(null);
  const formCardRef = useRef(null);
  const scrollPortRef = useRef(null);
  const signupEcgUid = useId().replace(/:/g, "");
  const heroWordMeasureRef = useRef(null);
  const [heroWordWidths, setHeroWordWidths] = useState({});

  useEffect(() => {
    if (isDedicatedAuthMobile) return undefined;
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
  }, [isDedicatedAuthMobile]);

  useEffect(() => {
    if (isSignupPage || isSigninPage) return undefined;
    const timer = window.setInterval(() => {
      setHeroWordIdx((idx) => (idx + 1) % HERO_ROTATING_WORDS.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [isSignupPage, isSigninPage]);

  useEffect(() => {
    if (!isSignupPage) return undefined;
    const onVis = () => setSignupPageVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isSignupPage]);

  useEffect(() => {
    const el = heroWordMeasureRef.current;
    if (!el) return;
    const next = {};
    const padX = 14 * 2;
    const borderX = 2;
    const slackX = 10;
    HERO_ROTATING_WORDS.forEach((word) => {
      el.textContent = word;
      next[word] = Math.ceil(el.getBoundingClientRect().width) + padX + borderX + slackX;
    });
    setHeroWordWidths(next);
  }, [isMob, isTab, loginLight]);

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

  useEffect(() => {
    if (authMode === "signup") setRole("");
    else if (authMode === "signin") setRole("client");
  }, [authMode]);

  async function submit(){
    const em=email.trim();
    if(!em||!pw)return;
    if(tab==="signup"&&!name.trim())return;
    if(tab==="signup"&&isSignupPage&&!role)return;
    setBusy(true);setErr("");setInfo("");setResent(false);
    try{
      if(tab==="signup"){
        const roleValue=role==="client"?"patient":role;
        const{data,error}=await supabase.auth.signUp({
          email:em,password:pw,
          options:{data:{full_name:name.trim(),role:roleValue},emailRedirectTo:`${window.location.origin}/signup`},
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

      const postAuthPath = tab === "signup" ? "/signup" : "/signin";
      const{error}=await supabase.auth.signInWithOAuth({
        provider,
        options:{
          redirectTo: `${window.location.origin}${postAuthPath}`,
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
  const heroWord = HERO_ROTATING_WORDS[heroWordIdx];
  const heroWordWidth = heroWordWidths[heroWord] || 168;

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
  const LBL_SIGNUP = { ...LBL, marginBottom: isSignupPage ? 4 : 10, fontSize: isSignupPage ? 10 : 11, letterSpacing: isSignupPage ? ".1em" : ".12em" };
  const inpIconOffset = isMob ? 14 : 16;
  const inpPadLeftIco = isMob ? 44 : 46;
  const inpPadLeftIcoSignup = isMob ? 42 : 44;

  const INP_SIGNUP = {
    ...INP,
    padding: isSignupPage
      ? (isMob ? "10px 12px" : "10px 13px")
      : (isMob ? "16px 16px" : "16px 18px"),
    minHeight: isSignupPage ? (isMob ? 40 : 38) : (isMob ? 52 : 50),
    fontSize: isSignupPage ? (isMob ? 14 : 14) : INP.fontSize,
    borderRadius: isSignupPage ? 12 : INP.borderRadius,
    transition: "border-color .2s ease, box-shadow .2s ease, background .2s ease",
  };

  const signupCardMaxW = 440;
  const signupHeadingPx = isMob ? 19 : 20;
  const signupSubPx = 12.5;

  const pageBg = L
    ? "linear-gradient(165deg,#eff6ff 0%,#e0f2fe 42%,#f0f9ff 100%)"
    : "linear-gradient(165deg,#0f172a 0%,#1e3a5f 50%,#020617 100%)";

  return (
    <div
      ref={scrollPortRef}
      className="auth-login-scrollport"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        overflowX: "hidden",
        overflowY: isSignupPage || isSigninPage ? (isMob ? "auto" : "hidden") : "auto",
        scrollBehavior: "smooth",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        overscrollBehaviorY: "auto",
        fontFamily: font,
      }}
    >
    {!isDedicatedAuthPage ? (
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: isMob ? "14px 14px 0" : "20px 26px 0", width: "100%", boxSizing: "border-box", position: "relative", zIndex: 5 }}>
        <MarketingSiteHeader marginBottom={isMob ? 10 : 14} />
      </div>
    ) : null}
    <div style={{
      minHeight: isDedicatedAuthMobile ? "auto" : "100dvh",
      maxHeight: "none",
      display: "flex",
      flexDirection: isMob ? "column" : "row",
      alignItems: isMob ? "stretch" : (isSignupPage || isSigninPage ? "stretch" : "flex-start"),
      width: "100%",
      position: "relative",
      background: pageBg,
      overflow: "visible",
      boxSizing: "border-box",
    }}>
      {isSignupPage ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "62%",
              transform: "translate(-50%, -50%)",
              width: "min(96vw, 1040px)",
              height: "min(52vh, 460px)",
              borderRadius: "50%",
              background: L
                ? "radial-gradient(ellipse at center, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.35) 42%, transparent 72%)"
                : "radial-gradient(ellipse at center, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.1) 40%, rgba(255,255,255,0.04) 56%, rgba(15,23,42,0) 74%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "71%",
              transform: "translateY(-50%)",
              height: isMob ? 128 : 168,
              paddingLeft: isMob ? 4 : 8,
              paddingRight: isMob ? 4 : 8,
              boxSizing: "border-box",
              opacity: L ? 0.62 : 0.92,
            }}
          >
            <SignupHeartbeatSvg L={L} signupEcgUid={signupEcgUid} runAnimations={signupEcgRun} />
          </div>
        </div>
      ) : null}
      <style>{`
        .auth-inp::placeholder{color:${L?"#94a3b8":"#64748b"}!important}
        .auth-inp:focus{border-color:${accent}!important;box-shadow:0 0 0 3px rgba(37,99,235,.2),${L?"inset 0 1px 2px rgba(15,23,42,.04)":"inset 0 1px 2px rgba(0,0,0,.15)"}!important;background:${L?"#fff":"rgba(255,255,255,.1)"}!important}
        .auth-inp.auth-inp-signup:focus{border-color:${accent}!important;box-shadow:0 0 0 2px rgba(37,99,235,.12),0 4px 16px rgba(37,99,235,.1),${L?"inset 0 1px 2px rgba(15,23,42,.04)":"inset 0 1px 2px rgba(0,0,0,.15)"}!important;background:${L?"#fff":"rgba(255,255,255,.1)"}!important;transition:border-color .2s ease, box-shadow .2s ease, background .2s ease!important}
        .auth-ghost:hover:not(:disabled){background:${L?"rgba(15,23,42,.04)":"rgba(255,255,255,.08)"}!important}
        .auth-spin{animation:spin360 .7s linear infinite}
        @keyframes spin360{to{transform:rotate(360deg)}}
      `}</style>

      {/* ── Hero ── */}
      {/* On mobile dedicated auth pages, collapse hero to just show top branding, no dead space */}
      <div style={{
        flex: isDedicatedAuthMobile ? "0 0 auto" : 1,
        position:"relative",
        zIndex:isSignupPage||isSigninPage?1:undefined,
        overflow:isSignupPage||isSigninPage?"visible":"hidden",
        display: isDedicatedAuthMobile ? "none" : "flex",
        alignSelf:isMob?"auto":"stretch",
      }} id="auth-lp">
        <style>{`
          #auth-lp::before{
            content:"";
            position:absolute;inset:0;pointer-events:none;z-index:0;
            background-image:
              linear-gradient(${isSignupPage || isSigninPage ? (L ? "rgba(148,163,184,.09)" : "rgba(255,255,255,.07)") : (L ? "rgba(37,99,235,.055)" : "rgba(96,165,250,.06)")} 1px, transparent 1px),
              linear-gradient(90deg, ${isSignupPage || isSigninPage ? (L ? "rgba(148,163,184,.09)" : "rgba(255,255,255,.07)") : (L ? "rgba(37,99,235,.055)" : "rgba(96,165,250,.06)")} 1px, transparent 1px);
            background-size:28px 28px;
          }
          #auth-lp{
            flex-direction:column;
            justify-content:flex-start;
            padding:${isSignupPage || isSigninPage
              ? `max(36px, calc(18px + env(safe-area-inset-top))) ${isMob ? "16px" : isTab ? "22px" : "40px"} max(16px, env(safe-area-inset-bottom))`
              : `max(20px, env(safe-area-inset-top)) ${isMob ? "18px" : isTab ? "28px" : "64px"} max(36px, env(safe-area-inset-bottom))`};
          }
        `}</style>

        <div aria-hidden style={{
          position:"absolute",width:420,height:420,borderRadius:"50%",top:"-8%",left:"-12%",
          background:isSignupPage||isSigninPage
            ? (L ? "radial-gradient(circle,rgba(255,255,255,0.52) 0%,transparent 68%)" : "radial-gradient(circle,rgba(255,255,255,0.14) 0%,transparent 70%)")
            : (L ? "radial-gradient(circle,rgba(37,99,235,.28) 0%,transparent 68%)" : "radial-gradient(circle,rgba(37,99,235,.16) 0%,transparent 70%)"),
          filter:isSignupPage||isSigninPage?"blur(34px)":"blur(56px)",pointerEvents:"none",zIndex:0,
        }}/>
        <div aria-hidden style={{
          position:"absolute",width:380,height:380,borderRadius:"50%",bottom:"-5%",right:"-8%",
          background:isSignupPage||isSigninPage
            ? (L ? "radial-gradient(circle,rgba(255,255,255,0.4) 0%,transparent 65%)" : "radial-gradient(circle,rgba(255,255,255,0.11) 0%,transparent 68%)")
            : (L ? "radial-gradient(circle,rgba(14,165,233,.26) 0%,transparent 65%)" : "radial-gradient(circle,rgba(14,165,233,.14) 0%,transparent 68%)"),
          filter:isSignupPage||isSigninPage?"blur(30px)":"blur(52px)",pointerEvents:"none",zIndex:0,
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
                color:isSignupPage||isSigninPage?(L?"#94a3b8":"#ffffff"):L?"#2563eb":"#38bdf8",
                opacity:isSignupPage||isSigninPage?(L?0.11:0.12):L?0.07:0.09,
                lineHeight:1,
                userSelect:"none",
              }}
            >
              +
            </span>
          ))}
        </div>

        <style>{`
          #auth-hero-mark{display:none}
          @media(min-width:960px){
            #auth-hero-mark{display:flex!important;width:clamp(250px, 27vw, 360px)}
          }
        `}</style>

        <div style={{
          position:"relative",zIndex:2,width:"100%",maxWidth:1040,
          display:"flex",
          alignItems:isSignupPage||isSigninPage?"stretch":"flex-start",
          justifyContent:"space-between",
          gap:isSignupPage||isSigninPage?(isMob?24:32):40,
          minHeight:isSignupPage||isSigninPage?(isMob?undefined:"100%"):undefined,
          flex:isSignupPage||isSigninPage?1:undefined,
        }}>
        {!isDedicatedAuthPage ? (
        <div style={{
          position:"absolute",
          top:0,
          left:0,
          right:0,
          display:"flex",
          alignItems:"center",
          justifyContent:"space-between",
          gap:14,
          paddingBottom:12,
          zIndex:4,
        }}>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              display:"flex",
              alignItems:"center",
              gap:10,
              color:L?"#0f172a":"#f8fafc",
              fontWeight:700,
              fontSize:15,
              background:"none",
              border:"none",
              cursor:"pointer",
              fontFamily:font,
              padding:0,
            }}
          >
            <span style={{width:28,height:28,borderRadius:9,background:gradBtn,display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",boxShadow:"0 8px 18px rgba(37,99,235,.26)"}}>
              <MedTrackHeartLogo size={16}/>
            </span>
            MedTrack
          </button>
              <div style={{display:isMob?"none":"flex",alignItems:"center",gap:16}}>
                {[
                  ["about", "Features"],
                  ["how-it-works", "How It Works"],
                  ["portals", "Portals"],
                ].map(([hash, label]) => (
                  <button
                    key={hash}
                    type="button"
                    onClick={() => navigate({ pathname: "/", hash })}
                    style={{
                      border:"none",
                      background:"transparent",
                      padding:0,
                      fontFamily:font,
                      fontSize:14,
                      fontWeight:600,
                      color:L?"#334155":"#cbd5e1",
                      cursor:"pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <button
                  type="button"
                  onClick={scrollToSignIn}
                  style={{
                    border:`1px solid ${L ? "#cbd5e1" : "rgba(255,255,255,.2)"}`,
                    borderRadius:10,
                    padding:"8px 12px",
                    background:L ? "rgba(255,255,255,.88)" : "rgba(255,255,255,.08)",
                    color:L ? "#0f172a" : "#e2e8f0",
                    fontFamily:font,
                    fontWeight:600,
                    fontSize:13,
                    cursor:"pointer",
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={scrollToSignUp}
                  style={{
                    border:"none",
                    borderRadius:10,
                    padding:"8px 12px",
                    background:gradBtn,
                    color:"#fff",
                    fontFamily:font,
                    fontWeight:700,
                    fontSize:13,
                    cursor:"pointer",
                    boxShadow:"0 10px 22px rgba(37,99,235,.26)",
                  }}
                >
                  Get Started
                </button>
              </div>
        </div>
        ) : null}
        {isSignupPage ? (
        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            maxWidth: 540,
            position: "relative",
            zIndex: 2,
          }}
        >
          <motion.div
            initial={signupSkipEnterMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.02, ease: [0.4, 0, 0.2, 1] }}
            style={{ position: "relative", zIndex: 2, marginBottom: 28 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: gradBtn,
                  boxShadow: "0 10px 24px rgba(37,99,235,.24)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                }}
              >
                <MedTrackHeartLogo size={26} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.3px", color: L ? "#0f172a" : "#f8fafc" }}>
                  <span>Med</span>
                  <span style={{ background: gradBtn, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Track</span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: L ? "#64748b" : "#94a3b8", marginTop: 10 }}>
                  HEALTH MANAGEMENT
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={signupSkipEnterMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: "relative",
              zIndex: 2,
              marginTop: 8,
            }}
          >
            <h1
              style={{
                fontSize: "clamp(28px,3.2vw,38px)",
                fontWeight: 800,
                lineHeight: 1.22,
                letterSpacing: "-.5px",
                margin: 0,
                color: L ? "#0f172a" : "#f8fafc",
              }}
            >
              Create your{" "}
              <span style={{ background: gradBtn, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MedTrack</span>{" "}
              account
            </h1>
          </motion.div>
        </div>
        ) : isSigninPage ? (
        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            maxWidth: 540,
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignSelf: "stretch",
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: isMob ? 22 : 28 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: gradBtn,
                boxShadow: "0 10px 24px rgba(37,99,235,.24)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <MedTrackHeartLogo size={26} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.3px", color: L ? "#0f172a" : "#f8fafc" }}>
                <span>Med</span>
                <span style={{ background: gradBtn, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Track</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: L ? "#64748b" : "#94a3b8", marginTop: 10 }}>
                HEALTH MANAGEMENT
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 6 }}>
            <h1
              style={{
                fontSize: "clamp(28px,3.2vw,38px)",
                fontWeight: 800,
                lineHeight: 1.18,
                letterSpacing: "-.5px",
                margin: 0,
                color: L ? "#0f172a" : "#f8fafc",
              }}
            >
              Welcome back,
              <br />
              <span style={{ background: gradBtn, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>to MedTrack</span>
            </h1>
          </div>
          <p style={{ fontSize: 15, color: L ? "#64748b" : "#94a3b8", lineHeight: 1.65, maxWidth: 440, margin: "0 0 12px", fontWeight: 400 }}>
            Sign in to access your dashboard and manage your health with ease.
          </p>

          <div
            style={{
              flex: 1,
              minHeight: isMob ? 140 : 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              padding: "8px 0 4px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
              <AuthHeroGlassHeart light={L} clinicalBlue={L} cycleSec={2.65} />
            </div>
          </div>
        </div>
        ) : (
        <div style={{flex:"1 1 auto",minWidth:0,maxWidth:540}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,marginTop:isMob?52:58}}>
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
            fontSize:"clamp(32px,3.6vw,44px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-.6px",margin:"0 0 28px",color:L?"#0f172a":"#f8fafc",position:"relative",
          }}>
            <span
              ref={heroWordMeasureRef}
              aria-hidden
              style={{
                position: "absolute",
                visibility: "hidden",
                whiteSpace: "nowrap",
                fontWeight: 800,
                lineHeight: 1,
                pointerEvents: "none",
              }}
            />
            <span style={{color:L?"#0f172a":"#f8fafc"}}>Your </span>
            <span style={{color:L?"#2563EB":"#7dd3fc"}}>health,</span>
            <br/>
            <motion.span
              animate={{ width: heroWordWidth }}
              transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.4 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: heroWordWidth,
                minHeight: "1.28em",
                padding: "0.1em 14px",
                marginRight: "0.12em",
                borderRadius: 999,
                border: `1px solid ${L ? "rgba(37,99,235,.42)" : "rgba(125,211,252,.52)"}`,
                background: L ? "rgba(255,255,255,.97)" : "rgba(15,23,42,.78)",
                boxShadow: L ? "0 1px 6px rgba(37,99,235,.08)" : "0 2px 8px rgba(14,165,233,.12)",
                verticalAlign: "middle",
                overflow: "hidden",
                boxSizing: "border-box",
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={heroWord}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  style={{ display: "inline-block", fontWeight: 800, lineHeight: 1, color: L ? "#1d4ed8" : "#7dd3fc" }}
                >
                  {heroWord}
                </motion.span>
              </AnimatePresence>
            </motion.span>
            <span style={{
              background:"linear-gradient(90deg,#1D4ED8,#2563EB,#0EA5E9)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            }}>organised.</span>
          </h1>

          <p style={{fontSize:16,color:L?"#475569":"#cbd5e1",lineHeight:1.75,maxWidth:460,margin:"0 0 22px",fontWeight:400}}>
            A smarter way to manage medications, reminders, and your health.
          </p>

          <div style={{display:"flex",flexWrap:"wrap",gap:"28px 16px",marginBottom:0,marginTop:4}}>
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
        )}

        {!isSignupPage && !isSigninPage ? (
        <div id="auth-hero-mark" style={{display:"none",flexShrink:0,pointerEvents:"none",alignItems:"center",justifyContent:"center",alignSelf:"center",transform:"translateY(18px)",position:"relative"}} aria-hidden>
          <AuthHeroGlassHeart light={L} />
        </div>
        ) : null}

        </div>
      </div>

      {/* ── Form column ── */}
      <div className={isDedicatedAuthMobile ? "auth-mobile-visible" : undefined} style={{
        width:"100%",
        maxWidth: isMob ? "100%" : isTab ? "100%" : (isSignupPage || isSigninPage ? signupCardMaxW : 480),
        flexShrink:0,
        flex: isSignupPage || isSigninPage ? "1 1 0" : undefined,
        minHeight: isDedicatedAuthMobile ? 0 : (isSignupPage || isSigninPage ? 0 : "100dvh"),
        maxHeight: (isSignupPage || isSigninPage) && !isMob ? "100dvh" : "none",
        display:"flex",
        flexDirection:"column",
        alignItems:"stretch",
        paddingLeft: isSignupPage || isSigninPage ? (isMob ? 14 : isTab ? 20 : 24) : (isMob ? 18 : isTab ? 28 : 32),
        paddingRight: isSignupPage || isSigninPage ? (isMob ? 14 : isTab ? 20 : 24) : (isMob ? 18 : isTab ? 28 : 32),
        paddingBottom: isMob ? "max(32px, env(safe-area-inset-bottom))" : 32,
        position:"relative",
        zIndex: isSignupPage || isSigninPage ? 1 : undefined,
        overflowX: "hidden",
        overflowY: "visible",
      }}>
        <div aria-hidden style={{
          position:"absolute",width:320,height:320,top:"-60px",right:"-40px",borderRadius:"50%",pointerEvents:"none",
          background:isSignupPage||isSigninPage
            ? (L ? "radial-gradient(circle,rgba(255,255,255,0.45) 0%,transparent 70%)" : "radial-gradient(circle,rgba(255,255,255,0.1) 0%,transparent 70%)")
            : (L ? "radial-gradient(circle,rgba(37,99,235,.18) 0%,transparent 70%)" : "radial-gradient(circle,rgba(37,99,235,.1) 0%,transparent 70%)"),
          filter:isSignupPage||isSigninPage?"blur(24px)":"blur(48px)",zIndex:0,
        }}/>
        <div aria-hidden style={{
          position:"absolute",width:280,height:280,bottom:"-40px",left:"-30px",borderRadius:"50%",pointerEvents:"none",
          background:isSignupPage||isSigninPage
            ? (L ? "radial-gradient(circle,rgba(255,255,255,0.35) 0%,transparent 70%)" : "radial-gradient(circle,rgba(255,255,255,0.08) 0%,transparent 70%)")
            : (L ? "radial-gradient(circle,rgba(14,165,233,.14) 0%,transparent 70%)" : "radial-gradient(circle,rgba(14,165,233,.08) 0%,transparent 70%)"),
          filter:isSignupPage||isSigninPage?"blur(22px)":"blur(44px)",zIndex:0,
        }}/>

        {/* Mobile-only compact logo bar (hero is hidden on mobile dedicated auth) */}

        <div style={{
          position:"relative",zIndex:30,flexShrink:0,
          display:"flex",justifyContent:isDedicatedAuthPage?"center":"flex-end",alignItems:"center",gap:10,
          width:"100%",
          paddingTop:isSignupPage||isSigninPage?(isDedicatedAuthMobile?"max(20px, calc(10px + env(safe-area-inset-top)))":"max(26px, calc(12px + env(safe-area-inset-top)))"):"max(14px, env(safe-area-inset-top))",
          paddingBottom:10,
        }}>
          {isDedicatedAuthPage ? (
            <button
              type="button"
              onClick={() => navigate("/")}
              style={{
                display:"inline-flex",
                alignItems:"center",
                gap:8,
                border:`1px solid ${L ? "#e2e8f0" : "rgba(255,255,255,.22)"}`,
                borderRadius:999,
                padding:"7px 14px",
                background:L ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.08)",
                color:L ? "#475569" : "#cbd5e1",
                fontFamily:font,
                fontWeight:600,
                fontSize:13,
                cursor:"pointer",
                boxShadow:L ? "0 1px 3px rgba(15,23,42,.06)" : "none",
              }}
            >
              <ArrowLeft size={15} strokeWidth={2.2} aria-hidden />
              Back to home
            </button>
          ) : null}
          <button type="button" onClick={toggleLoginTheme}
            aria-label={L ? "Enable dark mode" : "Enable light mode"}
            style={{
              display:"flex",alignItems:"center",gap:8,padding:isDedicatedAuthPage?"7px 14px":"8px 14px",borderRadius:999,
              border:`1px solid ${isDedicatedAuthPage ? (L ? "#e2e8f0" : "rgba(255,255,255,.22)") : rInpBr}`,
              background:isDedicatedAuthPage ? (L ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.08)") : (L?"rgba(255,255,255,.9)":"rgba(255,255,255,.08)"),
              cursor:"pointer",fontFamily:font,fontSize:13,fontWeight:600,color:isDedicatedAuthPage ? (L ? "#475569" : "#cbd5e1") : rT2,
              boxShadow:isDedicatedAuthPage ? (L ? "0 1px 3px rgba(15,23,42,.06)" : "none") : (L?"0 2px 12px rgba(15,23,42,.06)":"none"),
            }}>
            {L ? <Moon size={15} /> : <Sun size={15} color="#fbbf24" />}
            {L ? "Dark mode" : "Light mode"}
          </button>
        </div>

        <div style={{
          flex: isMob ? "0 0 auto" : 1,
          display:"flex",flexDirection:"column",justifyContent:"flex-start",
          alignItems:"center",width:"100%",position:"relative",zIndex:2,paddingTop: isSignupPage || isSigninPage ? 0 : (isMob ? 8 : 6),
        }}>
        {isLandingMode ? (
          <div
            style={{
              position:"relative",zIndex:2,width:"100%",maxWidth:440,
              borderRadius: isMob ? 20 : 24,
              background:L?"rgba(255,255,255,.94)":"rgba(15,23,42,.75)",
              border:`1px solid ${L?"#f1f5f9":"rgba(255,255,255,.1)"}`,
              backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
              boxShadow:L
                ?"0 4px 6px rgba(15,23,42,.04), 0 24px 48px rgba(37,99,235,.12)"
                :"0 24px 48px rgba(0,0,0,.45)",
              padding: cardPad,
            }}
          >
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:rT3}}>Product Preview</div>
              <div style={{fontSize:12,color:rT2}}>MedTrack Dashboard</div>
            </div>
            <div style={{borderRadius:16,padding:16,background:L?"#ffffff":"rgba(2,6,23,.45)",border:`1px solid ${L?"#e2e8f0":"rgba(125,211,252,.22)"}`}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginBottom:12}}>
                {[["Today's medications", "4 due"], ["Upcoming appointments", "2 this week"], ["Unread messages", "3 new"], ["Refill status", "1 pending"]].map(([k,v]) => (
                  <div key={k} style={{borderRadius:12,padding:"10px 10px 9px",background:L?"rgba(37,99,235,.06)":"rgba(14,165,233,.1)",border:`1px solid ${L?"rgba(59,130,246,.2)":"rgba(125,211,252,.24)"}`}}>
                    <div style={{fontSize:11,color:rT2,marginBottom:4}}>{k}</div>
                    <div style={{fontSize:14,fontWeight:700,color:L?"#1d4ed8":"#7dd3fc"}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{height:8,flex:1,borderRadius:999,background:L?"#e2e8f0":"rgba(148,163,184,.25)",overflow:"hidden"}}>
                  <div style={{height:"100%",width:"72%",background:gradBtn,borderRadius:999}}/>
                </div>
                <span style={{fontSize:12,fontWeight:700,color:rT2}}>72%</span>
              </div>
            </div>
            <p style={{margin:"12px 2px 0",fontSize:13,lineHeight:1.6,color:rT2}}>
              Explore medication management, reminders, and care communication from one clean dashboard.
            </p>
          </div>
        ) : (
        <motion.div
          ref={formCardRef}
          initial={isDedicatedAuthMobile ? { opacity: 1, y: 0 } : (isSignupPage || isSigninPage ? (reducedMotion ? false : { opacity: 0, y: 20 }) : false)}
          animate={isSignupPage || isSigninPage ? { opacity: 1, y: 0 } : undefined}
          transition={isDedicatedAuthMobile ? { duration: 0 } : { duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
          style={{
          position:"relative",zIndex:2,width:"100%",maxWidth:isSignupPage||isSigninPage?signupCardMaxW:440,
          borderRadius: isSignupPage || isSigninPage ? 14 : (isMob ? 20 : 24),
          background:isSignupPage||isSigninPage
            ? (L ? "rgba(255,255,255,.98)" : "rgba(15,23,42,.78)")
            : (L?"rgba(255,255,255,.94)":"rgba(15,23,42,.75)"),
          border:`1px solid ${isSignupPage||isSigninPage ? (L ? "#e8eef5" : "rgba(255,255,255,.1)") : (L?"#f1f5f9":"rgba(255,255,255,.1)")}`,
          backdropFilter:isSignupPage||isSigninPage ? (L ? "none" : "blur(12px)") : "blur(20px)",
          WebkitBackdropFilter:isSignupPage||isSigninPage ? (L ? "none" : "blur(12px)") : "blur(20px)",
          boxShadow:isSignupPage||isSigninPage
            ? (L
                ? "0 2px 4px rgba(15,23,42,.04), 0 14px 40px rgba(15,23,42,.08), 0 8px 22px rgba(37,99,235,.06)"
                : "0 18px 36px rgba(0,0,0,.38)")
            : (L
            ?"0 4px 6px rgba(15,23,42,.04), 0 24px 48px rgba(37,99,235,.12)"
            :"0 24px 48px rgba(0,0,0,.45)"),
          padding: isSignupPage || isSigninPage ? (isMob ? "15px 16px" : "16px 18px") : cardPad,
        }}>
          {!isSignupPage && !isSigninPage ? (
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
          ) : null}

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
                    <input className="auth-inp" style={{...INP,paddingLeft:inpPadLeftIco}} type="email" value={resetEmail||email} placeholder="you@example.com" autoComplete="email"
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
              <motion.div
                key="form"
                initial={isDedicatedAuthMobile ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDedicatedAuthMobile ? {} : { opacity: 0, y: -8 }}
                transition={{ duration: isDedicatedAuthMobile ? 0 : (isSignupPage && tab === "signup" ? 0.42 : 0.2), ease: [0.4, 0, 0.2, 1] }}
              >
                {isSignupPage ? (
                  <div
                    role="tablist"
                    aria-label="Sign up or log in"
                    style={{
                      display: "flex",
                      width: "100%",
                      maxWidth: "100%",
                      margin: "0 auto 12px",
                      padding: 3,
                      borderRadius: 999,
                      background: L ? "rgba(15,23,42,.05)" : "rgba(255,255,255,.08)",
                      border: `1px solid ${L ? "rgba(15,23,42,.08)" : "rgba(255,255,255,.12)"}`,
                      boxSizing: "border-box",
                      gap: 3,
                    }}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === "signup"}
                      onClick={() => { setTab("signup"); setErr(""); setInfo(""); }}
                      style={{
                        flex: 1,
                        border: "none",
                        borderRadius: 999,
                        padding: "6px 8px",
                        fontFamily: font,
                        fontSize: 12.5,
                        fontWeight: tab === "signup" ? 600 : 500,
                        cursor: "pointer",
                        background: tab === "signup" ? (L ? "#fff" : "rgba(255,255,255,.16)") : "transparent",
                        color: tab === "signup" ? (L ? "#0f172a" : "#f8fafc") : rT2,
                        boxShadow: tab === "signup" && L ? "0 1px 2px rgba(15,23,42,.06)" : "none",
                      }}
                    >
                      Create account
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === "login"}
                      onClick={() => { setTab("login"); setErr(""); setInfo(""); }}
                      style={{
                        flex: 1,
                        border: "none",
                        borderRadius: 999,
                        padding: "6px 8px",
                        fontFamily: font,
                        fontSize: 12.5,
                        fontWeight: tab === "login" ? 600 : 500,
                        cursor: "pointer",
                        background: tab === "login" ? (L ? "#fff" : "rgba(255,255,255,.16)") : "transparent",
                        color: tab === "login" ? (L ? "#0f172a" : "#f8fafc") : rT2,
                        boxShadow: tab === "login" && L ? "0 1px 2px rgba(15,23,42,.06)" : "none",
                      }}
                    >
                      Log in
                    </button>
                  </div>
                ) : null}

                {isSignupPage && tab==="signup" ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.06, ease: [0.4, 0, 0.2, 1] }}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",marginBottom: isMob ? 12 : 14}}
                  >
                    <div style={{
                      width:36,height:36,borderRadius:"50%",background:gradBtn,display:"flex",alignItems:"center",justifyContent:"center",
                      marginBottom:8,boxShadow:"0 4px 14px rgba(37,99,235,.22)",color:"#fff",
                    }}>
                      <MedTrackHeartLogo size={19}/>
                    </div>
                    <h2 style={{fontSize: signupHeadingPx,fontWeight:700,letterSpacing:"-.02em",margin:"0 0 4px",color:rT1,lineHeight:1.25}}>Create account</h2>
                    <p style={{fontSize: signupSubPx,color:rT2,lineHeight:1.5,margin:0,fontWeight:400}}>Start your journey to better health.</p>
                  </motion.div>
                ) : isSigninPage && step==="form" ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: isMob ? 14 : 18 }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: "50%", background: gradBtn, display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 14, boxShadow: "0 8px 22px rgba(37,99,235,.28)", color: "#fff",
                    }}>
                      <MedTrackHeartLogo size={28} />
                    </div>
                    <h2 style={{ fontSize: headingSize, fontWeight: 800, letterSpacing: "-.4px", margin: "0 0 6px", color: rT1 }}>Welcome back</h2>
                    <p style={{ fontSize: subSize, color: rT2, lineHeight: 1.6, margin: 0, fontWeight: 400 }}>Sign in to your health dashboard.</p>
                  </div>
                ) : (
                  <>
                    <h2 style={{fontSize: isSignupPage ? signupHeadingPx : headingSize,fontWeight:800,letterSpacing:"-.4px",margin:"0 0 6px",color:rT1}}>
                      {tab==="login"?"Welcome back":"Get started"}
                    </h2>
                    <p style={{fontSize: isSignupPage ? signupSubPx : subSize,color:rT2,lineHeight:1.6,margin: isSignupPage ? "0 0 16px" : "0 0 22px",fontWeight:400}}>
                      {tab==="login"?"Sign in to your health dashboard.":"Create your free account today."}
                    </p>
                  </>
                )}

                <AnimatePresence>
                  {info&&<OkBanner msg={info} onDismiss={()=>setInfo("")}/>}
                </AnimatePresence>

                <div style={{display:"flex",flexDirection:"column",gap:(isSignupPage && tab==="signup") ? 10 : 14,width:"100%"}}>
                  {tab==="signup"&&isSignupPage ? (
                    <>
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.08, ease: [0.4, 0, 0.2, 1] }}>
                        <label style={LBL_SIGNUP}>Full name</label>
                        <div style={{position:"relative"}}>
                          <User size={17} color={rT3} strokeWidth={2} style={{position:"absolute",left:inpIconOffset,top:"50%",transform:"translateY(-50%)",opacity:0.55,pointerEvents:"none"}}/>
                          <input className="auth-inp auth-inp-signup" style={{...INP_SIGNUP,paddingLeft:inpPadLeftIcoSignup}} type="text" value={name} placeholder="Enter your full name" autoComplete="name"
                            onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                        </div>
                      </motion.div>
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.12, ease: [0.4, 0, 0.2, 1] }}>
                        <label style={LBL_SIGNUP}>Email address</label>
                        <div style={{position:"relative"}}>
                          <Mail size={17} color={rT3} strokeWidth={2} style={{position:"absolute",left:inpIconOffset,top:"50%",transform:"translateY(-50%)",opacity:0.55,pointerEvents:"none"}}/>
                          <input className="auth-inp auth-inp-signup" style={{...INP_SIGNUP,paddingLeft:inpPadLeftIcoSignup}} type="email" value={email} placeholder="Enter your email address" autoComplete="email"
                            onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                        </div>
                      </motion.div>
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.16, ease: [0.4, 0, 0.2, 1] }}>
                        <label style={LBL_SIGNUP}>Password</label>
                        <div style={{position:"relative"}}>
                          <Lock size={17} color={rT3} strokeWidth={2} style={{position:"absolute",left:inpIconOffset,top:"50%",transform:"translateY(-50%)",opacity:0.55,pointerEvents:"none"}}/>
                          <input className="auth-inp auth-inp-signup" style={{...INP_SIGNUP,paddingLeft:inpPadLeftIcoSignup,paddingRight:44}} type={vis?"text":"password"} value={pw} placeholder="Create a password"
                            autoComplete="new-password"
                            onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                          <button type="button" onClick={()=>setVis(!vis)}
                            style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:rT3,padding:0,display:"flex"}}>
                            {vis?<EyeOff size={17}/>:<Eye size={17}/>}
                          </button>
                        </div>
                      </motion.div>
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}>
                        <label style={LBL_SIGNUP}>I am a</label>
                        <div style={{position:"relative"}}>
                          <Users size={17} color={rT3} strokeWidth={2} style={{position:"absolute",left:inpIconOffset,top:"50%",transform:"translateY(-50%)",opacity:0.55,pointerEvents:"none",zIndex:1}}/>
                          <select
                            className="auth-inp auth-inp-signup"
                            aria-label="Your role"
                            value={role}
                            onChange={e=>setRole(e.target.value)}
                            style={{
                              ...INP_SIGNUP,
                              paddingLeft:inpPadLeftIcoSignup,
                              paddingRight:42,
                              appearance:"none",
                              WebkitAppearance:"none",
                              MozAppearance:"none",
                              cursor:"pointer",
                            }}
                          >
                            <option value="" disabled>Select your role</option>
                            <option value="client">Patient</option>
                            <option value="doctor">Doctor</option>
                            <option value="pharmacist">Pharmacist</option>
                          </select>
                          <ChevronDown size={17} color={rT3} strokeWidth={2} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",opacity:0.55,pointerEvents:"none"}}/>
                        </div>
                      </motion.div>
                    </>
                  ) : tab==="signup" ? (
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
                            autoComplete="new-password"
                            onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                          <button type="button" onClick={()=>setVis(!vis)}
                            style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:rT3,padding:0,display:"flex"}}>
                            {vis?<EyeOff size={17}/>:<Eye size={17}/>}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {tab==="login"&&(
                    <>
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
                            autoComplete="current-password"
                            onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                          <button type="button" onClick={()=>setVis(!vis)}
                            style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:rT3,padding:0,display:"flex"}}>
                            {vis?<EyeOff size={17}/>:<Eye size={17}/>}
                          </button>
                        </div>
                      </div>
                    </>
                  )}

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

                  {isSignupPage && tab==="signup" ? (
                    <motion.button
                      type="button"
                      className="auth-btn"
                      disabled={busy||!email.trim()||!pw||!name.trim()||!role}
                      onClick={submit}
                      whileHover={busy ? undefined : {
                        y: -1,
                        background: gradBtnHover,
                        boxShadow: "0 12px 28px rgba(37,99,235,.3)",
                      }}
                      whileTap={busy ? undefined : { scale: 0.99 }}
                      transition={{
                        y: { type: "spring", stiffness: 420, damping: 28 },
                        background: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
                        boxShadow: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
                      }}
                      style={{
                        width:"100%",marginTop:2,padding:"10px 0",background:gradBtn,border:"none",borderRadius:10,color:"#fff",
                        fontFamily:font,fontSize:13.5,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                        boxShadow:"0 6px 18px rgba(37,99,235,.26)",opacity:busy?0.85:1,
                      }}
                    >
                      {busy?<Loader2 size={16} className="auth-spin"/>:<>Create account <ArrowRight size={16} strokeWidth={2.25}/></>}
                    </motion.button>
                  ) : (
                    <button type="button" className="auth-btn" disabled={busy||!email.trim()||!pw||(tab==="signup"&&!name.trim())} onClick={submit}
                      style={{
                        width:"100%",marginTop:4,padding:"15px 0",background:gradBtn,border:"none",borderRadius:14,color:"#fff",
                        fontFamily:font,fontSize:15,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                        boxShadow:"0 12px 32px rgba(37,99,235,.35)",opacity:busy?0.85:1,
                      }}>
                      {busy?<Loader2 size={17} className="auth-spin"/>:tab==="login"?(<>Sign in <ArrowRight size={18} strokeWidth={2.5}/></>):(<>Create account <ArrowRight size={18} strokeWidth={2.5}/></>)}
                    </button>
                  )}

                  {isSigninPage && step==="form" && tab==="login" ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, width: "100%" }}>
                      <div style={{ flex: 1, height: 1, background: rInpBr }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: rT3, letterSpacing: ".04em", textTransform: "lowercase", fontFamily: font }}>or</span>
                      <div style={{ flex: 1, height: 1, background: rInpBr }} />
                    </div>
                  ) : null}

                  {tab==="signup"&&(
                    <p style={{fontSize:11.5,color:rT3,textAlign:"center",margin: isSignupPage ? "6px 0 0" : 0,lineHeight:1.55}}>
                      A verification email will be sent to confirm your address.
                    </p>
                  )}

                  {isSignupPage && tab==="signup" ? (
                    <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8,width:"100%"}}>
                      <div style={{flex:1,height:1,background:rInpBr}}/>
                      <span style={{fontSize:12,fontWeight:600,color:rT3,letterSpacing:".04em",textTransform:"lowercase",fontFamily:font}}>or</span>
                      <div style={{flex:1,height:1,background:rInpBr}}/>
                    </div>
                  ) : null}

                  {isSignupPage ? (
                    tab === "login" ? (
                      <p style={{ textAlign: "center", margin: "10px 0 0", fontSize: 13, color: rT2, lineHeight: 1.6 }}>
                        Don&apos;t have an account?{" "}
                        <button
                          type="button"
                          onClick={() => { setTab("signup"); setErr(""); setInfo(""); }}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: font, fontSize: 13, fontWeight: 700, color: accent }}
                        >
                          Create account
                        </button>
                      </p>
                    ) : null
                  ) : (
                    step === "form" && tab === "login" ? (
                      <p style={{ textAlign: "center", margin: isSigninPage ? "12px 0 0" : "8px 0 0", fontSize: 14, color: rT2, lineHeight: 1.6 }}>
                        <>
                          Don&apos;t have an account?{" "}
                          <button
                            type="button"
                            onClick={isSigninPage ? () => navigate("/signup") : scrollToSignUp}
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: font, fontSize: 14, fontWeight: 700, color: accent }}
                          >
                            Sign up
                          </button>
                        </>
                      </p>
                    ) : null
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        )}
        </div>
      </div>
    </div>
    </div>
  );
}
