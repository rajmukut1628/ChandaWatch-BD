# Workspace validation — October 11, 2026

## Protected ownership and staff management

Production build and **60/60 tests passed** after adding persistent owner protection, authenticated two-party transfer with cancellation/expiry/revision checks, administrator mutation guards and premium bilingual staff management. The ownership test covers uppercase IDs, CSRF, wrong passwords, unauthorized actors, successor protection, acceptance and session invalidation. No real ownership transfer was performed in the owner's database. See [ownership guide](OWNERSHIP.md).

## Twenty approved feature improvements

Latest `npm run check`: production build and **59/59 tests passed**. Added coverage includes literal news search/category/district/date filters, safe permanent deletion, administrator-only work queue, editorial media type/CSRF/scan/publication access controls, eight-card bilingual rendering and translation warnings, and authenticated backup restoration with BSON dates, binary media and session invalidation. Production dependency audit reported zero vulnerabilities; local frontend and API returned HTTP 200. See [delivery and runtime limits](FEATURE-IMPROVEMENTS.md). Live ClamAV and new interactive/mobile browser acceptance remain unverified.

## Bilingual interface and news homepage

The latest complete build/check passes **55/55 tests**. Additional checks cover every registered bilingual UI message, static UI/accessible labels, language-aware dates/errors, rendered Bengali/English homepage with exactly one reporting link, administrator/staff layouts without public chrome, bilingual page information and Bengali identifying-pattern rejection, and role/CSRF-protected news authoring with featured selection, scheduling, ten-item pagination and public withdrawal. Fixtures run in isolated databases; the owner's featured-news feed remains empty until an administrator publishes news.

The frontend and API returned HTTP 200. The test database startup allowance is 30 seconds to accommodate local startup load; all assertions and production settings are unchanged. These rendered-component tests verify generated markup, not browser pixels or interactive accessibility. New browser visual acceptance remains blocked as documented below.

## 72-feature expansion

`npm run check` passed: production build and **48/48 automated tests**, including the 17 new feature workflow tests. Production dependency audit reported **0 vulnerabilities** at execution. The local frontend (5173) and API (4000) were restarted; API health returned HTTP 200.

New coverage includes encrypted private conversations, notifications, stale edit rejection, draft restoration and independent approval, related cases/social preview/privacy summaries, content schedules/versions/trash, bulk assignment/availability, encrypted resumable chunks and changed-chunk rejection, session/device/permission revocation, safe PDF/CSV export, safe errors, actual encrypted backup job and retention cleanup, and one-use email/reset tokens with a test mail transport. Test SMTP variables are explicitly empty so private developer configuration cannot change test behavior.

New-screen interactive browser acceptance remains pending. Prior browser checks below apply to the previous release. Real SMTP delivery, live ClamAV, Docker and production infrastructure remain unverified. Bengali operational copy has now been added; full translation/accessibility review is still separate acceptance work.

## Passed

- Production frontend build and **31/31 automated tests** passed after the community journal expansion.
- New integration coverage: consent and district/upazila validation, public redaction patterns, independent approval, explicit public-field whitelist, exactly ten items per page, next-page continuity, literal search, strict filters, small-group upazila withholding, expiry/consent withdrawal, idempotent evidence retry, stable multi-tab CSRF, idle expiry and persistent login lockout.
- Built-bundle browser QA used 15 explicitly synthetic accounts in an isolated temporary database: ten cards on the first page, five after clicking Next; detail body/timeline rendered, district-dependent upazila filter applied, no captured JavaScript errors on the checked detail page. The temporary server was stopped without adding reports to the user's database.
- Public journal and detail mobile layout inspected at 390 × 844; no horizontal DOM overflow observed. Default viewport restored afterward.
- Updated intake form: district-dependent upazila options, a synthetic local PNG preview and its Remove action checked in the browser without submitting another report.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities reported** at execution time.
- Isolated real MongoDB integration checks: encrypted intake, secret tracking, staff roles/assignments, CSRF, status transitions, independent senior approval, low-count suppression, evidence content validation/quarantine, privacy requests and audit redaction.
- Staff creation, self-demotion prevention, email/password-only role login and secure cookie attributes.
- Encrypted backup creation, authenticated decryption/verification and restore into a separate empty MongoDB database, including evidence recovery and session invalidation.
- ClamAV INSTREAM protocol tests: clean, infected and invalid-response handling. These use a test protocol server, not a live ClamAV installation.
- Live local API health: HTTP 200.
- Browser: Bengali/English home, submission of explicitly fictional local test data, receipt, private tracking, statistics suppression, language switching, staff login and built frontend served by Express.
- Desktop layout and 390 × 844 mobile layout inspected. Mobile navigation worked and no horizontal overflow was observed on the home page.
- A fresh production-bundle browser session showed no captured JavaScript errors on the home/staff-login checks.

## Not performed / external setup still required

- Real ClamAV engine/signature operation; current development mode deliberately quarantines evidence.
- Docker build/run (Docker is unavailable on this workspace).
- Real MongoDB Atlas provisioning, domain registration, DNS, remote HTTPS deployment, WAF and shared rate-limiter infrastructure.
- External monitoring/alerting, production backup/retention schedules and recovery rehearsal on real infrastructure.
- Independent penetration/security audit, legal review and response-team readiness.

The local testing above is not evidence of production launch readiness. Intake remains explicitly gated in production by the launch-approval configuration.

## Latest administrator, union and media checks

Automated checks cover dependent union validation and privacy thresholds, admin report corrections and publication revocation, report/evidence/staff creation/edit/deletion authorization, account session invalidation, public page information draft/publish/delete, legacy encrypted-file compatibility and tamper rejection before plaintext release. An actual 200 MiB streamed MP4-container fixture was accepted and downloaded with matching SHA-256; one byte over was rejected with temporary ciphertext cleanup. This is a size/protocol fixture, not a video playback or live antivirus test. Backup restore compares every restored encrypted file byte-for-byte with its source.

Browser checks confirmed the existing administrator account reaches `/admin/dashboard` and the existing moderator account reaches `/staff/dashboard` with email/password only. Admin report creation and public-information forms rendered; the staff sidebar omitted admin controls. Intake options correctly cascaded Dhaka → Savar → Ashulia, and the 200 MB video limit appeared in Bengali. Public view included a dependent union filter. No reports or public page content were added to the user's database during these checks; test sessions were signed out.
