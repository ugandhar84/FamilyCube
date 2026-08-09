/**
 * Admin: Coins Configuration
 * Set how many coins each action awards, and view top coin earners.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import { TYPO } from '@/constants/theme';

// ─── Default earn rates (mirrors lib/db/rewards.ts COIN_REWARDS) ─────────────

const DEFAULT_RATES: Record<string, { label: string; icon: string; default: number }> = {
  daily_login:   { label: 'Daily login / check-in', icon: '📅', default: 10 },
  post_created:  { label: 'New post published',      icon: '📸', default: 20 },
  post_liked:    { label: 'Post receives a like',    icon: '❤️', default: 2  },
  comment_added: { label: 'Comment left on a post',  icon: '💬', default: 5  },
  streak_7day:   { label: '7-day streak bonus',      icon: '🔥', default: 50 },
  streak_30day:  { label: '30-day streak bonus',     icon: '🏆', default: 200},
  level_up:      { label: 'Pet levels up',           icon: '⬆️', default: 100},
};

interface CoinRate { key: string; value: number; }
interface LeaderRow { id: string; full_name: string | null; coins: number; lifetime_coins: number; }
interface ConversionRow {
  partner: string;
  total_conversions: number;
  attributed: number;
  total_commission_usd: number;
  total_gmv_usd: number;
  total_bonus_coins_issued: number;
  last_conversion_at: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function RateRow({ rateKey, meta, value, onChange, colors }: {
  rateKey: string;
  meta: { label: string; icon: string; default: number };
  value: number;
  onChange: (v: number) => void;
  colors: any;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  return (
    <View style={[r.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={r.icon}>{meta.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[r.label, { color: colors.textPrimary }]}>{meta.label}</Text>
        <Text style={[r.key, { color: colors.textTertiary }]}>{rateKey}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <TextInput
          style={[r.input, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
          value={draft}
          onChangeText={setDraft}
          onBlur={() => {
            const n = parseInt(draft, 10);
            if (!isNaN(n) && n >= 0) { onChange(n); } else { setDraft(String(value)); }
          }}
          keyboardType="number-pad"
          selectTextOnFocus
        />
        <Text style={[r.coinTag, { color: colors.textSecondary }]}>🪙 coins</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AdminCoinsConfigScreen() {
  const { colors } = useTheme();
  const [rates, setRates]           = useState<Record<string, number>>(() =>
    Object.fromEntries(Object.entries(DEFAULT_RATES).map(([k, v]) => [k, v.default]))
  );
  const [leaders, setLeaders]           = useState<LeaderRow[]>([]);
  const [conversions, setConversions]   = useState<ConversionRow[]>([]);
  const [totalCoins, setTotalCoins]     = useState(0);
  const [totalCommission, setTotalComm] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [dirty, setDirty]               = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Load stored rates from app_settings (key: coin_rates JSON blob)
      const { data: setting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'coin_rates')
        .maybeSingle();

      if (setting?.value) {
        setRates(prev => ({ ...prev, ...setting.value }));
      }

      // Top earners
      const { data: top } = await supabase
        .from('profiles')
        .select('id, full_name, coins, lifetime_coins')
        .order('lifetime_coins', { ascending: false })
        .limit(10);
      setLeaders((top ?? []) as LeaderRow[]);

      // Total coins in circulation
      const { data: agg } = await supabase
        .from('profiles')
        .select('coins');
      setTotalCoins((agg ?? []).reduce((s: number, p: any) => s + (p.coins ?? 0), 0));

      // Conversion revenue summary
      const { data: conv } = await supabase
        .from('admin_conversion_summary')
        .select('*');
      setConversions((conv ?? []) as ConversionRow[]);
      setTotalComm((conv ?? []).reduce((s: number, r: any) => s + (r.total_commission_usd ?? 0), 0));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setDirty(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateRate = (key: string, val: number) => {
    setRates(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const saveRates = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'coin_rates', value: rates }, { onConflict: 'key' });
      if (error) throw error;
      setDirty(false);
      Alert.alert('Saved', 'Coin rates updated. New engagements will use these values immediately.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    Alert.alert('Reset to defaults?', 'All rates will return to their original values.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => {
        const defaults = Object.fromEntries(Object.entries(DEFAULT_RATES).map(([k, v]) => [k, v.default]));
        setRates(defaults);
        setDirty(true);
      }},
    ]);
  };

  const grantBonus = async (userId: string, name: string | null) => {
    Alert.prompt(
      `Grant coins to ${name ?? 'user'}`,
      'Enter coin amount to add (positive) or deduct (negative):',
      async (input) => {
        const delta = parseInt(input ?? '', 10);
        if (isNaN(delta) || delta === 0) return;
        const { data, error } = await supabase.rpc('admin_adjust_coins', {
          p_user_id: userId,
          p_delta:   delta,
          p_reason:  'admin_grant',
          p_ref_id:  null,
        });
        if (error) { Alert.alert('Error', error.message); return; }
        const newBal = (data as any)?.new_balance ?? 0;
        Alert.alert('Done', `${delta > 0 ? '+' : ''}${delta} coins applied. New balance: ${newBal}`);
        load(true);
      },
      'plain-text',
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{
        title: 'Coins & Rewards Config',
        headerRight: () => (
          <TouchableOpacity onPress={resetDefaults} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: colors.textSecondary, fontSize: TYPO.body }}>Reset</Text>
          </TouchableOpacity>
        ),
      }} />

      {loading ? (
        <ActivityIndicator size="large" color="#7C5CBF" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#7C5CBF" />}
        >
          {/* Economy overview */}
          <View style={[s.statsRow, { gap: 10, marginBottom: 10 }]}>
            <View style={[s.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={s.statVal}>{totalCoins.toLocaleString()}</Text>
              <Text style={[s.statLabel, { color: colors.textSecondary }]}>🪙 coins in circulation</Text>
            </View>
            <View style={[s.statBox, { backgroundColor: '#D1FAE5', borderColor: '#22C55E55' }]}>
              <Text style={[s.statVal, { color: '#15803D' }]}>${totalCommission.toFixed(2)}</Text>
              <Text style={[s.statLabel, { color: '#15803D' }]}>💵 commission earned</Text>
            </View>
          </View>

          {/* Revenue by partner */}
          {conversions.length > 0 && (
            <>
              <View style={[s.sectionHeader, { borderColor: colors.border, marginBottom: 10 }]}>
                <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>REVENUE BY PARTNER</Text>
              </View>
              <View style={{ gap: 8, marginBottom: 20 }}>
                {conversions.map(c => (
                  <View key={c.partner} style={[s.convRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: TYPO.body, textTransform: 'capitalize' }}>{c.partner}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: TYPO.caption, marginTop: 2 }}>
                        {c.attributed} conversions · ${(c.total_gmv_usd ?? 0).toFixed(0)} GMV · {c.total_bonus_coins_issued} bonus 🪙 issued
                      </Text>
                    </View>
                    <Text style={{ color: '#15803D', fontWeight: '800', fontSize: TYPO.subheading }}>
                      ${(c.total_commission_usd ?? 0).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}


          {/* Earn rates */}
          <View style={[s.sectionHeader, { borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>EARN RATES</Text>
            <Text style={[s.sectionSub, { color: colors.textTertiary }]}>Coins awarded per action</Text>
          </View>

          <View style={{ gap: 8, marginBottom: 20 }}>
            {Object.entries(DEFAULT_RATES).map(([key, meta]) => (
              <RateRow
                key={key}
                rateKey={key}
                meta={meta}
                value={rates[key] ?? meta.default}
                onChange={v => updateRate(key, v)}
                colors={colors}
              />
            ))}
          </View>

          {/* Save button */}
          <TouchableOpacity
            onPress={saveRates}
            disabled={!dirty || saving}
            style={[s.saveBtn, { backgroundColor: dirty ? '#7C5CBF' : colors.border }]}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={[s.saveBtnText, { color: dirty ? '#fff' : colors.textSecondary }]}>
                  {dirty ? 'Save rates' : 'Rates saved ✓'}
                </Text>
            }
          </TouchableOpacity>

          <Text style={[s.hint, { color: colors.textTertiary }]}>
            Rates are read by the client on each action. Changes take effect immediately — no app update needed.
          </Text>

          {/* Top earners */}
          <View style={[s.sectionHeader, { borderColor: colors.border, marginTop: 28 }]}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>TOP EARNERS</Text>
            <Text style={[s.sectionSub, { color: colors.textTertiary }]}>Tap to grant/deduct coins</Text>
          </View>

          <View style={{ gap: 8 }}>
            {leaders.map((u, i) => (
              <TouchableOpacity
                key={u.id}
                onPress={() => grantBonus(u.id, u.full_name)}
                style={[s.leaderRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.75}
              >
                <Text style={s.rank}>#{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.leaderName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {u.full_name ?? 'Unknown user'}
                  </Text>
                  <Text style={[s.leaderSub, { color: colors.textSecondary }]}>
                    {u.lifetime_coins.toLocaleString()} lifetime earned
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.coinBal}>🪙 {u.coins.toLocaleString()}</Text>
                  <Text style={[s.leaderSub, { color: colors.textTertiary }]}>spendable</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ))}

            {leaders.length === 0 && (
              <Text style={[s.empty, { color: colors.textSecondary }]}>No users have earned coins yet.</Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  statsRow:     { flexDirection: 'row' },
  statBox:      { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14, alignItems: 'center' },
  statVal:      { fontSize: TYPO.title, fontWeight: '800', color: '#7C5CBF' },
  statLabel:    { fontSize: TYPO.caption, marginTop: 2, textAlign: 'center' },
  sectionHeader:{ borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8, marginBottom: 12 },
  sectionTitle: { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.8 },
  sectionSub:   { fontSize: TYPO.caption, marginTop: 2 },
  saveBtn:      { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  saveBtnText:  { fontSize: TYPO.subheading, fontWeight: '700' },
  hint:         { fontSize: TYPO.caption, lineHeight: 18, textAlign: 'center' },
  leaderRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  rank:         { fontSize: TYPO.body, fontWeight: '800', color: '#7C5CBF', width: 28 },
  leaderName:   { fontSize: TYPO.body, fontWeight: '600' },
  leaderSub:    { fontSize: TYPO.caption, marginTop: 1 },
  coinBal:      { fontSize: TYPO.body, fontWeight: '700', color: '#C8860A' },
  empty:        { textAlign: 'center', paddingVertical: 24, fontSize: TYPO.body },
  convRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
});

const r = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  icon:   { fontSize: TYPO.title, width: 32 },
  label:  { fontSize: TYPO.body, fontWeight: '600' },
  key:    { fontSize: TYPO.label, marginTop: 1 },
  input:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: TYPO.subheading, fontWeight: '700', textAlign: 'center', width: 72 },
  coinTag:{ fontSize: TYPO.label },
});
