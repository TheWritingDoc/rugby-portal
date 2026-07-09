# Launch Day Checklist — EPHSRU Rugby Portal (PrecisionCode)

Production: https://rugby-portal.vercel.app · Supabase project `zgiwonbmwiihopvophkg` · Vercel `rugby-portal` (team Precision_Code)

Legend: **[You]** = owner action (dashboards/DNS/decisions) · **[Dev]** = code/CLI (ask Claude) · ⛔ = launch blocker · ⚠️ = do before real users.

---

## Code-analysis verdict (what's already production-ready)

- **Auth is hardened.** `JWT_SECRET` is *required* in production (server refuses to boot without it); tokens expire in 12h. In production the legacy `/api/login` cannot mint a token from just an email — real sign-in must go through `POST /api/auth/login`, which verifies a bcrypt hash server-side. Accounts with no password can't log in. Passwords never travel in query strings.
- **Rate limiting** on `/api/auth/*` (20/min), `/api/login` (60/min), `/api/verify/*` (120/min).
- **CORS** locks to an allow-list in production; **QR verify** is read-only + HMAC-signed; **uploads** require a session, cap at 5 MB, and filter MIME types.
- **Business dashboard** is double-gated: union-admin role **and** owner email (`PLATFORM_OWNERS`).
- **Secrets** (`.env*`, `ecosystem.config.cjs`, `TEST-CREDENTIALS.md`) are gitignored.
- **Password reset** flow exists (1-hour codes, no user-enumeration).

The gaps below are configuration and data hygiene, not code.

---

## T-minus 1 week

- [ ] ⛔ **[You] Decide the email story.** SMTP is **not** configured, so *"Forgot password?"* codes and welcome emails go to the server log + in-app inbox only — **a locked-out real user cannot receive a reset code.** Choose one:
  - (a) Set SMTP env vars (Gmail app-password runbook already provided) — recommended; **or**
  - (b) Launch with admins handing out first passwords in person and accept no self-service reset until SMTP is on.
- [ ] **[You] Confirm Vercel production env vars** (Project → Settings → Environment Variables): `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (long random), and `ALLOWED_ORIGINS=https://rugby-portal.vercel.app` (+ custom domain if any). Add `PLATFORM_OWNERS=precisioncode.sa@gmail.com` and the SMTP set if doing (a).
- [ ] **[You] Revoke the old exposed GitHub PAT** at github.com/settings/tokens (the `ghp_OCuJ…` token). SSH is already the push method, so nothing breaks.
- [ ] **[You] Confirm Supabase backups** — enable Point-in-Time Recovery / daily backups on the project (Database → Backups).
- [ ] **[Dev] Full green gate on `main`**: `npm run build`, regression 46/46, journey 8/8.

## T-minus 1 day

- [ ] ⚠️ **[You] Purge production test data.** These 8 rows exist in prod and look unprofessional in the owner panel counts. Run in Supabase SQL editor (this is a deletion — **you** run it, review first):
  ```sql
  DELETE FROM admins   WHERE lower(email) IN ('schooladmin@test.com','zonecoord@test.com');
  DELETE FROM coaches  WHERE lower(email) = 'coach@test.com';
  DELETE FROM referees WHERE lower(email) = 'referee@test.com';
  DELETE FROM players  WHERE lower(email) = 'player@test.com';
  -- Review these early hand-entered players before deleting (may be your own tests):
  --   'ADRIAN WINSLOW ADGAR' (wjawpgmc@gmail.com), 'ADRIAN' (precisioncode.sa@gmail.com), 3× "Michel'le"
  ```
- [ ] ⚠️ **[You] Change Adrian's password.** Sign in as `precisioncode.sa@gmail.com` (currently `PASSword@123`) → use *Forgot password?* (needs SMTP) **or** ask Dev to set a fresh bcrypt hash directly, then log in and confirm.
- [ ] **[You] Verify the owner account works end-to-end**: log in as Adrian → **Business** tab loads real numbers → other tabs work.
- [ ] **[Dev] Tag the release**: `git tag v1.0.0 && git push --tags` for a known-good rollback point.

## Launch morning (go-live)

1. [ ] **[Dev] Final deploy check** — confirm latest `main` commit is the live Vercel production deployment (READY).
2. [ ] **[You] Smoke test on the live URL** (incognito window, so no stale cache):
   - [ ] Sign in as Adrian → dashboard loads
   - [ ] Create a real **Zone Coordinator** → they receive credentials (email if SMTP, else you note the password)
   - [ ] Coordinator signs in → creates a **School Admin** → School Admin creates a **Coach** → Coach registers a **Player**
   - [ ] Coach prints a match-day card → QR scans and the `/verify` page shows the player
   - [ ] *Forgot password?* on a test account → code arrives (email if SMTP)
3. [ ] **[You] Onboard the first real zone** (the pilot union/zone) with its coordinator present.
4. [ ] **[You] Announce** the URL to the pilot group with a one-line note: *"first visit, if the page looks old press Ctrl+Shift+R once."* (stale service-worker cache on returning devices).

## First 48 hours (watch)

- [ ] **[You/Dev] Watch Vercel runtime logs** (Deployments → Functions → Logs) for 500s / auth errors.
- [ ] **[You] Watch the Business tab** activity chart — registrations should climb; a flat line means people are stuck.
- [ ] **[You] Confirm one real password-reset** completes (the true test of the email path).
- [ ] **[Dev] Hotfix branch ready** — if something breaks, `git revert` the offending commit; Vercel auto-redeploys.

## Post-launch (week 1, optional polish)

- [ ] Custom domain (e.g. portal.ephsru.co.za) → add in Vercel, update `ALLOWED_ORIGINS` + `APP_URL`.
- [ ] Error monitoring (Sentry free tier) for server + client.
- [ ] Move SMTP from Gmail to Resend with a verified domain once volume grows.
- [ ] Rotate `JWT_SECRET` on a schedule (forces re-login; do off-peak).

---

## Rollback plan

- **Bad deploy:** Vercel → Deployments → pick the last-good build → **Promote to Production** (instant, no rebuild). Or `git revert <sha> && git push`.
- **Bad data migration:** Supabase → Database → Backups → restore to a timestamp (PITR).
- **Locked-out owner:** Dev can reset a bcrypt hash straight into the `admins` row.

## Known non-blockers at launch
Multi-sport leagues are dormant (rugby-only live). Demo showcase in the Business tab is clearly badged. Screenshot capture in the dev preview tool is flaky (cosmetic, not the app).
