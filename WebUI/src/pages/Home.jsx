import { useAuth } from '../context/AuthContext'

export default function Home() {
  const { backendUser, user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold">CSC490</h1>
          <button
            onClick={signOut}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
          >
            Sign out
          </button>
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-6">
          <h2 className="text-lg font-medium text-slate-300 mb-2">You’re signed in</h2>
          <p className="text-slate-400 text-sm">
            Backend user (from PostgreSQL):{' '}
            <span className="text-white">
              {backendUser?.display_name || backendUser?.email || backendUser?.id || '—'}
            </span>
          </p>
          <p className="text-slate-400 text-sm mt-1">
            Firebase UID: <span className="text-white font-mono text-xs">{user?.uid}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
