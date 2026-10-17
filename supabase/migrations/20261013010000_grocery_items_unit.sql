-- The AI receipt/photo scanner already extracts each item's unit (each, lb,
-- oz, etc) but grocery_items had nowhere to store it, so it was silently
-- dropped on add [live-reported: "but this will only add the item name,
-- quantity with units right?"].
alter table public.grocery_items add column if not exists unit text;
