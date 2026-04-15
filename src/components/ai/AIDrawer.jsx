import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Stethoscope, Info, Loader2, Send, User } from "lucide-react";
import { supabase } from "../../supabase";
import { to12h } from "../../lib/utils";
import { callOpenAIChat, OPENAI_CHAT_MODEL } from "../../lib/openaiChat";

/** Health Advisor — free offline tips + openFDA; optional paid OpenAI only if VITE_ENABLE_OPENAI_EDGE=true. */

function formatMedsForContext(meds) {
  if (!meds?.length) return "None recorded in MedTrack.";
  return meds
    .map((m) => {
      const t = m.time != null ? to12h(m.time) : "";
      const parts = [m.name, m.dosage, m.freq, t && `reminder ${t}`].filter(Boolean);
      return `• ${parts.join(" · ")}`;
    })
    .join("\n");
}

function formatCareTeamForContext(profile) {
  const ct = profile?.care_team;
  if (!Array.isArray(ct) || ct.length === 0) return "Care team (doctors by role): not listed in MedTrack.";
  const lines = ct
    .filter((e) => e?.doctor_id)
    .map((e) => `• Role: ${e.label || "Doctor"} (provider id ${e.doctor_id})`);
  return lines.length ? `Care team (saved roles; see clinician for care coordination):\n${lines.join("\n")}` : "Care team: not listed.";
}

function buildHealthContextBlock(profile, meds, userName) {
  const p = profile || {};
  const allergies = Array.isArray(p.allergies) ? p.allergies : [];
  const conditions = Array.isArray(p.medical_conditions) ? p.medical_conditions : [];
  return [
    `Preferred name / display: ${userName || "Patient"}`,
    p.dob ? `Date of birth: ${p.dob}` : "Date of birth: not provided",
    p.blood_type ? `Blood type: ${p.blood_type}` : "Blood type: not provided",
    p.weight ? `Weight: ${p.weight}` : "Weight: not provided",
    p.height ? `Height: ${p.height}` : "Height: not provided",
    allergies.length ? `Known allergies: ${allergies.join(", ")}` : "Known allergies: none recorded",
    conditions.length ? `Medical conditions: ${conditions.join(", ")}` : "Medical conditions: none recorded",
    "",
    formatCareTeamForContext(p),
    "",
    "Current medication list (from MedTrack):",
    formatMedsForContext(meds),
  ].join("\n");
}

function buildSystemPrompt(healthBlock) {
  return `You are a friendly, clear health assistant inside MedTrack (a medication-tracking app). Keep it simple and natural.

Use the CONTEXT below when it’s relevant. Keep replies easy to read (short paragraphs; bullets only when helpful).

Rules:
- Don’t diagnose, interpret labs, or tell them to start/stop prescriptions—point to their clinician or pharmacist for those calls.
- If something could be an emergency (chest pain, trouble breathing, stroke signs, severe bleeding, confusion, thoughts of self-harm), tell them clearly to use local emergency services or go to the ER.
- When OTC, supplements, or diet come up, remember allergies/conditions from CONTEXT when relevant.
- Don’t claim you saw outside medical records—only what’s in CONTEXT.
- If they go far off-topic from health/meds, briefly say you’re here for health and meds in MedTrack.

CONTEXT (from MedTrack; may be incomplete):
---
${healthBlock}
---`;
}

