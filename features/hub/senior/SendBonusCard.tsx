import { View, Text, Pressable, TextInput } from 'react-native';
import { Star } from 'lucide-react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { GP } from './seniorTheme';
import type { FamilyMember } from '@/store/familyStore';

// Send a bonus — coins straight to a grandchild. Gemini field-card rhythm: one shadowed card per step (who, how much, note), one primary button.
export function SendBonusCard({
  kids, allNames, colors, isDark,
  gpKid, setGpKid, gpAmount, setGpAmount, gpNote, setGpNote, gpSent,
  onSend,
}: {
  kids: FamilyMember[]; allNames: string[]; colors: any; isDark: boolean;
  gpKid: FamilyMember | null; setGpKid: (k: FamilyMember | null) => void;
  gpAmount: 15 | 25 | 50; setGpAmount: (v: 15 | 25 | 50) => void;
  gpNote: string; setGpNote: (v: string) => void;
  gpSent: boolean;
  onSend: () => void;
  active?: { name: string };
}) {
  const title = isDark ? colors.textPrimary : GEMINI.titleColor;
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const card = { backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderRadius: 22, padding: RHYTHM.card, gap: RHYTHM.item, ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) };
  const label = { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight };
  const chipBg = isDark ? colors.surface : GEMINI.surface;
  const chipBorder = isDark ? colors.border : GEMINI.border;

  if (kids.length === 0) {
    return <View style={[card, { alignItems: 'center' }]}><Text style={{ fontSize: GP.sub, fontWeight: '700', color: body }}>No grandchildren added yet.</Text></View>;
  }
  if (gpSent) {
    return (
      <View style={[card, { alignItems: 'center', paddingVertical: 28 }]}>
        <Star size={40} color={colors.success} />
        <Text style={{ fontSize: GP.title, fontWeight: '800', color: colors.success }}>Bonus sent!</Text>
        <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body }}>{gpAmount} coins delivered</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: RHYTHM.item }}>
      <View style={card}>
        <Text style={label}>Who gets it</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {kids.map(kid => {
            const sel = gpKid?.id === kid.id;
            return (
              <Pressable key={kid.id} onPress={() => setGpKid(sel ? null : kid)} accessibilityRole="button" accessibilityLabel={kid.name}
                style={{ minHeight: 48, borderRadius: 24, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: sel ? colors.primary : chipBg, borderWidth: 1, borderColor: sel ? colors.primary : chipBorder }}>
                <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} siblings={allNames} size={28} ringColor={sel ? colors.textInverse : colors.primary} ringWidth={1} />
                <Text style={{ fontSize: GP.sub, fontWeight: '800', color: sel ? colors.textInverse : title }}>{kid.name.split(' ')[0]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={card}>
        <Text style={label}>How much</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([15, 25, 50] as const).map(amt => {
            const sel = gpAmount === amt;
            return (
              <Pressable key={amt} onPress={() => setGpAmount(amt)} accessibilityRole="button" accessibilityLabel={`${amt} coins`}
                style={{ flex: 1, minHeight: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: sel ? colors.primary : chipBg, borderWidth: 1, borderColor: sel ? colors.primary : chipBorder }}>
                <Text style={{ fontSize: GP.title, fontWeight: '800', color: sel ? colors.textInverse : title }}>{amt}</Text>
                <Text style={{ fontSize: GP.tiny, fontWeight: '700', color: sel ? colors.textInverse : body }}>${(amt * 0.10).toFixed(2)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={card}>
        <Text style={label}>Add a note (optional)</Text>
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: chipBorder, backgroundColor: chipBg, paddingHorizontal: 14, paddingVertical: 10 }}>
          <TextInput value={gpNote} onChangeText={setGpNote} placeholder="Great job on your test!" placeholderTextColor={colors.textTertiary}
            style={{ fontSize: GP.sub, fontWeight: '600', color: title, minHeight: 40 }} multiline />
        </View>
      </View>

      <Pressable onPress={onSend} disabled={!gpKid} accessibilityRole="button"
        style={{ minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
          backgroundColor: gpKid ? colors.primary : colors.surface, opacity: gpKid ? 1 : 0.6 }}>
        <Star size={18} color={gpKid ? colors.textInverse : colors.textTertiary} />
        <Text style={{ fontSize: GP.sub, fontWeight: '800', color: gpKid ? colors.textInverse : colors.textTertiary }}>
          Send {gpAmount} coins{gpKid ? ` to ${gpKid.name.split(' ')[0]}` : ''}
        </Text>
      </Pressable>
    </View>
  );
}
