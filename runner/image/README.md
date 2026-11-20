# NexusDev runner image

This directory defines a minimal non-root Node.js job image. It is deliberately not a functioning code runner yet.

## Build contract

Build only with a verified immutable official Node image reference:

```sh
docker build \
  --build-arg NODE_BASE_IMAGE='node:22-alpine@sha256:<verified-digest>' \
  -t nexusdev-runner:review .
```

Do not substitute a mutable tag. Verify the digest against the official image registry and record the exact digest in the deployment configuration before producing a release image.

## Current behavior

The image runs as UID/GID 10001, has no application dependencies installed, and contains a fail-closed entrypoint. Running it exits with status 78 and an explanatory error. This is intentional: a reviewed evaluator protocol and host-side result verification do not exist yet.

The Docker policy in `../src/docker-policy.js` applies the runtime restrictions. The host must additionally enforce seccomp/AppArmor, daemon isolation, workspace lifecycle and hard wall-clock termination. Never mount the Docker socket or any secret into a job container.

This image must not be connected to the backend or used to issue completion proofs.
