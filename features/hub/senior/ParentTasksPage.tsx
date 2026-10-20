/**
 * ParentTasksPage — opened from the grandparent's "Needs you" card (View history): everything assigned to the parents, with a "I'll take this"
 * button on the items the family opened to grandparents (chores flagged for grandparents, rides open to them). Read-only otherwise.
 */
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

export function ParentTasksPage({ visible, onClose, chores, members, active, openRides, onClaimChore, onClaimRide, colors, isDark }: {
  visible: boolean; onClose: () => void;
  chores: ChoreTask[]; members: FamilyMember[]; active: FamilyMember;
  openRides: FamilyEvent[];
  onClaimChore: (choreId: string) => void; onClaimRide: (eventId: string) => void;
  colors: any; isDark: boolean;
}) {
  const title = isDark ? colors.textPrimary : GEMINI.titleColor;
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const shadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const parentIds = new Set(members.filter(m => m.role === 'parent').map(m => m.id));
  const visibleChore = (c: ChoreTask) => !(c as any).isPrivateParent && !isPrivateToOthers(c, active.id);

  const claimable = chores.filter(c => c.inviteGrandparents && c.status === 'todo' && !c.sponsorUserId && visibleChore(c));
  const claimableIds = new Set(claimable.map(c => c.id));
  const assigned = chores
    .filter(c => !!c.assignedToId && parentIds.has(c.assignedToId) && !claimableIds.has(c.id) && visibleChore(c))
    .sort((a, b) => {
      const ad = DONE.includes(a.status) || OFF.includes(a.status) ? 1 : 0;
      const bd = DONE.includes(b.status) || OFF.includes(b.status) ? 1 : 0;
      return ad - bd || String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999'));
    })
    .slice(0, 60);

  const label = { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight };
  const card = { backgroundColor: cardBg, borderRadius: 20, padding: RHYTHM.card, gap: 10, ...shadow };
  const claimBtn = (onPress: () => void, text: string) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={text}
      style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
      <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textInverse }}>{text}</Text>
    </Pressable>
  );

  return (
    <AppFullPage gemini visible={visible} onClose={onClose} title="Parent tasks" subtitle="Everything assigned to the parents. Take what's open to you." accent="amber">
      {(claimable.length > 0 || openRides.length > 0) && (
        <>
          <Text style={label}>Open to grandparents</Text>
          {claimable.map(c => (
            <View key={c.id} style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <HandHeart size={20} color={colors.amber} />
                <Text style={{ flex: 1, fontSize: GP.body, fontWeight: '800', color: title }} numberOfLines={2}>{c.title}</Text>
              </View>
              {!!c.dueDate && <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body }}>Due {fmtDay(c.dueDate)}</Text>}
              {claimBtn(() => onClaimChore(c.id), "I'll take this")}
            </View>
          ))}
          {openRides.map(e => (
            <View key={e.id} style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Car size={20} color={colors.amber} />
                <Text style={{ flex: 1, fontSize: GP.body, fontWeight: '800', color: title }} numberOfLines={2}>{e.title}</Text>
              </View>
              <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body }}>{fmtDay(e.date)}{e.time ? ` · ${fmt12(e.time)}` : ''}</Text>
              {claimBtn(() => onClaimRide(e.id), "I'll drive")}
            </View>
          ))}
        </>
      )}

      <Text style={label}>Assigned to parents</Text>
      {assigned.length === 0 ? (
        <View style={card}><Text style={{ fontSize: GP.sub, fontWeight: '600', color: body }}>No tasks are assigned to the parents right now.</Text></View>
      ) : assigned.map(c => {
        const who = members.find(m => m.id === c.assignedToId);
        const done = DONE.includes(c.status) || OFF.includes(c.status);
        return (
          <View key={c.id} style={[card, done && { opacity: 0.7 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {who ? <FamilyAvatar name={who.name} emoji={who.emoji} avatarUrl={who.avatarUrl} siblings={members.map(m => m.name)} size={36} ringColor={colors.teal} ringWidth={1.5} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.body, fontWeight: '800', color: title }} numberOfLines={2}>{c.title}</Text>
                <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body, marginTop: 2 }}>{who?.name.split(' ')[0] ?? 'Parent'}{c.dueDate ? ` · Due ${fmtDay(c.dueDate)}` : ''}</Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: done ? colors.tealLight : colors.amberLight }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: done ? colors.teal : colors.amber }}>{statusLabel(c.status)}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </AppFullPage>
  );
}
