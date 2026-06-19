-- Migration: Add item trade link to gear suggestions

ALTER TABLE public.gear_suggestions
  ADD COLUMN item_trade_link TEXT;

COMMENT ON COLUMN public.gear_suggestions.item_trade_link IS
  'Link to poe.trade or similar for the suggested item';
