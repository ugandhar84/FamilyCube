-- Add shopping list fields to quests table
ALTER TABLE quests
  ADD COLUMN IF NOT EXISTS shopping_items  text[],
  ADD COLUMN IF NOT EXISTS shopping_store  text,
  ADD COLUMN IF NOT EXISTS shopping_budget numeric(10,2);
