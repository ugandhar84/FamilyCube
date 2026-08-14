CREATE TABLE IF NOT EXISTS grocery_price_cache (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id     text NOT NULL,
  item_name     text NOT NULL,
  kroger_price  numeric(10,2),
  ai_estimate   numeric(10,2),
  source        text,
  unit          text,
  fetched_at    timestamptz DEFAULT now(),
  UNIQUE(family_id, item_name)
);
