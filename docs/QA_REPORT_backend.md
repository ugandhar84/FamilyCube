# Kiosk and Hub QA report

Run: 2026-10-17T19:44:29.993Z against a throwaway scratch family (real rows, real member sessions, so row-level security applies).

**152 passed, 0 failed, 1 findings.**

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
| PASS | a teen cannot approve a kid’s chore | member 107de247-321e-4e64-8fda-6b630f264928 is not authorized to approve chores |
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

## Tasks

| Result | Check | Detail |
|---|---|---|
| PASS | a task for a kid is created | {"ok":true,"choreId":"qa_scratch_ch_59cc6d5b"} |
| PASS | another kid cannot submit a task assigned to someone else | member 107de247-321e-4e64-8fda-6b630f264928 is not the assignee of chore qa_scratch_ch_59cc6d5b |
| PASS | a kid cannot submit a task pretending to be the assignee | caller is not member 6855146d-86d2-4687-a994-6e7efc878524 |
| PASS | a kid cannot raise the coins on their own task | Could not find the 'coins' column of 'chore_tasks' in the schema cache |
| PASS | a kid cannot mark their own task approved directly | A child/teenager cannot approve their own chore — requires a parent or an active temporary-approver grant. |
| PASS | a kid cannot delete a parent’s task | deleted 0 |
| PASS | a task is readable by family members | 1 |
| PASS | the assignee submits it | null |
| PASS | the assignee cannot approve their own submission | member 6855146d-86d2-4687-a994-6e7efc878524 is not authorized to approve chores |
| PASS | a parent cannot approve in another parent’s name | caller is not member 4d4d7f40-bcba-41ac-bb43-40c36b94ff82 |
| PASS | the other parent approves it | null |

## Rewards

| Result | Check | Detail |
|---|---|---|
| PASS | a kid with enough coins requests a reward | [{"redemption_id":"rd1792265611966"}] |
| PASS | the request returns a redemption id | [{"redemption_id":"rd1792265611966"}] |
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

## Medical files

| Result | Check | Detail |
|---|---|---|
| PASS | a parent uploads a visit recording for a kid | null |
| PASS | a parent uploads a document for a kid | null |
| PASS | a parent uploads their own document | null |
| PASS | a kid uploads their own document | null |
| PASS | a kid cannot upload into a parent’s folder | new row violates row-level security policy |
| PASS | nobody can upload into another family’s folder | new row violates row-level security policy |
| PASS | a kid downloads their own document | 15 |
| PASS | a kid cannot download a parent’s document | Object not found |
| PASS | a kid cannot list a parent’s folder | [] |
| PASS | a teen cannot download a sibling’s document | Object not found |
| PASS | a grandparent cannot download a kid’s visit recording | Object not found |
| PASS | the other parent downloads the kid’s visit recording | 17 |
| PASS | a kid cannot delete a parent’s document | deleted |
| PASS | the public anon key cannot download files | HTTP 400 |
| PASS | a parent saves a visit record for a kid | null |
| PASS | a teen cannot read a sibling’s visit record | 0 |
| PASS | a kid reads their own visit record | 1 |
| PASS | sweeper fixtures were created |  |
| PASS | the sweeper runs | {"ok":true,"scanned":3,"clearedApproved":1,"deletedStale":1,"failed":0} |
| PASS | the fixtures can be read back |  |
| PASS | an unsubmitted recording older than 7 days is deleted | still there |
| PASS | a fresh unsubmitted recording is kept | {"id":"135512fe-27d1-4924-be5a-e8171e3da04a","family_id":"b5b5b4c2-693c-4812-a73b-c5a90b3fdcb6","member_id":"6855146d-86d2-4687-a994-6e7efc878524","uploaded_by":"6ac253fa-3e74-40af-89c4-b48701c51b88","title":"QA fresh"," |
| PASS | an approved visit has its audio reference cleared | null |
| PASS | the stale and approved audio files are really deleted from storage | false/false |
| PASS | the fresh audio file is still in storage | null |

## PIN

| Result | Check | Detail |
|---|---|---|
| PASS | a member sets their own PIN | null |
| PASS | the PIN is stored hashed, not readable | $2a$06$r7wqD |
| PASS | the right PIN verifies | [{"ok":true,"locked_until":null,"attempts_remaining":5}] |
| PASS | a wrong PIN is refused | [{"ok":false,"locked_until":null,"attempts_remaining":4}] |
| PASS | a teen cannot change a sibling’s PIN | not allowed |
| PASS | a kid cannot change a parent’s PIN | not allowed |
| PASS | a parent can reset a kid’s PIN | null |
| PASS | a PIN that is not 4 digits is rejected | PIN must be 4 digits |
| PASS | a reset without a valid code fails | That code has expired. Request a new one. |
| PASS | someone else cannot use another member’s reset | not allowed |

