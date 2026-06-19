-- Add is_solo flag to groups table.
-- Solo groups are created by users who want to use the tool alone.
-- They behave like normal groups internally but the UI adapts to hide
-- irrelevant multi-player features (invite codes, member management, etc).

ALTER TABLE public.groups ADD COLUMN is_solo BOOLEAN NOT NULL DEFAULT false;
