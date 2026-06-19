-- Add a first-class game dimension to groups so PoE1 and PoE2 workspaces
-- can coexist without overloading league as a proxy for the game.

ALTER TABLE public.groups
ADD COLUMN game TEXT NOT NULL DEFAULT 'poe1';

ALTER TABLE public.groups
ADD CONSTRAINT groups_game_check CHECK (game IN ('poe1', 'poe2'));

-- Character ids are only unique inside a specific group workspace now that
-- the same account can participate in multiple PoE1/PoE2 groups.
ALTER TABLE public.characters
DROP CONSTRAINT IF EXISTS characters_user_id_poe_character_id_key;

ALTER TABLE public.characters
ADD CONSTRAINT characters_user_id_group_id_poe_character_id_key
UNIQUE (user_id, group_id, poe_character_id);
