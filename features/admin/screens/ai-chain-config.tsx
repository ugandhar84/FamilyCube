// Admin AI Chain Config screen — view/edit the per-use-case AI fallback
// chain (provider -> model -> timeout, tried in order until one succeeds)
// [live-requested: "we should be able to configure ai chain for each ai
// edge function, same control should be in the admin similar to
// pawbond"]. Backed by app_settings.ai_chain_config, read by every
// AI-calling edge function via _shared/getChainConfig.ts.
//
// Note: ask_cube_chat / flyer_parse / grocery_receipt_parse are listed
// here (their current hardcoded behavior is documented as DEFAULTS in
// getChainConfig.ts) but are NOT yet wired to actually read this config
// at runtime — see that file's own UseCaseKey comment. Editing those
// three here has no live effect until each function is rerouted through
// getChainConfig()/runChain(), which is separate follow-up work. The
// other 7 use cases (mood_scan, symptom_scan, vet_chat, health_records,
// pet_timeline, general_vision, general_text) ARE live today.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { getAiChainConfig, setAiChainConfig, type AiChainConfigValue, type ModelSlot } from '@/lib/db/admin';
import { showAlert } from '@/components/AppAlert';

const USE_CASE_LABEL: Record<string, string> = {
  mood_scan: 'Mood Scan', symptom_scan: 'Symptom Scan', vet_chat: 'Vet Chat',
  health_records: 'Health Records', pet_timeline: 'Pet Timeline',
  general_vision: 'General Vision', general_text: 'General Text',
  ask_cube_chat: 'Ask Fam Chat (not yet live-wired)',
  flyer_parse: 'Flyer Parse (not yet live-wired)',
  grocery_receipt_parse: 'Grocery Receipt Parse (not yet live-wired)',
};

const USE_CASE_ORDER = [
  'mood_scan', 'symptom_scan', 'vet_chat', 'health_records', 'pet_timeline',
  'general_vision', 'general_text', 'ask_cube_chat', 'flyer_parse', 'grocery_receipt_parse',
];

const PROVIDERS = ['gemini', 'deepseek', 'anthropic'];

function newSlot(): ModelSlot {
  return { provider: 'gemini', model: 'gemini-2.5-flash', timeoutSecs: 10 };
}

// Mirrors _shared/getChainConfig.ts's own DEFAULTS exactly — the admin
// screen must show the chain that's ACTUALLY in effect (DB override if
// present, else this hardcoded default), not an empty chain for any use
// case the DB row hasn't been touched for yet.
const RUNTIME_DEFAULTS: AiChainConfigValue = {
  mood_scan:      [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 12 }],
  symptom_scan:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 10 }],
  vet_chat:       [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 10 }],
  health_records: [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 10 },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 15 },
                   { provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 20 }],
  pet_timeline:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 12 },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 15 }],
  general_vision: [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  }],
  general_text:   [{ provider: 'deepseek', model: 'deepseek-chat',    timeoutSecs: 5  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 8  },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 10 }],
  ask_cube_chat:  [{ provider: 'anthropic', model: 'claude-haiku-4-5-20251001', timeoutSecs: 20 },
                   { provider: 'gemini',    model: 'gemini-2.5-flash',          timeoutSecs: 20 },
                   { provider: 'deepseek',  model: 'deepseek-chat',             timeoutSecs: 20 }],
  flyer_parse:    [{ provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 35 },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 35 },
                   { provider: 'gemini',   model: 'gemini-2.5-flash', timeoutSecs: 35 }],
  grocery_receipt_parse: [{ provider: 'gemini', model: 'gemini-2.5-flash', timeoutSecs: 30 }],
};

