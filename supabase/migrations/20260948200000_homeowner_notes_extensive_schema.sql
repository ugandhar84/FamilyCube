-- Rounds out homeowner_notes into a genuinely complete home-maintenance /
-- homeowner-record schema [live-requested: "extensive schema"] — beyond
-- the original title/notes/category/due-date/recurrence, this adds:
-- purchase + warranty tracking, vendor/contractor info, cost, priority,
-- which room/area of the house it applies to, and a free-form tags array
-- for search/filtering. All nullable — every existing row and every
-- existing write path (which only ever sets the original columns) keeps
-- working unchanged.

alter table public.homeowner_notes add column if not exists purchase_date date;
alter table public.homeowner_notes add column if not exists warranty_expires_date date;
alter table public.homeowner_notes add column if not exists vendor_name text;
alter table public.homeowner_notes add column if not exists vendor_phone text;
alter table public.homeowner_notes add column if not exists vendor_notes text;
alter table public.homeowner_notes add column if not exists cost_cents integer;
alter table public.homeowner_notes add column if not exists priority text check (priority in ('low', 'normal', 'high')) default 'normal';
alter table public.homeowner_notes add column if not exists room text;
alter table public.homeowner_notes add column if not exists tags text[] not null default '{}';

create index if not exists homeowner_notes_priority_idx on public.homeowner_notes(priority);
create index if not exists homeowner_notes_tags_idx on public.homeowner_notes using gin(tags);
