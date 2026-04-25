import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Stethoscope, MessageCircle, Users, Settings2, ArrowRight } from "lucide-react";
import { supabase } from "../../supabase";
import { useIsMobile } from "../../hooks/useIsMobile";

export default function CareHubPage({ userId, onCareAdvisor, onFeedback, onManageCareTeam }) {
  const isMob = useIsMobile();
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)", b1 = "var(--b1)";
  const [careTeam, setCareTeam] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(!!userId);

  useEffect(() => {
    if (!userId) {
      setCareTeam([]);
      setLoadingTeam(false);
      return;
    }
    let cancelled = false;
    setLoadingTeam(true);
    (async () => {
      const profRes = await supabase.from("profiles").select("primary_doctor_id,primary_pharmacist_id,care_team").eq("id", userId).single();
      if (cancelled) return;
      const data = profRes.data;
      const pd = data?.primary_doctor_id;
      const pp = data?.primary_pharmacist_id;
      const rawTeam = data?.care_team;
      const teamList = [];
      if (Array.isArray(rawTeam) && rawTeam.length > 0) {
        const ids = [...new Set(rawTeam.map((e) => e?.doctor_id).filter(Boolean))];
        if (ids.length > 0) {
          const { data: docRows } = await supabase.from("profiles").select("id,first_name,last_name,role,specialty,pharmacy_name,email").in("id", ids);
          const byId = Object.fromEntries((docRows || []).map((d) => [d.id, d]));
          for (const entry of rawTeam) {
            const doc = entry?.doctor_id ? byId[entry.doctor_id] : null;
            if (doc) teamList.push({ ...doc, careLabel: entry.label || "Doctor" });
          }
        }
      } else if (pd) {
        const { data: solo } = await supabase.from("profiles").select("id,first_name,last_name,role,specialty,pharmacy_name,email").eq("id", pd).single();
        if (solo) teamList.push({ ...solo, careLabel: "Primary care" });
      }
      if (pp) {
        const { data: ph } = await supabase.from("profiles").select("id,first_name,last_name,role,specialty,pharmacy_name,email").eq("id", pp).single();
        if (ph) teamList.push({ ...ph, careLabel: null });
      }
      if (!cancelled) {
        setCareTeam(teamList);
        setLoadingTeam(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const items = [
    { label: "Care Advisor", sub: "Ask questions about your medications and wellness.", Icon: Stethoscope, onClick: onCareAdvisor, accent: "var(--p)", bg: "var(--pd)" },
    { label: "Send Feedback", sub: "Share ideas, report issues, or rate your experience.", Icon: MessageCircle, onClick: onFeedback, accent: "var(--gr)", bg: "rgba(16,185,129,.1)" },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: isMob ? "16px 14px 56px" : "26px 22px 44px" }}>
        <h2 style={{ color: t1, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 600, margin: "0 0 8px" }}>Care Hub</h2>
        <p style={{ color: t3, fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>Your care team, guidance, and feedback — in one place.</p>

        <motion.section className="au card" style={{ padding: 20, marginBottom: 16, border: `1px solid ${b1}`, background: "var(--s1)" }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(37,99,235,.12)", border: `1px solid rgba(37,99,235,.2)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={22} color="var(--p)" strokeWidth={1.75} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ color: t1, fontSize: 16, fontWeight: 700, margin: 0 }}>Care team</h3>
              <p style={{ color: t3, fontSize: 12, margin: "4px 0 0", lineHeight: 1.45 }}>Doctors and pharmacist linked to your account.</p>
            </div>
          </div>
          {loadingTeam ? (
            <p style={{ color: t3, fontSize: 13, margin: 0 }}>Loading…</p>
          ) : careTeam.length === 0 ? (
            <p style={{ color: t3, fontSize: 13, margin: "0 0 14px", lineHeight: 1.55 }}>No care team yet. Add your primary doctor and pharmacist in Settings.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {careTeam.map((p) => {
                const isDoc = p.role === "doctor";
                const nm = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Provider";
                const specialty = isDoc ? (p.specialty || null) : null;
                const detail = p.careLabel != null
                  ? `${p.careLabel}${specialty ? ` · ${specialty}` : ""}`
                  : (isDoc ? (specialty || "Doctor") : (p.pharmacy_name ? `${p.pharmacy_name} · Pharmacist` : "Pharmacist"));
                const color = isDoc ? "var(--p)" : "var(--pha-p)";
                const bg = isDoc ? "var(--pd)" : "rgba(124,58,237,.1)";
                return (
                  <li key={`${p.id}-${p.careLabel ?? "ph"}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "var(--s2)", border: "1px solid var(--b0)" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ color, fontSize: 15, fontWeight: 800, fontFamily: "'Playfair Display',serif" }}>{nm[0]?.toUpperCase() || "?"}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: t1, fontSize: 14, fontWeight: 700, margin: 0 }}>{isDoc ? `Dr. ${nm}` : nm}</p>
                      <p style={{ color, fontSize: 12, margin: "3px 0 0", fontWeight: 600, lineHeight: 1.35 }}>{detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" onClick={onManageCareTeam} style={{ marginTop: 16, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px", borderRadius: 12, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: t2 }}>
            <Settings2 size={16} color="var(--p)" />
            Manage care team in Settings
            <ArrowRight size={16} color={t3} />
          </button>
        </motion.section>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item) => (
            <motion.button key={item.label} type="button" className="au card" onClick={item.onClick} whileHover={{ y: -2 }} style={{ padding: 22, cursor: "pointer", fontFamily: "inherit", textAlign: "left", border: `1px solid ${b1}`, background: "var(--s1)", display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: item.bg, border: `1px solid ${b1}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <item.Icon size={22} color={item.accent} strokeWidth={1.75} />
              </div>
              <div>
                <p style={{ color: t1, fontSize: 17, fontWeight: 700, margin: 0 }}>{item.label}</p>
                <p style={{ color: t3, fontSize: 13, margin: "8px 0 0", lineHeight: 1.55 }}>{item.sub}</p>
                <span style={{ display: "inline-block", marginTop: 12, fontSize: 12, fontWeight: 600, color: item.accent }}>Open →</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
