# CSC490 WebUI

React + Vite + Tailwind frontend for the project.

## Getting started

**1. Go into the WebUI folder**

```bash
cd WebUI
```

(From the project root `CSC490`, that’s `cd WebUI`.)

**2. Install dependencies**

```bash
npm install
```

**3. Run the dev server**

```bash
npm run dev
```

Then open **http://localhost:5173** in your browser. The app will reload when you edit files.

### Firebase login

The app uses Firebase Authentication (email/password and Google). To enable it:

1. Create a project at [Firebase Console](https://console.firebase.google.com) and enable **Authentication** → Sign-in method → Email/Password and Google.
2. Copy `WebUI/.env.example` to `WebUI/.env` and fill in your Firebase config (Project settings → General → Your apps → Web app).
3. Set `VITE_API_URL=http://localhost:8000` so the frontend can call the backend to verify the token and sync the user to PostgreSQL.

Without a valid `.env`, the login page will load but sign-in will fail until the config is set.

---

## Other commands

| Command           | What it does                    |
|-------------------|---------------------------------|
| `npm run dev`     | Start dev server (Vite)         |
| `npm run build`   | Build for production            |
| `npm run preview` | Serve the production build      |
| `npm run lint`    | Run ESLint                      |

---

## Requirements

- **Node.js** (v18 or newer recommended)
- **npm** (comes with Node)

Check versions:

```bash
node -v
npm -v
```
