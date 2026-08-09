/**
 * Admin: Rewards Bulk Upload
 * Two flows:
 *   1. Bulk-add coupon codes to an existing offer (paste or CSV)
 *   2. Bulk-import new partner offers from CSV
 *
 * CSV format for offers:
 *   partner_name,partner_logo,title,description,category,coins_cost,discount_pct,coupon_type,affiliate_url,max_uses_per_user,total_stock,valid_until
 *
 * CSV format for codes (after selecting an offer):
 *   one code per line  OR  comma-separated on one line
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import { TYPO } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OfferSummary {
  id: string;
  partner_name: string;
  title: string;
  coupon_type: string;
  coupon_pool: string[] | null;
  redeemed_count: number;
}

interface ParsedOffer {
  partner_name: string;
  partner_logo: string | null;
  title: string;
  description: string | null;
  category: string;
  coins_cost: number;
  discount_pct: number | null;
  coupon_type: string;
  affiliate_url: string | null;
  max_uses_per_user: number;
  total_stock: number | null;
  valid_until: string | null;
  is_active: boolean;
  is_featured: boolean;
}

type Tab = 'codes' | 'offers';

// ─── CSV parsers ──────────────────────────────────────────────────────────────

function parseCodes(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function parseOffersCsv(raw: string): { rows: ParsedOffer[]; errors: string[] } {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const rows: ParsedOffer[] = [];
  const errors: string[] = [];

  // Skip header row if it starts with "partner_name"
  const start = lines[0]?.toLowerCase().startsWith('partner_name') ? 1 : 0;

  lines.slice(start).forEach((line, i) => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 5) {
      errors.push(`Row ${i + start + 1}: too few columns (${cols.length})`);
      return;
    }
    const [
      partner_name, partner_logo, title, description, category,
      coins_cost_s, discount_pct_s, coupon_type, affiliate_url,
      max_uses_s, total_stock_s, valid_until,
    ] = cols;

    if (!partner_name || !title) {
      errors.push(`Row ${i + start + 1}: partner_name and title are required`);
      return;
    }
    const coins_cost = parseInt(coins_cost_s ?? '0', 10);
    if (isNaN(coins_cost) || coins_cost < 0) {
      errors.push(`Row ${i + start + 1}: invalid coins_cost "${coins_cost_s}"`);
      return;
    }
    rows.push({
      partner_name,
      partner_logo:      partner_logo  || null,
      title,
      description:       description   || null,
      category:          category      || 'food',
      coins_cost,
      discount_pct:      discount_pct_s ? parseInt(discount_pct_s, 10) : null,
      coupon_type:       coupon_type   || 'link',
      affiliate_url:     affiliate_url || null,
      max_uses_per_user: max_uses_s    ? parseInt(max_uses_s, 10) : 1,
      total_stock:       total_stock_s ? parseInt(total_stock_s, 10) : null,
      valid_until:       valid_until   || null,
      is_active:  true,
      is_featured: false,
    });
  });

  return { rows, errors };
}

// ─── Bulk codes tab ───────────────────────────────────────────────────────────

function BulkCodesTab({ colors }: { colors: any }) {
  const [offers, setOffers]         = useState<OfferSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [raw, setRaw]               = useState('');
  const [preview, setPreview]       = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    supabase.from('partner_offers')
      .select('id,partner_name,title,coupon_type,coupon_pool,redeemed_count')
      .eq('coupon_type', 'code')
      .order('partner_name')
      .then(({ data }) => { setOffers((data ?? []) as OfferSummary[]); setLoading(false); });
  }, []);

  useEffect(() => {
    setPreview(parseCodes(raw));
  }, [raw]);

  const selected = offers.find(o => o.id === selectedId);
  const remaining = selected ? (selected.coupon_pool?.length ?? 0) - selected.redeemed_count : 0;

  const upload = async () => {
    if (!selectedId || preview.length === 0) return;
    setSaving(true);
    try {
      const { data: current } = await supabase
        .from('partner_offers')
        .select('coupon_pool')
        .eq('id', selectedId)
        .single();

      const merged = [...(current?.coupon_pool ?? []), ...preview];
      // Deduplicate
      const deduped = [...new Set(merged)];
      const added   = deduped.length - (current?.coupon_pool?.length ?? 0);

      const { error } = await supabase
        .from('partner_offers')
        .update({ coupon_pool: deduped })
        .eq('id', selectedId);

      if (error) throw error;

      Alert.alert('Done', `${added} codes added (${preview.length - added} duplicates skipped). Pool now has ${deduped.length} codes.`);
      setRaw('');
      setSelectedId(null);
      // Refresh list
      const { data } = await supabase.from('partner_offers')
        .select('id,partner_name,title,coupon_type,coupon_pool,redeemed_count')
        .eq('coupon_type', 'code').order('partner_name');
      setOffers((data ?? []) as OfferSummary[]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color="#7C5CBF" style={{ marginTop: 40 }} />;

  return (
    <View style={{ flex: 1 }}>
      {/* Offer selector */}
      <Text style={[b.sectionLabel, { color: colors.textSecondary }]}>SELECT OFFER</Text>
      {offers.length === 0 ? (
        <View style={[b.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
            No code-pool offers yet.{'\n'}Create one in Partner Offers first.
          </Text>
          <TouchableOpacity onPress={() => router.push('/admin/rewards-offers')}
            style={[b.pill, { backgroundColor: '#7C5CBF', marginTop: 12 }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Go to Partner Offers</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {offers.map(o => (
            <TouchableOpacity key={o.id}
              onPress={() => setSelectedId(prev => prev === o.id ? null : o.id)}
              style={[b.offerChip, {
                backgroundColor: selectedId === o.id ? '#7C5CBF' : colors.card,
                borderColor: selectedId === o.id ? '#7C5CBF' : colors.border,
              }]}>
              <Text style={{ color: selectedId === o.id ? '#fff' : colors.textPrimary, fontWeight: '700', fontSize: TYPO.caption }}>
                {o.partner_name}
              </Text>
              <Text style={{ color: selectedId === o.id ? '#ffffffaa' : colors.textSecondary, fontSize: TYPO.label }} numberOfLines={1}>
                {o.title}
              </Text>
              <Text style={{ color: selectedId === o.id ? '#ffffffcc' : colors.textTertiary, fontSize: TYPO.label }}>
                {(o.coupon_pool?.length ?? 0)} codes · {o.redeemed_count} used
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {selectedId && (
        <>
          <View style={[b.infoBox, { backgroundColor: '#7C5CBF18', borderColor: '#7C5CBF44' }]}>
            <Ionicons name="information-circle-outline" size={16} color="#7C5CBF" />
            <Text style={{ color: '#7C5CBF', flex: 1, fontSize: TYPO.caption }}>
              <Text style={{ fontWeight: '700' }}>{selected?.title}</Text>
              {' '}— {remaining} codes available. Paste new codes below.
            </Text>
          </View>

          {/* Paste area */}
          <Text style={[b.sectionLabel, { color: colors.textSecondary }]}>PASTE CODES</Text>
          <Text style={{ color: colors.textTertiary, fontSize: TYPO.caption, marginBottom: 8 }}>
            One per line, comma-separated, or both. Duplicates are automatically removed.
          </Text>
          <TextInput
            style={[b.textarea, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
            value={raw}
            onChangeText={setRaw}
            placeholder={'SAVE10-A1B2\nSAVE10-C3D4\nSAVE10-E5F6'}
            placeholderTextColor={colors.textTertiary}
            multiline
            autoCapitalize="characters"
            autoCorrect={false}
          />

          {preview.length > 0 && (
            <View style={[b.previewBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.textSecondary, fontSize: TYPO.caption, marginBottom: 6, fontWeight: '700' }}>
                PREVIEW — {preview.length} codes detected
              </Text>
              {preview.slice(0, 8).map((c, i) => (
                <Text key={i} style={{ color: colors.textPrimary, fontSize: TYPO.caption,
                  fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' }}>
                  {c}
                </Text>
              ))}
              {preview.length > 8 && (
                <Text style={{ color: colors.textSecondary, fontSize: TYPO.caption, marginTop: 4 }}>
                  + {preview.length - 8} more…
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity
            onPress={upload}
            disabled={saving || preview.length === 0}
            style={[b.uploadBtn, { backgroundColor: preview.length > 0 ? '#7C5CBF' : colors.border }]}>
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={[b.uploadBtnText, { color: preview.length > 0 ? '#fff' : colors.textSecondary }]}>
                  Upload {preview.length > 0 ? `${preview.length} codes` : 'codes'}
                </Text>
            }
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ─── Bulk offers tab ──────────────────────────────────────────────────────────

const CSV_TEMPLATE =
`partner_name,partner_logo,title,description,category,coins_cost,discount_pct,coupon_type,affiliate_url,max_uses_per_user,total_stock,valid_until
Amazon,🛒,10% off dog food,Valid on any Royal Canin bag,food,300,10,link,https://amzn.to/example,1,,2025-12-31
Chewy,🐾,Free shipping on first order,New customers only,food,200,,link,https://chewy.com/ref,1,,
PetSmart,🏪,$5 off grooming,In-store only,grooming,150,,code,,,50,2025-09-30`;

function BulkOffersTab({ colors }: { colors: any }) {
  const [raw, setRaw]             = useState('');
  const [parsed, setParsed]       = useState<ParsedOffer[]>([]);
  const [parseErrors, setErrors]  = useState<string[]>([]);
  const [saving, setSaving]       = useState(false);
  const [result, setResult]       = useState<{ inserted: number; failed: number } | null>(null);

  const parse = useCallback(() => {
    if (!raw.trim()) { setParsed([]); setErrors([]); return; }
    const { rows, errors } = parseOffersCsv(raw);
    setParsed(rows);
    setErrors(errors);
  }, [raw]);

  useEffect(() => { parse(); }, [parse]);

  const upload = async () => {
    if (parsed.length === 0) return;
    setSaving(true);
    setResult(null);
    let inserted = 0, failed = 0;
    for (const offer of parsed) {
      const { error } = await supabase.from('partner_offers').insert(offer);
      if (error) { failed++; } else { inserted++; }
    }
    setSaving(false);
    setResult({ inserted, failed });
    if (inserted > 0) {
      setRaw('');
      Alert.alert('Done', `${inserted} offer${inserted !== 1 ? 's' : ''} created${failed > 0 ? `, ${failed} failed` : ''}.`);
    } else {
      Alert.alert('Failed', `All ${failed} rows failed to insert. Check for duplicate titles or invalid data.`);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Template */}
      <View style={[b.templateBox, { backgroundColor: '#7C5CBF18', borderColor: '#7C5CBF33' }]}>
        <Text style={{ color: '#7C5CBF', fontWeight: '700', fontSize: TYPO.caption, marginBottom: 6 }}>
          📋 CSV format
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text style={{ color: '#7C5CBF', fontSize: TYPO.label,
            fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', lineHeight: 18 }}>
            {CSV_TEMPLATE}
          </Text>
        </ScrollView>
        <TouchableOpacity
          onPress={() => setRaw(CSV_TEMPLATE)}
          style={[b.pill, { backgroundColor: '#7C5CBF33', marginTop: 8, alignSelf: 'flex-start' }]}>
          <Text style={{ color: '#7C5CBF', fontWeight: '700', fontSize: TYPO.caption }}>Load template</Text>
        </TouchableOpacity>
      </View>

      {/* Paste area */}
      <Text style={[b.sectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>PASTE CSV</Text>
      <TextInput
        style={[b.textarea, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary, height: 160 }]}
        value={raw}
        onChangeText={setRaw}
        placeholder="Paste CSV rows here…"
        placeholderTextColor={colors.textTertiary}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <View style={[b.errorBox, { borderColor: '#EF4444' }]}>
          <Text style={{ color: '#EF4444', fontWeight: '700', marginBottom: 4 }}>
            ⚠️ {parseErrors.length} parse error{parseErrors.length !== 1 ? 's' : ''}
          </Text>
          {parseErrors.map((e, i) => (
            <Text key={i} style={{ color: '#EF4444', fontSize: TYPO.caption }}>{e}</Text>
          ))}
        </View>
      )}

      {/* Preview table */}
      {parsed.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={[b.sectionLabel, { color: colors.textSecondary }]}>
            PREVIEW — {parsed.length} row{parsed.length !== 1 ? 's' : ''} ready
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              {/* Header */}
              <View style={[b.tableRow, { backgroundColor: colors.card }]}>
                {['Partner', 'Title', 'Category', 'Coins', 'Type'].map(h => (
                  <Text key={h} style={[b.th, { color: colors.textSecondary }]}>{h}</Text>
                ))}
              </View>
              {parsed.map((r, i) => (
                <View key={i} style={[b.tableRow, { backgroundColor: i % 2 === 0 ? colors.background : colors.card }]}>
                  <Text style={[b.td, { color: colors.textPrimary }]} numberOfLines={1}>{r.partner_name}</Text>
                  <Text style={[b.td, { color: colors.textPrimary }]} numberOfLines={1}>{r.title}</Text>
                  <Text style={[b.td, { color: colors.textSecondary }]}>{r.category}</Text>
                  <Text style={[b.td, { color: '#C8860A' }]}>🪙{r.coins_cost}</Text>
                  <Text style={[b.td, { color: colors.textSecondary }]}>{r.coupon_type}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {result && (
        <View style={[b.resultBox, { backgroundColor: result.failed === 0 ? '#D1FAE5' : '#FEF3C7', borderColor: result.failed === 0 ? '#22C55E' : '#F59E0B' }]}>
          <Text style={{ fontWeight: '700', color: result.failed === 0 ? '#15803D' : '#92400E' }}>
            {result.inserted} inserted · {result.failed} failed
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={upload}
        disabled={saving || parsed.length === 0 || parseErrors.length > 0}
        style={[b.uploadBtn, { backgroundColor: (parsed.length > 0 && parseErrors.length === 0) ? '#7C5CBF' : colors.border, marginTop: 16 }]}>
        {saving
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={[b.uploadBtnText, { color: (parsed.length > 0 && parseErrors.length === 0) ? '#fff' : colors.textSecondary }]}>
              Import {parsed.length > 0 ? `${parsed.length} offers` : 'offers'}
            </Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RewardsBulkUploadScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('codes');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Bulk Upload' }} />

      {/* Tab toggle */}
      <View style={[b.tabRow, { borderBottomColor: colors.border }]}>
        {([
          { key: 'codes',  label: '🔑 Coupon Codes' },
          { key: 'offers', label: '📦 Partner Offers' },
        ] as { key: Tab; label: string }[]).map(t => (
          <TouchableOpacity key={t.key}
            style={[b.tabBtn, tab === t.key && { borderBottomColor: '#7C5CBF', borderBottomWidth: 2 }]}
            onPress={() => setTab(t.key)} activeOpacity={0.7}>
            <Text style={[b.tabLabel, { color: tab === t.key ? '#7C5CBF' : colors.textSecondary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled">
        {tab === 'codes' ? <BulkCodesTab colors={colors} /> : <BulkOffersTab colors={colors} />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const b = StyleSheet.create({
  tabRow:       { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:       { flex: 1, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel:     { fontSize: TYPO.body, fontWeight: '700' },
  sectionLabel: { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  offerChip:    { borderRadius: 12, borderWidth: 1, padding: 10, minWidth: 120, maxWidth: 180, gap: 3 },
  infoBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginVertical: 12 },
  textarea:     { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: TYPO.caption, minHeight: 120,
                  fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                  textAlignVertical: 'top', marginBottom: 10 },
  previewBox:   { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12, gap: 3 },
  uploadBtn:    { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  uploadBtnText:{ fontSize: TYPO.subheading, fontWeight: '700' },
  pill:         { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  emptyBox:     { borderRadius: 12, borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 16 },
  templateBox:  { borderRadius: 12, borderWidth: 1, padding: 12 },
  errorBox:     { borderRadius: 10, borderWidth: 1, borderColor: '#EF4444', backgroundColor: '#FEF2F2', padding: 10, marginBottom: 10 },
  tableRow:     { flexDirection: 'row' },
  th:           { width: 110, fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.5, padding: 6 },
  td:           { width: 110, fontSize: TYPO.caption, padding: 6 },
  resultBox:    { borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 8 },
});
