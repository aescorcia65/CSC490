import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill, LogOut, Moon, Sun, Menu, X, Plus, Send,
  Loader2, User, ArrowRight, Pencil, HeartPulse, Stethoscope,
  ShieldCheck, MessageSquare, Search, Bell, BellOff, Volume1, Volume2, AlertTriangle, CheckCheck, FileText, Trash2, ClipboardList
} from "lucide-react";
import { supabase } from "../../supabase";
import { ensurePortalAudioContext, playPortalNotificationSound } from "../../lib/portalWebAudio";
import { mergeNotificationRows } from "../../lib/notificationRealtimeMerge";
import { notificationSuggestsPrescription, notificationSuggestsChat } from "../../lib/notificationNavigation";
import { notifyRecipientNewChatMessage } from "../../lib/messageNotifications";
import { PRESCRIPTION_STATUS_LABELS } from "../../lib/constants";
import { useIsMobile } from "../../hooks/useIsMobile";
import NicknameModal from "../../components/modals/NicknameModal";
import RefillRequestsPage from "./RefillRequestsPage";
export default function PharmacistPortal({ user, light, setLight, userName, setDisplayName }) {
  const [page, setPage] = useState("dashboard");
  const [prescriptions, setPrescriptions] = useState([]);
  const [patientNames, setPatientNames] = useState({});
  const [search, setSearch] = useState("");
  const [selRx, setSelRx] = useState(null);
  const [rxMeds, setRxMeds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [patSearchEmail, setPatSearchEmail] = useState("");
  const [patSearchBusy, setPatSearchBusy] = useState(false);
  const [patSearchMsg, setPatSearchMsg] = useState(null);
  const [chatContacts, setChatContacts] = useState([]);
  const [selChat, setSelChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadPerContact, setUnreadPerContact] = useState({});
  const [msgMode, setMsgMode] = useState("doctors");
  const [patientChatContacts, setPatientChatContacts] = useState([]);
  const [unreadPatientCount, setUnreadPatientCount] = useState(0);
  const [unreadPerPatient, setUnreadPerPatient] = useState({});
  const [patientChatSearchEmail, setPatientChatSearchEmail] = useState("");
  const [patientChatSearchBusy, setPatientChatSearchBusy] = useState(false);
  const [patientChatSearchMsg, setPatientChatSearchMsg] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [chatSearchEmail, setChatSearchEmail] = useState("");
  const [chatSearchBusy, setChatSearchBusy] = useState(false);
  const [chatSearchMsg, setChatSearchMsg] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("mt_sound_on") !== "false");
  const [soundType, setSoundType] = useState(() => {
    const saved = localStorage.getItem("mt_sound_type");
    const valid = ["standard", "urgent", "subtle", "chime", "pulse"];
    return valid.includes(saved) ? saved : "standard";
  });
  const [soundVolume, setSoundVolume] = useState(() => {
    const v = parseFloat(localStorage.getItem("mt_sound_vol"));
    return isNaN(v) ? 0.7 : Math.min(1, Math.max(0.1, v));
  });
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const soundEnabledRef = useRef(soundEnabled);
  const soundTypeRef = useRef(soundType);
  const soundVolumeRef = useRef(soundVolume);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { soundTypeRef.current = soundType; }, [soundType]);
  useEffect(() => { soundVolumeRef.current = soundVolume; }, [soundVolume]);
  const msgEndRef = useRef(null);
  const msgListRef = useRef(null);
  const atBottomRef = useRef(true);
  const typingBroadcastRef = useRef(null);
  const [peerTyping, setPeerTyping] = useState(false);

  useEffect(() => {
    const unlock = () => { void ensurePortalAudioContext(); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  function sortMsgs(arr){ return [...arr].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)); }

  const doScroll = useCallback(() => {
    if(msgListRef.current) msgListRef.current.scrollTop = msgListRef.current.scrollHeight;
    requestAnimationFrame(() => {
      if(msgListRef.current) msgListRef.current.scrollTop = msgListRef.current.scrollHeight;
    });
  }, []);
  const [mobMenu, setMobMenu] = useState(false);
  const [showNickname, setShowNickname] = useState(false);
  const [phaNotifs, setPhaNotifs] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const unreadNotifCount = phaNotifs.filter(n => !n.read_at).length;
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)", b1 = "var(--b1)";
  const PhAC = "var(--pha-p)";
  const [localName, setLocalName] = useState(userName);
  useEffect(() => { if (userName) setLocalName(userName); }, [userName]);
  const name = localName || userName || user?.displayName || user?.email?.split("@")[0] || "Pharmacist";
  const totalChatUnread = unreadCount + unreadPatientCount;
  const saveName = (n) => { setLocalName(n); if (setDisplayName) setDisplayName(n); };

  function sortContacts(list) {
    return [...list].sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""));
  }

  const SOUND_PROFILES = {
    standard: { label: "Standard", desc: "Clear double-tone", tones: [[880, "sine", 0, 0.06], [1320, "sine", 0.07, 0.18]] },
    urgent: { label: "Urgent", desc: "Triple alert — high priority", tones: [[660, "square", 0, 0.06], [880, "square", 0.07, 0.06], [1100, "square", 0.14, 0.12]] },
    subtle: { label: "Subtle", desc: "Soft single tone", tones: [[528, "sine", 0, 0.22]] },
    chime: { label: "Chime", desc: "Ascending 4-note chime", tones: [[523, "sine", 0, 0.12], [659, "sine", 0.12, 0.12], [784, "sine", 0.24, 0.2], [1047, "sine", 0.36, 0.16]] },
    pulse: { label: "Pulse", desc: "Quick double pulse", tones: [[700, "sine", 0, 0.05], [700, "sine", 0.12, 0.05]] },
    ding: { label: "Ding", desc: "Single bright ding", tones: [[1047, "sine", 0, 0.2]] },
    low: { label: "Low", desc: "Deep low tone", tones: [[220, "sine", 0, 0.25], [330, "sine", 0.05, 0.18]] },
    tri: { label: "Tri-tone", desc: "Classic tri-tone", tones: [[523, "sine", 0, 0.1], [659, "sine", 0.11, 0.1], [523, "sine", 0.22, 0.14]] },
  };

  async function handleSignOut() {
    setOnlineUsers(prev => { const n = { ...prev }; delete n[user.id]; return n; });
    await supabase.from("user_presence").upsert({ user_id: user.id, is_online: false, last_seen: new Date().toISOString() }, { onConflict: "user_id" });
    await supabase.auth.signOut();
  }

  function playNotifSound(type, vol) {
    const gain = vol !== undefined ? vol : soundVolume;
    const profile = SOUND_PROFILES[type] || SOUND_PROFILES.standard;
    void playPortalNotificationSound(profile.tones, gain);
  }

  function toggleSound(val) { setSoundEnabled(val); localStorage.setItem("mt_sound_on", String(val)); }
  function changeSoundType(val) { setSoundType(val); localStorage.setItem("mt_sound_type", val); void playNotifSound(val, soundVolume); }
  function changeSoundVolume(val) { setSoundVolume(val); localStorage.setItem("mt_sound_vol", String(val)); void playNotifSound(soundType, val); }
  async function findPatientByEmail() {
    const email = patSearchEmail.trim().toLowerCase();
    if (!email || patSearchBusy) return;
    setPatSearchBusy(true); setPatSearchMsg(null);
    try {
      const { data: rows, error } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email,role")
        .eq("email", email)
        .limit(1);
      if (error) { setPatSearchMsg({ type: "err", text: "Search failed: " + error.message }); return; }
      const prof = rows && rows.length > 0 ? rows[0] : null;
      if (!prof) { setPatSearchMsg({ type: "err", text: `No account found with email: ${email}` }); return; }
      if (prof.role === "doctor") { setPatSearchMsg({ type: "err", text: "That account belongs to a doctor." }); return; }
      if (prof.role === "pharmacist") { setPatSearchMsg({ type: "err", text: "That account belongs to a pharmacist." }); return; }
      const fullName = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email || "Patient";
      setPatientNames(prev => ({ ...prev, [prof.id]: fullName }));
      setPatSearchEmail("");
      setPatSearchMsg({ type: "ok", text: `Found: ${fullName} — their prescriptions will now show below.` });
      setSearch(fullName);
      setTimeout(() => setPatSearchMsg(null), 4000);
    } catch (e) { setPatSearchMsg({ type: "err", text: "Error: " + e.message }); }
    finally { setPatSearchBusy(false); }
  }
  async function loadPrescriptions() {
    try {
      const { data: mine } = await supabase.from("prescriptions")
        .select("id,patient_id,doctor_id,status,notes,created_at,pharmacist_id")
        .eq("pharmacist_id", user.id)
        .order("created_at", { ascending: false });
      const { data: unassigned } = await supabase.from("prescriptions")
        .select("id,patient_id,doctor_id,status,notes,created_at,pharmacist_id")
        .is("pharmacist_id", null)
        .eq("status", "pending_pharmacist")
        .order("created_at", { ascending: false });
      const combined = [...(mine || []), ...(unassigned || []).filter(u => !(mine || []).some(m => m.id === u.id))];
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setPrescriptions(combined);
      const ids = [...new Set(combined.map(p => p.patient_id))];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,first_name,last_name").in("id", ids);
        const map = {};
        (profs || []).forEach(p => { map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Patient"; });
        setPatientNames(map);
      }
    } catch (e) { console.error("loadPrescriptions:", e); }
  }
  useEffect(() => {
    loadPrescriptions();
    (async () => {
      try {
        const { data: allDocs } = await supabase.from("profiles")
          .select("id,first_name,last_name,email,specialty")
          .eq("role", "doctor")
          .order("first_name");
        const contacts = (allDocs || []).map(d => ({
          id: d.id,
          name: [d.first_name, d.last_name].filter(Boolean).join(" ") || d.email || "Doctor",
          specialty: d.specialty || "General Practice",
          email: d.email || "",
          lastMessageAt: null,
        }));
        if (contacts.length > 0) {
          const docIds = contacts.map(d => d.id);
          const { data: latestMsgs } = await supabase.from("chat_messages")
            .select("doctor_id,created_at")
            .eq("pharmacist_id", user.id)
            .in("doctor_id", docIds)
            .order("created_at", { ascending: false });
          if (latestMsgs && latestMsgs.length > 0) {
            const latestByDoc = {};
            latestMsgs.forEach(m => { if (!latestByDoc[m.doctor_id]) latestByDoc[m.doctor_id] = m.created_at; });
            contacts.forEach(c => { if (latestByDoc[c.id]) c.lastMessageAt = latestByDoc[c.id]; });
            contacts.sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""));
          }
        }
        setChatContacts(contacts);
        if (contacts.length > 0) setSelChat(contacts[0]);
        if (contacts.length > 0) {
          const docIds = contacts.map(d => d.id);
          const { data: unread } = await supabase.from("chat_messages")
            .select("id")
            .eq("pharmacist_id", user.id)
            .in("sender_id", docIds)
            .is("read_at", null);
          setUnreadCount((unread || []).length);
        }
      } catch (e) { console.error("Load doctors:", e); }
    })();
  }, [user?.id]);
  const selChatRef = useRef(selChat);
  const msgModeRef = useRef(msgMode);
  const chatContactsRef = useRef(chatContacts);
  const patientChatContactsRef = useRef(patientChatContacts);
  useEffect(() => { selChatRef.current = selChat; }, [selChat]);
  useEffect(() => { msgModeRef.current = msgMode; }, [msgMode]);
  useEffect(() => { chatContactsRef.current = chatContacts; }, [chatContacts]);
  useEffect(() => { patientChatContactsRef.current = patientChatContacts; }, [patientChatContacts]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const docIds = new Set((chatContactsRef.current || []).map(c => c.id));
        const patientIdSet = new Set(prescriptions.map(r => r.patient_id).filter(Boolean));
        const { data: pmAll } = await supabase
          .from("patient_messages")
          .select("sender_id,recipient_id,created_at,read_at")
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(800);
        const lastByPatient = {};
        const unreadMap = {};
        let unreadPt = 0;
        const seenLatest = {};
        (pmAll || []).forEach((m) => {
          const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
          if (!other || other === user.id || docIds.has(other)) return;
          if (!seenLatest[other]) {
            seenLatest[other] = true;
            lastByPatient[other] = m.created_at;
          }
          if (m.recipient_id === user.id && !m.read_at) {
            unreadPt += 1;
            unreadMap[other] = (unreadMap[other] || 0) + 1;
          }
        });
        const allPatIds = new Set([...patientIdSet, ...Object.keys(lastByPatient)]);
        docIds.forEach((id) => allPatIds.delete(id));
        if (allPatIds.size === 0) {
          if (!cancelled) {
            setPatientChatContacts([]);
            setUnreadPerPatient({});
            setUnreadPatientCount(0);
          }
          return;
        }
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,email,role")
          .in("id", [...allPatIds]);
        const contacts = (profs || [])
          .filter((p) => p.role === "patient")
          .map((p) => ({
            id: p.id,
            name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Patient",
            email: p.email || "",
            lastMessageAt: lastByPatient[p.id] || null,
          }));
        if (!cancelled) {
          setPatientChatContacts(sortContacts(contacts));
          setUnreadPerPatient(unreadMap);
          setUnreadPatientCount(unreadPt);
        }
      } catch (e) {
        console.error("Patient chat contacts:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, prescriptions]);

  useEffect(() => {
    setChatSearchEmail("");
    setChatSearchMsg(null);
    setPatientChatSearchEmail("");
    setPatientChatSearchMsg(null);
  }, [msgMode]);

  useEffect(() => {
    if (!selChat?.id) return;
    const inPat = patientChatContacts.some(c => c.id === selChat.id);
    const inDoc = chatContacts.some(c => c.id === selChat.id);
    if (inPat && !inDoc) setMsgMode("patients");
    else if (inDoc && !inPat) setMsgMode("doctors");
  }, [selChat?.id, patientChatContacts, chatContacts]);

  useEffect(() => {
    if (page !== "messages") return;
    setSelChat(prev => {
      if (msgMode === "doctors") {
        if (!chatContacts.length) return null;
        if (prev && chatContacts.some(c => c.id === prev.id)) return chatContacts.find(c => c.id === prev.id);
        return chatContacts[0];
      }
      if (!patientChatContacts.length) return null;
      if (prev && patientChatContacts.some(c => c.id === prev.id)) return patientChatContacts.find(c => c.id === prev.id);
      return patientChatContacts[0];
    });
  }, [msgMode, page, chatContacts, patientChatContacts]);

  useEffect(() => {
    if (!selChat) return;
    setChatContacts(prev => {
      const updated = prev.find(c => c.id === selChat.id);
      if (updated && updated.lastMessageAt !== selChat.lastMessageAt) {
        setSelChat(updated);
      }
      return prev;
    });
  }, [chatContacts]);
  useEffect(() => {
    if (msgMode !== "patients" || !selChat) return;
    setPatientChatContacts(prev => {
      const updated = prev.find(c => c.id === selChat.id);
      if (updated && updated.lastMessageAt !== selChat.lastMessageAt) {
        setSelChat(updated);
      }
      return prev;
    });
  }, [patientChatContacts, msgMode, selChat?.id, selChat?.lastMessageAt]);

  useEffect(() => {
    if (!selChat || !user?.id) return;
    atBottomRef.current = true;
    loadMessages(selChat.id);
  }, [selChat?.id]);

  const peerIsPatient = useMemo(() => !!selChat && (
    patientChatContacts.some(c => c.id === selChat.id) ||
    (!chatContacts.some(c => c.id === selChat.id) && msgMode === "patients")
  ), [selChat?.id, patientChatContacts, chatContacts, msgMode]);
  const peerAvatarBg = useMemo(() => (peerIsPatient ? "linear-gradient(135deg,#7c3aed,#6d28d9)" : "linear-gradient(135deg,#0e7490,#155e75)"), [peerIsPatient]);

  useLayoutEffect(() => {
    if(atBottomRef.current) doScroll();
  }, [messages, peerTyping, doScroll]);

  useEffect(() => {
    if (!selChat) return;
    atBottomRef.current = true;
    const t1 = setTimeout(doScroll, 50);
    const t2 = setTimeout(doScroll, 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [selChat?.id, doScroll]);

  function handleMsgScroll() {
    const el = msgListRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }
  useEffect(() => {
    if (page !== "messages" || !selChat || !user?.id) return;
    const interval = setInterval(() => {
      const chat = selChatRef.current;
      if (!chat) return;
      let pollPatient = patientChatContactsRef.current.some(c => c.id === chat.id);
      if (!pollPatient && !chatContactsRef.current.some(c => c.id === chat.id)) {
        pollPatient = msgModeRef.current === "patients";
      } else if (chatContactsRef.current.some(c => c.id === chat.id) && !patientChatContactsRef.current.some(c => c.id === chat.id)) {
        pollPatient = false;
      }
      if (pollPatient) {
        const q = `and(sender_id.eq.${user.id},recipient_id.eq.${chat.id}),and(sender_id.eq.${chat.id},recipient_id.eq.${user.id})`;
        supabase.from("patient_messages").select("*").or(q).order("created_at", { ascending: true }).limit(200)
          .then(({ data }) => {
            if (!data) return;
            setMessages(prev => {
              const realPrev = prev.filter(m => !String(m.id).startsWith("temp-"));
              const lastPrevId = realPrev[realPrev.length - 1]?.id;
              const lastNewId = data[data.length - 1]?.id;
              if (lastPrevId === lastNewId && realPrev.length === data.length) return prev;
              if (lastPrevId !== lastNewId && data.length > 0) {
                const ts = data[data.length - 1].created_at;
                setPatientChatContacts(prev => sortContacts([...prev].map(c => c.id === chat.id ? { ...c, lastMessageAt: ts } : c)));
              }
              return sortMsgs(data);
            });
          });
        return;
      }
      supabase.from("chat_messages").select("*")
        .eq("pharmacist_id", user.id).eq("doctor_id", chat.id)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (!data) return;
          setMessages(prev => {
            const realPrev = prev.filter(m => !String(m.id).startsWith("temp-"));
            const lastPrevId = realPrev[realPrev.length - 1]?.id;
            const lastNewId = data[data.length - 1]?.id;
            if (lastPrevId === lastNewId && realPrev.length === data.length) return prev;
            if (lastPrevId !== lastNewId && data.length > 0) {
              const ts = data[data.length - 1].created_at;
              setChatContacts(prev => [...prev].map(c => c.id === chat.id ? { ...c, lastMessageAt: ts } : c).sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")));
            }
            return sortMsgs(data);
          });
        });
    }, 2000);
    return () => clearInterval(interval);
  }, [page, selChat?.id, user?.id]);
  const [rtStatus, setRtStatus] = useState("connecting");
  useEffect(() => {
    if (!user?.id) return;
    let channel;
    function subscribe() {
      channel = supabase
        .channel(`pharma-msgs-${user.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `pharmacist_id=eq.${user.id}` },
          (payload) => {
            const msg = payload.new;
            if (msg.sender_id === user.id) return;
            if (soundEnabledRef.current) playNotifSound(soundTypeRef.current, soundVolumeRef.current);
            const currentChat = selChatRef.current;
            setChatContacts(prev => [...prev].map(c => c.id === msg.doctor_id ? { ...c, lastMessageAt: msg.created_at } : c).sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")));
            if (currentChat && msg.doctor_id === currentChat.id) {
              setMessages(prev => {
                if (prev.some(m => m.id === msg.id)) return prev;
                return sortMsgs([...prev, msg]);
              });
              supabase.from("chat_messages").update({ read_at: new Date().toISOString() }).eq("id", msg.id).then(() => {});
            } else {
              setUnreadCount(prev => prev + 1);
              setUnreadPerContact(prev => ({ ...prev, [msg.doctor_id]: (prev[msg.doctor_id] || 0) + 1 }));
            }
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") { setRtStatus("connected"); }
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setRtStatus("error");
            setTimeout(() => { supabase.removeChannel(channel); subscribe(); }, 3000);
          } else if (status === "CLOSED") { setRtStatus("connecting"); }
        });
    }
    subscribe();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    function handlePatientThreadInsert(payload) {
      const msg = payload.new;
      if (!msg) return;
      const other = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
      if (chatContactsRef.current.some(c => c.id === other)) return;
      const currentChat = selChatRef.current;
      const mode = msgModeRef.current;
      setPatientChatContacts(prev => {
        if (!prev.some(c => c.id === other)) {
          void supabase.from("profiles").select("id,first_name,last_name,email,role").eq("id", other).maybeSingle().then(({ data }) => {
            if (!data || data.role !== "patient") return;
            const nc = {
              id: data.id,
              name: [data.first_name, data.last_name].filter(Boolean).join(" ") || data.email || "Patient",
              email: data.email || "",
              lastMessageAt: msg.created_at,
            };
            setPatientChatContacts(p => {
              if (p.some(c => c.id === other)) {
                return sortContacts([...p].map(c => c.id === other ? { ...c, lastMessageAt: msg.created_at } : c));
              }
              return sortContacts([...p, nc]);
            });
          });
          return prev;
        }
        return sortContacts([...prev].map(c => c.id === other ? { ...c, lastMessageAt: msg.created_at } : c));
      });
      if (msg.sender_id !== user.id && soundEnabledRef.current) playNotifSound(soundTypeRef.current, soundVolumeRef.current);
      if (mode === "patients" && currentChat && currentChat.id === other) {
        const pair = new Set([msg.sender_id, msg.recipient_id]);
        if (pair.has(user.id) && pair.has(other)) {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return sortMsgs([...prev, msg]);
          });
          if (msg.recipient_id === user.id && !msg.read_at) {
            supabase.from("patient_messages").update({ read_at: new Date().toISOString() }).eq("id", msg.id).then(() => {});
            setUnreadPatientCount(prev => Math.max(0, prev - 1));
            setUnreadPerPatient(prev => {
              const n = { ...prev };
              if (n[other]) n[other] = Math.max(0, n[other] - 1);
              if (!n[other]) delete n[other];
              return n;
            });
          }
        }
      } else if (msg.recipient_id === user.id && !msg.read_at && msg.sender_id !== user.id) {
        setUnreadPatientCount(prev => prev + 1);
        setUnreadPerPatient(prev => ({ ...prev, [other]: (prev[other] || 0) + 1 }));
      }
    }
    function onPatientMsgInsert(payload) {
      const msg = payload.new;
      if (!msg) return;
      if (msg.recipient_id !== user.id && msg.sender_id !== user.id) return;
      handlePatientThreadInsert(payload);
    }
    const ch = supabase
      .channel(`pha-pt-msgs-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "patient_messages" }, onPatientMsgInsert)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("user_presence")
      .upsert({ user_id: user.id, is_online: true, last_seen: new Date().toISOString() }, { onConflict: "user_id" })
      .then(() => {});
    supabase.from("user_presence").select("user_id,is_online")
      .then(({ data }) => {
        if (!data) return;
        const online = {};
        data.forEach(r => { if (r.is_online) online[r.user_id] = true; });
        setOnlineUsers(online);
      });
    const ch = supabase.channel("presence-all")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_presence" }, (payload) => {
        if (!payload.new?.user_id) return;
        if (payload.new.is_online) setOnlineUsers(prev => ({ ...prev, [payload.new.user_id]: true }));
        else setOnlineUsers(prev => { const n = { ...prev }; delete n[payload.new.user_id]; return n; });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "user_presence" }, (payload) => {
        if (!payload.new?.user_id) return;
        if (payload.new.is_online) setOnlineUsers(prev => ({ ...prev, [payload.new.user_id]: true }));
        else setOnlineUsers(prev => { const n = { ...prev }; delete n[payload.new.user_id]; return n; });
      })
      .subscribe();
    const markOffline = () => {
      supabase.from("user_presence")
        .upsert({ user_id: user.id, is_online: false, last_seen: new Date().toISOString() }, { onConflict: "user_id" })
        .then(() => {});
    };
    window.addEventListener("beforeunload", markOffline);
    return () => {
      window.removeEventListener("beforeunload", markOffline);
      supabase.removeChannel(ch);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user?.id) return;
    const channels = [];
    channels.push(
      supabase.channel(`pha-rx-new-${user.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "prescriptions" }, (payload) => {
          if (!payload.new.pharmacist_id || payload.new.pharmacist_id === user.id) {
            loadPrescriptions();
          }
        }).subscribe()
    );
    channels.push(
      supabase.channel(`pha-rx-upd-${user.id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "prescriptions", filter: `pharmacist_id=eq.${user.id}` }, (payload) => {
          setPrescriptions(prev => prev.map(rx => rx.id === payload.new.id ? { ...rx, ...payload.new } : rx));
          setSelRx(prev => prev?.id === payload.new.id ? { ...prev, ...payload.new } : prev);
        }).subscribe()
    );
    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, [user?.id]);

  useEffect(() => {
    if (!selChat?.id || !user?.id) return;
    setPeerTyping(false);
    typingBroadcastRef.current = null;
    const thread = [user.id, selChat.id].sort().join("-");
    const chName = peerIsPatient ? `pm-typing-${thread}` : `typing-doc-${selChat.id}-${user.id}`;
    const ch = supabase.channel(chName, { config: { broadcast: { ack: false } } });
    ch.on("broadcast", { event: "typing" }, (payload) => {
      if (payload.payload?.sender_id !== user.id) {
        setPeerTyping(true);
        clearTimeout(ch._typingTimer);
        ch._typingTimer = setTimeout(() => setPeerTyping(false), 2500);
      }
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") typingBroadcastRef.current = ch;
    });
    return () => {
      typingBroadcastRef.current = null;
      clearTimeout(ch._typingTimer);
      supabase.removeChannel(ch);
    };
  }, [selChat?.id, user?.id, peerIsPatient]);

  function emitTyping() {
    if (!selChat?.id || !user?.id) return;
    typingBroadcastRef.current?.send({ type: "broadcast", event: "typing", payload: { sender_id: user.id } }).catch(() => {});
  }

  async function loadMessages(peerId) {
    try {
      let usePatientMsgs = patientChatContacts.some(c => c.id === peerId);
      if (!usePatientMsgs && !chatContacts.some(c => c.id === peerId)) {
        usePatientMsgs = msgModeRef.current === "patients";
      } else if (chatContacts.some(c => c.id === peerId) && !patientChatContacts.some(c => c.id === peerId)) {
        usePatientMsgs = false;
      }
      if (usePatientMsgs) {
        const q = `and(sender_id.eq.${user.id},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${user.id})`;
        const { data, error } = await supabase.from("patient_messages").select("*").or(q).order("created_at", { ascending: true }).limit(200);
        if (error) { console.error("Load patient msgs:", error.message); return; }
        atBottomRef.current = true;
        setMessages(sortMsgs(data || []));
        setUnreadPerPatient(prev => { const n = { ...prev }; delete n[peerId]; return n; });
        if (data && data.length > 0) {
          const ts = data[data.length - 1].created_at;
          setPatientChatContacts(prev => sortContacts([...prev].map(c => c.id === peerId ? { ...c, lastMessageAt: ts } : c)));
        }
        const unreadIds = (data || []).filter(m => m.recipient_id === user.id && m.sender_id === peerId && !m.read_at).map(m => m.id);
        if (unreadIds.length > 0) {
          supabase.from("patient_messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds).then(() => {});
          setUnreadPatientCount(prev => Math.max(0, prev - unreadIds.length));
        }
        return;
      }
      const { data, error } = await supabase.from("chat_messages")
        .select("*")
        .eq("pharmacist_id", user.id)
        .eq("doctor_id", peerId)
        .order("created_at", { ascending: true });
      if (error) { console.error("Load messages error:", error.message); return; }
      atBottomRef.current = true;
      setMessages(sortMsgs(data || []));
      setUnreadPerContact(prev => { const n = { ...prev }; delete n[peerId]; return n; });
      if (data && data.length > 0) {
        const ts = data[data.length - 1].created_at;
        setChatContacts(prev => [...prev].map(c => c.id === peerId ? { ...c, lastMessageAt: ts } : c).sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")));
      }
      const unreadIds = (data || []).filter(m => m.sender_id === peerId && !m.read_at).map(m => m.id);
      if (unreadIds.length > 0) {
        supabase.from("chat_messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds).then(() => {});
        setUnreadCount(prev => Math.max(0, prev - unreadIds.length));
      }
    } catch (e) { console.error("Load messages:", e); }
  }
  async function sendMessage() {
    if (!msgInput.trim() || !selChat || msgSending) return;
    setMsgSending(true);
    const userText = msgInput.trim();
    const sid = selChat.id;
    let sendPatientMsgs = patientChatContacts.some(c => c.id === sid);
    if (!sendPatientMsgs && !chatContacts.some(c => c.id === sid)) {
      sendPatientMsgs = msgMode === "patients";
    } else if (chatContacts.some(c => c.id === sid) && !patientChatContacts.some(c => c.id === sid)) {
      sendPatientMsgs = false;
    }
    const body = userText;
    setMsgInput("");
    const now = new Date().toISOString();
    const tempId = `temp-${Date.now()}`;
    if (sendPatientMsgs) {
      const tempMsg = { id: tempId, sender_id: user.id, recipient_id: selChat.id, body, created_at: now, read_at: null };
      setMessages(prev => sortMsgs([...prev, tempMsg]));
      setPatientChatContacts(prev => sortContacts([...prev].map(c => c.id === selChat.id ? { ...c, lastMessageAt: now } : c)));
      try {
        const { data: msg, error } = await supabase.from("patient_messages")
          .insert({ sender_id: user.id, recipient_id: selChat.id, body })
          .select("*").single();
        if (error) {
          console.error("Send error:", error.message);
          setMessages(prev => prev.filter(m => m.id !== tempId));
          setMsgInput(body);
          return;
        }
        setMessages(prev => sortMsgs(prev.map(m => m.id === tempId ? msg : m)));
        notifyRecipientNewChatMessage({
          recipientId: selChat.id,
          senderName: name,
          messageText: userText,
          relatedMessageId: msg?.id,
        });
      } catch (e) {
        console.error("Send:", e);
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setMsgInput(body);
      } finally { setMsgSending(false); }
      return;
    }
    const tempMsg = { id: tempId, doctor_id: selChat.id, pharmacist_id: user.id, sender_id: user.id, body, created_at: now, read_at: null };
    setMessages(prev => sortMsgs([...prev, tempMsg]));
    setChatContacts(prev => [...prev].map(c => c.id === selChat.id ? { ...c, lastMessageAt: now } : c).sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")));
    try {
      const { data: msg, error } = await supabase.from("chat_messages").insert({
        doctor_id: selChat.id,
        pharmacist_id: user.id,
        sender_id: user.id,
        body,
      }).select("*").single();
      if (error) {
        console.error("Send error:", error.message);
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setMsgInput(body);
        return;
      }
      setMessages(prev => sortMsgs(prev.map(m => m.id === tempId ? msg : m)));
      notifyRecipientNewChatMessage({
        recipientId: selChat.id,
        senderName: name,
        messageText: body,
        relatedMessageId: msg?.id,
      });
    } catch (e) {
      console.error("Send:", e);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setMsgInput(body);
    } finally { setMsgSending(false); }
  }
  async function findDoctorByEmail() {
    const email = chatSearchEmail.trim().toLowerCase();
    if (!email || chatSearchBusy) return;
    setChatSearchBusy(true); setChatSearchMsg(null);
    try {
      const { data: rows, error } = await supabase.from("profiles")
        .select("id,first_name,last_name,email,specialty,role")
        .eq("email", email)
        .limit(1);
      if (error) { setChatSearchMsg({ type: "err", text: "Search failed: " + error.message }); return; }
      const prof = rows && rows.length > 0 ? rows[0] : null;
      if (!prof) { setChatSearchMsg({ type: "err", text: "No account found with that email." }); return; }
      if (prof.role !== "doctor") { setChatSearchMsg({ type: "err", text: "That account is not a doctor." }); return; }
      if (chatContacts.find(c => c.id === prof.id)) {
        const ex = chatContacts.find(c => c.id === prof.id);
        setSelChat(ex); setChatSearchEmail("");
        setChatSearchMsg({ type: "ok", text: `Switched to Dr. ${ex.name}.` });
        setTimeout(() => setChatSearchMsg(null), 2000); return;
      }
      const nc = {
        id: prof.id,
        name: [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email || "Doctor",
        specialty: prof.specialty || "General Practice",
        email: prof.email || "",
      };
      setChatContacts(prev => [...prev, nc]);
      setSelChat(nc); setChatSearchEmail("");
      setChatSearchMsg({ type: "ok", text: `Dr. ${nc.name} added to your contacts.` });
      setTimeout(() => setChatSearchMsg(null), 2500);
    } catch (e) { setChatSearchMsg({ type: "err", text: "Something went wrong. Please try again." }); }
    finally { setChatSearchBusy(false); }
  }

  async function findPatientForChatByEmail() {
    const email = patientChatSearchEmail.trim().toLowerCase();
    if (!email || patientChatSearchBusy) return;
    setPatientChatSearchBusy(true);
    setPatientChatSearchMsg(null);
    try {
      const { data: rows, error } = await supabase.from("profiles")
        .select("id,first_name,last_name,email,role")
        .eq("email", email)
        .limit(1);
      if (error) { setPatientChatSearchMsg({ type: "err", text: "Search failed: " + error.message }); return; }
      const prof = rows && rows.length > 0 ? rows[0] : null;
      if (!prof) { setPatientChatSearchMsg({ type: "err", text: "No account found with that email." }); return; }
      if (prof.role !== "patient") { setPatientChatSearchMsg({ type: "err", text: "That account is not a patient." }); return; }
      const fullName = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email || "Patient";
      setPatientNames(prev => ({ ...prev, [prof.id]: fullName }));
      if (patientChatContacts.find(c => c.id === prof.id)) {
        const ex = patientChatContacts.find(c => c.id === prof.id);
        setMsgMode("patients");
        setSelChat(ex);
        setPatientChatSearchEmail("");
        setPatientChatSearchMsg({ type: "ok", text: `Messaging ${fullName}.` });
        setTimeout(() => setPatientChatSearchMsg(null), 2000);
        return;
      }
      const nc = { id: prof.id, name: fullName, email: prof.email || "", lastMessageAt: null };
      setPatientChatContacts(prev => sortContacts([...prev, nc]));
      setMsgMode("patients");
      setSelChat(nc);
      setPatientChatSearchEmail("");
      setPatientChatSearchMsg({ type: "ok", text: `${fullName} added — say hello below.` });
      setTimeout(() => setPatientChatSearchMsg(null), 2500);
    } catch (e) {
      setPatientChatSearchMsg({ type: "err", text: "Something went wrong. Please try again." });
    } finally { setPatientChatSearchBusy(false); }
  }

  async function openPrescription(rx) {
    setSelRx(rx); setLoading(true); setRxMeds([]);
    try { const { data } = await supabase.from("prescription_medications").select("*").eq("prescription_id", rx.id); setRxMeds(data || []); }
    catch (e) { console.error("openPrescription:", e); } finally { setLoading(false); }
    loadRxMessages(rx.id);
  }

  async function claimPrescription(rx) {
    setActionBusy(true);
    try {
      await supabase.from("prescriptions").update({ pharmacist_id: user.id, updated_at: new Date().toISOString() }).eq("id", rx.id);
      setSelRx(p => p?.id === rx.id ? { ...p, pharmacist_id: user.id } : p);
      loadPrescriptions();
      const patName = patientNames[rx.patient_id] || "Patient";
      if (rx.doctor_id) {
        try { await supabase.from("notifications").insert({ user_id: rx.doctor_id, type: "general", title: "Prescription claimed by pharmacy", body: `Prescription for ${patName} has been claimed and is now being reviewed by ${name}.`, related_id: rx.id }); } catch {}
      }
      try { await supabase.from("notifications").insert({ user_id: user.id, type: "general", title: "You claimed a prescription", body: `Prescription for ${patName} — now reviewing.`, related_id: rx.id }); } catch {}
    } catch (e) { console.error("claimPrescription:", e); } finally { setActionBusy(false); }
  }

  async function updateStatus(rx, newStatus) {
    setActionBusy(true);
    try {
      await supabase.from("prescriptions").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", rx.id);
      setSelRx(p => p?.id === rx.id ? { ...p, status: newStatus } : p);
      loadPrescriptions();
      const patName = patientNames[rx.patient_id] || "Patient";
      const statusLabel = newStatus.replace(/_/g, " ");
      if (rx.doctor_id) {
        try { await supabase.from("notifications").insert({ user_id: rx.doctor_id, type: "prescription_ready", title: `Prescription ${statusLabel}`, body: `${patName}'s prescription is now: ${statusLabel}. Updated by ${name} at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`, related_id: rx.id }); } catch {}
      }
      try { await supabase.from("notifications").insert({ user_id: user.id, type: "general", title: `Marked: ${statusLabel}`, body: `Prescription for ${patName} — status set to "${statusLabel}".`, related_id: rx.id }); } catch {}
    } catch (e) { console.error("updateStatus:", e); } finally { setActionBusy(false); }
  }

  // Load pharmacist notifications + poll fallback; realtime keeps read/delete in sync
  useEffect(() => {
    if (!user?.id) return;
    const load = () => supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40).then(({ data }) => setPhaNotifs(data || []));
    load();
    const poll = setInterval(load, 15000);
    const ch = supabase.channel(`pha-notifs-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (p) => {
        setPhaNotifs(prev => mergeNotificationRows(prev, p, 40));
      }).subscribe();
    return () => { clearInterval(poll); supabase.removeChannel(ch); };
  }, [user?.id]);

  async function markNotifRead(id) {
    if (!user?.id) return;
    const snapshot = phaNotifs;
    const now = new Date().toISOString();
    setPhaNotifs(prev => prev.map(n => n.id === id ? { ...n, read_at: now } : n));
    const { error } = await supabase.from("notifications").update({ read_at: now }).eq("id", id).eq("user_id", user.id);
    if (error) { console.error("notifications.mark read:", error.message); setPhaNotifs(snapshot); }
  }
  async function markAllNotifsRead() {
    if (!user?.id) return;
    const ids = phaNotifs.filter(n => !n.read_at).map(n => n.id);
    if (!ids.length) return;
    const snapshot = phaNotifs;
    const now = new Date().toISOString();
    setPhaNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at || now })));
    const { error } = await supabase.from("notifications").update({ read_at: now }).in("id", ids).eq("user_id", user.id);
    if (error) { console.error("notifications.mark all read:", error.message); setPhaNotifs(snapshot); }
  }
  async function removeNotif(id) {
    if (!user?.id) return;
    const snapshot = phaNotifs;
    setPhaNotifs(prev => prev.filter(n => n.id !== id));
    const { error } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", user.id);
    if (error) { console.error("notifications.delete:", error.message); setPhaNotifs(snapshot); }
  }
  async function clearAllNotifs() {
    if (!phaNotifs.length || !user?.id) return;
    const snapshot = phaNotifs;
    const ids = phaNotifs.map(n => n.id);
    setPhaNotifs([]);
    const { error } = await supabase.from("notifications").delete().in("id", ids).eq("user_id", user.id);
    if (error) { console.error("notifications.delete all:", error.message); setPhaNotifs(snapshot); }
  }

  async function openNotificationTarget(n) {
    if (!n?.id || !user?.id) return;
    if (!n.read_at) await markNotifRead(n.id);
    setShowNotifPanel(false);
    const rxId = n.related_id;
    if (rxId && notificationSuggestsPrescription(n)) {
      let rx = prescriptions.find(r => r.id === rxId);
      if (!rx) {
        const { data, error } = await supabase.from("prescriptions").select("*").eq("id", rxId).maybeSingle();
        if (error) console.error("openNotificationTarget:", error.message);
        rx = data;
      }
      if (rx) {
        setPage("prescriptions");
        openPrescription(rx);
        return;
      }
    }
    if (notificationSuggestsChat(n)) {
      setPage("messages");
      return;
    }
    setPage("dashboard");
  }

  const [rxMessages, setRxMessages] = useState([]);
  const [rxMsgInput, setRxMsgInput] = useState("");
  const [rxMsgSending, setRxMsgSending] = useState(false);
  const [dashModal, setDashModal] = useState(null);

  async function loadRxMessages(rxId) {
    const { data } = await supabase.from("prescription_messages").select("*").eq("prescription_id", rxId).order("created_at", { ascending: true });
    setRxMessages(data || []);
  }

  async function sendRxMessage() {
    if (!rxMsgInput.trim() || !selRx || rxMsgSending) return;
    const body = rxMsgInput.trim();
    setRxMsgInput("");
    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const tempMsg = { id: tempId, prescription_id: selRx.id, sender_id: user.id, body, created_at: new Date().toISOString() };
    setRxMessages(prev => [...prev, tempMsg]);
    try {
      const { data: msg, error } = await supabase.from("prescription_messages").insert({ prescription_id: selRx.id, sender_id: user.id, body }).select("*").single();
      if (error) throw error;
      setRxMessages(prev => prev.map(m => m.id === tempId ? msg : m));
      let doctorId = selRx.doctor_id;
      let patientId = selRx.patient_id;
      if (!doctorId || !patientId) {
        const { data: rxRow } = await supabase.from("prescriptions").select("doctor_id,patient_id").eq("id", selRx.id).maybeSingle();
        if (rxRow) {
          if (!doctorId) doctorId = rxRow.doctor_id;
          if (!patientId) patientId = rxRow.patient_id;
        }
      }
      const patLabel = patientNames[patientId] || "a patient";
      const rows = [];
      if (doctorId) {
        rows.push({ user_id: doctorId, type: "general", title: "New prescription message", body: `${name} sent a message about a prescription for ${patLabel}.`, related_id: selRx.id });
      }
      if (patientId) {
        rows.push({ user_id: patientId, type: "general", title: "Prescription updated", body: "Your care team added an update. Open Prescriptions to view the thread.", related_id: selRx.id });
      }
      if (rows.length) {
        try { await supabase.from("notifications").insert(rows); } catch {}
      }
    } catch {
      setRxMessages(prev => prev.filter(m => m.id !== tempId));
      setRxMsgInput(body);
    }
  }

  useEffect(() => {
    if (!selRx?.id) return;
    // Poll every 3s as fallback
    const poll = setInterval(() => loadRxMessages(selRx.id), 3000);
    const ch = supabase.channel(`rx-msg-pha-${selRx.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "prescription_messages", filter: `prescription_id=eq.${selRx.id}` }, (payload) => {
        setRxMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
      }).subscribe();
    return () => { clearInterval(poll); supabase.removeChannel(ch); };
  }, [selRx?.id]);
  const pendingCount = prescriptions.filter(p => p.status === "pending_pharmacist" || p.status === "pending_fill").length;
  const readyCount = prescriptions.filter(p => p.status === "ready" || p.status === "filled" || p.status === "picked_up").length;
  const filtered = prescriptions.filter(p => !search || (patientNames[p.patient_id] || "").toLowerCase().includes(search.toLowerCase()));
  const patientChatFilter = patientChatSearchEmail.trim().toLowerCase();
  const filteredPatientChats = patientChatFilter
    ? patientChatContacts.filter(c => (c.name || "").toLowerCase().includes(patientChatFilter) || (c.email || "").toLowerCase().includes(patientChatFilter))
    : patientChatContacts;
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
      {}
      {!isMob && (
        <aside className="sidebar">
          <div style={{ padding: "20px 14px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--pha-pd)", border: "1px solid rgba(124,58,237,.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShieldCheck size={16} color={PhAC} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontWeight: 700 }}>
                  <span style={{ color: t1 }}>Med</span><span style={{ color: PhAC }}>Track</span>
                </p>
                <p className="gt" style={{ fontSize: 9, color: PhAC }}>PHARMACIST</p>
              </div>
            </div>
          </div>
          <div style={{ height: 1, background: "var(--b0)", margin: "0 12px 10px" }} />
          <nav style={{ flex: 1, padding: "0 7px", display: "flex", flexDirection: "column", gap: 1 }}>
            {[["dashboard", "Dashboard", HeartPulse], ["refills", "Refill requests", ClipboardList], ["prescriptions", "Prescriptions", Pill], ["messages", "Messages", MessageSquare]].map(([id, l, I]) => (
              <div key={id} className={`nl ${page === id ? "pha-on" : ""}`} onClick={() => { setPage(id); setSelRx(null); }}>
                <I size={15} />{l}
                {id === "messages" && totalChatUnread > 0 && (
                  <span style={{ marginLeft: "auto", background: "var(--ro)", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>{totalChatUnread > 99 ? "99+" : totalChatUnread}</span>
                )}
              </div>
            ))}
          </nav>
          <div style={{ padding: "6px 7px 22px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, color: t3, fontSize: 12 }}>
                {light ? <Sun size={13} color="var(--am)" /> : <Moon size={13} />} {light ? "Light" : "Dark"}
              </span>
              <div className={`sw ${!light ? "on" : ""}`} onClick={() => setLight(!light)} />
            </div>
            <button onClick={handleSignOut} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", color: "var(--ro)", fontFamily: "inherit", fontSize: 12, fontWeight: 500, width: "100%" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(220,38,38,.07)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <LogOut size={13} /> Sign Out
            </button>
          </div>
        </aside>
      )}
      {}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <header className="tb">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {isMob && (
              <button type="button" onClick={() => setMobMenu(true)} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, flexShrink: 0 }}><Menu size={16} /></button>
            )}
            <ShieldCheck size={16} color={PhAC} className="shrink-0" />
            <span className="min-w-0 truncate text-sm sm:text-[15px]" style={{ color: t1, fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontWeight: 600 }} title={name}>{name}</span>
            {!isMob && <span className="role-badge role-pharmacist shrink-0">Pharmacist</span>}
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: .9 }} onClick={() => setShowNickname(true)} title="Edit display name" style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, flexShrink: 0 }}><Pencil size={11} /></motion.button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setShowNotifPanel(p => !p)} style={{ position: "relative", width: 34, height: 34, borderRadius: 10, border: `1px solid ${b1}`, background: showNotifPanel ? "var(--pha-pd)" : "var(--s1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: unreadNotifCount > 0 ? PhAC : t3, flexShrink: 0 }}>
              <Bell size={15} />
              {unreadNotifCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "var(--ro)", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadNotifCount > 9 ? "9+" : unreadNotifCount}</span>}
            </button>
            <button type="button" onClick={() => setLight(!light)} className="shrink-0" style={{ display: "flex", alignItems: "center", gap: 6, padding: isMob ? "6px 10px" : "6px 13px", borderRadius: 99, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", fontSize: 12, fontWeight: 500, color: t2 }}>
              {light ? <Moon size={13} color={PhAC} /> : <Sun size={13} color="var(--am)" />}{!isMob && (light ? "Dark" : "Light")}
            </button>
          </div>
        </header>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", paddingBottom: isMob && !(page === "messages" && selChat) ? "calc(66px + env(safe-area-inset-bottom, 0px))" : 0 }}>
          {}
          {page === "refills" && (
            <RefillRequestsPage
              userId={user?.id}
              patientNames={patientNames}
              setPatientNames={setPatientNames}
              isMob={isMob}
              PhAC={PhAC}
              t1={t1}
              t3={t3}
              b1={b1}
            />
          )}
          {page === "messages" && (
            <div style={{ flex: 1, display: "flex", overflow: "hidden", flexDirection: isMob ? "column" : "row", minHeight: 0 }}>
              {}
              {(!isMob || !selChat) && (
              <div style={{ width: isMob ? "100%" : 280, flexShrink: 0, borderRight: isMob ? "none" : `1px solid ${b1}`, borderBottom: isMob ? `1px solid ${b1}` : "none", display: "flex", flexDirection: "column", background: "var(--s1)", minHeight: 0 }}>
                <div style={{ padding: isMob ? "12px 12px" : "14px 16px", borderBottom: `1px solid ${b1}` }}>
                  <h2 className="text-sm sm:text-[15px]" style={{ color: t1, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <MessageSquare size={14} color={PhAC} className="shrink-0" /> Messages
                  </h2>
                  <div className="mt-2.5 flex gap-1.5" style={{ marginTop: 10 }}>
                    {[
                      ["doctors", "Doctors", unreadCount],
                      ["patients", "Patients", unreadPatientCount],
                    ].map(([id, label, ur]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setMsgMode(id);
                          if (id === "doctors") setSelChat(chatContacts[0] || null);
                          else setSelChat(patientChatContacts[0] || null);
                        }}
                        style={{
                          flex: 1,
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: msgMode === id ? `2px solid ${PhAC}` : `1px solid ${b1}`,
                          background: msgMode === id ? "var(--pha-pd)" : "var(--s2)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 11,
                          fontWeight: 700,
                          color: t1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                      >
                        {id === "doctors" ? <Stethoscope size={13} color={PhAC} /> : <User size={13} color={PhAC} />}
                        {label}
                        {ur > 0 && (
                          <span style={{ background: "var(--ro)", color: "#fff", borderRadius: 99, fontSize: 9, fontWeight: 800, padding: "1px 6px" }}>{ur > 99 ? "99+" : ur}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <p style={{ color: t3, fontSize: 11, margin: "10px 0 0", lineHeight: 1.45 }}>
                    {msgMode === "doctors" ? "Secure chat with prescribers about prescriptions." : "Message patients about refills, pickup, and medication questions."}
                  </p>
                  {msgMode === "doctors" ? (
                    <div className={`mt-2.5 flex gap-2 ${isMob ? "flex-col sm:flex-row" : ""}`}>
                      <input className="inp min-w-0" type="email" value={chatSearchEmail}
                        onChange={e => setChatSearchEmail(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") findDoctorByEmail(); }}
                        placeholder="Find doctor by email…"
                        style={{ flex: 1, padding: "8px 11px", borderRadius: 10, fontSize: 16 }} />
                      <motion.button type="button" whileTap={{ scale: .93 }} onClick={findDoctorByEmail}
                        disabled={chatSearchBusy || !chatSearchEmail.trim()}
                        className={isMob ? "w-full sm:w-auto" : ""}
                        style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: chatSearchEmail.trim() ? PhAC : "var(--b1)", color: chatSearchEmail.trim() ? "#fff" : t3, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {chatSearchBusy ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }} /> : <Search size={13} />}
                      </motion.button>
                    </div>
                  ) : (
                    <div className={`mt-2.5 flex gap-2 ${isMob ? "flex-col sm:flex-row" : ""}`}>
                      <input className="inp min-w-0" type="email" value={patientChatSearchEmail}
                        onChange={e => setPatientChatSearchEmail(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") findPatientForChatByEmail(); }}
                        placeholder="Find patient by email…"
                        style={{ flex: 1, padding: "8px 11px", borderRadius: 10, fontSize: 16 }} />
                      <motion.button type="button" whileTap={{ scale: .93 }} onClick={findPatientForChatByEmail}
                        disabled={patientChatSearchBusy || !patientChatSearchEmail.trim()}
                        className={isMob ? "w-full sm:w-auto" : ""}
                        style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: patientChatSearchEmail.trim() ? PhAC : "var(--b1)", color: patientChatSearchEmail.trim() ? "#fff" : t3, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {patientChatSearchBusy ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }} /> : <Search size={13} />}
                      </motion.button>
                    </div>
                  )}
                  <AnimatePresence>
                    {msgMode === "doctors" && chatSearchMsg && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ fontSize: 11.5, marginTop: 6, color: chatSearchMsg.type === "ok" ? "var(--gr)" : "var(--ro)", fontWeight: 600 }}>
                        {chatSearchMsg.text}
                      </motion.p>
                    )}
                    {msgMode === "patients" && patientChatSearchMsg && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ fontSize: 11.5, marginTop: 6, color: patientChatSearchMsg.type === "ok" ? "var(--gr)" : "var(--ro)", fontWeight: 600 }}>
                        {patientChatSearchMsg.text}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                  {msgMode === "doctors" ? (
                    chatContacts.length === 0 ? (
                      <div style={{ padding: "30px 16px", textAlign: "center" }}>
                        <Search size={22} color={t3} style={{ opacity: .2, margin: "0 auto 10px", display: "block" }} />
                        <p style={{ color: t3, fontSize: 12 }}>Search for a doctor by email above to start chatting.</p>
                      </div>
                    ) : chatContacts.map(contact => {
                      const isActive = selChat?.id === contact.id;
                      const unread = unreadPerContact[contact.id] || 0;
                      const isOnline = !!onlineUsers[contact.id];
                      return (
                        <div key={contact.id} onClick={() => { setMsgMode("doctors"); setSelChat(contact); }}
                          style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--b0)", background: isActive ? "rgba(124,58,237,.07)" : unread > 0 ? "rgba(124,58,237,.03)" : "transparent", borderLeft: `3px solid ${isActive ? PhAC : unread > 0 ? "var(--pha-p)" : "transparent"}`, transition: "all .15s" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ position: "relative", flexShrink: 0 }}>
                              <div style={{ width: 38, height: 38, borderRadius: "50%", background: peerAvatarBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>{contact.name[0]?.toUpperCase() || "D"}</span>
                              </div>
                              <div style={{ position: "absolute", bottom: 1, right: 1, width: 9, height: 9, borderRadius: "50%", background: isOnline ? "#22c55e" : "var(--b1)", border: "2px solid var(--s1)", transition: "background .4s" }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p className="truncate" style={{ color: t1, fontSize: 13, fontWeight: unread > 0 ? 800 : 700, margin: 0 }} title={`Dr. ${contact.name}`}>Dr. {contact.name}</p>
                              <p style={{ color: unread > 0 ? PhAC : t3, fontSize: 11, margin: "2px 0 0", fontWeight: unread > 0 ? 700 : 400 }}>
                                {isOnline ? "Online now" : contact.lastMessageAt ? new Date(contact.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : contact.specialty}
                              </p>
                            </div>
                            {unread > 0 && (
                              <span style={{ background: PhAC, color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 800, padding: "2px 7px", flexShrink: 0, minWidth: 20, textAlign: "center" }}>{unread}</span>
                            )}
                            {isActive && !unread && <div style={{ width: 7, height: 7, borderRadius: "50%", background: PhAC, flexShrink: 0 }} />}
                          </div>
                        </div>
                      );
                    })
                  ) : filteredPatientChats.length === 0 ? (
                    <div style={{ padding: "30px 16px", textAlign: "center" }}>
                      <User size={22} color={t3} style={{ opacity: .2, margin: "0 auto 10px", display: "block" }} />
                      <p style={{ color: t3, fontSize: 12 }}>{patientChatContacts.length === 0 ? "Patients appear here from your prescriptions, or search by email to add one." : "No patients match your search."}</p>
                    </div>
                  ) : filteredPatientChats.map(contact => {
                    const isActive = selChat?.id === contact.id;
                    const unread = unreadPerPatient[contact.id] || 0;
                    const isOnline = !!onlineUsers[contact.id];
                    return (
                      <div key={contact.id} onClick={() => { setMsgMode("patients"); setSelChat(contact); }}
                        style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--b0)", background: isActive ? "rgba(124,58,237,.07)" : unread > 0 ? "rgba(124,58,237,.03)" : "transparent", borderLeft: `3px solid ${isActive ? PhAC : unread > 0 ? "var(--pha-p)" : "transparent"}`, transition: "all .15s" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ position: "relative", flexShrink: 0 }}>
                            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#6d28d9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>{contact.name[0]?.toUpperCase() || "P"}</span>
                            </div>
                            <div style={{ position: "absolute", bottom: 1, right: 1, width: 9, height: 9, borderRadius: "50%", background: isOnline ? "#22c55e" : "var(--b1)", border: "2px solid var(--s1)", transition: "background .4s" }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="truncate" style={{ color: t1, fontSize: 13, fontWeight: unread > 0 ? 800 : 700, margin: 0 }} title={contact.name}>{contact.name}</p>
                            <p style={{ color: unread > 0 ? PhAC : t3, fontSize: 11, margin: "2px 0 0", fontWeight: unread > 0 ? 700 : 400 }}>
                              {isOnline ? "Online now" : contact.lastMessageAt ? new Date(contact.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Patient"}
                            </p>
                          </div>
                          {unread > 0 && (
                            <span style={{ background: PhAC, color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 800, padding: "2px 7px", flexShrink: 0, minWidth: 20, textAlign: "center" }}>{unread}</span>
                          )}
                          {isActive && !unread && <div style={{ width: 7, height: 7, borderRadius: "50%", background: PhAC, flexShrink: 0 }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )} {}
              {}
              {(!isMob || selChat) && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                {!selChat ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                    <MessageSquare size={32} color={t3} style={{ opacity: .2 }} />
                    <p style={{ color: t2, fontSize: 14, fontWeight: 600 }}>{msgMode === "doctors" ? "Select a doctor to start chatting." : "Select a patient to start messaging."}</p>
                  </div>
                ) : (
                  <>
                    {}
                    <div style={{ padding: isMob ? "10px 12px" : "13px 20px", borderBottom: `1px solid ${b1}`, background: "var(--s1)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: isMob ? 10 : 13, flex: 1, minWidth: 0 }}>
                        {isMob && (
                          <button type="button" onClick={() => setSelChat(null)} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, flexShrink: 0 }}><ArrowRight size={14} style={{ transform: "rotate(180deg)" }} /></button>
                        )}
                        <div style={{ width: isMob ? 38 : 42, height: isMob ? 38 : 42, borderRadius: "50%", background: peerAvatarBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ color: "#fff", fontSize: isMob ? 14 : 16, fontWeight: 800 }}>{selChat.name[0]?.toUpperCase()}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate" style={{ color: t1, fontSize: isMob ? 13 : 14, fontWeight: 700, margin: 0 }}>{peerIsPatient ? selChat.name : `Dr. ${selChat.name}`}</p>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: onlineUsers[selChat.id] ? "#22c55e" : "var(--b1)", boxShadow: onlineUsers[selChat.id] ? "0 0 5px #22c55e" : "none", transition: "all .4s", flexShrink: 0 }} />
                            <p style={{ color: onlineUsers[selChat.id] ? "#22c55e" : t3, fontSize: 11, margin: 0, fontWeight: onlineUsers[selChat.id] ? 600 : 400 }}>
                              {onlineUsers[selChat.id] ? "Online now" : "Offline"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => setShowSoundSettings(p => !p)}
                          title={soundEnabled ? "Message sounds on" : "Message sounds off"}
                          style={{
                            width: isMob ? 44 : 40,
                            height: isMob ? 44 : 40,
                            borderRadius: 10,
                            border: `1px solid ${b1}`,
                            background: showSoundSettings ? "rgba(124,58,237,.12)" : "var(--s1)",
                            color: soundEnabled ? PhAC : t3,
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                          aria-expanded={showSoundSettings}
                          aria-label="Message notification sounds"
                        >
                          {soundEnabled ? <Bell size={18} /> : <BellOff size={18} />}
                        </button>
                        {!isMob ? <span className={peerIsPatient ? "role-badge role-patient" : "role-badge role-doctor"}>{peerIsPatient ? "Patient" : "Doctor"}</span> : null}
                      </div>
                    </div>
                    {showSoundSettings ? (
                      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${b1}`, background: "var(--s2)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <span style={{ color: t1, fontSize: 12, fontWeight: 700 }}>New message sounds</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: soundEnabled ? "#16a34a" : t3, fontSize: 11, fontWeight: 600 }}>{soundEnabled ? "On" : "Off"}</span>
                            <div className={`sw ${soundEnabled ? "on" : ""}`} onClick={() => toggleSound(!soundEnabled)} role="switch" aria-checked={soundEnabled} style={{ cursor: "pointer" }} />
                          </div>
                        </div>
                        {soundEnabled ? (
                          <>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                              {Object.entries(SOUND_PROFILES).map(([key, prof]) => (
                                <button key={key} type="button" onClick={() => changeSoundType(key)} style={{ padding: "4px 10px", borderRadius: 99, fontSize: 10.5, fontWeight: 600, border: `1.5px solid ${soundType === key ? PhAC : b1}`, background: soundType === key ? "var(--pha-pd)" : "transparent", color: soundType === key ? PhAC : t3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }} title={prof.desc}>{prof.label}{key === "urgent" && <AlertTriangle size={9} color="var(--ro)" />}</button>
                              ))}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Volume1 size={13} color={t3} style={{ flexShrink: 0 }} />
                              <input type="range" min="0.1" max="1" step="0.05" value={soundVolume} onChange={e => changeSoundVolume(parseFloat(e.target.value))} style={{ flex: 1, accentColor: PhAC, cursor: "pointer" }} />
                              <Volume2 size={13} color={t3} style={{ flexShrink: 0 }} />
                              <span style={{ color: t3, fontSize: 10, flexShrink: 0, minWidth: 32 }}>{Math.round(soundVolume * 100)}%</span>
                            </div>
                            {SOUND_PROFILES[soundType] ? <p style={{ color: t3, fontSize: 10, margin: "8px 0 0", fontStyle: "italic" }}>{SOUND_PROFILES[soundType].desc}</p> : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {}
                    {messages.length > 0 && (
                      <div style={{ padding: isMob ? "8px 12px" : "7px 20px", borderBottom: "1px solid var(--b0)", background: "var(--s2)" }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-full shrink-0 sm:w-auto" style={{ color: t3, fontSize: 10, fontWeight: 700 }}>Quick reply:</span>
                          {(peerIsPatient
                            ? ["Your refill is being processed", "Ready for pickup — ask at the counter", "We’ll text when your order is ready", "Let us know if you have side effects or questions"]
                            : ["Received — processing now", "Ready for pickup", "Out of stock — ordering now", "Please confirm patient's allergies"]
                          ).map(qt => (
                            <button key={qt} type="button" onClick={() => setMsgInput(qt)} className="max-w-full text-left" style={{ padding: "5px 10px", borderRadius: 99, fontSize: 10.5, fontWeight: 600, border: `1px solid ${b1}`, background: "var(--s1)", color: t2, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.3 }}>{qt}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    {}
                    <div ref={msgListRef} onScroll={handleMsgScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "20px 16px 12px", display: "flex", flexDirection: "column", gap: 0, background: "var(--bg)" }}>
                      {messages.length === 0 && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, padding: "60px 0" }}>
                          <Send size={22} color={t3} style={{ opacity: .2 }} />
                          <p style={{ color: t3, fontSize: 13 }}>No messages yet — send the first one.</p>
                        </div>
                      )}
                      {messages.map((msg, i) => {
                        const isMe = msg.sender_id === user.id;
                        const showDate = i === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[i - 1].created_at).toDateString();
                        const groupTop = i === 0 || showDate || messages[i - 1].sender_id !== msg.sender_id;
                        const groupBottom = i === messages.length - 1 || messages[i + 1].sender_id !== msg.sender_id;
                        const isRead = isMe && msg.read_at;

                        // Detect PATREF JSON referral (new format)
                        const isNewPatRef = !isMe && msg.body.startsWith("PATREF:");
                        let newPatData = null;
                        if (isNewPatRef) {
                          try { newPatData = JSON.parse(msg.body.slice(7)); } catch(e) {}
                        }

                        // Detect legacy 📋 Re: format
                        const bodyLines = msg.body.split("\n");
                        const isLegacyRef = bodyLines[0]?.startsWith("📋 Re:");
                        const displayBody = isLegacyRef ? bodyLines.slice(1).join("\n").trim() : msg.body;
                        let legacyCard = null;
                        if (isLegacyRef) {
                          const refLine = bodyLines[0].replace("📋 Re:", "").trim();
                          const nameMatch = refLine.match(/^([^(]+)/);
                          const dobMatch = refLine.match(/DOB:\s*([^·)]+)/);
                          const bloodMatch = refLine.match(/Blood:\s*([^·]+)/);
                          const allergyMatch = refLine.match(/Allergies:\s*([^·]+)/);
                          const condMatch = refLine.match(/Conditions:\s*([^·]+)/);
                          legacyCard = { name: nameMatch?.[1]?.replace(/\(.*/, "").trim(), dob: dobMatch?.[1]?.trim(), blood: bloodMatch?.[1]?.trim(), allergies: allergyMatch?.[1]?.trim(), conditions: condMatch?.[1]?.trim() };
                        }

                        // If new PATREF format, render standalone referral card (not a bubble)
                        if (isNewPatRef && newPatData) {
                          return (
                            <div key={msg.id} style={{ display: "block", width: "100%", marginTop: 16, marginBottom: 4 }}>
                              {showDate && <div style={{ textAlign: "center", margin: "16px 0 14px" }}><span style={{ padding: "4px 16px", borderRadius: 99, fontSize: 10, background: "var(--s2)", border: "1px solid var(--b0)", color: t3, fontWeight: 700, letterSpacing: ".03em" }}>{new Date(msg.created_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span></div>}
                              <div style={{ background: "var(--s1)", border: "1.5px solid rgba(14,116,144,.3)", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 16px rgba(14,116,144,.1)", maxWidth: isMob ? "95%" : "80%" }}>
                                <div style={{ padding: "10px 16px", background: "rgba(14,116,144,.09)", borderBottom: "1px solid rgba(14,116,144,.2)", display: "flex", alignItems: "center", gap: 8 }}>
                                  <FileText size={14} color="var(--doc-p)" />
                                  <span style={{ color: "var(--doc-p)", fontSize: 12, fontWeight: 700, flex: 1 }}>Patient Referral from Dr. {!peerIsPatient ? selChat.name : "prescriber"}</span>
                                  <span style={{ color: t3, fontSize: 10 }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                </div>
                                <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid var(--b0)" }}>
                                  {[["Patient", newPatData.name], ["DOB", newPatData.dob], ["Blood Type", newPatData.blood], ["Allergies", (newPatData.allergies||[]).join(", ")], ["Conditions", (newPatData.conditions||[]).join(", ")], ["Medications", (newPatData.meds||[]).map(m=>m.name).join(", ")]].filter(([,v])=>v).map(([k,v])=>(
                                    <div key={k} style={{ display: "flex", gap: 10 }}>
                                      <span style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", minWidth: 80, flexShrink: 0, paddingTop: 1 }}>{k}</span>
                                      <span style={{ color: k==="Allergies"||k==="Blood Type" ? "var(--ro)" : k==="Conditions" ? "var(--am)" : t1, fontSize: 12, fontWeight: k==="Patient" ? 700 : 400, wordBreak: "break-word" }}>{v}</span>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ padding: "10px 16px" }}>
                                  <p style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Action</p>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {[
                                      { label: "Received", color: "var(--gr)", bg: "rgba(5,150,105,.1)", border: "rgba(5,150,105,.25)" },
                                      { label: "Processing", color: "var(--am)", bg: "rgba(217,119,6,.1)", border: "rgba(217,119,6,.25)" },
                                      { label: "Ready for Pickup", color: "var(--doc-p)", bg: "rgba(14,116,144,.08)", border: "rgba(14,116,144,.25)" },
                                      { label: "Out of Stock", color: "var(--ro)", bg: "rgba(185,28,28,.08)", border: "rgba(185,28,28,.25)" },
                                      { label: "Need Clarification", color: t2, bg: "var(--s2)", border: "var(--b1)" },
                                    ].map(act => (
                                      <button key={act.label} onClick={() => {
                                        const reply = `REFACTION:${newPatData.name}:${act.label}`;
                                        setMsgInput(reply);
                                        setTimeout(() => sendMessage(), 50);
                                      }} style={{ padding: "5px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600, border: `1px solid ${act.border}`, background: act.bg, color: act.color, cursor: "pointer", fontFamily: "inherit" }}>
                                        {act.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const bubbleRadius = isMe
                          ? `${groupTop ? "18px" : "6px"} 18px 18px ${groupBottom ? "18px" : "6px"}`
                          : `18px ${groupTop ? "18px" : "6px"} ${groupBottom ? "18px" : "6px"} 18px`;

                        // Detect REFACTION reply to render nicely
                        const isRefAction = msg.body.startsWith("REFACTION:");
                        let refActionDisplay = msg.body;
                        if (isRefAction) {
                          const parts = msg.body.split(":");
                          refActionDisplay = `Status update for ${parts[1]}: ${parts[2]}`;
                        }

                        return (
                          <div key={msg.id} style={{ display: "block", width: "100%", marginTop: groupTop ? 14 : 3 }}>
                            {showDate && (
                              <div style={{ textAlign: "center", margin: "16px 0 14px" }}>
                                <span style={{ padding: "4px 16px", borderRadius: 99, fontSize: 10, background: "var(--s2)", border: "1px solid var(--b0)", color: t3, fontWeight: 700, letterSpacing: ".03em" }}>
                                  {new Date(msg.created_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                                </span>
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexDirection: isMe ? "row-reverse" : "row", width: "100%" }}>
                              <div style={{ width: 28, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                                {!isMe && groupBottom && (
                                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: peerAvatarBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>{selChat.name[0]?.toUpperCase()}</span>
                                  </div>
                                )}
                              </div>
                              <div style={{ maxWidth: isMob ? "min(85%, 340px)" : "78%", minWidth: 0, display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                                {groupTop && !isMe && <p style={{ color: t3, fontSize: 10, marginBottom: 4, fontWeight: 600, paddingLeft: 2 }}>Dr. {selChat.name}</p>}
                                {isLegacyRef && legacyCard && (
                                  <div style={{ marginBottom: 6, width: "100%", background: "var(--s1)", border: `1.5px solid rgba(14,116,144,.25)`, borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(14,116,144,.08)" }}>
                                    <div style={{ padding: "7px 12px", background: "rgba(14,116,144,.08)", borderBottom: "1px solid rgba(14,116,144,.15)", display: "flex", alignItems: "center", gap: 6 }}>
                                      <FileText size={12} color="var(--doc-p)" /><span style={{ color: "var(--doc-p)", fontSize: 11, fontWeight: 700 }}>Patient Reference</span>
                                    </div>
                                    <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
                                      {legacyCard.name && <div style={{ display: "flex", gap: 8 }}><span style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", minWidth: 72 }}>Patient</span><span style={{ color: t1, fontSize: 12, fontWeight: 700 }}>{legacyCard.name}</span></div>}
                                      {legacyCard.dob && <div style={{ display: "flex", gap: 8 }}><span style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", minWidth: 72 }}>DOB</span><span style={{ color: t1, fontSize: 12 }}>{legacyCard.dob}</span></div>}
                                      {legacyCard.blood && <div style={{ display: "flex", gap: 8 }}><span style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", minWidth: 72 }}>Blood</span><span style={{ color: "var(--ro)", fontSize: 12, fontWeight: 700 }}>{legacyCard.blood}</span></div>}
                                      {legacyCard.allergies && <div style={{ display: "flex", gap: 8 }}><span style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", minWidth: 72 }}>Allergies</span><span style={{ color: "var(--ro)", fontSize: 12 }}>{legacyCard.allergies}</span></div>}
                                      {legacyCard.conditions && <div style={{ display: "flex", gap: 8 }}><span style={{ color: t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", minWidth: 72 }}>Conditions</span><span style={{ color: "var(--am)", fontSize: 12 }}>{legacyCard.conditions}</span></div>}
                                    </div>
                                  </div>
                                )}
                                <div style={{ padding: "9px 14px", borderRadius: bubbleRadius, background: isMe ? PhAC : "var(--s1)", border: isMe ? "none" : `1px solid ${b1}`, boxShadow: isMe ? "0 2px 8px rgba(124,58,237,.18)" : "0 1px 3px rgba(0,0,0,.06)", maxWidth: "100%", transition: "box-shadow .2s" }}>
                                  <p style={{ color: isMe ? "#fff" : t1, fontSize: isMob ? 13 : 13.5, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{isRefAction ? refActionDisplay : (displayBody || msg.body)}</p>
                                </div>
                                {groupBottom && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                                    <p style={{ color: t3, fontSize: 9, textAlign: isMe ? "right" : "left", paddingLeft: isMe ? 0 : 2, paddingRight: isMe ? 2 : 0, margin: 0 }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                                    {isMe && <CheckCheck size={14} color={isRead ? "#22c55e" : t3} strokeWidth={isRead ? 2.5 : 2} />}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {peerTyping && (
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 10 }}>
                          <div style={{ width: 26, height: 26, borderRadius: "50%", background: peerAvatarBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>{selChat.name[0]?.toUpperCase()}</span>
                          </div>
                          <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 3px", background: "var(--s1)", border: `1px solid ${b1}`, display: "flex", alignItems: "center", gap: 4 }}>
                            {[0, 1, 2].map(d => <span key={d} style={{ width: 5, height: 5, borderRadius: "50%", background: t3, display: "inline-block", animation: `typingDot 1.2s ${d * 0.2}s infinite ease-in-out` }} />)}
                          </div>
                        </div>
                      )}
                      <div ref={msgEndRef} />
                    </div>
                    {}
                    <div style={{ flexShrink: 0, borderTop: `1px solid ${b1}`, background: "var(--s1)", position: "relative", zIndex: 10 }}>
                      <div style={{ padding: `10px 14px calc(10px + env(safe-area-inset-bottom, 0px))` }}>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 9 }}>
                          <div style={{ flex: 1, background: "var(--s2)", border: `1.5px solid ${b1}`, borderRadius: 20, padding: "10px 14px" }}
                            onClick={e => e.currentTarget.querySelector("textarea")?.focus()}>
                            <textarea
                              value={msgInput}
                              onChange={e => { setMsgInput(e.target.value); emitTyping(); }}
                              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                              placeholder={`Message Dr. ${selChat.name}…`}
                              rows={isMob ? 1 : 2}
                              style={{ border: "none", background: "transparent", resize: "none", padding: 0,
                                fontSize: 16, color: t1, outline: "none", fontFamily: "inherit",
                                lineHeight: 1.6, width: "100%", display: "block",
                                WebkitAppearance: "none", touchAction: "manipulation" }} />
                          </div>
                          <button onClick={sendMessage}
                            style={{ width: 44, height: 44, borderRadius: "50%", border: "none", flexShrink: 0,
                              background: PhAC, color: "#fff",
                              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                              boxShadow: msgInput.trim() ? "0 4px 14px rgba(124,58,237,.35)" : "none",
                              transition: "all .2s", opacity: msgInput.trim() ? 1 : 0.45,
                              WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}>
                            {msgSending ? <Loader2 size={15} style={{ animation: "spin360 .7s linear infinite" }} /> : <Send size={15} />}
                          </button>
                        </div>
                        <p style={{ color: t3, fontSize: 10, margin: "5px 0 0" }}>Enter to send · Shift+Enter for new line</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
              )} {}
            </div>
          )}
          {}
          {page === "dashboard" && (
            <div className="w-full min-w-0 max-w-[760px] mx-auto" style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: isMob ? "16px 14px calc(8px + env(safe-area-inset-bottom, 0px))" : "30px 22px 44px" }}>
              <motion.div className="au" style={{ marginBottom: isMob ? 20 : 28 }}>
                <h2 className="text-[22px] leading-tight sm:text-[26px]" style={{ color: t1, fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontWeight: 600 }}>
                  Welcome, {name.split(" ")[0]}.
                </h2>
                <p style={{ color: t3, fontSize: 13, marginTop: 6, lineHeight: 1.45 }}></p>
              </motion.div>
              {}
              <div className="mb-6 grid w-full min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-3">
                {[
                  { l: "Total prescriptions", v: prescriptions.length, c: PhAC, bg: "var(--pha-pd)",
                    items: prescriptions, render: rx => <div key={rx.id} onClick={() => { setPage("prescriptions"); openPrescription(rx); setDashModal(null); }} style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = "var(--pha-pd)"} onMouseLeave={e => e.currentTarget.style.background = "var(--s2)"}><p style={{ color: t1, fontSize: 13, fontWeight: 700, margin: 0 }}>{patientNames[rx.patient_id] || "Patient"}</p><p style={{ color: t3, fontSize: 11, margin: "3px 0 0" }}>{PRESCRIPTION_STATUS_LABELS[rx.status] || rx.status}</p></div> },
                  { l: "Pending", v: pendingCount, c: "var(--am)", bg: "rgba(217,119,6,.1)",
                    items: prescriptions.filter(p => p.status === "pending_pharmacist" || p.status === "pending_fill"), render: rx => <div key={rx.id} onClick={() => { setPage("prescriptions"); openPrescription(rx); setDashModal(null); }} style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid rgba(217,119,6,.25)`, background: "rgba(217,119,6,.06)", cursor: "pointer" }}><p style={{ color: t1, fontSize: 13, fontWeight: 700, margin: 0 }}>{patientNames[rx.patient_id] || "Patient"}</p><p style={{ color: "var(--am)", fontSize: 11, margin: "3px 0 0" }}>{PRESCRIPTION_STATUS_LABELS[rx.status] || rx.status}</p></div> },
                  { l: "Ready / Filled", v: readyCount, c: "var(--gr)", bg: "rgba(5,150,105,.1)",
                    items: prescriptions.filter(p => p.status === "ready" || p.status === "filled" || p.status === "picked_up"), render: rx => <div key={rx.id} onClick={() => { setPage("prescriptions"); openPrescription(rx); setDashModal(null); }} style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid rgba(5,150,105,.25)`, background: "rgba(5,150,105,.06)", cursor: "pointer" }}><p style={{ color: t1, fontSize: 13, fontWeight: 700, margin: 0 }}>{patientNames[rx.patient_id] || "Patient"}</p><p style={{ color: "var(--gr)", fontSize: 11, margin: "3px 0 0" }}>{PRESCRIPTION_STATUS_LABELS[rx.status] || rx.status}</p></div> },
                ].map((s, i) => (
                  <motion.div key={s.l} className={`au card d${i + 1} min-w-0 overflow-hidden`} onClick={() => setDashModal({ title: s.l, items: s.items, render: s.render })} style={{ padding: isMob ? "12px 11px" : "18px 16px", textAlign: "center", cursor: "pointer" }}>
                    <div style={{ width: isMob ? 34 : 38, height: isMob ? 34 : 38, borderRadius: 11, background: s.bg, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center" }}><Pill size={isMob ? 15 : 17} color={s.c} /></div>
                    <p className="tabular-nums" style={{ color: t1, fontSize: isMob ? 19 : 22, fontFamily: "'Playfair Display',serif", fontStyle: "italic" }}>{s.v}</p>
                    <p className="line-clamp-2 leading-snug" style={{ color: t3, fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginTop: 4 }}>{s.l}</p>
                  </motion.div>
                ))}
              </div>
              {}
              {unreadCount > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPage("messages"); } }}
                  className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-2xl sm:gap-3.5"
                  style={{ marginBottom: 16, padding: isMob ? "12px 14px" : "16px 20px", background: "rgba(124,58,237,.06)", border: "1px solid rgba(124,58,237,.2)", borderRadius: 16 }}
                  onClick={() => setPage("messages")}>
                  <div style={{ width: isMob ? 36 : 40, height: isMob ? 36 : 40, borderRadius: 12, background: "var(--pha-pd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><MessageSquare size={isMob ? 16 : 18} color={PhAC} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug" style={{ color: t1, fontSize: isMob ? 13 : 13.5, fontWeight: 700, margin: 0 }}>{unreadCount} new message{unreadCount > 1 ? "s" : ""}</p>
                    <p style={{ color: t3, fontSize: 11, marginTop: 2 }}>Tap to open Messages</p>
                  </div>
                  <ArrowRight size={14} color={PhAC} className="shrink-0" />
                </motion.div>
              )}
              {}
              <motion.div className="au d3 card w-full min-w-0 overflow-hidden" style={{ padding: isMob ? 14 : 22 }}>
                <h3 style={{ color: t1, fontSize: isMob ? 14 : 15, fontWeight: 600, marginBottom: 12 }}>Recent prescriptions</h3>
                {filtered.slice(0, 6).map(rx => (
                  <div key={rx.id} onClick={() => { setPage("prescriptions"); openPrescription(rx); }}
                    className="flex w-full min-w-0 cursor-pointer items-start gap-3 border-b border-[var(--b0)] py-3 last:border-b-0"
                    onMouseEnter={e => { if (!isMob) e.currentTarget.style.opacity = ".75"; }}
                    onMouseLeave={e => { if (!isMob) e.currentTarget.style.opacity = "1"; }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--pha-pd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Pill size={14} color={PhAC} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate" style={{ color: t1, fontSize: 13, fontWeight: 600 }} title={patientNames[rx.patient_id] || "Patient"}>{patientNames[rx.patient_id] || "Patient"}</p>
                      <p className="mt-0.5 line-clamp-2 break-words" style={{ color: t3, fontSize: 11 }}>{PRESCRIPTION_STATUS_LABELS[rx.status] || rx.status} · {new Date(rx.created_at).toLocaleDateString()}</p>
                    </div>
                    <ArrowRight size={13} color={t3} className="mt-0.5 shrink-0" />
                  </div>
                ))}
                {prescriptions.length === 0 && <p style={{ color: t3, fontSize: 13 }}>No prescriptions yet.</p>}
              </motion.div>
            </div>
          )}
          {}
          {page === "prescriptions" && (
            <div className="w-full min-w-0 max-w-[900px] mx-auto" style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: isMob ? "16px 14px calc(8px + env(safe-area-inset-bottom, 0px))" : "30px 22px 44px" }}>
              {!selRx ? (
                <>
                  <motion.div className="au" style={{ marginBottom: isMob ? 18 : 22 }}>
                    <h2 className="text-[22px] sm:text-2xl" style={{ color: t1, fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontWeight: 600 }}>Prescriptions</h2>
                    <p style={{ color: t3, fontSize: 13, marginTop: 4 }}>{prescriptions.length} prescription{prescriptions.length !== 1 ? "s" : ""} total</p>
                  </motion.div>
                  {}
                  <div className="card w-full min-w-0" style={{ padding: isMob ? "14px 14px" : "16px 18px", marginBottom: 16 }}>
                    <p style={{ color: t1, fontSize: 13, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
                      <User size={14} color={PhAC}/> Find Patient by Email
                    </p>
                    <div className={`flex gap-2 ${isMob ? "flex-col sm:flex-row" : "flex-row"}`}>
                      <input className="inp min-w-0" type="email" value={patSearchEmail}
                        onChange={e => setPatSearchEmail(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") findPatientByEmail(); }}
                        placeholder="patient@email.com"
                        style={{ flex: 1, borderRadius: 10, fontSize: 16 }}
                      />
                      <motion.button type="button" whileTap={{ scale: .93 }} onClick={findPatientByEmail}
                        disabled={patSearchBusy || !patSearchEmail.trim()}
                        className={`btn-pha ${isMob ? "w-full justify-center sm:w-auto" : ""}`}
                        style={{ padding: "9px 16px", fontSize: 13, borderRadius: 10, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {patSearchBusy ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }}/> : <Search size={13}/>} Find
                      </motion.button>
                    </div>
                    {patSearchMsg && (
                      <p style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: patSearchMsg.type === "ok" ? "var(--gr)" : "var(--ro)" }}>
                        {patSearchMsg.text}
                      </p>
                    )}
                  </div>
                  <div style={{ position: "relative", marginBottom: 16 }}>
                    <Search size={14} color={t3} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                    <input className="inp w-full min-w-0" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by patient name…" style={{ paddingLeft: 40, fontSize: 16 }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filtered.map(rx => (
                      <motion.div key={rx.id} className="card w-full min-w-0" onClick={() => openPrescription(rx)} style={{ padding: isMob ? "12px 14px" : "15px 18px", display: "flex", alignItems: "flex-start", gap: isMob ? 10 : 13, cursor: "pointer" }} whileHover={isMob ? {} : { x: 2 }}>
                        <div style={{ width: isMob ? 36 : 40, height: isMob ? 36 : 40, borderRadius: 12, background: "var(--pha-pd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Pill size={isMob ? 16 : 18} color={PhAC} /></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate" style={{ color: t1, fontSize: isMob ? 13 : 14, fontWeight: 600 }} title={patientNames[rx.patient_id] || "Patient"}>{patientNames[rx.patient_id] || "Patient"}</p>
                          <p className="line-clamp-2 break-words" style={{ color: t3, fontSize: 12 }}>{PRESCRIPTION_STATUS_LABELS[rx.status] || rx.status} · {new Date(rx.created_at).toLocaleDateString()}</p>
                        </div>
                        <ArrowRight size={14} color={t3} className="mt-0.5 shrink-0" />
                      </motion.div>
                    ))}
                    {filtered.length === 0 && <p style={{ color: t3, fontSize: 13, padding: "12px 0" }}>No prescriptions found.</p>}
                  </div>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setSelRx(null)} style={{ display: "flex", alignItems: "center", gap: 7, color: PhAC, fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer", marginBottom: isMob ? 16 : 22, padding: 0 }}>
                    <ArrowRight size={13} style={{ transform: "rotate(180deg)" }} /> Back to prescriptions
                  </button>
                  {loading ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, color: t3 }}><Loader2 size={16} style={{ animation: "spin360 .7s linear infinite" }} /> Loading…</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {}
                      <motion.div className="au card w-full min-w-0 overflow-hidden" style={{ padding: isMob ? 14 : 20, display: "flex", flexDirection: isMob ? "column" : "row", alignItems: isMob ? "stretch" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: isMob ? 12 : 14 }}>
                        <div className="flex min-w-0 items-center gap-3 sm:gap-3.5">
                          <div style={{ width: isMob ? 44 : 52, height: isMob ? 44 : 52, borderRadius: 16, background: "var(--pha-pd)", border: "1px solid rgba(124,58,237,.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><User size={isMob ? 20 : 24} color={PhAC} /></div>
                          <div className="min-w-0">
                            <h3 className="break-words" style={{ color: t1, fontSize: isMob ? 16 : 18, fontWeight: 700 }}>{patientNames[selRx.patient_id] || "Patient"}</h3>
                            <p style={{ color: t3, fontSize: 12, marginTop: 2 }}>{PRESCRIPTION_STATUS_LABELS[selRx.status] || selRx.status}</p>
                          </div>
                        </div>
                        <div className={`flex min-w-0 gap-2 ${isMob ? "w-full flex-col" : "flex-wrap"}`}>
                          {!selRx.pharmacist_id && (
                            <button type="button" className={`btn-pha ${isMob ? "w-full justify-center py-2.5" : ""}`} disabled={actionBusy} onClick={() => claimPrescription(selRx)}>
                              {actionBusy ? <Loader2 size={14} className="auth-spin" /> : "Claim prescription"}
                            </button>
                          )}
                          {selRx.pharmacist_id && selRx.status === "pending_pharmacist" && (
                            <button type="button" className={`btn-pha ${isMob ? "w-full justify-center py-2.5" : ""}`} disabled={actionBusy} onClick={() => updateStatus(selRx, "pending_fill")}>
                              {actionBusy ? <Loader2 size={14} className="auth-spin" /> : "Mark as fulfilling"}
                            </button>
                          )}
                          {(selRx.status === "pending_pharmacist" || selRx.status === "pending_fill") && (
                            <button type="button" className={`btn-pha ${isMob ? "w-full justify-center py-2.5" : ""}`} disabled={actionBusy} onClick={() => updateStatus(selRx, "ready")} style={{ background: "rgba(5,150,105,.2)", color: "var(--gr)", borderColor: "var(--gr)" }}>
                              {actionBusy ? <Loader2 size={14} className="auth-spin" /> : "Mark ready for pickup"}
                            </button>
                          )}
                          {(selRx.status === "ready" || selRx.status === "filled") && (
                            <button type="button" className={`btn-pha ${isMob ? "w-full justify-center py-2.5" : ""}`} disabled={actionBusy} onClick={() => updateStatus(selRx, "picked_up")} style={{ background: "rgba(16,185,129,.2)", color: "var(--gr)", borderColor: "var(--gr)" }}>
                              {actionBusy ? <Loader2 size={14} className="auth-spin" /> : "Mark as picked up"}
                            </button>
                          )}
                        </div>
                      </motion.div>
                      {}
                      {selRx.notes && (
                        <div className="card w-full min-w-0" style={{ padding: isMob ? 12 : 14 }}>
                          <p style={{ color: t3, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Doctor's notes</p>
                          <p className="break-words" style={{ color: t1, fontSize: 13, lineHeight: 1.6 }}>{selRx.notes}</p>
                        </div>
                      )}
                      {/* Medications */}
                      <div className="card w-full min-w-0" style={{ padding: isMob ? 14 : 18 }}>
                        <h4 style={{ color: t1, fontSize: 13, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                          <Pill size={13} color={PhAC} /> Medications
                        </h4>
                        {rxMeds.length === 0 ? <p style={{ color: t3, fontSize: 12 }}>No medications listed.</p> : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {rxMeds.map(m => (
                              <div key={m.id} className="min-w-0" style={{ padding: "10px 12px", borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b0)" }}>
                                <p className="break-words" style={{ color: t1, fontSize: 13, fontWeight: 600 }}>{m.medication_name}</p>
                                <p className="break-words" style={{ color: t3, fontSize: 11, marginTop: 4 }}>{m.dosage && `${m.dosage} · `}{m.frequency || ""}{m.instructions ? ` · ${m.instructions}` : ""}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="card w-full min-w-0" style={{ padding: 0, overflow: "hidden" }}>
                        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--b0)", display: "flex", alignItems: "center", gap: 7 }}>
                          <MessageSquare size={13} color={PhAC} />
                          <h4 style={{ color: t1, fontSize: 13, fontWeight: 600, margin: 0 }}>Prescription Chat</h4>
                        </div>
                        <div style={{ height: 260, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, background: "var(--bg)" }}>
                          {rxMessages.length === 0 && <p style={{ color: t3, fontSize: 12, textAlign: "center", margin: "auto 0" }}>No messages. Send a message to the doctor.</p>}
                          {rxMessages.map(m => {
                            const isMe = m.sender_id === user.id;
                            return (
                              <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                                <div style={{ maxWidth: "75%", padding: "7px 12px", borderRadius: isMe ? "14px 14px 3px 14px" : "14px 14px 14px 3px", background: isMe ? PhAC : "var(--s1)", border: isMe ? "none" : "1px solid var(--b1)" }}>
                                  <p style={{ color: isMe ? "#fff" : t1, fontSize: 13, margin: 0, wordBreak: "break-word" }}>{m.body}</p>
                                  <p style={{ color: isMe ? "rgba(255,255,255,.6)" : t3, fontSize: 9, margin: "3px 0 0", textAlign: isMe ? "right" : "left" }}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--b0)", display: "flex", gap: 8, background: "var(--s1)" }}>
                          <input value={rxMsgInput} onChange={e => setRxMsgInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendRxMessage(); } }} placeholder="Message doctor about this prescription…" style={{ flex: 1, border: "1px solid var(--b1)", borderRadius: 10, padding: "8px 12px", fontSize: 13, background: "var(--s2)", color: t1, outline: "none", fontFamily: "inherit" }} />
                          <button onClick={sendRxMessage} disabled={rxMsgSending || !rxMsgInput.trim()} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: PhAC, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, opacity: rxMsgInput.trim() ? 1 : 0.5 }}>
                            {rxMsgSending ? <Loader2 size={13} style={{ animation: "spin360 .7s linear infinite" }} /> : <Send size={13} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {/* ── Mobile bottom nav — hidden inside open chat so it never overlaps input ── */}
      {isMob && !(page === "messages" && selChat) && (
        <nav className="btabs">
          {[["dashboard", HeartPulse, "Home"], ["refills", ClipboardList, "Refills"], ["prescriptions", Pill, "Rx"], ["messages", MessageSquare, "Msgs"]].map(([id, I, l]) => (
            <button key={id} className={`bt ${page === id ? "pha-on" : ""}`}
              style={{ color: page === id ? PhAC : undefined }}
              onClick={() => { setPage(id); setSelRx(null); }}>
              <I size={19} />
              {id === "messages" && totalChatUnread > 0
                ? <span style={{ position: "relative" }}>{l}<span style={{ position: "absolute", top: -6, right: -10, background: "var(--ro)", color: "#fff", borderRadius: 99, fontSize: 8, fontWeight: 800, padding: "1px 4px" }}>{totalChatUnread > 99 ? "99+" : totalChatUnread}</span></span>
                : l}
            </button>
          ))}
        </nav>
      )}
      {/* ── Mobile slide-in menu ── */}
      <AnimatePresence>{showNickname && <NicknameModal currentName={name} onSave={saveName} onClose={() => setShowNickname(false)} userId={user?.id} />}</AnimatePresence>

      {/* Pharmacist Notification Panel */}
      <AnimatePresence>
        {showNotifPanel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNotifPanel(false)} style={{ position: "fixed", inset: 0, zIndex: 70 }}>
            <motion.div initial={{ opacity: 0, y: -8, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ type: "spring", damping: 28, stiffness: 320 }} onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 58, right: isMob ? 8 : 16, width: isMob ? "calc(100vw - 16px)" : "380px", maxHeight: "72vh", display: "flex", flexDirection: "column", background: "var(--bg)", border: `1px solid ${b1}`, borderRadius: 18, boxShadow: "0 16px 48px rgba(0,0,0,.18)", overflow: "hidden", zIndex: 71 }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${b1}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ color: t1, fontSize: 14, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
                  <Bell size={13} color={PhAC} /> Notifications
                  {unreadNotifCount > 0 && <span style={{ background: "var(--ro)", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>{unreadNotifCount}</span>}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {phaNotifs.length > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); clearAllNotifs(); }} style={{ fontSize: 11, fontWeight: 600, color: "var(--ro)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}><Trash2 size={12} /> Clear all</button>}
                  {unreadNotifCount > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); markAllNotifsRead(); }} style={{ fontSize: 11, fontWeight: 600, color: PhAC, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCheck size={12} /> Mark all read</button>}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {phaNotifs.length === 0 && <p style={{ color: t3, fontSize: 13, textAlign: "center", padding: "28px 16px" }}>No notifications yet.</p>}
                {phaNotifs.map(n => (
                  <div key={n.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${b1}`, background: n.read_at ? "transparent" : "rgba(124,58,237,.04)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); void openNotificationTarget(n); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void openNotificationTarget(n); } }} style={{ flex: 1, minWidth: 0, cursor: "pointer", padding: "2px 4px 2px 0", borderRadius: 8 }} onMouseEnter={e => { e.currentTarget.style.background = "var(--s2)"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: n.read_at ? "transparent" : PhAC, flexShrink: 0, marginTop: 5 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: t1, fontSize: 13, fontWeight: n.read_at ? 500 : 700, margin: 0 }}>{n.title}</p>
                          {n.body && <p style={{ color: t3, fontSize: 12, margin: "3px 0 0", lineHeight: 1.5 }}>{n.body}</p>}
                          <p style={{ color: t3, fontSize: 10, margin: "4px 0 0" }}>{new Date(n.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      </div>
                    </div>
                    <button type="button" title="Dismiss" onClick={(e) => { e.stopPropagation(); removeNotif(n.id); }} style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><X size={14} /></button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dashModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDashModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <motion.div initial={{ y: 20, opacity: 0, scale: .97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }} onClick={e => e.stopPropagation()} style={{ background: "var(--bg)", borderRadius: 20, width: "100%", maxWidth: 440, maxHeight: "80vh", display: "flex", flexDirection: "column", border: `1px solid ${b1}`, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${b1}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <h3 style={{ color: t1, fontSize: 16, fontWeight: 700, margin: 0 }}>{dashModal.title}</h3>
                <button onClick={() => setDashModal(null)} style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><X size={13} /></button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {dashModal.items.length === 0
                  ? <p style={{ color: t3, fontSize: 13, textAlign: "center", padding: "24px 0" }}>Nothing to show.</p>
                  : dashModal.items.map(dashModal.render)
                }
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {mobMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobMenu(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 60, backdropFilter: "blur(6px)" }} />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 28, stiffness: 250 }} style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: "min(280px, 88vw)", zIndex: 70, display: "flex", flexDirection: "column", background: "var(--bg2)", borderRight: `1px solid ${b1}`, paddingTop: "env(safe-area-inset-top, 0px)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <ShieldCheck size={16} color={PhAC} />
                  <span style={{ fontSize: 16, fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontWeight: 700 }}><span style={{ color: t1 }}>Med</span><span style={{ color: PhAC }}>Track</span></span>
                </div>
                <button onClick={() => setMobMenu(false)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><X size={13} /></button>
              </div>
              <div style={{ height: 1, background: "var(--b0)", margin: "0 12px 8px" }} />
              <nav style={{ flex: 1, padding: "0 7px", display: "flex", flexDirection: "column", gap: 1 }}>
                {[["dashboard", "Dashboard", HeartPulse], ["refills", "Refill requests", ClipboardList], ["prescriptions", "Prescriptions", Pill], ["messages", "Messages", MessageSquare]].map(([id, l, I]) => (
                  <div key={id} className={`nl ${page === id ? "pha-on" : ""}`} onClick={() => { setPage(id); setSelRx(null); setMobMenu(false); }}>
                    <I size={15} />{l}
                    {id === "messages" && totalChatUnread > 0 && <span style={{ marginLeft: "auto", background: "var(--ro)", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>{totalChatUnread > 99 ? "99+" : totalChatUnread}</span>}
                  </div>
                ))}
              </nav>
              <div style={{ padding: "6px 7px calc(14px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px" }}>
                  <span style={{ color: t3, fontSize: 12 }}>Dark mode</span>
                  <div className={`sw ${!light ? "on" : ""}`} onClick={() => setLight(!light)} />
                </div>
                <button onClick={handleSignOut} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 12px", borderRadius: 11, border: "1px solid rgba(220,38,38,.18)", background: "rgba(220,38,38,.07)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500, color: "var(--ro)" }}>
                  <LogOut size={13} /> Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
