/**
 * SendAppreciationScreen — parent sends a warm chat message to a family member.
 *
 * Sends via useChatStore().sendMessage to the 'all' group channel.
 * No coins are transferred — this is encouragement, not payment.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';
import { TYPO, RADIUS } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Preset chips ─────────────────────────────────────────────────────────────

const MESSAGE_PRESETS = [
  'Amazing work!',
  'You made today easier',
  'So proud of you',
] as const;

// ─── Member selector card ─────────────────────────────────────────────────────

interface MemberCardProps {
  member: FamilyMember;
  selected: boolean;
  onPress: () => void;
}

function MemberCard({ member, selected, onPress }: MemberCardProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        padding: 12,
        borderRadius: RADIUS.lg,
        backgroundColor: selected ? colors.tealLight : colors.card,
        borderWidth: 1.5,
        borderColor: selected ? colors.teal : colors.border,
        minWidth: 72,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.teal,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF' }}>
          {memberInitial(member)}
        </Text>
      </View>
      <Text style={{
        fontSize: TYPO.caption,
        fontWeight: '600',
        color: colors.textPrimary,
        marginTop: 4,
        textAlign: 'center',
      }}>
        {member.name.split(' ')[0] ?? member.name}
      </Text>
      <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center' }}>
        {roleLabel(member)}
      </Text>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

interface SendAppreciationScreenProps {
  memberId?: string;
  onClose: () => void;
}

export function SendAppreciationScreen({ memberId, onClose }: SendAppreciationScreenProps) {
  const { colors } = useTheme();
  const members        = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const sendMessage    = useChatStore(s => s.sendMessage);

  const [selectedId, setSelectedId] = useState<string | undefined>(memberId);
  const [preset, setPreset]         = useState<string | undefined>(undefined);
  const [text, setText]             = useState('');

  const selectedMember = useMemo(
    () => members.find(m => m.id === selectedId),
    [members, selectedId],
  );

  async function handleSend() {
    const senderId = activeMemberId;
    if (!senderId) return;
    const finalText = text.trim() || preset;
    if (!finalText) return;
    await sendMessage('all', senderId, finalText);
    onClose();
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Back link */}
      <Pressable onPress={onClose} hitSlop={12}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '500', color: colors.teal }}>
          ← Send appreciation
        </Text>
      </Pressable>

      {/* Title */}
      <Text style={{ fontSize: 29, fontWeight: '700', color: colors.textPrimary }}>
        Send appreciation
      </Text>

      {/* Member selector */}
      {memberId ? (
        /* Single pre-selected member */
        selectedMember ? (
          <View style={{
            backgroundColor: colors.tealLight,
            borderRadius: RADIUS.xxl,
            padding: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}>
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.teal,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF' }}>
                {memberInitial(selectedMember)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
                {selectedMember.name}
              </Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '400', color: colors.textSecondary }}>
                {roleLabel(selectedMember)}
              </Text>
            </View>
          </View>
        ) : null
      ) : (
        /* Full member selector */
        <View style={{ gap: 12 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          >
            {members.map(m => (
              <MemberCard
                key={m.id}
                member={m}
                selected={m.id === selectedId}
                onPress={() => setSelectedId(m.id)}
              />
            ))}
          </ScrollView>

          {/* Hero card for selected member */}
          {selectedMember && (
            <View style={{
              backgroundColor: colors.tealLight,
              borderRadius: RADIUS.xxl,
              padding: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}>
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.teal,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF' }}>
                  {memberInitial(selectedMember)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
                  {selectedMember.name}
                </Text>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '400', color: colors.textSecondary }}>
                  {roleLabel(selectedMember)}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Message presets */}
      <View style={{ gap: 8 }}>
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
                  borderRadius: 100,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{
                  fontSize: TYPO.caption,
                  fontWeight: '500',
                  color: isSelected ? colors.primary : colors.textPrimary,
                }}>
                  {p}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Message field */}
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '500', color: colors.textSecondary }}>
          Your message
        </Text>
        <TextInput
          value={text}
          onChangeText={t => {
            setText(t);
            if (t.length > 0) setPreset(undefined);
          }}
          multiline
          style={{
            backgroundColor: colors.surface,
            borderRadius: RADIUS.md,
            padding: 14,
            fontSize: TYPO.body,
            color: colors.textPrimary,
            borderWidth: 1,
            borderColor: colors.border,
            height: 100,
            textAlignVertical: 'top',
          }}
          placeholder="Write something kind..."
          placeholderTextColor={colors.textTertiary}
        />
      </View>

      {/* Info card */}
      <View style={{
        backgroundColor: colors.amberLight,
        borderRadius: RADIUS.xxl,
        padding: 16,
        gap: 4,
      }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>
          Encouragement, not payment
        </Text>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '400', color: colors.textSecondary }}>
          This sends a warm message, not coins — for that, use the Quests tab.
        </Text>
      </View>

      {/* Send button */}
      <Pressable
        onPress={handleSend}
        style={({ pressed }) => ({
          borderRadius: 14,
          paddingVertical: 16,
          backgroundColor: colors.primary,
          alignItems: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#FFFFFF' }}>
          Send appreciation →
        </Text>
      </Pressable>
    </ScrollView>
  );
}
