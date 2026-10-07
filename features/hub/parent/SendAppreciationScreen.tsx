import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';

function memberInitial(m: FamilyMember): string {
  return (m.name[0] ?? '?').toUpperCase();
}

function roleLabel(m: FamilyMember): string {
  if (m.subRole) return m.subRole;
  switch (m.role) {
    case 'parent': return 'Parent';
    case 'kid':    return 'Kid';
    case 'teen':   return 'Teen';
    case 'senior': return 'Senior';
    default:       return 'Member';
  }
}

const MESSAGE_PRESETS = [
  'Amazing work!',
  'You made today easier',
  'So proud of you',
  'Thank you for helping',
] as const;

interface Props {
  memberId?: string;
  onClose: () => void;
}

export function SendAppreciationScreen({ memberId, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const members        = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const familyName     = useFamilyStore(s => s.familyName);
  const sendMessage    = useChatStore(s => s.sendMessage);

  const activeMember = members.find(m => m.id === activeMemberId);
  const [selectedId, setSelectedId] = useState<string | undefined>(memberId);
  const [preset, setPreset]         = useState<string | undefined>(undefined);
  const [text, setText]             = useState('');
  const [sending, setSending]       = useState(false);

  const selectedMember = useMemo(
    () => members.find(m => m.id === selectedId),
    [members, selectedId],
  );

  const canSend = !!selectedId && !!(text.trim() || preset);

  async function handleSend() {
    if (!activeMemberId || !canSend) return;
    setSending(true);
    const finalText = text.trim() || preset!;
    await sendMessage('all', activeMemberId, finalText);
    setSending(false);
    onClose();
  }

  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* ── Fixed page header ── */}
      <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)', gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textTertiary }}>
            {familyName?.toUpperCase() ?? 'FAMILY'}
          </Text>
          {activeMember ? (
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>
              {activeMember.name} · {activeMember.role}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity onPress={onClose} style={{ alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>← Hub</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 29, fontWeight: '700', letterSpacing: -0.5, lineHeight: 34, marginTop: 4, color: colors.textPrimary }}>
              Send a cheer
            </Text>
          </View>
          <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
            <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Member selector */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>WHO ARE YOU CHEERING?</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingTop: 4 }}
          >
            {members.filter(m => m.id !== activeMemberId).map(m => {
              const selected = m.id === selectedId;
              const roleColor = m.role === 'parent' ? colors.teal : colors.amber;
              const roleBg = m.role === 'parent' ? colors.tealLight : colors.amberLight;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setSelectedId(m.id)}
                  style={{ alignItems: 'center', gap: 4, minWidth: 56 }}
                >
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: selected ? roleColor : colors.surface,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? roleColor : borderColor,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: selected ? '#FFFFFF' : colors.textSecondary }}>
                      {memberInitial(m)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: selected ? roleColor : colors.textSecondary, fontWeight: selected ? '600' : '400', textAlign: 'center', maxWidth: 52 }} numberOfLines={1}>
                    {m.name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selectedMember && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, backgroundColor: colors.tealLight, borderRadius: 14, padding: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{memberInitial(selectedMember)}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>{selectedMember.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>{roleLabel(selectedMember)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Message presets */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>QUICK PHRASES</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MESSAGE_PRESETS.map(p => {
              const isSelected = preset === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    setPreset(isSelected ? undefined : p);
                    if (!isSelected) setText('');
                  }}
                  style={({ pressed }) => ({
                    borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8,
                    backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: '500', color: isSelected ? colors.primary : colors.textPrimary }}>
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Custom message */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>YOUR MESSAGE</Text>
          <TextInput
            value={text}
            onChangeText={t => {
              setText(t);
              if (t.length > 0) setPreset(undefined);
            }}
            multiline
            style={{
              backgroundColor: colors.surface,
              borderRadius: 14,
              padding: 14,
              fontSize: 15,
              color: colors.textPrimary,
              minHeight: 90,
              textAlignVertical: 'top',
            }}
            placeholder="Write something kind..."
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        {/* Info card */}
        <View style={[s.card, { backgroundColor: colors.amberLight, borderColor: 'transparent' }]}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Encouragement, not payment</Text>
          <Text style={{ fontSize: 13, fontWeight: '400', color: colors.textSecondary, lineHeight: 20 }}>
            This sends a warm message to the family chat — no coins are transferred. Use Quests to award coins.
          </Text>
        </View>

        {/* Send CTA */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend || sending}
          style={[s.btnPrimary, { backgroundColor: canSend ? colors.primary : colors.border }]}
          activeOpacity={0.85}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
            {sending ? 'Sending…' : 'Send cheer →'}
          </Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, textAlign: 'center', letterSpacing: 0.3 }}>
          Connect. Organize. Care. Grow.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    gap: 12,
  },
  overline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  btnPrimary: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
});
