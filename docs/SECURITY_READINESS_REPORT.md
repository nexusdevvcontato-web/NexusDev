# NexusDev 2.0 — Security Readiness Report

Assessment date: 2026-11-21  
Work branch: `rebuild/v2-security`  
Scope: parallel rebuild and staging only. This report is an engineering readiness assessment, not a penetration-test attestation, legal opinion, or production approval.

## Executive status

**Status: staging foundation verified; production release is not approved by this report.**

The backend security regression workflow completed successfully on commit `f4f296b294dee3a4cbc4949d563e29643ca0b52e` (run `44844003307`). The frontend branch's latest recorded CI completed successfully on `681149244eb488290a37ab8b27885365eef35aa4` (run `44836361070`).

The Vercel Preview root returned HTTP 200. Its `/api/health` request returned HTTP 200 from the Render staging service, including the Render-origin response header. This verifies the basic Preview-to-staging transport path only.

## Verified in this workstream

- Backend security regression suite: GitHub Actions run `44844003307`, conclusion `success`.
- Frontend CI: GitHub Actions run `44836361070`, conclusion `success`.
- Vercel Preview: deployment reported `READY` for frontend commit `681149244eb488290a37ab8b27885365eef35aa4`.
- Render staging: expected service and branch; free plan; health path `/api/health`; auto-deploy disabled.
- Vercel Preview root document served the NexusDev Vite application with HTTP 200.
- Vercel Preview `/api/health` reached Render staging and returned HTTP 200.
- Backend security tests include isolated disposable MongoDB replica-set execution, authentication/session regression coverage, account-isolation checks, export controls, rate-limit behavior, and data-integrity/concurrency proofs as recorded by the individual test commits and workflow.
- Production was not deployed, modified, or used as a test target.

## Partial validation — do not interpret as passing

- Protected Preview request to `/api/me` was blocked by the deployment-authentication layer after redirect. This is inconclusive for the application's own authentication endpoint.
- No complete interactive browser session was run. Layout, responsive behavior, accessibility, and complete user journeys remain unverified.
- Registration, login, refresh, logout, drafts, privacy export, and certificate journeys were not all executed end-to-end through the protected staging Preview during the integration pass.
- Live Atlas TTL/unique index options were not independently confirmed in the live staging cluster; schema declarations and test initialization are not equivalent to inspecting live index options.

## Release blockers and operational gates

### 1. Runner and XP

The code-side completion-proof design and evaluator restrictions are present, but the runner is not deployed as an isolated production execution service, and its signing private key is not provisioned. XP/completion awarding must remain disabled until the runner is independently hosted, sandboxed, network-restricted, resource-limited, and adversarially tested. Do not expose a runner endpoint or enable XP based solely on the current code/tests.

### 2. Password recovery email

Token generation, hashing, expiry, one-time reset, and session invalidation logic are implemented and covered by tests. Gmail delivery is not configured or validated; no working refresh token has been confirmed. The UI's recovery-not-configured state is expected until a provider is configured and an end-to-end email delivery test passes. Do not claim password recovery email is operational.

### 3. Rate limiting across instances

The current process-local limiter protects individual instances but does not provide globally shared counters across multiple backend instances. A shared-store architecture is documented; shared distributed enforcement has not been implemented/validated. Before horizontally scaling or claiming cluster-wide abuse protection, implement and test a shared store and failure policy.

### 4. OAuth provider round-trip

Google OAuth code paths and verified-email safeguards exist, but a complete real provider round-trip has not been validated in staging. Treat provider configuration and callback validation as an outstanding release gate.

### 5. Privacy deletion policy and automation

The deletion document is a technical proposal, not an approved legal/product policy. No production deletion endpoint, scheduler, or purge execution is enabled. Decisions remain open on:
- certificate revocation versus preserving an anonymized certificate;
- treatment of legacy comments that lack a reliable account identifier;
- retention periods for logs, backups, and third-party providers;
- cancellation window and confirmation requirements.

Do not enable deletion automation or infer comment ownership by matching names. Keep deletion fail-closed until policy decisions, auditability, retention, and idempotent execution are approved and tested.

### 6. Authenticated browser acceptance

A protected browser test is still needed for the complete account lifecycle, refresh rotation/replay behavior, device-session management, account switching/local-storage isolation, draft conflict handling, export reauthentication, and relevant privacy flows. Test only with synthetic staging accounts and data.

### 7. Database operational verification

Reconnect to the staging Atlas cluster and inspect actual TTL and unique index options, then compare them with the Mongoose schema and expected lifecycle behavior. Do not broaden network access to `0.0.0.0/0`; do not inspect production data.

## Recommended release sequence

1. Keep the current production deployment and database untouched.
2. Complete staging browser acceptance with synthetic accounts and record each flow/result.
3. Confirm live staging indexes and database constraints.
4. Decide and approve privacy deletion product/legal policy before implementing destructive workflows.
5. Configure and validate email recovery and Google OAuth provider round-trip, or explicitly keep those features unavailable.
6. Implement shared rate-limit storage before multi-instance scaling.
7. Deploy and adversarially validate the isolated runner before enabling XP or completion certificates.
8. Re-run frontend/backend CI and staging acceptance after each runtime change.
9. Perform a separate production change review and obtain explicit release authorization. This report does not authorize merge, promotion, or production deployment.

## Final assessment

The rebuild has a meaningful security baseline and its automated regression workflows and basic Vercel-to-Render staging connectivity are green. It is **not yet ready for an unrestricted production release** because several operational integrations, browser journeys, and product-policy decisions remain unverified or intentionally disabled.

No production resources, production secrets, or real user records were changed or accessed for this assessment.
