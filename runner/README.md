# NexusDev trusted runner service (scaffold)

This directory contains the trusted request boundary, a server-owned declarative challenge registry and RS256 proof signer for the future runner. It is **not an execution service** and intentionally exposes no HTTP endpoint or Docker control yet. The registry currently contains 26 authored lessons; generated placeholder lessons are not executable.

## Security boundary

- Only the authenticated API may supply the user identity; the browser must never choose the proof subject.
- Challenge IDs are resolved by `src/challenge-registry.js`; the registry currently contains 26 authored specifications with declarative checks. Unknown IDs and generated placeholder lessons are rejected before execution.
- The current 26 checks cover basic HTML structure/text, JavaScript function cases, immutable cart behavior, React-style props/list/filter exercises, Express-style route/controller, request validation, safe error formatting, MongoDB document allowlisting and MongoDB document construction (explicit `titulo`/`preco`/`categoria`/`ativo` allowlist, normalization, and rejection of extra fields) and safe updates (explicit `$set` field allowlist, finite positive price checks, and rejection of pass-through client operators in trusted cases), signup input validation, password policy, strict Bearer parsing and RBAC profile checks (exact role equality, invalid-role rejection, and adversarial client privilege flags). This is a trusted specification catalog. The HTML evaluator prototype supports six introductory lessons by parsing inert HTML fragments with parse5 and checking a fixed set of server-owned selectors and assertions. The JavaScript evaluator supports only registered patterns in a small AST subset, including function cases, deep equality, non-mutation checks, bounded array/string operations, fixed allowlisted validation patterns (`Number.isFinite`, a single email pattern and three password character classes), strict Bearer-header parsing, and two Express-style controller challenges through local mocks; it is not a general runtime.
- Never accept tests, expected output, commands, image names, or container options from the request.
- Input is bounded to 10 files, 50 KB per file and 200 KB total.
- The proof signer creates RS256 JWTs for `nexusdev-runner` / `nexusdev-progress`, purpose `lesson-completion`, bound to one user and challenge, with a maximum 300-second lifetime.
- The private key must be injected at runtime from a secret manager and must never be committed, sent to the API, or exposed to a job container.

## Container policy prototype (not an active launcher)

`src/docker-policy.js` builds a fixed Docker argument vector for a digest-pinned image and a host-created workspace. It enforces no network, read-only root filesystem, all Linux capabilities dropped, no-new-privileges, non-root UID/GID, PID/memory/CPU/file-descriptor limits, a bounded `noexec` temporary filesystem and a read-only workspace mount. It rejects mutable image tags, unsafe mount paths and out-of-range timeouts. Unit tests assert these invariants.

This is a policy builder only: it does not invoke Docker, create workspaces, enforce a wall-clock kill, inspect daemon configuration, or prove that the host kernel/runtime is hardened. The fixed command points to `/opt/nexusdev/execute.js`, which is not yet implemented. Do not wire this into an API or enable execution until the image, evaluator, host adapter, cleanup, seccomp/AppArmor profile and adversarial tests are independently reviewed.

## Deliberately not enabled

There is no Docker invocation, queue, network listener, workspace manager, or API-to-runner authentication in this scaffold. `src/evaluator.js` is a local dispatch facade that selects the parser by the trusted lesson registry and requires exactly the declared single-file entrypoint. `src/html-evaluator.js` and `src/js-evaluator.js` remain local, non-integrated prototypes. The HTML parser does not execute scripts, load resources or create a browser context. The JavaScript interpreter uses a narrow Acorn AST allowlist and supports only explicit operations with bounded arrays, strings and object construction; arbitrary calls and loops remain rejected. The validation interpreter does not expose arbitrary regex or global constructors; only fixed patterns and the explicit `Number.isFinite` operation are accepted. Bearer parsing is not JWT verification. The controller test harness supplies only a plain `req.body` and a response mock with `status()` and `json()`. It does not start Express, access a database, process middleware, or perform network I/O. Its limits are defense-in-depth, not a sandbox or a substitute for disposable OS-isolated containers. This avoids presenting an unprovisioned or unreviewed executor as secure. The runner must not launch until a dedicated host with disposable containers, seccomp/AppArmor, no-network jobs, quotas and adversarial tests is provisioned.

## Next integration gates

1. Extend the AST interpreter only after independent security review; add adversarial tests and never treat it as an isolation boundary.
2. Add an authenticated internal API-to-runner protocol with request IDs, replay protection, idempotency, queue/concurrency limits and audit events.
3. Implement a fixed, digest-pinned job image and host-side Docker launcher. Never mount the Docker socket inside a job.
4. Add adversarial isolation tests and verify the proof end-to-end against the API's public-key verifier.
5. Deploy only to a dedicated runner host after a separate explicit production authorization.
