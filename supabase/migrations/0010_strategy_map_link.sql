-- Migration: Replace map name/tier/cost fields with map trade link + structured map requirements

ALTER TABLE public.strategies
  ADD COLUMN map_trade_link     TEXT,
  ADD COLUMN map_requirements   JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.strategies.map_trade_link IS
  'Link to poe.trade or similar to buy this map';
COMMENT ON COLUMN public.strategies.map_requirements IS
  'Structured map roll requirements: {item_quantity, item_rarity, pack_size, more_scarabs, more_currency, more_unique} — all optional numeric percentages';
