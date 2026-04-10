import { useState, useEffect } from "react";
import { to12h } from "../../lib/utils";

export default function TimePicker({ value, onChange }) {
  const [use12, setUse12] = useState(() => localStorage.getItem("mt_time_fmt") === "12");
  const [h, setH] = useState("08");
  const [m, setM] = useState("00");
  const [ampm, setAmpm] = useState("AM");

  useEffect(() => {
    if (!value) return;
    const [hh, mm] = value.split(":").map(Number);
    const hNum = hh || 0, mNum = mm || 0;
    if (use12) {
      const ap = hNum < 12 ? "AM" : "PM";
      const h12 = hNum % 12 === 0 ? 12 : hNum % 12;
      setH(String(h12).padStart(2, "0"));
      setM(String(mNum).padStart(2, "0"));
      setAmpm(ap);
    } else {
      setH(String(hNum).padStart(2, "0"));
      setM(String(mNum).padStart(2, "0"));
    }
  }, [value, use12]);

  function emit(hh, mm, ap) {
    let hNum = parseInt(hh) || 0;
    const mNum = parseInt(mm) || 0;
    if (use12) {
      if (ap === "AM" && hNum === 12) hNum = 0;
      if (ap === "PM" && hNum !== 12) hNum += 12;
    }
    onChange(`${String(hNum).padStart(2, "0")}:${String(mNum).padStart(2, "0")}`);
  }

  function toggleFmt() {
    const next = !use12;
    localStorage.setItem("mt_time_fmt", next ? "12" : "24");
    setUse12(next);
  }

  const iStyle = {
    padding: "9px 10px", background: "var(--s2)", border: "1.5px solid var(--b1)",
    borderRadius: 9, color: "var(--t1)", fontFamily: "inherit", fontSize: 14,
    outline: "none", width: "62px", textAlign: "center", transition: "border-color .18s"
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <label className="lbl" style={{ margin: 0 }}>Time</label>
        <div style={{ display: "flex", gap: 4 }}>
          <button className={`time-mode-btn ${!use12 ? "active" : ""}`} onClick={() => { if (use12) toggleFmt(); }}>24h</button>
          <button className={`time-mode-btn ${use12 ? "active" : ""}`} onClick={() => { if (!use12) toggleFmt(); }}>AM/PM</button>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input style={iStyle} value={h} maxLength={2}
          onChange={e => { setH(e.target.value); emit(e.target.value, m, ampm); }}
          onFocus={e => e.target.select()} placeholder={use12 ? "8" : "08"} />
        <span style={{ color: "var(--t3)", fontWeight: 700, fontSize: 16 }}>:</span>
        <input style={iStyle} value={m} maxLength={2}
          onChange={e => { setM(e.target.value); emit(h, e.target.value, ampm); }}
          onFocus={e => e.target.select()} placeholder="00" />
        {use12 && (
          <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
            {["AM", "PM"].map(ap => (
              <button key={ap} onClick={() => { setAmpm(ap); emit(h, m, ap); }}
                style={{
                  padding: "8px 11px", borderRadius: 8, border: "1.5px solid",
                  borderColor: ampm === ap ? "var(--p)" : "var(--b1)",
                  background: ampm === ap ? "var(--pd)" : "transparent",
                  color: ampm === ap ? "var(--p)" : "var(--t3)",
                  fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .15s"
                }}>
                {ap}
              </button>
            ))}
          </div>
        )}
      </div>
      <p style={{ color: "var(--t3)", fontSize: 11, marginTop: 5 }}>
        = {to12h(value)} (24-hour: {value})
      </p>
    </div>
  );
}
