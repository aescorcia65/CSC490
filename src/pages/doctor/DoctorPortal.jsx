import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill, Calendar, LogOut, Moon, Sun, X, Plus, Send,
  Clock, Check, AlertCircle, Loader2, Bell, BellOff, User, ArrowRight,
  CheckCircle2, Pencil, Stethoscope, HeartPulse, MessageSquare, Trash2,
  Search, UserPlus, Volume1, Volume2, AlertTriangle, CheckCheck, FileText, Paperclip, MoreHorizontal, Video,
  PhoneOff,
  Sparkles, ChevronRight
} from "lucide-react";
import { supabase } from "../../supabase";
import { ensurePortalAudioContext, playPortalNotificationSound } from "../../lib/portalWebAudio";
import { mergeNotificationRows } from "../../lib/notificationRealtimeMerge";
import { signOutClearPresence } from "../../lib/signOutClearPresence";
import { notificationSuggestsPrescription, notificationSuggestsChat, notificationTextBlob } from "../../lib/notificationNavigation";
import { getProtocolChatDisplay, formatChatNotificationPreview } from "../../lib/chatMessageDisplay";
import { notifyRecipientNewChatMessage } from "../../lib/messageNotifications";
import { VIDEO_CALL_STARTED_PREFIX, VIDEO_VISIT_ENDED_PREFIX, VIDEO_VISIT_PORTAL_TAIL_MS, VIDEO_VISIT_LATE_JOIN_MS, VIDEO_WAITING_ROOM_EARLY_JOIN_MS, VIDEO_WAITING_CHECKIN_PREFIX, VIDEO_WAITING_DISMISSED_PREFIX, buildVideoCallUrlFromRoom, buildVideoRoomId, createVideoSessionMessageBody, createVideoSessionEndedMessageBody, createVideoWaitingDismissedMessageBody, getAppointmentVideoWindow, isVideoStyleVisitType, parseVideoApprovalMessageBody, parseVideoWaitingCheckinMessageBody, parseVideoWaitingDismissedMessageBody } from "../../lib/videoCall";
import { buildDoctorCounterPayload, buildPatientRescheduleRequestPayload, hasActiveRescheduleRequest, normalizeRescheduleRequest } from "../../lib/rescheduleRequest";
import { COLS, PRESCRIPTION_STATUS_LABELS } from "../../lib/constants";
import { to12h } from "../../lib/utils";
import { formatProfileFullName } from "../../lib/profileName";
import { useIsMobile } from "../../hooks/useIsMobile";
import { usePresenceOnlineMap } from "../../hooks/usePresenceOnlineMap";
import { doctorRequestCheckInRefill, downloadVirtualVisitCheckInPdf, doctorClearPatientVirtualVisitCheckIn } from "../../lib/virtualVisitCheckIn";
import { findVirtualAppointmentForDoctorVideoStart, findVirtualAppointmentForDoctorVideoEnd, getEffectiveVirtualVisitStatus, VS } from "../../lib/virtualVisitStatus";
import DoctorVirtualCheckInReadout from "../../components/appointments/DoctorVirtualCheckInReadout";
import ErrBanner from "../../components/common/ErrBanner";
import OkBanner from "../../components/common/OkBanner";
import NicknameModal from "../../components/modals/NicknameModal";
import PrescribeModal from "../../components/modals/PrescribeModal";
import RescheduleRequestRow from "../../components/appointments/RescheduleRequestRow";
const DOCTOR_PAGE_STORAGE_KEY="mt_doctor_last_page";
const DOCTOR_ALLOWED_PAGES=new Set(["dashboard","patients","messages","availability","virtual"]);

/** Used when doctor taps "video" from Messages — prefer an in-window virtual booking; otherwise anchor defaults so VIDEO_CALL_STARTED parses. */
function resolveDoctorPatientInviteWindowMs(allAppointments, patientId, nowMs) {
  const rows = (allAppointments || [])
    .filter((a) =>
      ["scheduled", "rescheduled"].includes(String(a?.status || "")) &&
      String(a?.status || "") !== "completed" &&
      a?.patient_id === patientId &&
      a?.date &&
      a?.time &&
      isVideoStyleVisitType(a),
    )
    .map((a) => ({ a, window: getAppointmentVideoWindow(a) }))
    .filter((r) => r.window);
  for (const { window: w } of rows) {
    const portalEnd = w.portalEndMs ?? w.windowEndMs;
    if (nowMs >= w.windowStartMs && nowMs <= portalEnd)
      return { windowStartMs: w.windowStartMs, windowEndMs: w.windowEndMs };
  }
  return {
    windowStartMs: nowMs - VIDEO_WAITING_ROOM_EARLY_JOIN_MS,
    windowEndMs: nowMs + VIDEO_VISIT_LATE_JOIN_MS,
  };
}

function getAppointmentVideoWindowLoose(appt) {
  const strict = getAppointmentVideoWindow(appt);
  if (strict) return strict;
  if (!appt?.date || !appt?.time) return null;
  const raw = String(appt.time || "").trim();
  const hhmmss = raw.length === 5 ? `${raw}:00` : raw.length >= 8 ? raw.slice(0, 8) : raw;
  if (!hhmmss) return null;
  const startMs = Date.parse(`${appt.date}T${hhmmss}`);
  if (!Number.isFinite(startMs)) return null;
  const windowEndMs = startMs + VIDEO_VISIT_LATE_JOIN_MS;
  return {
    startMs,
    windowStartMs: startMs - VIDEO_WAITING_ROOM_EARLY_JOIN_MS,
    windowEndMs,
    portalEndMs: windowEndMs + VIDEO_VISIT_PORTAL_TAIL_MS,
  };
}

