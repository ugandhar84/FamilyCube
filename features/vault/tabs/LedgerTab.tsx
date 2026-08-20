import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { ScrollText, Coins, TrendingUp, Gift, Plus, X, Check } from 'lucide-react-native';
import { useFamilyStore } from '@/store/familyStore';
import { SCard, CardHeader, MemberAvatar, StatusPill, AddBtn, BRAND } from './shared';

// ─── Grant-Coins Modal ─────────────────────────────────────────────────────────

function GrantCoinsModal({ visible, onClose, onGrant, members, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onGrant: (memberId: string, amount: number, reason: string) => Promise<void>;
  members: any[]; colors: any; isDark: boolean;
}) {
  const [selectedId, setSelectedId] = useState(members[0]?.id ?? '');
  const [amount, setAmount]         = useState('');
  const [reason, setReason]         = useState('');
  const [saving, setSaving]         = useState(false);

  const handleGrant = async () => {
    const n = parseInt(amount);
    if (!n || n <= 0) return;
    setSaving(true);
    await onGrant(selectedId, n, reason);
    setSaving(false);
    setAmount(''); setReason('');
    onClose();
  };

  const inp = [gs.inp, {
    backgroundColor: isDark ? colors.card : '#F5F3FF',
    borderColor: colors.border, color: colors.textPrimary,
  }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[gs.modal, { backgroundColor: isDark ? colors.background : '#FAF8FF' }]}>
          <View style={gs.header}>
            <Text style={[gs.title, { color: colors.textPrimary }]}>Grant Coins</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textSecondary} /></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
            {/* Member picker */}
            <View>
              <Text style={[gs.label, { color: colors.textSecondary }]}>Member</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {members.filter(m => m.role !== 'parent').map(m => (
                  <TouchableOpacity key={m.id} onPress={() => setSelectedId(m.id)}
                    style={[gs.memberChip, {
                      borderColor: selectedId === m.id ? BRAND.amber : colors.border,
                      backgroundColor: selectedId === m.id ? BRAND.amber + '15' : 'transparent',
                    }]}>
                    <MemberAvatar name={m.name} color={selectedId === m.id ? BRAND.amber : colors.textSecondary} size={30} />
                    <Text style={{ fontSize: 13, fontWeight: '700',
                      color: selectedId === m.id ? BRAND.amber : colors.textSecondary }}>
                      {m.name.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={[gs.label, { color: colors.textSecondary }]}>Coins to Grant</Text>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric"
                placeholder="e.g. 50" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>
            <View>
              <Text style={[gs.label, { color: colors.textSecondary }]}>Reason (optional)</Text>
              <TextInput value={reason} onChangeText={setReason}
                placeholder="Great week, helped with chores…" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>
          </ScrollView>

          <View style={[gs.footer, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={[gs.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGrant}
              style={[gs.saveBtn, { backgroundColor: BRAND.amber }]} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Grant Coins</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Pay Modal ────────────────────────────────────────────────────────────────

function PayModal({ visible, onClose, onPay, members, fromMember, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onPay: (toId: string, amount: number, note: string) => Promise<void>;
  members: any[]; fromMember: any; colors: any; isDark: boolean;
}) {
  const [toId, setToId]   = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  const others = members.filter(m => m.id !== fromMember?.id);

  const handlePay = async () => {
    const n = parseInt(amount);
    if (!n || n <= 0 || !toId) return;
    setSaving(true);
    await onPay(toId, n, note);
    setSaving(false);
    setAmount(''); setNote(''); setToId('');
    onClose();
  };

  const inp = [gs.inp, {
    backgroundColor: isDark ? colors.card : '#F5F3FF',
    borderColor: colors.border, color: colors.textPrimary,
  }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[gs.modal, { backgroundColor: isDark ? colors.background : '#FAF8FF' }]}>
          <View style={gs.header}>
            <Text style={[gs.title, { color: colors.textPrimary }]}>Send Coins</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textSecondary} /></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
            <View>
              <Text style={[gs.label, { color: colors.textSecondary }]}>Send To</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {others.map(m => {
                  const mc = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? BRAND.blue : BRAND.emerald;
                  return (
                    <TouchableOpacity key={m.id} onPress={() => setToId(m.id)}
                      style={[gs.memberChip, {
                        borderColor: toId === m.id ? mc : colors.border,
                        backgroundColor: toId === m.id ? mc + '15' : 'transparent',
                      }]}>
                      <MemberAvatar name={m.name} color={toId === m.id ? mc : colors.textSecondary} size={30} />
                      <Text style={{ fontSize: 13, fontWeight: '700',
                        color: toId === m.id ? mc : colors.textSecondary }}>
                        {m.name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={[gs.label, { color: colors.textSecondary }]}>
                Amount (you have {fromMember?.coins ?? 0} coins)
              </Text>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric"
                placeholder="e.g. 20" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>
            <View>
              <Text style={[gs.label, { color: colors.textSecondary }]}>Note</Text>
              <TextInput value={note} onChangeText={setNote}
                placeholder="Birthday gift, thank you…" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>
          </ScrollView>

          <View style={[gs.footer, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={[gs.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePay}
              style={[gs.saveBtn, { backgroundColor: BRAND.teal }]} disabled={saving || !toId}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Send</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main LedgerTab ───────────────────────────────────────────────────────────

export default function LedgerTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId, awardCoins, deductCoins } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';

  const [showGrant, setShowGrant] = useState(false);
  const [showPay, setShowPay]     = useState(false);
  const [txLog, setTxLog]         = useState<{ from: string; to: string; amount: number; note: string; ts: string }[]>([]);

  const totalCoins = useMemo(() =>
    members.reduce((s, m) => s + (m.coins ?? 0), 0), [members]);

  const maxCoins = useMemo(() =>
    Math.max(...members.map(m => m.coins ?? 0), 1), [members]);

  const roleColor = (role: string) =>
    role === 'parent' ? BRAND.purple : role === 'senior' ? BRAND.blue : BRAND.emerald;

  const handleGrant = async (memberId: string, amount: number, reason: string) => {
    awardCoins(memberId, amount, 'mainCoins');
    setTxLog(prev => [{
      from: activeMember?.name ?? 'Parent', to: memberId,
      amount, note: reason || 'Bonus coins', ts: new Date().toISOString(),
    }, ...prev.slice(0, 19)]);
  };

  const handlePay = async (toId: string, amount: number, note: string) => {
    deductCoins(activeMemberId ?? '', amount, 'mainCoins');
    awardCoins(toId, amount, 'mainCoins');
    if (true) {
      setTxLog(prev => [{
        from: activeMember?.name ?? '?', to: toId, amount, note, ts: new Date().toISOString(),
      }, ...prev.slice(0, 19)]);
    }
  };

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? id;

  return (
    <>
      {/* ── Family Coin Summary ──────────────────────── */}
      <SCard colors={colors} isDark={isDark} accent={BRAND.amber}>
        <CardHeader Icon={ScrollText} iconColor={BRAND.amber} title="Family Coin Ledger"
          badge={`${totalCoins} total`} badgeColor={BRAND.amber} colors={colors} />

        {members.map(m => {
          const rc = roleColor(m.role);
          const pct = Math.min((m.coins ?? 0) / maxCoins, 1);
          return (
            <View key={m.id} style={[ld.memberRow, { borderColor: colors.border }]}>
              <MemberAvatar name={m.name} color={rc} size={36} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary }}>
                    {m.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Coins size={13} color={BRAND.amber} />
                    <Text style={{ fontSize: 14, fontWeight: '900', color: BRAND.amber }}>
                      {m.coins ?? 0}
                    </Text>
                  </View>
                </View>
                {/* Progress bar */}
                <View style={[ld.barTrack, { backgroundColor: colors.border }]}>
                  <View style={[ld.barFill, { width: `${pct * 100}%` as any, backgroundColor: rc }]} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  {m.gpCoins != null && (
                    <StatusPill label={`${m.gpCoins} GP`} color={BRAND.purple} />
                  )}
                  {m.mainCoins != null && (
                    <StatusPill label={`${m.mainCoins} Main`} color={BRAND.teal} />
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          {isParent && (
            <TouchableOpacity onPress={() => setShowGrant(true)}
              style={[ld.actionBtn, { borderColor: BRAND.amber + '60', backgroundColor: BRAND.amber + '10', flex: 1 }]}>
              <Gift size={15} color={BRAND.amber} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.amber }}>Grant Coins</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowPay(true)}
            style={[ld.actionBtn, { borderColor: BRAND.teal + '60', backgroundColor: BRAND.teal + '10', flex: 1 }]}>
            <TrendingUp size={15} color={BRAND.teal} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.teal }}>
              Send Coins
            </Text>
          </TouchableOpacity>
        </View>
      </SCard>

      {/* ── Transaction Log ──────────────────────────── */}
      {txLog.length > 0 && (
        <SCard colors={colors} isDark={isDark} accent={BRAND.amber}>
          <CardHeader Icon={TrendingUp} iconColor={BRAND.purple} title="Recent Transfers"
            badge={`${txLog.length}`} badgeColor={BRAND.purple} colors={colors} />
          {txLog.map((tx, i) => (
            <View key={i} style={[ld.txRow, { borderColor: colors.border }]}>
              <View style={[ld.txIcon, { backgroundColor: BRAND.teal + '20' }]}>
                <Coins size={14} color={BRAND.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                  {tx.from} → {memberName(tx.to)}
                </Text>
                {tx.note ? <Text style={{ fontSize: 11, color: colors.textTertiary }}>{tx.note}</Text> : null}
              </View>
              <Text style={{ fontSize: 14, fontWeight: '900', color: BRAND.amber }}>+{tx.amount}</Text>
            </View>
          ))}
        </SCard>
      )}

      {/* Modals */}
      <GrantCoinsModal visible={showGrant} onClose={() => setShowGrant(false)}
        onGrant={handleGrant} members={members} colors={colors} isDark={isDark} />
      <PayModal visible={showPay} onClose={() => setShowPay(false)}
        onPay={handlePay} members={members} fromMember={activeMember} colors={colors} isDark={isDark} />
    </>
  );
}

const ld = StyleSheet.create({
  memberRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth,
               paddingTop: 12, marginTop: 12 },
  barTrack:  { height: 5, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  barFill:   { height: '100%', borderRadius: 3 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 14, borderWidth: 1.5,
               paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
  txRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth,
               paddingTop: 10, marginTop: 10 },
  txIcon:    { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

const gs = StyleSheet.create({
  modal:     { flex: 1 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
               borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB' },
  title:     { fontSize: 18, fontWeight: '900' },
  label:     { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  inp:       { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 10,
               fontSize: 14, fontWeight: '600' },
  memberChip:{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5,
               paddingHorizontal: 10, paddingVertical: 7 },
  footer:    { flexDirection: 'row', gap: 10, padding: 20, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  saveBtn:   { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
});
