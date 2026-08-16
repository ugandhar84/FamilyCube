/**
 * TodayView — calm, animated top section of the parent Hub.
 * Lap-timer feel: each event is a clean row on a vertical rail.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TimelineCard } from './hubComponents';
import { TYPO } from '@/constants/theme';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import type { Quest } from '@/store/questStore';
import { useEventStore } from '@/store/eventStore';
import { localDateStr } from '@/lib/dates';
import { isWorkEvent, hoursUntilEvent } from './hubUtils';

// ── Time-of-day helpers ───────────────────────────────────────────────────────

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function getGreeting(firstName: string): string {
  const tod = getTimeOfDay();
  if (tod === 'morning')   return `Good morning, ${firstName}`;
  if (tod === 'afternoon') return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

// gradient colours per time-of-day, light and dark
const TOD_GRADIENT: Record<string, { light: [string, string]; dark: [string, string] }> = {
  morning:   { light: ['#EEF2FF', '#E0E7FF'], dark: ['#0D1035', '#131855'] },
  afternoon: { light: ['#FFFBEB', '#FEF3C7'], dark: ['#1A1200', '#2A1D00'] },
  evening:   { light: ['#F5F3FF', '#EDE9FE'], dark: ['#0F0A1E', '#1A1030'] },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface TodayViewProps {
  colors: any;
  isDark: boolean;
  activeMember: FamilyMember;
  members: FamilyMember[];
  onAddQuest?: () => void;
  onAddEvent?: () => void;
  onAddGrocery?: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function TodayView({
  colors, isDark, activeMember, members,
  onAddQuest, onAddEvent, onAddGrocery,
}: TodayViewProps) {
  const { familyName } = useFamilyStore();
  const { quests, approveQuest } = useQuestStore();
  const { events, updateEvent } = useEventStore();

  const [showPast, setShowPast] = useState(false);

  const allNames   = members.map(m => m.name);
  const firstName  = activeMember.name.split(' ')[0];
  const today      = localDateStr(new Date());
  const tod        = getTimeOfDay();
  const gradColors = isDark ? TOD_GRADIENT[tod].dark : TOD_GRADIENT[tod].light;

  // Weekday + date string
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

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

  // Smart summary
  const needsAttention = awaitingApproval.length + events.filter(e => e.approvalPending && !isWorkEvent(e)).length;
  const summaryText = todayEvents.length === 0
    ? 'All clear ✓'
    : needsAttention > 0
      ? `${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} today · ${needsAttention} need${needsAttention === 1 ? 's' : ''} attention`
      : `${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} today`;

  return (
    <View style={{ marginBottom: 8 }}>
      {/* ── Header with gradient ── */}
      <LinearGradient
        colors={gradColors as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          marginHorizontal: 16, marginTop: 8, marginBottom: 16,
          borderRadius: 20, padding: 20,
        }}
      >
        <Text style={{
          fontSize: 22, fontWeight: '800',
          color: isDark ? '#E0E7FF' : '#1E1B4B',
          letterSpacing: -0.3,
        }}>
          {getGreeting(firstName)}
        </Text>
        <Text style={{
          fontSize: TYPO.label, fontWeight: '600',
          color: isDark ? '#A5B4FC' : '#6366F1',
          marginTop: 2,
        }}>
          {familyName.replace(/\s*family$/i, '')} Family  ·  {weekday}, {monthDay}
        </Text>
        <View style={{
          marginTop: 12,
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.08)',
          borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
          alignSelf: 'flex-start',
        }}>
          <Text style={{
            fontSize: TYPO.label, fontWeight: '700',
            color: isDark ? '#C7D2FE' : '#4338CA',
          }}>
            {summaryText}
          </Text>
        </View>
      </LinearGradient>

      {/* ── Today timeline ── */}
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary }}>Today</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 1 }}>
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/calendar')}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>Full schedule →</Text>
          </Pressable>
        </View>

        {(() => {
          const upcoming = todayEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) > -0.5);
          const past     = todayEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) <= -0.5);

          if (todayEvents.length === 0) return (
            <View style={{
              backgroundColor: isDark ? colors.card : '#fff', borderRadius: 16,
              borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
              alignItems: 'center', paddingVertical: 28, marginBottom: 12,
            }}>
              <Text style={{ fontSize: 26, marginBottom: 6 }}>✨</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary }}>
                All clear — no events today
              </Text>
            </View>
          );

          return (
            <>
              {upcoming.length === 0 ? (
                <View style={{
                  backgroundColor: isDark ? colors.card : '#f0fdf4',
                  borderRadius: 14, padding: 14, marginBottom: 8,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                }}>
                  <Text style={{ fontSize: 18 }}>✅</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#10B981' }}>
                    All done for today!
                  </Text>
                </View>
              ) : upcoming.map((ev, idx) => (
                <TimelineCard
                  key={ev.id} ev={ev} members={members} allNames={allNames}
                  colors={colors} isDark={isDark}
                  updateEvent={updateEvent} activeName={activeMember.name}
                  isFirst={idx === 0} isLast={idx === upcoming.length - 1}
                />
              ))}

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
          );
        })()}
      </View>

      {/* ── Quest approvals strip ── */}
      {awaitingApproval.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{
            fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.8,
            marginBottom: 8, marginHorizontal: 16,
          }}>
            Approve
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
          >
            {awaitingApproval.map(q => {
              const kid = members.find(m => m.id === q.assignedToId);
              return (
                <Pressable
                  key={q.id}
                  onPress={() => approveQuest(q.id, activeMember.id)}
                  style={{
                    borderRadius: 20,
                    backgroundColor: BRAND.purple + '15',
                    borderWidth: 1, borderColor: BRAND.purple + '40',
                    paddingHorizontal: 14, paddingVertical: 10,
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 16 }}>📸</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>
                    {q.title}{kid ? ` — ${kid.name.split(' ')[0]}` : ''}
                  </Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>
                    Approve →
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

    </View>
  );
}
