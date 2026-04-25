import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../../supabase";
import OkBanner from "../../../components/common/OkBanner";

export const CARE_TEAM_LABEL_PRESETS = [
  "Primary care",
  "Neurology",
  "Gynecology / OB-GYN",
  "Cardiology",
  "Dermatology",
  "Psychiatry",
  "Endocrinology",
  "Orthopedics",
  "Oncology",
  "Urology",
  "Other",
];

function normalizeRowsFromProfile(data) {
  const ct = data?.care_team;
  if (Array.isArray(ct) && ct.length > 0) {
    return ct
      .filter((e) => e && e.doctor_id)
      .map((e, i) => ({
        key: `r-${e.doctor_id}-${i}`,
        doctorId: e.doctor_id,
        label: typeof e.label === "string" && e.label.trim() ? e.label.trim() : "Primary care",
      }));
  }
  if (data?.primary_doctor_id) {
    return [{ key: "legacy-primary", doctorId: data.primary_doctor_id, label: "Primary care" }];
  }
  return [];
}

function buildCareTeamPayload(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r.doctorId) continue;
    if (seen.has(r.doctorId)) continue;
    seen.add(r.doctorId);
    const label = String(r.label ?? "Other").trim() || "Other";
    out.push({ doctor_id: r.doctorId, label });
  }
  return out;
}

function derivePrimaryDoctorId(payload) {
  const primary = payload.find((p) => p.label.trim().toLowerCase() === "primary care");
  return primary?.doctor_id || null;
}

export default function PrimaryCareSection({ userId, t1, t2, t3 }) {
  const [doctors, setDoctors] = useState([]);
  const [pharmacists, setPharmacists] = useState([]);
  const [rows, setRows] = useState([]);
  const [primaryPharmacistId, setPrimaryPharmacistId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const addRow = useCallback(() => {
    setRows((r) => [...r, { key: `new-${Date.now()}`, doctorId: "", label: CARE_TEAM_LABEL_PRESETS[0] }]);
  }, []);

  const removeRow = useCallback((key) => {
    setRows((r) => r.filter((x) => x.key !== key));
  }, []);

  const updateRow = useCallback((key, field, value) => {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, [field]: value } : x)));
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const [profRes, docsRes, pharmRes] = await Promise.all([
          supabase.from("profiles").select("primary_doctor_id,primary_pharmacist_id,care_team").eq("id", userId).single(),
          supabase.from("profiles").select("id,first_name,last_name,email,specialty").eq("role", "doctor").order("first_name"),
          supabase.from("profiles").select("id,first_name,last_name,email").eq("role", "pharmacist").order("first_name"),
        ]);
        if (profRes.data) {
          setPrimaryPharmacistId(profRes.data.primary_pharmacist_id || "");
          setRows(normalizeRowsFromProfile(profRes.data));
        }
        setDoctors(docsRes.data || []);
        setPharmacists(pharmRes.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  async function save() {
    if (!userId) return;
    setSaving(true);
    setSaved(false);
    try {
      const payload = buildCareTeamPayload(rows);
      const primaryDoctorId = derivePrimaryDoctorId(payload);
      await supabase
        .from("profiles")
        .update({
          care_team: payload,
          primary_doctor_id: primaryDoctorId,
          primary_pharmacist_id: primaryPharmacistId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2800);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const label = (p) => {
    const nm = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.id?.slice(0, 8);
    return p.specialty ? `${nm} — ${p.specialty}` : nm;
  };

  if (loading) {
    return (
      <div style={{ padding: "16px 18px", color: t3, display: "flex", alignItems: "center", gap: 10 }}>
        <Loader2 size={16} style={{ animation: "spin360 .7s linear infinite" }} /> Loading…
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 18px 20px", borderTop: "1px solid var(--b0)" }}>
      <p style={{ color: t1, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Your doctors</p>
      <p style={{ color: t3, fontSize: 12, marginBottom: 14, lineHeight: 1.55 }}>
        Add each doctor and their role (e.g. primary care vs neurology). One row should be <strong style={{ color: t2 }}>Primary care</strong> so your main physician is linked for prescriptions and care coordination. The same person cannot be added twice.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {rows.length === 0 && (
          <p style={{ color: t3, fontSize: 12, fontStyle: "italic", margin: 0 }}>No doctors listed yet — add your care team below.</p>
        )}
        {rows.map((row) => {
          const roleIsCustom = !CARE_TEAM_LABEL_PRESETS.includes(row.label);
          return (
          <div
            key={row.key}
            className="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_minmax(140px,1fr)_auto] sm:gap-2 sm:items-end"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--b0)",
              background: "var(--s2)",
            }}
          >
            <div>
              <label className="lbl" style={{ marginBottom: 4, fontSize: 10 }}>Doctor</label>
              <select
                className="inp"
                value={row.doctorId}
                onChange={(e) => updateRow(row.key, "doctorId", e.target.value)}
                style={{ width: "100%", padding: "9px 10px", borderRadius: 10, fontSize: 13 }}
              >
                <option value="">Select…</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {label(d)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl" style={{ marginBottom: 4, fontSize: 10 }}>Role</label>
              <select
                className="inp"
                value={roleIsCustom ? "Other" : row.label}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "Other") updateRow(row.key, "label", "");
                  else updateRow(row.key, "label", v);
                }}
                style={{ width: "100%", padding: "9px 10px", borderRadius: 10, fontSize: 13 }}
              >
                {CARE_TEAM_LABEL_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {(roleIsCustom || row.label === "Other") && (
                <input
                  className="inp"
                  placeholder={row.label === "Other" ? "Describe role (e.g. Pain specialist)" : "Custom role"}
                  value={roleIsCustom ? row.label : ""}
                  onChange={(e) => updateRow(row.key, "label", e.target.value)}
                  style={{ marginTop: 6, width: "100%", padding: "8px 10px", borderRadius: 10, fontSize: 12 }}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              title="Remove"
              className="self-end sm:self-auto"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: "1px solid rgba(239,68,68,.25)",
                background: "rgba(239,68,68,.06)",
                color: "var(--ro)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        style={{
          width: "100%",
          padding: "10px 14px",
          marginBottom: 18,
          borderRadius: 11,
          border: `1px dashed var(--b1)`,
          background: "transparent",
          color: "var(--p)",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Plus size={16} /> Add another doctor
      </button>

      <div style={{ marginBottom: 16 }}>
        <label className="lbl" style={{ marginBottom: 6 }}>Primary pharmacist</label>
        <select
          className="inp"
          value={primaryPharmacistId}
          onChange={(e) => setPrimaryPharmacistId(e.target.value)}
          style={{ width: "100%", padding: "11px 14px", borderRadius: 10 }}
        >
          <option value="">Select a pharmacist</option>
          {pharmacists.map((p) => (
            <option key={p.id} value={p.id}>
              {label(p)}
            </option>
          ))}
        </select>
      </div>

      {saved && <OkBanner msg="Care team saved." />}
      <button className="btn" style={{ width: "100%", padding: 11 }} disabled={saving} onClick={save}>
        {saving ? <Loader2 size={14} className="auth-spin" /> : "Save care team"}
      </button>
    </div>
  );
}
