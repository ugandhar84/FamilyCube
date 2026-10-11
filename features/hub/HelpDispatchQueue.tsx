/**
 * HelpDispatchQueue — Kid Requests list surface.
 *
 * Redesigned (Part E of the Kid Requests review-screen plan) from the old
 * bulky inline-action-card layout into a 3-tab (Awaiting Review / Rejected /
 * History) list of compact tappable summary rows. All the actual lifecycle
 * actions (decline, self-assign, assign helper, complete, reassign,
 * withdraw, per-item grocery/supplies approve/reject) have been relocated
 * to features/hub/parent/KidRequestDetailScreen.tsx (Part F) — tapping a row
 * calls onOpenDetail(requestId) instead of expanding inline.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useKidRequestStore, REQUEST_META } from '@/store/kidRequestStore';
import type { KidRequest } from '@/store/kidRequestStore';
import { decodeGroceryRequest, GROCERY_PREFIX, SUPPLIES_PREFIX } from './KidView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { fmtDateShort, fmtTime } from '@/lib/dates';

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronRight({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9,6 L16,12 L9,18" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function PlusIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12,5 L12,19 M5,12 L19,12" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// ─── Urgency helpers ──────────────────────────────────────────────────────────

const URGENCY_LABEL: Record<string, string> = {
  urgent:    'Urgent',
  soon:      'Soon',
  normal:    'Normal',
  emergency: 'Emergency',
};

// Per-item approval panel covers real grocery/supplies requests, plus any
// legacy delegation-typed row still carrying items (pre-migration data).
export const isItemRequest = (req: KidRequest): boolean =>
  req.type === 'grocery' || req.type === 'supplies' ||
  (req.type === 'delegation' && !!req.items && req.items.length > 0);

// Returns a human-readable summary for grocery/supplies requests — real
// types carry plain-text detail already; only legacy delegation-typed
// rows need the old prefix-encoded decode.
export const humanDetail = (req: KidRequest): string => {
  if (req.type !== 'delegation') return req.detail;
  if (req.detail.startsWith(GROCERY_PREFIX)) {
    const p = decodeGroceryRequest(req.detail);
    if (!p) return req.detail;
    return `🛒 Grocery: ${p.name}${p.qty ? ` × ${p.qty}` : ''} [${p.category}]${p.notes ? ` — "${p.notes}"` : ''}`;
  }
  if (req.detail.startsWith(SUPPLIES_PREFIX)) {
    try {
      const p = JSON.parse(req.detail.slice(SUPPLIES_PREFIX.length)) as { items: { name: string; qty: string }[]; notes: string; urgency: string };
      const list = p.items.map(i => `${i.name}${i.qty ? ` ×${i.qty}` : ''}`).join(', ');
      return `📚 School Supplies: ${list}${p.notes ? ` — "${p.notes}"` : ''}`;
    } catch { return req.detail; }
  }
  return req.detail;
};

// Add approved items to the grocery store
export const addApprovedItemsToStore = (
  req: KidRequest,
  activeMember: { id?: string; familyId?: string } | undefined,
  members: { id: string; name: string; familyId?: string }[],
  approvedItemIds?: Set<string>,
) => {
  if (req.type !== 'delegation' && req.type !== 'grocery' && req.type !== 'supplies') return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useGroceryStore } = require('@/store/groceryStore');
  const addGroceryItem = useGroceryStore.getState().addItem;
  const familyId     = activeMember?.familyId ?? members[0]?.familyId ?? 'family-1';
  const memberName    = (id: string) => members.find(m => m.id === id)?.name ?? id;
  const approverName  = memberName(activeMember?.id ?? '');
  const approvedNote  = `Approved by ${approverName} · Requested by ${memberName(req.fromMemberId)}`;

  if (req.items && req.items.length > 0) {
    req.items
      .filter(it => !approvedItemIds || approvedItemIds.has(it.id))
      .forEach(item => {
        addGroceryItem({
          familyId,
          name: item.name,
          quantity: item.qty || undefined,
          category: item.category,
          addedBy: req.fromMemberId,
          notes: approvedNote,
        });
      });
  } else if (req.detail.startsWith(GROCERY_PREFIX)) {
    const parsed = decodeGroceryRequest(req.detail);
    if (parsed) addGroceryItem({ familyId, name: parsed.name, quantity: parsed.qty || undefined, category: parsed.category, addedBy: req.fromMemberId, notes: [approvedNote, parsed.notes].filter(Boolean).join(' · ') || undefined });
  } else if (req.detail.startsWith(SUPPLIES_PREFIX)) {
    try {
      const parsed = JSON.parse(req.detail.slice(SUPPLIES_PREFIX.length)) as { items: { name: string; qty: string }[]; notes: string };
      parsed.items.forEach(item => addGroceryItem({ familyId, name: item.name, quantity: item.qty || undefined, category: 'School Supplies', addedBy: req.fromMemberId, notes: [approvedNote, parsed.notes].filter(Boolean).join(' · ') || undefined }));
    } catch { /* ignore */ }
  }
};

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onRequestHelpOpen: () => void;
  onClose?: () => void;
  onOpenDetail: (requestId: string) => void;
}

