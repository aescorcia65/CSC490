import { Capacitor } from "@capacitor/core";

export async function openExternalLink(url) {
  if (!url || typeof url !== "string") return;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return;

  try {
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: trimmed });
      return;
    }
  } catch (e) {
    console.warn("openExternalLink:", e);
  }

  const win = window.open(trimmed, "_blank", "noopener,noreferrer");
  if (win) win.opener = null;
}
