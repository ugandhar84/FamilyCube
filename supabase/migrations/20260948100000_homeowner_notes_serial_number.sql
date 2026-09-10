-- Adds serial/model number and purchase/warranty-expiration fields to
-- homeowner_notes — useful for appliance/warranty entries (e.g. water
-- heater serial, HVAC model, when the manufacturer's guarantee or an
-- extended warranty runs out) where these details are the thing worth
-- keeping alongside the reminder itself.
alter table public.homeowner_notes add column if not exists serial_number text;
alter table public.homeowner_notes add column if not exists purchase_date date;
alter table public.homeowner_notes add column if not exists warranty_expires_date date;
