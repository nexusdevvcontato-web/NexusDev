# NexusDev trusted runner service (scaffold)

This directory contains the trusted request boundary, a server-owned declarative challenge registry and RS256 proof signer for the future runner. It is **not an execution service** and intentionally exposes no HTTP endpoint or Docker control yet. The registry currently contains 14 authored lessons; generated placeholder lessons are not executable.

## Security boundary

- Only the authenticated API may supply the user identity; the browser must never choose the proof subject.
- Challenge IDs are resolved by `src/challenge-registry.js`; the registry currently contains 14 authored specifications with declarative checks. Unknown IDs and generated placeholder lessons are rejected before execution.
- The current 14 checks cover basic HTML structure/text, JavaScript function cases, immutable cart behavior, and an Express-style controller response. This is a trusted specification catalog, not yet an execution engine.
- Never accept tests, expected output, commands, image names, or container options from the request.
- Input is bounded to 10 files, 50 KB per file and 200 KB total.
- The proof signer creates RS256 JWTs for `nexusdev-runner` / `nexusdev-progress`, purpose `lesson-completion`, bound to one user and challenge, with a maximum 300-second lifetime.
- The private key must be injected at runtime from a secret manager and must never be committed, sent to the API, or exposed to a job container.

## Deliberately not enabled

There is no Docker invocation, queue, network listener, challenge test registry, or API-to-runner authentication in this scaffold. This avoids presenting an unprovisioned or unreviewed executor as secure. The runner must not launch until a dedicated host with disposable containers, seccomp/AppArmor, no-network jobs, quotas and adversarial tests is provisioned.

## Next integration gates

1. Author and review trusted tests for the remaining 686 lessons before considering the 700-lesson curriculum complete or allowing certificate issuance.
2. Add an authenticated internal API-to-runner protocol with request IDs, replay protection, idempotency, queue/concurrency limits and audit events.
3. Implement a fixed, digest-pinned job image and host-side Docker launcher. Never mount the Docker socket inside a job.
4. Add adversarial isolation tests and verify the proof end-to-end against the API's public-key verifier.
5. Deploy only to a dedicated runner host after a separate explicit production authorization.
