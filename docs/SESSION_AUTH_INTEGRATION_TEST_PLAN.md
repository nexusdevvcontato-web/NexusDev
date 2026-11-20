# Session authentication integration test plan

**Branch:** `rebuild/v2-security`  
**Status:** automated middleware integration tests added; real HTTP/browser staging tests pending.

## Security correction found during audit

Mutating session endpoints originally validated the refresh-cookie/CSRF session and then independently validated the Bearer access-token session. Those credentials could refer to two different sessions. The request still required valid credentials, but the two authentication contexts were not explicitly bound.

The middleware now preserves the cookie-authenticated session as `req.csrfSession`, validates the Bearer token as `req.session`, and requires both session IDs and user IDs to match before logout, logout-all, or per-session revocation proceeds.

The combined test exercises the actual CSRF middleware, access-token middleware, and session-binding middleware together. It checks both matching and mismatched session identifiers.

## Automated checks

- Exact trusted Origin and CSRF token validation.
- Refresh-cookie presence and active refresh record.
- Active session and stored CSRF hash.
- Access token signature, issuer, audience, expiry and active session.
- Cookie session equals Bearer session.
- Cookie user equals Bearer user.
- Logout and revocation ownership boundaries.
- Refresh replay and rotation unit/integration coverage in existing suite.
- Mongo replica-set session-store tests run against a disposable database in CI.

## Required staging HTTP tests

Run only after a dedicated Render staging service, isolated MongoDB database, HTTPS Vercel Preview proxy, and staging-only secrets have been provisioned.

1. Register and login; verify response has no refresh token in JSON and both cookies have Secure, Path=/, no Domain; refresh cookie is HttpOnly.
2. Verify all session responses use Cache-Control: no-store.
3. Reload browser and restore session using refresh.
4. Rotate refresh token; old token must not be accepted.
5. Submit a reused refresh token with its matching old CSRF proof; session family must be revoked.
6. Send invalid/missing Origin and mismatched CSRF cookie/header; expect rejection.
7. Send cookie for session A and Bearer access token for session B to logout/logout-all/revoke; expect 403 and no state change.
8. Open two tabs and trigger refresh simultaneously; verify Web Locks serializes rotations and both tabs recover without replay revocation.
9. Logout current session; verify refresh and access token are rejected.
10. Logout all; verify every device session is revoked.
11. Revoke another device session; verify the target session is rejected and the current session remains active.
12. Verify no credentials, cookies, raw refresh tokens or access tokens appear in logs.
13. Verify Vercel external rewrite preserves Set-Cookie and forwards Cookie; verify no caching on /api/*.
14. Verify preview deployment cannot reach production MongoDB or production Render API.

## Release blockers

- No staging service or database is provisioned.
- No session, reauthentication, Google, or runner secrets are configured in staging.
- No real browser test has been executed.
- No production endpoint, environment variable, database, deployment, or cookie setting was changed.
- Do not enable the frontend session flow in a live environment until the full staging checklist passes.
