import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useProfile } from '../hooks/useProfile.js'
import { getPrescriptionsForDoctor, createPrescription } from '../lib/prescriptions.js'
import { getProfileByEmail } from '../lib/profile.js'

export function DoctorDashboard() {
  const { user, signOut } = useAuth()
  const { profile, loading: profileLoading } = useProfile(user?.id)
  const navigate = useNavigate()
  const [prescriptions, setPrescriptions] = useState([])
  const [loadingRx, setLoadingRx] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [patientEmail, setPatientEmail] = useState('')
  const [patientLookup, setPatientLookup] = useState(null)
  const [lookupError, setLookupError] = useState('')
  const [medications, setMedications] = useState([{ medication_name: '', dosage: '', frequency: '', instructions: '' }])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!user?.id) return
    let ignore = false
    getPrescriptionsForDoctor(user.id)
      .then((data) => { if (!ignore) setPrescriptions(data || []) })
      .catch(() => { if (!ignore) setPrescriptions([]) })
      .finally(() => { if (!ignore) setLoadingRx(false) })
    return () => { ignore = true }
  }, [user?.id])

  async function handleLookupPatient() {
    setLookupError('')
    setPatientLookup(null)
    if (!patientEmail.trim()) return
    try {
      const p = await getProfileByEmail(patientEmail.trim())
      if (!p) {
        setLookupError('No patient found with that email.')
        return
      }
      if (p.role !== 'patient') {
        setLookupError('That account is not a patient.')
        return
      }
      setPatientLookup(p)
    } catch {
      setLookupError('Lookup failed. Try again.')
    }
  }

  function addMedicationRow() {
    setMedications((prev) => [...prev, { medication_name: '', dosage: '', frequency: '', instructions: '' }])
  }

  function updateMedication(i, field, value) {
    setMedications((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: value }
      return next
    })
  }

  async function handleCreatePrescription(e) {
    e.preventDefault()
    setSubmitError('')
    if (!patientLookup?.id) return
    const meds = medications.filter((m) => m.medication_name?.trim())
    if (meds.length === 0) {
      setSubmitError('Add at least one medication.')
      return
    }
    setSubmitting(true)
    try {
      await createPrescription(user.id, {
        patientId: patientLookup.id,
        medications: meds.map((m) => ({
          medication_name: m.medication_name.trim(),
          dosage: m.dosage?.trim() || null,
          frequency: m.frequency?.trim() || null,
          instructions: m.instructions?.trim() || null,
        })),
        notes: notes.trim() || null,
      })
      const list = await getPrescriptionsForDoctor(user.id)
      setPrescriptions(list || [])
      setShowForm(false)
      setPatientEmail('')
      setPatientLookup(null)
      setMedications([{ medication_name: '', dosage: '', frequency: '', instructions: '' }])
      setNotes('')
    } catch (err) {
      setSubmitError(err?.message || 'Failed to create prescription.')
    } finally {
      setSubmitting(false)
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/doctor" className="text-lg font-semibold text-slate-800">
            MedTrack — Doctor
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
          Welcome, {displayName !== user?.email ? displayName : 'Doctor'}
        </h1>
        <p className="mt-1 text-slate-600">Create prescriptions and notify the pharmacy.</p>

        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-6 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-700"
          >
            New prescription
          </button>
        ) : (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-slate-800">New prescription</h2>
            <form onSubmit={handleCreatePrescription} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient email</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="patient@example.com"
                    value={patientEmail}
                    onChange={(e) => { setPatientEmail(e.target.value); setPatientLookup(null); setLookupError('') }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleLookupPatient}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Look up
                  </button>
                </div>
                {lookupError && <p className="mt-1 text-sm text-red-600">{lookupError}</p>}
                {patientLookup && (
                  <p className="mt-1 text-sm text-emerald-600">
                    Patient: {patientLookup.first_name} {patientLookup.last_name} ({patientLookup.email})
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">Medications</label>
                  <button type="button" onClick={addMedicationRow} className="text-sm text-emerald-600 hover:text-emerald-700">
                    + Add medication
                  </button>
                </div>
                <div className="mt-2 space-y-3">
                  {medications.map((m, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3">
                      <input
                        type="text"
                        placeholder="Medication name *"
                        value={m.medication_name}
                        onChange={(e) => updateMedication(i, 'medication_name', e.target.value)}
                        className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Dosage"
                        value={m.dosage}
                        onChange={(e) => updateMedication(i, 'dosage', e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Frequency"
                        value={m.frequency}
                        onChange={(e) => updateMedication(i, 'frequency', e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Instructions"
                        value={m.instructions}
                        onChange={(e) => updateMedication(i, 'instructions', e.target.value)}
                        className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              {submitError && <p className="text-sm text-red-600">{submitError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!patientLookup || submitting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Sending…' : 'Send to pharmacy'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setPatientLookup(null); setLookupError(''); setSubmitError('') }}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">Prescriptions you’ve sent</h2>
          {loadingRx ? (
            <p className="mt-4 text-slate-500">Loading…</p>
          ) : prescriptions.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-slate-500">
              No prescriptions yet. Create one to notify the pharmacy.
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {prescriptions.map((rx) => (
                <li key={rx.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">ID: {rx.id?.slice(0, 8)}…</span>
                    <span className="capitalize font-medium text-slate-700">{rx.status?.replace('_', ' ')}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {(rx.prescription_medications || []).map((m) => (
                      <li key={m.id}>{m.medication_name}{m.dosage && ` — ${m.dosage}`}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
