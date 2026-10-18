/**
 * useStickyNotes — the family's sticky notes (family_sticky_notes), shared by the phone Hub card and the
 * kiosk Home card. Anyone can write one (100 characters) and choose who sees it; no one chosen means
 * everyone. A member sees notes they wrote, notes shared with them, and notes for everyone.
 * The author or a parent can remove a note. Stays live through realtime.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';

export const NOTE_MAX = 100;
export type NoteColor = 'amber' | 'sage' | 'lavender' | 'peach';
export const NOTE_COLORS: NoteColor[] = ['amber', 'sage', 'lavender', 'peach'];

export interface StickyNote {
  id: string; author_id: string; body: string; color: string; created_at: string; recipient_ids: string[] | null;
}

export function useStickyNotes(active: FamilyMember, members: FamilyMember[]) {
  const familyId = (members[0] as any)?.familyId as string | undefined;
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const load = useCallback(async () => {
    if (!familyId) return;
    // Filter to what THIS profile may see on the server, so the 8-note cap counts only notes they can see. (The cap used to be applied
    // first and the filter after, so notes meant for someone else on the same phone could crowd yours out.)
    const { data } = await supabase.from('family_sticky_notes').select('*').eq('family_id', familyId)
      .or(`author_id.eq.${active.id},recipient_ids.is.null,recipient_ids.eq.{},recipient_ids.cs.{${active.id}}`)
      .order('created_at', { ascending: false }).limit(8);
    if (data) setNotes((data as StickyNote[]).filter(n => n.author_id === active.id || !n.recipient_ids?.length || n.recipient_ids.includes(active.id)));
  }, [familyId, active.id]);
  useEffect(() => {
    load();
    const ch = supabase.channel(`sticky_notes_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_sticky_notes' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  const add = async (body: string, color: NoteColor, to: string[]) => {
    const text = body.trim().slice(0, NOTE_MAX);
    if (!text || !familyId) return false;
    const { error } = await supabase.from('family_sticky_notes').insert({ family_id: familyId, author_id: active.id, body: text, color, recipient_ids: to });
    if (!error) {
      load();
      // Push only the people it was shared with. A note for Everyone sends no push; it just shows on their Home.
      const targets = to;
      if (targets.length) {
        supabase.functions.invoke('family-notifier', {
          body: { type: 'sticky_note', familyId, memberIds: targets, persist: true, excludeMemberId: active.id, payload: { authorName: active.name?.trim().split(' ')[0], body: text } },
        }).catch(e => console.warn('[useStickyNotes] notify failed:', e?.message));
      }
    }
    return !error;
  };
  const remove = async (n: StickyNote) => { await supabase.from('family_sticky_notes').delete().eq('id', n.id); setNotes(p => p.filter(x => x.id !== n.id)); };
  const canRemove = (n: StickyNote) => active.role === 'parent' || n.author_id === active.id;
  return { notes, add, remove, canRemove };
}

/** "Oct 17 · 5:00 PM" — when the note was posted. */
export function noteStamp(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day} · ${time}`;
}
