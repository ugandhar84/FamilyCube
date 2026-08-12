import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore, Quest, QuestStatus, QuestCategory } from '@/store/questStore';
import type { FamilyMember } from '@/store/familyStore';

const CATEGORIES: QuestCategory[] = [
  'Kitchen','Room','Yard','School','Pet','Living Room','Errand','Tech','Other',
];
const CAT_EMOJI: Record<QuestCategory, string> = {
  Kitchen:'🍽️', Room:'🛏️', Yard:'🌿', School:'📚', Pet:'🐾',
  'Living Room':'🛋️', Errand:'🏃', Tech:'💻', Other:'✨',
};

function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

// ─── Quest Card ───────────────────────────────────────────────────────────────

function QuestCard({ quest, members, activeMemberId, isParent, colors,
  onApprove, onDecline, onClaim, onSubmit }: {
  quest: Quest; members: FamilyMember[]; activeMemberId: string | null;
  isParent: boolean; colors: any;
  onApprove:(id:string)=>void; onDecline:(id:string)=>void;
  onClaim:(id:string)=>void; onSubmit:(id:string)=>void;
}) {
  const assignee = members.find(m => m.id === quest.assignedToId);
  const isReview = quest.status === 'pending_approval';
  const isDone   = quest.status === 'done' || quest.status === 'approved';
  const isPool   = quest.status === 'todo' && !quest.assignedToId;

  const borderCol = isReview ? colors.amber + '80' : isDone ? colors.teal + '60' : colors.border;

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: borderCol }]}>
      <View style={[s.row, { justifyContent:'space-between', marginBottom:8 }]}>
        <View style={[s.catBadge, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40' }]}>
          <Text style={{ fontSize:11 }}>{CAT_EMOJI[quest.category]}</Text>
          <Text style={{ fontSize:9, fontWeight:'800', color: colors.primary, marginLeft:3 }}>{quest.category}</Text>
        </View>
        <View style={[s.statusPill, {
          backgroundColor: isReview ? colors.amber + '25' : isDone ? colors.teal + '25' :
            isPool ? colors.primary + '20' : colors.surface,
          borderColor: isReview ? colors.amber + '50' : isDone ? colors.teal + '50' :
            isPool ? colors.primary + '40' : colors.border,
        }]}>
          <Text style={{ fontSize:9, fontWeight:'900',
            color: isReview ? colors.amber : isDone ? colors.teal :
              isPool ? colors.primary : colors.textTertiary }}>
            {isReview ? '🔍 In Review' : isDone ? '✅ Done' :
              isPool ? '🎯 Bounty Pool' : '▶ In Progress'}
          </Text>
        </View>
      </View>

      <Text style={{ fontSize:14, fontWeight:'800', color: colors.textPrimary, marginBottom:4 }}>{quest.title}</Text>
      {quest.description ? (
        <Text style={{ fontSize:11, color: colors.textTertiary, marginBottom:6 }} numberOfLines={2}>
          {quest.description}
        </Text>
      ) : null}

      <View style={[s.row, { justifyContent:'space-between', marginBottom:8 }]}>
        <Text style={{ fontSize:12, fontWeight:'900', color: colors.amber }}>+{quest.coins ?? 0} 🪙</Text>
        {quest.dueDate ? (
          <View style={[s.row]}>
            <Ionicons name="calendar-outline" size={10} color={colors.textTertiary} />
            <Text style={{ fontSize:10, color: colors.textTertiary, marginLeft:3 }}>
              {formatDate(quest.dueDate)}
            </Text>
          </View>
        ) : null}
      </View>

      {assignee && (
        <View style={[s.row, { marginBottom:8 }]}>
          <Text style={{ fontSize:13, marginRight:4 }}>{assignee.emoji ?? '👤'}</Text>
          <Text style={{ fontSize:10, fontWeight:'600', color: colors.textSecondary }}>{assignee.name.split(' ')[0]}</Text>
        </View>
      )}

      {isParent && isReview && (
        <View style={[s.row, { gap:8 }]}>
          <Pressable onPress={() => onApprove(quest.id)}
            style={[s.actionBtn, { flex:1, backgroundColor: colors.teal }]}>
            <Text style={{ fontSize:11, fontWeight:'800', color:'#fff' }}>✓ Approve & Pay</Text>
          </Pressable>
          <Pressable onPress={() => onDecline(quest.id)}
            style={[s.actionBtn, { flex:1, backgroundColor: colors.danger + '25', borderWidth:1,
              borderColor: colors.danger + '50' }]}>
            <Text style={{ fontSize:11, fontWeight:'800', color: colors.danger }}>✕ Decline</Text>
          </Pressable>
        </View>
      )}

      {!isParent && !isReview && !isDone && isPool && (
        <Pressable onPress={() => onClaim(quest.id)}
          style={[s.actionBtn, { backgroundColor: colors.primary }]}>
          <Text style={{ fontSize:11, fontWeight:'800', color:'#fff' }}>⚡ Claim Bounty</Text>
        </Pressable>
      )}

      {!isParent && !isReview && !isDone && quest.assignedToId === activeMemberId && (
        <Pressable onPress={() => onSubmit(quest.id)}
          style={[s.actionBtn, { backgroundColor: colors.amber }]}>
          <Text style={{ fontSize:11, fontWeight:'800', color:'#000' }}>📸 Submit for Review</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Cheer Card ───────────────────────────────────────────────────────────────

function CheerCard({ colors }: { colors: any }) {
  return (
    <View style={[s.card, { backgroundColor: colors.teal + '18', borderColor: colors.teal + '40' }]}>
      <View style={[s.row, { marginBottom:8 }]}>
        <Ionicons name="heart" size={14} color={colors.teal} />
        <Text style={{ fontSize:12, fontWeight:'800', color: colors.teal, marginLeft:6 }}>Sibling Cheer Station</Text>
      </View>
      <Text style={{ fontSize:11, color: colors.textSecondary, marginBottom:12 }}>
        Send encouragement to your brother or sister. Each cheer earns 5🪙 bonus for both of you!
      </Text>
      <View style={[s.row, { gap:8 }]}>
        {['🎉 You got this!','🔥 Keep going!','⭐ Almost done!'].map(msg => (
          <Pressable key={msg} onPress={() => Alert.alert('Cheer Sent!', `"${msg}" delivered!`)}
            style={[s.cheerBtn, { backgroundColor: colors.card, borderColor: colors.teal + '50' }]}>
            <Text style={{ fontSize:10, fontWeight:'700', color: colors.teal }}>{msg}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── New Quest Modal ─────────────────────────────────────────────────────────

function NewQuestModal({ visible, members, colors, onClose, onSave }: {
  visible:boolean; members:FamilyMember[]; colors:any; onClose:()=>void; onSave:(d:any)=>void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [reward, setReward] = useState('25');
  const [cat, setCat] = useState<QuestCategory>('Kitchen');
  const [assignTo, setAssignTo] = useState<string|null>(null);
  const [emoji, setEmoji] = useState(CAT_EMOJI['Kitchen']);
  const kids = members.filter(m => m.role === 'kid');

  const submit = () => {
    if (!title.trim()) return;
    onSave({ title:title.trim(), description:desc.trim()||undefined,
      coinReward:parseInt(reward)||25, category:cat, emoji,
      assignedToId:assignTo||undefined, status:'todo' as QuestStatus,
      createdAt: new Date().toISOString() });
    onClose(); setTitle(''); setDesc(''); setReward('25');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
        <View style={s.overlay}>
          <Pressable style={{flex:1}} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />
            <View style={[s.row, { justifyContent:'space-between', marginBottom:12 }]}>
              <Text style={{ fontSize:15, fontWeight:'800', color: colors.textPrimary }}>
                Create New Quest
              </Text>
              <Pressable onPress={onClose}>
                <Ionicons name="close" size={20} color={colors.textTertiary} />
              </Pressable>
            </View>

            <Text style={[s.label, { color: colors.textSecondary }]}>QUEST TITLE</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Clean the Kitchen"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                backgroundColor: colors.surface }]} />

            <View style={{ flexDirection:'row', gap:10, marginBottom:0 }}>
              <View style={{flex:1}}>
                <Text style={[s.label, { color: colors.textSecondary }]}>COIN REWARD</Text>
                <TextInput value={reward} onChangeText={setReward} keyboardType="number-pad"
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                    backgroundColor: colors.surface, marginBottom:0 }]} />
              </View>
            </View>

            <Text style={[s.label, { color: colors.textSecondary, marginTop:10 }]}>DESCRIPTION (optional)</Text>
            <TextInput value={desc} onChangeText={setDesc} placeholder="Brief description…"
              placeholderTextColor={colors.textTertiary} multiline
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                backgroundColor: colors.surface, minHeight:60 }]} />

            <Text style={[s.label, { color: colors.textSecondary }]}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
              <View style={{flexDirection:'row', gap:6}}>
                {CATEGORIES.map(c => (
                  <Pressable key={c} onPress={() => { setCat(c); setEmoji(CAT_EMOJI[c]); }}
                    style={[s.catChip, { backgroundColor: cat===c ? colors.primary+'25' : colors.surface,
                      borderColor: cat===c ? colors.primary : colors.border }]}>
                    <Text style={{fontSize:10, fontWeight:'700', color: cat===c ? colors.primary : colors.textTertiary}}>
                      {CAT_EMOJI[c]} {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {kids.length > 0 && (
              <>
                <Text style={[s.label, { color: colors.textSecondary }]}>ASSIGN TO (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:14}}>
                  <View style={{flexDirection:'row', gap:6}}>
                    <Pressable onPress={() => setAssignTo(null)}
                      style={[s.catChip, { backgroundColor: !assignTo ? colors.primary+'25' : colors.surface,
                        borderColor: !assignTo ? colors.primary : colors.border }]}>
                      <Text style={{fontSize:10, fontWeight:'700', color: !assignTo ? colors.primary : colors.textTertiary}}>
                        🎯 Bounty Pool
                      </Text>
                    </Pressable>
                    {kids.map(k => (
                      <Pressable key={k.id} onPress={() => setAssignTo(k.id)}
                        style={[s.catChip, { backgroundColor: assignTo===k.id ? colors.primary+'25' : colors.surface,
                          borderColor: assignTo===k.id ? colors.primary : colors.border }]}>
                        <Text style={{fontSize:10, fontWeight:'700',
                          color: assignTo===k.id ? colors.primary : colors.textTertiary}}>
                          {k.emoji} {k.name.split(' ')[0]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            <Pressable onPress={submit}
              style={[s.submitBtn, { backgroundColor: title.trim() ? colors.teal : colors.border }]}>
              <Text style={{ color:'#fff', fontSize:14, fontWeight:'800' }}>
                Publish Quest to Family Board
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── QuestsScreen ─────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'mine' | 'kid_0' | 'kid_1' | 'kid_2' | 'pool' | 'cheer';
type StatusTab = 'all' | 'todo' | 'review' | 'done';

export default function QuestsScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { quests, loadFromStorage:loadQuests, addQuest, approveQuest, declineQuest, claimQuest } = useQuestStore();

  const [filter, setFilter] = useState<FilterKey>('all');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [showCreate, setShowCreate] = useState(false);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';
  const kids = members.filter(m => m.role === 'kid');
  const bg = isDark ? '#0B0F1A' : colors.background;

  const filterChips: { key: FilterKey; label: string }[] = [
    { key:'all', label:'All Family' },
    { key:'mine', label:'My Quests' },
    ...kids.slice(0, 3).map((k, i) => ({
      key: `kid_${i}` as FilterKey, label: `${k.emoji} ${k.name.split(' ')[0]}`,
    })),
    { key:'pool', label:'🎯 Bounty Pool' },
    { key:'cheer', label:'⭐ Sibling Cheer' },
  ];

  const statusTabs: { key: StatusTab; label: string }[] = [
    { key:'all', label:'All' },
    { key:'todo', label:'To Do' },
    { key:'review', label:'In Review' },
    { key:'done', label:'Paid' },
  ];

  const STATUS_MAP: Record<StatusTab, QuestStatus[]> = {
    all:    ['todo','claimed','pending_approval','approved','done','declined'],
    todo:   ['todo','claimed'],
    review: ['pending_approval'],
    done:   ['done','approved'],
  };

  const filtered = quests.filter(q => {
    if (filter === 'mine')   return q.assignedToId === activeMemberId;
    if (filter === 'pool')   return q.status === 'todo' && !q.assignedToId;
    if (filter === 'cheer')  return false;
    if (filter.startsWith('kid_')) {
      const idx = parseInt(filter.split('_')[1]);
      return q.assignedToId === kids[idx]?.id;
    }
    return true;
  }).filter(q => STATUS_MAP[statusTab].includes(q.status as QuestStatus));

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: bg }} edges={['top']}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={{ fontSize:16, fontWeight:'800', color: colors.textPrimary }}>Family Quest Board</Text>
        {isParent && (
          <Pressable onPress={() => setShowCreate(true)}
            style={[s.createBtn, { backgroundColor: colors.teal }]}>
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ fontSize:12, fontWeight:'700', color:'#fff', marginLeft:4 }}>New Quest</Text>
          </Pressable>
        )}
      </View>

      {/* ── Filter Chips ── */}
      <View style={[s.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal:12, gap:6, paddingVertical:8 }}>
          {filterChips.map(fc => (
            <Pressable key={fc.key} onPress={() => setFilter(fc.key)}
              style={[s.chip, {
                backgroundColor: filter===fc.key ? colors.primary : colors.surface,
                borderColor: filter===fc.key ? colors.primary : colors.border,
              }]}>
              <Text style={{ fontSize:11, fontWeight:filter===fc.key?'800':'600',
                color: filter===fc.key ? '#fff' : colors.textSecondary }}>
                {fc.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {filter === 'cheer' ? (
        <ScrollView contentContainerStyle={{ padding:12 }}>
          <CheerCard colors={colors} />
        </ScrollView>
      ) : (
        <>
          {/* ── Status Tabs ── */}
          <View style={[s.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            {statusTabs.map(t => (
              <Pressable key={t.key} onPress={() => setStatusTab(t.key)}
                style={[s.tab, { borderBottomColor: statusTab===t.key ? colors.primary : 'transparent',
                  borderBottomWidth: 2, paddingVertical:10, flex:1, alignItems:'center' }]}>
                <Text style={{ fontSize:12, fontWeight:statusTab===t.key?'800':'500',
                  color: statusTab===t.key ? colors.primary : colors.textTertiary }}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Quest List ── */}
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding:12, gap:10, paddingBottom:40 }}>
            {filtered.length === 0 ? (
              <View style={[s.emptyBox, { borderColor: colors.border }]}>
                <Text style={{ fontSize:32, marginBottom:8 }}>🗺️</Text>
                <Text style={{ fontSize:14, fontWeight:'700', color: colors.textTertiary }}>
                  No quests here yet
                </Text>
                {isParent && (
                  <Text style={{ fontSize:12, color: colors.textTertiary, marginTop:4, textAlign:'center' }}>
                    Tap "New Quest" to add one for the family
                  </Text>
                )}
              </View>
            ) : filtered.map(q => (
              <QuestCard key={q.id} quest={q} members={members} activeMemberId={activeMemberId}
                isParent={isParent} colors={colors}
                onApprove={id => approveQuest(id, activeMemberId ?? '')}
                onDecline={id => declineQuest(id, activeMemberId ?? '')}
                onClaim={id => claimQuest(id, activeMemberId ?? '')}
                onSubmit={id => Alert.alert('Submitted', 'Quest sent for parent review!')}
              />
            ))}
          </ScrollView>
        </>
      )}

      <NewQuestModal visible={showCreate} members={members} colors={colors}
        onClose={() => setShowCreate(false)}
        onSave={data => addQuest(data)} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header:    { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
               paddingHorizontal:16, paddingVertical:12,
               borderBottomWidth: StyleSheet.hairlineWidth },
  createBtn: { flexDirection:'row', alignItems:'center', borderRadius:12, paddingVertical:7, paddingHorizontal:12 },
  filterBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabBar:    { flexDirection:'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:       {},
  row:       { flexDirection:'row', alignItems:'center' },
  card:      { borderRadius:20, borderWidth:1, padding:14 },
  catBadge:  { flexDirection:'row', alignItems:'center', borderRadius:99, borderWidth:1,
               paddingHorizontal:8, paddingVertical:3 },
  statusPill:{ borderRadius:99, borderWidth:1, paddingHorizontal:8, paddingVertical:3 },
  actionBtn: { borderRadius:12, paddingVertical:8, alignItems:'center', justifyContent:'center',
               marginTop:6 },
  cheerBtn:  { flex:1, borderRadius:12, borderWidth:1, paddingVertical:8, alignItems:'center' },
  chip:      { borderRadius:20, borderWidth:1, paddingHorizontal:12, paddingVertical:6 },
  catChip:   { borderRadius:20, borderWidth:1, paddingHorizontal:10, paddingVertical:6 },
  emptyBox:  { borderRadius:20, borderWidth:1, padding:40, alignItems:'center' },
  overlay:   { flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.8)' },
  sheet:     { borderTopLeftRadius:28, borderTopRightRadius:28, borderTopWidth:1, padding:20, paddingBottom:40 },
  handle:    { width:40, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  label:     { fontSize:10, fontWeight:'700', letterSpacing:0.5, marginBottom:6, marginTop:10 },
  input:     { borderWidth:1.5, borderRadius:12, padding:10, fontSize:13, marginBottom:10 },
  submitBtn: { borderRadius:14, paddingVertical:13, alignItems:'center', marginTop:4 },
});
