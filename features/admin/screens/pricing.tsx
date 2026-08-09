import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { getAppSettings, setAppSetting } from '@/lib/db/appSettings';
import { fmtBytes } from '@/lib/storageGuard';
import { DEFAULT_PLAN_FEATURES, type PlanFeature } from '@/lib/planFeatures';
import { DEFAULT_PAYWALL_COPY, type PaywallCopy, invalidatePaywallCopyCache } from '@/lib/hooks/usePaywallCopy';
import { invalidatePlanFeaturesCache } from '@/lib/hooks/usePlanFeatures';
import { TYPO } from '@/constants/theme';

const STORAGE_KEYS = [
  'storage_cap_free_bytes',
  'storage_cap_pro_bytes',
  'storage_cap_ultimate_bytes',
];

function mbToBytes(mb: string): number { return Math.round(parseFloat(mb) * 1024 * 1024); }
function bytesToMb(b: string): string  { return (Number(b) / (1024 * 1024)).toFixed(0); }

function approxPhotos(mb: string): string {
  const n = parseFloat(mb);
  if (!n) return '';
  const photos = Math.round(n / 2);
  return photos >= 1000 ? `~${(photos / 1000).toFixed(1)}k photos` : `~${photos} photos`;
}

// ── Storage row ───────────────────────────────────────────────────────────────

