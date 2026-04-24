import { motion } from "framer-motion";

export default function Ring({ pct, size = 80, sw = 6, stroke, color = "var(--p)", trackColor = "var(--b1)", children }) {
  const s = stroke ?? sw;
  const r = (size - s) / 2, circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={s} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
          strokeWidth={s} strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (pct / 100) * circ }}
          transition={{ duration: 1.2, ease: [.22, 1, .36, 1], delay: .1 }}
          style={{ filter: `drop-shadow(0 0 6px ${color}55)` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}
