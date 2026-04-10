import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Stethoscope, Info, Loader2, Send, User, AlertTriangle } from "lucide-react";
import { supabase } from "../../supabase";
import { to12h } from "../../lib/utils";

/**
 * Uses VITE_OPENAI_API_KEY (see .env.example). The key is bundled into the client —
 * acceptable for local/dev only. For production, proxy chat through your backend.
 */
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

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
  return `You are a careful, empathetic health education assistant inside MedTrack, a personal medication-tracking app.

Your role: help the user understand their medications, adherence, lifestyle topics related to their conditions, and general health literacy — always personalized using the CONTEXT below when relevant.

Strict rules:
- Do NOT diagnose diseases, interpret labs, or prescribe/start/stop medications. Encourage their doctor or pharmacist for those decisions.
- If symptoms could be urgent (chest pain, trouble breathing, stroke signs, severe bleeding, confusion, suicidal thoughts), say clearly to call emergency services (e.g. 911 in the US) or seek immediate in-person care.
- Reference the user's allergies and conditions when discussing OTC drugs, supplements, or lifestyle tips so advice is tailored (e.g. avoid NSAIDs if relevant; always flag interaction checks with a pharmacist).
- Keep answers concise unless the user asks for detail. Use short paragraphs or bullet points.
- Never claim you accessed external medical records — only the CONTEXT from MedTrack below.
- If the user asks any topic NOT related to medication, medications, adherence, or health, politely decline and say you are not able to answer that question.

CONTEXT (user-provided in MedTrack; may be incomplete):
---
${healthBlock}
---`;
}

export default function AIDrawer({ onClose, userName, meds, userId }) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const hasKey = Boolean(apiKey?.trim());

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
    return `Hello${name}! I'm your MedTrack Health Advisor.\n\n${medLine}\n\nAsk about your meds, allergies, conditions, or general wellness — I'll personalize answers using what you've saved here.\n\n${hasKey ? "" : "⚠️ Add VITE_OPENAI_API_KEY to your .env file to enable AI replies."}`;
  }, [userName, meds, hasKey]);

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
      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: buildSystemPrompt(healthBlock) },
            ...threadPlusUser,
          ],
          max_tokens: 1200,
          temperature: 0.45,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error?.message || res.statusText || "Request failed";
        throw new Error(msg);
      }
      const text = json?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("No reply from model");
      return text;
    },
    [apiKey, healthBlock]
  );

  async function send(textOverride) {
    const msgText = (textOverride !== undefined ? textOverride : inp).trim();
    if (!msgText || loading) return;
    if (!hasKey) {
      setErr("Set VITE_OPENAI_API_KEY in .env and restart the dev server.");
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
            <span style={{ width: 7, height: 7, borderRadius: "50%", display: "block", background: hasKey ? "var(--gr)" : "var(--am)", boxShadow: hasKey ? "0 0 6px var(--gr)" : "none" }} />
            <span style={{ color: t3, fontSize: 11 }}>
              {hasKey ? "AI · personalized to your profile" : "API key required"}
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
      {!hasKey && (
        <div style={{ margin: "10px 16px 0", padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.2)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertTriangle size={14} color="var(--ro)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: t2, fontSize: 11, lineHeight: 1.55, margin: 0 }}>
            Create <code style={{ fontSize: 10 }}>.env</code> with <code style={{ fontSize: 10 }}>VITE_OPENAI_API_KEY=sk-...</code> and restart Vite. For production, call OpenAI from your server — do not expose keys in the browser.
          </p>
        </div>
      )}
      {err && (
        <p style={{ color: "var(--ro)", fontSize: 12, margin: "10px 16px 0", padding: "0 4px" }}>{err}</p>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
        {msgs.length === 1 && hasKey && (
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
            placeholder={hasKey ? "Ask about your health or medications…" : "Configure API key to chat…"}
            onChange={(e) => setInp(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={!hasKey || !profileLoaded}
            style={{ flex: 1, padding: "12px 15px", borderRadius: 13, background: "var(--s2)", border: `1.5px solid ${b1}`, color: t1, fontFamily: "inherit", fontSize: 14, outline: "none", transition: "border-color .18s", caretColor: "var(--p)", opacity: hasKey && profileLoaded ? 1 : 0.6 }}
            onFocus={(e) => { e.target.style.borderColor = "var(--p)"; }}
            onBlur={(e) => { e.target.style.borderColor = b1; }}
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!inp.trim() || loading || !hasKey || !profileLoaded}
            style={{ width: 44, height: 44, borderRadius: 13, border: "none", flexShrink: 0, background: inp.trim() && hasKey && profileLoaded ? "var(--p)" : "var(--s2)", cursor: inp.trim() && hasKey && profileLoaded ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .18s", boxShadow: inp.trim() && hasKey ? "0 4px 16px rgba(37,99,235,.32)" : "none" }}
          >
            {loading ? <Loader2 size={16} color="var(--p)" style={{ animation: "spin360 .7s linear infinite" }} /> : <Send size={16} color={inp.trim() && hasKey && profileLoaded ? "#fff" : t3} />}
          </button>
        </div>
        <p style={{ color: t3, fontSize: 10.5, marginTop: 7, textAlign: "center" }}>Enter to send · Shift+Enter for new line</p>
      </div>
    </motion.div>
  );
}
