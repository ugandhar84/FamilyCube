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
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/questStore';
import type { QuestCategory } from '@/store/questStore';
import AppHeader from '@/components/AppHeader';
import { BRAND } from '@/components/FamilyCubeLogo';

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
    assignments: quests.filter(q => q.status === 'todo').slice(0, 3).map((q, i) => ({
      questTitle: q.title,
      recommendedKid: kids[i % kids.length]?.name ?? 'Leo',
      reason: `Age-appropriate for ${kids[i % kids.length]?.name ?? 'Leo'} based on current workload`,
    })),
    newSuggestedQuests: [
      { title: 'Organize bookshelf', coins: 20, assignee: kids[1]?.name ?? 'Maya', reason: 'Great for age 7 — builds organization skills' },
      { title: 'Feed the pet', coins: 15, assignee: kids[0]?.name ?? 'Leo', reason: 'Daily responsibility training' },
    ],
  }), 1800));
}
function simulateFomo(quests: any[]) {
  return new Promise<any>(res => setTimeout(() => res({
    fomoNudgeSummary: `3 chores are overdue by more than 24 hours! Activating FOMO flash bonuses to encourage quick completion before Friday family game night.`,
    urgentAlerts: quests.filter(q => q.status === 'todo').slice(0, 2).map(q => ({
      title: q.title, bonusCoins: 15,
      fomoMessage: `⏰ Flash bonus expires in 2 hours! Other kids are eyeing this +15 bonus. Don't miss out!`,
    })),
    penaltiesAndForceAssigns: quests.filter(q => q.status === 'todo' && q.priority === 'urgent').slice(0, 1).map(q => ({
      title: q.title, targetKid: 'Leo', penaltyCoins: 10,
      action: 'Overdue 36 hours — auto-assigning and sending nudge to Leo\'s phone',
    })),
  }), 1600));
}
function simulateAdvice(quests: any[], kids: any[]) {
  return new Promise<any>(res => setTimeout(() => res({
    familyCoachingTip: 'Try a "Power Hour" on Saturdays where everyone does chores together with music. Kids complete 3× more tasks and enjoy it when parents participate!',
    topPerformer: kids[0]?.name ?? 'Leo',
    kidEncouragementNotes: Object.fromEntries(kids.map((k, i) => [
      k.name,
      i === 0
        ? `⭐ Amazing work, ${k.name}! You're leading the family leaderboard. Keep that streak!`
        : `💪 Great effort ${k.name}! Just 2 more chores and you'll unlock the Friday movie perk!`,
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
              <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 12 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dm.btn, { flex: 2, backgroundColor: finalReason ? '#EF4444' : colors.border }]}
              onPress={() => finalReason && onConfirm(finalReason)}
              disabled={!finalReason}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>Decline Quest</Text>
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
  title:       { fontSize: 16, fontWeight: '900', marginBottom: 2 },
  sub:         { fontSize: 11, marginBottom: 14 },
  label:       { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  preset:      { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 7 },
  presetText:  { fontSize: 12, fontWeight: '600' },
  input:       { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 13, minHeight: 60, marginTop: 4 },
  charCount:   { fontSize: 10, textAlign: 'right', marginTop: 2 },
  btn:         { borderRadius: 14, padding: 13, alignItems: 'center' },
});

// ─── Add Quest Modal ──────────────────────────────────────────────────────────
const ALL_CATEGORIES: QuestCategory[] = ['Kitchen', 'Room', 'Yard', 'School', 'Pet', 'Living Room', 'Errand', 'Tech', 'Other'];

function AddQuestModal({ visible, onClose, activeMemberId }: {
  visible: boolean; onClose: () => void; activeMemberId: string;
}) {
  const { colors } = useTheme();
  const { addQuest } = useQuestStore();
  const members = useFamilyStore(s => s.members);
  const kids    = members.filter(m => m.role === 'kid');

  const [title,    setTitle]    = useState('');
  const [coins,    setCoins]    = useState('30');
  const [category, setCategory] = useState<QuestCategory>('Kitchen');
  const [assignTo, setAssignTo] = useState('');
  const [isPool,   setIsPool]   = useState(false);
  const [saving,   setSaving]   = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    addQuest({
      title: title.trim(), category, priority: 'medium',
      coins: parseInt(coins) || 30, xpReward: 20,
      assignedToId: isPool ? undefined : (assignTo || undefined),
      isPool, isDaily: false, recurrence: 'once', status: 'todo',
      dueDate: new Date().toISOString().split('T')[0],
      photoRequired: false, createdById: activeMemberId,
    });
    setSaving(false);
    setTitle(''); setCoins('30'); setAssignTo(''); setIsPool(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={aq.backdrop}>
        <View style={[aq.sheet, { backgroundColor: colors.card }]}>
          <View style={[aq.handle, { backgroundColor: colors.border }]} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={[aq.title, { color: colors.textPrimary }]}>+ Add Quest</Text>
            <TouchableOpacity onPress={onClose}><I.X c={colors.textSecondary} /></TouchableOpacity>
          </View>

          <Text style={[aq.label, { color: colors.textSecondary }]}>Quest Title *</Text>
          <TextInput
            style={[aq.input, { color: colors.textPrimary, borderColor: title.trim() ? colors.border : '#EF444480', backgroundColor: colors.surface }]}
            placeholder="e.g. Wash the dishes"
            placeholderTextColor={colors.textTertiary}
            value={title} onChangeText={setTitle}
          />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 90 }}>
              <Text style={[aq.label, { color: colors.textSecondary }]}>Coins 🪙</Text>
              <TextInput
                style={[aq.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                keyboardType="number-pad" value={coins} onChangeText={setCoins}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[aq.label, { color: colors.textSecondary }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {ALL_CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[aq.catChip, category === c && { backgroundColor: BRAND.purple, borderColor: BRAND.purple }]}
                      onPress={() => setCategory(c)}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: category === c ? '#fff' : colors.textSecondary }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>

          <Text style={[aq.label, { color: colors.textSecondary, marginTop: 10 }]}>Assign To</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <TouchableOpacity
              style={[aq.kidChip, isPool && { backgroundColor: BRAND.amber + '30', borderColor: BRAND.amber }]}
              onPress={() => { setIsPool(true); setAssignTo(''); }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: isPool ? BRAND.amber : colors.textSecondary }}>⚡ Open Bounty</Text>
            </TouchableOpacity>
            {kids.map(k => (
              <TouchableOpacity
                key={k.id}
                style={[aq.kidChip, assignTo === k.id && !isPool && { backgroundColor: BRAND.purple + '25', borderColor: BRAND.purple }]}
                onPress={() => { setAssignTo(k.id); setIsPool(false); }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: assignTo === k.id && !isPool ? BRAND.purple : colors.textSecondary }}>
                  {k.emoji ?? '🧒'} {k.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[aq.submitBtn, { backgroundColor: title.trim() ? '#059669' : colors.border, opacity: saving ? 0.6 : 1, marginTop: 16 }]}
            onPress={submit} disabled={saving || !title.trim()}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>Add Quest to Board</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const aq = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle:    { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:     { fontSize: 16, fontWeight: '900' },
  label:     { fontSize: 11, fontWeight: '700', marginBottom: 5 },
  input:     { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 13, marginBottom: 12 },
  catChip:   { borderWidth: 1, borderColor: '#DDD', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  kidChip:   { borderWidth: 1, borderColor: '#DDD', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  submitBtn: { borderRadius: 14, padding: 14, alignItems: 'center' },
});

// ─── AI Result Cards ──────────────────────────────────────────────────────────
function AutoBalanceCard({ result, onApply, appliedActions, onClose }: any) {
  return (
    <View style={[ai.card, { borderColor: '#6D28D966' }]}>
      <View style={[ai.header, { borderBottomColor: '#4C1D9580' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <I.Sparkles c="#FCD34D" />
          <Text style={[ai.headerText, { color: '#C4B5FD' }]}>AI Chore Auto-Balancer</Text>
        </View>
        <TouchableOpacity onPress={onClose}><Text style={{ color: '#A78BFA', fontSize: 10 }}>✕ Close</Text></TouchableOpacity>
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
                : <TouchableOpacity style={ai.applyBtn} onPress={() => onApply(`bal_${idx}`, item)}>
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
        <TouchableOpacity onPress={onClose}><Text style={{ color: '#FCD34D', fontSize: 10 }}>✕ Close</Text></TouchableOpacity>
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
                : <TouchableOpacity style={[ai.applyBtn, { backgroundColor: BRAND.amber }]} onPress={() => onApply(`fomo_${idx}`, alert)}>
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
                  <Text style={[ai.rowTitle, { color: '#FCA5A5', flex: 1 }]}>{pen.title} → {pen.targetKid}</Text>
                  <Text style={[ai.chipText, { color: '#F87171' }]}>-{pen.penaltyCoins}🪙</Text>
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
        <TouchableOpacity onPress={onClose}><Text style={{ color: '#818CF8', fontSize: 10 }}>✕ Close</Text></TouchableOpacity>
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
  headerText: { fontSize: 11, fontWeight: '900', flex: 1 },
  summary:    { fontSize: 11, fontWeight: '600', lineHeight: 16, color: '#CBD5E1' },
  infoBox:    { borderRadius: 14, borderWidth: 1, padding: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, color: '#94A3B8' },
  row:        { borderRadius: 14, backgroundColor: '#1E293B', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fomoRow:    { borderRadius: 14, borderWidth: 1, padding: 10, backgroundColor: '#1C1000', borderColor: '#FCD34D40', marginBottom: 6 },
  rowTitle:   { fontSize: 11, fontWeight: '700' },
  rowSub:     { fontSize: 10, marginTop: 2 },
  chip:       { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  chipText:   { fontSize: 10, fontWeight: '900' },
  doneChip:   { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  doneText:   { color: '#fff', fontSize: 10, fontWeight: '900' },
  applyBtn:   { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  applyText:  { color: '#fff', fontSize: 10, fontWeight: '900' },
  divider:    { borderTopWidth: 1, marginVertical: 2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type TabStatus = 'all' | 'todo' | 'review' | 'completed';
type AiTool   = 'none' | 'autobalance' | 'fomo' | 'advice';

export default function QuestsScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const { quests, claimQuest, submitQuest, approveQuest, declineQuest, reopenQuest } = useQuestStore();

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
    else if (tool === 'fomo')   { const r = await simulateFomo(quests); setFomoResult(r); }
    else if (tool === 'advice') { const r = await simulateAdvice(quests, kids); setAdviceResult(r); }
    setIsAiLoading(false);
  };

  const handleApply = (key: string, item: any, type = 'assign') => {
    setAppliedActions(p => ({ ...p, [key]: true }));
    if (type === 'bounty') {
      useQuestStore.getState().addQuest({
        title: item.title, category: 'Other', priority: 'medium',
        coins: item.coins, xpReward: 15, isPool: true, isDaily: false,
        recurrence: 'once', status: 'todo',
        dueDate: new Date().toISOString().split('T')[0], photoRequired: false,
      });
    }
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
    declineQuest(id, activeMember?.id ?? '', reason);
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 40 }}>

        {/* ── Title + Add Quest (parent ONLY) ── */}
        <View style={[s.titleRow, { paddingHorizontal: 14 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: colors.textPrimary }]}>Household Quests Engine</Text>
            <Text style={[s.titleSub, { color: colors.textSecondary }]}>
              {isParent   ? 'Add quests, approve chores & distribute coins'
               : isSenior ? 'Review submissions and encourage the kids'
                           : 'Claim bounties, submit photo proof & earn coins'}
            </Text>
          </View>
          {isParent && (
            <TouchableOpacity style={[s.addBtn, { backgroundColor: '#059669' }]} onPress={() => setShowAddModal(true)}>
              <I.PlusCircle c="#fff" />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>+ Quest</Text>
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
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>🖐️ High Five!</Text>
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

                return (
                  <View key={q.id} style={[s.questCard, { backgroundColor: cardBg, borderColor: cardBord }]}>
                    {/* Title row */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                        <View style={[s.catBadge, { backgroundColor: isDark ? '#2D1B69' : '#EEF2FF', borderColor: isDark ? '#4338CA50' : '#C7D2FE' }]}>
                          <Text style={[s.catText, { color: isDark ? '#818CF8' : '#4338CA' }]}>{q.category}</Text>
                        </View>
                        {q.priority === 'urgent' && (
                          <View style={[s.catBadge, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
                            <Text style={[s.catText, { color: '#DC2626' }]}>🔴 Urgent</Text>
                          </View>
                        )}
                        {isPoolCard && (
                          <View style={[s.catBadge, { backgroundColor: isDark ? '#1C1000' : '#FFFBEB', borderColor: BRAND.amber + '60' }]}>
                            <Text style={[s.catText, { color: BRAND.amber }]}>⚡ Open Bounty</Text>
                          </View>
                        )}
                        {q.photoRequired && (isTodoCard || isPoolCard) && (
                          <View style={[s.catBadge, { backgroundColor: isDark ? '#1C1700' : '#FFFBEB', borderColor: '#FCD34D80' }]}>
                            <Text style={[s.catText, { color: '#D97706' }]}>📷 Photo required</Text>
                          </View>
                        )}
                        <Text style={[s.questTitle, { color: colors.textPrimary }]}>{q.title}</Text>
                      </View>
                      <Text style={[s.coinAmt, { color: isDark ? '#FCD34D' : '#D97706' }]}>
                        +{q.coins}🪙{'\n'}(${(q.coins * 0.1).toFixed(2)})
                      </Text>
                    </View>

                    {/* Meta row */}
                    <View style={[s.metaRow, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                      <Text style={[s.metaText, { color: colors.textTertiary }]}>
                        Assignee:{' '}
                        <Text style={[s.metaVal, { color: colors.textSecondary }]}>
                          {isPoolCard ? 'Open for anyone' : (assignee?.name ?? 'Unassigned')}
                        </Text>
                      </Text>
                      <Text style={[s.metaText, { color: colors.textTertiary }]}>
                        Due:{' '}
                        <Text style={[s.metaVal, { color: colors.textSecondary }]}>
                          {q.dueDate ? new Date(q.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Tonight'}
                        </Text>
                      </Text>
                    </View>

                    {/* Decline reason — visible to EVERYONE so kid knows why */}
                    {isDeclined && q.declineReason && (
                      <View style={[s.declineBox, { backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderColor: '#FCA5A5' }]}>
                        <I.AlertCircle c="#EF4444" />
                        <Text style={[s.declineText, { color: '#EF4444', flex: 1 }]}>{q.declineReason}</Text>
                      </View>
                    )}

                    {/* Action row */}
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>

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
                    </View>
                  </View>
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
  titleRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  title:       { fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  titleSub:    { fontSize: 10, marginTop: 2, lineHeight: 14 },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },

  aiBanner:    { borderRadius: 24, padding: 14, borderWidth: 1, borderColor: '#6D28D940' },
  aiIconBox:   { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(139,92,246,0.3)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  aiBannerTitle: { fontSize: 11, fontWeight: '900', color: '#C4B5FD' },
  activePill:  { backgroundColor: 'rgba(16,185,129,0.3)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(52,211,153,0.4)' },
  activePillText: { fontSize: 9, fontWeight: '700', color: '#6EE7B7' },
  aiBannerSub: { fontSize: 10, color: 'rgba(196,181,253,0.8)', marginTop: 2 },
  aiBtnBase:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  aiBtnActive: { backgroundColor: BRAND.purple, borderColor: '#C4B5FD' },
  aiBtnText:   { fontSize: 9, fontWeight: '700', color: '#E0D9FF' },

  seniorBanner:     { borderRadius: 20, borderWidth: 1, borderColor: '#92400E60', backgroundColor: '#1C1000', padding: 12 },
  seniorBannerText: { fontSize: 11, color: '#FCD34D', fontWeight: '600', lineHeight: 16 },

  aiLoadingBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0F172A', borderRadius: 20, borderWidth: 1, borderColor: '#6D28D940', padding: 14 },
  aiLoadingText: { fontSize: 11, fontWeight: '700', color: '#A78BFA', flex: 1 },

  filterPill:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText:  { fontSize: 11, fontWeight: '700' },

  statusTabs:  { flexDirection: 'row', borderBottomWidth: 1, gap: 4 },
  tabItem:     { paddingBottom: 8, paddingHorizontal: 4, position: 'relative' },
  tabText:     { fontSize: 12, fontWeight: '700' },
  tabLine:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1 },

  card:        { borderRadius: 24, borderWidth: 1, padding: 14 },
  cardTitle:   { fontSize: 12, fontWeight: '700' },
  cardSub:     { fontSize: 11, lineHeight: 16 },
  cheerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: 1, padding: 10, marginBottom: 8 },
  cheerName:   { fontSize: 12, fontWeight: '700', flex: 1 },
  highFiveBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },

  questCard:   { borderRadius: 24, borderWidth: 1, padding: 14, gap: 10 },
  catBadge:    { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  catText:     { fontSize: 9, fontWeight: '700' },
  questTitle:  { fontSize: 12, fontWeight: '700' },
  coinAmt:     { fontSize: 11, fontWeight: '900', textAlign: 'right', lineHeight: 16 },
  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 8 },
  metaText:    { fontSize: 10 },
  metaVal:     { fontWeight: '700' },
  declineBox:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start', borderRadius: 12, borderWidth: 1, padding: 8 },
  declineText: { fontSize: 11, fontWeight: '600', lineHeight: 15 },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  paidBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  paidText:    { fontSize: 10, fontWeight: '700' },
  emptyBox:    { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center' },
  emptyText:   { fontSize: 12, textAlign: 'center' },
});
