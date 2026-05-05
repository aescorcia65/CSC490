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
 * Full-screen WebRTC video call overlay.
 * - Doctor (role="doctor"): creates offer, sets appointment status to call_started.
 * - Patient (role="patient"): fetches existing offer, creates answer.
 * - Signaling uses the `video_signals` Supabase table (must be created via SQL before use).
 *
 * Props:
 *   appointmentId  string   — which appointment this call belongs to
 *   userId         string   — current user's auth UID
 *   peerId         string   — the other participant's auth UID (not currently sent but kept for future TURN)
 *   role           "doctor" | "patient"
 *   onEnd          () => void
 */
export default function VideoCallPanel({ appointmentId, userId, peerId, role, onEnd }) {
  const [callStatus, setCallStatus] = useState("connecting"); // connecting | waiting | active | ended
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState("");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const endedRef = useRef(false);
  const channelRef = useRef(null);

  const cleanup = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current).catch(() => {});
      channelRef.current = null;
    }
  }, []);

  const endCall = useCallback(async () => {
    cleanup();
    try {
      await Promise.all([
        supabase
          .from("appointments")
          .update({ virtual_visit_status: "call_ended", updated_at: new Date().toISOString() })
          .eq("id", appointmentId),
        supabase.from("video_signals").insert({
          appointment_id: appointmentId,
          sender_id: userId,
          type: "end",
          payload: {},
        }),
      ]);
    } catch (e) {
      console.warn("VideoCallPanel endCall:", e?.message);
    }
    setCallStatus("ended");
    setTimeout(() => onEnd?.(), 900);
  }, [appointmentId, userId, cleanup, onEnd]);

  useEffect(() => {
    let mounted = true;
    endedRef.current = false;

    async function start() {
      // ── 1. Local media ──────────────────────────────────────────────────────
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        setError("Camera / microphone access denied. Please allow and reload.");
        return;
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // ── 2. Peer connection ──────────────────────────────────────────────────
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
        if (pc.connectionState === "failed" && !endedRef.current) setError("Connection failed. Check your network and try again.");
      };

      // ── 3. ICE → insert into video_signals ─────────────────────────────────
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate || endedRef.current) return;
        supabase.from("video_signals").insert({
          appointment_id: appointmentId,
          sender_id: userId,
          type: "ice-candidate",
          payload: { candidate: candidate.toJSON() },
        }).catch(() => {});
      };

      // ── 4. Subscribe to incoming signals ───────────────────────────────────
      const ch = supabase
        .channel(`vsig-${appointmentId}-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "video_signals", filter: `appointment_id=eq.${appointmentId}` },
          async (payload) => {
            if (!mounted || endedRef.current || !pcRef.current) return;
            const sig = payload.new;
            if (sig.sender_id === userId) return; // skip own signals
            try {
              if (sig.type === "answer" && role === "doctor") {
                if (pcRef.current.signalingState === "have-local-offer") {
                  await pcRef.current.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp));
                }
              } else if (sig.type === "offer" && role === "patient") {
                if (pcRef.current.signalingState === "stable") {
                  await pcRef.current.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp));
                  const answer = await pcRef.current.createAnswer();
                  await pcRef.current.setLocalDescription(answer);
                  await supabase.from("video_signals").insert({
                    appointment_id: appointmentId,
                    sender_id: userId,
                    type: "answer",
                    payload: { sdp: answer },
                  });
                }
              } else if (sig.type === "ice-candidate") {
                if (pcRef.current.remoteDescription) {
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(sig.payload.candidate));
                }
              } else if (sig.type === "end") {
                if (mounted && !endedRef.current) {
                  cleanup();
                  setCallStatus("ended");
                  setTimeout(() => onEnd?.(), 900);
                }
              }
            } catch (err) {
              console.warn("VideoCallPanel signal error:", err?.message);
            }
          },
        )
        .subscribe();
      channelRef.current = ch;

      // ── 5a. Doctor: create offer ────────────────────────────────────────────
      if (role === "doctor") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await supabase
          .from("appointments")
          .update({ virtual_visit_status: "call_started", updated_at: new Date().toISOString() })
          .eq("id", appointmentId);

        await supabase.from("video_signals").insert({
          appointment_id: appointmentId,
          sender_id: userId,
          type: "offer",
          payload: { sdp: offer },
        });

        if (mounted) setCallStatus("waiting");

      // ── 5b. Patient: fetch offer + create answer ────────────────────────────
      } else {
        const { data: offerRows } = await supabase
          .from("video_signals")
          .select("*")
          .eq("appointment_id", appointmentId)
          .eq("type", "offer")
          .order("created_at", { ascending: false })
          .limit(1);

        if (!offerRows?.length) {
          if (mounted) setError("No active call found. Ask the doctor to start and try again.");
          return;
        }

        if (pc.signalingState === "stable") {
          await pc.setRemoteDescription(new RTCSessionDescription(offerRows[0].payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await supabase.from("video_signals").insert({
            appointment_id: appointmentId,
            sender_id: userId,
            type: "answer",
            payload: { sdp: answer },
          });

          // Apply any ICE candidates from the doctor that arrived before we joined
          const { data: iceSigs } = await supabase
            .from("video_signals")
            .select("*")
            .eq("appointment_id", appointmentId)
            .eq("type", "ice-candidate")
            .neq("sender_id", userId)
            .order("created_at", { ascending: true });

          for (const s of iceSigs || []) {
            try { await pc.addIceCandidate(new RTCIceCandidate(s.payload.candidate)); } catch {}
          }
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

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  };

  // ── "Call ended" screen ───────────────────────────────────────────────────
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
      {/* ── Video area ──────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", width: "min(880px,96vw)", aspectRatio: "16/9", background: "#111", borderRadius: 16, overflow: "hidden", flexShrink: 0 }}>
        {/* Remote video (full area) */}
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />

        {/* Waiting / connecting overlays */}
        {callStatus === "waiting" && (
          <div style={centerOverlay}>
            <Loader2 size={36} style={{ animation: "spin360 .7s linear infinite", marginBottom: 12 }} />
            <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Waiting for patient to join…</p>
          </div>
        )}
        {callStatus === "connecting" && (
          <div style={centerOverlay}>
            <Loader2 size={28} style={{ animation: "spin360 .7s linear infinite" }} />
          </div>
        )}

        {/* Local video picture-in-picture */}
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          style={{ position: "absolute", bottom: 12, right: 12, width: 160, height: 90, objectFit: "cover", borderRadius: 10, border: "2px solid rgba(255,255,255,.22)", background: "#222" }}
        />
      </div>

      {/* ── Status badge ────────────────────────────────────────────────────── */}
      <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: callStatus === "active" ? "#22c55e" : "#94a3b8" }}>
        {callStatus === "active" ? "● Connected" : callStatus === "waiting" ? "● Waiting for patient…" : "● Connecting…"}
      </p>
      {error && <p style={{ color: "#f87171", fontSize: 13, margin: "4px 0 0", textAlign: "center", maxWidth: 400 }}>{error}</p>}

      {/* ── Controls ────────────────────────────────────────────────────────── */}
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
  color: "#fff", gap: 8,
};

function btn(active, activeColor, isEnd = false) {
  return {
    width: 54, height: 54, borderRadius: "50%", border: "none",
    background: isEnd ? "#ef4444" : active ? activeColor : "rgba(255,255,255,.18)",
    color: "#fff", display: "grid", placeItems: "center",
    cursor: "pointer", transition: "background .15s",
  };
}
