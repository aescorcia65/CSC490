import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Auth from "../components/auth/Auth";

export default function LoginPage() {
  const { user, userRole, onboardingComplete } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user === undefined) return;
    if (!user) return;
    if (!onboardingComplete) {
      navigate("/onboarding", { replace: true });
      return;
    }
    if (userRole === "doctor") {
      navigate("/doctor", { replace: true });
      return;
    }
    if (userRole === "pharmacist") {
      navigate("/pharmacist", { replace: true });
      return;
    }
    navigate("/dashboard", { replace: true });
  }, [user, userRole, onboardingComplete, navigate]);

  if (user && user !== undefined) return null;
  return <Auth />;
}
