-- Migration: Add Path of Building import code fields to users

ALTER TABLE public.users
  ADD COLUMN pob_code TEXT,
  ADD COLUMN pob_support_code TEXT;
