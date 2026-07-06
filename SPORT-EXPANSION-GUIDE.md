# Sport Expansion Guide — PrecisionCode Sports Platform

How to launch a new league (club rugby, soccer, netball, cricket, …) on this
platform. This procedure was **built and verified end-to-end once** (EPRU club
rugby + soccer/netball/cricket containers, July 2026) and then rolled back by
business decision — so every step below is proven, not theoretical.

---

## 1. The architecture in one paragraph

**A league is a zone. An organisation (school or club) is a row in the
`schools` table. Everything else follows.** The entire permission, messaging,
approvals, documents, migration and audit stack keys on `zoneId` + `schoolId`
strings — none of it knows or cares about sport. Adding a sport therefore
means: reserve new zone ids, seed (or delegate-create) organisations inside
them, and teach the UI which positions/divisions to offer per zone. **No
schema change. No new database. No permission code.**

```
Union Admin (product owner sits here too)
 └─ Zone Coordinator          ← one per league zone, e.g. "EP Club Soccer"
     └─ School/Club Admin     ← one per organisation
         ├─ Coach → Players   ← registration chain, per organisation
         └─ Referee
```

Each league zone gets its **own management hierarchy and its own registration
system** automatically — scoping guarantees a soccer coordinator can never
touch rugby data (verified: cross-org creates return 403).

### Why NOT a database per sport (decision record)

Considered and rejected (2026-07-05): N databases = N schema migrations, N
backups, N connection strings; the owner panel would need cross-DB
aggregation instead of one `GROUP BY`; people overlap (same learner plays two
sports; same admin runs both). If a federation ever contractually demands
data isolation, the correct move is a **separate deployment of this same
codebase** (own Vercel project + own Supabase, env-driven branding) — see §8.

---

## 2. Zone id registry

| Zone ids | League | Status |
|---|---|---|
| 0 | Festival schools (Q4-5) | live |
| 1–12 | EPHSRU schools rugby zones | live |
| 13–16 | *reserved:* EPRU club rugby (NMB Metro / Karoo & Midlands / Kouga & Tsitsikamma / Albany & Sundays River) | dormant |
| 17–18 | *reserved:* EP Schools / Club Soccer | dormant |
| 19–20 | *reserved:* EP Schools / Club Netball | dormant |
| 21–22 | *reserved:* EP Schools / Club Cricket | dormant |
| 23+ | future leagues | free |

Keep ids numeric (some UI parses them as numbers). Never reuse an id.

---

## 3. Launch checklist (business, before any code)

- [ ] Federation/union has signed on and named a **league coordinator**
- [ ] Official list of member organisations (clubs/schools) with regions
- [ ] Season structure confirmed: age groups (school) or divisions (club)
- [ ] Position list per sport confirmed with the federation
- [ ] Decide: shared deployment (default) or white-label (§8)

---

## 4. Code changes, file by file (~1 day of work)

> Every step below existed as working code once. Search this repo's git
> history / session notes for "league expansion" if you want the originals.

### 4.1 `src/data/zones.ts` — extend the types
```ts
export type Sport = 'Rugby' | 'Soccer' | 'Netball' | 'Cricket'
export type OrgLevel = 'school' | 'club'
// Zone gains:  sport?: Sport   level?: OrgLevel   (defaults Rugby/school)
// School.quintileCategory union gains 'Club'
```

### 4.2 `src/data/leagues.ts` (new) — single source of truth, frontend
- `LEAGUE_ZONES: Zone[]` — the new zones with `sport` + `level`
- Org catalog per league (e.g. `EPRU_CLUBS`), slug convention `club-<kebab-name>`
- Helpers (key EVERYTHING off the zone):
  - `sportOfZone(zoneId)` → Sport (default Rugby)
  - `levelOfZone(zoneId)` → 'school' | 'club'
  - `orgTermOf(zoneId)` → 'School' | 'Club'  (UI labels)
  - `positionsForZone(zoneId)` / `ageGroupsForZone(zoneId)`

### 4.3 `src/utils/constants.ts` — sport catalogs
```ts
export const POSITIONS_BY_SPORT = {
  Rugby:   ['Prop','Hooker','Lock','Flanker','Number 8','Scrum-half','Fly-half','Centre','Wing','Fullback'],
  Soccer:  ['Goalkeeper','Right Back','Left Back','Centre Back','Defensive Midfielder','Central Midfielder','Attacking Midfielder','Right Winger','Left Winger','Striker'],
  Netball: ['Goal Shooter','Goal Attack','Wing Attack','Centre','Wing Defence','Goal Defence','Goal Keeper'],
  Cricket: ['Opening Batter','Batter','Wicketkeeper','All-rounder','Fast Bowler','Spin Bowler'],
}
export const SCHOOL_AGE_GROUPS = ['U15','U16','U17','U19']   // school competitions
export const CLUB_AGE_GROUPS   = ['U19','U21','Senior','Veterans'] // club divisions
// KEEP the old AGE_GROUPS / POSITIONS exports as rugby aliases — legacy imports.
```

