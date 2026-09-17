-- Shared family AES key for location address encryption, stored server-side
-- (raw base64, no passcode wrapping) so every device on the family uses the
-- SAME key instead of each independently generating its own local one.
-- Live-reported: "wrong key or corrupted" shown for other members' location
-- text — chatCrypto.ts's getKey() silently generates a brand-new random key
-- per device when none exists in SecureStore, with no automatic sync; only
-- ChatScreen.tsx's manual passcode-entry flow ever unwraps a shared key, and
-- location never goes through that flow. Protected by RLS the same as every
-- other family-scoped table: only members of the family can read/write their
-- own family's row.
create table if not exists public.family_location_keys (
  family_id  uuid primary key references public.families(id) on delete cascade,
  aes_key_b64 text not null,
  created_at timestamptz not null default now()
);

alter table public.family_location_keys enable row level security;

create policy "family members can read their family's location key"
  on public.family_location_keys for select
  using (
    family_id in (select family_id from public.members where auth_user_id = auth.uid())
  );

create policy "family members can create their family's location key"
  on public.family_location_keys for insert
  with check (
    family_id in (select family_id from public.members where auth_user_id = auth.uid())
  );
