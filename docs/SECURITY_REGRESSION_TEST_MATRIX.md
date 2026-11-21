# Security Regression Test Matrix — NexusDev 2.0

Branch: `rebuild/v2-security`

This matrix records the regression coverage reviewed during the security consolidation block. A test being present in source is not, by itself, evidence that an external provider or production deployment was exercised.

## Authentication and sessions

- `test/session-http.integration.test.js`: HTTP registration/login/session lifecycle, retired legacy auth endpoints, session ownership, logout-all, stale credential-version access and refresh rejection, password-reset rate limits, reauthentication and privacy routes.
- `test/session-store.mongo.test.js`: MongoDB replica-set refresh rotation, replay detection, concurrent refresh, logout/revoke-all race, transaction rollback, user-scoped purge.
- `test/session-access-token.test.js`, `test/session-refresh-service.test.js`, `test/session-csrf-middleware.test.js`: access-token binding, refresh behavior, CSRF/origin protections.

## Password recovery

- `test/password-reset.test.js`: token hashing, expiry, generic response, rate limits and mailer failure behavior.
- `test/password-reset.mongo.test.js`: concurrent one-time consumption, authVersion increment, session revocation, and transaction rollback.

Operational boundary: Gmail delivery credentials are not configured/validated for staging in this workstream. The UI's recovery-email delivery must not be described as operational until a real staging mail delivery test is completed.

## Progress, proofs, certificates

- `test/completion-proof.test.js` and `test/completion-files-hash.test.js`: RS256-only proofs, issuer/audience/purpose/user/challenge binding, file hash binding, expiration and maximum lifetime.
- `test/complete-lesson.test.js`: transaction session propagation, replay rejection, rollback, conditional XP and daily streak.
- `test/certificate-issue-once.mongo.test.js`: concurrent issuance produces one frozen certificate snapshot.
- Runner execution is not deployed or enabled. No XP should be enabled through an untrusted client-side completion path.

## Privacy and account separation

- `test/user-data-export.test.js`: export allowlist and exclusion of password hashes, provider identifiers, internal fields, token hashes and CSRF secrets.
- `test/session-http.integration.test.js`: authenticated ownership and cross-account privacy/export protections.
- `test/lesson-drafts.mongo.test.js`: concurrent compare-and-swap and account isolation.
- `test/deletion-impact.test.js`, `test/deletion-readiness.test.js`, `test/deletion-request-state.test.js`: fail-closed deletion readiness and state policy.

## Configuration and abuse controls

- `test/config.test.js`: required secrets, placeholder rejection, CORS and configuration bounds.
- `test/public-read-policy.test.js`, `test/certificate-lookup.test.js`, `test/tutor-request-policy.test.js`: input and public endpoint policies.
- Rate limiting currently uses per-process memory storage. The documented shared-store design has not been implemented or enabled.

## Explicitly unverified external behavior

1. Google OAuth provider round-trip has not been completed with staging credentials.
2. Gmail password-reset delivery has not been validated and remains out of scope until the mail credentials are deliberately configured.
3. Runner execution is not deployed; its private signing key is not provisioned.
4. Full visual browser testing of the protected Vercel Preview has not been completed.
5. Live Atlas TTL/unique index options were not independently inspected during the latest metadata attempt.
6. No production user data, production secrets, or production services were accessed.

## Exit criteria

Before declaring the platform production-ready, require:
- green CI on the final reviewed commit;
- synthetic-account end-to-end tests against staging for auth, session management, privacy export, drafts and certificate lookup;
- independent verification of live index options and transaction support;
- a separate runner security/deployment gate before enabling completion proofs or XP;
- explicit product/privacy decisions for certificate retention and legacy comments.

This matrix is a regression inventory and does not certify production readiness.
