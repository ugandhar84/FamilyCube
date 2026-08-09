import { showAlert } from '@/components/AppAlert';
import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Switch, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import LazyImage from '@/components/LazyImage';
import PawBondLoader from '@/components/PawBondLoader';
import { useLocalSearchParams, router } from 'expo-router';
import { uploadSponsoredAsset, uploadRecommendationMedia } from '@/lib/supabase';
import {
  getSponsoredListingById, createSponsoredListing, updateSponsoredListing,
} from '@/lib/db/admin';
import { localDateStr } from '@/lib/dates';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { TYPO } from '@/constants/theme';

const CATEGORIES = ['clinic','food','toy','facility','grooming','boarding','training','insurance','other'] as const;
const SPECIES    = ['dog','cat','rabbit','bird','hamster','fish','turtle','other'] as const;

const CATEGORY_EMOJI: Record<string, string> = {
  clinic: '🏥', food: '🥩', toy: '🎾', facility: '🏢',
  grooming: '✂️', boarding: '🏠', training: '🎓', insurance: '🛡️', other: '📦',
};

type Form = {
  category: string;
  business_name: string;
  tagline: string;
  description: string;
  website_url: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  cta_label: string;
  cta_url: string;
  priority: string;
  is_active: boolean;
  is_featured: boolean;
  target_species: string[];
  starts_at: string;
  ends_at: string;
};

const BLANK: Form = {
  category: 'clinic', business_name: '', tagline: '', description: '',
  website_url: '', phone: '', address: '', city: '', state: '',
  cta_label: 'Learn More', cta_url: '', priority: '0',
  is_active: true, is_featured: false, target_species: [],
  starts_at: '', ends_at: '',
};

