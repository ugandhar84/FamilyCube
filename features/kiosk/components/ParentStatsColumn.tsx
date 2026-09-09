/**
 * ParentStatsColumn — the persistent left-side shell for a parent in kiosk
 * mode, replacing the shared nav rail (KioskScreen.tsx's own `rail`) on
 * EVERY tab, not just Overview.
 *
 * ── Why this moved out of KioskOverviewTab.tsx ───────────────────────────
 * Live-corrected: the first version of this lived inside KioskOverviewTab
 * and only rendered while `effectiveTab === 'overview'` — tapping into
 * Meals from it meant the whole shell (including this column) disappeared
 * and a real tab switch happened, which is exactly the "still navigates
 * away like before" behavior that was reported as wrong. The actual ask:
 * "the side [column] will stay as it is with page links and the stats on
 * any page — and when user clicks on it it should only replace the tab,
 * rest of the screen [stays]." That means this column is a PERSISTENT
 * SHELL mounted at the KioskScreen level, independent of which tab is
 * active — the same relationship KioskHeader already has to every screen,
 * just for the left side instead of the top.
 *
 * Mounted from KioskScreen.tsx alongside its own (hidden, for a parent)
 * nav rail — see that file's own render for exactly where. Its own data
 * (pending approval counts, kid balances) is derived here independently,
 * not threaded down from KioskOverviewTab, since this column now renders
 * whether or not KioskOverviewTab itself is even mounted.
 */
import { useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Animated } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { WidgetCard } from './KioskOS';
import { useKioskColors, kioskRoleAccent, type KioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { railForRole, type KioskTabKey } from '../kioskTabs';
import { KioskAvatar } from './KioskAvatar';

export function ParentStatsColumn({
  active, members, familyName, activeTab, onNavigate, onAskFam, onLongPressIdentity,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  /** Shown under the active member's name — replaces the header's own
   *  family-name text (removed from there as redundant: same info, once
   *  is enough). */
  familyName: string;
  /** The screen's real current tab (KioskScreen.tsx's `effectiveTab`) —
   *  this column highlights whichever row actually matches, rather than
   *  assuming Overview is always the active one. */
  activeTab: KioskTabKey;
  onNavigate: (tab: KioskTabKey) => void;
  /** Opens the real AskCubeChat AI (KioskScreen.tsx wires this to the same
   *  askCubeOpen state the header's own Ask Cube button uses) — live-
   *  corrected: this slot was "Message the kids" (a quick note to family
   *  chat), swapped back to the Ask Fam feature this column's pinned-action
   *  slot originally carried, and later upgraded from the local, non-AI
   *  KioskAskFamDrawer lookup to the real AI to match mobile's parent
   *  experience [live-requested: "Have Ask Fam actually call the real AI
   *  backend"]. */
  onAskFam: () => void;
  /** Long-press on the identity card below opens the real
   *  EditMyProfileSheet (name/DOB/email/avatar) — the Profile tab's own
   *  hero card is hidden on kiosk since this identity is already always
   *  visible here [live-requested: "remove the heroin the profile as we
   *  aalready have it in the static side bar we can add that fuctionality
   *  long press"]. Optional so this column still renders if a caller
   *  doesn't wire it up. */
  onLongPressIdentity?: () => void;
}) {
  const { k, isDark } = useKioskColors();
  // Live-corrected: the mock's own 300px (grid-template-columns: 300px 1fr
  // 340px) rendered visibly oversized on a real device — a live screenshot
  // showed this column eating roughly a third of the screen instead of a
  // real ~13%. Rather than keep chasing a window-relative formula (the
  // window-percentage version before this had the same problem), this is
  // now a plain fixed width sized to its own content: the tab list's
  // longest real label ("Memories"/"School") plus its icon and padding —
  // "fit to the content," not a fraction of window width.

  // Chores-pending/redemptions/kid-requests/coin-balance summary card
  // removed entirely — same "no duplicate stats sidebar" direction as the
  // kid/teen column's own coin card [live-requested: "undee the first
  // column we have the coins along with stats.. remove that completely"
  // — confirmed to include this parent-side card too]. That data is still
  // real and visible in Overview's own Approvals panel and Coin Jars
  // widget; this only removes the duplicate sidebar summary.

  return (
    <View style={s.statsCol}>
      {/* Live-requested: identity is STICKY (always visible, never
          scrolls away) — pulled out of the ScrollView entirely rather
          than a real position:sticky (RN's ScrollView doesn't support
          sticky children the way a web page does; a plain sibling above
          the scroll area is the correct RN equivalent, and simpler than
          stickyHeaderIndices for a single always-visible card). The
          household tools row (Broadcast/Lock Kiosk/Dim to Standby) was
          removed per live direction — those same three actions already
          live in KioskHeader's own Announcement/Lock/Standby buttons, and
          having them twice was judged redundant rather than a helpful
          second access point. */}
      {/* Mock's own .identity is 22px/20px padding — genuinely more than
          the generic .panel-head's 16px/18px/10px every other card uses
          (WidgetCard's own default KIOSK_SPACE.md=14 padding). Live-
          requested to match that real, larger identity padding rather
          than the shared default. */}
      <WidgetCard k={k} isDark={isDark} style={s.statsIdentityCard}>
        {/* Long-press opens EditMyProfileSheet (name/DOB/email/avatar) —
            this identity card is the only place that self-edit action
            lives now that the Profile tab's own hero card is hidden on
            kiosk [live-requested: "remove the heroin the profile as we
            aalready have it in the static side bar we can add that
            fuctionality long press"]. No onPress — a plain tap here
            already means nothing elsewhere in this column, so only
            long-press is claimed, avoiding a surprise action on a casual
            tap. */}
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

      {/* Own ScrollView, same "scrolls independently, pinned action stays
          put" shape as KioskScreen.tsx's shared nav rail (its Ask Fam card
          below the tab list) — a real multi-column page has each column
          handle its own overflow, not one shared page-level scroll. Now
          holds the tab list + stats only — identity is the sticky header
          above it, Ask Family AI is the pinned footer below it. */}
      <ScrollView style={s.statsColScrollBody} contentContainerStyle={s.statsColScroll} showsVerticalScrollIndicator={false}>
        {/* This column's own copy of the tab list — the actual replacement
            for KioskScreen.tsx's shared nav rail, hidden for a parent on
            every tab now, not just Overview. Same railForRole/onNavigate
            every other tab already uses, laid out to fit here. Highlights
            `activeTab`, whichever tab that really is — not hardcoded to
            Overview, which was the bug in the first version of this. */}
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

      </ScrollView>

      {/* "Ask Fam" — shortened from "Ask Family AI" with no subtitle
          [live-requested: "In the first column instead of the ask FAmily
          AI - jus tname it Ask Fam no subtitle needed and make this
          animated pulse"]. Opens the real AI (AskCubeChat) for a parent —
          see KioskScreen.tsx's own onAskFam wiring; this button's own
          behavior is unchanged, only its label/subtitle/animation. */}
      <Pressable
        onPress={onAskFam}
        style={({ pressed }) => [s.askFamBtn, { backgroundColor: pressed ? k.cardHover : k.text }]}
        accessibilityRole="button"
        accessibilityLabel="Ask Fam"
        accessibilityHint="Ask the family AI anything"
      >
        <View style={s.askFamRow}>
          <PulseSparkle color={k.purple} />
          <Text style={[s.askFamText, { color: k.card }]}>Ask Fam</Text>
        </View>
      </Pressable>
    </View>
  );
}

// A gently pulsing scale/opacity loop on the sparkle icon — draws the eye
// to the AI entry point without a full attention-badge (this isn't tied to
// a pending count the way PulseDot on the Approvals chip is; it's just the
// button's own idle state) [live-requested: "make this animated pulse"].
function PulseSparkle({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });
  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      {/* Filled, not just outlined [live-requested: "Ask Fam!  aicon should
          fill with color"]. */}
      <Sparkles size={16} color={color} fill={color} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // width set inline per-render from colWidth (real window-relative), not
  // here — see the component body's own comment.
  // flex:1 so the ScrollView between the sticky identity header and the
  // pinned Ask Family AI footer actually claims the real remaining
  // vertical space, rather than just stacking by content height.
  //
  // width, NOT flex — this column is itself a child of KioskScreen.tsx's
  // s.row (flexDirection:'row'), where `flex` means "grow HORIZONTALLY."
  // A real, live-caught bug: an earlier version had `flex:1` here (meant
  // to make the inner ScrollView fill remaining vertical space) and it
  // instead made this WHOLE column compete for the row's width on equal
  // footing with the content area beside it — visibly ~1/3 of the screen
  // on a real device instead of a real ~13%. The row's default
  // alignItems:'stretch' already gives this column the row's full HEIGHT
  // with no flex needed for that; width is fixed content-driven instead
  // (see this component body's own comment on colWidth's replacement).
  // marginTop/marginLeft both match the REAL sibling columns' own spacing
  // exactly — KioskOverviewTab.tsx's s.scroll uses padding: KIOSK_SPACE.lg
  // (20) on every edge, so centerCol/sideCol sit 20px below the header AND
  // 20px in from their own left edge. This column previously had neither:
  // marginTop matched the shared nav rail's smaller 10px instead (the
  // wrong reference point — the sibling content columns are what it
  // visually sits beside now, not the rail it replaced), and had no left
  // inset at all, sitting flush at the screen's true x=0 since
  // KioskScreen.tsx's s.row carries no horizontal padding of its own.
  // Narrower than the previous 240 [live-requested: "reduce the width
  // right.. max this col width is like this - if the min is fit to
  // content.."] — 200 still comfortably fits the longest real tab label
  // ("Memories"/"School") plus its icon and padding, and gives the main
  // content area more room.
  statsCol: { width: 200, gap: KIOSK_SPACE.md, marginTop: KIOSK_SPACE.lg, marginLeft: KIOSK_SPACE.lg },
  // flex:1 here is correct — this is INSIDE statsCol (a flexDirection:
  // 'column' by default), where flex:1 correctly means "fill remaining
  // VERTICAL space" between the sticky identity header above and the
  // pinned Ask Family AI footer below.
  statsColScrollBody: { flex: 1 },
  statsColScroll: { gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md },
  // Mock's exact .identity padding (22px 20px) — overrides WidgetCard's
  // shared 14px default for this card specifically.
  statsIdentityCard: { paddingVertical: 22, paddingHorizontal: 20 },
  statsIdentity: { alignItems: 'flex-start' },
  statsAvatar: {
    width: 44, height: 44, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: KIOSK_SPACE.sm,
  },
  statsAvatarEmoji: { fontSize: 20 },
  statsName: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
  statsSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  railTabRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control,
  },
  railTabLabel: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  // No subtitle line now — just the icon + short "Ask Fam" label, centered
  // in a shorter button [live-requested: "jus tname it Ask Fam no
  // subtitle needed"].
  askFamBtn: {
    borderRadius: KIOSK_RADIUS.sm, paddingVertical: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control, alignItems: 'center', justifyContent: 'center',
  },
  askFamRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  askFamText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  toolsCol: { gap: KIOSK_SPACE.xs },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.control,
  },
  toolIcon: { fontSize: 16 },
  toolLabel: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
});
