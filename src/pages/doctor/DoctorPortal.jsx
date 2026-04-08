import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill, Calendar, LogOut, Moon, Sun, Menu, X, Plus, Send,
  Clock, Check, AlertCircle, Loader2, Bell, User, ArrowRight,
  CheckCircle2, Pencil, Stethoscope, HeartPulse, MessageSquare, Trash2,
  Search, UserPlus
} from "lucide-react";
import { supabase } from "../../supabase";
import { COLS, PRESCRIPTION_STATUS_LABELS } from "../../lib/constants";
import { to12h } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useIsMobile";
import ErrBanner from "../../components/common/ErrBanner";
import OkBanner from "../../components/common/OkBanner";
import NicknameModal from "../../components/modals/NicknameModal";
import PrescribeModal from "../../components/modals/PrescribeModal";
import RescheduleRequestRow from "../../components/appointments/RescheduleRequestRow";

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
  const [apptForm,setApptForm]=useState({date:"",time:"",type:"Follow-up",notes:""});
  const [apptBusy,setApptBusy]=useState(false);
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
  const [unreadCount,setUnreadCount]=useState(0);
  const [unreadPerContact,setUnreadPerContact]=useState({});
  const [onlineUsers,setOnlineUsers]=useState({});
  const [chatSearchEmail,setChatSearchEmail]=useState("");
  const [chatSearchBusy,setChatSearchBusy]=useState(false);
  const [chatSearchMsg,setChatSearchMsg]=useState(null);
  const [mobMenu,setMobMenu]=useState(false);
  const [showNickname,setShowNickname]=useState(false);
  // Patient picker in chat
  const [showPatPicker,setShowPatPicker]=useState(false);
  const [patPickerSearch,setPatPickerSearch]=useState("");
  const [chatPatient,setChatPatient]=useState(null);
  // Notification sound settings
  const [soundEnabled,setSoundEnabled]=useState(()=>localStorage.getItem("mt_sound_on")!=="false");
  const [soundType,setSoundType]=useState(()=>localStorage.getItem("mt_sound_type")||"ping");
  const [showSoundSettings,setShowSoundSettings]=useState(false);
  const msgEndRef=useRef(null);
  const isMob=useIsMobile();
  const t1="var(--t1)",t2="var(--t2)",t3="var(--t3)",b1="var(--b1)";
  const DocAC="var(--doc-p)";
  const [localName,setLocalName]=useState(userName);
  useEffect(()=>{ if(userName) setLocalName(userName); },[userName]);
  const name=localName||userName||user?.displayName||user?.email?.split("@")[0]||"Doctor";
  const saveName=(n)=>{ setLocalName(n); if(setDisplayName) setDisplayName(n); };

  async function handleSignOut(){
    // Update local state immediately so UI reflects offline before redirect
    setOnlineUsers(prev=>{const n={...prev};delete n[user.id];return n;});
    await supabase.from("user_presence").upsert({user_id:user.id,is_online:false,last_seen:new Date().toISOString()},{onConflict:"user_id"});
    await supabase.auth.signOut();
  }

  function playNotifSound(type){
    try{
      const ctx=new (window.AudioContext||window.webkitAudioContext)();
      const sounds={
        ping:[[880,0,0.08],[1320,0.09,0.15]],
        chime:[[523,0,0.1],[659,0.1,0.1],[784,0.2,0.15]],
        pop:[[400,0,0.04],[200,0.04,0.04]],
        soft:[[660,0,0.12]],
      };
      (sounds[type]||sounds.ping).forEach(([freq,delay,dur])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.connect(g);g.connect(ctx.destination);
        o.frequency.value=freq;o.type="sine";
        g.gain.setValueAtTime(0,ctx.currentTime+delay);
        g.gain.linearRampToValueAtTime(0.25,ctx.currentTime+delay+0.01);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay+dur);
        o.start(ctx.currentTime+delay);o.stop(ctx.currentTime+delay+dur+0.01);
      });
    }catch(e){}
  }

  function toggleSound(val){setSoundEnabled(val);localStorage.setItem("mt_sound_on",String(val));}
  function changeSoundType(val){setSoundType(val);localStorage.setItem("mt_sound_type",val);playNotifSound(val);}

  function sortContacts(list){
    return [...list].sort((a,b)=>(b.lastMessageAt||"").localeCompare(a.lastMessageAt||""));
  }

  useEffect(()=>{
    (async()=>{
      try{
        const[dpData,apptData,pharmData]=await Promise.all([
          supabase.from("doctor_patients").select("patient_id, profiles!doctor_patients_patient_id_fkey(id,first_name,last_name,email,dob,blood_type,allergies,medical_conditions)").eq("doctor_id",user.id),
          supabase.from("appointments").select("id,patient_id,date,time,type,status,notes").eq("doctor_id",user.id).neq("status","cancelled").order("date",{ascending:true}),
          supabase.from("profiles").select("id,first_name,last_name,email,pharmacy_name").eq("role","pharmacist"),
        ]);
        const pRows=(dpData.data||[]).map(r=>r.profiles).filter(Boolean);
        setPatients(pRows.map(p=>({id:p.id,fullName:[p.first_name,p.last_name].filter(Boolean).join(" ")||"Unknown",email:p.email||"",dob:p.dob||null,bloodType:p.blood_type||null,allergies:p.allergies||[],conditions:p.medical_conditions||[]})));
        setAllAppointments(apptData.data||[]);
        const pharmacists=(pharmData.data||[]).map(p=>({id:p.id,name:[p.first_name,p.last_name].filter(Boolean).join(" ")||p.email||"Pharmacist",pharmacy:p.pharmacy_name||"Pharmacy",email:p.email||"",lastMessageAt:null}));
        // fetch latest message timestamp per pharmacist so list sorts correctly
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
          if(pharmacists.length>0) setSelChat(pharmacists[0]);
          const{data:unread}=await supabase.from("chat_messages").select("id").eq("doctor_id",user.id).in("sender_id",pharmIds).is("read_at",null);
          setUnreadCount((unread||[]).length);
        } else {
          setChatContacts(pharmacists);
        }
      }catch(e){console.error("Load:",e);}
    })();
  },[]);

  useEffect(()=>{
    if(!user?.id) return;
    const channels=[];

    channels.push(
      supabase.channel(`doc-appt-${user.id}`)
        .on("postgres_changes",{event:"*",schema:"public",table:"appointments",filter:`doctor_id=eq.${user.id}`},(payload)=>{
          if(payload.eventType==="INSERT"){
            if(payload.new.status!=="cancelled"){
              setAllAppointments(prev=>prev.some(a=>a.id===payload.new.id)?prev:[...prev,payload.new]);
              setAppointments(prev=>prev.some(a=>a.id===payload.new.id)?prev:[...prev,payload.new]);
            }
          } else if(payload.eventType==="UPDATE"){
            const updater=a=>a.id===payload.new.id?{...a,...payload.new}:a;
            setAllAppointments(prev=>payload.new.status==="cancelled"?prev.filter(a=>a.id!==payload.new.id):prev.map(updater));
            setAppointments(prev=>payload.new.status==="cancelled"?prev.filter(a=>a.id!==payload.new.id):prev.map(updater));
            if(payload.new.status==="rescheduled"&&payload.new.reschedule_request){
              setRescheduleReqs(prev=>prev.some(r=>r.id===payload.new.id)?prev:[...prev,payload.new]);
            } else {
              setRescheduleReqs(prev=>prev.filter(r=>r.id!==payload.new.id));
            }
          } else if(payload.eventType==="DELETE"){
            setAllAppointments(prev=>prev.filter(a=>a.id!==payload.old.id));
            setAppointments(prev=>prev.filter(a=>a.id!==payload.old.id));
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
  useEffect(()=>{ selChatRef.current=selChat; },[selChat]);

  // keep selChat in sync when chatContacts array re-sorts
  useEffect(()=>{
    if(!selChat) return;
    setChatContacts(prev=>{
      const updated=prev.find(c=>c.id===selChat.id);
      if(updated&&updated.lastMessageAt!==selChat.lastMessageAt){
        setSelChat(updated);
      }
      return prev;
    });
  },[chatContacts]);

  useEffect(()=>{
    if(!selChat||!user?.id)return;
    loadMessages(selChat.id);
  },[selChat?.id]);

  useEffect(()=>{
    msgEndRef.current?.scrollIntoView({behavior:"smooth"});
  },[messages]);

  // Polling: re-fetch messages every 2s when on messages page with a chat open
  useEffect(()=>{
    if(page!=="messages"||!selChat||!user?.id) return;
    const interval=setInterval(()=>{
      const chat=selChatRef.current;
      if(!chat) return;
      supabase.from("chat_messages").select("*")
        .eq("doctor_id",user.id).eq("pharmacist_id",chat.id)
        .order("created_at",{ascending:true})
        .then(({data})=>{
          if(!data) return;
          setMessages(prev=>{
            const realPrev=prev.filter(m=>!String(m.id).startsWith("temp-"));
            const lastPrevId=realPrev[realPrev.length-1]?.id;
            const lastNewId=data[data.length-1]?.id;
            if(lastPrevId===lastNewId&&realPrev.length===data.length) return prev;
            // bump this contact to top when new message arrives
            if(lastPrevId!==lastNewId&&data.length>0){
              const ts=data[data.length-1].created_at;
              setChatContacts(prev=>[...prev].map(c=>c.id===chat.id?{...c,lastMessageAt:ts}:c).sort((a,b)=>(b.lastMessageAt||"").localeCompare(a.lastMessageAt||"")));
            }
            return data;
          });
        });
    },2000);
    return ()=>clearInterval(interval);
  },[page,selChat?.id,user?.id]);

  // Polling: re-fetch messages every 2s when on messages page
  useEffect(()=>{
    if(page!=="messages"||!selChat||!user?.id) return;
    const interval=setInterval(()=>{
      const chat=selChatRef.current;
      if(!chat) return;
      supabase.from("chat_messages").select("*")
        .eq("doctor_id",user.id).eq("pharmacist_id",chat.id)
        .order("created_at",{ascending:true})
        .then(({data})=>{
          if(!data) return;
          setMessages(prev=>{
            const realPrev=prev.filter(m=>!String(m.id).startsWith("temp-"));
            const lastPrevId=realPrev[realPrev.length-1]?.id;
            const lastNewId=data[data.length-1]?.id;
            if(lastPrevId===lastNewId&&realPrev.length===data.length) return prev;
            if(data.length>0&&lastPrevId!==lastNewId){
              const ts=data[data.length-1].created_at;
              setChatContacts(prev=>sortContacts(prev.map(c=>c.id===chat.id?{...c,lastMessageAt:ts}:c)));
            }
            return data;
          });
        });
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
            // play notification sound for incoming messages
            if(soundEnabled) playNotifSound(soundType);
            const currentChat=selChatRef.current;
            // bump sender contact to top
            setChatContacts(prev=>[...prev].map(c=>c.id===msg.pharmacist_id?{...c,lastMessageAt:msg.created_at}:c).sort((a,b)=>(b.lastMessageAt||"").localeCompare(a.lastMessageAt||"")));
            if(currentChat&&msg.pharmacist_id===currentChat.id){
              setMessages(prev=>{
                if(prev.some(m=>m.id===msg.id)) return prev;
                return [...prev,msg];
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

  // Presence: use database to track online/offline reliably
  useEffect(()=>{
    if(!user?.id) return;

    // Mark self as online immediately
    supabase.from("user_presence")
      .upsert({user_id:user.id,is_online:true,last_seen:new Date().toISOString()},{onConflict:"user_id"})
      .then(()=>{});

    // Load all users' presence on mount
    supabase.from("user_presence").select("user_id,is_online")
      .then(({data})=>{
        if(!data) return;
        const online={};
        data.forEach(r=>{ if(r.is_online) online[r.user_id]=true; });
        setOnlineUsers(online);
      });

    // Listen for INSERT and UPDATE separately so payload.new is always correct
    const ch=supabase.channel("presence-all")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"user_presence"},(payload)=>{
        if(!payload.new?.user_id) return;
        if(payload.new.is_online) setOnlineUsers(prev=>({...prev,[payload.new.user_id]:true}));
        else setOnlineUsers(prev=>{const n={...prev};delete n[payload.new.user_id];return n;});
      })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"user_presence"},(payload)=>{
        if(!payload.new?.user_id) return;
        if(payload.new.is_online) setOnlineUsers(prev=>({...prev,[payload.new.user_id]:true}));
        else setOnlineUsers(prev=>{const n={...prev};delete n[payload.new.user_id];return n;});
      })
      .subscribe();

    // Mark offline when tab closes
    const markOffline=()=>{
      supabase.from("user_presence")
        .upsert({user_id:user.id,is_online:false,last_seen:new Date().toISOString()},{onConflict:"user_id"})
        .then(()=>{});
    };
    window.addEventListener("beforeunload",markOffline);

    return ()=>{
      window.removeEventListener("beforeunload",markOffline);
      supabase.removeChannel(ch);
    };
  },[user?.id]);

  async function loadMessages(pharmacistId){
    try{
      const{data,error}=await supabase
        .from("chat_messages").select("*")
        .eq("doctor_id",user.id).eq("pharmacist_id",pharmacistId)
        .order("created_at",{ascending:true});
      if(error){ console.error("Load msgs:",error.message); return; }
      setMessages(data||[]);
      // clear unread badge for this contact
      setUnreadPerContact(prev=>{ const n={...prev}; delete n[pharmacistId]; return n; });
      // update lastMessageAt for this contact so ordering stays correct
      if(data&&data.length>0){
        const ts=data[data.length-1].created_at;
        setChatContacts(prev=>[...prev].map(c=>c.id===pharmacistId?{...c,lastMessageAt:ts}:c).sort((a,b)=>(b.lastMessageAt||"").localeCompare(a.lastMessageAt||"")));
      }
      const unreadIds=(data||[]).filter(m=>m.sender_id===pharmacistId&&!m.read_at).map(m=>m.id);
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
    // prepend patient context if one is selected
    const patContext=chatPatient?`📋 Re: ${chatPatient.fullName}${chatPatient.dob?` (DOB: ${chatPatient.dob})`:""}${chatPatient.bloodType?` · Blood: ${chatPatient.bloodType}`:""}${chatPatient.allergies?.length>0?` · Allergies: ${chatPatient.allergies.join(", ")}`:""}${chatPatient.conditions?.length>0?` · Conditions: ${chatPatient.conditions.join(", ")}`:""}
`:"";
    const body=patContext+userText;
    setMsgInput("");
    if(chatPatient) setChatPatient(null);
    const now=new Date().toISOString();
    const tempId=`temp-${Date.now()}`;
    const tempMsg={id:tempId,doctor_id:user.id,pharmacist_id:selChat.id,sender_id:user.id,body,created_at:now,read_at:null};
    setMessages(prev=>[...prev,tempMsg]);
    // bump this contact to top immediately on send
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
      setMessages(prev=>prev.map(m=>m.id===tempId?msg:m));
    }catch(e){
      console.error("sendMessage:",e);
      setMessages(prev=>prev.filter(m=>m.id!==tempId));
      setMsgInput(body);
    }finally{setMsgSending(false);}
  }

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
        setSelChat(ex);setChatSearchEmail("");
        setChatSearchMsg({type:"ok",text:`Switched to ${ex.name}.`});
        setTimeout(()=>setChatSearchMsg(null),2000);return;
      }
      const nc={id:prof.id,name:[prof.first_name,prof.last_name].filter(Boolean).join(" ")||prof.email||"Pharmacist",pharmacy:prof.pharmacy_name||"Pharmacy",email:prof.email||"",lastMessageAt:null};
      setChatContacts(prev=>sortContacts([...prev,nc]));setSelChat(nc);setChatSearchEmail("");
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
      console.log("🔍 Searching for email:", email);
      const{data:rows,error}=await supabase
        .from("profiles")
        .select("id,first_name,last_name,email,dob,blood_type,allergies,medical_conditions,role")
        .eq("email",email)
        .limit(1);
      console.log("📦 Supabase result:", {rows, error, rowCount: rows?.length});
      if(error){console.error("❌ Search error:",error);setAddPatientMsg({type:"err",text:"Search failed: "+error.message});return;}
      const prof=rows&&rows.length>0?rows[0]:null;
      console.log("👤 Profile found:", prof);
      if(!prof){setAddPatientMsg({type:"err",text:`No account found with email: ${email}`});return;}
      if(prof.role==="doctor"){setAddPatientMsg({type:"err",text:"That account belongs to a doctor."});return;}
      if(prof.role==="pharmacist"){setAddPatientMsg({type:"err",text:"That account belongs to a pharmacist."});return;}
      if(patients.find(p=>p.id===prof.id)){setAddPatientMsg({type:"err",text:"Patient already in your list."});return;}
      const{error:linkErr}=await supabase.from("doctor_patients").insert({doctor_id:user.id,patient_id:prof.id});
      if(linkErr&&!linkErr.message?.includes("duplicate")){console.error("Link error:",linkErr);setAddPatientMsg({type:"err",text:"Could not add patient: "+linkErr.message});return;}
      await supabase.from("profiles").update({primary_doctor_id:user.id}).eq("id",prof.id).is("primary_doctor_id",null);
      const np={id:prof.id,fullName:[prof.first_name,prof.last_name].filter(Boolean).join(" ")||prof.email||"Patient",email:prof.email||"",dob:prof.dob||null,bloodType:prof.blood_type||null,allergies:prof.allergies||[],conditions:prof.medical_conditions||[]};
      setPatients(prev=>[...prev,np]);setAddPatientEmail("");
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
        supabase.from("prescriptions").select("id,status,notes,created_at").eq("patient_id",pat.id).eq("doctor_id",user.id).order("created_at",{ascending:false}),
        supabase.from("appointments").select("*").eq("patient_id",pat.id).eq("doctor_id",user.id).order("date",{ascending:true}),
      ]);
      setPatProfile(profRes.data||{});
      setPatMeds((medsRes.data||[]).map(d=>({id:d.id,medicationName:d.medication_name,dosage:d.dosage,freq:d.freq,color:d.color,reminderTime:d.reminder_time})));
      setNotes((notesRes.data||[]).map(d=>({id:d.id,note:d.note,createdAt:d.created_at})));
      setPatRx(rxRes.data||[]);
      const appts=apptRes.data||[];setAppointments(appts);
      setRescheduleReqs(appts.filter(a=>a.status==="rescheduled"&&a.reschedule_request));
      const key=`doc_${user.id}_pat_${pat.id}`;
      try{const s=JSON.parse(localStorage.getItem(key)||"{}");if(s.flag)setPatFlag(s.flag);if(s.vitals)setVitals(s.vitals);}catch{}
    }catch(e){}finally{setLoading(false);}
  }

  function saveToLocal(patch){const key=`doc_${user.id}_pat_${selPat?.id}`;try{const e=JSON.parse(localStorage.getItem(key)||"{}");localStorage.setItem(key,JSON.stringify({...e,...patch}));}catch{}}
  async function saveFlag(flag){setPatFlag(flag);saveToLocal({flag});}
  async function saveVitals(){setVitalsBusy(true);saveToLocal({vitals});await new Promise(r=>setTimeout(r,400));setVitalsBusy(false);setVitalsSaved(true);setTimeout(()=>setVitalsSaved(false),2500);}

  async function addAppointment(){
    if(!apptForm.date||!apptForm.time||!selPat)return;setApptBusy(true);
    try{
      const{data:appt,error}=await supabase.from("appointments").insert({patient_id:selPat.id,doctor_id:user.id,date:apptForm.date,time:apptForm.time,type:apptForm.type,notes:apptForm.notes||null,status:"scheduled"}).select("*").single();
      if(error)throw error;
      setAppointments(prev=>[...prev,appt]);setAllAppointments(prev=>[...prev,appt]);
      setApptForm({date:"",time:"",type:"Follow-up",notes:""});
      await supabase.from("notifications").insert({user_id:selPat.id,type:"general",title:`Appointment: ${apptForm.type}`,body:`Scheduled on ${new Date(apptForm.date+"T"+apptForm.time).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}.`});
    }catch(e){}finally{setApptBusy(false);}
  }

  async function deleteAppointment(id){
    await supabase.from("appointments").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",id);
    setAppointments(p=>p.filter(a=>a.id!==id));setAllAppointments(p=>p.filter(a=>a.id!==id));
  }

  async function confirmReschedule(appt,newDate,newTime){
    await supabase.from("appointments").update({date:newDate,time:newTime,status:"scheduled",reschedule_request:null,updated_at:new Date().toISOString()}).eq("id",appt.id);
    const updater=a=>a.id===appt.id?{...a,date:newDate,time:newTime,status:"scheduled",reschedule_request:null}:a;
    setAppointments(p=>p.map(updater));
    setAllAppointments(p=>p.map(updater));
    setRescheduleReqs(p=>p.filter(r=>r.id!==appt.id));
    await supabase.from("notifications").insert({user_id:appt.patient_id,type:"general",title:"Appointment Approved",body:`Your reschedule was approved. New time: ${new Date(newDate+"T"+newTime).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}.`}).catch(()=>{});
  }

  async function rejectReschedule(appt,message){
    await supabase.from("appointments").update({status:"scheduled",reschedule_request:null,updated_at:new Date().toISOString()}).eq("id",appt.id);
    const updater=a=>a.id===appt.id?{...a,status:"scheduled",reschedule_request:null}:a;
    setAppointments(p=>p.map(updater));
    setAllAppointments(p=>p.map(updater));
    setRescheduleReqs(p=>p.filter(r=>r.id!==appt.id));
    await supabase.from("notifications").insert({user_id:appt.patient_id,type:"general",title:"Reschedule Request Denied",body:message}).catch(()=>{});
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
  const greetHour=new Date().getHours();
  const docGreet=greetHour<12?"Good morning":greetHour<17?"Good afternoon":"Good evening";
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
    <div style={{display:"flex",minHeight:"100vh",background:"var(--bg)"}}>
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
            {[["dashboard","Dashboard",HeartPulse],["patients","Patients",User],["messages","Messages",MessageSquare]].map(([id,l,I])=>(
              <div key={id} className={`nl ${page===id?"doc-on":""}`} onClick={()=>{setPage(id);setSelPat(null);}}>
                <I size={15}/>{l}
                {id==="patients"&&patients.length>0&&<span style={{marginLeft:"auto",background:DocAC,color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{patients.length}</span>}
                {id==="messages"&&unreadCount>0&&<span style={{marginLeft:"auto",background:"var(--ro)",color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{unreadCount}</span>}
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

      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <header className="tb">
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {isMob&&(
              <button onClick={()=>setMobMenu(true)} style={{width:34,height:34,borderRadius:10,border:`1px solid ${b1}`,background:"var(--s1)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3,flexShrink:0}}><Menu size={16}/></button>
            )}
            <Stethoscope size={16} color={DocAC}/>
            <span style={{color:t1,fontSize:15,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700}}>Dr. {name}</span>
            {!isMob&&<span className="role-badge role-doctor">Doctor</span>}
            <motion.button whileHover={{scale:1.1}} whileTap={{scale:.9}} onClick={()=>setShowNickname(true)} title="Edit display name" style={{width:24,height:24,borderRadius:7,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3,flexShrink:0}}><Pencil size={11}/></motion.button>
          </div>
          <button onClick={()=>setLight(!light)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 13px",borderRadius:99,border:`1px solid ${b1}`,background:"var(--s1)",cursor:"pointer",fontSize:12,fontWeight:600,color:t2}}>
            {light?<Moon size={13} color={DocAC}/>:<Sun size={13} color="var(--am)"/>}{!isMob&&(light?"Dark":"Light")}
          </button>
        </header>

        <div style={{flex:1,overflowY:page==="messages"?"hidden":"auto",paddingBottom:isMob&&!(page==="messages"&&selChat)?"calc(66px + env(safe-area-inset-bottom, 0px))":0,display:"flex",flexDirection:"column"}}>

          {/* ══ MESSAGES ══ */}
          {page==="messages"&&(
            <div style={{height:isMob?"calc(100dvh - 57px)":"calc(100vh - 57px)",display:"flex",overflow:"hidden",flexDirection:isMob?"column":"row"}}>
              {(!isMob||!selChat)&&(
              <div style={{width:isMob?"100%":280,flexShrink:0,borderRight:isMob?"none":`1px solid ${b1}`,borderBottom:isMob?`1px solid ${b1}`:"none",display:"flex",flexDirection:"column",background:"var(--s1)"}}>
                <div style={{padding:"14px 16px",borderBottom:`1px solid ${b1}`}}>
                  <h2 style={{color:t1,fontSize:15,fontWeight:700,margin:0,display:"flex",alignItems:"center",gap:8}}><MessageSquare size={14} color={DocAC}/> Pharmacy Chat</h2>
                  {/* Find pharmacist by email */}
                  <div style={{marginTop:10,display:"flex",gap:7}}>
                    <input className="inp" type="email" value={chatSearchEmail} onChange={e=>setChatSearchEmail(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")findPharmacistByEmail();}} placeholder="Find pharmacist by email…" style={{flex:1,padding:"7px 11px",borderRadius:10,fontSize:12}}/>
                    <motion.button whileTap={{scale:.93}} onClick={findPharmacistByEmail} disabled={chatSearchBusy||!chatSearchEmail.trim()}
                      style={{padding:"7px 12px",borderRadius:10,border:"none",background:chatSearchEmail.trim()?DocAC:"var(--b1)",color:chatSearchEmail.trim()?"#fff":t3,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,flexShrink:0}}>
                      {chatSearchBusy?<Loader2 size={13} style={{animation:"spin360 .7s linear infinite"}}/>:<Search size={13}/>}
                    </motion.button>
                  </div>
                  <AnimatePresence>
                    {chatSearchMsg&&(
                      <motion.p initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                        style={{fontSize:11.5,marginTop:6,color:chatSearchMsg.type==="ok"?"var(--gr)":"var(--ro)",fontWeight:600}}>
                        {chatSearchMsg.text}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <div style={{flex:1,overflowY:"auto"}}>
                  {chatContacts.length===0?(
                    <div style={{padding:"30px 16px",textAlign:"center"}}>
                      <Search size={22} color={t3} style={{opacity:.2,margin:"0 auto 10px",display:"block"}}/>
                      <p style={{color:t3,fontSize:12}}>Search for a pharmacist by email above</p>
                    </div>
                  ):chatContacts.map(contact=>{
                    const isActive=selChat?.id===contact.id;
                    const unread=unreadPerContact[contact.id]||0;
                    const isOnline=!!onlineUsers[contact.id];
                    return (
                      <div key={contact.id} onClick={()=>setSelChat(contact)}
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
                  })}
                </div>
              </div>
              )} {/* end contacts sidebar conditional */}

              {(!isMob||selChat)&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
                {!selChat?(
                  <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
                    <MessageSquare size={32} color={t3} style={{opacity:.2}}/>
                    <p style={{color:t2,fontSize:14,fontWeight:600}}>Search for a pharmacist to start chatting</p>
                  </div>
                ):(
                  <>
                    <div style={{padding:isMob?"10px 12px":"13px 20px",borderBottom:`1px solid ${b1}`,background:"var(--s1)",display:"flex",alignItems:"center",gap:isMob?10:13,flexShrink:0}}>{isMob&&(<button onClick={()=>setSelChat(null)} style={{width:32,height:32,borderRadius:9,border:`1px solid ${b1}`,background:"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:t3,flexShrink:0}}><ArrowRight size={14} style={{transform:"rotate(180deg)"}}/></button>)}
                      <div style={{width:isMob?38:42,height:isMob?38:42,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#6d28d9)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
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
                      <span className="role-badge role-pharmacist">Pharmacist</span>
                    </div>
                    {messages.length===0&&(
                      <div style={{padding:"8px 20px",borderBottom:"1px solid var(--b0)",background:"var(--s2)",display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{color:t3,fontSize:11,fontWeight:700,flexShrink:0}}>Quick start:</span>
                        {["Prescription inquiry","Medication availability","Prior authorization","Drug interaction check"].map(qt=>(
                          <button key={qt} onClick={()=>setMsgInput(qt)} style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:600,border:`1px solid ${b1}`,background:"var(--s1)",color:t2,cursor:"pointer",fontFamily:"inherit"}}>{qt}</button>
                        ))}
                      </div>
                    )}
                    <div style={{flex:1,overflowY:"auto",overscrollBehavior:"contain",padding:"20px 16px 12px",display:"flex",flexDirection:"column",gap:0,background:"var(--bg)"}}>
                      {messages.length===0&&(<div style={{display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8,padding:"60px 0"}}><Send size={22} color={t3} style={{opacity:.2}}/><p style={{color:t3,fontSize:13}}>No messages yet — send the first one</p></div>)}
                      {messages.map((msg,i)=>{
                        const isMe=msg.sender_id===user.id;
                        const showDate=i===0||new Date(msg.created_at).toDateString()!==new Date(messages[i-1].created_at).toDateString();
                        const groupTop=i===0||showDate||messages[i-1].sender_id!==msg.sender_id;
                        const groupBottom=i===messages.length-1||messages[i+1].sender_id!==msg.sender_id;
                        const bubbleRadius=isMe
                          ?`${groupTop?"18px":"6px"} 18px 18px ${groupBottom?"18px":"6px"}`
                          :`18px ${groupTop?"18px":"6px"} ${groupBottom?"18px":"6px"} 18px`;
                        return (
                          <div key={msg.id} style={{display:"block",width:"100%",marginTop:groupTop?14:3}}>
                            {showDate&&(<div style={{textAlign:"center",margin:"16px 0 14px"}}><span style={{padding:"4px 16px",borderRadius:99,fontSize:10,background:"var(--s2)",border:"1px solid var(--b0)",color:t3,fontWeight:700,letterSpacing:".03em"}}>{new Date(msg.created_at).toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</span></div>)}
                            <div style={{display:"flex",alignItems:"flex-end",gap:8,flexDirection:isMe?"row-reverse":"row",width:"100%"}}>
                              <div style={{width:28,flexShrink:0,display:"flex",justifyContent:"center"}}>
                                {!isMe&&groupBottom&&(
                                  <div style={{width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#6d28d9)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                                    <span style={{color:"#fff",fontSize:10,fontWeight:800}}>{selChat.name[0]?.toUpperCase()}</span>
                                  </div>
                                )}
                              </div>
                              <div style={{maxWidth:"72%",minWidth:0,display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
                                {groupTop&&!isMe&&<p style={{color:t3,fontSize:10,marginBottom:4,fontWeight:600,paddingLeft:2}}>{selChat.name}</p>}
                                <div style={{padding:"9px 14px",borderRadius:bubbleRadius,background:isMe?DocAC:"var(--s1)",border:isMe?"none":`1px solid ${b1}`,boxShadow:isMe?"0 2px 8px rgba(14,116,144,.18)":"0 1px 3px rgba(0,0,0,.06)",maxWidth:"100%",transition:"box-shadow .2s"}}>
                                  <p style={{color:isMe?"#fff":t1,fontSize:13.5,lineHeight:1.6,margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{msg.body}</p>
                                </div>
                                {groupBottom&&<p style={{color:t3,fontSize:9,marginTop:4,textAlign:isMe?"right":"left",paddingLeft:isMe?0:2,paddingRight:isMe?2:0}}>{new Date(msg.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={msgEndRef}/>
                    </div>
                    <div style={{padding:`10px 14px calc(10px + env(safe-area-inset-bottom, 0px))`,background:"var(--s1)",borderTop:`1px solid ${b1}`,flexShrink:0,position:"relative",zIndex:10}}>
                      {/* Patient context panel */}
                      {showPatPicker&&(
                        <div style={{marginBottom:10,background:"var(--s2)",border:`1px solid ${b1}`,borderRadius:14,overflow:"hidden"}}>
                          <div style={{padding:"8px 12px",borderBottom:`1px solid ${b1}`,display:"flex",alignItems:"center",gap:8}}>
                            <User size={13} color={DocAC}/>
                            <span style={{color:t1,fontSize:12,fontWeight:700,flex:1}}>Attach patient context</span>
                            <button onClick={()=>{setShowPatPicker(false);setPatPickerSearch("");}} style={{background:"none",border:"none",cursor:"pointer",color:t3,padding:2,display:"flex"}}><X size={13}/></button>
                          </div>
                          <div style={{padding:"6px 10px",borderBottom:`1px solid ${b1}`}}>
                            <input value={patPickerSearch} onChange={e=>setPatPickerSearch(e.target.value)} placeholder="Search patients…" style={{width:"100%",border:"none",background:"transparent",outline:"none",fontSize:12,color:t1,fontFamily:"inherit"}}/>
                          </div>
                          <div style={{maxHeight:160,overflowY:"auto"}}>
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
                      {/* Active patient card */}
                      {chatPatient&&!showPatPicker&&(
                        <div style={{marginBottom:8,padding:"7px 12px",background:"var(--doc-pd)",border:`1px solid rgba(14,116,144,.2)`,borderRadius:10,display:"flex",alignItems:"center",gap:8}}>
                          <User size={13} color={DocAC}/>
                          <div style={{flex:1,minWidth:0}}>
                            <p style={{color:DocAC,fontSize:11,fontWeight:700,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{chatPatient.fullName}</p>
                            <p style={{color:t3,fontSize:10,margin:0}}>{[chatPatient.dob&&`DOB: ${chatPatient.dob}`,chatPatient.bloodType&&`Blood: ${chatPatient.bloodType}`,chatPatient.allergies?.length>0&&`${chatPatient.allergies.length} allerg${chatPatient.allergies.length>1?"ies":"y"}`].filter(Boolean).join(" · ")||chatPatient.email}</p>
                          </div>
                          <button onClick={()=>setChatPatient(null)} style={{background:"none",border:"none",cursor:"pointer",color:t3,padding:2,display:"flex",flexShrink:0}}><X size={12}/></button>
                        </div>
                      )}
                      {/* Sound settings panel */}
                      <AnimatePresence>
                        {showSoundSettings&&(
                          <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:6}} style={{marginBottom:10,padding:"10px 14px",background:"var(--s2)",border:`1px solid ${b1}`,borderRadius:12}}>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                              <span style={{color:t1,fontSize:12,fontWeight:700}}>Notification sounds</span>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <span style={{color:t3,fontSize:11}}>{soundEnabled?"On":"Off"}</span>
                                <div className={`sw ${soundEnabled?"on":""}`} onClick={()=>toggleSound(!soundEnabled)}/>
                              </div>
                            </div>
                            {soundEnabled&&(
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                {["ping","chime","pop","soft"].map(s=>(
                                  <button key={s} onClick={()=>changeSoundType(s)} style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:600,border:`1px solid ${soundType===s?DocAC:b1}`,background:soundType===s?"var(--doc-pd)":"transparent",color:soundType===s?DocAC:t3,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>{s}</button>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div style={{display:"flex",alignItems:"flex-end",gap:9}}>
                        {/* Patient attach button */}
                        <button onClick={()=>{setShowPatPicker(p=>!p);setShowSoundSettings(false);}} title="Attach patient" style={{width:36,height:36,borderRadius:"50%",border:`1px solid ${chatPatient?DocAC:b1}`,background:chatPatient?"var(--doc-pd)":"var(--s2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:chatPatient?DocAC:t3,flexShrink:0,transition:"all .2s"}}>
                          <User size={15}/>
                        </button>
                        <div style={{flex:1,background:"var(--s2)",border:`1.5px solid ${b1}`,borderRadius:20,padding:"10px 14px"}}
                          onClick={e=>e.currentTarget.querySelector("textarea")?.focus()}>
                          <textarea
                            value={msgInput}
                            onChange={e=>setMsgInput(e.target.value)}
                            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
                            placeholder={`Message ${selChat.name}…`}
                            rows={isMob?1:2}
                            style={{border:"none",background:"transparent",resize:"none",padding:0,
                              fontSize:16,color:t1,outline:"none",fontFamily:"inherit",
                              lineHeight:1.6,width:"100%",display:"block",
                              WebkitAppearance:"none",touchAction:"manipulation"}}/>
                        </div>
                        <button onClick={sendMessage}
                          style={{width:44,height:44,borderRadius:"50%",border:"none",flexShrink:0,
                            background:DocAC,color:"#fff",
                            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                            transition:"background .2s",opacity:msgInput.trim()?1:0.45,
                            WebkitTapHighlightColor:"transparent",touchAction:"manipulation"}}>
                          {msgSending?<Loader2 size={15} style={{animation:"spin360 .7s linear infinite"}}/>:<Send size={15}/>}
                        </button>
                      </div>
                      {!isMob&&(
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:5}}>
                          <p style={{color:t3,fontSize:10,margin:0}}>Enter to send · Shift+Enter for new line{chatPatient&&<span style={{color:DocAC}}> · Referencing <strong>{chatPatient.fullName}</strong></span>}</p>
                          <button onClick={()=>{setShowSoundSettings(p=>!p);setShowPatPicker(false);}} style={{background:"none",border:"none",cursor:"pointer",color:soundEnabled?DocAC:t3,fontSize:10,fontWeight:600,display:"flex",alignItems:"center",gap:4,padding:0,fontFamily:"inherit"}}>
                            {soundEnabled?"🔔":"🔕"} Sound
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              )} {/* end chat window conditional */}
            </div>
          )}

          {/* ══ DASHBOARD ══ */}
          {page==="dashboard"&&(
            <div style={{maxWidth:920,margin:"0 auto",padding:isMob?"16px 14px 56px":"32px 22px 48px"}}>
              <motion.div className="au" style={{marginBottom:isMob?20:28}}>
                <h2 style={{color:t1,fontSize:isMob?22:28,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700,marginBottom:4}}>{docGreet}, Dr. {name.split(" ")[0]}.</h2>
                <p style={{color:t3,fontSize:13.5,margin:0}}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</p>
              </motion.div>
              <div className="grid w-full min-w-0 grid-cols-1 min-[400px]:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
                {[{l:"Total patients",v:patients.length,c:DocAC,bg:"var(--doc-pd)"},{l:"Today's appts",v:allAppointments.filter(a=>new Date(a.date+"T12:00:00").toDateString()===new Date().toDateString()).length,c:"var(--gr)",bg:"rgba(5,150,105,.1)"},{l:"With allergies",v:patients.filter(p=>p.allergies?.length>0).length,c:"var(--ro)",bg:"rgba(185,28,28,.09)"},{l:"With conditions",v:patients.filter(p=>p.conditions?.length>0).length,c:"var(--am)",bg:"rgba(217,119,6,.09)"}].map((s,i)=>(
                  <motion.div key={s.l} className={`au d${i+1} min-w-0 overflow-hidden`} whileHover={{y:-3}} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:16,padding:isMob?"12px 11px":"18px 16px",boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
                    <div style={{width:isMob?30:38,height:isMob?30:38,borderRadius:isMob?9:12,background:s.bg,marginBottom:isMob?6:12,display:"flex",alignItems:"center",justifyContent:"center"}}><User size={isMob?13:17} color={s.c}/></div>
                    <p className="tabular-nums truncate" style={{color:t1,fontSize:isMob?17:22,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700,marginBottom:2}}>{s.v}</p>
                    <p className="leading-snug line-clamp-2" style={{color:t3,fontSize:9,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase"}}>{s.l}</p>
                  </motion.div>
                ))}
              </div>
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
                    const dayAppts=allAppointments.filter(a=>new Date(a.date+"T12:00:00").toDateString()===day.toDateString());
                    return (
                      <div key={day.toISOString()} style={{borderRadius:isMob?12:14,overflow:"hidden",border:`1.5px solid ${isToday?"var(--doc-p)":"var(--b0)"}`,background:isToday?"rgba(14,116,144,.04)":"var(--s2)",minHeight:isMob?0:100,width:"100%",minWidth:0}}>
                        <div style={{padding:isMob?"8px 10px":"8px 10px",borderBottom:"1px solid var(--b0)",background:isToday?"var(--doc-pd)":"transparent",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                          <p style={{color:isToday?DocAC:t3,fontSize:10,fontWeight:800,textTransform:"uppercase",margin:0}}>{day.toLocaleDateString("en-US",{weekday:isMob?"long":"short"})}</p>
                          <span style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?DocAC:"transparent",color:isToday?"#fff":t2,fontSize:12,fontWeight:700,flexShrink:0}}>{day.getDate()}</span>
                        </div>
                        <div style={{padding:isMob?"8px 10px":"6px",display:"flex",flexDirection:"column",gap:isMob?6:4}}>
                          {dayAppts.length===0?<p style={{color:t3,fontSize:11,opacity:.45,margin:0}}>No appointments</p>:dayAppts.map(a=>(
                            <div key={a.id} style={{padding:"6px 8px",borderRadius:8,background:"rgba(14,116,144,.12)",border:"1px solid rgba(14,116,144,.2)"}}>
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
                          const dayAppts=allAppointments.filter(a=>new Date(a.date+"T12:00:00").toDateString()===day.toDateString());
                          return (
                            <div key={day.toISOString()} className="min-w-0 overflow-hidden" style={{borderRadius:isMob?6:10,border:`1.5px solid ${isToday?"var(--doc-p)":"var(--b0)"}`,background:isToday?"rgba(14,116,144,.05)":"var(--s2)",padding:isMob?"3px 2px":"6px 8px",minHeight:isMob?40:56}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:2,marginBottom:isMob?0:4}}>
                                <span style={{width:isMob?18:22,height:isMob?18:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?DocAC:"transparent",color:isToday?"#fff":t2,fontSize:isMob?10:12,fontWeight:700,flexShrink:0}}>{day.getDate()}</span>
                                {dayAppts.length>0&&<span style={{background:DocAC,color:"#fff",borderRadius:99,fontSize:isMob?7:9,fontWeight:800,padding:"1px 4px",flexShrink:0}}>{dayAppts.length}</span>}
                              </div>
                              {!isMob&&dayAppts.slice(0,2).map(a=>(
                                <div key={a.id} style={{borderRadius:4,background:"rgba(14,116,144,.12)",padding:"2px 5px",marginBottom:2}}>
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
          )}

          {/* ══ PATIENTS PAGE ══ */}
          {page==="patients"&&(
            <div className="w-full min-w-0 max-w-[1020px] mx-auto" style={{padding:isMob?"16px 14px":"32px 22px 48px",paddingBottom:isMob?"calc(56px + env(safe-area-inset-bottom, 0px))":undefined}}>
              {!selPat?(
                <>
                  <motion.div className="au" style={{marginBottom:isMob?18:22}}>
                    <h2 className="text-[22px] leading-tight sm:text-[26px]" style={{color:t1,fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontWeight:700,margin:0}}>Patients</h2>
                    <p style={{color:t3,fontSize:13,marginTop:4}}>{filtered.length} of {patients.length} shown</p>
                  </motion.div>

                  {/* ── ADD PATIENT BY EMAIL ── */}
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
                            <motion.button type="button" whileHover={{scale:1.03}} whileTap={{scale:.97}} className={isMob?"w-full justify-center py-2.5":""} onClick={()=>setPage("messages")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:isMob?"10px 14px":"10px 16px",borderRadius:12,border:"1px solid rgba(14,116,144,.3)",background:"rgba(14,116,144,.07)",color:DocAC,cursor:"pointer",fontFamily:"inherit",fontSize:isMob?12.5:13,fontWeight:600}}><MessageSquare size={13}/> Message Pharmacy</motion.button>
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
                          {rescheduleReqs.length>0&&(<div className="min-w-0 overflow-hidden" style={{background:"rgba(217,119,6,.07)",border:"1px solid rgba(217,119,6,.25)",borderRadius:16,padding:isMob?"14px 14px":"16px 18px"}}><p style={{color:"var(--am)",fontSize:13,fontWeight:700,marginBottom:12}}>{rescheduleReqs.length} reschedule request{rescheduleReqs.length>1?"s":""}</p>{rescheduleReqs.map(appt=>(<RescheduleRequestRow key={appt.id} appt={appt} onConfirm={(nd,nt)=>confirmReschedule(appt,nd,nt)} onCancel={()=>deleteAppointment(appt.id)} onReject={(msg)=>rejectReschedule(appt,msg)} t1={t1} t3={t3}/>))}</div>)}
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
                            <div style={{display:"flex",flexDirection:"column",gap:9}}>
                              {patRx.map(rx=>(<div key={rx.id} className="min-w-0 overflow-hidden" style={{padding:"12px 14px",borderRadius:13,background:"var(--s2)",border:"1px solid var(--b0)"}}><div className="flex flex-wrap items-start justify-between gap-2"><span className="shrink-0" style={{color:t2,fontSize:12.5,fontWeight:600}}>{new Date(rx.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span><span className="max-w-[min(100%,200px)] break-words text-right" style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:700,background:"rgba(217,119,6,.12)",color:"var(--am)"}}>{PRESCRIPTION_STATUS_LABELS[rx.status]||rx.status}</span></div>{rx.notes&&<p className="break-words" style={{color:t3,fontSize:12,marginTop:6,lineHeight:1.5,marginBottom:0}}>{rx.notes}</p>}</div>))}
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
          )}
        </div>
      </div>

      <AnimatePresence>
        {showPrescribe&&selPat&&(<PrescribeModal patient={selPat} patientProfile={patProfile} doctor={user} onClose={()=>setShowPrescribe(false)} onSuccess={()=>setShowPrescribe(false)}/>)}
      </AnimatePresence>
      <AnimatePresence>{showNickname&&<NicknameModal currentName={name} onSave={saveName} onClose={()=>setShowNickname(false)} userId={user?.id}/>}</AnimatePresence>

      {/* ── Mobile bottom nav — hidden inside open chat so it never overlaps input ── */}
      {isMob&&!(page==="messages"&&selChat)&&(
        <nav className="btabs">
          {[["dashboard",HeartPulse,"Dashboard"],["patients",User,"Patients"],["messages",MessageSquare,"Msgs"]].map(([id,I,l])=>(
            <button key={id} className={`bt ${page===id?"on":""}`} onClick={()=>{setPage(id);setSelPat(null);}}>
              <I size={19}/>
              {id==="messages"&&unreadCount>0
                ?<span style={{position:"relative"}}>{l}<span style={{position:"absolute",top:-6,right:-10,background:"var(--ro)",color:"#fff",borderRadius:99,fontSize:8,fontWeight:800,padding:"1px 4px"}}>{unreadCount}</span></span>
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
                {[["dashboard","Dashboard",HeartPulse],["patients","Patients",User],["messages","Messages",MessageSquare]].map(([id,l,I])=>(
                  <div key={id} className={`nl ${page===id?"doc-on":""}`} onClick={()=>{setPage(id);setSelPat(null);setMobMenu(false);}}>
                    <I size={15}/>{l}
                    {id==="patients"&&patients.length>0&&<span style={{marginLeft:"auto",background:DocAC,color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{patients.length}</span>}
                    {id==="messages"&&unreadCount>0&&<span style={{marginLeft:"auto",background:"var(--ro)",color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{unreadCount}</span>}
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