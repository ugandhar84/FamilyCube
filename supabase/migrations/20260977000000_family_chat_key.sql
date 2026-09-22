-- Shared family AES key for chat message encryption, stored server-side
-- (raw base64, no passcode wrapping) — same pattern as
-- family_location_keys (20260972000000), which fixed the identical bug
-- for location text. chatCrypto.ts's getKey() only ever stored its key
-- locally in SecureStore and silently generated a brand-new RANDOM key
-- per device when none existed there. The documented "passcode → fetch
-- blob → unwrapKeyWithPasscode()" recovery path never had a real call
-- site anywhere in the app (confirmed via full-codebase grep — only a
-- doc comment in ChatScreen.tsx referenced it) — entering a recovery
-- code did nothing for chat decryption. Every device was therefore
-- quietly using its own orphaned key, so any other member's/device's
-- messages could never decrypt ("wrong key or corrupted") [live-
-- reported: entered recovery code on a newly-installed Android build,
-- chat messages still showed the error; location already fixed the same
-- way earlier this session].
create table if not exists public.family_chat_keys (
  family_id  uuid primary key references public.families(id) on delete cascade,
  aes_key_b64 text not null,
  created_at timestamptz not null default now()
);

alter table public.family_chat_keys enable row level security;

create policy "family members can read their family's chat key"
  on public.family_chat_keys for select
  using (
    family_id in (select family_id from public.members where auth_user_id = auth.uid())
  );

create policy "family members can create their family's chat key"
  on public.family_chat_keys for insert
  with check (
    family_id in (select family_id from public.members where auth_user_id = auth.uid())
  );
