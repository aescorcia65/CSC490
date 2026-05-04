import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Auth from "../components/auth/Auth";
import { clearStoredPortalLandingPage } from "../lib/clearStoredPortalLandingPage";

export default function SigninPage() {
  const { user, userRole, onboardingComplete, profileLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user === undefined) return;
    if (!user) return;
    // Wait for the full profile to load before navigating — prevents
    // premature redirects when userRole comes from cache but
    // onboardingComplete is still null (treated as falsy → wrong /onboarding redirect).
    if (!profileLoaded) return;
    if (!onboardingComplete) {
      navigate("/onboarding", { replace: true });
      return;
    }
    clearStoredPortalLandingPage(user.id);
    if (userRole === "doctor") {
      navigate("/doctor", { replace: true });
      return;
    }
    if (userRole === "pharmacist") {
      navigate("/pharmacist", { replace: true });
      return;
    }
    navigate("/dashboard", { replace: true });
  }, [user, userRole, onboardingComplete, profileLoaded, navigate]);

  if (user && user !== undefined) {
    if (!profileLoaded) {
      return (
        <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--pd)", border: "1px solid rgba(37,99,235,.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "var(--p)", fontSize: 24 }}>⋯</span>
          </div>
          <p style={{ color: "var(--t3)", fontSize: 12, letterSpacing: ".05em" }}>Loading your account…</p>
        </div>
      );
    }
    return null;
  }

  return <Auth authMode="signin" />;
}
