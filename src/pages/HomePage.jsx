import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import MarketingLanding from "../components/auth/MarketingLanding";

const authedLoading = (
  <div
    style={{
      minHeight: "100dvh",
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 16,
    }}
  >
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: 16,
        background: "var(--pd)",
        border: "1px solid rgba(37,99,235,.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ color: "var(--p)", fontSize: 24 }}>⋯</span>
    </div>
    <p style={{ color: "var(--t3)", fontSize: 12, letterSpacing: ".05em" }}>Loading your account…</p>
  </div>
);

/**
 * Marketing home for logged-out visitors. If a session exists (e.g. OAuth return to `/`),
 * send users to onboarding or their role home so signing back in always reaches the app (patients → `/dashboard`).
 * On mobile, skip the marketing page and go straight to sign-in.
 */
export default function HomePage() {
  const { user, userRole, onboardingComplete, profileLoaded } = useAuth();
  const navigate = useNavigate();
  const [isMobile] = useState(() => window.innerWidth < 760);

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      return;
    }
    if (!profileLoaded) return;
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
  }, [user, userRole, onboardingComplete, profileLoaded, navigate, isMobile]);

  if (user && user !== undefined) {
    if (!profileLoaded) {
      return authedLoading;
    }
    return null;
  }

  return <MarketingLanding />;
}
