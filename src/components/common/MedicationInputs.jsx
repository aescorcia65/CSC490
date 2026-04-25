import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search } from "lucide-react";
import { searchMedications, DOSAGE_UNITS, FREQUENCY_OPTIONS } from "../../lib/medicationDatabase";

export function MedAutocomplete({ value, onChange, onSelect, style }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  const handleChange = useCallback((e) => {
    const v = e.target.value;
    onChange(v);
    if (v.trim().length >= 1) {
      const results = searchMedications(v, 8);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
      setActiveIdx(-1);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  }, [onChange]);

  const pick = useCallback((med) => {
    onChange(med.name);
    onSelect(med);
    setSuggestions([]);
    setShowDropdown(false);
    setActiveIdx(-1);
  }, [onChange, onSelect]);

  const handleKeyDown = useCallback((e) => {
    if (!showDropdown || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }, [showDropdown, suggestions, activeIdx, pick]);

  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.children[activeIdx];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative", ...style }}>
      <div style={{ position: "relative" }}>
        <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--t3)", pointerEvents: "none", opacity: 0.5 }} />
        <input
          className="inp"
          placeholder="Search medication name..."
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length) setShowDropdown(true); }}
          style={{ paddingLeft: 30 }}
          autoComplete="off"
        />
      </div>
      {showDropdown && (
        <div ref={listRef} style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,.15)", maxHeight: 220, overflowY: "auto",
          marginTop: 4
        }}>
          {suggestions.map((med, idx) => (
            <button key={med.name} type="button" onClick={() => pick(med)}
              style={{
                width: "100%", textAlign: "left", padding: "9px 12px", border: "none",
                background: idx === activeIdx ? "var(--s2)" : "transparent",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                borderBottom: idx < suggestions.length - 1 ? "1px solid var(--b0)" : "none",
                transition: "background .1s",
              }}
              onMouseEnter={() => setActiveIdx(idx)}
            >
              <div>
                <span style={{ color: "var(--t1)", fontSize: 13, fontWeight: 500 }}>{med.name}</span>
                <span style={{ color: "var(--t3)", fontSize: 11, marginLeft: 8 }}>{med.category}</span>
              </div>
              <span style={{ color: "var(--t3)", fontSize: 11, whiteSpace: "nowrap" }}>
                {med.defaultDosage} {med.defaultUnit}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DosageSelector({ dosageAmount, dosageUnit, commonDosages, onAmountChange, onUnitChange, style }) {
  return (
    <div style={style}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          className="inp"
          type="text"
          inputMode="decimal"
          placeholder="Amount"
          value={dosageAmount}
          onChange={e => onAmountChange(e.target.value)}
          style={{ flex: 1 }}
        />
        <div style={{ position: "relative", minWidth: 130 }}>
          <select
            className="inp"
            value={dosageUnit}
            onChange={e => onUnitChange(e.target.value)}
            style={{ appearance: "none", paddingRight: 28, cursor: "pointer", width: "100%", height: "100%" }}
          >
            {DOSAGE_UNITS.map(u => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
          <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--t3)" }} />
        </div>
      </div>
      {commonDosages && commonDosages.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {commonDosages.map(d => (
            <button key={d} type="button" onClick={() => onAmountChange(d)}
              style={{
                padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer",
                border: dosageAmount === d ? "1px solid var(--p)" : "1px solid var(--b1)",
                background: dosageAmount === d ? "rgba(37,99,235,.1)" : "var(--s2)",
                color: dosageAmount === d ? "var(--p)" : "var(--t3)",
                transition: "all .15s",
              }}
            >
              {d} {dosageUnit}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FrequencySelect({ value, onChange, style }) {
  return (
    <div style={{ position: "relative", ...style }}>
      <select
        className="inp"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ appearance: "none", paddingRight: 28, cursor: "pointer", width: "100%" }}
      >
        <option value="">Select frequency...</option>
        {value && !FREQUENCY_OPTIONS.includes(value) && (
          <option value={value}>{value}</option>
        )}
        {FREQUENCY_OPTIONS.map(f => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--t3)" }} />
    </div>
  );
}
