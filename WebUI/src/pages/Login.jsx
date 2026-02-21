import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

export default function Login() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password)
      } else {
        await signInWithEmail(email, password)
      }
    } catch (err) {
      setError(err.message || 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err.message || 'Google sign in failed')
    } finally {
      setBusy(false)
    }
  }

  const switchMode = () => {
    setIsSignUp((prev) => !prev)
    setError('')
  }

  return (
    <div className="h-screen w-full flex flex-row bg-slate-950 overflow-hidden">
      {/* Left: Branding — always visible on desktop */}
      <aside
        className="w-[420px] flex-shrink-0 flex flex-col justify-between p-12 bg-gradient-to-br from-slate-900 via-indigo-950/30 to-slate-900 border-r border-slate-800/80"
        aria-hidden
      >
        <div>
          <span className="text-xl font-semibold text-white tracking-tight">CSC490</span>
        </div>
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-white leading-tight max-w-sm">
            Sign in to your account
          </h2>
          <p className="text-slate-400 text-base max-w-sm">
            Use email or Google to get started. Your data stays secure with Firebase and your team backend.
          </p>
        </div>
        <p className="text-slate-500 text-sm">
          CSC490 · Senior project
        </p>
      </aside>

      {/* Right: Form area — centered on desktop */}
      <main className="flex-1 min-h-0 flex flex-col items-center justify-center px-12 py-10 overflow-y-auto">
        <div className="w-full max-w-[420px]">

          {/* Login card */}
          <div
            className="rounded-2xl bg-slate-800/90 border border-slate-700/80 shadow-xl shadow-black/20 p-8 sm:p-10"
            role="article"
            aria-label={isSignUp ? 'Create account' : 'Sign in'}
          >
            <h1 className="text-2xl font-semibold text-white mb-1">
              {isSignUp ? 'Create an account' : 'Welcome back'}
            </h1>
            <p className="text-slate-400 text-sm mb-6">
              {isSignUp
                ? 'Enter your details to get started.'
                : 'Enter your email and password to sign in.'}
            </p>

            {error && (
              <div
                className="mb-5 p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm flex items-start gap-2"
                role="alert"
              >
                <span className="shrink-0 mt-0.5" aria-hidden>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  disabled={busy}
                  className="w-full rounded-lg bg-slate-700/80 border border-slate-600 text-white placeholder-slate-500 px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60 transition-colors"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-300">
                    Password
                  </label>
                  {!isSignUp && (
                    <a
                      href="#"
                      className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline focus:outline-none focus:underline"
                      onClick={(e) => e.preventDefault()}
                    >
                      Forgot password?
                    </a>
                  )}
                </div>
                <input
                  id="login-password"
                  type="password"
                  name="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  disabled={busy}
                  minLength={6}
                  className="w-full rounded-lg bg-slate-700/80 border border-slate-600 text-white placeholder-slate-500 px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60 transition-colors"
                />
                {isSignUp && (
                  <p className="mt-1.5 text-xs text-slate-500">At least 6 characters</p>
                )}
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-lg bg-indigo-600 text-white font-medium text-[15px] hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-60 disabled:pointer-events-none transition-colors"
              >
                {busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
              </button>
            </form>

            <div className="relative my-6" aria-hidden>
              <span className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-600" />
              </span>
              <span className="relative flex justify-center">
                <span className="bg-slate-800 px-3 text-sm text-slate-500">or continue with</span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="w-full py-3 rounded-lg bg-slate-700/80 border border-slate-600 text-white font-medium text-[15px] hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-60 disabled:pointer-events-none transition-colors flex items-center justify-center gap-3"
            >
              <GoogleIcon />
              Google
            </button>

            <p className="mt-6 text-center text-sm text-slate-400">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={switchMode}
                className="text-indigo-400 hover:text-indigo-300 hover:underline focus:outline-none focus:underline font-medium"
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-slate-500">
            By continuing, you agree to use this app for course purposes.
          </p>
        </div>
      </main>
    </div>
  )
}
