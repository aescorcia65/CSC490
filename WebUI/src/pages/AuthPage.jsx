import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useProfile } from '../hooks/useProfile.js'
import { getDashboardPath } from '../lib/roles.js'

const SEX_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const ROLE_OPTIONS = [
  { value: 'patient', label: 'Patient', description: 'Track my medications and refills' },
  { value: 'doctor', label: 'Doctor', description: 'Prescribe medications for patients' },
  { value: 'pharmacist', label: 'Pharmacist', description: 'Fill prescriptions and notify patients' },
]

export function AuthPage() {
  const { user, loading: authLoading, signIn, signUp } = useAuth()
  const { profile, loading: profileLoading, saveProfile } = useProfile(user?.id)
  const navigate = useNavigate()

  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'onboarding'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [signUpSuccess, setSignUpSuccess] = useState(false)
  const [onboarding, setOnboarding] = useState({
    first_name: '',
    last_name: '',
    age: '',
    sex: '',
    role: 'patient',
  })
  const [onboardingError, setOnboardingError] = useState('')
  const [saving, setSaving] = useState(false)

  const needsOnboarding = user && !profileLoading && !profile?.first_name
  const hasProfile = user && !profileLoading && profile?.first_name

  useEffect(() => {
    if (!user || profileLoading) return
    if (needsOnboarding) setMode('onboarding')
    else if (hasProfile) navigate(getDashboardPath(profile?.role), { replace: true })
  }, [user, profileLoading, needsOnboarding, hasProfile, profile?.role, navigate])

  async function handleAuthSubmit(e) {
    e.preventDefault()
    setError('')
    setSignUpSuccess(false)
    try {
      if (mode === 'signup') {
        const { error: err } = await signUp({ email, password })
        if (err) setError(err.message)
        else {
          setSignUpSuccess(true)
          setMode('signin')
        }
      } else {
        const { error: err } = await signIn({ email, password })
        if (err) setError(err.message)
      }
    } catch {
      setError('Something went wrong')
    }
  }

  async function handleOnboardingSubmit(e) {
    e.preventDefault()
    setOnboardingError('')
    const age = onboarding.age === '' ? null : parseInt(onboarding.age, 10)
    if (age !== null && (isNaN(age) || age < 1 || age > 120)) {
      setOnboardingError('Please enter a valid age (1–120).')
      return
    }
    if (!onboarding.first_name?.trim()) {
      setOnboardingError('First name is required.')
      return
    }
    setSaving(true)
    try {
      await saveProfile({
        first_name: onboarding.first_name.trim(),
        last_name: onboarding.last_name.trim() || null,
        age: age ?? null,
        sex: onboarding.sex || null,
        role: onboarding.role || 'patient',
        email: user?.email?.toLowerCase() ?? null,
      })
      navigate(getDashboardPath(onboarding.role || 'patient'), { replace: true })
    } catch (err) {
      setOnboardingError(err?.message || 'Failed to save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || (user && profileLoading && !needsOnboarding)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-600 font-medium">Loading...</div>
      </div>
    )
  }

  if (mode === 'onboarding') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-8">
          <h1 className="text-2xl font-semibold text-slate-800 text-center mb-1">
            Tell us a bit about you
          </h1>
          <p className="text-center text-slate-600 text-sm mb-6">
            This helps us personalize your experience.
          </p>
          <form onSubmit={handleOnboardingSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-slate-700 mb-1">
                  First name <span className="text-red-500">*</span>
                </label>
                <input
                  id="first_name"
                  type="text"
                  placeholder="Jane"
                  value={onboarding.first_name}
                  onChange={(e) => setOnboarding((p) => ({ ...p, first_name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-slate-700 mb-1">
                  Last name
                </label>
                <input
                  id="last_name"
                  type="text"
                  placeholder="Doe"
                  value={onboarding.last_name}
                  onChange={(e) => setOnboarding((p) => ({ ...p, last_name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="age" className="block text-sm font-medium text-slate-700 mb-1">
                Age
              </label>
              <input
                id="age"
                type="number"
                min="1"
                max="120"
                placeholder="25"
                value={onboarding.age}
                onChange={(e) => setOnboarding((p) => ({ ...p, age: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="sex" className="block text-sm font-medium text-slate-700 mb-1">
                Sex
              </label>
              <select
                id="sex"
                value={onboarding.sex}
                onChange={(e) => setOnboarding((p) => ({ ...p, sex: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {SEX_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                I am a
              </label>
              <div className="space-y-2">
                {ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                      onboarding.role === opt.value
                        ? 'border-emerald-500 bg-emerald-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={opt.value}
                      checked={onboarding.role === opt.value}
                      onChange={() => setOnboarding((p) => ({ ...p, role: opt.value }))}
                      className="mt-1 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-medium text-slate-800">{opt.label}</span>
                      <p className="text-xs text-slate-500">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            {onboardingError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {onboardingError}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <Link to="/" className="text-lg font-semibold text-slate-800 hover:text-emerald-600">
            MedTrack
          </Link>
        </div>
        <h1 className="text-2xl font-semibold text-slate-800 text-center mb-1">
          {mode === 'signup' ? 'Create your account' : 'Sign in'}
        </h1>
        <p className="text-center text-slate-600 text-sm mb-6">
          {mode === 'signup'
            ? 'Already have an account? Sign in below or switch to sign in.'
            : "Don't have an account? Switch to sign up."}
        </p>
        <form onSubmit={handleAuthSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {signUpSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3 text-sm text-emerald-800">
              Thanks for signing up! Please check your email for confirmation, then sign in below.
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            {signUpSuccess ? 'Sign in' : mode === 'signup' ? 'Sign up' : 'Sign in'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-600">
          {signUpSuccess ? "Ready to sign in?" : mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); setSignUpSuccess(false) }}
            className="font-medium text-emerald-600 hover:text-emerald-700"
          >
            {mode === 'signup' ? 'Sign in' : 'Sign up'}
          </button>
        </p>
        <p className="mt-3 text-center">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
