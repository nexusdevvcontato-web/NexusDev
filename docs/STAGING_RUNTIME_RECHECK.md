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
