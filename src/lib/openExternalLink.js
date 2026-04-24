import { Capacitor } from "@capacitor/core";

/**
 * Open a trusted https URL in the system browser (native) or a new tab (web).
 * Avoids in-app WebView navigation that often shows “page not found” for external sites.
 */
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
