# PoE OAuth Token Encryption Rollout

PoE OAuth access and refresh tokens are encrypted in Edge code with AES-256-GCM before they are
written to PostgreSQL. Migration `0087_encrypt_poe_oauth_tokens.sql` is an additive expand
migration: existing plaintext rows and old Edge code remain valid until the coordinated Edge
deployment and backfill are complete. This repository does not apply the migration, set hosted
secrets, or deploy functions automatically.

## Key-ring contract

Configure both server-only Edge Function secrets before deploying the new token-storage code:

```text
POE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID=2026-07
POE_TOKEN_ENCRYPTION_KEYS={"2026-01":"<43-character-unpadded-base64url-key>","2026-07":"<43-character-unpadded-base64url-key>"}
```

- `POE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID` must match `^[A-Za-z0-9._-]{1,64}$` and identify an entry in
  the ring.
- `POE_TOKEN_ENCRYPTION_KEYS` must be a JSON object. Every value is the unpadded base64url encoding
  of exactly 32 cryptographically random bytes. A 32-byte value encodes to 43 characters.
- The active key encrypts every new or rewritten value. Non-active keys remain decrypt-only during
  rotation.
- Keys are server secrets. Never use a `VITE_*` variable, store them in PostgreSQL, print them,
  include them in support output, or commit a populated environment file.

Each ciphertext column contains a compact JSON envelope:

```json
{ "v": 1, "kid": "2026-07", "n": "<96-bit-random-nonce>", "c": "<ciphertext-and-tag>" }
```

The nonce is independently randomized for every token value. AES-GCM additional authenticated data
binds the envelope version, key ID, user ID, and token kind (`access` or `refresh`), so ciphertext
cannot be moved between users or columns. The duplicated database version/key metadata is for safe
rotation reporting and is checked against the authenticated envelope during reads.

`refresh_token_fingerprint` is `sha256:v1:` plus the base64url SHA-256 digest of the provider's
high-entropy refresh token. It is not used to recover a token. It provides stable optimistic
concurrency across isolates because randomized ciphertext can never be compared for equality.

## Expand, deploy, and backfill

Use a separately confirmed staging target first, then repeat on production only after explicitly
confirming the exact Supabase project and recovery posture.

1. Apply migration `0087`. It makes the two plaintext columns nullable, adds ciphertext and
   metadata columns, and requires each row to retain a complete plaintext or ciphertext pair.
   Do not deploy the new Edge code first.
2. Add the active key ID and complete key ring to the matching Supabase Edge environment. Validate
   the exact JSON out of band without printing key values in CI or logs.
3. Deploy all token-store consumers together: `poe-oauth-callback`, `poe-refresh-token`,
   `poe-account-leagues`, `poe-list-stash-tabs`, `poe-snapshot`, `poe-sync-character-profile`, and
   `poe-sync-characters`. New callbacks and rotations now write ciphertext only. Missing or invalid
   key configuration fails closed before the callback mutates OAuth identity data.
4. Normal authenticated token reads convert legacy plaintext or old-key ciphertext to the active
   key. Rewrites require the row's original `updated_at`; ciphertext rotation also requires the
   original refresh fingerprint. A lost race reloads the concurrent winner rather than overwriting
   it.
5. Backfill inactive accounts with a reviewed, private operator batch that selects only `user_id`
   and invokes the same shared token read/rewrite path. Keep tokens, ciphertext, keys, and
   fingerprints out of batch output. Use bounded batches, record counts only, and stop on any
   decrypt or concurrency error. Do not attempt a SQL backfill: encryption keys must not enter the
   database session.

The following read-only report is safe for rollout accounting because it returns counts and key IDs,
not credentials:

```sql
SELECT
  count(*) FILTER (WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL) AS plaintext_rows,
  count(*) FILTER (
    WHERE access_token_ciphertext IS NULL OR refresh_token_ciphertext IS NULL
  ) AS incomplete_ciphertext_rows
FROM public.poe_oauth_tokens;

SELECT token_encryption_key_id, token_ciphertext_version, count(*)
FROM public.poe_oauth_tokens
WHERE access_token_ciphertext IS NOT NULL
GROUP BY token_encryption_key_id, token_ciphertext_version
ORDER BY token_encryption_key_id, token_ciphertext_version;
```

## Rotation and contract gate

To rotate keys, add a new 32-byte key to the JSON ring, change only the active key ID, and deploy the
full consumer set. Keep every old key in the ring while rows still report its ID. Run the same safe
read/backfill process until the old-key count is zero, observe a stable release, and only then remove
that key from the ring.

Do not create the future contract migration until all of these are true:

- `plaintext_rows` and `incomplete_ciphertext_rows` are zero;
- every ciphertext row uses the intended version and active key ID;
- no old Edge deployment can write plaintext;
- callback, refresh, character, league, and stash canaries pass;
- rollback uses a forward-compatible encrypted-token build, not the pre-encryption code.

The contract migration may then make both ciphertext columns and their metadata `NOT NULL` and drop
the plaintext columns. Migration `0087` deliberately does none of those destructive steps.
