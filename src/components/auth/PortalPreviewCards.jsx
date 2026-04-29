import { motion } from "framer-motion";

/** Kept for any CTA timing; matches How It Works card stagger. */
export const PORTAL_CARD_STAGGER_S = 0.09;
/** Card reveal duration; matches How It Works. */
export const PORTAL_CARD_DURATION_S = 0.52;

/**
 * Portal Preview: same motion language as the "How It Works" section
 * (whileInView, stagger, hover lift + shadow). Transform + opacity only for motion.
 */
export default function PortalPreviewCards({ items, light, reduceMotion, isMob }) {
  const baseShadow = light ? "0 4px 16px rgba(15,23,42,.06)" : "0 6px 18px rgba(2,6,23,.32)";
  const cardShadowHover = light ? "0 14px 32px rgba(15,23,42,.13)" : "0 16px 36px rgba(2,6,23,.46)";
  const ease = [0.4, 0, 0.2, 1];
  const portalViewport = { once: false, amount: 0.22, margin: "0px 0px -8% 0px" };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMob ? "1fr" : "repeat(3,minmax(0,1fr))",
        gap: 14,
        position: "relative",
        zIndex: 1,
      }}
    >
      {items.map(({ I: Icon, title: pTitle, desc: pDesc }, idx) => (
        <motion.div
          key={pTitle}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={portalViewport}
          transition={{
            duration: reduceMotion ? 0.01 : PORTAL_CARD_DURATION_S,
            delay: reduceMotion ? 0 : idx * PORTAL_CARD_STAGGER_S,
            ease,
          }}
          whileHover={
            reduceMotion
              ? undefined
              : {
                  y: -3,
                  boxShadow: cardShadowHover,
                  transition: { duration: 0.22, ease },
                }
          }
          style={{
            borderRadius: 16,
            padding: "18px 16px",
            background: light ? "#ffffff" : "rgba(15,23,42,.7)",
            border: `1px solid ${light ? "#dbeafe" : "rgba(148,163,184,.2)"}`,
            boxShadow: baseShadow,
            position: "relative",
            willChange: reduceMotion ? undefined : "transform, opacity",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: light ? "rgba(37,99,235,.11)" : "rgba(14,165,233,.16)",
              }}
            >
              <Icon size={17} color={light ? "#1d4ed8" : "#7dd3fc"} />
            </div>
            <h3 style={{ margin: 0, fontSize: 17, color: light ? "#0f172a" : "#e2e8f0" }}>{pTitle}</h3>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: light ? "#475569" : "#94a3b8" }}>{pDesc}</p>
        </motion.div>
      ))}
    </div>
  );
}
