-- Atomic counter RPCs to avoid lost-update races on social_posts counters.
-- Previously the client wrote an absolute optimistic count back to the row, so
-- two concurrent likes/comments could clobber each other (lost update).

create or replace function increment_post_likes(p_post_id uuid, p_delta int)
returns void
language sql
as $$
  update social_posts
     set likes_count = greatest(0, coalesce(likes_count, 0) + p_delta)
   where id = p_post_id;
$$;

create or replace function increment_post_comments(p_post_id uuid, p_delta int)
returns void
language sql
as $$
  update social_posts
     set comments_count = greatest(0, coalesce(comments_count, 0) + p_delta)
   where id = p_post_id;
$$;

grant execute on function increment_post_likes(uuid, int)    to authenticated;
grant execute on function increment_post_comments(uuid, int) to authenticated;
