/**
 * homeownerNotesStore — parent-only general home maintenance tasks/notes.
 * Replaces the earlier Smart Hub feature (thermostat vendor integration),
 * which stayed blocked on Ecobee's developer program being closed with no
 * working vendor ever wired up — this covers the same "don't forget
 * maintenance" need without depending on any smart device or OAuth vendor.
 */
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type HomeownerNoteCategory = 'general' | 'hvac' | 'plumbing' | 'electrical' | 'appliance' | 'exterior' | 'safety' | 'warranty';
export type HomeownerNotePriority = 'low' | 'normal' | 'high';

// How many days before dueDate the reminder notification fires — null/
// undefined means no reminder set. Only meaningful when dueDate is also
// set; checked by homeowner-reminder-notifier (supabase/functions) on a
// daily cron sweep, same "days-before" pattern as nothing else in this
// app currently has — closest cousin is chore-deadline-notifier's
// minutes-before-due windows, but this is a coarser day-granularity lead
// time [live-requested: "I see reminder setting call alert for 1d, 2d,
// 1wk setting on the create and edit"].
export type ReminderLeadDays = 1 | 2 | 7 | 15 | 30;

export interface HomeownerNote {
  id: string;
  familyId: string;
  title: string;
  notes?: string;
  category: HomeownerNoteCategory;
  dueDate?: string;
  recurEveryDays?: number;
  reminderDaysBefore?: ReminderLeadDays;
  reminderSentAt?: string;
  completedAt?: string;
  // Free-text note captured at completion time [live-requested: "while
  // clicking on complete we should ask for the confirmation swith
  // comments text"] — e.g. "used ABC HVAC, cost $180."
  completionNotes?: string;
  photoUrl?: string;
  serialNumber?: string;
  // Purchase/install date and warranty/guarantee expiration — most useful
  // on 'warranty' and 'appliance' category entries, but not restricted to
  // them since a general item can still carry a manufacturer guarantee.
  purchaseDate?: string;
  warrantyExpiresDate?: string;
  // Who to call — a contractor/vendor tied to this item (e.g. "ABC HVAC",
  // their phone, and any free-form notes like "ask for Mike, does our AC
  // every year").
  vendorName?: string;
  vendorPhone?: string;
  vendorNotes?: string;
  costCents?: number;
  priority: HomeownerNotePriority;
  room?: string;
  tags: string[];
  createdBy: string;
  // Who this task/note is assigned to — defaults to createdBy but
  // reassignable to any family member via the Add/Edit forms' "Assigned
  // to" dropdown [live-requested: "should be able to assign to the
  // persons, show dropdown of these persons"].
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

interface HomeownerNotesState {
  notes: HomeownerNote[];
  isLoading: boolean;
  loadNotes: (familyId: string) => Promise<void>;
  addNote: (params: {
    familyId: string; title: string; notes?: string; category: HomeownerNoteCategory;
    dueDate?: string; recurEveryDays?: number; reminderDaysBefore?: ReminderLeadDays; serialNumber?: string;
    purchaseDate?: string; warrantyExpiresDate?: string;
    vendorName?: string; vendorPhone?: string; vendorNotes?: string;
    costCents?: number; priority?: HomeownerNotePriority; room?: string; tags?: string[];
    assignedTo?: string;
    createdBy: string;
  }) => Promise<{ error?: string }>;
  updateNote: (id: string, patch: Partial<Pick<HomeownerNote,
    'title' | 'notes' | 'category' | 'dueDate' | 'recurEveryDays' | 'reminderDaysBefore' | 'serialNumber' |
    'purchaseDate' | 'warrantyExpiresDate' | 'vendorName' | 'vendorPhone' | 'vendorNotes' |
    'costCents' | 'priority' | 'room' | 'tags' | 'assignedTo'
  >>) => Promise<{ error?: string }>;
  completeNote: (id: string, completionComment?: string) => Promise<{ error?: string }>;
  // True once the due date is within a week away or already past — the
  // window in which the "Complete" action is actually enabled
  // [live-requested: "we should not allow user to click complete until
  // that date comes or date minus a week"]. A note with no due date is
  // always eligible (nothing to gate against).
  isNoteCompletable: (note: HomeownerNote) => boolean;
  deleteNote: (id: string) => Promise<{ error?: string }>;
}

function mapNote(row: any): HomeownerNote {
  return {
    id: row.id,
    familyId: row.family_id,
    title: row.title,
    notes: row.notes ?? undefined,
    category: row.category,
    dueDate: row.due_date ?? undefined,
    recurEveryDays: row.recur_every_days ?? undefined,
    reminderDaysBefore: row.reminder_days_before ?? undefined,
    reminderSentAt: row.reminder_sent_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    completionNotes: row.completion_notes ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    serialNumber: row.serial_number ?? undefined,
    purchaseDate: row.purchase_date ?? undefined,
    warrantyExpiresDate: row.warranty_expires_date ?? undefined,
    vendorName: row.vendor_name ?? undefined,
    vendorPhone: row.vendor_phone ?? undefined,
    vendorNotes: row.vendor_notes ?? undefined,
    costCents: row.cost_cents ?? undefined,
    priority: row.priority ?? 'normal',
    room: row.room ?? undefined,
    tags: row.tags ?? [],
    createdBy: row.created_by,
    assignedTo: row.assigned_to ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const useHomeownerNotesStore = create<HomeownerNotesState>((set, get) => ({
  notes: [],
  isLoading: false,

  loadNotes: async (familyId: string) => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('homeowner_notes')
      .select('*')
      .eq('family_id', familyId)
      .order('due_date', { ascending: true, nullsFirst: false });
    if (error) {
      console.warn('[homeownerNotesStore] loadNotes failed:', error.message);
      set({ isLoading: false });
      return;
    }
    set({ notes: (data ?? []).map(mapNote), isLoading: false });
  },

  addNote: async ({ familyId, title, notes, category, dueDate, recurEveryDays, reminderDaysBefore, serialNumber,
    purchaseDate, warrantyExpiresDate, vendorName, vendorPhone, vendorNotes, costCents, priority, room, tags, assignedTo, createdBy }) => {
    const { data, error } = await supabase.from('homeowner_notes').insert({
      family_id: familyId, title, notes: notes ?? null, category,
      due_date: dueDate ?? null, recur_every_days: recurEveryDays ?? null,
      reminder_days_before: reminderDaysBefore ?? null,
      serial_number: serialNumber ?? null, purchase_date: purchaseDate ?? null,
      warranty_expires_date: warrantyExpiresDate ?? null,
      vendor_name: vendorName ?? null, vendor_phone: vendorPhone ?? null, vendor_notes: vendorNotes ?? null,
      cost_cents: costCents ?? null, priority: priority ?? 'normal', room: room ?? null,
      tags: tags ?? [], created_by: createdBy, assigned_to: assignedTo ?? createdBy,
    }).select().single();
    if (error) return { error: error.message };
    set(s => ({ notes: [...s.notes, mapNote(data)] }));
    return {};
  },

  updateNote: async (id, patch) => {
    const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.category !== undefined) dbPatch.category = patch.category;
    if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate;
    if (patch.recurEveryDays !== undefined) dbPatch.recur_every_days = patch.recurEveryDays;
    // Changing dueDate or the lead time invalidates whatever reminder may
    // already have fired for the OLD date — reset reminder_sent_at so the
    // sweep can fire again for the new target date instead of staying
    // silently suppressed forever.
    if (patch.reminderDaysBefore !== undefined) {
      dbPatch.reminder_days_before = patch.reminderDaysBefore;
      dbPatch.reminder_sent_at = null;
    }
    if (patch.dueDate !== undefined) dbPatch.reminder_sent_at = null;
    if (patch.serialNumber !== undefined) dbPatch.serial_number = patch.serialNumber;
    if (patch.purchaseDate !== undefined) dbPatch.purchase_date = patch.purchaseDate;
    if (patch.warrantyExpiresDate !== undefined) dbPatch.warranty_expires_date = patch.warrantyExpiresDate;
    if (patch.vendorName !== undefined) dbPatch.vendor_name = patch.vendorName;
    if (patch.vendorPhone !== undefined) dbPatch.vendor_phone = patch.vendorPhone;
    if (patch.vendorNotes !== undefined) dbPatch.vendor_notes = patch.vendorNotes;
    if (patch.costCents !== undefined) dbPatch.cost_cents = patch.costCents;
    if (patch.priority !== undefined) dbPatch.priority = patch.priority;
    if (patch.room !== undefined) dbPatch.room = patch.room;
    if (patch.tags !== undefined) dbPatch.tags = patch.tags;
    if (patch.assignedTo !== undefined) dbPatch.assigned_to = patch.assignedTo;
    const { data, error } = await supabase.from('homeowner_notes').update(dbPatch).eq('id', id).select().single();
    if (error) return { error: error.message };
    set(s => ({ notes: s.notes.map(n => n.id === id ? mapNote(data) : n) }));
    return {};
  },

  isNoteCompletable: (note: HomeownerNote) => {
    if (!note.dueDate) return true;
    const due = new Date(note.dueDate).getTime();
    const eligibleFrom = due - 7 * 24 * 3600_000;
    return Date.now() >= eligibleFrom;
  },

  completeNote: async (id: string, completionComment?: string) => {
    const note = get().notes.find(n => n.id === id);
    if (!note) return { error: 'Note not found' };
    if (!get().isNoteCompletable(note)) {
      return { error: "This isn't due yet — it can be marked complete starting one week before its due date." };
    }
    const completionNotes = completionComment?.trim() || null;

    if (note.recurEveryDays) {
      const base = note.dueDate ? new Date(note.dueDate).getTime() : Date.now();
      const nextDue = new Date(base + note.recurEveryDays * 24 * 3600_000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from('homeowner_notes')
        .update({ due_date: nextDue, completed_at: null, completion_notes: completionNotes, reminder_sent_at: null, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) return { error: error.message };
      set(s => ({ notes: s.notes.map(n => n.id === id ? mapNote(data) : n) }));
      return {};
    }

    const { data, error } = await supabase.from('homeowner_notes')
      .update({ completed_at: new Date().toISOString(), completion_notes: completionNotes, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) return { error: error.message };
    set(s => ({ notes: s.notes.map(n => n.id === id ? mapNote(data) : n) }));
    return {};
  },

  deleteNote: async (id: string) => {
    const { error } = await supabase.from('homeowner_notes').delete().eq('id', id);
    if (error) return { error: error.message };
    set(s => ({ notes: s.notes.filter(n => n.id !== id) }));
    return {};
  },
}));
