// Admin — AI Model Chain Config
// Deploy: no deploy needed; reads/writes app_settings.ai_chain_config

import { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Animated,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';

// ── Types ─────────────────────────────────────────────────────────────────────
type Provider = 'gemini' | 'deepseek' | 'openai' | 'anthropic' | 'custom';
type ModelSlot = { provider: Provider; model: string; timeoutSecs: number };
type UseCaseKey = 'mood_scan' | 'symptom_scan' | 'vet_chat' | 'health_records' | 'pet_timeline' | 'general_vision' | 'general_text';
type AIChainConfig = Record<UseCaseKey, ModelSlot[]>;

const USE_CASES: { key: UseCaseKey; label: string; icon: string; hint: string }[] = [
  { key: 'mood_scan',      icon: '😊', label: 'Mood Scan',       hint: 'Vision — pet photo mood analysis' },
  { key: 'symptom_scan',   icon: '🩺', label: 'Symptom Scan',    hint: 'Text or vision — symptom checker' },
  { key: 'vet_chat',       icon: '💬', label: 'Vet Chat',         hint: 'Text — AI vet chat' },
  { key: 'health_records', icon: '📋', label: 'Health Records',   hint: 'Vision — parse vet documents' },
  { key: 'pet_timeline',   icon: '📅', label: 'Pet Timeline',     hint: 'Text — generate timeline entries' },
  { key: 'general_vision', icon: '🔍', label: 'General Vision',   hint: 'Vision — receipts, insurance docs, YIR' },
  { key: 'general_text',   icon: '📝', label: 'General Text',     hint: 'Text — milestones, appointment voice' },
];

const PROVIDER_COLORS: Record<Provider, string> = {
  gemini:    '#4285F4',
  deepseek:  '#8B5CF6',
  openai:    '#10A37F',
  anthropic: '#D97706',
  custom:    '#6B7280',
};

const DEFAULT_CHAIN_CFG: AIChainConfig = {
  mood_scan:      [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 12 }],
  symptom_scan:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 10 }],
  vet_chat:       [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 10 }],
  health_records: [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 10 },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 15 },
                   { provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 20 }],
  pet_timeline:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 12 },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 15 }],
  general_vision: [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 8  }],
  general_text:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-1.5-flash', timeoutSecs: 10 }],
};

const PRESET_TIMEOUTS = [3, 5, 8, 10, 12, 15, 20];

