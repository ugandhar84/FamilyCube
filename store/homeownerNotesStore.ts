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

export interface HomeownerNote {
  id: string;
  familyId: string;
  title: string;
  notes?: string;
  category: HomeownerNoteCategory;
  dueDate?: string;
  recurEveryDays?: number;
  completedAt?: string;
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
  createdAt: string;
  updatedAt: string;
}

interface HomeownerNotesState {
  notes: HomeownerNote[];
  isLoading: boolean;
  loadNotes: (familyId: string) => Promise<void>;
  addNote: (params: {
    familyId: string; title: string; notes?: string; category: HomeownerNoteCategory;
    dueDate?: string; recurEveryDays?: number; serialNumber?: string;
    purchaseDate?: string; warrantyExpiresDate?: string;
    vendorName?: string; vendorPhone?: string; vendorNotes?: string;
    costCents?: number; priority?: HomeownerNotePriority; room?: string; tags?: string[];
    createdBy: string;
  }) => Promise<{ error?: string }>;
  updateNote: (id: string, patch: Partial<Pick<HomeownerNote,
    'title' | 'notes' | 'category' | 'dueDate' | 'recurEveryDays' | 'serialNumber' |
    'purchaseDate' | 'warrantyExpiresDate' | 'vendorName' | 'vendorPhone' | 'vendorNotes' |
    'costCents' | 'priority' | 'room' | 'tags'
  >>) => Promise<{ error?: string }>;
  completeNote: (id: string) => Promise<{ error?: string }>;
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
    completedAt: row.completed_at ?? undefined,
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

  addNote: async ({ familyId, title, notes, category, dueDate, recurEveryDays, serialNumber,
    purchaseDate, warrantyExpiresDate, vendorName, vendorPhone, vendorNotes, costCents, priority, room, tags, createdBy }) => {
    const { data, error } = await supabase.from('homeowner_notes').insert({
      family_id: familyId, title, notes: notes ?? null, category,
      due_date: dueDate ?? null, recur_every_days: recurEveryDays ?? null,
      serial_number: serialNumber ?? null, purchase_date: purchaseDate ?? null,
      warranty_expires_date: warrantyExpiresDate ?? null,
      vendor_name: vendorName ?? null, vendor_phone: vendorPhone ?? null, vendor_notes: vendorNotes ?? null,
      cost_cents: costCents ?? null, priority: priority ?? 'normal', room: room ?? null,
      tags: tags ?? [], created_by: createdBy,
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
    const { data, error } = await supabase.from('homeowner_notes').update(dbPatch).eq('id', id).select().single();
    if (error) return { error: error.message };
    set(s => ({ notes: s.notes.map(n => n.id === id ? mapNote(data) : n) }));
    return {};
  },

  completeNote: async (id: string) => {
    const note = get().notes.find(n => n.id === id);
    if (!note) return { error: 'Note not found' };

    if (note.recurEveryDays) {
      const base = note.dueDate ? new Date(note.dueDate).getTime() : Date.now();
      const nextDue = new Date(base + note.recurEveryDays * 24 * 3600_000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from('homeowner_notes')
        .update({ due_date: nextDue, completed_at: null, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) return { error: error.message };
      set(s => ({ notes: s.notes.map(n => n.id === id ? mapNote(data) : n) }));
      return {};
    }

    const { data, error } = await supabase.from('homeowner_notes')
      .update({ completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).select().single();
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
