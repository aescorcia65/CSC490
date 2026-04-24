import { useId, useEffect, useState } from "react";
import { ECG_REFERENCE_HERO_PATH } from "./medicalHeartAssets";

/** Draw → hold full trace → quick reset → pause (steady cadence, ~52 BPM feel). */
const CYCLE_SEC = 1.15;
const KEY_DRAW_END = 0.72;
const KEY_HOLD_END = 0.78;
const KEY_RESET_END = 0.785;

/**
 * Login hero ECG — reference style: large white trace, cyan/blue neon glow,
 * draws left-to-right with a bright leading spark; translucent over page gradient.
 */
export default function AuthHeroGlassHeart({ light = true }) {
  const uid = useId().replace(/:/g, "");
  const pathId = `auth-ecg-hero-${uid}`;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const on = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const vbW = 320;
  const vbH = 90;
  const d = ECG_REFERENCE_HERO_PATH;
  const ghostStroke = light ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.14)";
  const traceStroke = light ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.9)";

  return (
    <svg
      width={520}
      height={148}
      viewBox={`0 0 ${vbW} ${vbH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{
        display: "block",
        maxWidth: "100%",
        height: "auto",
        overflow: "visible",
      }}
    >
      <defs>
        <filter
          id={`auth-ecg-neon-${uid}`}
          x="-45%"
          y="-45%"
          width="190%"
          height="190%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              0.9 0 0 0 0.15
              0 0.95 0 0 0.5
              0 0 1 0 0.95
              0 0 0 0.72 0"
            result="cyanGlow"
          />
          <feMerge>
            <feMergeNode in="cyanGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`auth-ecg-spark-${uid}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Faint full waveform — sits behind the draw, lets gradient show through */}
      <path
        d={d}
        stroke={ghostStroke}
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <g filter={`url(#auth-ecg-neon-${uid})`}>
        <path
          id={pathId}
          d={d}
          pathLength={100}
          stroke={traceStroke}
          strokeWidth={light ? 2.15 : 2.05}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={reduceMotion ? undefined : 100}
          strokeDashoffset={reduceMotion ? 0 : undefined}
        >
          {!reduceMotion && (
            <animate
              attributeName="stroke-dashoffset"
              values="100;0;0;100;100"
              keyTimes={`0;${KEY_DRAW_END};${KEY_HOLD_END};${KEY_RESET_END};1`}
              dur={`${CYCLE_SEC}s`}
              repeatCount="indefinite"
              calcMode="linear"
            />
          )}
        </path>
      </g>

      {!reduceMotion && (
        <circle r={5.2} fill="#ffffff" filter={`url(#auth-ecg-spark-${uid})`}>
          <animate
            attributeName="opacity"
            values="1;1;0;0"
            keyTimes={`0;${KEY_HOLD_END};${KEY_RESET_END};1`}
            dur={`${CYCLE_SEC}s`}
            repeatCount="indefinite"
            calcMode="linear"
          />
          <animateMotion
            dur={`${CYCLE_SEC}s`}
            repeatCount="indefinite"
            calcMode="linear"
            keyTimes={`0;${KEY_DRAW_END};${KEY_HOLD_END};${KEY_RESET_END};1`}
            keyPoints="0;1;1;0;0"
            rotate="auto"
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      )}
    </svg>
  );
}
