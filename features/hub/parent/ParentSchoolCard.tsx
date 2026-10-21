import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSchoolStore } from '@/store/schoolStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import { KidSectionHeader } from '../kid/KidSectionHeader';
import { SchoolDayCard } from '../kid/SchoolDayCard';
import { RHYTHM } from '@/constants/theme';
import { GEMINI } from '@/constants/geminiRhythm';
import type { FamilyMember } from '@/store/familyStore';

/**
 * ParentSchoolCard — the parent Hub's school timetable: one segmented tab per child or teen who has a schedule, and under the chosen tab
 * that child's day (today while school is on, otherwise the next school day, with a holiday celebration on a day off). Collapsed to the
 * current class and the next two, with "+N more".
 */
export function ParentSchoolCard({ members, colors, isDark }: { members: FamilyMember[]; colors: any; isDark: boolean }) {
  const schedules = useSchoolStore(s => s.schedules);
  const kids = members.filter(m => !(m as any).deletedAt && m.inviteStatus !== 'pending' && (m.role === 'kid' || m.role === 'teen')
    && schedules.some(sc => sc.memberId === m.id && sc.periods.length > 0));
  const [sel, setSel] = useState<string | null>(null);
  if (kids.length === 0) return null;
  const current = kids.find(k => k.id === sel) ?? kids[0];
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;

  return (
    <View style={{ marginHorizontal: 20, marginTop: RHYTHM.section, gap: RHYTHM.item }}>
      <KidSectionHeader label="SCHOOL" accent={colors.teal} colors={colors} />
      {/* Always shown, even for one child, so it is clear whose day this is. */}
      {(
        <View style={{ flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderRadius: 16, padding: 4 }}>
          {kids.map(k => {
            const on = k.id === current.id;
            return (
              <Pressable key={k.id} onPress={() => setSel(k.id)} accessibilityRole="button" accessibilityLabel={`${k.name} school day`}
                style={{ flex: 1, minHeight: 40, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  backgroundColor: on ? colors.card : 'transparent' }}>
                <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} size={22} />
                <Text style={{ fontSize: 13, fontWeight: on ? '800' : '600', color: on ? titleC : colors.textSecondary }} numberOfLines={1}>{k.name.split(' ')[0]}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <SchoolDayCard key={current.id} memberId={current.id} colors={colors} isDark={isDark} collapseAfter={3} hideHeader bare />
    </View>
  );
}
