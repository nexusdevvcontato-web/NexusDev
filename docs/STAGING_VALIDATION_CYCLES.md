# NexusDev 2.0 — Staging Validation Cycles

Assessment date: 2026-11-21  
Branch: `rebuild/v2-security`  
Scope: staging and automated test infrastructure only. Production was not modified or used.

## Cycle 1 — CI, authentication, account isolation, progress and drafts

### Automated validation

- Backend workflow: [run 44844376174](https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44844376174), commit `d0dc312dbfbbc8f38d46c048e1e4a3e33ec2e6aa`, conclusion `success`.
  - Dependency installation and production dependency audit passed.
  - Disposable MongoDB 7 replica set started and initialized successfully.
  - Syntax and security test command completed successfully.
- Frontend workflow: [run 44836361070](https://github.com/nexusdevvcontato-web/nexusdev-frontend/actions/runs/44836361070), commit `681149244eb488290a37ab8b27885365eef35aa4`, conclusion `success`.
  - Dependency audit, frontend tests, and Vite production build passed.

### Coverage reviewed

- Session registration/login, refresh rotation and replay rejection, logout-all, device listing/revocation, credential-version invalidation, and legacy-token rejection.
- Account-scoped draft reads/writes, compare-and-swap revision conflicts, concurrent writes, and cross-account isolation.
- Progress/completion proof verification and replay protections, including replica-set concurrency tests.
- Frontend account namespace gating, storage isolation, draft synchronization/conflict handling, and logout/refresh race tests.

### Staging infrastructure

- Render service `nexusdev-staging-v2` is on `rebuild/v2-security`, Free plan, with auto-deploy disabled and health path `/api/health`.
- Vercel Preview deployment for frontend commit `681149244eb488290a37ab8b27885365eef35aa4` is recorded as `READY`.
- No production deployment, merge, or production configuration change occurred.

### Cycle 1 conclusion

<em>Automated regression validation passed.</em> This does not substitute for a real authenticated browser journey through the protected Preview. No synthetic staging account was created during this validation pass.

## Cycle 2 — Privacy, certificates, Atlas and interface

### Privacy and certificates

- Privacy export allowlist tests verify that password hashes, Google identifiers, internal fields, and token/CSRF hashes are not exported.
- Certificate issuance concurrency tests use a disposable MongoDB replica set and assert a single frozen certificate snapshot under concurrent issuance.
- Privacy deletion remains intentionally fail-closed. Certificate revocation/anonymization, legacy comment treatment, retention, and cancellation-window decisions are still unapproved.
- Password recovery email and Google OAuth provider round-trips remain unverified operational integrations. Do not claim either is fully operational.

### Atlas staging index inventory

The staging database `nexusdev_staging` exposes these collections and index key patterns:

| Collection | Indexes observed |
|---|---|
| `users` | `_id`, `email`, `certificateCode` |
| `sessions` | `_id`, `userId`, `familyId`, `revokedAt`, `expiresAt` |
| `refreshtokens` | `_id`, `sessionId`, `tokenHash`, `usedAt`, `expiresAt`, `sessionId + usedAt`, `userId` |
| `completionproofs` | `_id`, `jti`, `userId`, `expiresAt` |
| `comments` | `_id`, `lessonId`, `authorUserId` |

The Atlas index-inspection response exposes index names and key patterns but not the `unique`, `sparse`, or `expireAfterSeconds` options. Therefore the existence of the expected key patterns was observed, but the live uniqueness and TTL options are **not confirmed** by this inspection. Mongoose schema declarations and CI `.init()` tests are not a substitute for checking those live options. No collection documents or real user records were sampled.

### Interface and authenticated journeys

- A complete interactive browser acceptance pass was not performed.
- The protected Preview's authenticated `/api/me` request previously stopped at the Vercel deployment-authentication layer; that response is inconclusive about application authentication.
- The current Vercel connector could not resolve/access the deployment for a new fetch. Deployment protection was not disabled or bypassed by weakening project settings.
- Responsive layout, keyboard/accessibility behavior, registration/login/refresh/logout in a browser, account switching, draft conflict UI, export reauthentication, and certificate UI remain pending interactive verification.

## Overall result

- Cycle 1: automated CI and test suites passed; authenticated browser acceptance remains pending.
- Cycle 2: privacy/certificate regression tests passed; Atlas key patterns were inventoried; live index options and browser journeys remain pending.
- Production remains untouched.

The NexusDev 2.0 staging baseline is materially validated, but this work does **not** authorize production release. Keep runner/XP disabled until the isolated runner is deployed and adversarially tested. Keep deletion automation disabled until the outstanding product/legal policy decisions are approved.
