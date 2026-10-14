/**
 * AskParentHubScreen — full-page landing page replacing AskParentSheet's
 * bottom-sheet picker. Same 8 destinations, same icon/color/copy mapping
 * AskParentSheet used, restyled into the ReviewInboxScreen landing-page
 * rhythm (pressable rows with icon badge/title/subtitle/chevron, Gemini
 * tokens, PageHeading header with onTitlePress={onClose}).
 *
 * Now also shows this kid's OWN real requests (useKidRequestStore),
 * tabbed Pending/Approved/All, above the destination tiles — so the
 * landing page doubles as a status view, not just a picker
 * [live-requested: "Ask parent is another landing page with stacked
 * options with real parent requests... that landing page should have
 * all the request cards with tabs Pending approved all"].
 *
 * Plain View-rooted — no self FullPageOverlay wrap; the parent (KidView)
 * applies that.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Unlock, HelpCircle, Pill, ShoppingCart, BookOpen, Car, ClipboardList, MessageCircle, Inbox } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { useKidRequestStore, REQUEST_META, type KidRequest } from '@/store/kidRequestStore';

export type AskParentDestination =
  | 'ride' | 'permission' | 'question' | 'medication' | 'grocery' | 'supplies' | 'quest' | 'chore';

// Indigo — same single named constant AskParentSheet used for "School
// Supplies," not in the brand palette or a semantic token.
const INDIGO_ACCENT = '#6366F1';
const AMBER_ACCENT = '#F59E0B';

const STATUS_COLOR: Record<string, string> = {
  pending: AMBER_ACCENT, approved: '#10B981', completed: '#10B981',
  declined: '#EF4444', cancelled: '#9CA3AF', expired: '#9CA3AF', partial: AMBER_ACCENT,
};

function requestTimeLabel(req: KidRequest): string {
  const d = new Date(req.requestedAt);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diffMin = Math.round((now - d.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RequestCard({ req, colors, isDark, cardWhiteBg }: { req: KidRequest; colors: any; isDark: boolean; cardWhiteBg: string }) {
  const meta = REQUEST_META[req.type];
  const statusColor = STATUS_COLOR[req.status] ?? colors.textTertiary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cardWhiteBg, borderRadius: 14, padding: 14 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: meta?.bgColor ?? colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 18 }}>{meta?.emoji ?? '📨'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }} numberOfLines={1}>
          {req.detail || meta?.label || 'Request'}
        </Text>
        <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginTop: 2 }} numberOfLines={1}>
          {meta?.label ?? req.type} · {requestTimeLabel(req)}
        </Text>
      </View>
      <View style={{ backgroundColor: statusColor + '20', borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: statusColor, textTransform: 'capitalize' }}>{req.status}</Text>
      </View>
    </View>
  );
}

export function AskParentHubScreen({ onClose, onSelect, activeMemberId }: {
  onClose: () => void;
  onSelect: (destination: AskParentDestination) => void;
  activeMemberId?: string;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const allRequests = useKidRequestStore(s => s.requests);
  const [tab, setTab] = useState<'pending' | 'approved' | 'all'>('pending');

  const canvas = isDark ? colors.background : GEMINI.canvas;
  const cardWhiteBg = isDark ? colors.card : GEMINI.cardBg;
  const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const RADIUS = 16;

  const myRequests = activeMemberId ? allRequests.filter(r => r.fromMemberId === activeMemberId) : allRequests;
  const pendingCount = myRequests.filter(r => r.status === 'pending').length;
  const tabbedRequests =
    tab === 'pending' ? myRequests.filter(r => r.status === 'pending') :
    tab === 'approved' ? myRequests.filter(r => ['approved', 'completed'].includes(r.status)) :
    myRequests;

  // 'ride' also has its own full-width Quick Action card on the Kid Hub
  // (RideStatusCard → setAskParentDestination('ride') directly) for fast
  // access, and is folded into this picker too so Ask Parent remains the
  // single landing page for every request type [live-requested: "lets
  // fold the ask ride in to the unified askparent form"] — both paths
  // land on the same askParentDestination state in KidOverlays.tsx, which
  // now always renders AskParentUnifiedPage (ride is an 8th pill type
  // inside it, not a separate component).
  const destinations: {
    key: AskParentDestination; label: string; desc: string; Icon: typeof Car; color: string;
  }[] = [
    { key: 'ride',        label: 'Ask for a Ride',   desc: 'Need a lift somewhere',          Icon: Car,          color: colors.sky },
    { key: 'permission', label: 'Ask Permission',   desc: 'Go somewhere, do something',     Icon: Unlock,       color: BRAND.purple },
    { key: 'question',   label: 'Ask a Question',   desc: 'Something you want to know',     Icon: HelpCircle,   color: colors.info },
    { key: 'medication', label: 'Medication Alert', desc: "I didn't take my meds",          Icon: Pill,         color: colors.danger },
    { key: 'grocery',    label: 'Request Grocery',  desc: 'Add items to the shopping list', Icon: ShoppingCart, color: BRAND.teal },
    { key: 'supplies',   label: 'School Supplies',  desc: 'Things I need for school',       Icon: BookOpen,     color: INDIGO_ACCENT },
    // Scenario 1.4 — self only, kid picks the coin amount.
    { key: 'quest',      label: 'Suggest a Chore',  desc: 'For yourself — pick your own coin amount', Icon: HelpCircle,    color: BRAND.purple },
    // propose_kid_chore RPC — can target a sibling, parent sets coins.
    { key: 'chore',      label: 'Propose a Chore',  desc: 'For you or a sibling — a parent sets the coins', Icon: ClipboardList, color: BRAND.purple },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          eyebrow="ASK PARENT"
          title="Ask Parent"
          subtitle="Pick what you need help with"
          accent="pink"
          Icon={MessageCircle}
          onTitlePress={onClose}
          topInset={insets.top}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── My Requests — tabbed status view of this kid's own
            kid_requests, above the destination tiles. ── */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Inbox size={16} color={colors.pink} />
            <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textTertiary }}>
              My Requests
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              { key: 'pending' as const,  label: 'Pending',  count: pendingCount },
              { key: 'approved' as const, label: 'Approved', count: undefined },
              { key: 'all' as const,      label: 'All',      count: undefined },
            ]).map(t => {
              const active = tab === t.key;
              return (
                <Pressable key={t.key} onPress={() => setTab(t.key)}
                  style={{
                    flex: 1, borderRadius: 100, paddingVertical: 9, alignItems: 'center',
                    flexDirection: 'row', justifyContent: 'center', gap: 6,
                    backgroundColor: active ? colors.pink : (isDark ? colors.card : GEMINI.cardBg),
                    borderWidth: active ? 0 : 1, borderColor: colors.border,
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: active ? '#fff' : colors.textSecondary }}>
                    {t.label}
                  </Text>
                  {!!t.count && (
                    <View style={{ backgroundColor: active ? 'rgba(255,255,255,0.3)' : colors.pink + '20', borderRadius: 100, minWidth: 18, paddingHorizontal: 5, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '900', color: active ? '#fff' : colors.pink }}>{t.count}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {tabbedRequests.length === 0 ? (
            <View style={{ borderRadius: RADIUS, backgroundColor: cardWhiteBg, padding: 20, alignItems: 'center', gap: 6 }}>
              <Inbox size={26} color={colors.textTertiary} />
              <Text style={{ fontSize: 13, color: colors.textTertiary }}>
                {tab === 'pending' ? 'No pending requests' : tab === 'approved' ? 'Nothing approved yet' : 'No requests yet'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {tabbedRequests.map(req => (
                <RequestCard key={req.id} req={req} colors={colors} isDark={isDark} cardWhiteBg={cardWhiteBg} />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />

        {destinations.map(d => {
          const Icon = d.Icon;
          return (
            <Pressable
              key={d.key}
              onPress={() => onSelect(d.key)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: d.color + (isDark ? '22' : '14'), borderRadius: RADIUS, padding: 16,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 14, backgroundColor: cardWhiteBg,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={22} color={d.color} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>
                  {d.label}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: (isDark ? colors.textSecondary : GEMINI.bodyColor), marginTop: 2 }}>
                  {d.desc}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textTertiary} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
