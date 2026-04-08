import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill, LogOut, Moon, Sun, Menu, X, Plus, Send,
  Loader2, User, ArrowRight, Pencil, HeartPulse,
  ShieldCheck, MessageSquare, Search
} from "lucide-react";
import { supabase } from "../../supabase";
import { PRESCRIPTION_STATUS_LABELS } from "../../lib/constants";
import { useIsMobile } from "../../hooks/useIsMobile";
import NicknameModal from "../../components/modals/NicknameModal";

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
  const [onlineUsers, setOnlineUsers] = useState({});
  const [chatSearchEmail, setChatSearchEmail] = useState("");
  const [chatSearchBusy, setChatSearchBusy] = useState(false);
  const [chatSearchMsg, setChatSearchMsg] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("mt_sound_on") !== "false");
  const [soundType, setSoundType] = useState(() => localStorage.getItem("mt_sound_type") || "ping");
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const msgEndRef = useRef(null);
  const [mobMenu, setMobMenu] = useState(false);
  const [showNickname, setShowNickname] = useState(false);
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)", b1 = "var(--b1)";
  const PhAC = "var(--pha-p)";
  const [localName, setLocalName] = useState(userName);
  useEffect(() => { if (userName) setLocalName(userName); }, [userName]);
  const name = localName || userName || user?.displayName || user?.email?.split("@")[0] || "Pharmacist";
  const saveName = (n) => { setLocalName(n); if (setDisplayName) setDisplayName(n); };

  async function handleSignOut() {
    setOnlineUsers(prev => { const n = { ...prev }; delete n[user.id]; return n; });
    await supabase.from("user_presence").upsert({ user_id: user.id, is_online: false, last_seen: new Date().toISOString() }, { onConflict: "user_id" });
    await supabase.auth.signOut();
  }

  function playNotifSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const sounds = {
        ping: [[880, 0, 0.08], [1320, 0.09, 0.15]],
        chime: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.15]],
        pop: [[400, 0, 0.04], [200, 0.04, 0.04]],
        soft: [[660, 0, 0.12]],
      };
      (sounds[type] || sounds.ping).forEach(([freq, delay, dur]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq; o.type = "sine";
        g.gain.setValueAtTime(0, ctx.currentTime + delay);
        g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + delay + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + dur + 0.01);
      });
    } catch (e) {}
  }

  function toggleSound(val) { setSoundEnabled(val); localStorage.setItem("mt_sound_on", String(val)); }
  function changeSoundType(val) { setSoundType(val); localStorage.setItem("mt_sound_type", val); playNotifSound(val); }

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
        .select("id,patient_id,status,notes,created_at,pharmacist_id")
        .eq("pharmacist_id", user.id)
        .order("created_at", { ascending: false });
      const { data: unassigned } = await supabase.from("prescriptions")
        .select("id,patient_id,status,notes,created_at,pharmacist_id")
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
        // fetch the latest message timestamp for each contact so we can sort correctly
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
  useEffect(() => { selChatRef.current = selChat; }, [selChat]);

  // keep selChat in sync when chatContacts array re-sorts (updates the object reference)
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
    if (!selChat || !user?.id) return;
    loadMessages(selChat.id);
  }, [selChat?.id]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Polling: re-fetch messages every 2s when on messages page with a chat open
  useEffect(() => {
    if (page !== "messages" || !selChat || !user?.id) return;
    const interval = setInterval(() => {
      const chat = selChatRef.current;
      if (!chat) return;
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
            return data;
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
            if (soundEnabled) playNotifSound(soundType);
            const currentChat = selChatRef.current;
            // bump sender contact to top
            setChatContacts(prev => [...prev].map(c => c.id === msg.doctor_id ? { ...c, lastMessageAt: msg.created_at } : c).sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")));
            if (currentChat && msg.doctor_id === currentChat.id) {
              setMessages(prev => {
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, msg];
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

  // Presence: track who is online
  // Presence: use database to track online/offline reliably
  useEffect(() => {
    if (!user?.id) return;

    // Mark self as online immediately
    supabase.from("user_presence")
      .upsert({ user_id: user.id, is_online: true, last_seen: new Date().toISOString() }, { onConflict: "user_id" })
      .then(() => {});

    // Load all users' presence on mount
    supabase.from("user_presence").select("user_id,is_online")
      .then(({ data }) => {
        if (!data) return;
        const online = {};
        data.forEach(r => { if (r.is_online) online[r.user_id] = true; });
        setOnlineUsers(online);
      });

    // Listen for INSERT and UPDATE separately so payload.new is always correct
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

    // Mark offline when tab closes
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

  async function loadMessages(doctorId) {
    try {
      const { data, error } = await supabase.from("chat_messages")
        .select("*")
        .eq("pharmacist_id", user.id)
        .eq("doctor_id", doctorId)
        .order("created_at", { ascending: true });
      if (error) { console.error("Load messages error:", error.message); return; }
      setMessages(data || []);
      // clear unread badge for this contact
      setUnreadPerContact(prev => { const n = { ...prev }; delete n[doctorId]; return n; });
      // update lastMessageAt so ordering stays correct
      if (data && data.length > 0) {
        const ts = data[data.length - 1].created_at;
        setChatContacts(prev => [...prev].map(c => c.id === doctorId ? { ...c, lastMessageAt: ts } : c).sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")));
      }
      const unreadIds = (data || []).filter(m => m.sender_id === doctorId && !m.read_at).map(m => m.id);
      if (unreadIds.length > 0) {
        supabase.from("chat_messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds).then(() => {});
        setUnreadCount(prev => Math.max(0, prev - unreadIds.length));
      }
    } catch (e) { console.error("Load messages:", e); }
  }

  async function sendMessage() {
    if (!msgInput.trim() || !selChat || msgSending) return;
    setMsgSending(true);
    const body = msgInput.trim();
    setMsgInput("");
    const now = new Date().toISOString();
    const tempId = `temp-${Date.now()}`;
    const tempMsg = { id: tempId, doctor_id: selChat.id, pharmacist_id: user.id, sender_id: user.id, body, created_at: now, read_at: null };
    setMessages(prev => [...prev, tempMsg]);
    // bump this contact to top immediately on send
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
      setMessages(prev => prev.map(m => m.id === tempId ? msg : m));
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

  async function openPrescription(rx) {
    setSelRx(rx); setLoading(true); setRxMeds([]);
    try { const { data } = await supabase.from("prescription_medications").select("*").eq("prescription_id", rx.id); setRxMeds(data || []); }
    catch (e) { console.error("openPrescription:", e); } finally { setLoading(false); }
  }

  async function claimPrescription(rx) {
    setActionBusy(true);
    try {
      await supabase.from("prescriptions").update({ pharmacist_id: user.id, updated_at: new Date().toISOString() }).eq("id", rx.id);
      setSelRx(p => p?.id === rx.id ? { ...p, pharmacist_id: user.id } : p);
      loadPrescriptions();
    } catch (e) { console.error("claimPrescription:", e); } finally { setActionBusy(false); }
  }

  async function updateStatus(rx, newStatus) {
    setActionBusy(true);
    try {
      await supabase.from("prescriptions").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", rx.id);
      setSelRx(p => p?.id === rx.id ? { ...p, status: newStatus } : p);
      loadPrescriptions();
    } catch (e) { console.error("updateStatus:", e); } finally { setActionBusy(false); }
  }

  const pendingCount = prescriptions.filter(p => p.status === "pending_pharmacist" || p.status === "pending_fill").length;
  const readyCount = prescriptions.filter(p => p.status === "ready" || p.status === "filled" || p.status === "picked_up").length;
  const filtered = prescriptions.filter(p => !search || (patientNames[p.patient_id] || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>

      {/* ── Sidebar ── */}
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
            {[["dashboard", "Dashboard", HeartPulse], ["prescriptions", "Prescriptions", Pill], ["messages", "Messages", MessageSquare]].map(([id, l, I]) => (
              <div key={id} className={`nl ${page === id ? "pha-on" : ""}`} onClick={() => { setPage(id); setSelRx(null); }}>
                <I size={15} />{l}
                {id === "messages" && unreadCount > 0 && (
                  <span style={{ marginLeft: "auto", background: "var(--ro)", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>{unreadCount}</span>
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

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
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
          <button type="button" onClick={() => setLight(!light)} className="shrink-0" style={{ display: "flex", alignItems: "center", gap: 6, padding: isMob ? "6px 10px" : "6px 13px", borderRadius: 99, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", fontSize: 12, fontWeight: 500, color: t2 }}>
            {light ? <Moon size={13} color={PhAC} /> : <Sun size={13} color="var(--am)" />}{!isMob && (light ? "Dark" : "Light")}
          </button>
        </header>

        <div style={{ flex: 1, overflowY: page === "messages" ? "hidden" : "auto", paddingBottom: isMob && !(page === "messages" && selChat) ? "calc(66px + env(safe-area-inset-bottom, 0px))" : 0, display: "flex", flexDirection: "column" }}>

          {/* ════ MESSAGES PAGE ════ */}
          {page === "messages" && (
            <div style={{ height: isMob ? "calc(100dvh - 57px)" : "calc(100vh - 57px)", display: "flex", overflow: "hidden", flexDirection: isMob ? "column" : "row" }}>

              {/* Contact sidebar — full width on mobile when no chat selected */}
              {(!isMob || !selChat) && (
              <div style={{ width: isMob ? "100%" : 280, flexShrink: 0, borderRight: isMob ? "none" : `1px solid ${b1}`, borderBottom: isMob ? `1px solid ${b1}` : "none", display: "flex", flexDirection: "column", background: "var(--s1)", maxHeight: isMob ? "100%" : undefined }}>
                <div style={{ padding: isMob ? "12px 12px" : "14px 16px", borderBottom: `1px solid ${b1}` }}>
                  <h2 className="text-sm sm:text-[15px]" style={{ color: t1, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <MessageSquare size={14} color={PhAC} className="shrink-0" /> Doctor Chat
                  </h2>
                  {/* Find doctor by email */}
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
                  <AnimatePresence>
                    {chatSearchMsg && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ fontSize: 11.5, marginTop: 6, color: chatSearchMsg.type === "ok" ? "var(--gr)" : "var(--ro)", fontWeight: 600 }}>
                        {chatSearchMsg.text}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {chatContacts.length === 0 ? (
                    <div style={{ padding: "30px 16px", textAlign: "center" }}>
                      <Search size={22} color={t3} style={{ opacity: .2, margin: "0 auto 10px", display: "block" }} />
                      <p style={{ color: t3, fontSize: 12 }}>Search for a doctor by email above to start chatting.</p>
                    </div>
                  ) : chatContacts.map(contact => {
                    const isActive = selChat?.id === contact.id;
                    const unread = unreadPerContact[contact.id] || 0;
                    const isOnline = !!onlineUsers[contact.id];
                    return (
                      <div key={contact.id} onClick={() => setSelChat(contact)}
                        style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--b0)", background: isActive ? "rgba(124,58,237,.07)" : unread > 0 ? "rgba(124,58,237,.03)" : "transparent", borderLeft: `3px solid ${isActive ? PhAC : unread > 0 ? "var(--pha-p)" : "transparent"}`, transition: "all .15s" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ position: "relative", flexShrink: 0 }}>
                            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#0e7490,#155e75)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                  })}
                </div>
              </div>
              )} {/* end contact sidebar conditional */}

              {/* Chat window — full screen on mobile when contact selected */}
              {(!isMob || selChat) && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
                {!selChat ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                    <MessageSquare size={32} color={t3} style={{ opacity: .2 }} />
                    <p style={{ color: t2, fontSize: 14, fontWeight: 600 }}>Select a doctor to start chatting.</p>
                  </div>
                ) : (
                  <>
                    {/* Chat header — with back button on mobile */}
                    <div style={{ padding: isMob ? "10px 12px" : "13px 20px", borderBottom: `1px solid ${b1}`, background: "var(--s1)", display: "flex", alignItems: "center", gap: isMob ? 10 : 13, flexShrink: 0, minWidth: 0 }}>
                      {isMob && (
                        <button type="button" onClick={() => setSelChat(null)} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, flexShrink: 0 }}><ArrowRight size={14} style={{ transform: "rotate(180deg)" }} /></button>
                      )}
                      <div style={{ width: isMob ? 38 : 42, height: isMob ? 38 : 42, borderRadius: "50%", background: "linear-gradient(135deg,#0e7490,#155e75)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ color: "#fff", fontSize: isMob ? 14 : 16, fontWeight: 800 }}>{selChat.name[0]?.toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate" style={{ color: t1, fontSize: isMob ? 13 : 14, fontWeight: 700, margin: 0 }}>Dr. {selChat.name}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: onlineUsers[selChat.id] ? "#22c55e" : "var(--b1)", boxShadow: onlineUsers[selChat.id] ? "0 0 5px #22c55e" : "none", transition: "all .4s", flexShrink: 0 }} />
                          <p style={{ color: onlineUsers[selChat.id] ? "#22c55e" : t3, fontSize: 11, margin: 0, fontWeight: onlineUsers[selChat.id] ? 600 : 400 }}>
                            {onlineUsers[selChat.id] ? "Online now" : "Offline"}
                          </p>
                        </div>
                      </div>
                      {!isMob && <span className="role-badge role-doctor">Doctor</span>}
                    </div>

                    {/* Quick-reply chips */}
                    {messages.length > 0 && (
                      <div style={{ padding: isMob ? "8px 12px" : "7px 20px", borderBottom: "1px solid var(--b0)", background: "var(--s2)" }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-full shrink-0 sm:w-auto" style={{ color: t3, fontSize: 10, fontWeight: 700 }}>Quick reply:</span>
                          {["Received — processing now", "Ready for pickup", "Out of stock — ordering now", "Please confirm patient's allergies"].map(qt => (
                            <button key={qt} type="button" onClick={() => setMsgInput(qt)} className="max-w-full text-left" style={{ padding: "5px 10px", borderRadius: 99, fontSize: 10.5, fontWeight: 600, border: `1px solid ${b1}`, background: "var(--s1)", color: t2, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.3 }}>{qt}</button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "20px 16px 12px", display: "flex", flexDirection: "column", gap: 0, background: "var(--bg)" }}>
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
                        const bubbleRadius = isMe
                          ? `${groupTop ? "18px" : "6px"} 18px 18px ${groupBottom ? "18px" : "6px"}`
                          : `18px ${groupTop ? "18px" : "6px"} ${groupBottom ? "18px" : "6px"} 18px`;
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
                                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#0e7490,#155e75)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>{selChat.name[0]?.toUpperCase()}</span>
                                  </div>
                                )}
                              </div>
                              <div style={{ maxWidth: isMob ? "min(80%, 300px)" : "72%", minWidth: 0, display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                                {groupTop && !isMe && <p style={{ color: t3, fontSize: 10, marginBottom: 4, fontWeight: 600, paddingLeft: 2 }}>Dr. {selChat.name}</p>}
                                <div style={{ padding: "9px 14px", borderRadius: bubbleRadius, background: isMe ? PhAC : "var(--s1)", border: isMe ? "none" : `1px solid ${b1}`, boxShadow: isMe ? "0 2px 8px rgba(124,58,237,.18)" : "0 1px 3px rgba(0,0,0,.06)", maxWidth: "100%", transition: "box-shadow .2s" }}>
                                  <p style={{ color: isMe ? "#fff" : t1, fontSize: isMob ? 13 : 13.5, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.body}</p>
                                </div>
                                {groupBottom && <p style={{ color: t3, fontSize: 9, marginTop: 4, textAlign: isMe ? "right" : "left", paddingLeft: isMe ? 0 : 2, paddingRight: isMe ? 2 : 0 }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={msgEndRef} />
                    </div>

                    {/* Input bar */}
                    <div style={{ padding: `10px 14px calc(10px + env(safe-area-inset-bottom, 0px))`, background: "var(--s1)", borderTop: `1px solid ${b1}`, flexShrink: 0, position: "relative", zIndex: 10 }}>
                      <AnimatePresence>
                        {showSoundSettings && (
                          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} style={{ marginBottom: 10, padding: "10px 14px", background: "var(--s2)", border: `1px solid ${b1}`, borderRadius: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <span style={{ color: t1, fontSize: 12, fontWeight: 700 }}>Notification sounds</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: t3, fontSize: 11 }}>{soundEnabled ? "On" : "Off"}</span>
                                <div className={`sw ${soundEnabled ? "on" : ""}`} onClick={() => toggleSound(!soundEnabled)} />
                              </div>
                            </div>
                            {soundEnabled && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {["ping", "chime", "pop", "soft"].map(s => (
                                  <button key={s} onClick={() => changeSoundType(s)} style={{ padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600, border: `1px solid ${soundType === s ? PhAC : b1}`, background: soundType === s ? "var(--pha-pd)" : "transparent", color: soundType === s ? PhAC : t3, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{s}</button>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 9 }}>
                        <div style={{ flex: 1, background: "var(--s2)", border: `1.5px solid ${b1}`, borderRadius: 20, padding: "10px 14px" }}
                          onClick={e => e.currentTarget.querySelector("textarea")?.focus()}>
                          <textarea
                            value={msgInput}
                            onChange={e => setMsgInput(e.target.value)}
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
                      {!isMob && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                          <p style={{ color: t3, fontSize: 10, margin: 0 }}>Enter to send · Shift+Enter for new line</p>
                          <button onClick={() => setShowSoundSettings(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", color: soundEnabled ? PhAC : t3, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, padding: 0, fontFamily: "inherit" }}>
                            {soundEnabled ? "🔔" : "🔕"} Sound
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

          {/* ════ DASHBOARD PAGE ════ */}
          {page === "dashboard" && (
            <div className="w-full min-w-0 max-w-[760px] mx-auto" style={{ padding: isMob ? "16px 14px calc(8px + env(safe-area-inset-bottom, 0px))" : "30px 22px 44px" }}>
              <motion.div className="au" style={{ marginBottom: isMob ? 20 : 28 }}>
                <h2 className="text-[22px] leading-tight sm:text-[26px]" style={{ color: t1, fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontWeight: 600 }}>
                  Welcome, {name.split(" ")[0]}.
                </h2>
                <p style={{ color: t3, fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>Manage prescriptions and communicate with doctors.</p>
              </motion.div>

              {/* Stats — single column on very narrow screens, 3-up from sm */}
              <div className="mb-6 grid w-full min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-3">
                {[
                  { l: "Total prescriptions", v: prescriptions.length, c: PhAC, bg: "var(--pha-pd)" },
                  { l: "Pending", v: pendingCount, c: "var(--am)", bg: "rgba(217,119,6,.1)" },
                  { l: "Ready / Filled", v: readyCount, c: "var(--gr)", bg: "rgba(5,150,105,.1)" },
                ].map((s, i) => (
                  <motion.div key={s.l} className={`au card d${i + 1} min-w-0 overflow-hidden`} style={{ padding: isMob ? "12px 11px" : "18px 16px", textAlign: "center" }}>
                    <div style={{ width: isMob ? 34 : 38, height: isMob ? 34 : 38, borderRadius: 11, background: s.bg, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center" }}><Pill size={isMob ? 15 : 17} color={s.c} /></div>
                    <p className="tabular-nums" style={{ color: t1, fontSize: isMob ? 19 : 22, fontFamily: "'Playfair Display',serif", fontStyle: "italic" }}>{s.v}</p>
                    <p className="line-clamp-2 leading-snug" style={{ color: t3, fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginTop: 4 }}>{s.l}</p>
                  </motion.div>
                ))}
              </div>

              {/* Unread messages banner */}
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

              {/* Recent prescriptions */}
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

          {/* ════ PRESCRIPTIONS PAGE ════ */}
          {page === "prescriptions" && (
            <div className="w-full min-w-0 max-w-[900px] mx-auto" style={{ padding: isMob ? "16px 14px calc(8px + env(safe-area-inset-bottom, 0px))" : "30px 22px 44px" }}>
              {!selRx ? (
                <>
                  <motion.div className="au" style={{ marginBottom: isMob ? 18 : 22 }}>
                    <h2 className="text-[22px] sm:text-2xl" style={{ color: t1, fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontWeight: 600 }}>Prescriptions</h2>
                    <p style={{ color: t3, fontSize: 13, marginTop: 4 }}>{prescriptions.length} prescription{prescriptions.length !== 1 ? "s" : ""} total</p>
                  </motion.div>
                  {/* ── Find patient by email ── */}
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
                      {/* Prescription header */}
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

                      {/* Notes */}
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
          {[["dashboard", HeartPulse, "Home"], ["prescriptions", Pill, "Rx"], ["messages", MessageSquare, "Msgs"]].map(([id, I, l]) => (
            <button key={id} className={`bt ${page === id ? "pha-on" : ""}`}
              style={{ color: page === id ? PhAC : undefined }}
              onClick={() => { setPage(id); setSelRx(null); }}>
              <I size={19} />
              {id === "messages" && unreadCount > 0
                ? <span style={{ position: "relative" }}>{l}<span style={{ position: "absolute", top: -6, right: -10, background: "var(--ro)", color: "#fff", borderRadius: 99, fontSize: 8, fontWeight: 800, padding: "1px 4px" }}>{unreadCount}</span></span>
                : l}
            </button>
          ))}
        </nav>
      )}

      {/* ── Mobile slide-in menu ── */}
      <AnimatePresence>{showNickname && <NicknameModal currentName={name} onSave={saveName} onClose={() => setShowNickname(false)} userId={user?.id} />}</AnimatePresence>
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
                {[["dashboard", "Dashboard", HeartPulse], ["prescriptions", "Prescriptions", Pill], ["messages", "Messages", MessageSquare]].map(([id, l, I]) => (
                  <div key={id} className={`nl ${page === id ? "pha-on" : ""}`} onClick={() => { setPage(id); setSelRx(null); setMobMenu(false); }}>
                    <I size={15} />{l}
                    {id === "messages" && unreadCount > 0 && <span style={{ marginLeft: "auto", background: "var(--ro)", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>{unreadCount}</span>}
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