export default function HelpDispatchQueue({ onRequestHelpOpen, onClose, onOpenDetail }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const members = useFamilyStore(s => s.members);
  const requests = useKidRequestStore(s => s.requests);

  const [tab, setTab] = useState<'awaiting' | 'rejected' | 'history'>('awaiting');

  const pending   = useMemo(() => requests.filter(r => r.status === 'pending'),  [requests]);
  const assigned  = useMemo(() => requests.filter(r => r.status === 'approved'), [requests]);
  const rejected  = useMemo(() => requests.filter(r => r.status === 'declined'), [requests]);
  const history   = useMemo(() => requests.filter(r =>
    r.status === 'completed' || r.status === 'cancelled' || r.status === 'expired' || r.status === 'partial'
  ), [requests]);

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? id;
  const helperName = (id: string) => id === 'ai-tutor' ? 'AI Family Tutor' : memberName(id);

  const canvas = isDark ? '#0E0C13' : GEMINI.canvas;
  const subtitle = pending.length > 0
    ? `${pending.length} request${pending.length !== 1 ? 's' : ''} need${pending.length === 1 ? '' : 's'} a decision${assigned.length > 0 ? ` · ${assigned.length} in progress` : ''}`
    : `No open requests${assigned.length > 0 ? ` · ${assigned.length} in progress` : ''}`;

  const sectionLabel = (text: string, count: number, color: string) => (
    <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 0.7, color, marginTop: 6 }}>
      {text} · {count}
    </Text>
  );

  // ── Compact tappable summary row ──────────────────────────────────────────
  function RequestRow({ req, inHistory }: { req: KidRequest; inHistory?: boolean }) {
    const meta      = REQUEST_META[req.type];
    const requester = members.find(m => m.id === req.fromMemberId);
    const itemRequest = isItemRequest(req);

    let secondary: React.ReactNode = null;
    if (req.type === 'ride' || req.type === 'appointment') {
      if (req.scheduledDate || req.scheduledTime) {
        const dateStr = req.scheduledDate ? fmtDateShort(req.scheduledDate) : '';
        const timeStr = req.scheduledTime ? fmtTime(req.scheduledTime) : '';
        secondary = (
          <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
            {[dateStr, timeStr].filter(Boolean).join(' · ')}
          </Text>
        );
      }
    } else if (itemRequest && req.items && req.items.length > 0) {
      secondary = (
        <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
          {req.items.length} item{req.items.length === 1 ? '' : 's'}
        </Text>
      );
    }
    if (!secondary) {
      const urgLabel = URGENCY_LABEL[req.urgency] ?? 'Normal';
      const urgColor = req.urgency === 'urgent' || req.urgency === 'emergency' ? colors.danger
        : req.urgency === 'soon' ? colors.amber : colors.textTertiary;
      secondary = (
        <View style={[styles.urgChip, { backgroundColor: urgColor + '18' }]}>
          <Text style={[styles.urgChipText, { color: urgColor }]}>{urgLabel}</Text>
        </View>
      );
    }

    let outcomeTag: string | null = null;
    if (inHistory) {
      outcomeTag = req.status === 'completed' ? 'Completed'
        : req.status === 'cancelled' ? 'Cancelled'
        : req.status === 'expired' ? 'Expired'
        : req.status === 'partial' ? 'Partial'
        : null;
    }

    return (
      <TouchableOpacity
        onPress={() => onOpenDetail(req.id)}
        activeOpacity={0.7}
        style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={[styles.badgeCircle, { backgroundColor: meta.bgColor }]}>
          <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {(requester?.name?.split(' ')[0] ?? 'Member')} · {meta.label}
          </Text>
          <Text style={[styles.rowPreview, { color: colors.textSecondary }]} numberOfLines={2}>
            {humanDetail(req)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            {secondary}
            {!!req.rewardCoins && req.rewardCoins > 0 && (
              <View style={[styles.coinPill, { backgroundColor: colors.amberLight }]}>
                <Text style={[styles.coinPillText, { color: colors.amber }]}>+{req.rewardCoins} 🪙</Text>
              </View>
            )}
          </View>
        </View>
        {inHistory ? (
          outcomeTag ? (
            <View style={[styles.outcomeTag, { backgroundColor: colors.surface }]}>
              <Text style={[styles.outcomeTagText, { color: colors.textSecondary }]}>{outcomeTag}</Text>
            </View>
          ) : null
        ) : (
          <ChevronRight color={colors.textTertiary} />
        )}
      </TouchableOpacity>
    );
  }

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'awaiting', label: 'Awaiting Review' },
    { key: 'rejected',  label: 'Rejected' },
    { key: 'history',   label: 'History' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          title="Kid requests"
          subtitle={subtitle}
          onTitlePress={onClose}
          topInset={insets.top}
          right={(
            <TouchableOpacity style={[styles.askBtn, { backgroundColor: colors.pink }]} onPress={onRequestHelpOpen}>
              <PlusIcon color="#fff" size={14} />
              <Text style={styles.askBtnText}>Ask for help</Text>
            </TouchableOpacity>
          )}
        />

        {/* Segmented tab switcher — same inline pill pattern as DisputesInboxScreen */}
        <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, gap: 4 }}>
          {tabs.map(t => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{ flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? colors.card : 'transparent' }}
              >
                <Text style={{ fontSize: 13, fontWeight: active ? '700' : '400', color: active ? colors.teal : colors.textSecondary }} numberOfLines={1}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false}>

        {tab === 'awaiting' && (
          <>
            {pending.length === 0 && assigned.length === 0 && (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface }]}>
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                  No requests right now. When a kid asks for help, it shows up here.
                </Text>
              </View>
            )}
            {pending.length > 0 && sectionLabel('NEEDS A DECISION', pending.length, colors.amber)}
            {pending.map(req => <RequestRow key={req.id} req={req} />)}
            {assigned.length > 0 && sectionLabel('IN PROGRESS', assigned.length, colors.pink)}
            {assigned.map(req => <RequestRow key={req.id} req={req} />)}
          </>
        )}

        {tab === 'rejected' && (
          <>
            {rejected.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface }]}>
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No rejected requests.</Text>
              </View>
            ) : (
              rejected.map(req => <RequestRow key={req.id} req={req} />)
            )}
          </>
        )}

        {tab === 'history' && (
          <>
            {history.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface }]}>
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Nothing here yet.</Text>
              </View>
            ) : (
              history.map(req => <RequestRow key={req.id} req={req} inHistory />)
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  askBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  askBtnText:  { color: '#fff', fontSize: 13, fontWeight: '900' },
  emptyBox:    { padding: 20, borderRadius: 18, alignItems: 'center' },
  emptyText:   { fontSize: 14, textAlign: 'center' },

  row:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 18, borderWidth: 1, padding: 14 },
  badgeCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rowTitle:    { fontSize: 14, fontWeight: '700' },
  rowPreview:  { fontSize: 13, lineHeight: 18 },

  urgChip:     { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  urgChipText: { fontSize: 11, fontWeight: '700' },
  secondaryText: { fontSize: 12, fontWeight: '600' },

  coinPill:     { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  coinPillText: { fontSize: 11, fontWeight: '800' },

  outcomeTag:     { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'center' },
  outcomeTagText: { fontSize: 11, fontWeight: '700' },
});
