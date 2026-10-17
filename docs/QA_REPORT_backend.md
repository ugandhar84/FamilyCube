# Kiosk and Hub QA report

Run: 2026-10-17T06:33:53.224Z against a throwaway scratch family (real rows, real member sessions, so row-level security applies).

**48 passed, 0 failed, 2 findings.**

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
| PASS | a second breakfast the same day is blocked |  |
| PASS | a kid can read this week’s plan | 3 |
| NOTE | a kid can delete meals at the database level | The kiosk hides edit/delete from kids and teens, but the table policy allows it. Tighten family_meals RLS to parents if that matters. |
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
| PASS | a teen cannot approve a kid’s chore | member 0b580b33-bccb-4244-92c2-b8dcf0db07ee is not authorized to approve chores |
| PASS | a parent sends it back for a redo with a reason | null |
| PASS | the kid resubmits after the redo | null |
| PASS | a parent approves it | null |
| PASS | the kid is paid the coins once approved | coins gained: 15 |
| PASS | approving twice does not pay twice | coins gained after a second approve: 15 |
| PASS | a teen claims a pool bounty | null |
| PASS | a second kid cannot claim the same bounty | [{"claimed":false,"chore":null}] |

## Rewards

| Result | Check | Detail |
|---|---|---|
| PASS | a kid with enough coins requests a reward | [{"redemption_id":"rd1792218826767"}] |
| PASS | the request returns a redemption id | [{"redemption_id":"rd1792218826767"}] |
| PASS | a kid cannot approve their own reward request | only a parent can approve or decline a redemption |
| PASS | a parent approves the request | null |
| PASS | a kid without enough coins is refused | redeem_reward: insufficient balance |

