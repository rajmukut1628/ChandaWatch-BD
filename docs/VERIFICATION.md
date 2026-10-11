# Verification

Run `npm run check` to compile the production React bundle and exercise the isolated MongoDB API integration suite. The first test run needs the official MongoDB binary download.

Tests cover report validation/encryption, credential-only tracking, no sensitive tracking response fields, unauthenticated/cross-origin denial, assignment authorization, CSRF, status transitions, independent publication review, low-count privacy suppression, content-based evidence checks/quarantine, ownership-verified privacy requests, audit redaction, staff creation and self-demotion protection.

Manual pilot acceptance:

- Use narrow and wide browser widths; switch বাংলা/English.
- Submit, save credentials, upload evidence and track history.
- Provision three separate staff roles. Assign a report and complete independent review.
- Start ClamAV, rescan quarantined evidence, check clean download authorization, then approve aggregate publication.
- Process correction/removal requests and verify deletion from live data.
- Rehearse encrypted backup verification **and restore** into an empty isolated database.
- Test operational monitoring, proxy origin handling, WAF limits and intake pause.

Automated tests are not a security audit, penetration test, legal sign-off or production restore rehearsal. Actual validation results for this workspace are recorded in `VALIDATION.md` after execution.
