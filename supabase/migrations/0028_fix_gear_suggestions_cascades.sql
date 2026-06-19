-- Migration: Fix missing cascade rules on gear_suggestions foreign keys
--
-- character_id and source_item_id are nullable FKs pointing to rows that
-- get periodically deleted (characters via snapshot upserts, stash_items
-- via snapshot retention cascade).  Without ON DELETE SET NULL, deleting
-- a character or stash_item that has gear suggestions would either fail
-- with a FK violation or silently orphan the suggestion.
--
-- SET NULL is the right behaviour: the suggestion remains valid (it still
-- has item_name, item_data, slot, notes) — the link just becomes stale.

-- 1. character_id → characters(id) ON DELETE SET NULL
ALTER TABLE public.gear_suggestions
  DROP CONSTRAINT IF EXISTS gear_suggestions_character_id_fkey;

ALTER TABLE public.gear_suggestions
  ADD CONSTRAINT gear_suggestions_character_id_fkey
  FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE SET NULL;

-- 2. source_item_id → stash_items(id) ON DELETE SET NULL
ALTER TABLE public.gear_suggestions
  DROP CONSTRAINT IF EXISTS gear_suggestions_source_item_id_fkey;

ALTER TABLE public.gear_suggestions
  ADD CONSTRAINT gear_suggestions_source_item_id_fkey
  FOREIGN KEY (source_item_id) REFERENCES public.stash_items(id) ON DELETE SET NULL;
