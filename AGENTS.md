# AGENTS.md

## Cursor Cloud specific instructions

This is a two-service educational platform (Lyceum Tasks / EduPlatform v5) with a Python FastAPI backend and a React+Vite frontend. The UI is in Russian.

### Services

| Service | Command | Port |
|---------|---------|------|
| Backend | `cd backend && python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8766` | 8766 |
| Frontend | `cd frontend && pnpm dev` | 5173 |

The backend uses an embedded SQLite database (`backend/lyceum.db`) that is auto-created and auto-migrated on startup. No external database is needed.

### Key caveats

- Use `python3` (not `python`) to run the backend — `python` is not available in this environment.
- After `pnpm install` in `frontend/`, you must run `pnpm rebuild esbuild` because pnpm's default build-script policy blocks esbuild's install script, and Vite depends on the native esbuild binary.
- Default admin credentials: `admin` / `admin123` (seeded on first backend startup).
- The Vite dev server proxies `/api` requests to the backend on port 8766 (configured in `vite.config.ts`).
- `frontend/.env.development` references port 8000 for `VITE_API_URL`, but this is unused in dev mode — the Vite proxy config (port 8766) is what matters.
- `npx tsc --noEmit` has pre-existing type errors; the build (`pnpm build`) succeeds because Vite does not enforce type checking.

### Lint / Type check / Build

- **TypeScript check**: `cd frontend && npx tsc --noEmit` (has pre-existing errors)
- **Build frontend**: `cd frontend && pnpm build`
- No ESLint or Prettier configuration exists in the repo.
- No automated test suite exists (no test framework configured).