export default function AiChainConfigScreen() {
  const { colors } = useTheme();
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const [config, setConfig] = useState<AiChainConfigValue | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const dbValue = await getAiChainConfig();
      // Merge over defaults so every use case shows its actually-effective
      // chain, matching getChainConfig.ts's own per-key merge behavior —
      // an admin who's never touched a given key sees its real default,
      // not an empty list.
      const merged: AiChainConfigValue = { ...RUNTIME_DEFAULTS };
      for (const key of Object.keys(dbValue)) {
        if (Array.isArray(dbValue[key]) && dbValue[key].length > 0) merged[key] = dbValue[key];
      }
      setConfig(merged);
    } catch (e: any) {
      showAlert("Couldn't load AI chain config", e?.message ?? 'Something went wrong.');
      setConfig({ ...RUNTIME_DEFAULTS });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateChain = (key: string, chain: ModelSlot[]) => {
    setConfig(prev => ({ ...(prev ?? {}), [key]: chain }));
  };

  const onSave = async (key: string) => {
    if (!config) return;
    setSaving(key);
    try {
      await setAiChainConfig(config, activeMemberId ?? null);
      showAlert('Saved', `${USE_CASE_LABEL[key] ?? key}'s fallback chain is updated.`);
    } catch (e: any) {
      showAlert("Couldn't save", e?.message ?? 'Something went wrong.');
    } finally {
      setSaving(null);
    }
  };

  if (config === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {USE_CASE_ORDER.map(key => {
          const chain = config[key] ?? [];
          const isOpen = expanded === key;
          return (
            <View key={key} style={{
              borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border,
              backgroundColor: colors.card, marginBottom: 10, overflow: 'hidden',
            }}>
              <TouchableOpacity
                onPress={() => setExpanded(isOpen ? null : key)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 }}
              >
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
                  {USE_CASE_LABEL[key] ?? key}
                </Text>
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>{chain.length} slot{chain.length === 1 ? '' : 's'}</Text>
              </TouchableOpacity>

              {isOpen && (
                <View style={{ padding: 14, paddingTop: 0, gap: 10 }}>
                  {chain.map((slot, idx) => (
                    <View key={idx} style={{
                      borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm,
                      padding: 10, gap: 8, backgroundColor: colors.background,
                    }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {PROVIDERS.map(p => {
                          const active = slot.provider === p;
                          return (
                            <TouchableOpacity
                              key={p}
                              onPress={() => {
                                const next = chain.slice();
                                next[idx] = { ...slot, provider: p };
                                updateChain(key, next);
                              }}
                              style={{
                                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99,
                                borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                                backgroundColor: active ? colors.primary + '18' : 'transparent',
                              }}
                            >
                              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: active ? colors.primary : colors.textSecondary }}>{p}</Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          onPress={() => updateChain(key, chain.filter((_, i) => i !== idx))}
                          style={{ marginLeft: 'auto', padding: 6 }}
                        >
                          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.danger }}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          value={slot.model}
                          onChangeText={t => {
                            const next = chain.slice();
                            next[idx] = { ...slot, model: t };
                            updateChain(key, next);
                          }}
                          placeholder="model name"
                          placeholderTextColor={colors.textTertiary}
                          style={{
                            flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm,
                            paddingHorizontal: 10, paddingVertical: 7, color: colors.textPrimary, fontSize: TYPO.caption,
                          }}
                        />
                        <TextInput
                          value={String(slot.timeoutSecs)}
                          onChangeText={t => {
                            const n = parseInt(t, 10);
                            const next = chain.slice();
                            next[idx] = { ...slot, timeoutSecs: Number.isFinite(n) ? n : 0 };
                            updateChain(key, next);
                          }}
                          keyboardType="number-pad"
                          placeholder="secs"
                          placeholderTextColor={colors.textTertiary}
                          style={{
                            width: 60, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm,
                            paddingHorizontal: 10, paddingVertical: 7, color: colors.textPrimary, fontSize: TYPO.caption,
                          }}
                        />
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity
                    onPress={() => updateChain(key, [...chain, newSlot()])}
                    style={{ borderRadius: RADIUS.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, padding: 10, alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.primary }}>+ Add slot</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => onSave(key)}
                    disabled={saving === key}
                    style={{ backgroundColor: colors.primary, borderRadius: RADIUS.sm, padding: 11, alignItems: 'center' }}
                  >
                    {saving === key ? <ActivityIndicator size="small" color="#fff" /> : (
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
