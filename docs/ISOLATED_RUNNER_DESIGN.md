# NexusDev isolated code runner — security design

## Current state

The API accepts a lesson completion only when it receives an RS256 proof from
`nexusdev-runner`. The private signing key must never exist in the API, browser,
repository, CI logs, or a user-controlled job. The API keeps failing closed (503)
when `LESSON_PROOF_PUBLIC_KEY` is absent.

This repository currently has no Dockerfile, Compose file, Render/Railway/Fly
configuration, or other declared runner-capable deployment target. Therefore this
change deliberately does **not** add an HTTP endpoint that executes student code
inside the Express process, and it does not claim that a sandbox is deployed.

## Required architecture

1. The API authenticates the student and creates a short-lived, single-purpose
   execution request. It must derive the student ID from the authenticated session.
2. A separately operated trusted orchestrator resolves `challengeId` against
   a server-owned test registry. Test code and expected assertions must never be
   accepted from the browser.
3. The orchestrator starts one disposable job container per attempt. It passes
   only the bounded source files and a trusted test bundle into a temporary
   workspace. No Docker socket is mounted into the job container.
4. The job container runs as a non-root UID, with no network, no capabilities,
   no-new-privileges, read-only root filesystem, bounded tmpfs/workspace,
   memory/CPU/PID limits, and a hard wall-clock timeout. It is destroyed after
   the result is collected. Never use Node's `vm`, `eval`, or `new Function`
   as the security boundary.
5. Only the trusted orchestrator evaluates the structured test result. On full
   success it signs a JWT using an RS256 private key held only by the
   orchestrator's secret manager. The token contains `iss=nexusdev-runner`,
   `aud=nexusdev-progress`, `purpose=lesson-completion`, authenticated
   `sub`, exact `challengeId`, `iat`, and `exp` no more than 300 seconds later.
6. The API verifies signature, algorithm, issuer, audience, purpose, user,
   challenge, issue time, expiry, and maximum lifetime before awarding XP.

## Container launch policy (orchestrator requirement)

The trusted host-side orchestrator must launch the immutable, pinned job image
with controls equivalent to:

```sh
docker run --rm --network none --read-only \
  --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 64 --memory 128m --cpus 0.5 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount type=bind,src="$JOB_DIR",dst=/workspace,rw \
  --workdir /workspace nexusdev-runner-job@sha256:<pinned-digest>
```

The host must additionally enforce a hard timeout, output-size limit, request
rate limit, per-user concurrency limit, cleanup on cancellation, and host-level
seccomp/AppArmor policy. The example is a baseline, not a complete defense on
its own. Never run untrusted jobs with `--privileged`, host networking, host
PID namespace, writable host paths, or access to Docker/containerd sockets.

## API proof contract

The API's public verification key is configured as `LESSON_PROOF_PUBLIC_KEY`.
The corresponding private key is generated and stored outside GitHub. A proof is
short-lived (maximum 5 minutes), bound to one authenticated user and one known
curriculum ID, and accepted only after RS256 verification. The verifier is
covered by unit tests in `test/completion-proof.test.js`.

## Go-live blockers

- Choose and provision a dedicated host/platform that supports disposable
  containers with the controls above; the current backend repository does not
  identify one.
- Build the trusted challenge/test registry from the actual published lesson
  definitions; the API's 700-ID allowlist is not a test specification.
- Implement the authenticated API-to-orchestrator request protocol, replay
  protection/idempotency, queue limits, and audit logging.
- Generate and distribute the public/private key pair out-of-band. Never commit
  either private key or production environment values.
- Run adversarial tests (filesystem, network, process, CPU/memory exhaustion,
  timeout, malformed output, cancellation, and cross-user proof replay).
- Keep completion disabled until all gates pass and the runner is deployed.

No production service, database, secret, or deployment is changed by this design.
