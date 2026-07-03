# Deploying the Rugby Portal to Vercel + Supabase

This app runs as a single Vercel project:

- **Frontend** — the Vite build (`dist/`) served as static files by Vercel's CDN.
- **API** — the existing Express app, run as a serverless function (`api/index.js`).
- **Database** — Supabase Postgres (selected automatically when `DATABASE_URL` is set; otherwise the app uses local SQLite for development).
- **File uploads** — Supabase Storage (selected when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set; otherwise local disk in dev).

No code changes are needed to switch between local and cloud — it's all driven by environment variables.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **New project**. Pick a region close to your users (e.g. `eu-west` / `Cape Town` if available). Set a strong **database password** and save it.
2. Wait for provisioning (~2 min).

### 1a. Create the database schema

1. In Supabase: **SQL Editor → New query**.
2. Open `server/schema-postgres.sql` from this repo, paste the whole file, and **Run**. This creates every table + index and seeds the 130-school catalog. It's safe to re-run.

### 1b. Create the Storage bucket (for photos, logos, documents)

1. **Storage → New bucket** → name it `uploads` → mark it **Public** → Create.
2. (The server uploads with the service-role key, and reads are public via the CDN URL stored on each record.)

### 1c. Collect the credentials you'll need

- **Database URL** — *Project → Settings → Database → Connection string → URI*. **Use the connection pooler** (host contains `pooler.supabase.com`, port `6543`) — serverless functions need the pooler, not the direct `5432` connection. Replace `[YOUR-PASSWORD]` with the password from step 1.
- **Project URL** — *Settings → API → Project URL* (e.g. `https://abcd.supabase.co`).
- **Service-role key** — *Settings → API → `service_role` secret*. **Server-side only — never put this in `VITE_*` or the browser.**

---

## 2. Push the repo to GitHub

> The token previously embedded in the git remote is exposed and no longer valid — see the security note at the bottom. Re-point the remote first.

```bash
git remote set-url origin https://github.com/TheWritingDoc/rugby-portal.git
git push -u origin main      # authenticate with a fresh PAT or the GitHub CLI
```

---

## 3. Create the Vercel project

1. Go to <https://vercel.com> → **Add New… → Project** → import `TheWritingDoc/rugby-portal`.
2. **Framework preset:** leave as **Other** (the included `vercel.json` already defines the build). Build command / output dir are handled by `vercel.json` — don't override them.

### 3a. Set environment variables

*Project → Settings → Environment Variables.* Add these for **Production** (and Preview if you want PR previews):

| Name | Value | Notes |
|------|-------|-------|
| `DATABASE_URL` | the **pooler** URI from step 1c | switches the app to Postgres |
| `SUPABASE_URL` | the Project URL | for Storage uploads |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role secret | **secret — server only** |
| `SUPABASE_BUCKET` | `uploads` | must match the bucket name |
| `JWT_SECRET` | a long random string | **required** — server refuses to boot without it |
| `NODE_ENV` | `production` | |
| `ALLOWED_ORIGINS` | `https://<your-app>.vercel.app` | lock CORS to your domain |
| `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` | *(optional)* | only if using Google sign-in |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` / `VITE_FACEBOOK_APP_ID` | *(optional)* | only if using Facebook sign-in |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | *(recommended)* | outbound email — see below |
| `MAIL_FROM` | `EPHSRU Rugby Portal <no-reply@yourdomain>` | sender address (domain verified with the provider) |
| `APP_URL` | `https://<your-app>.vercel.app` | link/button used inside emails |

**Email setup (Resend, ~5 minutes):** create a free account at <https://resend.com> → verify your sending domain (or use their onboarding domain to start) → create an API key. Then set `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASS=<your API key>`. When these are set, the portal emails: welcome messages when accounts are created, registration approvals/rejections, transfer decisions, in-app message alerts, and password-reset codes. When unset, all of these remain in-app notifications only.

Generate `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> Leave `VITE_API_BASE` **unset** — the frontend calls the API same-origin at `/api`.

### 3b. Deploy

Click **Deploy**. Vercel builds `dist/` and the `api/index.js` function. First load may cold-start the function (~1s).

---

## 4. Create the first admin

Public sign-up of admins is intentionally blocked in production, so seed the first EPHSRU admin directly. In **Supabase → SQL Editor**, run (replace the email and bcrypt hash):

```sql
-- Generate a bcrypt hash locally first:
--   node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD',10))"
INSERT INTO admins (id, name, surname, email, role, data, ts)
VALUES (
  gen_random_uuid()::text, 'System', 'Admin', 'admin@ephsru.co.za', 'EPHSRUAdmin',
  '{"passwordHash":"<PASTE_BCRYPT_HASH>","name":"System","surname":"Admin"}', 0
);
```

Every staff account needs a password hash — in production, accounts without one cannot sign in. Once logged in, that admin creates zone coordinators and school admins from inside the app.

---

## 5. Smoke-test the live site

On `https://<your-app>.vercel.app`:

1. Log in as the admin you just created.
2. Register a player **with a photo** → confirm the photo loads (proves Supabase Storage).
3. Approve the player from the School Admin **Requests** tab.
4. Print a **Game ID card** and export the **CSV**.
5. Reload hard (Ctrl/Cmd-Shift-R) to confirm the service worker serves the latest build.

If something 500s, check **Vercel → Deployments → (latest) → Functions logs**.

---

## Local development (unchanged)

With no `DATABASE_URL`, everything runs locally on SQLite + local disk:

```bash
npm install
npm rebuild sqlite3        # if the native binding complains on Windows
npm run server             # API on :4000
npm run dev                # frontend on :5173
```

To test the **Postgres path locally**, set `DATABASE_URL` (and the Supabase vars) in a `.env` and run the server — it will use Supabase instead.

---

## How the switch works (for maintainers)

- `server/db.js` picks `db-postgres.js` when `DATABASE_URL` is set, else `db-sqlite.js`. The Postgres adapter (`server/db-postgres.js`) mimics the sqlite3 callback API so the ~2,400-line server is unchanged: it translates `?`→`$n`, `LIKE`→`ILIKE`, returns BIGINT as numbers, and remaps lower-cased Postgres column keys back to the app's camelCase.
- `server/storage.js` writes uploads to Supabase Storage when configured, else local disk.
- `api/index.js` imports the Express app; `server/index-sqlite.js` only binds a port when **not** running on Vercel/Lambda.

---

## ⚠️ Security notes

- **Rotate your GitHub token.** A Personal Access Token was committed into the git remote URL (`.git/config`) and is exposed. Revoke it at <https://github.com/settings/tokens> and use the GitHub CLI or a fresh fine-scoped token for `git push`.
- **`ecosystem.config.cjs` is gitignored** because it contains a real `JWT_SECRET`. Use a different secret for the Vercel deployment (set via env var, never committed).
- **Never expose `SUPABASE_SERVICE_ROLE_KEY`** to the browser — it bypasses all row-level security. It belongs only in server-side Vercel env vars.

## Note on OneDrive (local dev)

This repo lives under OneDrive, which actively syncs files. OneDrive and a live SQLite database don't mix — the local `server/data/database.sqlite` was silently emptied during development. Moving the real data to Supabase (this migration) removes that risk for production. For local work, consider moving the project outside the OneDrive folder.
