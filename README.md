# ChandaWatch BD

Protected platform ownership and two-party transfer are available from staff management/account settings. See [ownership guide](docs/OWNERSHIP.md) and [twenty feature improvements](docs/FEATURE-IMPROVEMENTS.md).

The homepage now displays administrator-selected bilingual hot news; the previous landing content is at `/about`. See [the editorial workflow](docs/HOT-NEWS.md). Interface localization is shared across public and staff pages, with locale-aware dates and translated operational labels.

The 72-item expansion is implemented locally. See [feature delivery and service requirements](docs/FEATURE-DELIVERY.md). Staff use `/staff/login`; their stored role determines the dashboard. New operational pages include `/staff/account`, `/staff/notifications`, `/staff/priority`, `/staff/workload`, `/admin/content`, `/admin/access`, `/admin/feedback`, `/admin/settings`, and `/admin/operations`.

SMTP must be configured for recovery, verification and email alerts. Evidence remains quarantined until a real scanner returns clean. Scheduled backups and retention require a running API process; backup encryption uses a separate key. Production hosting and new-screen browser acceptance remain separate verification work.

A local MERN application for anonymous incident intake, private tracking, evidence review, independent moderation and privacy-preserving community statistics. React + Tailwind, Express, MongoDB, Leaflet/OpenStreetMap and Recharts. [বাংলায় পড়ুন](README_BN.md).

## Run

```powershell
npm install
npm run setup
npm run dev
```

Open **http://localhost:5173**. API: **http://localhost:4000/api/v1**.

`setup` creates random field-encryption and audit keys in ignored `server/.env`. Development automatically starts a local MongoDB 7 instance with persistent data in `server/.cache/mongo`; the first run downloads its official binary. No MongoDB account is needed for local development. Use `MONGODB_URI` for Atlas or your own MongoDB. Do not run multiple development servers against the same local database path.

With the dev server running, create your first staff administrator in a second terminal:

```powershell
npm run bootstrap
```

Enter an email, name and 14+ character password. There are no hardcoded accounts, passwords or fabricated public statistics. Sign in at `/staff/login`, then create a moderator and a separate senior reviewer through `/admin/users`.

## Included experience

- Bengali/English principal public pages, report intake, tracking, resources and policy; responsive public and staff layouts. Staff operational forms use English.
- Anonymous report submission with consent, validation, spam honeypot, encrypted private details, duplicate and sensitive-data screening indicators.
- One-time random tracking ID and secret; secret is Argon2id-hashed, never recoverable. Download credentials locally and track status/history privately.
- Optional encrypted evidence, content-based MIME validation, 200 MB for video / 10 MB for other files, 5-file limit, ClamAV integration and quarantine fallback. Evidence is private and only clean files can be downloaded by authorized staff.
- Staff email/password login, persistent lockout, HttpOnly session cookies, CSRF tokens, role authorization, moderator assignments, disabled-account session revocation.
- Moderation queue, report details, status transition rules, reporter-facing updates, duplicate references, redaction, independent senior publication approval.
- Public aggregate analytics and district-center map, 64 districts / 8 divisions, external map consent. Small groups and inferable totals are withheld.
- Staff dashboard, internal analytics, report/evidence/user management, editable public page information, audit logs, privacy request processing, deletion, retention job and encrypted backup/restore tooling.
- Docker configuration, CI checks, environment examples and operating documentation.

## Review flow

1. Submit a report and save both credentials.
2. Optional evidence upload. In local quarantine mode it cannot be downloaded until ClamAV scans it clean.
3. Administrator assigns the report to a moderator.
4. Moderator moves submitted → screening → under review → reviewed, recording a reporter-safe update and redacted summary.
5. A **different** senior reviewer approves publication. Unscanned evidence, duplicates and missing redaction block approval.
6. Only anonymized counts enter public statistics. Adding evidence or changing status revokes approval.

Public journal entries require explicit consent, a separate redacted draft and independent approval. Raw reports, identifying allegations, precise incident positions and original evidence remain private. Public report counts are **not crime rates**. Suppression intentionally leaves charts empty when privacy rules require it.

## Commands

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Run frontend and API                      |
| `npm run build`     | Build frontend                            |
| `npm start`         | Serve API and built frontend on port 4000 |
| `npm test`          | Integration tests using isolated MongoDB  |
| `npm run check`     | Build and tests                           |
| `npm run bootstrap` | Provision first administrator             |
| `npm run retention` | Remove expired reports and evidence       |
| `npm run backup`    | Encrypted backup with separate backup key |

For built local serving, set `APP_ORIGIN=http://localhost:4000` in `server/.env` before `npm start`.

## Production status

The project is implemented for local evaluation and a controlled pilot. Live deployment is not provisioned by this repository. Public launch requires an actual MongoDB service, private persistent storage, HTTPS/WAF, scanner, secret manager, monitoring, scheduled retention/backups, verified restore, independent security audit, legal review and an incident response team. The production server blocks report intake unless the operator explicitly sets `PUBLIC_LAUNCH_APPROVED=true`. Leave `REPORTING_ENABLED=false` before that review.

See [deployment](docs/DEPLOYMENT.md), [security and operations](docs/SECURITY.md), [API](docs/API.md) and [verification](docs/VERIFICATION.md).

Official emergency resource: [Bangladesh Police — National Emergency Service 999](https://www.police.gov.bd/storage/upload/announcement/EQn6xVWGC2SEEKpOeUKlcWEOTtqc8RCjxdWvLiP6.pdf). Express hardening reference: [Production security best practices](https://expressjs.com/en/advanced/best-practice-security.html).
