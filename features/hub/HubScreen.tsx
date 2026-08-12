import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Alert, TextInput, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useNotifStore } from '@/store/notifStore';
import { useGroceryStore } from '@/store/groceryStore';
import type { FamilyMember } from '@/store/familyStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type HelpCategory = 'Tutor / Help' | 'Permission' | 'Errand' | 'Ride' | 'Other';
type HelpStatus   = 'pending' | 'assigned' | 'done';

interface HelpRequest {
  id: string;
  from: string;
  category: HelpCategory;
  message: string;
  status: HelpStatus;
  assignedTo?: string;
  coins?: number;
  createdAt: string;
}

interface KidWallet {
  id: string;
  name: string;
  emoji: string;
  mainCoins: number;
  gpCoins: number;
}

const CAT_COLOR: Record<HelpCategory, string> = {
  'Tutor / Help': '#F59E0B',
  'Permission':   '#8B5CF6',
  'Errand':       '#3B82F6',
  'Ride':         '#10B981',
  'Other':        '#6B7280',
};

const CAT_ICON: Record<HelpCategory, string> = {
  'Tutor / Help': '📚',
  'Permission':   '✅',
  'Errand':       '🛍️',
  'Ride':         '🚗',
  'Other':        '❓',
};

// ─── MemberPill ───────────────────────────────────────────────────────────────

function MemberPill({ member, onPress, colors, isDark }: {
  member: FamilyMember; onPress: () => void; colors: any; isDark: boolean;
}) {
  const roleColor = member.role === 'parent' ? colors.teal
    : member.role === 'senior' ? colors.primary
    : colors.amber;

  return (
    <Pressable
      onPress={onPress}
      style={[s.memberPill, {
        backgroundColor: isDark ? colors.surface : '#F8F5FF',
        borderColor: roleColor + '40',
      }]}
    >
      <View style={[s.memberAvatar, { backgroundColor: roleColor + '20' }]}>
        <Text style={{ fontSize: 15 }}>{member.emoji ?? member.name[0]}</Text>
      </View>
      <View>
        <Text style={[s.memberName, { color: colors.textPrimary }]}>
          {member.name.split(' ')[0]}
        </Text>
        <Text style={[s.memberRole, { color: roleColor }]}>
          {member.role === 'parent' ? 'PARENT' : member.role === 'senior' ? 'SENIOR' : 'KID'}
        </Text>
      </View>
      <Ionicons name="chevron-down" size={13} color={colors.textTertiary} />
    </Pressable>
  );
}

// ─── HelpCard ─────────────────────────────────────────────────────────────────

