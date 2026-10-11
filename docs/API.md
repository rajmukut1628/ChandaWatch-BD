# API v1

All routes below are under `/api/v1`. JSON errors use `{ "error": "message" }`. Sensitive responses use `Cache-Control: no-store`.

| Method   | Route                       | Access                                                                     |
| -------- | --------------------------- | -------------------------------------------------------------------------- |
| GET      | /health                     | Public, readiness configuration                                            |
| GET      | /public/districts           | Public, 64 districts                                                       |
| GET      | /public/statistics          | Public, approved suppressed aggregates                                     |
| POST     | /reports                    | Public, intake must be enabled                                             |
| POST     | /reports/track              | Reporter ID + secret in JSON                                               |
| GET      | /reports/:id/status         | Reporter ID + secret in headers                                            |
| POST     | /reports/:id/evidence       | Reporter credentials in headers, multipart `file`                          |
| POST     | /privacy/requests           | Public, private correction/removal/access request                          |
| POST     | /staff/auth/login           | Email + password; account determines role                                  |
| GET      | /staff/auth/me              | Session cookie, renew CSRF token                                           |
| POST     | /staff/auth/logout          | Session + CSRF                                                             |
| GET      | /staff/reports              | Staff, moderators assigned only; status/district/upazila/union/search/page |
| GET      | /staff/reports/:id          | Staff, moderators assigned only                                            |
| PATCH    | /staff/reports/:id/status   | Assigned staff + CSRF                                                      |
| POST     | /staff/reports/:id/review   | Independent senior/admin + CSRF                                            |
| GET      | /staff/analytics            | Staff, internal aggregates                                                 |
| GET      | /staff/evidence/:id         | Assigned staff; clean evidence only                                        |
| POST     | /staff/evidence/:id/scan    | Senior/admin + CSRF                                                        |
| GET/POST | /admin/users                | Admin, list/provision staff                                                |
| PATCH    | /admin/users/:id            | Admin, edit name/email/password/role/status; revoke sessions               |
| PATCH    | /admin/reports/:id/assign   | Admin, `{staffId}`                                                         |
| DELETE   | /admin/reports/:id          | Admin, `{reason}`; permanent live-data deletion                            |
| GET      | /admin/audit-logs           | Admin, paginated                                                           |
| GET      | /admin/privacy-requests     | Admin, decrypted request queue                                             |
| PATCH    | /admin/privacy-requests/:id | Admin, `{state,resolution}`                                                |

## Reporter submission

```json
{
  "incidentType": "extortion_demand",
  "district": "dhaka",
  "area": "Mirpur",
  "incidentDate": "2026-10-01",
  "description": "A description of what was directly observed, at least 30 characters.",
  "demandedAmount": 10000,
  "currency": "BDT",
  "contactRequested": false,
  "privacyAcknowledged": true
}
```

Response includes `id`, `trackingId`, `secret`, `status`. Save both credentials. `district` is a code from `/public/districts`. For tracking POST `{trackingId,secret}`. Evidence/status headers are `x-tracking-id` and `x-tracking-secret`; never place secrets in query strings.

## Staff mutations

Session cookie is `cw_session`. Send `x-csrf-token` returned at login or `/staff/auth/me`. Browser origins must match `APP_ORIGIN`. API clients without Origin are allowed; secure cookie and CSRF rules still apply. Pagination defaults to 20 reports or 50 audit events.

# Community journal additions

`GET /api/v1/public/upazilas?district=dhaka` returns district-dependent geography. Optional intake `upazila` must belong to `district`; `publicConsent` defaults to false. `GET /public/unions?district=dhaka&upazila=<code>` returns dependent unions; optional intake `union` must belong to both parents.

`GET /api/v1/public/cases` returns **10 items per page**, newest publication first. Query: `page`, `district`, `upazila`, `union`, `type`, `from`/`to` (YYYY-MM), `status` (reviewed/resolved), `verification`, `search` (literal title/summary text), `sort` (latest/oldest). Unknown filters are rejected. Response: `items,total,page,pageSize,pages,notice`. Small upazila and union groups are withheld; querying them returns no results. Map markers use district centers.

`GET /api/v1/public/cases/:publicId` exposes only an approved redacted snapshot and safe publication timeline. It never includes tracking credentials, database IDs, raw descriptions, contact, exact area, staff, original evidence or internal notes. Expired, withdrawn, duplicate, unconsented and unapproved accounts return 404.

`PATCH /api/v1/staff/reports/:id/public-draft`: assigned staff access + CSRF; body `title,summary,body,displayUpazila,displayUnion`. Requires reporter consent and revokes previous approval. Contact/identity/URL patterns are blocked; manual identity and safety review remains mandatory.

Senior review accepts `publishPublic` and `redactionConfirmed` booleans plus `verificationLevel` and optional safe `verificationNote`. Approval requires a different person from the status reviewer and draft author, clean evidence, and an eligible status. Independent verification requires a public explanation of its method.

