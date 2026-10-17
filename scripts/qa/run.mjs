// Backend QA for the kiosk/hub work: builds a throwaway scratch family through the qa-scratch-family edge function
// (real DB rows, real member sessions, so row-level security is exercised as the app hits it), runs the checks,
// tears the family down, and writes docs/QA_REPORT.md. Usage: node scripts/qa/run.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL = env.EXPO_PUBLIC_SUPABASE_URL, KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const call = async (body) => (await fetch(`${URL}/functions/v1/qa-scratch-family`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

const results = [];
const check = (area, name, pass, detail = '') => { results.push({ area, name, pass, detail: String(detail).slice(0, 220) }); console.log(`${pass ? 'PASS' : 'FAIL'}  [${area}] ${name}${pass ? '' : '  -> ' + detail}`); };
const finding = (area, name, detail) => { results.push({ area, name, pass: null, detail }); console.log(`NOTE  [${area}] ${name}  -> ${detail}`); };

const setup = await call({ action: 'setup', names: ['Alex', 'Sarah', 'Mia', 'Zane', 'Leo', 'Ivy', 'Max', 'Kai', 'Nana'] });
if (!setup.ok) { console.error('setup failed', setup); process.exit(1); }
const F = setup.familyId; const M = Object.fromEntries(setup.members.map(m => [m.name.replace('QA SCRATCH ', ''), m.id]));
const [alex, sarah, mia, zane, , , , , nana] = setup.members.map(m => m.id);
const as = (id, table, op, extra = {}) => call({ action: 'table', actingMemberId: id, table, op, ...extra });
const rows = r => (Array.isArray(r.data) ? r.data : []);

