# CSC490 Backend — FastAPI Skeleton

A minimal FastAPI template so the group can see how each part of the project fits together.

## Quick start

```bash
cd Backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

- API: http://127.0.0.1:8000  
- Interactive docs: http://127.0.0.1:8000/docs  

### PostgreSQL and Supabase (auth)

1. **PostgreSQL (Supabase)**: In Supabase, get your Postgres connection string and set in `.env`:
   ```bash
   DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/csc490
   ```
   Tables (e.g. `users`) are created on startup.

2. **Supabase Auth**: In Supabase Auth settings, copy the JWT secret and set in `.env`:
   ```bash
   SUPABASE_JWT_SECRET=your_supabase_jwt_secret_here
   ```
   The backend verifies Supabase access tokens from the frontend and stores/updates users in Postgres.

---

## Project structure and components

```
Backend/
├── main.py                 # Entry point: creates app, CORS, mounts routers
├── requirements.txt        # Python dependencies
├── README.md               # This file
└── app/
    ├── __init__.py
    ├── config.py           # Settings (env vars, .env)
    ├── models/             # Request/response schemas (Pydantic)
    │   ├── __init__.py
    │   └── item.py
    ├── routers/            # API route handlers (endpoints)
    │   ├── __init__.py
    │   ├── health.py       # /health, /health/ready
    │   └── items.py        # /api/items (example CRUD)
    └── services/           # Business logic (reusable, testable)
        ├── __init__.py
        └── item_service.py
```

### 1. `main.py` — Application entry point

- Creates the FastAPI app and sets title, description, version.
- Adds CORS so the WebUI (e.g. Vite on port 5173) can call the API.
- **Includes routers**: each router is a set of related endpoints (e.g. `/health`, `/api/items`).

**To add a new feature:** create a router in `app/routers/`, then `app.include_router(...)` in `main.py`.

---

### 2. `app/config.py` — Configuration

- Holds settings that may change per environment (dev/staging/prod).
- Uses **Pydantic Settings** to read from environment variables and optionally a `.env` file.
- Use `settings` everywhere you need config (e.g. `from app.config import settings`).

**When you add a DB:** add something like `database_url: str` here and load it from env.

---

### 3. `app/models/` — Schemas (request/response)

- **Pydantic models** that describe:
  - **Request bodies** (e.g. `ItemCreate`: name, description).
  - **Response bodies** (e.g. `ItemResponse`: id, name, description).
- FastAPI uses these for:
  - Validation (invalid data → 422).
  - OpenAPI docs at `/docs`.

**Convention:** one file per “resource” or domain (e.g. `item.py`, `user.py`).

---

### 4. `app/routers/` — API endpoints

- Each file is a **router**: a group of related routes.
- Routers define:
  - **URL path** and **HTTP method** (GET, POST, etc.).
  - Which **models** to use for body in/out.
  - **Thin handlers**: parse input, call a **service**, return a response (or raise `HTTPException`).

**Flow:** Request → Router → Service → Model → Response.

---

### 5. `app/services/` — Business logic

- **Services** contain the actual logic (create item, get by id, list, etc.).
- Routers call services; services do **not** import routers.
- Benefits:
  - Logic is reusable (e.g. from a background job or another endpoint).
  - Easy to **unit test** without HTTP.

In this skeleton, `item_service` uses an in-memory list; later you’d replace that with database access.

---

## Summary for the group

| Component   | Role |
|------------|------|
| **main.py** | Wire up app, CORS, routers. |
| **config.py** | Central place for settings (env, .env). |
| **models/**  | Shape and validate request/response data. |
| **routers/** | Define URLs and call services. |
| **services/**| Implement business logic; keep routers thin. |

Adding a new feature usually means: add schemas in `models/`, add logic in `services/`, expose it in a `routers/` file, then include that router in `main.py`.
