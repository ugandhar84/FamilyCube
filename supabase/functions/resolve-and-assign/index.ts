// FamilyCube — Edge Function: resolve-and-assign
// Responsibility Engine — end-to-end orchestrator, tying together Phase 4
// (AI extraction), Phase 5 (place resolution), and Phase 2/3 (assignment)
// into the spec's single soccer+grocery flow:
//   1. Extract task/errand from free text (family-ai/extract_responsibility)
//   2. Resolve any store/place name to a locations row (best-effort —
//      see the honest limitation noted below)
//   3. Create the chore_tasks/calendar_events/errands row(s)
//   4. Call process-task-assignment or process-kid-chore-assignment to
//      decide AUTO/SUGGEST/ASK
//   5. Return everything so the client can render the "Combined UI" from
//      the spec in one screen
//
// HONEST LIMITATION: this app's only Maps integration (maps-autocomplete)
// is Apple Maps place-name SEARCH — it returns a name/address, no lat/lng,
// no driving route/ETA/distance. There is no routing/geocoding API wired up
// anywhere in this codebase. Step 2 therefore creates a `locations` row
// with name/address only (latitude/longitude left null) — it does NOT
// compute "incremental burden" (extra driving minutes), because there is no
// real data source for that today. route_context stays empty until a real
// routing API is added; process-task-assignment already treats a missing
// route signal as neutral (not penalized), so this doesn't break scoring —
// it just means the route/context score component is a placeholder until
// Phase 5 gets real routing infrastructure, which is out of scope for what
// currently exists in this app.
//
// Deploy: supabase functions deploy resolve-and-assign
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { text, familyId, createdById, dryRun = false } = body as {
      text?: string; familyId?: string; createdById?: string; dryRun?: boolean;
    };
    if (!text || !familyId) return json({ error: 'text and familyId are required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── 1. Load family members for name-matching context ─────────────────
    const { data: memberRows } = await supabase
      .from('members')
      .select('id, name, role')
      .filter('family_id', 'eq', familyId);
    const members = memberRows ?? [];

    // ── 2. Extract via family-ai ──────────────────────────────────────────
    const extractRes = await fetch(`${SUPABASE_URL}/functions/v1/family-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ action: 'extract_responsibility', text, existingMembers: members }),
    });
    if (!extractRes.ok) throw new Error(`family-ai extraction failed: ${extractRes.status}`);
    const extractData = await extractRes.json();
    const extracted = extractData?.result ?? { task: null, errand: null, ambiguous: true };

    if (extracted.ambiguous && !extracted.task && !extracted.errand) {
      return json({ status: 'ambiguous', extracted, message: 'Could not confidently extract a task or errand from this input — ask the user to clarify.' });
    }

    const result: Record<string, unknown> = { extracted, created: {}, decisions: {} };

    // ── 3. Resolve errand's store, if any (place SEARCH only — see header) ──
    let locationId: string | null = null;
    if (extracted.errand?.storeName && !dryRun) {
      // Reuse an already-resolved location with the same name for this
      // family rather than creating a duplicate row every time "Kroger"
      // comes up again.
      const { data: existingLoc } = await supabase
        .from('locations')
        .select('id')
        .eq('family_id', familyId)
        .eq('name', extracted.errand.storeName)
        .maybeSingle();

      if (existingLoc) {
        locationId = existingLoc.id;
      } else {
        const { data: newLoc, error: locErr } = await supabase
          .from('locations')
          .insert({ family_id: familyId, name: extracted.errand.storeName, provider: 'manual_entry' })
          .select('id')
          .single();
        if (!locErr) locationId = newLoc?.id ?? null;
      }
    }

    // ── 4. Create the task (chore) if extracted ────────────────────────────
    if (extracted.task && !dryRun) {
      const forMember = extracted.task.forMemberName
        ? members.find((m: any) => m.name?.toLowerCase().includes(extracted.task.forMemberName.toLowerCase()))
        : null;

      // chore_tasks.id has no DB-side default (ids are normally generated
      // client-side in the app, e.g. `${Date.now()}-${random}`) — supply
      // one explicitly rather than relying on a default that doesn't exist.
      const choreId = `${Date.now()}-${crypto.randomUUID().slice(0, 12)}`;
      const { data: chore, error: choreErr } = await supabase
        .from('chore_tasks')
        .insert({
          id: choreId,
          family_id: familyId,
          title: extracted.task.title,
          category: extracted.task.category,
          category_type: 'routine',
          status: 'todo',
          created_by_id: createdById ?? null,
          assigned_to_id: forMember?.id ?? null,
          due_date: extracted.task.startAt ? extracted.task.startAt.slice(0, 10) : null,
          due_time: extracted.task.startAt ? extracted.task.startAt.slice(11, 16) : null,
          coins_reward: 0,
          xp_reward: 0,
        })
        .select('id')
        .single();
      if (choreErr) throw choreErr;
      (result.created as any).chore = chore;

      // Only run the assignment engine if nobody was explicitly named — a
      // task with an explicit "for Emma" already has its answer, no need
      // to score candidates for it.
      if (!forMember?.id) {
        // Adult-vs-kid routing now reads the real taxonomy (usually_adult_task)
        // instead of a hardcoded 2-item guess — extracted.task.category is
        // family-ai's domain-only extraction (e.g. "medical"), matched
        // against responsibility_categories.domain. Falls back to
        // kid-eligible when the category isn't recognized, since an
        // unmatched category shouldn't silently block a routine kid chore.
        const { data: catRow } = await supabase
          .from('responsibility_categories')
          .select('usually_adult_task')
          .eq('domain', extracted.task.category)
          .eq('active', true)
          .limit(1)
          .maybeSingle();
        const isAdultCategory = catRow?.usually_adult_task ?? false;
        const assignFn = isAdultCategory ? 'process-task-assignment' : 'process-kid-chore-assignment';
        const assignBody = isAdultCategory
          ? { taskId: chore.id, taskType: 'chore', familyId, category: extracted.task.category }
          : { choreId: chore.id, familyId };
        const assignRes = await fetch(`${SUPABASE_URL}/functions/v1/${assignFn}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify(assignBody),
        });
        (result.decisions as any).task = assignRes.ok ? await assignRes.json() : { error: `${assignFn} failed: ${assignRes.status}` };
      }
    }

    // ── 5. Create the errand if extracted ──────────────────────────────────
    if (extracted.errand && !dryRun) {
      const { data: errand, error: errandErr } = await supabase
        .from('errands')
        .insert({
          family_id: familyId,
          title: extracted.errand.storeName
            ? `${extracted.errand.category} — ${extracted.errand.storeName}`
            : extracted.errand.category,
          category: extracted.errand.category,
          location_id: locationId,
          status: 'pending',
        })
        .select('id')
        .single();
      if (errandErr) throw errandErr;
      (result.created as any).errand = errand;

      if (extracted.errand.items?.length) {
        await supabase.from('errand_items').insert(
          extracted.errand.items.map((name: string) => ({ errand_id: errand.id, item_name: name }))
        );
      }

      // Errands default to adult scoring (no kid-errand model in this
      // engine — errands as a rewarded KID activity already goes through
      // chore_tasks/category_type=shopping, a different path).
      //
      // extracted.errand.category is a bare subcategory (e.g. 'dry_cleaning',
      // matching errands.category's own CHECK constraint — see family-ai's
      // errandSubcategories). process-task-assignment's category lookup
      // matches on responsibility_categories.id OR .domain, neither of
      // which a bare subcategory string satisfies on its own — pass the
      // full 'errand.<subcategory>' id instead, which does match .id.
      const assignRes = await fetch(`${SUPABASE_URL}/functions/v1/process-task-assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ taskId: errand.id, taskType: 'errand', familyId, category: `errand.${extracted.errand.category}` }),
      });
      (result.decisions as any).errand = assignRes.ok ? await assignRes.json() : { error: `process-task-assignment failed: ${assignRes.status}` };
    }

    result.status = 'ok';
    result.dryRun = dryRun;
    return json(result);

  } catch (err: any) {
    console.error('[resolve-and-assign] fatal:', err);
    return json({ error: err.message ?? String(err) }, 500);
  }
});
