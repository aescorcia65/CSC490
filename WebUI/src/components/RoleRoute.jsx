import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useProfile } from '../hooks/useProfile.js'
import { getDashboardPath } from '../lib/roles.js'

/**
 * Renders children only if the current user has the required role; otherwise redirects to their dashboard.
 */
export function RoleRoute({ role, children }) {
  const { user } = useAuth()
  const { profile, loading } = useProfile(user?.id)

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 font-medium">Loading...</div>
      </div>
    )
  }

  if (profile.role !== role) {
    return <Navigate to={getDashboardPath(profile.role)} replace />
  }

  return children
}
