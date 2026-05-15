import { useMemo, useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Bell, Pill, Calendar, MessageSquare, X, Trash2, CheckCheck, Video } from "lucide-react";
import { supabase } from "../../supabase";
import { useIsMobile } from "../../hooks/useIsMobile";
import { mergeNotificationRows } from "../../lib/notificationRealtimeMerge";
import { buildVideoCallUrlFromRoom, buildVideoRoomId, createVideoWaitingCheckinMessageBody, getAppointmentVideoWindow, parseVideoApprovalMessageBody } from "../../lib/videoCall";
import { getEffectiveVirtualVisitStatus, VS } from "../../lib/virtualVisitStatus";
import VideoCallPanel from "../../components/video/VideoCallPanel";

function windowsOverlap(startA, endA, startB, endB) {
  return Math.min(endA, endB) - Math.max(startA, startB) > 0;
}

function inferNavigateFromGeneralNotification(n) {
  const title = (n.title || "").toLowerCase();
  const body = (n.body || "").toLowerCase();
  const blob = `${title} ${body}`;
  if (/message|inbox|chat|joined the video visit|join video/.test(blob)) return { page: "messages" };
  if (/appointment|reschedule|scheduled|approved|denied/.test(blob)) return { page: "appointments" };
  if (/visit/.test(blob)) return { page: "messages" };
  if (/deliver|shipped|out for delivery|tracking/.test(blob)) return { page: "medications" };
  if (/prescription|refill|pharmacy|medication|dose|pill|pickup/.test(blob)) return { page: "medications" };
  return { page: "dashboard" };
}

