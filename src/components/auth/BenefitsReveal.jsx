import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const easeOut = [0.25, 0.1, 0.25, 1];
const TEXT_DURATION = 0.52;
const TEXT_STAGGER = 0.09;
const UNDERLINE_DURATION = 0.48;
const CIRCLE_DRAW = 0.38;
const CHECK_DRAW = 0.28;
const CIRCLE_TO_CHECK_GAP = 0.02;
const POP_DURATION = 0.42;

/** Thin left→right underline under the Benefits title (transform: scaleX). */
export function BenefitsAnimatedTitle({ children, benefitsSeen, reduceMotion, titleStyle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2
        style={{
          margin: 0,
          display: "inline-block",
          position: "relative",
          paddingBottom: 6,
          ...titleStyle,
        }}
      >
        <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
        <motion.span
          aria-hidden
          initial={false}
          animate={benefitsSeen ? { scaleX: 1 } : { scaleX: reduceMotion ? 1 : 0 }}
          transition={{
            duration: reduceMotion ? 0.05 : UNDERLINE_DURATION,
            ease: easeOut,
          }}
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            height: 2,
            width: "100%",
            borderRadius: 1,
            background: "currentColor",
            opacity: 0.35,
            transformOrigin: "left center",
            willChange: "transform",
          }}
        />
      </h2>
    </div>
  );
}

/**
 * Checkmark drawn with stroke (pathLength), then tiny scale pop on the icon.
 */
export function BenefitsDrawCheck({ color, active, reduceMotion, index }) {
  const baseDelay = reduceMotion ? 0 : 0.14 + index * TEXT_STAGGER;
  const checkDelay = baseDelay + CIRCLE_DRAW + CIRCLE_TO_CHECK_GAP;
  const popDelay = checkDelay + CHECK_DRAW + 0.04;

  return (
    <motion.svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      aria-hidden
      initial={false}
      animate={
        active && !reduceMotion
          ? { scale: [1, 1.05, 1] }
          : { scale: 1 }
      }
      transition={{
        duration: POP_DURATION,
        delay: reduceMotion ? 0 : active ? popDelay : 0,
        times: [0, 0.42, 1],
        ease: [0.34, 1.2, 0.64, 1],
      }}
      style={{ flexShrink: 0, marginTop: 1, overflow: "visible", display: "block", color }}
    >
      <motion.circle
        cx="12"
        cy="12"
        r="9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        initial={false}
        animate={
          active && !reduceMotion
            ? { pathLength: 1 }
            : { pathLength: reduceMotion ? 1 : 0 }
        }
        transition={{
          pathLength: {
            duration: reduceMotion ? 0 : CIRCLE_DRAW,
            delay: baseDelay,
            ease: easeOut,
          },
        }}
      />
      <motion.path
        d="M8 12.5 L10.5 15 L16 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={
          active && !reduceMotion
            ? { pathLength: 1 }
            : { pathLength: reduceMotion ? 1 : 0 }
        }
        transition={{
          pathLength: {
            duration: reduceMotion ? 0 : CHECK_DRAW,
            delay: reduceMotion ? 0 : checkDelay,
            ease: easeOut,
          },
        }}
      />
    </motion.svg>
  );
}

/** Benefit body copy — soft fade only. */
export function BenefitsFadeText({ children, benefitsSeen, reduceMotion, index, color }) {
  const delay = reduceMotion ? 0 : 0.12 + index * TEXT_STAGGER;
  return (
    <motion.p
      initial={false}
      animate={benefitsSeen ? { opacity: 1 } : { opacity: reduceMotion ? 1 : 0 }}
      transition={{
        duration: reduceMotion ? 0.01 : TEXT_DURATION,
        delay,
        ease: easeOut,
      }}
      style={{
        margin: 0,
        fontSize: 14,
        lineHeight: 1.62,
        color,
        willChange: reduceMotion ? undefined : "opacity",
      }}
    >
      {children}
    </motion.p>
  );
}

/**
 * One-time subtle light sweep across the card row (transform only on translate; opacity static low).
 */
export function BenefitsLightSweep({ show, light, reduceMotion, replayKey = 0 }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!show || reduceMotion) {
      setPhase(0);
      return undefined;
    }
    setPhase(0);
    const sweepMs =
      (0.12 +
        2 * TEXT_STAGGER +
        TEXT_DURATION +
        CIRCLE_DRAW +
        CHECK_DRAW +
        POP_DURATION +
        0.14) *
      1000;
    const id = window.setTimeout(() => setPhase(1), sweepMs);
    return () => window.clearTimeout(id);
  }, [show, reduceMotion, replayKey]);

  if (reduceMotion || !show) return null;

  return (
    <motion.div
      aria-hidden
      initial={{ x: "-110%" }}
      animate={phase === 1 ? { x: "110%" } : { x: "-110%" }}
      transition={{ duration: 0.82, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: light ? 0.55 : 0.45,
        background: light
          ? "linear-gradient(100deg, transparent 34%, rgba(255,255,255,.75) 50%, transparent 66%)"
          : "linear-gradient(100deg, transparent 36%, rgba(148,163,184,.22) 50%, transparent 64%)",
        mixBlendMode: light ? "overlay" : "soft-light",
        willChange: "transform",
      }}
    />
  );
}
