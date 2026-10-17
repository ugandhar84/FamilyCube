/**
 * KioskHomeWidgets — the cards the kiosk Home shares between parent and kid:
 *   · FamilyNowCard  — where everyone is, from member_locations (decrypted), with check-in and battery
 *   · HomeChatsCard  — channels with unread counts and the last message; tap opens that thread in Chat
 *   · HomeMedsCard   — today's medication doses (a kid sees only their own) with a Taken button
 *   · StickyNotesCard— notes anyone writes for chosen people (family_sticky_notes); the author or a parent can remove
 *   · HomeMemoriesCard — the latest memory
 * Each reads its own data and is read-only except the Taken button and the notes.
 * Sticky notes: anyone can write one and choose who it is shared with (no one chosen = everyone).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, Image } from 'react-native';
import { Plus, X, MessageCircle, MapPin, StickyNote } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { decryptLocationText } from '@/lib/locationCrypto';
import { useChatStore, dmChannelId } from '@/store/chatStore';
import { useKioskNavStore } from '@/store/kioskNavStore';
import { todayLocal } from '@/lib/dates';
import { encodeTakenEntry, formatDoseTime } from '@/features/vault/tabs/health/types';
import type { Medication } from '@/features/vault/tabs/health/types';
import type { FamilyMember } from '@/store/familyStore';
import { showToast } from '@/components/AppToast';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { KioskAvatar } from './KioskAvatar';
import { KioskFormDrawer } from './KioskFormDrawer';
import { Eyebrow, firstName } from './KioskHomeParts';
import { useKioskPhotos } from '../useKioskPhotos';
import { KIOSK_FONT } from '../kioskFonts';

const STATUS: Record<string, string> = { at_home: 'Home', at_school: 'School', at_work: 'Work', in_transit: 'On the move', at_activity: 'Activity' };

function Card({ children }: { children: React.ReactNode }) {
  const { k } = useKioskColors();
  return <View style={[s.card, { backgroundColor: k.card, borderColor: k.cardBorder }]}>{children}</View>;
}

/* ───────── Family now (GPS) ───────── */
export function FamilyNowCard({ members, onOpenMap }: { members: FamilyMember[]; onOpenMap: () => void }) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const [rows, setRows] = useState<Record<string, any>>({});
  const load = useCallback(async () => {
    const { data } = await supabase.from('member_locations').select('*').order('member_id');
    if (!data) return;
    const dec = await Promise.all((data as any[]).map(async r => ({ ...r, neighborhood: r.neighborhood ? await decryptLocationText(r.member_id, r.neighborhood) : r.neighborhood })));
    setRows(Object.fromEntries(dec.map(r => [r.member_id, r])));
  }, []);
  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase.channel(`home_locs_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, () => { if (t) clearTimeout(t); t = setTimeout(load, 500); }).subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [load]);
  const people = members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending');
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow label="FAMILY NOW" accent={k.sage} k={k} />
      <Card>
        {people.map((m, i) => {
          const loc = rows[m.id];
          const shared = loc && loc.share_location_enabled !== false;
          const place = shared ? (loc.neighborhood || loc.status_text || STATUS[loc.status] || 'Somewhere') : 'Location not shared';
          const ago = loc?.last_updated ? Math.max(0, Math.round((Date.now() - new Date(loc.last_updated).getTime()) / 60000)) : null;
          return (
            <View key={m.id} style={s.row}>
              <KioskAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={32} bgColor={pastels[i % 4].card} k={k} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.name, { color: k.text }]} numberOfLines={1}>{firstName(m)} · {shared ? (STATUS[loc.status] ?? 'Out') : '—'}</Text>
                <Text style={[s.sub, { color: k.textMuted }]} numberOfLines={1}>{place}{shared && ago != null ? ` · ${ago < 2 ? 'just now' : ago < 90 ? `${ago} min ago` : 'a while ago'}` : ''}</Text>
              </View>
              {shared && loc.battery_level != null && <Text style={[s.sub, { color: loc.battery_level <= 20 ? k.danger : k.textMuted }]}>🔋{loc.battery_level}%</Text>}
            </View>
          );
        })}
        <Pressable onPress={onOpenMap} accessibilityRole="button" style={[s.btn, { backgroundColor: k.well }]}><MapPin size={16} color={k.text} /><Text style={[s.btnT, { color: k.text }]}>Open the map</Text></Pressable>
      </Card>
    </View>
  );
}

/* ───────── Chats ───────── */
export function HomeChatsCard({ active, members }: { active: FamilyMember; members: FamilyMember[] }) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const unread = useChatStore(st => st.unreadCounts);
  const channels = useChatStore(st => st.channels);
  const loadUnread = useChatStore(st => st.loadUnreadCounts);
  const entries = useMemo(() => {
    const dms = members.filter(m => m.id !== active.id && !m.deletedAt && m.inviteStatus !== 'pending')
      .map(m => ({ id: dmChannelId(active.id, m.id), label: firstName(m), dm: m.id }));
    return [{ id: 'all', label: 'Family', dm: null as string | null }, ...(active.role === 'parent' ? [{ id: 'parents', label: 'Parents', dm: null }] : []), ...dms];
  }, [members, active.id, active.role]);
  useEffect(() => { loadUnread(entries.map(e => e.id), active.id); }, [entries, active.id, loadUnread]);
  const total = entries.reduce((n, e) => n + (unread[e.id] ?? 0), 0);
  const shown = [...entries].sort((a, b) => (unread[b.id] ?? 0) - (unread[a.id] ?? 0)).slice(0, 4);
  const open = (e: { dm: string | null }) => { if (e.dm) useKioskNavStore.getState().setPendingDm(e.dm); useKioskNavStore.getState().setPendingTab('chat'); };
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow label="CHATS" accent={k.primary} k={k} right={total ? `${total} unread` : 'all read'} />
      <Card>
        {shown.map((e, i) => {
          const last = channels[e.id]?.messages?.slice(-1)[0];
          const u = unread[e.id] ?? 0;
          return (
            <Pressable key={e.id} onPress={() => open(e)} accessibilityRole="button" accessibilityLabel={`${e.label}${u ? `, ${u} unread` : ''}`} style={s.row}>
              <View style={[s.chatIc, { backgroundColor: pastels[i % 4].card }]}><MessageCircle size={16} color={pastels[i % 4].fg} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.name, { color: k.text }]} numberOfLines={1}>{e.label}</Text>
                <Text style={[s.sub, { color: k.textMuted }]} numberOfLines={1}>{last ? (last.text || 'Photo') : 'No messages yet'}</Text>
              </View>
              {u > 0 && <View style={[s.badge, { backgroundColor: k.primary }]}><Text style={[s.badgeT, { color: k.onPrimary }]}>{u > 9 ? '9+' : u}</Text></View>}
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}

/* ───────── Medications today ───────── */
export function HomeMedsCard({ active, members, ownOnly }: { active: FamilyMember; members: FamilyMember[]; ownOnly: boolean }) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const familyId = (members[0] as any)?.familyId as string | undefined;
  const [meds, setMeds] = useState<Medication[]>([]);
  const load = useCallback(async () => {
    if (!familyId) return;
    let q = supabase.from('family_medications').select('*').eq('family_id', familyId).eq('is_active', true);
    if (ownOnly) q = q.eq('member_id', active.id);
    const { data } = await q;
    if (data) setMeds(data as Medication[]);
  }, [familyId, ownOnly, active.id]);
  useEffect(() => { load(); const t = setInterval(load, 120_000); return () => clearInterval(t); }, [load]);
  const today = todayLocal();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const doses = meds.flatMap(m => (m.frequency_times?.length ? m.frequency_times : ['08:00']).map(t => {
    const multi = (m.frequency_times?.length ?? 1) > 1;
    const set = new Set(m.taken_dates ?? []);
    const taken = set.has(encodeTakenEntry(today, multi ? t : null)) || (!multi && (m.taken_date === today || set.has(today)));
    const [h, mm] = t.split(':').map(Number);
    return { m, t, multi, taken, late: !taken && h * 60 + mm + 30 < nowMin };
  })).sort((a, b) => a.t.localeCompare(b.t));
  const take = async (d: typeof doses[number]) => {
    const { error } = await supabase.rpc('toggle_medication_dose', { p_med_id: d.m.id, p_entry: encodeTakenEntry(today, d.multi ? d.t : null), p_mark_taken: true, p_today: today, p_modified_by: active.id });
    if (error) { showToast('Could not update the dose'); return; }
    showToast(`${d.m.name} marked taken`); load();
  };
  const pending = doses.filter(d => !d.taken);
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow label="MEDICATIONS TODAY" accent={k.terracotta} k={k} right={doses.length ? `${doses.length - pending.length}/${doses.length} taken` : undefined} />
      <Card>
        {doses.length === 0 ? <Text style={[s.sub, { color: k.textMuted }]}>No medications today.</Text> : doses.slice(0, 6).map((d, i) => {
          const who = members.find(x => x.id === d.m.member_id);
          return (
            <View key={`${d.m.id}-${d.t}`} style={s.row}>
              <KioskAvatar name={who?.name ?? ''} emoji={who?.emoji} avatarUrl={who?.avatarUrl} size={30} bgColor={pastels[i % 4].card} k={k} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.name, { color: k.text }]} numberOfLines={1}>{d.m.name} {d.m.dosage} {d.m.dosage_unit}</Text>
                <Text style={[s.sub, { color: k.textMuted }]} numberOfLines={1}>{ownOnly ? '' : `${firstName(who)} · `}{formatDoseTime(d.t)}</Text>
              </View>
              {d.taken ? <View style={[s.pill, { backgroundColor: k.pastelSageCard }]}><Text style={[s.pillT, { color: k.sage }]}>✓ Taken</Text></View>
                : <Pressable onPress={() => take(d)} accessibilityRole="button" accessibilityLabel={`Mark ${d.m.name} taken`} style={[s.take, { backgroundColor: d.late ? k.danger : k.sage }]}><Text style={[s.btnT, { color: k.onAccent }]}>{d.late ? 'Overdue · Taken' : 'Taken'}</Text></Pressable>}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

/* ───────── Sticky notes ───────── */
interface Note { id: string; author_id: string; body: string; color: string; created_at: string; recipient_ids: string[] | null }
export function StickyNotesCard({ active, members }: { active: FamilyMember; members: FamilyMember[] }) {
  const { k } = useKioskColors();
  const familyId = (members[0] as any)?.familyId as string | undefined;
  const isParent = active.role === 'parent';
  const [to, setTo] = useState<string[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [color, setColor] = useState('amber');
  const tones: Record<string, { bg: string; fg: string }> = { amber: { bg: k.pastelAmberCard, fg: k.gold }, sage: { bg: k.pastelSageCard, fg: k.sage }, lavender: { bg: k.pastelLavCard, fg: k.purple }, peach: { bg: k.pastelPrimaryCard, fg: k.terracotta } };
  const load = useCallback(async () => {
    if (!familyId) return;
    const { data } = await supabase.from('family_sticky_notes').select('*').eq('family_id', familyId).order('created_at', { ascending: false }).limit(8);
    // Visible to its author, to everyone when no one is chosen, or to the people it was shared with.
    if (data) setNotes((data as Note[]).filter(n => n.author_id === active.id || !n.recipient_ids?.length || n.recipient_ids.includes(active.id)));
  }, [familyId, active.id]);
  useEffect(() => {
    load();
    const ch = supabase.channel(`home_notes_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_sticky_notes' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  const save = async () => {
    const body = text.trim(); if (!body || !familyId) return;
    const { error } = await supabase.from('family_sticky_notes').insert({ family_id: familyId, author_id: active.id, body, color, recipient_ids: to });
    if (error) { showToast('Could not post the note'); return; }
    setText(''); setTo([]); setAdding(false); showToast('Note posted'); load();
  };
  const remove = async (n: Note) => { await supabase.from('family_sticky_notes').delete().eq('id', n.id); setNotes(p => p.filter(x => x.id !== n.id)); };
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow label="STICKY NOTES" accent={k.gold} k={k} />
      <View style={s.notes}>
        {notes.map((n, i) => {
          const t = tones[n.color] ?? tones.amber;
          return (
            <View key={n.id} style={[s.sticky, { backgroundColor: t.bg, transform: [{ rotate: i % 2 ? '1deg' : '-1deg' }] }]}>
              <Text style={[s.stickyT, { color: k.text }]}>{n.body}</Text>
              <Text style={[s.stickyBy, { color: t.fg }]}>— {firstName(members.find(m => m.id === n.author_id))}{n.recipient_ids?.length ? ` → ${n.recipient_ids.map(id => firstName(members.find(m => m.id === id))).join(', ')}` : ''}</Text>
              {(isParent || n.author_id === active.id) && <Pressable onPress={() => remove(n)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove note" style={s.stickyX}><X size={14} color={k.textMuted} /></Pressable>}
            </View>
          );
        })}
        {<Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={[s.sticky, s.stickyAdd, { backgroundColor: k.well }]}><Plus size={18} color={k.textMuted} /><Text style={[s.stickyBy, { color: k.textMuted }]}>Add a note</Text></Pressable>}
        
      </View>
      <KioskFormDrawer visible={adding} variant="drawer" title="New sticky note" subtitle="It appears on Home for the people you choose" accent={k.gold} Icon={StickyNote} k={k}
        onClose={() => setAdding(false)} submitLabel="Post note" onSubmit={save} canSubmit={!!text.trim()}>
        <View style={{ gap: KIOSK_SPACE.md }}>
          <TextInput value={text} onChangeText={setText} placeholder="e.g. Soccer cleats are in the garage" placeholderTextColor={k.textFaint} multiline maxLength={100}
            style={[s.input, { color: k.text, backgroundColor: k.pastelAmber, borderColor: k.pastelAmberCard, fontFamily: KIOSK_FONT.hand.bold, fontSize: 24 }]} accessibilityLabel="Note" />
          <Text style={[s.sub, { color: k.textFaint, textAlign: 'right' }]}>{text.length}/100</Text>
          <Text style={[s.sub, { color: k.textFaint }]}>SHARE WITH</Text>
          <View style={s.wrap}>
            <Pressable onPress={() => setTo([])} accessibilityRole="button" accessibilityState={{ selected: to.length === 0 }} style={[s.colorChip, { backgroundColor: to.length === 0 ? k.primary : k.well }]}>
              <Text style={[s.btnT, { color: to.length === 0 ? k.onPrimary : k.textMuted }]}>Everyone</Text>
            </Pressable>
            {members.filter(m => m.id !== active.id && !m.deletedAt && m.inviteStatus !== 'pending').map(m => {
              const on = to.includes(m.id);
              return (
                <Pressable key={m.id} onPress={() => setTo(p => (p.includes(m.id) ? p.filter(x => x !== m.id) : [...p, m.id]))} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.colorChip, { backgroundColor: on ? k.primary : k.well }]}>
                  <Text style={[s.btnT, { color: on ? k.onPrimary : k.textMuted }]}>{firstName(m)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[s.sub, { color: k.textFaint }]}>COLOR</Text>
          <View style={s.wrap}>
            {Object.keys(tones).map(c => (
              <Pressable key={c} onPress={() => setColor(c)} accessibilityRole="button" accessibilityState={{ selected: color === c }} style={[s.colorChip, { backgroundColor: color === c ? k.primary : tones[c].bg }]}>
                <Text style={[s.btnT, { color: color === c ? k.onPrimary : tones[c].fg }]}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </KioskFormDrawer>
    </View>
  );
}

/* ───────── Memories ───────── */
export function HomeMemoriesCard({ onOpen }: { onOpen: () => void }) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const { photos } = useKioskPhotos();
  const recent = photos.slice(0, 3);
  if (recent.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow label="MEMORIES" accent={k.purple} k={k} />
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open memories" style={[s.card, s.memRow, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {recent.map((p, i) => <Image key={p.key} source={{ uri: p.url }} style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: pastels[i % 4].card }} />)}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.name, { color: k.text }]} numberOfLines={1}>{recent[0].title}</Text>
          <Text style={[s.sub, { color: k.textMuted }]}>Latest memory</Text>
        </View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1, padding: 10, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  name: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  sub: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 40, borderRadius: KIOSK_RADIUS.md },
  btnT: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  take: { minHeight: 38, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  pillT: { fontSize: 11.5, fontWeight: '800' },
  chatIc: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeT: { fontSize: 12, fontWeight: '800' },
  notes: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sticky: { width: '47.5%', minHeight: 88, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomRightRadius: 18, borderBottomLeftRadius: 6, padding: 12, gap: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  stickyT: { fontSize: 22, lineHeight: 26, fontFamily: KIOSK_FONT.hand.bold },
  stickyBy: { fontSize: 18, fontFamily: KIOSK_FONT.hand.semibold },
  stickyAdd: { alignItems: 'center', justifyContent: 'center', shadowOpacity: 0, elevation: 0, transform: [] },
  stickyX: { position: 'absolute', top: 6, right: 6 },
  input: { minHeight: 96, borderRadius: 16, borderWidth: 1, padding: 14, fontSize: KIOSK_TYPO.body, fontWeight: '600', textAlignVertical: 'top' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorChip: { minHeight: 44, borderRadius: 100, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  memRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