function pickBestDoctorVideoStartCandidate(rows, anchorStartMs, anchorEndMs) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const anchorMidMs =
    Number.isFinite(anchorStartMs) && Number.isFinite(anchorEndMs)
      ? Math.round((anchorStartMs + anchorEndMs) / 2)
      : Date.now();
  const ranked = rows
    .map((a) => {
      const w = getAppointmentVideoWindowLoose(a);
      if (!w) return null;
      const portalEndMs = w.portalEndMs ?? w.windowEndMs;
      const inPortal = anchorMidMs >= w.windowStartMs && anchorMidMs <= portalEndMs;
      const vv = String(a?.virtual_visit_status || "").toLowerCase();
      const statusPriority =
        vv === VS.WAITING_FOR_DOCTOR || vv === VS.CHECKED_IN || vv === VS.VIDEO_STARTED
          ? 0
          : vv === VS.PENDING
            ? 1
            : 2;
      const typePriority = isVideoStyleVisitType(a) ? 0 : 1;
      const dist = Math.abs(w.startMs - anchorMidMs);
      return { a, w, inPortal, statusPriority, typePriority, dist };
    })
    .filter(Boolean)
    .sort((x, y) => {
      if (x.inPortal !== y.inPortal) return x.inPortal ? -1 : 1;
      if (x.statusPriority !== y.statusPriority) return x.statusPriority - y.statusPriority;
      if (x.typePriority !== y.typePriority) return x.typePriority - y.typePriority;
      return x.dist - y.dist;
    });
  return ranked.length ? ranked[0] : null;
}
export default function DoctorPortal({ user, light, setLight, userName, setDisplayName }) {
  const [page,setPage]=useState("dashboard");
  const [patients,setPatients]=useState([]);
  const [search,setSearch]=useState("");
  const [selPat,setSelPat]=useState(null);
  const [patProfile,setPatProfile]=useState(null);
  const [patMeds,setPatMeds]=useState([]);
  const [note,setNote]=useState("");
  const [notes,setNotes]=useState([]);
  const [editNote,setEditNote]=useState(null);
  const [noteBusy,setNoteBusy]=useState(false);
  const [noteSaved,setNoteSaved]=useState(false);
  const [loading,setLoading]=useState(false);
  const [showPrescribe,setShowPrescribe]=useState(false);
  const [deleteConfirm,setDeleteConfirm]=useState(null);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const [patRx,setPatRx]=useState([]);
  const [activeTab,setActiveTab]=useState("overview");
  const [patFlag,setPatFlag]=useState("none");
  const [vitals,setVitals]=useState({bp:"",hr:"",temp:"",weight:"",o2:"",notes:""});
  const [vitalsBusy,setVitalsBusy]=useState(false);
  const [vitalsSaved,setVitalsSaved]=useState(false);
  const [appointments,setAppointments]=useState([]);
  const [allAppointments,setAllAppointments]=useState([]);
  const [doctorVideoVisitRequests,setDoctorVideoVisitRequests]=useState([]);
  const [urgentVisitBusyId,setUrgentVisitBusyId]=useState(null);
  const [virtualCheckInPatientProfile,setVirtualCheckInPatientProfile]=useState(null);
  /** Patient id awaiting confirmation when doctor deletes saved check-in. */
  const [checkInClearAwaitingConfirmPatientId,setCheckInClearAwaitingConfirmPatientId]=useState(null);
  const [clearCheckInBusy,setClearCheckInBusy]=useState(false);
  const [refillRequestBusyPatientId,setRefillRequestBusyPatientId]=useState(null);
  const [apptForm,setApptForm]=useState({date:"",time:"",type:"Follow-up",notes:""});
  const [apptBusy,setApptBusy]=useState(false);
  const [bookingAvailability,setBookingAvailability]=useState({timezone:"America/New_York",slots:{}});
  const [availDate,setAvailDate]=useState("");
  const [availTime,setAvailTime]=useState("");
  const [availBusy,setAvailBusy]=useState(false);
  const [availMsg,setAvailMsg]=useState(null);
  const [rescheduleReqs,setRescheduleReqs]=useState([]);
  const [calView,setCalView]=useState("week");
  const [calDate,setCalDate]=useState(new Date());
  const [addPatientEmail,setAddPatientEmail]=useState("");
  const [addPatientBusy,setAddPatientBusy]=useState(false);
  const [addPatientMsg,setAddPatientMsg]=useState(null);
  const [chatContacts,setChatContacts]=useState([]);
  const [selChat,setSelChat]=useState(null);
  const [messages,setMessages]=useState([]);
  const [msgInput,setMsgInput]=useState("");
  const [msgSending,setMsgSending]=useState(false);
  const [videoApprovalBusy,setVideoApprovalBusy]=useState(false);
  const [videoStartTargetId,setVideoStartTargetId]=useState(null);
  const [videoEndBusy,setVideoEndBusy]=useState(false);
  const [videoNowMs,setVideoNowMs]=useState(()=>Date.now());
  const [videoEventRows,setVideoEventRows]=useState([]);
  const [unreadCount,setUnreadCount]=useState(0);
  const [unreadPerContact,setUnreadPerContact]=useState({});
  const [msgMode,setMsgMode]=useState("pharmacy");
  const [patientChatContacts,setPatientChatContacts]=useState([]);
  const [unreadPatientCount,setUnreadPatientCount]=useState(0);
  const [unreadPerPatient,setUnreadPerPatient]=useState({});
  const onlineUsers = usePresenceOnlineMap(user?.id);
  const [chatSearchEmail,setChatSearchEmail]=useState("");
  const [chatSearchBusy,setChatSearchBusy]=useState(false);
  const [chatSearchMsg,setChatSearchMsg]=useState(null);
  const [mobMenu,setMobMenu]=useState(false);
  const [showNickname,setShowNickname]=useState(false);
  const [showPatPicker,setShowPatPicker]=useState(false);
  const [patPickerSearch,setPatPickerSearch]=useState("");
  const [chatPatient,setChatPatient]=useState(null);
  const [chatPatientExpanded,setChatPatientExpanded]=useState(false);
  const [showSendToPharmacy,setShowSendToPharmacy]=useState(false);
  const [sendToPharmacyBusy,setSendToPharmacyBusy]=useState(false);
  const [sendToPharmacyDone,setSendToPharmacyDone]=useState(false);
  const [selRxChat,setSelRxChat]=useState(null);
  const [docNotifs,setDocNotifs]=useState([]);
  const [showNotifPanel,setShowNotifPanel]=useState(false);
  const unreadNotifCount=docNotifs.filter(n=>!n.read_at).length;
  const pageRestoreDoneRef=useRef(false);
  const [showDocAI,setShowDocAI]=useState(false);
  const [aiMessages,setAiMessages]=useState([]);
  const [aiInput,setAiInput]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const aiEndRef=useRef(null);
  const [rxMessages,setRxMessages]=useState([]);
  const [rxMsgInput,setRxMsgInput]=useState("");
  const [rxMsgSending,setRxMsgSending]=useState(false);
  const [dashModal,setDashModal]=useState(null); // {title, items, renderItem}
  const [soundEnabled,setSoundEnabled]=useState(()=>localStorage.getItem("mt_sound_on")!=="false");
  const [soundType,setSoundType]=useState(()=>{
    const saved=localStorage.getItem("mt_sound_type");
    const valid=["standard","urgent","subtle","chime","pulse","ding","low","tri"];
    return valid.includes(saved)?saved:"standard";
  });
  const [soundVolume,setSoundVolume]=useState(()=>{
    const v=parseFloat(localStorage.getItem("mt_sound_vol"));
    return isNaN(v)?0.7:Math.min(1,Math.max(0,v));
  });
  const [showSoundSettings,setShowSoundSettings]=useState(false);
  const soundEnabledRef=useRef(soundEnabled);
  const soundTypeRef=useRef(soundType);
  const soundVolumeRef=useRef(soundVolume);
  useEffect(()=>{ soundEnabledRef.current=soundEnabled; },[soundEnabled]);
  useEffect(()=>{ soundTypeRef.current=soundType; },[soundType]);
  useEffect(()=>{ soundVolumeRef.current=soundVolume; },[soundVolume]);
  const msgEndRef=useRef(null);
  const msgListRef=useRef(null);
  const atBottomRef=useRef(true);
  const loadMessagesSeqRef=useRef(0);
  const typingTimeoutRef=useRef(null);
  const typingBroadcastRef=useRef(null);
  const announcedInboundMsgAlertIdsRef=useRef(new Set());
  const announcedNotifAlertIdsRef=useRef(new Set());
  const selPatRef=useRef(selPat);
  const patientIdsForRealtimeRef=useRef(new Set());
  const [peerTyping,setPeerTyping]=useState(false);
  useEffect(()=>{ patientIdsForRealtimeRef.current=new Set((patients||[]).map(p=>p.id)); },[patients]);
  useEffect(()=>{
    if(!user?.id) return;
    const ch=supabase.channel(`doc-patient-profiles-${user.id}`)
      .on("postgres_changes",{ event:"UPDATE", schema:"public", table:"profiles" },(payload)=>{
        const id=payload.new?.id;
        if(!id||!patientIdsForRealtimeRef.current.has(id)) return;
        const full=formatProfileFullName(payload.new);
        if(!full) return;
        setPatients(prev=>prev.map(p=>p.id===id?{...p,fullName:full}:p));
        setPatientChatContacts(prev=>prev.map(c=>c.id===id?{...c,name:full}:c));
        setSelPat((sp)=>(sp&&sp.id===id)?{...sp,fullName:full}:sp);
        setPatProfile((prof)=>(prof&&prof.id===id)?{...prof,first_name:payload.new.first_name,last_name:payload.new.last_name,pre_visit_intake:Object.prototype.hasOwnProperty.call(payload.new||{},"pre_visit_intake")?payload.new.pre_visit_intake:prof.pre_visit_intake,allergies:Object.prototype.hasOwnProperty.call(payload.new||{},"allergies")?payload.new.allergies:prof.allergies,medical_conditions:Object.prototype.hasOwnProperty.call(payload.new||{},"medical_conditions")?payload.new.medical_conditions:prof.medical_conditions}:prof);
      })
      .subscribe();
    return ()=>{ void supabase.removeChannel(ch); };
  },[user?.id]);

  useEffect(()=>{
    const unlock=()=>{ void ensurePortalAudioContext(); };
    window.addEventListener("pointerdown",unlock,{passive:true});
    window.addEventListener("touchstart",unlock,{passive:true});
    window.addEventListener("keydown",unlock);
    return ()=>{
      window.removeEventListener("pointerdown",unlock);
      window.removeEventListener("touchstart",unlock);
      window.removeEventListener("keydown",unlock);
    };
  },[]);

  function sortMsgs(arr){ return [...arr].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)); }

  const doScroll=useCallback(()=>{
    if(msgListRef.current) msgListRef.current.scrollTop=msgListRef.current.scrollHeight;
    requestAnimationFrame(()=>{
      if(msgListRef.current) msgListRef.current.scrollTop=msgListRef.current.scrollHeight;
    });
  },[]);
  const isMob=useIsMobile();
  useEffect(()=>{
    const timer=setInterval(()=>setVideoNowMs(Date.now()),15000);
    return ()=>clearInterval(timer);
  },[]);
  useEffect(()=>{
    if(!user?.id) return;
    let cancelled=false;
    const loadVideoEvents=async ()=>{
      const sinceIso=new Date(Date.now()-(12*60*60*1000)).toISOString();
      const [inRes,startedRes,dismissRes,endedRes]=await Promise.all([
        supabase
          .from("patient_messages")
          .select("id,sender_id,recipient_id,body,created_at")
          .eq("recipient_id",user.id)
          .like("body",`${VIDEO_WAITING_CHECKIN_PREFIX}|%`)
          .gte("created_at",sinceIso)
          .order("created_at",{ascending:false})
          .limit(250),
        supabase
          .from("patient_messages")
          .select("id,sender_id,recipient_id,body,created_at")
          .eq("sender_id",user.id)
          .like("body",`${VIDEO_CALL_STARTED_PREFIX}|%`)
          .gte("created_at",sinceIso)
          .order("created_at",{ascending:false})
          .limit(250),
        supabase
          .from("patient_messages")
          .select("id,sender_id,recipient_id,body,created_at")
          .eq("sender_id",user.id)
          .like("body",`${VIDEO_WAITING_DISMISSED_PREFIX}|%`)
          .gte("created_at",sinceIso)
          .order("created_at",{ascending:false})
          .limit(250),
        supabase
          .from("patient_messages")
          .select("id,sender_id,recipient_id,body,created_at")
          .eq("sender_id",user.id)
          .like("body",`${VIDEO_VISIT_ENDED_PREFIX}|%`)
          .gte("created_at",sinceIso)
          .order("created_at",{ascending:false})
          .limit(250),
      ]);
      if(cancelled) return;
      const rows=[...(inRes.data||[]),...(startedRes.data||[]),...(dismissRes.data||[]),...(endedRes.data||[])];
      const seen=new Set();
      const merged=rows.filter((r)=>{if(seen.has(r.id)) return false; seen.add(r.id); return true;});
      setVideoEventRows(merged);
    };
    loadVideoEvents();
    const poll=setInterval(loadVideoEvents,8000);
    const ch=supabase
      .channel(`doc-video-${user.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"patient_messages"},(payload)=>{
        const m=payload.new;
        if(!m) return;
        if(m.recipient_id===user.id||m.sender_id===user.id){
          const b=String(m.body||"");
          if(
            b.startsWith(`${VIDEO_WAITING_CHECKIN_PREFIX}|`) ||
            b.startsWith(`${VIDEO_CALL_STARTED_PREFIX}|`) ||
            b.startsWith(`${VIDEO_VISIT_ENDED_PREFIX}|`) ||
            b.startsWith(`${VIDEO_WAITING_DISMISSED_PREFIX}|`)
          ){
            loadVideoEvents();
          }
        }
      })
      .subscribe();
    return ()=>{
      cancelled=true;
      clearInterval(poll);
      supabase.removeChannel(ch);
    };
  },[user?.id]);

  useEffect(()=>{
    if(!user?.id) return;
    if(pageRestoreDoneRef.current) return;
    const saved=localStorage.getItem(`${DOCTOR_PAGE_STORAGE_KEY}_${user.id}`);
    if(saved&&DOCTOR_ALLOWED_PAGES.has(saved)) setPage(saved);
    pageRestoreDoneRef.current=true;
  },[user?.id]);

  useEffect(()=>{
    if(!user?.id||!pageRestoreDoneRef.current||!DOCTOR_ALLOWED_PAGES.has(page)) return;
    localStorage.setItem(`${DOCTOR_PAGE_STORAGE_KEY}_${user.id}`,page);
  },[page,user?.id]);
  const t1="var(--t1)",t2="var(--t2)",t3="var(--t3)",b1="var(--b1)";
  const DocAC="var(--doc-p)";
  const [localName,setLocalName]=useState(userName);
  useEffect(()=>{ if(userName) setLocalName(userName); },[userName]);
  const name=localName||userName||user?.displayName||user?.email?.split("@")[0]||"Doctor";
  const totalChatUnread=unreadCount+unreadPatientCount;
  const saveName=(n)=>{ setLocalName(n); if(setDisplayName) setDisplayName(n); };
  async function handleSignOut(){
    await signOutClearPresence(user?.id);
  }

  const SOUND_PROFILES={
    standard:{label:"Standard",desc:"Clear double-tone",tones:[[880,"sine",0,0.06],[1320,"sine",0.07,0.18]]},
    urgent:{label:"Urgent",desc:"Triple alert — high priority",tones:[[660,"square",0,0.06],[880,"square",0.07,0.06],[1100,"square",0.14,0.12]]},
    subtle:{label:"Subtle",desc:"Soft single tone",tones:[[528,"sine",0,0.22]]},
    chime:{label:"Chime",desc:"Ascending 4-note chime",tones:[[523,"sine",0,0.12],[659,"sine",0.12,0.12],[784,"sine",0.24,0.2],[1047,"sine",0.36,0.16]]},
    pulse:{label:"Pulse",desc:"Quick double pulse",tones:[[700,"sine",0,0.05],[700,"sine",0.12,0.05]]},
    ding:{label:"Ding",desc:"Single bright ding",tones:[[1047,"sine",0,0.2]]},
    low:{label:"Low",desc:"Deep low tone",tones:[[220,"sine",0,0.25],[330,"sine",0.05,0.18]]},
    tri:{label:"Tri-tone",desc:"Classic tri-tone",tones:[[523,"sine",0,0.1],[659,"sine",0.11,0.1],[523,"sine",0.22,0.14]]},
  };

  function playNotifSound(type,vol){
    const gain=vol!==undefined?vol:soundVolume;
    const profile=SOUND_PROFILES[type]||SOUND_PROFILES.standard;
    void playPortalNotificationSound(profile.tones,gain);
  }

  function toggleSound(val){setSoundEnabled(val);localStorage.setItem("mt_sound_on",String(val));}
  function changeSoundType(val){setSoundType(val);localStorage.setItem("mt_sound_type",val);void playNotifSound(val,soundVolume);}
  function changeSoundVolume(val){setSoundVolume(val);localStorage.setItem("mt_sound_vol",String(val));void playNotifSound(soundType,val);}
  function sortContacts(list){
    return [...list].sort((a,b)=>(b.lastMessageAt||"").localeCompare(a.lastMessageAt||""));
  }
  function normTimeValue(v){
    const s=String(v||"").trim();
    if(!s) return "";
    if(s.length===5&&s[2]===":") return `${s}:00`;
    return s.length>=8?s.slice(0,8):s;
  }
  function parseDocBookingAvailability(raw){
    if(!raw||typeof raw!=="object") return {timezone:"America/New_York",slots:{}};
    const slots=(raw.slots&&typeof raw.slots==="object")?raw.slots:{};
    return {
      timezone:typeof raw.timezone==="string"&&raw.timezone?raw.timezone:"America/New_York",
      slots:Object.entries(slots).reduce((acc,[date,val])=>{
        if(!Array.isArray(val)) return acc;
        const clean=[...new Set(val.map(normTimeValue).filter(Boolean))].sort();
        if(clean.length) acc[date]=clean;
        return acc;
      },{}),
    };
  }
  const availabilityDateKeys=useMemo(()=>Object.keys(bookingAvailability.slots||{}).sort(),[bookingAvailability.slots]);
  const availabilitySlotCount=useMemo(()=>availabilityDateKeys.reduce((sum,date)=>sum+(bookingAvailability.slots?.[date]?.length||0),0),[availabilityDateKeys,bookingAvailability.slots]);
  useEffect(()=>{
    if(!user?.id) return;
    (async()=>{
      try{
        const[dpData,apptData,pharmData]=await Promise.all([
          supabase.from("doctor_patients").select("patient_id, profiles!doctor_patients_patient_id_fkey(id,first_name,last_name,email,dob,blood_type,allergies,medical_conditions)").eq("doctor_id",user.id),
          supabase.from("appointments").select("id,patient_id,date,time,type,status,notes,reschedule_request,virtual_visit_status").eq("doctor_id",user.id).neq("status","cancelled").order("date",{ascending:true}),
          supabase.from("profiles").select("id,first_name,last_name,email,pharmacy_name").eq("role","pharmacist"),
        ]);
        const pRows=(dpData.data||[]).map(r=>r.profiles).filter(Boolean);
        setPatients(pRows.map(p=>({id:p.id,fullName:[p.first_name,p.last_name].filter(Boolean).join(" ")||"Unknown",email:p.email||"",dob:p.dob||null,bloodType:p.blood_type||null,allergies:p.allergies||[],conditions:p.medical_conditions||[]})));
        const patientIds=pRows.map(p=>p.id);
        let unreadMap={};
        let unreadPt=0;
        const lastByPatient={};
        if(patientIds.length){
          const patientIdSet=new Set(patientIds);
          const{data:pmAll}=await supabase.from("patient_messages")
            .select("sender_id,recipient_id,created_at,read_at")
            .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
            .order("created_at",{ascending:false})
            .limit(800);
          const seenLatest={};
          (pmAll||[]).forEach(m=>{
            const other=m.sender_id===user.id?m.recipient_id:m.sender_id;
            if(!patientIdSet.has(other)) return;
            if(!seenLatest[other]){ seenLatest[other]=true; lastByPatient[other]=m.created_at; }
            if(m.recipient_id===user.id&&!m.read_at){
              unreadPt+=1;
              unreadMap[other]=(unreadMap[other]||0)+1;
            }
          });
        }
        setPatientChatContacts(sortContacts(pRows.map(p=>({
          id:p.id,
          name:[p.first_name,p.last_name].filter(Boolean).join(" ")||"Unknown",
          email:p.email||"",
          lastMessageAt:lastByPatient[p.id]||null,
        }))));
        setUnreadPerPatient(unreadMap);
        setUnreadPatientCount(unreadPt);
        setAllAppointments(apptData.data||[]);
        const { data: docProfileData, error: docProfileErr } = await supabase.from("profiles").select("booking_availability").eq("id",user.id).single();
        if(docProfileErr){
          const msg=String(docProfileErr.message||"").toLowerCase();
          if(msg.includes("booking_availability")){
            setBookingAvailability(parseDocBookingAvailability(null));
            setAvailMsg({type:"err",text:"Database is missing booking availability column. Run migration 009, then refresh."});
          }else{
            throw docProfileErr;
          }
        }else{
          setBookingAvailability(parseDocBookingAvailability(docProfileData?.booking_availability));
        }
        const pharmacists=(pharmData.data||[]).map(p=>({id:p.id,name:[p.first_name,p.last_name].filter(Boolean).join(" ")||p.email||"Pharmacist",pharmacy:p.pharmacy_name||"Pharmacy",email:p.email||"",lastMessageAt:null}));
        if(pharmacists.length>0){
          const pharmIds=pharmacists.map(p=>p.id);
          const{data:latestMsgs}=await supabase.from("chat_messages")
            .select("pharmacist_id,created_at")
            .eq("doctor_id",user.id)
            .in("pharmacist_id",pharmIds)
            .order("created_at",{ascending:false});
          if(latestMsgs&&latestMsgs.length>0){
            const latestByPharm={};
            latestMsgs.forEach(m=>{if(!latestByPharm[m.pharmacist_id])latestByPharm[m.pharmacist_id]=m.created_at;});
            pharmacists.forEach(p=>{if(latestByPharm[p.id])p.lastMessageAt=latestByPharm[p.id];});
            pharmacists.sort((a,b)=>(b.lastMessageAt||"").localeCompare(a.lastMessageAt||""));
          }
          setChatContacts(pharmacists);
          const{data:unread}=await supabase.from("chat_messages").select("id").eq("doctor_id",user.id).in("sender_id",pharmIds).is("read_at",null);
          setUnreadCount((unread||[]).length);
        } else {
          setChatContacts(pharmacists);
        }
      }catch(e){console.error("Load:",e);}
    })();
  },[user?.id]);
  useEffect(()=>{
    if(!user?.id){ setDoctorVideoVisitRequests([]); return; }
    const reloadRequests=async()=>{
      const { data } = await supabase.from("video_visit_requests").select("*").eq("doctor_id",user.id).order("created_at",{ascending:false});
      setDoctorVideoVisitRequests(data||[]);
    };
    void reloadRequests();
    const vvrCh = supabase
      .channel(`doc-video-visit-requests-${user.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"video_visit_requests",filter:`doctor_id=eq.${user.id}`},(payload)=>{
        if(payload.eventType==="INSERT"&&payload.new?.id){
          const row=payload.new;
          setDoctorVideoVisitRequests((prev)=>{
            if(prev.some(r=>r.id===row.id)) return prev;
            return [row,...prev].sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
          });
          return;
        }
        if(payload.eventType==="UPDATE"&&payload.new?.id){
          const row=payload.new;
          setDoctorVideoVisitRequests((prev)=>{
            const ix=prev.findIndex(r=>r.id===row.id);
            const merged=ix>=0 ? prev.map(r=>r.id===row.id?{...r,...row}:r) : [row,...prev];
            return merged.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
          });
          return;
        }
        if(payload.eventType==="DELETE"&&payload.old?.id){
          const delId=payload.old.id;
          setDoctorVideoVisitRequests((prev)=>prev.filter(r=>r.id!==delId));
          return;
        }
        void reloadRequests();
      })
      .subscribe();
    return ()=>{ supabase.removeChannel(vvrCh); };
  },[user?.id]);
  useEffect(()=>{
    if(!user?.id) return;
    const channels=[];
    channels.push(
      supabase.channel(`doc-appt-${user.id}`)
        .on("postgres_changes",{event:"*",schema:"public",table:"appointments",filter:`doctor_id=eq.${user.id}`},(payload)=>{
          if(payload.eventType==="INSERT"){
            if(payload.new.status!=="cancelled"){
              setAllAppointments(prev=>prev.some(a=>a.id===payload.new.id)?prev:[...prev,payload.new]);
              setAppointments(prev=>{
                const openPatientId=selPatRef.current?.id;
                if(!openPatientId||payload.new.patient_id!==openPatientId) return prev;
                return prev.some(a=>a.id===payload.new.id)?prev:[...prev,payload.new];
              });
            }
          } else if(payload.eventType==="UPDATE"){
            const updater=a=>a.id===payload.new.id?{...a,...payload.new}:a;
            setAllAppointments(prev=>{
              if(payload.new.status==="cancelled") return prev.filter(a=>a.id!==payload.new.id);
              const hasRow=prev.some(a=>a.id===payload.new.id);
              return hasRow?prev.map(updater):[...prev,payload.new];
            });
            setAppointments(prev=>{
              const openPatientId=selPatRef.current?.id;
              const hasRow=prev.some(a=>a.id===payload.new.id);
              if(!hasRow&&(!openPatientId||payload.new.patient_id!==openPatientId)) return prev;
              if(payload.new.status==="cancelled") return prev.filter(a=>a.id!==payload.new.id);
              return hasRow?prev.map(updater):[...prev,payload.new];
            });
            if(payload.new.reschedule_request&&hasActiveRescheduleRequest(payload.new)){
              setRescheduleReqs(prev=>prev.some(r=>r.id===payload.new.id)?prev.map(r=>r.id===payload.new.id?{...r,...payload.new}:r):[...prev,payload.new]);
            } else {
              setRescheduleReqs(prev=>prev.filter(r=>r.id!==payload.new.id));
            }
          } else if(payload.eventType==="DELETE"){
            setAllAppointments(prev=>prev.filter(a=>a.id!==payload.old.id));
            setAppointments(prev=>{
              const openPatientId=selPatRef.current?.id;
              if(!openPatientId) return prev;
              return prev.filter(a=>a.id!==payload.old.id);
            });
          }
        }).subscribe()
    );
    channels.push(
      supabase.channel(`doc-pts-${user.id}`)
        .on("postgres_changes",{event:"INSERT",schema:"public",table:"doctor_patients",filter:`doctor_id=eq.${user.id}`},(payload)=>{
          supabase.from("profiles").select("id,first_name,last_name,email,dob,blood_type,allergies,medical_conditions")
            .eq("id",payload.new.patient_id).single()
            .then(({data})=>{
              if(!data) return;
              const np={id:data.id,fullName:[data.first_name,data.last_name].filter(Boolean).join(" ")||"Unknown",email:data.email||"",dob:data.dob||null,bloodType:data.blood_type||null,allergies:data.allergies||[],conditions:data.medical_conditions||[]};
              setPatients(prev=>prev.some(p=>p.id===np.id)?prev:[...prev,np]);
              const pc={id:data.id,name:np.fullName,email:np.email||"",lastMessageAt:null};
              setPatientChatContacts(prev=>prev.some(c=>c.id===pc.id)?prev:sortContacts([...prev,pc]));
            });
        }).subscribe()
    );
    channels.push(
      supabase.channel(`doc-rx-${user.id}`)
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:"prescriptions",filter:`doctor_id=eq.${user.id}`},(payload)=>{
          setPatRx(prev=>prev.map(rx=>rx.id===payload.new.id?{...rx,...payload.new}:rx));
        }).subscribe()
    );
    return ()=>{ channels.forEach(c=>supabase.removeChannel(c)); };
  },[user?.id]);
  const selChatRef=useRef(selChat);
  const msgModeRef=useRef(msgMode);
  const chatContactsRef=useRef(chatContacts);
  const patientChatContactsRef=useRef(patientChatContacts);
  useEffect(()=>{ selPatRef.current=selPat; },[selPat]);
  useEffect(()=>{ selChatRef.current=selChat; },[selChat]);
  useEffect(()=>{ msgModeRef.current=msgMode; },[msgMode]);
  useEffect(()=>{ chatContactsRef.current=chatContacts; },[chatContacts]);
  useEffect(()=>{ patientChatContactsRef.current=patientChatContacts; },[patientChatContacts]);
  useEffect(()=>{ setChatSearchEmail(""); setChatSearchMsg(null); },[msgMode]);
  useEffect(()=>{
    if(msgMode==="patients"){
      setChatPatient(null);
      setShowPatPicker(false);
      setChatPatientExpanded(false);
    }
  },[msgMode]);
  useEffect(()=>{
    if(!selChat?.id) return;
    const inPat=patientChatContacts.some(c=>c.id===selChat.id);
    const inPh=chatContacts.some(c=>c.id===selChat.id);
    if(inPat&&!inPh) setMsgMode("patients");
    else if(inPh&&!inPat) setMsgMode("pharmacy");
  },[selChat?.id,patientChatContacts,chatContacts]);
  useEffect(()=>{
    if(page!=="messages") return;
    setSelChat(prev=>{
      if(msgMode==="pharmacy"){
        if(!chatContacts.length) return null;
        if(prev&&chatContacts.some(c=>c.id===prev.id)) return chatContacts.find(c=>c.id===prev.id);
        return null;
      }
      if(!patientChatContacts.length) return null;
      if(prev&&patientChatContacts.some(c=>c.id===prev.id)) return patientChatContacts.find(c=>c.id===prev.id);
      return null;
    });
  },[msgMode,page,chatContacts,patientChatContacts]);
  useEffect(()=>{
    if(msgMode!=="pharmacy"||!selChat) return;
    setChatContacts(prev=>{
      const updated=prev.find(c=>c.id===selChat.id);
      if(updated&&updated.lastMessageAt!==selChat.lastMessageAt){
        setSelChat(updated);
      }
      return prev;
    });
  },[chatContacts,msgMode,selChat?.id,selChat?.lastMessageAt]);
  useEffect(()=>{
    if(msgMode!=="patients"||!selChat) return;
    setPatientChatContacts(prev=>{
      const updated=prev.find(c=>c.id===selChat.id);
      if(updated&&updated.lastMessageAt!==selChat.lastMessageAt){
        setSelChat(updated);
      }
      return prev;
    });
  },[patientChatContacts,msgMode,selChat?.id,selChat?.lastMessageAt]);
  useEffect(()=>{
    if(!selChat||!user?.id)return;
    atBottomRef.current=true;
    loadMessages(selChat.id);
  },[selChat?.id]);

  useLayoutEffect(()=>{
    if(atBottomRef.current) doScroll();
  },[messages,peerTyping,doScroll]);

  useEffect(()=>{
    if(!selChat) return;
    atBottomRef.current=true;
    const t1=setTimeout(doScroll,50);
    const t2=setTimeout(doScroll,200);
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  },[selChat?.id,doScroll]);

  function handleMsgScroll(){
    const el=msgListRef.current;
    if(!el) return;
    atBottomRef.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;
  }
  useEffect(()=>{
    if(page!=="messages"||!selChat||!user?.id) return;
    const interval=setInterval(()=>{
      const chat=selChatRef.current;
      if(!chat) return;
      let pollPatient=patientChatContactsRef.current.some(c=>c.id===chat.id);
      if(!pollPatient&&!chatContactsRef.current.some(c=>c.id===chat.id)){
        pollPatient=msgModeRef.current==="patients";
      } else if(chatContactsRef.current.some(c=>c.id===chat.id)&&!patientChatContactsRef.current.some(c=>c.id===chat.id)){
        pollPatient=false;
      }
      if(pollPatient){
        const q=`and(sender_id.eq.${user.id},recipient_id.eq.${chat.id}),and(sender_id.eq.${chat.id},recipient_id.eq.${user.id})`;
        supabase.from("patient_messages").select("*").or(q).order("created_at",{ascending:true}).limit(200)
          .then(({data})=>{
            if(!data) return;
            if(selChatRef.current?.id!==chat.id) return;
            setMessages(prev=>{
              const realPrev=prev.filter(m=>!String(m.id).startsWith("temp-"));
              const lastPrevId=realPrev[realPrev.length-1]?.id;
              const lastNewId=data[data.length-1]?.id;
              if(lastPrevId===lastNewId&&realPrev.length===data.length) return prev;
              if(lastPrevId!==lastNewId&&data.length>0){
                const ts=data[data.length-1].created_at;
                setPatientChatContacts(prev=>sortContacts(prev.map(c=>c.id===chat.id?{...c,lastMessageAt:ts}:c)));
              }
              return sortMsgs(data);
            });
          });
      } else {
        supabase.from("chat_messages").select("*")
          .eq("doctor_id",user.id).eq("pharmacist_id",chat.id)
          .order("created_at",{ascending:true})
          .then(({data})=>{
            if(!data) return;
            if(selChatRef.current?.id!==chat.id) return;
            setMessages(prev=>{
              const realPrev=prev.filter(m=>!String(m.id).startsWith("temp-"));
              const lastPrevId=realPrev[realPrev.length-1]?.id;
              const lastNewId=data[data.length-1]?.id;
              if(lastPrevId===lastNewId&&realPrev.length===data.length) return prev;
              if(lastPrevId!==lastNewId&&data.length>0){
                const ts=data[data.length-1].created_at;
                setChatContacts(prev=>sortContacts(prev.map(c=>c.id===chat.id?{...c,lastMessageAt:ts}:c)));
              }
              return sortMsgs(data);
            });
          });
      }
    },2000);
    return ()=>clearInterval(interval);
  },[page,selChat?.id,user?.id]);
  const [rtStatus,setRtStatus]=useState("connecting");
  useEffect(()=>{
    if(!user?.id) return;
    let channel;
    function subscribe(){
      channel=supabase
        .channel(`doctor-msgs-${user.id}`)
        .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_messages",filter:`doctor_id=eq.${user.id}`},
          (payload)=>{
            const msg=payload.new;
            if(msg.sender_id===user.id) return;
            if(soundEnabledRef.current) playNotifSound(soundTypeRef.current,soundVolumeRef.current);
            if(typeof window!=="undefined"){
              const key=String(msg.id||"");
              if(key&&!announcedInboundMsgAlertIdsRef.current.has(key)){
                announcedInboundMsgAlertIdsRef.current.add(key);
                const senderName=chatContactsRef.current.find(c=>String(c.id)===String(msg.pharmacist_id))?.name||"Pharmacist";
                try{ window.alert(`${senderName}: ${formatChatNotificationPreview(msg.body||"")||"sent you a message"}`); }catch{}
              }
            }
            const currentChat=selChatRef.current;
            setChatContacts(prev=>[...prev].map(c=>c.id===msg.pharmacist_id?{...c,lastMessageAt:msg.created_at}:c).sort((a,b)=>(b.lastMessageAt||"").localeCompare(a.lastMessageAt||"")));
            if(currentChat&&msg.pharmacist_id===currentChat.id){
              setMessages(prev=>{
                if(prev.some(m=>m.id===msg.id)) return prev;
                return sortMsgs([...prev,msg]);
              });
              supabase.from("chat_messages").update({read_at:new Date().toISOString()}).eq("id",msg.id).then(()=>{});
            } else {
              setUnreadCount(prev=>prev+1);
              setUnreadPerContact(prev=>({...prev,[msg.pharmacist_id]:(prev[msg.pharmacist_id]||0)+1}));
              setChatContacts(prev=>{
                if(prev.some(c=>c.id===msg.pharmacist_id)) return prev;
                supabase.from("profiles").select("id,first_name,last_name,email,pharmacy_name")
                  .eq("id",msg.pharmacist_id).single()
                  .then(({data})=>{
                    if(data) setChatContacts(p=>[{
                      id:data.id,
                      name:[data.first_name,data.last_name].filter(Boolean).join(" ")||data.email||"Pharmacist",
                      pharmacy:data.pharmacy_name||"Pharmacy",
                      email:data.email||"",
                      lastMessageAt:msg.created_at,
                    },...p.filter(c=>c.id!==data.id)]);
                  });
                return prev;
              });
            }
          }
        )
        .subscribe((status,err)=>{
          if(status==="SUBSCRIBED"){ setRtStatus("connected"); }
          else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
            setRtStatus("error");
            setTimeout(()=>{ supabase.removeChannel(channel); subscribe(); },3000);
          } else if(status==="CLOSED"){ setRtStatus("connecting"); }
        });
    }
    subscribe();
    return ()=>{ if(channel) supabase.removeChannel(channel); };
  },[user?.id]);
  useEffect(()=>{
    if(!user?.id) return;
    function handlePatientThreadInsert(payload){
      const msg=payload.new;
      if(!msg) return;
      const other=msg.sender_id===user.id?msg.recipient_id:msg.sender_id;
      const currentChat=selChatRef.current;
      const mode=msgModeRef.current;
      setPatientChatContacts(prev=>{
        if(!prev.some(c=>c.id===other)) return prev;
        return sortContacts([...prev].map(c=>c.id===other?{...c,lastMessageAt:msg.created_at}:c));
      });
      if(msg.sender_id!==user.id&&soundEnabledRef.current) playNotifSound(soundTypeRef.current,soundVolumeRef.current);
      if(msg.sender_id!==user.id&&typeof window!=="undefined"){
        const key=String(msg.id||"");
        const b=String(msg.body||"");
        if(key&&!announcedInboundMsgAlertIdsRef.current.has(key)&&!/^VIDEO_[A-Z_]+\|/.test(b)){
          announcedInboundMsgAlertIdsRef.current.add(key);
          const senderName=patientChatContactsRef.current.find(c=>String(c.id)===String(other))?.name||"Patient";
          try{ window.alert(`${senderName}: ${formatChatNotificationPreview(b)||"sent you a message"}`); }catch{}
        }
      }
      if(mode==="patients"&&currentChat&&currentChat.id===other){
        const pair=new Set([msg.sender_id,msg.recipient_id]);
        if(pair.has(user.id)&&pair.has(other)){
          setMessages(prev=>{
            if(prev.some(m=>m.id===msg.id)) return prev;
            return sortMsgs([...prev,msg]);
          });
          if(msg.recipient_id===user.id&&!msg.read_at){
            supabase.from("patient_messages").update({read_at:new Date().toISOString()}).eq("id",msg.id).then(()=>{});
            setUnreadPatientCount(prev=>Math.max(0,prev-1));
            setUnreadPerPatient(prev=>{
              const n={...prev};
              if(n[other]) n[other]=Math.max(0,n[other]-1);
              if(!n[other]) delete n[other];
              return n;
            });
          }
        }
      } else if(msg.recipient_id===user.id&&!msg.read_at&&msg.sender_id!==user.id){
        setUnreadPatientCount(prev=>prev+1);
        setUnreadPerPatient(prev=>({...prev,[other]:(prev[other]||0)+1}));
      }
    }
    function onPatientMsgInsert(payload){
      const msg=payload.new;
      if(!msg) return;
      if(msg.recipient_id!==user.id&&msg.sender_id!==user.id) return;
      handlePatientThreadInsert(payload);
    }
    const ptCh=supabase.channel(`doc-pt-msgs-${user.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"patient_messages"},onPatientMsgInsert)
      .subscribe();
    return ()=>{ supabase.removeChannel(ptCh); };
  },[user?.id]);
  const peerIsPatient=useMemo(()=>!!selChat&&(
    patientChatContacts.some(c=>c.id===selChat.id)||
    (!chatContacts.some(c=>c.id===selChat.id)&&msgMode==="patients")
  ),[selChat?.id,patientChatContacts,chatContacts,msgMode]);
  const peerAvatarBg=useMemo(()=>peerIsPatient?"linear-gradient(135deg,#0e7490,#155e75)":"linear-gradient(135deg,#7c3aed,#6d28d9)",[peerIsPatient]);

  useEffect(()=>{
    if(!selChat?.id||!user?.id) return;
    setPeerTyping(false);
    typingBroadcastRef.current=null;
    const thread=[user.id,selChat.id].sort().join("-");
    const chName=peerIsPatient?`pm-typing-${thread}`:`typing-doc-${user.id}-${selChat.id}`;
    const ch=supabase.channel(chName,{config:{broadcast:{ack:false}}});
    ch.on("broadcast",{event:"typing"},(payload)=>{
      if(payload.payload?.sender_id!==user.id){
        setPeerTyping(true);
        clearTimeout(ch._typingTimer);
        ch._typingTimer=setTimeout(()=>setPeerTyping(false),2500);
      }
    }).subscribe((status)=>{
      if(status==="SUBSCRIBED") typingBroadcastRef.current=ch;
    });
    return ()=>{
      typingBroadcastRef.current=null;
      clearTimeout(ch._typingTimer);
      supabase.removeChannel(ch);
    };
  },[selChat?.id,user?.id,peerIsPatient]);

  function emitTyping(){
    if(!selChat?.id||!user?.id) return;
    typingBroadcastRef.current?.send({type:"broadcast",event:"typing",payload:{sender_id:user.id}}).catch(()=>{});
  }

  async function loadMessages(peerId){
    const reqId=++loadMessagesSeqRef.current;
    try{
      let usePatientMsgs=patientChatContacts.some(c=>c.id===peerId);
      if(!usePatientMsgs&&!chatContacts.some(c=>c.id===peerId)){
        usePatientMsgs=msgModeRef.current==="patients";
      } else if(chatContacts.some(c=>c.id===peerId)&&!patientChatContacts.some(c=>c.id===peerId)){
        usePatientMsgs=false;
      }
      if(usePatientMsgs){
        const q=`and(sender_id.eq.${user.id},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${user.id})`;
        const{data,error}=await supabase.from("patient_messages").select("*").or(q).order("created_at",{ascending:true}).limit(200);
        if(error){ console.error("Load patient msgs:",error.message); return; }
        if(reqId!==loadMessagesSeqRef.current||selChatRef.current?.id!==peerId) return;
        atBottomRef.current=true;
        setMessages(sortMsgs(data||[]));
        setUnreadPerPatient(prev=>{ const n={...prev}; delete n[peerId]; return n; });
        if(data&&data.length>0){
          const ts=data[data.length-1].created_at;
          setPatientChatContacts(prev=>sortContacts([...prev].map(c=>c.id===peerId?{...c,lastMessageAt:ts}:c)));
        }
        const unreadIds=(data||[]).filter(m=>m.recipient_id===user.id&&m.sender_id===peerId&&!m.read_at).map(m=>m.id);
        if(unreadIds.length>0){
          supabase.from("patient_messages").update({read_at:new Date().toISOString()}).in("id",unreadIds).then(()=>{});
          setUnreadPatientCount(prev=>Math.max(0,prev-unreadIds.length));
        }
        return;
      }
      const{data,error}=await supabase
        .from("chat_messages").select("*")
        .eq("doctor_id",user.id).eq("pharmacist_id",peerId)
        .order("created_at",{ascending:true});
      if(error){ console.error("Load msgs:",error.message); return; }
      if(reqId!==loadMessagesSeqRef.current||selChatRef.current?.id!==peerId) return;
      atBottomRef.current=true;
      setMessages(sortMsgs(data||[]));
      setUnreadPerContact(prev=>{ const n={...prev}; delete n[peerId]; return n; });
      if(data&&data.length>0){
        const ts=data[data.length-1].created_at;
        setChatContacts(prev=>[...prev].map(c=>c.id===peerId?{...c,lastMessageAt:ts}:c).sort((a,b)=>(b.lastMessageAt||"").localeCompare(a.lastMessageAt||"")));
      }
      const unreadIds=(data||[]).filter(m=>m.sender_id===peerId&&!m.read_at).map(m=>m.id);
      if(unreadIds.length>0){
        supabase.from("chat_messages").update({read_at:new Date().toISOString()}).in("id",unreadIds).then(()=>{});
        setUnreadCount(prev=>Math.max(0,prev-unreadIds.length));
      }
    }catch(e){console.error("loadMessages:",e);}
  }
  async function sendMessage(){
    if(!msgInput.trim()||!selChat||msgSending) return;
    setMsgSending(true);
    const userText=msgInput.trim();
    const sid=selChat.id;
    let sendPatientMsgs=patientChatContacts.some(c=>c.id===sid);
    if(!sendPatientMsgs&&!chatContacts.some(c=>c.id===sid)){
      sendPatientMsgs=msgMode==="patients";
    } else if(chatContacts.some(c=>c.id===sid)&&!patientChatContacts.some(c=>c.id===sid)){
      sendPatientMsgs=false;
    }
    const patContext=!sendPatientMsgs&&chatPatient?`Re: ${chatPatient.fullName}${chatPatient.dob?` (DOB: ${chatPatient.dob})`:""}${chatPatient.bloodType?` · Blood: ${chatPatient.bloodType}`:""}${chatPatient.allergies?.length>0?` · Allergies: ${chatPatient.allergies.join(", ")}`:""}${chatPatient.conditions?.length>0?` · Conditions: ${chatPatient.conditions.join(", ")}`:""}
`:"";
    const body=patContext+userText;
    setMsgInput("");
    if(chatPatient) setChatPatient(null);
    const now=new Date().toISOString();
    const tempId=`temp-${Date.now()}`;
    if(sendPatientMsgs){
      const tempMsg={id:tempId,sender_id:user.id,recipient_id:selChat.id,body,created_at:now,read_at:null};
      setMessages(prev=>sortMsgs([...prev,tempMsg]));
      setPatientChatContacts(prev=>sortContacts([...prev].map(c=>c.id===selChat.id?{...c,lastMessageAt:now}:c)));
      try{
        const{data:msg,error}=await supabase.from("patient_messages")
          .insert({sender_id:user.id,recipient_id:selChat.id,body})
          .select("*").single();
        if(error){
          console.error("Send:",error.message);
          setMessages(prev=>prev.filter(m=>m.id!==tempId));
          setMsgInput(body);
          return;
        }
        setMessages(prev=>sortMsgs(prev.map(m=>m.id===tempId?msg:m)));
        notifyRecipientNewChatMessage({
          recipientId:selChat.id,
          senderName:`Dr. ${name}`,
          messageText:userText,
          relatedMessageId:msg?.id,
        });
      }catch(e){
        console.error("sendMessage:",e);
        setMessages(prev=>prev.filter(m=>m.id!==tempId));
        setMsgInput(body);
      }finally{setMsgSending(false);}
      return;
    }
    const tempMsg={id:tempId,doctor_id:user.id,pharmacist_id:selChat.id,sender_id:user.id,body,created_at:now,read_at:null};
    setMessages(prev=>sortMsgs([...prev,tempMsg]));
    setChatContacts(prev=>[...prev].map(c=>c.id===selChat.id?{...c,lastMessageAt:now}:c).sort((a,b)=>(b.lastMessageAt||"").localeCompare(a.lastMessageAt||"")));
    try{
      const{data:msg,error}=await supabase.from("chat_messages")
        .insert({doctor_id:user.id,pharmacist_id:selChat.id,sender_id:user.id,body})
        .select("*").single();
      if(error){
        console.error("Send:",error.message);
        setMessages(prev=>prev.filter(m=>m.id!==tempId));
        setMsgInput(body);
        return;
      }
      setMessages(prev=>sortMsgs(prev.map(m=>m.id===tempId?msg:m)));
      notifyRecipientNewChatMessage({
        recipientId:selChat.id,
        senderName:`Dr. ${name}`,
        messageText:userText,
        relatedMessageId:msg?.id,
      });
    }catch(e){
      console.error("sendMessage:",e);
      setMessages(prev=>prev.filter(m=>m.id!==tempId));
      setMsgInput(body);
    }finally{setMsgSending(false);}
  }
  async function sendPatientToPharmacy(pharmacist){
    if(!selPat||sendToPharmacyBusy) return;
    setSendToPharmacyBusy(true);
    try{
      const payload={
        id:selPat.id,
        name:selPat.fullName,
        email:selPat.email||"",
        dob:patProfile?.dob||selPat.dob||null,
        blood:patProfile?.blood_type||selPat.bloodType||null,
        allergies:patProfile?.allergies||selPat.allergies||[],
        conditions:patProfile?.medical_conditions||selPat.conditions||[],
        meds:patMeds.map(m=>({name:m.medicationName,dosage:m.dosage,freq:m.freq})).slice(0,6),
        sentBy:name,
        sentAt:new Date().toISOString(),
      };
      const body="PATREF:"+JSON.stringify(payload);
      let pharmContact=chatContacts.find(c=>c.id===pharmacist.id);
      if(!pharmContact){
        pharmContact=pharmacist;
        setChatContacts(prev=>[...prev,pharmacist]);
      }
      const { data: sentRx } = await supabase.from("chat_messages").insert({
        doctor_id:user.id,
        pharmacist_id:pharmacist.id,
        sender_id:user.id,
        body,
      }).select("id").single();
      notifyRecipientNewChatMessage({
        recipientId:pharmacist.id,
        senderName:`Dr. ${name}`,
        messageText:"Shared patient details with your pharmacy.",
        relatedMessageId:sentRx?.id,
      });
      setSendToPharmacyDone(true);
      setTimeout(()=>{ setSendToPharmacyDone(false); setShowSendToPharmacy(false); },2000);
    }catch(e){ console.error("sendPatientToPharmacy:",e); }
    finally{ setSendToPharmacyBusy(false); }
  }

  useEffect(()=>{
    if(!user?.id) return;
    const load=()=>supabase.from("notifications").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(30).then(({data})=>setDocNotifs(data||[]));
    load();
    const poll=setInterval(load,15000);
    const ch=supabase.channel(`doc-notifs-${user.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:`user_id=eq.${user.id}`},(p)=>{
        if(
          p?.eventType==="INSERT" &&
          p?.new?.id &&
          !p?.new?.read_at &&
          typeof window!=="undefined"
        ){
          const idKey=String(p.new.id);
          if(!announcedNotifAlertIdsRef.current.has(idKey)){
            announcedNotifAlertIdsRef.current.add(idKey);
            const title=String(p.new.title||"Notification").trim();
            const body=String(p.new.body||"").trim();
            try{ window.alert(body?`${title}: ${body}`:title); }catch{}
          }
        }
        setDocNotifs(prev=>mergeNotificationRows(prev,p,30));
      }).subscribe();
    return ()=>{ clearInterval(poll); supabase.removeChannel(ch); };
  },[user?.id]);

  async function markNotifRead(id){
    if(!user?.id) return;
    const snapshot=docNotifs;
    const now=new Date().toISOString();
    setDocNotifs(prev=>prev.map(n=>n.id===id?{...n,read_at:now}:n));
    const { error }=await supabase.from("notifications").update({read_at:now}).eq("id",id).eq("user_id",user.id);
    if(error){ console.error("notifications.mark read:",error.message); setDocNotifs(snapshot); }
  }
  async function markAllNotifsRead(){
    if(!user?.id) return;
    const ids=docNotifs.filter(n=>!n.read_at).map(n=>n.id);
    if(!ids.length) return;
    const snapshot=docNotifs;
    const now=new Date().toISOString();
    setDocNotifs(prev=>prev.map(n=>({...n,read_at:n.read_at||now})));
    const { error }=await supabase.from("notifications").update({read_at:now}).in("id",ids).eq("user_id",user.id);
    if(error){ console.error("notifications.mark all read:",error.message); setDocNotifs(snapshot); }
  }
  async function removeNotif(id){
    if(!user?.id) return;
    const snapshot=docNotifs;
    setDocNotifs(prev=>prev.filter(n=>n.id!==id));
    const { error }=await supabase.from("notifications").delete().eq("id",id).eq("user_id",user.id);
    if(error){ console.error("notifications.delete:",error.message); setDocNotifs(snapshot); }
  }
  async function clearAllNotifs(){
    if(!docNotifs.length||!user?.id) return;
    const snapshot=docNotifs;
    const ids=docNotifs.map(n=>n.id);
    setDocNotifs([]);
    const { error }=await supabase.from("notifications").delete().in("id",ids).eq("user_id",user.id);
    if(error){ console.error("notifications.delete all:",error.message); setDocNotifs(snapshot); }
  }

  const OPENAI_KEY=import.meta.env.VITE_OPENAI_API_KEY;
  async function sendDocAI(){
    if(!aiInput.trim()||aiLoading) return;
    const msg={role:"user",content:aiInput.trim()};
    setAiMessages(prev=>[...prev,msg]);
    setAiInput("");
    setAiLoading(true);
    try{
      const todayAppts=allAppointments.filter(a=>new Date(a.date+"T12:00:00").toDateString()===new Date().toDateString()).length;
      const system=`You are a clinical assistant for Dr. ${name}. They have ${patients.length} patients and ${todayAppts} appointments today. Provide concise, evidence-based clinical guidance. Always recommend consulting specialist or references for critical decisions. Do not replace clinical judgment.`;
      const res=await fetch("https://api.openai.com/v1/chat/completions",{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${OPENAI_KEY}`},
        body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:system},...aiMessages,msg],max_tokens:600})
      });
      const data=await res.json();
      const reply=data.choices?.[0]?.message?.content||"Unable to respond.";
      setAiMessages(prev=>[...prev,{role:"assistant",content:reply}]);
    }catch(e){ setAiMessages(prev=>[...prev,{role:"assistant",content:"Error contacting AI. Check API key."}]); }
    finally{ setAiLoading(false); }
  }
  useEffect(()=>{ aiEndRef.current?.scrollIntoView({behavior:"smooth"}); },[aiMessages]);

  async function loadRxMessages(rxId){
    const{data}=await supabase.from("prescription_messages").select("*").eq("prescription_id",rxId).order("created_at",{ascending:true});
    setRxMessages(data||[]);
  }

  async function sendRxMessage(){
    if(!rxMsgInput.trim()||!selRxChat||rxMsgSending) return;
    const body=rxMsgInput.trim();
    setRxMsgInput("");
    const tempId=`temp-${Date.now()}`;
    const tempMsg={id:tempId,prescription_id:selRxChat,sender_id:user.id,body,created_at:new Date().toISOString()};
    setRxMessages(prev=>[...prev,tempMsg]);
    try{
      const{data:msg,error}=await supabase.from("prescription_messages").insert({prescription_id:selRxChat,sender_id:user.id,body}).select("*").single();
      if(error) throw error;
      setRxMessages(prev=>prev.map(m=>m.id===tempId?msg:m));
      const rxRowCached=patRx.find(r=>r.id===selRxChat);
      let pharmacistId=rxRowCached?.pharmacist_id;
      let patientId=rxRowCached?.patient_id;
      if(pharmacistId==null||patientId==null){
        const{data:rxRow}=await supabase.from("prescriptions").select("pharmacist_id,patient_id").eq("id",selRxChat).eq("doctor_id",user.id).maybeSingle();
        if(rxRow){
          if(pharmacistId==null) pharmacistId=rxRow.pharmacist_id;
          if(patientId==null) patientId=rxRow.patient_id;
        }
      }
      const rows=[];
      if(pharmacistId){
        rows.push({user_id:pharmacistId,type:"general",title:"New prescription message",body:`Dr. ${name} sent a message about a prescription.`,related_id:selRxChat});
      }
      if(patientId){
        rows.push({user_id:patientId,type:"general",title:"Prescription updated",body:"Your care team added an update. Open Prescriptions to view the thread.",related_id:selRxChat});
      }
      if(rows.length){
        try{await supabase.from("notifications").insert(rows);}catch{}
      }
    }catch{
      setRxMessages(prev=>prev.filter(m=>m.id!==tempId));
      setRxMsgInput(body);
    }
  }

  const startVideoVisitForPatient=useCallback(async ({patientId,windowStartMs,windowEndMs})=>{
    if(!user?.id||!patientId||videoApprovalBusy) return false;
    let overlapping = findVirtualAppointmentForDoctorVideoStart(allAppointments, user.id, patientId, windowStartMs, windowEndMs);
    let canon = overlapping ? getAppointmentVideoWindowLoose(overlapping) : null;
    if((!overlapping?.id || !canon) && user?.id){
      try{
        const { data: dbRows, error: dbErr } = await supabase
          .from("appointments")
          .select("id,doctor_id,patient_id,date,time,type,status,virtual_visit_status")
          .eq("doctor_id", user.id)
          .eq("patient_id", patientId)
          .neq("status", "cancelled")
          .neq("status", "completed")
          .order("date", { ascending: true })
          .order("time", { ascending: true })
          .limit(40);
        if(!dbErr){
          const best = pickBestDoctorVideoStartCandidate(dbRows || [], windowStartMs, windowEndMs);
          if(best?.a?.id && best?.w){
            overlapping = best.a;
            canon = best.w;
          }
        }
      }catch(e){
        console.warn("startVideoVisitForPatient db fallback failed:", e?.message || e);
      }
    }
    if(!overlapping?.id || !canon){
      if(typeof window!=="undefined"){
        window.alert("No scheduled virtual visit matches this time window. Open the patient’s upcoming appointments and try again.");
      }
      return false;
    }
    const windowMsgStartMs = canon.windowStartMs;
    const windowMsgEndMs = canon.windowEndMs;
    const roomId=buildVideoRoomId(user.id,patientId);
    const url=buildVideoCallUrlFromRoom(roomId);
    const nowMs=Date.now();
    const body=createVideoSessionMessageBody({
      roomId,
      windowStartIso:new Date(windowMsgStartMs).toISOString(),
      windowEndIso:new Date(windowMsgEndMs).toISOString(),
      startedAtIso:new Date(nowMs).toISOString(),
    });
    const tempId=`temp-video-${Date.now()}`;
    const nowIso=new Date().toISOString();
    const tempMsg={id:tempId,sender_id:user.id,recipient_id:patientId,body,created_at:nowIso,read_at:null};
    const mirrorInOpenThread=msgMode==="patients"&&selChat?.id===patientId;
    setVideoApprovalBusy(true);
    setVideoStartTargetId(patientId);
    try{
      const { error: stErr } = await supabase.from("appointments").update({
        virtual_visit_status: VS.VIDEO_STARTED,
        updated_at: new Date().toISOString(),
      }).eq("id", overlapping.id);
      if(stErr) throw stErr;
      const mergeVs=(a)=> (a.id===overlapping.id ? { ...a, virtual_visit_status: VS.VIDEO_STARTED } : a);
      setAllAppointments((prev)=>prev.map(mergeVs));
      setAppointments((prev)=>prev.map(mergeVs));
      if(mirrorInOpenThread){
        setMessages(prev=>sortMsgs([...prev,tempMsg]));
      }
      const{data:msg,error}=await supabase.from("patient_messages")
        .insert({sender_id:user.id,recipient_id:patientId,body})
        .select("*").single();
      if(error){
        console.error("patient_messages insert (video visit):", error.message, error.details, error.hint);
        throw error;
      }
      if(mirrorInOpenThread){
        setMessages(prev=>sortMsgs(prev.map(m=>m.id===tempId?msg:m)));
      }
      notifyRecipientNewChatMessage({
        recipientId:patientId,
        senderName:`Dr. ${name}`,
        messageText:"Your doctor has joined. Join video chat.",
        relatedMessageId:msg?.id,
        title:"Your doctor joined the video visit",
      });
      if(typeof window!=="undefined"){
        const opened=window.open(url,"_blank","noopener,noreferrer");
        if(!opened){
          window.alert("Invite sent — your patient will see Join in Messages. Allow pop-ups if you want the video room to open here too.");
        }
      }
      return true;
    }catch(e){
      const msg=e?.message||String(e);
      console.error("startVideoVisitForPatient patient_messages insert:", msg, e);
      if(mirrorInOpenThread){
        setMessages(prev=>prev.filter(m=>m.id!==tempId));
      }
      if(typeof window!=="undefined"){
        window.alert(`Could not start the video visit. ${msg}`);
      }
      return false;
    }finally{
      setVideoApprovalBusy(false);
      setVideoStartTargetId(null);
    }
  },[allAppointments,msgMode,name,selChat?.id,user?.id,videoApprovalBusy]);
  const endVideoVisitForPatientContext=useCallback(async ({patientId,windowStartMs,windowEndMs,mirrorInOpenThread=true})=>{
    if(!user?.id||!patientId||videoEndBusy) return false;
    const overlapping=findVirtualAppointmentForDoctorVideoEnd(allAppointments,user.id,patientId,windowStartMs,windowEndMs);
    const roomId=buildVideoRoomId(user.id,patientId);
    const canon=overlapping?getAppointmentVideoWindow(overlapping):null;
    const ws=canon?canon.windowStartMs:windowStartMs;
    const we=canon?canon.windowEndMs:windowEndMs;
    const body=createVideoSessionEndedMessageBody({
      roomId,
      windowStartIso:new Date(ws).toISOString(),
      windowEndIso:new Date(we).toISOString(),
    });
    if(!body) return;
    setVideoEndBusy(true);
    const tempId=`temp-video-end-${Date.now()}`;
    const nowIso=new Date().toISOString();
    const tempMsg={id:tempId,sender_id:user.id,recipient_id:patientId,body,created_at:nowIso,read_at:null};
    const shouldMirror=mirrorInOpenThread&&msgMode==="patients"&&selChat?.id===patientId;
    try{
      let targetAppt=overlapping;
      if(!targetAppt){
        const { data:freshRows } = await supabase
          .from("appointments")
          .select("id,patient_id,doctor_id,date,time,type,status,virtual_visit_status,updated_at")
          .eq("doctor_id", user.id)
          .eq("patient_id", patientId)
          .neq("status", "cancelled")
          .order("date", { ascending: true });
        targetAppt=findVirtualAppointmentForDoctorVideoEnd(
          freshRows||[],
          user.id,
          patientId,
          windowStartMs,
          windowEndMs,
        );
      }
      if(targetAppt?.id){
        const { error: upErr } = await supabase.from("appointments").update({
          status: "completed",
          virtual_visit_status: VS.COMPLETED,
          updated_at: new Date().toISOString(),
        }).eq("id", targetAppt.id);
        if(!upErr){
          const mergeW=(a)=> (a.id===targetAppt.id ? { ...a, status: "completed", virtual_visit_status: VS.COMPLETED } : a);
          setAllAppointments((prev)=>prev.map(mergeW));
          setAppointments((prev)=>prev.map(mergeW));
        }
      }
      if(shouldMirror){ setMessages((prev)=>sortMsgs([...prev,tempMsg])); }
      const{data:msg,error}=await supabase.from("patient_messages")
        .insert({sender_id:user.id,recipient_id:patientId,body})
        .select("*").single();
      if(error) throw error;
      if(shouldMirror){ setMessages((prev)=>sortMsgs(prev.map((m)=>m.id===tempId?msg:m))); }
      notifyRecipientNewChatMessage({
        recipientId:patientId,
        senderName:`Dr. ${name}`,
        messageText:formatChatNotificationPreview(body),
        relatedMessageId:msg?.id,
        title:"Video visit ended",
      });
      return true;
    }catch(e){
      const errMsg=e?.message||String(e);
      console.error("endVideoVisitForPatient:",errMsg,e);
      if(shouldMirror){ setMessages((prev)=>prev.filter((m)=>m.id!==tempId)); }
      if(typeof window!=="undefined") window.alert(`Could not save end-of-visit notice. ${errMsg}`);
      return false;
    }finally{
      setVideoEndBusy(false);
    }
  },[allAppointments,msgMode,name,selChat?.id,user?.id,videoEndBusy]);
  const endVideoVisitForPatient=useCallback(async ()=>{
    if(!user?.id||!selChat?.id||!peerIsPatient||videoEndBusy) return;
    const patientId=selChat.id;
    const { windowStartMs, windowEndMs } = resolveDoctorPatientInviteWindowMs(allAppointments, patientId, Date.now());
    await endVideoVisitForPatientContext({ patientId, windowStartMs, windowEndMs, mirrorInOpenThread: true });
  },[allAppointments,endVideoVisitForPatientContext,peerIsPatient,selChat?.id,user?.id,videoEndBusy]);
  const openVideoVisit=useCallback(async ()=>{
    if(!selChat?.id||!peerIsPatient) return;
    const nowMs=Date.now();
    const { windowStartMs, windowEndMs } = resolveDoctorPatientInviteWindowMs(allAppointments, selChat.id, nowMs);
    await startVideoVisitForPatient({
      patientId: selChat.id,
      windowStartMs,
      windowEndMs,
    });
  },[allAppointments,peerIsPatient,selChat?.id,startVideoVisitForPatient]);

  useEffect(()=>{
    if(!selRxChat) return;
    loadRxMessages(selRxChat);
    const poll=setInterval(()=>loadRxMessages(selRxChat),3000);
    const ch=supabase.channel(`rx-msg-doc-${selRxChat}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"prescription_messages",filter:`prescription_id=eq.${selRxChat}`},(payload)=>{
        setRxMessages(prev=>prev.some(m=>m.id===payload.new.id)?prev:[...prev,payload.new]);
      }).subscribe();
    return ()=>{ clearInterval(poll); supabase.removeChannel(ch); };
  },[selRxChat]);

  async function findPharmacistByEmail(){
    const email=chatSearchEmail.trim().toLowerCase();
    if(!email||chatSearchBusy)return;
    setChatSearchBusy(true);setChatSearchMsg(null);
    try{
      const{data:rows,error}=await supabase.from("profiles").select("id,first_name,last_name,email,pharmacy_name,role").eq("email",email).limit(1);
      if(error){setChatSearchMsg({type:"err",text:"Search failed: "+error.message});return;}
      const prof=rows&&rows.length>0?rows[0]:null;
      if(!prof){setChatSearchMsg({type:"err",text:"No account found with that email."});return;}
      if(prof.role!=="pharmacist"){setChatSearchMsg({type:"err",text:"That account is not a pharmacist."});return;}
      if(chatContacts.find(c=>c.id===prof.id)){
        const ex=chatContacts.find(c=>c.id===prof.id);
        setMsgMode("pharmacy");setSelChat(ex);setChatSearchEmail("");
        setChatSearchMsg({type:"ok",text:`Switched to ${ex.name}.`});
        setTimeout(()=>setChatSearchMsg(null),2000);return;
      }
      const nc={id:prof.id,name:[prof.first_name,prof.last_name].filter(Boolean).join(" ")||prof.email||"Pharmacist",pharmacy:prof.pharmacy_name||"Pharmacy",email:prof.email||"",lastMessageAt:null};
      setChatContacts(prev=>sortContacts([...prev,nc]));setMsgMode("pharmacy");setSelChat(nc);setChatSearchEmail("");
      setChatSearchMsg({type:"ok",text:`${nc.name} added.`});
      setTimeout(()=>setChatSearchMsg(null),2500);
    }catch(e){setChatSearchMsg({type:"err",text:"Something went wrong."});}
    finally{setChatSearchBusy(false);}
  }
  async function addPatientByEmail(){
    const email=addPatientEmail.trim().toLowerCase();
    if(!email||addPatientBusy)return;
    setAddPatientBusy(true);setAddPatientMsg(null);
    try{
      console.log("Searching for email:", email);
      const{data:rows,error}=await supabase
        .from("profiles")
        .select("id,first_name,last_name,email,dob,blood_type,allergies,medical_conditions,role")
        .eq("email",email)
        .limit(1);
      console.log("Supabase result:", {rows, error, rowCount: rows?.length});
      if(error){console.error("Search error:",error);setAddPatientMsg({type:"err",text:"Search failed: "+error.message});return;}
      const prof=rows&&rows.length>0?rows[0]:null;
      console.log("Profile found:", prof);
      if(!prof){setAddPatientMsg({type:"err",text:`No account found with email: ${email}`});return;}
      if(prof.role==="doctor"){setAddPatientMsg({type:"err",text:"That account belongs to a doctor."});return;}
      if(prof.role==="pharmacist"){setAddPatientMsg({type:"err",text:"That account belongs to a pharmacist."});return;}
      if(patients.find(p=>p.id===prof.id)){setAddPatientMsg({type:"err",text:"Patient already in your list."});return;}
      const{error:linkErr}=await supabase.from("doctor_patients").insert({doctor_id:user.id,patient_id:prof.id});
      if(linkErr&&!linkErr.message?.includes("duplicate")){console.error("Link error:",linkErr);setAddPatientMsg({type:"err",text:"Could not add patient: "+linkErr.message});return;}
      await supabase.from("profiles").update({primary_doctor_id:user.id}).eq("id",prof.id).is("primary_doctor_id",null);
      const np={id:prof.id,fullName:[prof.first_name,prof.last_name].filter(Boolean).join(" ")||prof.email||"Patient",email:prof.email||"",dob:prof.dob||null,bloodType:prof.blood_type||null,allergies:prof.allergies||[],conditions:prof.medical_conditions||[]};
      setPatients(prev=>[...prev,np]);
      setPatientChatContacts(prev=>prev.some(c=>c.id===np.id)?prev:sortContacts([...prev,{id:np.id,name:np.fullName,email:np.email||"",lastMessageAt:null}]));
      setAddPatientEmail("");
      setAddPatientMsg({type:"ok",text:`${np.fullName} added successfully.`});
      setTimeout(()=>setAddPatientMsg(null),3000);
    }catch(e){console.error("addPatientByEmail:",e);setAddPatientMsg({type:"err",text:"Error: "+e.message});}
    finally{setAddPatientBusy(false);}
  }
  async function openPatient(pat){
    setSelPat(pat);setLoading(true);setPatProfile(null);setPatMeds([]);setNotes([]);setPatRx([]);
    setActiveTab("overview");setPatFlag("none");setVitals({bp:"",hr:"",temp:"",weight:"",o2:"",notes:""});
    setAppointments([]);setRescheduleReqs([]);
    try{
      const[profRes,medsRes,notesRes,rxRes,apptRes]=await Promise.all([
        supabase.from("profiles").select("*").eq("id",pat.id).single(),
        supabase.from("user_medications").select("*").eq("user_id",pat.id),
        supabase.from("doctor_notes").select("*").eq("doctor_id",user.id).eq("patient_id",pat.id).order("created_at",{ascending:false}),
        supabase.from("prescriptions").select("id,status,notes,created_at,pharmacist_id,patient_id,doctor_id").eq("patient_id",pat.id).eq("doctor_id",user.id).order("created_at",{ascending:false}),
        supabase.from("appointments").select("*").eq("patient_id",pat.id).eq("doctor_id",user.id).order("date",{ascending:true}),
      ]);
      setPatProfile(profRes.data||{});
      setPatMeds((medsRes.data||[]).map(d=>({id:d.id,medicationName:d.medication_name,dosage:d.dosage,freq:d.freq,color:d.color,reminderTime:d.reminder_time})));
      setNotes((notesRes.data||[]).map(d=>({id:d.id,note:d.note,createdAt:d.created_at})));
      setPatRx(rxRes.data||[]);
      const appts=apptRes.data||[];setAppointments(appts);
      setRescheduleReqs(appts.filter(hasActiveRescheduleRequest));
      const key=`doc_${user.id}_pat_${pat.id}`;
      try{const s=JSON.parse(localStorage.getItem(key)||"{}");if(s.flag)setPatFlag(s.flag);if(s.vitals)setVitals(s.vitals);}catch{}
    }catch(e){}finally{setLoading(false);}
  }

  async function confirmClearPatientVirtualCheckIn(){
    if(!checkInClearAwaitingConfirmPatientId||clearCheckInBusy) return;
    const pid=checkInClearAwaitingConfirmPatientId;
    setClearCheckInBusy(true);
    try{
      const{error}=await doctorClearPatientVirtualVisitCheckIn(pid);
      if(error) throw error;
      await supabase.from("notifications").insert({
        user_id:pid,
        type:"general",
        title:"Check-in form reset",
        body:`Dr. ${name} cleared your saved virtual visit check-in. You'll need to complete it again before your visit.`,
      }).catch(()=>{});
      setPatProfile(p=>(p?.id===pid?{...p,pre_visit_intake:null,allergies:[],medical_conditions:[]}:p));
      setVirtualCheckInPatientProfile(vp=>(vp?.id===pid?{...vp,pre_visit_intake:null,allergies:[],medical_conditions:[]}:vp));
      setCheckInClearAwaitingConfirmPatientId(null);
    }catch(e){
      const msg=e?.message||String(e);
      console.error("confirmClearPatientVirtualCheckIn:",msg,e);
      if(typeof window!=="undefined") window.alert(`Could not delete check-in form: ${msg}`);
    }finally{
      setClearCheckInBusy(false);
    }
  }

  async function requestCheckInRefillForPatient(patientId){
    if(!user?.id||!patientId||refillRequestBusyPatientId)return;
    setRefillRequestBusyPatientId(patientId);
    try{
      const { error } = await doctorRequestCheckInRefill(patientId, user.id);
      if(error) throw error;
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", patientId).maybeSingle();
      if(prof){
        if(selPat?.id===patientId) setPatProfile(prof);
        setVirtualCheckInPatientProfile((vp)=> (vp?.id===patientId ? prof : vp));
      }
      const { data: allA } = await supabase
        .from("appointments")
        .select("id,patient_id,date,time,type,status,notes,reschedule_request,virtual_visit_status")
        .eq("doctor_id", user.id)
        .neq("status", "cancelled")
        .order("date", { ascending: true });
      if(Array.isArray(allA)) setAllAppointments(allA);
      if(selPat?.id===patientId){
        const { data: pAppts } = await supabase.from("appointments").select("*").eq("patient_id", patientId).eq("doctor_id", user.id).order("date", { ascending: true });
        if(pAppts) setAppointments(pAppts);
      }
    }catch(e){
      const msg=e?.message||String(e);
      if(typeof window!=="undefined")window.alert(`Could not request new form: ${msg}`);
    }finally{
      setRefillRequestBusyPatientId(null);
    }
  }

  async function openNotificationTarget(n){
    if(!n?.id||!user?.id) return;
    if(!n.read_at) await markNotifRead(n.id);
    setShowNotifPanel(false);
    const rawRelatedId=n.related_id;
    const blob=notificationTextBlob(n);
    const resolvePrescriptionId=async(relatedId)=>{
      const rid=String(relatedId||"").trim();
      if(!rid) return null;
      const { data: directRx } = await supabase
        .from("prescriptions")
        .select("id")
        .eq("id", rid)
        .eq("doctor_id", user.id)
        .maybeSingle();
      if(directRx?.id) return directRx.id;
      const { data: pmRow } = await supabase
        .from("prescription_messages")
        .select("prescription_id")
        .eq("id", rid)
        .maybeSingle();
      return pmRow?.prescription_id || null;
    };
    const rxId=await resolvePrescriptionId(rawRelatedId);
    const openMessageByRelatedId=async(relatedId)=>{
      const rid=String(relatedId||"").trim();
      if(!rid) return false;
      const { data:pm,error:pmErr }=await supabase.from("patient_messages").select("id,sender_id,recipient_id").eq("id",rid).maybeSingle();
      if(pmErr) console.error("openNotificationTarget patient_messages:",pmErr.message);
      if(pm){
        const other=pm.sender_id===user.id?pm.recipient_id:pm.sender_id;
        if(other&&other!==user.id){
          setPage("messages");
          setMsgMode("patients");
          let target=patientChatContactsRef.current.find(c=>String(c.id)===String(other))||null;
          if(!target){
            const { data:prof }=await supabase.from("profiles").select("id,first_name,last_name,email").eq("id",other).maybeSingle();
            if(prof){
              target={
                id:prof.id,
                name:[prof.first_name,prof.last_name].filter(Boolean).join(" ")||prof.email||"Patient",
                email:prof.email||"",
                lastMessageAt:null,
              };
              setPatientChatContacts(prev=>sortContacts(prev.some(c=>c.id===target.id)?prev:[...prev,target]));
            }else{
              target={id:other,name:"Patient",email:"",lastMessageAt:null};
            }
          }
          setSelChat(target);
          return true;
        }
      }
      const { data:cm,error:cmErr }=await supabase.from("chat_messages").select("id,pharmacist_id").eq("id",rid).maybeSingle();
      if(cmErr) console.error("openNotificationTarget chat_messages:",cmErr.message);
      if(cm?.pharmacist_id){
        setPage("messages");
        setMsgMode("pharmacy");
        let target=chatContactsRef.current.find(c=>String(c.id)===String(cm.pharmacist_id))||null;
        if(!target){
          const { data:prof }=await supabase.from("profiles").select("id,first_name,last_name,email,pharmacy_name").eq("id",cm.pharmacist_id).maybeSingle();
          target=prof
            ? {
                id:prof.id,
                name:[prof.first_name,prof.last_name].filter(Boolean).join(" ")||prof.email||"Pharmacist",
                pharmacy:prof.pharmacy_name||"Pharmacy",
                email:prof.email||"",
                lastMessageAt:null,
              }
            : { id:cm.pharmacist_id,name:"Pharmacist",pharmacy:"Pharmacy",email:"",lastMessageAt:null };
          setChatContacts(prev=>sortContacts(prev.some(c=>c.id===target.id)?prev:[...prev,target]));
        }
        setSelChat(target);
        return true;
      }
      return false;
    };
    if(rxId&&notificationSuggestsPrescription(n)){
      const { data:rx,error:rxErr}=await supabase.from("prescriptions").select("id,patient_id").eq("id",rxId).eq("doctor_id",user.id).maybeSingle();
      if(rxErr) console.error("openNotificationTarget:",rxErr.message);
      if(rx){
        let pat=patients.find(p=>p.id===rx.patient_id);
        if(!pat){
          const { data:prof }=await supabase.from("profiles").select("id,first_name,last_name,email,dob,blood_type,allergies,medical_conditions").eq("id",rx.patient_id).maybeSingle();
          if(prof){
            pat={id:prof.id,fullName:[prof.first_name,prof.last_name].filter(Boolean).join(" ")||prof.email||"Patient",email:prof.email||"",dob:prof.dob||null,bloodType:prof.blood_type||null,allergies:prof.allergies||[],conditions:prof.medical_conditions||[]};
          }
        }
        if(pat){
          setPage("patients");
          await openPatient(pat);
          setActiveTab("prescriptions");
          setSelRxChat(rx.id);
          return;
        }
      }
    }
    if(notificationSuggestsChat(n)||/appointment|reschedule|scheduled/i.test(blob)){
      if(notificationSuggestsChat(n)&&rxId){
        const opened=await openMessageByRelatedId(rxId);
        if(opened) return;
      }
      setPage("messages");
      if(/patient|follow-up|lab|visit|your patient|patient message/i.test(blob)) setMsgMode("patients");
      else setMsgMode("pharmacy");
      return;
    }
    setPage("dashboard");
  }
  async function openCalendarAppointment(appt){
    if(!appt?.patient_id) return;
    setPage("patients");
    let pat=patients.find(p=>p.id===appt.patient_id);
    if(!pat){
      const { data:prof }=await supabase.from("profiles").select("id,first_name,last_name,email,dob,blood_type,allergies,medical_conditions").eq("id",appt.patient_id).maybeSingle();
      if(prof){
        pat={id:prof.id,fullName:[prof.first_name,prof.last_name].filter(Boolean).join(" ")||prof.email||"Patient",email:prof.email||"",dob:prof.dob||null,bloodType:prof.blood_type||null,allergies:prof.allergies||[],conditions:prof.medical_conditions||[]};
      }
    }
    if(!pat) return;
    await openPatient(pat);
    setActiveTab("appointments");
  }

  function saveToLocal(patch){const key=`doc_${user.id}_pat_${selPat?.id}`;try{const e=JSON.parse(localStorage.getItem(key)||"{}");localStorage.setItem(key,JSON.stringify({...e,...patch}));}catch{}}
  async function saveFlag(flag){setPatFlag(flag);saveToLocal({flag});}
  async function saveVitals(){setVitalsBusy(true);saveToLocal({vitals});await new Promise(r=>setTimeout(r,400));setVitalsBusy(false);setVitalsSaved(true);setTimeout(()=>setVitalsSaved(false),2500);}
  async function addAppointment(){
    if(!apptForm.date||!apptForm.time||!selPat)return;setApptBusy(true);
    try{
      const row={
        patient_id:selPat.id,
        doctor_id:user.id,
        date:apptForm.date,
        time:apptForm.time,
        type:apptForm.type,
        notes:apptForm.notes||null,
        status:"scheduled",
      };
      if(isVideoStyleVisitType(row)) row.virtual_visit_status=VS.PENDING;
      const{data:appt,error}=await supabase.from("appointments").insert(row).select("*").single();
      if(error)throw error;
      setAppointments(prev=>[...prev,appt]);setAllAppointments(prev=>[...prev,appt]);
      setApptForm({date:"",time:"",type:"Follow-up",notes:""});
      await supabase.from("notifications").insert({user_id:selPat.id,type:"general",title:`Appointment: ${apptForm.type}`,body:`Scheduled on ${new Date(apptForm.date+"T"+apptForm.time).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}.`});
    }catch(e){}finally{setApptBusy(false);}
  }
  async function deleteAppointment(id){
    const appt = (allAppointments || []).find((a) => a.id === id) || (appointments || []).find((a) => a.id === id) || null;
    await supabase.from("appointments").update({
      status:"cancelled",
      virtual_visit_status: VS.CANCELLED,
      updated_at:new Date().toISOString(),
    }).eq("id",id);
    setAppointments(p=>p.filter(a=>a.id!==id));setAllAppointments(p=>p.filter(a=>a.id!==id));
    if(appt?.patient_id){
      const label = appt?.date && appt?.time
        ? new Date(`${appt.date}T${normTimeValue(appt.time) || "12:00:00"}`).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})
        : "the scheduled time";
      await supabase.from("notifications").insert({
        user_id: appt.patient_id,
        type:"general",
        title:"Appointment cancelled",
        body:`Your appointment for ${label} was cancelled by your doctor.`,
        related_id: appt.id,
      });
    }
  }
  function addAvailabilitySlot(){
    if(!availDate||!availTime){
      setAvailMsg({type:"err",text:"Choose both date and time."});
      return;
    }
    const nt=normTimeValue(availTime);
    setBookingAvailability(prev=>{
      const existing=Array.isArray(prev.slots?.[availDate])?prev.slots[availDate]:[];
      if(existing.includes(nt)) return prev;
      const nextTimes=[...existing,nt].sort();
      return {...prev,slots:{...prev.slots,[availDate]:nextTimes}};
    });
    setAvailMsg({type:"ok",text:"Slot added. Click Save Availability to publish."});
  }
  function removeAvailabilitySlot(date,time){
    setBookingAvailability(prev=>{
      const list=Array.isArray(prev.slots?.[date])?prev.slots[date]:[];
      const next=list.filter(t=>t!==time);
      const nextSlots={...prev.slots};
      if(next.length) nextSlots[date]=next;
      else delete nextSlots[date];
      return {...prev,slots:nextSlots};
    });
    setAvailMsg({type:"ok",text:"Slot removed. Click Save Availability to publish."});
  }
  function removeAvailabilityDate(date){
    setBookingAvailability(prev=>{
      const nextSlots={...(prev.slots||{})};
      delete nextSlots[date];
      return {...prev,slots:nextSlots};
    });
    setAvailMsg({type:"ok",text:"Date removed. Click Save Availability to publish."});
  }
  function editAvailabilityDate(date){
    const list=Array.isArray(bookingAvailability.slots?.[date])?bookingAvailability.slots[date]:[];
    setAvailDate(date);
    setAvailTime(list[0]?normTimeValue(list[0]).slice(0,5):"");
  }
  async function saveAvailability(){
    if(!user?.id||availBusy) return;
    setAvailBusy(true); setAvailMsg(null);
    try{
      const clean=parseDocBookingAvailability(bookingAvailability);
      const payload={timezone:clean.timezone||"America/New_York",slots:clean.slots||{}};
      const { data, error }=await supabase
        .from("profiles")
        .update({booking_availability:payload})
        .eq("id",user.id)
        .select("id,booking_availability")
        .single();
      if(error) throw error;
      const saved=parseDocBookingAvailability(data?.booking_availability);
      const count=Object.values(saved.slots||{}).reduce((n,arr)=>n+(Array.isArray(arr)?arr.length:0),0);
      setBookingAvailability(saved);
      setAvailMsg({type:"ok",text:`Availability saved (${count} slots). Patients can now book.`});
    }catch(e){
      const raw=String(e?.message||"");
      if(raw.toLowerCase().includes("booking_availability")){
        setAvailMsg({type:"err",text:"Database is missing booking availability column. Run migration 009, then refresh."});
      }else{
        setAvailMsg({type:"err",text:raw||"Could not save availability."});
      }
    }finally{
      setAvailBusy(false);
    }
  }
  async function confirmReschedule(appt,newDate,newTime){
    await supabase.from("appointments").update({date:newDate,time:newTime,status:"scheduled",reschedule_request:null,updated_at:new Date().toISOString()}).eq("id",appt.id);
    const updater=a=>a.id===appt.id?{...a,date:newDate,time:newTime,status:"scheduled",reschedule_request:null}:a;
    setAppointments(p=>p.map(updater));
    setAllAppointments(p=>p.map(updater));
    setRescheduleReqs(p=>p.filter(r=>r.id!==appt.id));
    await supabase.from("notifications").insert({user_id:appt.patient_id,type:"general",title:"Appointment updated",body:`Your appointment was moved to ${new Date(newDate+"T"+newTime).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}.`});
  }
  async function approveRescheduleAsRequested(appt){
    const n=normalizeRescheduleRequest(appt.reschedule_request);
    if(!n?.patient?.date||!n?.patient?.time) return;
    await confirmReschedule(appt,n.patient.date,n.patient.time);
  }
  async function suggestRescheduleTime(appt,newDate,newTime){
    const n=normalizeRescheduleRequest(appt.reschedule_request);
    if(!n?.patient?.date||!n?.patient?.time) return;
    const payload=buildDoctorCounterPayload(n.patient,{date:newDate,time:newTime});
    await supabase.from("appointments").update({reschedule_request:payload,status:"scheduled",updated_at:new Date().toISOString()}).eq("id",appt.id);
    const updater=a=>a.id===appt.id?{...a,status:"scheduled",reschedule_request:payload}:a;
    setAppointments(p=>p.map(updater));
    setAllAppointments(p=>p.map(updater));
    setRescheduleReqs(p=>p.map(r=>r.id===appt.id?{...r,reschedule_request:payload}:r));
    await supabase.from("notifications").insert({user_id:appt.patient_id,type:"general",title:"New time suggested",body:`Dr. ${name} suggested ${new Date(newDate+"T"+newTime).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}. Open Appointments to accept or decline.`});
  }
  async function rejectReschedule(appt,message){
    await supabase.from("appointments").update({status:"scheduled",reschedule_request:null,updated_at:new Date().toISOString()}).eq("id",appt.id);
    const updater=a=>a.id===appt.id?{...a,status:"scheduled",reschedule_request:null}:a;
    setAppointments(p=>p.map(updater));
    setAllAppointments(p=>p.map(updater));
    setRescheduleReqs(p=>p.filter(r=>r.id!==appt.id));
    await supabase.from("notifications").insert({user_id:appt.patient_id,type:"general",title:"Reschedule not approved",body:message});
  }
  async function denyOrWithdrawReschedule(appt,message){
    const n=normalizeRescheduleRequest(appt.reschedule_request);
    if(n?.phase==="doctor_counter"){
      const back=buildPatientRescheduleRequestPayload({date:n.patient.date,time:n.patient.time});
      await supabase.from("appointments").update({reschedule_request:back,status:"scheduled",updated_at:new Date().toISOString()}).eq("id",appt.id);
      const updater=a=>a.id===appt.id?{...a,status:"scheduled",reschedule_request:back}:a;
      setAppointments(p=>p.map(updater));
      setAllAppointments(p=>p.map(updater));
      setRescheduleReqs(p=>p.map(r=>r.id===appt.id?{...r,reschedule_request:back}:r));
      await supabase.from("notifications").insert({user_id:appt.patient_id,type:"general",title:"Counter-offer withdrawn",body:message||"Your original reschedule request is still pending review."});
      return;
    }
    await rejectReschedule(appt,message);
  }
  async function dismissOrRemoveWaiting({patientId,windowStartMs,windowEndMs,roomId}){
    if(!user?.id||!patientId||!roomId) return;
    const body=createVideoWaitingDismissedMessageBody({
      roomId,
      windowStartIso:new Date(windowStartMs).toISOString(),
      windowEndIso:new Date(windowEndMs).toISOString(),
    });
    if(!body) return;
    const{error}=await supabase.from("patient_messages").insert({sender_id:user.id,recipient_id:patientId,body});
    if(error&&typeof window!=="undefined") window.alert("Could not update waiting room. Try again.");
  }
  async function completeVideoVisitForAppointment(appt){
    if(!appt?.id||!user?.id) return;
    const t=String(appt.time||"");
    const tNorm=t.length===5?`${t}:00`:t;
    try{
      const window=getAppointmentVideoWindow(appt);
      if(window&&appt.patient_id&&appt.doctor_id===user.id){
        const roomId=buildVideoRoomId(user.id,appt.patient_id);
        const body=createVideoSessionEndedMessageBody({
          roomId,
          windowStartIso:new Date(window.windowStartMs).toISOString(),
          windowEndIso:new Date(window.windowEndMs).toISOString(),
        });
        if(body){
          const{data:vidMsg,error:veErr}=await supabase.from("patient_messages").insert({sender_id:user.id,recipient_id:appt.patient_id,body}).select("*").single();
          if(veErr){
            console.error("VIDEO_VISIT_ENDED insert:",veErr.message);
          }else if(vidMsg){
            notifyRecipientNewChatMessage({
              recipientId:appt.patient_id,
              senderName:`Dr. ${name}`,
              messageText:formatChatNotificationPreview(body),
              relatedMessageId:vidMsg?.id,
              title:"Video visit ended",
            });
            if(msgMode==="patients"&&selChat?.id===appt.patient_id){ setMessages((prev)=>sortMsgs([...prev,vidMsg])); }
          }
        }
      }
    }catch(e){
      console.error("completeVideoVisitForAppointment VIDEO_VISIT_ENDED:",e?.message||e);
    }
    await supabase.from("appointments").update({
      status:"completed",
      virtual_visit_status: VS.COMPLETED,
      updated_at:new Date().toISOString(),
    }).eq("id",appt.id);
    const updater=a=>a.id===appt.id?{...a,status:"completed",virtual_visit_status:VS.COMPLETED}:a;
    setAllAppointments(p=>p.map(updater));
    setAppointments(p=>p.map(updater));
    const label=appt.date?new Date(`${appt.date}T${tNorm||"12:00:00"}`).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";
    await supabase.from("notifications").insert({user_id:appt.patient_id,type:"general",title:"Visit completed",body:`Your virtual visit for ${label} is marked complete.`});
  }
  async function approveUrgentVideoVisit(req){
    if(!user?.id||!req?.id)return;
    setUrgentVisitBusyId(req.id);
    try{
      const tRaw=String(req.requested_time||"12:00:00");
      const timeSql=tRaw.length===5?`${tRaw}:00`:tRaw.length>=8?tRaw.slice(0,8):`${tRaw}:00`;
      const {data:appt,error}=await supabase.from("appointments").insert({
        patient_id:req.patient_id,
        doctor_id:user.id,
        date:req.requested_date,
        time:timeSql,
        type:"Virtual Visit",
        notes:req.reason?"Urgent visit: "+String(req.reason).slice(0,500):null,
        status:"scheduled",
        virtual_visit_status: VS.PENDING,
      }).select("*").single();
      if(error)throw error;
      const {error:updErr}=await supabase.from("video_visit_requests").update({
        status:"approved",
        appointment_id:appt.id,
        updated_at:new Date().toISOString(),
      }).eq("id",req.id).eq("doctor_id",user.id);
      if(updErr)throw updErr;
      setDoctorVideoVisitRequests(prev=>prev.map(r=>r.id===req.id?{...r,status:"approved",appointment_id:appt.id}:r));
      setAllAppointments(prev=>prev.some(a=>a.id===appt.id)?prev:[...prev,appt]);
      const patientFirst=name.split(" ")[0]||"Your doctor";
      const label=new Date(`${req.requested_date}T${timeSql}`).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
      await supabase.from("notifications").insert({
        user_id:req.patient_id,
        type:"general",
        title:"Visit request approved",
        body:`Dr. ${patientFirst} approved your visit for ${label}. Open Appointments to join during your virtual window.`,
      });
    }catch(e){
      if(typeof window!=="undefined")window.alert(String(e?.message||"Could not approve request."));
    }finally{
      setUrgentVisitBusyId(null);
    }
  }
  async function denyUrgentVideoVisit(req){
    if(!user?.id||!req?.id)return;
    setUrgentVisitBusyId(req.id);
    try{
      const {error}=await supabase.from("video_visit_requests").update({
        status:"denied",
        denial_note:null,
        updated_at:new Date().toISOString(),
      }).eq("id",req.id).eq("doctor_id",user.id);
      if(error)throw error;
      setDoctorVideoVisitRequests(prev=>prev.map(r=>r.id===req.id?{...r,status:"denied",denial_note:null}:r));
      await supabase.from("notifications").insert({
        user_id:req.patient_id,
        type:"general",
        title:"Visit request denied",
        body:"Your visit request could not be approved at this time. Book a regular appointment or message your doctor if you still need care.",
      });
    }catch(e){
      if(typeof window!=="undefined")window.alert(String(e?.message||"Could not deny request."));
    }finally{
      setUrgentVisitBusyId(null);
    }
  }
  async function proposeAlternateUrgentVisit(req){
    if(!user?.id||!req?.id)return;
    if(typeof window==="undefined")return;
    const dateDefault=(req.doctor_suggested_date||req.requested_date||"").slice(0,10);
    const dateStr=window.prompt("Suggested visit date (YYYY-MM-DD):",dateDefault||"");
    if(dateStr===null)return;
    const dateTrim=dateStr.trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateTrim)){
      window.alert("Use YYYY-MM-DD for the date.");
      return;
    }
    const timeDefault=
      req.doctor_suggested_time&&req.doctor_suggested_date===dateTrim
        ?String(req.doctor_suggested_time).slice(0,5)
        :req.requested_time&&req.requested_date===dateTrim
          ?String(req.requested_time).slice(0,5)
          : "";
    const timeStr=window.prompt("Suggested time (HH:MM, 24-hour):",timeDefault);
    if(timeStr===null)return;
    const m=String(timeStr).trim().match(/^(\d{1,2}):(\d{2})$/);
    if(!m){
      window.alert('Use HH:MM for time (e.g. 14:30).');
      return;
    }
    const hh=Math.min(23,Math.max(0,parseInt(m[1],10)));
    const mm=Math.min(59,Math.max(0,parseInt(m[2],10)));
    const timeSql=`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00`;
    setUrgentVisitBusyId(req.id);
    try{
      const {error}=await supabase.from("video_visit_requests").update({
        doctor_suggested_date:dateTrim,
        doctor_suggested_time:timeSql,
        updated_at:new Date().toISOString(),
      }).eq("id",req.id).eq("doctor_id",user.id).eq("status","pending");
      if(error)throw error;
      setDoctorVideoVisitRequests(prev=>prev.map(r=>r.id===req.id?{...r,doctor_suggested_date:dateTrim,doctor_suggested_time:timeSql}:r));
      const docFirst=name.split(" ")[0]||"Your doctor";
      const label=new Date(`${dateTrim}T${timeSql}`).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
      await supabase.from("notifications").insert({
        user_id:req.patient_id,
        type:"general",
        title:"Different time suggested",
        body:`Dr. ${docFirst} suggested ${label} instead. Open Appointments and the Requests tab to review.`,
      });
    }catch(e){
      if(typeof window!=="undefined")window.alert(String(e?.message||"Could not save suggestion."));
    }finally{
      setUrgentVisitBusyId(null);
    }
  }
  async function addNote(){
    if(!note.trim()||!selPat)return;setNoteBusy(true);
    try{const{data:nd,error}=await supabase.from("doctor_notes").insert({doctor_id:user.id,patient_id:selPat.id,note:note.trim()}).select("id,created_at").single();if(error)throw error;setNotes(n=>[{id:nd.id,note:note.trim(),createdAt:nd.created_at},...n]);setNote("");setNoteSaved(true);setTimeout(()=>setNoteSaved(false),2500);}
    catch(e){}finally{setNoteBusy(false);}
  }
  async function saveEditNote(){
    if(!editNote?.text?.trim())return;setNoteBusy(true);
    try{await supabase.from("doctor_notes").update({note:editNote.text.trim()}).eq("id",editNote.id);setNotes(ns=>ns.map(n=>n.id===editNote.id?{...n,note:editNote.text.trim()}:n));setEditNote(null);}
    catch(e){}finally{setNoteBusy(false);}
  }
  async function deleteNote(id){try{await supabase.from("doctor_notes").delete().eq("id",id);setNotes(ns=>ns.filter(n=>n.id!==id));}catch(e){}}
  async function deletePatient(patId){
    setDeleteBusy(true);
    try{
      await supabase.from("doctor_notes").delete().eq("doctor_id",user.id).eq("patient_id",patId);
      await supabase.from("prescriptions").delete().eq("doctor_id",user.id).eq("patient_id",patId);
      await supabase.from("doctor_patients").delete().eq("doctor_id",user.id).eq("patient_id",patId);
      setPatients(ps=>ps.filter(p=>p.id!==patId));setDeleteConfirm(null);setSelPat(null);
    }catch(e){}finally{setDeleteBusy(false);}
  }
  const filtered=patients.filter(p=>!search||(p.fullName||"").toLowerCase().includes(search.toLowerCase())||(p.email||"").toLowerCase().includes(search.toLowerCase()));
  const patientNameById=useMemo(()=>{
    const map={};
    (patients||[]).forEach((p)=>{ if(p?.id) map[p.id]=p.fullName||p.email||"Patient"; });
    return map;
  },[patients]);
  const videoSessionByWindowKey=useMemo(()=>{
    const m={};
    const upd=(key,field,ts)=>{
      if(!m[key]) m[key]={ lastCheckin:null, lastStarted:null, lastDismissed:null, lastEnded:null };
      const o=m[key];
      if(!o[field]||String(ts).localeCompare(String(o[field]))>0) o[field]=ts;
    };
    (videoEventRows||[]).forEach((row)=>{
      const b=row.body||"";
      if(b.startsWith(`${VIDEO_WAITING_CHECKIN_PREFIX}|`)){
        const p=parseVideoWaitingCheckinMessageBody(b);
        if(!p) return;
        const patientId=row.sender_id;
        const key=`${patientId}|${p.windowStartMs}|${p.windowEndMs}`;
        upd(key,"lastCheckin",row.created_at);
        return;
      }
      if(b.startsWith(`${VIDEO_CALL_STARTED_PREFIX}|`)){
        const p=parseVideoApprovalMessageBody(b);
        if(!p||p.eventType!=="started") return;
        const patientId=row.recipient_id;
        const key=`${patientId}|${p.windowStartMs}|${p.windowEndMs}`;
        upd(key,"lastStarted",row.created_at);
        return;
      }
      if(b.startsWith(`${VIDEO_VISIT_ENDED_PREFIX}|`)){
        const p=parseVideoApprovalMessageBody(b);
        if(!p||p.eventType!=="ended") return;
        const patientId=row.recipient_id;
        const key=`${patientId}|${p.windowStartMs}|${p.windowEndMs}`;
        upd(key,"lastEnded",row.created_at);
        return;
      }
      if(b.startsWith(`${VIDEO_WAITING_DISMISSED_PREFIX}|`)){
        const p=parseVideoWaitingDismissedMessageBody(b);
        if(!p) return;
        const patientId=row.recipient_id;
        const key=`${patientId}|${p.windowStartMs}|${p.windowEndMs}`;
        upd(key,"lastDismissed",row.created_at);
      }
    });
    return m;
  },[videoEventRows]);
  const virtualAppointments=useMemo(()=>{
    return (allAppointments||[])
      .filter(a=>
        ["scheduled","rescheduled"].includes(String(a?.status||"")) &&
        a?.status!=="completed" &&
        isVideoStyleVisitType(a) &&
        a?.patient_id &&
        a?.date &&
        a?.time
      )
      .map(a=>{
        const window=getAppointmentVideoWindow(a);
        if(!window) return null;
        return {appt:a,window};
      })
      .filter(Boolean)
      .filter((row)=>{
        const pe=row.window.portalEndMs ?? row.window.windowEndMs;
        return videoNowMs<=pe;
      })
      .sort((x,y)=>x.window.startMs-y.window.startMs);
  },[allAppointments,videoNowMs]);
  const waitingRoomList=useMemo(()=>{
    const list=[];
    Object.keys(videoSessionByWindowKey).forEach((k)=>{
      const st=videoSessionByWindowKey[k];
      if(!st.lastCheckin) return;
      if(st.lastStarted&&String(st.lastStarted).localeCompare(String(st.lastCheckin))>0){
        const stillInVisit=!st.lastEnded||String(st.lastStarted).localeCompare(String(st.lastEnded))>0;
        if(stillInVisit) return;
      }
      if(st.lastEnded&&String(st.lastEnded).localeCompare(String(st.lastCheckin))>0) return;
      if(st.lastDismissed&&String(st.lastDismissed).localeCompare(String(st.lastCheckin))>0) return;
      const parts=k.split("|");
      const patientId=parts[0];
      const windowStartMs=Number(parts[1]);
      const windowEndMs=Number(parts[2]);
      if(Number.isNaN(windowStartMs)||Number.isNaN(windowEndMs)) return;
      const portalEndMs = windowEndMs + VIDEO_VISIT_PORTAL_TAIL_MS;
      if (videoNowMs > portalEndMs) return;
      list.push({ patientId, windowStartMs, windowEndMs, checkedInAt: st.lastCheckin });
    });
    const haveKey=new Set(list.map(w=>`${w.patientId}|${w.windowStartMs}|${w.windowEndMs}`));
    (virtualAppointments||[]).forEach(({appt,window})=>{
      if(getEffectiveVirtualVisitStatus(appt)!==VS.WAITING_FOR_DOCTOR) return;
      const k=`${appt.patient_id}|${window.windowStartMs}|${window.windowEndMs}`;
      if(haveKey.has(k)) return;
      const portalEndMs=window.windowEndMs + VIDEO_VISIT_PORTAL_TAIL_MS;
      if(videoNowMs > portalEndMs) return;
      haveKey.add(k);
      list.push({
        patientId:appt.patient_id,
        windowStartMs:window.windowStartMs,
        windowEndMs:window.windowEndMs,
        checkedInAt:appt.updated_at || new Date().toISOString(),
      });
    });
    const byPatient={};
    list.forEach((row)=>{
      const prev=byPatient[row.patientId];
      if(!prev||String(row.checkedInAt).localeCompare(String(prev.checkedInAt))>0){
        byPatient[row.patientId]=row;
      }
    });
    return Object.values(byPatient).sort((a,b)=>a.windowStartMs-b.windowStartMs);
  },[videoSessionByWindowKey,videoNowMs,virtualAppointments]);
  const inVisitByWindowKey=useMemo(()=>{
    const map={};
    Object.keys(videoSessionByWindowKey).forEach((k)=>{
      const st=videoSessionByWindowKey[k];
      const startedAfterCheckin=!st.lastCheckin||String(st.lastStarted).localeCompare(String(st.lastCheckin))>0;
      const stillInVisit=!!st.lastStarted&&startedAfterCheckin&&(!st.lastEnded||String(st.lastStarted).localeCompare(String(st.lastEnded))>0);
      map[k]=stillInVisit;
    });
    return map;
  },[videoSessionByWindowKey]);
  const waitingLookup=useMemo(()=>{
    const map={};
    waitingRoomList.forEach((w)=>{
      map[`${w.patientId}|${w.windowStartMs}|${w.windowEndMs}`]=w;
    });
    return map;
  },[waitingRoomList]);
  const activeVirtualCount=useMemo(()=>virtualAppointments.filter((row)=>{
    const pe=row.window.portalEndMs ?? row.window.windowEndMs;
    return videoNowMs>=row.window.windowStartMs && videoNowMs<=pe;
  }).length,[videoNowMs,virtualAppointments]);
  const greetHour=new Date().getHours();
  const docGreet=greetHour<12?"Good morning":greetHour<17?"Good afternoon":"Good evening";
  const patientChatFilter=chatSearchEmail.trim().toLowerCase();
  const filteredPatientChats=patientChatFilter
    ? patientChatContacts.filter(c=>(c.name||"").toLowerCase().includes(patientChatFilter)||(c.email||"").toLowerCase().includes(patientChatFilter))
    : patientChatContacts;
  const FLAG_CONFIG={none:{label:"No flag",color:t3,bg:"var(--s2)",border:b1},stable:{label:"Stable",color:"var(--gr)",bg:"rgba(5,150,105,.1)",border:"rgba(5,150,105,.25)"},"follow-up":{label:"Follow-up",color:"var(--am)",bg:"rgba(217,119,6,.1)",border:"rgba(217,119,6,.25)"},urgent:{label:"Urgent",color:"var(--ro)",bg:"rgba(185,28,28,.1)",border:"rgba(185,28,28,.25)"}};
  const TabBtn=({id,label,count})=>(
    <motion.button type="button" whileTap={{scale:.96}} onClick={()=>setActiveTab(id)}
      className={`whitespace-nowrap shrink-0 ${isMob?"snap-start":""}`}
      style={{padding:isMob?"7px 14px":"8px 18px",borderRadius:99,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:isMob?11.5:12.5,fontWeight:700,transition:"all .18s",background:activeTab===id?DocAC:"var(--s2)",color:activeTab===id?"#fff":t3,boxShadow:activeTab===id?"0 4px 14px rgba(14,116,144,.3)":"none",display:"flex",alignItems:"center",gap:6}}>
      {label}{count!==undefined&&<span style={{background:activeTab===id?"rgba(255,255,255,.3)":"var(--b1)",borderRadius:99,padding:"1px 7px",fontSize:10.5,fontWeight:800}}>{count}</span>}
    </motion.button>
  );
  const VitalField=({label,value,field,placeholder,unit})=>(
    <div className="min-w-0">
      <label style={{display:"block",fontSize:10,fontWeight:800,letterSpacing:".1em",textTransform:"uppercase",color:t3,marginBottom:5}}>{label}</label>
      <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
        <input className="inp min-w-0 flex-1" value={value} placeholder={placeholder} onChange={e=>setVitals(v=>({...v,[field]:e.target.value}))} style={{borderRadius:11,fontSize:16,padding:"9px 12px"}}/>
        {unit&&<span style={{color:t3,fontSize:12,flexShrink:0}}>{unit}</span>}
      </div>
    </div>
  );
  return (
    <div style={{display:"flex",height:"100dvh",overflow:"hidden",background:"var(--bg)"}}>
      {!isMob&&(
        <aside className="sidebar">
          <div style={{padding:"22px 14px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:11,background:"var(--doc-pd)",border:"1px solid rgba(14,116,144,.28)",display:"flex",alignItems:"center",justifyContent:"center"}}><Stethoscope size={17} color={DocAC}/></div>
              <div><p style={{fontSize:15,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700}}><span style={{color:t1}}>Med</span><span style={{color:DocAC}}>Track</span></p><p className="gt" style={{fontSize:9,color:DocAC}}>DOCTOR PORTAL</p></div>
            </div>
          </div>
          <div style={{height:1,background:"var(--b0)",margin:"0 12px 12px"}}/>
          <div style={{margin:"0 10px 14px",padding:"12px 14px",borderRadius:13,background:"var(--doc-pd)",border:"1px solid rgba(14,116,144,.18)"}}>
            <p style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginBottom:3}}>Your patients</p>
            <p style={{color:DocAC,fontSize:26,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700,margin:0}}>{patients.length}</p>
          </div>
          <nav style={{flex:1,padding:"0 7px",display:"flex",flexDirection:"column",gap:2}}>
            {[["dashboard","Dashboard",HeartPulse],["availability","Availability",Calendar],["virtual","Virtual Visits",Video],["patients","Patients",User],["messages","Messages",MessageSquare]].map(([id,l,I])=>(
              <div key={id} className={`nl ${page===id?"doc-on":""}`} onClick={()=>{setPage(id);setSelPat(null);}}>
                <I size={15}/>{l}
                {id==="availability"&&availabilitySlotCount>0&&<span style={{marginLeft:"auto",background:DocAC,color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{availabilitySlotCount}</span>}
                {id==="virtual"&&activeVirtualCount>0&&<span style={{marginLeft:"auto",background:"var(--gr)",color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{activeVirtualCount}</span>}
                {id==="patients"&&patients.length>0&&<span style={{marginLeft:"auto",background:DocAC,color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{patients.length}</span>}
                {id==="messages"&&totalChatUnread>0&&<span style={{marginLeft:"auto",background:"var(--ro)",color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{totalChatUnread}</span>}
              </div>
            ))}
          </nav>
          <div style={{padding:"6px 7px 22px",display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px"}}>
              <span style={{display:"flex",alignItems:"center",gap:7,color:t3,fontSize:12}}>{light?<Sun size={13} color="var(--am)"/>:<Moon size={13}/>} {light?"Light":"Dark"}</span>
              <div className={`sw ${!light?"on":""}`} onClick={()=>setLight(!light)}/>
            </div>
            <button onClick={handleSignOut} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 10px",borderRadius:10,border:"none",background:"transparent",cursor:"pointer",color:"var(--ro)",fontFamily:"inherit",fontSize:12,fontWeight:500,width:"100%"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(220,38,38,.07)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><LogOut size={13}/> Sign Out</button>
          </div>
        </aside>
      )}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0,overflow:"hidden"}}>
        <header className="tb">
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button
              type="button"
              aria-label="Open portal menu"
              onClick={()=>setMobMenu(true)}
              style={{width:34,height:34,borderRadius:10,border:`1px solid ${b1}`,background:"var(--s1)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3,flexShrink:0}}
            >
              <MoreHorizontal size={16}/>
            </button>
            <Stethoscope size={16} color={DocAC}/>
            <span style={{color:t1,fontSize:15,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700}}>Dr. {name}</span>
            {!isMob&&<span className="role-badge role-doctor">Doctor</span>}
            <motion.button whileHover={{scale:1.1}} whileTap={{scale:.9}} onClick={()=>setShowNickname(true)} title="Edit display name" style={{width:24,height:24,borderRadius:7,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3,flexShrink:0}}><Pencil size={11}/></motion.button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {/* Notification bell */}
            <button onClick={()=>setShowNotifPanel(p=>!p)} style={{position:"relative",width:34,height:34,borderRadius:10,border:`1px solid ${b1}`,background:showNotifPanel?"var(--doc-pd)":"var(--s1)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:unreadNotifCount>0?DocAC:t3}}>
              <Bell size={15}/>
              {unreadNotifCount>0&&<span style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",background:"var(--ro)",color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{unreadNotifCount>9?"9+":unreadNotifCount}</span>}
            </button>
            {/* AI assistant */}
            <button onClick={()=>setShowDocAI(p=>!p)} style={{width:34,height:34,borderRadius:10,border:`1px solid ${b1}`,background:showDocAI?"var(--doc-pd)":"var(--s1)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:showDocAI?DocAC:t3}}>
              <Sparkles size={15}/>
            </button>
            <button onClick={()=>setLight(!light)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 13px",borderRadius:99,border:`1px solid ${b1}`,background:"var(--s1)",cursor:"pointer",fontSize:12,fontWeight:600,color:t2}}>
              {light?<Moon size={13} color={DocAC}/>:<Sun size={13} color="var(--am)"/>}{!isMob&&(light?"Dark":"Light")}
            </button>
          </div>
        </header>
        <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,overflow:"hidden",paddingBottom:isMob&&!(page==="messages"&&selChat)?"calc(66px + env(safe-area-inset-bottom, 0px))":0}}>
          {}
          {page==="messages"&&(
            <div style={{flex:1,display:"flex",overflow:"hidden",flexDirection:isMob?"column":"row",minHeight:0}}>
              {(!isMob||!selChat)&&(
              <div style={{width:isMob?"100%":280,flexShrink:0,borderRight:isMob?"none":`1px solid ${b1}`,borderBottom:isMob?`1px solid ${b1}`:"none",display:"flex",flexDirection:"column",background:"var(--s1)",minHeight:0,overflow:"hidden"}}>
                <div style={{padding:"14px 16px",borderBottom:`1px solid ${b1}`}}>
                  <div style={{display:"flex",gap:6,marginBottom:10}}>
                    {[
                      ["pharmacy","Pharmacy",unreadCount],
                      ["patients","Patients",unreadPatientCount],
                    ].map(([id,label,badge])=>(
                      <button key={id} type="button" onClick={()=>{
                        setMsgMode(id);
                        setSelChat(null);
                      }}
                        style={{
                          flex:1,padding:"8px 10px",borderRadius:10,border:msgMode===id?`2px solid ${DocAC}`:`1px solid ${b1}`,
                          background:msgMode===id?"var(--doc-pd)":"var(--s2)",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,color:t1,
                          display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                        }}>
                        {label}
                        {badge>0&&<span style={{background:"var(--ro)",color:"#fff",borderRadius:99,fontSize:9,fontWeight:800,padding:"1px 6px"}}>{badge}</span>}
                      </button>
                    ))}
                  </div>
                  <h2 style={{color:t1,fontSize:15,fontWeight:700,margin:0,display:"flex",alignItems:"center",gap:8}}>
                    <MessageSquare size={14} color={DocAC}/> {msgMode==="pharmacy"?"Pharmacy chat":"Patient messages"}
                  </h2>
                  {msgMode==="pharmacy"?(
                  <div style={{marginTop:10,display:"flex",flexDirection:isMob?"column":"row",gap:7}}>
                    <input className="inp" type="email" value={chatSearchEmail} onChange={e=>setChatSearchEmail(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")findPharmacistByEmail();}} placeholder="Find pharmacist by email…" style={{flex:1,padding:"7px 11px",borderRadius:10,fontSize:isMob?16:12}}/>
                    <motion.button whileTap={{scale:.93}} onClick={findPharmacistByEmail} disabled={chatSearchBusy||!chatSearchEmail.trim()}
                      style={{padding:"7px 12px",borderRadius:10,border:"none",background:chatSearchEmail.trim()?DocAC:"var(--b1)",color:chatSearchEmail.trim()?"#fff":t3,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,flexShrink:0,width:isMob?"100%":"auto"}}>
                      {chatSearchBusy?<Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/>:<Search size={13}/>}
                    </motion.button>
                  </div>
                  ):(
                  <div style={{marginTop:10}}>
                    <input className="inp" value={chatSearchEmail} onChange={e=>setChatSearchEmail(e.target.value)} placeholder="Search patients by name or email…" style={{width:"100%",padding:"7px 11px",borderRadius:10,fontSize:isMob?16:12,boxSizing:"border-box"}}/>
                  </div>
                  )}
                  <AnimatePresence>
                    {msgMode==="pharmacy"&&chatSearchMsg&&(
                      <motion.p initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                        style={{fontSize:11.5,marginTop:6,color:chatSearchMsg.type==="ok"?"var(--gr)":"var(--ro)",fontWeight:600}}>
                        {chatSearchMsg.text}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
                  {msgMode==="pharmacy"?(chatContacts.length===0?(
                    <div style={{padding:"30px 16px",textAlign:"center"}}>
                      <Search size={22} color={t3} style={{opacity:.2,margin:"0 auto 10px",display:"block"}}/>
                      <p style={{color:t3,fontSize:12}}>Search for a pharmacist by email above</p>
                    </div>
                  ):chatContacts.map(contact=>{
                    const isActive=selChat?.id===contact.id;
                    const unread=unreadPerContact[contact.id]||0;
                    const isOnline=!!onlineUsers[contact.id];
                    return (
                      <div key={contact.id} onClick={()=>{setMsgMode("pharmacy");setSelChat(contact);}}
                        style={{padding:"12px 16px",cursor:"pointer",borderBottom:"1px solid var(--b0)",background:isActive?"rgba(14,116,144,.07)":unread>0?"rgba(14,116,144,.03)":"transparent",borderLeft:`3px solid ${isActive?DocAC:unread>0?"var(--doc-p)":"transparent"}`,transition:"all .15s"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{position:"relative",flexShrink:0}}>
                            <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#6d28d9)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <span style={{color:"#fff",fontSize:14,fontWeight:800}}>{contact.name[0]?.toUpperCase()||"P"}</span>
                            </div>
                            <div style={{position:"absolute",bottom:1,right:1,width:9,height:9,borderRadius:"50%",background:isOnline?"#22c55e":"var(--b1)",border:"2px solid var(--s1)",transition:"background .4s"}}/>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <p style={{color:t1,fontSize:13,fontWeight:unread>0?800:700,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{contact.name}</p>
                            <p style={{color:unread>0?DocAC:t3,fontSize:11,margin:"2px 0 0",fontWeight:unread>0?700:400}}>
                              {isOnline?"Online now":contact.lastMessageAt?new Date(contact.lastMessageAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):contact.pharmacy}
                            </p>
                          </div>
                          {unread>0&&(
                            <span style={{background:"var(--doc-p)",color:"#fff",borderRadius:99,fontSize:10,fontWeight:800,padding:"2px 7px",flexShrink:0,minWidth:20,textAlign:"center"}}>{unread}</span>
                          )}
                          {isActive&&!unread&&<div style={{width:7,height:7,borderRadius:"50%",background:DocAC}}/>}
                        </div>
                      </div>
                    );
                  })):(filteredPatientChats.length===0?(
                    <div style={{padding:"30px 16px",textAlign:"center"}}>
                      <User size={22} color={t3} style={{opacity:.2,margin:"0 auto 10px",display:"block"}}/>
                      <p style={{color:t3,fontSize:12}}>{patientChatContacts.length===0?"Add patients under Patients to message them here.":"No patients match your search."}</p>
                    </div>
                  ):filteredPatientChats.map(contact=>{
                    const isActive=selChat?.id===contact.id;
                    const unread=unreadPerPatient[contact.id]||0;
                    const isOnline=!!onlineUsers[contact.id];
                    return (
                      <div key={contact.id} onClick={()=>{setMsgMode("patients");setSelChat(contact);}}
                        style={{padding:"12px 16px",cursor:"pointer",borderBottom:"1px solid var(--b0)",background:isActive?"rgba(14,116,144,.07)":unread>0?"rgba(14,116,144,.03)":"transparent",borderLeft:`3px solid ${isActive?DocAC:unread>0?"var(--doc-p)":"transparent"}`,transition:"all .15s"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{position:"relative",flexShrink:0}}>
                            <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#0e7490,#155e75)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <span style={{color:"#fff",fontSize:14,fontWeight:800}}>{contact.name[0]?.toUpperCase()||"P"}</span>
                            </div>
                            <div style={{position:"absolute",bottom:1,right:1,width:9,height:9,borderRadius:"50%",background:isOnline?"#22c55e":"var(--b1)",border:"2px solid var(--s1)",transition:"background .4s"}}/>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <p style={{color:t1,fontSize:13,fontWeight:unread>0?800:700,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{contact.name}</p>
                            <p style={{color:unread>0?DocAC:t3,fontSize:11,margin:"2px 0 0",fontWeight:unread>0?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {isOnline?"Online now":contact.lastMessageAt?new Date(contact.lastMessageAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):(contact.email||"Patient")}
                            </p>
                          </div>
                          {unread>0&&(
                            <span style={{background:"var(--doc-p)",color:"#fff",borderRadius:99,fontSize:10,fontWeight:800,padding:"2px 7px",flexShrink:0,minWidth:20,textAlign:"center"}}>{unread}</span>
                          )}
                          {isActive&&!unread&&<div style={{width:7,height:7,borderRadius:"50%",background:DocAC}}/>}
                        </div>
                      </div>
                    );
                  }))}
                </div>
              </div>
              )} {}
              {(!isMob||selChat)&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0,overflow:"hidden"}}>
                {!selChat?(
                  <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
                    <MessageSquare size={32} color={t3} style={{opacity:.2}}/>
                    <p style={{color:t2,fontSize:14,fontWeight:600}}>Select a conversation to view messages.</p>
                  </div>
                ):(
                  <>
                    <div style={{padding:isMob?"10px 12px":"13px 20px",borderBottom:`1px solid ${b1}`,background:"var(--s1)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexShrink:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:isMob?10:13,flex:1,minWidth:0}}>
                        {isMob&&(<button type="button" onClick={()=>setSelChat(null)} style={{width:32,height:32,borderRadius:9,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3,flexShrink:0}}><ArrowRight size={14} style={{transform:"rotate(180deg)"}}/></button>)}
                        <div style={{width:isMob?38:42,height:isMob?38:42,borderRadius:"50%",background:peerIsPatient?"linear-gradient(135deg,#0e7490,#155e75)":"linear-gradient(135deg,#7c3aed,#6d28d9)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{color:"#fff",fontSize:isMob?14:16,fontWeight:800}}>{selChat.name[0]?.toUpperCase()}</span>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <p className="truncate" style={{color:t1,fontSize:isMob?13:14,fontWeight:700,margin:0}}>{selChat.name}</p>
                          <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:onlineUsers[selChat.id]?"#22c55e":"var(--b1)",boxShadow:onlineUsers[selChat.id]?"0 0 5px #22c55e":"none",transition:"all .4s",flexShrink:0}}/>
                            <p style={{color:onlineUsers[selChat.id]?"#22c55e":t3,fontSize:11,margin:0,fontWeight:onlineUsers[selChat.id]?600:400}}>
                              {onlineUsers[selChat.id]?"Online now":"Offline"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {peerIsPatient&&(
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <button
                          type="button"
                          onClick={openVideoVisit}
                          disabled={videoApprovalBusy||videoEndBusy}
                          title="Start video visit"
                          style={{
                            width:isMob?44:40,
                            height:isMob?44:40,
                            borderRadius:10,
                            border:`1px solid ${b1}`,
                            background:"var(--s1)",
                            color:DocAC,
                            display:"grid",
                            placeItems:"center",
                            cursor:(videoApprovalBusy||videoEndBusy)?"not-allowed":"pointer",
                            opacity:(videoApprovalBusy||videoEndBusy)?0.55:1,
                            fontFamily:"inherit",
                          }}
                          aria-label="Start video call"
                        >
                          {videoApprovalBusy?<Loader2 size={18} style={{animation:"spin360 .7s linear infinite"}}/>:<Video size={18}/>}
                        </button>
                        <button
                          type="button"
                          onClick={endVideoVisitForPatient}
                          disabled={videoApprovalBusy||videoEndBusy}
                          title="End video visit — patient can no longer join until you start again"
                          style={{
                            width:isMob?44:40,
                            height:isMob?44:40,
                            borderRadius:10,
                            border:`1px solid rgba(185,28,28,.3)`,
                            background:"var(--s1)",
                            color:"var(--ro)",
                            display:"grid",
                            placeItems:"center",
                            cursor:(videoApprovalBusy||videoEndBusy)?"not-allowed":"pointer",
                            opacity:(videoApprovalBusy||videoEndBusy)?0.55:1,
                            fontFamily:"inherit",
                          }}
                          aria-label="End video visit"
                        >
                          {videoEndBusy?<Loader2 size={18} style={{animation:"spin360 .7s linear infinite"}}/>:<PhoneOff size={17}/>}
                        </button>
                        </div>
                        )}
                        <button
                          type="button"
                          onClick={()=>{setShowSoundSettings(p=>!p);setShowPatPicker(false);}}
                          title={soundEnabled?"Message sounds on":"Message sounds off"}
                          style={{
                            width:isMob?44:40,
                            height:isMob?44:40,
                            borderRadius:10,
                            border:`1px solid ${b1}`,
                            background:showSoundSettings?"rgba(14,116,144,.14)":"var(--s1)",
                            color:soundEnabled?DocAC:t3,
                            display:"grid",
                            placeItems:"center",
                            cursor:"pointer",
                            fontFamily:"inherit",
                          }}
                          aria-expanded={showSoundSettings}
                          aria-label="Message notification sounds"
                        >
                          {soundEnabled?<Bell size={18}/>:<BellOff size={18}/>}
                        </button>
                        <span className={peerIsPatient?"role-badge role-patient":"role-badge role-pharmacist"}>{peerIsPatient?"Patient":"Pharmacist"}</span>
                      </div>
                    </div>
                    {showSoundSettings?(
                      <div style={{padding:"12px 14px",borderBottom:`1px solid ${b1}`,background:"var(--s2)"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                          <span style={{color:t1,fontSize:12,fontWeight:700}}>New message sounds</span>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{color:soundEnabled?"#16a34a":t3,fontSize:11,fontWeight:600}}>{soundEnabled?"On":"Off"}</span>
                            <div className={`sw ${soundEnabled?"on":""}`} onClick={()=>toggleSound(!soundEnabled)} role="switch" aria-checked={soundEnabled} style={{cursor:"pointer"}}/>
                          </div>
                        </div>
                        {soundEnabled&&(
                          <>
                            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                              {Object.entries(SOUND_PROFILES).map(([key,prof])=>(
                                <button key={key} type="button" onClick={()=>changeSoundType(key)} style={{padding:"4px 10px",borderRadius:99,fontSize:10.5,fontWeight:600,border:`1.5px solid ${soundType===key?DocAC:b1}`,background:soundType===key?"var(--doc-pd)":"transparent",color:soundType===key?DocAC:t3,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}} title={prof.desc}>{prof.label}{key==="urgent"&&<AlertTriangle size={9} color="var(--ro)"/>}</button>
                              ))}
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <Volume1 size={13} color={t3} style={{flexShrink:0}}/>
                              <input type="range" min="0" max="1" step="0.05" value={soundVolume} onChange={e=>changeSoundVolume(parseFloat(e.target.value))} style={{flex:1,accentColor:DocAC,cursor:"pointer"}}/>
                              <Volume2 size={13} color={t3} style={{flexShrink:0}}/>
                              <span style={{color:t3,fontSize:10,flexShrink:0,minWidth:32}}>{Math.round(soundVolume*100)}%</span>
                            </div>
                            {SOUND_PROFILES[soundType]&&<p style={{color:t3,fontSize:10,margin:"8px 0 0",fontStyle:"italic"}}>{SOUND_PROFILES[soundType].desc}</p>}
                          </>
                        )}
                      </div>
                    ):null}
                    {messages.length===0&&(
                      <div style={{padding:"8px 20px",borderBottom:"1px solid var(--b0)",background:"var(--s2)",display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{color:t3,fontSize:11,fontWeight:700,flexShrink:0}}>Quick start:</span>
                        {(!peerIsPatient
                          ? ["Prescription inquiry","Medication availability","Prior authorization","Drug interaction check"]
                          : ["Follow-up check-in","Lab or imaging results","Visit summary","Medication change"]
                        ).map(qt=>(
                          <button key={qt} onClick={()=>setMsgInput(qt)} style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:600,border:`1px solid ${b1}`,background:"var(--s1)",color:t2,cursor:"pointer",fontFamily:"inherit"}}>{qt}</button>
                        ))}
                      </div>
                    )}
                    <div ref={msgListRef} onScroll={handleMsgScroll} style={{flex:1,minHeight:0,overflowY:"auto",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch",padding:isMob?"14px 10px 10px":"20px 16px 12px",display:"flex",flexDirection:"column",gap:0,background:"var(--bg)"}}>
                      {messages.length===0&&(<div style={{display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8,padding:"60px 0"}}><Send size={22} color={t3} style={{opacity:.2}}/><p style={{color:t3,fontSize:13}}>No messages yet — send the first one</p></div>)}
                      {messages.map((msg,i)=>{
                        const isMe=msg.sender_id===user.id;
                        const showDate=i===0||new Date(msg.created_at).toDateString()!==new Date(messages[i-1].created_at).toDateString();
                        const groupTop=i===0||showDate||messages[i-1].sender_id!==msg.sender_id;
                        const groupBottom=i===messages.length-1||messages[i+1].sender_id!==msg.sender_id;
                        const isLastSent=isMe&&i===messages.length-1;
                        const isRead=isMe&&msg.read_at;
                        const bubbleRadius=isMe
                          ?`${groupTop?"18px":"6px"} 18px 18px ${groupBottom?"18px":"6px"}`
                          :`18px ${groupTop?"18px":"6px"} ${groupBottom?"18px":"6px"} 18px`;
                        const rawBody=msg.body==null?"":String(msg.body);
                        const bodyLines=rawBody.split("\n");
                        const isPatRef=(bodyLines[0]?.startsWith("📋 Re:") || bodyLines[0]?.startsWith("Re:"));
                        const isNewPatRef=rawBody.startsWith("PATREF:");
                        let patCard=null;
                        if(isNewPatRef){
                          try{
                            const json=JSON.parse(rawBody.slice(7));
                            patCard={name:json.name,dob:json.dob,blood:json.blood,allergies:Array.isArray(json.allergies)?json.allergies.join(", "):json.allergies,conditions:Array.isArray(json.conditions)?json.conditions.join(", "):json.conditions};
                          }catch{}
                        }
                        if(isPatRef&&!patCard){
                          const refLine=bodyLines[0].replace("📋 Re:","").replace("Re:","").trim();
                          const nameMatch=refLine.match(/^([^(·]+)/);
                          const dobMatch=refLine.match(/DOB:\s*([^·)]+)/);
                          const bloodMatch=refLine.match(/Blood:\s*([^·]+)/);
                          const allergyMatch=refLine.match(/Allergies:\s*([^·]+)/);
                          const condMatch=refLine.match(/Conditions:\s*([^·]+)/);
                          patCard={name:nameMatch?.[1]?.replace(/\(.*$/,"").trim(),dob:dobMatch?.[1]?.trim(),blood:bloodMatch?.[1]?.trim(),allergies:allergyMatch?.[1]?.trim(),conditions:condMatch?.[1]?.trim()};
                        }
                        const proto = getProtocolChatDisplay(rawBody, { role: "doctor", isMine: isMe });
                        if (proto.kind === "hidden") return null;
                        const displayBody=(isPatRef||isNewPatRef)&&patCard?"":isPatRef?bodyLines.slice(1).join("\n").trim():proto.line;
                        return (
                          <div key={msg.id} style={{display:"block",width:"100%",marginTop:groupTop?14:3}}>
                            {showDate&&(<div style={{textAlign:"center",margin:"16px 0 14px"}}><span style={{padding:"4px 16px",borderRadius:99,fontSize:10,background:"var(--s2)",border:"1px solid var(--b0)",color:t3,fontWeight:700,letterSpacing:".03em"}}>{new Date(msg.created_at).toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</span></div>)}
                            <div style={{display:"flex",alignItems:"flex-end",gap:8,flexDirection:isMe?"row-reverse":"row",width:"100%"}}>
                              <div style={{width:28,flexShrink:0,display:"flex",justifyContent:"center"}}>
                                {!isMe&&groupBottom&&(
                                  <div style={{width:26,height:26,borderRadius:"50%",background:peerAvatarBg,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                    <span style={{color:"#fff",fontSize:10,fontWeight:800}}>{selChat.name[0]?.toUpperCase()}</span>
                                  </div>
                                )}
                              </div>
                              <div style={{maxWidth:isMob?"88%":"72%",minWidth:0,display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
                                {groupTop&&!isMe&&<p style={{color:t3,fontSize:10,marginBottom:4,fontWeight:600,paddingLeft:2}}>{selChat.name}</p>}
                                {(isPatRef||isNewPatRef)&&patCard&&(
                                  <div style={{marginBottom:6,width:"100%",background:"var(--s1)",border:"1.5px solid rgba(14,116,144,.25)",borderRadius:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(14,116,144,.08)"}}>
                                    <div style={{padding:"7px 12px",background:"rgba(14,116,144,.08)",borderBottom:"1px solid rgba(14,116,144,.15)",display:"flex",alignItems:"center",gap:6}}>
                                      <FileText size={12} color={DocAC}/>
                                      <span style={{color:DocAC,fontSize:11,fontWeight:700}}>Patient Reference</span>
                                    </div>
                                    <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:5}}>
                                      {patCard.name&&<div style={{display:"flex",alignItems:"baseline",gap:8}}><span style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",minWidth:72}}>Patient</span><span style={{color:t1,fontSize:12,fontWeight:700}}>{patCard.name}</span></div>}
                                      {patCard.dob&&<div style={{display:"flex",alignItems:"baseline",gap:8}}><span style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",minWidth:72}}>DOB</span><span style={{color:t1,fontSize:12}}>{patCard.dob}</span></div>}
                                      {patCard.blood&&<div style={{display:"flex",alignItems:"baseline",gap:8}}><span style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",minWidth:72}}>Blood Type</span><span style={{color:"var(--ro)",fontSize:12,fontWeight:700}}>{patCard.blood}</span></div>}
                                      {patCard.allergies&&<div style={{display:"flex",alignItems:"baseline",gap:8}}><span style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",minWidth:72}}>Allergies</span><span style={{color:"var(--ro)",fontSize:12}}>{patCard.allergies}</span></div>}
                                      {patCard.conditions&&<div style={{display:"flex",alignItems:"baseline",gap:8}}><span style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",minWidth:72}}>Conditions</span><span style={{color:"var(--am)",fontSize:12}}>{patCard.conditions}</span></div>}
                                    </div>
                                  </div>
                                )}
                                {(msg.attachment_url || displayBody)&&(
                                <div style={{padding:"9px 14px",borderRadius:bubbleRadius,background:isMe?DocAC:"var(--s1)",border:isMe?"none":`1px solid ${b1}`,boxShadow:isMe?"0 2px 8px rgba(14,116,144,.18)":"0 1px 3px rgba(0,0,0,.06)",maxWidth:"100%",transition:"box-shadow .2s"}}>
                                  {msg.attachment_url&&(msg.attachment_mime || "").startsWith("image/")&&(
                                    <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" style={{display:"block",marginBottom:displayBody?8:0,lineHeight:0,borderRadius:10,overflow:"hidden"}}>
                                      <img src={msg.attachment_url} alt={msg.attachment_name || ""} style={{maxWidth:"100%",maxHeight:220,width:"auto",height:"auto",display:"block",objectFit:"cover"}}/>
                                    </a>
                                  )}
                                  {msg.attachment_url&&!(msg.attachment_mime || "").startsWith("image/")&&(
                                    <a
                                      href={msg.attachment_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display:"inline-flex",
                                        alignItems:"center",
                                        gap:6,
                                        marginBottom:displayBody?8:0,
                                        color:isMe?"rgba(255,255,255,.95)":DocAC,
                                        fontWeight:600,
                                        fontSize:12,
                                        textDecoration:"none",
                                        wordBreak:"break-all"
                                      }}
                                    >
                                      <Paperclip size={14} strokeWidth={2}/>
                                      {msg.attachment_name || "View attachment"}
                                    </a>
                                  )}
                                  {displayBody&&<p style={{color:isMe?"#fff":t1,fontSize:13.5,lineHeight:1.6,margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{displayBody}</p>}
                                </div>
                                )}
                                {groupBottom&&(
                                  <div style={{display:"flex",alignItems:"center",gap:4,marginTop:4,flexDirection:isMe?"row-reverse":"row"}}>
                                    <p style={{color:t3,fontSize:9,textAlign:isMe?"right":"left",paddingLeft:isMe?0:2,paddingRight:isMe?2:0,margin:0}}>{new Date(msg.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>
                                    {isMe&&<CheckCheck size={14} color={isRead?"#22c55e":t3} strokeWidth={isRead?2.5:2}/>}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {peerTyping&&(
                        <div style={{display:"flex",alignItems:"flex-end",gap:8,marginTop:10}}>
                          <div style={{width:26,height:26,borderRadius:"50%",background:peerAvatarBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <span style={{color:"#fff",fontSize:10,fontWeight:800}}>{selChat.name[0]?.toUpperCase()}</span>
                          </div>
                          <div style={{padding:"10px 14px",borderRadius:"18px 18px 18px 3px",background:"var(--s1)",border:`1px solid ${b1}`,display:"flex",alignItems:"center",gap:4}}>
                            {[0,1,2].map(d=><span key={d} style={{width:5,height:5,borderRadius:"50%",background:t3,display:"inline-block",animation:`typingDot 1.2s ${d*0.2}s infinite ease-in-out`}}/>)}
                          </div>
                        </div>
                      )}
                      <div ref={msgEndRef}/>
                    </div>
                    <div style={{flexShrink:0,borderTop:`1px solid ${b1}`,background:"var(--s1)",position:isMob?"sticky":"relative",bottom:isMob?0:"auto",zIndex:10}}>
                      {(showPatPicker||chatPatient)&&(
                        <div style={{maxHeight:"40vh",overflowY:"auto",borderBottom:`1px solid ${b1}`}}>
                          {showPatPicker&&(
                            <div style={{background:"var(--s2)"}}>
                              <div style={{padding:"8px 12px",borderBottom:`1px solid ${b1}`,display:"flex",alignItems:"center",gap:8}}>
                                <User size={13} color={DocAC}/>
                                <span style={{color:t1,fontSize:12,fontWeight:700,flex:1}}>Attach patient context</span>
                                <button onClick={()=>{setShowPatPicker(false);setPatPickerSearch("");}} style={{background:"none",border:"none",cursor:"pointer",color:t3,padding:2,display:"flex"}}><X size={13}/></button>
                              </div>
                              <div style={{padding:"6px 10px",borderBottom:`1px solid ${b1}`}}>
                                <input value={patPickerSearch} onChange={e=>setPatPickerSearch(e.target.value)} placeholder="Search patients…" style={{width:"100%",border:"none",background:"transparent",outline:"none",fontSize:12,color:t1,fontFamily:"inherit"}}/>
                              </div>
                              <div>
                                {patients.filter(p=>!patPickerSearch||(p.fullName||"").toLowerCase().includes(patPickerSearch.toLowerCase())).slice(0,6).map(p=>(
                                  <div key={p.id} onClick={()=>{setChatPatient(p);setShowPatPicker(false);setPatPickerSearch("");}} style={{padding:"7px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid var(--b0)"}} onMouseEnter={e=>e.currentTarget.style.background="var(--pd)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                    <div style={{width:26,height:26,borderRadius:"50%",background:"var(--doc-pd)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><User size={11} color={DocAC}/></div>
                                    <div style={{minWidth:0,flex:1}}>
                                      <p style={{color:t1,fontSize:12,fontWeight:700,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.fullName}</p>
                                      {p.allergies?.length>0&&<p style={{color:"var(--ro)",fontSize:10,margin:0}}>{p.allergies.length} allerg{p.allergies.length>1?"ies":"y"}</p>}
                                    </div>
                                  </div>
                                ))}
                                {patients.filter(p=>!patPickerSearch||(p.fullName||"").toLowerCase().includes(patPickerSearch.toLowerCase())).length===0&&<p style={{color:t3,fontSize:12,padding:"10px 12px",margin:0}}>No patients found</p>}
                              </div>
                            </div>
                          )}
                          {msgMode==="pharmacy"&&chatPatient&&!showPatPicker&&(
                            <div style={{background:"var(--doc-pd)",borderBottom:`1px solid rgba(14,116,144,.15)`}}>
                              <div style={{padding:"7px 12px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>setChatPatientExpanded(p=>!p)}>
                                <User size={13} color={DocAC}/>
                                <div style={{flex:1,minWidth:0}}>
                                  <p style={{color:DocAC,fontSize:11,fontWeight:700,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{chatPatient.fullName}</p>
                                  <p style={{color:t3,fontSize:10,margin:0}}>{chatPatientExpanded?"Click to collapse":"Click to expand full profile"}</p>
                                </div>
                                <button onClick={e=>{e.stopPropagation();setChatPatient(null);setChatPatientExpanded(false);}} style={{background:"none",border:"none",cursor:"pointer",color:t3,padding:2,display:"flex",flexShrink:0}}><X size={12}/></button>
                              </div>
                              {chatPatientExpanded&&(
                                <div style={{padding:"8px 12px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                                  {chatPatient.dob&&<div><p style={{color:t3,fontSize:9,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",margin:0}}>Date of Birth</p><p style={{color:t1,fontSize:11,fontWeight:600,margin:0}}>{chatPatient.dob}</p></div>}
                                  {chatPatient.bloodType&&<div><p style={{color:t3,fontSize:9,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",margin:0}}>Blood Type</p><p style={{color:"var(--ro)",fontSize:11,fontWeight:700,margin:0}}>{chatPatient.bloodType}</p></div>}
                                  {chatPatient.allergies?.length>0&&<div style={{gridColumn:"1/-1"}}><p style={{color:t3,fontSize:9,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",margin:0}}>Allergies</p><p style={{color:"var(--ro)",fontSize:11,fontWeight:600,margin:"2px 0 0"}}>{chatPatient.allergies.join(", ")}</p></div>}
                                  {chatPatient.conditions?.length>0&&<div style={{gridColumn:"1/-1"}}><p style={{color:t3,fontSize:9,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",margin:0}}>Conditions</p><p style={{color:"var(--am)",fontSize:11,fontWeight:600,margin:"2px 0 0"}}>{chatPatient.conditions.join(", ")}</p></div>}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{padding:isMob?`8px 10px calc(12px + env(safe-area-inset-bottom,0px))`:`10px 14px calc(10px + env(safe-area-inset-bottom,0px))`}}>
                        <div style={{display:"flex",alignItems:"flex-end",gap:9}}>
                          {msgMode==="pharmacy"?(
                          <button type="button" onClick={()=>{setShowPatPicker(p=>!p);setShowSoundSettings(false);}} title="Attach patient context for pharmacy message" style={{width:isMob?42:36,height:isMob?42:36,borderRadius:"50%",border:`1px solid ${chatPatient?DocAC:b1}`,background:chatPatient?"var(--doc-pd)":"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:chatPatient?DocAC:t3,flexShrink:0,transition:"all .2s"}}>
                            <User size={15}/>
                          </button>
                          ):null}
                          <div style={{flex:1,background:"var(--s2)",border:`1.5px solid ${b1}`,borderRadius:20,padding:"10px 14px"}}
                            onClick={e=>e.currentTarget.querySelector("textarea")?.focus()}>
                            <textarea
                              value={msgInput}
                              onChange={e=>{setMsgInput(e.target.value);emitTyping();}}
                              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
                              placeholder={`Message ${selChat.name}…`}
                              rows={isMob?1:2}
                              style={{border:"none",background:"transparent",resize:"none",padding:0,fontSize:16,color:t1,outline:"none",fontFamily:"inherit",lineHeight:1.6,width:"100%",display:"block",WebkitAppearance:"none",touchAction:"manipulation"}}/>
                          </div>
                          <button onClick={sendMessage}
                            style={{width:44,height:44,borderRadius:"50%",border:"none",flexShrink:0,background:DocAC,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"background .2s",opacity:msgInput.trim()?1:0.45,WebkitTapHighlightColor:"transparent",touchAction:"manipulation"}}>
                            {msgSending?<Loader2 size={15} style={{animation:"spin360 .7s linear infinite"}}/>:<Send size={15}/>}
                          </button>
                        </div>
                        <p style={{color:t3,fontSize:10,margin:"5px 0 0"}}>Enter to send · Shift+Enter for new line{chatPatient&&<span style={{color:DocAC}}> · Referencing <strong>{chatPatient.fullName}</strong></span>}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
              )} {}
            </div>
          )}
          {}
          {page==="dashboard"&&(
            <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:isMob?"calc(66px + env(safe-area-inset-bottom,0px))":0}}>
            <div style={{maxWidth:920,margin:"0 auto",padding:isMob?"16px 14px 56px":"32px 22px 48px"}}>
              <motion.div className="au" style={{marginBottom:isMob?20:28}}>
                <h2 style={{color:t1,fontSize:isMob?22:28,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700,marginBottom:4}}>{docGreet}, Dr. {name.split(" ")[0]}.</h2>
                <p style={{color:t3,fontSize:13.5,margin:0}}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</p>
              </motion.div>
              <div className="grid w-full min-w-0 grid-cols-1 min-[400px]:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
                {[
                  {l:"Total patients",v:patients.length,c:DocAC,bg:"var(--doc-pd)",
                    items:patients,render:p=><div key={p.id} onClick={()=>{setPage("patients");openPatient(p);}} style={{padding:"10px 14px",borderRadius:12,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",gap:10}} onMouseEnter={e=>e.currentTarget.style.background="var(--pd)"} onMouseLeave={e=>e.currentTarget.style.background="var(--s2)"}><div style={{width:32,height:32,borderRadius:"50%",background:"var(--doc-pd)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><User size={13} color={DocAC}/></div><div style={{minWidth:0,flex:1}}><p style={{color:t1,fontSize:13,fontWeight:700,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.fullName}</p><p style={{color:t3,fontSize:11,margin:0}}>{p.email||"No email"}</p></div></div>},
                  {l:"Today's appts",v:allAppointments.filter(a=>a.status!=="cancelled"&&new Date(a.date+"T12:00:00").toDateString()===new Date().toDateString()).length,c:"var(--gr)",bg:"rgba(5,150,105,.1)",
                    items:allAppointments.filter(a=>a.status!=="cancelled"&&new Date(a.date+"T12:00:00").toDateString()===new Date().toDateString()),render:a=><div key={a.id} style={{padding:"10px 14px",borderRadius:12,border:`1px solid ${b1}`,background:"var(--s2)"}}><p style={{color:t1,fontSize:13,fontWeight:700,margin:0}}>{a.type}</p><p style={{color:t3,fontSize:11,margin:"3px 0 0"}}>{new Date("2000-01-01T"+a.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} · {patientNames?.[a.patient_id]||"Patient"}</p></div>},
                  {l:"With allergies",v:patients.filter(p=>p.allergies?.length>0).length,c:"var(--ro)",bg:"rgba(185,28,28,.09)",
                    items:patients.filter(p=>p.allergies?.length>0),render:p=><div key={p.id} onClick={()=>{setPage("patients");openPatient(p);}} style={{padding:"10px 14px",borderRadius:12,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="var(--pd)"} onMouseLeave={e=>e.currentTarget.style.background="var(--s2)"}><p style={{color:t1,fontSize:13,fontWeight:700,margin:0}}>{p.fullName}</p><p style={{color:"var(--ro)",fontSize:11,margin:"3px 0 0"}}>{(p.allergies||[]).join(", ")}</p></div>},
                  {l:"With conditions",v:patients.filter(p=>p.conditions?.length>0).length,c:"var(--am)",bg:"rgba(217,119,6,.09)",
                    items:patients.filter(p=>p.conditions?.length>0),render:p=><div key={p.id} onClick={()=>{setPage("patients");openPatient(p);}} style={{padding:"10px 14px",borderRadius:12,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="var(--pd)"} onMouseLeave={e=>e.currentTarget.style.background="var(--s2)"}><p style={{color:t1,fontSize:13,fontWeight:700,margin:0}}>{p.fullName}</p><p style={{color:"var(--am)",fontSize:11,margin:"3px 0 0"}}>{(p.conditions||[]).join(", ")}</p></div>},
                ].map((s,i)=>(
                  <motion.div key={s.l} className={`au d${i+1} min-w-0 overflow-hidden`} whileHover={{y:-3}} onClick={()=>setDashModal({title:s.l,items:s.items,render:s.render})} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:16,padding:isMob?"12px 11px":"18px 16px",boxShadow:"0 2px 8px rgba(0,0,0,.04)",cursor:"pointer"}}>
                    <div style={{width:isMob?30:38,height:isMob?30:38,borderRadius:isMob?9:12,background:s.bg,marginBottom:isMob?6:12,display:"flex",alignItems:"center",justifyContent:"center"}}><User size={isMob?13:17} color={s.c}/></div>
                    <p className="tabular-nums truncate" style={{color:t1,fontSize:isMob?17:22,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700,marginBottom:2}}>{s.v}</p>
                    <p className="leading-snug line-clamp-2" style={{color:t3,fontSize:9,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase"}}>{s.l}</p>
                  </motion.div>
                ))}
              </div>
              {doctorVideoVisitRequests.filter(r=>String(r.status)==="pending").length>0?(
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full min-w-0 overflow-hidden mb-5"
                  role="button"
                  tabIndex={0}
                  onClick={()=>setPage("virtual")}
                  onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" ") setPage("virtual"); }}
                  style={{ background: "rgba(217,119,6,.09)", border: "1px solid rgba(217,119,6,.35)", borderRadius: 16, padding: isMob ? "12px 14px" : "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                >
                  <div>
                    <p style={{ margin: 0, color: t1, fontSize: isMob ? 13 : 14, fontWeight: 700 }}>Patient visit requests</p>
                    <p style={{ margin: "4px 0 0", color: t3, fontSize: 12 }}>
                      {doctorVideoVisitRequests.filter(r=>String(r.status)==="pending").length} pending — approve times or deny
                    </p>
                  </div>
                  <ArrowRight size={18} color={DocAC}/>
                </motion.div>
              ):null}
              <motion.div className="au d2 w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:20,padding:isMob?"14px 12px":"22px 24px",marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
                <div className="flex flex-col gap-3 mb-4 w-full min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="min-w-0" style={{color:t1,fontSize:isMob?13:16,fontWeight:700,margin:0}}>Appointment Calendar</h3>
                    <div className="flex shrink-0" style={{display:"flex",background:"var(--s2)",borderRadius:99,padding:3,border:"1px solid var(--b1)"}}>
                      {["week","month"].map(v=>(<button key={v} type="button" onClick={()=>setCalView(v)} style={{padding:isMob?"5px 12px":"5px 14px",borderRadius:99,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:11.5,fontWeight:700,transition:"all .18s",background:calView===v?DocAC:"transparent",color:calView===v?"#fff":t3}}>{v.charAt(0).toUpperCase()+v.slice(1)}</button>))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 w-full min-w-0 sm:justify-end">
                    <motion.button type="button" whileTap={{scale:.9}} onClick={()=>setCalDate(d=>{const n=new Date(d);n.setDate(n.getDate()-(calView==="week"?7:30));return n;})} style={{width:32,height:32,borderRadius:9,border:"1px solid var(--b1)",background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3,flexShrink:0}}><ArrowRight size={13} style={{transform:"rotate(180deg)"}}/></motion.button>
                    <span className="min-w-0 flex-1 text-center sm:flex-none sm:min-w-[8.5rem]" style={{color:t2,fontSize:isMob?11.5:13,fontWeight:600,lineHeight:1.35}}>
                      {calView==="week"?(()=>{const s=new Date(calDate);s.setDate(s.getDate()-s.getDay());const e=new Date(s);e.setDate(e.getDate()+6);const sStr=s.toLocaleDateString("en-US",{month:"short",day:"numeric"});const eStr=e.toLocaleDateString("en-US",e.getFullYear()!==s.getFullYear()?{month:"short",day:"numeric",year:"numeric"}:{month:"short",day:"numeric"});return `${sStr} – ${eStr}`;})():calDate.toLocaleDateString("en-US",{month:"long",year:"numeric"})}
                    </span>
                    <motion.button type="button" whileTap={{scale:.9}} onClick={()=>setCalDate(d=>{const n=new Date(d);n.setDate(n.getDate()+(calView==="week"?7:30));return n;})} style={{width:32,height:32,borderRadius:9,border:"1px solid var(--b1)",background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3,flexShrink:0}}><ArrowRight size={13}/></motion.button>
                    <motion.button type="button" whileTap={{scale:.97}} onClick={()=>setCalDate(new Date())} style={{padding:"6px 12px",borderRadius:99,border:"1px solid var(--b1)",background:"var(--s2)",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,color:t3,flexShrink:0}}>Today</motion.button>
                  </div>
                </div>
                {calView==="week"&&(()=>{
                  const ws=new Date(calDate);ws.setDate(ws.getDate()-ws.getDay());
                  const days=Array.from({length:7},(_,i)=>{const d=new Date(ws);d.setDate(d.getDate()+i);return d;});
                  const today=new Date();
                  const dayCard=(day)=>{
                    const isToday=day.toDateString()===today.toDateString();
                    const dayAppts=allAppointments.filter(a=>a.status!=="cancelled"&&new Date(a.date+"T12:00:00").toDateString()===day.toDateString());
                    return (
                      <div key={day.toISOString()} onClick={()=>{if(dayAppts.length) void openCalendarAppointment(dayAppts[0]);}} style={{borderRadius:isMob?12:14,overflow:"hidden",border:`1.5px solid ${isToday?"var(--doc-p)":"var(--b0)"}`,background:isToday?"rgba(14,116,144,.04)":"var(--s2)",minHeight:isMob?0:100,width:"100%",minWidth:0,cursor:dayAppts.length?"pointer":"default"}}>
                        <div style={{padding:isMob?"8px 10px":"8px 10px",borderBottom:"1px solid var(--b0)",background:isToday?"var(--doc-pd)":"transparent",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                          <p style={{color:isToday?DocAC:t3,fontSize:10,fontWeight:800,textTransform:"uppercase",margin:0}}>{day.toLocaleDateString("en-US",{weekday:isMob?"long":"short"})}</p>
                          <span style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?DocAC:"transparent",color:isToday?"#fff":t2,fontSize:12,fontWeight:700,flexShrink:0}}>{day.getDate()}</span>
                        </div>
                        <div style={{padding:isMob?"8px 10px":"6px",display:"flex",flexDirection:"column",gap:isMob?6:4}}>
                          {dayAppts.length===0?<p style={{color:t3,fontSize:11,opacity:.45,margin:0}}>No appointments</p>:dayAppts.map(a=>(
                            <div key={a.id} onClick={(e)=>{e.stopPropagation();void openCalendarAppointment(a);}} style={{padding:"6px 8px",borderRadius:8,background:"rgba(14,116,144,.12)",border:"1px solid rgba(14,116,144,.2)",cursor:"pointer"}}>
                              <p style={{color:DocAC,fontSize:11,fontWeight:700,margin:0}}>{new Date("2000-01-01T"+a.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>
                              <p style={{color:t2,fontSize:11,margin:0,lineHeight:1.3,wordBreak:"break-word"}}>{a.type}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  };
                  if(isMob){
                    return (
                      <div className="flex flex-col gap-2.5 w-full min-w-0">
                        {days.map(dayCard)}
                      </div>
                    );
                  }
                  return (
                    <div className="w-full min-w-0">
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7, minmax(0, 1fr))",gap:6}}>
                      {days.map(dayCard)}
                    </div>
                    </div>
                  );
                })()}
                {calView==="month"&&(()=>{
                  const year=calDate.getFullYear(),month=calDate.getMonth();
                  const firstDay=new Date(year,month,1).getDay();
                  const daysInMonth=new Date(year,month+1,0).getDate();
                  const today=new Date();
                  const cells=[];for(let i=0;i<firstDay;i++)cells.push(null);for(let d=1;d<=daysInMonth;d++)cells.push(new Date(year,month,d));
                  return (
                    <div className="w-full min-w-0">
                      <div className="grid w-full min-w-0" style={{display:"grid",gridTemplateColumns:"repeat(7, minmax(0, 1fr))",gap:2,marginBottom:6}}>
                        {["S","M","T","W","T","F","S"].map((d,idx)=><div key={`${d}-${idx}`} style={{textAlign:"center",padding:"4px 0"}}><p style={{color:t3,fontSize:isMob?9:10,fontWeight:800,textTransform:"uppercase",margin:0}}>{d}</p></div>)}
                      </div>
                      <div className="grid w-full min-w-0" style={{display:"grid",gridTemplateColumns:"repeat(7, minmax(0, 1fr))",gap:isMob?2:4}}>
                        {cells.map((day,i)=>{
                          if(!day)return <div key={`e${i}`} style={{minHeight:isMob?36:44}}/>;
                          const isToday=day.toDateString()===today.toDateString();
                          const dayAppts=allAppointments.filter(a=>a.status!=="cancelled"&&new Date(a.date+"T12:00:00").toDateString()===day.toDateString());
                          return (
                            <div key={day.toISOString()} onClick={()=>{if(dayAppts.length) void openCalendarAppointment(dayAppts[0]);}} className="min-w-0 overflow-hidden" style={{borderRadius:isMob?6:10,border:`1.5px solid ${isToday?"var(--doc-p)":"var(--b0)"}`,background:isToday?"rgba(14,116,144,.05)":"var(--s2)",padding:isMob?"3px 2px":"6px 8px",minHeight:isMob?40:56,cursor:dayAppts.length?"pointer":"default"}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:2,marginBottom:isMob?0:4}}>
                                <span style={{width:isMob?18:22,height:isMob?18:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?DocAC:"transparent",color:isToday?"#fff":t2,fontSize:isMob?10:12,fontWeight:700,flexShrink:0}}>{day.getDate()}</span>
                                {dayAppts.length>0&&<span style={{background:DocAC,color:"#fff",borderRadius:99,fontSize:isMob?7:9,fontWeight:800,padding:"1px 4px",flexShrink:0}}>{dayAppts.length}</span>}
                              </div>
                              {!isMob&&dayAppts.slice(0,2).map(a=>(
                                <div key={a.id} onClick={(e)=>{e.stopPropagation();void openCalendarAppointment(a);}} style={{borderRadius:4,background:"rgba(14,116,144,.12)",padding:"2px 5px",marginBottom:2,cursor:"pointer"}}>
                                  <p style={{color:DocAC,fontSize:8.5,fontWeight:700,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{new Date("2000-01-01T"+a.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} {a.type}</p>
                                </div>
                              ))}
                              {!isMob&&dayAppts.length>2&&<p style={{color:t3,fontSize:8,margin:0}}>+{dayAppts.length-2} more</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
              <motion.div className="au d4 w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:20,padding:isMob?"14px 12px":"22px 24px",boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                  <h3 style={{color:t1,fontSize:isMob?14:16,fontWeight:700,margin:0}}>Recent Patients</h3>
                  <button type="button" onClick={()=>setPage("patients")} className="shrink-0" style={{color:DocAC,fontSize:12,fontWeight:700,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>View all <ArrowRight size={13}/></button>
                </div>
                {patients.length===0?(
                  <div style={{textAlign:"center",padding:"16px 0"}}>
                    <p style={{color:t3,fontSize:13}}>No patients yet.</p>
                    <button type="button" onClick={()=>setPage("patients")} style={{color:DocAC,fontSize:12.5,fontWeight:700,background:"none",border:"none",cursor:"pointer",marginTop:6,display:"flex",alignItems:"center",gap:5,margin:"6px auto 0"}}><UserPlus size={13}/> Add a patient</button>
                  </div>
                ):patients.slice(0,5).map(p=>(
                  <motion.div key={p.id} whileHover={isMob?{}:{x:3}} whileTap={{scale:.99}}
                    onClick={()=>{setPage("patients");openPatient(p);}}
                    className="flex items-start gap-3 w-full min-w-0 py-3 border-b border-[var(--b0)] cursor-pointer last:border-b-0">
                    <div style={{width:isMob?36:40,height:isMob?36:40,borderRadius:12,background:"var(--doc-pd)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><User size={isMob?16:18} color={DocAC}/></div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="truncate" style={{color:t1,fontSize:isMob?13:13.5,fontWeight:700,margin:0}}>{p.fullName}</p>
                      <p className="truncate" style={{color:t3,fontSize:11.5,marginTop:2}} title={p.email}>{p.email}</p>
                      {isMob&&p.allergies?.length>0&&(
                        <span className="inline-block mt-1.5" style={{padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:700,background:"rgba(185,28,28,.1)",color:"var(--ro)"}}>{p.allergies.length} allerg{p.allergies.length>1?"ies":"y"}</span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                      {!isMob&&p.allergies?.length>0&&(
                        <span style={{padding:"2px 8px",borderRadius:99,fontSize:10.5,fontWeight:700,background:"rgba(185,28,28,.1)",color:"var(--ro)"}}>{p.allergies.length} allerg{p.allergies.length>1?"ies":"y"}</span>
                      )}
                      <ArrowRight size={13} color={t3}/>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
            </div>
          )}
          {page==="virtual"&&(
            <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:isMob?"calc(66px + env(safe-area-inset-bottom,0px))":0}}>
              <div className="w-full min-w-0 max-w-[960px] mx-auto" style={{padding:isMob?"16px 14px 56px":"32px 22px 48px"}}>
                <motion.div className="au" style={{marginBottom:isMob?18:22}}>
                  <h2 className="text-[22px] leading-tight sm:text-[26px]" style={{color:t1,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700,margin:0}}>Virtual Visits</h2>
                </motion.div>
                {doctorVideoVisitRequests.filter((r)=>r.status==="pending").length>0&&(
                <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"18px 20px",boxShadow:"0 2px 8px rgba(0,0,0,.04)",marginBottom:12}}>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {doctorVideoVisitRequests.filter((r)=>r.status==="pending").map((req)=>(
                        <div key={req.id} style={{padding:"10px 12px",borderRadius:12,border:`1px solid ${b1}`,background:"var(--s2)",display:"flex",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:10}}>
                          <div style={{minWidth:200}}>
                            <p style={{margin:0,color:t1,fontSize:12.5,fontWeight:700}}>{patientNameById?.[req.patient_id]||"Patient"}</p>
                            <p style={{margin:"3px 0 0",color:t3,fontSize:11.5}}>
                              Requested{" "}
                              {new Date(`${req.requested_date}T12:00:00`).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}{" "}
                              at {to12h(req.requested_time)}
                            </p>
                            {req.reason?<p style={{margin:"6px 0 0",color:t2,fontSize:11}}>{req.reason}</p>:null}
                            {req.doctor_suggested_date&&req.doctor_suggested_time?(
                              <p style={{margin:"6px 0 0",color:DocAC,fontSize:11}}>
                                You suggested: {" "}
                                {new Date(`${req.doctor_suggested_date}T12:00:00`).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}{" "}
                                at {to12h(req.doctor_suggested_time)}
                              </p>
                            ):null}
                          </div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                            <button type="button" disabled={urgentVisitBusyId===req.id} onClick={()=>void approveUrgentVideoVisit(req)} style={{padding:"8px 12px",borderRadius:10,border:"none",background:DocAC,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:11}}>
                              {urgentVisitBusyId===req.id?<Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/>:"Approve"}
                            </button>
                            <button type="button" disabled={urgentVisitBusyId===req.id} onClick={()=>void proposeAlternateUrgentVisit(req)} style={{padding:"8px 12px",borderRadius:10,border:`1px solid ${b1}`,background:"var(--s1)",color:t1,fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:11}}>
                              Suggest other time
                            </button>
                            <button type="button" disabled={urgentVisitBusyId===req.id} onClick={()=>void denyUrgentVideoVisit(req)} style={{padding:"8px 12px",borderRadius:10,border:`1px solid ${b1}`,background:"transparent",color:t3,fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:11}}>
                              Deny
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                </motion.div>
                )}
                <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"18px 20px",boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
                  <div style={{marginBottom:12,padding:"10px 12px",borderRadius:12,border:`1px solid ${b1}`,background:"var(--s2)"}}>
                    <p style={{margin:0,color:t1,fontSize:12.5,fontWeight:700}}>Waiting room list ({waitingRoomList.length})</p>
                    {waitingRoomList.length===0?(
                      <p style={{margin:"4px 0 0",color:t3,fontSize:11.5}}>No patients are checked in right now.</p>
                    ):(
                      <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
                        {waitingRoomList.slice(0,8).map((w)=>(
                          <div key={`${w.patientId}-${w.windowStartMs}`} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:"7px 8px",borderRadius:9,background:"var(--s1)",border:`1px solid ${b1}`}}>
                            <div>
                              <p style={{margin:0,color:t1,fontSize:11.5,fontWeight:700}}>{patientNameById?.[w.patientId]||"Patient"}</p>
                              <p style={{margin:"2px 0 0",color:DocAC,fontSize:10.5,fontWeight:700}}>Patient checked in · waiting.</p>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                              <p style={{margin:0,color:t3,fontSize:11}}>
                                Checked in {new Date(w.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              </p>
                              <button
                                type="button"
                                onClick={()=>void startVideoVisitForPatient({patientId:w.patientId,windowStartMs:w.windowStartMs,windowEndMs:w.windowEndMs})}
                                disabled={videoApprovalBusy&&(videoStartTargetId===w.patientId)}
                                style={{
                                  padding:"7px 10px",
                                  borderRadius:9,
                                  border:"none",
                                  background:DocAC,
                                  color:"#fff",
                                  cursor:(videoApprovalBusy&&(videoStartTargetId===w.patientId))?"wait":"pointer",
                                  fontFamily:"inherit",
                                  fontSize:11,
                                  fontWeight:700,
                                  display:"inline-flex",
                                  alignItems:"center",
                                  gap:5,
                                  opacity:(videoApprovalBusy&&(videoStartTargetId===w.patientId))?0.75:1,
                                }}
                              >
                                {videoApprovalBusy&&(videoStartTargetId===w.patientId)?<Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/>:<Video size={13}/>}
                                {(videoApprovalBusy&&(videoStartTargetId===w.patientId))?"Starting...":"Start video"}
                              </button>
                              <button
                                type="button"
                                onClick={()=>void endVideoVisitForPatientContext({patientId:w.patientId,windowStartMs:w.windowStartMs,windowEndMs:w.windowEndMs,mirrorInOpenThread:false})}
                                disabled={videoEndBusy}
                                style={{
                                  padding:"7px 10px",
                                  borderRadius:9,
                                  border:`1px solid ${b1}`,
                                  background:"var(--s1)",
                                  color:t1,
                                  cursor:videoEndBusy?"not-allowed":"pointer",
                                  fontFamily:"inherit",
                                  fontSize:11,
                                  fontWeight:700,
                                  display:"inline-flex",
                                  alignItems:"center",
                                  gap:5,
                                  opacity:videoEndBusy?0.75:1,
                                }}
                              >
                                {videoEndBusy?<Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/>:<PhoneOff size={13}/>}
                                {videoEndBusy?"Ending...":"End video"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {virtualAppointments.length===0?(
                    <div style={{padding:isMob?"16px 8px":"24px 6px",textAlign:"center"}}>
                      <Video size={26} color={t3} style={{opacity:.25,margin:"0 auto 10px",display:"block"}}/>
                      <p style={{color:t3,fontSize:13,margin:0}}>No active virtual appointments in the reconnect window.</p>
                    </div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {virtualAppointments.map((row)=>{
                        const {appt,window}=row;
                        const winKey=`${appt.patient_id}|${window.windowStartMs}|${window.windowEndMs}`;
                        const roomId=buildVideoRoomId(user.id,appt.patient_id);
                        const checkedInRow=waitingLookup[winKey];
                        const inVisit=!!inVisitByWindowKey[winKey];
                        const patientName=patientNameById?.[appt.patient_id]||"Patient";
                        const visitLabel=`${new Date(`${appt.date}T12:00:00`).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} at ${to12h(appt.time)}`;
                        const opensIn=Math.max(0,Math.ceil((window.windowStartMs-videoNowMs)/60000));
                        const portalEnd=window.portalEndMs??window.windowEndMs;
                        const beforeNominalStart=videoNowMs<window.windowStartMs;
                        const inDoctorVideoWindow=videoNowMs>=window.windowStartMs-VIDEO_WAITING_ROOM_EARLY_JOIN_MS&&videoNowMs<=portalEnd;
                        const inPortal=videoNowMs>=window.windowStartMs&&videoNowMs<=portalEnd;
                        const inNominalWindow=videoNowMs>=window.windowStartMs&&videoNowMs<=window.windowEndMs;
                        const lateReconnect=inPortal&&!beforeNominalStart&&!inNominalWindow;
                        const evs=getEffectiveVirtualVisitStatus(appt);
                        const checkedInReady=!!checkedInRow||evs===VS.WAITING_FOR_DOCTOR;
                        const statusText=beforeNominalStart
                          ?(inDoctorVideoWindow&&checkedInReady
                              ?"Early start — you can start video up to 30 min before the visit time."
                              :`Opens in ${opensIn} min`)
                          :lateReconnect
                            ?"Reconnect window · you can still start video"
                          :inVisit
                            ?"In visit"
                            :checkedInReady
                              ?"Patient waiting."
                              :"Ready to start";
                        const canStart=inDoctorVideoWindow&&inVisit===false&&!videoApprovalBusy&&checkedInReady;
                        return (
                          <div key={appt.id} style={{padding:isMob?"10px 10px":"12px 12px",borderRadius:12,border:`1px solid ${b1}`,background:"var(--s2)",display:"flex",alignItems:isMob?"flex-start":"center",justifyContent:"space-between",gap:10,flexDirection:isMob?"column":"row"}}>
                            <div style={{minWidth:0,flex:1}}>
                              <p className="truncate" style={{margin:0,color:t1,fontSize:13,fontWeight:700}}>{patientName}</p>
                              <p className="truncate" style={{margin:"4px 0 0",color:t3,fontSize:12}}>{visitLabel}</p>
                              <p style={{margin:"5px 0 0",color:(beforeNominalStart&&inDoctorVideoWindow||(inNominalWindow&&!beforeNominalStart)||lateReconnect)?"var(--gr)":t3,fontSize:11.5,fontWeight:600}}>{statusText}</p>
                              {checkedInRow&&inVisit===false&&(
                                <p style={{margin:"3px 0 0",color:DocAC,fontSize:11,fontWeight:700}}>Checked in at {new Date(checkedInRow.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                              )}
                            </div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:isMob?"stretch":"flex-end",alignItems:"center",width:isMob?"100%":"auto"}}>
                            <button
                              type="button"
                              onClick={()=>void startVideoVisitForPatient({patientId:appt.patient_id,windowStartMs:window.windowStartMs,windowEndMs:window.windowEndMs})}
                              disabled={!canStart}
                              style={{padding:"9px 12px",borderRadius:10,border:"none",background:canStart?DocAC:"var(--b1)",color:"#fff",cursor:canStart?"pointer":"not-allowed",fontFamily:"inherit",fontSize:12,fontWeight:700,minWidth:isMob?"100%":0,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,opacity:videoApprovalBusy&&videoStartTargetId===appt.patient_id?0.75:1}}
                            >
                              {videoApprovalBusy&&videoStartTargetId===appt.patient_id?<Loader2 size={14} style={{animation:"spin360 .7s linear infinite"}}/>:<Video size={14}/>}
                              {videoApprovalBusy&&videoStartTargetId===appt.patient_id?"Starting...":"Start video"}
                            </button>
                            <button
                              type="button"
                              onClick={async()=>{
                                const { data }=await supabase.from("profiles").select("id,first_name,last_name,pre_visit_intake,allergies,medical_conditions").eq("id",appt.patient_id).maybeSingle();
                                setVirtualCheckInPatientProfile(data||null);
                              }}
                              style={{padding:"9px 12px",borderRadius:10,border:`1px solid ${b1}`,background:"var(--s1)",color:t2,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}
                            >
                              <FileText size={13}/> Check-in form
                            </button>
                            {inDoctorVideoWindow&&checkedInRow&&inVisit===false?(
                              <button type="button" onClick={()=>void dismissOrRemoveWaiting({patientId:appt.patient_id,windowStartMs:window.windowStartMs,windowEndMs:window.windowEndMs,roomId})}
                                style={{padding:"9px 10px",borderRadius:10,border:`1px solid ${b1}`,background:"var(--s1)",color:t1,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600}}>Dismiss from waiting</button>
                            ):null}
                            {inDoctorVideoWindow&&inVisit?(
                              <button type="button" onClick={()=>void completeVideoVisitForAppointment(appt)}
                                style={{padding:"9px 10px",borderRadius:10,border:"1px solid rgba(5,150,105,.35)",background:"rgba(5,150,105,.08)",color:"var(--gr)",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600}}>End video</button>
                            ):null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          )}
          {page==="availability"&&(
            <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:isMob?"calc(66px + env(safe-area-inset-bottom,0px))":0}}>
              <div className="w-full min-w-0 max-w-[920px] mx-auto" style={{padding:isMob?"16px 14px 56px":"32px 22px 48px"}}>
                <motion.div className="au" style={{marginBottom:isMob?18:22}}>
                  <h2 className="text-[22px] leading-tight sm:text-[26px]" style={{color:t1,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700,margin:0}}>Availability Slots</h2>
                  <p style={{color:t3,fontSize:13,marginTop:4}}>Set the appointment times your patients can see and book.</p>
                </motion.div>
                <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"20px 22px"}}>
                  <h4 style={{color:t1,fontSize:14,fontWeight:700,marginBottom:8}}>Manage Available Time Slots</h4>
                  <p style={{color:t3,fontSize:12.5,margin:"0 0 12px"}}>These slots are shared across all your patients.</p>
                  <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr auto",gap:10,marginBottom:14}}>
                    <div className="min-w-0"><label style={{display:"block",fontSize:10,fontWeight:800,letterSpacing:".09em",textTransform:"uppercase",color:t3,marginBottom:5}}>Date</label><input className="inp w-full min-w-0" type="date" value={availDate} onChange={e=>setAvailDate(e.target.value)} style={{borderRadius:11,fontSize:16,height:42}}/></div>
                    <div className="min-w-0"><label style={{display:"block",fontSize:10,fontWeight:800,letterSpacing:".09em",textTransform:"uppercase",color:t3,marginBottom:5}}>Time</label><input className="inp w-full min-w-0" type="time" value={availTime} onChange={e=>setAvailTime(e.target.value)} style={{borderRadius:11,fontSize:16,height:42}}/></div>
                    <button type="button" onClick={addAvailabilitySlot} style={{alignSelf:"end",padding:"10px 16px",borderRadius:11,border:"none",background:DocAC,color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6,height:42,boxShadow:"0 6px 16px rgba(14,116,144,.22)"}}><Plus size={13}/> Add</button>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12,maxHeight:340,overflowY:"auto"}}>
                    {availabilityDateKeys.length===0?<p style={{color:t3,fontSize:12.5,margin:0}}>No slots yet.</p>:availabilityDateKeys.map(date=>(
                      <div key={date} style={{padding:isMob?"10px":"11px",borderRadius:13,border:`1px solid ${b1}`,background:"var(--s2)",display:"grid",gridTemplateColumns:isMob?"1fr":"auto 1fr auto",gap:10,alignItems:"center"}}>
                        <div style={{minWidth:isMob?0:72,padding:isMob?"0":"8px 8px",borderRight:isMob?"none":`1px solid ${b1}`}}>
                          <p style={{margin:0,color:t3,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:".07em"}}>{new Date(`${date}T12:00:00`).toLocaleDateString("en-US",{weekday:"short"})}</p>
                          <p style={{margin:"2px 0 0",color:t1,fontSize:14,fontWeight:700}}>{new Date(`${date}T12:00:00`).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</p>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,minWidth:0}}>
                          {(bookingAvailability.slots[date]||[]).map(tm=>(
                            <button key={`${date}-${tm}`} type="button" onClick={()=>removeAvailabilitySlot(date,tm)} style={{padding:"6px 10px",borderRadius:10,border:`1px solid ${b1}`,background:"var(--s1)",color:t2,cursor:"pointer",fontFamily:"inherit",fontSize:11.5,fontWeight:600}}>
                              {new Date(`2000-01-01T${tm}`).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})} ×
                            </button>
                          ))}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:isMob?"flex-start":"flex-end"}}>
                          <button type="button" onClick={()=>editAvailabilityDate(date)} style={{width:34,height:34,borderRadius:10,border:`1px solid ${b1}`,background:"var(--s1)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:DocAC}} title="Edit date"><Pencil size={13}/></button>
                          <button type="button" onClick={()=>removeAvailabilityDate(date)} style={{width:34,height:34,borderRadius:10,border:"1px solid rgba(185,28,28,.25)",background:"rgba(185,28,28,.06)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--ro)"}} title="Remove date"><Trash2 size={13}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {availMsg&&<p style={{margin:"0 0 10px",fontSize:12,fontWeight:600,color:availMsg.type==="ok"?"var(--gr)":"var(--ro)"}}>{availMsg.text}</p>}
                  <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"auto 1fr",gap:10,alignItems:"center"}}>
                    <motion.button type="button" whileHover={{scale:1.02}} whileTap={{scale:.97}} className={`btn-doc ${isMob?"w-full justify-center py-2.5":""}`} disabled={availBusy} onClick={saveAvailability} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"10px 20px",fontSize:13,borderRadius:12}}>{availBusy?<Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/>:"Save Availability"}</motion.button>
                    <div style={{padding:"10px 12px",borderRadius:11,border:`1px solid ${b1}`,background:"var(--s2)",color:t3,fontSize:12}}>Tip: Keep your availability updated to help patients book easily.</div>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
          {}
          {page==="patients"&&(
            <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:isMob?"calc(56px + env(safe-area-inset-bottom,0px))":0}}>
            <div className="w-full min-w-0 max-w-[1020px] mx-auto" style={{padding:isMob?"16px 14px":"32px 22px 48px"}}>
              {!selPat?(
                <>
                  <motion.div className="au" style={{marginBottom:isMob?18:22}}>
                    <h2 className="text-[22px] leading-tight sm:text-[26px]" style={{color:t1,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700,margin:0}}>Patients</h2>
                    <p style={{color:t3,fontSize:13,marginTop:4}}>{filtered.length} of {patients.length} shown</p>
                  </motion.div>
                  {}
                  <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"18px 20px",marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
                    <h4 style={{color:t1,fontSize:13,fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:8}}><UserPlus size={15} color={DocAC}/> Add patient by email</h4>
                    <p style={{color:t3,fontSize:12,marginBottom:12,lineHeight:1.45}}>Enter the patient's registered email address to add them to your list.</p>
                    <div className={`flex gap-2 ${isMob?"flex-col":"flex-row flex-wrap"}`}>
                      <input className="inp min-w-0" type="email" value={addPatientEmail} onChange={e=>setAddPatientEmail(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addPatientByEmail();}} placeholder="patient@email.com" style={{flex:1,minWidth:0,borderRadius:12,fontSize:16}}/>
                      <motion.button whileHover={{scale:1.03}} whileTap={{scale:.97}} onClick={addPatientByEmail} disabled={addPatientBusy||!addPatientEmail.trim()} className={`btn-doc justify-center ${isMob?"w-full py-2.5":""}`} style={{display:"flex",alignItems:"center",gap:7,padding:"10px 20px",fontSize:13,borderRadius:12,flexShrink:0}}>
                        {addPatientBusy?<Loader2 size={14} style={{animation:"spin360 .7s linear infinite"}}/>:<><UserPlus size={13}/> Add Patient</>}
                      </motion.button>
                    </div>
                    <AnimatePresence>
                      {addPatientMsg&&(
                        <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}} style={{marginTop:10}}>
                          {addPatientMsg.type==="ok"?<OkBanner msg={addPatientMsg.text}/>:<ErrBanner msg={addPatientMsg.text}/>}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                  <div style={{position:"relative",marginBottom:18}}>
                    <Search size={15} color={t3} style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                    <input className="inp w-full min-w-0" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patients..." style={{paddingLeft:42,borderRadius:14,fontSize:16}}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:9}}>
                    {filtered.map(p=>(
                      <motion.div key={p.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} whileHover={isMob?{}:{y:-2,boxShadow:"0 8px 28px rgba(0,0,0,.1)"}}
                        className="w-full min-w-0"
                        style={{display:"flex",alignItems:"flex-start",gap:isMob?10:14,padding:isMob?"12px 14px":"16px 20px",background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,.04)"}} onClick={()=>openPatient(p)}>
                        <div style={{width:isMob?38:46,height:isMob?38:46,borderRadius:14,background:"var(--doc-pd)",border:"1px solid rgba(14,116,144,.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><User size={isMob?16:20} color={DocAC}/></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate" style={{color:t1,fontSize:isMob?13:14.5,fontWeight:700,margin:0}} title={p.fullName}>{p.fullName}</p>
                          <p className="truncate" style={{color:t3,fontSize:11.5,marginTop:3}} title={p.email}>{p.email}</p>
                          {isMob&&(p.allergies?.length>0||p.conditions?.length>0)&&(
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {p.allergies?.length>0&&<span style={{padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:700,background:"rgba(185,28,28,.09)",border:"1px solid rgba(185,28,28,.2)",color:"var(--ro)"}}>{p.allergies.length} allerg{p.allergies.length>1?"ies":"y"}</span>}
                              {p.conditions?.length>0&&<span style={{padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:700,background:"rgba(217,119,6,.09)",border:"1px solid rgba(217,119,6,.2)",color:"var(--am)"}}>{p.conditions.length} condition{p.conditions.length>1?"s":""}</span>}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {!isMob&&p.allergies?.length>0&&<span style={{padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:700,background:"rgba(185,28,28,.09)",border:"1px solid rgba(185,28,28,.2)",color:"var(--ro)"}}>{p.allergies.length} allerg{p.allergies.length>1?"ies":"y"}</span>}
                          {!isMob&&p.conditions?.length>0&&<span style={{padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:700,background:"rgba(217,119,6,.09)",border:"1px solid rgba(217,119,6,.2)",color:"var(--am)"}}>{p.conditions.length} condition{p.conditions.length>1?"s":""}</span>}
                          <ArrowRight size={14} color={t3} className="mt-0.5"/>
                        </div>
                      </motion.div>
                    ))}
                    {filtered.length===0&&<div style={{padding:"48px 0",textAlign:"center"}}><UserPlus size={28} color={t3} style={{opacity:.2,margin:"0 auto 12px",display:"block"}}/><p style={{color:t3,fontSize:14}}>{patients.length===0?"No patients yet — add one by email above.":"No patients match your search."}</p></div>}
                  </div>
                </>
              ):(
                <>
                  <motion.button type="button" whileHover={{x:-3}} onClick={()=>setSelPat(null)} className="mb-4 sm:mb-6" style={{display:"flex",alignItems:"center",gap:7,color:DocAC,fontSize:13,fontWeight:700,background:"none",border:"none",cursor:"pointer",padding:0}}>
                    <ArrowRight size={14} style={{transform:"rotate(180deg)"}}/> Back to patients
                  </motion.button>
                  {loading?(
                    <div style={{display:"flex",alignItems:"center",gap:12,color:t3,padding:"40px 0"}}><Loader2 size={18} style={{animation:"spin360 .7s linear infinite"}}/><span>Loading...</span></div>
                  ):(
                    <>
                      <motion.div className="au w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:22,padding:isMob?"14px 12px":"22px 24px",marginBottom:16,boxShadow:"0 4px 20px rgba(0,0,0,.06)"}}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3.5">
                          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                            <div style={{width:isMob?44:58,height:isMob?44:58,borderRadius:isMob?14:18,background:"var(--doc-pd)",border:"1px solid rgba(14,116,144,.25)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><User size={isMob?20:26} color={DocAC}/></div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="break-words" style={{color:t1,fontSize:isMob?17:22,fontWeight:800,margin:0}}>{selPat.fullName}</h2>
                                {patFlag!=="none"&&<span className="shrink-0" style={{padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:700,background:FLAG_CONFIG[patFlag]?.bg,border:`1px solid ${FLAG_CONFIG[patFlag]?.border}`,color:FLAG_CONFIG[patFlag]?.color}}>{FLAG_CONFIG[patFlag]?.label}</span>}
                              </div>
                              <p className="truncate" style={{color:t3,fontSize:12,marginTop:3,marginBottom:0}} title={selPat.email}>{selPat.email}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {patProfile?.dob&&<span style={{padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:600,background:"var(--s2)",color:t2}}>DOB: {patProfile.dob}</span>}
                                {patProfile?.blood_type&&<span style={{padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:700,background:"rgba(185,28,28,.08)",border:"1px solid rgba(185,28,28,.18)",color:"var(--ro)"}}>Blood: {patProfile.blood_type}</span>}
                              </div>
                            </div>
                          </div>
                          <div className={`flex gap-2 ${isMob?"w-full flex-col":"flex-wrap items-start justify-end"}`}>
                            <motion.button type="button" whileHover={{scale:1.03}} whileTap={{scale:.97}} className={`btn-doc ${isMob?"w-full justify-center py-2.5":""}`} onClick={()=>setShowPrescribe(true)} style={{display:"flex",alignItems:"center",gap:7,padding:isMob?"10px 14px":"10px 18px",fontSize:isMob?12.5:13,borderRadius:12}}><Pill size={14}/> Prescribe</motion.button>
                            <motion.button type="button" whileHover={{scale:1.03}} whileTap={{scale:.97}} className={isMob?"w-full justify-center py-2.5":""} onClick={()=>{setShowSendToPharmacy(true);setSendToPharmacyDone(false);}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:isMob?"10px 14px":"10px 16px",borderRadius:12,border:"1px solid rgba(14,116,144,.3)",background:"rgba(14,116,144,.07)",color:DocAC,cursor:"pointer",fontFamily:"inherit",fontSize:isMob?12.5:13,fontWeight:600}}><Send size={13}/> Send to Pharmacy</motion.button>
                            <motion.button type="button" whileHover={{scale:1.03}} whileTap={{scale:.97}} className={isMob?"w-full justify-center py-2.5":""} onClick={()=>setPage("messages")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:isMob?"10px 14px":"10px 16px",borderRadius:12,border:"1px solid rgba(14,116,144,.3)",background:"transparent",color:DocAC,cursor:"pointer",fontFamily:"inherit",fontSize:isMob?12.5:13,fontWeight:600}}><MessageSquare size={13}/> Message</motion.button>
                            <motion.button type="button" whileHover={{scale:1.03}} whileTap={{scale:.97}} className={isMob?"w-full justify-center py-2.5":""} onClick={()=>setDeleteConfirm(selPat.id)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:isMob?"10px 14px":"10px 16px",borderRadius:12,border:"1px solid rgba(185,28,28,.25)",background:"rgba(185,28,28,.06)",color:"var(--ro)",cursor:"pointer",fontFamily:"inherit",fontSize:isMob?12.5:13,fontWeight:600}}><Trash2 size={13}/>{isMob?" Remove patient":" Remove"}</motion.button>
                          </div>
                        </div>
                      </motion.div>
                      <div className={`flex gap-2 mb-4 ${isMob?"snap-x snap-mandatory overflow-x-auto pb-2 -mx-3 px-3 touch-pan-x":"flex-wrap"}`}>
                        <TabBtn id="overview" label="Overview"/>
                        <TabBtn id="vitals" label="Vitals"/>
                        <TabBtn id="meds" label={isMob?"Meds":"Medications"} count={patMeds.length}/>
                        <TabBtn id="notes" label="Notes" count={notes.length}/>
                        <TabBtn id="appointments" label={isMob?"Appts":"Appointments"} count={appointments.filter(a=>a.status!=="cancelled").length}/>
                        <TabBtn id="prescriptions" label="Rx" count={patRx.length}/>
                      </div>
                      {activeTab==="overview"&&(
                        <div className="min-w-0" style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:isMob?12:14}}>
                          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="min-w-0" style={{gridColumn:"1/-1",background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"18px 20px"}}>
                            <h4 style={{color:t1,fontSize:13.5,fontWeight:700,marginBottom:12}}>Patient Status</h4>
                            <div className={`flex gap-2 ${isMob?"flex-col":"flex-wrap"}`}>
                              {Object.entries(FLAG_CONFIG).map(([k,v])=>(<motion.button type="button" key={k} whileTap={{scale:.95}} onClick={()=>saveFlag(k)} className={isMob?"w-full justify-center":""} style={{padding:isMob?"10px 14px":"8px 16px",borderRadius:99,border:`1.5px solid ${patFlag===k?v.border:b1}`,background:patFlag===k?v.bg:"transparent",color:patFlag===k?v.color:t3,cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:700,transition:"all .18s"}}>{v.label}</motion.button>))}
                            </div>
                          </motion.div>
                          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:.05}} className="min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"18px 20px"}}>
                            <h4 style={{color:t1,fontSize:13.5,fontWeight:700,marginBottom:12,display:"flex",alignItems:"center",gap:8}}><AlertCircle size={14} color="var(--ro)" className="shrink-0"/> Allergies</h4>
                            {(patProfile?.allergies?.length||0)>0?(<div style={{display:"flex",flexWrap:"wrap",gap:7}}>{patProfile.allergies.map(a=><span key={a} className="max-w-full break-words" style={{padding:"4px 10px",borderRadius:99,fontSize:12,fontWeight:600,background:"rgba(185,28,28,.08)",border:"1px solid rgba(185,28,28,.2)",color:"var(--ro)"}}>{a}</span>)}</div>):<p style={{color:t3,fontSize:13,margin:0}}>None recorded</p>}
                          </motion.div>
                          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:.08}} className="min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"18px 20px"}}>
                            <h4 style={{color:t1,fontSize:13.5,fontWeight:700,marginBottom:12,display:"flex",alignItems:"center",gap:8}}><HeartPulse size={14} color="var(--am)" className="shrink-0"/> Medical Conditions</h4>
                            {(patProfile?.medical_conditions?.length||0)>0?(<div style={{display:"flex",flexWrap:"wrap",gap:7}}>{patProfile.medical_conditions.map(c=><span key={c} className="max-w-full break-words" style={{padding:"4px 10px",borderRadius:99,fontSize:12,fontWeight:600,background:"rgba(217,119,6,.08)",border:"1px solid rgba(217,119,6,.2)",color:"var(--am)"}}>{c}</span>)}</div>):<p style={{color:t3,fontSize:13,margin:0}}>None recorded</p>}
                          </motion.div>
                          {patProfile?.pre_visit_intake?.completed_at?(
                            <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:.11}} style={{ gridColumn:"1 / -1" }}>
                              <DoctorVirtualCheckInReadout
                                profile={patProfile}
                                t1={t1}
                                t3={t3}
                                b1={b1}
                                accent={DocAC}
                                compact={isMob}
                                onDownloadPdf={()=>downloadVirtualVisitCheckInPdf(patProfile)}
                                onRequestClear={()=>setCheckInClearAwaitingConfirmPatientId(selPat.id)}
                                onRequestRefill={selPat?.id ? () => void requestCheckInRefillForPatient(selPat.id) : undefined}
                                refillBusy={refillRequestBusyPatientId===selPat?.id}
                                clearBusy={clearCheckInBusy&&checkInClearAwaitingConfirmPatientId===selPat?.id}
                              />
                            </motion.div>
                          ):null}
                        </div>
                      )}
                      {activeTab==="vitals"&&(
                        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"22px 24px"}}>
                          <h4 style={{color:t1,fontSize:14,fontWeight:700,marginBottom:isMob?14:20}}>Record Vitals</h4>
                          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3, minmax(0, 1fr))",gap:isMob?12:14,marginBottom:18}}>
                            <VitalField label="Blood Pressure" field="bp" value={vitals.bp} placeholder="120/80" unit="mmHg"/>
                            <VitalField label="Heart Rate" field="hr" value={vitals.hr} placeholder="72" unit="bpm"/>
                            <VitalField label="Temperature" field="temp" value={vitals.temp} placeholder="98.6" unit="°F"/>
                            <VitalField label="Weight" field="weight" value={vitals.weight} placeholder="165" unit="lbs"/>
                            <VitalField label="O2 Saturation" field="o2" value={vitals.o2} placeholder="98" unit="%"/>
                          </div>
                          <div style={{marginBottom:18}}><label style={{display:"block",fontSize:10,fontWeight:800,letterSpacing:".1em",textTransform:"uppercase",color:t3,marginBottom:5}}>Visit Notes</label><textarea className="inp w-full min-w-0" rows={isMob?4:3} value={vitals.notes} onChange={e=>setVitals(v=>({...v,notes:e.target.value}))} placeholder="Notes from this visit..." style={{borderRadius:13,fontSize:16}}/></div>
                          <AnimatePresence>{vitalsSaved&&<div style={{marginBottom:12}}><OkBanner msg="Vitals saved."/></div>}</AnimatePresence>
                          <motion.button type="button" whileHover={{scale:1.02}} whileTap={{scale:.97}} className={`btn-doc ${isMob?"w-full justify-center py-3":""}`} disabled={vitalsBusy} onClick={saveVitals} style={{display:"flex",alignItems:"center",gap:7,padding:"11px 22px",fontSize:13.5,borderRadius:13}}>
                            {vitalsBusy?<Loader2 size={14} style={{animation:"spin360 .7s linear infinite"}}/>:"Save Vitals"}
                          </motion.button>
                        </motion.div>
                      )}
                      {activeTab==="meds"&&(
                        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"18px 20px"}}>
                          <h4 style={{color:t1,fontSize:14,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><Pill size={15} color={DocAC}/> Current Medications</h4>
                          {patMeds.length===0?<p style={{color:t3,fontSize:13}}>No medications on record</p>:(
                            <div style={{display:"flex",flexDirection:"column",gap:10}}>
                              {patMeds.map(m=>{const col=COLS[m.color]||COLS.blue;return(<div key={m.id} className="min-w-0" style={{display:"flex",alignItems:"flex-start",gap:12,padding:isMob?"10px 12px":"12px 14px",borderRadius:13,background:"var(--s2)",border:"1px solid var(--b0)"}}><div style={{width:36,height:36,borderRadius:11,background:col.d,border:`1px solid ${col.b}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Pill size={15} color={col.a}/></div><div className="min-w-0 flex-1"><p className="break-words" style={{color:t1,fontSize:13.5,fontWeight:700,margin:0}}>{m.medicationName}</p><p className="break-words" style={{color:t3,fontSize:12,marginTop:3}}>{[m.dosage,m.freq,to12h(m.reminderTime)].filter(Boolean).join(" · ")}</p></div></div>);})}
                            </div>
                          )}
                        </motion.div>
                      )}
                      {activeTab==="notes"&&(
                        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"20px 22px"}}>
                          <h4 style={{color:t1,fontSize:14,fontWeight:700,marginBottom:16}}>Clinical Notes</h4>
                          <textarea className="inp w-full min-w-0" rows={isMob?4:3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a clinical note..." style={{marginBottom:10,borderRadius:13,fontSize:16}}/>
                          <AnimatePresence>{noteSaved&&<div style={{marginBottom:10}}><OkBanner msg="Note saved."/></div>}</AnimatePresence>
                          <motion.button type="button" whileHover={{scale:1.02}} whileTap={{scale:.97}} className={`btn-doc mb-5 ${isMob?"w-full justify-center py-2.5":""}`} disabled={noteBusy||!note.trim()} onClick={addNote} style={{display:"flex",alignItems:"center",gap:7,padding:"10px 18px",fontSize:13,borderRadius:12}}>
                            {noteBusy?<Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/>:<><Plus size={13}/> Add Note</>}
                          </motion.button>
                          <div style={{display:"flex",flexDirection:"column",gap:10}}>
                            {notes.map(n=>(<motion.div key={n.id} layout className="min-w-0 overflow-hidden" style={{padding:isMob?"12px 14px":"13px 16px",borderRadius:14,background:"var(--s2)",border:"1px solid var(--b0)"}}>
                              {editNote?.id===n.id?(<div><textarea className="inp w-full min-w-0" rows={isMob?4:3} value={editNote.text} onChange={e=>setEditNote(p=>({...p,text:e.target.value}))} style={{marginBottom:10,borderRadius:11,fontSize:16}}/><div className={`flex gap-2 ${isMob?"flex-col":"flex-row"}`}><button type="button" className={`btn-doc ${isMob?"w-full py-2":""}`} disabled={noteBusy} onClick={saveEditNote} style={{padding:"7px 16px",fontSize:12,borderRadius:10}}>{noteBusy?<Loader2 size={12} style={{animation:"spin360 .7s linear infinite"}}/>:"Save"}</button><button type="button" className={isMob?"w-full py-2":""} onClick={()=>setEditNote(null)} style={{padding:"7px 14px",fontSize:12,borderRadius:10,border:"1px solid var(--b1)",background:"transparent",color:t3,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button></div></div>)
                              :(<div><p className="break-words" style={{color:t1,fontSize:13.5,lineHeight:1.7,margin:0}}>{n.note}</p><div className="mt-2.5 flex flex-wrap items-center justify-between gap-2"><span style={{color:t3,fontSize:11}}>{new Date(n.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span><div className="flex gap-1.5"><motion.button type="button" whileHover={{scale:1.1}} whileTap={{scale:.9}} className="ibtn primary" onClick={()=>setEditNote({id:n.id,text:n.note})}><Pencil size={12}/></motion.button><motion.button type="button" whileHover={{scale:1.1}} whileTap={{scale:.9}} className="ibtn danger" onClick={()=>deleteNote(n.id)}><Trash2 size={12}/></motion.button></div></div></div>)}
                            </motion.div>))}
                            {notes.length===0&&<p style={{color:t3,fontSize:13,padding:"8px 0"}}>No notes yet.</p>}
                          </div>
                        </motion.div>
                      )}
                      {activeTab==="appointments"&&(
                        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="min-w-0" style={{display:"flex",flexDirection:"column",gap:14}}>
                          {rescheduleReqs.length>0&&(<div className="min-w-0 overflow-hidden" style={{background:"rgba(217,119,6,.07)",border:"1px solid rgba(217,119,6,.25)",borderRadius:16,padding:isMob?"14px 14px":"16px 18px"}}><p style={{color:"var(--am)",fontSize:13,fontWeight:700,marginBottom:12}}>{rescheduleReqs.length} reschedule request{rescheduleReqs.length>1?"s":""}</p>{rescheduleReqs.map(ap=>(<RescheduleRequestRow key={ap.id} appt={ap} onApproveRequested={()=>void approveRescheduleAsRequested(ap)} onDeny={(msg)=>void denyOrWithdrawReschedule(ap,msg)} onSuggest={(nd,nt)=>void suggestRescheduleTime(ap,nd,nt)} t1={t1} t3={t3}/>))}</div>)}
                          <div className="w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"20px 22px"}}>
                            <h4 style={{color:t1,fontSize:14,fontWeight:700,marginBottom:16}}>Schedule Appointment</h4>
                            <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:10}}>
                              <div className="min-w-0"><label style={{display:"block",fontSize:10,fontWeight:800,letterSpacing:".09em",textTransform:"uppercase",color:t3,marginBottom:5}}>Date</label><input className="inp w-full min-w-0" type="date" value={apptForm.date} onChange={e=>setApptForm(f=>({...f,date:e.target.value}))} style={{borderRadius:11,fontSize:16}}/></div>
                              <div className="min-w-0"><label style={{display:"block",fontSize:10,fontWeight:800,letterSpacing:".09em",textTransform:"uppercase",color:t3,marginBottom:5}}>Time</label><input className="inp w-full min-w-0" type="time" value={apptForm.time} onChange={e=>setApptForm(f=>({...f,time:e.target.value}))} style={{borderRadius:11,fontSize:16}}/></div>
                            </div>
                            <div className="min-w-0" style={{marginBottom:10}}><label style={{display:"block",fontSize:10,fontWeight:800,letterSpacing:".09em",textTransform:"uppercase",color:t3,marginBottom:5}}>Type</label><select className="inp w-full min-w-0" value={apptForm.type} onChange={e=>setApptForm(f=>({...f,type:e.target.value}))} style={{borderRadius:11,fontSize:16}}>{["Follow-up","Check-up","Consultation","Lab review","New patient","Urgent care","Telehealth"].map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                            <div className="min-w-0" style={{marginBottom:14}}><label style={{display:"block",fontSize:10,fontWeight:800,letterSpacing:".09em",textTransform:"uppercase",color:t3,marginBottom:5}}>Notes (optional)</label><input className="inp w-full min-w-0" value={apptForm.notes} onChange={e=>setApptForm(f=>({...f,notes:e.target.value}))} style={{borderRadius:11,fontSize:16}}/></div>
                            <motion.button type="button" whileHover={{scale:1.02}} whileTap={{scale:.97}} className={`btn-doc ${isMob?"w-full justify-center py-2.5":""}`} disabled={apptBusy||!apptForm.date||!apptForm.time} onClick={addAppointment} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"10px 20px",fontSize:13,borderRadius:12}}>{apptBusy?<Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/>:<><Calendar size={13}/> Schedule &amp; Notify</>}</motion.button>
                          </div>
                          <div className="w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"20px 22px"}}>
                            <h4 style={{color:t1,fontSize:14,fontWeight:700,marginBottom:14}}>All Appointments</h4>
                            {appointments.filter(a=>a.status!=="cancelled").length===0?<p style={{color:t3,fontSize:13}}>No appointments yet.</p>:(
                              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                                {[...appointments].filter(a=>a.status!=="cancelled").sort((a,b)=>new Date(a.date+"T"+a.time)-new Date(b.date+"T"+b.time)).map(appt=>{
                                  const apptDate=new Date(appt.date+"T"+appt.time);const isPast=apptDate<new Date();
                                  return (<div key={appt.id} className="min-w-0" style={{display:"flex",alignItems:"flex-start",gap:isMob?8:14,padding:isMob?"10px 12px":"13px 16px",borderRadius:13,background:isPast?"var(--s2)":"rgba(14,116,144,.05)",border:`1px solid ${isPast?"var(--b0)":"rgba(14,116,144,.15)"}`,opacity:isPast?0.65:1}}>
                                    <div style={{flexShrink:0,textAlign:"center",minWidth:40,padding:"6px 6px",borderRadius:10,background:isPast?"var(--b0)":"var(--doc-pd)"}}><p style={{color:isPast?t3:DocAC,fontSize:9,fontWeight:800,textTransform:"uppercase",margin:0}}>{apptDate.toLocaleDateString("en-US",{month:"short"})}</p><p style={{color:isPast?t3:t1,fontSize:isMob?17:19,fontWeight:800,fontFamily:"'Playfair Display',serif",lineHeight:1,margin:0}}>{apptDate.getDate()}</p></div>
                                    <div className="min-w-0 flex-1"><p className="break-words" style={{color:t1,fontSize:13.5,fontWeight:700,margin:0}}>{appt.type}</p><p className="break-words" style={{color:t3,fontSize:12,marginTop:2}}>{apptDate.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}{appt.notes?` · ${appt.notes}`:""}</p></div>
                                    <motion.button type="button" whileHover={{scale:1.1}} whileTap={{scale:.9}} className="ibtn danger shrink-0" onClick={()=>deleteAppointment(appt.id)}><Trash2 size={12}/></motion.button>
                                  </div>);
                                })}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                      {activeTab==="prescriptions"&&(
                        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="w-full min-w-0 overflow-hidden" style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:isMob?"14px 14px":"20px 22px"}}>
                          <div className={`mb-4 flex gap-3 ${isMob?"flex-col":"flex-row items-center justify-between"}`}>
                            <h4 style={{color:t1,fontSize:14,fontWeight:700,margin:0}}>Prescriptions</h4>
                            <motion.button type="button" whileHover={{scale:1.03}} whileTap={{scale:.97}} className={`btn-doc shrink-0 ${isMob?"w-full justify-center py-2":""}`} onClick={()=>setShowPrescribe(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"8px 16px",fontSize:12.5,borderRadius:11}}><Plus size={13}/> New prescription</motion.button>
                          </div>
                          {patRx.length===0?<p style={{color:t3,fontSize:13}}>No prescriptions yet.</p>:(
                            <div style={{display:"flex",flexDirection:"column",gap:12}}>
                              {patRx.map(rx=>{
                                const isOpen=selRxChat===rx.id;
                                const statusColors={pending_pharmacist:{bg:"rgba(217,119,6,.1)",color:"var(--am)"},pending_fill:{bg:"rgba(14,116,144,.1)",color:DocAC},ready:{bg:"rgba(5,150,105,.1)",color:"var(--gr)"},filled:{bg:"rgba(5,150,105,.1)",color:"var(--gr)"},picked_up:{bg:"rgba(5,150,105,.08)",color:"var(--gr)"}};
                                const sc=statusColors[rx.status]||{bg:"var(--s2)",color:t3};
                                return(
                                  <div key={rx.id} className="min-w-0" style={{border:`1px solid ${b1}`,borderRadius:14,overflow:"hidden"}}>
                                    <div style={{padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,background:"var(--s2)"}}>
                                      <div style={{flex:1,minWidth:0}}>
                                        <span style={{color:t2,fontSize:12,fontWeight:600}}>{new Date(rx.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
                                        {rx.notes&&<p style={{color:t3,fontSize:11,margin:"3px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rx.notes}</p>}
                                      </div>
                                      <span style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:700,background:sc.bg,color:sc.color,flexShrink:0}}>{PRESCRIPTION_STATUS_LABELS[rx.status]||rx.status}</span>
                                      <button onClick={()=>{setSelRxChat(isOpen?null:rx.id);}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${b1}`,background:isOpen?DocAC:"transparent",color:isOpen?"#fff":t3,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",flexShrink:0}}>
                                        {isOpen?"Close":"Chat"}
                                      </button>
                                    </div>
                                    {isOpen&&(
                                      <div style={{borderTop:`1px solid ${b1}`,display:"flex",flexDirection:"column",height:280}}>
                                        <div style={{flex:1,overflowY:"auto",padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,background:"var(--bg)"}}>
                                          {rxMessages.length===0&&<p style={{color:t3,fontSize:12,textAlign:"center",margin:"auto 0"}}>No messages yet. Start the conversation.</p>}
                                          {rxMessages.map(m=>{
                                            const isMe=m.sender_id===user.id;
                                            return(
                                              <div key={m.id} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start"}}>
                                                <div style={{maxWidth:"75%",padding:"7px 12px",borderRadius:isMe?"14px 14px 3px 14px":"14px 14px 14px 3px",background:isMe?DocAC:"var(--s1)",border:isMe?"none":`1px solid ${b1}`,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
                                                  <p style={{color:isMe?"#fff":t1,fontSize:13,margin:0,wordBreak:"break-word"}}>{m.body}</p>
                                                  <p style={{color:isMe?"rgba(255,255,255,.6)":t3,fontSize:9,margin:"3px 0 0",textAlign:isMe?"right":"left"}}>{new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        <div style={{padding:"8px 12px",borderTop:`1px solid ${b1}`,display:"flex",gap:8,background:"var(--s1)"}}>
                                          <input value={rxMsgInput} onChange={e=>setRxMsgInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendRxMessage();}}} placeholder="Message pharmacist about this prescription…" style={{flex:1,border:`1px solid ${b1}`,borderRadius:10,padding:"8px 12px",fontSize:13,background:"var(--s2)",color:t1,outline:"none",fontFamily:"inherit"}}/>
                                          <button onClick={sendRxMessage} disabled={rxMsgSending||!rxMsgInput.trim()} style={{padding:"8px 14px",borderRadius:10,border:"none",background:DocAC,color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,opacity:rxMsgInput.trim()?1:0.5}}>
                                            {rxMsgSending?<Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/>:<Send size={13}/>}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </>
                  )}
                  <AnimatePresence>
                    {deleteConfirm&&(
                      <motion.div className="ov" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setDeleteConfirm(null)}>
                        <motion.div className="mo" onClick={e=>e.stopPropagation()} initial={{y:20,opacity:0,scale:.96}} animate={{y:0,opacity:1,scale:1}} exit={{y:16,opacity:0}} transition={{type:"spring",damping:26,stiffness:300}} style={{maxWidth:400}}>
                          <div style={{textAlign:"center",padding:"8px 0 20px"}}>
                            <div style={{width:56,height:56,borderRadius:18,background:"rgba(185,28,28,.1)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px"}}><Trash2 size={24} color="var(--ro)"/></div>
                            <h3 style={{color:t1,fontSize:18,fontWeight:700,marginBottom:8}}>Remove patient?</h3>
                            <p className="break-words px-1" style={{color:t3,fontSize:13.5,lineHeight:1.7,marginBottom:22}}>Removes notes and prescriptions for <strong style={{color:t1}}>{selPat?.fullName}</strong>.</p>
                            <div className={`flex gap-3 ${isMob?"flex-col":"flex-row"}`}>
                              <button type="button" className="bto" style={{flex:1,minHeight:44}} onClick={()=>setDeleteConfirm(null)}>Cancel</button>
                              <motion.button type="button" whileHover={{scale:1.02}} whileTap={{scale:.97}} disabled={deleteBusy} onClick={()=>deletePatient(deleteConfirm)} style={{flex:1,minHeight:44,padding:"11px",borderRadius:12,border:"none",background:"var(--ro)",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13.5,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                                {deleteBusy?<Loader2 size={14} style={{animation:"spin360 .7s linear infinite"}}/>:<><Trash2 size={14}/> Remove</>}
                              </motion.button>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
            </div>
          )}
        </div>
      </div>
      <AnimatePresence>
        {virtualCheckInPatientProfile&&(
          <div role="dialog" aria-modal="true" style={{position:"fixed",inset:0,zIndex:500,background:"rgba(15,23,42,.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setVirtualCheckInPatientProfile(null)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"var(--s1)",borderRadius:16,maxWidth:520,width:"100%",maxHeight:"86vh",overflowY:"auto",padding:22,border:`1px solid ${b1}`,boxShadow:"0 16px 44px rgba(0,0,0,.22)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:12,marginBottom:8}}>
                <button type="button" aria-label="Close" onClick={()=>setVirtualCheckInPatientProfile(null)} style={{border:"none",background:"transparent",color:t3,cursor:"pointer",fontSize:22,lineHeight:1,padding:0}}>×</button>
              </div>
              {virtualCheckInPatientProfile.pre_visit_intake?.completed_at?(
                <DoctorVirtualCheckInReadout
                  profile={virtualCheckInPatientProfile}
                  t1={t1}
                  t3={t3}
                  b1={b1}
                  accent={DocAC}
                  compact
                  onDownloadPdf={()=>downloadVirtualVisitCheckInPdf(virtualCheckInPatientProfile)}
                  onRequestClear={virtualCheckInPatientProfile.id?()=>setCheckInClearAwaitingConfirmPatientId(virtualCheckInPatientProfile.id):undefined}
                  onRequestRefill={virtualCheckInPatientProfile?.id ? () => void requestCheckInRefillForPatient(virtualCheckInPatientProfile.id) : undefined}
                  refillBusy={refillRequestBusyPatientId===virtualCheckInPatientProfile?.id}
                  clearBusy={clearCheckInBusy&&checkInClearAwaitingConfirmPatientId===virtualCheckInPatientProfile.id}
                />
              ):(
                <p style={{color:t3,fontSize:13,margin:0}}>This patient has not submitted a virtual check-in yet.</p>
              )}
            </div>
          </div>
        )}
        {checkInClearAwaitingConfirmPatientId&&(
          <motion.div className="ov" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} style={{zIndex:520}} onClick={()=>{if(!clearCheckInBusy)setCheckInClearAwaitingConfirmPatientId(null);}}>
            <motion.div className="mo" onClick={e=>e.stopPropagation()} initial={{y:20,opacity:0,scale:.96}} animate={{y:0,opacity:1,scale:1}} exit={{y:16,opacity:0}} transition={{type:"spring",damping:26,stiffness:300}} style={{maxWidth:440}}>
              <div style={{textAlign:"center",padding:"8px 0 20px"}}>
                <div style={{width:56,height:56,borderRadius:18,background:"rgba(14,116,144,.12)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px"}}><FileText size={24} color={DocAC}/></div>
                <h3 style={{color:t1,fontSize:18,fontWeight:700,marginBottom:8}}>Delete check-in form?</h3>
                <p style={{color:t3,fontSize:13.5,lineHeight:1.7,marginBottom:22,textAlign:"left"}}>This removes saved check-in responses from their chart (including allergy/condition lists from that form). The patient will fill out the form again for their appointment—nothing from the deleted form will be shown or auto-filled.</p>
                <div className={`flex gap-3 ${isMob?"flex-col":"flex-row"}`}>
                  <button type="button" className="bto" style={{flex:1,minHeight:44}} onClick={()=>{if(!clearCheckInBusy)setCheckInClearAwaitingConfirmPatientId(null);}}>Cancel</button>
                  <motion.button type="button" whileHover={{scale:1.02}} whileTap={{scale:.97}} disabled={clearCheckInBusy} onClick={()=>void confirmClearPatientVirtualCheckIn()} style={{flex:1,minHeight:44,padding:"11px",borderRadius:12,border:"none",background:"var(--ro)",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13.5,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    {clearCheckInBusy?<Loader2 size={14} style={{animation:"spin360 .7s linear infinite"}}/>:<><Trash2 size={14}/> Delete Form</>}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        {showPrescribe&&selPat&&(<PrescribeModal patient={selPat} patientProfile={patProfile} doctor={user} onClose={()=>setShowPrescribe(false)} onSuccess={()=>setShowPrescribe(false)}/>)}
      </AnimatePresence>
      <AnimatePresence>{showNickname&&<NicknameModal currentName={name} onSave={saveName} onClose={()=>setShowNickname(false)} userId={user?.id}/>}</AnimatePresence>

      {/* Notification panel */}
      <AnimatePresence>
        {showNotifPanel&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowNotifPanel(false)} style={{position:"fixed",inset:0,zIndex:70}}>
            <motion.div initial={{opacity:0,y:-8,scale:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8}} transition={{type:"spring",damping:28,stiffness:320}} onClick={e=>e.stopPropagation()} style={{position:"absolute",top:58,right:isMob?8:16,width:isMob?"calc(100vw - 16px)":"360px",maxHeight:"70vh",display:"flex",flexDirection:"column",background:"var(--bg)",border:`1px solid ${b1}`,borderRadius:18,boxShadow:"0 16px 48px rgba(0,0,0,.18)",overflow:"hidden",zIndex:71}}>
              <div style={{padding:"14px 16px",borderBottom:`1px solid ${b1}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,flexWrap:"wrap",gap:8}}>
                <h3 style={{color:t1,fontSize:14,fontWeight:700,margin:0,display:"flex",alignItems:"center",gap:7}}><Bell size={13} color={DocAC}/> Notifications {unreadNotifCount>0&&<span style={{background:"var(--ro)",color:"#fff",borderRadius:99,fontSize:10,fontWeight:800,padding:"1px 7px"}}>{unreadNotifCount}</span>}</h3>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  {docNotifs.length>0&&<button type="button" onClick={(e)=>{e.stopPropagation();clearAllNotifs();}} style={{fontSize:11,fontWeight:600,color:"var(--ro)",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:4}}><Trash2 size={12}/> Clear all</button>}
                  {unreadNotifCount>0&&<button type="button" onClick={(e)=>{e.stopPropagation();markAllNotifsRead();}} style={{fontSize:11,fontWeight:600,color:DocAC,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:4}}><CheckCheck size={12}/> Mark all read</button>}
                </div>
              </div>
              <div style={{flex:1,overflowY:"auto"}}>
                {docNotifs.length===0&&<p style={{color:t3,fontSize:13,textAlign:"center",padding:"28px 16px"}}>No notifications yet.</p>}
                {docNotifs.map(n=>(
                  <div key={n.id} style={{padding:"10px 12px",borderBottom:`1px solid ${b1}`,background:n.read_at?"transparent":"rgba(14,116,144,.04)",display:"flex",gap:8,alignItems:"flex-start"}}>
                    <div role="button" tabIndex={0} onClick={(e)=>{ e.stopPropagation(); void openNotificationTarget(n); }} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ") { e.preventDefault(); void openNotificationTarget(n); }}} style={{flex:1,minWidth:0,cursor:"pointer",padding:"2px 4px 2px 0",borderRadius:8}} onMouseEnter={e=>{e.currentTarget.style.background="var(--s2)"}} onMouseLeave={e=>{e.currentTarget.style.background="transparent"}}>
                      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:n.read_at?"transparent":DocAC,flexShrink:0,marginTop:5}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <p style={{color:t1,fontSize:13,fontWeight:n.read_at?500:700,margin:0}}>{n.title}</p>
                          {n.body&&<p style={{color:t3,fontSize:12,margin:"3px 0 0",lineHeight:1.5}}>{n.body}</p>}
                          <p style={{color:t3,fontSize:10,margin:"4px 0 0"}}>{new Date(n.created_at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</p>
                        </div>
                      </div>
                    </div>
                    <button type="button" title="Dismiss" onClick={(e)=>{e.stopPropagation();removeNotif(n.id);}} style={{flexShrink:0,width:30,height:30,borderRadius:8,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3}}><X size={14}/></button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Doctor AI Chat Drawer */}
      <AnimatePresence>
        {showDocAI&&(
          <motion.div initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}} transition={{type:"spring",damping:28,stiffness:280}} style={{position:"fixed",top:0,right:0,bottom:0,width:isMob?"100vw":"400px",background:"var(--bg)",borderLeft:`1px solid ${b1}`,zIndex:75,display:"flex",flexDirection:"column",boxShadow:"-8px 0 32px rgba(0,0,0,.12)"}}>
            <div style={{padding:"14px 16px",borderBottom:`1px solid ${b1}`,display:"flex",alignItems:"center",gap:10,flexShrink:0,background:"var(--s1)"}}>
              <div style={{width:34,height:34,borderRadius:10,background:"var(--doc-pd)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Sparkles size={15} color={DocAC}/></div>
              <div style={{flex:1}}>
                <p style={{color:t1,fontSize:14,fontWeight:700,margin:0}}>Clinical Assistant</p>
                <p style={{color:t3,fontSize:11,margin:0}}>AI-powered clinical guidance</p>
              </div>
              <button onClick={()=>setShowDocAI(false)} style={{width:30,height:30,borderRadius:9,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3}}><X size={13}/></button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
              {aiMessages.length===0&&(
                <div style={{textAlign:"center",padding:"40px 16px"}}>
                  <Sparkles size={28} color={t3} style={{opacity:.2,margin:"0 auto 12px",display:"block"}}/>
                  <p style={{color:t2,fontSize:14,fontWeight:600,marginBottom:6}}>Clinical AI Assistant</p>
                  <p style={{color:t3,fontSize:12,lineHeight:1.6}}>Ask about drug interactions, clinical guidelines, dosing, or patient management.</p>
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:16}}>
                    {["Drug interactions for metformin + lisinopril","Signs of serotonin syndrome","Hypertension management guidelines","When to refer for cardiology"].map(s=>(
                      <button key={s} onClick={()=>{setAiInput(s);}} style={{padding:"8px 12px",borderRadius:10,border:`1px solid ${b1}`,background:"var(--s2)",color:t2,cursor:"pointer",fontFamily:"inherit",fontSize:12,textAlign:"left"}}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {aiMessages.map((m,i)=>(
                <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"85%",padding:"10px 14px",borderRadius:m.role==="user"?"18px 18px 3px 18px":"18px 18px 18px 3px",background:m.role==="user"?DocAC:"var(--s1)",border:m.role==="user"?"none":`1px solid ${b1}`,color:m.role==="user"?"#fff":t1,fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                    {m.content}
                  </div>
                </div>
              ))}
              {aiLoading&&<div style={{display:"flex",gap:5,padding:"10px 14px",borderRadius:"18px 18px 18px 3px",background:"var(--s1)",border:`1px solid ${b1}`,width:"fit-content"}}>{[0,1,2].map(d=><span key={d} style={{width:6,height:6,borderRadius:"50%",background:t3,display:"inline-block",animation:`typingDot 1.2s ${d*.2}s infinite ease-in-out`}}/>)}</div>}
              <div ref={aiEndRef}/>
            </div>
            <div style={{padding:"12px 14px calc(12px + env(safe-area-inset-bottom,0px))",borderTop:`1px solid ${b1}`,background:"var(--s1)",flexShrink:0}}>
              <p style={{color:"var(--am)",fontSize:10,margin:"0 0 8px",display:"flex",alignItems:"center",gap:4}}><AlertTriangle size={10}/> For guidance only — not a substitute for clinical judgment.</p>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1,background:"var(--s2)",border:`1.5px solid ${b1}`,borderRadius:16,padding:"9px 13px"}} onClick={e=>e.currentTarget.querySelector("textarea")?.focus()}>
                  <textarea value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendDocAI();}}} placeholder="Ask a clinical question…" rows={1} style={{border:"none",background:"transparent",resize:"none",padding:0,fontSize:14,color:t1,outline:"none",fontFamily:"inherit",lineHeight:1.5,width:"100%",display:"block"}}/>
                </div>
                <button onClick={sendDocAI} disabled={aiLoading||!aiInput.trim()} style={{width:40,height:40,borderRadius:"50%",border:"none",background:DocAC,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:aiInput.trim()?1:0.45,flexShrink:0}}>
                  {aiLoading?<Loader2 size={14} style={{animation:"spin360 .7s linear infinite"}}/>:<Send size={14}/>}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dashModal&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setDashModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <motion.div initial={{y:20,opacity:0,scale:.97}} animate={{y:0,opacity:1,scale:1}} exit={{y:16,opacity:0}} transition={{type:"spring",damping:26,stiffness:300}} onClick={e=>e.stopPropagation()} style={{background:"var(--bg)",borderRadius:20,width:"100%",maxWidth:480,maxHeight:"80vh",display:"flex",flexDirection:"column",border:`1px solid ${b1}`,boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${b1}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                <h3 style={{color:t1,fontSize:16,fontWeight:700,margin:0}}>{dashModal.title}</h3>
                <button onClick={()=>setDashModal(null)} style={{width:30,height:30,borderRadius:9,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3}}><X size={13}/></button>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
                {dashModal.items.length===0
                  ?<p style={{color:t3,fontSize:13,textAlign:"center",padding:"24px 0"}}>Nothing to show.</p>
                  :dashModal.items.map(dashModal.render)
                }
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSendToPharmacy&&selPat&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowSendToPharmacy(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <motion.div initial={{y:20,opacity:0,scale:.97}} animate={{y:0,opacity:1,scale:1}} exit={{y:16,opacity:0}} transition={{type:"spring",damping:26,stiffness:300}} onClick={e=>e.stopPropagation()} style={{background:"var(--bg)",borderRadius:20,padding:24,width:"100%",maxWidth:400,border:`1px solid ${b1}`,boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <div style={{width:40,height:40,borderRadius:12,background:"var(--doc-pd)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><User size={18} color={DocAC}/></div>
                <div><h3 style={{color:t1,fontSize:16,fontWeight:700,margin:0}}>Send to Pharmacy</h3><p style={{color:t3,fontSize:12,margin:0}}>{selPat.fullName}</p></div>
              </div>
              <div style={{padding:"10px 14px",background:"var(--s2)",borderRadius:12,marginBottom:16,display:"flex",flexDirection:"column",gap:5}}>
                {[["Patient",selPat.fullName],[patProfile?.dob&&"DOB",patProfile?.dob],[patProfile?.blood_type&&"Blood Type",patProfile?.blood_type],[(patProfile?.allergies?.length>0)&&"Allergies",(patProfile?.allergies||[]).join(", ")],[(patProfile?.medical_conditions?.length>0)&&"Conditions",(patProfile?.medical_conditions||[]).join(", ")],[patMeds.length>0&&"Medications",patMeds.map(m=>m.medicationName).join(", ")]].filter(([k])=>k).map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:8}}><span style={{color:t3,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",minWidth:76,paddingTop:1,flexShrink:0}}>{k}</span><span style={{color:t1,fontSize:12}}>{v||"—"}</span></div>
                ))}
              </div>
              {sendToPharmacyDone?(
                <div style={{display:"flex",alignItems:"center",gap:8,color:"var(--gr)",fontSize:13,fontWeight:600,justifyContent:"center",padding:"8px 0"}}><CheckCircle2 size={16}/> Sent to pharmacy.</div>
              ):chatContacts.length===0?(
                <div style={{textAlign:"center",padding:"8px 0"}}>
                  <p style={{color:t3,fontSize:13,marginBottom:12}}>No pharmacy contacts yet. Add one in Messages first.</p>
                  <button onClick={()=>{setShowSendToPharmacy(false);setPage("messages");}} style={{padding:"9px 18px",borderRadius:11,border:"none",background:DocAC,color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700}}>Go to Messages</button>
                </div>
              ):(
                <>
                  <p style={{color:t3,fontSize:12,marginBottom:8}}>Select pharmacy:</p>
                  <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:200,overflowY:"auto"}}>
                    {chatContacts.map(ph=>(
                      <button key={ph.id} onClick={()=>sendPatientToPharmacy(ph)} disabled={sendToPharmacyBusy} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:12,border:`1px solid ${b1}`,background:"var(--s1)",cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"border-color .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=DocAC} onMouseLeave={e=>e.currentTarget.style.borderColor=b1}>
                        <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#6d28d9)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{color:"#fff",fontSize:11,fontWeight:800}}>{ph.name[0]?.toUpperCase()}</span></div>
                        <div style={{flex:1,minWidth:0}}><p style={{color:t1,fontSize:13,fontWeight:700,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ph.name}</p><p style={{color:t3,fontSize:11,margin:0}}>{ph.pharmacy||ph.email||""}</p></div>
                        {sendToPharmacyBusy?<Loader2 size={13} style={{animation:"spin360 .7s linear infinite",color:t3,flexShrink:0}}/>:<Send size={12} color={DocAC} style={{flexShrink:0}}/>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Mobile bottom nav — hidden inside open chat so it never overlaps input ── */}
      {isMob&&!(page==="messages"&&selChat)&&(
        <nav className="btabs">
          {[["dashboard",HeartPulse,"Dashboard"],["availability",Calendar,"Slots"],["virtual",Video,"Video"],["patients",User,"Patients"],["messages",MessageSquare,"Msgs"]].map(([id,I,l])=>(
            <button key={id} className={`bt ${page===id?"on":""}`} onClick={()=>{setPage(id);setSelPat(null);}}>
              <I size={19}/>
              {id==="messages"&&totalChatUnread>0
                ?<span style={{position:"relative"}}>{l}<span style={{position:"absolute",top:-6,right:-10,background:"var(--ro)",color:"#fff",borderRadius:99,fontSize:8,fontWeight:800,padding:"1px 4px"}}>{totalChatUnread}</span></span>
                :id==="availability"&&availabilitySlotCount>0
                  ?<span style={{position:"relative"}}>{l}<span style={{position:"absolute",top:-6,right:-10,background:DocAC,color:"#fff",borderRadius:99,fontSize:8,fontWeight:800,padding:"1px 4px"}}>{availabilitySlotCount}</span></span>
                  :id==="virtual"&&activeVirtualCount>0
                    ?<span style={{position:"relative"}}>{l}<span style={{position:"absolute",top:-6,right:-10,background:"var(--gr)",color:"#fff",borderRadius:99,fontSize:8,fontWeight:800,padding:"1px 4px"}}>{activeVirtualCount}</span></span>
                  :l}
            </button>
          ))}
        </nav>
      )}
      {/* ── Mobile slide-in menu ── */}
      <AnimatePresence>
        {mobMenu&&(
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setMobMenu(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:60,backdropFilter:"blur(6px)"}}/>
            <motion.div initial={{x:"-100%"}} animate={{x:0}} exit={{x:"-100%"}} transition={{type:"spring",damping:28,stiffness:250}} style={{position:"fixed",left:0,top:0,bottom:0,width:260,zIndex:70,display:"flex",flexDirection:"column",background:"var(--bg2)",borderRight:`1px solid ${b1}`,paddingTop:"var(--safe-top)",paddingBottom:"var(--safe-bottom)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 14px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:9}}>
                  <Stethoscope size={16} color={DocAC}/>
                  <span style={{fontSize:16,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700}}><span style={{color:t1}}>Med</span><span style={{color:DocAC}}>Track</span></span>
                </div>
                <button onClick={()=>setMobMenu(false)} style={{width:28,height:28,borderRadius:8,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3}}><X size={13}/></button>
              </div>
              <div style={{margin:"0 12px 10px",padding:"10px 12px",borderRadius:11,background:"var(--doc-pd)",border:"1px solid rgba(14,116,144,.18)"}}>
                <p style={{color:t3,fontSize:10,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginBottom:2}}>Your patients</p>
                <p style={{color:DocAC,fontSize:22,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700,margin:0}}>{patients.length}</p>
              </div>
              <div style={{height:1,background:"var(--b0)",margin:"0 12px 8px"}}/>
              <nav style={{flex:1,padding:"0 7px",display:"flex",flexDirection:"column",gap:1}}>
                {[["dashboard","Dashboard",HeartPulse],["availability","Availability",Calendar],["virtual","Virtual Visits",Video],["patients","Patients",User],["messages","Messages",MessageSquare]].map(([id,l,I])=>(
                  <div key={id} className={`nl ${page===id?"doc-on":""}`} onClick={()=>{setPage(id);setSelPat(null);setMobMenu(false);}}>
                    <I size={15}/>{l}
                    {id==="availability"&&availabilitySlotCount>0&&<span style={{marginLeft:"auto",background:DocAC,color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{availabilitySlotCount}</span>}
                    {id==="virtual"&&activeVirtualCount>0&&<span style={{marginLeft:"auto",background:"var(--gr)",color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{activeVirtualCount}</span>}
                    {id==="patients"&&patients.length>0&&<span style={{marginLeft:"auto",background:DocAC,color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{patients.length}</span>}
                    {id==="messages"&&totalChatUnread>0&&<span style={{marginLeft:"auto",background:"var(--ro)",color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{totalChatUnread}</span>}
                  </div>
                ))}
              </nav>
              <div style={{padding:"6px 7px 26px",display:"flex",flexDirection:"column",gap:7}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px"}}>
                  <span style={{color:t3,fontSize:12}}>Dark mode</span>
                  <div className={`sw ${!light?"on":""}`} onClick={()=>setLight(!light)}/>
                </div>
                <button onClick={handleSignOut} style={{display:"flex",alignItems:"center",gap:7,padding:"10px 12px",borderRadius:11,border:"1px solid rgba(220,38,38,.18)",background:"rgba(220,38,38,.07)",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:500,color:"var(--ro)"}}><LogOut size={13}/> Sign Out</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
