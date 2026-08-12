/**
 * QuestsScreen — 100% port of gemini-code QuestsView to React Native.
 *
 * RBAC rules enforced:
 *  - Parent:  full access — add, approve, decline, reopen, reassign, see AI Engine
 *  - Senior:  can approve / decline / reopen — no AI Engine banner, no + Quest
 *  - Kid:     can claim open bounties, submit their own quests only; sees decline reason
 *
 * Real-world edge cases handled:
 *  - Submit Proof gated to `assignedToId === activeMemberId` (can't submit someone else's quest)
 *  - Pool quests lock after first claim (store sets isPool=false, status=claimed)
 *  - Decline flow with 4 preset reasons + custom text (max 200 chars)
 *  - Reopen lets parent give kid another attempt after decline
 *  - Photo-required badge warns kid before they submit
 *  - Decline reason shown inline on kid's declined card
 *  - Senior sees approve/decline but NOT AI engine or + Quest button
 */
import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, Alert, Platform, Image, Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/questStore';
import type { Quest, QuestCategory, QuestDifficulty } from '@/store/questStore';
import AppHeader from '@/components/AppHeader';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { fmtDateShort } from '@/lib/dates';

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  PlusCircle: ({ c }: { c: string }) => (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12,8 L12,16 M8,12 L16,12" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  ThumbsUp: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M14,9 V5 C14,3.3 12.7,2 11,2 L7,13 V22 H18.3 C19.3,22 20.1,21.3 20.3,20.3 L21.7,12.3 C21.9,11 20.9,10 19.6,10 H14 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M7,13 H4 C2.9,13 2,13.9 2,15 V20 C2,21.1 2.9,22 4,22 H7" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Camera: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M23,19 C23,20.1 22.1,21 21,21 H3 C1.9,21 1,20.1 1,19 V8 C1,6.9 1.9,6 3,6 H7 L9,3 H15 L17,6 H21 C22.1,6 23,6.9 23,8 Z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={4} stroke={c} strokeWidth={2} fill="none" />
    </Svg>
  ),
  CheckCircle: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M8,13 L11,16 L16,8" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Bot: ({ c }: { c: string }) => (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x={3} y={8} width={18} height={13} rx={2} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M9,3 L12,3 M12,3 L15,3 M12,3 L12,8" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={9} cy={14} r={1.5} fill={c} />
      <Circle cx={15} cy={14} r={1.5} fill={c} />
      <Path d="M9,18 C9,17 10.3,16 12,16 C13.7,16 15,17 15,18" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Sparkles: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" stroke={c} strokeWidth={1.5} fill={c} strokeLinejoin="round" />
    </Svg>
  ),
  Flame: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12,22 C8.7,22 6,19.3 6,16 C6,12 9,9 10,8 C10,10 12,11 12,13 C13.5,11.5 14,9.5 13,8 C15,9 18,12 18,16 C18,19.3 15.3,22 12,22 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  Award: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={6} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M8.2,14.2 L6,22 L12,19 L18,22 L15.8,14.2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  AlertCircle: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12,8 L12,13 M12,16 L12,17" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  RotateCcw: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M1,4 L1,10 L7,10" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M3.5,15 C4.8,18.3 8,20.5 11.8,20.5 C16.8,20.5 20.8,16.5 20.8,11.5 C20.8,6.5 16.8,2.5 11.8,2.5 C8,2.5 4.8,4.7 3.5,8 L1,4" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  X: ({ c }: { c: string }) => (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M6,6 L18,18 M18,6 L6,18" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
};

// ─── AI Simulation helpers ────────────────────────────────────────────────────

function simulateAutoBalance(quests: any[], kids: any[]) {
  return new Promise<any>(res => setTimeout(() => res({
    summary: `Analyzed ${quests.length} household quests for ${kids.length} kids. ${kids[0]?.name ?? 'Leo'} has the heaviest load — redistributing 2 tasks for better age-appropriate balance.`,
    assignments: quests.filter(q => q.status === 'todo' && q.assignedToId).slice(0, 3).map((q, i) => ({
      questId: q.id,
      questTitle: q.title,
      currentKidId: q.assignedToId,
      recommendedKidId: kids[i % kids.length]?.id,
      recommendedKid: kids[i % kids.length]?.name ?? 'Leo',
      reason: `Age-appropriate for ${kids[i % kids.length]?.name ?? 'Leo'} based on current workload`,
    })),
    newSuggestedQuests: [
      { title: 'Organize bookshelf', coins: 20, reason: 'Great for building organization skills' },
      { title: 'Wipe down counters', coins: 15, reason: 'Quick daily responsibility, 5 minutes max' },
    ],
  }), 1800));
}

// FOMO engine — references real quest IDs so Apply can write to DB
function simulateFomo(quests: any[], kids: any[]) {
  const today = new Date().toISOString().split('T')[0];
  // Overdue: due today or earlier, still todo
  const overdue = quests.filter(q =>
    q.status === 'todo' && q.dueDate && q.dueDate <= today && !q.isPool
  );
  // Pool bounties that nobody claimed yet
  const unclaimed = quests.filter(q => q.isPool && q.status === 'todo');
  // Urgent or high priority todo
  const urgentUndone = quests.filter(q =>
    q.status === 'todo' && (q.priority === 'urgent' || q.priority === 'high') && !q.isPool
  );

  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  const flashTargets = [...overdue, ...unclaimed].slice(0, 3).map((q, i) => ({
    questId:       q.id,
    questTitle:    q.title,
    bonusCoins:    i === 0 ? 20 : 15,
    bonusExpiresAt: i === 0 ? twoHoursFromNow : fourHoursFromNow,
    fomoMessage:   i === 0
      ? `⏰ Flash bonus expires in 2h! Your siblings are eyeing this +${i === 0 ? 20 : 15}🪙 bonus!`
      : `⚡ Bonus expires in 4h — grab it before someone else does!`,
  }));

  // Force-assign targets: urgent quests overdue with no one working on them
  const forceTargets = urgentUndone.slice(0, 1).map(q => {
    const leastBusy = kids.reduce((best: any, k: any) => {
      const load = quests.filter(x => x.assignedToId === k.id && x.status !== 'done').length;
      return (!best || load < best.load) ? { ...k, load } : best;
    }, null);
    return {
      questId:    q.id,
      questTitle: q.title,
      targetKidId:   leastBusy?.id,
      targetKidName: leastBusy?.name ?? 'the least busy kid',
      action: `Overdue — force-assigning to ${leastBusy?.name ?? 'least busy kid'} and sending push nudge`,
    };
  });

  const overdueCount = overdue.length + unclaimed.length;
  const summary = overdueCount > 0
    ? `${overdueCount} quest${overdueCount > 1 ? 's are' : ' is'} overdue or unclaimed. Activating flash bonuses to drive completion before game night!`
    : `All quests look timely! Add flash bonuses to pool bounties to drive faster claims.`;

  return new Promise<any>(res => setTimeout(() => res({
    fomoNudgeSummary: summary,
    urgentAlerts:              flashTargets,
    penaltiesAndForceAssigns:  forceTargets,
  }), 1600));
}

function simulateAdvice(quests: any[], kids: any[]) {
  const topKid = kids.reduce((best: any, k: any) => {
    const done = quests.filter(q => q.assignedToId === k.id && q.status === 'done').length;
    return (!best || done > best.done) ? { ...k, done } : best;
  }, null);

  return new Promise<any>(res => setTimeout(() => res({
    familyCoachingTip: 'Try a "Power Hour" on Saturdays — everyone does chores together with upbeat music. Kids complete 3× more and actually enjoy it when parents participate!',
    topPerformer: topKid?.name ?? kids[0]?.name ?? 'Leo',
    kidEncouragementNotes: Object.fromEntries(kids.map((k: any, i: number) => [
      k.name,
      i === 0
        ? `⭐ Amazing work, ${k.name}! You're leading the family leaderboard. Keep that streak!`
        : `💪 Great effort ${k.name}! Just 2 more quests and you can unlock a reward from the store!`,
    ])),
  }), 1400));
}

// ─── DECLINE PRESETS ──────────────────────────────────────────────────────────
const DECLINE_PRESETS = [
  'The chore wasn\'t done properly — please redo it',
  'Photo proof is missing or unclear',
  'You didn\'t complete all the steps',
  'Please try again before tonight',
];

// ─── Decline Modal ─────────────────────────────────────────────────────────────
function DeclineModal({ visible, questTitle, onConfirm, onCancel, colors, isDark }: {
  visible: boolean; questTitle: string;
  onConfirm: (reason: string) => void; onCancel: () => void;
  colors: any; isDark: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [custom, setCustom]     = useState('');
  const finalReason = custom.trim() || selected;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={dm.backdrop}>
        <View style={[dm.sheet, { backgroundColor: colors.card }]}>
          <View style={[dm.handle, { backgroundColor: colors.border }]} />
          <Text style={[dm.title, { color: colors.textPrimary }]}>Decline Quest</Text>
          <Text style={[dm.sub, { color: colors.textSecondary }]} numberOfLines={1}>"{questTitle}"</Text>

          <Text style={[dm.label, { color: colors.textSecondary }]}>Select a reason:</Text>
          {DECLINE_PRESETS.map(r => (
            <TouchableOpacity
              key={r}
              style={[dm.preset, { borderColor: selected === r ? '#EF4444' : colors.border, backgroundColor: selected === r ? '#FEE2E230' : 'transparent' }]}
              onPress={() => { setSelected(r); setCustom(''); }}
            >
              <Text style={[dm.presetText, { color: selected === r ? '#EF4444' : colors.textSecondary }]}>{r}</Text>
            </TouchableOpacity>
          ))}

          <Text style={[dm.label, { color: colors.textSecondary, marginTop: 8 }]}>Or write your own:</Text>
          <TextInput
            style={[dm.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Explain to the kid why you're declining..."
            placeholderTextColor={colors.textTertiary}
            value={custom}
            onChangeText={t => { setCustom(t.slice(0, 200)); setSelected(''); }}
            multiline maxLength={200}
          />
          <Text style={[dm.charCount, { color: colors.textTertiary }]}>{custom.length}/200</Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={[dm.btn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={onCancel}>
              <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: TYPO.caption }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dm.btn, { flex: 2, backgroundColor: finalReason ? '#EF4444' : colors.border }]}
              onPress={() => finalReason && onConfirm(finalReason)}
              disabled={!finalReason}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.caption }}>Decline Quest</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const dm = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:       { fontSize: TYPO.subheading, fontWeight: '900', marginBottom: 2 },
  sub:         { fontSize: TYPO.label, marginBottom: 14 },
  label:       { fontSize: TYPO.label, fontWeight: '700', marginBottom: 6 },
  preset:      { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 7 },
  presetText:  { fontSize: TYPO.caption, fontWeight: '600' },
  input:       { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: TYPO.caption, minHeight: 60, marginTop: 4 },
  charCount:   { fontSize: TYPO.micro + 1, textAlign: 'right', marginTop: 2 },
  btn:         { borderRadius: 14, padding: 13, alignItems: 'center' },
});

// ─── Add Quest Modal ──────────────────────────────────────────────────────────
const ALL_CATEGORIES: QuestCategory[] = ['Kitchen', 'Room', 'Yard', 'School', 'Pet', 'Living Room', 'Garage', 'Bathroom', 'Laundry', 'Errand', 'Tech', 'Finance', 'Health', 'Garden', 'Car', 'Shopping', 'Cooking', 'Social', 'Creative', 'Other'];

