-- Two smaller, directly related gaps found by the same QA trace: a
-- removed member's pending/historical reward redemption was being
-- permanently erased (no trace) at the 7-day hard purge, and a member
-- with a family-photo-frame entry could never actually be purged at all
-- (the delete failed on a dangling FK every single night, forever, with
-- nothing surfacing that to anyone).
--
-- reward_redemptions.member_id: CASCADE -> SET NULL. member_name is
-- already stored redundantly on the row, so the historical record
-- ("this reward was granted/requested and these coins were spent")
-- survives the member being removed, matching the pattern already used
-- correctly on calendar_events.member_id.
alter table public.reward_redemptions
  drop constraint reward_redemptions_member_id_fkey,
  add constraint reward_redemptions_member_id_fkey
    foreign key (member_id) references public.members(id) on delete set null;

-- family_photo_frame.member_id is NOT NULL (the row's owner, one frame
-- per parent) — SET NULL isn't valid here, CASCADE is the correct fix:
-- the frame entry has no meaning once its owning member is gone, so it
-- should simply be deleted along with them instead of blocking the purge.
alter table public.family_photo_frame
  drop constraint family_photo_frame_member_id_fkey,
  add constraint family_photo_frame_member_id_fkey
    foreign key (member_id) references public.members(id) on delete cascade;

-- updated_by is nullable and purely informational (who last touched this
-- frame) — SET NULL preserves the frame entry itself when a DIFFERENT
-- member (the one who last edited it, not its owner) is removed.
alter table public.family_photo_frame
  drop constraint family_photo_frame_updated_by_fkey,
  add constraint family_photo_frame_updated_by_fkey
    foreign key (updated_by) references public.members(id) on delete set null;
