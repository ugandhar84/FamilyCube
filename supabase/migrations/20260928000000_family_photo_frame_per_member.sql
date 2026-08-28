-- family_photo_frame was one row per family (family_id primary key), so
-- every parent on a shared device saw and overwrote the SAME frame photo —
-- whoever last long-pressed to upload replaced it for every other parent
-- too, with no way to tell whose photo was even showing. Rescoping to one
-- row per (family_id, member_id) gives each parent their own independent
-- frame; TodayView.tsx only ever renders this card on a parent's own Hub
-- (ParentView.tsx), so there's no other role whose view this affects.
ALTER TABLE public.family_photo_frame DROP CONSTRAINT IF EXISTS family_photo_frame_pkey;
ALTER TABLE public.family_photo_frame ADD COLUMN IF NOT EXISTS member_id text REFERENCES public.members(id);
-- photo_url is a createSignedUrl() result (MEMORIES_SIGNED_URL_EXPIRY_SECONDS
-- lifetime, not the storage object's own permanent identity) — it never
-- carried the underlying storage.objects path, so there was previously no
-- way to actually delete the file itself, only ever overwrite what this
-- row points to and leave the old file orphaned in storage forever. Needed
-- for the new "remove my frame photo" action (deleteFamilyFramePhoto in
-- lib/supabase.ts) to target the real object.
ALTER TABLE public.family_photo_frame ADD COLUMN IF NOT EXISTS storage_path text;

-- Backfill: the single pre-existing row per family (if any) becomes that
-- family's row for whichever member most recently set it — updated_by is
-- already the member who last uploaded, so this preserves exactly what was
-- already on display for that member going forward, rather than discarding
-- it. Any OTHER parent on that family simply starts with an empty frame,
-- which matches reality (they never had one of their own before this).
UPDATE public.family_photo_frame SET member_id = updated_by WHERE member_id IS NULL AND updated_by IS NOT NULL;
-- A row with no updated_by (shouldn't exist given the NOT NULL app-level
-- write pattern, but guards against any stray row) has no member to
-- attribute it to and can't be kept under the new per-member key.
DELETE FROM public.family_photo_frame WHERE member_id IS NULL;

ALTER TABLE public.family_photo_frame ALTER COLUMN member_id SET NOT NULL;
ALTER TABLE public.family_photo_frame ADD PRIMARY KEY (family_id, member_id);

-- family-photos storage bucket had an INSERT policy (20260925080000) and a
-- SELECT policy (20260819031500) but no DELETE policy at all — same
-- "confirmed silently failing" gap those two migrations already fixed for
-- their own operations. The new "remove my frame photo" action needs a real
-- storage.objects delete to actually free the file, not just clear the DB
-- row (which would otherwise leave the photo orphaned in storage forever).
DROP POLICY IF EXISTS "Family members delete own family's photos" ON storage.objects;
CREATE POLICY "Family members delete own family's photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'family-photos'
    AND public.current_user_family_id()::text = (storage.foldername(name))[2]
  );
