import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Animated, Image, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useNotifStore } from '@/store/notifStore';
import { useGroceryStore } from '@/store/groceryStore';
import { TYPO, RADIUS, SHADOW } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';

// ─── Help request types ───────────────────────────────────────────────────────

type HelpCategory = 'Tutor / Help' | 'Permission' | 'Errand' | 'Ride' | 'Other';
type HelpStatus   = 'pending' | 'assigned' | 'done';

interface HelpRequest {
  id: string;
  from: string;          // member id
  category: HelpCategory;
  message: string;
  status: HelpStatus;
  assignedTo?: string;   // member id
  createdAt: string;
}

const CAT_COLOR: Record<HelpCategory, string> = {
  'Tutor / Help': '#F59E0B',
  'Permission':   '#8B5CF6',
  'Errand':       '#3B82F6',
  'Ride':         '#10B981',
  'Other':        '#6B7280',
};

// ─── Member switcher pill ─────────────────────────────────────────────────────

function MemberPill({ member, onPress, colors }: {
  member: FamilyMember; onPress: () => void; colors: any;
}) {
  const isParent = member.role === 'parent';
  const accent   = isParent ? colors.teal : colors.amber;
  const bg       = isParent ? colors.tealLight : colors.amberLight;
  return (
    <Pressable onPress={onPress}
      style={[styles.memberPill, { backgroundColor: colors.card, borderColor: colors.border, ...SHADOW.sm }]}>
      <View style={[styles.memberAvatar, { backgroundColor: bg }]}>
        {member.avatarUrl
          ? <Image source={{ uri: member.avatarUrl }} style={{ width: 28, height: 28, borderRadius: 14 }} />
          : <Text style={{ fontSize: 16 }}>{member.emoji ?? member.name[0]}</Text>}
      </View>
      <View>
        <Text style={[styles.memberName, { color: colors.textPrimary }]}>{member.name.split(' ')[0]}</Text>
        <Text style={[styles.memberRole, { color: accent }]}>
          {isParent ? 'PARENT MODE' : 'KID MODE'}
        </Text>
      </View>
      <Ionicons name="chevron-down" size={14} color={colors.textTertiary} style={{ marginLeft: 2 }} />
    </Pressable>
  );
}

// ─── Help request card ────────────────────────────────────────────────────────