export default function AdminAIChainScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [aiChain,      setAiChain]      = useState<AIChainConfig>(DEFAULT_CHAIN_CFG);
  const [savedAiChain, setSavedAiChain] = useState<AIChainConfig>(DEFAULT_CHAIN_CFG);
  const [saving,       setSaving]       = useState(false);
  const [addSlot, setAddSlot] = useState<Record<UseCaseKey, { open: boolean; provider: Provider; model: string; timeout: string }>>(
    Object.fromEntries(USE_CASES.map(u => [u.key, { open: false, provider: 'gemini' as Provider, model: '', timeout: '8' }])) as any,
  );

  const dirty = JSON.stringify(aiChain) !== JSON.stringify(savedAiChain);

  const [toastMsg, setToastMsg] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    toastTimer.current = setTimeout(() => setToastMsg(''), 2400);
  };

  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'ai_chain_config').maybeSingle();
    if (data?.value && typeof data.value === 'object') {
      const v = data.value as Partial<AIChainConfig>;
      const merged: AIChainConfig = { ...DEFAULT_CHAIN_CFG };
      for (const uc of USE_CASES) {
        const slots = v[uc.key];
        if (Array.isArray(slots) && slots.length > 0) merged[uc.key] = slots as ModelSlot[];
      }
      setAiChain(merged);
      setSavedAiChain(merged);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async (next: AIChainConfig) => {
    setAiChain(next);
    setSaving(true);
    try {
      const { error } = await supabase.from('app_settings').upsert(
        { key: 'ai_chain_config', value: next, updated_by: user?.id },
        { onConflict: 'key' },
      );
      if (error) throw error;
      setSavedAiChain(next);
      const totalSlots = Object.values(next).reduce((s, c) => s + c.length, 0);
      showToast(`✓ Saved to DB — ${totalSlots} slots across ${Object.keys(next).length} use cases`);
    } catch (e: any) {
      showToast(`✗ ${e.message ?? 'Could not save'}`);
    }
    setSaving(false);
  };

  const removeSlot = (uc: UseCaseKey, idx: number) => {
    const chain = aiChain[uc];
    if (chain.length <= 1) { showToast('Need at least one slot'); return; }
    save({ ...aiChain, [uc]: chain.filter((_, i) => i !== idx) });
  };

  const moveSlot = (uc: UseCaseKey, idx: number, dir: -1 | 1) => {
    const arr = [...aiChain[uc]];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    save({ ...aiChain, [uc]: arr });
  };

  const commitAddSlot = (uc: UseCaseKey) => {
    const f = addSlot[uc];
    const model = f.model.trim();
    if (!model) return;
    const timeout = parseInt(f.timeout, 10);
    if (isNaN(timeout) || timeout < 1) return;
    const slot: ModelSlot = { provider: f.provider, model, timeoutSecs: timeout };
    save({ ...aiChain, [uc]: [...aiChain[uc], slot] });
    setAddSlot(prev => ({ ...prev, [uc]: { ...prev[uc], open: false, model: '', timeout: '8' } }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'AI Model Chains' }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }}>Fallback Chains</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
              Slot 1 = primary · subsequent slots tried on timeout or failure · changes live in ≤60s
            </Text>
          </View>
          {(dirty || saving) && (
            <TouchableOpacity
              onPress={() => save(aiChain)}
              disabled={saving}
              style={{ marginLeft: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                backgroundColor: saving ? colors.border : colors.primary, opacity: saving ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {USE_CASES.map(uc => {
          const chain = aiChain[uc.key];
          const form  = addSlot[uc.key];
          return (
            <View key={uc.key} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 14 }]}>
              {/* Use-case header */}
              <View style={[s.cardHeader, { borderBottomColor: colors.border }]}>
                <Text style={{ fontSize: 20 }}>{uc.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{uc.label}</Text>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 1 }}>{uc.hint}</Text>
                </View>
              </View>

              {/* Slots */}
              {chain.map((slot, idx) => (
                <View key={idx} style={[s.slotRow, { borderBottomColor: colors.border }]}>
                  {/* Position badge */}
                  <View style={{ width: 24, height: 24, borderRadius: 12,
                    backgroundColor: idx === 0 ? colors.primary : `${colors.primary}55`,
                    alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{idx + 1}</Text>
                  </View>

                  {/* Provider + model + timeout */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
                        backgroundColor: `${PROVIDER_COLORS[slot.provider] ?? '#6B7280'}22` }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4,
                          color: PROVIDER_COLORS[slot.provider] ?? '#6B7280' }}>{slot.provider}</Text>
                      </View>
                      <Text style={{ fontSize: TYPO.body, color: colors.textPrimary, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                        {slot.model}
                      </Text>
                    </View>
                    {/* Timeout row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>⏱</Text>
                      {PRESET_TIMEOUTS.map(t => (
                        <TouchableOpacity key={t} onPress={() => setAiChain(prev => ({
                          ...prev,
                          [uc.key]: prev[uc.key].map((s, i) => i === idx ? { ...s, timeoutSecs: t } : s),
                        }))}
                          style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
                            backgroundColor: slot.timeoutSecs === t ? colors.primary : 'transparent',
                            borderWidth: 1, borderColor: slot.timeoutSecs === t ? colors.primary : colors.border }}>
                          <Text style={{ fontSize: 11, fontWeight: '700',
                            color: slot.timeoutSecs === t ? '#fff' : colors.textSecondary }}>{t}s</Text>
                        </TouchableOpacity>
                      ))}
                      <TextInput
                        value={!PRESET_TIMEOUTS.includes(slot.timeoutSecs) ? String(slot.timeoutSecs) : ''}
                        placeholder="custom"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="numeric"
                        onChangeText={v => {
                          const n = parseInt(v, 10);
                          if (!isNaN(n) && n > 0) setAiChain(prev => ({
                            ...prev,
                            [uc.key]: prev[uc.key].map((s, i) => i === idx ? { ...s, timeoutSecs: n } : s),
                          }));
                        }}
                        style={{ width: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 4,
                          paddingHorizontal: 6, paddingVertical: 2, fontSize: 11, fontWeight: '700',
                          color: colors.textPrimary, backgroundColor: 'transparent' }}
                      />
                      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
                        {idx === 0 ? '· Primary' : `· Fallback ${idx}`}
                      </Text>
                    </View>
                  </View>

                  {/* Controls */}
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    <TouchableOpacity onPress={() => moveSlot(uc.key, idx, -1)} disabled={idx === 0}
                      style={{ padding: 6, opacity: idx === 0 ? 0.25 : 1 }}>
                      <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveSlot(uc.key, idx, 1)} disabled={idx === chain.length - 1}
                      style={{ padding: 6, opacity: idx === chain.length - 1 ? 0.25 : 1 }}>
                      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeSlot(uc.key, idx)} style={{ padding: 6 }}>
                      <Ionicons name="close-circle" size={18} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Add slot form / button */}
              {form.open ? (
                <View style={{ padding: 12, gap: 10 }}>
                  <Text style={s.formLabel}>Provider</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {(['gemini', 'deepseek', 'openai', 'anthropic', 'custom'] as Provider[]).map(p => (
                      <TouchableOpacity key={p}
                        onPress={() => setAddSlot(prev => ({ ...prev, [uc.key]: { ...prev[uc.key], provider: p } }))}
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                          backgroundColor: form.provider === p ? PROVIDER_COLORS[p] : `${PROVIDER_COLORS[p]}22`,
                          borderWidth: 1, borderColor: PROVIDER_COLORS[p] }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'capitalize',
                          color: form.provider === p ? '#fff' : PROVIDER_COLORS[p] }}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.formLabel}>Model name</Text>
                  <TextInput
                    value={form.model}
                    onChangeText={v => setAddSlot(prev => ({ ...prev, [uc.key]: { ...prev[uc.key], model: v } }))}
                    placeholder={
                      form.provider === 'deepseek'  ? 'e.g. deepseek-chat' :
                      form.provider === 'openai'    ? 'e.g. gpt-4o-mini' :
                      form.provider === 'anthropic' ? 'e.g. claude-haiku-4-5' :
                                                      'e.g. gemini-2.5-flash'
                    }
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none" autoCorrect={false}
                    style={{ height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                      backgroundColor: colors.background, color: colors.textPrimary,
                      fontSize: TYPO.body, paddingHorizontal: 12 }}
                  />

                  <Text style={s.formLabel}>Timeout (seconds)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {PRESET_TIMEOUTS.map(t => (
                      <TouchableOpacity key={t}
                        onPress={() => setAddSlot(prev => ({ ...prev, [uc.key]: { ...prev[uc.key], timeout: String(t) } }))}
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                          backgroundColor: form.timeout === String(t) ? colors.primary : 'transparent',
                          borderWidth: 1, borderColor: form.timeout === String(t) ? colors.primary : colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: '700',
                          color: form.timeout === String(t) ? '#fff' : colors.textSecondary }}>{t}s</Text>
                      </TouchableOpacity>
                    ))}
                    <TextInput
                      value={!PRESET_TIMEOUTS.map(String).includes(form.timeout) ? form.timeout : ''}
                      onChangeText={v => setAddSlot(prev => ({ ...prev, [uc.key]: { ...prev[uc.key], timeout: v } }))}
                      placeholder="custom" placeholderTextColor={colors.textSecondary}
                      keyboardType="number-pad" maxLength={3}
                      style={{ width: 64, height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
                        backgroundColor: colors.background, color: colors.textPrimary,
                        fontSize: TYPO.body, textAlign: 'center' }}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      onPress={() => setAddSlot(prev => ({ ...prev, [uc.key]: { ...prev[uc.key], open: false } }))}
                      style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                        alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => commitAddSlot(uc.key)} disabled={!form.model.trim()}
                      style={{ flex: 1, height: 38, borderRadius: 10,
                        backgroundColor: form.model.trim() ? colors.primary : colors.border,
                        alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Add slot</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setAddSlot(prev => ({ ...prev, [uc.key]: { ...prev[uc.key], open: true } }))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={{ fontSize: TYPO.body, color: colors.primary, fontWeight: '600' }}>Add fallback slot</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {toastMsg !== '' && (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', bottom: insets.bottom + 16, alignSelf: 'center',
          opacity: toastOpacity, backgroundColor: '#1C1C1E', borderRadius: 20,
          paddingHorizontal: 20, paddingVertical: 10,
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 }, elevation: 8,
        }}>
          <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '600' }}>{toastMsg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card:       { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  slotRow:    { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 10,
                borderBottomWidth: StyleSheet.hairlineWidth },
  formLabel:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: '#888' },
});
