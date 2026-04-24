import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

function RoleLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--pd)", border: "1px solid rgba(37,99,235,.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--p)", fontSize: 24 }}>⋯</span>
      </div>
      <p style={{ color: "var(--t3)", fontSize: 12, letterSpacing: ".05em" }}>Loading…</p>
    </div>
  );
}

export function RoleProtectedRoute({ children, requiredRole }) {
  const { user, userRole, onboardingComplete, profileLoaded } = useAuth();

  if (user === undefined || !profileLoaded || userRole === null) {
    return <RoleLoading />;
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!onboardingComplete) return <Navigate to="/onboarding" replace />;

  const normalise = (r) => (r === "patient" ? "client" : r);
  const actual = normalise(userRole);
  const required = normalise(requiredRole);

  if (actual !== required) {
    if (actual === "doctor") return <Navigate to="/doctor" replace />;
    if (actual === "pharmacist") return <Navigate to="/pharmacist" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
