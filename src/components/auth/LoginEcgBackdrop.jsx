import { useId } from "react";

/**
 * @param {{ light: boolean, variant?: "desktop" | "mobile" | "hero-gutter", gutterGapPx?: number, gutterColFr?: [number, number] }} props
 */
export default function LoginEcgBackdrop({
  light,
  variant = "desktop",
  gutterGapPx = 24,
  gutterColFr = [1.05, 1.2],
}) {
  const id = useId().replace(/:/g, "");
  const gradId = `login-ecg-grad-${id}`;
  const blurId = `login-ecg-blur-${id}`;

  const isHeroGutter = variant === "hero-gutter";
  const isDesktop = variant === "desktop" || isHeroGutter;

  const segmentD =
    "M0,50 L52,50 C58,50 62,48 66,45 C70,42 74,44 78,50 L86,50 L88,46 L90,24 L93,76 L96,40 L100,50 L118,50 C128,50 134,46 140,50 C146,54 152,50 162,50 L320,50";

  const [fr1, fr2] = gutterColFr;
  const frSum = fr1 + fr2;

  const wrapStyle = isHeroGutter
    ? {
        position: "absolute",
        left: `calc((100% - ${gutterGapPx}px) * ${fr1} / ${frSum})`,
        width: `calc(${gutterGapPx}px + clamp(28px, 6vw, 72px))`,
        top: "clamp(56px, 15%, 132px)",
        height: "clamp(52px, 9vh, 96px)",
        zIndex: 1,
        pointerEvents: "none",
        opacity: light ? 0.88 : 0.72,
      }
    : variant === "desktop"
    ? {
        position: "absolute",
        left: "4%",
        right: "8%",
        top: "42%",
        height: "clamp(64px, 12vh, 120px)",
        zIndex: 1,
        pointerEvents: "none",
        opacity: light ? 0.9 : 0.75,
      }
    : {
        position: "relative",
        width: "100%",
        height: 44,
        flexShrink: 0,
        marginTop: 4,
        marginBottom: 2,
        pointerEvents: "none",
        opacity: light ? 0.55 : 0.45,
      };

  return (
    <div className="login-ecg-backdrop" aria-hidden style={wrapStyle}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 320 100"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", overflow: "hidden" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={light ? "#bfdbfe" : "#3b82f6"} stopOpacity={light ? 0.5 : 0.32} />
            <stop offset="50%" stopColor={light ? "#93c5fd" : "#6366f1"} stopOpacity={light ? 0.42 : 0.28} />
            <stop offset="100%" stopColor={light ? "#a5b4fc" : "#8b5cf6"} stopOpacity={light ? 0.38 : 0.26} />
          </linearGradient>
          <filter id={blurId} x="-5%" y="-25%" width="110%" height="150%">
            <feGaussianBlur stdDeviation={isDesktop ? (light ? 1.1 : 0.85) : 0.55} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#${blurId})`}>
          <g className="login-ecg-track">
            <path
              d={segmentD}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={isDesktop ? 1.85 : 1.35}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={segmentD}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={isDesktop ? 1.85 : 1.35}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              transform="translate(320 0)"
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              from="0 0"
              to="-320 0"
              dur={isDesktop ? "2.75s" : "3.1s"}
              repeatCount="indefinite"
              calcMode="linear"
            />
          </g>
        </g>
      </svg>
      <style>{`
        .login-ecg-track {
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
