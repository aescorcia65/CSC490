import { useState, useEffect } from "react";

export function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 820);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 820);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mob;
}
