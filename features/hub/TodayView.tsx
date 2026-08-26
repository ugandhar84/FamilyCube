/**
 * TodayView — calm, animated top section of the parent Hub.
 * Lap-timer feel: each event is a clean row on a vertical rail.
 *
 * Split into two standalone pieces so ParentView can slot Quick Actions
 * between them (matching the mock's Greeting → Quick Actions → Timeline
 * order): GreetingHeader (name/date/summary chip, no card boundary) and
 * TodayView itself (now just the Timeline + Approve strip, wrapped in the
 * same collapsible SectionCard shell as every other Hub section).
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView,
} from 'react-native';
import { Clock, Briefcase, CheckCircle2 } from 'lucide-react-native';
import { SectionCard, LiveDot } from './hubComponents';
import { TimelineCard } from './hubComponents';
import { TYPO, LETTER_SPACING } from '@/constants/theme';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import type { Quest } from '@/store/questStore';
import { useEventStore } from '@/store/eventStore';
import { localDateStr } from '@/lib/dates';
import { isWorkEvent, hoursUntilEvent } from './hubUtils';
import { FamilyPhotoFrameCard } from './parent/FamilyPhotoFrameCard';

// ── Greeting header — sits on the page background, no card boundary ────────

export function GreetingHeader({ colors, isDark, activeMember, otherAttentionCount = 0 }: {
  colors: any; isDark: boolean; activeMember: FamilyMember;
  // Action Needed + Household Backlog + Chore Reviews counts, lifted from
  // ParentView — without this, "All clear" only looked at today's calendar
  // events and could say "clear" while real items sat in sections below it.
  // Does NOT include quest/chore approvals — those are counted below via
  // useQuestStore directly, since ParentView's own pendingReviews figure
  // reads the exact same underlying chores array and would double-count.
  otherAttentionCount?: number;
}) {
  const { familyName } = useFamilyStore();
  const { quests } = useQuestStore();
  const { events } = useEventStore();
  const firstName = activeMember.name.split(' ')[0];
  const today = localDateStr(new Date());

  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const todayEventsCount = useMemo(() =>
    events.filter(e => e.date === today && !isWorkEvent(e)).length,
    [events, today]
  );
  const awaitingApprovalCount = useMemo(() =>
    quests.filter(q => q.status === 'pending_approval').length,
    [quests]
  );
  const needsAttention = awaitingApprovalCount + events.filter(e => e.approvalPending && !isWorkEvent(e)).length + otherAttentionCount;
  const summaryText = todayEventsCount === 0 && needsAttention === 0
    ? 'All clear ✓'
    : needsAttention > 0
      ? `${todayEventsCount} event${todayEventsCount !== 1 ? 's' : ''} today · ${needsAttention} need${needsAttention === 1 ? 's' : ''} attention`
      : `${todayEventsCount} event${todayEventsCount !== 1 ? 's' : ''} today`;

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 4, marginBottom: 8,
      flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{
          fontSize: 24, fontWeight: '800',
          color: colors.textPrimary,
          letterSpacing: LETTER_SPACING.display,
        }}>
          {getGreetingPrefix()}
          {'\n'}
          <Text style={{ fontWeight: '600' }}>{firstName}</Text>
        </Text>
        <Text style={{
          fontSize: TYPO.label, fontWeight: '600',
          color: colors.textSecondary,
          marginTop: 4,
        }}>
          {familyName.replace(/\s*family$/i, '')} Family
        </Text>
        <Text style={{
          fontSize: TYPO.label, fontWeight: '600',
          color: colors.textSecondary,
          marginTop: 2,
        }}>
          {weekday}, {monthDay}
        </Text>
        <View style={{
          marginTop: 12,
          backgroundColor: colors.primaryLight,
          borderRadius: 10, paddingHorizontal: 11, paddingVertical: 6,
          alignSelf: 'flex-start',
        }}>
          <Text style={{
            fontSize: TYPO.micro, fontWeight: '700',
            color: colors.primaryText,
          }}>
            {summaryText}
          </Text>
        </View>
      </View>

      <View>
        <FamilyPhotoFrameCard colors={colors} isDark={isDark} width={196} height={132} />
      </View>
    </View>
  );
}

// ── Time-of-day helpers ───────────────────────────────────────────────────────

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function getGreetingPrefix(): string {
  const tod = getTimeOfDay();
  if (tod === 'morning')   return 'Good morning,';
  if (tod === 'afternoon') return 'Good afternoon,';
  return 'Good evening,';
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TodayViewProps {
  colors: any;
  isDark: boolean;
  activeMember: FamilyMember;
  members: FamilyMember[];
  onAddQuest?: () => void;
  onAddEvent?: () => void;
  onAddGrocery?: () => void;
  // eventId → reason, from ParentView's conflict detection — surfaced in
  // each TimelineCard's detail sheet when that specific event has one.
  conflictReasons?: Map<string, string>;
  // Other parents' Work events today (never this viewer's own — a parent
  // doesn't need to be told about their own work block) — read-only, just
  // enough to coordinate around ("don't book me during Alex's work hours").
  otherParentsWorkToday?: { id: string; title: string; time?: string; ownerName: string }[];
}

// ── Main component — now just the Timeline + Approve strip, wrapped in the
// same collapsible SectionCard shell every other Hub section uses. Greeting
// moved out to GreetingHeader above so ParentView can place Quick Actions
// between the two, matching the mock's Greeting → Quick Actions → Timeline
// order. ─────────────────────────────────────────────────────────────────

export function TodayView({
  colors, isDark, activeMember, members,
  onAddQuest, onAddEvent, onAddGrocery, conflictReasons, otherParentsWorkToday = [],
}: TodayViewProps) {
  const { quests, approveQuest } = useQuestStore();
  const { events, updateEvent } = useEventStore();

  const [showPast, setShowPast] = useState(false);

  const allNames   = members.map(m => m.name);
  const today      = localDateStr(new Date());
  const now = new Date();

  // Today's non-work events
  const todayEvents = useMemo(() =>
    events
      .filter(e => e.date === today && !isWorkEvent(e))
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [events, today]
  );

  // Quest approvals awaiting
  const awaitingApproval = useMemo(() =>
    quests.filter(q => q.status === 'pending_approval'),
    [quests]
  );

  const upcoming = todayEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) > -0.5);
  const past     = todayEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) <= -0.5);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        icon={<Clock size={16} color={colors.primary} />}
        title="Today's Timeline"
        subtitle={now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        accent={colors.primary}
        badge={upcoming.length} badgeLabel={upcoming.length === 1 ? 'Event' : 'Events'} badgeColor={colors.primary}
        // Was `> 1` — same "a single real item stays hidden by default"
        // fix applied consistently across every Hub section this pass.
        collapsible defaultExpanded={todayEvents.length > 0}
        colors={colors} isDark={isDark}>
        <View style={{ gap: 8 }}>
          {/* Read-only — the other parent's work blocks, just enough to
              coordinate around without exposing their actual work calendar.
              Never shows the viewer's own Work events (see otherParentsWorkToday). */}
          {otherParentsWorkToday.length > 0 && (
            <View style={{ gap: 4, marginBottom: 2 }}>
              {otherParentsWorkToday.map(w => (
                <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 10,
                  paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Briefcase size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
                    {w.ownerName} — Work{w.time ? ` · ${w.time}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {todayEvents.length === 0 ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
              Nothing on the calendar today — enjoy the breathing room.
            </Text>
          ) : (
            <>
              {upcoming.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 12, gap: 4 }}>
                  <CheckCircle2 size={18} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center' }}>
                    All done for today
                  </Text>
                </View>
              ) : (
                <>
                  {/* "Live now" marker — where "now" falls in today's
                      schedule, sitting above the next upcoming event. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: colors.success + '18', borderRadius: 20,
                      paddingVertical: 5, paddingHorizontal: 10,
                    }}>
                      <LiveDot color={colors.success} />
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.success, letterSpacing: 0.3 }}>
                        LIVE NOW · {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.success + '30' }} />
                  </View>
                  {upcoming.map((ev, idx) => (
                    <TimelineCard
                      key={ev.id} ev={ev} members={members} allNames={allNames}
                      colors={colors} isDark={isDark}
                      updateEvent={updateEvent} activeName={activeMember.name}
                      isFirst={idx === 0} isLast={idx === upcoming.length - 1}
                      conflictReason={conflictReasons?.get(ev.id)}
                    />
                  ))}
                </>
              )}

              {/* Completed events stay tucked away by default (showPast
                  starts false) — was also gated on upcoming.length === 0,
                  so a day with 2 done + 1 still-ahead event never showed
                  this toggle at all; the "N completed ▾" affordance existed
                  in code but was unreachable for a day with any mix of
                  past+upcoming events, which is the common case. */}
              {past.length > 0 && (
                <>
                  <Pressable
                    onPress={() => setShowPast(v => !v)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4 }}
                  >
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>
                      {showPast ? 'Hide' : `${past.length} completed`} {showPast ? '▴' : '▾'}
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  </Pressable>
                  {showPast && past.map((ev, idx) => (
                    <TimelineCard
                      key={ev.id} ev={ev} members={members} allNames={allNames}
                      colors={colors} isDark={isDark} updateEvent={updateEvent}
                      isFirst={idx === 0} isLast={idx === past.length - 1}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {/* Quest approvals strip */}
          {awaitingApproval.length > 0 && (
            <View style={{ marginTop: 4 }}>
              <Text style={{
                fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                textTransform: 'uppercase', letterSpacing: 0.8,
                marginBottom: 8,
              }}>
                Approve
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {awaitingApproval.map(q => {
                  const kid = members.find(m => m.id === q.assignedToId);
                  return (
                    <Pressable
                      key={q.id}
                      onPress={() => approveQuest(q.id, activeMember.id)}
                      style={{
                        borderRadius: 20,
                        backgroundColor: colors.primary + '15',
                        borderWidth: 1, borderColor: colors.primary + '40',
                        paddingHorizontal: 14, paddingVertical: 10,
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>📸</Text>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.primary }}>
                        {q.title}{kid ? ` — ${kid.name.split(' ')[0]}` : ''}
                      </Text>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.primary }}>
                        Approve →
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </SectionCard>
    </View>
  );
}
