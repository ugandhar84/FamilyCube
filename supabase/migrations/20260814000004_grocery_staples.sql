CREATE TABLE IF NOT EXISTS grocery_staples (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id          text NOT NULL,
  name               text NOT NULL,
  category           text,
  avg_days_between   numeric,
  last_bought_at     timestamptz,
  times_bought       integer DEFAULT 0,
  auto_suggest       boolean DEFAULT true,
  usual_store        text,
  usual_brand        text,
  UNIQUE(family_id, name)
);
