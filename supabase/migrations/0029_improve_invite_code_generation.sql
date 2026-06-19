-- Migration: Improve invite_code default generation
--
-- The original default substr(md5(random()::text), 1, 8) uses md5 which
-- limits the character set to hex (0-9, a-f) — only 16^8 ≈ 4.3 billion
-- possible codes.  Using gen_random_uuid() and taking 8 characters from
-- its hex representation is functionally equivalent but uses the
-- cryptographically secure random source rather than random().
--
-- This only affects newly created groups; existing codes are unchanged.

ALTER TABLE public.groups
  ALTER COLUMN invite_code
  SET DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
