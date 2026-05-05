import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../../supabase";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2 } from "lucide-react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.services.mozilla.com" },
  ],
};

/**
 * Full-screen WebRTC video call overlay tied to a single appointment_id.
 *
 * Props:
 *   appointmentId  string          – DB appointment row id
 *   userId         string          – current user's auth UID
 *   peerId         string          – the other participant's UID (patient ID when role="doctor")
 *   role           "doctor"|"patient"
 *   onEnd          () => void
 */
export default function VideoCallPanel({ appointmentId, userId, peerId, role, onEnd }) {
  const [callStatus, setCallStatus] = useState("connecting");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState("");

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef          = useRef(null);
  const localStreamRef = useRef(null);
  const endedRef       = useRef(false);
  const channelRef     = useRef(null);
  // ICE candidates that arrive before remoteDescription is ready are queued here
  const pendingIce     = useRef([]);

  /* ── helpers ─────────────────────────────────────────────────────────────── */

  const cleanup = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current).catch(() => {});
      channelRef.current = null;
    }
    pendingIce.current = [];
  }, []);

  /** Drain the pending ICE queue after remoteDescription has been set. */
  async function flushPendingIce(pc) {
    for (const ice of pendingIce.current) {
      try { await pc.addIceCandidate(ice); } catch {}
    }
    pendingIce.current = [];
  }

  /** Insert a signal row and surface the error to the user if the table is missing. */
  async function insertSignal(type, payload) {
    const { error: err } = await supabase.from("video_signals").insert({
      appointment_id: appointmentId,
      sender_id: userId,
      type,
      payload,
    });
    if (err) {
      const msg = err.message || String(err);
      // Table not created → give the user actionable guidance
      if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("42P01")) {
        throw new Error("Setup needed: run the video_signals SQL in Supabase first, then retry.");
      }
      throw new Error(`Signal error: ${msg}`);
    }
  }

  const endCall = useCallback(async () => {
    cleanup();
    try {
      await Promise.all([
        supabase
          .from("appointments")
          .update({ virtual_visit_status: "call_ended" })
          .eq("id", appointmentId),
        supabase.from("video_signals").insert({
          appointment_id: appointmentId,
          sender_id: userId,
          type: "end",
          payload: {},
        }),
      ]);
    } catch (e) {
      console.warn("endCall cleanup:", e?.message);
    }
    setCallStatus("ended");
    setTimeout(() => onEnd?.(), 900);
  }, [appointmentId, userId, cleanup, onEnd]);

  /* ── main setup effect ───────────────────────────────────────────────────── */

  useEffect(() => {
    let mounted = true;
    endedRef.current = false;
    pendingIce.current = [];

    async function start() {
      // 1. Local media — try video+audio first, fall back to audio-only
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        // Camera may be in use by another tab or blocked — try audio-only
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          if (mounted) setError("Camera not available (may be in use by another tab). Connected with audio only.");
        } catch {
          // Both denied — guide user to fix browser permissions
          if (mounted) setError(
            "Microphone access denied.\n\n" +
            "To fix:\n" +
            "1. Click the 🔒 lock icon in your browser address bar\n" +
            "2. Set Camera and Microphone to Allow\n" +
            "3. Refresh the page and try again"
          );
          return;
        }
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // 2. RTCPeerConnection
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const remoteStream = new MediaStream();
      pc.ontrack = (e) => {
        e.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      };

      pc.onconnectionstatechange = () => {
        if (!mounted) return;
        if (pc.connectionState === "connected") setCallStatus("active");
        if (pc.connectionState === "failed" && !endedRef.current)
          setError("Connection failed. Both devices must allow camera/mic and be on a reachable network.");
      };

      // 3. Send ICE candidates as they're gathered
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate || endedRef.current) return;
        supabase.from("video_signals").insert({
          appointment_id: appointmentId,
          sender_id: userId,
          type: "ice-candidate",
          payload: { candidate: candidate.toJSON() },
        }).catch(() => {});
      };

      // 4. Realtime subscription — channel name is unique per effect run so
      //    React Strict Mode double-invoke never collides on an already-subscribed channel.
      const chName = `vsig-${appointmentId}-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ch = supabase
        .channel(chName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "video_signals" },
          async (payload) => {
            if (!mounted || endedRef.current || !pcRef.current) return;
            const sig = payload.new;
            // Only handle signals for our appointment and not our own
            if (sig.appointment_id !== appointmentId) return;
            if (sig.sender_id === userId) return;
            try {
              if (sig.type === "answer" && role === "doctor") {
                if (pcRef.current.signalingState === "have-local-offer") {
                  await pcRef.current.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp));
                  await flushPendingIce(pcRef.current);
                }

              } else if (sig.type === "offer" && role === "patient") {
                if (pcRef.current.signalingState === "stable") {
                  await pcRef.current.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp));
                  await flushPendingIce(pcRef.current);
                  const answer = await pcRef.current.createAnswer();
                  await pcRef.current.setLocalDescription(answer);
                  await insertSignal("answer", { sdp: answer });
                }

              } else if (sig.type === "ice-candidate") {
                const ice = new RTCIceCandidate(sig.payload.candidate);
                if (pcRef.current.remoteDescription) {
                  await pcRef.current.addIceCandidate(ice);
                } else {
                  // Queue until remoteDescription is ready
                  pendingIce.current.push(ice);
                }

              } else if (sig.type === "end") {
                if (mounted && !endedRef.current) {
                  cleanup();
                  setCallStatus("ended");
                  setTimeout(() => onEnd?.(), 900);
                }
              }
            } catch (err) {
              console.warn("Signal handler:", err?.message);
            }
          },
        )
        .subscribe();
      channelRef.current = ch;

      // 5a. Doctor: create offer
      if (role === "doctor") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Mark appointment as call_started so patient sees "Join Call"
        const { error: apptErr } = await supabase
          .from("appointments")
          .update({ virtual_visit_status: "call_started" })
          .eq("id", appointmentId);
        if (apptErr) {
          console.error("Failed to set call_started:", apptErr.message);
          if (mounted) setError(`Could not start call: ${apptErr.message}`);
          return;
        }

        // Notify patient via notification bell + chat message
        if (peerId) {
          await Promise.allSettled([
            supabase.from("notifications").insert({
              user_id: peerId,
              type: "general",
              title: "Your doctor has started the call",
              body: "Join your virtual visit now from Appointments → Virtual.",
            }),
            supabase.from("patient_messages").insert({
              sender_id: userId,
              recipient_id: peerId,
              body: "📞 Your virtual visit is starting now. Please join the call from your Appointments page (Visits → Virtual tab).",
            }),
          ]);
        }

        // Insert offer (this will throw a clear error if the SQL table wasn't created)
        await insertSignal("offer", { sdp: offer });

        if (mounted) setCallStatus("waiting");

      // 5b. Patient: fetch offer → answer
      } else {
        const { data: offerRows, error: fetchErr } = await supabase
          .from("video_signals")
          .select("*")
          .eq("appointment_id", appointmentId)
          .eq("type", "offer")
          .order("created_at", { ascending: false })
          .limit(1);

        if (fetchErr) {
          const msg = fetchErr.message || "";
          if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("42P01")) {
            throw new Error("Setup needed: run the video_signals SQL in Supabase first.");
          }
          throw new Error(`Could not load call: ${msg}`);
        }

        if (!offerRows?.length) {
          if (mounted) setError("No active call found. Ask the doctor to click Start Call first.");
          return;
        }

        if (pc.signalingState === "stable") {
          await pc.setRemoteDescription(new RTCSessionDescription(offerRows[0].payload.sdp));
          // Apply any ICE candidates already stored before we joined
          await flushPendingIce(pc);

          const { data: priorIce } = await supabase
            .from("video_signals")
            .select("*")
            .eq("appointment_id", appointmentId)
            .eq("type", "ice-candidate")
            .neq("sender_id", userId)
            .order("created_at", { ascending: true });

          for (const s of priorIce || []) {
            try { await pc.addIceCandidate(new RTCIceCandidate(s.payload.candidate)); } catch {}
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await insertSignal("answer", { sdp: answer });
        }

        if (mounted) setCallStatus("connecting");
      }
    }

    start().catch((err) => {
      if (mounted) setError(err?.message || "Failed to start call.");
    });

    return () => {
      mounted = false;
      cleanup();
    };
  }, [appointmentId, userId, role]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── controls ────────────────────────────────────────────────────────────── */

  const toggleMute = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMuted(!t.enabled);
  };

  const toggleCamera = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCameraOff(!t.enabled);
  };

  /* ── render ──────────────────────────────────────────────────────────────── */

  if (callStatus === "ended") {
    return (
      <div style={overlayStyle}>
        <div style={{ textAlign: "center", color: "#fff", padding: "0 20px" }}>
          <PhoneOff size={44} color="#f87171" style={{ margin: "0 auto 14px", display: "block" }} />
          <p style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>Call Ended</p>
          <p style={{ color: "rgba(255,255,255,.55)", fontSize: 14 }}>You may close this window.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      {/* Video area */}
      <div style={{ position: "relative", width: "min(880px,96vw)", aspectRatio: "16/9", background: "#111", borderRadius: 16, overflow: "hidden", flexShrink: 0 }}>
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />

        {callStatus === "waiting" && (
          <div style={centerOverlay}>
            <Loader2 size={36} style={{ animation: "spin360 .7s linear infinite", marginBottom: 12 }} />
            <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Waiting for patient to join…</p>
          </div>
        )}
        {callStatus === "connecting" && (
          <div style={centerOverlay}>
            <Loader2 size={28} style={{ animation: "spin360 .7s linear infinite" }} />
            <p style={{ fontSize: 13, margin: "8px 0 0", color: "rgba(255,255,255,.7)" }}>Connecting…</p>
          </div>
        )}

        {/* Local PiP */}
        <video
          ref={localVideoRef}
          autoPlay muted playsInline
          style={{ position: "absolute", bottom: 12, right: 12, width: 160, height: 90, objectFit: "cover", borderRadius: 10, border: "2px solid rgba(255,255,255,.22)", background: "#222" }}
        />
      </div>

      {/* Status */}
      <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: callStatus === "active" ? "#22c55e" : "#94a3b8" }}>
        {callStatus === "active" ? "● Connected" : callStatus === "waiting" ? "● Waiting for patient…" : "● Connecting…"}
      </p>

      {error && (
        <div style={{ marginTop: 8, padding: "12px 18px", borderRadius: 10, background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.4)", maxWidth: 480, textAlign: "center" }}>
          <p style={{ color: "#f87171", fontSize: 13, margin: 0, whiteSpace: "pre-line", lineHeight: 1.6 }}>{error}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
            <button onClick={() => setError("")} style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(239,68,68,.5)", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Dismiss
            </button>
            <button onClick={() => onEnd?.()} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "rgba(239,68,68,.3)", color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Leave Call
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <button onClick={toggleMute} title={muted ? "Unmute" : "Mute"} style={btn(muted, "#f59e0b")}>
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button onClick={toggleCamera} title={cameraOff ? "Camera on" : "Camera off"} style={btn(cameraOff, "#f59e0b")}>
          {cameraOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>
        <button onClick={endCall} title="End call" style={btn(false, null, true)}>
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, zIndex: 9999,
  background: "rgba(0,0,0,.92)",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
};

const centerOverlay = {
  position: "absolute", inset: 0,
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  color: "#fff", gap: 4,
};

function btn(active, activeColor, isEnd = false) {
  return {
    width: 54, height: 54, borderRadius: "50%", border: "none",
    background: isEnd ? "#ef4444" : active ? activeColor : "rgba(255,255,255,.18)",
    color: "#fff", display: "grid", placeItems: "center",
    cursor: "pointer", transition: "background .15s",
  };
}
