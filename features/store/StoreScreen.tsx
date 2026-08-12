import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useRewardStore, Reward } from '@/store/rewardStore';

// ─── Perk Card ────────────────────────────────────────────────────────────────

function PerkCard({ reward, myCoins, isKid, isParent, colors, onRedeem, onEdit }: {
  reward: Reward; myCoins: number; isKid: boolean; isParent: boolean; colors: any;
  onRedeem: (r: Reward) => void; onEdit: (r: Reward) => void;
}) {
  const canRedeem = isKid && myCoins >= reward.cost;
  return (
    <Pressable onLongPress={() => isParent && onEdit(reward)}
      style={[s.perkCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{flex:1}}>
        <Text style={{fontSize:30, marginBottom:6}}>{reward.emoji ?? '🎁'}</Text>
        <Text style={{fontSize:12, fontWeight:'800', color: colors.textPrimary, marginBottom:2}}>
          {reward.title}
        </Text>
        <Text style={{fontSize:10, fontWeight:'900', color: colors.amber}}>{reward.cost} Coins 🪙</Text>
        {reward.description ? (
          <Text style={{fontSize:10, color: colors.textTertiary, marginTop:4}}>{reward.description}</Text>
        ) : null}
      </View>
      {isKid ? (
        <Pressable onPress={() => onRedeem(reward)} disabled={!canRedeem}
          style={[s.redeemBtn, { backgroundColor: canRedeem ? colors.teal : colors.border }]}>
          <Text style={{fontSize:11, fontWeight:'800', color: canRedeem ? '#fff' : colors.textTertiary}}>
            Redeem Perks
          </Text>
        </Pressable>
      ) : (
        <Text style={{fontSize:10, color: colors.textTertiary, textAlign:'center', marginTop:8}}>
          {isParent ? 'Parent Catalog View' : 'Kid Mode Required'}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Create/Edit Perk Modal ───────────────────────────────────────────────────

function PerkModal({ visible, editing, colors, onClose, onSave }: {
  visible:boolean; editing?:Reward|null; colors:any; onClose:()=>void; onSave:(data:any)=>void;
}) {
  const [name,  setName]  = useState(editing?.title ?? '');
  const [desc,  setDesc]  = useState(editing?.description ?? '');
  const [cost,  setCost]  = useState(String(editing?.cost ?? '50'));
  const [emoji, setEmoji] = useState(editing?.emoji ?? '🎁');
  const EMOJIS = ['🎮','🎬','🍕','🎂','🏖️','🎪','📱','🛍️','🎁','⭐','🏆','🎵'];

  const submit = () => {
    if (!name.trim()) return;
    onSave({ title:name.trim(), description:desc.trim()||undefined, cost:parseInt(cost)||50, emoji });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
        <View style={s.overlay}>
          <Pressable style={{flex:1}} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />
            <View style={[s.row, { justifyContent:'space-between', marginBottom:12 }]}>
              <Text style={{fontSize:15, fontWeight:'800', color: colors.textPrimary}}>
                {editing ? 'Edit Perk' : 'Create Custom Store Perk'}
              </Text>
              <Pressable onPress={onClose}>
                <Ionicons name="close" size={20} color={colors.textTertiary} />
              </Pressable>
            </View>

            <Text style={[s.label, { color: colors.textSecondary }]}>PERK TITLE</Text>
            <TextInput value={name} onChangeText={setName}
              placeholder="e.g. Movie Night Choice or Pizza Party"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                backgroundColor: colors.surface }]} />

            <View style={{ flexDirection:'row', gap:10, marginBottom:10 }}>
              <View style={{flex:1}}>
                <Text style={[s.label, { color: colors.textSecondary }]}>COIN COST</Text>
                <TextInput value={cost} onChangeText={setCost} keyboardType="number-pad"
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                    backgroundColor: colors.surface, marginBottom:0 }]} />
              </View>
            </View>

            <Text style={[s.label, { color: colors.textSecondary }]}>DESCRIPTION (optional)</Text>
            <TextInput value={desc} onChangeText={setDesc} placeholder="Brief description…"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                backgroundColor: colors.surface }]} />

            <Text style={[s.label, { color: colors.textSecondary }]}>EMOJI ICON</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:14}}>
              <View style={{flexDirection:'row', gap:8}}>
                {EMOJIS.map(e => (
                  <Pressable key={e} onPress={() => setEmoji(e)}
                    style={[s.emojiBtn, {
                      backgroundColor: emoji===e ? colors.primary+'25' : colors.surface,
                      borderColor: emoji===e ? colors.primary : colors.border,
                    }]}>
                    <Text style={{fontSize:20}}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Pressable onPress={submit}
              style={[s.submitBtn, { backgroundColor: name.trim() ? colors.teal : colors.border }]}>
              <Text style={{color:'#fff', fontSize:14, fontWeight:'800'}}>
                {editing ? 'Save Changes' : 'Publish Perk to Family Store'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── StoreScreen ─────────────────────────────────────────────────────────────

export default function StoreScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { rewards, loadFromStorage:loadRewards, addReward, updateReward } = useRewardStore();

  const [showCreate, setShowCreate] = useState(false);
  const [editing,    setEditing]    = useState<Reward|null>(null);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadRewards(); }, []);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';
  const isKid    = activeMember?.role === 'kid';
  const myCoins  = (activeMember as any)?.mainCoins ?? 0;
  const bg       = isDark ? '#0B0F1A' : colors.background;

  const handleRedeem = (r: Reward) => {
    if (myCoins < r.cost) {
      Alert.alert('Insufficient Coins', `You need ${r.cost} 🪙 but only have ${myCoins} 🪙`);
      return;
    }
    Alert.alert('Redeem Perk?', `Redeem "${r.title}" for ${r.cost} 🪙?`, [
      { text:'Cancel', style:'cancel' },
      { text:'Redeem', onPress: () => Alert.alert('🎉 Redeemed!',
        `"${r.title}" redeemed! Ask a parent for your reward.`) },
    ]);
  };

  return (
    <SafeAreaView style={{flex:1, backgroundColor: bg}} edges={['top']}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={{fontSize:16, fontWeight:'800', color: colors.textPrimary}}>Family Perks Store</Text>
        {isKid ? (
          <View style={[s.coinBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{fontSize:11, fontWeight:'800', color: colors.textSecondary}}>
              Main Store Balance: <Text style={{color: colors.amber, fontWeight:'900'}}>{myCoins} 🪙</Text>
            </Text>
          </View>
        ) : isParent ? (
          <Pressable onPress={() => setShowCreate(true)}
            style={[s.createBtn, { backgroundColor: colors.teal }]}>
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{fontSize:12, fontWeight:'700', color:'#fff', marginLeft:4}}>Create Custom Perk</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding:12, paddingBottom:40}}>
        <Text style={{fontSize:10, color: colors.textTertiary, marginBottom:12, lineHeight:16}}>
          Note: Perks are redeemed strictly from your Main Parent Wallet.
          Grandparent Bonus coins are cashed out via parents.
        </Text>

        {rewards.length === 0 ? (
          <View style={[s.emptyBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={{fontSize:32, marginBottom:8}}>🎁</Text>
            <Text style={{fontSize:14, fontWeight:'700', color: colors.textTertiary}}>No perks yet</Text>
            {isParent && (
              <Text style={{fontSize:12, color: colors.textTertiary, marginTop:4}}>
                Tap "Create Custom Perk" to add rewards for the kids
              </Text>
            )}
          </View>
        ) : (
          <View style={s.grid}>
            {rewards.map(r => (
              <PerkCard key={r.id} reward={r} myCoins={myCoins}
                isKid={isKid} isParent={isParent} colors={colors}
                onRedeem={handleRedeem}
                onEdit={r => { setEditing(r); setShowCreate(true); }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <PerkModal visible={showCreate} editing={editing} colors={colors}
        onClose={() => { setShowCreate(false); setEditing(null); }}
        onSave={data => {
          if (editing) updateReward?.(editing.id, data);
          else addReward?.({ category:'Special', available:true, requiresApproval:true,
            createdAt: new Date().toISOString(), ...data } as any);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header:    { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
               paddingHorizontal:16, paddingVertical:12,
               borderBottomWidth: StyleSheet.hairlineWidth },
  createBtn: { flexDirection:'row', alignItems:'center', borderRadius:12,
               paddingVertical:7, paddingHorizontal:12 },
  coinBadge: { borderRadius:99, paddingVertical:6, paddingHorizontal:12, borderWidth:1 },
  row:       { flexDirection:'row', alignItems:'center' },
  grid:      { flexDirection:'row', flexWrap:'wrap', gap:10 },
  perkCard:  { width:'47.5%', borderRadius:20, borderWidth:1, padding:14,
               justifyContent:'space-between',
               shadowColor:'#000', shadowOpacity:0.08, shadowOffset:{width:0,height:2},
               shadowRadius:6, elevation:3 },
  redeemBtn: { borderRadius:12, paddingVertical:8, alignItems:'center', marginTop:10 },
  emptyBox:  { borderRadius:20, borderWidth:1, padding:40, alignItems:'center' },
  overlay:   { flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.8)' },
  sheet:     { borderTopLeftRadius:28, borderTopRightRadius:28, borderTopWidth:1,
               padding:20, paddingBottom:40 },
  handle:    { width:40, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  label:     { fontSize:10, fontWeight:'700', letterSpacing:0.5, marginBottom:6, marginTop:6 },
  input:     { borderWidth:1.5, borderRadius:12, padding:10, fontSize:13, marginBottom:10 },
  emojiBtn:  { width:44, height:44, borderRadius:12, borderWidth:1,
               alignItems:'center', justifyContent:'center' },
  submitBtn: { borderRadius:14, paddingVertical:13, alignItems:'center' },
});