export default function SponsoredEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuthStore();
  const { colors, isDark } = useTheme();
  const [form, setForm]     = useState<Form>(BLANK);
  const [logoUri, setLogoUri]     = useState<string | null>(null);
  const [coverUri, setCoverUri]   = useState<string | null>(null);
  const [logoUrl, setLogoUrl]     = useState<string | null>(null);
  const [coverUrl, setCoverUrl]   = useState<string | null>(null);
  const [videoUri, setVideoUri]     = useState<string | null>(null);
  const [videoUrl, setVideoUrl]     = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [loading, setLoading]     = useState(!!id);
  const [saving, setSaving]       = useState(false);
  const [datePicker, setDatePicker] = useState<{ field: 'starts_at' | 'ends_at'; value: Date } | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const data = await getSponsoredListingById(id).catch(() => null);
      if (data) {
        setForm({
          category: data.category, business_name: data.business_name ?? '',
          tagline: data.tagline ?? '', description: data.description ?? '',
          website_url: data.website_url ?? '', phone: data.phone ?? '',
          address: data.address ?? '', city: data.city ?? '', state: data.state ?? '',
          cta_label: data.cta_label ?? 'Learn More', cta_url: data.cta_url ?? '',
          priority: String(data.priority ?? 0),
          is_active: data.is_active, is_featured: data.is_featured,
          target_species: data.target_species ?? [], starts_at: data.starts_at?.slice(0,10) ?? '', ends_at: data.ends_at?.slice(0,10) ?? '',
        });
        setLogoUrl(data.logo_url);
        setCoverUrl(data.cover_url);
        setVideoUrl(data.video_url ?? null);
        setYoutubeUrl((data as any).youtube_url ?? null);
      }
      setLoading(false);
    })();
  }, [id]);

  const pickImage = async (type: 'logo' | 'cover') => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8 });
    if (res.canceled) return;
    const uri = res.assets[0].uri;
    if (type === 'logo')  setLogoUri(uri);
    else                  setCoverUri(uri);
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission needed', 'Allow media library access to pick a video.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] as any, allowsEditing: false, quality: 1 });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    const lcUri = asset.uri.toLowerCase();
    const mime  = asset.mimeType
      ?? (lcUri.endsWith('.mov') || lcUri.endsWith('.quicktime') ? 'video/quicktime' : 'video/mp4');
    setMediaUploading(true);
    try {
      // Read base64 immediately — temp file may be gone by the time save() runs
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const url = await uploadRecommendationMedia(asset.uri, mime, base64Data);
      setVideoUri(asset.uri);
      setVideoUrl(url);
      setYoutubeUrl(null); // clear YouTube — use one or the other
    } catch (e: any) {
      showAlert('Upload failed', e.message);
    } finally {
      setMediaUploading(false);
    }
  };

  const toggleSpecies = (s: string) => {
    setForm(f => ({
      ...f,
      target_species: f.target_species.includes(s)
        ? f.target_species.filter(x => x !== s)
        : [...f.target_species, s],
    }));
  };

  const save = async () => {
    if (!form.business_name.trim()) { showAlert('Required', 'Business name is required.'); return; }
    setSaving(true);

    let finalLogo  = logoUrl;
    let finalCover = coverUrl;

    try {
      if (logoUri)  finalLogo  = await uploadSponsoredAsset('logo',  logoUri);
      if (coverUri) finalCover = await uploadSponsoredAsset('cover', coverUri);
    } catch (e: any) {
      showAlert('Upload failed', e.message);
      setSaving(false);
      return;
    }

    const payload = {
      category: form.category,
      business_name: form.business_name.trim(),
      tagline: form.tagline.trim() || null,
      description: form.description.trim() || null,
      logo_url: finalLogo,
      cover_url: finalCover,
      video_url: videoUrl || null,
      youtube_url: youtubeUrl || null,
      website_url: form.website_url.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      cta_label: form.cta_label.trim() || 'Learn More',
      cta_url: form.cta_url.trim() || null,
      priority: parseInt(form.priority, 10) || 0,
      is_active: form.is_active,
      is_featured: form.is_featured,
      target_species: form.target_species,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      created_by: user?.id,
    };

    try {
      if (id) {
        await updateSponsoredListing(id, payload);
      } else {
        await createSponsoredListing(payload);
      }
      router.back();
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const inp = isDark ? '#2A2242' : '#F4F0FF';
  const sub = isDark ? '#9A8FC0' : '#8A7FAA';

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <PawBondLoader size={48} isDark={isDark} />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >

          {/* Category picker */}
          <Label text="Category" sub={sub} />
          <View style={s.chipRow}>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setForm((f: Form) => ({ ...f, category: c }))}
                style={[s.chip, { backgroundColor: form.category === c ? colors.primary : colors.card, borderColor: form.category === c ? colors.primary : colors.border }]}
              >
                <Text style={[s.chipText, { color: form.category === c ? '#fff' : sub }]}>
                  {CATEGORY_EMOJI[c]} {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Images */}
          <Label text="Logo" sub={sub} />
          <TouchableOpacity style={[s.imgPicker, { borderColor: colors.border }]} onPress={() => pickImage('logo')}>
            {(logoUri || logoUrl)
              ? <LazyImage uri={(logoUri ?? logoUrl)!} style={{ width: '100%', height: 120, borderRadius: 10 }} />
              : <View style={s.imgPlaceholder}><Ionicons name="image-outline" size={32} color={sub} /><Text style={{ color: sub, marginTop: 4 }}>Tap to upload logo</Text></View>
            }
          </TouchableOpacity>

          <Label text="Cover Image" sub={sub} />
          <TouchableOpacity style={[s.imgPicker, { borderColor: colors.border, height: 140 }]} onPress={() => pickImage('cover')}>
            {(coverUri || coverUrl)
              ? <LazyImage uri={(coverUri ?? coverUrl)!} style={{ width: '100%', height: 138, borderRadius: 10 }} />
              : <View style={s.imgPlaceholder}><Ionicons name="image-outline" size={32} color={sub} /><Text style={{ color: sub, marginTop: 4 }}>Tap to upload cover</Text></View>
            }
          </TouchableOpacity>

          <Label text="Video (optional — replaces cover when set)" sub={sub} />
          <TouchableOpacity
            style={[s.imgPicker, { borderColor: colors.border, flexDirection: 'row', height: 52, alignItems: 'center', justifyContent: 'center', gap: 8 }]}
            onPress={pickVideo}
            disabled={mediaUploading}
          >
            {mediaUploading
              ? <ActivityIndicator color={colors.primary} />
              : videoUrl
              ? <><Ionicons name="checkmark-circle" size={20} color="#16A34A" /><Text style={{ color: '#16A34A', fontSize: TYPO.body }} numberOfLines={1}>Video uploaded ✓</Text></>
              : <><Ionicons name="videocam-outline" size={22} color={sub} /><Text style={{ color: sub, fontSize: TYPO.body }}>Tap to upload video</Text></>
            }
          </TouchableOpacity>
          {!!videoUrl && (
            <TouchableOpacity onPress={() => { setVideoUrl(null); setVideoUri(null); }} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
              <Text style={{ color: '#E24B4A', fontSize: TYPO.body }}>Remove video</Text>
            </TouchableOpacity>
          )}

          <Label text="YouTube URL" sub={sub} />
          <Text style={{ fontSize: TYPO.body, color: sub, marginBottom: 4 }}>Use either a self-hosted video or a YouTube URL — not both. Setting one clears the other.</Text>
          <Input
            value={youtubeUrl ?? ''}
            onChangeText={(t: string) => { setYoutubeUrl(t.trim() || null); if (t.trim()) { setVideoUrl(null); setVideoUri(null); } }}
            placeholder="https://youtube.com/watch?v=... or youtu.be/..."
            inp={inp} colors={colors} sub={sub} keyboardType="url"
          />

          {/* Text fields */}
          <Label text="Business Name *" sub={sub} />
          <Input value={form.business_name} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, business_name: t }))} placeholder="e.g. Pawsome Vet Clinic" inp={inp} colors={colors} sub={sub} />

          <Label text="Tagline" sub={sub} />
          <Input value={form.tagline} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, tagline: t }))} placeholder="Short catchy line" inp={inp} colors={colors} sub={sub} />

          <Label text="Description" sub={sub} />
          <Input value={form.description} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, description: t }))} placeholder="About this business…" inp={inp} colors={colors} sub={sub} multiline />

          <Label text="Website URL" sub={sub} />
          <Input value={form.website_url} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, website_url: t }))} placeholder="https://" inp={inp} colors={colors} sub={sub} keyboardType="url" />

          <Label text="Phone" sub={sub} />
          <Input value={form.phone} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, phone: t }))} placeholder="+1 555 000 0000" inp={inp} colors={colors} sub={sub} keyboardType="phone-pad" />

          <Label text="Address" sub={sub} />
          <Input value={form.address} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, address: t }))} placeholder="Street address" inp={inp} colors={colors} sub={sub} />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Label text="City" sub={sub} />
              <Input value={form.city} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, city: t }))} placeholder="City" inp={inp} colors={colors} sub={sub} />
            </View>
            <View style={{ flex: 1 }}>
              <Label text="State" sub={sub} />
              <Input value={form.state} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, state: t }))} placeholder="State" inp={inp} colors={colors} sub={sub} />
            </View>
          </View>

          <Label text="CTA Button Label" sub={sub} />
          <Input value={form.cta_label} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, cta_label: t }))} placeholder="Learn More" inp={inp} colors={colors} sub={sub} />

          <Label text="CTA URL" sub={sub} />
          <Input value={form.cta_url} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, cta_url: t }))} placeholder="https://" inp={inp} colors={colors} sub={sub} keyboardType="url" />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Label text="Campaign Start" sub={sub} />
              <DateField
                value={form.starts_at} placeholder="No start date"
                onPress={() => setDatePicker({ field: 'starts_at', value: form.starts_at ? new Date(form.starts_at) : new Date() })}
                onClear={() => setForm((f: Form) => ({ ...f, starts_at: '' }))}
                inp={inp} colors={colors} sub={sub}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Label text="Campaign End" sub={sub} />
              <DateField
                value={form.ends_at} placeholder="No end date"
                onPress={() => setDatePicker({ field: 'ends_at', value: form.ends_at ? new Date(form.ends_at) : new Date() })}
                onClear={() => setForm((f: Form) => ({ ...f, ends_at: '' }))}
                inp={inp} colors={colors} sub={sub}
              />
            </View>
          </View>

          {/* Date picker */}
          <AppDateTimePicker
            visible={!!datePicker}
            value={datePicker?.value ?? new Date()}
            mode="date"
            accent={colors.primary}
            onCancel={() => setDatePicker(null)}
            onConfirm={(d) => {
              if (datePicker) setForm((f: Form) => ({ ...f, [datePicker.field]: localDateStr(d) }));
              setDatePicker(null);
            }}
          />

          <Label text="Priority (higher = shown first)" sub={sub} />
          <Input value={form.priority} onChangeText={(t: string) => setForm((f: Form) => ({ ...f, priority: t }))} placeholder="0" inp={inp} colors={colors} sub={sub} keyboardType="number-pad" />

          {/* Target species */}
          <Label text="Target Species (empty = all)" sub={sub} />
          <View style={s.chipRow}>
            {SPECIES.map(sp => (
              <TouchableOpacity
                key={sp}
                onPress={() => toggleSpecies(sp)}
                style={[s.chip, { backgroundColor: form.target_species.includes(sp) ? colors.primary : colors.card, borderColor: form.target_species.includes(sp) ? colors.primary : colors.border }]}
              >
                <Text style={[s.chipText, { color: form.target_species.includes(sp) ? '#fff' : sub }]}>{sp}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Toggles */}
          <View style={[s.toggleRow, { borderColor: colors.border }]}>
            <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>Active (shown in app)</Text>
            <Switch value={form.is_active} onValueChange={v => setForm((f: Form) => ({ ...f, is_active: v }))} trackColor={{ true: '#16A34A', false: colors.border }} thumbColor="#fff" />
          </View>
          <View style={[s.toggleRow, { borderColor: colors.border }]}>
            <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>Featured (top placement)</Text>
            <Switch value={form.is_featured} onValueChange={v => setForm((f: Form) => ({ ...f, is_featured: v }))} trackColor={{ true: '#E8A320', false: colors.border }} thumbColor="#fff" />
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: colors.primary }]}
            onPress={save} disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.saveBtnText}>{id ? 'Save Changes' : 'Create Listing'}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function Label({ text, sub }: { text: string; sub: string }) {
  return <Text style={[s.label, { color: sub }]}>{text}</Text>;
}

