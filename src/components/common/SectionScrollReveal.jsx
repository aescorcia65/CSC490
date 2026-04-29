import { motion } from "framer-motion";

const DURATION = 0.48;
const EASE = [0.25, 0.1, 0.25, 1];
const Y_OFFSET = 20;

/**
 * Shared enter/leave: opacity + translateY only. Same animation for Portal Preview and Benefits.
 */
export default function SectionScrollReveal({ visible, reduceMotion, style, className, children }) {
  return (
    <motion.div
      initial={false}
      animate={
        reduceMotion
          ? { opacity: 1, y: 0 }
          : { opacity: visible ? 1 : 0, y: visible ? 0 : Y_OFFSET }
      }
      transition={{ duration: reduceMotion ? 0.01 : DURATION, ease: EASE }}
      className={className}
      style={{ willChange: reduceMotion ? undefined : "transform, opacity", ...style }}
    >
      {children}
    </motion.div>
  );
}