function StorageRow({
  label, color, storeKey, vals, unlimited, set, setUnlimited, colors,
}: {
  label: string; color: string; storeKey: string;
  vals: Record<string, string>;
  unlimited: boolean;
  set: (k: string, v: string) => void;
  setUnlimited: (k: string, v: boolean) => void;
  colors: any;
}) {
  const mb = vals[storeKey] ?? '';
  const readableHint = !unlimited && mb ? `= ${fmtBytes(mbToBytes(mb))}  ·  ${approxPhotos(mb)}` : '';

  return (
    <View style={[a.storageRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={a.storageTop}>
        <View style={[a.badge, { backgroundColor: color + '18' }]}>
          <Text style={[a.badgeText, { color }]}>{label}</Text>
        </View>
        <View style={a.unlimitedToggle}>
          <Text style={[a.toggleLabel, { color: unlimited ? color : colors.textSecondary }]}>
            {unlimited ? 'Unlimited ∞' : 'Set limit'}
          </Text>
          <Switch
            value={unlimited}
            onValueChange={v => setUnlimited(storeKey, v)}
            trackColor={{ false: colors.border, true: color + '66' }}
            thumbColor={unlimited ? color : colors.textSecondary}
          />
        </View>
      </View>

      {unlimited ? (
        <View style={[a.unlimitedBadge, { backgroundColor: color + '12', borderColor: color + '30' }]}>
          <Ionicons name="infinite-outline" size={16} color={color} />
          <Text style={[a.unlimitedText, { color }]}>No storage cap — users on this plan can upload without limit</Text>
        </View>
      ) : (
        <>
          <View style={[a.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder ?? colors.border }]}>
            <TextInput
              style={[a.input, { color: colors.textPrimary }]}
              value={mb}
              onChangeText={v => set(storeKey, v)}
              keyboardType="decimal-pad"
              placeholder="e.g. 500"
              placeholderTextColor={colors.placeholder}
            />
            <Text style={[a.unit, { color: colors.textSecondary }]}>MB</Text>
          </View>
          {readableHint ? (
            <Text style={[a.hint, { color: colors.textSecondary ?? colors.textSecondary }]}>{readableHint}</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminPricingScreen() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);
  const [showGoTop, setShowGoTop] = useState(false);
  const [vals,          setVals]         = useState<Record<string, string>>({});
  const [unlimited,     setUnlimitedMap] = useState<Record<string, boolean>>({});
  const [planFeatures,  setPlanFeatures] = useState<Record<string, PlanFeature[]>>(DEFAULT_PLAN_FEATURES);
  const [paywallCopy,   setPaywallCopy]  = useState<PaywallCopy>(DEFAULT_PAYWALL_COPY);
  const [loading,       setLoading]      = useState(true);
  const [saving,        setSaving]       = useState(false);

  useEffect(() => {
    getAppSettings([...STORAGE_KEYS, 'plan_features', 'paywall_copy']).then(settings => {
      const parsed: Record<string, string>  = {};
      const unlim:  Record<string, boolean> = {};
      for (const k of STORAGE_KEYS) {
        const raw = settings[k] != null ? Number(settings[k]) : null;
        if (raw === 0) {
          // 0 stored = unlimited
          unlim[k]  = true;
          parsed[k] = '';
        } else {
          unlim[k]  = false;
          parsed[k] = raw != null ? bytesToMb(String(raw)) : '';
        }
      }
      setVals(parsed);
      setUnlimitedMap(unlim);
      if (settings['plan_features']) {
        try {
          const pf = typeof settings['plan_features'] === 'string'
            ? JSON.parse(settings['plan_features'])
            : settings['plan_features'];
          setPlanFeatures({ ...DEFAULT_PLAN_FEATURES, ...pf });
        } catch { /* keep defaults */ }
      }
      if (settings['paywall_copy']) {
        try {
          const pc = typeof settings['paywall_copy'] === 'string'
            ? JSON.parse(settings['paywall_copy'])
            : settings['paywall_copy'];
          setPaywallCopy({ ...DEFAULT_PAYWALL_COPY, ...pc });
        } catch { /* keep defaults */ }
      }
      setLoading(false);
    });
  }, []);

  const set         = (key: string, val: string)  => setVals(prev => ({ ...prev, [key]: val }));
  const setUnlimited = (key: string, val: boolean) => setUnlimitedMap(prev => ({ ...prev, [key]: val }));

  const toggleFeatureIncluded = (plan: string, idx: number) =>
    setPlanFeatures(prev => ({
      ...prev,
      [plan]: prev[plan].map((f, i) => i === idx ? { ...f, included: !f.included } : f),
    }));

  const updateFeatureText = (plan: string, idx: number, text: string) =>
    setPlanFeatures(prev => ({
      ...prev,
      [plan]: prev[plan].map((f, i) => i === idx ? { ...f, text } : f),
    }));

  const addFeature = (plan: string) =>
    setPlanFeatures(prev => ({
      ...prev,
      [plan]: [...prev[plan], { text: '', included: true }],
    }));

  const removeFeature = (plan: string, idx: number) =>
    setPlanFeatures(prev => ({
      ...prev,
      [plan]: prev[plan].filter((_, i) => i !== idx),
    }));

  const handleSave = async () => {
    if (!user?.id) return;

    for (const k of STORAGE_KEYS) {
      if (!unlimited[k]) {
        const n = parseFloat(vals[k]);
        if (isNaN(n) || n <= 0) {
          showAlert('Invalid storage', `Enter a valid MB value for ${k.replace(/_/g, ' ')}, or enable Unlimited.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      await Promise.all([
        ...STORAGE_KEYS.map(k =>
          setAppSetting(k, unlimited[k] ? '0' : String(mbToBytes(vals[k])), user.id)
        ),
        setAppSetting('plan_features', planFeatures, user.id),
        setAppSetting('paywall_copy', paywallCopy, user.id),
      ]);
      invalidatePaywallCopyCache();
      invalidatePlanFeaturesCache();
      showAlert('Saved ✓', 'Changes take effect immediately for new sessions.');
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Paywall & Storage' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}
          onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={16}>

          {/* ── Storage limits ── */}
          <Text style={[a.sectionTitle, { color: colors.textPrimary, marginTop: 8 }]}>Storage limits</Text>
          <Text style={[a.sectionDesc, { color: colors.textSecondary }]}>
            Per-user limit for pet photos + social post media combined. Toggle "Unlimited" to remove the cap for a tier.
            At ~2 MB per photo, 1 GB holds about 500 photos.
          </Text>

          <StorageRow label="Free" color="#64748B"
            storeKey="storage_cap_free_bytes"
            vals={vals} unlimited={!!unlimited['storage_cap_free_bytes']}
            set={set} setUnlimited={setUnlimited} colors={colors} />
          <StorageRow label="Pro" color="#1D9E75"
            storeKey="storage_cap_pro_bytes"
            vals={vals} unlimited={!!unlimited['storage_cap_pro_bytes']}
            set={set} setUnlimited={setUnlimited} colors={colors} />
          <StorageRow label="Ultimate" color="#7B2FBE"
            storeKey="storage_cap_ultimate_bytes"
            vals={vals} unlimited={!!unlimited['storage_cap_ultimate_bytes']}
            set={set} setUnlimited={setUnlimited} colors={colors} />

          {/* ── Plan features (paywall perks bullets) ── */}
          <Text style={[a.sectionTitle, { color: colors.textPrimary, marginTop: 8 }]}>Paywall feature bullets</Text>
          <Text style={[a.sectionDesc, { color: colors.textSecondary }]}>
            These bullet points appear in the upgrade sheet when no specific perks are passed. Toggle ✓/✕ to show or hide. Tap ✕ to remove a row.
          </Text>

          {([
            { key: 'pro',     label: 'Pro',    color: '#1D9E75' },
            { key: 'ultimate', label: 'Ultimate', color: '#7B2FBE' },
          ] as const).map(({ key, label, color }) => (
            <View key={key} style={[a.featureCard, { backgroundColor: colors.card, borderColor: color + '44' }]}>
              <View style={[a.featureCardHeader, { borderBottomColor: colors.border }]}>
                <View style={[a.badge, { backgroundColor: color + '18' }]}>
                  <Text style={[a.badgeText, { color }]}>{label}</Text>
                </View>
                <TouchableOpacity onPress={() => addFeature(key)}
                  style={[a.addBtn, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                  <Ionicons name="add" size={16} color={color} />
                  <Text style={[a.addBtnTxt, { color }]}>Add row</Text>
                </TouchableOpacity>
              </View>
              {(planFeatures[key] ?? []).map((f, idx) => (
                <View key={idx} style={[a.featureRow, { borderBottomColor: colors.border }]}>
                  <TouchableOpacity onPress={() => toggleFeatureIncluded(key, idx)} style={a.featureToggle}>
                    <Ionicons
                      name={f.included ? 'checkmark-circle' : 'close-circle'}
                      size={22}
                      color={f.included ? '#4ADE80' : colors.textTertiary}
                    />
                  </TouchableOpacity>
                  <TextInput
                    style={[a.featureInput, { color: colors.textPrimary }]}
                    value={f.text}
                    onChangeText={t => updateFeatureText(key, idx, t)}
                    placeholder="Feature description"
                    placeholderTextColor={colors.placeholder}
                  />
                  <TouchableOpacity onPress={() => removeFeature(key, idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))}

          {/* ── Paywall copy ── */}
          <Text style={[a.sectionTitle, { color: colors.textPrimary, marginTop: 8 }]}>Paywall sheet copy</Text>
          <Text style={[a.sectionDesc, { color: colors.textSecondary }]}>
            Edit every text string shown in the upgrade sheet. Changes take effect immediately — no release needed.
          </Text>

          {([
            { field: 'trial_subtitle'      as keyof PaywallCopy, label: 'Sheet subtitle',        hint: 'Shown below the sheet title' },
            { field: 'anchor_text'         as keyof PaywallCopy, label: 'Anchor banner text',     hint: 'The hook sentence below the headline' },
            { field: 'annual_save_label'   as keyof PaywallCopy, label: 'Annual toggle label',    hint: 'Left option in the billing toggle' },
            { field: 'pro_feature_note'    as keyof PaywallCopy, label: 'Pro card feature note',  hint: 'Small line under the Pro price' },
            { field: 'ultimate_feature_note' as keyof PaywallCopy, label: 'Ultimate card note',       hint: 'Small line under the Ultimate price' },
            { field: 'trial_cta_text'      as keyof PaywallCopy, label: 'CTA button text',        hint: 'Primary purple button label' },
            { field: 'micro_copy'          as keyof PaywallCopy, label: 'Micro copy',             hint: 'Fine print below the restore link' },
          ] as const).map(({ field, label, hint }) => (
            <View key={field} style={[a.copyRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[a.copyLabel, { color: colors.textPrimary }]}>{label}</Text>
              <Text style={[a.copyHint, { color: colors.textSecondary }]}>{hint}</Text>
              <TextInput
                style={[a.copyInput, { color: colors.textPrimary, backgroundColor: colors.inputBg ?? colors.background, borderColor: colors.inputBorder ?? colors.border }]}
                value={paywallCopy[field] as string}
                onChangeText={v => setPaywallCopy(prev => ({ ...prev, [field]: v }))}
                multiline
                placeholder={DEFAULT_PAYWALL_COPY[field] as string}
                placeholderTextColor={colors.placeholder}
              />
            </View>
          ))}

        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[a.fabWrap, { paddingBottom: 24 }]}>
        <TouchableOpacity onPress={handleSave} disabled={saving}
          style={[a.fab, { backgroundColor: '#7B2FBE', opacity: saving ? 0.7 : 1 }]}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={a.fabText}>Save changes</Text>
              </>
          }
        </TouchableOpacity>
      </View>
      {showGoTop && (
        <TouchableOpacity
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const a = StyleSheet.create({
  sectionTitle:   { fontSize: TYPO.subheading, fontWeight: '800', marginBottom: 4, marginTop: 4 },
  sectionDesc:    { fontSize: TYPO.body, lineHeight: 18, marginBottom: 14, opacity: 0.75 },

  badge:          { flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeText:      { fontSize: TYPO.body, fontWeight: '800' },

  inputRow:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1,
                    borderRadius: 12, paddingHorizontal: 12, height: 46, gap: 6 },
  unit:           { fontSize: TYPO.body, fontWeight: '600' },
  input:          { flex: 1, fontSize: TYPO.heading, fontWeight: '700' },

  storageRow:     { borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1 },
  storageTop:     { flexDirection: 'row', alignItems: 'center',
                    justifyContent: 'space-between', marginBottom: 10 },
  unlimitedToggle:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel:    { fontSize: TYPO.body, fontWeight: '600' },
  unlimitedBadge: { flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                    padding: 12, borderRadius: 12, borderWidth: 1 },
  unlimitedText:  { fontSize: TYPO.body, flex: 1, lineHeight: 18, fontWeight: '500' },
  hint:           { fontSize: TYPO.body, marginTop: 6, marginLeft: 2 },


  fabWrap:        { position: 'absolute', bottom: 0, left: 0, right: 0,
                    paddingHorizontal: 20, paddingTop: 12 },
  fab:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 10, height: 56, borderRadius: 28,
                    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14,
                    shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  fabText:        { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' },

  copyRow:    { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10 },
  copyLabel:  { fontSize: TYPO.body, fontWeight: '700', marginBottom: 2 },
  copyHint:   { fontSize: TYPO.body, marginBottom: 8, opacity: 0.7 },
  copyInput:  { fontSize: TYPO.body, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, lineHeight: 18 },

  featureCard:       { borderRadius: 18, marginBottom: 16, borderWidth: 1.5, overflow: 'hidden' },
  featureCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                       paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  featureRow:        { flexDirection: 'row', alignItems: 'center', gap: 10,
                       paddingHorizontal: 14, paddingVertical: 10,
                       borderBottomWidth: StyleSheet.hairlineWidth },
  featureToggle:     { padding: 2 },
  featureInput:      { flex: 1, fontSize: TYPO.body, fontWeight: '500' },
  addBtn:            { flexDirection: 'row', alignItems: 'center', gap: 4,
                       paddingHorizontal: 10, paddingVertical: 5,
                       borderRadius: 20, borderWidth: 1 },
  addBtnTxt:         { fontSize: TYPO.body, fontWeight: '700' },
});