export default function NotificationsPage({ userId, meds, onNavigate }) {
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t3 = "var(--t3)", b1 = "var(--b1)";
  const [rows, setRows] = useState([]);
  const [msgUnread, setMsgUnread] = useState(0);

  const toMins = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
  const overduePreview = useMemo(() => {
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    return meds.filter((m) => !m.taken && toMins(m.time) < cur);
  }, [meds]);

  const loadInbox = useCallback(() => {
    if (!userId) return;
    supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50).then(({ data }) => setRows(data || []));
  }, [userId]);

  const refreshMsgUnread = useCallback(() => {
    if (!userId) return;
    supabase.from("patient_messages").select("id,sender_id,created_at").eq("recipient_id", userId).is("read_at", null).order("created_at", { ascending: false }).limit(30).then(({ data, count }) => {
      const rows = data || [];
      setMsgUnread(typeof count === "number" ? count : rows.length);
    });
  }, [userId]);

  const applyNotifRealtime = useCallback((payload) => {
    setRows((prev) => mergeNotificationRows(prev, payload, 50));
  }, []);

  useEffect(() => {
    loadInbox();
    refreshMsgUnread();
    if (!userId) return;
    const ch = supabase.channel(`pt-notif-page-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, applyNotifRealtime)
      .subscribe();
    const ch2 = supabase.channel(`pt-pm-unread-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "patient_messages", filter: `recipient_id=eq.${userId}` }, refreshMsgUnread)
      .subscribe();
    return () => { supabase.removeChannel(ch); supabase.removeChannel(ch2); };
  }, [userId, loadInbox, refreshMsgUnread, applyNotifRealtime]);

  async function markRead(id) {
    if (!userId) return;
    const prevRows = rows;
    const now = new Date().toISOString();
    setRows((p) => p.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
    const { error } = await supabase.from("notifications").update({ read_at: now }).eq("id", id).eq("user_id", userId);
    if (error) {
      console.error("notifications.mark read:", error.message);
      setRows(prevRows);
    }
  }

  async function remove(id) {
    if (!userId) return;
    const prevRows = rows;
    setRows((p) => p.filter((n) => n.id !== id));
    const { error } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      console.error("notifications.delete:", error.message);
      setRows(prevRows);
    }
  }

  async function clearAll() {
    if (!userId || !rows.length) return;
    const prevRows = rows;
    const ids = rows.map((n) => n.id);
    setRows([]);
    const { error } = await supabase.from("notifications").delete().in("id", ids).eq("user_id", userId);
    if (error) {
      console.error("notifications.delete all:", error.message);
      setRows(prevRows);
    }
  }

  async function handleRowClick(n) {
    if (!n.read_at) markRead(n.id);
    let payload;
    if (n.type === "take_med") payload = { page: "medications", medicationId: n.related_id || null };
    else if (n.type === "refill_upcoming") payload = { page: "medications" };
    else if (n.type === "prescription_ready") payload = { page: "medications" };
    else payload = inferNavigateFromGeneralNotification(n);
    onNavigate?.(payload);
  }

  function openUnreadMessages() {
    onNavigate?.({ page: "messages" });
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "26px 22px 44px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ color: t1, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, margin: 0 }}>Notifications</h2>
            <p style={{ color: t3, fontSize: 13, margin: "6px 0 0" }}>Alerts for doses, visits, and messages.</p>
          </div>
          {rows.length > 0 && (
            <button type="button" onClick={clearAll} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", fontSize: 12, fontWeight: 600, color: t1, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Trash2 size={14} /> Clear all
            </button>
          )}
        </div>

        {msgUnread > 0 && (
          <motion.button type="button" className="card au" onClick={openUnreadMessages} style={{ width: "100%", padding: 14, marginBottom: 12, textAlign: "left", cursor: "pointer", fontFamily: "inherit", border: `1px solid ${b1}`, display: "flex", alignItems: "center", gap: 12 }}>
            <MessageSquare size={20} color="var(--p)" />
            <div style={{ flex: 1 }}>
              <p style={{ color: t1, fontSize: 14, fontWeight: 700, margin: 0 }}>New messages</p>
              <p style={{ color: t3, fontSize: 12, margin: "4px 0 0" }}>{msgUnread} unread · open inbox</p>
            </div>
            <span style={{ color: "var(--p)", fontSize: 12, fontWeight: 600 }}>Open</span>
          </motion.button>
        )}

        {overduePreview.length > 0 && (
          <motion.div className="card au" style={{ padding: 14, marginBottom: 12, borderColor: "rgba(185,28,28,.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Pill size={18} color="#b91c1c" />
              <p style={{ color: "#991b1b", fontSize: 14, fontWeight: 700, margin: 0 }}>Overdue doses</p>
            </div>
            <p style={{ color: t3, fontSize: 12, margin: "0 0 10px" }}>{overduePreview.length} medication{overduePreview.length === 1 ? "" : "s"} waiting to be logged.</p>
            <button type="button" onClick={() => onNavigate?.({ page: "medications", medicationId: overduePreview[0]?.id })} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Go to medications
            </button>
          </motion.div>
        )}

        <AppointmentRemindersBlock userId={userId} onNavigate={onNavigate} />

        <p style={{ color: t3, fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", margin: "20px 0 10px" }}>Inbox</p>
        {rows.length === 0 && !msgUnread && overduePreview.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <Bell size={28} color={t3} style={{ opacity: 0.25, margin: "0 auto 10px", display: "block" }} />
            <p style={{ color: t3, fontSize: 13, margin: 0 }}>You&apos;re all caught up.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((n) => (
              <div key={n.id} className="card" style={{ padding: 0, overflow: "hidden", border: `1px solid ${n.read_at ? "var(--b0)" : "rgba(37,99,235,.2)"}` }}>
                <button type="button" onClick={() => { void handleRowClick(n); }} style={{ width: "100%", padding: "12px 14px", border: "none", background: n.read_at ? "transparent" : "rgba(37,99,235,.04)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <p style={{ color: t1, fontSize: 13, fontWeight: n.read_at ? 600 : 700, margin: 0 }}>{n.title}</p>
                  {n.body && <p style={{ color: t3, fontSize: 12, margin: "6px 0 0", lineHeight: 1.45 }}>{n.body}</p>}
                  <p style={{ color: t3, fontSize: 10, margin: "8px 0 0" }}>{new Date(n.created_at).toLocaleString()}</p>
                </button>
                <div style={{ display: "flex", borderTop: `1px solid var(--b0)` }}>
                  {!n.read_at && (
                    <button type="button" onClick={() => markRead(n.id)} style={{ flex: 1, padding: "8px", border: "none", background: "var(--s2)", cursor: "pointer", fontSize: 11, fontWeight: 600, color: t1, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <CheckCheck size={14} /> Mark read
                    </button>
                  )}
                  <button type="button" onClick={() => remove(n.id)} style={{ flex: 1, padding: "8px", border: "none", borderLeft: `1px solid var(--b0)`, background: "var(--s2)", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--ro)", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <X size={14} /> Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AppointmentRemindersBlock({ userId, onNavigate }) {
  const [appts, setAppts] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoCheckedIn, setVideoCheckedIn] = useState(false);
  const [latestVideoEventType, setLatestVideoEventType] = useState(null);
  const [activeCallApptId, setActiveCallApptId] = useState(null);
  const nextRef = useRef(null);
  const videoWindowRef = useRef(null);
  const loadUpcoming = useCallback(() => {
    if (!userId) return;
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from("appointments")
      .select("id,date,time,type,doctor_id,status,virtual_visit_status")
      .eq("patient_id", userId)
      .in("status", ["scheduled", "rescheduled"])
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(5)
      .then(({ data }) => setAppts(data || []));
  }, [userId]);
  useEffect(() => {
    loadUpcoming();
  }, [loadUpcoming]);
  // Poll every 6s so Join Call button appears as soon as doctor starts the call
  useEffect(() => {
    if (!userId) return;
    const t = setInterval(loadUpcoming, 6000);
    return () => clearInterval(t);
  }, [userId, loadUpcoming]);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const next = appts[0] || null;
  const vv = next ? getEffectiveVirtualVisitStatus(next) : VS.PENDING;
  const videoWindow = next ? getAppointmentVideoWindow(next) : null;
  const portalEnd = videoWindow ? videoWindow.portalEndMs ?? videoWindow.windowEndMs : 0;
  const videoState = !videoWindow
    ? "none"
    : nowMs < videoWindow.windowStartMs
      ? "too_early"
      : nowMs > portalEnd
        ? "expired"
        : "waiting";

  // Doctor started the WebRTC call — patient can join now
  const isCallStarted = vv === VS.CALL_STARTED;
  const isCallEnded = vv === VS.CALL_ENDED;

  const canJoinVideo =
    !!next &&
    videoState === "waiting" &&
    !!next.doctor_id &&
    !!userId &&
    (vv === VS.WAITING_FOR_DOCTOR || vv === VS.VIDEO_STARTED) &&
    latestVideoEventType !== "ended";
  useEffect(() => {
    nextRef.current = next;
    videoWindowRef.current = videoWindow;
  }, [next, videoWindow]);

  useEffect(() => {
    if (!userId || !next?.doctor_id || !videoWindow) {
      setLatestVideoEventType(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const roomId = buildVideoRoomId(userId, next.doctor_id);
      const { data } = await supabase
        .from("patient_messages")
        .select("body,created_at")
        .eq("sender_id", next.doctor_id)
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (cancelled) return;
      const rows = (data || [])
        .map((m) => ({ parsed: parseVideoApprovalMessageBody(m?.body || ""), created_at: m?.created_at }))
        .filter((x) => x.parsed && x.parsed.roomId === roomId)
        .filter((x) => windowsOverlap(x.parsed.windowStartMs, x.parsed.windowEndMs, videoWindow.windowStartMs, videoWindow.windowEndMs))
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      setLatestVideoEventType(rows[0]?.parsed?.eventType || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [next?.doctor_id, next?.id, userId, videoWindow?.windowEndMs, videoWindow?.windowStartMs]);
  useEffect(() => {
    if (!userId) return undefined;
    const chAppt = supabase
      .channel(`pt-notif-appt-reminders-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `patient_id=eq.${userId}` }, () => {
        loadUpcoming();
      })
      .subscribe();
    const chMsgs = supabase
      .channel(`pt-notif-video-events-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "patient_messages", filter: `recipient_id=eq.${userId}` }, (payload) => {
        const row = payload?.new;
        if (!row?.body) return;
        const parsed = parseVideoApprovalMessageBody(row.body || "");
        if (!parsed || (parsed.eventType !== "started" && parsed.eventType !== "ended")) return;
        const curNext = nextRef.current;
        const curWindow = videoWindowRef.current;
        if (!curNext?.doctor_id || !curWindow) return;
        if (String(row.sender_id) !== String(curNext.doctor_id)) return;
        const roomId = buildVideoRoomId(userId, curNext.doctor_id);
        if (parsed.roomId !== roomId) return;
        if (!windowsOverlap(parsed.windowStartMs, parsed.windowEndMs, curWindow.windowStartMs, curWindow.windowEndMs)) return;
        setLatestVideoEventType(parsed.eventType);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(chAppt);
      void supabase.removeChannel(chMsgs);
    };
  }, [userId, loadUpcoming]);
  if (!appts.length) return null;

  const statusText = isCallEnded
    ? "Call has ended."
    : isCallStarted
      ? "Doctor is ready — join now!"
      : latestVideoEventType === "ended"
        ? "This video session has ended."
        : vv === VS.VIDEO_STARTED
          ? "Your doctor has joined. You can join now."
          : vv === VS.CHECKED_IN || vv === VS.WAITING_FOR_DOCTOR
            ? "Checked in. Waiting for doctor to start."
            : vv === VS.COMPLETED || vv === VS.DENIED || vv === VS.CANCELLED
              ? "This video session has ended."
              : videoState === "too_early"
                ? `Waiting room opens at ${new Date(videoWindow?.windowStartMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
                : videoState === "expired"
                  ? "Video window expired."
                  : "Waiting room open now.";

  return (
    <>
      <motion.div className="card au" style={{ padding: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Calendar size={20} color="var(--gr)" />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>Upcoming visit</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--t3)" }}>{next.type} · {new Date(`${next.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {new Date(`2000-01-01T${String(next.time).slice(0, 5)}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
          {videoWindow || isCallStarted ? (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: isCallStarted ? "#22c55e" : "var(--t3)", fontWeight: isCallStarted ? 700 : 400 }}>
              {statusText}
            </p>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isCallStarted && !isCallEnded && (
            <button
              type="button"
              onClick={() => setActiveCallApptId(next.id)}
              style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#059669", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 0 0 3px rgba(5,150,105,.25)" }}
            >
              <Video size={14} /> Join Call
            </button>
          )}
          <button type="button" onClick={() => onNavigate?.({ page: "appointments" })} style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: "var(--gr)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>View</button>
        </div>
      </motion.div>
      {activeCallApptId && (
        <VideoCallPanel
          appointmentId={activeCallApptId}
          userId={userId}
          role="patient"
          onEnd={() => {
            setActiveCallApptId(null);
            setAppts((prev) => prev.map((a) => a.id === activeCallApptId ? { ...a, virtual_visit_status: VS.CALL_ENDED } : a));
          }}
        />
      )}
    </>
  );
}
