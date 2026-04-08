import { Plus } from "lucide-react";

export default function AddRow({ value, onChange, onAdd, placeholder, btnColor, t3 }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
      <input className="inp" style={{ flex: 1, marginBottom: 0 }} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === "Enter" && onAdd()} />
      <button onClick={onAdd} disabled={!value.trim()} style={{ padding: "0 16px", borderRadius: 10, border: "none", background: value.trim() ? (btnColor || "var(--p)") : "var(--b1)", color: value.trim() ? "#fff" : t3, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: value.trim() ? "pointer" : "default", display: "flex", alignItems: "center", gap: 5, transition: "all .15s", whiteSpace: "nowrap" }}>
        <Plus size={13} /> Add
      </button>
    </div>
  );
}
