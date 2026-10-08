/**
 * SendAppreciationScreen — compose and send a warm message to a family member
 *
 * Figma-faithful: mint member-identity card → standalone textarea field →
 * white preview card → primary + secondary CTAs → mint info module.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity,
  TextInput, StyleSheet, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';

function memberInitial(m: FamilyMember): string {
  return (m.name[0] ?? '?').toUpperCase();
}

function roleLabel(m: FamilyMember): string {
  if ((m as any).subRole) return (m as any).subRole;
  switch (m.role) {
    case 'parent': return 'Parent';
    case 'kid':    return 'Kid';
    default:       return 'Member';
  }
}

const PRESETS = [
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
  const insets          = useSafeAreaInsets();
  const members         = useFamilyStore(s => s.members);
  const activeMemberId  = useFamilyStore(s => s.activeMemberId);
  const familyName      = useFamilyStore(s => s.familyName);
  const sendMessage     = useChatStore(s => s.sendMessage);

  const activeMember  = members.find(m => m.id === activeMemberId);
  const [selectedId, setSelectedId] = useState<string | undefined>(memberId);
  const [text, setText]             = useState('');
  const [sending, setSending]       = useState(false);
  const [sent, setSent]             = useState(false);

  const selectedMember = useMemo(
    () => members.find(m => m.id === selectedId),
    [members, selectedId],
  );

  const canSend = !!selectedId && text.trim().length > 0;

  async function handleSend() {
    if (!activeMemberId || !canSend) return;
    setSending(true);
    await sendMessage('all', activeMemberId, text.trim());
    setSending(false);
    setSent(true);
    setTimeout(onClose, 900);
  }

  const canvas          = isDark ? '#0E0C13' : '#FFFFFF';
  const cardMintBg      = isDark ? '#0D1F18' : '#DDF5EC';
  const mintText        = isDark ? colors.teal : '#16705F';
  const mintPillBg      = isDark ? '#133328' : '#C8EEE1';
  const cardWhiteBg     = isDark ? colors.card : '#FFFFFF';
  // Figma uses #E9EFFF for member initial circle + status pill
  const bluePillBg      = isDark ? '#131929' : '#E9EFFF';
  const bluePillText    = isDark ? colors.primary : '#345DE3';
  const fieldBorderColor = isDark ? colors.border : '#DFE5EF';
  const linkBlue        = isDark ? colors.teal : colors.teal;
  const primaryBtnBg    = colors.primary;
  const secondaryBtnBg  = isDark ? colors.surface : '#FFFFFF';
  const secondaryBorder = isDark ? colors.border : '#DFE5EF';

  // Other family members (not self)
  const otherMembers = members.filter(m => m.id !== activeMemberId);

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>

      {/* ── Header ── */}
      <View style={{
        paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: canvas, gap: 8,
      }}>
        {/* Household chrome */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary, lineHeight: 15 }}>
            {familyName?.toUpperCase() ?? 'FAMILY SPACE'}
          </Text>
          {activeMember && (
            <Text style={{ fontSize: 13, fontWeight: '500', color: linkBlue, lineHeight: 18 }}>
              {activeMember.name}
            </Text>
          )}
        </View>

        {/* Page introduction */}
        <View style={{ gap: 4 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: linkBlue, lineHeight: 18 }}>← Hub</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
              Send appreciation
            </Text>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}
            >
              <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Mint card: member identity ── */}
        <View style={{ backgroundColor: cardMintBg, borderRadius: 22, padding: 18, gap: 12 }}>
          {/* Member row — 40px circle + name/role */}
          {selectedMember ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* Figma: #E9EFFF circle, #345DE3 initial */}
              <View style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: bluePillBg,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: bluePillText, lineHeight: 18 }}>
                  {memberInitial(selectedMember)}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: 18 }}>
                  {selectedMember.name}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
                  {roleLabel(selectedMember)}
                </Text>
              </View>
              {/* change recipient */}
              <Pressable
                onPress={() => setSelectedId(undefined)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: mintText }}>Change</Text>
              </Pressable>
            </View>
          ) : (
            // No member selected — show picker
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
                Who are you appreciating?
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {otherMembers.map(m => (
                  <Pressable
                    key={m.id}
                    onPress={() => setSelectedId(m.id)}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: isDark ? colors.surface : '#FFFFFF',
                      borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: bluePillBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: bluePillText }}>{memberInitial(m)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{m.name.split(' ')[0]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Explanation under member row */}
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            A warm message goes directly to the family chat — every member sees it.
          </Text>
        </View>

        {/* ── Populated field: the message ── */}
        <View style={{
          backgroundColor: isDark ? colors.surface : '#FFFFFF',
          borderWidth: 1, borderColor: fieldBorderColor,
          borderRadius: 14, padding: 14, minHeight: 100,
        }}>
          <TextInput
            value={text}
            onChangeText={t => setText(t)}
            multiline
            style={{
              fontSize: 14, color: colors.textPrimary,
              lineHeight: 24, // 170%
              textAlignVertical: 'top', minHeight: 72,
            }}
            placeholder="Write something kind..."
            placeholderTextColor={colors.textTertiary}
          />
          {/* Quick presets */}
          {text.length === 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {PRESETS.map(p => (
                <Pressable
                  key={p}
                  onPress={() => setText(p)}
                  style={({ pressed }) => ({
                    borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6,
                    backgroundColor: isDark ? colors.surface : '#F2F4F8',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textSecondary }}>{p}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── White card: preview ── */}
        <View style={{
          backgroundColor: cardWhiteBg, borderRadius: 22, padding: 18, gap: 12,
          ...Platform.select({
            ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 },
            android: { elevation: 2 },
          }),
        }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
            Preview
          </Text>

          {/* Blue status pill */}
          <View style={{ alignSelf: 'flex-start', backgroundColor: bluePillBg, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: bluePillText, lineHeight: 15 }}>
              {sent ? 'Sent ✓' : canSend ? 'Ready to send' : 'Compose a message'}
            </Text>
          </View>

          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            {text.trim() ? `"${text.trim()}"` : 'Your message will appear here once you write something.'}
          </Text>

          {selectedMember && text.trim().length > 0 && (
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
              Sending to {selectedMember.name} and the whole family.
            </Text>
          )}
        </View>

        {/* ── Primary button ── */}
        <Pressable
          onPress={handleSend}
          disabled={!canSend || sending || sent}
          style={({ pressed }) => ({
            flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
            height: 48, backgroundColor: canSend && !sent ? primaryBtnBg : colors.border,
            borderRadius: 14, opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
            {sent ? 'Sent! 🎉' : sending ? 'Sending…' : 'Send appreciation →'}
          </Text>
        </Pressable>

        {/* ── Secondary button ── */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => ({
            flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
            height: 48, backgroundColor: secondaryBtnBg,
            borderWidth: 1, borderColor: secondaryBorder,
            borderRadius: 14, opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: linkBlue }}>
            Cancel
          </Text>
        </Pressable>

        {/* ── Mint info module ── */}
        <View style={{ backgroundColor: cardMintBg, borderRadius: 22, padding: 18, gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
            Encouragement, not payment
          </Text>

          {/* Mint status pill */}
          <View style={{ alignSelf: 'flex-start', backgroundColor: mintPillBg, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: mintText, lineHeight: 15 }}>
              Family chat
            </Text>
          </View>

          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            This message appears in the family chat thread where everyone can read it. It is a moment of recognition, not a reward.
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            To award coins, use the Quests tab. Appreciation and coins work together — one is personal, one is motivational.
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
            A kind word takes ten seconds and can make someone's whole day.
          </Text>
        </View>

        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18, textAlign: 'center' }}>
          Connect. Organize. Care. Grow.
        </Text>
      </ScrollView>
    </View>
  );
}
