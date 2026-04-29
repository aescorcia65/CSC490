import { useEffect, useState, useRef, useCallback } from "react";
import { motion, useMotionValue, useSpring, useMotionValueEvent } from "framer-motion";

const MASCOT_URL = `${import.meta.env.BASE_URL}medtrack-pill-mascot.svg`;

/**
 * @param {{
 *   light: boolean;
 *   w: number;
 *   h: number;
 *   fit: boolean;
 *   maxWidth: number;
 *   fitStyle: Record<string, unknown>;
 *   reduceMotion: boolean;
 *   aimX: import("framer-motion").MotionValue<number>;
 *   aimY: import("framer-motion").MotionValue<number>;
 * }} props
 */
function WalkthroughMascotInteractive({ light, w, h, fit, maxWidth, fitStyle, reduceMotion, aimX, aimY }) {
  const rootRef = useRef(null);
  const armDeg = useMotionValue(12);
  const armSpring = useSpring(armDeg, {
    stiffness: reduceMotion ? 380 : 210,
    damping: reduceMotion ? 40 : 28,
    mass: 0.45,
  });

  const updateArm = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const ax = aimX.get();
    const ay = aimY.get();
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const sx = r.left + r.width * 0.54;
    const sy = r.top + r.height * 0.44;
    const ang = Math.atan2(ay - sy, ax - sx) * (180 / Math.PI);
    armDeg.set(ang - 92);
  }, [aimX, aimY, armDeg]);

  useMotionValueEvent(aimX, "change", updateArm);
  useMotionValueEvent(aimY, "change", updateArm);

  useEffect(() => {
    updateArm();
    const onScroll = () => updateArm();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [updateArm]);

  const floatAmp = -2;
  const floatDuration = 5.4;

  const armGrad = light
    ? "linear-gradient(165deg, #bfdbfe 0%, #3b82f6 45%, #2563eb 100%)"
    : "linear-gradient(165deg, #7dd3fc 0%, #0ea5e9 40%, #1d4ed8 100%)";
  const handFill = light ? "#1e40af" : "#0c4a6e";

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
      <motion.img
        src={MASCOT_URL}
        alt=""
        aria-hidden
        width={fit ? maxWidth : w}
        height={fit ? undefined : h}
        draggable={false}
        style={{
          display: "block",
          position: "relative",
          zIndex: 1,
          pointerEvents: "none",
          userSelect: "none",
          transformOrigin: "50% 90%",
          filter: light ? undefined : "brightness(0.88) saturate(0.96)",
          ...fitStyle,
        }}
        animate={reduceMotion ? { y: 0 } : { y: [0, floatAmp, 0] }}
        transition={
          reduceMotion
            ? { duration: 0.2 }
            : { duration: floatDuration, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }
        }
      />

      <motion.div
        aria-hidden
        style={{
          position: "absolute",
          left: "48%",
          top: "36%",
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transformOrigin: "22% 8%",
          rotate: armSpring,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "clamp(7px, 9%, 14px)",
            height: "clamp(52px, 28%, 88px)",
            borderRadius: 999,
            background: armGrad,
            boxShadow: light ? "0 3px 10px rgba(37,99,235,.28)" : "0 3px 12px rgba(0,0,0,.35)",
          }}
        />
        <div
          style={{
            width: "clamp(12px, 11%, 18px)",
            height: "clamp(12px, 11%, 18px)",
            marginTop: -4,
            marginLeft: "12%",
            borderRadius: "50%",
            background: handFill,
            boxShadow: light ? "0 2px 6px rgba(15,23,42,.2)" : "0 2px 8px rgba(0,0,0,.4)",
          }}
        />
      </motion.div>
    </div>
  );
}

/**
 * Brand pill mascot (SVG in /public/medtrack-pill-mascot.svg).
 * `variant="leanCool"` — slight lean + softer float for the marketing demo beside the mockup.
 * `variant="walkthrough"` — straight body; CSS arm follows `aimX`/`aimY`. Pass motion values from parent.
 */
export default function FloatingPillMascot({
  light = true,
  width: w = 168,
  height: hProp,
  variant = "default",
  fit = false,
  maxWidth: maxWProp,
  fitObjectPosition = "50% 38%",
  pointRotate = 0,
  aimX: aimXProp,
  aimY: aimYProp,
}) {
  const h = hProp ?? w;
  const maxWidth = maxWProp ?? w;
  const [reduceMotion, setReduceMotion] = useState(false);
  const leanCool = variant === "leanCool";
  const walkthrough = variant === "walkthrough";
  const defaultAimX = useMotionValue(typeof window !== "undefined" ? window.innerWidth * 0.72 : 520);
  const defaultAimY = useMotionValue(typeof window !== "undefined" ? window.innerHeight * 0.45 : 380);
  const aimX = aimXProp ?? defaultAimX;
  const aimY = aimYProp ?? defaultAimY;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  let baseRotate = 0;
  if (walkthrough) baseRotate = 0;
  else if (leanCool) baseRotate = 5;

  const fitStyle = fit
    ? {
        height: "100%",
        width: "auto",
        maxWidth,
        objectFit: "contain",
        objectPosition: fitObjectPosition,
        flexShrink: 0,
      }
    : {
        width: w,
        height: h,
      };

  const floatAmp = walkthrough ? -2 : leanCool ? -2.5 : -3;
  const floatDuration = walkthrough ? 5.4 : leanCool ? 4.6 : 5.2;

  const transformOrigin = walkthrough ? "50% 90%" : leanCool ? "52% 88%" : "50% 90%";

  if (walkthrough) {
    return (
      <WalkthroughMascotInteractive
        light={light}
        w={w}
        h={h}
        fit={fit}
        maxWidth={maxWidth}
        fitStyle={fitStyle}
        reduceMotion={reduceMotion}
        aimX={aimX}
        aimY={aimY}
      />
    );
  }

  const img = (
    <motion.img
      src={MASCOT_URL}
      alt=""
      aria-hidden
      width={fit ? maxWidth : w}
      height={fit ? undefined : h}
      draggable={false}
      style={{
        display: "block",
        pointerEvents: "none",
        userSelect: "none",
        transformOrigin,
        filter: light ? undefined : "brightness(0.88) saturate(0.96)",
        ...fitStyle,
      }}
      animate={reduceMotion ? { y: 0 } : { y: [0, floatAmp, 0] }}
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : { duration: floatDuration, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }
      }
    />
  );

  if (leanCool) {
    return (
      <motion.div
        style={{ transformOrigin, lineHeight: 0 }}
        animate={{ rotate: baseRotate }}
        transition={{
          type: "tween",
          duration: reduceMotion ? 0.12 : 0,
          ease: [0.4, 0, 0.2, 1],
        }}
      >
        {img}
      </motion.div>
    );
  }

  return img;
}
