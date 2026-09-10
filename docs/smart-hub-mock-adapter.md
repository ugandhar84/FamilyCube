# Smart Hub — mock vendor adapter

## Why this exists

The Smart Hub feature (connect smart-home devices — thermostats first,
more device types later — and control their full programs/schedules, plus
per-device filter and general-maintenance reminders) was built end to end
against a **mock vendor adapter**, not a real one, because:

- **Ecobee's self-serve developer API program is closed.** Their own
  developer page states "we are not currently accepting new developer
  registrations at this time," and their old free API-key flow has been
  retired — existing keys still work, but no new ones can be issued. The
  only mechanism the open-source community (e.g. Home Assistant) still
  uses today is reusing Ecobee's own internal web-login (Auth0) client to
  authenticate with a user's raw ecobee.com password — an unofficial
  workaround, not a sanctioned integration path, and not something this
  app builds against as a supported product feature.
- **Honeywell/Resideo** is the real target vendor once wired up — they
  still have an active, self-serve OAuth developer program as of this
  writing. Nothing about the schema or UI needs to change to add them;
  only a new adapter implementation is needed (see below).

## Architecture

Every vendor implements the same `SmartHubAdapter` interface
(`supabase/functions/_shared/smartHub/adapter.ts`):

```ts
interface SmartHubAdapter {
  readonly vendor: string;
  refreshTokens(refreshToken: string): Promise<SmartHubTokens>;
  listDevices(): Promise<SmartHubVendorDevice[]>;
  getDeviceState(vendorDeviceId: string): Promise<SmartHubDeviceState>;
  getProgram(vendorDeviceId: string): Promise<SmartHubProgram>;
  setProgram(vendorDeviceId: string, program: SmartHubProgram): Promise<void>;
  setHold(vendorDeviceId: string, hold: Omit<SmartHubHold, 'id'>): Promise<SmartHubHold>;
  cancelHold(vendorDeviceId: string, holdId: string): Promise<void>;
  getFilterInfo(vendorDeviceId: string): Promise<SmartHubFilterInfo>;
}
```

Every method operates on **vendor-normalized shapes** (`SmartHubDeviceState`,
`SmartHubProgram`, etc.) — never a vendor's raw API response. No edge
function or client code ever branches on which vendor a device belongs to;
only `getAdapter(vendor)` in `supabase/functions/_shared/smartHub/index.ts`
picks the right implementation.

`MockSmartHubAdapter` (`mockAdapter.ts`) implements this interface with an
in-memory, deterministic mock: one thermostat, a realistic default weekly
program, and a fixed 62%-remaining filter reading. State lives in a
per-Deno-isolate `Map`, so it does **not** persist across edge function
cold starts — a fresh isolate re-seeds from the same defaults. This is
expected: the mock's job is to prove the interface, the schema, and the
UI work end to end, not to be a real backing store.

## Adding a real vendor (e.g. Honeywell/Resideo)

1. Register a developer app in the vendor's own developer portal and get
   OAuth client ID/secret + register a redirect URI pointing at
   `smart-device-oauth-callback` (see that edge function).
2. Add the client ID/secret as Supabase secrets
   (`supabase secrets set HONEYWELL_CLIENT_ID=... HONEYWELL_CLIENT_SECRET=...`).
3. Create `supabase/functions/_shared/smartHub/honeywellAdapter.ts`
   implementing `SmartHubAdapter`, translating the vendor's real REST API
   into the normalized shapes above.
4. Register it in `index.ts`'s `getAdapter()` switch:
   `case 'honeywell': return new HoneywellSmartHubAdapter();`
5. Update `smart-device-oauth-start`/`smart-device-oauth-callback` to
   support `vendor=honeywell` alongside the existing `vendor=mock` path
   (real OAuth redirect flow instead of the mock's instant-connect stub).
6. No schema migration is needed — `smart_device_accounts.vendor` and
   `smart_devices.device_type` are free-text, not enums, specifically so a
   new vendor is a data/code change, not a schema change.

## What NOT to do

Do not build an adapter that authenticates using a user's raw password
against a vendor's own consumer web-login flow (the Ecobee/Auth0-reuse
pattern described above) — even though open-source tools do this for
personal use, it is not something this app should ask real families to
trust it with as a supported product feature. If Ecobee access is wanted
later, pursue either a legitimate partner/enterprise API tier or an
API-aggregator service with a stated manufacturer relationship (e.g.
Seam) instead.
