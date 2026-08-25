-- grocery_run_items.item_id had no foreign key to grocery_items.id, so
-- PostgREST could never auto-embed the joined item (select('*, grocery_items(*)')
-- failed with PGRST200 "no relationship found"). App code always fell back to
-- showing the raw item_id UUID instead of the item's name/quantity on an
-- active shopping trip (live-reported). Verified zero orphaned rows before
-- adding this constraint.
alter table grocery_run_items
  add constraint grocery_run_items_item_id_fkey
  foreign key (item_id) references grocery_items(id) on delete cascade;
