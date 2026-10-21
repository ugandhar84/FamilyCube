-- 1. A kid_request (SOS included) carries the address it was sent from; it only lived in the push notification before, so the request page showed no location.
alter table public.kid_requests add column if not exists location text;

-- 2. The request trail (kid_request_events) was always empty: its policies compared members.id to auth.uid(), which is not how members map to
--    sessions in this app (every other table uses current_user_family_id()), so every insert was refused and every read came back empty.
drop policy if exists "family members insert kid_request_events" on public.kid_request_events;
drop policy if exists "family members read kid_request_events" on public.kid_request_events;
create policy "family members insert kid_request_events" on public.kid_request_events for insert
  with check (family_id = current_user_family_id());
create policy "family members read kid_request_events" on public.kid_request_events for select
  using (family_id = current_user_family_id());
