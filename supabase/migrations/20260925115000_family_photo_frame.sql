-- family_photo_frame: the Hub's tilted "photo frame" card — one row per
-- family holding whatever photo is currently on display. Deliberately
-- separate from family_memories: setting the frame must never create (or
-- read from) a Memories post, and vice versa.
CREATE TABLE IF NOT EXISTS public.family_photo_frame (
  family_id   text        PRIMARY KEY,
  photo_url   text        NOT NULL,
  updated_by  text        REFERENCES public.members(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.family_photo_frame DISABLE ROW LEVEL SECURITY;
