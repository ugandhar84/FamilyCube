-- Caps game_scores at 20 rows per (family_id, game_type, difficulty)
-- leaderboard — this is family-fun data, not something that needs
-- unbounded history, and the client already only ever displays the top 20
-- (loadLeaderboard's own .limit(20)). Rather than let the table grow
-- forever and rely purely on the display query to hide the rest, prune
-- anything beyond the top 20 (by score desc, then most-recent-first as
-- the tiebreak — matching loadLeaderboard's own ORDER BY exactly) right
-- after each insert, so the stored table stays small and the "top 20"
-- is genuinely everything that exists, not just everything shown.
create or replace function public._prune_game_scores_leaderboard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.game_scores
  where family_id = new.family_id
    and game_type = new.game_type
    and difficulty = new.difficulty
    and id not in (
      select id from public.game_scores
      where family_id = new.family_id
        and game_type = new.game_type
        and difficulty = new.difficulty
      order by score desc, created_at desc
      limit 20
    );
  return null; -- AFTER trigger — return value is ignored.
end;
$$;

drop trigger if exists prune_game_scores_leaderboard on public.game_scores;
create trigger prune_game_scores_leaderboard
  after insert on public.game_scores
  for each row
  execute function public._prune_game_scores_leaderboard();

comment on function public._prune_game_scores_leaderboard() is
  'Keeps game_scores capped at the top 20 rows per (family_id, game_type, difficulty), by score desc then most-recent-first — this is a family leaderboard, not data worth unbounded retention.';
