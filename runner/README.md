# NexusDev trusted runner service (scaffold)

This directory contains the trusted request boundary, a server-owned declarative challenge registry and RS256 proof signer for the future runner. It is **not an arbitrary-code execution service** and intentionally exposes no HTTP endpoint or Docker control. The registry currently contains 530 server-owned lesson specifications across the 700-lesson curriculum; unregistered patterns remain ineligible for official XP.

## Security boundary

- Only the authenticated API may supply the user identity; the browser must never choose the proof subject.
- Challenge IDs are resolved by `src/challenge-registry.js`; the registry currently contains 530 authored/generated specifications with declarative checks. Unknown IDs and generated patterns without a trusted specification are rejected.
- The registry includes introductory HTML checks, 134 generated module-one lessons (semantic HTML, forms, Box Model, Flexbox, Grid and debugging), generated JavaScript lessons for modules 2, 3 and 5, and supported Express controller patterns for module 4. The HTML evaluator parses inert fragments with parse5 and checks fixed server-owned selectors/assertions. Its restricted CSS parser checks only bounded, static declarations against trusted expected values; it does not render styles, calculate layout, process media queries or execute CSS. The JavaScript evaluator interprets only a small Acorn AST subset, including function cases, deep equality, non-mutation checks and bounded array/string operations; it is not a general runtime.
- Never accept tests, expected output, commands, image names, or container options from the request.
- Input is bounded to 10 files, 50 KB per file and 200 KB total.
- The proof signer creates RS256 JWTs for `nexusdev-runner` / `nexusdev-progress`, purpose `lesson-completion`, bound to one user and challenge, with a maximum 300-second lifetime.
- The private key must be injected at runtime from a secret manager and must never be committed, sent to the API, or exposed to a job container.

## Container policy prototype (not an active launcher)

`src/docker-policy.js` builds a fixed Docker argument vector for a digest-pinned image and a host-created workspace. It enforces no network, read-only root filesystem, all Linux capabilities dropped, no-new-privileges, non-root UID/GID, PID/memory/CPU/file-descriptor limits, a bounded `noexec` temporary filesystem and a read-only workspace mount. It rejects mutable image tags, unsafe mount paths and out-of-range timeouts. Unit tests assert these invariants.

This is a policy builder only: it does not invoke Docker, create workspaces, enforce a wall-clock kill, inspect daemon configuration, or prove that the host kernel/runtime is hardened. The fixed command points to `/opt/nexusdev/execute.js`, which is not yet implemented. Do not wire this into an API or enable execution until the image, evaluator, host adapter, cleanup, seccomp/AppArmor profile and adversarial tests are independently reviewed.

## Deliberately not enabled

There is no Docker invocation, queue, network listener, workspace manager, or API-to-runner authentication in this scaffold. `src/evaluator.js` is the API's in-process dispatch facade. It enforces each lesson's exact declared file set, then parses only the registered entrypoint and, where explicitly declared, a static `style.css` supporting file. The HTML parser does not execute scripts, load resources or create a browser context; the CSS parser compares declarations only and never renders styles. The JavaScript interpreter uses a narrow Acorn AST allowlist and supports only explicit operations with bounded arrays, strings and object construction; arbitrary calls and loops remain rejected.

## Next integration gates

1. Extend the AST interpreter only after independent security review; add adversarial tests and never treat it as an isolation boundary.
2. Add an authenticated internal API-to-runner protocol with request IDs, replay protection, idempotency, queue/concurrency limits and audit events.
3. Implement a fixed, digest-pinned job image and host-side Docker launcher. Never mount the Docker socket inside a job.
4. Add adversarial isolation tests and verify the proof end-to-end against the API's public-key verifier.
5. Deploy only to a dedicated runner host after a separate explicit production authorization.


### API session authentication and password recovery

The active API authentication flow is session-based. Refresh tokens are random opaque values stored only as SHA-256 hashes, rotated transactionally, and delivered through an HttpOnly, Secure, SameSite=Lax `__Host-` cookie. A separate CSRF cookie/header pair and exact Origin allowlist protect refresh and cookie-authenticated mutations. Short-lived HS256 access tokens are bound to both user and session; each authenticated request reloads the active session and user from MongoDB. Global logout revokes all sessions, and refresh-token replay revokes the affected session family. The legacy register/login/Google token endpoints return HTTP 410.

