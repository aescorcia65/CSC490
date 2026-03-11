import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ProtectedRoute } from "./ProtectedRoute";
import LoginPage from "../pages/LoginPage";
import OnboardingPage from "../pages/OnboardingPage";
import PatientDashboardPage from "../pages/PatientDashboardPage";
import DoctorDashboardPage from "../pages/DoctorDashboardPage";
import PharmacistDashboardPage from "../pages/PharmacistDashboardPage";

/**
 * Root redirect: send user to the right place by auth and role.
 */
function RootRedirect() {
  const { user, userRole, onboardingComplete } = useAuth();
  if (user === undefined) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />;
  if (userRole === "doctor") return <Navigate to="/doctor" replace />;
  if (userRole === "pharmacist") return <Navigate to="/pharmacist" replace />;
  return <Navigate to="/dashboard" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute requireOnboarding={false}>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <PatientDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/doctor"
        element={
          <ProtectedRoute>
            <DoctorDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pharmacist"
        element={
          <ProtectedRoute>
            <PharmacistDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