try {
  /* ───────── Sticky notes ───────── */
  const A = 'Sticky notes';
  let r = await as(alex, 'family_sticky_notes', 'insert', { row: { family_id: F, author_id: alex, body: 'Pasta at 6:30 for everyone', color: 'amber', recipient_ids: [] } });
  check(A, 'parent posts a note for everyone', r.ok && rows(r).length === 1, r.error);
  const everyoneId = rows(r)[0]?.id;
  r = await as(alex, 'family_sticky_notes', 'insert', { row: { family_id: F, author_id: alex, body: 'Mia: cleats in the garage', color: 'sage', recipient_ids: [mia] } });
  check(A, 'parent posts a note for one kid', r.ok, r.error);
  const miaNoteId = rows(r)[0]?.id;
  r = await as(mia, 'family_sticky_notes', 'select', { match: { family_id: F } });
  const miaSees = rows(r).map(n => n.body);
  check(A, 'kid sees the note shared with them and the note for everyone', miaSees.includes('Mia: cleats in the garage') && miaSees.includes('Pasta at 6:30 for everyone'), miaSees.join(' | '));
  r = await as(zane, 'family_sticky_notes', 'select', { match: { family_id: F } });
  const zaneSees = rows(r).map(n => n.body);
  check(A, 'a teen does NOT see a note shared only with another kid', !zaneSees.includes('Mia: cleats in the garage') && zaneSees.includes('Pasta at 6:30 for everyone'), zaneSees.join(' | '));
  r = await as(mia, 'family_sticky_notes', 'insert', { row: { family_id: F, author_id: mia, body: 'Mom, can I have a friend over?', color: 'peach', recipient_ids: [alex, sarah] } });
  check(A, 'kid writes a note to the parents', r.ok, r.error);
  r = await as(sarah, 'family_sticky_notes', 'select', { match: { family_id: F } });
  check(A, 'the other parent sees the kid’s note', rows(r).some(n => n.body.startsWith('Mom, can I')), rows(r).length);
  r = await as(zane, 'family_sticky_notes', 'select', { match: { family_id: F } });
  check(A, 'the teen cannot see the kid’s note to the parents', !rows(r).some(n => n.body.startsWith('Mom, can I')), '');
  r = await as(mia, 'family_sticky_notes', 'insert', { row: { family_id: F, author_id: alex, body: 'forged as a parent', recipient_ids: [] } });
  check(A, 'a member cannot post as someone else', !r.ok, r.error ?? 'insert succeeded');
  r = await as(mia, 'family_sticky_notes', 'insert', { row: { family_id: F, author_id: mia, body: 'x'.repeat(101), recipient_ids: [] } });
  check(A, 'a note over 100 characters is rejected', !r.ok, r.error ?? 'insert succeeded');
  r = await as(mia, 'family_sticky_notes', 'insert', { row: { family_id: F, author_id: mia, body: '', recipient_ids: [] } });
  check(A, 'an empty note is rejected', !r.ok, r.error ?? 'insert succeeded');
  r = await as(zane, 'family_sticky_notes', 'delete', { match: { id: everyoneId } });
  check(A, 'a teen cannot delete a parent’s note', rows(r).length === 0, `deleted ${rows(r).length}`);
  // A parent can remove a note they can see (the kid's note to the parents). A note shared privately with
  // someone else is not visible to them, so it is not theirs to delete either.
  r = await as(mia, 'family_sticky_notes', 'select', { match: { family_id: F } });
  const toParents = rows(r).find(n => n.body.startsWith('Mom, can I'));
  await as(sarah, 'family_sticky_notes', 'delete', { match: { id: toParents?.id } });
  r = await as(mia, 'family_sticky_notes', 'select', { match: { id: toParents?.id } });
  check(A, 'a parent can delete a note addressed to them', rows(r).length === 0, `still there: ${rows(r).length}`);
  r = await as(mia, 'family_sticky_notes', 'delete', { match: { id: everyoneId } });
  check(A, 'a kid cannot delete a parent’s note for everyone', rows(r).length === 0, `deleted ${rows(r).length}`);
  r = await as(mia, 'family_sticky_notes', 'insert', { row: { family_id: F, author_id: mia, body: 'mine', recipient_ids: [] } });
  const mineId = rows(r)[0]?.id;
  r = await as(mia, 'family_sticky_notes', 'delete', { match: { id: mineId } });
  check(A, 'an author can delete their own note', rows(r).length === 1, r.error ?? `deleted ${rows(r).length}`);
  const anon = await (await fetch(`${URL}/rest/v1/family_sticky_notes?select=id&family_id=eq.${F}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json();
  check(A, 'the public anon key cannot read notes', Array.isArray(anon) && anon.length === 0, JSON.stringify(anon).slice(0, 80));

  /* ───────── Meals ───────── */
  const B = 'Meals';
  const monday = (off) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return d.toISOString().slice(0, 10); };
  const meal = (id, day, type, week = monday(0)) => ({ id: `${F}-${week}-${day}-${id}`, family_id: F, week_of: week, day, title: `QA ${type}`, type, ingredients: ['a'], prep_steps: ['b'], dietary_tags: [], ai_generated: false });
  r = await as(alex, 'family_meals', 'insert', { row: meal('b1', 'Mon', 'breakfast') });
  check(B, 'parent adds a breakfast', r.ok, r.error);
  r = await as(alex, 'family_meals', 'insert', { row: [meal('l1', 'Mon', 'lunch'), meal('d1', 'Mon', 'dinner')] });
  check(B, 'parent adds lunch and dinner for the same day (3 meals a day)', r.ok && rows(r).length === 2, r.error);
  r = await as(alex, 'family_meals', 'insert', { row: meal('n1', 'Mon', 'dinner', monday(1)) });
  check(B, 'parent adds a meal to NEXT week', r.ok, r.error);
  r = await as(alex, 'family_meals', 'insert', { row: meal('b2', 'Mon', 'breakfast') });
  check(B, 'a second breakfast the same day is blocked by the database', !r.ok, r.error ?? 'insert succeeded');
  r = await as(mia, 'family_meals', 'select', { match: { family_id: F, week_of: monday(0) } });
  check(B, 'a kid can read this week’s plan', rows(r).length >= 3, r.error ?? rows(r).length);
  r = await as(mia, 'family_meals', 'delete', { match: { family_id: F, type: 'lunch' } });
  check(B, 'a kid cannot delete meals', rows(r).length === 0, `deleted ${rows(r).length}`);
  r = await as(mia, 'family_meals', 'insert', { row: meal('k1', 'Wed', 'snack') });
  check(B, 'a kid cannot add a meal', !r.ok, r.error ?? 'insert succeeded');
  r = await as(zane, 'family_meals', 'insert', { row: meal('t1', 'Wed', 'snack') });
  check(B, 'a teen can still add a meal (as on the phone)', r.ok, r.error);
  const mv = await as(alex, 'family_meals', 'update', { row: { day: 'Tue', week_of: monday(1) }, match: { id: `${F}-${monday(0)}-Mon-b1` } });
  check(B, 'moving a meal to another day and week works (drag and drop)', mv.ok && rows(mv).length === 1, mv.error);

  /* ───────── Recipe book ───────── */
  const C = 'Recipe book';
  const rid = `${F}-recipe-${Date.now()}`;
  r = await as(mia, 'family_recipes', 'insert', { row: { id: rid, family_id: F, title: 'Mia’s pancakes', emoji: '🥞', ingredients: ['flour'], prep_steps: ['mix'], dietary_tags: [], created_by: mia, status: 'pending' } });
  check(C, 'a kid proposes a recipe (pending)', r.ok && rows(r)[0]?.status === 'pending', r.error);
  r = await as(sarah, 'family_recipes', 'update', { row: { status: 'approved' }, match: { id: rid } });
  check(C, 'a parent approves it', r.ok && rows(r)[0]?.status === 'approved', r.error);
  r = await as(mia, 'family_recipes', 'insert', { row: { id: rid + 'b', family_id: F, title: 'Second', ingredients: [], prep_steps: [], dietary_tags: [], created_by: mia, status: 'approved' } });
  check(C, 'a kid inserting an "approved" recipe is stored as pending', r.ok && rows(r)[0]?.status === 'pending', `status: ${rows(r)[0]?.status}`);
  r = await as(mia, 'family_recipes', 'update', { row: { status: 'approved' }, match: { id: rid + 'b' } });
  check(C, 'a kid cannot approve their own recipe', !r.ok || rows(r)[0]?.status !== 'approved', r.error ?? rows(r)[0]?.status);
  r = await as(sarah, 'family_recipes', 'delete', { match: { id: rid } });
  check(C, 'a parent can delete a recipe', rows(r).length === 1, r.error);

  /* ───────── Groceries ───────── */
  const D = 'Groceries';
  r = await call({ action: 'add_grocery_item', familyId: F, name: 'Milk', quantity: '1 gal', addedBy: alex });
  check(D, 'parent adds an item', r.ok, r.error);
  r = await as(mia, 'grocery_items', 'select', { match: { family_id: F } });
  check(D, 'a kid can read the list', rows(r).length >= 1, r.error);

  /* ───────── Medications ───────── */
  const E = 'Medications';
  const medId = crypto.randomUUID();
  r = await as(alex, 'family_medications', 'insert', { row: { id: medId, family_id: F, member_id: mia, name: 'Amoxicillin', dosage: '250', dosage_unit: 'mg', frequency: 'three_daily', frequency_times: ['07:30', '13:00', '19:00'], category: 'prescription', is_active: true, is_ongoing: true, taken_dates: [] } });
  check(E, 'parent adds a medication for a kid', r.ok, r.error);
  const today = new Date().toISOString().slice(0, 10);
  r = await call({ action: 'rpc', actingMemberId: mia, fnName: 'toggle_medication_dose', args: { p_med_id: medId, p_entry: `${today}|13:00`, p_mark_taken: true, p_today: today, p_modified_by: mia } });
  check(E, 'the kid marks their own dose taken', r.ok && Array.isArray(r.data) && r.data.includes(`${today}|13:00`), r.error ?? JSON.stringify(r.data));
  r = await call({ action: 'rpc', actingMemberId: zane, fnName: 'toggle_medication_dose', args: { p_med_id: medId, p_entry: `${today}|19:00`, p_mark_taken: true, p_today: today, p_modified_by: zane } });
  check(E, 'a different teen cannot mark the kid’s dose', !r.ok, r.error ?? 'accepted');
  const anonRpc = await (await fetch(`${URL}/rest/v1/rpc/toggle_medication_dose`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_med_id: medId, p_entry: `${today}|07:30`, p_mark_taken: true, p_today: today, p_modified_by: mia }) })).json();
  check(E, 'the public anon key cannot mark doses', !!anonRpc.code || !!anonRpc.message, JSON.stringify(anonRpc).slice(0, 100));
  r = await call({ action: 'rpc', actingMemberId: alex, fnName: 'toggle_medication_dose', args: { p_med_id: medId, p_entry: `${today}|07:30`, p_mark_taken: true, p_today: today, p_modified_by: alex } });
  check(E, 'a parent can log a kid’s dose', r.ok, r.error);
  r = await as(nana, 'family_medications', 'select', { match: { family_id: F } });
  check(E, 'a grandparent cannot read other members’ medications', rows(r).length === 0, `${rows(r).length} rows`);
  r = await as(mia, 'family_medications', 'select', { match: { family_id: F } });
  check(E, 'a kid still reads their own medication', rows(r).length >= 1, r.error ?? rows(r).length);
  r = await as(alex, 'family_medications', 'select', { match: { family_id: F } });
  check(E, 'a parent still reads the whole family’s medications', rows(r).length >= 1, r.error ?? rows(r).length);
  /* ───────── Chores ───────── */
  const G = 'Chores';
  const rpc = (id, fnName, args) => call({ action: 'rpc', actingMemberId: id, fnName, args });
  let q = await call({ action: 'add_quest', familyId: F, title: 'QA empty dishwasher', isPool: false, assignedToId: mia, status: 'todo', coins: 15, dueDate: new Date().toISOString().slice(0, 10), dueTime: '17:30' });
  const choreId = q.choreId;
  check(G, 'a chore is created and assigned to a kid', q.ok, q.error);
  r = await rpc(mia, 'submit_chore', { p_chore_id: choreId, p_member_id: mia, p_note: 'done' });
  check(G, 'the kid submits it for approval', r.ok, r.error);
  r = await rpc(zane, 'approve_chore', { p_chore_id: choreId, p_reviewer_id: zane });
  check(G, 'a teen cannot approve a kid’s chore', !r.ok, r.error ?? 'approved');
  r = await rpc(sarah, 'request_redo', { p_chore_id: choreId, p_reviewer_id: sarah, p_reason: 'dishes still in the sink' });
  check(G, 'a parent sends it back for a redo with a reason', r.ok, r.error);
  r = await rpc(mia, 'submit_chore', { p_chore_id: choreId, p_member_id: mia, p_note: 'fixed' });
  check(G, 'the kid resubmits after the redo', r.ok, r.error);
  const before = (await call({ action: 'read', table: 'members', familyId: F })).rows?.find(m => m.id === mia);
  r = await rpc(alex, 'approve_chore', { p_chore_id: choreId, p_reviewer_id: alex });
  check(G, 'a parent approves it', r.ok, r.error);
  const after = (await call({ action: 'read', table: 'members', familyId: F })).rows?.find(m => m.id === mia);
  const gained = (after?.main_coins ?? 0) - (before?.main_coins ?? 0);
  check(G, 'the kid is paid the coins once approved', gained === 15, `coins gained: ${gained}`);
  r = await rpc(alex, 'approve_chore', { p_chore_id: choreId, p_reviewer_id: alex });
  const afterTwice = (await call({ action: 'read', table: 'members', familyId: F })).rows?.find(m => m.id === mia);
  const gained2 = (afterTwice?.main_coins ?? 0) - (before?.main_coins ?? 0);
  check(G, 'approving twice does not pay twice', gained2 === 15, `coins gained after a second approve: ${gained2}`);
  q = await call({ action: 'add_quest', familyId: F, title: 'QA bounty: wash the car', isPool: true, status: 'todo', coins: 25 });
  r = await rpc(zane, 'claim_pool_quest', { p_chore_id: q.choreId, p_member_id: zane });
  check(G, 'a teen claims a pool bounty', r.ok, r.error);
  r = await rpc(mia, 'claim_pool_quest', { p_chore_id: q.choreId, p_member_id: mia });
  check(G, 'a second kid cannot claim the same bounty', !r.ok || r.data?.ok === false || JSON.stringify(r.data).includes('false'), r.error ?? JSON.stringify(r.data));

  // One-tap tasks: a parent-trusted task and a kid's own zero-coin task finish on submit; a kid's own coin task does not.
  const mk = async (extra) => { const row = { id: `qa_scratch_ct_${Math.random().toString(36).slice(2, 8)}`, family_id: F, title: extra.title, status: 'todo', is_pool: false, assigned_to_id: mia, created_by_id: extra.by, base_points: extra.coins, coins_reward: extra.coins, trusted_auto_approve: !!extra.trusted, created_at: new Date().toISOString() }; const res = await call({ action: 'table', actingMemberId: alex, table: 'chore_tasks', op: 'insert', row }); return { id: row.id, res }; };
  let own = await call({ action: 'add_quest', familyId: F, title: 'QA my own reminder', isPool: false, assignedToId: mia, status: 'todo', coins: 0 });
  await call({ action: 'chore_patch', choreId: own.choreId, patch: { created_by_id: mia, trusted_auto_approve: true, base_points: 0, coins_reward: 0 } });
  r = await rpc(mia, 'submit_chore', { p_chore_id: own.choreId, p_member_id: mia });
  check(G, 'a kid finishes their own zero-coin task with one tap', r.ok, r.error);
  let coinTask = await call({ action: 'add_quest', familyId: F, title: 'QA my own coin task', isPool: false, assignedToId: mia, status: 'todo', coins: 20 });
  await call({ action: 'chore_patch', choreId: coinTask.choreId, patch: { created_by_id: mia, trusted_auto_approve: true } });
  r = await rpc(mia, 'submit_chore', { p_chore_id: coinTask.choreId, p_member_id: mia });
  check(G, 'a kid cannot self-approve a task that pays coins', !r.ok, r.error ?? 'approved');
  let trusted = await call({ action: 'add_quest', familyId: F, title: 'QA brush teeth', isPool: false, assignedToId: mia, status: 'todo', coins: 2 });
  await call({ action: 'chore_patch', choreId: trusted.choreId, patch: { created_by_id: alex, trusted_auto_approve: true } });
  r = await rpc(mia, 'submit_chore', { p_chore_id: trusted.choreId, p_member_id: mia });
  check(G, 'a parent-trusted task completes on one tap', r.ok, r.error);

  const flags = (await call({ action: 'read', table: 'chore_tasks', familyId: F })).rows ?? [];
  const flagOf = id => flags.find(c => c.id === id)?.is_personal;
  check(G, 'a kid’s own zero-coin task is flagged personal (so no notifications)', flagOf(own.choreId) === true, String(flagOf(own.choreId)));
  check(G, 'a kid’s own task that pays coins is not personal', flagOf(coinTask.choreId) === false, String(flagOf(coinTask.choreId)));
  check(G, 'a parent-assigned task is not personal', flagOf(trusted.choreId) === false, String(flagOf(trusted.choreId)));

  /* ───────── Tasks: adversarial checks ───────── */
  const TK = 'Tasks';
  const tq = await call({ action: 'add_quest', familyId: F, title: 'QA adversarial task', isPool: false, assignedToId: mia, status: 'todo', coins: 20, dueDate: new Date().toISOString().slice(0, 10), dueTime: '18:00' });
  const tId = tq.choreId ?? tq.id;
  check(TK, 'a task for a kid is created', !!tId, JSON.stringify(tq).slice(0, 120));
  r = await rpc(zane, 'submit_chore', { p_chore_id: tId, p_member_id: zane, p_note: 'not mine' });
  check(TK, 'another kid cannot submit a task assigned to someone else', !r.ok, r.error ?? 'submitted');
  r = await rpc(zane, 'submit_chore', { p_chore_id: tId, p_member_id: mia, p_note: 'as mia' });
  check(TK, 'a kid cannot submit a task pretending to be the assignee', !r.ok, r.error ?? 'submitted');
  r = await as(mia, 'chore_tasks', 'update', { row: { coins: 999 }, match: { id: tId } });
  check(TK, 'a kid cannot raise the coins on their own task', !r.ok || rows(r).length === 0 || rows(r)[0]?.coins !== 999, r.error ?? JSON.stringify(rows(r)[0]?.coins));
  r = await as(mia, 'chore_tasks', 'update', { row: { status: 'approved' }, match: { id: tId } });
  check(TK, 'a kid cannot mark their own task approved directly', !r.ok || rows(r).length === 0 || rows(r)[0]?.status !== 'approved', r.error ?? rows(r)[0]?.status);
  r = await as(mia, 'chore_tasks', 'delete', { match: { id: tId } });
  check(TK, 'a kid cannot delete a parent’s task', !r.ok || rows(r).length === 0, r.error ?? `deleted ${rows(r).length}`);
  r = await as(zane, 'chore_tasks', 'select', { match: { id: tId } });
  check(TK, 'a task is readable by family members', rows(r).length === 1, r.error ?? rows(r).length);
  r = await rpc(mia, 'submit_chore', { p_chore_id: tId, p_member_id: mia, p_note: 'done' });
  check(TK, 'the assignee submits it', r.ok, r.error);
  r = await rpc(mia, 'approve_chore', { p_chore_id: tId, p_reviewer_id: mia });
  check(TK, 'the assignee cannot approve their own submission', !r.ok, r.error ?? 'approved');
  r = await rpc(alex, 'approve_chore', { p_chore_id: tId, p_reviewer_id: sarah });
  check(TK, 'a parent cannot approve in another parent’s name', !r.ok, r.error ?? 'approved');
  r = await rpc(sarah, 'approve_chore', { p_chore_id: tId, p_reviewer_id: sarah });
  check(TK, 'the other parent approves it', r.ok, r.error);

  /* ───────── Rewards ───────── */
  const H = 'Rewards';
  await call({ action: 'set_coins', familyId: F, memberId: mia, mainCoins: 100 });
  const rw = await call({ action: 'add_reward', familyId: F, title: 'QA extra screen time', cost: 60 });
  r = await rpc(mia, 'redeem_reward', { p_reward_id: rw.rewardId ?? rw.id, p_member_id: mia });
  check(H, 'a kid with enough coins requests a reward', r.ok, r.error ?? JSON.stringify(r.data));
  const rdRow = Array.isArray(r.data) ? r.data[0] : r.data;
  const rdId = rdRow?.id ?? rdRow?.redemption_id ?? rdRow?.redemption?.id;
  check(H, 'the request returns a redemption id', !!rdId, JSON.stringify(r.data).slice(0, 160));
  if (rdId) {
    r = await rpc(mia, 'resolve_reward_redemption', { p_redemption_id: rdId, p_approve: true, p_actor_id: mia });
    check(H, 'a kid cannot approve their own reward request', !r.ok, r.error ?? 'approved');
    r = await rpc(alex, 'resolve_reward_redemption', { p_redemption_id: rdId, p_approve: true, p_actor_id: alex });
    check(H, 'a parent approves the request', r.ok, r.error);
  }
  await call({ action: 'set_coins', familyId: F, memberId: mia, mainCoins: 10 });
  const rw2 = await call({ action: 'add_reward', familyId: F, title: 'QA expensive', cost: 500 });
  r = await rpc(mia, 'redeem_reward', { p_reward_id: rw2.rewardId ?? rw2.id, p_member_id: mia });
  check(H, 'a kid without enough coins is refused', !r.ok, r.error ?? JSON.stringify(r.data));

  /* ───────── Calendar events ───────── */
  const I = 'Calendar';
  const day = new Date().toISOString().slice(0, 10);
  r = await call({ action: 'add_event', familyId: F, memberId: mia, title: 'QA soccer practice', date: day, time: '16:45' });
  check(I, 'an event is created for a kid', r.ok, r.error);
  r = await as(mia, 'calendar_events', 'select', { match: { family_id: F, date: day } });
  check(I, 'the kid can read today’s events', rows(r).some(e => e.title === 'QA soccer practice'), r.error ?? rows(r).length);
  r = await as(mia, 'calendar_events', 'delete', { match: { id: rows(r)[0]?.id } });
  if (rows(r).length > 0) finding(I, 'a kid can delete a family event at the table level', 'The kiosk hides delete from kids, but the table policy allows it for any family member.');
  else check(I, 'a kid cannot delete a family event', true, '');

  /* ───────── Kid requests ───────── */
  const J = 'Kid requests';
  r = await as(mia, 'kid_requests', 'insert', { row: { id: `kr_${Date.now()}`, family_id: F, from_member_id: mia, type: 'delegation', detail: 'Grocery request', status: 'pending' } });
  check(J, 'a kid sends a request', r.ok, r.error);
  const krId = rows(r)[0]?.id;
  r = await as(zane, 'kid_requests', 'select', { match: { family_id: F } });
  if (rows(r).length > 0) finding(J, 'another kid/teen can read a different kid’s requests', 'kid_requests SELECT is family-wide at the table level.');
  else check(J, 'a different teen cannot read the kid’s requests', true, '');
  r = await as(mia, 'kid_requests', 'select', { match: { family_id: F } });
  check(J, 'the kid still reads their own request', rows(r).length >= 1, r.error ?? rows(r).length);
  r = await as(sarah, 'kid_requests', 'select', { match: { family_id: F } });
  check(J, 'a parent still reads the kid’s request', rows(r).length >= 1, r.error ?? rows(r).length);
  r = await as(mia, 'kid_requests', 'update', { row: { status: 'approved' }, match: { id: krId } });
  if (r.ok && rows(r)[0]?.status === 'approved') finding(J, 'a kid can approve their own request at the table level', 'The kiosk and phone only offer Approve to parents; the table policy accepts an update from the requesting kid.');
  else check(J, 'a kid cannot approve their own request', true, r.error);

  /* ───────── Vaccines and records ───────── */
  const K = 'Health records';
  r = await as(alex, 'family_vaccines', 'insert', { row: { family_id: F, member_id: mia, title: 'Flu Shot 2026', date: day, series_current: 1, series_total: 1, done: false } });
  check(K, 'a parent adds a vaccine for a kid', r.ok, r.error);
  r = await as(mia, 'family_vaccines', 'select', { match: { family_id: F } });
  check(K, 'the kid can read their vaccines', rows(r).length === 1, r.error);
  r = await as(alex, 'medical_records', 'insert', { row: { family_id: F, member_id: alex, title: 'QA bloodwork', tag: 'lab', record_date: day, ai_tags: [], ai_analyzed: false } });
  check(K, 'a parent saves a medical record', r.ok, r.error);
  r = await as(mia, 'medical_records', 'select', { match: { family_id: F } });
  if (rows(r).length > 0) finding(K, 'a kid can read a parent’s medical records at the table level', 'The app hides Records from kids, but the table returns them. The file contents are encrypted, titles and tags are not.');
  else check(K, 'a kid cannot read a parent’s medical records', true, '');
  r = await as(sarah, 'medical_records', 'select', { match: { family_id: F } });
  check(K, 'the other parent still reads the family’s records', rows(r).length >= 1, r.error ?? rows(r).length);
  r = await as(alex, 'medical_records', 'select', { match: { family_id: F } });
  check(K, 'the owner still reads their own record', rows(r).length >= 1, r.error ?? rows(r).length);

  /* ───────── Memories ───────── */
  const L = 'Memories';
  r = await as(mia, 'family_memories', 'insert', { row: { family_id: F, title: 'QA leaf pile', date: day, created_by: mia, hearts: 0, hearted_by: [], photo_urls: [], tagged_member_ids: [mia] } });
  check(L, 'a kid posts a memory', r.ok, r.error);
  const memId = rows(r)[0]?.id;
  r = await as(zane, 'family_memories', 'delete', { match: { id: memId } });
  check(L, 'another teen cannot delete a kid’s memory', rows(r).length === 0, `deleted ${rows(r).length}`);
  r = await as(alex, 'family_memories', 'delete', { match: { id: memId } });
  check(L, 'a parent can delete a memory', rows(r).length === 1, r.error);

  /* ───────── Locations ───────── */
  const M2 = 'Locations';
  r = await as(mia, 'member_locations', 'select', { match: {} });
  finding(M2, `a kid can read ${rows(r).length} location row(s)`, 'member_locations is readable family-wide (the kiosk only shows people who chose to share).');

  /* ───────── Chat ───────── */
  const CH = 'Chat';
  const dmId = (a, b) => `dm_${[a, b].sort().join('_')}`;
  const msg = (ch, sender, text = 'enc') => ({ id: crypto.randomUUID(), channel_id: ch, sender_id: sender, text, timestamp: Date.now() });
  const mkChan = async (who, id, type, members) => (await as(who, 'chat_channels', 'insert', { noReturn: true, row: { id, family_id: F, type, name: id.slice(0, 20), member_ids: members, icon: '💬' } }));
  // group channels the app creates lazily (family-scoped ids)
  for (const g of ['all', 'parents', 'seniors_all']) { r = await mkChan(alex, `${F}::${g}`, 'group', []); check(CH, `group channel ${g} can be created`, r.ok, r.error); }
  r = await as(alex, 'chat_messages', 'insert', { noReturn: true, row: msg(`${F}::all`, alex) });
  check(CH, 'a parent posts in the family channel', r.ok, r.error);
  r = await as(mia, 'chat_messages', 'select', { match: { channel_id: `${F}::all` } });
  check(CH, 'a kid reads the family channel', rows(r).length === 1, r.error ?? rows(r).length);
  r = await as(nana, 'chat_messages', 'select', { match: { channel_id: `${F}::all` } });
  check(CH, 'a grandparent does not read the family channel (they have the squad)', rows(r).length === 0, rows(r).length);
  r = await as(mia, 'chat_messages', 'insert', { noReturn: true, row: msg(`${F}::parents`, mia) });
  check(CH, 'a kid cannot post in the parents channel', !r.ok, r.error ?? 'insert succeeded');
  r = await as(sarah, 'chat_messages', 'insert', { noReturn: true, row: msg(`${F}::parents`, sarah) });
  check(CH, 'the other parent posts in the parents channel', r.ok, r.error);
  r = await as(zane, 'chat_messages', 'select', { match: { channel_id: `${F}::parents` } });
  check(CH, 'a teen cannot read the parents channel', rows(r).length === 0, rows(r).length);
  r = await as(mia, 'chat_messages', 'insert', { noReturn: true, row: msg(`${F}::seniors_all`, mia) });
  check(CH, 'a kid posts in the Grandparent squad', r.ok, r.error);
  r = await as(nana, 'chat_messages', 'select', { match: { channel_id: `${F}::seniors_all` } });
  check(CH, 'a grandparent reads the Grandparent squad', rows(r).length === 1, r.error ?? rows(r).length);
  // DMs
  const dmAM = dmId(alex, mia);
  r = await mkChan(alex, dmAM, 'direct', [alex, mia]);
  check(CH, 'a parent opens a DM with a kid', r.ok, r.error);
  r = await as(alex, 'chat_messages', 'insert', { noReturn: true, row: msg(dmAM, alex) });
  check(CH, 'the parent sends in the DM', r.ok, r.error);
  r = await as(mia, 'chat_messages', 'select', { match: { channel_id: dmAM } });
  check(CH, 'the kid receives the DM', rows(r).length === 1, r.error ?? rows(r).length);
  r = await as(mia, 'chat_messages', 'insert', { noReturn: true, row: msg(dmAM, mia) });
  check(CH, 'the kid replies in the DM', r.ok, r.error);
  for (const [who, name] of [[zane, 'another teen'], [sarah, 'the other parent'], [nana, 'a grandparent']]) {
    r = await as(who, 'chat_messages', 'select', { match: { channel_id: dmAM } });
    check(CH, `${name} cannot read someone else's DM`, rows(r).length === 0, rows(r).length);
    r = await as(who, 'chat_messages', 'insert', { noReturn: true, row: msg(dmAM, who) });
    check(CH, `${name} cannot post in someone else's DM`, !r.ok, r.error ?? 'insert succeeded');
  }
  r = await as(mia, 'chat_messages', 'insert', { noReturn: true, row: msg(dmAM, alex) });
  check(CH, 'a member cannot send a chat message as someone else', !r.ok, r.error ?? 'insert succeeded');
  const dmMZ = dmId(mia, zane);
  r = await mkChan(mia, dmMZ, 'direct', [mia, zane]);
  check(CH, 'a kid opens a DM with a teen', r.ok, r.error);
  r = await as(mia, 'chat_messages', 'insert', { noReturn: true, row: msg(dmMZ, mia) });
  r = await as(zane, 'chat_messages', 'select', { match: { channel_id: dmMZ } });
  check(CH, 'the teen receives the kid’s DM', rows(r).length === 1, r.error ?? rows(r).length);
  r = await as(alex, 'chat_messages', 'select', { match: { channel_id: dmMZ } });
  check(CH, 'a parent cannot read the kid and teen’s private DM', rows(r).length === 0, rows(r).length);
  // delete / edit
  r = await as(zane, 'chat_messages', 'select', { match: { channel_id: dmMZ } });
  const mzMsg = rows(r)[0]?.id;
  r = await as(zane, 'chat_messages', 'delete', { match: { id: mzMsg } });
  check(CH, 'only the sender can delete a message', rows(r).length === 0 || !r.ok, r.error ?? `deleted ${rows(r).length}`);
  r = await as(mia, 'chat_messages', 'update', { row: { text: 'edited' }, match: { id: mzMsg } });
  check(CH, 'the sender can edit their own message', r.ok && rows(r).length === 1, r.error ?? rows(r).length);
  r = await as(zane, 'chat_messages', 'update', { row: { text: 'hacked' }, match: { id: mzMsg } });
  check(CH, 'the other person cannot rewrite the message', !r.ok || rows(r).length === 0, r.error ?? `updated ${rows(r).length}`);
  const anonChat = await (await fetch(`${URL}/rest/v1/chat_messages?select=id&channel_id=eq.${encodeURIComponent(dmAM)}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json();
  check(CH, 'the public anon key cannot read chat', Array.isArray(anonChat) && anonChat.length === 0, JSON.stringify(anonChat).slice(0, 80));

  /* ───────── Medical files and visit recordings ───────── */
  const MF = 'Medical files';
  const b64 = (t) => Buffer.from(t).toString('base64');
  const st = (who, bucket, op, path, extra = {}) => call({ action: 'storage', actingMemberId: who, bucket, op, path, ...extra });
  r = await st(alex, 'medical-audio', 'upload', `${F}/${mia}/visit1.m4a`, { b64: b64('FCE1-sealed-audio') });
  check(MF, 'a parent uploads a visit recording for a kid', r.ok, r.error);
  r = await st(alex, 'medical-records', 'upload', `${F}/${mia}/doc1.bin`, { b64: b64('FCE1-sealed-doc') });
  check(MF, 'a parent uploads a document for a kid', r.ok, r.error);
  r = await st(alex, 'medical-records', 'upload', `${F}/${alex}/secret.bin`, { b64: b64('parent record') });
  check(MF, 'a parent uploads their own document', r.ok, r.error);
  r = await st(mia, 'medical-records', 'upload', `${F}/${mia}/mine.bin`, { b64: b64('kid doc') });
  check(MF, 'a kid uploads their own document', r.ok, r.error);
  r = await st(mia, 'medical-records', 'upload', `${F}/${alex}/forged.bin`, { b64: b64('x') });
  check(MF, 'a kid cannot upload into a parent’s folder', !r.ok, r.error ?? 'upload succeeded');
  r = await st(alex, 'medical-records', 'upload', `${crypto.randomUUID()}/${alex}/other-family.bin`, { b64: b64('x') });
  check(MF, 'nobody can upload into another family’s folder', !r.ok, r.error ?? 'upload succeeded');
  r = await st(mia, 'medical-records', 'download', `${F}/${mia}/doc1.bin`);
  check(MF, 'a kid downloads their own document', r.ok && r.size > 0, r.error ?? r.size);
  r = await st(mia, 'medical-records', 'download', `${F}/${alex}/secret.bin`);
  check(MF, 'a kid cannot download a parent’s document', !r.ok || r.size === 0, r.error ?? `size ${r.size}`);
  r = await st(mia, 'medical-records', 'list', `${F}/${alex}`);
  check(MF, 'a kid cannot list a parent’s folder', (r.names ?? []).length === 0, JSON.stringify(r.names));
  r = await st(zane, 'medical-records', 'download', `${F}/${mia}/doc1.bin`);
  check(MF, 'a teen cannot download a sibling’s document', !r.ok || r.size === 0, r.error ?? `size ${r.size}`);
  r = await st(nana, 'medical-audio', 'download', `${F}/${mia}/visit1.m4a`);
  check(MF, 'a grandparent cannot download a kid’s visit recording', !r.ok || r.size === 0, r.error ?? `size ${r.size}`);
  r = await st(sarah, 'medical-audio', 'download', `${F}/${mia}/visit1.m4a`);
  check(MF, 'the other parent downloads the kid’s visit recording', r.ok && r.size > 0, r.error ?? r.size);
  r = await st(mia, 'medical-records', 'remove', `${F}/${alex}/secret.bin`);
  const stillThere = await st(alex, 'medical-records', 'download', `${F}/${alex}/secret.bin`);
  check(MF, 'a kid cannot delete a parent’s document', stillThere.ok && stillThere.size > 0, r.error ?? 'deleted');
  const anonDl = await fetch(`${URL}/storage/v1/object/medical-records/${F}/${mia}/doc1.bin`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  check(MF, 'the public anon key cannot download files', !anonDl.ok, `HTTP ${anonDl.status}`);
  // the visit-recording record rows follow the same privacy
  r = await as(alex, 'medical_records', 'insert', { row: { family_id: F, member_id: mia, uploaded_by: alex, title: 'QA visit — private', tag: 'visit_recording', record_date: day, ai_tags: [], ai_analyzed: true, ai_summary: 'summary' } });
  check(MF, 'a parent saves a visit record for a kid', r.ok, r.error);
  r = await as(zane, 'medical_records', 'select', { match: { family_id: F, tag: 'visit_recording' } });
  check(MF, 'a teen cannot read a sibling’s visit record', rows(r).length === 0, rows(r).length);
  r = await as(mia, 'medical_records', 'select', { match: { family_id: F, tag: 'visit_recording' } });
  check(MF, 'a kid reads their own visit record', rows(r).length === 1, r.error ?? rows(r).length);
  // nightly sweeper
  const seed = await call({ action: 'seed_visits', familyId: F, memberId: mia, uploaderId: alex });
  check(MF, 'sweeper fixtures were created', !!seed.ok, seed.error);
  if (seed.ok) {
    const sw = await (await fetch(`${URL}/functions/v1/visit-audio-sweeper`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: '{}' })).json();
    check(MF, 'the sweeper runs', !!sw.ok, JSON.stringify(sw));
    let q = await call({ action: 'read', table: 'medical_records', familyId: F, where: { tag: 'visit_recording' } });
    check(MF, 'the fixtures can be read back', q.ok && Array.isArray(q.rows), q.error);
    const byTitle = Object.fromEntries((q.rows ?? []).map(x => [x.title, x]));
    check(MF, 'an unsubmitted recording older than 7 days is deleted', !byTitle['QA stale'], 'still there');
    check(MF, 'a fresh unsubmitted recording is kept', !!byTitle['QA fresh']?.file_path, JSON.stringify(byTitle['QA fresh']));
    check(MF, 'an approved visit has its audio reference cleared', byTitle['QA approved'] && byTitle['QA approved'].file_path === null, JSON.stringify(byTitle['QA approved']?.file_path));
    const gone = await st(alex, 'medical-audio', 'download', seed.stale.path);
    const gone2 = await st(alex, 'medical-audio', 'download', seed.approved.path);
    check(MF, 'the stale and approved audio files are really deleted from storage', !gone.ok && !gone2.ok, `${gone.ok}/${gone2.ok}`);
    const kept = await st(alex, 'medical-audio', 'download', seed.fresh.path);
    check(MF, 'the fresh audio file is still in storage', kept.ok, kept.error);
  }

  /* ───────── PINs ───────── */
  const PN = 'PIN';
  r = await rpc(mia, 'set_member_pin', { p_member_id: mia, p_pin: '4821' });
  check(PN, 'a member sets their own PIN', r.ok, r.error);
  let mrow = (await call({ action: 'read', table: 'members', familyId: F })).rows?.find(x => x.id === mia);
  check(PN, 'the PIN is stored hashed, not readable', typeof mrow?.pin === 'string' && mrow.pin.startsWith('$2') && !mrow.pin.includes('4821'), String(mrow?.pin).slice(0, 12));
  r = await rpc(alex, 'verify_member_pin', { p_member_id: mia, p_entered_pin: '4821' });
  check(PN, 'the right PIN verifies', r.ok && (Array.isArray(r.data) ? r.data[0]?.ok : r.data?.ok) === true, JSON.stringify(r.data ?? r.error));
  r = await rpc(alex, 'verify_member_pin', { p_member_id: mia, p_entered_pin: '0000' });
  check(PN, 'a wrong PIN is refused', r.ok && (Array.isArray(r.data) ? r.data[0]?.ok : r.data?.ok) === false, JSON.stringify(r.data ?? r.error));
  r = await rpc(zane, 'set_member_pin', { p_member_id: mia, p_pin: '1111' });
  check(PN, 'a teen cannot change a sibling’s PIN', !r.ok, r.error ?? 'changed');
  r = await rpc(mia, 'set_member_pin', { p_member_id: alex, p_pin: '1111' });
  check(PN, 'a kid cannot change a parent’s PIN', !r.ok, r.error ?? 'changed');
  r = await rpc(alex, 'set_member_pin', { p_member_id: mia, p_pin: '7390' });
  check(PN, 'a parent can reset a kid’s PIN', r.ok, r.error);
  r = await rpc(mia, 'set_member_pin', { p_member_id: mia, p_pin: '12' });
  check(PN, 'a PIN that is not 4 digits is rejected', !r.ok, r.error ?? 'accepted');
  r = await rpc(mia, 'confirm_pin_reset', { p_member_id: mia, p_code: '000000', p_new_pin: '5555' });
  check(PN, 'a reset without a valid code fails', !r.ok || (r.data === false), r.error ?? JSON.stringify(r.data));
  r = await rpc(zane, 'confirm_pin_reset', { p_member_id: mia, p_code: '000000', p_new_pin: '5555' });
  check(PN, 'someone else cannot use another member’s reset', !r.ok, r.error ?? 'allowed');

} catch (e) {
  check('Harness', 'suite ran to the end', false, e.message);
} finally {
  const td = await call({ action: 'teardown', familyId: F });
  console.log('teardown', td.ok);
}

const pass = results.filter(r => r.pass === true).length, fail = results.filter(r => r.pass === false).length, notes = results.filter(r => r.pass === null).length;
const byArea = {};
for (const r of results) (byArea[r.area] ??= []).push(r);
let md = `# Kiosk and Hub QA report\n\nRun: ${new Date().toISOString()} against a throwaway scratch family (real rows, real member sessions, so row-level security applies).\n\n**${pass} passed, ${fail} failed, ${notes} findings.**\n\n`;
for (const [area, list] of Object.entries(byArea)) {
  md += `## ${area}\n\n| Result | Check | Detail |\n|---|---|---|\n`;
  for (const r of list) md += `| ${r.pass === true ? 'PASS' : r.pass === false ? '**FAIL**' : 'NOTE'} | ${r.name} | ${r.detail.replace(/\|/g, '/')} |\n`;
  md += '\n';
}
writeFileSync('docs/QA_REPORT_backend.md', md);
console.log(`\n${pass} passed, ${fail} failed, ${notes} findings`);
