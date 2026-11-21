# NexusDev isolated runner host provisioning runbook

Status: **preparation only — not deployable yet**.

This runbook defines the minimum conditions for a future isolated runner. It does not authorize creating paid infrastructure, deploying a runner, enabling XP, or changing production.

## Current state

- The API evaluates registered lesson submissions in-process using server-owned tests and the restricted evaluator adapters.
- Successful evaluations create a deterministic, one-time database record bound to the authenticated user, lesson and canonical source hash; no browser-supplied signature is accepted.
- Unsupported lesson IDs, missing files, extra files, wrong entrypoints and failed tests are rejected before progress/XP mutation.
- The JavaScript evaluator is a restricted AST interpreter, not a general JavaScript runtime or OS sandbox.
- The runner image remains fail-closed and inactive: there is no Docker launcher, HTTP listener or host adapter.
- Current supported lessons do not require a runner private key or a separate host. Do not provision paid infrastructure; the external runner is an optional future architecture only if a future requirement cannot be met by a reviewed free in-process evaluator.

## Host boundary requirements

The runner must be a separate Linux host or VM, not a process sharing the API's filesystem, environment, database credentials, or Docker socket.

Required:
1. A dedicated, non-production host with a supported Linux kernel and Docker Engine. Do not use the Render API service as a Docker host and do not expose the Docker socket over TCP.
2. A dedicated host service account. Only the trusted host adapter may access the local Docker socket; student containers must never mount it.
3. A fixed, immutable runner image referenced by `repository@sha256:digest`. Never pull a mutable tag at job start.
4. Host-installed and reviewed seccomp and AppArmor profiles. The launcher must fail closed if either profile is unavailable.
5. Per-job disposable workspace created by the host, mounted read-only, with no symlinks or caller-selected mount paths. Delete it after the job regardless of outcome.
6. Job containers must have no network, read-only root filesystem, dropped capabilities, no-new-privileges, non-root UID/GID, bounded memory/CPU/PIDs/file descriptors, bounded tmpfs, and a hard host-enforced wall-clock timeout.
7. No access to MongoDB, Render/Vercel credentials, application secrets, user sessions, or host metadata services from a job.
8. Host-level concurrency and queue limits. Reject overload instead of spawning unbounded containers.
9. Structured audit events with request ID, trusted challenge ID, result category, duration and resource-limit outcome. Never log source code, tokens, keys, or user profile data.

The current `runner/src/docker-policy.js` is only a fixed argument-vector prototype. It is not a launcher and does not prove that the host has the required profiles, filesystem protections, cleanup, timeout enforcement, or daemon configuration.

## API-to-runner protocol requirements

Before exposing an HTTP endpoint:
- Authenticate each API request with a dedicated secret or mutually authenticated TLS. Do not reuse JWT, session, refresh, CSRF, or database credentials.
- Sign a canonical request containing method, path, timestamp, unique nonce, request ID, and SHA-256 body digest with HMAC-SHA-256.
- Enforce a short timestamp window, constant-time signature comparison, nonce replay protection, and request-id idempotency on the runner.
- Accept user ID only from the authenticated API envelope; never from browser-controlled fields.
- Resolve lesson specifications and expected tests from the runner's local registry. Never accept tests, expected outputs, commands, container arguments, image names, or timeouts from the request.
- Bound request body, file count, per-file and aggregate bytes, queue depth, per-user rate, global concurrency and execution duration.
- Return only a generic pass/fail result and a signed proof. Do not return stack traces, environment details, host paths, or internal evaluator diagnostics.
- The API must verify issuer, audience, purpose, user, challenge, expiry, source digest and one-time `jti` before changing progress.

## Required verification before any staging runner deployment

- Review the final Docker image and pin its digest.
- Verify seccomp/AppArmor profiles on the actual host.
- Run adversarial tests for filesystem reads/writes, symlink traversal, environment/secret access, network/DNS, process spawning, resource exhaustion, malformed ASTs, parser depth, oversized input, request replay, duplicate IDs, timeout, host restart and cleanup.
- Verify that one job cannot affect another job or the host.
- Verify the runner cannot reach MongoDB or any application secret.
- Verify proof signing with a temporary RSA key of at least 2048 bits, then verify it against the API public key in a disposable test environment.
- Test a changed source file against an otherwise valid proof and confirm the API rejects it without consuming the proof or changing XP.
- Perform authenticated staging smoke tests using disposable accounts only.
- Keep XP and certificate issuance disabled until all checks pass.

## Deployment and cost gate

This runbook describes an optional future isolated Docker runner only. It is not required for the current restricted evaluator path. The platform's permanent cost constraint is zero: do not create a paid VM, runner provider, upgrade, queue service or other billable infrastructure. If a future lesson cannot be evaluated safely with the existing free architecture, leave that lesson study-only until a suitable zero-cost design is reviewed.

Production deployment, production secrets, production database access and merge to `main` require separate explicit authorization.
