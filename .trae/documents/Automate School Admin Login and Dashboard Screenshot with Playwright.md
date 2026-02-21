## Context
- Auth flow uses `GET http://localhost:4000/api/identify` then `POST /api/login` to issue JWT and set `auth:*` keys (`src/pages/Login.tsx:18-33`).
- Backend listens on `http://localhost:4000/` (`server/index-sqlite.js:590-594`). Frontend runs at `http://localhost:5173/` with screen-based navigation (`src/App.tsx:19-31,46-76`).
- Current DB has no seeded users; `school@admin.com` is not found, causing the “Unable to sign in”/“No registration found” path (`server/index-sqlite.js:466-489`).

## Plan
1. Start servers
   - Backend: `npm run server` (Express+SQLite on `:4000`).
   - Frontend: `npm run dev` (already running; keep one active instance on `:5173`).
2. Install Playwright browsers
   - `npx playwright install` to install Chromium.
3. Prepare SchoolAdmin account via API (one-time, idempotent)
   - Request EPHSRUAdmin token: `POST http://localhost:4000/api/login` with `{ role: 'EPHSRUAdmin' }` (no credentials needed) to get `token` (`server/auth.js`, `server/index-sqlite.js:520-528`).
   - Create admin record: `POST /api/admins` with headers `Authorization: Bearer <token>` and body `{ email: 'school@admin.com', role: 'SchoolAdmin', zoneId: 'Z1', schoolId: 'S1', name: 'School', surname: 'Admin' }` (`server/index-sqlite.js:372-414`).
   - Note: Password check only applies if `data.passwordHash` exists; with no hash, login succeeds for provided password (`server/index-sqlite.js:472-478`).
4. Automate login with Playwright
   - Navigate to `/`.
   - Click `Login` (`data-testid="btn-login"`, `src/App.tsx:49`).
   - Fill `Email` with `school@admin.com` and `Password` with `830908` (`src/pages/Login.tsx:56-71`).
   - Click `Sign In`, wait for role to persist and auto-redirect to dashboard (`onSuccess` → screen `dashboard`, `src/App.tsx:61,73,76`).
5. Capture screenshot of School Dashboard
   - Wait for `h1` title `Dashboard` on the role dashboard page (`src/pages/Dashboard.tsx:55-56`).
   - Save full-page screenshot to `test-results/school-admin-dashboard.png`.

## Verification
- Assert that `localStorage` has `auth:role='SchoolAdmin'`, plus `auth:zoneId='Z1'` and `auth:schoolId='S1'`.
- Confirm dashboard cards render for `Schools`, `Players`, `Coaches`, `Referees`, `Admins` (`src/pages/Dashboard.tsx:70-76`).
- Optional: Hit `GET /api/coaches?schoolId=S1` to confirm role-based filtering (`server/index-sqlite.js:310-339`).

## Commands to run
- `npm run server`
- `npx playwright install`
- `npx playwright test tests/school-admin-login.spec.ts --config=playwright.config.human-like.ts`

## Implementation Notes
- I’ll add a small Playwright test `tests/school-admin-login.spec.ts` that:
  - Uses `request` fixture to create the admin via backend API (using EPHSRUAdmin token) if not present.
  - Automates the browser login and takes the screenshot.
- This test reuses existing Playwright config that already starts both servers (`playwright.config.human-like.ts`).

## Permissions Mapping (SchoolAdmin)
- View coaches/players/schools scoped by `schoolId` (`server/index-sqlite.js:243-259, 310-339, 94-118` + `filterByRole`).
- Edit coaches within same school (`allowUpdate('coaches', ...)`, `server/index-sqlite.js:323-355`).
- Team assignment UI isn’t present yet; can be added later via a `teams` resource, but role scoping already supports school-level operations.

If you confirm, I will implement the Playwright test, run the servers and test, and provide the screenshot artifact.