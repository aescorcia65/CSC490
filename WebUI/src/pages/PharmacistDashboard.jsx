import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useProfile } from '../hooks/useProfile.js'
import {
  getPrescriptionsForPharmacist,
  claimPrescription,
  markPrescriptionReady,
} from '../lib/prescriptions.js'
import { createNotification } from '../lib/notifications.js'

export function PharmacistDashboard() {
  const { user, signOut } = useAuth()
  const { profile, loading: profileLoading } = useProfile(user?.id)
  const navigate = useNavigate()
  const [prescriptions, setPrescriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  useEffect(() => {
    if (!user?.id) return
    let ignore = false
    getPrescriptionsForPharmacist(user.id)
      .then((data) => { if (!ignore) setPrescriptions(data || []) })
      .catch(() => { if (!ignore) setPrescriptions([]) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [user?.id])

  async function handleClaim(rx) {
    setActing(rx.id)
    try {
      await claimPrescription(rx.id, user.id)
      setPrescriptions((prev) =>
        prev.map((p) =>
          p.id === rx.id ? { ...p, pharmacist_id: user.id, status: 'pending_fill' } : p
        )
      )
    } finally {
      setActing(null)
    }
  }

  async function handleMarkReady(rx) {
    setActing(rx.id)
    try {
      await markPrescriptionReady(rx.id)
      setPrescriptions((prev) =>
        prev.map((p) => (p.id === rx.id ? { ...p, status: 'ready' } : p))
      )
      await createNotification({
        userId: rx.patient_id,
        type: 'prescription_ready',
        title: 'Prescription ready',
        body: 'Your prescription is ready for pickup.',
        relatedId: rx.id,
      })
    } finally {
      setActing(null)
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

  const unclaimed = prescriptions.filter((p) => p.status === 'pending_pharmacist' && !p.pharmacist_id)
  const myPending = prescriptions.filter((p) => p.pharmacist_id === user?.id && (p.status === 'pending_pharmacist' || p.status === 'pending_fill'))
  const ready = prescriptions.filter((p) => p.status === 'ready')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/pharmacist" className="text-lg font-semibold text-slate-800">
            MedTrack — Pharmacist
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
          Welcome, {displayName !== user?.email ? displayName : 'Pharmacist'}
        </h1>
        <p className="mt-1 text-slate-600">Fill prescriptions and notify patients when ready.</p>

        {/* New prescriptions (unclaimed) */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">New from doctors</h2>
          <p className="mt-1 text-sm text-slate-500">Claim a prescription to start filling it.</p>
          {loading ? (
            <p className="mt-4 text-slate-500">Loading…</p>
          ) : unclaimed.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-slate-500">
              No new prescriptions from doctors.
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {unclaimed.map((rx) => (
                <li key={rx.id} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <ul className="text-sm text-slate-700">
                        {(rx.prescription_medications || []).map((m) => (
                          <li key={m.id}>
                            {m.medication_name}
                            {m.dosage && ` — ${m.dosage}`}
                            {m.frequency && `, ${m.frequency}`}
                          </li>
                        ))}
                      </ul>
                      {rx.notes && <p className="mt-1 text-xs text-slate-500">{rx.notes}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={acting === rx.id}
                      onClick={() => handleClaim(rx)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {acting === rx.id ? 'Claiming…' : 'Claim'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* My prescriptions to fill */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">In progress</h2>
          <p className="mt-1 text-sm text-slate-500">Mark ready when filled so the patient gets notified.</p>
          {!loading && myPending.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-slate-500">
              No prescriptions in progress.
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {myPending.map((rx) => (
                <li key={rx.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                  <ul className="text-sm text-slate-700">
                    {(rx.prescription_medications || []).map((m) => (
                      <li key={m.id}>
                        {m.medication_name}
                        {m.dosage && ` — ${m.dosage}`}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={acting === rx.id}
                    onClick={() => handleMarkReady(rx)}
                    className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {acting === rx.id ? 'Updating…' : 'Mark ready — notify patient'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ready for pickup */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">Ready for pickup</h2>
          {ready.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-slate-500">
              None yet.
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {ready.map((rx) => (
                <li key={rx.id} className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
                  {(rx.prescription_medications || []).map((m) => m.medication_name).join(', ')}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
