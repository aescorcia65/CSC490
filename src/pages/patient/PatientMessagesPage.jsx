import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, Check, CheckCheck, Stethoscope, Pill, ArrowRight, Paperclip, FileText, UserRound, ShieldCheck, SquarePen, ArrowLeft, Bell, BellOff, Volume1, Volume2, Video } from "lucide-react";
import { supabase } from "../../supabase";
import { useIsMobile } from "../../hooks/useIsMobile";
import { careTeamDoctorEntries } from "../../lib/careTeam";
import { MESSAGE_ATTACHMENTS_BUCKET } from "../../lib/storageConfig";
import {
  PATIENT_MESSAGING_SOUND_PRESETS,
  ensurePatientMessagingAudioUnlocked,
  loadPatientMessagingSoundSettings,
  savePatientMessagingSoundSettings,
  playPatientMessagingSound,
  playPatientInboundChimeDeduped,
} from "../../lib/patientMessagingSounds";
import { notifyRecipientNewChatMessage } from "../../lib/messageNotifications";
import { getProtocolChatDisplay, formatChatNotificationPreview } from "../../lib/chatMessageDisplay";
import {
  buildVideoCallUrlFromRoom,
  buildVideoRoomId,
  getAppointmentVideoWindow,
  parseVideoApprovalMessageBody,
} from "../../lib/videoCall";
import VirtualPreVisitModal from "../../components/appointments/VirtualPreVisitModal";
import { isVirtualVisitCheckInComplete, patientEnterVirtualWaitingRoom } from "../../lib/virtualVisitCheckIn";
import { formatProfileFullName } from "../../lib/profileName";
import { getEffectiveVirtualVisitStatus, VS } from "../../lib/virtualVisitStatus";
import { useAuth } from "../../contexts/AuthContext";

const FALLBACK_VISIT_PROFILE = Object.freeze({});

function sortMsgs(rows) {
  return [...(rows || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function normalizeInitialPeer(p) {
  if (p && typeof p === "object") return p;
  if (p === "pharmacy") return "pharmacist";
  return p;
}

function peerInitials(name, fallback = "CT") {
  const pieces = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!pieces.length) return fallback;
  if (pieces.length === 1) return pieces[0].slice(0, 2).toUpperCase();
  return `${pieces[0][0] || ""}${pieces[pieces.length - 1][0] || ""}`.toUpperCase();
}

function formatThreadTime(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function sameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toDateString() === db.toDateString();
}

const MAX_ATTACH_BYTES = 10 * 1024 * 1024;

function safeFileName(name) {
  const s = String(name || "file").replace(/[^\w.\- ()]/g, "_");
  return s.length > 180 ? s.slice(0, 180) : s;
}

async function shrinkImageForUpload(file, maxEdge = 1680, quality = 0.82) {
  if (!file?.type?.startsWith("image/")) return null;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return null;
  try {
    const bmp = await createImageBitmap(file);
    const w = bmp.width;
    const h = bmp.height;
    const maxDim = Math.max(w, h);
    const scale = Math.min(1, maxEdge / maxDim);
    const smallEnough = file.size < 512 * 1024 && scale === 1;
    if (smallEnough) {
      bmp.close();
      return null;
    }
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return null;
    }
    ctx.drawImage(bmp, 0, 0, tw, th);
    bmp.close();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", quality);
    });
    if (!blob || blob.size >= file.size) return null;
    return { blob, mime: "image/jpeg", baseName: safeFileName(file.name.replace(/\.[^.]+$/, "") || "photo") + ".jpg" };
  } catch {
    return null;
  }
}

function mergeServerRow(prev, tempId, row) {
  const rest = prev.filter((m) => m.id !== tempId && m.id !== row.id);
  return sortMsgs([...rest, row]);
}

function windowsOverlap(startA, endA, startB, endB) {
  if (![startA, endA, startB, endB].every(Number.isFinite)) return false;
  return Math.min(endA, endB) - Math.max(startA, startB) > 0;
}

function applyIncomingVideoEventToAppointments(prev, doctorId, parsed) {
  if (!doctorId || !parsed?.eventType) return prev;
  return (prev || []).map((appt) => {
    if (String(appt?.doctor_id) !== String(doctorId)) return appt;
    const w = getAppointmentVideoWindow(appt);
    if (!w) return appt;
    if (!windowsOverlap(w.windowStartMs, w.windowEndMs, parsed.windowStartMs, parsed.windowEndMs)) return appt;
    if (parsed.eventType === "started") {
      return { ...appt, virtual_visit_status: VS.VIDEO_STARTED };
    }
    if (parsed.eventType === "ended") {
      return { ...appt, status: "completed", virtual_visit_status: VS.COMPLETED };
    }
    return appt;
  });
}

function latestVideoRoomEventTypeSince(messages, doctorId, startedParsed, startedCreatedAt) {
  if (!doctorId || !startedParsed?.roomId) return null;
  const startedMs = Date.parse(startedCreatedAt || "");
  let latest = null;
  for (let i = 0; i < (messages || []).length; i += 1) {
    const row = messages[i];
    if (!row || row.sender_id !== doctorId) continue;
    const parsed = parseVideoApprovalMessageBody(row.body || "");
    if (!parsed || parsed.roomId !== startedParsed.roomId) continue;
    const rowMs = Date.parse(row.created_at || "");
    if (Number.isFinite(startedMs) && Number.isFinite(rowMs) && rowMs < startedMs) continue;
    if (!latest || rowMs > latest.rowMs) {
      latest = { rowMs, eventType: parsed.eventType };
    }
  }
  return latest?.eventType || null;
}

