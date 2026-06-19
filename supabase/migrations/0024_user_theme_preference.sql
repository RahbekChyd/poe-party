-- Migration: Add theme preference to user profile
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark'));