function DateField({ value, placeholder, onPress, onClear, inp, colors, sub }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.input, { backgroundColor: inp, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' }]}
    >
      <Ionicons name="calendar-outline" size={16} color={sub} style={{ marginRight: 6 }} />
      <Text style={{ flex: 1, fontSize: TYPO.body, color: value ? colors.textPrimary : sub }}>
        {value || placeholder}
      </Text>
      {value ? (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={16} color={sub} />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

function Input({ value, onChangeText, placeholder, inp, colors, sub, multiline, keyboardType }: any) {
  return (
    <TextInput
      style={[s.input, { backgroundColor: inp, color: colors.textPrimary, borderColor: colors.border, height: multiline ? 80 : undefined }]}
      value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor={sub} multiline={multiline} keyboardType={keyboardType}
      textAlignVertical={multiline ? 'top' : 'center'}
      returnKeyType={multiline ? 'default' : 'next'}
      autoCorrect={false}
      autoCapitalize={keyboardType === 'url' || keyboardType === 'email-address' || keyboardType === 'phone-pad' ? 'none' : 'sentences'}
    />
  );
}

const s = StyleSheet.create({
  scroll:       { padding: 16, paddingBottom: 48 },
  label:        { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6, marginTop: 14 },
  input:        { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: TYPO.body, marginBottom: 2 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip:         { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6 },
  chipText:     { fontSize: TYPO.body, fontWeight: '600' },
  imgPicker:    { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, height: 120, overflow: 'hidden', marginBottom: 4 },
  imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toggleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 10 },
  toggleLabel:  { fontSize: TYPO.body, fontWeight: '600' },
  saveBtn:      { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText:  { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' },
});
