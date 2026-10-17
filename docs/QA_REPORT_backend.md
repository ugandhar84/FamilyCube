# Kiosk and Hub QA report

Run: 2026-10-17T15:29:25.765Z against a throwaway scratch family (real rows, real member sessions, so row-level security applies).

**63 passed, 0 failed, 6 findings.**

## Sticky notes

| Result | Check | Detail |
|---|---|---|
| PASS | parent posts a note for everyone | null |
| PASS | parent posts a note for one kid | null |
| PASS | kid sees the note shared with them and the note for everyone | Pasta at 6:30 for everyone / Mia: cleats in the garage |
| PASS | a teen does NOT see a note shared only with another kid | Pasta at 6:30 for everyone |
| PASS | kid writes a note to the parents | null |
| PASS | the other parent sees the kid’s note | 2 |
| PASS | the teen cannot see the kid’s note to the parents |  |
| PASS | a member cannot post as someone else | new row violates row-level security policy for table "family_sticky_notes" |
| PASS | a note over 100 characters is rejected | new row for relation "family_sticky_notes" violates check constraint "family_sticky_notes_body_check" |
| PASS | an empty note is rejected | new row for relation "family_sticky_notes" violates check constraint "family_sticky_notes_body_check" |
| PASS | a teen cannot delete a parent’s note | deleted 0 |
| PASS | a parent can delete a note addressed to them | still there: 0 |
| PASS | a kid cannot delete a parent’s note for everyone | deleted 0 |
| PASS | an author can delete their own note | deleted 1 |
| PASS | the public anon key cannot read notes | [] |

## Meals

| Result | Check | Detail |
|---|---|---|
| PASS | parent adds a breakfast | null |
| PASS | parent adds lunch and dinner for the same day (3 meals a day) | null |
| PASS | parent adds a meal to NEXT week | null |
| PASS | a second breakfast the same day is blocked by the database | duplicate key value violates unique constraint "family_meals_no_dup" |
| PASS | a kid can read this week’s plan | 3 |
| PASS | a kid cannot delete meals | deleted 0 |
| PASS | a kid cannot add a meal | new row violates row-level security policy for table "family_meals" |
| PASS | a teen can still add a meal (as on the phone) | null |
| PASS | moving a meal to another day and week works (drag and drop) | null |

## Recipe book

| Result | Check | Detail |
|---|---|---|
| PASS | a kid proposes a recipe (pending) | null |
| PASS | a parent approves it | null |
| PASS | a kid inserting an "approved" recipe is stored as pending | status: pending |
| PASS | a kid cannot approve their own recipe | only a parent can approve a recipe |
| PASS | a parent can delete a recipe | null |

## Groceries

| Result | Check | Detail |
|---|---|---|
| PASS | parent adds an item |  |
| PASS | a kid can read the list | null |

## Medications

| Result | Check | Detail |
|---|---|---|
| PASS | parent adds a medication for a kid | null |
| PASS | the kid marks their own dose taken | ["2026-10-17/13:00"] |
| PASS | a different teen cannot mark the kid’s dose | only the person taking it or a parent can log this dose |
| PASS | the public anon key cannot mark doses | {"code":"P0001","details":null,"hint":null,"message":"not signed in"} |
| PASS | a parent can log a kid’s dose | null |
| NOTE | a grandparent can read 1 family medication row(s) | Read access is family-wide at the table level; the apps filter to own medications for kids/teens/seniors client-side. |

## Chores

| Result | Check | Detail |
|---|---|---|
| PASS | a chore is created and assigned to a kid |  |
| PASS | the kid submits it for approval | null |
| PASS | a teen cannot approve a kid’s chore | member 3658e54f-1353-4d8f-a93c-e7eae08463af is not authorized to approve chores |
| PASS | a parent sends it back for a redo with a reason | null |
| PASS | the kid resubmits after the redo | null |
| PASS | a parent approves it | null |
| PASS | the kid is paid the coins once approved | coins gained: 15 |
| PASS | approving twice does not pay twice | coins gained after a second approve: 15 |
| PASS | a teen claims a pool bounty | null |
| PASS | a second kid cannot claim the same bounty | [{"claimed":false,"chore":null}] |
| PASS | a kid finishes their own zero-coin task with one tap | null |
| PASS | a kid cannot self-approve a task that pays coins | A child/teenager cannot approve their own chore — requires a parent or an active temporary-approver grant. |
| PASS | a parent-trusted task completes on one tap | null |

## Rewards

| Result | Check | Detail |
|---|---|---|
| PASS | a kid with enough coins requests a reward | [{"redemption_id":"rd1792250944541"}] |
| PASS | the request returns a redemption id | [{"redemption_id":"rd1792250944541"}] |
| PASS | a kid cannot approve their own reward request | only a parent can approve or decline a redemption |
| PASS | a parent approves the request | null |
| PASS | a kid without enough coins is refused | redeem_reward: insufficient balance |

## Calendar

| Result | Check | Detail |
|---|---|---|
| PASS | an event is created for a kid |  |
| PASS | the kid can read today’s events | 1 |
| NOTE | a kid can delete a family event at the table level | The kiosk hides delete from kids, but the table policy allows it for any family member. |

## Kid requests

| Result | Check | Detail |
|---|---|---|
| PASS | a kid sends a request | null |
| NOTE | another kid/teen can read a different kid’s requests | kid_requests SELECT is family-wide at the table level. |
| NOTE | a kid can approve their own request at the table level | The kiosk and phone only offer Approve to parents; the table policy accepts an update from the requesting kid. |

## Health records

| Result | Check | Detail |
|---|---|---|
| PASS | a parent adds a vaccine for a kid | null |
| PASS | the kid can read their vaccines | null |
| PASS | a parent saves a medical record | null |
| NOTE | a kid can read a parent’s medical records at the table level | The app hides Records from kids, but the table returns them. The file contents are encrypted, titles and tags are not. |

## Memories

| Result | Check | Detail |
|---|---|---|
| PASS | a kid posts a memory | null |
| PASS | another teen cannot delete a kid’s memory | deleted 0 |
| PASS | a parent can delete a memory | null |

## Locations

| Result | Check | Detail |
|---|---|---|
| NOTE | a kid can read 0 location row(s) | member_locations is readable family-wide (the kiosk only shows people who chose to share). |

