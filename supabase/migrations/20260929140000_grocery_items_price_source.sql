-- grocery_items.estimated_price is written from two very different
-- sources today — an AI/Kroger guess (kroger-prices edge function, before
-- the item is ever bought) and a real scanned-receipt line item
-- (parse-grocery-receipt) — with nothing distinguishing which one a given
-- row's value actually is. Live-requested: once a receipt confirms a
-- real price, still-pending items with the same name should show that
-- real number instead of the AI guess, not keep guessing forever.
alter table public.grocery_items
  add column if not exists price_source text; -- 'receipt' | 'estimate' | null (never priced)

comment on column public.grocery_items.price_source is 'Where estimated_price actually came from — ''receipt'' (a real scanned purchase, parse-grocery-receipt) vs ''estimate'' (AI/Kroger guess, kroger-prices) — lets the client trust a receipt-sourced price over a fresh AI guess.';
