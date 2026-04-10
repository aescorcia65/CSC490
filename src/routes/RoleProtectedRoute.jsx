import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function RoleProtectedRoute({ children, requiredRole }) {
  const { user, userRole, onboardingComplete, profileLoaded } = useAuth();

  if (user === undefined || !profileLoaded || userRole === null) return null;

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
