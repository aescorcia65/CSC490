import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RoleProtectedRoute } from "./routes/RoleProtectedRoute";
import "./index.css";

const HomePage = lazy(() => import("./pages/HomePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SigninPage = lazy(() => import("./pages/SigninPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const PatientDashboard = lazy(() => import("./pages/patient/PatientDashboard"));
const DoctorDashboardContent = lazy(() => import("./pages/doctor/DoctorDashboardContent"));
const PharmacistDashboardContent = lazy(() => import("./pages/pharmacist/PharmacistDashboardContent"));

function RouteLoadingFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
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
      <p style={{ color: "var(--t3)", fontSize: 12, letterSpacing: ".05em" }}>Loading…</p>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signin" element={<SigninPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/onboarding" element={<ProtectedRoute requireOnboarding={false}><OnboardingPage /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><RoleProtectedRoute requiredRole="client"><PatientDashboard /></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/doctor" element={<ProtectedRoute><RoleProtectedRoute requiredRole="doctor"><DoctorDashboardContent /></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/pharmacist" element={<ProtectedRoute><RoleProtectedRoute requiredRole="pharmacist"><PharmacistDashboardContent /></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
