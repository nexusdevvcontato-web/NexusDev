# Data Integrity and Account Isolation Audit — NexusDev 2.0

Audit scope: `rebuild/v2-security`, backend source and existing integration tests. This is a code/test review; it does not inspect production records or user content.

## Findings reviewed

### Lesson completion and XP

`completeLessonAtomically` runs proof consumption, saved-code persistence, completion/XP update, daily streak update, and final user read in one MongoDB transaction. The completion-proof record has a unique `jti`; its record binds user, challenge, file hash, and expiry. The HTTP layer verifies the signed proof against the authenticated user, challenge, and submitted file hash before entering the transaction.

The XP update is conditional on the challenge not already being in `completedIds`, so repeated completion does not grant repeated XP. The transaction rolls back proof consumption and data writes together on failure.

Existing unit tests cover transaction session propagation, replay rejection, rollback on later write failure, and conditional XP/streak updates. Existing replica-set test coverage exercises completion proof replay and concurrent completion behavior in the broader proof suite.

### Password reset and session ownership

Password reset changes the password hash, clears the one-time reset token, increments `authVersion`, and revokes sessions in one transaction. The Mongo replica-set integration test covers concurrent token consumption, single-use behavior, session revocation, and rollback when session revocation fails.

Session and refresh-token records are scoped by `userId` and `sessionId`; refresh-token hashes are unique. Existing replica-set tests cover rotation, replay, concurrent refresh, logout, logout-all, and rollback.

### Draft isolation

Draft reads use the authenticated user's document ID. Writes use an atomic compare-and-swap filter scoped to `_id` and the expected revision. The Mongo replica-set integration test checks competing writes and confirms that one account's draft does not overwrite another account's draft.

### Certificates

Certificate issuance uses a conditional update on the user's document where `certificateIssuedAt` is null. Concurrent attempts return the same frozen certificate snapshot. The integration test verifies that only one snapshot wins.

### Privacy export and deletion impact

Export queries comments by `authorUserId` and sessions by `userId`; ownership IDs are taken from the authenticated request context, not the client. Deletion-impact queries are similarly scoped to the authenticated account. Export requires a one-time reauthentication proof.

## Operational checks and limits

- The staging Atlas connection could be established, but subsequent metadata inspection calls reported the connection handle as invalid immediately after reconnect. No staging documents were read or changed, and no live index-option claim is made from that attempt.
- Existing source defines TTL and unique indexes for session, refresh-token, and completion-proof models; startup calls `.init()` for those models before listening. This is source-level verification, not a live verification of Atlas index options.
- MongoDB transactions require a replica set or sharded deployment. The integration tests explicitly use a local replica set. Render staging's successful Mongo connection alone does not prove every transaction path is currently healthy.
- Legacy comments without `authorUserId` are not automatically attributed to accounts.
- Certificate deletion/revocation and legacy-comment handling remain product/privacy policy decisions and are not changed by this audit.

## Conclusion

No confirmed cross-account data leak or transaction-boundary defect was found in the reviewed paths. The existing test suite has meaningful coverage for account isolation, atomic updates, replay protection, and rollback. Remaining validation work includes a full CI run for this audit commit and end-to-end staging checks using synthetic accounts only. Production remains untouched.
