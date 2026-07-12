# Match-Day Module — Scope & Design

Fixtures, referee assignment, team sheets, and match results — the missing
operational layer between "everyone is registered" and "Saturday actually
happens". Builds only on rails the portal already has: zone/school scoping,
the notification/mailer pipe, QR card verification, the audit trail, and the
day-folder UI pattern.

**Lifecycle:** ZC schedules a fixture → referee is notified → both coaches
submit team sheets (locked at kickoff) → referee scans QR cards at the field →
referee files the result → union's results & discipline trail fills itself.

---

## 1. Data model

Two tables (portable SQL — identical on SQLite dev and Postgres prod, applied
the usual way: boot-time `CREATE TABLE IF NOT EXISTS` in both adapters plus a
Supabase migration). The match report folds into the fixture row — a separate
table adds nothing at this scale.

```sql
CREATE TABLE IF NOT EXISTS fixtures (
  id TEXT PRIMARY KEY,
  zoneId TEXT NOT NULL,            -- organising zone (scoping key)
  homeSchoolId TEXT NOT NULL,
  awaySchoolId TEXT NOT NULL,      -- may be outside the zone (festivals) — view scope covers both schools
  ageGroup TEXT NOT NULL,          -- U15 | U16 | U17 | U19
  kickoffAt BIGINT NOT NULL,       -- epoch ms
  venue TEXT,
  refereeEmail TEXT,               -- assigned official (email = identity, as in messaging)
  status TEXT DEFAULT 'scheduled', -- scheduled | completed | cancelled | postponed
  homeScore INTEGER,
  awayScore INTEGER,
  data TEXT,                       -- JSON: createdBy, notes, report{cards[{playerId,team,type,minute}],notes,filedBy,filedAt}
  ts BIGINT
);
CREATE INDEX IF NOT EXISTS ix_fixtures_zone_kick ON fixtures(zoneId, kickoffAt);
CREATE INDEX IF NOT EXISTS ix_fixtures_ref ON fixtures(refereeEmail, kickoffAt);

CREATE TABLE IF NOT EXISTS team_sheets (
  id TEXT PRIMARY KEY,
  fixtureId TEXT NOT NULL,
  schoolId TEXT NOT NULL,
  submittedBy TEXT,                -- coach/SA email
  submittedAt BIGINT,
  data TEXT                        -- JSON: players[{playerId, jersey, position, captain}]
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_team_sheets_fixture_school ON team_sheets(fixtureId, schoolId);
```

Why no `match_reports` table: one report per fixture, written once by one
person, read together with the fixture — `data.report` + the score columns +
an audit entry cover it. A discipline register (card accumulation) can be
computed by scanning `fixtures.data.report.cards` later; if that ever gets
hot, promote cards to a table then.

## 2. API (all with the existing scoping/authorization idioms)

| Endpoint | Who | Notes |
|---|---|---|
| `POST /api/fixtures` | ZC (own zone), Union | validate schools + ageGroup; audit `fixtures/create`; notify both school admins |
| `GET /api/fixtures` | all roles | scoped like other entities: player/coach/SA → fixtures touching their school; referee → own assignments (by email) plus own zone; ZC → zone; Union → all. `?upcoming=1`, `?schoolId=`, paging |
| `GET /api/fixtures/:id` | scoped as above | includes both team sheets for the referee/ZC/union; only the own-school sheet before kickoff for coaches (no scouting the opposition early — flag: `revealSheetsAt = kickoffAt`) |
| `PUT /api/fixtures/:id` | ZC (own zone), Union | reschedule / venue / cancel / postpone / assign or replace `refereeEmail`; on assignment: notify the referee (email + in-app) |
| `POST /api/fixtures/:id/team-sheet` | Coach/SA of home or away school | upsert own school's sheet; players must be **approved, current-season, matching ageGroup** of that school (server-checked); rejected after `kickoffAt`; audit |
| `POST /api/fixtures/:id/result` | assigned referee; ZC/Union override | scores + cards + notes → `status='completed'`; one-shot (re-filing requires ZC override); audit `fixtures/result`; notify both schools' admins + coaches |

