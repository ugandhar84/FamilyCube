/**
 * KioskHomeParent — the parent's wall-display Home, the phone Hub's cards
 * scaled to one landscape screen with no scrolling: greeting + summary
 * chips; left = Family Pulse, Needs You (1-tap Approve / Redo), quick-add
 * tiles; right = Next Up timeline, Tonight, Intercom.
 *
 * Read-mostly by design: the only writes here are Approve / Redo on a
 * kid's finished chore. Adding or editing anything opens the same Tasks /
 * Schedule / Meals tabs the rest of kiosk uses.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { KioskEventDetailSheet } from './KioskEventDetailSheet';
import { KioskChoreDetailDrawer } from './KioskChoreDetailDrawer';
import { useQuestStore } from '@/store/choreAdapter';
import { useRewardStore } from '@/store/rewardStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { pendingKidRequests } from './KioskKidRequestsPanel';
import { showToast } from '@/components/AppToast';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { useKioskWeather } from '../useKioskWeather';
import { useKioskMeals, todayMealDay } from '../useKioskMeals';
import type { KioskTabKey } from '../kioskTabs';
import { KioskRedoReasonDialog } from './KioskRedoReasonDialog';
import { KioskFamilyBoard } from './KioskFamilyBoard';
import { KioskSimpleChecklist } from './KioskSimpleChecklist';
import { KioskJustDescribeTaskDrawer, KioskJustDescribeEventDrawer } from './KioskJustDescribeDrawer';
import { FamilyNowCard, HomeChatsCard, HomeMedsCard, StickyNotesCard, HomeMemoriesCard } from './KioskHomeWidgets';
import {
  Section, Dial, FacePile, PulseCard, RaisedCard, NextUpTimeline, TonightCard, ActionTile,
  fmt12, toMin, firstName, greetingFor, useNow,
} from './KioskHomeParts';

export function KioskHomeParent({ active, members, onNavigate, onIntercom, onAskFam }: {
  active: FamilyMember; members: FamilyMember[];
  onNavigate: (tab: KioskTabKey) => void; onIntercom: () => void; onAskFam?: () => void;
}) {
  const { k, isDark } = useKioskColors();
  const now = useNow();
  const weather = useKioskWeather();
  const dayEvents = useEventStore(s => s.dayEvents);
  const { quests, approveQuest, declineQuest } = useQuestStore();
  const redemptions = useRewardStore(s => s.redemptions);
  const { meals } = useKioskMeals();
  const [sharing, setSharing] = useState<Set<string> | null>(null);
  const [redoId, setRedoId] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    supabase.from('member_locations').select('member_id, share_location_enabled').then(({ data }) => {
      if (off || !data) return;
      setSharing(new Set((data as any[]).filter(r => r.share_location_enabled).map(r => r.member_id)));
    });
    return () => { off = true; };
  }, []);

  const people = useMemo(() => members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending'), [members]);
  const pending = quests.filter((q: any) => q.status === 'pending_approval');
  const rewardReqs = redemptions.filter(r => r.status === 'pending').length;
  const kidAsks = useKidRequestStore(s => s.requests);
  const askCount = useMemo(() => pendingKidRequests(kidAsks).length, [kidAsks]);
  const needCount = pending.length + (rewardReqs ? 1 : 0) + (askCount ? 1 : 0);
  const sharingCount = sharing ? people.filter(p => sharing.has(p.id)).length : 0;
  const tonight = useMemo(() => {
    const td = meals.filter(m => m.day === todayMealDay()).sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    return td.find(m => /dinner/i.test(m.type)) ?? td[td.length - 1] ?? null;
  }, [meals]);
  const cook = tonight?.chef_id ? firstName(members.find(m => m.id === tonight.chef_id)) : undefined;
  const nameOf = (id?: string) => firstName(members.find(m => m.id === id));
  const redoQuest = pending.find((q: any) => q.id === redoId);
  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const chip = (text: string, bg: string, fg: string) => (
    <View style={[s.chip, { backgroundColor: bg }]}><Text style={[s.chipText, { color: fg }]}>{text}</Text></View>
  );

  const [viewEvent, setViewEvent] = useState<FamilyEvent | null>(null);
  const [viewQuestId, setViewQuestId] = useState<string | null>(null);
  const [showTask, setShowTask] = useState(false);
  const [showEvent, setShowEvent] = useState(false);
  const goMap = () => onNavigate('findfam');
  const goMemories = () => onNavigate('memories');

  const qbtn = (label: string, emoji: string, bg: string, fg: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[s.qb, { backgroundColor: bg }]}>
      <Text style={{ fontSize: 20 }}>{emoji}</Text><Text style={[s.qbT, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[s.greet, { color: k.text }]} numberOfLines={1}>{greetingFor(now)}, {firstName(active)}</Text>
          <View style={s.chips}>
            {chip(needCount ? `${needCount} waiting on you` : 'Nothing waiting on you', k.purpleSoft, k.purple)}
            {chip(`${dayEvents.length} plan${dayEvents.length === 1 ? '' : 's'} today`, k.goldSoft, k.gold)}
            {weather && chip(`${Math.round(weather.temperature)}${weather.unit} · ${weather.condition}`, k.well, k.textMuted)}
          </View>
        </View>
        <View style={s.qa}>
          {qbtn('Task', '＋', k.primary, k.onPrimary, () => setShowTask(true))}
          {qbtn('Event', '＋', k.sageSoft, k.sage, () => setShowEvent(true))}
          {qbtn('Ask Fam', '✨', k.purpleSoft, k.purple, onAskFam ?? (() => {}))}
          {qbtn('Ride', '🚗', k.primarySoft, k.primary, () => onNavigate('schedule'))}
        </View>
      </View>

      <View style={s.body}>
        <KioskFamilyBoard people={people} events={dayEvents} chores={quests as any} onOpenEvent={setViewEvent} onOpenChore={setViewQuestId} />
        <ScrollView style={s.side} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
          <Section label="NEEDS YOU" accent={k.primary} k={k}>
            {needCount === 0 ? (
              <View style={[s.clear, { backgroundColor: k.sageSoft }]}><Text style={[s.clearTitle, { color: k.sage }]}>All caught up ✓</Text></View>
            ) : (
              <View style={{ gap: KIOSK_SPACE.sm }}>
                {pending.slice(0, 3).map((q: any) => (
                  <RaisedCard key={q.id} k={k} isDark={isDark} style={s.needRow}>
                    <View style={[s.needIcon, { backgroundColor: k.primarySoft }]}><Text style={{ fontSize: 18 }}>✅</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.needTitle, { color: k.text }]} numberOfLines={2}>{nameOf(q.assignedToId)} · {q.title}</Text>
                      <Text style={[s.pulseSub, { color: k.textMuted }]}>🪙 {q.coins} coins</Text>
                    </View>
                    <Pressable onPress={() => setRedoId(q.id)} accessibilityRole="button" accessibilityLabel={`Redo ${q.title}`} style={[s.btn, { backgroundColor: k.well }]}><Text style={[s.btnText, { color: k.text }]}>Redo</Text></Pressable>
                    <Pressable onPress={() => { approveQuest(q.id, active.id); showToast('Approved ✓'); }} accessibilityRole="button" accessibilityLabel={`Approve ${q.title}`} style={[s.btn, { backgroundColor: k.primary }]}><Text style={[s.btnText, { color: k.onPrimary }]}>Approve</Text></Pressable>
                  </RaisedCard>
                ))}
                {pending.length > 3 && <Pressable onPress={() => onNavigate('tasks')} accessibilityRole="button"><Text style={[s.more, { color: k.primary }]}>+{pending.length - 3} more · Review all →</Text></Pressable>}
                {askCount > 0 && (
                  <RaisedCard k={k} isDark={isDark} style={s.needRow}>
                    <View style={[s.needIcon, { backgroundColor: k.purpleSoft }]}><Text style={{ fontSize: 18 }}>🙋</Text></View>
                    <Text style={[s.needTitle, { color: k.text, flex: 1 }]}>{askCount} kid request{askCount === 1 ? '' : 's'}</Text>
                    <Pressable onPress={() => onNavigate('tasks')} accessibilityRole="button" style={[s.btn, { backgroundColor: k.primary }]}><Text style={[s.btnText, { color: k.onPrimary }]}>Review</Text></Pressable>
                  </RaisedCard>
                )}
                {rewardReqs > 0 && (
                  <RaisedCard k={k} isDark={isDark} style={s.needRow}>
                    <View style={[s.needIcon, { backgroundColor: k.goldSoft }]}><Text style={{ fontSize: 18 }}>🎁</Text></View>
                    <Text style={[s.needTitle, { color: k.text, flex: 1 }]}>{rewardReqs} reward request{rewardReqs === 1 ? '' : 's'}</Text>
                    <Pressable onPress={() => onNavigate('store')} accessibilityRole="button" style={[s.btn, { backgroundColor: k.primary }]}><Text style={[s.btnText, { color: k.onPrimary }]}>Review</Text></Pressable>
                  </RaisedCard>
                )}
              </View>
            )}
          </Section>
          <Section label={`TONIGHT${tonight?.start_time ? ` · ${fmt12(tonight.start_time).toUpperCase()}` : ''}`} accent={k.sage} k={k}>
            <TonightCard meal={tonight} cook={cook} k={k} isDark={isDark} onOpen={() => onNavigate('meals')} />
          </Section>
          <FamilyNowCard members={members} onOpenMap={goMap} />
          <HomeChatsCard active={active} members={members} />
          <HomeMedsCard active={active} members={members} ownOnly={false} />
          <Section label="MY LIST" accent={k.sage} k={k}>
            <RaisedCard k={k} isDark={isDark} style={{ padding: KIOSK_SPACE.sm }}>
              <KioskSimpleChecklist bare active={active} members={members} k={k} isDark={isDark} onOpenTasks={() => onNavigate('tasks')} />
            </RaisedCard>
          </Section>
          <StickyNotesCard active={active} members={members} />
          <HomeMemoriesCard onOpen={goMemories} />
          <Pressable onPress={onIntercom} accessibilityRole="button" accessibilityLabel="Intercom" style={[s.talk, { backgroundColor: k.purpleSoft }]}>
            <Text style={{ fontSize: 24 }}>🎙️</Text>
            <Text style={[s.talkTitle, { color: k.purple }]}>Intercom</Text>
            <View style={[s.talkBtn, { backgroundColor: k.purple }]}><Text style={[s.btnText, { color: k.onAccent }]}>Talk</Text></View>
          </Pressable>
        </ScrollView>
      </View>

      <KioskEventDetailSheet event={viewEvent} active={active} members={members} onClose={() => setViewEvent(null)} onEditFull={() => { setViewEvent(null); onNavigate('schedule'); }} />
      <KioskChoreDetailDrawer questId={viewQuestId} active={active} members={members} onClose={() => setViewQuestId(null)} />
      <KioskJustDescribeTaskDrawer visible={showTask} onClose={() => setShowTask(false)} active={active} members={members} />
      <KioskJustDescribeEventDrawer visible={showEvent} onClose={() => setShowEvent(false)} active={active} members={members} />

      <KioskRedoReasonDialog
        visible={!!redoQuest}
        choreTitle={(redoQuest as any)?.title ?? ''}
        k={k}
        onClose={() => setRedoId(null)}
        onSend={(reason) => {
          if (!redoQuest) return;
          declineQuest((redoQuest as any).id, active.id, reason, 'custom');
          showToast('Sent back for a redo ✓');
          setRedoId(null);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: KIOSK_SPACE.md, paddingHorizontal: KIOSK_SPACE.xl, paddingTop: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md },
  greet: { fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  chip: { borderRadius: 9, paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  top: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  qa: { marginLeft: 'auto', flexDirection: 'row', gap: 10 },
  qb: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 18, paddingHorizontal: 16 },
  qbT: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  body: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: KIOSK_SPACE.md, minHeight: 0 },
  side: { width: 310, flexGrow: 0, flexShrink: 0 },
  cols: { flex: 1, flexDirection: 'row', gap: KIOSK_SPACE.lg, minHeight: 0 },
  col: { flex: 1, gap: KIOSK_SPACE.md, minHeight: 0 },
  pulseTop: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  pulseTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800', letterSpacing: -0.4 },
  pulseSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  faceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { borderRadius: KIOSK_RADIUS.lg, padding: KIOSK_SPACE.lg },
  clearTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
  needRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.sm },
  needIcon: { width: 38, height: 38, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  needTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  btn: { minHeight: 44, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  more: { fontSize: KIOSK_TYPO.body, fontWeight: '800', paddingVertical: 4 },
  tiles: { flexDirection: 'row', gap: 10 },
  talk: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.lg, padding: KIOSK_SPACE.sm, paddingLeft: KIOSK_SPACE.md },
  talkTitle: { flex: 1, fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  talkBtn: { minHeight: 44, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
});
