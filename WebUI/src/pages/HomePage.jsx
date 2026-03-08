import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold text-slate-800">MedTrack</span>
          <nav className="flex gap-4">
            <Link
              to="/auth"
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Keep track of your medications
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-600">
            A simple way to manage refills, schedules, and reminders—so you never miss a dose.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="rounded-lg bg-emerald-600 px-6 py-3 text-base font-medium text-white hover:bg-emerald-700"
            >
              Get started
            </Link>
            <Link
              to="/auth"
              className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Filler */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-2xl font-semibold text-slate-800">Why MedTrack?</h2>
          <p className="mt-4 text-slate-600 leading-relaxed">
            Managing multiple medications can be overwhelming. MedTrack helps you stay on top of
            refills, track what you take and when, and prepare for doctor visits with a clear
            history. This platform will grow to support reminders, refill alerts, and more—all
            in one place.
          </p>
          <p className="mt-4 text-slate-600 leading-relaxed">
            Create an account to get started. Your data stays private and is stored securely.
            Patients, doctors, and pharmacists each get a dedicated dashboard—sign up and choose your role.
          </p>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-slate-500">
          MedTrack — medication tracking, simplified.
        </div>
      </footer>
    </div>
  )
}
