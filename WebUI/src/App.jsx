import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HomePage } from './pages/HomePage.jsx'
import { AuthPage } from './pages/AuthPage.jsx'
import { PatientDashboard } from './pages/PatientDashboard.jsx'
import { DoctorDashboard } from './pages/DoctorDashboard.jsx'
import { PharmacistDashboard } from './pages/PharmacistDashboard.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { RoleRoute } from './components/RoleRoute.jsx'
import { ROLES } from './lib/roles.js'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <RoleRoute role={ROLES.patient}>
                <PatientDashboard />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor"
          element={
            <ProtectedRoute>
              <RoleRoute role={ROLES.doctor}>
                <DoctorDashboard />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pharmacist"
          element={
            <ProtectedRoute>
              <RoleRoute role={ROLES.pharmacist}>
                <PharmacistDashboard />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
