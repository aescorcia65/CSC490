import { useId, useEffect, useState } from "react";
import { ECG_REFERENCE_HERO_PATH } from "./medicalHeartAssets";

const DEFAULT_CYCLE_SEC = 1.75;
const KEY_DRAW_END = 0.72;
const KEY_HOLD_END = 0.78;
const KEY_RESET_END = 0.785;

/** `clinicalBlue`: vivid blue trace for light backgrounds (sign-in hero); default white trace is for dark/contrast areas. `cycleSec`: full draw/hold/reset loop duration in seconds. */
export default function AuthHeroGlassHeart({ light = true, clinicalBlue = false, cycleSec = DEFAULT_CYCLE_SEC }) {
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
  const clinical = clinicalBlue && light;
  const ghostStroke = clinical
    ? "rgba(37,99,235,0.22)"
    : light
      ? "rgba(255,255,255,0.2)"
      : "rgba(255,255,255,0.14)";
  const traceStroke = clinical ? "#2563eb" : light ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.9)";
  const traceWidth = clinical ? 2.25 : light ? 2.15 : 2.05;

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
        <filter id={`auth-ecg-orb-${uid}`} x="-220%" y="-220%" width="540%" height="540%">
          <feGaussianBlur stdDeviation="1.8" />
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
          strokeWidth={traceWidth}
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
              dur={`${cycleSec}s`}
              repeatCount="indefinite"
              calcMode="linear"
            />
          )}
        </path>
      </g>

      {!reduceMotion && (
        <circle r={5.2} fill={clinical ? "#eff6ff" : "#ffffff"} filter={`url(#auth-ecg-spark-${uid})`}>
          <animate
            attributeName="opacity"
            values="1;1;0;0"
            keyTimes={`0;${KEY_HOLD_END};${KEY_RESET_END};1`}
            dur={`${cycleSec}s`}
            repeatCount="indefinite"
            calcMode="linear"
          />
          <animateMotion
            dur={`${cycleSec}s`}
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
