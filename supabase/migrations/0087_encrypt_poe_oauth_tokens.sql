-- Expand PoE OAuth token storage for application-layer AES-256-GCM encryption.
-- Plaintext columns remain available during the mixed-version/backfill window;
-- a later contract migration may remove them only after every row is encrypted.

ALTER TABLE public.poe_oauth_tokens
  ALTER COLUMN access_token DROP NOT NULL,
  ALTER COLUMN refresh_token DROP NOT NULL,
  ADD COLUMN access_token_ciphertext TEXT,
  ADD COLUMN refresh_token_ciphertext TEXT,
  ADD COLUMN token_ciphertext_version SMALLINT,
  ADD COLUMN token_encryption_key_id TEXT,
  ADD COLUMN refresh_token_fingerprint TEXT;

ALTER TABLE public.poe_oauth_tokens
  ADD CONSTRAINT poe_oauth_tokens_plaintext_pair_check
    CHECK ((access_token IS NULL) = (refresh_token IS NULL)),
  ADD CONSTRAINT poe_oauth_tokens_ciphertext_pair_check
    CHECK ((access_token_ciphertext IS NULL) = (refresh_token_ciphertext IS NULL)),
  ADD CONSTRAINT poe_oauth_tokens_access_storage_check
    CHECK (access_token IS NOT NULL OR access_token_ciphertext IS NOT NULL),
  ADD CONSTRAINT poe_oauth_tokens_refresh_storage_check
    CHECK (refresh_token IS NOT NULL OR refresh_token_ciphertext IS NOT NULL),
  ADD CONSTRAINT poe_oauth_tokens_ciphertext_metadata_check
    CHECK (
      access_token_ciphertext IS NULL
      OR (
        token_ciphertext_version IS NOT NULL
        AND token_ciphertext_version > 0
        AND token_encryption_key_id IS NOT NULL
        AND token_encryption_key_id ~ '^[A-Za-z0-9._-]{1,64}$'
        AND refresh_token_fingerprint IS NOT NULL
        AND refresh_token_fingerprint ~ '^sha256:v1:[A-Za-z0-9_-]{43}$'
      )
    );

COMMENT ON COLUMN public.poe_oauth_tokens.access_token_ciphertext IS
  'Versioned AES-256-GCM JSON envelope; never expose outside service-role token storage code.';
COMMENT ON COLUMN public.poe_oauth_tokens.refresh_token_ciphertext IS
  'Versioned AES-256-GCM JSON envelope; never expose outside service-role token storage code.';
COMMENT ON COLUMN public.poe_oauth_tokens.token_encryption_key_id IS
  'Non-secret key-ring identifier duplicated from the ciphertext envelope for rotation reporting.';
COMMENT ON COLUMN public.poe_oauth_tokens.token_ciphertext_version IS
  'Ciphertext envelope version duplicated for migration and rotation reporting.';
COMMENT ON COLUMN public.poe_oauth_tokens.refresh_token_fingerprint IS
  'SHA-256 fingerprint of the high-entropy refresh token for optimistic cross-isolate rotation.';
