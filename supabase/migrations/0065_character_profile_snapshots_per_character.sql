ALTER TABLE public.character_profile_snapshots
  DROP CONSTRAINT IF EXISTS character_profile_snapshots_user_id_group_id_key;

ALTER TABLE public.character_profile_snapshots
  ADD CONSTRAINT character_profile_snapshots_user_id_group_id_character_id_key
  UNIQUE (user_id, group_id, character_id);
