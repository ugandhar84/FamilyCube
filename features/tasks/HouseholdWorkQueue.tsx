/**
 * HouseholdWorkQueue — "Share the load"
 *
 * 100% faithful to Figma node 90:12437 layout, re-skinned in the Kinfolk
 * palette. Every measurement is transcribed from the Figma spec:
 *
 * Outer scroll: padding 24 all sides, gap 20 between sections
 * Summary metrics: full-width rows, r=14, pad 12, gap 12 (icon+label), h=53
 * Filter pill row: r=14, pad 4, gap 4; active pill r=11, pad 5
 * Sort pill: r=100, pad 5/10
 * Status group card: r=22, pad 18, gap 12 (vertical); white bg
 * Group heading: gap 12, icon 20×20, title fs=20 fw=600
 * Supporting info: fs=13 fw=500 color=textSecondary
 * Queue item: gap 8 (vertical), paddingTop 12, separator 1px between items
 * Work category row: fs=11 fw=600 (category tag) · fs=13 fw=500 (due, textPrimary)
 * Reward work identity sub-block: gap 8; title fs=16 fw=600; owner/assignee fs=13 fw=500 textSecondary
 * Blocking person: fs=13 fw=500 (textPrimary for neutral, danger for urgent)
 * Reward/coins policy: fs=13 fw=500 colors.pink
 * Last update: fs=13 fw=500 textSecondary
 * CTA button: r=14, pad 16 (vertical), fs=15 fw=600 white; full-width
 * Footer text: fs=13 fw=500 textSecondary
 * Signature: fs=11 fw=600 textSecondary
 *
 * Figma color → Kinfolk token:
 *   rgba(233,239,255) Unassigned  → colors.amberLight
 *   rgba(238,231,252) Locked      → colors.pinkLight
 *   rgba(255,232,227) Pending     → colors.primaryLight
 *   rgba(221,245,236) Outgoing    → colors.tealLight
 *   rgba(52,93,227)  primary CTA  → colors.primary
 *   rgba(41,79,199)  teal links   → colors.teal
 *   rgba(115,80,192) reward/coins → colors.pink
 *   rgba(175,69,58)  urgent       → colors.danger
 */
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { router } from 'expo-router';
import { CircleDashed, Lock, ClipboardCheck, Send, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';

type FilterKey = 'all' | 'tasks' | 'rewards';

// ─── Shared primitives ────────────────────────────────────────────────────────

/** Figma "Work category" row: tag + due date side by side */
function CategoryRow({ category, categoryColor, due, textPrimary, textSecondary }: {
  category: string; categoryColor: string;
  due?: string; textPrimary: string; textSecondary: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: categoryColor, lineHeight: 15.4 }}>
        {category}
      </Text>
      {due && (
        <Text style={{ fontSize: 13, fontWeight: '500', color: textPrimary, lineHeight: 18.2 }}>
          · {due}
        </Text>
      )}
    </View>
  );
}

/** Figma "Reward work identity": title + owner/assignee sub-block */
function WorkIdentity({ title, ownerAssignee, textPrimary, textSecondary }: {
  title: string; ownerAssignee?: string; textPrimary: string; textSecondary: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: textPrimary, lineHeight: 22.4 }} numberOfLines={2}>
        {title}
      </Text>
      {ownerAssignee && (
        <Text style={{ fontSize: 13, fontWeight: '500', color: textSecondary, lineHeight: 18.2 }}>
          {ownerAssignee}
        </Text>
      )}
    </View>
  );
}

/** Figma "Family Cube domain module" — the tinted info block for tasks with no coins */
function DomainModule({ lines, bg, color }: { lines: string[]; bg: string; color: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 22, padding: 12, gap: 0 }}>
      {lines.map((l, i) => (
        <Text key={i} style={{ fontSize: 15, fontWeight: '500', color, lineHeight: 21 }}>
          {l}
        </Text>
      ))}
    </View>
  );
}

/** One queue item row — separator above except first item in card */
function QueueItem({ isFirst, onPress, children }: {
  isFirst: boolean; onPress?: () => void; children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ([
        {
          paddingTop: 12,
          borderTopWidth: isFirst ? 0 : 1,
        } as any,
        pressed && { opacity: 0.75 },
      ])}
    >
      {children}
    </Pressable>
  );
}

