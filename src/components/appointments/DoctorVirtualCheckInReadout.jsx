import { FileText, Download, Trash2, ClipboardPen } from "lucide-react";

/**
 * Read-only virtual visit check-in for the doctor portal — structured layout + PDF + optional clear.
 */
export default function DoctorVirtualCheckInReadout({
  profile,
  t1 = "var(--t1)",
  t3 = "var(--t3)",
  b1 = "var(--b1)",
  accent = "var(--p)",
  onDownloadPdf,
  onRequestClear,
  clearBusy = false,
  onRequestRefill,
  refillBusy = false,
  compact = false,
}) {
  const i = profile?.pre_visit_intake || {};
  if (!i.completed_at) return null;

  const pad = compact ? "14px 16px" : "18px 20px";
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "Patient";
  const completedStr = i.completed_at
    ? new Date(i.completed_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div
      style={{
        gridColumn: "1 / -1",
        borderRadius: 18,
        border: `1px solid rgba(14,116,144,.28)`,
        background: `linear-gradient(165deg, rgba(14,116,144,.06) 0%, var(--s1) 52%)`,
        boxShadow: "0 6px 24px rgba(15,23,42,.06)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: `${compact ? 12 : 14}px ${compact ? 16 : 22}px`,
          borderBottom: `1px solid rgba(14,116,144,.14)`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          background: "rgba(255,255,255,.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: `${accent}18`,
              border: `1px solid ${accent}35`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileText size={18} color={accent} strokeWidth={2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, color: t1, fontSize: compact ? 14 : 15, fontWeight: 800 }}>Virtual visit check-in</p>
            {completedStr ? (
              <p style={{ margin: "4px 0 0", color: t3, fontSize: 11.5, fontWeight: 600 }}>Submitted {completedStr}</p>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {typeof onDownloadPdf === "function" ? (
            <button
              type="button"
              onClick={onDownloadPdf}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 10,
                border: `1px solid ${b1}`,
                background: "var(--s2)",
                color: accent,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Download size={14} /> PDF
            </button>
          ) : null}
          {typeof onRequestRefill === "function" ? (
            <button
              type="button"
              onClick={onRequestRefill}
              disabled={refillBusy}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 10,
                border: `1px solid ${accent}40`,
                background: `${accent}0d`,
                color: accent,
                fontSize: 12,
                fontWeight: 700,
                cursor: refillBusy ? "wait" : "pointer",
                fontFamily: "inherit",
                opacity: refillBusy ? 0.7 : 1,
              }}
            >
              <ClipboardPen size={14} /> Request new form
            </button>
          ) : null}
          {typeof onRequestClear === "function" ? (
            <button
              type="button"
              onClick={onRequestClear}
              disabled={clearBusy}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid rgba(185,28,28,.35)",
                background: "rgba(185,28,28,.07)",
                color: "var(--ro)",
                fontSize: 12,
                fontWeight: 700,
                cursor: clearBusy ? "wait" : "pointer",
                fontFamily: "inherit",
                opacity: clearBusy ? 0.7 : 1,
              }}
            >
              <Trash2 size={14} /> Delete Form
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ padding: pad }}>
        <p style={{ margin: "0 0 14px", color: t1, fontSize: compact ? 14 : 15, fontWeight: 700 }}>{name}</p>

        <Field label="Date of birth" t3={t3} t1={t1}>{i.date_of_birth_iso || i.date_of_birth || "—"}</Field>
        <Field label="Home address" t3={t3} t1={t1}>{i.home_address?.trim() || "—"}</Field>
        <Field label="Insurance" t3={t3} t1={t1}>{i.insurance_info?.trim() || "—"}</Field>
        <Field label="Health conditions" t3={t3} t1={t1}>
          {Array.isArray(profile?.medical_conditions) && profile.medical_conditions.length
            ? profile.medical_conditions.join("; ")
            : "—"}
        </Field>
        <Field label="Reason for visit" t3={t3} t1={t1} last>
          <span style={{ fontWeight: 700, color: t1 }}>{i.chief_complaint?.trim() || "—"}</span>
        </Field>
        {(i.requested_visit_date_iso || i.requested_visit_date || i.requested_visit_time) && (
          <p style={{ margin: "12px 0 0", padding: "10px 12px", borderRadius: 10, background: "rgba(14,116,144,.07)", border: `1px solid rgba(14,116,144,.16)`, color: t3, fontSize: 12.5, lineHeight: 1.5 }}>
            <strong style={{ color: t1 }}>Requested slot: </strong>
            {i.requested_visit_date_iso || i.requested_visit_date || "—"}
            {i.requested_visit_time ? ` · ${i.requested_visit_time}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, t1, t3, last }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: last ? "none" : "1px solid rgba(148,163,184,.35)" }}>
      <p style={{ margin: "0 0 5px", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: t3 }}>{label}</p>
      <div style={{ color: t1, fontSize: 13.5, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}
