import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

const KEY_EXPLICIT = "mt_theme_explicit";
const KEY_LEGACY = "mt_theme";

export function readExplicitPreference() {
  try {
    localStorage.removeItem("mt_login_light");
    const ex = localStorage.getItem(KEY_EXPLICIT);
    if (ex === "light" || ex === "dark") return ex;
    const leg = localStorage.getItem(KEY_LEGACY);
    if (leg === "light" || leg === "dark") {
      localStorage.setItem(KEY_EXPLICIT, leg);
      localStorage.removeItem(KEY_LEGACY);
      return leg;
    }
  } catch {
  }
  return null;
}

export function getSystemPrefersDark() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveInitialIsLight() {
  const ex = readExplicitPreference();
  if (ex === "dark") return false;
  if (ex === "light") return true;
  return !getSystemPrefersDark();
}

export function applyDomTheme(isLight) {
  const dark = !isLight;
  try {
    document.documentElement.classList.toggle("theme-dark", dark);
    document.documentElement.classList.toggle("theme-light", isLight);
    document.documentElement.style.colorScheme = isLight ? "light" : "dark";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isLight ? "#2563eb" : "#1e293b");
  } catch {
  }
  document.body.className = isLight ? "light" : "";
}

function persistExplicitPreference(isLight) {
  try {
    localStorage.setItem(KEY_EXPLICIT, isLight ? "light" : "dark");
    localStorage.removeItem(KEY_LEGACY);
  } catch {
  }
}

export function getIsLight() {
  const ex = readExplicitPreference();
  if (ex === "dark") return false;
  if (ex === "light") return true;
  return !getSystemPrefersDark();
}

export function ThemeProvider({ children }) {
  const [isLight, setIsLightState] = useState(() => {
    const light = resolveInitialIsLight();
    applyDomTheme(light);
    return light;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readExplicitPreference() != null) return;
      const light = !mq.matches;
      applyDomTheme(light);
      setIsLightState(light);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setLight = useCallback((wantsLight) => {
    persistExplicitPreference(wantsLight);
    applyDomTheme(wantsLight);
    setIsLightState(wantsLight);
  }, []);

  const value = useMemo(() => [isLight, setLight], [isLight, setLight]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx == null) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
