import { useState } from "react";
import { motion } from "framer-motion";
import { UserCircle2, Loader2 } from "lucide-react";
import { supabase } from "../../supabase";

export default function Onboarding({ user, initialProfile, onComplete }) {
  const [firstName, setFirstName] = useState(initialProfile?.first_name || user?.user_metadata?.full_name || "");
  const [lastName, setLastName] = useState(initialProfile?.last_name || "");
  const [age, setAge] = useState(initialProfile?.age ?? "");
  const [sex, setSex] = useState(initialProfile?.sex || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e?.preventDefault();
    if (!firstName?.trim()) {
      setErr("Please enter your first name.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          age: age ? parseInt(age, 10) : null,
          sex: sex || null,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) throw error;
      onComplete({ first_name: firstName.trim() });
    } catch (e) {
      setErr(e.message || "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const rT1 = "#ffffff";
  const rT2 = "#d4e4ff";
  const rT3 = "#7a9acc";
  const rInpBg = "rgba(255,255,255,.08)";
  const rInpBr = "rgba(255,255,255,.18)";
  const rInpC = "#ffffff";
  const INP = {
    width: "100%",
    padding: "13px 16px",
    background: rInpBg,
    border: `1.5px solid ${rInpBr}`,
    borderRadius: 12,
    color: rInpC,
    fontFamily: "'DM Sans',sans-serif",
    fontSize: 14.5,
    outline: "none",
    transition: "all .2s",
    caretColor: "#3b82f6",
    fontWeight: 400,
  };
  const LBL = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: rT2,
    letterSpacing: ".07em",
    textTransform: "uppercase",
    marginBottom: 8,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans',sans-serif",
        background: "#080b14",
        padding: 24,
      }}
    >
      <style>{`
        .onboarding-inp:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3.5px rgba(37,99,235,.2) !important; background: rgba(255,255,255,.12) !important; }
      `}</style>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          width: "100%",
          maxWidth: 440,
          background: "rgba(22,27,34,0.9)",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 20,
          padding: "32px 36px",
          boxShadow: "0 24px 48px rgba(0,0,0,.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "rgba(37,99,235,.2)",
              border: "1px solid rgba(37,99,235,.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UserCircle2 size={24} color="#93c5fd" />
          </div>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 24, fontStyle: "italic", color: rT1, margin: 0 }}>
              Welcome to MedTrack
            </h1>
            <p style={{ color: rT3, fontSize: 13, marginTop: 4 }}>Complete your profile to get started</p>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={LBL}>First name</label>
            <input
              className="onboarding-inp"
              style={INP}
              type="text"
              value={firstName}
              placeholder="e.g. Jamie"
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label style={LBL}>Last name</label>
            <input
              className="onboarding-inp"
              style={INP}
              type="text"
              value={lastName}
              placeholder="e.g. Smith"
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={LBL}>Age</label>
              <input
                className="onboarding-inp"
                style={INP}
                type="number"
                min={1}
                max={120}
                value={age}
                placeholder="Age"
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
            <div>
              <label style={LBL}>Sex</label>
              <select className="onboarding-inp" style={INP} value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
          </div>
          {err && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(239,68,68,.1)",
                border: "1px solid rgba(239,68,68,.25)",
                color: "#fca5a5",
                fontSize: 13,
              }}
            >
              {err}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              padding: 14,
              marginTop: 8,
              background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
              border: "none",
              borderRadius: 12,
              color: "#fff",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 4px 20px rgba(37,99,235,.28)",
            }}
          >
            {busy ? <Loader2 size={16} className="auth-spin" /> : "Continue"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
