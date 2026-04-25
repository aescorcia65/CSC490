import { useId } from "react";
import { ECG_PATH_24, HEART_PATH_24 } from "./medicalHeartAssets";

export default function MedTrackHeartLogo({ size = 24, className, style, beat = false }) {
  const uid = useId().replace(/:/g, "");
  const traceClass = beat ? `medtrack-ecg-trace-${uid}` : undefined;

  return (
    <>
      {beat ? (
        <style>{`
          @keyframes medtrack-ecg-trace-${uid} {
            0%, 12% { stroke-dashoffset: 100; }
            42% { stroke-dashoffset: 0; }
            68% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: 100; }
          }
          .medtrack-ecg-trace-${uid} {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
            animation: medtrack-ecg-trace-${uid} 1.45s ease-in-out infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .medtrack-ecg-trace-${uid} {
              animation: none;
              stroke-dashoffset: 0;
            }
          }
        `}</style>
      ) : null}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={{ display: "block", ...style }}
        aria-hidden
      >
        <path
          d={HEART_PATH_24}
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          pathLength={100}
          d={ECG_PATH_24}
          className={traceClass}
          stroke="currentColor"
          strokeWidth="1.38"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          fill="none"
        />
      </svg>
    </>
  );
}
