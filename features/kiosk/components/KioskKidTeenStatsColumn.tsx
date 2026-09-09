/**
 * KioskKidTeenStatsColumn — the persistent left-side shell for a kid/teen
 * in kiosk mode, replacing the shared nav rail (KioskScreen.tsx's own
 * `rail`) on EVERY tab, not just Overview — same real pattern
 * ParentStatsColumn.tsx already established for parent
 * [live-requested: "did we miss that leftside colum strip for the profile
 * and the tab navigations similar to the parent?" / "we should use the
 * parent style tab navigation and the left side column" / "i dont want
 * nav rail"].
 *
 * Mounted from KioskScreen.tsx alongside its own (hidden, for kid/teen)
 * nav rail — same relationship ParentStatsColumn has to that file. Real
 * data only: mainCoins/gpCoins/streak (same fields the Overview's own
 * KioskMyBalancePanel reads), and a real pending-request count from
 * kidRequestStore (mirroring ParentStatsColumn's own pending-count rows,
 * scoped to this member's own outgoing requests instead of the household's
 * incoming ones).
 *
 * Kid gets one extra pinned action row (Check In) that teen doesn't —
 * KidCheckinRow/CheerSquadSection are real KidView.tsx-only mobile
 * features with no teen equivalent (confirmed: grepped the whole hub/
 * kiosk tree, zero teen matches), so this column does not invent one.
 *
 * My balance sits directly under the identity card — real mainCoins/
 * gpCoins/streak/redemption fields, same as Overview's own
 * KioskMyBalancePanel — for BOTH kid and teen [live-requested: "we can
 * move my balace under the profile hero section" / "one small widget" /
 * "i asked for teens too"].
 *
 * Teen's quick-actions grid (ASK_PARENT_OPTIONS) lives in
 * KioskMyBalancePanel (Overview sideCol) instead of this persistent
 * column — see that file.
 */
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { WidgetCard } from './KioskOS';
import { KioskKidCheckInTile } from './KioskKidQuickActions';
import { useKioskColors, kioskRoleAccent } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { railForRole, type KioskTabKey } from '../kioskTabs';
import { KioskAvatar } from './KioskAvatar';

