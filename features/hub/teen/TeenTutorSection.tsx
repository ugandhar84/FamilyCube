import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { BookOpen, X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import type { FamilyMember } from '@/store/familyStore';
import type { KidRequest } from '@/store/kidRequestStore';

// Tutor/help offer form + the sender's own pending offers (visible and
// cancellable while a parent hasn't responded yet — previously this was
// fire-and-forget with zero visibility into whether/when it got answered).
export function TeenTutorSection({
  siblings, pendingOffers, onSend, onCancel, colors, isDark,
}: {
  siblings: FamilyMember[]; pendingOffers: KidRequest[];
  onSend: (kid: FamilyMember, subject: string, note: string) => void;
  onCancel: (id: string) => void;
  colors: any; isDark: boolean;
}) {
  const [tutorKid, setTutorKid] = useState<FamilyMember | null>(null);
  const [tutorSubject, setTutorSubject] = useState('');
  const [tutorNote, setTutorNote] = useState('');
  const [tutorSent, setTutorSent] = useState(false);

  const send = () => {
    if (!tutorKid || !tutorSubject.trim()) return;
    onSend(tutorKid, tutorSubject.trim(), tutorNote.trim());
    setTutorSent(true);
    setTimeout(() => { setTutorKid(null); setTutorSubject(''); setTutorNote(''); setTutorSent(false); }, 2500);
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginBottom: 2 }}>
        Offer your time to help a sibling with homework or studying. Parent sees the offer.
      </Text>

        {pendingOffers.length > 0 && (
          <View style={{ gap: 8, marginBottom: 12 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
              textTransform: 'uppercase', letterSpacing: 0.8 }}>Waiting on Parent</Text>
            {pendingOffers.map(r => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                padding: 10, borderRadius: 12,
                backgroundColor: isDark ? BRAND.purple + '12' : BRAND.purple + '08',
                borderWidth: 1, borderColor: BRAND.purple + '30' }}>
                <BookOpen size={14} color={BRAND.purple} />
                <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.textPrimary }} numberOfLines={2}>{r.detail}</Text>
                <Pressable onPress={() => onCancel(r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
                  <X size={16} color={colors.textTertiary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {tutorSent ? (
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <BookOpen size={28} color={BRAND.teal} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.teal, marginTop: 8 }}>
              Offer sent to parents!
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Who needs help?</Text>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {siblings.map(k => (
                <Pressable key={k.id} onPress={() => setTutorKid(k)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
                    borderRadius: 12, borderWidth: 1.5,
                    borderColor: tutorKid?.id === k.id ? BRAND.purple : colors.border,
                    backgroundColor: tutorKid?.id === k.id ? BRAND.purple + '15' : 'transparent' }}>
                  <Text style={{ fontSize: 16 }}>{k.emoji ?? '👤'}</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                    color: tutorKid?.id === k.id ? BRAND.purple : colors.textPrimary }}>{k.name.split(' ')[0]}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              placeholder="Subject (e.g. Math, Science)"
              placeholderTextColor={colors.textTertiary}
              value={tutorSubject}
              onChangeText={setTutorSubject}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                padding: 10, fontSize: TYPO.body, color: colors.textPrimary,
                backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
            />
            <TextInput
              placeholder="Optional note to sibling"
              placeholderTextColor={colors.textTertiary}
              value={tutorNote}
              onChangeText={setTutorNote}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                padding: 10, fontSize: TYPO.body, color: colors.textPrimary,
                backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
            />
            <Pressable onPress={send}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: BRAND.purple,
                paddingVertical: 12, opacity: pressed || !tutorKid || !tutorSubject.trim() ? 0.5 : 1 })}>
              <BookOpen size={15} color="#fff" />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>Offer Help</Text>
            </Pressable>
          </View>
        )}
    </View>
  );
}
