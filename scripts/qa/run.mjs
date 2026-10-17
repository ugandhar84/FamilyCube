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
  if (r.ok) finding(B, 'the database allows a second breakfast on the same day', 'Only the kiosk UI blocks a duplicate meal type per day. Add a unique index on (family_id, week_of, day, type) if it must hold on every client, including the phone.');
  else check(B, 'a second breakfast the same day is blocked', true, '');
  r = await as(mia, 'family_meals', 'select', { match: { family_id: F, week_of: monday(0) } });
  check(B, 'a kid can read this week’s plan', rows(r).length >= 3, r.error ?? rows(r).length);
  r = await as(mia, 'family_meals', 'delete', { match: { family_id: F, type: 'lunch' } });
  if (rows(r).length > 0) finding(B, 'a kid can delete meals at the database level', 'The kiosk hides edit/delete from kids and teens, but the table policy allows it. Tighten family_meals RLS to parents if that matters.');
  else check(B, 'a kid cannot delete meals', true, '');
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
  if (r.ok) finding(C, 'a kid can insert a recipe as already approved', 'The kiosk always sends status "pending" for kids, but the table accepts "approved" from a kid. A check or trigger would make the approval step enforceable.');
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
  if (r.ok) finding(E, 'another kid/teen can mark someone else’s dose', 'toggle_medication_dose accepted a different family member. The kiosk only offers a kid their own doses, but the RPC does not enforce it.');
  else check(E, 'a different teen cannot mark the kid’s dose', true, r.error);
  r = await as(nana, 'family_medications', 'select', { match: { family_id: F } });
  finding(E, `a grandparent can read ${rows(r).length} family medication row(s)`, 'Read access is family-wide at the table level; the apps filter to own medications for kids/teens/seniors client-side.');
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
