import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Onboarding from "../components/auth/Onboarding";

export default function OnboardingPage() {
  const { user, profileData, setOnboardingComplete, setDisplayName } = useAuth();
  const navigate = useNavigate();

  function handleComplete({ first_name } = {}) {
    setOnboardingComplete(true);
    const name = first_name || profileData?.first_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
    if (name) setDisplayName(name);
    navigate("/", { replace: true });
  }

  return (
    <Onboarding
      user={user}
      initialProfile={profileData}
      onComplete={handleComplete}
    />
  );
}
