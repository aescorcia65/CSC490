import { useState, useLayoutEffect } from "react";

/** ~20–30% visibility: fine-grained ratios so we can test >= minVisibleRatio */
const THRESHOLDS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

const MAX_RAF_RETRIES = 30;

/**
 * Match default viewport IntersectionObserver ratio (intersection area / target area).
 * Used so the first paint is correct even when the browser defers the initial IO callback.
 */
function getViewportIntersectionRatio(el) {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return 0;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x1 = Math.max(0, r.left);
  const y1 = Math.max(0, r.top);
  const x2 = Math.min(w, r.right);
  const y2 = Math.min(h, r.bottom);
  const iw = Math.max(0, x2 - x1);
  const ih = Math.max(0, y2 - y1);
  return (iw * ih) / (r.width * r.height);
}

/**
 * True when the observed element’s intersection ratio is at or above the minimum (e.g. 0.25 ≈ 25% visible).
 * Fires on every enter/leave so content can reset and replay when scrolling away and back.
 * @param {React.RefObject<HTMLElement | null>} elementRef
 * @param {{ minVisibleRatio?: number, enabled?: boolean }} [options]
 */
export function useSectionScrollReveal(elementRef, options = {}) {
  const { minVisibleRatio = 0.25, enabled = true } = options;
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    if (!enabled) {
      setVisible(false);
      return undefined;
    }

    let observer = null;
    let raf = 0;
    let rafCount = 0;

    const apply = (el) => {
      setVisible(getViewportIntersectionRatio(el) >= minVisibleRatio);
    };

    const onIntersect = (entries) => {
      const e = entries[0];
      if (!e) return;
      setVisible(e.intersectionRatio >= minVisibleRatio);
    };

    const connect = (el) => {
      apply(el);
      observer = new IntersectionObserver(onIntersect, {
        root: null,
        rootMargin: "0px",
        threshold: THRESHOLDS,
      });
      observer.observe(el);
    };

    const tryConnect = () => {
      raf = 0;
      const el = elementRef.current;
      if (el) {
        connect(el);
        return;
      }
      rafCount += 1;
      if (rafCount < MAX_RAF_RETRIES) {
        raf = requestAnimationFrame(tryConnect);
      }
    };

    if (elementRef.current) {
      connect(elementRef.current);
    } else {
      raf = requestAnimationFrame(tryConnect);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
    };
  }, [elementRef, enabled, minVisibleRatio]);

  return visible;
}