Password recovery is implemented as a separate optional flow. Reset tokens are random, short-lived, single-use values; only their SHA-256 hashes are stored. Password change and revocation of all active sessions occur in one MongoDB transaction. Request responses avoid account enumeration, with IP- and normalized-email rate limits. The Gmail API mail adapter is implemented and tested, but it requires valid OAuth client credentials, a refresh token, and a sender identity configured in the target environment. If no mail provider is configured, recovery is intentionally unavailable and the API returns HTTP 503; do not claim that email delivery works until an end-to-end staging test confirms receipt and token consumption.

Each session also records the account's monotonically increasing `authVersion`. A password reset increments this version in the same transaction that changes the password and revokes active sessions. The access middleware compares the session version with the current user version on every authenticated request. Password login also rechecks the exact password hash before issuing a session; if credentials changed during the login flow, session creation is refused. This closes the race where an in-flight login could otherwise create a fresh session just after a password-reset revocation sweep.

### MongoDB data-integrity review

Certificate identifiers are generated with 80 bits from Node.js `crypto.randomBytes`, not `Math.random`. Public certificate verification and leaderboard completion counts use unique IDs from the trusted curriculum allowlist, avoiding inflated counts from duplicate or unknown legacy values. User progress updates use an atomic `$addToSet` + conditional `$inc` predicate, so concurrent completion requests cannot award XP twice for the same lesson. User writes are currently field-specific; no route applies the request body as a wholesale MongoDB update. The API still depends on the database having the declared unique indexes (email and sparse certificate code) built; this branch has not connected to or migrated a real database, and index state must be verified before deployment.

## Zero-cost trusted evaluation path

The API evaluates registered lesson submissions inside its own process using `runner/src/evaluator.js`, then creates a short-lived, deterministic one-time completion record only after every server-owned test passes. The registry currently covers 530 of 700 published lesson IDs (75.7%), including 66 CSS-focused module-one lessons. The browser cannot provide tests, expected outputs, user identity, proof IDs or signatures. The authenticated session supplies the user ID; the registry supplies the entrypoint and trusted tests; the evaluator supplies the pass/fail result; the database unique index prevents duplicate submissions of the same user, lesson and source from being consumed twice.

This removes the unprovisioned external runner key as a blocker for the currently supported lessons and uses the existing free Render API service. It does **not** run arbitrary JavaScript: the HTML path parses inert markup, the CSS path checks a restricted set of static declarations, and the JavaScript path interprets a narrow Acorn AST allowlist with bounded source, AST, depth, array, string and step limits. Loops, recursion, globals, filesystem, network, process access and arbitrary function calls are rejected.

Important limitation: this is a restricted in-process evaluator, **not an OS-level sandbox**. Synchronous parsing/evaluation shares the API process and its CPU; it must not be extended to arbitrary runtimes or unbounded work. Keep the request body and rate limits, add adversarial tests for every new interpreter feature, and keep unsupported lesson types study-only until a safe evaluator adapter exists. The Docker runner remains an inactive optional future component and must not be deployed on Render or require paid infrastructure.

The registry is intentionally extensible: future lessons are added as server-owned specifications with an explicit language, entrypoint and trusted test cases. A new language requires a reviewed evaluator adapter and tests; adding a curriculum ID alone never enables XP. The current count of authored specifications is not a permanent ceiling.

### Optional future runner proof format (not used by the zero-cost API path)

Every completion proof now carries a SHA-256 digest of the evaluated files. The digest is computed from a canonical JSON array of filename/content pairs sorted by filename, so object insertion order does not change the result but any source-byte change does. The API recomputes the digest from the submitted files before verifying the signature, requires exactly the registered entrypoint file, and stores the digest alongside the one-time proof identifier. A mismatched source is rejected before the proof is consumed or progress/XP is mutated. The integration test first submits altered source with a valid proof and verifies no proof record or XP is created, then submits the original source successfully.

The signer also verifies that the file set contains exactly the entrypoint and any explicitly declared supporting files in the trusted lesson specification. It cannot mint a proof for a different filename or undeclared extra files, even if the lesson ID itself is supported.
