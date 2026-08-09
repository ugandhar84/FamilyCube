/**
 * Admin: Rewards Offers
 * Manage partner coupon offers — create, edit, toggle active, load coupon codes.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Switch, Alert, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import { TYPO } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Offer {
  id: string;
  partner_name: string;
  partner_logo: string | null;
  title: string;
  description: string | null;
  category: string;
  coins_cost: number;
  discount_pct: number | null;
  coupon_type: 'code' | 'link' | 'qr';
  affiliate_url: string | null;
  coupon_pool: string[] | null;
  max_uses_per_user: number;
  total_stock: number | null;
  redeemed_count: number;
  valid_until: string | null;
  is_active: boolean;
  is_featured: boolean;
}

const BLANK_OFFER: Omit<Offer, 'id' | 'redeemed_count'> = {
  partner_name: '',
  partner_logo: '',
  title: '',
  description: '',
  category: 'food',
  coins_cost: 300,
  discount_pct: null,
  coupon_type: 'link',
  affiliate_url: '',
  coupon_pool: null,
  max_uses_per_user: 1,
  total_stock: null,
  valid_until: null,
  is_active: true,
  is_featured: false,
};

const CATEGORIES = ['food', 'accessories', 'grooming', 'vet', 'toys'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function LabeledInput({ label, value, onChangeText, placeholder, keyboardType, multiline, colors }: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[f.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[f.input, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border, textAlignVertical: multiline ? 'top' : 'center', height: multiline ? 80 : 44 }]}
        value={value ?? ''}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        autoCapitalize="none"
      />
    </View>
  );
}

// ─── Offer form sheet ─────────────────────────────────────────────────────────

function OfferFormModal({ offer, visible, onClose, onSave, colors }: {
  offer: Partial<Offer> | null;
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  colors: any;
}) {
  const isNew = !offer?.id;
  const [form, setForm] = useState<any>(offer ?? BLANK_OFFER);
  const [saving, setSaving] = useState(false);
  const [codeInput, setCodeInput] = useState('');

  useEffect(() => { setForm(offer ?? { ...BLANK_OFFER }); setCodeInput(''); }, [offer]);

  const set = (key: string, val: any) => setForm((p: any) => ({ ...p, [key]: val }));

  const addCodes = () => {
    const codes = codeInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!codes.length) return;
    set('coupon_pool', [...(form.coupon_pool ?? []), ...codes]);
    setCodeInput('');
  };

  const save = async () => {
    if (!form.partner_name.trim() || !form.title.trim()) {
      Alert.alert('Required', 'Partner name and title are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        partner_name:      form.partner_name,
        partner_logo:      form.partner_logo || null,
        title:             form.title,
        description:       form.description || null,
        category:          form.category,
        coins_cost:        Number(form.coins_cost) || 0,
        discount_pct:      form.discount_pct ? Number(form.discount_pct) : null,
        coupon_type:       form.coupon_type,
        affiliate_url:     form.affiliate_url || null,
        coupon_pool:       form.coupon_type === 'code' ? (form.coupon_pool ?? []) : null,
        max_uses_per_user: Number(form.max_uses_per_user) || 1,
        total_stock:       form.total_stock ? Number(form.total_stock) : null,
        valid_until:       form.valid_until || null,
        is_active:         !!form.is_active,
        is_featured:       !!form.is_featured,
      };
      if (isNew) {
        const { error } = await supabase.from('partner_offers').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('partner_offers').update(payload).eq('id', form.id);
        if (error) throw error;
      }
      onSave();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[f.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[f.headerTitle, { color: colors.textPrimary }]}>{isNew ? 'New Offer' : 'Edit Offer'}</Text>
            <TouchableOpacity onPress={save} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {saving ? <ActivityIndicator size="small" color="#7C5CBF" /> : <Text style={f.saveBtn}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            {/* Partner */}
            <Text style={[f.section, { color: colors.textSecondary }]}>PARTNER</Text>
            <LabeledInput label="Partner name *" value={form.partner_name} onChangeText={(v: string) => set('partner_name', v)} placeholder="Amazon, Chewy…" colors={colors} />
            <LabeledInput label="Logo emoji" value={form.partner_logo} onChangeText={(v: string) => set('partner_logo', v)} placeholder="🛒" colors={colors} />

            {/* Offer */}
            <Text style={[f.section, { color: colors.textSecondary }]}>OFFER DETAILS</Text>
            <LabeledInput label="Title *" value={form.title} onChangeText={(v: string) => set('title', v)} placeholder="15% off dog food" colors={colors} />
            <LabeledInput label="Description" value={form.description} onChangeText={(v: string) => set('description', v)} placeholder="Fine print…" multiline colors={colors} />

            {/* Category */}
            <Text style={[f.label, { color: colors.textSecondary, marginBottom: 8 }]}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} onPress={() => set('category', c)}
                  style={[f.chip, { backgroundColor: form.category === c ? '#7C5CBF' : colors.card, borderColor: form.category === c ? '#7C5CBF' : colors.border }]}>
                  <Text style={{ color: form.category === c ? '#fff' : colors.textSecondary, fontSize: TYPO.caption, fontWeight: '600' }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Pricing */}
            <Text style={[f.section, { color: colors.textSecondary }]}>PRICING</Text>
            <LabeledInput label="Coins cost" value={String(form.coins_cost ?? '')} onChangeText={(v: string) => set('coins_cost', v)} keyboardType="number-pad" colors={colors} />
            <LabeledInput label="Discount % (display only)" value={form.discount_pct ? String(form.discount_pct) : ''} onChangeText={(v: string) => set('discount_pct', v || null)} keyboardType="number-pad" placeholder="15" colors={colors} />
            <LabeledInput label="Max uses per user" value={String(form.max_uses_per_user ?? 1)} onChangeText={(v: string) => set('max_uses_per_user', v)} keyboardType="number-pad" colors={colors} />
            <LabeledInput label="Total stock (blank = unlimited)" value={form.total_stock ? String(form.total_stock) : ''} onChangeText={(v: string) => set('total_stock', v || null)} keyboardType="number-pad" colors={colors} />
            <LabeledInput label="Valid until (ISO date, blank = no expiry)" value={form.valid_until ?? ''} onChangeText={(v: string) => set('valid_until', v || null)} placeholder="2025-12-31" colors={colors} />

            {/* Coupon type */}
            <Text style={[f.section, { color: colors.textSecondary }]}>COUPON TYPE</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {(['code', 'link'] as const).map(t => (
                <TouchableOpacity key={t} onPress={() => set('coupon_type', t)}
                  style={[f.chip, { backgroundColor: form.coupon_type === t ? '#7C5CBF' : colors.card, borderColor: form.coupon_type === t ? '#7C5CBF' : colors.border }]}>
                  <Text style={{ color: form.coupon_type === t ? '#fff' : colors.textSecondary, fontSize: TYPO.caption, fontWeight: '600' }}>{t === 'code' ? '🔑 Code pool' : '🔗 Affiliate link'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.coupon_type === 'link' && (
              <LabeledInput label="Affiliate URL" value={form.affiliate_url} onChangeText={(v: string) => set('affiliate_url', v)} placeholder="https://…" colors={colors} />
            )}

            {form.coupon_type === 'code' && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[f.label, { color: colors.textSecondary }]}>
                  Code pool ({(form.coupon_pool ?? []).length} codes remaining)
                </Text>
                {(form.coupon_pool ?? []).slice(0, 5).map((code: string, i: number) => (
                  <View key={i} style={[f.codeRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <Text style={{ color: colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: TYPO.caption }}>{code}</Text>
                    <TouchableOpacity onPress={() => set('coupon_pool', (form.coupon_pool ?? []).filter((_: string, j: number) => j !== i))}>
                      <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
                {(form.coupon_pool ?? []).length > 5 && (
                  <Text style={{ color: colors.textSecondary, fontSize: TYPO.caption, marginTop: 4 }}>
                    + {(form.coupon_pool ?? []).length - 5} more codes
                  </Text>
                )}
                <TextInput
                  style={[f.input, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border, height: 70, textAlignVertical: 'top', marginTop: 8 }]}
                  value={codeInput}
                  onChangeText={setCodeInput}
                  placeholder={'Paste codes, one per line or comma-separated\nCODE1, CODE2, CODE3…'}
                  placeholderTextColor={colors.textTertiary}
                  multiline
                />
                <TouchableOpacity onPress={addCodes} style={[f.addCodesBtn, { backgroundColor: '#7C5CBF22', borderColor: '#7C5CBF55' }]}>
                  <Text style={{ color: '#7C5CBF', fontWeight: '700', fontSize: TYPO.body }}>+ Add codes</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Flags */}
            <Text style={[f.section, { color: colors.textSecondary }]}>VISIBILITY</Text>
            <View style={[f.row, { borderColor: colors.border }]}>
              <Text style={{ color: colors.textPrimary, flex: 1, fontWeight: '600' }}>Active (visible to users)</Text>
              <Switch value={!!form.is_active} onValueChange={v => set('is_active', v)} trackColor={{ true: '#7C5CBF' }} />
            </View>
            <View style={[f.row, { borderColor: colors.border, marginTop: 8 }]}>
              <Text style={{ color: colors.textPrimary, flex: 1, fontWeight: '600' }}>⭐ Featured (shown first)</Text>
              <Switch value={!!form.is_featured} onValueChange={v => set('is_featured', v)} trackColor={{ true: '#7C5CBF' }} />
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AdminRewardsOffersScreen() {
  const { colors } = useTheme();
  const [offers, setOffers]       = useState<Offer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editOffer, setEditOffer] = useState<Partial<Offer> | null>(null);
  const [showForm, setShowForm]   = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('partner_offers')
      .select('*')
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });
    setOffers((data ?? []) as Offer[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (offer: Offer) => {
    await supabase.from('partner_offers').update({ is_active: !offer.is_active }).eq('id', offer.id);
    load(true);
  };

  const deleteOffer = (offer: Offer) => {
    Alert.alert('Delete offer?', `"${offer.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('partner_offers').delete().eq('id', offer.id);
        load(true);
      }},
    ]);
  };

  const openNew  = () => { setEditOffer({ ...BLANK_OFFER }); setShowForm(true); };
  const openEdit = (o: Offer) => { setEditOffer(o); setShowForm(true); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{
        title: 'Partner Offers',
        headerRight: () => (
          <TouchableOpacity onPress={openNew} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="add-circle" size={26} color="#7C5CBF" />
          </TouchableOpacity>
        ),
      }} />

      {loading ? (
        <ActivityIndicator size="large" color="#7C5CBF" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#7C5CBF" />}
        >
          <Text style={{ color: colors.textSecondary, fontSize: TYPO.caption, marginBottom: 4 }}>
            {offers.length} offers · Tap to edit · Toggle to activate/deactivate
          </Text>
          {offers.map(offer => (
            <TouchableOpacity
              key={offer.id}
              onPress={() => openEdit(offer)}
              style={[s.offerRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: offer.is_active ? 1 : 0.5 }]}
              activeOpacity={0.8}
            >
              <Text style={s.logo}>{offer.partner_logo ?? '🏪'}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {offer.is_featured && <Text style={s.featTag}>⭐ FEAT</Text>}
                  <Text style={[s.offerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{offer.title}</Text>
                </View>
                <Text style={[s.offerSub, { color: colors.textSecondary }]}>
                  {offer.partner_name} · {offer.coins_cost}🪙 · {offer.category}
                  {offer.coupon_type === 'code'
                    ? ` · ${(offer.coupon_pool ?? []).length - offer.redeemed_count} codes left`
                    : ' · link'}
                  {offer.redeemed_count > 0 ? ` · ${offer.redeemed_count} redeemed` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Switch
                  value={offer.is_active}
                  onValueChange={() => toggleActive(offer)}
                  trackColor={{ true: '#7C5CBF' }}
                />
                <TouchableOpacity onPress={() => deleteOffer(offer)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger ?? '#EF4444'} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}

          {offers.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Text style={{ fontSize: 40 }}>🎁</Text>
              <Text style={[{ color: colors.textSecondary, marginTop: 12, fontSize: TYPO.body }]}>No offers yet</Text>
              <TouchableOpacity onPress={openNew} style={[s.addBtn, { backgroundColor: '#7C5CBF' }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Add first offer</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      <OfferFormModal
        offer={editOffer}
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSave={() => load(true)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  offerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 12 },
  logo:       { fontSize: TYPO.hero },
  featTag:    { fontSize: TYPO.label, fontWeight: '800', color: '#7C5CBF', backgroundColor: '#7C5CBF18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  offerTitle: { fontSize: TYPO.body, fontWeight: '700', flex: 1 },
  offerSub:   { fontSize: TYPO.caption, marginTop: 2 },
  addBtn:     { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
});

const f = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: TYPO.subheading, fontWeight: '700', flex: 1, textAlign: 'center' },
  saveBtn:     { fontSize: TYPO.subheading, fontWeight: '700', color: '#7C5CBF' },
  section:     { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  label:       { fontSize: TYPO.caption, fontWeight: '600', marginBottom: 6 },
  input:       { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body },
  chip:        { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  row:         { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  codeRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  addCodesBtn: { borderWidth: 1, borderRadius: 10, alignItems: 'center', paddingVertical: 10, marginTop: 6 },
});
