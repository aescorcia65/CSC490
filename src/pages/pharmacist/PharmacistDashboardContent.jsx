import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import PharmacistPortal from "./PharmacistPortal";

export default function PharmacistDashboardContent() {
  const { user, displayName, setDisplayName } = useAuth();
  const [light, setLight] = useTheme();
  const userName = displayName || user?.email?.split("@")[0] || "";
  return <PharmacistPortal user={user} light={light} setLight={setLight} userName={userName} setDisplayName={setDisplayName} />;
}
