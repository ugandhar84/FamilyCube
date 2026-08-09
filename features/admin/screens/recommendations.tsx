import { showAlert } from '@/components/AppAlert';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text,  TouchableOpacity, StyleSheet,
  Alert, Switch, TextInput, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { uploadRecommendationMedia } from '@/lib/supabase';
import { TYPO } from '@/constants/theme';
import {
  getPetProducts, createPetProduct, updatePetProduct,
  deletePetProduct, togglePetProductActive,
  type PetProduct,
} from '@/lib/db/admin';

const CATEGORIES = ['food', 'treats', 'supplement', 'supplies', 'toy', 'grooming', 'health'] as const;
const SPECIES    = ['dog', 'cat', 'rabbit', 'bird', 'hamster', 'fish', 'turtle', 'other'] as const;
const SIZES      = ['small', 'medium', 'large'] as const;

const CAT_EMOJI: Record<string, string> = {
  food: '🥩', treats: '🦴', supplement: '💊', supplies: '🛒',
  toy: '🎾', grooming: '✂️', health: '❤️‍🩹',
};
const CAT_COLOR: Record<string, string> = {
  food: '#16A34A', treats: '#E8A320', supplement: '#7C5CBF', supplies: '#3B82F6',
  toy: '#FF8C55', grooming: '#0891B2', health: '#E24B4A',
};

type Form = {
  brand: string;
  name: string;
  category: string;
  species: string;
  breed_size: string;
  min_age_years: string;
  max_age_years: string;
  price: string;
  original_price: string;
  emoji: string;
  image_url: string;
  video_url: string;
  youtube_url: string;
  cta_label: string;
  cta_url: string;
  sponsor_rank: string;
  deal_type: '' | 'clearance' | 'rollback';
  sponsored: boolean;
  active: boolean;
};

const BLANK: Form = {
  brand: '', name: '', category: 'food', species: '', breed_size: '',
  min_age_years: '', max_age_years: '', price: '', original_price: '',
  emoji: '', image_url: '', video_url: '', youtube_url: '', cta_label: 'Shop', cta_url: '',
  sponsor_rank: '0', deal_type: '', sponsored: true, active: true,
};

function toNum(s: string) { const n = parseFloat(s); return isNaN(n) ? null : n; }
function toInt(s: string) { const n = parseInt(s, 10); return isNaN(n) ? 0 : n; }

