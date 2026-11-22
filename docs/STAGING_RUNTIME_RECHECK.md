# NexusDev staging runtime recheck

Assessment date: 2026-11-21  
Scope: staging-only verification. Production was not modified.

## Deployment identity and isolation

- Vercel Preview deployment: `dpl_2iCUSjEVYMBaGsy6ZxjBZ33L837w`
- Preview URL: `https://nexusdev-frontend-o3nxwz539-nexusdevvcontato-4011.vercel.app`
- Frontend commit: `681149244eb488290a37ab8b27885365eef35aa4`, branch `rebuild/v2-security`, state `READY`.
- Vercel project has SSO protection enabled for deployments except custom domains. Protection was not disabled or weakened.
- Render staging service: `nexusdev-staging-v2`, branch `rebuild/v2-security`, Free plan, one instance, health path `/api/health`, auto deploy disabled, PR previews disabled.
- Current live Render deploy remains `ed28e216d6bf83f2360f8fa795dda230c6bc2213`; no new runtime deployment was triggered.

## Runtime checks completed

| Check | Result | Interpretation |
|---|---|---|
| Preview root | HTTP 200 | Vercel serves the frontend HTML and built assets |
| Preview `/api/health` | HTTP 200 | Rewrite reaches Render; response includes `x-render-origin-server: Render` |
| Preview `/api/me` | Not verified | Vercel deployment authentication stopped the fetch after a redirect; no application response was observed |
| Preview runtime error logs | No matching records | No error/fatal records returned for the queried deployment/time window; this is not proof of zero client-side errors |
| Interactive browser journey | Pending | No authenticated browser session was available |

The health endpoint validates routing and service reachability only. It does not validate session cookies, CSRF, bearer-token handling, or protected application routes.

## Atlas staging index inventory

Database: `nexusdev_staging`. Only index metadata was inspected; no collection documents were read.

| Collection | Live index names and key patterns observed |
|---|---|
| `users` | `_id_` (`_id`), `email_1` (`email`), `certificateCode_1` (`certificateCode`) |
| `sessions` | `_id_`, `userId_1`, `familyId_1`, `revokedAt_1`, `expiresAt_1` |
| `refreshtokens` | `_id_`, `sessionId_1`, `tokenHash_1`, `usedAt_1`, `expiresAt_1`, `sessionId_1_usedAt_1`, `userId_1` |
| `completionproofs` | `_id_`, `jti_1`, `userId_1`, `expiresAt_1` |
| `comments` | `_id_`, `lessonId_1`, `authorUserId_1` |

The Atlas connector returns index names and key patterns, not index option metadata. Consequently, this pass cannot independently confirm the live `unique`, `sparse`, or `expireAfterSeconds` flags. Expected options remain declared in the Mongoose schemas and covered by automated schema tests, but that is not equivalent to a live option inspection.

No index was created, dropped, or modified.

## Outstanding work

1. Obtain an approved authenticated test path for the protected Preview without changing project protection or sharing long-lived bypass credentials.
2. Run synthetic-account journeys: register, login, refresh, CSRF enforcement, logout, cross-account switch, draft save/conflict, export reauthentication, and certificate access.
3. Confirm live Atlas index options through an inspection path that exposes full `listIndexes` metadata; do not rebuild or alter indexes speculatively.
4. Keep deletion automation disabled pending policy decisions and keep runner/XP disabled pending isolated runner deployment and adversarial validation.

## Conclusion

The staging frontend is reachable and its API rewrite reaches the live Render staging service. Atlas index key patterns match the expected schema inventory. Authenticated application routes and interactive browser flows remain unverified because deployment protection blocks the available fetch path. No production action was taken.


## Runtime recheck — 2026-11-22 (latest staging deploy)

- Render service `nexusdev-staging-v2` remains on the Free plan, branch `rebuild/v2-security`, with auto-deploy and Preview generation disabled.
- Latest deploy: `dep-dc1652ff3r2c73bove4g`, commit `152a51b73bbf6911d9b0307b0b250ed9e04f975b`; Render event history reports build and deploy succeeded.
- Application logs from the new instance confirm `yarn start`, `node server.js`, `Conectado ao MongoDB`, and `Servidor NexusDev v2.0 rodando na porta 10000`; Render then logged `Your service is live`.
- Render metadata still reports `/api/health` as the configured health-check path. No matching request-log entries for `/api/health` or `/api/ready` were present in the inspected request-log window, so an independent HTTP response is not claimed in this recheck.
- Atlas metadata confirms the separate Free cluster `NexusDevStaging` is IDLE in project `NexusDev Staging`; the connected database is `nexusdev_staging`. Only database/collection/index metadata was read; no documents were queried.
- Live `sessions` indexes now include the expected compound key `{ userId: 1, revokedAt: 1, lastUsedAt: -1 }`, alongside `userId_1`, `familyId_1`, `revokedAt_1`, and `expiresAt_1`.
- The remaining `sessions.userId_1` index is a likely redundant legacy index: the current Mongoose schema no longer declares it, and the compound index has `userId` as its leading key. It was not dropped because this pass was read-only at the database layer.
- Live `refreshtokens`, `completionproofs`, `comments`, and `users` index key patterns were also inventoried. The Atlas metadata tool exposes names and key patterns but not `unique`, `sparse`, or TTL `expireAfterSeconds` options; those flags therefore remain unverified live and must not be inferred from key names.
- Frontend CI for commit `abeb1041f040eee9e84a671a0a25863b6b538bfe` passed (run `44969027038`). Backend CI for commit `152a51b73bbf6911d9b0307b0b250ed9e04f975b` passed (run `44981022173`).

### Remaining validation gates

1. Obtain an approved way to issue a synthetic, unauthenticated GET to `/api/health` and `/api/ready`; do not bypass Vercel SSO or use production credentials.
2. Inspect full Atlas `listIndexes` options for the staging database before any index cleanup. Review the extra `sessions.userId_1` index as a controlled migration candidate; do not drop it speculatively.
3. Execute HTTP integration tests for privacy export and deletion-impact using synthetic accounts only. The export route requires recent reauthentication; no real account was used.
4. Keep production, real user documents, secrets, and database contents untouched.
