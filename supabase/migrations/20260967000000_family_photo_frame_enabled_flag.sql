-- family_photo_frame previously only ever had a row once a photo was
-- actually uploaded — there was no "the frame is turned on but empty"
-- state at all. Live-requested: Profile settings gets a simple on/off
-- toggle ("Show family photo frame on Hub"), ON by default so existing
-- behavior (frame always visible) doesn't change for anyone who hasn't
-- touched the new setting; turning it OFF hides the frame entirely,
-- turning it back on shows the empty illustration again (ready for the
-- existing long-press-to-upload flow) without forcing a photo pick right
-- away. That needs a row that can exist with no photo yet, so photo_url's
-- NOT NULL constraint (20260925115000_family_photo_frame.sql) has to relax.
ALTER TABLE public.family_photo_frame ALTER COLUMN photo_url DROP NOT NULL;
ALTER TABLE public.family_photo_frame ADD COLUMN IF NOT EXISTS frame_enabled boolean NOT NULL DEFAULT true;
