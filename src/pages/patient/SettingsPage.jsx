import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, LogOut, ChevronDown, Loader2, Pencil, Mail, Trash2, UserCircle2, BellRing, ShieldCheck, HeartPulse, Siren, Stethoscope, MessageSquare, ArrowRight, Volume2 } from "lucide-react";
import { supabase } from "../../supabase";
import { useIsMobile } from "../../hooks/useIsMobile";
import ErrBanner from "../../components/common/ErrBanner";
import OkBanner from "../../components/common/OkBanner";
import HealthProfile from "./settings/HealthProfile";
import EmergencyContact from "./settings/EmergencyContact";
import PrimaryCareSection from "./settings/PrimaryCareSection";
import SoundNotificationsSection from "./settings/SoundNotificationsSection";

export default function SettingsPage({ light, setLight, user, displayName, onEditName, meds, onFeedback, expandSectionKey }) {
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)";
  const name = displayName || user?.displayName || user?.email?.split("@")[0] || "User";
  const [notifEmail, setNotifEmail] = useState(user?.email || "");
  const [notifOn, setNotifOn] = useState(localStorage.getItem("mt_notif") === "true");
  const [notifSaved, setNotifSaved] = useState(false);
  const [openRow, setOpenRow] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delErr, setDelErr] = useState("");
  const [delStep, setDelStep] = useState(0);

  function toggleRow(key) { setOpenRow(o => o === key ? null : key); }

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("notifications_enabled,reminder_email").eq("id", user.id).single().then(({ data }) => {
      if (!data) return;
      if (typeof data.notifications_enabled === "boolean") {
        setNotifOn(data.notifications_enabled);
        localStorage.setItem("mt_notif", data.notifications_enabled ? "true" : "false");
      }
      if (data.reminder_email) {
        setNotifEmail(data.reminder_email);
        localStorage.setItem("mt_notif_email", data.reminder_email);
      }
    });
  }, [user?.id]);

  useEffect(() => {
    if (!expandSectionKey) return;
    setOpenRow(expandSectionKey);
    const id = `settings-section-${expandSectionKey}`;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [expandSectionKey]);

  async function saveNotifications() {
    localStorage.setItem("mt_notif", notifOn ? "true" : "false");
    localStorage.setItem("mt_notif_email", notifEmail);
    if (user?.id) { await supabase.from("profiles").update({ notifications_enabled: notifOn, reminder_email: notifEmail, updated_at: new Date().toISOString() }).eq("id", user.id); }
    setNotifSaved(true); setTimeout(() => setNotifSaved(false), 2500);
  }

  async function deleteAccount() {
    if (delStep === 0) { setDelStep(1); setDelErr(""); return; }
    if (delStep === 1) {
      if (!delPw.trim()) { setDelErr("Please enter your password to continue."); return; }
      setDelBusy(true); setDelErr("");
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: delPw });
        if (error) throw error;
        setDelStep(2); setDelErr("Password verified. Click below to permanently delete your account.");
      } catch (e) { setDelErr(e.message || "Incorrect password. Please try again."); } finally { setDelBusy(false); }
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
    } catch (e) { setDelErr(e.message || "Could not delete account. Please try again."); } finally { setDelBusy(false); }
  }

  const rows = [
    {
      key: "soundNotifications",
      I: Volume2,
      label: "Sound & notifications",
      sub: "Message tones, volume, and in-app alerts",
      color: "rgba(124,58,237,.1)",
      iconColor: "var(--pha-p)",
      content: <SoundNotificationsSection />,
    },
    {
      key: "notifications", I: BellRing, label: "Notifications", sub: "Email reminders for medication times", color: "rgba(37,99,235,.12)", iconColor: "var(--p)", content: (
        <div style={{ padding: "16px 18px 20px", borderTop: "1px solid var(--b0)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div><p style={{ color: t1, fontSize: 13, fontWeight: 600 }}>Email reminders</p><p style={{ color: t3, fontSize: 12, marginTop: 2 }}>Get an alert before each scheduled dose</p></div>
            <div className={`sw ${notifOn ? "on" : ""}`} onClick={() => setNotifOn(!notifOn)} />
          </div>
          <AnimatePresence>{notifOn && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}><label className="lbl" style={{ marginBottom: 7 }}>Send reminders to</label><input className="inp" type="email" value={notifEmail} onChange={e => setNotifEmail(e.target.value)} placeholder="your@email.com" style={{ marginBottom: 14 }} /><AnimatePresence>{notifSaved && <OkBanner msg="Reminder preferences saved." />}</AnimatePresence></motion.div>)}</AnimatePresence>
          <button className="btn" style={{ width: "100%", padding: "11px" }} onClick={saveNotifications}>Save Preferences</button>
        </div>
      )
    },
    {
      key: "privacy", I: ShieldCheck, label: "Privacy & Security", sub: "Data security, encryption, and account deletion", color: "rgba(6,182,212,.10)", iconColor: "var(--tl)", content: (
        <div style={{ padding: "16px 18px 20px", borderTop: "1px solid var(--b0)" }}>
          {[{ l: "End-to-end encryption", d: "Your medication data is encrypted in Supabase" }, { l: "No data sold to third parties", d: "Your health information is never shared" }, { l: "Anonymous analytics only", d: "Usage data is anonymised and optional" }].map((item, i) => (
            <div key={item.l} style={{ display: "flex", gap: 11, padding: "10px 0", borderBottom: i < 2 ? "1px solid var(--b0)" : "none" }}>
              <ShieldCheck size={14} color="var(--tl)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div><p style={{ color: t1, fontSize: 13, fontWeight: 600 }}>{item.l}</p><p style={{ color: t3, fontSize: 12, marginTop: 2, lineHeight: 1.55 }}>{item.d}</p></div>
            </div>
          ))}
          <div style={{ marginTop: 18, padding: "16px", borderRadius: 13, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.04)" }}>
            <p style={{ color: "var(--ro)", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Delete Account</p>
            <p style={{ color: t3, fontSize: 12, lineHeight: 1.55, marginBottom: 12 }}>Permanently deletes your account and all associated data.</p>
            <AnimatePresence>{delStep >= 1 && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden", marginBottom: 12 }}><label className="lbl" style={{ color: "rgba(239,68,68,.7)" }}>{delStep === 1 ? "Enter your password to confirm" : "Password confirmed"}</label>{delStep === 1 && <input className="inp" type="password" value={delPw} placeholder="Your current password" onChange={e => setDelPw(e.target.value)} style={{ borderColor: "rgba(239,68,68,.3)" }} />}</motion.div>)}</AnimatePresence>
            <AnimatePresence>{delStep === 2 && delErr && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden", marginBottom: 12 }}><div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.2)" }}><p style={{ color: "var(--am)", fontSize: 12, lineHeight: 1.65 }}>{delErr}</p></div></motion.div>)}</AnimatePresence>
            <AnimatePresence>{delStep !== 2 && delErr && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginBottom: 10 }}><ErrBanner msg={delErr} /></motion.div>)}</AnimatePresence>
            {delStep < 2 ? (
              <button disabled={delBusy || (delStep === 1 && !delPw.trim())} onClick={deleteAccount} style={{ width: "100%", padding: "11px", borderRadius: 11, border: "1px solid rgba(239,68,68,.3)", background: delStep === 0 ? "transparent" : "rgba(239,68,68,.1)", color: "var(--ro)", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {delBusy ? <Loader2 size={14} style={{ animation: "spin360 .7s linear infinite" }} /> : delStep === 0 ? <><Trash2 size={14} /> Delete My Account</> : <><Mail size={14} /> Confirm Deletion</>}
              </button>
            ) : (
              <button disabled={delBusy} onClick={deleteAccount} style={{ width: "100%", padding: "11px", borderRadius: 11, border: "1px solid rgba(239,68,68,.4)", background: "rgba(239,68,68,.14)", color: "var(--ro)", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {delBusy ? <Loader2 size={14} style={{ animation: "spin360 .7s linear infinite" }} /> : <><Trash2 size={14} /> Permanently Delete My Account</>}
              </button>
            )}
            {delStep > 0 && <button onClick={() => { setDelStep(0); setDelPw(""); setDelErr(""); }} style={{ marginTop: 8, width: "100%", padding: "8px", borderRadius: 9, border: "none", background: "transparent", color: t3, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>Cancel</button>}
          </div>
        </div>
      )
    },
    { key: "health", I: HeartPulse, label: "Health Profile", sub: "Personal health information and medical history", color: "rgba(239,68,68,.10)", iconColor: "var(--ro)", content: <HealthProfile userId={user?.id} t1={t1} t2={t2} t3={t3} /> },
    { key: "emergency", I: Siren, label: "Emergency Contact", sub: "Caregiver and emergency access", color: "rgba(245,158,11,.10)", iconColor: "var(--am)", content: <EmergencyContact userId={user?.id} t1={t1} t2={t2} t3={t3} /> },
    { key: "primarycare", I: Stethoscope, label: "Care team", sub: "Primary doctor, specialists, and pharmacist", color: "rgba(37,99,235,.12)", iconColor: "var(--p)", content: <PrimaryCareSection userId={user?.id} t1={t1} t2={t2} t3={t3} /> },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "26px 22px 44px" }}>
        <motion.div className="au" style={{ marginBottom: 26 }}>
          <h2 style={{ color: t1, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, letterSpacing: "-.3px" }}>Settings</h2>
          <p style={{ color: t3, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>Manage your account and preferences.</p>
        </motion.div>
        <motion.div className="au d1 card" style={{ padding: isMob ? 14 : 18, marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 15, background: "linear-gradient(135deg,rgba(37,99,235,.16),rgba(6,182,212,.1))", border: "1px solid rgba(37,99,235,.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <UserCircle2 size={22} color="var(--p)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={{ color: t1, fontSize: 14, fontWeight: 700 }}>{name}</p>
              <button onClick={onEditName} style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid var(--b1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--p)"; e.currentTarget.style.color = "var(--p)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.color = t3; }}><Pencil size={10} /></button>
            </div>
            <p style={{ color: t3, fontSize: 12, marginTop: 2 }}>{user?.email}</p>
          </div>
          <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: "rgba(16,185,129,.09)", border: "1px solid rgba(16,185,129,.2)", color: "var(--gr)" }}>Verified</span>
        </motion.div>
        <motion.div className="au d2 card" style={{ padding: 18, marginBottom: 10 }}>
          <p style={{ color: t3, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14 }}>Appearance</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            {[[true, "Light Mode", Sun, "rgba(245,158,11,.12)", "var(--am)"], [false, "Dark Mode", Moon, "var(--pd)", "var(--p)"]].map(([v, l, I, bg, ic]) => (
              <button key={String(v)} onClick={() => setLight(v)} style={{ padding: isMob ? "12px" : "15px", borderRadius: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .18s", border: `1.5px solid ${light === v ? "var(--p)" : "var(--b1)"}`, background: light === v ? "var(--pd)" : "var(--s2)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: light === v ? bg : "var(--s3)", display: "flex", alignItems: "center", justifyContent: "center" }}><I size={17} color={light === v ? ic : t3} /></div>
                <span style={{ color: light === v ? "var(--p)" : t3, fontSize: 12, fontWeight: 600 }}>{l}</span>
              </button>
            ))}
          </div>
        </motion.div>
        <motion.div className="au d2" style={{ marginBottom: 10 }}>
          <button onClick={onFeedback} style={{ width: "100%", padding: "14px 18px", borderRadius: 13, border: "1px solid var(--b1)", background: "var(--s1)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12, transition: "all .18s" }} onMouseEnter={e => e.currentTarget.style.borderColor = "var(--p)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--b1)"}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(16,185,129,.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><MessageSquare size={16} color="var(--gr)" /></div>
            <div style={{ flex: 1, textAlign: "left" }}><p style={{ color: t1, fontSize: 13, fontWeight: 600 }}>Send Feedback</p><p style={{ color: t3, fontSize: 11, marginTop: 1 }}>Rate the app, report bugs, or suggest new features</p></div>
            <ArrowRight size={14} color={t3} />
          </button>
        </motion.div>
        <motion.div className="au d3 card" style={{ overflow: "hidden", marginBottom: 10 }}>
          <p style={{ color: t3, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", padding: "16px 18px 11px", opacity: .8 }}>Account & Preferences</p>
          {rows.map((r, i) => (
            <div key={r.key} id={`settings-section-${r.key}`} style={{ scrollMarginTop: 20 }}>
              {i > 0 && <div style={{ height: 1, background: "var(--b0)", margin: "0 18px" }} />}
              <div className="srow" onClick={() => toggleRow(r.key)} style={{ padding: "13px 18px", display: "flex", alignItems: "center", gap: 13, cursor: "pointer" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: r.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><r.I size={16} color={r.iconColor} /></div>
                <div style={{ flex: 1 }}><p style={{ color: t1, fontSize: 13, fontWeight: 600 }}>{r.label}</p><p style={{ color: t3, fontSize: 11, marginTop: 2, lineHeight: 1.45 }}>{r.sub}</p></div>
                <motion.div animate={{ rotate: openRow === r.key ? 180 : 0 }} transition={{ duration: .2 }}><ChevronDown size={15} color={t3} /></motion.div>
              </div>
              <AnimatePresence>{openRow === r.key && (<motion.div key="exp" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .25 }} style={{ overflow: "hidden" }}>{r.content}</motion.div>)}</AnimatePresence>
            </div>
          ))}
        </motion.div>
        <motion.div className="au d4">
          <button className="active:opacity-70" onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "13px", borderRadius: 13, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.07)", color: "var(--ro)", fontFamily: "inherit", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .18s" }}>
            <LogOut size={14} /> Sign Out
          </button>
        </motion.div>
      </div>
    </div>
  );
}