export function KioskKidTeenStatsColumn({
  active, members, familyName, activeTab, onNavigate, onLongPressIdentity,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  familyName: string;
  activeTab: KioskTabKey;
  onNavigate: (tab: KioskTabKey) => void;
  /** Long-press on the identity card below opens the real
   *  EditMyProfileSheet (name/DOB/email/avatar) — same reasoning as
   *  ParentStatsColumn.tsx's own onLongPressIdentity. Optional so this
   *  column still renders if a caller doesn't wire it up. */
  onLongPressIdentity?: () => void;
}) {
  const { k, isDark } = useKioskColors();
  const isKid = active.role === 'kid';
  // Own coin balance only — no chores/streak/redeemed summary mixed in
  // (that combined card was removed per "undee the first column we have
  // the coins along with stats.. remove that completely"), but the raw
  // balance itself stays, on the kid/teen's OWN screen only, per explicit
  // follow-up: "hey keep kids coins in thor [their] account". The parent's
  // own sidebar (ParentStatsColumn.tsx) has no equivalent — a parent sees
  // every kid's balance in Overview's own Coin Jars widget instead.
  const total = ((active as any).mainCoins ?? 0) + ((active as any).gpCoins ?? 0);

  const pendingRequestCount = useKidRequestStore(
    s => s.requests.filter(r => r.fromMemberId === active.id && r.status === 'pending').length,
  );

  return (
    <View style={s.statsCol}>
      <WidgetCard k={k} isDark={isDark} style={s.statsIdentityCard}>
        {/* Long-press opens EditMyProfileSheet — same reasoning as
            ParentStatsColumn.tsx's own identity card [live-requested:
            "remove the heroin the profile as we aalready have it in the
            static side bar we can add that fuctionality long press"]. */}
        <Pressable
          onLongPress={onLongPressIdentity}
          style={s.statsIdentity}
          accessibilityRole="button"
          accessibilityLabel={`${active.name}'s profile`}
          accessibilityHint="Long-press to edit your name, birthday, email or photo"
        >
          <KioskAvatar
            name={active.name}
            emoji={active.emoji}
            avatarUrl={active.avatarUrl}
            siblings={members.filter(x => x.id !== active.id).map(x => x.name)}
            size={44}
            borderRadius={KIOSK_RADIUS.md}
            style={{ marginBottom: KIOSK_SPACE.sm }}
            bgColor={kioskRoleAccent(k, active.role) + (isDark ? '26' : '18')}
            k={k}
          />
          <Text style={[s.statsName, { color: k.text }]} numberOfLines={1}>{active.name?.trim().split(' ')[0]}</Text>
          <Text style={[s.statsSub, { color: k.textMuted }]} numberOfLines={1}>{familyName}</Text>
        </Pressable>
      </WidgetCard>

      <ScrollView style={s.statsColScrollBody} contentContainerStyle={s.statsColScroll} showsVerticalScrollIndicator={false}>
        {/* Own coin balance — back directly under the identity card, its
            original position [live-requested: "undee the first column we
            have the coins along with stats.. remove that completely" then
            corrected: "oh shit we had that previously just below the
            identiy card right in kids and the teens - we just need to
            being that back"]. Plain number only now — no chores/streak/
            redeemed summary attached, that combined card stays removed.
            Real mainCoins/gpCoins, same fields Overview's own
            KioskMyBalancePanel/Store tab read. */}
        <WidgetCard k={k} isDark={isDark}>
          <View style={s.statsRow}>
            <Text style={[s.statsLabel, { color: k.textMuted }]} numberOfLines={1}>My balance</Text>
            <Text style={[s.statsValue, { color: k.gold }]}>{total} coins</Text>
          </View>
        </WidgetCard>

        <WidgetCard k={k} isDark={isDark} padded={false}>
          <View style={{ borderRadius: KIOSK_RADIUS.sm, overflow: 'hidden' }}>
            {railForRole(active.role).map((item, i) => {
              const isActive = item.key === activeTab;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => onNavigate(item.key)}
                  disabled={isActive}
                  style={({ pressed }) => [
                    s.railTabRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder },
                    isActive
                      ? { backgroundColor: k.primary }
                      : { backgroundColor: pressed ? k.cardHover : 'transparent' },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={item.label}
                >
                  <item.Icon size={16} color={isActive ? k.onPrimary : k.textMuted} />
                  <Text style={[s.railTabLabel, { color: isActive ? k.onPrimary : k.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </WidgetCard>

        {/* Pending requests — real kidRequestStore count, kept as its own
            small card now that the coin/streak summary moved up to sit
            directly under the identity card instead. Shown for both kid
            and teen (a teen's own requests count is just as real). */}
        {pendingRequestCount > 0 && (
          <WidgetCard k={k} isDark={isDark}>
            <View style={s.statsRow}>
              <Text style={[s.statsLabel, { color: k.textMuted }]} numberOfLines={2}>Requests waiting on a parent</Text>
              <Text style={[s.statsValue, { color: k.text }]}>{pendingRequestCount}</Text>
            </View>
          </WidgetCard>
        )}

        {/* Check In — real KidView.tsx-only feature (KidCheckinRow), no
            teen equivalent on the real phone. */}
        {isKid && (
          <WidgetCard k={k} isDark={isDark} padded={false} style={{ padding: KIOSK_SPACE.sm }}>
            <KioskKidCheckInTile active={active} />
          </WidgetCard>
        )}
      </ScrollView>
      {/* Ask Fam removed for kid/teen — same "no AI-shaped surface" scope
          decision already applied to senior [live-requested: "remove the
          askFam for kids and teaans as well.."]. Ask Fam itself remains
          real AI now (Ask Cube backend) and is parent-only. */}
    </View>
  );
}

const s = StyleSheet.create({
  // Same real sizing/spacing as ParentStatsColumn.tsx — see that file's
  // own comments for the width/marginTop/marginLeft provenance.
  statsCol: { width: 240, gap: KIOSK_SPACE.md, marginTop: KIOSK_SPACE.lg, marginLeft: KIOSK_SPACE.lg },
  statsColScrollBody: { flex: 1 },
  statsColScroll: { gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md },
  statsIdentityCard: { paddingVertical: 22, paddingHorizontal: 20 },
  statsIdentity: { alignItems: 'flex-start' },
  statsAvatar: {
    width: 44, height: 44, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: KIOSK_SPACE.sm,
  },
  statsAvatarEmoji: { fontSize: 20 },
  statsName: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
  statsSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.sm,
  },
  statsLabel: { flex: 1, fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  statsValue: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  railTabRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control,
  },
  railTabLabel: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  messageKidsBtn: {
    borderRadius: KIOSK_RADIUS.sm, padding: KIOSK_SPACE.md,
    minHeight: KIOSK_HIT.control,
  },
  askFamRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  messageKidsTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  messageKidsSub: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 2, opacity: 0.75 },
});
