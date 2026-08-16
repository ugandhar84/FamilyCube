ALTER TABLE chore_tasks
  ADD COLUMN IF NOT EXISTS shopping_items  text[],
  ADD COLUMN IF NOT EXISTS shopping_store  text,
  ADD COLUMN IF NOT EXISTS shopping_budget numeric(10,2);
