import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill, Calendar, BarChart3, LogOut, Moon, Sun, Menu, X, Plus, Send,
  Clock, Check, AlertCircle, Flame, ChevronDown, Eye, EyeOff,
  Loader2, TrendingUp, Bell, User, Info, ArrowRight, Mail, RefreshCw,
  CheckCircle2, Pencil, Stethoscope, HeartPulse, BellRing, ShieldCheck,
  UserCircle2, Siren, SlidersHorizontal, Sparkles, MessageSquare, Trash2,
  KeyRound, RotateCcw, Search
} from "lucide-react";
import { supabase } from "./supabase";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RoleProtectedRoute } from "./routes/RoleProtectedRoute";
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import { COLS, TIPS, PRESCRIPTION_STATUS_LABELS } from "./lib/constants";
import { to12h, to24h } from "./lib/utils";
import { addMedication, deleteMedication, loadMedications } from "./lib/medications";
import { useIsMobile } from "./hooks/useIsMobile";
import { useClock } from "./hooks/useClock";
import "./index.css";

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

function MedModal({ onClose, onSave, existing, userId }) {
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
      if (isEdit && existing?.id) {
        await supabase.from("user_medications").update({
          medication_name: med.name,
          dosage: med.dosage,
          freq: med.freq,
          reminder_time: med.time,
          color: med.color,
        }).eq("id", existing.id);
      } else if (!isEdit && userId) {
        const { data, error } = await supabase.from("user_medications").insert({
          user_id: userId,
          medication_name: med.name,
          dosage: med.dosage,
          freq: med.freq,
          reminder_time: med.time,
          color: med.color,
          active: true,
        }).select("id").single();
        if (error) throw error;
        if (data?.id) {
          med.firestoreId = data.id;
          med.id = data.id;
        }
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
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u?.id) {
          await supabase.from("chats").insert({
            user_id: u.id,
            message: msgText,
            response: reply,
          });
        }
      } catch(e) { console.warn("Chat save:", e); }

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
      const { data: { user: u } } = await supabase.auth.getUser();
      await supabase.from("feedback").insert({
        user_id: u?.id ?? null,
        user_email: userEmail || u?.email || "anonymous",
        type, body, rating,
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

  const [prescriptions, setPrescriptions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [pRes, nRes] = await Promise.all([
        supabase.from("prescriptions").select("id, status, created_at, notes").eq("patient_id", user.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("notifications").select("id, type, title, body, read_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
      ]);
      setPrescriptions(pRes.data || []);
      setNotifications(nRes.data || []);
    })();
  }, [user?.id]);

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
        {(prescriptions.length > 0 || notifications.length > 0) && (
          <motion.div className="au d4" style={{ marginTop: 16 }}>
            {prescriptions.length > 0 && (
              <div className="card" style={{ padding: 18, marginBottom: 12 }}>
                <h3 style={{ color: t1, fontSize: 14, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill size={14} color="var(--p)"/> Prescriptions
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {prescriptions.map(pr => (
                    <div key={pr.id} style={{ padding: "10px 12px", borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b0)" }}>
                      <span style={{ color: t2, fontSize: 12 }}>{new Date(pr.created_at).toLocaleDateString()}</span>
                      <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: pr.status === "ready" ? "rgba(16,185,129,.15)" : (pr.status === "filled" || pr.status === "picked_up") ? "var(--pd)" : "rgba(245,158,11,.12)", color: pr.status === "ready" ? "var(--gr)" : (pr.status === "filled" || pr.status === "picked_up") ? "var(--p)" : "var(--am)" }}>
                        {PRESCRIPTION_STATUS_LABELS[pr.status] || pr.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {notifications.length > 0 && (
              <div className="card" style={{ padding: 18, marginBottom: 12 }}>
                <h3 style={{ color: t1, fontSize: 14, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <Bell size={14} color="var(--am)"/> Notifications
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {notifications.map(n => (
                    <div key={n.id} style={{ padding: "10px 12px", borderRadius: 10, background: n.read_at ? "var(--s2)" : "rgba(37,99,235,.06)", border: "1px solid var(--b0)" }}>
                      <p style={{ color: t1, fontSize: 12, fontWeight: 600, margin: 0 }}>{n.title}</p>
                      {n.body && <p style={{ color: t3, fontSize: 11, marginTop: 4, marginBottom: 0 }}>{n.body}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

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
        const { data } = await supabase.from("profiles").select("emergency_contact").eq("id", userId).single();
        if (data?.emergency_contact) {
          setF({ name:"", relationship:"", phone:"", email:"", ...data.emergency_contact });
        }
      } catch(e) { console.error("Load emergency contact:", e); }
      finally { setLoading(false); }
    })();
  }, [userId]);

  async function save() {
    if (!userId) return;
    setBusy(true); setSaved(false);
    try {
      await supabase.from("profiles").update({
        emergency_contact: { name:f.name, relationship:f.relationship, phone:f.phone, email:f.email },
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
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
        const { data: d } = await supabase.from("profiles").select("dob,blood_type,weight,height,allergies,medical_conditions").eq("id", userId).single();
        if (d) {
          setDob(d.dob || "");
          setBloodType(d.blood_type || "");
          setWeight(d.weight || "");
          setHeight(d.height || "");
          setAllergies(d.allergies || []);
          setConditions(d.medical_conditions || []);
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
      await supabase.from("profiles").update({
        dob, blood_type: bloodType, weight, height,
        allergies,
        medical_conditions: conditions,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
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

function PrimaryCareSection({ userId, t1, t2, t3 }) {
  const [doctors, setDoctors] = useState([]);
  const [pharmacists, setPharmacists] = useState([]);
  const [primaryDoctorId, setPrimaryDoctorId] = useState("");
  const [primaryPharmacistId, setPrimaryPharmacistId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const [profRes, docsRes, pharmRes] = await Promise.all([
          supabase.from("profiles").select("primary_doctor_id, primary_pharmacist_id").eq("id", userId).single(),
          supabase.from("profiles").select("id, first_name, last_name, email").eq("role", "doctor").order("first_name"),
          supabase.from("profiles").select("id, first_name, last_name, email").eq("role", "pharmacist").order("first_name"),
        ]);
        if (profRes.data) {
          setPrimaryDoctorId(profRes.data.primary_doctor_id || "");
          setPrimaryPharmacistId(profRes.data.primary_pharmacist_id || "");
        }
        setDoctors(docsRes.data || []);
        setPharmacists(pharmRes.data || []);
      } catch (e) { console.error("Primary care load:", e); }
      finally { setLoading(false); }
    })();
  }, [userId]);

  async function save() {
    if (!userId) return;
    setSaving(true); setSaved(false);
    try {
      await supabase.from("profiles").update({
        primary_doctor_id: primaryDoctorId || null,
        primary_pharmacist_id: primaryPharmacistId || null,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { console.error("Primary care save:", e); }
    finally { setSaving(false); }
  }

  const label = (p) => [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.id?.slice(0, 8);

  if (loading) return <div style={{ padding: "16px 18px", color: t3 }}><Loader2 size={16} className="auth-spin"/> Loading…</div>;
  return (
    <div style={{ padding: "16px 18px 20px", borderTop: "1px solid var(--b0)" }}>
      <p style={{ color: t3, fontSize: 12, marginBottom: 14 }}>Assign your primary doctor and pharmacist. Prescriptions from your doctor will be sent to your primary pharmacist.</p>
      <div style={{ marginBottom: 14 }}>
        <label className="lbl" style={{ marginBottom: 6 }}>Primary doctor</label>
        <select className="inp" value={primaryDoctorId} onChange={e => setPrimaryDoctorId(e.target.value)}
          style={{ width: "100%", padding: "11px 14px", borderRadius: 10 }}>
          <option value="">Select a doctor</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{label(d)}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label className="lbl" style={{ marginBottom: 6 }}>Primary pharmacist</label>
        <select className="inp" value={primaryPharmacistId} onChange={e => setPrimaryPharmacistId(e.target.value)}
          style={{ width: "100%", padding: "11px 14px", borderRadius: 10 }}>
          <option value="">Select a pharmacist</option>
          {pharmacists.map(p => <option key={p.id} value={p.id}>{label(p)}</option>)}
        </select>
      </div>
      {saved && <OkBanner msg="Primary care saved."/>}
      <button className="btn" style={{ width: "100%", padding: 11 }} disabled={saving} onClick={save}>
        {saving ? <Loader2 size={14} className="auth-spin"/> : "Save primary care"}
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

  async function saveNotifications() {
    localStorage.setItem("mt_notif", notifOn ? "true" : "false");
    localStorage.setItem("mt_notif_email", notifEmail);
    if (user?.id) {
      await supabase.from("profiles").update({
        notifications_enabled: notifOn,
        reminder_email: notifEmail,
        updated_at: new Date().toISOString(),
      }).eq("id", user.id);
    }
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2500);
  }

  
  async function deleteAccount() {
    if (delStep === 0) { setDelStep(1); setDelErr(""); return; }

    if (delStep === 1) {
      if (!delPw.trim()) { setDelErr("Enter your password to continue."); return; }
      setDelBusy(true); setDelErr("");
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: delPw });
        if (error) throw error;
        setDelStep(2);
        setDelErr("Password verified. Click below to delete all your data and sign out. To fully remove your auth account, use Supabase Dashboard → Authentication → Users.");
      } catch(e) {
        const code = e.code || "";
        if (code === "auth/wrong-password" || code === "auth/invalid-credential" || (e.message || "").toLowerCase().includes("invalid"))
          setDelErr("Incorrect password. Please try again.");
        else setDelErr(e.message || "Could not verify. Try again.");
      } finally { setDelBusy(false); }
      return;
    }

    setDelBusy(true); setDelErr("");
    try {
      const uid = user.id;
      await supabase.from("user_medications").delete().eq("user_id", uid);
      await supabase.from("chats").delete().eq("user_id", uid);
      await supabase.from("feedback").delete().eq("user_id", uid);
      await supabase.auth.signOut();
      localStorage.clear();
      setDelErr("All your data has been deleted. You have been signed out. To remove your auth account entirely, use Supabase Dashboard → Authentication → Users.");
    } catch(e) {
      setDelErr(e.message || "Could not delete account. Try again.");
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
            {l:"End-to-end encryption",        d:"Medication data encrypted in Supabase"},
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
      content: <HealthProfile userId={user?.id} t1={t1} t2={t2} t3={t3}/>,
    },
    {
      key:"emergency",
      I: Siren, label:"Emergency Contact", sub:"Caregiver and emergency access",
      color:"rgba(245,158,11,.10)", iconColor:"var(--am)",
      content: <EmergencyContact userId={user?.id} t1={t1} t2={t2} t3={t3}/>,
    },
    {
      key:"primarycare",
      I: Stethoscope, label:"Primary care", sub:"Your primary doctor and pharmacist",
      color:"rgba(37,99,235,.12)", iconColor:"var(--p)",
      content: <PrimaryCareSection userId={user?.id} t1={t1} t2={t2} t3={t3}/>,
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
          <button onClick={()=>supabase.auth.signOut()}
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

function PrescribeModal({ patient, patientProfile, doctor, onClose, onSuccess }) {
  const [meds, setMeds] = useState([{ medication_name: "", dosage: "", frequency: "", instructions: "" }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const t1 = "var(--t1)", t3 = "var(--t3)";

  function addRow() { setMeds(m => [...m, { medication_name: "", dosage: "", frequency: "", instructions: "" }]); }
  function removeRow(i) { setMeds(m => m.length > 1 ? m.filter((_, j) => j !== i) : m); }

  async function submit(e) {
    e?.preventDefault();
    const valid = meds.filter(m => m.medication_name?.trim());
    if (!valid.length) { setErr("Add at least one medication."); return; }
    setBusy(true); setErr("");
    try {
      const pharmacistId = patientProfile?.primary_pharmacist_id || null;
      const { data: rx, error: rxErr } = await supabase.from("prescriptions").insert({
        patient_id: patient.id,
        doctor_id: doctor.id,
        pharmacist_id: pharmacistId,
        status: "pending_pharmacist",
        notes: notes.trim() || null,
      }).select("id").single();
      if (rxErr) throw rxErr;
      for (const m of valid) {
        await supabase.from("prescription_medications").insert({
          prescription_id: rx.id,
          medication_name: m.medication_name.trim(),
          dosage: m.dosage.trim() || null,
          frequency: m.frequency.trim() || null,
          instructions: m.instructions.trim() || null,
        });
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      setErr(e.message || "Could not create prescription.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="mo" onClick={e => e.stopPropagation()}
        initial={{ y: 28, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 28, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }}
        style={{ maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ color: t1, fontSize: 18, fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontWeight: 600 }}>
            New prescription — {patient?.fullName || "Patient"}
          </h2>
          <button onClick={onClose} type="button" style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--b1)", background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><X size={13}/></button>
        </div>
        {!patientProfile?.primary_pharmacist_id && (
          <p style={{ color: "var(--am)", fontSize: 12, marginBottom: 12, padding: "8px 12px", background: "rgba(245,158,11,.1)", borderRadius: 8 }}>Patient has no primary pharmacist. Prescription will be unassigned until a pharmacist claims it.</p>
        )}
        <form onSubmit={submit}>
          {meds.map((m, i) => (
            <div key={i} style={{ marginBottom: 14, padding: 12, background: "var(--s2)", borderRadius: 12, border: "1px solid var(--b0)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: t3, fontSize: 11, fontWeight: 600 }}>Medication {i + 1}</span>
                <button type="button" onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "var(--ro)", cursor: "pointer", padding: 0 }}><Trash2 size={12}/></button>
              </div>
              <input className="inp" placeholder="Medication name" value={m.medication_name} onChange={e => setMeds(ms => ms.map((x, j) => j === i ? { ...x, medication_name: e.target.value } : x))} style={{ marginBottom: 8 }}/>
              <input className="inp" placeholder="Dosage" value={m.dosage} onChange={e => setMeds(ms => ms.map((x, j) => j === i ? { ...x, dosage: e.target.value } : x))} style={{ marginBottom: 8 }}/>
              <input className="inp" placeholder="Frequency" value={m.frequency} onChange={e => setMeds(ms => ms.map((x, j) => j === i ? { ...x, frequency: e.target.value } : x))} style={{ marginBottom: 8 }}/>
              <input className="inp" placeholder="Instructions (optional)" value={m.instructions} onChange={e => setMeds(ms => ms.map((x, j) => j === i ? { ...x, instructions: e.target.value } : x))}/>
            </div>
          ))}
          <button type="button" onClick={addRow} style={{ marginBottom: 14, padding: "8px 14px", borderRadius: 9, border: "1px dashed var(--b1)", background: "transparent", color: t3, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Plus size={12}/> Add medication</button>
          <div style={{ marginBottom: 14 }}>
            <label className="lbl" style={{ marginBottom: 6 }}>Notes (optional)</label>
            <textarea className="inp" rows={2} placeholder="Prescription notes" value={notes} onChange={e => setNotes(e.target.value)}/>
          </div>
          {err && <p style={{ color: "var(--ro)", fontSize: 12, marginBottom: 12 }}>{err}</p>}
          <div style={{ display: "flex", gap: 9 }}>
            <button type="button" className="bto" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-doc" style={{ flex: 1 }} disabled={busy}>{busy ? <Loader2 size={14} className="auth-spin"/> : "Send to pharmacist"}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
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
  const [showPrescribe, setShowPrescribe] = useState(false);
  const isMob = useIsMobile();
  const t1="var(--t1)",t2="var(--t2)",t3="var(--t3)",b1="var(--b1)";

  const name = userName || user?.displayName || user?.email?.split("@")[0] || "Doctor";

  useEffect(() => {
    document.body.className = light ? "light" : "";
  }, [light]);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("id,first_name,last_name,email").eq("role", "patient");
        if (error) throw error;
        setPatients((data || []).map(p => ({
          id: p.id,
          fullName: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown",
          email: p.email || "",
        })));
      } catch(e) { console.error("Load patients:", e); }
    })();
  }, []);

  async function openPatient(pat) {
    setSelPat(pat); setLoading(true); setPatProfile(null); setPatMeds([]); setNotes([]);
    try {
      const [profRes, medsRes, notesRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", pat.id).single(),
        supabase.from("user_medications").select("*").eq("user_id", pat.id),
        supabase.from("doctor_notes").select("*").eq("doctor_id", user.id).eq("patient_id", pat.id).order("created_at", { ascending: false }),
      ]);
      setPatProfile(profRes.data || {});
      setPatMeds((medsRes.data || []).map(d => ({
        id: d.id,
        medicationName: d.medication_name,
        dosage: d.dosage,
        freq: d.freq,
        color: d.color,
        reminderTime: d.reminder_time,
      })));
      setNotes((notesRes.data || []).map(d => ({
        id: d.id,
        doctorId: d.doctor_id,
        patientId: d.patient_id,
        note: d.note,
        createdAt: d.created_at,
      })));
    } catch(e) { console.error("Load patient detail:", e); }
    finally { setLoading(false); }
  }

  async function addNote() {
    if (!note.trim() || !selPat) return;
    setNoteBusy(true);
    try {
      const { data: nd, error } = await supabase.from("doctor_notes").insert({
        doctor_id: user.id,
        patient_id: selPat.id,
        note: note.trim(),
      }).select("id,created_at").single();
      if (error) throw error;
      setNotes(n => [{ id: nd.id, doctorId: user.id, patientId: selPat.id, note: note.trim(), createdAt: nd.created_at }, ...n]);
      setNote(""); setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2500);
    } catch(e) { console.error("Add note:", e); }
    finally { setNoteBusy(false); }
  }

  const filtered = patients.filter(p =>
    !search || (p.fullName || "").toLowerCase().includes(search.toLowerCase()) || (p.email || "").toLowerCase().includes(search.toLowerCase())
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
            <button onClick={()=>supabase.auth.signOut()}
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
                      <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
                        <motion.div className="au card" style={{padding:20,display:"flex",alignItems:"center",gap:14,marginBottom:14,flex:1,minWidth:0}}>
                          <div style={{width:52,height:52,borderRadius:16,background:"var(--doc-pd)",
                                       border:"1px solid rgba(14,116,144,.25)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                            <User size={24} color={DocAC}/>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <h3 style={{color:t1,fontSize:18,fontWeight:700}}>{selPat.fullName||"Unknown"}</h3>
                            <p style={{color:t3,fontSize:13,marginTop:2}}>{selPat.email}</p>
                          </div>
                        </motion.div>
                        <button type="button" className="btn-doc" onClick={()=>setShowPrescribe(true)}
                          style={{marginBottom:14,display:"flex",alignItems:"center",gap:8,padding:"12px 20px"}}>
                          <Pill size={16}/> Prescribe
                        </button>
                      </div>

                      {}
                      <motion.div className="au d1 card" style={{padding:18}}>
                        <h4 style={{color:t1,fontSize:13,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:7}}>
                          <AlertCircle size={13} color="var(--ro)"/> Allergies
                        </h4>
                        {(patProfile?.allergies?.length || 0) > 0
                          ? <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                              {(patProfile.allergies || []).map(a => (
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
                        {(patProfile?.medical_conditions?.length || 0) > 0
                          ? <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                              {(patProfile.medical_conditions || []).map(c => (
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
      <AnimatePresence>
        {showPrescribe && selPat && (
          <PrescribeModal
            patient={selPat}
            patientProfile={patProfile}
            doctor={user}
            onClose={() => setShowPrescribe(false)}
            onSuccess={() => setShowPrescribe(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PharmacistPortal({ user, light, setLight, userName }) {
  const [page, setPage] = useState("dashboard");
  const [prescriptions, setPrescriptions] = useState([]);
  const [patientNames, setPatientNames] = useState({});
  const [search, setSearch] = useState("");
  const [selRx, setSelRx] = useState(null);
  const [rxMeds, setRxMeds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const isMob = useIsMobile();
  const t1="var(--t1)", t2="var(--t2)", t3="var(--t3)", b1="var(--b1)";
  const name = userName || user?.displayName || user?.email?.split("@")[0] || "Pharmacist";

  useEffect(() => { document.body.className = light ? "light" : ""; }, [light]);

  async function loadPrescriptions() {
    try {
      const { data: mine } = await supabase.from("prescriptions").select("id, patient_id, status, notes, created_at, pharmacist_id").eq("pharmacist_id", user.id).order("created_at", { ascending: false });
      const { data: unassigned } = await supabase.from("prescriptions").select("id, patient_id, status, notes, created_at, pharmacist_id").is("pharmacist_id", null).eq("status", "pending_pharmacist").order("created_at", { ascending: false });
      const combined = [...(mine || []), ...(unassigned || []).filter(u => !(mine || []).some(m => m.id === u.id))];
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setPrescriptions(combined);
      const ids = [...new Set(combined.map(p => p.patient_id))];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, first_name, last_name").in("id", ids);
        const map = {};
        (profs || []).forEach(p => { map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Patient"; });
        setPatientNames(map);
      }
    } catch (e) { console.error("Load prescriptions:", e); }
  }

  useEffect(() => { loadPrescriptions(); }, [user?.id]);

  async function openPrescription(rx) {
    setSelRx(rx); setLoading(true); setRxMeds([]);
    try {
      const { data } = await supabase.from("prescription_medications").select("*").eq("prescription_id", rx.id);
      setRxMeds(data || []);
    } catch (e) { console.error("Load rx medications:", e); }
    finally { setLoading(false); }
  }

  async function claimPrescription(rx) {
    setActionBusy(true);
    try {
      await supabase.from("prescriptions").update({ pharmacist_id: user.id, updated_at: new Date().toISOString() }).eq("id", rx.id);
      setSelRx(prev => prev?.id === rx.id ? { ...prev, pharmacist_id: user.id } : prev);
      loadPrescriptions();
    } catch (e) { console.error("Claim:", e); }
    finally { setActionBusy(false); }
  }

  async function updateStatus(rx, newStatus) {
    setActionBusy(true);
    try {
      await supabase.from("prescriptions").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", rx.id);
      setSelRx(prev => prev?.id === rx.id ? { ...prev, status: newStatus } : prev);
      loadPrescriptions();
    } catch (e) { console.error("Update status:", e); }
    finally { setActionBusy(false); }
  }

  const pendingCount = prescriptions.filter(p => p.status === "pending_pharmacist" || p.status === "pending_fill").length;
  const readyCount = prescriptions.filter(p => p.status === "ready" || p.status === "filled" || p.status === "picked_up").length;
  const filtered = prescriptions.filter(p => {
    const pname = (patientNames[p.patient_id] || "").toLowerCase();
    return !search || pname.includes(search.toLowerCase());
  });

  const PhAC = "var(--pha-p)";

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
            {[["dashboard","Dashboard",HeartPulse],["prescriptions","Prescriptions",Pill]].map(([id,l,I]) => (
              <div key={id} className={`nl ${page===id?"pha-on":""}`} onClick={()=>{setPage(id);setSelRx(null);}}>
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
            <button onClick={()=>supabase.auth.signOut()}
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
                <p style={{color:t3,fontSize:13,marginTop:6}}>Fulfill prescriptions and notify patients when ready.</p>
              </motion.div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:24}}>
                {[
                  {l:"Total prescriptions", v:prescriptions.length, c:PhAC, bg:"var(--pha-pd)"},
                  {l:"Pending", v:pendingCount, c:"var(--am)", bg:"rgba(217,119,6,.1)"},
                  {l:"Ready / Filled", v:readyCount, c:"var(--gr)", bg:"rgba(5,150,105,.1)"},
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
                <h3 style={{color:t1,fontSize:15,fontWeight:600,marginBottom:14}}>Recent prescriptions</h3>
                {filtered.slice(0,6).map(rx => (
                  <div key={rx.id} onClick={() => { setPage("prescriptions"); openPrescription(rx); }}
                    style={{display:"flex",alignItems:"center",gap:11,padding:"10px 0",
                            borderBottom:"1px solid var(--b0)",cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.opacity=".75"}
                    onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                    <div style={{width:34,height:34,borderRadius:10,background:"var(--pha-pd)",
                                 display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <Pill size={15} color={PhAC}/>
                    </div>
                    <div style={{flex:1}}>
                      <p style={{color:t1,fontSize:13,fontWeight:600}}>{patientNames[rx.patient_id] || "Patient"}</p>
                      <p style={{color:t3,fontSize:11}}>{PRESCRIPTION_STATUS_LABELS[rx.status] || rx.status} · {new Date(rx.created_at).toLocaleDateString()}</p>
                    </div>
                    <ArrowRight size={13} color={t3}/>
                  </div>
                ))}
                {prescriptions.length === 0 && <p style={{color:t3,fontSize:13}}>No prescriptions yet.</p>}
              </motion.div>
            </div>
          )}

          {page==="prescriptions" && (
            <div style={{maxWidth:900,margin:"0 auto",padding:"30px 22px 44px"}}>
              {!selRx ? (
                <>
                  <motion.div className="au" style={{marginBottom:22}}>
                    <h2 style={{color:t1,fontSize:24,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:600}}>Prescriptions</h2>
                    <p style={{color:t3,fontSize:13,marginTop:4}}>{prescriptions.length} prescription{prescriptions.length!==1?"s":""}</p>
                  </motion.div>
                  <div style={{position:"relative",marginBottom:16}}>
                    <Search size={14} color={t3} style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)"}}/>
                    <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
                      placeholder="Search by patient name…" style={{paddingLeft:40}}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {filtered.map(rx => (
                      <motion.div key={rx.id} className="card" onClick={() => openPrescription(rx)}
                        style={{padding:"15px 18px",display:"flex",alignItems:"center",gap:13,cursor:"pointer"}}
                        whileHover={{x:2}}>
                        <div style={{width:40,height:40,borderRadius:12,background:"var(--pha-pd)",
                                     display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <Pill size={18} color={PhAC}/>
                        </div>
                        <div style={{flex:1}}>
                          <p style={{color:t1,fontSize:14,fontWeight:600}}>{patientNames[rx.patient_id] || "Patient"}</p>
                          <p style={{color:t3,fontSize:12}}>{PRESCRIPTION_STATUS_LABELS[rx.status] || rx.status} · {new Date(rx.created_at).toLocaleDateString()}</p>
                        </div>
                        <ArrowRight size={14} color={t3}/>
                      </motion.div>
                    ))}
                    {filtered.length === 0 && <p style={{color:t3,fontSize:13,padding:"12px 0"}}>No prescriptions found.</p>}
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => setSelRx(null)}
                    style={{display:"flex",alignItems:"center",gap:7,color:PhAC,fontSize:13,fontWeight:600,
                            background:"none",border:"none",cursor:"pointer",marginBottom:22,padding:0}}>
                    <ArrowRight size={13} style={{transform:"rotate(180deg)"}}/> Back to prescriptions
                  </button>
                  {loading ? (
                    <div style={{display:"flex",alignItems:"center",gap:10,color:t3}}>
                      <Loader2 size={16} style={{animation:"spin360 .7s linear infinite"}}/> Loading…
                    </div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:14}}>
                      <motion.div className="au card" style={{padding:20,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14}}>
                        <div style={{display:"flex",alignItems:"center",gap:14}}>
                          <div style={{width:52,height:52,borderRadius:16,background:"var(--pha-pd)",
                                       border:"1px solid rgba(124,58,237,.25)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                            <User size={24} color={PhAC}/>
                          </div>
                          <div>
                            <h3 style={{color:t1,fontSize:18,fontWeight:700}}>{patientNames[selRx.patient_id] || "Patient"}</h3>
                            <p style={{color:t3,fontSize:13,marginTop:2}}>{PRESCRIPTION_STATUS_LABELS[selRx.status] || selRx.status}</p>
                          </div>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                          {!selRx.pharmacist_id && (
                            <button className="btn-pha" disabled={actionBusy} onClick={() => claimPrescription(selRx)}>
                              {actionBusy ? <Loader2 size={14} className="auth-spin"/> : "Claim prescription"}
                            </button>
                          )}
                          {selRx.pharmacist_id && selRx.status === "pending_pharmacist" && (
                            <button className="btn-pha" disabled={actionBusy} onClick={() => updateStatus(selRx, "pending_fill")}>
                              {actionBusy ? <Loader2 size={14} className="auth-spin"/> : "Mark fulfilling"}
                            </button>
                          )}
                          {(selRx.status === "pending_pharmacist" || selRx.status === "pending_fill") && (
                            <button className="btn-pha" disabled={actionBusy} onClick={() => updateStatus(selRx, "ready")}
                              style={{background:"rgba(5,150,105,.2)",color:"var(--gr)",borderColor:"var(--gr)"}}>
                              {actionBusy ? <Loader2 size={14} className="auth-spin"/> : "Mark ready for pickup"}
                            </button>
                          )}
                          {(selRx.status === "ready" || selRx.status === "filled") && (
                            <button className="btn-pha" disabled={actionBusy} onClick={() => updateStatus(selRx, "picked_up")}
                              style={{background:"rgba(16,185,129,.2)",color:"var(--gr)",borderColor:"var(--gr)"}}>
                              {actionBusy ? <Loader2 size={14} className="auth-spin"/> : "Mark as picked up"}
                            </button>
                          )}
                        </div>
                      </motion.div>
                      {selRx.notes && (
                        <div className="card" style={{padding:14}}>
                          <p style={{color:t3,fontSize:11,fontWeight:600,marginBottom:6}}>Notes</p>
                          <p style={{color:t1,fontSize:13,lineHeight:1.6}}>{selRx.notes}</p>
                        </div>
                      )}
                      <div className="card" style={{padding:18}}>
                        <h4 style={{color:t1,fontSize:13,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                          <Pill size={13} color={PhAC}/> Medications
                        </h4>
                        {rxMeds.length === 0 ? <p style={{color:t3,fontSize:12}}>No medications</p> : (
                          <div style={{display:"flex",flexDirection:"column",gap:10}}>
                            {rxMeds.map(m => (
                              <div key={m.id} style={{padding:"10px 12px",borderRadius:10,background:"var(--s2)",border:"1px solid var(--b0)"}}>
                                <p style={{color:t1,fontSize:13,fontWeight:600}}>{m.medication_name}</p>
                                <p style={{color:t3,fontSize:11,marginTop:4}}>{m.dosage && `${m.dosage} · `}{m.frequency || ""} {m.instructions ? `· ${m.instructions}` : ""}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
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

function PatientDashboardContent() {
  const { user, meds, setMeds, medsLoaded, displayName, setDisplayName } = useAuth();
  const [light, setLight] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [addOpen, setAddOpen] = useState(false);
  const [editMed, setEditMed] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [mobMenu, setMobMenu] = useState(false);
  const [showNickname, setShowNickname] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const isMob = useIsMobile();

  useEffect(() => { document.body.className = light ? "light" : ""; }, [light]);

  const saveName = (n) => { setDisplayName(n); };

  const saveMed = useCallback((m) => {
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

  const tabs = [
    ["dashboard", HeartPulse, "Dashboard"],
    ["schedule", Calendar, "Schedule"],
    ["analytics", BarChart3, "Analytics"],
    ["settings", SlidersHorizontal, "Settings"],
  ];

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
            <button onClick={()=>supabase.auth.signOut()}
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
              <button onClick={()=>supabase.auth.signOut()}
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
        {addOpen  && <MedModal onClose={()=>setAddOpen(false)} onSave={saveMed} userId={user?.id}/>}
      </AnimatePresence>
      <AnimatePresence>
        {editMed  && <MedModal existing={editMed} onClose={()=>setEditMed(null)} onSave={saveMed} userId={user?.id}/>}
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

function DoctorDashboardContent() {
  const { user, displayName } = useAuth();
  const [light, setLight] = useState(false);
  const userName = displayName || user?.email?.split("@")[0] || "";
  return <DoctorPortal user={user} light={light} setLight={setLight} userName={userName} />;
}

function PharmacistDashboardContent() {
  const { user, displayName } = useAuth();
  const [light, setLight] = useState(false);
  const userName = displayName || user?.email?.split("@")[0] || "";
  return <PharmacistPortal user={user} light={light} setLight={setLight} userName={userName} />;
}

function RootRedirect() {
  const { user, userRole, onboardingComplete } = useAuth();
  if (user === undefined) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (userRole == null) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--pd)", border: "1px solid rgba(37,99,235,.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "var(--p)", fontSize: 24 }}>⋯</span>
        </div>
        <p style={{ color: "var(--t3)", fontSize: 12, letterSpacing: ".05em" }}>Loading…</p>
      </div>
    );
  }
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />;
  if (userRole === "doctor") return <Navigate to="/doctor" replace />;
  if (userRole === "pharmacist") return <Navigate to="/pharmacist" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<ProtectedRoute requireOnboarding={false}><OnboardingPage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><RoleProtectedRoute requiredRole="client"><PatientDashboardContent /></RoleProtectedRoute></ProtectedRoute>} />
          <Route path="/doctor" element={<ProtectedRoute><RoleProtectedRoute requiredRole="doctor"><DoctorDashboardContent /></RoleProtectedRoute></ProtectedRoute>} />
          <Route path="/pharmacist" element={<ProtectedRoute><RoleProtectedRoute requiredRole="pharmacist"><PharmacistDashboardContent /></RoleProtectedRoute></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}