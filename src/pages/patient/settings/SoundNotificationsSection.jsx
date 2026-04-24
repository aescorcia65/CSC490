import { useState, useEffect, useCallback } from "react";
import { Volume2, Play, Bell } from "lucide-react";
import {
  loadMessageNotifSettings,
  saveMessageNotifSettings,
  SOUND_OPTIONS,
  playMessageNotificationSound,
  ensureMessageNotifAudioUnlocked,
} from "../../../lib/messageNotificationSettings";

function ToggleRow({ label, sub, on, onToggle }) {
  const t1 = "var(--t1)", t3 = "var(--t3)";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--b0)" }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ color: t1, fontSize: 13, fontWeight: 600, margin: 0 }}>{label}</p>
        {sub ? <p style={{ color: t3, fontSize: 11, margin: "4px 0 0", lineHeight: 1.45 }}>{sub}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onToggle(!on)}
        className={`sw ${on ? "on" : ""}`}
        style={{ flexShrink: 0 }}
      />
    </div>
  );
}

export default function SoundNotificationsSection() {
  const t1 = "var(--t1)", t3 = "var(--t3)";
  const [s, setS] = useState(() => loadMessageNotifSettings());

  useEffect(() => {
    const fn = (e) => {
      if (e?.detail) setS(e.detail);
      else setS(loadMessageNotifSettings());
    };
    window.addEventListener("mt-message-notif-settings", fn);
    return () => window.removeEventListener("mt-message-notif-settings", fn);
  }, []);

  const patch = useCallback((partial) => {
    const next = saveMessageNotifSettings(partial);
    setS(next);
  }, []);

  const preview = useCallback(
    async (soundId) => {
      await ensureMessageNotifAudioUnlocked();
      await playMessageNotificationSound(soundId ?? s.soundId, s.volume);
    },
    [s.soundId, s.volume]
  );

  return (
    <div style={{ padding: "16px 18px 20px", borderTop: "1px solid var(--b0)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(37,99,235,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Volume2 size={17} color="var(--p)" />
        </div>
        <div>
          <p style={{ color: t1, fontSize: 13, fontWeight: 700, margin: 0 }}>Sounds & alerts</p>
          <p style={{ color: t3, fontSize: 12, margin: "4px 0 0", lineHeight: 1.5 }}>Message tones and reminder alerts play in the app when new activity arrives.</p>
        </div>
      </div>

      <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--b0)", background: "var(--s2)", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: t1, fontSize: 13, fontWeight: 600 }}>All sounds</span>
          <button type="button" role="switch" aria-checked={s.masterEnabled} onClick={() => patch({ masterEnabled: !s.masterEnabled })} className={`sw ${s.masterEnabled ? "on" : ""}`} />
        </div>
        <p style={{ color: t3, fontSize: 11, margin: 0, lineHeight: 1.45 }}>Master switch for in-app notification sounds.</p>
      </div>

      <label className="lbl" style={{ marginBottom: 8 }}>Sound</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {SOUND_OPTIONS.map((opt) => (
          <div
            key={opt.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${s.soundId === opt.id ? "var(--p)" : "var(--b0)"}`,
              background: s.soundId === opt.id ? "var(--pd)" : "var(--s2)",
            }}
          >
            <button
              type="button"
              onClick={() => patch({ soundId: opt.id })}
              style={{
                flex: 1,
                textAlign: "left",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                padding: 0,
              }}
            >
              <span style={{ color: t1, fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
            </button>
            <button
              type="button"
              onClick={() => preview(opt.id)}
              title="Preview"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid var(--b1)",
                background: "var(--s1)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--p)",
                flexShrink: 0,
              }}
            >
              <Play size={16} />
            </button>
          </div>
        ))}
      </div>

      <label className="lbl" style={{ marginBottom: 8 }}>Volume</label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(s.volume * 100)}
          onChange={(e) => patch({ volume: Number(e.target.value) / 100 })}
          onMouseUp={() => preview()}
          onTouchEnd={() => preview()}
          style={{ flex: 1, accentColor: "var(--p)" }}
        />
        <span style={{ color: t1, fontSize: 12, fontWeight: 700, width: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(s.volume * 100)}%</span>
      </div>

      <p style={{ color: t3, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: "0 0 10px" }}>Notification types</p>
      <div style={{ borderRadius: 12, border: "1px solid var(--b0)", overflow: "hidden", padding: "0 14px", background: "var(--s2)" }}>
        <ToggleRow
          label="Messages from doctor"
          sub="When your doctor sends a chat message"
          on={s.notifyDoctorMessage}
          onToggle={(v) => patch({ notifyDoctorMessage: v })}
        />
        <ToggleRow
          label="Messages from pharmacist"
          sub="When your pharmacist sends a chat message"
          on={s.notifyPharmacistMessage}
          onToggle={(v) => patch({ notifyPharmacistMessage: v })}
        />
        <ToggleRow
          label="Appointment reminders"
          sub="Alerts about visits and scheduling"
          on={s.notifyAppointment}
          onToggle={(v) => patch({ notifyAppointment: v })}
        />
        <ToggleRow
          label="Medication reminders"
          sub="Dose, refill, and prescription alerts"
          on={s.notifyMedication}
          onToggle={(v) => patch({ notifyMedication: v })}
        />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "var(--pd)", border: "1px solid rgba(37,99,235,.15)" }}>
        <Bell size={15} color="var(--p)" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ color: t3, fontSize: 11, lineHeight: 1.55, margin: 0 }}>
          Sounds play in the browser when the app is open. Allow audio in your browser if you don’t hear previews.
        </p>
      </div>
    </div>
  );
}
