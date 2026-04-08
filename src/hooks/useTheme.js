import { useState, useCallback } from "react";

const STORAGE_KEY = "mt_theme";

function getSavedTheme() {
  try {
    localStorage.removeItem("mt_login_light");
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  document.body.className = theme === "light" ? "light" : "";
}

export function useTheme() {
  const [isLight, setIsLight] = useState(() => {
    const theme = getSavedTheme();
    applyTheme(theme);
    return theme === "light";
  });

  const setLight = useCallback((wantsLight) => {
    applyTheme(wantsLight ? "light" : "dark");
    setIsLight(wantsLight);
  }, []);

  return [isLight, setLight];
}

export function getIsLight() {
  return getSavedTheme() === "light";
}