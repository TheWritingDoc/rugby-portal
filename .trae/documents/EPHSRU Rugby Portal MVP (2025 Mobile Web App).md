## Scope
- Build a mobile-first web app for school, player, coach, referee, and admin registrations.
- Implement reusable cascading dropdowns sourced from `ep_schools_rugby_zones.md`.
- Include offline progressive saving, role-based permissions, validation, audit trail, and a 2025 UI/UX.
- Use the provided logo image `Screenshot 2025-11-18 095936.png` in the header.

## Tech Stack
- Frontend: React + Vite, TypeScript, Tailwind CSS for modern 2025 UI.
- State & Forms: React Hook Form + Zod (schema-driven validation and transformations).
- PWA: Service Worker + IndexedDB for offline drafts and progressive saving.
- Backend (MVP): Node/Express + SQLite (Prisma ORM) for portability; JWT auth with role claims.
- File storage (MVP): Local disk storage abstraction; later swap for S3 or Cloud storage.

## Data Sources & Bootstrapping
- Parse `ep_schools_rugby_zones.md` to build a JSON object: zones → schools, plus pool and quintile metadata.
- Seed database tables with zones and schools from the parsed JSON.

## Core Entities & Schema
- Zone: `id`, `name`, `pool?`, `schools_count`.
- School: `id`, `name`, `zone_id`, `pool?`, `quintile`, `address`, `contact_number`, `email`.
- User: `id`, `role` (Player, Coach, SchoolAdmin, ZoneCoordinator, EPHSRUAdmin), `email?`, `phone?`, `linked_school_id?`, `linked_zone_id?`.
- Player: personal, contact, parent/guardian, rugby details, medical, documents, `school_id`, `zone_id`, `age_groups_eligible`.
- Coach: personal, qualifications, documents, assignment, background checks.
- Referee: personal, qualifications, zones, availability, requirements.
- Admin: personal, role details, verification documents.
- Document: `id`, `owner_type`, `owner_id`, `type`, `url`, `uploaded_by`, `uploaded_at`.
- AuditLog: `id`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`, `timestamp`.

## Reusable Dropdowns & Auto-Population
- SchoolSelect: cascades by Zone; on select, auto-fill `zone`, `pool`, `quintile`.
- ZoneSelect: filters schools list to that zone.
- AgeGroupSuggest: compute eligibility from `date_of_birth` using current season cutoffs, preselect valid groups.
- PositionSelect: standardized rugby positions list.

## Forms
- School Registration: basic info, primary contact, program details; dropdowns for school, auto-populated fields for zone/pool/quintile.
- Player Registration: personal, contact, parent/guardian, rugby details, medical, documents; zone and school dropdowns; age group auto-suggest.
- Coach Registration: personal, qualifications, assignment, background checks; multi-select for age groups coached.
- Referee Registration: personal, qualification, zones multi-select, availability, requirements.
- Admin Registration: personal, administrative role, verification, permissions checkboxes.

## Validation & UX
- ID number, email format, phone format `+27`, document uploads required where specified.
- Age eligibility: compute from DOB; constrain selectable age groups.
- Cascading dropdowns: zone → schools; school selection auto-fills related fields.
- Mobile-first controls: large taps, optimized date picker, file uploads from camera/gallery.
- Progressive saving: auto-save every field change to IndexedDB; resume drafts offline.

## RBAC & Permissions
- Level 1 Player/Referee: view own profile, upload docs, cannot edit core info.
- Level 2 Coach: manage players/coaches at their school, rosters, approve player documents.
- Level 3 School Admin: all coach permissions + manage coaches, register school for tournaments, view reports.
- Level 4 Zone Coordinator: view and report across assigned zone, approve school registrations for zone contests.
- Level 5 EPHSRU Admin: system-wide view, settings, audit logs, overrides.
- Implement JWT with role claims; guard routes and actions on the server; UI shows permitted actions.

## Audit Trail
- Log every change with `user`, `datetime`, `entity`, `before/after` values.
- Filters by school, zone, date range, user, action type.

## Accessibility & Branding
- Use `Screenshot 2025-11-18 095936.png` as the navbar brand logo.
- High contrast, WCAG AA, keyboard navigation, screen reader-friendly forms.

## Security & Privacy
- Do not log secrets; validate uploads and restrict file types.
- Store PII securely; for MVP, SQLite with hashed passwords (bcrypt) and HTTPS in deployment.

## Deliverables
- Mobile-first PWA with registration flows and dashboards per role.
- Reusable dropdown component fed from `ep_schools_rugby_zones.md`.
- Working offline drafts, validations, and audit logging.

## Implementation Phases
- Phase 1: Project scaffold, branding, Tailwind setup, auth skeleton.
- Phase 2: Parse markdown → JSON; seed zones and schools; reusable dropdown components.
- Phase 3: Implement School, Player, Coach, Referee, Admin forms with validations and auto-population.
- Phase 4: RBAC guards, dashboards per role, document upload flows.
- Phase 5: PWA offline drafts, service worker, IndexedDB, auto-save.
- Phase 6: Audit logs, reports, zone-level views and filters.
- Phase 7: QA with test data; prepare deploy.

## Confirmation Requested
- Confirm the stack and phases; if approved, I will scaffold the app, parse the markdown to JSON, and implement the MVP with the specified forms, dropdowns, validations, offline saving, and role permissions.