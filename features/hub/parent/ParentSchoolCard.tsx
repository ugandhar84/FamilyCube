import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useSchoolStore } from '@/store/schoolStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import { KidSectionHeader } from '../kid/KidSectionHeader';
import { SchoolDayCard, useSchoolDay } from '../kid/SchoolDayCard';
import { RHYTHM } from '@/constants/theme';
import { GEMINI } from '@/constants/geminiRhythm';
import type { FamilyMember } from '@/store/familyStore';

/** One segmented tab: the child's name, and next to it how many classes their school day has, or the holiday if it is a day off. */
function KidTab({ kid, on, onPress, colors, isDark }: { kid: FamilyMember; on: boolean; onPress: () => void; colors: any; isDark: boolean }) {
  const { todayBreak, periods } = useSchoolDay(kid.id);
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const note = todayBreak ? `🎉 ${todayBreak.reason.length > 14 ? todayBreak.reason.slice(0, 13) + '…' : todayBreak.reason}` : `${periods.length}`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${kid.name}, ${todayBreak ? `holiday ${todayBreak.reason}` : `${periods.length} classes`}`}
      style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, gap: 1, backgroundColor: on ? colors.card : 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={(kid as any).avatarUrl} size={20} />
        <Text style={{ fontSize: 13, fontWeight: on ? '800' : '600', color: on ? titleC : colors.textSecondary }} numberOfLines={1}>{kid.name.split(' ')[0]}</Text>
      </View>
      <Text style={{ fontSize: 11, fontWeight: '700', color: todayBreak ? colors.amber : colors.textTertiary }} numberOfLines={1}>
        {todayBreak ? note : `${note} class${periods.length === 1 ? '' : 'es'}`}
      </Text>
    </Pressable>
  );
}

/**
 * ParentSchoolCard — the parent Hub's school section, collapsed: a segmented tab per child or teen who has a schedule, each showing the
 * child's name and how many classes their school day has (or the holiday). Tapping a tab (or the arrow) opens that child's day.
 */
export function ParentSchoolCard({ members, colors, isDark }: { members: FamilyMember[]; colors: any; isDark: boolean }) {
  const schedules = useSchoolStore(s => s.schedules);
  const kids = members.filter(m => !(m as any).deletedAt && m.inviteStatus !== 'pending' && (m.role === 'kid' || m.role === 'teen')
    && schedules.some(sc => sc.memberId === m.id && sc.periods.length > 0));
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (kids.length === 0) return null;
  const current = kids.find(k => k.id === sel) ?? kids[0];

  return (
    <View style={{ marginHorizontal: 20, marginTop: RHYTHM.section, gap: RHYTHM.item }}>
      <Pressable onPress={() => setOpen(v => !v)} accessibilityRole="button" accessibilityLabel={open ? 'Collapse school' : 'Expand school'}
        style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <KidSectionHeader label="SCHOOL" accent={colors.teal} colors={colors} />
        {open ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderRadius: 16, padding: 4 }}>
        {kids.map(k => (
          <KidTab key={k.id} kid={k} on={open && k.id === current.id} colors={colors} isDark={isDark}
            onPress={() => { if (open && k.id === current.id) setOpen(false); else { setSel(k.id); setOpen(true); } }} />
        ))}
      </View>
      {open && <SchoolDayCard key={current.id} memberId={current.id} colors={colors} isDark={isDark} hideHeader bare />}
    </View>
  );
}
