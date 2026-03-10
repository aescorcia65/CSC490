import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useProfile } from '../hooks/useProfile.js'
import { getPrescriptionsForPatient } from '../lib/prescriptions.js'
import { getNotifications } from '../lib/notifications.js'

export function PatientDashboard() {
  const { user, signOut } = useAuth()
  const { profile, loading: profileLoading, saveProfile } = useProfile(user?.id)
  const navigate = useNavigate()
  const [prescriptions, setPrescriptions] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loadingRx, setLoadingRx] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    let ignore = false
    async function load() {
      try {
        const [rx, notifs] = await Promise.all([
          getPrescriptionsForPatient(user.id),
          getNotifications(user.id),
        ])
        if (!ignore) {
          setPrescriptions(rx || [])
          setNotifications(notifs || [])
        }
      } catch {
        if (!ignore) setPrescriptions([])
      } finally {
        if (!ignore) setLoadingRx(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [user?.id])

  useEffect(() => {
    if (profile?.notifications_enabled != null) setNotificationsEnabled(profile.notifications_enabled)
  }, [profile?.notifications_enabled])

  async function toggleNotifications() {
    const next = !notificationsEnabled
    setNotificationsEnabled(next)
    try {
      await saveProfile({ notifications_enabled: next })
    } catch {
      setNotificationsEnabled(!next)
    }
  }

  function handleSignOut() {
    signOut()
    navigate('/')
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 font-medium">Loading...</div>
      </div>
    )
  }

  const displayName =
    profile?.first_name || profile?.last_name
      ? [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
      : user?.email

  const currentMeds = prescriptions.filter(
    (p) => p.status === 'ready' || p.status === 'filled' || p.status === 'pending_fill'
  )
  const pendingAtPharmacy = prescriptions.filter((p) => p.status === 'pending_pharmacist')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/dashboard" className="text-lg font-semibold text-slate-800">
            MedTrack
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-slate-800">
          Welcome back{displayName !== user?.email ? `, ${displayName}` : ''}
        </h1>
        <p className="mt-1 text-slate-600">Your medications and refills</p>

        {/* Notifications toggle */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-slate-800">Medication reminders</h2>
              <p className="text-sm text-slate-500">Get notified when to take your meds</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notificationsEnabled}
              onClick={toggleNotifications}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                notificationsEnabled ? 'bg-emerald-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  notificationsEnabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Current medications */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">Current medications</h2>
          <p className="mt-1 text-sm text-slate-500">Prescribed meds and take schedules (coming soon)</p>
          {loadingRx ? (
            <p className="mt-4 text-slate-500">Loading…</p>
          ) : currentMeds.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-slate-500">
              No active medications. When your doctor adds a prescription and the pharmacy fills it, it will appear here.
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {currentMeds.map((rx) => (
                <li key={rx.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-800 capitalize">{rx.status.replace('_', ' ')}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {(rx.prescription_medications || []).map((m) => (
                      <li key={m.id}>
                        {m.medication_name}
                        {m.dosage && ` — ${m.dosage}`}
                        {m.frequency && `, ${m.frequency}`}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pending at pharmacy */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">Pending at pharmacy</h2>
          <p className="mt-1 text-sm text-slate-500">Prescriptions waiting to be filled</p>
          {!loadingRx && pendingAtPharmacy.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-slate-500">
              No prescriptions pending at the pharmacy.
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {pendingAtPharmacy.map((rx) => (
                <li key={rx.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                  <span className="text-sm font-medium text-amber-800">Waiting to be filled</span>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {(rx.prescription_medications || []).map((m) => (
                      <li key={m.id}>
                        {m.medication_name}
                        {m.dosage && ` — ${m.dosage}`}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Notifications list */}
        {notifications.length > 0 && (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-slate-800">Recent notifications</h2>
            <ul className="mt-4 space-y-2">
              {notifications.slice(0, 5).map((n) => (
                <li
                  key={n.id}
                  className={`rounded-lg border p-3 text-sm ${n.read_at ? 'border-slate-200 bg-slate-50/50' : 'border-slate-200 bg-white'}`}
                >
                  <span className="font-medium text-slate-800">{n.title}</span>
                  {n.body && <p className="text-slate-600">{n.body}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
