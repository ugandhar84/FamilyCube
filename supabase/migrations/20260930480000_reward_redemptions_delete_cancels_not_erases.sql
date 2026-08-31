-- Logged gap from this session's QA report: deleting a reward with a
-- pending redemption fully erases the redemption record rather than
-- marking it cancelled — reward_redemptions.reward_id was ON DELETE
-- CASCADE, so the app's own refund logic in deleteReward() (which
-- correctly refunds coins and notifies the kid) ran against a row that
-- was about to vanish from the database entirely, leaving no trace a
-- redemption ever happened. Same fix pattern as reward_redemptions'
-- member_id column, already changed to SET NULL earlier this session.
alter table public.reward_redemptions
  drop constraint reward_redemptions_reward_id_fkey,
  add constraint reward_redemptions_reward_id_fkey
    foreign key (reward_id) references public.rewards(id) on delete set null;
