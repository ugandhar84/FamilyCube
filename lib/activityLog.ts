import { supabase } from '@/lib/supabase';

// ─── Shared activity log — events AND chores ───────────────────────────────
// One append-only audit trail, one log-trail sheet UI, covering both entity
// types via `entityType` rather than duplicating the whole mechanism per
// feature. Every write here is fire-and-forget: a failed log write must
// never block or fail the underlying mutation the user is actually waiting
// on — logging is a side effect, not a precondition.
export type ActivityEntityType = 'event' | 'chore';

export type ActivityAction =
  | 'created' | 'deleted'
  | 'date_changed' | 'time_changed' | 'recurrence_changed' | 'recurrence_cancelled'
  | 'driver_assigned' | 'driver_reassigned' | 'driver_removed'
  | 'gp_welcome_changed' | 'teen_welcome_changed'
  | 'notes_changed'
  | 'claimed' | 'submitted' | 'approved' | 'declined' | 'reassigned'
  | 'status_changed' | 'reward_changed' | 'due_date_changed'
  | 'redo_disputed' | 'redo_dispute_resolved'
  | 'other';

// Who/what made a change when it was not a plain tap: set while Ask Cube applies a confirmed draft, so the history reads
// "Time changed by Ugandhar via Cube AI". Cleared shortly after, because the log writes are fire-and-forget.
let changeSource: string | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
export function setChangeSource(source: string | null, holdMs = 2500) {
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  changeSource = source;
  if (source) clearTimer = setTimeout(() => { changeSource = null; clearTimer = null; }, holdMs);
}

export function logActivity(entry: {
  entityType: ActivityEntityType;
  entityId: string;
  familyId: string | undefined | null;
  actorId: string | undefined | null;
  action: ActivityAction;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string;
}) {
  if (!entry.familyId) return;
  supabase.from('activity_log').insert({
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    family_id: entry.familyId,
    actor_id: entry.actorId ?? null,
    action: entry.action,
    field: entry.field ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
    note: entry.note ?? null,
    source: changeSource,
  }).then(({ error }) => {
    if (error) console.warn('[activityLog] insert failed', error.message);
  });
}

export interface ActivityLogRow {
  id: string;
  entityId: string;
  actorId: string | null;
  action: ActivityAction;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  source: string | null;
  createdAt: string;
}

export async function fetchActivityLog(entityType: ActivityEntityType, entityId: string, limit = 50): Promise<ActivityLogRow[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.warn('[activityLog] fetch failed', error.message); return []; }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    entityId: row.entity_id,
    actorId: row.actor_id,
    action: row.action,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    note: row.note,
    source: row.source ?? null,
    createdAt: row.created_at,
  }));
}