`PATCH /api/v1/reports/:id/public-consent`: tracking headers + body `{consent:boolean}`. Withdrawal immediately hides the account. Granting again requires new approval.

Evidence uploads: max five files; video MP4/WebM up to 200 MiB (209715200 bytes), images/documents/audio 10 MB. Actual content is detected, duplicates are idempotent by content hash, encrypted streaming uploads have a per-process concurrency cap. Originals remain encrypted and private.

`GET /api/v1/admin/security`: admin-only recent denied/blocked audit events, quarantine counts, locked accounts and scanner configuration. Account lockout: five failures, 15 minutes. Staff idle expiry: 30 minutes. CSRF tokens remain stable across tabs.

## Administrator controls

All mutations require an administrator session and CSRF token. Login body is strictly `{email,password}`; `/admin/dashboard` is the admin UI, `/staff/dashboard` is the staff UI.

- `POST /admin/reports`: same intake body, creates private report and returns reporter credentials once.
- `PATCH /admin/reports/:id`: full intake body without honeypot plus `reason` (10–500 characters); revalidates geography, encrypts changes, removes old public draft and revokes approval.
- `POST /admin/reports/:id/evidence`: multipart `file`, same five-file/size/scanning rules.
- `DELETE /admin/evidence/:id`, `/admin/users/:id`, `/admin/reports/:id`: `{reason}`, permanent removal; audit metadata survives. Administrators cannot delete their own account.
- `GET /admin/page-info`; `PUT /admin/page-info/:slug`: `{title,titleBn?,body,bodyBn?,published}`; `DELETE /admin/page-info/:slug`: `{reason}`. Slugs: home, awareness, safety, privacy. The legacy home information is displayed on `/about`. React renders plain text; published contact/identity patterns in either language are rejected.
- `GET /public/page-info/:slug`: published bilingual title/body only; drafts remain private.

Union public visibility requires `displayUpazila` and `displayUnion`, independent approval and the configured minimum group size. A hidden union filter returns zero items.

## Administrator-selected news

## Platform ownership

- `GET /staff/ownership`: authenticated staff owner summary, revision and pending transfer status; successor receives `canAccept`.
- `POST /staff/ownership/request`: owner + CSRF + current password; `{targetEmail,password,revision}`. Target must be another active staff account. Request lasts 24 hours.
- `POST /staff/ownership/cancel`: owner + CSRF; `{revision}`.
- `POST /staff/ownership/accept`: designated successor + CSRF + own password; `{transferId,password,revision}`. Promotes successor, switches persistent owner, revokes both accounts' sessions; sign in again.
- Administrative user PATCH/DELETE/access endpoints reject changes to the current owner and unexpired pending successor. Owner record is initialized at server startup/bootstrap and persists independently of role labels.

## Administrator-selected news details

Additional news fields: `newsCategory` (`important|alert|local|awareness`), `district` (known district code or empty), `coverMediaId` and `videoMediaId` (scanned editorial media IDs or null). Version restoration includes these fields and always returns to draft.

- News listing accepts optional literal `q`, `category`, `district`, ISO date `from`/`to`. Pagination remains ten items; homepage renders the first eight selected items.
- Detail response includes `related`: up to four other eligible stories in the same category.
- `POST /features/admin/news-media`: administrator + CSRF, multipart `file`; JPEG/PNG/WebP up to 10 MiB or MP4/WebM up to 200 MiB. Real scanner must return clean. Returns `{id,mimeType,url}`; unavailable scanner returns 503 without publishing/storing accepted media.
- `GET /features/admin/news-media/:id`: authenticated administrator preview.
- `GET /features/public/news-media/:id`: available only while referenced by an eligible published story; supports file range requests, MIME and nosniff headers, no-store caching.
- `GET /features/admin/work-queue`: authorized summary counters for submitted reports, review, draft news and future scheduled news.
- `DELETE /features/admin/content/:id/permanent`: `{slug,revision}`; matching trash item only. Version snapshots are removed and audit metadata retained.

- `GET /features/public/news?page=1&featured=true`: at most ten featured, published, enabled news items whose publication time has arrived. Omit `featured` for the public archive. Stable rank/date/slug ordering and total/pages support pagination.
- `GET /features/public/news/:slug`: eligible bilingual news, optional HTTPS source URL and publication/update dates; drafts, future schedules, disabled and trashed content return 404. Database identifiers, private revisions and author data are excluded.
- `PUT /features/admin/content/:slug`: existing content workflow now accepts `kind:"news"` and `featured:boolean`. Publishing news requires English and Bengali title/body. Same administrator session, CSRF, strict schema, identity-pattern rejection and revision conflict controls apply. Unfeaturing affects the homepage; unpublishing/disabling/trashing affects all public news routes. Version/trash restoration returns a draft.

The public homepage is the featured news feed. `/news` is the archive, `/news/:slug` the full story, and `/about` the previous introduction/landing content. Original report evidence is never copied to public news automatically.
