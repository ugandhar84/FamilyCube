import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { ClipboardCheck, ShoppingCart, Calendar, ListChecks } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';

/**
 * TodayActionGrid — originally a pixel-faithful rebuild of the Figma Make
 * prototype's "QUICK ACTIONS" section (design/Scrollable Content Design/
 * src/App.tsx lines 222-246, src/index.css lines 387-438): a section-title
 * row above a 2x2 grid of pastel tiles. Exact values preserved: grid gap 10,
 * tile min-height 116, padding 15, radius 20; tones lavender/mint/sky/peach
 * (index.css:404-421).
 *
 * The 4th tile ("Send a cheer" / AskFam) was replaced with "Review" —
 * live-reported gap: every tile here was a create/navigate shortcut
 * (Add a task, Groceries, Arrange a ride), with no way to see WHAT'S
 * ALREADY assigned and waiting on the parent — chores submitted for
 * approval, rides needing confirmation, kid requests. ReviewInboxScreen
 * already exists with exactly that data (getParentReviewDeck()) but had no
 * entry point on this screen besides a single-item NeedsYouCard banner.
 * Appreciation (cheering a completed chore) still lives inline on
 * QuestDetailModal/QuestCard once a chore is approved — removing the
 * shortcut here doesn't remove the feature, just a redundant entry point
 * for the thing people actually needed a glanceable count for.
 */
export function TodayActionGrid({
  colors, isDark,
  groceryCount, reviewCount,
  tasksPendingCount, tasksInProgressCount, tasksUnassignedCount, tasksCompletedCount,
  todayEventsCount, pendingRidesCount,
  onCapture, onCreateEvent, onReview,
}: {
  colors: any; isDark: boolean;
  groceryCount: number;
  reviewCount: number;
  tasksPendingCount: number;
  tasksInProgressCount: number;
  tasksUnassignedCount: number;
  tasksCompletedCount?: number;
  todayEventsCount?: number;
  pendingRidesCount?: number;
  onCapture: () => void;
  onCreateEvent: () => void;
  onReview: () => void;
}) {
  // "Schedule" tile's subtitle used to be a static "Describe it, we'll
  // schedule it" regardless of actual calendar state — same class of gap
  // the other 3 tiles already fixed. Prioritize rides needing confirmation
  // (most actionable) over a plain today's-event count, same priority
  // order as the old "Arrange a ride" tile's own subtitle logic.
  const scheduleSubtitle = (pendingRidesCount ?? 0) > 0
    ? `${pendingRidesCount} ride${pendingRidesCount === 1 ? '' : 's'} need confirming`
    : (todayEventsCount ?? 0) > 0
      ? `${todayEventsCount} event${todayEventsCount === 1 ? '' : 's'} today`
      : 'Nothing scheduled today';
  // "Add a task" tile used to collapse all task state into one picked
  // subtitle line ("3 unassigned" OR "2 in progress" OR …) — live-requested:
  // show every count as its own stacked row (Pending / Unassigned / Done
  // today / Review), matching the look of the 4 stat tiles below it
  // (icon → title → value lines) instead of a single summary line or chips.
  const taskStats: { label: string; value: number; color: string }[] = [
    { label: 'Pending',    value: tasksPendingCount,        color: colors.amber },
    { label: 'Unassigned', value: tasksUnassignedCount,     color: colors.pink },
    { label: 'Done today', value: tasksCompletedCount ?? 0, color: colors.teal },
    { label: 'Review',     value: reviewCount,              color: colors.danger },
  ];

  // Exact Figma background colors from index.css (.lavender/.mint/.sky/.peach)
  const tiles = [
    {
      key: 'groceries',
      icon: ShoppingCart,
      tint: colors.teal,
      bg: colors.tealLight,
      title: 'Groceries',
      subtitle: groceryCount > 0 ? `${groceryCount} item${groceryCount === 1 ? '' : 's'} open` : 'List is clear',
      onPress: () => router.push('/(tabs)/grocery' as any),
    },
    {
      key: 'createEvent',
      icon: Calendar,
      tint: colors.sky,
      bg: colors.skyLight,
      title: 'Schedule',
      subtitle: scheduleSubtitle,
      onPress: onCreateEvent,
    },
    {
      key: 'review',
      icon: ListChecks,
      tint: colors.amber,
      bg: colors.amberLight,
      title: 'Review',
      subtitle: reviewCount > 0 ? `${reviewCount} waiting on you` : 'All caught up',
      onPress: onReview,
    },
  ];

  return (
    <View>
      <View style={{ marginHorizontal: 20, marginTop: 26 }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.primary, marginBottom: 6, opacity: 0.6 }} />
          <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>QUICK ACTIONS</Text>
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '400', letterSpacing: -0.5, marginTop: 4 }}>
          Get it done
        </Text>
      </View>
      {/* Back to a true 2x2 grid — "Add a task" is tile #1, same flexBasis
          sizing as the other 3. Icon sits in its own left column, stretched
          to match the full height of the stat rows beside it; the title
          drops to the bottom of the card, same position as every sibling
          tile's title, instead of being squeezed under the icon. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 20, marginTop: 11 }}>
        <AnimatedPressable
          onPress={onCapture}
          style={{
            flexBasis: '47%', flexGrow: 1,
            minHeight: 116,
            borderRadius: 20,
            borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.09)',
            padding: 15,
            backgroundColor: colors.pinkLight,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
            <View style={{ justifyContent: 'center' }}>
              <ClipboardCheck size={30} color={colors.pink} strokeWidth={2} />
            </View>
            <View style={{ gap: 2, justifyContent: 'center' }}>
              {taskStats.map(s => (
                <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: s.color, minWidth: 13 }}>{s.value}</Text>
                  <Text style={{ fontSize: 9, color: colors.textSecondary }} numberOfLines={1}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
            Add a task
          </Text>
        </AnimatedPressable>

        {tiles.map(t => {
          const Icon = t.icon;
          return (
            <AnimatedPressable
              key={t.key}
              onPress={t.onPress}
              style={{
                flexBasis: '47%', flexGrow: 1,
                minHeight: 116,
                borderRadius: 20,
                borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.09)',
                padding: 15,
                justifyContent: 'flex-start',
                backgroundColor: t.bg,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Icon size={28} color={t.tint} strokeWidth={2} />
                {t.key === 'review' && reviewCount > 0 && (
                  <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
                    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                      {reviewCount > 9 ? '9+' : reviewCount}
                    </Text>
                  </View>
                )}
                {t.key === 'createEvent' && (pendingRidesCount ?? 0) > 0 && (
                  <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
                    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                      {(pendingRidesCount ?? 0) > 9 ? '9+' : pendingRidesCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginTop: 15 }} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                {t.subtitle}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}
