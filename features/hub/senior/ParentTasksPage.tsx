/**
 * ParentTasksPage — opened from the grandparent's "Needs you" card (View history): only what the family asked grandparents for or opened to them
 * (chores flagged "grandparents welcome", rides open to them), in tabs: Waiting for claim, Claimed / To do, Completed, History.
 */
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { HandHeart, CalendarDays, Car } from 'lucide-react-native';
import AppFullPage from '@/components/AppFullPage';
import FamilyAvatar from '@/components/FamilyAvatar';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { isPrivateToOthers } from '@/lib/overdue';
import { GP } from './seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';
import type { FamilyEvent } from '@/store/eventStore';

const DONE = ['approved', 'auto_approved', 'completed', 'done'];
const OFF = ['declined', 'cancelled', 'archived'];

function fmtDay(iso?: string | null) {
  if (!iso) return '';
  const d = iso.includes('T') ? iso.split('T')[0] : iso;
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmt12(t?: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function statusLabel(s: string) {
  if (DONE.includes(s)) return 'Done';
  if (OFF.includes(s)) return 'Closed';
  if (s === 'todo') return 'To do';
  if (s === 'in_progress') return 'In progress';
  if (s.startsWith('pending')) return 'Waiting for review';
  return s.replace(/_/g, ' ');
}

type Tab = 'open' | 'mine' | 'done' | 'history';
const TABS: { key: Tab; label: string }[] = [
  { key: 'open', label: 'To claim' }, { key: 'mine', label: 'Claimed' }, { key: 'done', label: 'Completed' }, { key: 'history', label: 'History' },
];

export function ParentTasksPage({ visible, onClose, chores, members, active, openRides, myClaimedRides, onClaimChore, onClaimRide, colors, isDark }: {
  visible: boolean; onClose: () => void;
  chores: ChoreTask[]; members: FamilyMember[]; active: FamilyMember;
  openRides: FamilyEvent[]; myClaimedRides: FamilyEvent[];
  onClaimChore: (choreId: string) => void; onClaimRide: (eventId: string) => void;
  colors: any; isDark: boolean;
}) {
  const [tab, setTab] = useState<Tab>('open');
  const title = isDark ? colors.textPrimary : GEMINI.titleColor;
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const shadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;

  // Only things asked of / opened to grandparents: flagged for them, or I offered / took them. Never a parent's private or ordinary chore.
  const relevant = chores.filter(c => !c.sponsorUserId && !(c as any).isPrivateParent && !isPrivateToOthers(c, active.id)
    && (c.inviteGrandparents || c.gpOfferById === active.id));
  const mineOf = (c: ChoreTask) => c.assignedToId === active.id || c.gpOfferById === active.id;
  const classify = (c: ChoreTask): Tab => {
    if (DONE.includes(c.status)) return mineOf(c) ? 'done' : 'history';
    if (OFF.includes(c.status)) return 'history';
    if (c.status === 'gp_offer_pending' && c.gpOfferById === active.id) return 'mine';
    if (c.status === 'todo' && c.gpOfferById !== active.id && c.assignedToId !== active.id) return 'open';
    if (mineOf(c)) return 'mine';
    return 'history'; // somebody else took it
  };
  const byTab: Record<Tab, ChoreTask[]> = { open: [], mine: [], done: [], history: [] };
  relevant.forEach(c => byTab[classify(c)].push(c));
  const claimedRideIds = new Set(myClaimedRides.map(e => e.id));
  const rides = tab === 'open' ? openRides : tab === 'mine' ? myClaimedRides : [];
  const counts: Record<Tab, number> = {
    open: byTab.open.length + openRides.length, mine: byTab.mine.length + myClaimedRides.length,
    done: byTab.done.length, history: byTab.history.length,
  };
  const list = byTab[tab].slice(0, 60);
  void claimedRideIds;

  const card = { backgroundColor: cardBg, borderRadius: 20, padding: RHYTHM.card, gap: 10, ...shadow };
  const claimBtn = (onPress: () => void, text: string) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={text}
      style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
      <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textInverse }}>{text}</Text>
    </Pressable>
  );
  const empty = { open: 'Nothing is open to you right now.', mine: 'You have not claimed anything yet.', done: 'Nothing completed yet.', history: 'No history yet.' }[tab];

  return (
    <AppFullPage gemini visible={visible} onClose={onClose} title="Parent tasks" subtitle="What the family asked you for, or left open for you" accent="amber">
      <View style={{ flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderRadius: 16, padding: 4 }}>
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="button" accessibilityLabel={`${t.label} ${counts[t.key]}`}
              style={{ flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.card : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: on ? colors.textPrimary : colors.textSecondary }} numberOfLines={1}>
                {t.label}{counts[t.key] > 0 ? ` · ${counts[t.key]}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {list.length === 0 && rides.length === 0 && (
        <View style={card}><Text style={{ fontSize: GP.sub, fontWeight: '600', color: body }}>{empty}</Text></View>
      )}

      {rides.map(e => (
        <View key={e.id} style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Car size={20} color={colors.amber} />
            <Text style={{ flex: 1, fontSize: GP.body, fontWeight: '800', color: title }} numberOfLines={2}>{e.title}</Text>
          </View>
          <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body }}>{fmtDay(e.date)}{e.time ? ` · ${fmt12(e.time)}` : ''}</Text>
          {tab === 'open' ? claimBtn(() => onClaimRide(e.id), "I'll drive")
            : <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.success }}>You are driving</Text>}
        </View>
      ))}

      {list.map(c => {
        const who = members.find(m => m.id === (c.assignedToId ?? ''));
        return (
          <View key={c.id} style={[card, tab === 'history' && { opacity: 0.75 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <HandHeart size={20} color={colors.amber} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.body, fontWeight: '800', color: title }} numberOfLines={2}>{c.title}</Text>
                <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body, marginTop: 2 }}>
                  {c.dueDate ? `Due ${fmtDay(c.dueDate)}` : 'No due date'}{who && who.id !== active.id ? ` · ${who.name.split(' ')[0]}` : ''}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: DONE.includes(c.status) ? colors.tealLight : colors.amberLight }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: DONE.includes(c.status) ? colors.teal : colors.amber }}>
                  {c.status === 'gp_offer_pending' ? 'Waiting on parent' : statusLabel(c.status)}
                </Text>
              </View>
            </View>
            {tab === 'open' && claimBtn(() => onClaimChore(c.id), "I'll take this")}
          </View>
        );
      })}
    </AppFullPage>
  );
}
