# MedTrack — CSC490 Group Project

A medication tracking and management platform consisting of a React web app and a native Android app, both backed by Supabase.

---

## Project Structure

```
CSC490/
├── MedTrack-Web/       # React + Vite web application
└── AndroidUI/          # Kotlin Android application
```

---

## MedTrack Web (`MedTrack-Web/`)

### Tech Stack

- **React 19** with React Router v7
- **Vite 5** as the build tool
- **Supabase** for authentication and database
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **Lucide React** for icons

### Features

- **Patient Dashboard** — daily medication adherence tracking, schedule overview, streak and analytics
- **Medication Manager** — add, edit, and delete medications with dosage, frequency, and reminder times
- **Schedule Page** — medications organized by time of day (morning, afternoon, evening, night)
- **Analytics Page** — weekly adherence charts and per-medication tracking
- **AI Health Advisor** — Claude-powered chat assistant with live FDA drug data integration
- **Doctor Portal** — patient list, clinical notes, and prescription creation
- **Pharmacist Portal** — prescription queue management with status tracking (pending → filling → ready → picked up)
- **Settings** — health profile, emergency contact, primary care assignment, notifications, dark/light mode, account deletion

### Prerequisites

- Node.js 18+
- npm

### Getting Started

**1. Install dependencies**

```bash
cd MedTrack-Web
npm install
```

**2. Set up environment variables**

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_anon_key
```

> Ask the team member who owns the Supabase project for the credentials. Never commit `.env` to the repo.

**3. Run the development server**

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server with HMR |
| `npm run build` | Build for production (outputs to `dist/`) |
| `npm run preview` | Preview the production build locally |

### Database Migrations

Supabase migrations are in `supabase/migrations/`. Run them in order against your Supabase project if setting up from scratch.

---

## MedTrack Android (`AndroidUI/`)

### Tech Stack

- **Kotlin**
- **Android SDK** (minSdk 26, targetSdk/compileSdk 35)
- **Supabase Kotlin SDK** (postgrest-kt, auth-kt) v3.0.1
- **Firebase** (Analytics, Auth, Firestore)
- **Ktor** Android client
- **Material Components 3**
- **View Binding**

### Features

- User login and registration via Supabase Auth
- Medication list with a RecyclerView
- Supabase client integration for data sync

### Prerequisites

- **Android Studio** Ladybug 2024.2.1 or newer
- **JDK 21** (configured in `gradle/gradle-daemon-jvm.properties`)
- An Android device or emulator running API 26+

### Getting Started

**1. Open the project correctly**

> ⚠️ Open the `AndroidUI/` folder directly in Android Studio — **not** any parent folder. Android Studio must see `build.gradle.kts` and `app/` at the root level.

- **File → Open**
- Navigate into and select the `AndroidUI/` folder
- Click **OK** and trust the project
- Wait for the Gradle sync to complete

**2. Add `google-services.json`**

The `app/google-services.json` file is required for Firebase. If it's missing from your clone, get it from the Firebase Console (Project Settings → Your App) and place it at `AndroidUI/app/google-services.json`.

**3. Run the app**

- Connect a device or start an emulator (**Tools → Device Manager**)
- Click the **Run** button or press **Shift+F10**

### Common Issues

| Problem | Fix |
|---------|-----|
| *"Non-Gradle Java modules"* error | You opened a parent folder. Close and reopen `AndroidUI/` directly. |
| *"Unresolved reference: compileSdkMinor"* | Downgrade AGP in root `build.gradle.kts` from `8.7.2` to `8.5.2`. |
| Emulator already running (process error) | Kill the existing emulator from Device Manager or Task Manager, then relaunch. |
| Gradle sync fails on first run | Go to **File → Project Structure → SDK Location** and confirm the Gradle JDK is set to JDK 21. |

### Useful Gradle Commands

Run from the `AndroidUI/` directory:

| Command | Description |
|---------|-------------|
| `./gradlew assembleDebug` | Build a debug APK |
| `./gradlew installDebug` | Build and install on a connected device/emulator |
| `./gradlew clean` | Delete build outputs |

> On Windows, use `gradlew.bat` instead of `./gradlew`.

---

## Shared Backend — Supabase

Both apps share the same Supabase project. Key tables include:

- `profiles` — user info, roles (patient / doctor / pharmacist), health profile, emergency contact
- `user_medications` — patient medication records
- `prescriptions` — prescription lifecycle managed between doctors and pharmacists
- `prescription_medications` — individual medications within a prescription
- `doctor_notes` — clinical notes written by doctors per patient
- `notifications` — in-app notifications per user
- `chats` — AI Health Advisor conversation history
- `feedback` — user-submitted feedback and ratings

User roles are `patient`, `doctor`, and `pharmacist`. Role-based access is enforced via Supabase RLS policies.

---

## Contributing

- Always open `AndroidUI/` in Android Studio (not the repo root).
- Never commit `.env` or any files containing API keys.
- Run `npm run build` before opening a PR for the web app to catch compile errors.
- Add new Supabase schema changes as numbered migration files in `supabase/migrations/`.
