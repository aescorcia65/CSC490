import { useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import PharmacistPortal from "./PharmacistPortal";

export default function PharmacistDashboardContent() {
  const { user, displayName, setDisplayName } = useAuth();
  const [light, setLight] = useTheme();
  const userName = displayName || user?.email?.split("@")[0] || "";
  useEffect(() => {
    if (!user?.id) return;
    const key = `mt_theme_user_${user.id}`;
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") {
      const wantsLight = saved === "light";
      if (wantsLight !== light) setLight(wantsLight);
      return;
    }
    localStorage.setItem(key, light ? "light" : "dark");
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(`mt_theme_user_${user.id}`, light ? "light" : "dark");
  }, [user?.id, light]);
  return <PharmacistPortal user={user} light={light} setLight={setLight} userName={userName} setDisplayName={setDisplayName} />;
}
