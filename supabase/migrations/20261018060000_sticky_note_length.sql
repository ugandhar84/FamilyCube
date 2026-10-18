-- Sticky notes are short reminders: 30 characters. NOT VALID keeps any older, longer note as it is and only checks new notes.
alter table public.family_sticky_notes drop constraint if exists sticky_note_len;
alter table public.family_sticky_notes add constraint sticky_note_len check (char_length(body) <= 30) not valid;
