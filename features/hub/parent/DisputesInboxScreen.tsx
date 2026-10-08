/**
 * DisputesInboxScreen — landing list for BOTH dispute mechanisms this app
 * has, opened from ReviewInboxScreen's "Disputes" category card.
 *
 * Live-pasted Figma spec: "Open · 2 / Resolved / All" segmented filter,
 * grouped rows ("Disputed redo · 1", "Reversal awaiting co-sign · 1"),
 * each linking to its own resolution screen, a recent-resolution history
 * card, and a safety-rail explainer. Two distinct dispute types exist and
 * were BOTH previously unreachable from anywhere on the Hub:
 *   - 'kid_disputed_redo' status — a kid disputing a parent's redo
 *     request ("I did do it"), resolved on RedoDisputeReviewScreen
 *   - disputeStatus: 'reversal_requested' — one parent asking to reverse
 *     ANOTHER parent's approval, resolved on ReversalCoSignReviewScreen
 *     (only the original approver can co-sign; the requester is blocked)
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, MessageSquare, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';

export type DisputeKind = 'redo' | 'reversal';

export function DisputesInboxScreen({ onSelectDispute, onClose }: {
  onSelectDispute: (choreId: string, kind: DisputeKind) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const chores = useChoreStore(s => s.chores);
  const { members } = useFamilyStore();
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');

  const name = (id?: string) => id ? (members.find(m => m.id === id)?.name?.split(' ')[0] ?? 'Someone') : 'Someone';

  const openRedos = useMemo(() => chores.filter(c => c.status === 'kid_disputed_redo'), [chores]);
  const openReversals = useMemo(() => chores.filter(c => c.disputeStatus === 'reversal_requested'), [chores]);
  // "Resolved" — a dispute that left a trail: a chore with disputedById/
  // reversedById set but no longer in an open dispute state (reversedById
  // means a reversal actually executed; redo disputes resolve back to
  // either 'approved' or 'redo_requested', both covered below).
  const resolved = useMemo(() => chores.filter(c =>
    (!!c.disputedById || !!c.reversedById) &&
    c.status !== 'kid_disputed_redo' &&
    c.disputeStatus !== 'reversal_requested'
  ).sort((a, b) => (b.reversedAt ?? b.reviewedAt ?? '').localeCompare(a.reversedAt ?? a.reviewedAt ?? '')).slice(0, 8), [chores]);

  const openCount = openRedos.length + openReversals.length;

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardWhiteBg = isDark ? colors.card : '#FFFFFF';
  const cardPeachBg = isDark ? '#1E1210' : '#FFE8E3';
  const cardMintBg  = isDark ? '#0D1F18' : '#DDF5EC';
  const mintText    = isDark ? colors.teal : '#16705F';
  const linkBlue    = colors.teal;
  const RADIUS = 16;
  const sectionLabel = { fontSize: 11 as const, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: colors.textTertiary };

  const showRedos = filter !== 'resolved' && openRedos.length > 0;
  const showReversals = filter !== 'resolved' && openReversals.length > 0;
  const showResolved = filter !== 'open' && resolved.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{
        paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: canvas, gap: 8,
      }}>
        <View style={{ gap: 4 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: linkBlue, lineHeight: 18 }}>← Review inbox</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
              A fair second look
            </Text>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}
            >
              <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, gap: 4 }}>
          {([
            { key: 'open', label: `Open · ${openCount}` },
            { key: 'resolved', label: 'Resolved' },
            { key: 'all', label: 'All' },
          ] as const).map(seg => {
            const active = filter === seg.key;
            return (
              <Pressable
                key={seg.key}
                onPress={() => setFilter(seg.key)}
                style={{ flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? cardWhiteBg : 'transparent' }}
              >
                <Text style={{ fontSize: 13, fontWeight: active ? '700' : '400', color: active ? linkBlue : colors.textSecondary }}>
                  {seg.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {openCount === 0 && resolved.length === 0 && (
          <View style={{ backgroundColor: cardWhiteBg, borderRadius: RADIUS, padding: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textSecondary, lineHeight: 25 }}>
              No disputes right now.
            </Text>
          </View>
        )}

        {/* ── Disputed redo — kid asked for a second opinion ── */}
        {showRedos && (
          <View style={{
            backgroundColor: cardWhiteBg, borderRadius: RADIUS, padding: 16, gap: 12,
            ...Platform.select({
              ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 },
              android: { elevation: 2 },
            }),
          }}>
            <Text style={sectionLabel}>DISPUTED REDO · {openRedos.length}</Text>
            {openRedos.map((c, i) => (
              <Pressable key={c.id} onPress={() => onSelectDispute(c.id, 'redo')} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 4 })}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <MessageSquare size={20} color={colors.danger} strokeWidth={1.8} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
                      {name(c.assignedToId)} · {c.title}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                      {c.title} disputed — waiting on a second parent
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.danger, marginLeft: 30 }}>
                  Disputed redo detail →
                </Text>
                {i < openRedos.length - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 6 }} />}
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Reversal awaiting co-sign — parent vs. parent ── */}
        {showReversals && (
          <View style={{ backgroundColor: cardPeachBg, borderRadius: RADIUS, padding: 16, gap: 12 }}>
            <Text style={sectionLabel}>REVERSAL AWAITING CO-SIGN · {openReversals.length}</Text>
            {openReversals.map((c, i) => {
              const approver = members.find(m => m.id === c.reviewedById);
              const requester = members.find(m => m.id === c.disputedById);
              return (
                <Pressable key={c.id} onPress={() => onSelectDispute(c.id, 'reversal')} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 4 })}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <ShieldCheck size={20} color={colors.danger} strokeWidth={1.8} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
                        {c.title} · +{(c.basePoints > 0 ? c.basePoints : c.coinsReward) ?? 0} approval
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                        {approver?.name?.split(' ')[0] ?? 'A parent'} approved · {requester?.name?.split(' ')[0] ?? 'Another parent'} requested reversal
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.danger, marginLeft: 30 }}>
                    Second-parent co-sign review →
                  </Text>
                  {i < openReversals.length - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 6 }} />}
                </Pressable>
              );
            })}
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
              Completion and wallet stay unchanged until the original approver co-signs.
            </Text>
          </View>
        )}

        {/* ── Recently resolved — history, read-only ── */}
        {showResolved && (
          <View style={{ backgroundColor: cardWhiteBg, borderRadius: RADIUS, padding: 16, gap: 12 }}>
            <Text style={sectionLabel}>RECENT RESOLUTION</Text>
            {resolved.map((c, i) => (
              <View key={c.id} style={{ gap: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
                  {c.title}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  {c.reversedById ? `Reversed — coins removed, ${name(c.assignedToId)} notified`
                    : c.status === 'approved' ? `Disputed redo settled — ${name(c.assignedToId)} paid`
                    : `Redo clarified — ${name(c.assignedToId)} notified, no coins awarded`}
                </Text>
                {i < resolved.length - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 10 }} />}
              </View>
            ))}
          </View>
        )}

        {/* ── Domain footer — explains the model once, same tone as the rest of the app's mint explainer cards ── */}
        <View style={{ backgroundColor: cardMintBg, borderRadius: RADIUS, padding: 20, gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '500', color: mintText, lineHeight: 26 }}>
            Each dispute links to the original proof, decision, and reason. A reversal always needs the ORIGINAL approving parent's co-sign — never the parent who requested it.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