/** Group heading: icon + "State · count" title */
function GroupHeading({ icon, title, textPrimary }: {
  icon: React.ReactNode; title: string; textPrimary: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <Text style={{ fontSize: 20, fontWeight: '600', color: textPrimary, lineHeight: 28, flex: 1 }}>
        {title}
      </Text>
    </View>
  );
}

/** Status group card (white bg, r=22, pad 18, gap 12) */
function StatusGroup({ heading, subtitle, children, colors, isDark }: {
  heading: React.ReactNode; subtitle: string; children: React.ReactNode;
  colors: any; isDark: boolean;
}) {
  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: 22,
      borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
      paddingTop: 18, paddingBottom: 18, paddingLeft: 18, paddingRight: 18,
      gap: 12,
      shadowColor: '#2C3244',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0 : 0.045,
      shadowRadius: 20,
    }}>
      {heading}
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18.2 }}>
        {subtitle}
      </Text>
      <View style={{ borderTopWidth: 1, borderTopColor: isDark ? colors.border : 'rgba(223,97,60,0.08)', marginTop: -4 }}>
        {children}
      </View>
    </View>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function HouseholdWorkQueue({ activeMemberId }: { activeMemberId: string }) {
  const { colors, isDark } = useTheme();
  const { members } = useFamilyStore();
  const { chores, parentAssignments, getParentReviewDeck, getMyOutgoingPending } = useChoreStore();

  const [filter, setFilter] = useState<FilterKey>('all');

  const firstName = (id?: string | null) =>
    id ? (members.find(m => m.id === id)?.name?.split(' ')[0] ?? null) : null;

  const fmtDue = (c: ChoreTask): string | undefined => {
    if (!c.dueDate) return undefined;
    const today = new Date().toISOString().slice(0, 10);
    const base = c.dueDate === today ? 'Today' : c.dueDate;
    return c.dueTime ? `${base} · ${c.dueTime}` : base;
  };

  const fmtAssignmentDue = (a: ParentQuestAssignment): string | undefined => {
    const chore = chores.find(c => c.id === a.choreId);
    return chore ? fmtDue(chore) : undefined;
  };

  const fmtUpdate = (iso?: string | null, suffix?: string) => {
    if (!iso) return undefined;
    const d = iso.slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const label = d === today ? 'today' : d;
    return `Last update ${label}${suffix ? ` · ${suffix}` : ''}`;
  };

  // ── Buckets ────────────────────────────────────────────────────────────────
  const unassigned = chores.filter(c =>
    (c.status === 'todo') && !c.assignedToId && c.isPool !== false
  );
  const locked = chores.filter(c => c.status === 'in_progress');
  const pendingReview = getParentReviewDeck();
  const outgoing = getMyOutgoingPending(activeMemberId);

  // filter-aware buckets
  const isReward = (c: ChoreTask) => !!c.coinsReward && c.coinsReward > 0;
  const applyFilter = (items: ChoreTask[]) => {
    if (filter === 'all') return items;
    if (filter === 'rewards') return items.filter(isReward);
    return items.filter(c => !isReward(c));
  };

  const fUnassigned    = applyFilter(unassigned);
  const fLocked        = applyFilter(locked);
  const fPending       = filter === 'rewards'
    ? pendingReview.filter(c => !!c.coinsReward)
    : filter === 'tasks' ? pendingReview.filter(c => !c.coinsReward)
    : pendingReview;
  const fOutgoing      = filter === 'rewards' ? [] : outgoing; // outgoing are tasks

  const totalShown = fUnassigned.length + fLocked.length + fPending.length + fOutgoing.length;

  // Figma metric bg colors → Kinfolk tokens
  const metricBg = isDark
    ? [colors.amberLight, colors.pinkLight, colors.primaryLight, colors.tealLight]
    : ['#FDF1D6', '#EFE8F8', '#FBEADF', '#E1EFE7'];

  const metrics = [
    { count: unassigned.length, label: 'Unassigned',        bg: metricBg[0], color: colors.amber   },
    { count: locked.length,     label: 'Locked / not done', bg: metricBg[1], color: colors.pink    },
    { count: pendingReview.length, label: 'Pending review', bg: metricBg[2], color: colors.primary },
    { count: outgoing.length,   label: 'Outgoing / delegated', bg: metricBg[3], color: colors.teal },
  ];

  // Figma filter pill bg
  const pillBg = isDark ? colors.surface : '#E9EBF2';

  // Figma "domain module" bg for task cards (no coins) → amberLight tint
  const taskModuleBg  = isDark ? colors.amberLight : '#F5F2E8';
  const taskModuleClr = isDark ? colors.amber : colors.teal;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: 24, paddingBottom: 40,
        paddingLeft: 24, paddingRight: 24,
        gap: 20,
      }}
    >
      {/* Page introduction */}
      <View style={{ gap: 8 }}>
        {/* Figma: back link fs=13 fw=500 color=teal */}
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal, lineHeight: 18.2 }}>
          TASKS / HOUSEHOLD WORK QUEUE
        </Text>
        {/* Page title fs=29 fw=700 */}
        <Text style={{ fontSize: 29, fontWeight: '700', color: colors.textPrimary, lineHeight: 40.6 }}>
          Share the load
        </Text>
      </View>

      {/* Supporting info fs=13 fw=500 textSecondary */}
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18.2, marginTop: -12 }}>
        All household work, with the next person clearly named.
      </Text>

      {/* Status summary — 4 full-width metric rows, r=14, pad 12, gap 12 */}
      <View style={{ gap: 8 }}>
        {metrics.map(m => (
          <View key={m.label} style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: m.bg, borderRadius: 14,
            paddingTop: 12, paddingBottom: 12, paddingLeft: 12, paddingRight: 12,
          }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.textPrimary, lineHeight: 29, minWidth: 32 }}>
              {m.count}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18.2 }}>
              {m.label}
            </Text>
          </View>
        ))}
      </View>

      {/* View filters — pill row r=14 pad 4 gap 4; active pill r=11 pad 5 */}
      <View style={{
        flexDirection: 'row', gap: 4,
        backgroundColor: pillBg, borderRadius: 14,
        paddingTop: 4, paddingBottom: 4, paddingLeft: 4, paddingRight: 4,
      }}>
        {([
          ['all',     `All · ${unassigned.length + locked.length + pendingReview.length + outgoing.length}`],
          ['tasks',   'Tasks'],
          ['rewards', 'Rewards'],
        ] as [FilterKey, string][]).map(([key, label]) => {
          const active = filter === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setFilter(key)}
              style={{
                flex: 1, borderRadius: 11,
                paddingTop: 5, paddingBottom: 5, paddingLeft: 5, paddingRight: 5,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: active ? colors.card : 'transparent',
                shadowColor: active ? '#2C3244' : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: active ? 0.06 : 0,
                shadowRadius: 4,
              }}
            >
              <Text style={{
                fontSize: 13, fontWeight: '400', lineHeight: 15.7,
                color: active ? colors.primary : colors.textSecondary,
              }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Sort chip — "All members ▾ · Due date ↑" fs=12 fw=600 */}
      <View style={{
        alignSelf: 'flex-start',
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: isDark ? colors.primaryLight : '#FBEADF',
        borderRadius: 100,
        paddingTop: 5, paddingBottom: 5, paddingLeft: 10, paddingRight: 10,
        marginTop: -12,
      }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary, lineHeight: 14.5 }}>
          All members ▾ · Due date ↑
        </Text>
      </View>

      {/* ── Unassigned ──────────────────────────────────────────────────────── */}
      {fUnassigned.length > 0 && (
        <StatusGroup
          heading={
            <GroupHeading
              icon={<CircleDashed size={16} color={colors.amber} strokeWidth={2} />}
              title={`Unassigned · ${fUnassigned.length}`}
              textPrimary={colors.textPrimary}
            />
          }
          subtitle="Open to eligible members. No one is assigned yet."
          colors={colors} isDark={isDark}
        >
          {fUnassigned.map((c, i) => {
            const ownerName = firstName(c.createdById);
            const hasCoins = isReward(c);
            return (
              <QueueItem key={c.id} isFirst={i === 0} onPress={() => router.push('/(tabs)/quests' as any)}>
                <View style={{ gap: 8 }}>
                  <CategoryRow
                    category={hasCoins ? 'Reward chore' : 'Household task'}
                    categoryColor={hasCoins ? colors.pink : colors.teal}
                    due={fmtDue(c)}
                    textPrimary={colors.textPrimary}
                    textSecondary={colors.textSecondary}
                  />
                  {hasCoins ? (
                    <WorkIdentity
                      title={c.title}
                      ownerAssignee={`Owner ${ownerName ?? '—'} · Assignee none`}
                      textPrimary={colors.textPrimary}
                      textSecondary={colors.textSecondary}
                    />
                  ) : (
                    <DomainModule
                      lines={[
                        c.title,
                        `Owner ${ownerName ?? '—'} · Assignee none`,
                        'General household task · no coins',
                      ]}
                      bg={taskModuleBg}
                      color={taskModuleClr}
                    />
                  )}
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18.2 }}>
                    {hasCoins
                      ? 'Next: an eligible member to claim'
                      : `Next: ${ownerName ?? 'owner'} to assign or take responsibility`}
                  </Text>
                  {hasCoins && (
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.pink, lineHeight: 18.2 }}>
                      {c.coinsReward} coins only after proof + approval
                    </Text>
                  )}
                  {c.updatedAt && (
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18.2 }}>
                      Updated {c.updatedAt.slice(0, 10) === new Date().toISOString().slice(0, 10) ? 'today' : c.updatedAt.slice(0, 10)}
                      {ownerName ? ` · ${ownerName}` : ''}
                    </Text>
                  )}
                </View>
              </QueueItem>
            );
          })}
        </StatusGroup>
      )}

      {/* ── Locked / claimed ────────────────────────────────────────────────── */}
      {fLocked.length > 0 && (
        <StatusGroup
          heading={
            <GroupHeading
              icon={<Lock size={15} color={colors.pink} strokeWidth={2} />}
              title={`Locked / claimed · ${fLocked.length}`}
              textPrimary={colors.textPrimary}
            />
          }
          subtitle="Claimed is not complete. Locked to prevent duplicate work."
          colors={colors} isDark={isDark}
        >
          {fLocked.map((c, i) => {
            const ownerName  = firstName(c.createdById);
            const assignName = firstName(c.assignedToId);
            const hasCoins = isReward(c);
            return (
              <QueueItem key={c.id} isFirst={i === 0} onPress={() => router.push('/(tabs)/quests' as any)}>
                <View style={{ gap: 8 }}>
                  <CategoryRow
                    category={hasCoins ? 'Reward chore' : 'Household task'}
                    categoryColor={hasCoins ? colors.pink : colors.teal}
                    due={fmtDue(c)}
                    textPrimary={colors.textPrimary}
                    textSecondary={colors.textSecondary}
                  />
                  <WorkIdentity
                    title={c.title}
                    ownerAssignee={`Owner ${ownerName ?? '—'} · Assignee ${assignName ?? '—'}`}
                    textPrimary={colors.textPrimary}
                    textSecondary={colors.textSecondary}
                  />
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18.2 }}>
                    Waiting on {assignName ?? 'assignee'} · work in progress
                  </Text>
                  {hasCoins && (
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.pink, lineHeight: 18.2 }}>
                      {c.coinsReward} coins on approval · none earned yet
                    </Text>
                  )}
                  {c.updatedAt && (
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18.2 }}>
                      Last update {c.updatedAt.slice(0, 10) === new Date().toISOString().slice(0, 10) ? 'today' : c.updatedAt.slice(0, 10)} · {assignName ?? ''} claimed
                    </Text>
                  )}
                </View>
              </QueueItem>
            );
          })}
        </StatusGroup>
      )}

      {/* ── Pending review ──────────────────────────────────────────────────── */}
      {fPending.length > 0 && (
        <StatusGroup
          heading={
            <GroupHeading
              icon={<ClipboardCheck size={14} color={colors.primary} strokeWidth={2} />}
              title={`Pending review · ${fPending.length}`}
              textPrimary={colors.textPrimary}
            />
          }
          subtitle="Evidence submitted; not yet approved or awarded."
          colors={colors} isDark={isDark}
        >
          {fPending.map((c, i) => {
            const ownerName  = firstName(c.createdById);
            const assignName = firstName(c.assignedToId);
            const isQuest    = c.categoryType === 'bounty';
            return (
              <QueueItem key={c.id} isFirst={i === 0} onPress={() => router.push('/(tabs)/quests' as any)}>
                <View style={{ gap: 8 }}>
                  <CategoryRow
                    category={isQuest ? 'Reward quest' : 'Reward chore'}
                    categoryColor={colors.pink}
                    due={fmtDue(c)}
                    textPrimary={colors.textPrimary}
                    textSecondary={colors.textSecondary}
                  />
                  <WorkIdentity
                    title={c.title}
                    ownerAssignee={`Owner ${ownerName ?? '—'} · Assignee ${assignName ?? '—'}`}
                    textPrimary={colors.textPrimary}
                    textSecondary={colors.textSecondary}
                  />
                  {/* Figma: blocking person is danger color for pending review */}
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.danger, lineHeight: 18.2 }}>
                    Waiting on you · {isQuest ? 'final stage review' : 'proof review'}
                  </Text>
                  {c.coinsReward && (
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.pink, lineHeight: 18.2 }}>
                      {c.coinsReward} pending coins excluded from {assignName ?? 'their'}'s balance
                    </Text>
                  )}
                  {c.updatedAt && (
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18.2 }}>
                      {fmtUpdate(c.updatedAt, assignName ?? undefined)}
                    </Text>
                  )}
                </View>
              </QueueItem>
            );
          })}
        </StatusGroup>
      )}

      {/* ── Outgoing / delegated ────────────────────────────────────────────── */}
      {fOutgoing.length > 0 && (
        <StatusGroup
          heading={
            <GroupHeading
              icon={<Send size={15} color={colors.teal} strokeWidth={2} />}
              title={`Outgoing / delegated · ${fOutgoing.length}`}
              textPrimary={colors.textPrimary}
            />
          }
          subtitle="Owner and assignee are different. Hand-off is still open."
          colors={colors} isDark={isDark}
        >
          {fOutgoing.map((a, i) => {
            const chore      = chores.find(c => c.id === a.choreId);
            const ownerName  = firstName(a.assignedBy);
            const assignName = firstName(a.assignedTo);
            return (
              <QueueItem key={a.id} isFirst={i === 0} onPress={() => router.push('/(tabs)/tasks' as any)}>
                <View style={{ gap: 8 }}>
                  <CategoryRow
                    category="Household task"
                    categoryColor={colors.teal}
                    due={fmtAssignmentDue(a)}
                    textPrimary={colors.textPrimary}
                    textSecondary={colors.textSecondary}
                  />
                  <DomainModule
                    lines={[
                      chore?.title ?? '—',
                      `Owner ${ownerName ?? '—'} · Assignee ${assignName ?? '—'}`,
                      'General household task · no coins',
                    ]}
                    bg={taskModuleBg}
                    color={taskModuleClr}
                  />
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18.2 }}>
                    Waiting on {assignName ?? 'assignee'} · acknowledgement / not started
                  </Text>
                  {a.createdAt && (
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18.2 }}>
                      Last update {a.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10) ? 'today' : a.createdAt.slice(0, 10)} · {ownerName ?? ''} assigned
                    </Text>
                  )}
                </View>
              </QueueItem>
            );
          })}
        </StatusGroup>
      )}

      {/* Empty state */}
      {totalShown === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <ClipboardCheck size={36} color={colors.teal} strokeWidth={1.5} />
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, marginTop: 14, lineHeight: 28 }}>
            All caught up
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 18.2 }}>
            No work is pending, in progress, or awaiting review.
          </Text>
        </View>
      )}

      {/* CTA — Figma: full-width, r=14, pad 16 (vert), fs=15 fw=600 */}
      <TouchableOpacity
        onPress={() => router.push('/(tabs)/tasks' as any)}
        style={{
          borderRadius: 14,
          paddingTop: 16, paddingBottom: 16, paddingLeft: 16, paddingRight: 16,
          backgroundColor: colors.primary,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.28,
          shadowRadius: 12,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff', lineHeight: 18.2 }}>
          Create &amp; assign a responsibility →
        </Text>
      </TouchableOpacity>

      {/* Footer text — fs=13 fw=500 textSecondary */}
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18.2, marginTop: -8 }}>
        Tasks keep the home running; reward chores and quests follow their own evidence policy.
      </Text>

      {/* Signature — fs=11 fw=600 textSecondary */}
      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary, lineHeight: 15.4 }}>
        Connect. Organize. Care. Grow.
      </Text>
    </ScrollView>
  );
}
