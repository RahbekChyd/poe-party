-- Migration: Track whether a user has dismissed the early access notice

ALTER TABLE public.users
  ADD COLUMN has_seen_early_access_notice BOOLEAN NOT NULL DEFAULT false;
