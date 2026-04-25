
Coding agent guidelines for the MedTrack-Web repository.


| Command              | Description                                      |
|----------------------|--------------------------------------------------|
| `npm run dev`        | Start Vite dev server with HMR                   |
| `npm run build`      | Production build to `dist/`                       |
| `npm run preview`    | Preview production build locally                  |
| `npm run cap:sync`   | Build + sync to Capacitor native projects         |
| `npm run cap:ios`    | Build + open in Xcode                             |
| `npm run cap:android`| Build + open in Android Studio                    |

**No test framework is configured.** There are no test files, no test runner, and no `test` script.
ESLint is configured (`eslint.config.js`, flat config) but there is no `lint` script; run manually with `npx eslint .` if needed.
Always run `npm run build` after changes to verify there are no compilation errors.


- **Framework**: React 19 (Vite 5, ESM)
- **Language**: JavaScript only (`.js` / `.jsx`). No TypeScript.
- **Routing**: react-router-dom v7
- **Backend**: Supabase (PostgreSQL, auth, realtime subscriptions)
- **Styling**: Inline `style={{}}` objects with CSS custom properties + Tailwind utility classes for layout
- **Animation**: framer-motion v11
- **Icons**: lucide-react
- **Mobile**: Capacitor (iOS + Android hybrid)
- **Deployment**: Vercel (SPA catch-all rewrite)


```
src/
├── main.jsx                 # Entry point (StrictMode)
├── App.jsx                  # Router + AuthProvider + routes
├── supabase.js              # Supabase client singleton
├── index.css                # Global CSS, Tailwind directives, component classes
├── components/              # Reusable UI (modals, common, ai, auth, appointments)
├── contexts/AuthContext.jsx # Global auth + user + meds state
├── hooks/                   # useClock, useIsMobile, useTheme
├── lib/                     # Utilities, Supabase helpers, constants, med database
├── pages/                   # Route-level pages (patient/, doctor/, pharmacist/)
└── routes/                  # ProtectedRoute, RoleProtectedRoute
supabase/migrations/         # Sequential SQL migrations (001–007)
```


- **Double quotes** everywhere (imports, strings, JSX attributes).
- **Semicolons** required at end of statements.
- **2-space indentation**.
- No enforced line length limit; long inline style objects on a single line are normal.
- Multiple short statements may share one line: `setBusy(true); setErr("");`

Keep this order (no blank lines between groups):
1. React: `import { useState, useEffect } from "react";`
2. Third-party: `framer-motion`, `lucide-react`, `react-router-dom`
3. Local (relative): supabase client, contexts, hooks, lib, components

- Use **function declarations** with **default export**: `export default function MyComponent({ prop1, prop2 }) {}`
- Destructure props in the function signature.
- No PropTypes or TypeScript interfaces.
- **Named exports** only for hooks and context: `export function useTheme()`, `export const useAuth = () => ...`

| What | Convention | Example |
|------|-----------|---------|
| Component files | PascalCase `.jsx` | `MedModal.jsx`, `Dashboard.jsx` |
| Hook files | camelCase `.js`, `use` prefix | `useClock.js`, `useIsMobile.js` |
| Lib/util files | camelCase `.js` | `adherence.js`, `constants.js` |
| Context files | PascalCase `.jsx` | `AuthContext.jsx` |
| Variables/functions | camelCase | `setBusy`, `medsLoaded` |
| Constants | UPPER_SNAKE_CASE | `COLS`, `TIPS`, `DOSAGE_UNITS` |
| CSS custom properties | `--short-abbrev` | `--t1`, `--p`, `--bg`, `--b1` |
| CSS classes | Short abbreviated names | `au`, `btn`, `inp`, `mo`, `ov`, `card` |

Short variable names are common in UI code: `t1` (text primary), `t3` (text muted), `b0`/`b1` (borders), `isMob` (mobile check), `m` (medication), `ms` (meds array).

- **AuthContext** for global state (user, role, meds, display name).
- **useState + useEffect** for component state. No Redux/Zustand.
- **localStorage** caching with `mt_` prefix for offline resilience.
- **useCallback** for handlers passed as props; **useMemo** for derived values.
- **Optimistic UI**: update React state first, then fire async Supabase call.

- Wrap all Supabase operations in **try/catch**.
- Log errors with descriptive prefix: `console.error("loadMedications error:", e);`
- Show user-facing errors via `err` state + `ErrBanner` component.
- Graceful fallbacks: return empty arrays/defaults on failure, fall back to localStorage cache.
- Retry logic in critical paths (e.g., `AuthContext.fetchProfile` retries up to 6 times with backoff).


- Single client in `src/supabase.js`; import as `import { supabase } from "../../supabase";`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- Queries: `.from("table").select()`, `.insert()`, `.update()`, `.delete()`, `.upsert()`
- RPC calls: `supabase.rpc("function_name", { p_param: value })`
- Realtime: `supabase.channel()` + `.on("postgres_changes", ...)` with cleanup via `supabase.removeChannel()`

- Location: `supabase/migrations/NNN_description.sql`
- Sequential numbering: `001`, `002`, ..., `007`
- Use `if not exists` / `create or replace` guards for idempotency.
- Enable RLS on every table: `alter table ... enable row level security;`
- Policy naming: `"<Role> can <action> <scope>"` (e.g., `"Users can read own medications"`)
- RPC functions: prefix with `get_`, parameters with `p_`, language `sql` or `plpgsql`, `security definer`
- All PKs: `uuid default gen_random_uuid()`; timestamps: `timestamptz default now()`


Three user roles stored in `profiles.role`:
| Role | Route | Color Theme |
|------|-------|------------|
| `patient` (aliased as `client` in code) | `/dashboard` | Blue (`--p: #2563eb`) |
| `doctor` | `/doctor` | Teal (`--doc-p: #0e7490`) |
| `pharmacist` | `/pharmacist` | Purple (`--pha-p: #7c3aed`) |

Routes are guarded by `ProtectedRoute` (auth check) and `RoleProtectedRoute` (role check).


Inline `style={{}}` using CSS custom properties is the primary method. Tailwind classes are used sparingly for layout (`flex`, `gap-2`, `items-center`). Global component classes are defined in `src/index.css` with terse names:
- `btn` / `btn-doc` / `btn-pha` — primary buttons per role
- `bto` — outline/ghost button
- `inp` — input fields
- `lbl` — labels
- `mo` / `ov` — modal / overlay
- `card` — card surface
- `au d1–d6` — staggered fade-up animation

Animation uses framer-motion: `motion.div` with `initial`/`animate`/`exit`, `AnimatePresence` for mount/unmount, `whileHover`/`whileTap` for micro-interactions.


- The `taken` state for medications is persisted to the `medication_logs` table, not just in-memory.
- On login, `AuthContext` loads today's taken status and merges it into the meds array.
- Analytics data (streak, weekly chart, per-med adherence) comes from DB functions, not hardcoded values.
- Prescription workflow: `pending_pharmacist → pending_fill → ready → filled → picked_up`. When `picked_up`, a DB trigger copies prescription meds into `user_medications`.
- The AI Health Advisor (`AIDrawer`) calls OpenAI GPT-4o-mini client-side using `VITE_OPENAI_API_KEY`.