Notifications reuse `queueNotification` (in-app + email once SMTP is on):
referee assigned, fixture changed/cancelled, opposing sheet available at
kickoff (optional), result filed.

Serverless constraint: no cron — "reminder" behaviour is on-load (dashboards
compute "today's matches" client-side). A Vercel Cron for T-24h email
reminders is a later nice-to-have.

## 3. Screens per role (reusing existing UI patterns)

**Zone Coordinator — "Fixtures" tab**
- Day-folder list (same pattern as Audit Logs): Today / upcoming / past,
  bounded with ShowMoreButton; status chips (scheduled/completed/cancelled).
- **Create Fixture**: ageGroup, home/away school selects (own zone; away may
  search all schools for festivals), date-time, venue.
- **Assign referee**: dropdown of zone referees showing availability text and
  a same-day-conflict warning (one query on `ix_fixtures_ref`).

**Coach — "Matches" tab**
- Upcoming fixture cards (opponent, ageGroup badge, kickoff, venue, referee,
  sheet status: Not submitted / Submitted ✓ / Locked).
- **Team-sheet builder**: roster of approved current-season players of that
  ageGroup (the exact list the coach already browses), checkbox to select,
  jersey number input, captain toggle; save = upsert until kickoff; then
  read-only. **Print team sheet** — reuse the print/export pipeline, one QR
  per player (verification path already exists).

**Referee — "My Matches" tab** (turns the weakest persona into a served one)
- Assignment cards: fixture, schools, kickoff, venue; both team sheets
  visible with per-player QR-verify shortcuts.
- **File result** (enabled after kickoff): home/away scores, cards editor
  (pick player from either sheet, yellow/red, minute), notes, submit → locked,
  fixture completed.

**Player — "My Matches" card on the dashboard**
- Read-only upcoming fixtures for their school/ageGroup; "You're on the team
  sheet — #14" badge when selected. Answers "when and where do we play?".

**School Admin** — read/write same as coach for their school's sheets, plus
fixture visibility across all their teams. **Union admin** — all-fixtures view
inside the existing Analytics/Overview area; results feed. (Owner panel picks
up a "matches this season" stat for free from one COUNT.)

## 4. Build plan & effort

Calibrated against actual velocity in this codebase (profile+documents system
incl. tests ≈ ½ day; owner panel ≈ ½ day).

| Phase | Contents | Effort |
|---|---|---|
| **1. Fixtures + assignment** | tables (both adapters + prod migration), POST/GET/PUT endpoints with scoping, ZC Fixtures tab + create/assign UI, referee My Matches (list only), player/coach upcoming lists, notifications, audit | **~1.5 days** |
| **2. Team sheets** | endpoint + eligibility validation, coach builder UI, kickoff lock, printable sheet with QR | **~1 day** |
| **3. Results & cards** | result endpoint + one-shot lock + override, referee result form, union results view, notifications | **~1 day** |
| **Gates** | new Playwright spec (ZC schedules → ref assigned → coach submits → ref files), regression + journey green, in-browser walkthrough | **~0.5 day** |

**MVP = Phases 1–2 (~2.5 days)** — fixtures visible to everyone, referees
assigned, team sheets replacing paper. Phase 3 completes the loop (~4 days
total).

**Deliberately out of scope (later):** standings/log tables (computable from
results), competition/round structures, assistant referees, injury tracking,
bulk fixture import from Excel, T-24h cron reminders, discipline register
with automatic suspension flags.

## 5. Risks / decisions locked

- **Portable SQL only** (no json_extract/strftime — the pg adapter translates
  neither); day grouping in JS, cards live in JSON.
- **Referee identity = email**, consistent with messaging/notifications.
- **Sheets hidden from the opposition until kickoff** — avoids the
  team-scouting complaint before it's ever raised.
- **Result is one-shot** for the referee; corrections go through the ZC
  (override audited) — keeps disputes out of the referee's inbox.
- New `filterByRole` cases for fixtures must get the same permission tests the
  other entities have (cross-zone create 403, cross-school sheet 403).
