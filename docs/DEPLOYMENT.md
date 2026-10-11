# Deployment

## Local evaluation

Use Node 22+ (Node 24 LTS recommended), install, setup and run as described in README. The development database persists on disk but is a convenience runner, not production infrastructure. Keep encryption keys unchanged; replacing them makes existing data unreadable. Stop the dev server before moving its database files.

## Production configuration

For account recovery, verification and email alerts, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, optional `SMTP_USER`/`SMTP_PASS`, and `SMTP_SECURE=true` for implicit TLS. Other SMTP connections require STARTTLS. Never put credentials into public frontend variables. Without SMTP, the application reports delivery unavailable and does not expose reset tokens.

The running API can perform daily jobs with `BACKUP_SCHEDULE_ENABLED=true` and `RETENTION_SCHEDULE_ENABLED=true`; administrators can inspect/toggle them in `/admin/settings` and run/check jobs in `/admin/operations`. Use one scheduling strategy to avoid overlapping external and in-app jobs. Persist `/app/server/backups` as well as storage, keep the separate backup key outside the archive, and establish off-host storage and a restore rehearsal. The current backup utility assembles its archive in memory and should be capacity-tested before large production datasets. Resumable chunk caches are temporary and are not backed up; restoring invalidates sessions, mail/reset tokens and resumable upload records.

1. Provision an authenticated MongoDB Atlas database, least-privilege database user, restricted network access and encrypted backups. Never expose a local anonymous MongoDB instance.
2. Supply secrets through your hosting secret manager: `FIELD_ENCRYPTION_KEY`, `AUDIT_KEY`, `MONGODB_URI`. Use a different `BACKUP_ENCRYPTION_KEY` for backups. Keys are 64 hex characters (32 bytes). Do not commit `.env`.
3. Set `NODE_ENV=production`, `APP_ORIGIN=https://your-domain`, `SCANNER_MODE=clamav`, `CLAMAV_HOST`, `CLAMAV_PORT`, and a persistent evidence volume. `REPORTING_ENABLED=false` keeps intake closed while the rest of the application can be evaluated.
4. Build with `npm ci && npm run build`, then `npm start`, or use the Dockerfile and compose.yaml. Docker Compose expects production variables exported into the process environment; do not rely on the development `.env` for production secrets.
5. Put the service behind a TLS reverse proxy and WAF. Port 4000 must be reachable only from that trusted proxy. The application trusts one proxy hop in production: align infrastructure or change that setting. Redirect HTTP to HTTPS and configure HSTS at the edge. Keep the scanner on an internal network.
6. Run the bootstrap utility inside the service environment. Add separate moderation and senior staff. Staff sign in with email and password. Test account-derived roles, CSRF and session revocation.
7. Configure external alerts for failed health checks, scanner failure, sustained 401/403/429/500 responses, storage limits and backup/retention failure. Avoid collecting request bodies, tracking headers, cookies or exact public IP addresses in monitoring.
8. Schedule `npm run retention` daily, and encrypted backups daily with a defined backup deletion window. Perform a restore rehearsal into an isolated empty database with the matching encryption keys and private evidence volume.
9. Complete the security audit, legal review and response-team rehearsal specified in the blueprint. Only then set `PUBLIC_LAUNCH_APPROVED=true` and `REPORTING_ENABLED=true`.

## Backups

Export `BACKUP_ENCRYPTION_KEY` from the secret manager, then:

```powershell
npm run backup
npm run backup -w server -- verify path/to/backup.enc
# Only on an isolated empty MongoDB target:
$env:CONFIRM_RESTORE='EMPTY_DATABASE'
npm run backup -w server -- restore path/to/backup.enc
```

Backups contain encrypted MongoDB collection exports plus encrypted evidence files; the whole archive is additionally AES-256-GCM encrypted with the backup key. The helper is sized for a controlled pilot and loads the export in memory. At scale use database-native snapshots and storage snapshots with tested recovery procedures. Quiesce writes during a pilot backup to avoid inconsistent collection/file snapshots. Verification confirms authentication/decryption/format; a **restore rehearsal** is a separate required operation. Never restore active sessions (the helper invalidates them).

## Domain / hosting

`chandawatchbd.com` is a proposed name only. No domain has been purchased, DNS changed, Atlas account created or public service deployed by this code generation. The supplied MERN server needs a Node host and MongoDB; it cannot be deployed as only a static page or a Cloudflare Worker without an architecture migration.

## Large video uploads

The API accepts MP4/WebM up to 200 MiB plus multipart overhead; configure the reverse proxy for at least `client_max_body_size 201m`, 30-minute upload/read timeouts and adequate encrypted storage. API request timeout is 31 minutes; browser uploads time out after 30 minutes. Other formats remain limited to 10 MiB. The bundled `server/clamd.conf`, mounted by Compose, sets StreamMaxLength/MaxFileSize to 210M and MaxScanSize to 420M; do not expose scanner port 3310 publicly. Verify large-file scanning with the real engine and signatures before deployment.

New backups use version 2 with base64 encoding for binary encrypted evidence. Restore still accepts version 1 legacy archives. The pilot backup helper buffers the archive in memory, so allow sufficient memory for large evidence or use database/storage snapshots at scale.
