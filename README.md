# MedTrack (CSC 490)

MedTrack is a medication adherence and care-coordination web app. Patients manage daily schedules, log doses, see analytics, and use light-weight health tools; doctors and pharmacists use separate portals tied to the same Supabase backend (prescriptions, appointments, messaging). The stack is React (Vite), Supabase (auth, Postgres, realtime), Tailwind for layout utilities, and Capacitor for optional iOS/Android builds.

**Production:** [https://csc-490.vercel.app](https://csc-490.vercel.app)

## Local development

```bash
npm install
npm run dev
```

Use `npm run build` before shipping changes. Environment variables for the client are documented in the project (e.g. `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`). See `AGENTS.md` for repository conventions and architecture notes.
