import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function ProtectedRoute({ children, requireOnboarding = true }) {
  const { user, onboardingComplete, profileLoaded } = useAuth();
  const location = useLocation();

  if (user === undefined || (user && !profileLoaded)) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--pd)", border: "1px solid rgba(37,99,235,.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "var(--p)", fontSize: 24 }}>⋯</span>
        </div>
        <p style={{ color: "var(--t3)", fontSize: 12, letterSpacing: ".05em" }}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireOnboarding && !onboardingComplete) {
    if (location.pathname === "/onboarding") return children;
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
