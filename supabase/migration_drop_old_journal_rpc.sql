-- Drop all overloads of get_pet_journal so there's no ambiguity
DROP FUNCTION IF EXISTS get_pet_journal(uuid, int);
DROP FUNCTION IF EXISTS get_pet_journal(uuid, int, timestamptz);