// ─── Collapsible quest card — header always visible, body expands on tap ─────
function CollapsibleQuestCard({
  accentColor, cardBg, cardBord, header, children, onDoubleTap,
}: {
  accentColor: string; cardBg: string; cardBord: string;
  header: React.ReactNode; children: React.ReactNode;
  onDoubleTap?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const lastTap = React.useRef(0);
  const handlePress = () => {
    const now = Date.now();
    if (onDoubleTap && now - lastTap.current < 320) {
      onDoubleTap();
    } else {
      setExpanded(e => !e);
    }
    lastTap.current = now;
  };
  return (
    <View style={[s.questCard, { backgroundColor: cardBg, borderColor: cardBord }]}>
      <View style={[s.accentBar, { backgroundColor: accentColor }]} />
      <View style={{ flex: 1 }}>
        <Pressable onPress={handlePress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingBottom: expanded ? 0 : 14 }}>
          <View style={{ flex: 1 }}>{header}</View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={accentColor} />
        </Pressable>
        {expanded && (
          <View style={{ padding: 14, paddingTop: 10 }}>
            {children}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Quest title suggestion bank (category-tagged for auto-select) ────────────
const QUEST_SUGGESTIONS: { title: string; category: QuestCategory; coins: number }[] = [
  // Kitchen
  { title: 'Wash the dishes',          category: 'Kitchen',     coins: 20 },
  { title: 'Load the dishwasher',      category: 'Kitchen',     coins: 15 },
  { title: 'Unload the dishwasher',    category: 'Kitchen',     coins: 15 },
  { title: 'Wipe down the counters',   category: 'Kitchen',     coins: 15 },
  { title: 'Clean the stovetop',       category: 'Kitchen',     coins: 25 },
  { title: 'Empty the trash',          category: 'Kitchen',     coins: 10 },
  { title: 'Take out recycling',       category: 'Kitchen',     coins: 10 },
  { title: 'Mop the kitchen floor',    category: 'Kitchen',     coins: 30 },
  { title: 'Clean the microwave',      category: 'Kitchen',     coins: 20 },
  { title: 'Refill the water filter',  category: 'Kitchen',     coins: 10 },
  // Room / Bedroom
  { title: 'Make your bed',            category: 'Room',        coins: 10 },
  { title: 'Tidy your room',           category: 'Room',        coins: 20 },
  { title: 'Vacuum your bedroom',      category: 'Room',        coins: 25 },
  { title: 'Organize your closet',     category: 'Room',        coins: 30 },
  { title: 'Put away clean clothes',   category: 'Room',        coins: 15 },
  // Living Room
  { title: 'Vacuum the living room',   category: 'Living Room', coins: 25 },
  { title: 'Dust the shelves',         category: 'Living Room', coins: 20 },
  { title: 'Tidy the couch cushions',  category: 'Living Room', coins: 10 },
  { title: 'Wipe down the TV stand',   category: 'Living Room', coins: 15 },
  // Bathroom
  { title: 'Clean the toilet',         category: 'Bathroom',    coins: 30 },
  { title: 'Scrub the bathtub',        category: 'Bathroom',    coins: 35 },
  { title: 'Wipe the bathroom mirror', category: 'Bathroom',    coins: 15 },
  { title: 'Replace toilet paper',     category: 'Bathroom',    coins: 5  },
  { title: 'Empty bathroom trash',     category: 'Bathroom',    coins: 10 },
  // Laundry
  { title: 'Do a load of laundry',     category: 'Laundry',     coins: 25 },
  { title: 'Move laundry to dryer',    category: 'Laundry',     coins: 10 },
  { title: 'Fold the laundry',         category: 'Laundry',     coins: 20 },
  { title: 'Iron the clothes',         category: 'Laundry',     coins: 30 },
  // Yard / Garden
  { title: 'Mow the lawn',             category: 'Yard',        coins: 50 },
  { title: 'Rake the leaves',          category: 'Yard',        coins: 40 },
  { title: 'Water the plants',         category: 'Garden',      coins: 15 },
  { title: 'Pull out weeds',           category: 'Garden',      coins: 35 },
  { title: 'Sweep the porch',          category: 'Yard',        coins: 20 },
  { title: 'Take out the garbage bins',category: 'Yard',        coins: 15 },
  // Pet
  { title: 'Feed the dog',             category: 'Pet',         coins: 15 },
  { title: 'Walk the dog',             category: 'Pet',         coins: 25 },
  { title: 'Clean the litter box',     category: 'Pet',         coins: 20 },
  { title: 'Bathe the dog',            category: 'Pet',         coins: 40 },
  { title: 'Refill pet water bowl',    category: 'Pet',         coins: 10 },
  // School
  { title: 'Finish homework',          category: 'School',      coins: 30 },
  { title: 'Read for 20 minutes',      category: 'School',      coins: 20 },
  { title: 'Study for the test',       category: 'School',      coins: 35 },
  { title: 'Organize school bag',      category: 'School',      coins: 10 },
  // Errands / Shopping
  { title: 'Grocery run',              category: 'Shopping',    coins: 40 },
  { title: 'Pick up dry cleaning',     category: 'Errand',      coins: 20 },
  { title: 'Drop off package',         category: 'Errand',      coins: 15 },
  { title: 'Return library books',     category: 'Errand',      coins: 15 },
  // Cooking
  { title: 'Cook dinner tonight',      category: 'Cooking',     coins: 50 },
  { title: 'Make breakfast',           category: 'Cooking',     coins: 25 },
  { title: 'Pack school lunches',      category: 'Cooking',     coins: 20 },
  { title: 'Bake something special',   category: 'Cooking',     coins: 40 },
  // Car / Garage
  { title: 'Wash the car',             category: 'Car',         coins: 40 },
  { title: 'Vacuum the car interior',  category: 'Car',         coins: 30 },
  { title: 'Organize the garage',      category: 'Garage',      coins: 50 },
  // Tech / Finance / Health
  { title: 'Charge all devices',       category: 'Tech',        coins: 10 },
  { title: 'Back up family photos',    category: 'Tech',        coins: 20 },
  { title: 'Pay a bill online',        category: 'Finance',     coins: 15 },
  { title: 'Go for a 30-min walk',     category: 'Health',      coins: 25 },
  // Social / Creative
  { title: 'Write a thank-you card',   category: 'Social',      coins: 20 },
  { title: 'Draw or paint something',  category: 'Creative',    coins: 20 },
];

// Format a Date as "June 25, 2026"
function fmtDateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
// Format a Date as "3:30 PM"
function fmtTimeLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
// "2h ago", "3d ago", "just now"
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function AddQuestModal({ visible, onClose, activeMemberId }: {
  visible: boolean; onClose: () => void; activeMemberId: string;
}) {
  const { colors, isDark } = useTheme();
  const { addQuest } = useQuestStore();
  const members = useFamilyStore(s => s.members);
  const kids    = members.filter(m => m.role === 'kid');

  const [title,        setTitle]        = useState('');
  const [coins,        setCoins]        = useState('30');
  const [category,     setCategory]     = useState<QuestCategory>('Kitchen');
  const [assignIds,    setAssignIds]    = useState<string[]>([]);
  const [isPool,       setIsPool]       = useState(false);
  const [photoReq,     setPhotoReq]     = useState(false);
  const [desc,         setDesc]         = useState('');
  const [difficulty,   setDifficulty]   = useState<QuestDifficulty | ''>('');
  const [bonusCoins,   setBonusCoins]   = useState('');
  const [saving,       setSaving]       = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const suggPressing = React.useRef(false);

  // Dynamic suggestions: when typing, fuzzy-match by word; when blank+focused, show top picks
  const suggestions = useMemo(() => {
    const q = title.trim().toLowerCase();
    if (!q) {
      // Show a curated shortlist when field is empty but focused
      return QUEST_SUGGESTIONS.slice(0, 8);
    }
    const words = q.split(/\s+/);
    return QUEST_SUGGESTIONS
      .filter(s => words.every(w => s.title.toLowerCase().includes(w)))
      .slice(0, 8);
  }, [title]);

  const applySuggestion = (s: typeof QUEST_SUGGESTIONS[0]) => {
    suggPressing.current = false;
    setTitle(s.title);
    setCategory(s.category);
    setCoins(String(s.coins));
    setTitleFocused(false);
  };

  // Due date/time — default to tomorrow 6 PM
  const defaultDue = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d; };
  const [dueDate,      setDueDate]      = useState<Date>(defaultDue);
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);

  const onDateChange = (_: any, selected?: Date) => {
    setShowDatePick(Platform.OS === 'ios'); // keep open on iOS (inline), close on Android
    if (selected) {
      const merged = new Date(selected);
      merged.setHours(dueDate.getHours(), dueDate.getMinutes(), 0, 0);
      setDueDate(merged);
    }
  };

  const onTimeChange = (_: any, selected?: Date) => {
    setShowTimePick(Platform.OS === 'ios');
    if (selected) {
      const merged = new Date(dueDate);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setDueDate(merged);
    }
  };

  const reset = () => {
    setTitle(''); setDesc(''); setCoins('30'); setBonusCoins(''); setDifficulty('');
    setAssignIds([]); setIsPool(false);
    setPhotoReq(false); setDueDate(defaultDue());
    setShowDatePick(false); setShowTimePick(false);
  };

  const submit = async () => {
    if (!title.trim() || !desc.trim()) return;
    setSaving(true);
    const bonus = parseInt(bonusCoins) || 0;
    const newQ = await addQuest({
      title: title.trim(), description: desc.trim(), category, priority: 'medium', difficulty: difficulty || undefined,
      coins: parseInt(coins) || 30, xpReward: 20,
      assignedToId: isPool ? undefined : (assignIds[0] || undefined),
      isPool: isPool || assignIds.length === 0, isDaily: false, recurrence: 'once', status: 'todo',
      dueDate: dueDate.toISOString().split('T')[0],
      dueTime: fmtTimeLabel(dueDate),
      photoRequired: photoReq,
      createdById: activeMemberId,
    });
    if (bonus > 0 && newQ?.id) {
      useQuestStore.getState().updateQuest(newQ.id, { bonusCoins: bonus });
    }
    setSaving(false);
    reset();
    onClose();
  };

  const pillBg  = isDark ? colors.surface : '#F1F5F9';
  const pillBdr = isDark ? colors.border  : '#E2E8F0';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <View style={aq.backdrop}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}>
          <View style={[aq.sheet, { backgroundColor: colors.card }]}>
            <View style={[aq.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={[aq.title, { color: colors.textPrimary }]}>New Quest</Text>
                <Text style={{ fontSize: TYPO.label, color: BRAND.purple, fontWeight: '700', marginTop: 1 }}>Assign a chore, bounty, or task</Text>
              </View>
              <TouchableOpacity onPress={() => { reset(); onClose(); }}>
                <I.X c={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Title */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>Quest Title *</Text>
            <TextInput
              style={[aq.input, { color: colors.textPrimary, borderColor: title.trim() ? colors.border : '#EF444480', backgroundColor: colors.surface }]}
              placeholder="e.g. Wash the dishes, Take out trash…"
              placeholderTextColor={colors.textTertiary}
              value={title}
              onChangeText={setTitle}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTimeout(() => { if (!suggPressing.current) setTitleFocused(false); }, 250)}
              returnKeyType="next"
            />
            {/* Dynamic suggestion pills — always visible */}
            {suggestions.length > 0 && (
              <View style={{ marginTop: -6, marginBottom: 12 }}>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 5, fontWeight: '600' }}>
                  {title.trim() ? 'Matching suggestions' : 'Quick picks — tap to fill'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {suggestions.map((s, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[aq.suggPill, {
                          backgroundColor: title.toLowerCase() === s.title.toLowerCase() ? BRAND.purple + '25' : colors.surface,
                          borderColor:     title.toLowerCase() === s.title.toLowerCase() ? BRAND.purple : colors.border,
                        }]}
                        onPressIn={() => { suggPressing.current = true; }}
                        onPress={() => applySuggestion(s)}
                      >
                        <Text style={{ fontSize: TYPO.micro + 1, color: colors.textSecondary, fontWeight: '600' }} numberOfLines={1}>
                          {s.title}
                        </Text>
                        <Text style={{ fontSize: TYPO.micro, color: BRAND.amber, fontWeight: '700', marginLeft: 5 }}>
                          +{s.coins}🪙
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Description — mandatory, max 150 chars */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>
              Description *{'  '}
              <Text style={{ fontWeight: '400', color: colors.textTertiary }}>what needs to be done</Text>
            </Text>
            <TextInput
              style={[aq.input, aq.descInput, { color: colors.textPrimary, borderColor: desc.trim() ? colors.border : '#EF444480', backgroundColor: colors.surface }]}
              placeholder="Describe exactly what's expected so there's no confusion…"
              placeholderTextColor={colors.textTertiary}
              value={desc}
              onChangeText={t => setDesc(t.slice(0, 150))}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={{ fontSize: TYPO.micro, color: desc.length > 130 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: -8, marginBottom: 12 }}>
              {desc.length}/150
            </Text>

            {/* Coins + Photo proof row */}
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 90 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Coins 🪙</Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                  keyboardType="number-pad" value={coins} onChangeText={setCoins}
                />
              </View>
              <View style={{ flex: 1, paddingTop: 22 }}>
                <TouchableOpacity
                  style={[aq.toggleRow, { borderColor: photoReq ? BRAND.purple : pillBdr, backgroundColor: photoReq ? BRAND.purple + '18' : pillBg }]}
                  onPress={() => setPhotoReq(p => !p)}
                >
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: photoReq ? BRAND.purple : colors.textSecondary }}>
                    {photoReq ? '📷 Photo Required' : '📷 Photo Optional'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Hardness + Bonus — same row */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Hardness <Text style={{ fontWeight: '400', color: colors.textTertiary }}>optional</Text></Text>
                <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                  {([
                    { key: 'easy',   label: '😊',  color: '#10B981' },
                    { key: 'medium', label: '💪',  color: BRAND.amber },
                    { key: 'hard',   label: '🔥',  color: '#EF4444' },
                    { key: 'hero',   label: '⚡',  color: BRAND.purple },
                  ] as { key: QuestDifficulty; label: string; color: string }[]).map(d => (
                    <TouchableOpacity
                      key={d.key}
                      style={[aq.diffChip, {
                        borderColor: difficulty === d.key ? d.color : pillBdr,
                        backgroundColor: difficulty === d.key ? d.color + '22' : pillBg,
                      }]}
                      onPress={() => setDifficulty(prev => prev === d.key ? '' : d.key)}
                    >
                      <Text style={{ fontSize: TYPO.label }}>{d.label}</Text>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: difficulty === d.key ? d.color : colors.textTertiary, marginLeft: 2 }}>
                        {d.key.charAt(0).toUpperCase() + d.key.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{ width: 90 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Bonus 🎉</Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: bonusCoins ? BRAND.amber : colors.border, backgroundColor: colors.surface, marginBottom: 0 }]}
                  keyboardType="number-pad"
                  placeholder="+coins"
                  placeholderTextColor={colors.textTertiary}
                  value={bonusCoins}
                  onChangeText={t => setBonusCoins(t.replace(/[^0-9]/g, ''))}
                />
                {!!bonusCoins && parseInt(bonusCoins) > 0 && (
                  <Text style={{ fontSize: TYPO.micro, color: BRAND.amber, fontWeight: '700', marginTop: 3 }}>
                    Total: {(parseInt(coins)||0)+(parseInt(bonusCoins)||0)}🪙
                  </Text>
                )}
              </View>
            </View>

            {/* Category */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {ALL_CATEGORIES.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[aq.catChip, { borderColor: pillBdr, backgroundColor: pillBg },
                      category === c && { backgroundColor: BRAND.purple, borderColor: BRAND.purple }]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '700', color: category === c ? '#fff' : colors.textSecondary }}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Due Date + Time */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>Due Date & Time</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              {/* Date pill */}
              <TouchableOpacity
                style={[aq.datePill, { backgroundColor: showDatePick ? BRAND.purple + '20' : pillBg, borderColor: showDatePick ? BRAND.purple : pillBdr }]}
                onPress={() => { setShowDatePick(p => !p); setShowTimePick(false); }}
              >
                <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>📅</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showDatePick ? BRAND.purple : colors.textPrimary }}>
                  {fmtDateLabel(dueDate)}
                </Text>
              </TouchableOpacity>

              {/* Time pill */}
              <TouchableOpacity
                style={[aq.datePill, { backgroundColor: showTimePick ? BRAND.purple + '20' : pillBg, borderColor: showTimePick ? BRAND.purple : pillBdr }]}
                onPress={() => { setShowTimePick(p => !p); setShowDatePick(false); }}
              >
                <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>🕐</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showTimePick ? BRAND.purple : colors.textPrimary }}>
                  {fmtTimeLabel(dueDate)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Picker overlay — floats above form, no layout shift */}
            {(showDatePick || showTimePick) && (
              <Modal transparent animationType="fade" visible onRequestClose={() => { setShowDatePick(false); setShowTimePick(false); }}>
                <TouchableOpacity style={aq.pickerOverlay} activeOpacity={1} onPress={() => { setShowDatePick(false); setShowTimePick(false); }}>
                  <TouchableOpacity activeOpacity={1} style={[aq.pickerCard, { backgroundColor: colors.card }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>
                        {showDatePick ? '📅 Pick a Date' : '🕐 Pick a Time'}
                      </Text>
                      <TouchableOpacity onPress={() => { setShowDatePick(false); setShowTimePick(false); }}>
                        <Text style={{ color: BRAND.purple, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    {showDatePick && (
                      <DateTimePicker
                        value={dueDate}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={onDateChange}
                        textColor={colors.textPrimary}
                        style={{ height: 180, width: '100%' }}
                      />
                    )}
                    {showTimePick && (
                      <DateTimePicker
                        value={dueDate}
                        mode="time"
                        display="spinner"
                        is24Hour={false}
                        onChange={onTimeChange}
                        textColor={colors.textPrimary}
                        style={{ height: 180, width: '100%' }}
                      />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              </Modal>
            )}

            {/* Assign To — avatar circles, multi-select */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>
              Assign To{'  '}
              <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
                {isPool ? 'open to anyone' : assignIds.length === 0 ? 'tap to select' : assignIds.length > 1 ? `${assignIds.length} selected` : '1 selected'}
              </Text>
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ flexDirection: 'row', gap: 12, paddingRight: 4 }}>
              {/* Open Bounty */}
              <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} onPress={() => { setIsPool(true); setAssignIds([]); }}>
                <View style={{ position: 'relative' }}>
                  <FamilyAvatar
                    name="Bounty"
                    emoji="⚡"
                    size={40}
                    ringColor={BRAND.amber}
                    ringWidth={isPool ? 2.5 : 1}
                    bgColor={isPool ? BRAND.amber + '30' : pillBg}
                  />
                  {isPool && (
                    <View style={[aq.avatarCheck, { backgroundColor: BRAND.amber }]}>
                      <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: isPool ? BRAND.amber : colors.textTertiary }}>Bounty</Text>
              </TouchableOpacity>

              {/* Family members */}
              {members
                .filter(m => m.role === 'kid' || m.role === 'parent' || m.role === 'senior')
                .map(m => {
                  const sel       = assignIds.includes(m.id) && !isPool;
                  const roleColor = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? '#0EA5E9' : '#10B981';
                  const siblings  = members.map(x => x.name);
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={{ alignItems: 'center', gap: 4 }}
                      onPress={() => {
                        setIsPool(false);
                        setAssignIds(prev =>
                          prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                        );
                      }}
                    >
                      <View style={{ position: 'relative' }}>
                        <FamilyAvatar
                          name={m.name}
                          emoji={m.emoji}
                          avatarUrl={(m as any).avatarUrl}
                          siblings={siblings}
                          size={40}
                          ringColor={roleColor}
                          ringWidth={sel ? 2.5 : 1}
                          bgColor={sel ? roleColor + '25' : pillBg}
                        />
                        {sel && (
                          <View style={[aq.avatarCheck, { backgroundColor: roleColor }]}>
                            <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: sel ? roleColor : colors.textTertiary }} numberOfLines={1}>
                        {m.name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            {/* Submit */}
            <TouchableOpacity
              style={[aq.submitBtn, { backgroundColor: title.trim() && desc.trim() ? '#059669' : colors.border, opacity: saving ? 0.6 : 1 }]}
              onPress={submit} disabled={saving || !title.trim() || !desc.trim()}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.body }}>Add Quest to Board</Text>
                    <Text style={{ color: '#A7F3D0', fontSize: TYPO.label, marginTop: 2 }}>
                      Due {fmtDateLabel(dueDate)} at {fmtTimeLabel(dueDate)}
                    </Text>
                  </>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
const aq = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:      { fontSize: TYPO.subheading, fontWeight: '900' },
  label:      { fontSize: TYPO.label, fontWeight: '700', marginBottom: 5 },
  input:      { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: TYPO.caption, marginBottom: 12 },
  catChip:    { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  toggleRow:  { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  avatarCheck:{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  datePill:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flex: 1 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  pickerCard:    { borderRadius: 20, overflow: 'hidden', paddingBottom: 12 },
  suggPill:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 200 },
  diffChip:   { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5 },
  descInput:  { minHeight: 72, marginBottom: 4 },
  submitBtn:  { borderRadius: 14, padding: 14, alignItems: 'center' },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

// ─── Edit Quest Modal (parent, unclaimed quests only) ────────────────────────
function EditQuestModal({ quest, activeMemberId, onClose, onSave, onDelete, editMode = 'full' }: {
  quest: Quest;
  activeMemberId: string;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Quest>) => void;
  onDelete?: (id: string) => void;
  editMode?: 'full' | 'restricted'; // restricted = assigned todo — only coins + reassign editable
}) {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const kids    = members.filter(m => m.role === 'kid');

  const [title,      setTitle]      = useState(quest.title);
  const [desc,       setDesc]       = useState(quest.description ?? '');
  const [coins,      setCoins]      = useState(String(quest.coins));
  const [bonusCoins, setBonusCoins] = useState(quest.bonusCoins > 0 ? String(quest.bonusCoins) : '');
  const [category,   setCategory]   = useState<QuestCategory>(quest.category);
  const [difficulty, setDifficulty] = useState<QuestDifficulty | ''>(quest.difficulty ?? '');
  const [forceId,    setForceId]    = useState<string>(quest.assignedToId ?? '');
  const [saving,     setSaving]     = useState(false);

  const isForceAssign = !!forceId;
  const pillBg  = isDark ? colors.surface : '#F1F5F9';
  const pillBdr = isDark ? colors.border  : '#E2E8F0';

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const patch: Partial<Quest> = {
      title: title.trim(),
      description: desc.trim() || undefined,
      coins: parseInt(coins) || quest.coins,
      bonusCoins: parseInt(bonusCoins) || 0,
      category,
      difficulty: difficulty || undefined,
      assignedToId: forceId || undefined,
      isPool: !forceId,
      // Force-assign badge: tag in history via lastModifiedById (done by updateQuest)
    };
    onSave(quest.id, patch);
    setSaving(false);
  };

  const siblings = members.map(m => m.name);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={aq.backdrop}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}>
          <View style={[aq.sheet, { backgroundColor: colors.card }]}>
            <View style={[aq.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[aq.title, { color: colors.textPrimary }]}>
                  {editMode === 'restricted' ? 'Adjust Quest' : 'Edit Quest'}
                </Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 1, color:
                  editMode === 'restricted' ? '#D97706' : isForceAssign ? '#EF4444' : BRAND.purple }}>
                  {editMode === 'restricted'
                    ? '📋 Assigned quest — only coins & reassign editable'
                    : isForceAssign ? '🔒 Force assigned — modified by you' : 'Editing open bounty'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}><I.X c={colors.textSecondary} /></TouchableOpacity>
            </View>

            {/* Title — locked when assigned */}
            {editMode === 'restricted' ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Quest Title <Text style={{ color: colors.textTertiary, fontWeight: '400' }}>— locked once assigned</Text></Text>
                <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#1E293B' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{quest.title}</Text>
                  {quest.description ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 4 }}>{quest.description}</Text> : null}
                </View>
              </View>
            ) : (
              <>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Quest Title *</Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: title.trim() ? colors.border : '#EF444480', backgroundColor: colors.surface }]}
                  value={title} onChangeText={setTitle} returnKeyType="next"
                />
                {/* Description */}
                <Text style={[aq.label, { color: colors.textSecondary }]}>Description
                  <Text style={{ fontWeight: '400', color: colors.textTertiary }}> (what needs to be done)</Text>
                </Text>
                <TextInput
                  style={[aq.input, aq.descInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={desc} onChangeText={t => setDesc(t.slice(0, 150))}
                  multiline numberOfLines={3} textAlignVertical="top"
                />
                <Text style={{ fontSize: TYPO.micro, color: desc.length > 130 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: -8, marginBottom: 12 }}>
                  {desc.length}/150
                </Text>
              </>
            )}

            {/* Coins + Bonus row */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Coins 🪙</Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 0 }]}
                  keyboardType="number-pad" value={coins} onChangeText={setCoins}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Bonus 🎉 <Text style={{ fontWeight: '400', color: colors.textTertiary }}>optional</Text></Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: bonusCoins ? BRAND.amber : colors.border, backgroundColor: colors.surface, marginBottom: 0 }]}
                  keyboardType="number-pad" placeholder="+coins" placeholderTextColor={colors.textTertiary}
                  value={bonusCoins} onChangeText={t => setBonusCoins(t.replace(/[^0-9]/g, ''))}
                />
              </View>
            </View>

            {/* Hardness */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>Hardness <Text style={{ fontWeight: '400', color: colors.textTertiary }}>optional</Text></Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {([
                { key: 'easy', label: '😊 Easy', color: '#10B981' },
                { key: 'medium', label: '💪 Medium', color: BRAND.amber },
                { key: 'hard', label: '🔥 Hard', color: '#EF4444' },
                { key: 'hero', label: '⚡ Hero', color: BRAND.purple },
              ] as { key: QuestDifficulty; label: string; color: string }[]).map(d => (
                <TouchableOpacity
                  key={d.key}
                  style={[aq.diffChip, { borderColor: difficulty === d.key ? d.color : pillBdr, backgroundColor: difficulty === d.key ? d.color + '22' : pillBg }]}
                  onPress={() => setDifficulty(p => p === d.key ? '' : d.key)}
                >
                  <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: difficulty === d.key ? d.color : colors.textTertiary }}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Force Assign — avatar row */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>
              Force Assign{' '}
              <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
                {forceId ? '🔒 will badge as Force Assigned' : 'optional — leave blank to keep as open bounty'}
              </Text>
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ flexDirection: 'row', gap: 12 }}>
              {/* Clear / Open Bounty */}
              <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} onPress={() => setForceId('')}>
                <View style={[aq.avatar, { backgroundColor: !forceId ? BRAND.amber + '30' : pillBg, borderColor: !forceId ? BRAND.amber : pillBdr, borderWidth: !forceId ? 2.5 : 1.5 }]}>
                  <Text style={{ fontSize: 18 }}>⚡</Text>
                  {!forceId && <View style={[aq.avatarCheck, { backgroundColor: BRAND.amber }]}><Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text></View>}
                </View>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: !forceId ? BRAND.amber : colors.textTertiary }}>Bounty</Text>
              </TouchableOpacity>

              {kids.map(k => {
                const sel = forceId === k.id;
                return (
                  <TouchableOpacity key={k.id} style={{ alignItems: 'center', gap: 4 }} onPress={() => setForceId(sel ? '' : k.id)}>
                    <View style={{ position: 'relative' }}>
                      <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} siblings={siblings} size={40} ringColor="#EF4444" ringWidth={sel ? 2.5 : 1} bgColor={sel ? '#EF444425' : pillBg} />
                      {sel && <View style={[aq.avatarCheck, { backgroundColor: '#EF4444' }]}><Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text></View>}
                    </View>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: sel ? '#EF4444' : colors.textTertiary }} numberOfLines={1}>{k.name.split(' ')[0]}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Modified by notice */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: TYPO.micro + 1, color: colors.textTertiary }}>
                ✏️ Modified by{' '}
                <Text style={{ fontWeight: '700', color: BRAND.purple }}>
                  {members.find(m => m.id === activeMemberId)?.name ?? 'you'}
                </Text>
                {' '}· saved automatically
              </Text>
            </View>

            {/* Actions row — Save + Delete */}
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
              {onDelete && (
                <TouchableOpacity
                  style={{ paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A560', backgroundColor: isDark ? '#2D1515' : '#FEF2F2' }}
                  onPress={() => Alert.alert(
                    'Delete Quest',
                    `Remove "${quest.title}"? This cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => { onDelete(quest.id); onClose(); } },
                    ]
                  )}
                >
                  <I.X c="#EF4444" />
                  <Text style={{ color: '#EF4444', fontSize: TYPO.micro, fontWeight: '700', marginTop: 2 }}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[aq.submitBtn, { flex: 1, backgroundColor: title.trim() ? (isForceAssign ? '#EF4444' : '#059669') : colors.border, opacity: saving ? 0.6 : 1 }]}
                onPress={save} disabled={saving || !title.trim()}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.body }}>
                        {isForceAssign ? '🔒 Save & Force Assign' : '💾 Save Changes'}
                      </Text>
                      {isForceAssign && (
                        <Text style={{ color: '#FECACA', fontSize: TYPO.label, marginTop: 2 }}>
                          A "Force Assigned" badge will appear on the card
                        </Text>
                      )}
                    </>}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── AI Result Cards ──────────────────────────────────────────────────────────
function AutoBalanceCard({ result, onApply, appliedActions, onClose }: any) {
  return (
    <View style={[ai.card, { borderColor: '#6D28D966' }]}>
      <View style={[ai.header, { borderBottomColor: '#4C1D9580' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <I.Sparkles c="#FCD34D" />
          <Text style={[ai.headerText, { color: '#C4B5FD' }]}>AI Chore Auto-Balancer</Text>
        </View>
        <TouchableOpacity onPress={onClose}><Text style={{ color: '#A78BFA', fontSize: TYPO.micro + 1 }}>✕ Close</Text></TouchableOpacity>
      </View>
      <Text style={ai.summary}>{result.summary}</Text>
      <Text style={[ai.sectionLabel, { color: '#FCD34D' }]}>Recommended Assignments:</Text>
      {result.assignments.map((item: any, idx: number) => {
        const applied = appliedActions[`bal_${idx}`];
        return (
          <View key={idx} style={ai.row}>
            <View style={{ flex: 1 }}>
              <Text style={[ai.rowTitle, { color: '#F1F5F9' }]}>{item.questTitle}</Text>
              <Text style={[ai.rowSub, { color: '#A78BFA' }]}>{item.reason}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[ai.chip, { backgroundColor: '#FCD34D22' }]}>
                <Text style={[ai.chipText, { color: '#FCD34D' }]}>👉 {item.recommendedKid}</Text>
              </View>
              {applied
                ? <View style={ai.doneChip}><Text style={ai.doneText}>✓ Assigned</Text></View>
                : <TouchableOpacity style={ai.applyBtn} onPress={() => onApply(`bal_${idx}`, item, 'reassign')}>
                    <Text style={ai.applyText}>⚡ Apply</Text>
                  </TouchableOpacity>}
            </View>
          </View>
        );
      })}
      <Text style={[ai.sectionLabel, { color: '#6EE7B7', marginTop: 8 }]}>New Suggested Bounties:</Text>
      {result.newSuggestedQuests.map((q: any, idx: number) => {
        const applied = appliedActions[`bounty_${idx}`];
        return (
          <View key={idx} style={ai.row}>
            <View style={{ flex: 1 }}>
              <Text style={[ai.rowTitle, { color: '#6EE7B7' }]}>{q.title}</Text>
              <Text style={[ai.rowSub, { color: '#34D399' }]}>{q.reason}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[ai.chipText, { color: BRAND.amber }]}>+{q.coins}🪙</Text>
              {applied
                ? <View style={ai.doneChip}><Text style={ai.doneText}>✓ Added</Text></View>
                : <TouchableOpacity style={[ai.applyBtn, { backgroundColor: BRAND.amber }]} onPress={() => onApply(`bounty_${idx}`, q, 'bounty')}>
                    <Text style={[ai.applyText, { color: '#0F172A' }]}>➕ Add</Text>
                  </TouchableOpacity>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function FomoCard({ result, onApply, appliedActions, onClose }: any) {
  return (
    <View style={[ai.card, { borderColor: '#D9770666' }]}>
      <View style={[ai.header, { borderBottomColor: '#92400E80' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <I.Flame c="#FCD34D" />
          <Text style={[ai.headerText, { color: '#FCD34D' }]}>AI FOMO Bounties & Penalties</Text>
        </View>
        <TouchableOpacity onPress={onClose}><Text style={{ color: '#FCD34D', fontSize: TYPO.micro + 1 }}>✕ Close</Text></TouchableOpacity>
      </View>
      <View style={[ai.infoBox, { backgroundColor: '#FCD34D20', borderColor: '#FCD34D40' }]}>
        <Text style={[ai.summary, { color: '#FCD34D' }]}>{result.fomoNudgeSummary}</Text>
      </View>
      <Text style={[ai.sectionLabel, { color: '#FCD34D' }]}>⚡ Flash Coin Bonuses:</Text>
      {result.urgentAlerts.map((alert: any, idx: number) => {
        const applied = appliedActions[`fomo_${idx}`];
        return (
          <View key={idx} style={[ai.fomoRow]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={[ai.rowTitle, { color: '#FDE68A', flex: 1 }]}>{alert.title}</Text>
              <Text style={[ai.chipText, { color: '#FCD34D' }]}>+{alert.bonusCoins}🪙</Text>
            </View>
            <Text style={[ai.rowSub, { color: '#FCD34D80', marginBottom: 8 }]}>{alert.fomoMessage}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              {applied
                ? <View style={[ai.doneChip, { backgroundColor: BRAND.amber }]}><Text style={[ai.doneText, { color: '#0F172A' }]}>🔥 Flash Bonus Active!</Text></View>
                : <TouchableOpacity style={[ai.applyBtn, { backgroundColor: BRAND.amber }]} onPress={() => onApply(`fomo_${idx}`, alert, 'fomo')}>
                    <Text style={[ai.applyText, { color: '#0F172A' }]}>🔥 Activate Flash Bonus</Text>
                  </TouchableOpacity>}
            </View>
          </View>
        );
      })}
      {result.penaltiesAndForceAssigns.length > 0 && (
        <>
          <View style={[ai.divider, { borderColor: '#92400E60' }]} />
          <Text style={[ai.sectionLabel, { color: '#F87171' }]}>⚠️ Overdue Force Assigns:</Text>
          {result.penaltiesAndForceAssigns.map((pen: any, idx: number) => {
            const applied = appliedActions[`pen_${idx}`];
            return (
              <View key={idx} style={[ai.fomoRow, { borderColor: '#EF444440', backgroundColor: '#450A0A' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={[ai.rowTitle, { color: '#FCA5A5', flex: 1 }]}>{pen.questTitle} → {pen.targetKidName}</Text>
                  <Text style={[ai.chipText, { color: '#F87171' }]}>⚠️ Force</Text>
                </View>
                <Text style={[ai.rowSub, { color: '#FCA5A5', marginBottom: 8 }]}>{pen.action}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  {applied
                    ? <View style={[ai.doneChip, { backgroundColor: '#EF4444' }]}><Text style={ai.doneText}>⚠️ Force Assigned</Text></View>
                    : <TouchableOpacity style={[ai.applyBtn, { backgroundColor: '#EF4444' }]} onPress={() => onApply(`pen_${idx}`, pen, 'penalty')}>
                        <Text style={ai.applyText}>⚠️ 1-Click Force Assign</Text>
                      </TouchableOpacity>}
                </View>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

function AdviceCard({ result, appliedActions, onApply, onClose }: any) {
  return (
    <View style={[ai.card, { borderColor: '#4338CA66' }]}>
      <View style={[ai.header, { borderBottomColor: '#312E8180' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <I.Award c="#818CF8" />
          <Text style={[ai.headerText, { color: '#818CF8' }]}>AI Parenting & Chore Advisor</Text>
        </View>
        <TouchableOpacity onPress={onClose}><Text style={{ color: '#818CF8', fontSize: TYPO.micro + 1 }}>✕ Close</Text></TouchableOpacity>
      </View>
      <View style={[ai.infoBox, { backgroundColor: '#4338CA22', borderColor: '#4338CA40' }]}>
        <Text style={[ai.summary, { color: '#C7D2FE' }]}>💡 {result.familyCoachingTip}</Text>
      </View>
      <View style={[ai.infoBox, { backgroundColor: '#FCD34D22', borderColor: '#FCD34D40', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={[ai.rowTitle, { color: '#FDE68A' }]}>⭐ Top Performer:</Text>
        <Text style={[ai.rowTitle, { color: '#FCD34D', fontWeight: '900' }]}>{result.topPerformer}</Text>
      </View>
      <Text style={[ai.sectionLabel, { color: '#818CF8' }]}>Kid Encouragement Notes:</Text>
      {Object.entries(result.kidEncouragementNotes).map(([kid, note]: [string, any]) => (
        <View key={kid} style={ai.row}>
          <View style={{ flex: 1 }}>
            <Text style={[ai.rowTitle, { color: '#818CF8' }]}>{kid}</Text>
            <Text style={[ai.rowSub, { color: '#CBD5E1' }]}>{note}</Text>
          </View>
        </View>
      ))}
      <View style={[ai.divider, { borderColor: '#31448860' }]} />
      <View style={{ alignItems: 'flex-end' }}>
        {appliedActions['advice_chat']
          ? <View style={[ai.doneChip, { backgroundColor: '#4338CA' }]}><Text style={ai.doneText}>✓ Coaching Tip Sent</Text></View>
          : <TouchableOpacity style={[ai.applyBtn, { backgroundColor: '#4338CA', paddingHorizontal: 14 }]} onPress={() => onApply('advice_chat', result)}>
              <Text style={ai.applyText}>📢 Send Coaching to Family Chat</Text>
            </TouchableOpacity>}
      </View>
    </View>
  );
}

const ai = StyleSheet.create({
  card:       { borderRadius: 24, borderWidth: 1, backgroundColor: '#0F172A', padding: 14, marginHorizontal: 14, marginBottom: 12, gap: 8 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 8 },
  headerText: { fontSize: TYPO.label, fontWeight: '900', flex: 1 },
  summary:    { fontSize: TYPO.label, fontWeight: '600', lineHeight: 16, color: '#CBD5E1' },
  infoBox:    { borderRadius: 14, borderWidth: 1, padding: 10 },
  sectionLabel: { fontSize: TYPO.micro + 1, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, color: '#94A3B8' },
  row:        { borderRadius: 14, backgroundColor: '#1E293B', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fomoRow:    { borderRadius: 14, borderWidth: 1, padding: 10, backgroundColor: '#1C1000', borderColor: '#FCD34D40', marginBottom: 6 },
  rowTitle:   { fontSize: TYPO.label, fontWeight: '700' },
  rowSub:     { fontSize: TYPO.micro + 1, marginTop: 2 },
  chip:       { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  chipText:   { fontSize: TYPO.micro + 1, fontWeight: '900' },
  doneChip:   { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  doneText:   { color: '#fff', fontSize: TYPO.micro + 1, fontWeight: '900' },
  applyBtn:   { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  applyText:  { color: '#fff', fontSize: TYPO.micro + 1, fontWeight: '900' },
  divider:    { borderTopWidth: 1, marginVertical: 2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type TabStatus = 'all' | 'todo' | 'review' | 'completed';
type AiTool   = 'none' | 'autobalance' | 'fomo' | 'advice';

export default function QuestsScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const { quests, claimQuest, submitQuest, approveQuest, declineQuest, reopenQuest, updateQuest, deleteQuest } = useQuestStore();

  const activeMember = members.find(m => m.id === activeMemberId)
    ?? members.find(m => m.role === 'parent') ?? members[0];
  const isParent         = activeMember?.role === 'parent';
  const isSenior         = activeMember?.role === 'senior';
  const isKid            = activeMember?.role === 'kid';
  const isParentOrSenior = isParent || isSenior;   // RBAC: approve/decline/reopen
  const kids             = members.filter(m => m.role === 'kid');

  const [kidFilter,      setKidFilter]      = useState('all');
  const [tabStatus,      setTabStatus]      = useState<TabStatus>('all');
  const [showAiTool,     setShowAiTool]     = useState<AiTool>('none');
  const [isAiLoading,    setIsAiLoading]    = useState(false);
  const [autoBalResult,  setAutoBalResult]  = useState<any>(null);
  const [fomoResult,     setFomoResult]     = useState<any>(null);
  const [adviceResult,   setAdviceResult]   = useState<any>(null);
  const [appliedActions, setAppliedActions] = useState<Record<string, boolean>>({});
  const [isClaiming,     setIsClaiming]     = useState<Record<string, boolean>>({});
  const [isApproving,    setIsApproving]    = useState<Record<string, boolean>>({});
  const [isDeclining,    setIsDeclining]    = useState<Record<string, boolean>>({});
  const [isReopening,    setIsReopening]    = useState<Record<string, boolean>>({});
  const [declineTarget,  setDeclineTarget]  = useState<{ id: string; title: string } | null>(null);
  const [editTarget,     setEditTarget]     = useState<Quest | null>(null);
  const [showAddModal,   setShowAddModal]   = useState(false);

  const switchMember = () => {
    const idx  = members.findIndex(m => m.id === activeMember?.id);
    const next = members[(idx + 1) % members.length];
    if (next) setActiveMember(next.id);
  };

  // ── AI Handlers ──────────────────────────────────────────────────────────────
  const runAI = async (tool: AiTool) => {
    setIsAiLoading(true);
    setShowAiTool(tool);
    if (tool === 'autobalance') { const r = await simulateAutoBalance(quests, kids); setAutoBalResult(r); }
    else if (tool === 'fomo')   { const r = await simulateFomo(quests, kids); setFomoResult(r); }
    else if (tool === 'advice') { const r = await simulateAdvice(quests, kids); setAdviceResult(r); }
    setIsAiLoading(false);
  };

  const handleApply = (key: string, item: any, type = 'assign') => {
    setAppliedActions(p => ({ ...p, [key]: true }));
    const store = useQuestStore.getState();

    if (type === 'fomo') {
      // Flash bonus: update the real quest with bonusCoins + expiry
      if (item.questId) {
        store.updateQuest(
          item.questId,
          { bonusCoins: item.bonusCoins, bonusExpiresAt: item.bonusExpiresAt },
          activeMember?.id,
        );
      }
    } else if (type === 'penalty') {
      // Force-assign: reassign the quest to the target kid
      if (item.questId && item.targetKidId) {
        store.reassignQuest(item.questId, item.targetKidId, activeMember?.id);
      }
    } else if (type === 'bounty') {
      // AI suggested a new pool bounty — add it
      store.addQuest({
        title: item.title, category: 'Other', priority: 'medium',
        coins: item.coins ?? 20, xpReward: 15, isPool: true, isDaily: false,
        recurrence: 'once', status: 'todo',
        dueDate: new Date().toISOString().split('T')[0], photoRequired: false,
        createdById: activeMember?.id,
      });
    } else if (type === 'reassign') {
      // Auto-balance: reassign existing quest to recommended kid
      if (item.questId && item.recommendedKidId) {
        store.reassignQuest(item.questId, item.recommendedKidId, activeMember?.id);
      }
    }
    // 'assign' and other types: just mark applied (future use)
  };

  // ── Quest filtering ───────────────────────────────────────────────────────────
  const filteredQuests = useMemo(() => {
    let list = quests;
    if (isKid) {
      if (kidFilter === 'pool') {
        list = list.filter(q => q.isPool && q.status === 'todo');
      } else {
        list = list.filter(q => q.assignedToId === activeMember?.id || (q.isPool && q.status === 'todo'));
      }
    } else if (kidFilter !== 'all' && kidFilter !== 'cheer') {
      list = list.filter(q => q.assignedToId === kidFilter);
    }

    if (kidFilter !== 'cheer' && tabStatus !== 'all') {
      if (tabStatus === 'todo')      list = list.filter(q => q.status === 'todo' || q.status === 'claimed');
      else if (tabStatus === 'review')    list = list.filter(q => q.status === 'pending_approval');
      else if (tabStatus === 'completed') list = list.filter(q => q.status === 'approved' || q.status === 'done' || q.status === 'declined');
    }
    return list;
  }, [quests, kidFilter, tabStatus, isKid, activeMember]);

  // ── Action handlers ───────────────────────────────────────────────────────────
  const handleClaim = async (id: string) => {
    if (isClaiming[id]) return;
    setIsClaiming(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 700));
    claimQuest(id, activeMember?.id ?? '');
    setIsClaiming(p => ({ ...p, [id]: false }));
  };

  const handleApproveQuest = async (id: string) => {
    if (isApproving[id]) return;
    setIsApproving(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 800));
    approveQuest(id, activeMember?.id ?? '');
    setIsApproving(p => ({ ...p, [id]: false }));
  };

  const handleDeclineConfirm = async (reason: string) => {
    if (!declineTarget) return;
    const id = declineTarget.id;
    setDeclineTarget(null);
    setIsDeclining(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 600));
    declineQuest(id, activeMember?.id ?? '', reason, 'custom');
    setIsDeclining(p => ({ ...p, [id]: false }));
  };

  const handleReopen = async (id: string) => {
    if (isReopening[id]) return;
    setIsReopening(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 600));
    reopenQuest(id, activeMember?.id ?? '');
    setIsReopening(p => ({ ...p, [id]: false }));
  };

  const cardBg   = isDark ? '#131927' : '#FFFFFF';
  const cardBord = isDark ? '#1E293B' : '#E2E8F0';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name}
        memberRole={activeMember?.role === 'kid' ? 'kid' : activeMember?.role === 'senior' ? 'senior' : 'parent'}
        notifCount={0}
        onPersonaPress={switchMember}
        onBellPress={() => {}}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Title + Add Quest (parent ONLY) ── */}
        <View style={[s.titleRow, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: isDark ? colors.textPrimary : '#1E2D6B' }]}>
              {isKid ? 'My Quests' : 'Household Quests'}
            </Text>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple, marginTop: 1 }}>
              {isParent   ? 'Add quests, approve chores & distribute coins'
               : isSenior ? 'Review submissions and encourage the kids'
                           : 'Claim bounties, submit photo proof & earn coins'}
            </Text>
          </View>
          {isParent && (
            <TouchableOpacity style={[s.headerBtn, { backgroundColor: '#059669' }]} onPress={() => setShowAddModal(true)}>
              <I.PlusCircle c="#fff" />
              <Text style={{ color: '#fff', fontSize: TYPO.label, fontWeight: '900' }}>+ Quest</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── AI Engine Banner (parent ONLY) ── */}
        {isParent && (
          <View style={{ marginHorizontal: 14, marginBottom: 12 }}>
            <LinearGradient
              colors={['#1E1B4B', '#1E3A5F', '#0F172A']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.aiBanner}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={s.aiIconBox}><I.Bot c="#C4B5FD" /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.aiBannerTitle}>CubeAI Chores Engine</Text>
                    <View style={s.activePill}><Text style={s.activePillText}>Active</Text></View>
                  </View>
                  <Text style={s.aiBannerSub}>Auto-balancing, FOMO bounties, penalties & age-based coaching</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                <TouchableOpacity style={[s.aiBtnBase, showAiTool === 'autobalance' && s.aiBtnActive]} onPress={() => runAI('autobalance')}>
                  <I.Sparkles c={showAiTool === 'autobalance' ? '#fff' : '#FCD34D'} />
                  <Text style={[s.aiBtnText, showAiTool === 'autobalance' && { color: '#fff' }]}>Auto-Balance</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.aiBtnBase, showAiTool === 'fomo' && { backgroundColor: BRAND.amber, borderColor: BRAND.amber }]} onPress={() => runAI('fomo')}>
                  <I.Flame c={showAiTool === 'fomo' ? '#0F172A' : BRAND.amber} />
                  <Text style={[s.aiBtnText, showAiTool === 'fomo' && { color: '#0F172A' }]}>FOMO & Penalties</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.aiBtnBase, showAiTool === 'advice' && { backgroundColor: '#4338CA', borderColor: '#6366F1' }]} onPress={() => runAI('advice')}>
                  <I.Award c="#818CF8" />
                  <Text style={s.aiBtnText}>Chores Advice</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* ── Senior context banner ── */}
        {isSenior && (
          <View style={[s.seniorBanner, { marginHorizontal: 14, marginBottom: 12 }]}>
            <Text style={s.seniorBannerText}>
              👴 Grandparent View — You can review and approve chore submissions, but quest creation is managed by the parents.
            </Text>
          </View>
        )}

        {/* ── AI Loading ── */}
        {isAiLoading && (
          <View style={[s.aiLoadingBox, { marginHorizontal: 14, marginBottom: 12 }]}>
            <ActivityIndicator color="#A78BFA" size="small" />
            <Text style={s.aiLoadingText}>CubeAI is calculating optimal chore distribution...</Text>
          </View>
        )}

        {/* ── AI Result Cards ── */}
        {!isAiLoading && showAiTool === 'autobalance' && autoBalResult && (
          <AutoBalanceCard result={autoBalResult} onApply={handleApply} appliedActions={appliedActions} onClose={() => setShowAiTool('none')} />
        )}
        {!isAiLoading && showAiTool === 'fomo' && fomoResult && (
          <FomoCard result={fomoResult} onApply={handleApply} appliedActions={appliedActions} onClose={() => setShowAiTool('none')} />
        )}
        {!isAiLoading && showAiTool === 'advice' && adviceResult && (
          <AdviceCard result={adviceResult} appliedActions={appliedActions} onApply={handleApply} onClose={() => setShowAiTool('none')} />
        )}

        {/* ── Member / Filter Pills ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8, marginBottom: 12 }}>
          {isKid ? (
            <>
              {[
                { key: 'all',  label: '🎯 My Quests',    activeColor: BRAND.purple },
                { key: 'pool', label: '⚡ Open Bounties', activeColor: BRAND.amber },
              ].map(item => (
                <TouchableOpacity
                  key={item.key}
                  style={[s.filterPill, kidFilter === item.key
                    ? { backgroundColor: item.activeColor, borderColor: item.activeColor }
                    : { backgroundColor: isDark ? '#0F172A' : '#F1F5F9', borderColor: cardBord }]}
                  onPress={() => { setKidFilter(item.key); setTabStatus('all'); }}
                >
                  <Text style={[s.filterText, { color: kidFilter === item.key ? '#fff' : colors.textSecondary }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[s.filterPill, kidFilter === 'all'
                  ? { backgroundColor: BRAND.purple, borderColor: BRAND.purple }
                  : { backgroundColor: isDark ? '#0F172A' : '#F1F5F9', borderColor: cardBord }]}
                onPress={() => setKidFilter('all')}
              >
                <Text style={[s.filterText, { color: kidFilter === 'all' ? '#fff' : colors.textSecondary }]}>All Quests</Text>
              </TouchableOpacity>
              {kids.map(k => (
                <TouchableOpacity
                  key={k.id}
                  style={[s.filterPill, kidFilter === k.id
                    ? { backgroundColor: BRAND.amber, borderColor: BRAND.amber }
                    : { backgroundColor: isDark ? '#0F172A' : '#F1F5F9', borderColor: cardBord }]}
                  onPress={() => setKidFilter(k.id)}
                >
                  <Text style={[s.filterText, { color: kidFilter === k.id ? '#fff' : colors.textSecondary }]}>
                    {k.emoji ?? '🧒'} {k.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          {/* Sibling Cheer — all roles can cheer */}
          <TouchableOpacity
            style={[s.filterPill, kidFilter === 'cheer'
              ? { backgroundColor: '#4338CA', borderColor: '#6366F1' }
              : { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: isDark ? '#4338CA50' : '#C7D2FE' }]}
            onPress={() => { setKidFilter('cheer'); setTabStatus('all'); }}
          >
            <I.ThumbsUp c={kidFilter === 'cheer' ? '#fff' : '#6366F1'} />
            <Text style={[s.filterText, { color: kidFilter === 'cheer' ? '#fff' : '#6366F1', marginLeft: 4 }]}>Sibling Cheer</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ── Sibling Cheer Panel ── */}
        {kidFilter === 'cheer' ? (
          <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBord, marginHorizontal: 14 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <I.ThumbsUp c="#6366F1" />
              <Text style={[s.cardTitle, { color: isDark ? '#818CF8' : '#4338CA' }]}>Sibling Praise & High-Five Board</Text>
            </View>
            <Text style={[s.cardSub, { color: colors.textSecondary, marginBottom: 12 }]}>
              Send instant High Fives and peer encouragement to your brothers or sisters!
            </Text>
            {kids.map(k => (
              <View key={k.id} style={[s.cheerRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: cardBord }]}>
                <Text style={[s.cheerName, { color: colors.textPrimary }]}>{k.emoji ?? '🧒'} Cheer {k.name} on chores today!</Text>
                <TouchableOpacity
                  style={[s.highFiveBtn, { backgroundColor: '#4338CA' }]}
                  onPress={() => Alert.alert('🖐️ High Five Sent!', `You cheered for ${k.name}!`)}
                >
                  <Text style={{ color: '#fff', fontSize: TYPO.label, fontWeight: '700' }}>🖐️ High Five!</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <>
            {/* ── Status Tabs ── */}
            <View style={[s.statusTabs, { borderBottomColor: cardBord, marginHorizontal: 14 }]}>
              {(['all', 'todo', 'review', 'completed'] as TabStatus[]).map(tab => (
                <TouchableOpacity key={tab} onPress={() => setTabStatus(tab)} style={s.tabItem}>
                  <Text style={[s.tabText, { color: tabStatus === tab ? BRAND.purple : colors.textTertiary }]}>
                    {tab === 'all' ? 'All' : tab === 'todo' ? 'To Do' : tab === 'review' ? 'In Review' : 'Done'}
                  </Text>
                  {tabStatus === tab && <View style={[s.tabLine, { backgroundColor: BRAND.purple }]} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Quest Cards ── */}
            <View style={{ paddingHorizontal: 14, gap: 10, marginTop: 12 }}>
              {filteredQuests.length === 0 && (
                <View style={[s.emptyBox, { backgroundColor: cardBg, borderColor: cardBord }]}>
                  <Text style={[s.emptyText, { color: colors.textTertiary }]}>
                    {tabStatus === 'todo'        ? 'All caught up! No tasks pending 🎉'
                     : tabStatus === 'review'    ? 'No quests awaiting review'
                     : tabStatus === 'completed' ? 'No completed quests yet'
                     : 'No quests found for this filter'}
                  </Text>
                </View>
              )}

              {filteredQuests.map(q => {
                const assignee = members.find(m => m.id === q.assignedToId);
                const isPoolCard = q.isPool && q.status === 'todo';
                const isTodoCard = (q.status === 'todo' || q.status === 'claimed') && !isPoolCard;
                const isReview   = q.status === 'pending_approval';
                const isDoneCard = q.status === 'approved' || q.status === 'done';
                const isDeclined = q.status === 'declined';

                // RBAC checks
                const canClaim   = isKid && isPoolCard;
                // Submit: kid and it's their own quest
                const canSubmit  = isKid && isTodoCard && q.assignedToId === activeMember?.id;
                // Approve/Decline: parent or senior, quest in review
                const canApprove = isParentOrSenior && isReview;
                // Reopen: parent or senior, quest was declined
                const canReopen  = isParentOrSenior && isDeclined;
                // Full edit: pool quest only — all fields (title, desc, coins, category, difficulty, assign)
                const canEditFull       = isParent && isPoolCard;
                // Restricted edit: assigned todo not yet submitted — coins + reassign ONLY, title/desc locked
                const canEditRestricted = isParent && q.status === 'todo' && !!q.assignedToId;
                const canEdit           = canEditFull || canEditRestricted;
                // Delete: parent only, quest not yet submitted (pool, or assigned/unassigned todo)
                const canDelete  = isParent && (isPoolCard || q.status === 'todo');

                // Accent colour by status
                const accentColor =
                  isPoolCard    ? BRAND.amber :
                  isDeclined    ? '#EF4444' :
                  isDoneCard    ? '#10B981' :
                  isReview      ? BRAND.purple :
                  q.priority === 'urgent' ? '#EF4444' : BRAND.purple;

                const hasBonus = q.bonusCoins > 0 && (!q.bonusExpiresAt || new Date(q.bonusExpiresAt) > new Date());

                // ── Collapsed header ────────────────────────────────────────────
                const claimantIds    = q.assignedToIds?.length ? q.assignedToIds : (q.assignedToId ? [q.assignedToId] : []);
                const claimants      = claimantIds.map(id => members.find(m => m.id === id)).filter((m): m is typeof members[0] => !!m);
                const avatarSiblings = members.map(m => m.name);
                const AVSIZE    = 30;
                const AVOVERLAP = 16;
                const stackW    = claimants.length > 0 ? AVSIZE + (claimants.length - 1) * AVOVERLAP : 0;

                // Due date chip — urgency coloring
                const dueMsRaw    = q.dueDate ? new Date(q.dueDate).getTime() : null;
                const todayEnd    = new Date(); todayEnd.setHours(23, 59, 59, 999);
                const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
                const isOverdue   = !!dueMsRaw && dueMsRaw < Date.now() && !isDoneCard && !isDeclined;
                const isDueToday  = !!dueMsRaw && dueMsRaw <= todayEnd.getTime() && !isOverdue;
                const isDueTomorrow = !!dueMsRaw && dueMsRaw <= tomorrowEnd.getTime() && !isDueToday && !isOverdue;
                const dueBg    = isOverdue    ? (isDark ? '#450A0A' : '#FEE2E2')
                               : isDueToday  ? (isDark ? '#1C1000' : '#FFF7ED')
                               : isDark ? '#1E293B' : '#F1F5F9';
                const dueColor = isOverdue ? '#DC2626' : isDueToday ? '#D97706' : colors.textSecondary;
                const dueLabel = isOverdue    ? `⚠ ${q.dueDate ? fmtDateShort(q.dueDate) : 'Overdue'}`
                               : isDueToday  ? '⚡ Today'
                               : isDueTomorrow ? 'Tomorrow'
                               : q.dueDate ? fmtDateShort(q.dueDate) : 'Tonight';

                // Status line — concise, no "due" repetition (due is in chip on right)
                const statusLine = isReview
                  ? `Submitted ${q.submittedAt ? new Date(q.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'for review'}`
                  : isDoneCard
                    ? 'Approved ✅'
                    : isDeclined
                      ? 'Declined ❌'
                      : isPoolCard && claimants.length > 1
                        ? `${claimants.length} kids racing for it`
                        : isPoolCard && claimants.length === 1
                          ? `${claimants[0].name} claimed it`
                          : isPoolCard
                            ? 'Open — waiting for a kid'
                            : q.claimedAt
                              ? `In progress · ${timeAgo(q.claimedAt)}`
                              : (q as any).createdAt
                                ? `Added ${timeAgo((q as any).createdAt)}`
                                : 'Not started';

                const cardHeader = (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 }}>
                    {/* Overlapping avatar stack */}
                    {claimants.length > 0 && (
                      <View style={{ width: stackW, height: AVSIZE, flexShrink: 0 }}>
                        {claimants.slice(0, 4).map((m, i) => (
                          <View key={m.id} style={{ position: 'absolute', left: i * AVOVERLAP, zIndex: claimants.length - i }}>
                            <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={avatarSiblings} size={AVSIZE} ringColor={accentColor} ringWidth={1.5} />
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Title + status */}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.questTitle, { color: colors.textPrimary }]} numberOfLines={1}>{q.title}</Text>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                        {statusLine}
                      </Text>
                    </View>

                    {/* Right: due chip + coins */}
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {(isTodoCard || isPoolCard || isReview) && (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: dueBg }}>
                          <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: dueColor }}>{dueLabel}</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontWeight: '600' }}>
                        {hasBonus ? `+${q.coins + q.bonusCoins}🪙🔥` : `+${q.coins}🪙`}
                      </Text>
                    </View>
                  </View>
                );

                const swipeDeleteAction = (_prog: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
                  const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
                  return (
                    <TouchableOpacity
                      style={{ width: 72, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EF4444', borderRadius: 18, marginLeft: 8, marginBottom: 10 }}
                      onPress={() => Alert.alert(
                        'Delete Quest',
                        `Remove "${q.title}"? This cannot be undone.`,
                        [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteQuest(q.id) }]
                      )}
                    >
                      <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
                        <Text style={{ fontSize: 20 }}>🗑</Text>
                        <Text style={{ color: '#fff', fontSize: TYPO.micro, fontWeight: '800', marginTop: 2 }}>Delete</Text>
                      </Animated.View>
                    </TouchableOpacity>
                  );
                };

                return (
                  <Swipeable
                    key={q.id}
                    renderRightActions={canDelete ? swipeDeleteAction : undefined}
                    overshootRight={false}
                    friction={2}
                  >
                  <CollapsibleQuestCard accentColor={accentColor} cardBg={cardBg} cardBord={cardBord}
                    onDoubleTap={canEdit ? () => setEditTarget(q) : undefined}
                    header={cardHeader}
                  >
                    {/* ── Expanded body — NO title/coin repeat, header already shows them ── */}

                      {/* Timeline row — parent context: when added, when claimed, when due */}
                      {isParentOrSenior && (isTodoCard || isPoolCard) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0, marginBottom: 10, backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: isDark ? '#1E293B' : '#E2E8F0' }}>
                          {/* Added */}
                          <View style={{ alignItems: 'center', flex: 1 }}>
                            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 1 }}>Added</Text>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>
                              {(q as any).createdAt ? timeAgo((q as any).createdAt) : '—'}
                            </Text>
                            {(q as any).createdAt && (
                              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
                                {new Date((q as any).createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </Text>
                            )}
                          </View>
                          <Text style={{ color: isDark ? '#334155' : '#CBD5E1', fontSize: 18, paddingHorizontal: 2 }}>›</Text>
                          {/* Claimed */}
                          <View style={{ alignItems: 'center', flex: 1 }}>
                            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 1 }}>Claimed</Text>
                            {q.claimedAt ? (
                              <>
                                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: accentColor }}>{timeAgo(q.claimedAt)}</Text>
                                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
                                  {new Date(q.claimedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {' '}
                                  {new Date(q.claimedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                </Text>
                              </>
                            ) : (
                              <Text style={{ fontSize: TYPO.label, color: isDark ? '#475569' : '#94A3B8' }}>Not yet</Text>
                            )}
                          </View>
                          <Text style={{ color: isDark ? '#334155' : '#CBD5E1', fontSize: 18, paddingHorizontal: 2 }}>›</Text>
                          {/* Due */}
                          <View style={{ alignItems: 'center', flex: 1 }}>
                            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 1 }}>Due</Text>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>
                              {q.dueDate ? fmtDateShort(q.dueDate) : 'Tonight'}
                            </Text>
                            {q.dueTime && (
                              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{q.dueTime}</Text>
                            )}
                          </View>
                        </View>
                      )}

                      {/* Description */}
                      {q.description ? (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 20, marginBottom: 10 }}>
                          {q.description}
                        </Text>
                      ) : null}

                      {/* Submitted time + photo proof — for In Review */}
                      {isReview && q.submittedAt && (
                        <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: isDark ? BRAND.purple + '40' : '#C7D2FE', overflow: 'hidden', backgroundColor: isDark ? BRAND.purple + '12' : '#EEF2FF' }}>
                          {/* Submitted banner */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
                            <Text style={{ fontSize: TYPO.micro + 1 }}>📬</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: isDark ? '#A78BFA' : '#4338CA' }}>
                                {assignee?.name ?? 'Kid'} submitted for review
                              </Text>
                              <Text style={{ fontSize: TYPO.micro + 1, color: isDark ? '#818CF8' : '#6366F1' }}>
                                {new Date(q.submittedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                {' · '}
                                {new Date(q.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </Text>
                            </View>
                            {q.photoRequired && !q.photoUrl && (
                              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FCD34D' }}>
                                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: '#D97706' }}>No photo</Text>
                              </View>
                            )}
                          </View>
                          {/* Photo thumbnail */}
                          {q.photoUrl ? (
                            <TouchableOpacity onPress={() => Alert.alert('Photo Proof', `"${q.title}" was submitted with photo proof.`)}>
                              <Image
                                source={{ uri: q.photoUrl }}
                                style={{ width: '100%', height: 160, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }}
                                resizeMode="cover"
                              />
                              <View style={{ position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                                <Text style={{ fontSize: TYPO.micro, color: '#fff', fontWeight: '700' }}>Tap to enlarge</Text>
                              </View>
                            </TouchableOpacity>
                          ) : q.photoRequired ? (
                            <View style={{ height: 80, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: isDark ? '#1C1200' : '#FFF7ED' }}>
                              <Text style={{ fontSize: 24 }}>📷</Text>
                              <Text style={{ fontSize: TYPO.label, color: '#D97706', fontWeight: '600' }}>Photo proof missing</Text>
                            </View>
                          ) : null}
                          {/* Completion note */}
                          {q.completionNote ? (
                            <View style={{ padding: 10, paddingTop: 4 }}>
                              <Text style={{ fontSize: TYPO.label, color: isDark ? '#A78BFA' : '#4338CA', fontStyle: 'italic' }}>
                                "{q.completionNote}"
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      )}

                      {/* ── Badge strip ── */}
                      <>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                        <View style={[s.badge, { backgroundColor: isDark ? '#2D1B69' : '#EEF2FF', borderColor: isDark ? '#4338CA40' : '#C7D2FE' }]}>
                          <Text style={[s.badgeText, { color: isDark ? '#818CF8' : '#4338CA' }]}>{q.category}</Text>
                        </View>
                        {q.priority === 'urgent' && (
                          <View style={[s.badge, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
                            <Text style={[s.badgeText, { color: '#DC2626' }]}>🔴 Urgent</Text>
                          </View>
                        )}
                        {q.difficulty && (
                          <View style={[s.badge, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}>
                            <Text style={[s.badgeText, { color: colors.textSecondary }]}>
                              {q.difficulty === 'easy' ? '😊' : q.difficulty === 'medium' ? '💪' : q.difficulty === 'hard' ? '🔥' : '⚡'}{' '}
                              {q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}
                            </Text>
                          </View>
                        )}
                        {isPoolCard && (
                          <View style={[s.badge, { backgroundColor: isDark ? '#1C1000' : '#FFFBEB', borderColor: BRAND.amber + '60' }]}>
                            <Text style={[s.badgeText, { color: BRAND.amber }]}>⚡ Open Bounty</Text>
                          </View>
                        )}
                        {q.photoRequired && (isTodoCard || isPoolCard) && (
                          <View style={[s.badge, { backgroundColor: isDark ? '#1C1700' : '#FFFBEB', borderColor: '#FCD34D60' }]}>
                            <Text style={[s.badgeText, { color: '#D97706' }]}>📷 Photo proof</Text>
                          </View>
                        )}
                        {hasBonus && (
                          <View style={[s.badge, { backgroundColor: '#FCD34D18', borderColor: '#FCD34D60' }]}>
                            <Text style={[s.badgeText, { color: '#F59E0B', fontWeight: '900' }]}>
                              🔥 +{q.bonusCoins}🪙 BONUS{q.bonusExpiresAt ? ` · ${Math.max(0, Math.round((new Date(q.bonusExpiresAt).getTime() - Date.now()) / 3600000))}h left` : ''}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* ── Meta row — due date + modified-by notice (avatar already in header) ── */}
                      <View style={[s.metaRow, { borderTopColor: isDark ? '#1E293B' : '#F0F4F8' }]}>
                        <View style={{ flex: 1 }}>
                          {q.lastModifiedById && (
                            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
                              ✏️ edited by {members.find(m => m.id === q.lastModifiedById)?.name ?? 'parent'}
                            </Text>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>
                            📅 {q.dueDate ? fmtDateShort(q.dueDate) : 'Tonight'}
                          </Text>
                          {q.dueTime && (
                            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>🕐 {q.dueTime}</Text>
                          )}
                        </View>
                      </View>

                      {/* ── Decline reason ── */}
                      {isDeclined && q.declineReason && (
                        <View style={[s.declineBox, { backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderColor: '#FCA5A5' }]}>
                          <I.AlertCircle c="#EF4444" />
                          <Text style={[s.declineText, { color: '#EF4444', flex: 1 }]}>{q.declineReason}</Text>
                        </View>
                      )}

                      </>{/* end badge strip */}

                    {/* Action strip */}
                    <View style={[s.actionStrip, { borderTopColor: isDark ? '#1E293B' : '#F0F4F8' }]}>

                      {/* Kid: Claim open bounty */}
                      {canClaim && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: BRAND.amber, opacity: isClaiming[q.id] ? 0.6 : 1 }]}
                          onPress={() => handleClaim(q.id)}
                          disabled={isClaiming[q.id]}
                        >
                          {isClaiming[q.id]
                            ? <ActivityIndicator color="#0F172A" size="small" />
                            : <Text style={[s.actionBtnText, { color: '#0F172A' }]}>Claim Quest</Text>}
                        </TouchableOpacity>
                      )}

                      {/* Parent/Senior view of open bounty — info only */}
                      {isPoolCard && isParentOrSenior && (
                        <View style={[s.paidBadge, { backgroundColor: isDark ? '#1C1000' : '#FFFBEB', borderColor: BRAND.amber + '50' }]}>
                          <Text style={[s.paidText, { color: BRAND.amber }]}>Waiting for a kid to claim</Text>
                        </View>
                      )}

                      {/* Kid: Submit proof — only for their OWN quest */}
                      {canSubmit && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: BRAND.purple }]}
                          onPress={() => Alert.alert(
                            q.photoRequired ? 'Submit with Photo' : 'Mark as Done',
                            `Submit "${q.title}" for parent review?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Submit', onPress: () => submitQuest(q.id) },
                            ]
                          )}
                        >
                          <I.Camera c="#fff" />
                          <Text style={s.actionBtnText}>Submit{q.photoRequired ? ' Photo' : ''} Proof</Text>
                        </TouchableOpacity>
                      )}

                      {/* Kid viewing ANOTHER kid's in-progress quest — read only info */}
                      {isTodoCard && isKid && q.assignedToId !== activeMember?.id && (
                        <View style={[s.paidBadge, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: cardBord }]}>
                          <Text style={[s.paidText, { color: colors.textTertiary }]}>
                            Assigned to {assignee?.name ?? '…'}
                          </Text>
                        </View>
                      )}

                      {/* Parent/Senior: Inspect + Decline + Approve & Pay */}
                      {canApprove && (
                        <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                            onPress={() => Alert.alert(
                              'Photo Proof',
                              q.photoUrl ? `Photo submitted for "${q.title}"` : `"${q.title}" was submitted without a photo.`
                            )}
                          >
                            <Text style={[s.actionBtnText, { color: colors.textSecondary }]}>Inspect Photo</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: '#EF4444', opacity: isDeclining[q.id] ? 0.6 : 1 }]}
                            onPress={() => setDeclineTarget({ id: q.id, title: q.title })}
                            disabled={isDeclining[q.id]}
                          >
                            {isDeclining[q.id]
                              ? <ActivityIndicator color="#fff" size="small" />
                              : <Text style={s.actionBtnText}>Decline</Text>}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: '#059669', opacity: isApproving[q.id] ? 0.6 : 1 }]}
                            onPress={() => handleApproveQuest(q.id)}
                            disabled={isApproving[q.id]}
                          >
                            {isApproving[q.id]
                              ? <ActivityIndicator color="#fff" size="small" />
                              : <Text style={s.actionBtnText}>Approve & Pay</Text>}
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Completed badge */}
                      {isDoneCard && (
                        <View style={[s.paidBadge, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5', borderColor: isDark ? '#10B981' : '#6EE7B7' }]}>
                          <I.CheckCircle c="#10B981" />
                          <Text style={[s.paidText, { color: '#10B981' }]}>Paid (+{q.coins}🪙)</Text>
                        </View>
                      )}

                      {/* Declined + Reopen (parent/senior only) */}
                      {isDeclined && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[s.paidBadge, { backgroundColor: isDark ? '#450A0A' : '#FEE2E2', borderColor: '#FCA5A5' }]}>
                            <Text style={[s.paidText, { color: '#EF4444' }]}>Declined</Text>
                          </View>
                          {canReopen && (
                            <TouchableOpacity
                              style={[s.actionBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', opacity: isReopening[q.id] ? 0.6 : 1 }]}
                              onPress={() => handleReopen(q.id)}
                              disabled={isReopening[q.id]}
                            >
                              {isReopening[q.id]
                                ? <ActivityIndicator color={colors.textSecondary} size="small" />
                                : (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                    <I.RotateCcw c={colors.textSecondary} />
                                    <Text style={[s.actionBtnText, { color: colors.textSecondary }]}>Reopen</Text>
                                  </View>
                                )}
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                      {/* Parent: double-tap card to edit — hint shown when no primary action buttons conflict */}
                      {canEdit && !canClaim && !canSubmit && !canApprove && !isDeclined && !isDoneCard && (
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: TYPO.micro, color: isDark ? '#475569' : '#94A3B8', fontStyle: 'italic' }}>double-tap to edit</Text>
                        </View>
                      )}
                    </View>{/* action strip */}
                  </CollapsibleQuestCard>
                  </Swipeable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Parent-only: Add Quest modal */}
      {isParent && (
        <AddQuestModal visible={showAddModal} onClose={() => setShowAddModal(false)} activeMemberId={activeMember?.id ?? ''} />
      )}

      {/* Parent-only: Edit unclaimed quest modal */}
      {isParent && editTarget && (
        <EditQuestModal
          quest={editTarget}
          activeMemberId={activeMember?.id ?? ''}
          editMode={editTarget?.isPool ? 'full' : 'restricted'}
          onClose={() => setEditTarget(null)}
          onSave={(id, patch) => { updateQuest(id, patch, activeMember?.id); setEditTarget(null); }}
          onDelete={(id) => { deleteQuest(id); setEditTarget(null); }}
        />
      )}

      {/* Decline modal — appears when parent/senior taps Decline */}
      <DeclineModal
        visible={!!declineTarget}
        questTitle={declineTarget?.title ?? ''}
        onConfirm={handleDeclineConfirm}
        onCancel={() => setDeclineTarget(null)}
        colors={colors}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  titleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  title:       { fontSize: TYPO.heading, fontWeight: '900' },
  headerBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },

  aiBanner:    { borderRadius: 24, padding: 14, borderWidth: 1, borderColor: '#6D28D940' },
  aiIconBox:   { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(139,92,246,0.3)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  aiBannerTitle: { fontSize: TYPO.label, fontWeight: '900', color: '#C4B5FD' },
  activePill:  { backgroundColor: 'rgba(16,185,129,0.3)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(52,211,153,0.4)' },
  activePillText: { fontSize: TYPO.micro, fontWeight: '700', color: '#6EE7B7' },
  aiBannerSub: { fontSize: TYPO.micro + 1, color: 'rgba(196,181,253,0.8)', marginTop: 2 },
  aiBtnBase:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  aiBtnActive: { backgroundColor: BRAND.purple, borderColor: '#C4B5FD' },
  aiBtnText:   { fontSize: TYPO.micro, fontWeight: '700', color: '#E0D9FF' },

  seniorBanner:     { borderRadius: 20, borderWidth: 1, borderColor: '#92400E60', backgroundColor: '#1C1000', padding: 12 },
  seniorBannerText: { fontSize: TYPO.label, color: '#FCD34D', fontWeight: '600', lineHeight: 16 },

  aiLoadingBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0F172A', borderRadius: 20, borderWidth: 1, borderColor: '#6D28D940', padding: 14 },
  aiLoadingText: { fontSize: TYPO.label, fontWeight: '700', color: '#A78BFA', flex: 1 },

  filterPill:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText:  { fontSize: TYPO.label, fontWeight: '700' },

  statusTabs:  { flexDirection: 'row', borderBottomWidth: 1, gap: 4 },
  tabItem:     { paddingBottom: 8, paddingHorizontal: 4, position: 'relative' },
  tabText:     { fontSize: TYPO.caption, fontWeight: '700' },
  tabLine:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1 },

  card:        { borderRadius: 24, borderWidth: 1, padding: 14 },
  cardTitle:   { fontSize: TYPO.caption, fontWeight: '700' },
  cardSub:     { fontSize: TYPO.label, lineHeight: 16 },
  cheerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: 1, padding: 10, marginBottom: 8 },
  cheerName:   { fontSize: TYPO.caption, fontWeight: '700', flex: 1 },
  highFiveBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },

  // ── Quest card ──────────────────────────────────────────────────────────────
  questCard:   {
    borderRadius: 20, borderWidth: 1, overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 0,
    // subtle shadow
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  accentBar:   { width: 4, borderRadius: 0 },
  coinPill:    {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 8,
    minWidth: 56,
  },
  coinPillSm:  {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  badge:       { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:   { fontSize: TYPO.micro, fontWeight: '700' },
  questTitle:  { fontSize: TYPO.subheading, fontWeight: '800', lineHeight: 22 },
  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  metaAvatar:  { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  declineBox:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start', borderRadius: 12, borderWidth: 1, padding: 8, marginTop: 6 },
  declineText: { fontSize: TYPO.label, fontWeight: '600', lineHeight: 18 },
  actionStrip: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  actionBtnText: { fontSize: TYPO.label, fontWeight: '800', color: '#fff' },
  paidBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  paidText:    { fontSize: TYPO.label, fontWeight: '700' },
  emptyBox:    { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center' },
  emptyText:   { fontSize: TYPO.caption, textAlign: 'center' },
  // ── Cheer card ──────────────────────────────────────────────────────────────
  catBadge:    { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  catText:     { fontSize: TYPO.micro, fontWeight: '700' },
  coinAmt:     { fontSize: TYPO.label, fontWeight: '900', textAlign: 'right' },
  metaText:    { fontSize: TYPO.micro + 1 },
  metaVal:     { fontWeight: '700' },
});
