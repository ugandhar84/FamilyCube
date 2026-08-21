import { View, Text, Pressable } from 'react-native';
import { Hourglass, Pencil } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GP } from './seniorTheme';
import type { ChoreTask } from '@/store/choreStore';

const STATUS_LABEL: Record<string, string> = {
  todo: 'not started yet',
  in_progress: 'in progress',
  pending_approval: 'submitted — awaiting parent review',
  redo_requested: 'sent back for a redo',
};

// Previously a GP had no visibility at all into a quest they'd sponsored
// between "I created it" and "a parent approved/declined it" — this closes
// that gap and gives them a way back into CreateQuestModal (edit mode) to
// revise anything, since a parent hasn't acted on it yet.
//
// `inProgressQuests` closes a second gap found later (coordinated live-DB
// QA, launch-readiness round): once a parent approved the quest, it fell
// out of "Awaiting Parent Review" and the GP's Hub had nothing tracking it
// at all, even though the same GP's own Quests tab kept showing its live
// status the whole time.
export function MySponsoredQuestsSection({ quests, inProgressQuests = [], colors, isDark, onEdit }: {
  quests: ChoreTask[]; inProgressQuests?: ChoreTask[]; colors: any; isDark: boolean;
  onEdit: (c: ChoreTask) => void;
}) {
  if (quests.length === 0 && inProgressQuests.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {quests.length > 0 && (
        <View style={{
          backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          overflow: 'hidden', marginBottom: 12, padding: 16, gap: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Hourglass size={16} color={BRAND.purple} />
            <Text style={{ fontSize: GP.title, fontWeight: '900', color: colors.textPrimary, flex: 1 }}>
              Awaiting Parent Review
            </Text>
          </View>

          {quests.map(c => (
            <View key={c.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
              padding: 12,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                  {c.title}
                </Text>
                <Text style={{ fontSize: GP.tiny, color: colors.textTertiary, marginTop: 2 }}>
                  {c.basePoints} pts · waiting on a parent
                </Text>
              </View>
              <Pressable onPress={() => onEdit(c)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                  borderRadius: 10, borderWidth: 1.5, borderColor: BRAND.purple,
                  paddingHorizontal: 10, paddingVertical: 7 }}>
                <Pencil size={12} color={BRAND.purple} />
                <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: BRAND.purple }}>Edit</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {inProgressQuests.length > 0 && (
        <View style={{
          backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          overflow: 'hidden', marginBottom: 12, padding: 16, gap: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Hourglass size={16} color={BRAND.purple} />
            <Text style={{ fontSize: GP.title, fontWeight: '900', color: colors.textPrimary, flex: 1 }}>
              My Sponsored Quests
            </Text>
          </View>

          {inProgressQuests.map(c => (
            <View key={c.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
              padding: 12,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                  {c.title}
                </Text>
                <Text style={{ fontSize: GP.tiny, color: colors.textTertiary, marginTop: 2 }}>
                  {c.basePoints} pts · {STATUS_LABEL[c.status] ?? c.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