function HelpCard({ req, members, activeMember, onAssign, onDecline, onSelfAssign, colors, isDark }: {
  req: HelpRequest;
  members: FamilyMember[];
  activeMember?: FamilyMember;
  onAssign: (reqId: string, memberId: string) => void;
  onDecline: (reqId: string) => void;
  onSelfAssign: (reqId: string) => void;
  colors: any;
  isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(req.status === 'pending');
  const [assignTo, setAssignTo] = useState('');
  const catColor = CAT_COLOR[req.category] ?? '#6B7280';
  const cardBg = isDark ? catColor + '12' : catColor + '08';
  const borderCol = isDark ? catColor + '40' : catColor + '30';
  const parents = members.filter(m => m.role === 'parent' && m.id !== activeMember?.id);

  return (
    <View style={[s.card, { backgroundColor: cardBg, borderColor: borderCol }]}>
      <Pressable onPress={() => setExpanded(e => !e)} style={s.cardHeader}>
        <View style={[s.catBadge, { backgroundColor: catColor + '22', borderColor: catColor + '55' }]}>
          <Text style={{ fontSize: 12 }}>{CAT_ICON[req.category]}</Text>
          <Text style={[s.catText, { color: catColor }]}>{req.category}</Text>
        </View>
        {req.coins != null && (
          <Text style={[s.coinTag, { color: colors.amber }]}>+{req.coins} 🪙</Text>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textTertiary}
          style={{ marginLeft: 'auto' }}
        />
      </Pressable>

      <Text style={[s.cardMsg, { color: colors.textPrimary }]} numberOfLines={2}>
        "{req.message}"
      </Text>

      {expanded && req.status === 'pending' && (
        <View style={{ marginTop: 10, gap: 8 }}>
          <View style={s.row}>
            <Pressable
              onPress={() => onSelfAssign(req.id)}
              style={[s.pill, { backgroundColor: colors.teal }]}
            >
              <Text style={s.pillText}>⚡ Me ({activeMember?.name.split(' ')[0]})</Text>
            </Pressable>

            {parents.length > 0 && (
              <Pressable
                onPress={() => {
                  const cur = parents.findIndex(m => m.id === assignTo);
                  setAssignTo(parents[(cur + 1) % parents.length]?.id ?? '');
                }}
                style={[s.pill, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              >
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  {assignTo ? (members.find(m => m.id === assignTo)?.name.split(' ')[0] ?? '?') : 'Pick…'}
                </Text>
                <Ionicons name="chevron-down" size={11} color={colors.textTertiary} />
              </Pressable>
            )}

            {assignTo ? (
              <Pressable
                onPress={() => onAssign(req.id, assignTo)}
                style={[s.pill, { backgroundColor: colors.primary }]}
              >
                <Text style={s.pillText}>Assign</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => onDecline(req.id)}
              style={[s.pill, { backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440' }]}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>✕ Decline</Text>
            </Pressable>
          </View>
        </View>
      )}

      {req.status === 'assigned' && (
        <View style={[s.pill, { backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '40', alignSelf: 'flex-start', marginTop: 8 }]}>
          <Text style={{ fontSize: 12, color: colors.teal, fontWeight: '700' }}>
            ✓ Assigned — {members.find(m => m.id === req.assignedTo)?.name.split(' ')[0] ?? 'Someone'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── SectionCard wrapper ──────────────────────────────────────────────────────

function SectionCard({ children, colors, isDark, style }: {
  children: React.ReactNode; colors: any; isDark: boolean; style?: any;
}) {
  return (
    <View style={[s.sectionCard, {
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderColor: isDark ? colors.border : '#EDEAF8',
      ...style,
    }]}>
      {children}
    </View>
  );
}

// ─── StatTile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, color, bg, onPress }: {
  label: string; value: string | number; color: string; bg: string; onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.statTile, { backgroundColor: bg, borderColor: color + '40' }]}
    >
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={[s.statLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ─── QuickActionGrid (Kid) ────────────────────────────────────────────────────

function QuickActionGrid({ onAction, colors, isDark }: {
  onAction: (action: string) => void; colors: any; isDark: boolean;
}) {
  const actions = [
    { id: 'chat',  icon: '💬', label: 'Parent Chat' },
    { id: 'ride',  icon: '🚗', label: 'Ask Ride' },
    { id: 'tutor', icon: '🎒', label: 'Ask Tutor' },
    { id: 'cheer', icon: '✋', label: 'Cheer' },
  ];
  return (
    <View style={s.quickGrid}>
      {actions.map(a => (
        <Pressable
          key={a.id}
          onPress={() => onAction(a.id)}
          style={[s.quickGridItem, {
            backgroundColor: isDark ? colors.surface : '#F8F5FF',
            borderColor: colors.primary + '20',
          }]}
        >
          <Text style={{ fontSize: 22 }}>{a.icon}</Text>
          <Text style={[s.quickGridLabel, { color: colors.textPrimary }]}>{a.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── ParentHubView ────────────────────────────────────────────────────────────

function ParentHubView({ members, pendingHelp, assignedHelp, doneHelp, helpTab, setHelpTab,
  setShowAskHelp, activeMember, onAssign, onDecline, onSelfAssign, kids, groceryPending,
  colors, isDark }: {
  members: FamilyMember[];
  pendingHelp: HelpRequest[];
  assignedHelp: HelpRequest[];
  doneHelp: HelpRequest[];
  helpTab: HelpStatus;
  setHelpTab: (t: HelpStatus) => void;
  setShowAskHelp: (v: boolean) => void;
  activeMember?: FamilyMember;
  onAssign: (id: string, memberId: string) => void;
  onDecline: (id: string) => void;
  onSelfAssign: (id: string) => void;
  kids: KidWallet[];
  groceryPending: number;
  colors: any;
  isDark: boolean;
}) {
  const tabList = helpTab === 'pending' ? pendingHelp
    : helpTab === 'assigned' ? assignedHelp : doneHelp;

  return (
    <>
      {/* Pending quest approvals banner */}
      {pendingHelp.length > 0 && (
        <SectionCard colors={colors} isDark={isDark} style={{
          backgroundColor: isDark ? colors.teal + '18' : '#EDFAF8',
          borderColor: colors.teal + '40',
        }}>
          <View style={s.rowBetween}>
            <Text style={[s.sectionTitle, { color: colors.teal }]}>
              ✅ Action Center
            </Text>
            <View style={[s.badge, { backgroundColor: colors.teal }]}>
              <Text style={s.badgeText}>{pendingHelp.length} awaiting</Text>
            </View>
          </View>
          <Text style={[s.sectionSub, { color: colors.textSecondary, marginTop: 4 }]}>
            Kids are waiting on your approvals
          </Text>
        </SectionCard>
      )}

      {/* Help Queue */}
      <SectionCard colors={colors} isDark={isDark}>
        <View style={[s.rowBetween, { marginBottom: 12 }]}>
          <View style={s.row}>
            <View style={[s.iconWrap, { backgroundColor: colors.amberLight ?? colors.amber + '20' }]}>
              <Text style={{ fontSize: 18 }}>🙋</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Family Help Queue</Text>
              <Text style={[s.sectionSub, { color: colors.textSecondary }]}>
                Kids ask — parents approve
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setShowAskHelp(true)}
            style={[s.pill, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={s.pillText}>Ask Help</Text>
          </Pressable>
        </View>

        {/* Tab bar */}
        <View style={[s.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(['pending', 'assigned', 'done'] as HelpStatus[]).map(t => {
            const cnt = t === 'pending' ? pendingHelp.length : t === 'assigned' ? assignedHelp.length : doneHelp.length;
            const active = helpTab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setHelpTab(t)}
                style={[s.tabBtn, active && { backgroundColor: colors.card, borderRadius: 8 }]}
              >
                <Text style={[s.tabBtnText, {
                  color: active ? colors.textPrimary : colors.textTertiary,
                  fontWeight: active ? '700' : '500',
                }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  {cnt > 0 ? ` ${cnt}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: 8, marginTop: 10 }}>
          {tabList.length === 0 ? (
            <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 14 }}>
              {helpTab === 'pending' ? '🎉 No pending requests' : helpTab === 'assigned' ? 'Nothing assigned yet' : 'No completed requests'}
            </Text>
          ) : tabList.map(req => (
            <HelpCard
              key={req.id}
              req={req}
              members={members}
              activeMember={activeMember}
              onAssign={onAssign}
              onDecline={onDecline}
              onSelfAssign={onSelfAssign}
              colors={colors}
              isDark={isDark}
            />
          ))}
        </View>
      </SectionCard>

      {/* Family Wallet Summary */}
      <SectionCard colors={colors} isDark={isDark}>
        <View style={[s.rowBetween, { marginBottom: 12 }]}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>💰 Family Wallet</Text>
          <Pressable onPress={() => router.push('/(tabs)/profile' as any)}>
            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '700' }}>Full Ledger →</Text>
          </Pressable>
        </View>

        {kids.length === 0 ? (
          <Text style={{ color: colors.textTertiary, fontSize: 13 }}>No kids added yet.</Text>
        ) : kids.map((kid, i) => (
          <View key={kid.id} style={[s.walletRow,
            i < kids.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
            <Text style={{ fontSize: 20, marginRight: 10 }}>{kid.emoji}</Text>
            <Text style={[s.walletName, { color: colors.textPrimary }]}>{kid.name.split(' ')[0]}</Text>
            <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12, color: colors.amber, fontWeight: '800' }}>
                Store: {kid.mainCoins} 🪙 (${(kid.mainCoins * 0.1).toFixed(2)})
              </Text>
              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>
                GP Bonus: {kid.gpCoins} 🪙 (${(kid.gpCoins * 0.1).toFixed(2)})
              </Text>
            </View>
          </View>
        ))}
      </SectionCard>

      {/* En Route Launcher */}
      <SectionCard colors={colors} isDark={isDark} style={{
        backgroundColor: isDark ? colors.teal + '18' : '#EDFAF8',
        borderColor: colors.teal + '40',
      }}>
        <View style={s.rowBetween}>
          <View style={s.row}>
            <View style={[s.iconWrap, { backgroundColor: colors.teal + '30' }]}>
              <Ionicons name="navigate" size={20} color={colors.teal} />
            </View>
            <View>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Start Pickup / Trip</Text>
              <Text style={[s.sectionSub, { color: colors.textSecondary }]}>
                Alert kids you are en route with ETA
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => Alert.alert('En Route', 'Coming soon — will notify kids with ETA')}
            style={[s.pill, { backgroundColor: colors.teal }]}
          >
            <Text style={s.pillText}>En Route</Text>
          </Pressable>
        </View>
      </SectionCard>

      {/* Grocery tile */}
      <Pressable
        onPress={() => router.push('/(tabs)/grocery' as any)}
        style={[s.sectionCard, s.row, {
          backgroundColor: isDark ? colors.card : '#FFFFFF',
          borderColor: isDark ? colors.border : '#EDEAF8',
          gap: 14,
        }]}
      >
        <View style={[s.iconWrap, { backgroundColor: colors.tealLight ?? colors.teal + '20' }]}>
          <Text style={{ fontSize: 22 }}>🛒</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Grocery List</Text>
          <Text style={[s.sectionSub, { color: colors.textSecondary }]}>
            {groceryPending} items to buy
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Pressable>
    </>
  );
}

// ─── KidHubView ───────────────────────────────────────────────────────────────

function KidHubView({ member, colors, isDark }: {
  member: FamilyMember; colors: any; isDark: boolean;
}) {
  const mainCoins = (member as any).coins ?? 0;
  const gpCoins   = 0; // extend FamilyMember store to track gpCoins

  const handleAction = (action: string) => {
    switch (action) {
      case 'chat':  router.push('/(tabs)/chat' as any); break;
      case 'ride':  Alert.alert('Ask Ride', 'Request a ride from parents'); break;
      case 'tutor': Alert.alert('Ask Tutor', 'Request tutoring help'); break;
      case 'cheer': router.push('/(tabs)/quests' as any); break;
    }
  };

  return (
    <>
      {/* Quick Actions */}
      <SectionCard colors={colors} isDark={isDark}>
        <View style={s.row}>
          <Text style={{ fontSize: 16 }}>⚡</Text>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
        </View>
        <QuickActionGrid onAction={handleAction} colors={colors} isDark={isDark} />
      </SectionCard>

      {/* Quest Status */}
      <View style={s.threeGrid}>
        <StatTile
          label="IN PROGRESS"
          value="—"
          color={colors.amber}
          bg={isDark ? colors.amber + '18' : '#FFFBEB'}
          onPress={() => router.push('/(tabs)/quests' as any)}
        />
        <StatTile
          label="PENDING REVIEW"
          value="—"
          color={colors.primary}
          bg={isDark ? colors.primary + '18' : '#F5F3FF'}
          onPress={() => router.push('/(tabs)/quests' as any)}
        />
        <StatTile
          label="OPEN BOUNTIES"
          value="—"
          color={colors.teal}
          bg={isDark ? colors.teal + '18' : '#EDFAF8'}
          onPress={() => router.push('/(tabs)/quests' as any)}
        />
      </View>

      {/* Today's Schedule Glance */}
      <SectionCard colors={colors} isDark={isDark}>
        <View style={[s.rowBetween, { marginBottom: 10, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <View style={s.row}>
            <Ionicons name="calendar" size={16} color={colors.primary} />
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>My Schedule Today</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/calendar' as any)}>
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>Full Schedule →</Text>
          </Pressable>
        </View>
        <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 10 }}>
          📅 No events today
        </Text>
      </SectionCard>

      {/* Dual sub-wallets */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SectionCard colors={colors} isDark={isDark} style={{ flex: 1 }}>
          <Text style={[s.walletSubLabel, { color: colors.textTertiary }]}>MAIN STORE WALLET</Text>
          <Text style={[s.walletBig, { color: colors.amber }]}>{mainCoins} 🪙</Text>
          <Text style={{ fontSize: 11, color: colors.textTertiary }}>Used in Perks Store</Text>
        </SectionCard>
        <SectionCard colors={colors} isDark={isDark} style={{ flex: 1, borderColor: colors.primary + '40' }}>
          <Text style={[s.walletSubLabel, { color: colors.primary }]}>GRANDPARENT BONUS</Text>
          <Text style={[s.walletBig, { color: colors.primary }]}>{gpCoins} 🪙</Text>
          <Pressable
            onPress={() => Alert.alert('Cash Out', 'Ask parents to convert your GP coins to cash')}
            style={[s.pill, { backgroundColor: colors.primary, marginTop: 6 }]}
          >
            <Text style={s.pillText}>💰 Cash Out</Text>
          </Pressable>
        </SectionCard>
      </View>
    </>
  );
}

// ─── SeniorHubView ────────────────────────────────────────────────────────────

function SeniorHubView({ member, colors, isDark }: {
  member: FamilyMember; colors: any; isDark: boolean;
}) {
  return (
    <>
      {/* HQ Banner */}
      <SectionCard colors={colors} isDark={isDark} style={{
        backgroundColor: isDark ? colors.primary + '18' : '#F5F3FF',
        borderColor: colors.primary + '40',
      }}>
        <Text style={[s.sectionTitle, { color: colors.primary }]}>👵 Senior Caregiver & Driver HQ</Text>
        <Text style={[s.sectionSub, { color: colors.textSecondary, marginTop: 6 }]}>
          Grandparents have exclusive rights to send bonus tips into the Grandparent Sub-Wallet for kids.
        </Text>
      </SectionCard>

      {/* Action grid */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={() => Alert.alert('Grandparent Tip', 'Send bonus coins and love to the kids')}
          style={[s.sectionCard, { flex: 1, alignItems: 'flex-start', gap: 4,
            backgroundColor: isDark ? colors.primary + '18' : '#F5F3FF',
            borderColor: colors.primary + '40',
          }]}
        >
          <Text style={{ fontSize: 28 }}>🎁</Text>
          <Text style={[s.sectionTitle, { color: colors.primary }]}>Grandparent Tip</Text>
          <Text style={[s.sectionSub, { color: colors.textSecondary }]}>Send bonus coins & love</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(tabs)/profile' as any)}
          style={[s.sectionCard, { flex: 1, alignItems: 'flex-start', gap: 4,
            backgroundColor: isDark ? colors.card : '#FFFFFF',
            borderColor: isDark ? colors.border : '#EDEAF8',
          }]}
        >
          <Text style={{ fontSize: 28 }}>📜</Text>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Payout Receipts</Text>
          <Text style={[s.sectionSub, { color: colors.textSecondary }]}>View confirmed receipts</Text>
        </Pressable>
      </View>

      {/* Drive launcher */}
      <SectionCard colors={colors} isDark={isDark} style={{
        backgroundColor: isDark ? colors.teal + '18' : '#EDFAF8',
        borderColor: colors.teal + '40',
      }}>
        <View style={s.rowBetween}>
          <View style={s.row}>
            <View style={[s.iconWrap, { backgroundColor: colors.teal + '30' }]}>
              <Ionicons name="navigate" size={20} color={colors.teal} />
            </View>
            <View>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Drive / Pickup</Text>
              <Text style={[s.sectionSub, { color: colors.textSecondary }]}>Alert the family you're en route</Text>
            </View>
          </View>
          <Pressable
            onPress={() => Alert.alert('En Route', 'Coming soon — will notify family with ETA')}
            style={[s.pill, { backgroundColor: colors.teal }]}
          >
            <Text style={s.pillText}>En Route</Text>
          </Pressable>
        </View>
      </SectionCard>
    </>
  );
}

// ─── AskHelpModal ─────────────────────────────────────────────────────────────

function AskHelpModal({ visible, onClose, onSubmit, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onSubmit: (category: HelpCategory, message: string) => void;
  colors: any; isDark: boolean;
}) {
  const [category, setCategory] = useState<HelpCategory>('Tutor / Help');
  const [message, setMessage]   = useState('');
  const cats: HelpCategory[] = ['Tutor / Help', 'Permission', 'Errand', 'Ride', 'Other'];

  const submit = () => {
    if (!message.trim()) return;
    onSubmit(category, message.trim());
    setMessage('');
    setCategory('Tutor / Help');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: isDark ? colors.card : '#fff', borderColor: colors.border }]}>
          <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>Ask for Help</Text>

          <Text style={[s.label, { color: colors.textSecondary }]}>CATEGORY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {cats.map(c => {
                const active = c === category;
                const col = CAT_COLOR[c];
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[s.chip, {
                      backgroundColor: active ? col + '22' : colors.surface,
                      borderColor: active ? col : colors.border,
                    }]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? col : colors.textSecondary }}>
                      {CAT_ICON[c]} {c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={[s.label, { color: colors.textSecondary }]}>WHAT DO YOU NEED?</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your request…"
            placeholderTextColor={colors.placeholder}
            multiline
            style={[s.textarea, {
              color: colors.textPrimary,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }]}
          />

          <Pressable
            onPress={submit}
            disabled={!message.trim()}
            style={[s.submitBtn, { backgroundColor: message.trim() ? colors.primary : colors.border }]}
          >
            <Text style={[s.submitBtnText, { color: message.trim() ? '#fff' : colors.textTertiary }]}>
              Submit Request
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── HubScreen ────────────────────────────────────────────────────────────────

export default function HubScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage, setActiveMember } = useFamilyStore();
  const unreadCount    = useNotifStore(st => st.unreadCount);
  const { items: groceryItems, load: loadGrocery } = useGroceryStore();

  const [helpTab, setHelpTab]     = useState<HelpStatus>('pending');
  const [showAskHelp, setShowAskHelp] = useState(false);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([
    { id: '1', from: '', category: 'Tutor / Help',  message: 'Need help with Math homework — fractions section', status: 'pending', coins: 20, createdAt: new Date().toISOString() },
    { id: '2', from: '', category: 'Permission',    message: 'Can I join the after-school coding club on Thursday?', status: 'pending', createdAt: new Date().toISOString() },
    { id: '3', from: '', category: 'Ride',          message: 'Can someone pick me up from practice at 5pm?', status: 'assigned', assignedTo: '', createdAt: new Date().toISOString() },
  ]);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadGrocery('family-1'); }, []);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent     = activeMember?.role === 'parent';
  const isKid        = activeMember?.role === 'kid';
  const isSenior     = activeMember?.role === 'senior';

  const pendingHelp  = helpRequests.filter(r => r.status === 'pending');
  const assignedHelp = helpRequests.filter(r => r.status === 'assigned');
  const doneHelp     = helpRequests.filter(r => r.status === 'done');

  const onAssign = (reqId: string, memberId: string) =>
    setHelpRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'assigned', assignedTo: memberId } : r));
  const onDecline = (reqId: string) =>
    setHelpRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'done' } : r));
  const onSelfAssign = (reqId: string) => activeMemberId && onAssign(reqId, activeMemberId);

  const kids: KidWallet[] = members
    .filter(m => m.role === 'kid')
    .map(m => ({ id: m.id, name: m.name, emoji: m.emoji ?? m.name[0], mainCoins: (m as any).coins ?? 0, gpCoins: 0 }));

  const groceryPending = groceryItems.filter(i => !i.isBought).length;

  const bg = isDark ? '#0B0F1A' : '#F3F4F8';

  // Parent quick actions
  const parentActions = [
    { id: 'scan',     icon: 'clipboard-outline' as const, label: '✨ Scan Flyer', bg: colors.primary },
    { id: 'quest',    icon: 'flag-outline' as const,      label: '+ Quest',       bg: colors.teal },
    { id: 'event',    icon: 'calendar-outline' as const,  label: '+ Event',       bg: colors.amber },
    { id: 'grocery',  icon: 'cart-outline' as const,      label: 'Groceries',     bg: '#00A896' },
  ];

  const handleParentAction = (id: string) => {
    switch (id) {
      case 'scan':    Alert.alert('Scan Flyer', 'AI flyer scan coming soon'); break;
      case 'quest':   router.push('/(tabs)/quests' as any); break;
      case 'event':   router.push('/(tabs)/calendar' as any); break;
      case 'grocery': router.push('/(tabs)/grocery' as any); break;
    }
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]} edges={['top']}>

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
        {/* Logo */}
        <Pressable style={s.logoRow}>
          <View style={[s.logoHex, { backgroundColor: isDark ? colors.primary + '30' : '#EEE9FA' }]}>
            <Text style={{ fontSize: 20 }}>🏠</Text>
          </View>
          <Text style={[s.logoText, { color: colors.textPrimary }]}>
            {'Family '}
            <Text style={{ color: colors.teal }}>Cube</Text>
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {activeMember && (
            <MemberPill
              member={activeMember}
              colors={colors}
              isDark={isDark}
              onPress={() => {
                const idx  = members.findIndex(m => m.id === activeMemberId);
                const next = members[(idx + 1) % members.length];
                if (next) setActiveMember(next.id);
              }}
            />
          )}
          <Pressable
            onPress={() => router.push('/(tabs)/all-notifications' as any)}
            style={[s.bellBtn, { backgroundColor: isDark ? colors.surface : '#F8F5FF' }]}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
            {unreadCount > 0 && (
              <View style={[s.bellDot, { backgroundColor: colors.danger ?? '#EF4444' }]}>
                <Text style={s.bellDotText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 48, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Parent quick action bar ── */}
        {(isParent || isSenior) && (
          <View style={[s.actionBar, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
            {(isParent ? parentActions : parentActions.slice(0, 2)).map(a => (
              <Pressable
                key={a.id}
                onPress={() => handleParentAction(a.id)}
                style={[s.actionBtn, { backgroundColor: a.bg }]}
              >
                <Ionicons name={a.icon} size={20} color="#fff" />
                <Text style={s.actionLabel}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Role-based body ── */}
        <View style={{ gap: 10, paddingHorizontal: 12, paddingTop: 10 }}>
          {isParent && (
            <ParentHubView
              members={members}
              pendingHelp={pendingHelp}
              assignedHelp={assignedHelp}
              doneHelp={doneHelp}
              helpTab={helpTab}
              setHelpTab={setHelpTab}
              setShowAskHelp={setShowAskHelp}
              activeMember={activeMember}
              onAssign={onAssign}
              onDecline={onDecline}
              onSelfAssign={onSelfAssign}
              kids={kids}
              groceryPending={groceryPending}
              colors={colors}
              isDark={isDark}
            />
          )}
          {isKid && activeMember && (
            <KidHubView member={activeMember} colors={colors} isDark={isDark} />
          )}
          {isSenior && activeMember && (
            <SeniorHubView member={activeMember} colors={colors} isDark={isDark} />
          )}
          {!activeMember && (
            <Text style={{ color: colors.textTertiary, textAlign: 'center', paddingTop: 40 }}>
              No family members found. Add members in settings.
            </Text>
          )}
        </View>
      </ScrollView>

      <AskHelpModal
        visible={showAskHelp}
        onClose={() => setShowAskHelp(false)}
        onSubmit={(category, message) => {
          setHelpRequests(prev => [{
            id: Date.now().toString(),
            from: activeMemberId ?? '',
            category, message,
            status: 'pending',
            createdAt: new Date().toISOString(),
          }, ...prev]);
          setHelpTab('pending');
          setShowAskHelp(false);
        }}
        colors={colors}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoHex:    { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  logoText:   { fontSize: 20, fontWeight: '800' },

  memberPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99,
                borderWidth: 1, paddingVertical: 4, paddingHorizontal: 8 },
  memberAvatar:{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  memberName: { fontSize: 12, fontWeight: '700', lineHeight: 14 },
  memberRole: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  bellBtn:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bellDot:    { position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14, borderRadius: 7,
                alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
                borderWidth: 1.5, borderColor: '#fff' },
  bellDotText:{ color: '#fff', fontSize: 8, fontWeight: '800' },

  // Action bar (parent quick buttons)
  actionBar:  { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 12,
                borderBottomWidth: StyleSheet.hairlineWidth },
  actionBtn:  { flex: 1, borderRadius: 14, paddingVertical: 12,
                alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionLabel:{ color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },

  // Section cards
  sectionCard:{ borderRadius: 20, borderWidth: 1, padding: 14 },
  sectionTitle:{ fontSize: 14, fontWeight: '800', marginBottom: 2 },
  sectionSub: { fontSize: 12, lineHeight: 17 },

  // Shared layout
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconWrap:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  // Pill button
  pill:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99,
                paddingVertical: 7, paddingHorizontal: 12 },
  pillText:   { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Badge chip
  badge:      { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:  { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Category badge
  catBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99,
                borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  catText:    { fontSize: 11, fontWeight: '700' },
  coinTag:    { fontSize: 12, fontWeight: '800' },

  // Help card
  card:       { borderRadius: 14, borderWidth: 1, padding: 12, gap: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardMsg:    { fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 2 },

  // Tab bar
  tabBar:     { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 3 },
  tabBtn:     { flex: 1, paddingVertical: 6, alignItems: 'center' },
  tabBtnText: { fontSize: 13 },

  // Wallet
  walletRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  walletName: { fontSize: 14, fontWeight: '700' },
  walletSubLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3, marginBottom: 4 },
  walletBig:  { fontSize: 20, fontWeight: '900', marginBottom: 4 },

  // Kid stat tiles
  threeGrid:  { flexDirection: 'row', gap: 8 },
  statTile:   { flex: 1, borderRadius: 16, borderWidth: 1, padding: 10, alignItems: 'center', gap: 4 },
  statValue:  { fontSize: 18, fontWeight: '900' },
  statLabel:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.4, textAlign: 'center' },

  // Kid quick action grid
  quickGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  quickGridItem: { width: '22%', aspectRatio: 1, borderRadius: 14, borderWidth: 1,
                   alignItems: 'center', justifyContent: 'center', gap: 4 },
  quickGridLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, paddingBottom: 40 },
  sheetHandle:{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  label:      { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  chip:       { borderRadius: 99, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6 },
  textarea:   { borderWidth: 1.5, borderRadius: 14, padding: 12, fontSize: 15,
                minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
  submitBtn:  { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { fontSize: 16, fontWeight: '700' },
});