function friendlyAttachmentError(err) {
  const msg = String(err?.message ?? err?.error ?? err?.msg ?? err ?? "");
  const raw = msg.toLowerCase();
  const status = err?.statusCode ?? err?.status;

  if (
    raw.includes("bucket not found") ||
    raw.includes("bucket does not exist") ||
    raw.includes("specified bucket") ||
    (raw.includes("bucket") && raw.includes("not found")) ||
    (raw.includes("storage") && raw.includes("bucket") && (raw.includes("not found") || raw.includes("does not exist")))
  ) {
    return {
      title: "We couldn’t upload your file",
      hint: import.meta.env.DEV
        ? `Supabase needs the Storage bucket "${MESSAGE_ATTACHMENTS_BUCKET}". Open Dashboard → SQL, paste and run supabase/manual/01_message_attachments_storage.sql. If the bucket name in the dashboard differs, add VITE_MESSAGE_ATTACHMENTS_BUCKET to .env and restart the dev server.`
        : "Attachments aren’t turned on for this app yet. Please send a text message instead.",
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    raw.includes("unauthorized") ||
    raw.includes("forbidden") ||
    raw.includes("permission denied") ||
    raw.includes("access denied") ||
    raw.includes("not allowed") ||
    raw.includes("row-level security") ||
    raw.includes("violates row-level security") ||
    (raw.includes("policy") && raw.includes("violat"))
  ) {
    return {
      title: "We couldn’t upload your file",
      hint: "The app isn’t allowing this upload right now—usually sign-in or storage permissions. Try signing out and back in, or send a text message instead.",
    };
  }

  if (raw.includes("attachment_url") || raw.includes("attachment_name") || (raw.includes("column") && raw.includes("patient_messages"))) {
    return {
      title: "We couldn’t upload your file",
      hint: "Attachments need a database update on this app. Please send a text message instead.",
    };
  }

  if (raw.includes("jwt") || raw.includes("session") || raw.includes("invalid token")) {
    return {
      title: "We couldn’t upload your file",
      hint: "Your session may have expired. Sign in again, then try attaching—or send a text message.",
    };
  }

  if (raw.includes("network") || raw.includes("failed to fetch") || raw.includes("load failed") || raw.includes("networkerror")) {
    return {
      title: "We couldn’t upload your file",
      hint: "Check your internet connection and try again, or send a text message.",
    };
  }

  return {
    title: "We couldn’t upload your file",
    hint: "The app isn’t allowing this file through right now. Try a smaller file, or send a text message instead.",
  };
}

function previewText(row) {
  if (!row) return null;
  const cap = String(formatChatNotificationPreview(row.body || "")).trim();
  if (row.attachment_name || row.attachment_url) {
    const att = "" + (row.attachment_name || "File");
    return cap ? `${cap} · ${att}` : att;
  }
  return cap || null;
}

function useTypingSuggestion(input, peerTab) {
  return useMemo(() => {
    const s = input.toLowerCase();
    if (!s.trim()) return null;
    const pharmRx = /\b(side\s+effects?|refill|dosage|prescription|pharmacist|pharmacy|tablet|interaction|otc|medication\s+question)\b/i;
    const docRx = /\b(pain|symptoms?|sick|fever|diagnos|rash|hurt|nausea|infection|blood\s+pressure|heart|chest|covid|flu)\b/i;
    if (pharmRx.test(s) && peerTab === "doctor") {
      return { switchTo: "pharmacist", text: "This looks like a medication question. Consider messaging your pharmacist." };
    }
    if (docRx.test(s) && peerTab === "pharmacist") {
      return { switchTo: "doctor", text: "This sounds like a medical concern. Your doctor may be the best contact." };
    }
    return null;
  }, [input, peerTab]);
}

export default function PatientMessagesPage({ userId, senderDisplayName, initialPeer, onOpenCareTeamSettings, onlineUsers = {} }) {
  const { setDisplayName } = useAuth();
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t3 = "var(--t3)", b1 = "var(--b1)";
  const panelBg = "var(--s1)";
  const panelBorder = `1px solid ${b1}`;
  const panelShadow = "none";
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState(null);
  const [pharmacist, setPharmacist] = useState(null);
  const [peerTab, setPeerTab] = useState("doctor");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [threadMeta, setThreadMeta] = useState({});
  const [hoverConversationId, setHoverConversationId] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  const [mobileView, setMobileView] = useState("list");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);
  const [threadMetaTick, setThreadMetaTick] = useState(0);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [ptSound, setPtSound] = useState(() => loadPatientMessagingSoundSettings());
  const [videoNowMs, setVideoNowMs] = useState(() => Date.now());
  const [videoDoctorAppointments, setVideoDoctorAppointments] = useState([]);
  const [patientProfile, setPatientProfile] = useState(null);
  const [videoPreVisitOpen, setVideoPreVisitOpen] = useState(false);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);
  const announcedVideoStartIdsRef = useRef(new Set());
  const announcedInboundMsgAlertIdsRef = useRef(new Set());
  const typingTimer = useRef(null);
  const typingChRef = useRef(null);
  const activePeerRef = useRef(null);

  const activeDoctor = useMemo(() => doctors.find((d) => d.id === selectedDoctorId) || null, [doctors, selectedDoctorId]);
  const activePeer = peerTab === "doctor" ? activeDoctor : pharmacist;
  useEffect(() => {
    activePeerRef.current = activePeer?.id ?? null;
  }, [activePeer?.id]);
  const suggestion = useTypingSuggestion(input, peerTab);
  const doctorTabLabel = doctors.length > 1 ? "Doctors" : "Doctor";
  const isPhone = viewportWidth < 640;
  const isTablet = viewportWidth >= 640 && viewportWidth <= 1024;
  const isDesktop = viewportWidth > 1024;
  const conversationItems = useMemo(() => {
    const docs = doctors.map((d) => ({
      id: d.id,
      type: "doctor",
      name: d.name,
      subtitle: d.careLabel || "Doctor",
      roleLabel: "Doctor",
    }));
    const pharm = pharmacist
      ? [
          {
            id: pharmacist.id,
            type: "pharmacist",
            name: pharmacist.name || "Pharmacist",
            subtitle: pharmacist.pharmacy_name || "Pharmacist",
            roleLabel: "Pharmacist",
          },
        ]
      : [];
    return [...docs, ...pharm];
  }, [doctors, pharmacist]);
  const latestDoctorVideoApproval = useMemo(() => {
    if (peerTab !== "doctor" || !activePeer?.id) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.sender_id !== activePeer.id) continue;
      const parsed = parseVideoApprovalMessageBody(m?.body);
      if (parsed) return parsed;
    }
    return null;
  }, [messages, peerTab, activePeer?.id]);
  const activeDoctorVideoWindow = useMemo(() => {
    if (peerTab !== "doctor" || !activePeer?.id) return null;
    const windows = (videoDoctorAppointments || [])
      .map((a) => ({ appt: a, window: getAppointmentVideoWindow(a) }))
      .filter((row) => !!row.window)
      .sort((a, b) => a.window.windowStartMs - b.window.windowStartMs);
    const inRange = windows.find((row) => {
      const pe = row.window.portalEndMs ?? row.window.windowEndMs;
      return videoNowMs >= row.window.windowStartMs && videoNowMs <= pe;
    });
    if (inRange) return inRange;
    const nextUp = windows.find((row) => videoNowMs < row.window.windowStartMs);
    return nextUp || null;
  }, [activePeer?.id, peerTab, videoDoctorAppointments, videoNowMs]);
  const activeVideoRoomId = useMemo(() => {
    if (!activePeer?.id || peerTab !== "doctor") return "";
    if (activeDoctorVideoWindow?.window) return buildVideoRoomId(userId, activePeer.id);
    if (latestDoctorVideoApproval?.roomId) return latestDoctorVideoApproval.roomId;
    return "";
  }, [activeDoctorVideoWindow?.window, activePeer?.id, latestDoctorVideoApproval?.roomId, peerTab, userId]);
  const activeVideoUrl = useMemo(() => buildVideoCallUrlFromRoom(activeVideoRoomId), [activeVideoRoomId]);
  const latestActiveRoomEventType = useMemo(() => {
    if (peerTab !== "doctor" || !activePeer?.id || !userId) return null;
    const roomId = buildVideoRoomId(userId, activePeer.id);
    let latest = null;
    for (let i = 0; i < (messages || []).length; i += 1) {
      const row = messages[i];
      if (!row || row.sender_id !== activePeer.id) continue;
      const parsed = parseVideoApprovalMessageBody(row.body || "");
      if (!parsed || parsed.roomId !== roomId) continue;
      const rowMs = Date.parse(row.created_at || "");
      if (!Number.isFinite(rowMs)) continue;
      if (!latest || rowMs > latest.rowMs) latest = { rowMs, eventType: parsed.eventType };
    }
    return latest?.eventType || null;
  }, [activePeer?.id, messages, peerTab, userId]);
  const videoWindowState = useMemo(() => {
    if (!activeDoctorVideoWindow?.window || !activeDoctorVideoWindow?.appt) return "none";
    if (latestActiveRoomEventType === "ended") return "ended";
    const w = activeDoctorVideoWindow.window;
    const pe = w.portalEndMs ?? w.windowEndMs;
    if (videoNowMs < w.windowStartMs) return "too_early";
    if (videoNowMs > pe) return "expired";
    if (latestActiveRoomEventType === "started") return "doctor_started";
    return getEffectiveVirtualVisitStatus(activeDoctorVideoWindow.appt) === VS.VIDEO_STARTED ? "doctor_started" : "waiting";
  }, [activeDoctorVideoWindow?.appt?.id, activeDoctorVideoWindow?.appt?.virtual_visit_status, activeDoctorVideoWindow?.window, latestActiveRoomEventType, videoNowMs]);
  const hasCheckedIntoWaitingRoom = useMemo(() => {
    if (!activeDoctorVideoWindow?.appt) return false;
    const vs = getEffectiveVirtualVisitStatus(activeDoctorVideoWindow.appt);
    return vs === VS.WAITING_FOR_DOCTOR || vs === VS.VIDEO_STARTED;
  }, [activeDoctorVideoWindow?.appt?.virtual_visit_status, activeDoctorVideoWindow?.appt?.id]);
  const isCheckedInWaiting = videoWindowState === "waiting" && hasCheckedIntoWaitingRoom;
  const videoJoinHint = useMemo(() => {
    if (!activeDoctorVideoWindow?.window) return "No upcoming virtual appointment with this doctor.";
    if (!isVirtualVisitCheckInComplete(patientProfile))
      return "Complete virtual check-in first, then use Check In on Appointments during your window.";
    if (videoWindowState === "too_early") {
      return `Waiting room opens at ${new Date(activeDoctorVideoWindow.window.windowStartMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
    }
    if (videoWindowState === "expired") return "Video reconnect period ended for this appointment.";
    if (videoWindowState === "ended") return "This video session has ended.";
    if (videoWindowState === "doctor_started") {
      return "Your doctor has joined. Join video chat.";
    }
    return isCheckedInWaiting ? "Checked in. Waiting for doctor to start the video." : "Tap video to enter the waiting room.";
  }, [activeDoctorVideoWindow?.window, patientProfile, hasCheckedIntoWaitingRoom, isCheckedInWaiting, videoWindowState]);
  const canOpenPreVisitEarly =
    !!activeDoctorVideoWindow?.window &&
    !!activePeer?.id &&
    !!activeVideoUrl &&
    !isVirtualVisitCheckInComplete(patientProfile);
  const videoActionEnabled =
    canOpenPreVisitEarly ||
    (!!activeVideoUrl && videoWindowState === "waiting" && isVirtualVisitCheckInComplete(patientProfile)) ||
    (!!activeVideoUrl && videoWindowState === "doctor_started");

  const performWaitingRoomCheckin = useCallback(async () => {
    if (!activeDoctorVideoWindow?.window || !activeDoctorVideoWindow?.appt || !activePeer?.id || !userId) return;
    const appt = activeDoctorVideoWindow.appt;
    const win = activeDoctorVideoWindow.window;
    const { error } = await patientEnterVirtualWaitingRoom({ userId, appt, videoWindow: win });
    if (error) return;
    setVideoDoctorAppointments((prev) =>
      prev.map((row) => (row.id === appt.id ? { ...row, virtual_visit_status: VS.WAITING_FOR_DOCTOR } : row)),
    );
  }, [activeDoctorVideoWindow?.appt, activeDoctorVideoWindow?.window, activePeer?.id, userId]);

  const openVideoVisit = useCallback(() => {
    if (!activeVideoUrl || !activePeer?.id || !userId || !activeDoctorVideoWindow?.window) return;

    if (!isVirtualVisitCheckInComplete(patientProfile)) {
      setVideoPreVisitOpen(true);
      return;
    }

    if (videoWindowState !== "waiting" && videoWindowState !== "doctor_started") return;

    if (videoWindowState === "waiting") {
      void performWaitingRoomCheckin();
      return;
    }
    if (typeof window !== "undefined") window.open(activeVideoUrl, "_blank", "noopener,noreferrer");
  }, [
    activeDoctorVideoWindow?.window,
    activePeer?.id,
    activeVideoUrl,
    patientProfile,
    performWaitingRoomCheckin,
    userId,
    videoWindowState,
  ]);

  useEffect(() => {
    setSuggestionDismissed(false);
  }, [input, peerTab]);

  useEffect(() => {
    const onPt = (e) => {
      if (e.detail) setPtSound(e.detail);
    };
    window.addEventListener("pt-messaging-sound", onPt);
    return () => window.removeEventListener("pt-messaging-sound", onPt);
  }, []);

  useEffect(() => {
    const unlock = () => {
      void ensurePatientMessagingAudioUnlocked();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setVideoNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!userId || peerTab !== "doctor" || !activePeer?.id) {
      setVideoDoctorAppointments([]);
      return;
    }
    let cancelled = false;
    const loadVideoAppointments = async () => {
      const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("appointments")
        .select("id,date,time,type,status,doctor_id,virtual_visit_status")
        .eq("patient_id", userId)
        .eq("doctor_id", activePeer.id)
        .in("status", ["scheduled", "rescheduled"])
        .gte("date", fromDate)
        .order("date", { ascending: true });
      if (!cancelled) setVideoDoctorAppointments(data || []);
    };
    loadVideoAppointments();
    const poll = setInterval(loadVideoAppointments, 30000);
    const aptCh = supabase
      .channel(`mt-pt-msg-vvisit-${userId}-${activePeer.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `patient_id=eq.${userId}` },
        (payload) => {
          const row = payload?.new ?? payload?.old;
          if (row?.doctor_id == null || String(row.doctor_id) !== String(activePeer.id)) return;
          loadVideoAppointments();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      clearInterval(poll);
      void supabase.removeChannel(aptCh);
    };
  }, [activePeer?.id, peerTab, userId]);

  useEffect(() => {
    if (!userId) {
      setPatientProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("first_name,last_name,pre_visit_intake,allergies,medical_conditions")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setPatientProfile(data || null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const cols = "first_name,last_name,pre_visit_intake,allergies,medical_conditions";
    const ch = supabase
      .channel(`mt-patient-profile-intake-msg-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        async () => {
          const { data } = await supabase.from("profiles").select(cols).eq("id", userId).single();
          if (data) setPatientProfile(data);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  useEffect(() => {
    if (!isPhone) {
      setMobileView("chat");
      return;
    }
    if (!activePeer?.id) setMobileView("list");
  }, [isPhone, activePeer?.id]);

  useEffect(() => {
    if (!userId) {
      setBootLoading(true);
      return;
    }
    let cancelled = false;
    setBootLoading(true);
    setDoctors([]);
    setSelectedDoctorId(null);
    setPharmacist(null);
    (async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let prof = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("primary_doctor_id,primary_pharmacist_id,care_team")
          .eq("id", userId)
          .single();
        if (cancelled) return;
        if (data && !error) {
          prof = data;
          break;
        }
        if (attempt < 2) await sleep(300);
      }
      if (cancelled) return;
      if (!prof) {
        setDoctors([]);
        setSelectedDoctorId(null);
        setPharmacist(null);
        setBootLoading(false);
        return;
      }
      const entries = careTeamDoctorEntries(prof);
      /** Include clinicians from upcoming/past bookings so Messaging works when care_team / primary_doctor weren’t populated yet. */
      const mergedDoctorEntries = [...entries];
      const doctorIdsSeen = new Set(entries.map((e) => e.doctorId));
      const { data: aptDoctorRows } = await supabase
        .from("appointments")
        .select("doctor_id")
        .eq("patient_id", userId)
        .not("doctor_id", "is", null);
      if (cancelled) return;
      if (aptDoctorRows?.length) {
        for (const row of aptDoctorRows) {
          const did = row?.doctor_id;
          if (!did || doctorIdsSeen.has(did)) continue;
          doctorIdsSeen.add(did);
          mergedDoctorEntries.push({ doctorId: did, label: "Appointment" });
        }
      }
      const seenDoc = new Set();
      const docList = [];
      for (const e of mergedDoctorEntries) {
        if (seenDoc.has(e.doctorId)) continue;
        seenDoc.add(e.doctorId);
        docList.push({ id: e.doctorId, careLabel: e.label, role: "doctor", name: "Doctor" });
      }
      const pharmId = prof.primary_pharmacist_id;
      const peopleIds = [...docList.map((d) => d.id), pharmId].filter(Boolean);
      if (peopleIds.length) {
        const { data: people } = await supabase.from("profiles").select("id,first_name,last_name,role,pharmacy_name").in("id", peopleIds);
        if (cancelled) return;
        const byId = new Map((people || []).map((p) => [p.id, p]));
        for (const d of docList) {
          const p = byId.get(d.id);
          d.name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || "Doctor" : "Doctor";
        }
        if (pharmId) {
          const p = byId.get(pharmId);
          if (p) {
            const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Pharmacist";
            setPharmacist({ id: p.id, name, role: "pharmacist", pharmacy_name: p.pharmacy_name });
          }
        }
      }
      if (cancelled) return;
      setDoctors(docList);
      setSelectedDoctorId((prev) => (prev && docList.some((d) => d.id === prev) ? prev : null));
      setBootLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const ip = normalizeInitialPeer(initialPeer);
    if (ip === "pharmacist" && pharmacist) setPeerTab("pharmacist");
    else if (ip === "doctor" && doctors.length) setPeerTab("doctor");
  }, [initialPeer, doctors.length, pharmacist]);

  useEffect(() => {
    if (doctors.length && !pharmacist) setPeerTab("doctor");
    else if (!doctors.length && pharmacist) setPeerTab("pharmacist");
  }, [doctors.length, pharmacist]);

  const loadMessages = useCallback(async (peerId) => {
    if (!userId || !peerId) {
      setMessages([]);
      return;
    }
    setThreadLoading(true);
    const q = `and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`;
    const { data, error } = await supabase.from("patient_messages").select("*").or(q).order("created_at", { ascending: true }).limit(200);
    if (error) {
      console.error("patient_messages:", error.message);
      setMessages([]);
      setThreadLoading(false);
      return;
    }
    setMessages(sortMsgs(data));
    const unreadIds = (data || []).filter((m) => m.recipient_id === userId && m.sender_id === peerId && !m.read_at).map((m) => m.id);
    if (unreadIds.length) {
      await supabase.from("patient_messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
      setMessages(sortMsgs((data || []).map((m) => (unreadIds.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m))));
    }
    setThreadLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!activePeer?.id) {
      setMessages([]);
      return;
    }
    loadMessages(activePeer.id);
  }, [activePeer?.id, loadMessages]);

  useEffect(() => {
    if (!userId) return;

    const bumpMeta = () => setThreadMetaTick((n) => n + 1);

    const announceIncomingMessageAlert = () => {};

    const announceDoctorVideoStarted = (row) => {
      if (!row?.id) return;
      const key = String(row.id);
      if (announcedVideoStartIdsRef.current.has(key)) return;
      announcedVideoStartIdsRef.current.add(key);
      const parsed = parseVideoApprovalMessageBody(row.body || "");
      if (!parsed || parsed.eventType !== "started") return;
      const joinUrl = buildVideoCallUrlFromRoom(parsed.roomId);
      const alertText = "Your doctor started the video visit. Open Messages and tap Join video visit.";
      if (typeof window === "undefined") return;
      try {
        if ("Notification" in window && window.Notification.permission === "granted") {
          const n = new window.Notification("Doctor started your video visit", {
            body: "Join now from Messages.",
            tag: `doctor-video-started-${key}`,
          });
          n.onclick = () => {
            try {
              window.focus();
              if (joinUrl) window.open(joinUrl, "_blank", "noopener,noreferrer");
            } catch {}
          };
        }
      } catch {}
      try {
        window.alert(alertText);
      } catch {}
    };

    const onInsert = (payload) => {
      const row = payload.new;
      if (!row) return;
      if (row.sender_id !== userId && row.recipient_id !== userId) return;
      if (row.recipient_id === userId && row.sender_id !== userId) {
        const st = loadPatientMessagingSoundSettings();
        if (st.enabled) void playPatientInboundChimeDeduped(row.id, st.preset, st.volume);
        announceIncomingMessageAlert(row);
        announceDoctorVideoStarted(row);
        const parsed = parseVideoApprovalMessageBody(row.body || "");
        if (parsed && (parsed.eventType === "started" || parsed.eventType === "ended")) {
          setVideoDoctorAppointments((prev) => applyIncomingVideoEventToAppointments(prev, row.sender_id, parsed));
        }
      }
      bumpMeta();
      const peerId = activePeerRef.current;
      if (!peerId) return;
      const pair = new Set([row.sender_id, row.recipient_id]);
      if (!pair.has(userId) || !pair.has(peerId)) return;

      if (row.recipient_id === userId && row.sender_id === peerId) {
        const readAt = new Date().toISOString();
        supabase.from("patient_messages").update({ read_at: readAt }).eq("id", row.id).then(() => {});
        setMessages((prev) =>
          sortMsgs(prev.filter((m) => String(m.id) !== String(row.id)).concat([{ ...row, read_at: readAt }]))
        );
      } else {
        setMessages((prev) => sortMsgs([...prev.filter((m) => String(m.id) !== String(row.id)), row]));
      }
    };

    const onUpdate = (payload) => {
      const row = payload.new;
      if (!row) return;
      if (row.sender_id !== userId && row.recipient_id !== userId) return;
      bumpMeta();
      const peerId = activePeerRef.current;
      if (!peerId) return;
      const other = row.sender_id === userId ? row.recipient_id : row.sender_id;
      if (other !== peerId) return;
      setMessages((prev) => sortMsgs(prev.map((m) => (String(m.id) === String(row.id) ? { ...m, ...row } : m))));
    };

    const ch = supabase
      .channel(`pm-all-msgs-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "patient_messages" }, onInsert)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "patient_messages" }, onUpdate)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [doctors, pharmacist?.id, pharmacist?.name, userId]);

  useEffect(() => {
    if (!userId || !activePeer?.id || bootLoading) return;
    const peerId = activePeer.id;
    const poll = async () => {
      const q = `and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`;
      const { data, error } = await supabase.from("patient_messages").select("*").or(q).order("created_at", { ascending: true }).limit(200);
      if (error || !data) return;
      setMessages((prev) => {
        const temps = prev.filter((m) => String(m.id).startsWith("temp-"));
        const realPrev = prev.filter((m) => !String(m.id).startsWith("temp-"));
        const lastPrevId = realPrev[realPrev.length - 1]?.id;
        const lastNewId = data[data.length - 1]?.id;
        if (lastPrevId === lastNewId && realPrev.length === data.length) return prev;
        const serverIds = new Set(data.map((m) => m.id));
        const pendingTemps = temps.filter((t) => t.id && !serverIds.has(t.id));
        return sortMsgs([...data, ...pendingTemps]);
      });
    };
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [userId, activePeer?.id, bootLoading]);

  useEffect(() => {
    if (!userId || !conversationItems.length) {
      setThreadMeta({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        conversationItems.map(async (peer) => {
          const q = `and(sender_id.eq.${userId},recipient_id.eq.${peer.id}),and(sender_id.eq.${peer.id},recipient_id.eq.${userId})`;
          const [{ data: latest }, { count }] = await Promise.all([
            supabase
              .from("patient_messages")
              .select("*")
              .or(q)
              .order("created_at", { ascending: false })
              .limit(1),
            supabase
              .from("patient_messages")
              .select("id", { count: "exact", head: true })
              .eq("recipient_id", userId)
              .eq("sender_id", peer.id)
              .is("read_at", null),
          ]);
          const row = latest?.[0];
          return [
            peer.id,
            {
              preview: previewText(row) || `Start a secure chat with ${peer.name}.`,
              time: row?.created_at || null,
              unread: count || 0,
            },
          ];
        })
      );
      if (cancelled) return;
      setThreadMeta(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, conversationItems, messages.length, threadMetaTick]);

  useEffect(() => {
    if (!userId || !activePeer?.id) return;
    typingChRef.current = null;
    const thread = [userId, activePeer.id].sort().join("-");
    const ch = supabase
      .channel(`pm-typing-${thread}`, { config: { broadcast: { ack: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.sender_id && payload.sender_id !== userId) {
          setPeerTyping(true);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setPeerTyping(false), 2500);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") typingChRef.current = ch;
      });
    return () => {
      clearTimeout(typingTimer.current);
      typingChRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [userId, activePeer?.id]);

  function emitTyping() {
    if (!userId) return;
    typingChRef.current?.send({ type: "broadcast", event: "typing", payload: { sender_id: userId } }).catch(() => {});
  }

  async function sendAttachmentFile(file) {
    if (!file) return;
    if (!userId || !activePeer?.id) {
      setUploadErr({
        title: "We couldn’t upload your file",
        hint: !activePeer?.id
          ? "Pick who you’re messaging first (doctor or pharmacist), then try the paperclip again."
          : "You need to be signed in to attach files. Send a text message or sign in again.",
      });
      return;
    }
    if (sending || uploading) return;
    if (file.size > MAX_ATTACH_BYTES) {
      setUploadErr({ title: "This file is too large", hint: "Choose something under 10 MB, or send a text-only message." });
      return;
    }
    setUploadErr(null);
    const caption = input.trim();
    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    const wantsLocalPreview = file.type.startsWith("image/");
    let blobUrl = null;
    if (wantsLocalPreview) {
      try {
        blobUrl = URL.createObjectURL(file);
      } catch {
        blobUrl = null;
      }
    }

    const optimistic = {
      id: tempId,
      sender_id: userId,
      recipient_id: activePeer.id,
      body: caption,
      read_at: null,
      created_at: now,
      attachment_url: blobUrl,
      attachment_name: file.name,
      attachment_mime: file.type || "application/octet-stream",
      _pendingUpload: true,
    };
    setMessages((prev) => sortMsgs([...prev, optimistic]));
    setInput("");
    setUploading(true);

    try {
      const shrunk = await shrinkImageForUpload(file);
      const uploadPayload = shrunk?.blob || file;
      const uploadMime = shrunk?.mime || file.type || "application/octet-stream";
      const storedName = shrunk?.baseName || file.name;
      const path = `${userId}/${crypto.randomUUID()}_${safeFileName(storedName)}`;

      const { error: upErr } = await supabase.storage
        .from(MESSAGE_ATTACHMENTS_BUCKET)
        .upload(path, uploadPayload, { contentType: uploadMime, cacheControl: "86400", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(MESSAGE_ATTACHMENTS_BUCKET).getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error("No public URL for upload");

      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }

      const { data: row, error } = await supabase
        .from("patient_messages")
        .insert({
          sender_id: userId,
          recipient_id: activePeer.id,
          body: caption,
          attachment_url: publicUrl,
          attachment_name: storedName,
          attachment_mime: uploadMime,
        })
        .select("*")
        .single();
      if (error) throw error;
      setMessages((prev) => mergeServerRow(prev, tempId, row));
      const attLabel = storedName ? `${storedName}` : "Sent an attachment";
      notifyRecipientNewChatMessage({
        recipientId: activePeer.id,
        senderName: senderDisplayName || "Patient",
        messageText: (caption || "").trim() || attLabel,
        relatedMessageId: row?.id,
      });
    } catch (e) {
      console.error(e);
      setUploadErr(friendlyAttachmentError(e));
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(caption);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploading(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || !userId || !activePeer?.id || sending) return;
    setSending(true);
    setInput("");
    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    const optimistic = { id: tempId, sender_id: userId, recipient_id: activePeer.id, body: text, read_at: null, created_at: now };
    setMessages((prev) => sortMsgs([...prev, optimistic]));
    try {
      const { data: row, error } = await supabase.from("patient_messages").insert({ sender_id: userId, recipient_id: activePeer.id, body: text }).select("*").single();
      if (error) throw error;
      setMessages((prev) => mergeServerRow(prev, tempId, row));
      notifyRecipientNewChatMessage({
        recipientId: activePeer.id,
        senderName: senderDisplayName || "Patient",
        messageText: text,
        relatedMessageId: row?.id,
      });
    } catch (e) {
      console.error(e);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, peerTyping]);

  if (bootLoading) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
        <Loader2 size={22} className="auth-spin" style={{ color: "var(--p)" }} />
      </div>
    );
  }

  if (!doctors.length && !pharmacist) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y", padding: isMob ? 16 : 26 }}>
        <div className="card" style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
          <p style={{ color: t1, fontSize: 15, fontWeight: 600, margin: 0 }}>No care team contacts</p>
          <p style={{ color: t3, fontSize: 13, marginTop: 8, lineHeight: 1.55 }}>
            Add a doctor or your pharmacist under Settings → Care team to start secure messaging. You can add several doctors (e.g. primary and specialists) and message each separately.
          </p>
          {onOpenCareTeamSettings ? (
            <button type="button" className="btn" style={{ marginTop: 14, width: "100%" }} onClick={onOpenCareTeamSettings}>
              Open Care team settings
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        position: "relative",
        padding: isMob ? "4px 12px 10px" : "0px 18px 16px",
        gap: 12,
        width: "100%",
        maxWidth: isPhone ? "100%" : 1180,
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      <div style={{ flexShrink: 0 }} />

      {(!isPhone || mobileView === "list") && (
        <div style={{ display: "flex", gap: 8, flexShrink: 0, maxWidth: isPhone ? "100%" : 500, background: panelBg, border: panelBorder, borderRadius: 14, padding: 3, boxShadow: panelShadow, marginTop: 2 }}>
          {doctors.length ? (
            <button
              type="button"
              onClick={() => setPeerTab("doctor")}
              style={{
                flex: 1,
                padding: "8px 10px",
                minHeight: 44,
                borderRadius: 10,
                border: "1px solid transparent",
                borderBottom: peerTab === "doctor" ? "2px solid var(--p)" : "1px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                color: t1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Stethoscope size={16} color="var(--p)" /> {doctorTabLabel}
            </button>
          ) : null}
          {pharmacist ? (
            <button
              type="button"
              onClick={() => setPeerTab("pharmacist")}
              style={{
                flex: 1,
                padding: "8px 10px",
                minHeight: 44,
                borderRadius: 10,
                border: "1px solid transparent",
                borderBottom: peerTab === "pharmacist" ? "2px solid var(--pha-p)" : "1px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                color: t1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Pill size={16} color="var(--pha-p)" /> Pharmacist
            </button>
          ) : null}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: isPhone ? 0 : 520,
          height: isPhone ? "calc(100dvh - 172px)" : "min(590px, calc(100vh - 210px))",
          display: "flex",
          gap: 14,
          overflow: "hidden",
          flexDirection: isPhone ? "column" : "row",
        }}
      >
        {(!isPhone || mobileView === "list") && (
        <section style={{ width: isPhone ? "100%" : isTablet ? 296 : 336, minWidth: isPhone ? 0 : isTablet ? 280 : 320, border: panelBorder, borderRadius: 16, background: panelBg, boxShadow: panelShadow, display: "flex", flexDirection: "column", minHeight: isPhone ? 260 : 0 }}>
          <div style={{ padding: "12px 12px 8px", borderBottom: `1px solid ${b1}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <p style={{ color: t1, fontSize: 14, fontWeight: 700, margin: 0 }}>Conversations</p>
            <button type="button" style={{ width: 26, height: 26, borderRadius: 8, border: panelBorder, background: "var(--s2)", color: "var(--p)", display: "grid", placeItems: "center", cursor: "not-allowed" }} disabled aria-label="New conversation">
              <SquarePen size={13} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "4px 6px 6px", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}>
            {conversationItems
              .filter((item) => item.type === peerTab)
              .map((item) => {
                const active = activePeer?.id === item.id;
                const meta = threadMeta[item.id] || {};
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setPeerTab(item.type);
                      if (item.type === "doctor") setSelectedDoctorId(item.id);
                      if (isPhone) setMobileView("chat");
                    }}
                    onMouseEnter={() => setHoverConversationId(item.id)}
                    onMouseLeave={() => setHoverConversationId(null)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: isPhone ? "10px 10px" : "9px 9px",
                      minHeight: isPhone ? 56 : 52,
                      borderRadius: 12,
                      border: active ? "1px solid rgba(37,99,235,.3)" : "1px solid transparent",
                      background: active ? "rgba(37,99,235,.12)" : hoverConversationId === item.id ? "rgba(15,23,42,.04)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      marginBottom: 2,
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: active ? "var(--pd)" : "var(--s2)", border: `1px solid ${b1}`, display: "grid", placeItems: "center", color: active ? "var(--p)" : t3, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {peerInitials(item.name, item.type === "doctor" ? "DR" : "PH")}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <p style={{ margin: 0, color: t1, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 132 }}>{item.name}</p>
                        <span style={{ color: t3, fontSize: 10, flexShrink: 0 }}>{formatThreadTime(meta.time)}</span>
                      </div>
                      <p style={{ margin: "2px 0 0", color: t3, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.subtitle}</p>
                      <p style={{ margin: "2px 0 0", color: t3, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.preview}</p>
                    </div>
                    {meta.unread ? (
                      <span style={{ minWidth: 18, height: 18, borderRadius: 999, background: "var(--p)", color: "#fff", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, padding: "0 4px", flexShrink: 0 }}>
                        {meta.unread > 9 ? "9+" : meta.unread}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            {!conversationItems.filter((item) => item.type === peerTab).length ? (
              <p style={{ color: t3, fontSize: 12, margin: "8px 6px" }}>No conversations available in this tab.</p>
            ) : null}
          </div>
        </section>
        )}

        {(!isPhone || mobileView === "chat") && (
        <section style={{ flex: 1, minWidth: 0, maxWidth: isPhone ? "100%" : 860, border: panelBorder, borderRadius: 16, background: panelBg, boxShadow: panelShadow, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${b1}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              {isPhone ? (
                <button
                  type="button"
                  onClick={() => setMobileView("list")}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    border: `1px solid ${b1}`,
                    background: "var(--s1)",
                    display: "grid",
                    placeItems: "center",
                    color: t1,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={17} />
                </button>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--s2)", border: `1px solid ${b1}`, display: "grid", placeItems: "center", color: "var(--p)", flexShrink: 0 }}>
                  {activePeer?.name ? <span style={{ fontSize: 12, fontWeight: 700 }}>{peerInitials(activePeer.name, peerTab === "doctor" ? "DR" : "PH")}</span> : <UserRound size={16} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, color: t1, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activePeer?.name || "Select a conversation"}</p>
                  <p style={{ margin: "1px 0 0", color: t3, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {peerTab === "doctor" && activePeer?.careLabel ? activePeer.careLabel : activePeer?.pharmacy_name || (peerTab === "doctor" ? "Doctor" : "Pharmacist")}
                  </p>
                  {activePeer?.id ? (
                    <p style={{ margin: "1px 0 0", color: onlineUsers[activePeer.id] ? "#16a34a" : t3, fontSize: 10, fontWeight: 600 }}>
                      {onlineUsers[activePeer.id] ? "Online now" : "Offline"}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {peerTab === "doctor" && activePeer?.id ? (
                <button
                  type="button"
                  onClick={openVideoVisit}
                  title={videoJoinHint}
                  disabled={!videoActionEnabled}
                  style={{
                    width: isPhone ? 44 : 40,
                    height: isPhone ? 44 : 40,
                    borderRadius: 10,
                    border: `1px solid ${videoWindowState === "doctor_started" ? "rgba(16,185,129,.35)" : b1}`,
                    background: videoWindowState === "doctor_started" ? "rgba(16,185,129,.12)" : (isCheckedInWaiting ? "rgba(37,99,235,.12)" : "var(--s1)"),
                    color: videoWindowState === "doctor_started" ? "#059669" : "var(--p)",
                    display: "grid",
                    placeItems: "center",
                    cursor: videoActionEnabled ? "pointer" : "not-allowed",
                    opacity: videoActionEnabled ? 1 : 0.5,
                    flexShrink: 0,
                  }}
                  aria-label={
                    videoWindowState === "doctor_started"
                      ? hasCheckedIntoWaitingRoom
                        ? "Join video visit"
                        : "Finish check-in before joining"
                      : "Video visit (check in)"
                  }
                >
                  <Video size={18} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowSoundSettings((p) => !p)}
                title={ptSound.enabled ? "Message sounds on" : "Message sounds off"}
                style={{
                  width: isPhone ? 44 : 40,
                  height: isPhone ? 44 : 40,
                  borderRadius: 10,
                  border: `1px solid ${b1}`,
                  background: showSoundSettings ? "rgba(37,99,235,.12)" : "var(--s1)",
                  color: ptSound.enabled ? "var(--p)" : t3,
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                aria-expanded={showSoundSettings}
                aria-label="Message notification sounds"
              >
                {ptSound.enabled ? <Bell size={18} /> : <BellOff size={18} />}
              </button>
            </div>
          </div>
          {peerTab === "doctor" && activePeer?.id && activeDoctorVideoWindow?.window && videoWindowState !== "ended" ? (
            <div
              style={{
                padding: "10px 12px",
                borderBottom: `1px solid ${b1}`,
                background: videoWindowState === "doctor_started" ? "rgba(16,185,129,.1)" : "var(--s2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <p style={{ margin: 0, fontSize: 12.5, color: t1, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <ShieldCheck size={14} color={videoWindowState === "doctor_started" ? "#059669" : "var(--p)"} />
                  Waiting room for{" "}
                  {new Date(activeDoctorVideoWindow.window.startMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    borderRadius: 99,
                    padding: "3px 8px",
                    background: videoWindowState === "doctor_started" ? "rgba(16,185,129,.18)" : "rgba(37,99,235,.1)",
                    color: videoWindowState === "doctor_started" ? "#047857" : "var(--p)",
                    border: `1px solid ${videoWindowState === "doctor_started" ? "rgba(16,185,129,.35)" : "rgba(37,99,235,.25)"}`,
                  }}
                >
                  {videoWindowState === "doctor_started" ? "Doctor ready" : "Waiting room"}
                </span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: t3, lineHeight: 1.45 }}>
                {videoWindowState === "doctor_started"
                  ? "Your doctor has joined. Join video chat."
                  : videoWindowState === "waiting"
                    ? (isCheckedInWaiting ? "Checked in. Waiting for doctor to start the video." : "Tap the video button once to check in to the waiting room.")
                    : videoWindowState === "too_early"
                      ? `Waiting room opens at ${new Date(activeDoctorVideoWindow.window.windowStartMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
                      : "Appointment window expired."}
              </p>
            </div>
          ) : null}
          {showSoundSettings ? (
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${b1}`, background: "var(--s2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ color: t1, fontSize: 12, fontWeight: 700 }}>New message sounds</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: ptSound.enabled ? "#16a34a" : t3, fontSize: 11, fontWeight: 600 }}>{ptSound.enabled ? "On" : "Off"}</span>
                  <div
                    className={`sw ${ptSound.enabled ? "on" : ""}`}
                    onClick={() => setPtSound(savePatientMessagingSoundSettings({ enabled: !ptSound.enabled }))}
                    role="switch"
                    aria-checked={ptSound.enabled}
                    style={{ cursor: "pointer" }}
                  />
                </div>
              </div>
              {ptSound.enabled ? (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {Object.entries(PATIENT_MESSAGING_SOUND_PRESETS).map(([key, prof]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          const next = savePatientMessagingSoundSettings({ preset: key });
                          setPtSound(next);
                          void playPatientMessagingSound(key, next.volume, { fromUserGesture: true });
                        }}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 99,
                          fontSize: 10.5,
                          fontWeight: 600,
                          border: `1.5px solid ${ptSound.preset === key ? "var(--p)" : b1}`,
                          background: ptSound.preset === key ? "rgba(37,99,235,.1)" : "transparent",
                          color: ptSound.preset === key ? "var(--p)" : t3,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                        title={prof.desc}
                      >
                        {prof.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Volume1 size={13} color={t3} style={{ flexShrink: 0 }} />
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={ptSound.volume}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setPtSound(savePatientMessagingSoundSettings({ volume: v }));
                        void playPatientMessagingSound(ptSound.preset, v, { fromUserGesture: true });
                      }}
                      style={{ flex: 1, accentColor: "var(--p)", cursor: "pointer" }}
                    />
                    <Volume2 size={13} color={t3} style={{ flexShrink: 0 }} />
                    <span style={{ color: t3, fontSize: 10, flexShrink: 0, minWidth: 32 }}>{Math.round(ptSound.volume * 100)}%</span>
                  </div>
                  {PATIENT_MESSAGING_SOUND_PRESETS[ptSound.preset] ? (
                    <p style={{ color: t3, fontSize: 10, margin: "8px 0 0", fontStyle: "italic" }}>{PATIENT_MESSAGING_SOUND_PRESETS[ptSound.preset].desc}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "6px 12px 10px", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}>
            {!activePeer?.id ? (
              <p style={{ color: t3, fontSize: 13, textAlign: "center", padding: 24 }}>Select a conversation to view messages.</p>
            ) : threadLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                <Loader2 size={20} className="auth-spin" style={{ color: "var(--p)" }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 14, minHeight: "100%", maxWidth: 860, width: "100%", margin: "0 auto" }}>
                {messages.map((m, idx) => {
                  const mine = m.sender_id === userId;
                  const bodyText = (m.body || "").trim();
                  const proto = getProtocolChatDisplay(bodyText, { role: "patient", isMine: mine });
                  if (proto.kind === "video_started_invite" && proto.joinUrl) {
                    const prev = messages[idx - 1];
                    if (prev && String(prev.body || "") === String(m.body || "")) return null;
                    const showDayBreak = !prev || !sameDay(prev.created_at, m.created_at);
                    const msgDate = new Date(m.created_at);
                    const isToday = msgDate.toDateString() === new Date().toDateString();
                    const startedParsed = parseVideoApprovalMessageBody(m.body || "");
                    const latestEventTypeForWindow = latestVideoRoomEventTypeSince(messages, m.sender_id, startedParsed, m.created_at);
                    const inviteJoinEnabled =
                      !!startedParsed &&
                      startedParsed.eventType === "started" &&
                      latestEventTypeForWindow !== "ended";
                    const inviteHint = latestEventTypeForWindow === "ended" ? "This video session has ended." : "";
                    return (
                      <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
                        {showDayBreak ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
                            <span style={{ height: 1, background: b1, flex: 1 }} />
                            <span style={{ fontSize: 11, color: t3, fontWeight: 600 }}>{isToday ? "Today" : msgDate.toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                            <span style={{ height: 1, background: b1, flex: 1 }} />
                          </div>
                        ) : null}
                        <div style={{ display: "flex", justifyContent: "flex-start" }}>
                          <motion.div
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{ width: "fit-content", maxWidth: isMob ? "90%" : "72%", display: "flex", flexDirection: "column" }}
                          >
                            <div
                              style={{
                                padding: "12px 14px",
                                borderRadius: "14px 14px 14px 4px",
                                background: "rgba(16,185,129,.14)",
                                border: "1px solid rgba(16,185,129,.38)",
                                color: t1,
                                boxShadow: "0 1px 3px rgba(15,23,42,.08)",
                              }}
                            >
                              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#047857", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <Video size={17} color="#059669" />
                                Your doctor joined the video visit
                              </p>
                              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: t3, lineHeight: 1.45 }}>
                                {inviteJoinEnabled
                                  ? "Tap below to open the secure video room."
                                  : inviteHint || "Join is unavailable for this invitation."}
                              </p>
                              {inviteJoinEnabled ? (
                                <a
                                  href={proto.joinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    marginTop: 12,
                                    padding: "8px 14px",
                                    borderRadius: 10,
                                    background: "#059669",
                                    color: "#fff",
                                    fontWeight: 700,
                                    fontSize: 13,
                                    textDecoration: "none",
                                    fontFamily: "inherit",
                                  }}
                                >
                                  Join video visit
                                </a>
                              ) : (
                                <div
                                  style={{
                                    marginTop: 12,
                                    padding: "8px 14px",
                                    borderRadius: 10,
                                    border: `1px solid ${b1}`,
                                    background: "var(--s1)",
                                    color: t3,
                                    fontSize: 12.5,
                                    fontWeight: 600,
                                  }}
                                >
                                  {inviteHint ? "Call ended" : "Join unavailable"}
                                </div>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 6, marginTop: 4, paddingLeft: 4, paddingRight: 4 }}>
                              <span style={{ fontSize: 10, color: t3 }}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          </motion.div>
                        </div>
                      </div>
                    );
                  }
                  if (proto.kind === "hidden") return null;
                  const textToShow = proto.line;
                  const attUrl = m?.attachment_url ? String(m.attachment_url).trim() : "";
                  const pendingUp = m._pendingUpload === true;
                  const isImg = !!(attUrl && (m.attachment_mime || "").startsWith("image/"));
                  const showBubble = !!(attUrl || (textToShow && String(textToShow).trim()) || (pendingUp && m.attachment_name));
                  const prev = messages[idx - 1];
                  const showDayBreak = !prev || !sameDay(prev.created_at, m.created_at);
                  const msgDate = new Date(m.created_at);
                  const isToday = msgDate.toDateString() === new Date().toDateString();
                  return (
                    <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
                      {showDayBreak ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
                          <span style={{ height: 1, background: b1, flex: 1 }} />
                          <span style={{ fontSize: 11, color: t3, fontWeight: 600 }}>{isToday ? "Today" : msgDate.toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                          <span style={{ height: 1, background: b1, flex: 1 }} />
                        </div>
                      ) : null}
                      <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                        <motion.div
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={{
                            width: "fit-content",
                            maxWidth: isMob ? "90%" : "72%",
                            display: "flex",
                            flexDirection: "column",
                          }}
                        >
                        {showBubble && (
                        <div
                          style={{
                            padding: "9px 12px",
                            borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                            background: mine ? "linear-gradient(135deg,#2f6cf6,#2563eb)" : "var(--s2)",
                            color: mine ? "#fff" : t1,
                            border: mine ? "none" : `1px solid ${b1}`,
                            fontSize: 13,
                            lineHeight: 1.4,
                            whiteSpace: "pre-wrap",
                            boxShadow: "0 1px 3px rgba(15,23,42,.08)",
                            position: "relative",
                          }}
                        >
                          {attUrl && isImg && (
                            pendingUp ? (
                              <div style={{ display: "block", marginBottom: bodyText ? 8 : 0, lineHeight: 0, borderRadius: 10, overflow: "hidden", position: "relative" }}>
                                <img
                                  src={attUrl}
                                  alt={m.attachment_name || ""}
                                  style={{ maxWidth: "100%", maxHeight: 220, width: "auto", height: "auto", display: "block", objectFit: "cover" }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    right: 8,
                                    bottom: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "4px 8px",
                                    borderRadius: 8,
                                    background: "rgba(15,23,42,.72)",
                                    color: "#fff",
                                    fontSize: 10,
                                    fontWeight: 600,
                                  }}
                                >
                                  <Loader2 size={12} className="auth-spin" />
                                  Sending
                                </div>
                              </div>
                            ) : (
                              <a href={attUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: bodyText ? 8 : 0, lineHeight: 0, borderRadius: 10, overflow: "hidden" }}>
                                <img
                                  src={attUrl}
                                  alt={m.attachment_name || ""}
                                  style={{ maxWidth: "100%", maxHeight: 220, width: "auto", height: "auto", display: "block", objectFit: "cover" }}
                                />
                              </a>
                            )
                          )}
                          {pendingUp && !isImg && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                marginBottom: bodyText ? 8 : 0,
                                color: mine ? "rgba(255,255,255,.95)" : "var(--p)",
                                fontWeight: 600,
                                fontSize: 12,
                                maxWidth: "100%",
                              }}
                            >
                              <FileText size={14} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{m.attachment_name || "File"}</span>
                              <Loader2 size={14} className="auth-spin" style={{ flexShrink: 0 }} />
                            </span>
                          )}
                          {attUrl && !isImg && !pendingUp && (
                            <a
                              href={attUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                marginBottom: bodyText ? 8 : 0,
                                color: mine ? "rgba(255,255,255,.95)" : "var(--p)",
                                fontWeight: 600,
                                fontSize: 12,
                                textDecoration: "none",
                                wordBreak: "break-all",
                                maxWidth: "100%",
                              }}
                            >
                              <FileText size={14} />
                              {m.attachment_name || "View attachment"}
                            </a>
                          )}
                          {String(textToShow || "").trim() ? (
                            <p
                              style={{
                                margin: 0,
                                paddingTop:
                                  pendingUp && m.attachment_name
                                    ? 8
                                    : attUrl
                                      ? 8
                                      : 0,
                                color: mine ? "#fff" : t1,
                                fontSize: 13,
                                lineHeight: 1.4,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {textToShow}
                            </p>
                          ) : null}
                        </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: mine ? "flex-end" : "flex-start", gap: 6, marginTop: 4, paddingLeft: 4, paddingRight: 4 }}>
                          <span style={{ fontSize: 10, color: t3 }}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {mine ? (
                            m.read_at ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }} title="Read">
                                <CheckCheck size={14} color="#7dd3fc" strokeWidth={2.5} />
                              </span>
                            ) : (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }} title="Sent">
                                <Check size={14} color="rgba(255,255,255,0.65)" strokeWidth={2} />
                              </span>
                            )
                          ) : null}
                        </div>
                        </motion.div>
                      </div>
                    </div>
                  );
                })}
                {peerTyping && (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, alignSelf: "flex-start", maxWidth: isMob ? "90%" : "72%" }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg,#0e7490,#155e75)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>{peerInitials(activePeer?.name, "DR")}</span>
                    </div>
                    <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "var(--s2)", border: `1px solid ${b1}`, display: "flex", alignItems: "center", gap: 5 }}>
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: t3,
                            display: "inline-block",
                            animation: `typingDot 1.2s ${d * 0.2}s infinite ease-in-out`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ padding: isPhone ? "6px 10px calc(12px + env(safe-area-inset-bottom, 0px))" : "6px 10px 8px", borderTop: `1px solid ${b1}`, background: "var(--s1)", flexShrink: 0, position: isPhone ? "sticky" : "static", bottom: 0, zIndex: 2 }}>
            {suggestion && !suggestionDismissed ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(124,58,237,.08)",
                  border: "1px solid rgba(124,58,237,.22)",
                  marginBottom: 10,
                }}
              >
                <p style={{ flex: 1, margin: 0, fontSize: 12, color: t1, lineHeight: 1.5 }}>{suggestion.text}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setPeerTab(suggestion.switchTo);
                      setSuggestionDismissed(true);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "none",
                      background: "var(--p)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Switch to {suggestion.switchTo === "doctor" ? "doctor" : "pharmacist"} <ArrowRight size={12} />
                  </button>
                  <button type="button" onClick={() => setSuggestionDismissed(true)} style={{ border: "none", background: "transparent", color: t3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 6, maxWidth: 860, width: "100%", margin: "0 auto", alignItems: "center", background: "var(--s2)", border: `1px solid ${b1}`, borderRadius: 12, padding: isPhone ? 6 : 4 }}>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) sendAttachmentFile(f);
                  else if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (!uploading) setUploadErr(null);
                  if (!activePeer?.id) {
                    setUploadErr({
                      title: "We couldn’t upload your file",
                      hint: "Choose a doctor or pharmacist to message first—then you can attach a file.",
                    });
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                disabled={uploading}
                style={{
                  width: isPhone ? 44 : 34,
                  height: isPhone ? 44 : 34,
                  borderRadius: 9,
                  border: `1px solid ${b1}`,
                  background: "var(--s1)",
                  color: t3,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  cursor: uploading ? "not-allowed" : "pointer",
                  opacity: uploading ? 0.5 : !activePeer?.id ? 0.65 : 1,
                }}
                title={
                  uploading
                    ? "Upload in progress…"
                    : !activePeer?.id
                      ? "Choose who to message first"
                      : "Attach a file"
                }
                aria-label="Attach file"
              >
                {uploading ? <Loader2 size={16} className="auth-spin" style={{ color: "var(--p)" }} /> : <Paperclip size={16} />}
              </button>
              <textarea
                className="inp"
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (uploadErr) setUploadErr(null);
                  emitTyping();
                }}
                placeholder="Type your message..."
                style={{ flex: 1, resize: "none", borderRadius: 10, fontSize: isPhone ? 16 : 13, padding: isPhone ? "8px 10px" : "6px 8px", border: "none", background: "transparent", boxShadow: "none", minHeight: isPhone ? 24 : 18, maxHeight: isPhone ? 98 : 74 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !input.trim() || !activePeer?.id}
                style={{
                  width: isPhone ? 44 : 34,
                  height: isPhone ? 44 : 34,
                  borderRadius: 9,
                  border: "none",
                  background: "var(--p)",
                  color: "#fff",
                  cursor: sending ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  opacity: !activePeer?.id ? 0.45 : 1,
                }}
              >
                {sending ? <Loader2 size={14} style={{ animation: "spin360 .7s linear infinite" }} /> : <Send size={14} />}
              </button>
            </div>
            {uploadErr ? (
              <div
                role="alert"
                style={{
                  margin: "10px auto 0",
                  maxWidth: 860,
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "var(--s2)",
                  border: `1px solid ${b1}`,
                  boxSizing: "border-box",
                }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t1 }}>{uploadErr.title}</p>
                {uploadErr.hint ? (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: t3, lineHeight: 1.5 }}>{uploadErr.hint}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setUploadErr(null)}
                  style={{
                    marginTop: 10,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${b1}`,
                    background: "var(--s1)",
                    color: t1,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  OK
                </button>
              </div>
            ) : null}
          </div>
        </section>
        )}
      </div>

      <VirtualPreVisitModal
        open={videoPreVisitOpen && !!userId && peerTab === "doctor"}
        onClose={() => setVideoPreVisitOpen(false)}
        userId={userId}
        initialProfile={patientProfile ?? FALLBACK_VISIT_PROFILE}
        apptSummary={
          activeDoctorVideoWindow?.appt
            ? `${new Date(`${activeDoctorVideoWindow.appt.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} virtual visit`
            : ""
        }
        onSaved={async (updated) => {
          if (!isVirtualVisitCheckInComplete(updated)) {
            throw new Error("Please complete every required field before entering the waiting room.");
          }
          setPatientProfile(updated);
          const dn = formatProfileFullName(updated);
          if (dn) setDisplayName(dn);
          performWaitingRoomCheckin();
        }}
      />

      {(!isPhone || mobileView === "list") && <div
        style={{
          border: panelBorder,
          borderRadius: 14,
          background: "var(--s1)",
          boxShadow: panelShadow,
          padding: "14px 14px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 10,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <ShieldCheck size={92} color="var(--p)" style={{ position: "absolute", right: 14, bottom: -18, opacity: 0.1 }} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--pd)", border: "1px solid rgba(37,99,235,.18)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <ShieldCheck size={16} color="var(--p)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, color: t1, fontSize: 13 }}>Message securely</p>
            <p style={{ margin: "2px 0 0", color: t3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Your messages are encrypted and private. Your care team will respond as soon as possible.
            </p>
          </div>
        </div>
      </div>}
    </div>
  );
}
