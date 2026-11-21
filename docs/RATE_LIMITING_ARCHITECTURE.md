# Rate Limiting Architecture — NexusDev 2.0

## Status

Assessment only. No runtime behavior changed by this document. The current implementation remains the in-process `express-rate-limit` MemoryStore.

## Current behavior

`server.js` creates independent limiters for the global API, authentication, password-reset request/email/confirmation, reauthentication, privacy export, tutor, public reads, certificate lookup/issuance, progress completion, comments, and lesson drafts.

No persistent or shared store is configured. Therefore:

- counters are local to one Node.js process;
- a process restart clears the counters;
- multiple Render instances would each enforce their own independent counters;
- an attacker could receive a multiplied allowance across instances.

The email limiter hashes normalized email addresses for its key, but that key is still held only in process memory. `trust proxy=1` is configured for the current Render ingress topology; changing proxy topology requires revalidating client-IP extraction.

## Staging inventory

The existing Atlas staging database currently contains `users`, `comments`, `sessions`, `refreshtokens`, and `completionproofs`. There is no rate-limit counter collection. No collection, index, or document was created or changed during this assessment.

## Decision

Do not switch every limiter to MongoDB indiscriminately.

A Mongo-backed shared store is technically feasible on the existing Atlas cluster, using a dedicated collection, a unique key per limiter + fixed time bucket + hashed client key, atomic increments, and a TTL index. It would survive Render restarts and coordinate multiple instances.

However, placing the global 300-requests/15-minute limiter in MongoDB would add a database write to every API request. On the existing Free Render + Free Atlas staging topology, that creates avoidable latency and database load and makes the global limiter dependent on Atlas availability. A broad migration is not justified without workload measurements.

## Recommended phased approach

1. Keep the global API limiter process-local as a coarse per-instance safety valve, and explicitly treat it as non-global.
2. Move only abuse-sensitive limits to a shared store first: authentication, password-reset request/email/confirmation, reauthentication, and public certificate lookup. Consider progress, comment, tutor, and export after measuring request volume and abuse impact.
3. Store only SHA-256 digests of limiter keys; never persist raw IP addresses or email addresses in counter documents.
4. Use atomic increments with a fixed-window bucket key and TTL cleanup. Do not use read-then-write counters, which race under concurrency.
5. Ensure the unique and TTL indexes before accepting traffic. Fail closed for the protected limiters if the shared store is unavailable; do not silently fall back to per-process counters.
6. Add replica-set integration tests for concurrent increments, boundary rollover, expiry, isolation between limiter namespaces, and store outages.
7. Benchmark staging before enabling the shared store. Confirm Atlas write latency, Render request latency, and collection growth. Keep a documented rollback switch that restores the existing local limiter only for non-critical routes; critical routes must not silently lose shared enforcement.
8. Revisit a dedicated Redis-compatible store only if traffic and latency justify additional infrastructure and its cost is explicitly approved.

## Operational caveats

- MongoDB TTL deletion is asynchronous; application logic must use the bucket's reset time and must not rely on immediate physical deletion.
- Fixed-window limits can allow bursts around a window boundary. If smoother limits become necessary, evaluate a token-bucket or sliding-window design separately.
- The current in-memory limits are still useful as coarse defense in depth, but they must not be described as globally enforced.
- No production secrets, production data, or production infrastructure were accessed or changed for this assessment.
