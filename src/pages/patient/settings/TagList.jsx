import { X } from "lucide-react";

const HP_TAG_COLORS = {
  allergy: { bg: "rgba(239,68,68,.08)", border: "rgba(239,68,68,.22)", text: "var(--ro)" },
  condition: { bg: "rgba(245,158,11,.08)", border: "rgba(245,158,11,.22)", text: "var(--am)" },
};

export default function TagList({ items, onRemove, type, t3 }) {
  const c = HP_TAG_COLORS[type];
  if (!items.length) return <p style={{ color: t3, fontSize: 12, fontStyle: "italic", padding: "6px 0" }}>None added yet.</p>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 4 }}>
      {items.map(item => (
        <span key={item} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px 5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
          {item}
          <button onClick={() => onRemove(item)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", color: c.text, opacity: .65, lineHeight: 0 }}>
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}
