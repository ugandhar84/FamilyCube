-- Unified pet expense log
-- Covers: vet/medication/vaccine bills, food, grooming, accessories, toys, insurance, other
-- Appointments already have their own `cost` column — those are included in stats via a union.

CREATE TABLE IF NOT EXISTS pet_expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id       uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  category     text NOT NULL CHECK (category IN (
                  'food','medication','vaccine','vet','grooming','boarding',
                  'accessories','toys','recreation','insurance','other')),
  amount       numeric(10,2) NOT NULL CHECK (amount >= 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pet_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY pet_expenses_owner ON pet_expenses
  USING (
    pet_id IN (
      SELECT id FROM pets WHERE owner_id = auth.uid()
      UNION
      SELECT pet_id FROM pet_family WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    pet_id IN (
      SELECT id FROM pets WHERE owner_id = auth.uid()
      UNION
      SELECT pet_id FROM pet_family WHERE user_id = auth.uid() AND role IN ('caretaker')
    )
  );

CREATE INDEX IF NOT EXISTS pet_expenses_pet_date ON pet_expenses(pet_id, expense_date DESC);