function HelpCard({ req, members, activeMember, onAssign, onDecline, onSelfAssign, colors, isDark }: {
  req: HelpRequest;
  members: FamilyMember[];
  activeMember: FamilyMember | undefined;
  onAssign: (reqId: string, memberId: string) => void;
  onDecline: (reqId: string) => void;
  onSelfAssign: (reqId: string) => void;
  colors: any;
  isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(req.status === 'pending');
  const [assignTo, setAssignTo] = useState<string>('');
  const fromMember = members.find(m => m.id === req.from);

  const catColor = CAT_COLOR[req.category] ?? colors.amber;
  const cardBg   = isDark ? 'rgba(245,158,11,0.08)' : '#FFFBEB';
  const cardBdr  = isDark ? 'rgba(245,158,11,0.25)' : '#FDE68A';

  return (
    <View style={[styles.helpCard, { backgroundColor: cardBg, borderColor: cardBdr }]}>
      {/* Collapsed header */}
      <Pressable onPress={() => setExpanded(e => !e)} style={styles.helpCardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={{ fontSize: 16 }}>🐱</Text>
          <Text style={[styles.helpLabel, { color: colors.textPrimary }]}>Someone needs help:</Text>
          <View style={[styles.catBadge, { backgroundColor: catColor + '22', borderColor: catColor + '55' }]}>
            <Text style={[styles.catBadgeText, { color: catColor }]}>{req.category}</Text>
          </View>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
      </Pressable>

      <Text style={[styles.helpMessage, { color: colors.textPrimary }]}>"{req.message}"</Text>

      {expanded && req.status === 'pending' && (
        <View style={{ marginTop: 10, gap: 8 }}>
          {/* Assign row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="shield-outline" size={14} color={colors.amber} />
            <Text style={[styles.assignLabel, { color: colors.amber }]}>Assign Tutor / Helper or Decline:</Text>
            <Pressable onPress={() => onDecline(req.id)} style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 14 }}>❌</Text>
              <Text style={[styles.declineText, { color: colors.danger }]}>Decline Request</Text>
            </Pressable>
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pressable
              onPress={() => activeMember && onSelfAssign(req.id)}
              style={[styles.selfAssignBtn, { backgroundColor: colors.teal }]}
            >
              <Text style={{ fontSize: 13 }}>⚡</Text>
              <Text style={[styles.selfAssignText]}>Self-Assign ({activeMember?.name.split(' ')[0] ?? 'Me'})</Text>
            </Pressable>

            {/* Member picker (simple cycling) */}
            <Pressable
              onPress={() => {
                const parents = members.filter(m => m.role === 'parent' && m.id !== activeMember?.id);
                const cur = parents.findIndex(m => m.id === assignTo);
                setAssignTo(parents[(cur + 1) % Math.max(parents.length, 1)]?.id ?? '');
              }}
              style={[styles.assignDropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                {assignTo ? members.find(m => m.id === assignTo)?.name.split(' ')[0]?.slice(0, 3) + '…' : 'A…'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={colors.textTertiary} />
            </Pressable>

            <Pressable
              onPress={() => assignTo && onAssign(req.id, assignTo)}
              style={[styles.assignBtn, { backgroundColor: assignTo ? colors.primary : colors.border }]}
            >
              <Text style={[styles.assignBtnText, { color: assignTo ? '#fff' : colors.textTertiary }]}>Assign</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Hub screen ───────────────────────────────────────────────────────────────

export default function HubScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage, setActiveMember } = useFamilyStore();
  const unreadCount = useNotifStore(s => s.unreadCount);
  const { items: groceryItems, load: loadGrocery } = useGroceryStore();

  const [helpTab, setHelpTab]   = useState<HelpStatus>('pending');
  const [showAskHelp, setShowAskHelp] = useState(false);

  // Stub help requests — replace with Supabase query
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([
    { id: '1', from: members[0]?.id ?? 'kid1', category: 'Tutor / Help', message: 'Need help with Math homework — fractions section', status: 'pending', createdAt: new Date().toISOString() },
    { id: '2', from: members[0]?.id ?? 'kid1', category: 'Permission', message: 'Can I join the after-school coding club on Thurs...', status: 'pending', createdAt: new Date().toISOString() },
    { id: '3', from: members[0]?.id ?? 'kid1', category: 'Ride', message: 'Can someone pick me up from practice at 5pm?', status: 'assigned', assignedTo: activeMemberId ?? '', createdAt: new Date().toISOString() },
  ]);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadGrocery('family-1'); }, []);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent     = activeMember?.role === 'parent';

  const pendingHelp  = helpRequests.filter(r => r.status === 'pending');
  const assignedHelp = helpRequests.filter(r => r.status === 'assigned');
  const doneHelp     = helpRequests.filter(r => r.status === 'done');

  const tabRequests = helpTab === 'pending' ? pendingHelp
    : helpTab === 'assigned' ? assignedHelp : doneHelp;

  const handleAssign = (reqId: string, memberId: string) => {
    setHelpRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'assigned', assignedTo: memberId } : r));
  };
  const handleDecline = (reqId: string) => {
    setHelpRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'done' } : r));
  };
  const handleSelfAssign = (reqId: string) => {
    if (activeMemberId) handleAssign(reqId, activeMemberId);
  };

  // Kids wallet (coins summary)
  const kids = members.filter(m => m.role === 'kid');

  const bg   = isDark ? '#0B0F1A' : '#F3F4F8';
  const P    = colors.primary;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
        {/* Logo */}
        <Pressable onPress={() => {}} style={styles.logoRow}>
          <View style={styles.logoHex}>
            <Text style={{ fontSize: 22 }}>🏠</Text>
          </View>
          <Text style={[styles.logoText, { color: colors.navy }]}>
            {'Family '}
            <Text style={{ color: colors.teal }}>Cube</Text>
          </Text>
        </Pressable>

        {/* Right: member pill + bell */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {activeMember && (
            <MemberPill
              member={activeMember}
              colors={colors}
              onPress={() => {
                // Cycle through members
                const idx  = members.findIndex(m => m.id === activeMemberId);
                const next = members[(idx + 1) % members.length];
                if (next) setActiveMember(next.id);
              }}
            />
          )}
          <Pressable onPress={() => router.push('/(tabs)/all-notifications' as any)}
            style={[styles.bellBtn, { backgroundColor: isDark ? colors.surface : '#F8F8FF' }]}>
            <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
            {unreadCount > 0 && (
              <View style={[styles.bellBadge, { backgroundColor: colors.danger }]}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, gap: 0 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Quick action buttons ────────────────────────────────── */}
        <View style={[styles.quickRow, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
          <Pressable style={[styles.quickBtn, { backgroundColor: colors.primary }]}
            onPress={() => Alert.alert('Scan Flyer', 'Coming soon')}>
            <Ionicons name="clipboard-outline" size={22} color="#fff" />
            <Text style={styles.quickLabel}>Scan Flyer</Text>
          </Pressable>

          <Pressable style={[styles.quickBtn, { backgroundColor: colors.teal }]}
            onPress={() => router.push('/(tabs)/quests')}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.quickLabel}>+ Quest</Text>
          </Pressable>

          <Pressable style={[styles.quickBtn, { backgroundColor: colors.amber }]}
            onPress={() => router.push('/(tabs)/calendar')}>
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="calendar" size={20} color="#fff" />
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: '800', marginTop: -2 }}>
                {new Date().getDate()}
              </Text>
            </View>
            <Text style={styles.quickLabel}>+ Event</Text>
          </Pressable>
        </View>

        {/* ── Help Queue ──────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: isDark ? colors.card : '#fff' }]}>
          {/* Help queue header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <View style={[styles.helpIcon, { backgroundColor: colors.amberLight }]}>
              <Text style={{ fontSize: 16 }}>❓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Family Support & Help Queue
              </Text>
              <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                Kids ask for assistance & parents approve/self-assign
              </Text>
            </View>
            <Pressable
              onPress={() => setShowAskHelp(true)}
              style={[styles.askBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.askBtnText}>Ask for Help</Text>
            </Pressable>
          </View>

          {/* Status tab bar */}
          <View style={[styles.helpTabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['pending', 'assigned', 'done'] as HelpStatus[]).map(t => {
              const count = t === 'pending' ? pendingHelp.length : t === 'assigned' ? assignedHelp.length : doneHelp.length;
              const active = helpTab === t;
              return (
                <Pressable key={t} onPress={() => setHelpTab(t)}
                  style={[styles.helpTabBtn, active && { backgroundColor: colors.card, borderRadius: 8 }]}>
                  <Text style={[styles.helpTabText, { color: active ? colors.textPrimary : colors.textTertiary,
                    fontWeight: active ? '700' : '500' }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                    {count > 0 && (
                      <Text style={{ color: active ? colors.primary : colors.textTertiary }}> {count}</Text>
                    )}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Request cards */}
          <View style={{ gap: 8, marginTop: 10 }}>
            {tabRequests.length === 0 ? (
              <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
                {helpTab === 'pending' ? 'No pending requests 🎉' : helpTab === 'assigned' ? 'Nothing assigned yet' : 'No completed requests'}
              </Text>
            ) : tabRequests.map(req => (
              <HelpCard
                key={req.id}
                req={req}
                members={members}
                activeMember={activeMember}
                onAssign={handleAssign}
                onDecline={handleDecline}
                onSelfAssign={handleSelfAssign}
                colors={colors}
                isDark={isDark}
              />
            ))}
          </View>
        </View>

        {/* ── Family Wallet Summary ───────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: isDark ? colors.card : '#fff', marginTop: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>💰 Family Wallet Summary</Text>
            <Pressable onPress={() => router.push('/(tabs)/store' as any)}>
              <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '700' }}>Full Ledger →</Text>
            </Pressable>
          </View>

          {kids.length === 0 ? (
            <Text style={{ color: colors.textTertiary, fontSize: 13 }}>No kids added yet.</Text>
          ) : kids.map((kid, i) => (
            <View key={kid.id} style={[styles.walletRow,
              i < kids.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Text style={{ fontSize: 20, marginRight: 10 }}>{kid.emoji ?? kid.name[0]}</Text>
              <Text style={[styles.walletName, { color: colors.textPrimary }]}>{kid.name.split(' ')[0]}</Text>
              <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 14 }}>
                <Text style={[styles.walletStat, { color: colors.amber }]}>
                  Store: {kid.coins ?? 0}
                  <Text style={{ fontSize: 11 }}>🌙</Text>
                </Text>
                <Text style={[styles.walletStat, { color: colors.amber }]}>
                  GP: 0<Text style={{ fontSize: 11 }}>⭐</Text>
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Grocery quick tile ──────────────────────────────────── */}
        {isParent && (
          <Pressable
            onPress={() => router.push('/(tabs)/grocery' as any)}
            style={[styles.section, { backgroundColor: isDark ? colors.card : '#fff', marginTop: 12,
              flexDirection: 'row', alignItems: 'center', gap: 14 }]}
          >
            <View style={[styles.groceryIcon, { backgroundColor: colors.tealLight }]}>
              <Text style={{ fontSize: 22 }}>🛒</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Grocery List</Text>
              <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                {groceryItems.filter(i => !i.isBought).length} items to buy
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>
        )}

      </ScrollView>

      {/* ── Ask for Help modal ──────────────────────────────────────── */}
      <AskHelpModal
        visible={showAskHelp}
        onClose={() => setShowAskHelp(false)}
        memberId={activeMemberId ?? ''}
        onSubmit={(category, message) => {
          const req: HelpRequest = {
            id: Date.now().toString(),
            from: activeMemberId ?? '',
            category,
            message,
            status: 'pending',
            createdAt: new Date().toISOString(),
          };
          setHelpRequests(prev => [req, ...prev]);
          setHelpTab('pending');
          setShowAskHelp(false);
        }}
        colors={colors}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

// ─── Ask for help modal ───────────────────────────────────────────────────────

function AskHelpModal({ visible, onClose, memberId, onSubmit, colors, isDark }: {
  visible: boolean; onClose: () => void; memberId: string;
  onSubmit: (category: HelpCategory, message: string) => void;
  colors: any; isDark: boolean;
}) {
  const [category, setCategory] = useState<HelpCategory>('Tutor / Help');
  const [message, setMessage]   = useState('');
  const categories: HelpCategory[] = ['Tutor / Help', 'Permission', 'Errand', 'Ride', 'Other'];

  const handle = () => {
    if (!message.trim()) return;
    onSubmit(category, message.trim());
    setMessage('');
    setCategory('Tutor / Help');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.modalSheet, { backgroundColor: isDark ? colors.card : '#fff', borderColor: colors.border }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Ask for Help</Text>

          <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {categories.map(c => {
                const active = c === category;
                const col = CAT_COLOR[c];
                return (
                  <Pressable key={c} onPress={() => setCategory(c)}
                    style={[styles.catChip, {
                      backgroundColor: active ? col + '22' : colors.surface,
                      borderColor: active ? col : colors.border,
                    }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? col : colors.textSecondary }}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>What do you need?</Text>
          <TextInput
            value={message} onChangeText={setMessage}
            placeholder="Describe your request…"
            placeholderTextColor={colors.placeholder}
            multiline style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          <Pressable
            onPress={handle}
            disabled={!message.trim()}
            style={[styles.modalBtn, { backgroundColor: message.trim() ? colors.primary : colors.border }]}
          >
            <Text style={[styles.modalBtnText, { color: message.trim() ? '#fff' : colors.textTertiary }]}>Submit Request</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:         { flex: 1 },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  logoRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoHex:      { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEE9FA',
                  alignItems: 'center', justifyContent: 'center' },
  logoText:     { fontSize: 20, fontWeight: '800' },

  memberPill:   { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: RADIUS.full,
                  borderWidth: 1, paddingVertical: 5, paddingHorizontal: 10 },
  memberAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  memberName:   { fontSize: 13, fontWeight: '700', lineHeight: 15 },
  memberRole:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  bellBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  bellBadge:    { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4 },
  bellBadgeText:{ color: '#fff', fontSize: 7, fontWeight: '800' },

  // Quick actions
  quickRow:     { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 14,
                  borderBottomWidth: StyleSheet.hairlineWidth },
  quickBtn:     { flex: 1, borderRadius: RADIUS.xl, paddingVertical: 14,
                  alignItems: 'center', justifyContent: 'center', gap: 6 },
  quickLabel:   { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Section cards
  section:      { marginHorizontal: 0, padding: 16 },
  sectionTitle: { fontSize: TYPO.caption, fontWeight: '800', marginBottom: 2 },
  sectionSub:   { fontSize: 12, lineHeight: 16 },

  // Help queue
  helpIcon:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  askBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.full,
                  paddingVertical: 7, paddingHorizontal: 12 },
  askBtnText:   { color: '#fff', fontSize: 12, fontWeight: '700' },

  helpTabs:     { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 3 },
  helpTabBtn:   { flex: 1, paddingVertical: 6, alignItems: 'center' },
  helpTabText:  { fontSize: 13 },

  helpCard:     { borderRadius: RADIUS.md, borderWidth: 1, padding: 12, gap: 4 },
  helpCardHeader: { flexDirection: 'row', alignItems: 'center' },
  helpLabel:    { fontSize: 13, fontWeight: '700' },
  catBadge:     { borderRadius: RADIUS.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  catBadgeText: { fontSize: 11, fontWeight: '700' },
  helpMessage:  { fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 4 },
  assignLabel:  { fontSize: 12, fontWeight: '600' },
  declineText:  { fontSize: 12, fontWeight: '700' },

  selfAssignBtn:{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: RADIUS.full,
                  paddingVertical: 7, paddingHorizontal: 12 },
  selfAssignText:{ color: '#fff', fontSize: 12, fontWeight: '700' },
  assignDropdown:{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5,
                   borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 7 },
  assignBtn:    { borderRadius: RADIUS.full, paddingVertical: 7, paddingHorizontal: 14 },
  assignBtnText:{ fontSize: 13, fontWeight: '700' },

  // Wallet
  walletRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  walletName:   { fontSize: TYPO.caption, fontWeight: '700' },
  walletStat:   { fontSize: TYPO.caption, fontWeight: '700' },

  // Grocery tile
  groceryIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  // Modal
  modalSheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 40 },
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle:   { fontSize: TYPO.subheading, fontWeight: '800', marginBottom: 16 },
  modalLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  catChip:      { borderRadius: RADIUS.full, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6 },
  modalInput:   { borderWidth: 1.5, borderRadius: RADIUS.md, padding: 12, fontSize: 15, minHeight: 80,
                  textAlignVertical: 'top', marginBottom: 16 },
  modalBtn:     { borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center' },
  modalBtnText: { fontSize: TYPO.body, fontWeight: '700' },
});
