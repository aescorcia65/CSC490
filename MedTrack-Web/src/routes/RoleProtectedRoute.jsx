import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

/**
 * Renders children only if the current user's role matches requiredRole.
 * Use inside ProtectedRoute. On every load/refresh, redirects to "/" if role doesn't match,
 * so RootRedirect can send the user to the correct dashboard.
 * @param {{ requiredRole: "client" | "doctor" | "pharmacist", children: React.ReactNode }} props
 */
export function RoleProtectedRoute({ requiredRole, children }) {
  const { userRole } = useAuth();

  if (userRole == null) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--pd)", border: "1px solid rgba(37,99,235,.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "var(--p)", fontSize: 24 }}>⋯</span>
        </div>
        <p style={{ color: "var(--t3)", fontSize: 12, letterSpacing: ".05em" }}>Loading…</p>
      </div>
    );
  }

  if (userRole !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return children;
}
