# Security & operations

## Implemented controls

- AES-256-GCM field and evidence encryption; Argon2id password/secret hashing.
- Random reporter credentials, hash-only tracking secret storage, no reporter account required.
- Email/password staff login with persistent account lockout, session expiry, cookie protection, server-side roles and assignment checks.
- Validation and strict input schemas, content sniffing, private file keys, safe download headers, quarantine, ClamAV fail-closed behavior.
- Origin checks, staff CSRF tokens, API/login/submission rate limits, Helmet headers and restrictive content policy.
- Review state transitions, independent publication review and revocation when inputs change.
- Public details expose only independently approved redacted snapshots; maps use district centers only. Low-count dimensions and totals that permit reconstruction are suppressed.
- Audit events omit narratives, evidence, secrets and contacts. Each event includes an integrity MAC. Application endpoints cannot edit audit records; database administrators are still privileged and require external database auditing.
- Explicit launch gate, retention utility and separately encrypted backups.

## Scope and limitations

Anonymous is not untraceable. Providers, devices, networks and evidence metadata can identify reporters. Contact information is optional. Do not promise absolute anonymity. Automated spam, exact-text duplicate and personal-data indicators support human review; they do not prove truth or detect every abuse case. Redaction is a human responsibility. No automated allegation verification is claimed.

Rate limits currently use process-local memory. For multiple instances, replace the limiter store with a shared Redis-compatible store and add perimeter throttling/bot challenges. Plan session/token revocation for credential resets and key rotation before public launch. Authenticator codes are disabled by project-owner request. Administrators provision accounts and can reset passwords, revoking existing sessions. Account recovery requires a separately documented identity-verification process.

Public aggregates are conservative within each response, but repeated publication over time may reveal changes. A public rollout should use scheduled statistical snapshots, larger thresholds or differential privacy according to the independent privacy review. Maps load third-party tiles only after consent. Precise report locations are never plotted.

Private evidence is encrypted on disk; original files are preserved for review and may contain metadata. Only a clean malware scan allows download. Malware scanning is not a guarantee that a file is harmless. Harden reviewer devices and inspect evidence in a sandbox. Use object storage with scoped access and an isolated scanner worker for larger deployments.

Deletion removes live report/evidence/review/history records. Audit identifiers persist for accountability; backups persist until their documented expiry. Schedule and verify cleanup, monitor failures and enforce least-privilege access at the database and hosting layers.

## Incident response runbook

1. Appoint a primary responder, privacy lead and backup responder before intake opens.
2. On suspected compromise, pause intake (`REPORTING_ENABLED=false`), revoke staff sessions, restrict admin access and preserve metadata-only audit evidence.
3. Assess affected data and infrastructure. Isolate scanner/storage failures. Do not copy narratives into tickets or external chat.
4. Rotate compromised credentials via a planned migration; never discard encryption keys before migrating encrypted records.
5. Restore into a clean isolated environment, verify authorization and evidence access, and conduct legal/privacy review of notifications.
6. Record the incident, remediate root causes and reopen intake only with accountable sign-off.

## Sources

[Express production security guidance](https://expressjs.com/en/advanced/best-practice-security.html)

[Bangladesh Police emergency service information](https://www.police.gov.bd/)

# Community journal controls

Public publication is a separate redacted snapshot requiring optional reporter consent, assigned staff preparation, and independent senior approval. An explicit serialization whitelist excludes all private database fields and original evidence. Small upazila and union groups are withheld, exact dates are reduced to months, and map markers are district centers. Consent withdrawal, expiry, draft edits, status changes and added evidence hide the public account until eligible again. Human review must remove names and identifying context; automated contact/identity/URL pattern checks are supplementary.

Staff sign-in requires email and password; five failed attempts persist a 15-minute lock. Roles are derived from the stored account, never from client input. Sessions expire after 30 minutes idle and eight hours absolute; CSRF remains stable across browser tabs. Admin security monitoring exposes only safe audit metadata and aggregate operational counts. External alerting, a shared production rate limiter and independent penetration testing remain infrastructure work.

Evidence remains AES-GCM encrypted and private. Uploads stream directly into encrypted files without storing plaintext or buffering whole videos. Video uploads accept 200 MiB; other formats accept 10 MiB. Downloads authenticate the encrypted stream before releasing plaintext; legacy encrypted files remain readable. Content detection, size caps, per-process upload concurrency caps, duplicate-content uniqueness and retry idempotency limit accidental duplication and memory use. Development files are quarantined; production requires ClamAV. Public-story approval fails closed for unclean or incomplete evidence. The project does not promise immunity from hacking.
