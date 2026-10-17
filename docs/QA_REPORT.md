# Family Cube kiosk QA report (2026-10-17)

Method: a throwaway scratch family is created through the `qa-scratch-family` edge function (real database rows, one real
login per member, so row-level security behaves as in the app), checks run as parent, co-parent, kid, teen and grandparent,
then the family is deleted. Backend result: **77 passed, 0 failed, 1 accepted note** (`scripts/qa/run.mjs`, full table in
`docs/QA_REPORT_backend.md`). UI behaviour was reviewed in code and checked by the owner on device; items not yet confirmed
on a device are listed at the end.

## Findings fixed (all pushed to `feat/simplify-flows`, migrations applied to the live database)

| Area | Problem | Fix |
|---|---|---|
| Sticky notes | Anyone holding the public key could read/write every family's notes | Notes scoped to the family and to who they were shared with; author-only edits; 100 character limit enforced |
| Medication doses | Any session could mark any dose taken | Caller must be the medication's member or a parent; anon access revoked |
| Recipes | Kid proposals could self-approve | Approval trigger: only parents approve |
| Meals | Two meals of the same type on one day; kids could edit or delete meals | Unique index per day and type; kids read-only in the database |
| Rewards | Ambiguous three-argument `redeem_reward` overload | Overload dropped |
| Tasks | Kids could not finish tasks they created or that a parent trusted them with | Trusted and personal tasks can self-complete; personal tasks are private and send no notifications |
| Chat DMs | A kid or teen on a shared device (kiosk) was refused their own DMs; messages did not reach the other side live | Participation check now uses the active member; an open DM also refreshes every 4 seconds |
| Chat | Wrong or missing previews on the phone inbox; banner shown for the open conversation; Just Us PIN re-asked after leaving the tab | Newest message previewed for every channel; banner suppressed for the open thread; leaving Chat leaves Just Us |
| Calendar | A kid or teen could delete any event at the table level | Minors cannot delete events |
| Kid requests | A kid could approve their own request; any kid could read other kids' requests | Minors can only set pending/cancelled; reads limited to parties, parents, and grandparents on open requests |
| Health | A grandparent could read every medication row; a kid could read a parent's record titles | Parents see the whole family; everyone else sees only their own rows |
| Family security code | "Out of date" even after entering the code; rotation error; code not viewable later | Local generation tracked; channel-id lookup; admin can view the code behind biometrics |
| Notifications | Clearing the first page never loaded the next batch | Next batch fetched after clearing, phone and kiosk |

## Accepted by design
- `member_locations` is readable by the whole family: Find Family needs it, and people who do not share are hidden by the app.

## Open items
- **PIN prompt on kiosk Chat and Meals:** no PIN gate exists in that code. Waiting for the screen that appears (PIN pad, lock screen, or security-code box).
- **Not yet confirmed on a device:** kiosk Just Us and Grandparent squad, DM live delivery on a shared device, the chat inbox previews, the notification bell and next-batch fetch.
- **Push end to end:** the notifier skipping personal-task pushes and sending sticky-note pushes only to chosen people was reviewed in code, not exercised with a signed-in test device.
- Realtime evaluates database rules without the active-member header, so on a shared device it can still drop DM events; the 4-second refresh covers it for the open thread only.
