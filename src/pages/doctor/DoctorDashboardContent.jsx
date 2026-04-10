import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import DoctorPortal from "./DoctorPortal";

export default function DoctorDashboardContent() {
  const { user, displayName, setDisplayName } = useAuth();
  const [light, setLight] = useTheme();
  const userName = displayName || user?.email?.split("@")[0] || "";
  return <DoctorPortal user={user} light={light} setLight={setLight} userName={userName} setDisplayName={setDisplayName} />;
}
