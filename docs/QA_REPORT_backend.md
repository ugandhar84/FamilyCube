# Kiosk and Hub QA report

Run: 2026-10-17T16:33:35.105Z against a throwaway scratch family (real rows, real member sessions, so row-level security applies).

**106 passed, 0 failed, 1 findings.**

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
| PASS | a grandparent cannot read other members’ medications | 0 rows |
| PASS | a kid still reads their own medication | 1 |
| PASS | a parent still reads the whole family’s medications | 1 |

## Chores

| Result | Check | Detail |
|---|---|---|
| PASS | a chore is created and assigned to a kid |  |
| PASS | the kid submits it for approval | null |
| PASS | a teen cannot approve a kid’s chore | member 8892348a-3db7-4e94-9ddc-7b00d6545cf0 is not authorized to approve chores |
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
| PASS | a kid’s own zero-coin task is flagged personal (so no notifications) | true |
| PASS | a kid’s own task that pays coins is not personal | false |
| PASS | a parent-assigned task is not personal | false |

## Rewards

| Result | Check | Detail |
|---|---|---|
| PASS | a kid with enough coins requests a reward | [{"redemption_id":"rd1792254747485"}] |
| PASS | the request returns a redemption id | [{"redemption_id":"rd1792254747485"}] |
| PASS | a kid cannot approve their own reward request | only a parent can approve or decline a redemption |
| PASS | a parent approves the request | null |
| PASS | a kid without enough coins is refused | redeem_reward: insufficient balance |

## Calendar

| Result | Check | Detail |
|---|---|---|
| PASS | an event is created for a kid |  |
| PASS | the kid can read today’s events | 1 |
| PASS | a kid cannot delete a family event |  |

## Kid requests

| Result | Check | Detail |
|---|---|---|
| PASS | a kid sends a request | null |
| PASS | a different teen cannot read the kid’s requests |  |
| PASS | the kid still reads their own request | 1 |
| PASS | a parent still reads the kid’s request | 1 |
| PASS | a kid cannot approve their own request | new row violates row-level security policy for table "kid_requests" |

## Health records

| Result | Check | Detail |
|---|---|---|
| PASS | a parent adds a vaccine for a kid | null |
| PASS | the kid can read their vaccines | null |
| PASS | a parent saves a medical record | null |
| PASS | a kid cannot read a parent’s medical records |  |
| PASS | the other parent still reads the family’s records | 1 |
| PASS | the owner still reads their own record | 1 |

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

## Chat

| Result | Check | Detail |
|---|---|---|
| PASS | group channel all can be created | null |
| PASS | group channel parents can be created | null |
| PASS | group channel seniors_all can be created | null |
| PASS | a parent posts in the family channel | null |
| PASS | a kid reads the family channel | 1 |
| PASS | a grandparent does not read the family channel (they have the squad) | 0 |
| PASS | a kid cannot post in the parents channel | new row violates row-level security policy for table "chat_messages" |
| PASS | the other parent posts in the parents channel | null |
| PASS | a teen cannot read the parents channel | 0 |
| PASS | a kid posts in the Grandparent squad | null |
| PASS | a grandparent reads the Grandparent squad | 1 |
| PASS | a parent opens a DM with a kid | null |
| PASS | the parent sends in the DM | null |
| PASS | the kid receives the DM | 1 |
| PASS | the kid replies in the DM | null |
| PASS | another teen cannot read someone else's DM | 0 |
| PASS | another teen cannot post in someone else's DM | new row violates row-level security policy for table "chat_messages" |
| PASS | the other parent cannot read someone else's DM | 0 |
| PASS | the other parent cannot post in someone else's DM | new row violates row-level security policy for table "chat_messages" |
| PASS | a grandparent cannot read someone else's DM | 0 |
| PASS | a grandparent cannot post in someone else's DM | new row violates row-level security policy for table "chat_messages" |
| PASS | a member cannot send a chat message as someone else | sender_id must match the caller's own member id |
| PASS | a kid opens a DM with a teen | null |
| PASS | the teen receives the kid’s DM | 1 |
| PASS | a parent cannot read the kid and teen’s private DM | 0 |
| PASS | only the sender can delete a message | only the original sender can delete this message |
| PASS | the sender can edit their own message | 1 |
| PASS | the other person cannot rewrite the message | only the original sender can edit this message |
| PASS | the public anon key cannot read chat | [] |