export default function AIDrawer({ onClose, userName, meds, userId }) {
  const canUseAI = Boolean(userId);

  const [healthProfile, setHealthProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const healthBlock = useMemo(
    () => buildHealthContextBlock(healthProfile, meds, userName),
    [healthProfile, meds, userName]
  );

  useEffect(() => {
    if (!userId) {
      setHealthProfile(null);
      setProfileLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("dob,blood_type,weight,height,allergies,medical_conditions,care_team")
          .eq("id", userId)
          .single();
        if (!cancelled) setHealthProfile(data || {});
      } catch {
        if (!cancelled) setHealthProfile({});
      } finally {
        if (!cancelled) setProfileLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const welcomeText = useMemo(() => {
    const name = userName ? `, ${userName.split(" ")[0]}` : "";
    const medLine = meds?.length
      ? `I can see ${meds.length} medication${meds.length > 1 ? "s" : ""} on your schedule and your saved health profile.`
      : "Add medications and complete your health profile in Settings for more personalized guidance.";
    return `Hey${name}! I’m here to chat about your health and medications in plain language—no paid AI required.\n\n${medLine}\n\nAsk anything—meds, side effects, routines, or how to talk to your doctor.`;
  }, [userName, meds]);

  const [msgs, setMsgs] = useState([{ from: "bot", text: welcomeText }]);
  const [openAiThread, setOpenAiThread] = useState([]);
  const [inp, setInp] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  useEffect(() => {
    setMsgs((m) => (m.length === 1 && m[0].from === "bot" ? [{ from: "bot", text: welcomeText }] : m));
  }, [welcomeText]);

  const callOpenAI = useCallback(
    async (threadPlusUser) => {
      const data = await callOpenAIChat({
        model: OPENAI_CHAT_MODEL,
        messages: [{ role: "system", content: buildSystemPrompt(healthBlock) }, ...threadPlusUser],
        max_tokens: 1200,
        temperature: 0.45,
      });
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("No reply from model");
      return text;
    },
    [healthBlock]
  );

  async function send(textOverride) {
    const msgText = (textOverride !== undefined ? textOverride : inp).trim();
    if (!msgText || loading) return;
    if (!userId) {
      setErr("Sign in to use the Health Advisor.");
      return;
    }
    if (!profileLoaded) {
      setErr("Loading your profile… try again in a moment.");
      return;
    }

    setErr(null);
    setMsgs((ms) => [...ms, { from: "user", text: msgText }]);
    setInp("");
    setLoading(true);

    const nextThread = [...openAiThread, { role: "user", content: msgText }];

    try {
      const reply = await callOpenAI(nextThread);
      setOpenAiThread([...nextThread, { role: "assistant", content: reply }]);
      setMsgs((ms) => [...ms, { from: "bot", text: reply }]);
    } catch (e) {
      const message = e?.message || "Something went wrong.";
      setMsgs((ms) => [...ms, { from: "bot", text: `Sorry — ${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  const chips = useMemo(() => {
    const a = healthProfile?.allergies?.length;
    const c = healthProfile?.medical_conditions?.length;
    const base = meds?.length
      ? [
          "Summarize my medications and what they're typically for",
          "What should I watch for given my allergies?",
          "Tips for staying on schedule with my doses",
        ]
      : [
          "How do I talk to my doctor about a new symptom?",
          "What belongs in a good medication list for my visit?",
        ];
    if (a) base.unshift("What OTC meds should I be careful with given my allergies?");
    if (c) base.unshift("How might my conditions affect exercise or diet?");
    return base.slice(0, 4);
  }, [meds, healthProfile]);

  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)", b1 = "var(--b1)";

  return (
    <motion.div className="dr" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 260 }}>
      <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${b1}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ width: 42, height: 42, borderRadius: 13, background: "var(--pd)", border: "1px solid rgba(37,99,235,.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Stethoscope size={19} color="var(--p)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: t1, fontSize: 15, fontWeight: 700 }}>Health Advisor</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", display: "block", background: canUseAI ? "var(--gr)" : "var(--am)", boxShadow: canUseAI ? "0 0 6px var(--gr)" : "none" }} />
            <span style={{ color: t3, fontSize: 11 }}>
              {canUseAI ? "Free tips · uses your profile" : "Sign in to use Health Advisor"}
            </span>
          </div>
        </div>
        <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ margin: "12px 16px 0", padding: "9px 13px", borderRadius: 10, background: "rgba(245,158,11,.05)", border: "1px solid rgba(245,158,11,.13)", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Info size={12} color="var(--am)" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ color: "var(--am)", fontSize: 11, lineHeight: 1.6 }}>
          Educational only — not medical advice. For diagnosis, treatment, or emergencies, contact a licensed professional or emergency services.
        </p>
      </div>
      {err && (
        <p style={{ color: "var(--ro)", fontSize: 12, margin: "10px 16px 0", padding: "0 4px" }}>{err}</p>
      )}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-y", padding: "14px 16px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
        {msgs.length === 1 && canUseAI && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => send(c)}
                style={{ padding: "7px 14px", borderRadius: 99, fontSize: 12, fontWeight: 500, border: `1px solid ${b1}`, background: "var(--s2)", color: t2, cursor: "pointer", fontFamily: "inherit", transition: "all .15s", lineHeight: 1.4, textAlign: "left" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--p)"; e.currentTarget.style.color = "var(--p)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = b1; e.currentTarget.style.color = t2; }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
            style={{ display: "flex", gap: 10, flexDirection: m.from === "user" ? "row-reverse" : "row", alignItems: "flex-end" }}>
            <div style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: m.from === "bot" ? "var(--pd)" : "var(--p)", border: m.from === "bot" ? "1px solid rgba(37,99,235,.25)" : "none" }}>
              {m.from === "bot" ? <Stethoscope size={13} color="var(--p)" /> : <User size={13} color="#fff" />}
            </div>
            <div style={{ maxWidth: "80%" }}>
              <div style={{ padding: "12px 16px", fontSize: 13.5, lineHeight: 1.78, borderRadius: 16, borderBottomRightRadius: m.from === "user" ? 4 : 16, borderBottomLeftRadius: m.from === "bot" ? 4 : 16, background: m.from === "user" ? "var(--p)" : "var(--s2)", color: m.from === "user" ? "#fff" : t1, boxShadow: m.from === "user" ? "0 4px 18px rgba(37,99,235,.28)" : "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {m.text}
              </div>
            </div>
          </motion.div>
        ))}
        {loading && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ width: 30, height: 30, borderRadius: 10, background: "var(--pd)", border: "1px solid rgba(37,99,235,.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Stethoscope size={13} color="var(--p)" />
            </div>
            <div style={{ padding: "14px 18px", borderRadius: 16, borderBottomLeftRadius: 4, background: "var(--s2)", display: "flex", gap: 5 }}>
              {[0, 1, 2].map((j) => (
                <motion.div key={j} animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 0.9, delay: j * 0.18, ease: "easeInOut" }}
                  style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--p)" }} />
              ))}
            </div>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "12px 16px max(18px, env(safe-area-inset-bottom))", borderTop: `1px solid ${b1}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
          <input
            value={inp}
            placeholder={canUseAI ? "Ask about your health or medications…" : "Sign in to chat…"}
            onChange={(e) => setInp(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={!canUseAI || !profileLoaded}
            style={{ flex: 1, padding: "12px 15px", borderRadius: 13, background: "var(--s2)", border: `1.5px solid ${b1}`, color: t1, fontFamily: "inherit", fontSize: 14, outline: "none", transition: "border-color .18s", caretColor: "var(--p)", opacity: canUseAI && profileLoaded ? 1 : 0.6 }}
            onFocus={(e) => { e.target.style.borderColor = "var(--p)"; }}
            onBlur={(e) => { e.target.style.borderColor = b1; }}
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!inp.trim() || loading || !canUseAI || !profileLoaded}
            style={{ width: 44, height: 44, borderRadius: 13, border: "none", flexShrink: 0, background: inp.trim() && canUseAI && profileLoaded ? "var(--p)" : "var(--s2)", cursor: inp.trim() && canUseAI && profileLoaded ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .18s", boxShadow: inp.trim() && canUseAI ? "0 4px 16px rgba(37,99,235,.32)" : "none" }}
          >
            {loading ? <Loader2 size={16} color="var(--p)" style={{ animation: "spin360 .7s linear infinite" }} /> : <Send size={16} color={inp.trim() && canUseAI && profileLoaded ? "#fff" : t3} />}
          </button>
        </div>
        <p style={{ color: t3, fontSize: 10.5, marginTop: 7, textAlign: "center" }}>Enter to send · Shift+Enter for new line</p>
      </div>
    </motion.div>
  );
}