### 4.4 `server/seed-organizations.js` (new) — seed the org catalog
- Export the org list `{ id, zoneId, schoolId, name, zoneName }` and a
  `seedClubData(c)` builder that puts `orgType:'club'` (or `'school'`),
  `sport`, `seeded:true` into the JSON `data` blob.
- Wire into **both** adapters, idempotently:
  - `server/db-sqlite.js`: `INSERT OR IGNORE INTO schools (...)` after the school seed
  - `server/db-postgres.js`: `INSERT ... ON CONFLICT (schoolId) DO NOTHING`
    **outside** the count-guarded school-seed block (must run on every boot)
- ⚠️ The seed runs against **production Supabase on the next deploy**. That is
  intended — but know it before you push.

### 4.5 `src/utils/labels.ts` — name resolution
- `schoolNameOf`: also search the new org catalog
- `zoneNameOf`: league zones return their name as-is (no " Zone" suffix)

### 4.6 `src/components/Dropdowns.tsx` — selection
- `ZoneSelect`: append `LEAGUE_ZONES` after the parsed school zones (dedupe by id)
- `SchoolSelect`: append the org catalog; when `levelOfZone(zoneId)==='club'`
  relabel the field **"Club"** — but **keep `data-testid="school-select"`**
  (Playwright suite depends on it)

### 4.7 Forms — sport-aware dropdowns (⚠️ the gotcha lives here)
Replace every `AGE_GROUPS` / `POSITIONS` usage with the zone-aware helpers in:
- `src/pages/Dashboard.tsx` → CoachView add-player form (label "Division" for
  club zones) **and** `CoachPlayerEditor` (define `AGE_OPTS` / `POS_OPTS` once
  at the top from the player's zone)
- `src/components/modals/PlayerProfileModal.tsx` (same pattern)

> **GOTCHA (cost us a crash once):** `CoachPlayerEditor` repeats the same
> select block FOUR times with varying indentation. A missed occurrence =
> `ReferenceError` = the whole editor white-screens. After the swap run
> `grep -n "AGE_GROUPS\|POSITIONS" src/` and confirm only `constants.ts`
> matches. The `roles-hierarchy` Playwright spec catches this if you forget.

### 4.8 Owner panel — make the league visible to the business
- `server/index-sqlite.js` → `/api/platform/overview`: add a product entry
  for the new league (group its zone ids). **Portable SQL only** — the
  Postgres adapter translates neither `json_extract` nor `strftime`; use
  `data LIKE '%"status":"pending"%'` and group days in JS.
- `src/components/dashboards/PlatformPanel.tsx`: move the sport from the
  `ROADMAP` array into a live product card.

### 4.9 Tests
- `tests/coach-dashboard-comprehensive.spec.ts`: folder-name regexes — folder
  cards read `"<name> N players"`, not `"Items: N"`
- Scope any "click first button" helpers to `[data-folder-item="folder"]`
- Gates before push: `npx playwright test --grep-invert "Real-world journeys"`
  (46/46) · `npm run test:journey` solo (8/8) · `npm run build`

---

## 5. Launch day (operations)

1. Merge + push `main` → Vercel auto-deploys; boot seed inserts the org rows
   into Supabase (idempotent; check function logs for `[pg] seeded N …`).
2. Owner (union admin) creates the **league coordinator** via Create User →
   Zone Coordinator → pick the new league zone.
3. Coordinator creates each **club/school admin**; they create coaches and
   referees; coaches register players. Welcome emails flow automatically
   (once SMTP env vars are set — see DEPLOY-SUPABASE-VERCEL.md).
4. Verify on prod: coordinator sees only their league; a club coach's Add
   Player shows the right positions + "Division"; owner Business tab shows
   the new product card. Remind returning users: one hard refresh (Ctrl+Shift+R).

## 6. Rollback

Before merge: `git checkout` the touched files. After deploy: the seeded org
rows are inert without users; to purge, delete `schools` rows for the league
zone ids (plus any `players/coaches/admins` with those `zoneId`s) — dev and
prod separately. This exact cleanup was done once (90 club rows) with plain
`DELETE ... WHERE zoneId IN (...)`.

## 7. Reference data already agreed

- **EPRU club rugby**: the 90-club list (per the official EPRU member list,
  regionalised NMB Metro 62 / Karoo & Midlands 15 / Kouga & Tsitsikamma 8 /
  Albany & Sundays River 5) is preserved in the session notes and git history
  — regions are best-guess by home town; clubs can be migrated between
  regions with the existing school-migration flow.

## 8. White-label deployment (when a federation demands isolation)

Same codebase, second instance: new Vercel project + new Supabase project;
set `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, SMTP vars,
`PLATFORM_OWNERS`; boot creates the schema; brand via the existing logo
mechanism. Do **not** fork the code — one repo, many deployments.

---

*Owner access: the Business tab and `/api/platform/overview` are restricted
to `PLATFORM_OWNERS` (default `precisioncode.sa@gmail.com`) — union admins
without owner status never see company-level numbers.*