export default function RecommendationsScreen() {
  const { colors, isDark } = useTheme();
  const loadedOnce = useRef(false);
  const listRef = useRef<FlashListRef<any>>(null);

  const [products, setProducts]       = useState<PetProduct[]>([]);
  const [showGoTop, setShowGoTop]     = useState(false);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState<'all' | 'active' | 'inactive'>('all');
  const [editing, setEditing]         = useState<PetProduct | null | 'new'>(null);
  const [form, setForm]               = useState<Form>(BLANK);
  const [saving, setSaving]           = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getPetProducts();
      setProducts(data);
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) load(true);
    else loadedOnce.current = true;
  }, [load]));

  const openEdit = (p: PetProduct | 'new') => {
    if (p === 'new') {
      setForm(BLANK);
    } else {
      setForm({
        brand: p.brand ?? '', name: p.name, category: p.category,
        species: p.species ?? '', breed_size: p.breed_size ?? '',
        min_age_years: p.min_age_years != null ? String(p.min_age_years) : '',
        max_age_years: p.max_age_years != null ? String(p.max_age_years) : '',
        price: p.price != null ? String(p.price) : '',
        original_price: p.original_price != null ? String(p.original_price) : '',
        emoji: p.emoji ?? '', image_url: p.image_url ?? '',
        video_url: p.video_url ?? '',
        youtube_url: (p as any).youtube_url ?? '',
        cta_label: p.cta_label, cta_url: p.cta_url ?? '',
        sponsor_rank: String(p.sponsor_rank),
        deal_type: (p.deal_type ?? '') as Form['deal_type'],
        sponsored: p.sponsored, active: p.active,
      });
    }
    setEditing(p);
  };

  const save = async () => {
    if (!form.name.trim()) { showAlert('Required', 'Product name is required.'); return; }
    setSaving(true);
    const payload = {
      brand:          form.brand.trim() || null,
      name:           form.name.trim(),
      category:       form.category,
      species:        form.species || null,
      breed_size:     form.breed_size || null,
      min_age_years:  toNum(form.min_age_years),
      max_age_years:  toNum(form.max_age_years),
      price:          toNum(form.price),
      original_price: toNum(form.original_price),
      emoji:          form.emoji.trim() || null,
      image_url:      form.image_url.trim() || null,
      video_url:      form.video_url.trim() || null,
      youtube_url:    form.youtube_url.trim() || null,
      cta_label:      form.cta_label.trim() || 'Shop',
      cta_url:        form.cta_url.trim() || null,
      sponsor_rank:   toInt(form.sponsor_rank),
      deal_type:      form.deal_type || null,
      sponsored:      form.sponsored,
      active:         form.active,
    };
    try {
      if (editing && editing !== 'new') {
        await updatePetProduct(editing.id, payload);
        setProducts(prev => prev.map(p => p.id === (editing as PetProduct).id ? { ...p, ...payload } as PetProduct : p));
      } else {
        await createPetProduct(payload);
        await load(true);
      }
      setEditing(null);
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission needed', 'Allow media library access to upload images or videos.');
      return;
    }
    // Pick without editing first so we can detect media type, then re-pick with crop for images
    const probe = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
      allowsEditing: false,
      quality: 1,
    });
    if (probe.canceled || !probe.assets?.length) return;
    const probeAsset = probe.assets[0];
    const probeLcUri = probeAsset.uri.toLowerCase();
    const probeIsVideo = (probeAsset.mimeType?.startsWith('video/') ?? false)
      || probeLcUri.endsWith('.mov') || probeLcUri.endsWith('.mp4')
      || probeLcUri.endsWith('.quicktime') || probeLcUri.endsWith('.avi') || probeLcUri.endsWith('.m4v');

    let result = probe;
    // For images only: re-launch with allowsEditing so admin can crop/zoom
    if (!probeIsVideo) {
      const edited = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as ImagePicker.MediaType[],
        allowsEditing: true,
        quality: 1,
      });
      if (!edited.canceled && edited.assets?.length) result = edited;
    }

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const lcUri = asset.uri.toLowerCase();

    // Determine type by mimeType + extension — QuickTime may have undefined mimeType
    const isVideo = (asset.mimeType?.startsWith('video/') ?? false)
      || lcUri.endsWith('.mov') || lcUri.endsWith('.mp4')
      || lcUri.endsWith('.quicktime') || lcUri.endsWith('.avi') || lcUri.endsWith('.m4v');
    const isGif = asset.mimeType === 'image/gif' || lcUri.endsWith('.gif');
    const mimeType = asset.mimeType
      ?? (isVideo ? 'video/mp4' : isGif ? 'image/gif' : 'image/jpeg');

    setMediaUploading(true);
    try {
      // Read base64 immediately while the temp file is fresh (same reason as social videos)
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const url = await uploadRecommendationMedia(asset.uri, mimeType, base64Data);
      if (isVideo) {
        setForm(f => ({ ...f, video_url: url, youtube_url: '' }));
      } else {
        setForm(f => ({ ...f, image_url: url }));
      }
    } catch (e: any) {
      showAlert('Upload failed', e.message);
    } finally {
      setMediaUploading(false);
    }
  };

  const toggleActive = async (p: PetProduct) => {
    const next = !p.active;
    try {
      await togglePetProductActive(p.id, next);
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, active: next } : x));
    } catch (e: any) {
      showAlert('Error', e.message);
    }
  };

  const remove = (p: PetProduct) => {
    showAlert('Delete product?', `"${p.name}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deletePetProduct(p.id);
          setProducts(prev => prev.filter(x => x.id !== p.id));
        } catch (e: any) {
          showAlert('Error', e.message);
        }
      }},
    ]);
  };

  const card = isDark ? '#1E1A2E' : '#FFFFFF';
  const sub  = isDark ? '#9A8FC0' : '#8A7FAA';
  const inp  = isDark ? '#2A2242' : '#F4F0FF';

  const visible = products.filter(p =>
    filter === 'all' ? true : filter === 'active' ? p.active : !p.active
  );

  const renderItem = ({ item: p }: { item: PetProduct }) => {
    const col = CAT_COLOR[p.category] ?? '#6B7280';
    return (
      <View style={[s.card, { backgroundColor: card }]}>
        <View style={s.row}>
          <View style={[s.catBadge, { backgroundColor: col + '20' }]}>
            <Text style={{ fontSize: TYPO.title }}>{p.emoji ?? CAT_EMOJI[p.category] ?? '📦'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {p.brand ? `${p.brand} · ` : ''}{p.name}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
              <Pill label={p.category} color={col} />
              {p.species ? <Pill label={p.species} color="#7C5CBF" /> : <Pill label="All species" color="#9CA3AF" />}
              {p.breed_size ? <Pill label={p.breed_size} color="#3B82F6" /> : null}
              {(p.min_age_years != null || p.max_age_years != null) && (
                <Pill label={`${p.min_age_years ?? 0}–${p.max_age_years ?? '∞'}yr`} color="#E8A320" />
              )}
              {p.deal_type === 'clearance' && <Pill label="🔥 Clearance" color="#E24B4A" />}
              {p.deal_type === 'rollback'  && <Pill label="↩ Rollback"   color="#0891B2" />}
            </View>
            {p.price != null && (
              <Text style={[s.price, { color: col }]}>
                ${p.price.toFixed(2)}
                {p.original_price ? ` (was $${p.original_price.toFixed(2)})` : ''}
              </Text>
            )}
          </View>
          <Switch
            value={p.active}
            onValueChange={() => toggleActive(p)}
            trackColor={{ true: '#16A34A', false: colors.border }}
            thumbColor="#fff"
          />
        </View>
        <View style={[s.actions, { borderTopColor: colors.border }]}>
          <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(p)}>
            <Ionicons name="pencil-outline" size={15} color={colors.primary} />
            <Text style={[s.actionText, { color: colors.primary }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => remove(p)}>
            <Ionicons name="trash-outline" size={15} color="#E24B4A" />
            <Text style={[s.actionText, { color: '#E24B4A' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Recommendations' }} />

      {/* Filter chips */}
      <View style={[s.filterBar, { borderBottomColor: colors.border }]}>
        {(['all', 'active', 'inactive'] as const).map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[s.chip, {
              backgroundColor: filter === f ? colors.primary : colors.card,
              borderColor: filter === f ? colors.primary : colors.border,
            }]}
          >
            <Text style={[s.chipText, { color: filter === f ? '#fff' : sub }]}>
              {f === 'all' ? 'All' : f === 'active' ? '✅ Active' : '⏸ Inactive'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlashList
        ref={listRef}
        data={visible}
        keyExtractor={p => p.id}
        renderItem={renderItem}
        style={{ flex: 1 }}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={{ padding: 12, gap: 10 }}
        onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)}
        scrollEventThrottle={16}
        ListHeaderComponent={loading ? <View style={{ alignItems: 'center', padding: 16 }}><PawBondLoader size={36} isDark={isDark} /></View> : null}
        ListEmptyComponent={!loading ? <Text style={[s.empty, { color: sub }]}>No products. Tap + to add one.</Text> : null}
      />

      {/* FAB — scrolled: go to top; at top: add new */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: colors.primary }]}
        onPress={showGoTop ? () => listRef.current?.scrollToOffset({ offset: 0, animated: true }) : () => openEdit('new')}
        activeOpacity={0.85}
      >
        <Ionicons name={showGoTop ? 'chevron-up' : 'add'} size={28} color="#fff" />
      </TouchableOpacity>

      {/* Edit sheet */}
      <Modal
        visible={!!editing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditing(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
            {/* Header */}
            <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setEditing(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[s.cancel, { color: sub }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>
                {editing === 'new' ? 'New Product' : 'Edit Product'}
              </Text>
              <TouchableOpacity onPress={save} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                {saving
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={[s.done, { color: colors.primary }]}>Save</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
            >

              {/* Category */}
              <Label text="Category" sub={sub} />
              <View style={s.chipRow}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setForm(f => ({ ...f, category: c }))}
                    style={[s.chip, {
                      backgroundColor: form.category === c ? (CAT_COLOR[c] ?? colors.primary) : colors.card,
                      borderColor: form.category === c ? (CAT_COLOR[c] ?? colors.primary) : colors.border,
                    }]}
                  >
                    <Text style={[s.chipText, { color: form.category === c ? '#fff' : sub }]}>
                      {CAT_EMOJI[c]} {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Name & Brand */}
              <Label text="Product Name *" sub={sub} />
              <Inp value={form.name} onChange={t => setForm(f => ({ ...f, name: t }))} placeholder="e.g. Salmon Recipe Kibble" inp={inp} colors={colors} sub={sub} />

              <Label text="Brand" sub={sub} />
              <Inp value={form.brand} onChange={t => setForm(f => ({ ...f, brand: t }))} placeholder="e.g. Royal Canin" inp={inp} colors={colors} sub={sub} />

              {/* Species */}
              <Label text="Target Species (empty = all)" sub={sub} />
              <View style={s.chipRow}>
                <TouchableOpacity
                  onPress={() => setForm(f => ({ ...f, species: '' }))}
                  style={[s.chip, { backgroundColor: !form.species ? colors.primary : colors.card, borderColor: !form.species ? colors.primary : colors.border }]}
                >
                  <Text style={[s.chipText, { color: !form.species ? '#fff' : sub }]}>All</Text>
                </TouchableOpacity>
                {SPECIES.map(sp => (
                  <TouchableOpacity
                    key={sp}
                    onPress={() => setForm(f => ({ ...f, species: sp }))}
                    style={[s.chip, { backgroundColor: form.species === sp ? colors.primary : colors.card, borderColor: form.species === sp ? colors.primary : colors.border }]}
                  >
                    <Text style={[s.chipText, { color: form.species === sp ? '#fff' : sub }]}>{sp}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Breed size */}
              <Label text="Breed Size (empty = all)" sub={sub} />
              <View style={s.chipRow}>
                <TouchableOpacity
                  onPress={() => setForm(f => ({ ...f, breed_size: '' }))}
                  style={[s.chip, { backgroundColor: !form.breed_size ? colors.primary : colors.card, borderColor: !form.breed_size ? colors.primary : colors.border }]}
                >
                  <Text style={[s.chipText, { color: !form.breed_size ? '#fff' : sub }]}>All sizes</Text>
                </TouchableOpacity>
                {SIZES.map(sz => (
                  <TouchableOpacity
                    key={sz}
                    onPress={() => setForm(f => ({ ...f, breed_size: sz }))}
                    style={[s.chip, { backgroundColor: form.breed_size === sz ? colors.primary : colors.card, borderColor: form.breed_size === sz ? colors.primary : colors.border }]}
                  >
                    <Text style={[s.chipText, { color: form.breed_size === sz ? '#fff' : sub }]}>{sz}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Age range */}
              <Label text="Age Range (years, empty = any)" sub={sub} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Inp value={form.min_age_years} onChange={t => setForm(f => ({ ...f, min_age_years: t }))} placeholder="Min age" inp={inp} colors={colors} sub={sub} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Inp value={form.max_age_years} onChange={t => setForm(f => ({ ...f, max_age_years: t }))} placeholder="Max age" inp={inp} colors={colors} sub={sub} keyboardType="decimal-pad" />
                </View>
              </View>

              {/* Price */}
              <Label text="Price" sub={sub} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Inp value={form.price} onChange={t => setForm(f => ({ ...f, price: t }))} placeholder="Sale price" inp={inp} colors={colors} sub={sub} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Inp value={form.original_price} onChange={t => setForm(f => ({ ...f, original_price: t }))} placeholder="Original price" inp={inp} colors={colors} sub={sub} keyboardType="decimal-pad" />
                </View>
              </View>

              {/* Emoji & image */}
              <Label text="Emoji" sub={sub} />
              <Inp value={form.emoji} onChange={t => setForm(f => ({ ...f, emoji: t }))} placeholder="🐾" inp={inp} colors={colors} sub={sub} />

              {/* Media upload — image, GIF, or video */}
              <Label text=" / GIF / Video" sub={sub} />
              <TouchableOpacity
                style={[s.mediaPicker, { backgroundColor: inp, borderColor: colors.border }]}
                onPress={pickMedia}
                disabled={mediaUploading}
              >
                {mediaUploading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={22} color={sub} />
                    <Text style={{ color: sub, fontSize: TYPO.body, marginLeft: 8 }}>Pick image, GIF, or video</Text>
                  </>
                )}
              </TouchableOpacity>
              {/* Preview */}
              {!!form.image_url && (
                <View style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden' }}>
                  <Image source={{ uri: form.image_url }} cachePolicy="memory-disk" style={{ width: '100%', height: 140 }} contentFit="cover" />
                  <TouchableOpacity
                    style={s.mediaRemove}
                    onPress={() => setForm(f => ({ ...f, image_url: '' }))}
                  >
                    <Ionicons name="close-circle" size={22} color="#E24B4A" />
                  </TouchableOpacity>
                </View>
              )}
              {!!form.video_url && (
                <View style={[s.videoPreview, { backgroundColor: inp, borderColor: colors.border }]}>
                  <Ionicons name="videocam-outline" size={20} color={colors.primary} />
                  <Text style={{ flex: 1, color: colors.textPrimary, fontSize: TYPO.body, marginLeft: 8 }} numberOfLines={1}>{form.video_url}</Text>
                  <TouchableOpacity onPress={() => setForm(f => ({ ...f, video_url: '' }))}>
                    <Ionicons name="close-circle" size={20} color="#E24B4A" />
                  </TouchableOpacity>
                </View>
              )}
              {/* Manual URL fallback */}
              <Inp value={form.image_url} onChange={t => setForm(f => ({ ...f, image_url: t }))} placeholder="Or paste image URL" inp={inp} colors={colors} sub={sub} keyboardType="url" />


              <Label text="YouTube URL" sub={sub} />
              <Text style={{ fontSize: TYPO.body, color: sub, marginBottom: 4 }}>Use either a self-hosted video or a YouTube URL — not both. Setting one clears the other.</Text>
              <Inp
                value={form.youtube_url}
                onChange={t => setForm(f => ({ ...f, youtube_url: t, video_url: t.trim() ? '' : f.video_url }))}
                placeholder="https://youtube.com/watch?v=... or youtu.be/..."
                inp={inp} colors={colors} sub={sub} keyboardType="url"
              />

              {/* CTA */}
              <Label text="CTA Button Label" sub={sub} />
              <Inp value={form.cta_label} onChange={t => setForm(f => ({ ...f, cta_label: t }))} placeholder="Shop" inp={inp} colors={colors} sub={sub} />

              <Label text="CTA URL" sub={sub} />
              <Inp value={form.cta_url} onChange={t => setForm(f => ({ ...f, cta_url: t }))} placeholder="https://..." inp={inp} colors={colors} sub={sub} keyboardType="url" />

              {/* Deal type */}
              <Label text="Deal Type" sub={sub} />
              <View style={s.chipRow}>
                {([
                  { key: '',           label: 'None' },
                  { key: 'clearance',  label: '🔥 Clearance' },
                  { key: 'rollback',   label: '↩ Rollback' },
                ] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setForm(f => ({ ...f, deal_type: opt.key }))}
                    style={[s.chip, {
                      backgroundColor: form.deal_type === opt.key
                        ? (opt.key === 'clearance' ? '#E24B4A' : opt.key === 'rollback' ? '#0891B2' : colors.primary)
                        : colors.card,
                      borderColor: form.deal_type === opt.key
                        ? (opt.key === 'clearance' ? '#E24B4A' : opt.key === 'rollback' ? '#0891B2' : colors.primary)
                        : colors.border,
                    }]}
                  >
                    <Text style={[s.chipText, { color: form.deal_type === opt.key ? '#fff' : sub }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Sponsor rank */}
              <Label text="Sponsor Rank (higher = shown first)" sub={sub} />
              <Inp value={form.sponsor_rank} onChange={t => setForm(f => ({ ...f, sponsor_rank: t }))} placeholder="0" inp={inp} colors={colors} sub={sub} keyboardType="number-pad" />

              {/* Toggles */}
              <View style={[s.toggle, { borderColor: colors.border }]}>
                <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>Sponsored placement</Text>
                <Switch value={form.sponsored} onValueChange={v => setForm(f => ({ ...f, sponsored: v }))} trackColor={{ true: '#E8A320', false: colors.border }} thumbColor="#fff" />
              </View>
              <View style={[s.toggle, { borderColor: colors.border }]}>
                <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>Active (shown in app)</Text>
                <Switch value={form.active} onValueChange={v => setForm(f => ({ ...f, active: v }))} trackColor={{ true: '#16A34A', false: colors.border }} thumbColor="#fff" />
              </View>

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + '18', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color }}>{label}</Text>
    </View>
  );
}

function Label({ text, sub }: { text: string; sub: string }) {
  return <Text style={[s.label, { color: sub }]}>{text}</Text>;
}

function Inp({ value, onChange, placeholder, inp, colors, sub, multiline, keyboardType, returnKeyType, autoCorrect, autoCapitalize }: {
  value: string; onChange: (t: string) => void; placeholder: string;
  inp: string; colors: any; sub: string; multiline?: boolean; keyboardType?: any;
  returnKeyType?: any; autoCorrect?: boolean; autoCapitalize?: any;
}) {
  return (
    <TextInput
      style={[s.input, { backgroundColor: inp, color: colors.textPrimary, borderColor: colors.border, height: multiline ? 80 : undefined }]}
      value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={sub} multiline={multiline} keyboardType={keyboardType}
      textAlignVertical={multiline ? 'top' : 'center'}
      returnKeyType={returnKeyType ?? (multiline ? 'default' : 'next')}
      autoCorrect={autoCorrect ?? false}
      autoCapitalize={autoCapitalize ?? (keyboardType === 'url' || keyboardType === 'email-address' ? 'none' : 'sentences')}
    />
  );
}

const s = StyleSheet.create({
  filterBar:  { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  card:       { borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },
  row:        { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 },
  catBadge:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name:       { fontSize: TYPO.body, fontWeight: '700' },
  price:      { fontSize: TYPO.body, fontWeight: '700', marginTop: 4 },
  actions:    { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9 },
  actionText: { fontSize: TYPO.body, fontWeight: '600' },
  chip:       { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 5 },
  chipText:   { fontSize: TYPO.body, fontWeight: '600' },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  fab:        { position: 'absolute', right: 20, bottom: 28, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 8 },
  empty:      { textAlign: 'center', marginTop: 48, fontSize: TYPO.body },
  // Sheet
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle:  { fontSize: TYPO.subheading, fontWeight: '700' },
  cancel:      { fontSize: TYPO.body },
  done:        { fontSize: TYPO.body, fontWeight: '700' },
  label:       { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6, marginTop: 14 },
  input:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: TYPO.body },
  toggle:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 10 },
  toggleLabel: { fontSize: TYPO.body, fontWeight: '600' },
  mediaPicker: { borderWidth: 1, borderRadius: 12, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, marginBottom: 4 },
  mediaRemove: { position: 'absolute', top: 6, right: 6 },
  videoPreview:{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
});
