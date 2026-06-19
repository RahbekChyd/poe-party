-- Migration: Extend group_role enum with 'editor' and 'viewer'.
-- NOTE: ALTER TYPE ADD VALUE is non-transactional in PostgreSQL — it commits
-- immediately even inside a transaction. The data migration that *uses* the new
-- enum values must run in a separate migration (0019b) so that the new values
-- are visible when that transaction starts.

ALTER TYPE public.group_role ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE public.group_role ADD VALUE IF NOT EXISTS 'viewer';
