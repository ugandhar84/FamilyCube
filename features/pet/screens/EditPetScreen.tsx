import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView, Modal, Switch, Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { supabase, uploadPetAvatar } from '@/lib/supabase';
import { updatePet as dbUpdatePet } from '@/lib/db';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import { SPECIES_EMOJI, TYPO} from '@/constants/theme';
import BottomSheet from '@/components/BottomSheet';
import { usePaywall } from '@/lib/hooks/usePaywall';
import { showUpgradeAlert } from '@/lib/subscription';
import { getPermissions } from '@/lib/permissions';
import { getSpeciesEnabled } from '@/lib/db/admin';
import { DatePickerField } from '@/features/pet/components/DatePickerField';
import { Section } from '@/features/pet/components/Section';
import { FieldRow, fr } from '@/features/pet/components/FieldRow';
import { BreedSelector } from '@/features/pet/components/BreedSelector';

const ALL_SPECIES = ['dog', 'cat', 'rabbit', 'horse', 'bird', 'fish', 'hamster', 'turtle', 'other'] as const;

const ACCENTS = [
  '#E8724A', '#F03E6E', '#C4647A', '#B85C8A',
  '#FF8C00', '#C47A2A', '#B8963C', '#6DB554',
  '#3D8B5E', '#2D9B8A', '#4896D8', '#6B8FCE',
];

export default function EditPetScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { pets, activePet, addPet, fetchPets, updatePet, deletePet, memorizePet } = usePetStore(useShallow(s => ({ pets: s.pets, activePet: s.activePet, addPet: s.addPet, fetchPets: s.fetchPets, updatePet: s.updatePet, deletePet: s.deletePet, memorizePet: s.memorizePet })));
  const { gate, tier } = usePaywall();
  const safeId = Array.isArray(id) ? id[0] : id;
  const pet = (safeId ? pets.find(p => p.id === safeId) : undefined) ?? activePet();

  const [speciesList, setSpeciesList] = useState<Array<{ value: string; label: string }>>([]);
  useEffect(() => {
    getSpeciesEnabled().then(map => {
      setSpeciesList(ALL_SPECIES.filter(sp => map[sp] !== false).map(sp => ({
        value: sp,
        label: sp.charAt(0).toUpperCase() + sp.slice(1),
      })));
    }).catch(() => {});
  }, []);

  const [name, setName]             = useState('');
  const [species, setSpecies]       = useState<string>('dog');
  const [breed, setBreed]           = useState('');
  const [birthday, setBirthday]     = useState('');
  const [adoptionDate, setAdoption] = useState('');
  const [gender, setGender]         = useState('');
  const [microchip, setMicrochip]   = useState('');
  const [coatColor, setCoatColor]   = useState('');
  const [neutered, setNeutered]     = useState(false);
  const [accentColor, setAccent]    = useState('#1D9E75');
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [confirmDob, setConfirmDob] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sanitizeName  = (t: string) => t.replace(/[^a-zA-Z0-9\s\-'.]/g, '').slice(0, 25);
  const sanitizeBreed = (t: string) => t.replace(/[^a-zA-Z\s\-'./&]/g, '').slice(0, 50);
  const sanitizeCoat  = (t: string) => t.replace(/[^a-zA-Z\s\-'./&]/g, '').slice(0, 30);
  const sanitizeChip  = (t: string) => t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 15);
  const clearErr      = (k: string) => setErrors(prev => { const n = { ...prev }; delete (n as any)[k]; return n; });

  useEffect(() => {
    if (pet) {
      setName(pet.name);
      setSpecies(pet.species);
      setBreed(pet.breed ?? '');
      setBirthday(pet.birthday ?? '');
      setAdoption(pet.adoption_date ?? '');
      setGender((pet as any).gender ?? '');
      setMicrochip((pet as any).microchip_id ?? '');
      setCoatColor((pet as any).color_coat ?? '');
      setNeutered((pet as any).neutered ?? false);
      setAccent((pet as any).accent_color ?? '#1D9E75');
      setUploadedUrl((pet as any).avatar_url ?? null);
    } else {
      setAdoption(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [pet?.id]);

  const pickAndUpload = useCallback(async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setShowPhotoPicker(false);
      showAlert('Permission needed', 'Please allow access in Settings.');
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'] as any,
        allowsEditing: true, aspect: [1, 1], quality: 0.85, base64: true,
      };
      await showPickerLoading(fromCamera ? 'Waiting for camera…' : 'Opening Gallery…');
      result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      hidePickerLoading();
    } catch (e: any) {
      setShowPhotoPicker(false);
      showAlert('Could not open ' + (fromCamera ? 'camera' : 'library'), e?.message);
      return;
    }
    setShowPhotoPicker(false);
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setLocalAvatar(asset.uri);
    setAvatarBusy(true);
    try {
      const url = await uploadPetAvatar(asset.uri, asset.base64 || null, asset.mimeType ?? 'image/jpeg', pet?.id);
      setUploadedUrl(url);
      setLocalAvatar(null);
    } catch (e: any) {
      setLocalAvatar(null);
      showAlert('Upload failed', e?.message ?? 'Could not upload photo.');
    } finally {
      setAvatarBusy(false);
    }
  }, [pet?.id]);

  const removePhoto = useCallback(() => {
    setShowPhotoPicker(false);
    setLocalAvatar(null);
    setUploadedUrl(null);
  }, []);

  const DELETE_REASONS = [
    { key: 'passed_away', label: 'Passed away', icon: '🌈' },
    { key: 'rehomed',     label: 'Rehomed / adopted out', icon: '🏠' },
    { key: 'lost',        label: 'Lost / missing', icon: '🔍' },
    { key: 'other',       label: 'Other reason', icon: '📝' },
  ] as const;

  const handleDeleteConfirm = async () => {
    if (!pet || !deleteReason) return;
    const nameMatch = confirmName.trim().toLowerCase() === pet.name.trim().toLowerCase();
    const dobMatch  = !pet.birthday || confirmDob === pet.birthday;
    if (!nameMatch || !dobMatch) {
      showAlert('Confirmation failed', 'Name or date of birth does not match. Please check and try again.');
      return;
    }
    setDeleting(true);

    const isPro = tier === 'pro' || tier === 'ultimate';
    if (deleteReason === 'passed_away' && !isPro) {
      setDeleting(false);
      showUpgradeAlert({
        title: 'Memorial is a Pro feature',
        message: `Preserve ${pet.name}'s photos, health records, and memories as a permanent memorial. Upgrade to Pro to unlock.`,
      });
      return;
    }
    const useMemorial = deleteReason === 'passed_away' && isPro;

    let ok = false;
    try {
      ok = useMemorial
        ? await memorizePet(pet.id, deleteReason)
        : await deletePet(pet.id);
    } catch {
      ok = false;
    } finally {
      setDeleting(false);
    }
    if (!ok) { showAlert('Error', 'Could not remove pet. Please try again.'); return; }

    setShowDeleteSheet(false);

    if (useMemorial) {
      showAlert(
        '🌈 Rainbow Bridge',
        `${pet.name}'s profile has been preserved as a memorial. You can still visit their photos, health records, and memories.`,
        [{ text: 'View memorial', onPress: () => router.replace('/(tabs)') }],
      );
    } else if (deleteReason === 'passed_away') {
      showAlert(
        '🌈 We\'re so sorry',
        `${pet.name} will always be in your heart. Their profile has been removed.\n\nUpgrade to Pro to preserve their memories forever.`,
        [{ text: 'Close', onPress: () => router.replace('/(tabs)') }],
      );
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    const trimName  = name.trim();
    const trimBreed = breed.trim();
    const trimChip  = microchip.trim();

    if (!trimName) {
      errs.name = 'Every baby needs a name — what do you call them?';
    } else if (trimName.length < 2) {
      errs.name = 'Name must be at least 2 characters.';
    }

    if (species !== 'bird' && !trimBreed) {
      errs.breed = 'Breed is required.';
    } else if (trimBreed && trimBreed.length < 2) {
      errs.breed = 'Please enter a valid breed.';
    }

    if (birthday && adoptionDate && new Date(adoptionDate) < new Date(birthday)) {
      errs.dates = 'Homecoming date cannot be before the birthday.';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const errorMsg = Object.values(errs).join('\n');
      showAlert('Cannot save', errorMsg);
      return;
    }
    setErrors({});
    setSaving(true);
    const user = useAuthStore.getState().user;
    if (!user) { setSaving(false); return; }
    const updates = {
      name: name.trim(), species: species as any,
      breed: breed.trim() || (species === 'bird' ? 'Other' : null), birthday: birthday || null,
      adoption_date: adoptionDate || format(new Date(), 'yyyy-MM-dd'),
      emoji: SPECIES_EMOJI[species] ?? '🐾', accent_color: accentColor,
      gender: gender || null, microchip_id: microchip.trim() || null,
      color_coat: coatColor.trim() || null,
      neutered, avatar_url: uploadedUrl ?? null,
    };
    try {
      Keyboard.dismiss();
      if (pet) {
        await dbUpdatePet(pet.id, updates);
        await fetchPets(user.id);
        router.back();
      } else {
        const allowed = await gate('pets', {
          title: 'Pet limit reached',
          message: `Your plan supports ${pets.length} pet${pets.length === 1 ? '' : 's'}. Upgrade to Pro to add more.`,
        });
        if (!allowed) { setSaving(false); return; }
        await addPet({ ...updates, owner_id: user.id, is_active: true } as any);
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Could not save pet.');
    } finally {
      setSaving(false);
    }
  };

  const displayAvatar = localAvatar ?? uploadedUrl;
  const ac = accentColor;
  const user = useAuthStore.getState().user;
  const petRole = pet ? ((pet as any).user_role ?? (pet.owner_id === user?.id ? 'owner' : 'viewer')) : 'owner';
  const perms = getPermissions(petRole);
  const inputStyle = [es.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }];
  const errTxt = { fontSize: TYPO.body, color: '#DC2626', marginTop: 4 } as const;
  const today = new Date();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── Compact edit header ── */}
      <View style={[es.header, {
        paddingTop: 8,
        paddingBottom: 12,
        backgroundColor: colors.card,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }]}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 10 }} />
        <View style={es.heroRow}>
          <TouchableOpacity onPress={() => setShowPhotoPicker(true)} disabled={avatarBusy} activeOpacity={0.8}>
            <View style={[es.avatarThumb, { borderColor: ac }]}>
              {displayAvatar
                ? <Image source={{ uri: displayAvatar }} cachePolicy="memory-disk" style={es.avatarImg} />
                : <View style={[es.avatarImg, { backgroundColor: `${ac}22`, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: TYPO.hero }}>{SPECIES_EMOJI[species] ?? '🐾'}</Text>
                  </View>
              }
              {avatarBusy
                ? <View style={es.avatarOverlay}><ActivityIndicator color="#fff" size="small" /></View>
                : <View style={[es.cameraBadge, { backgroundColor: ac }]}>
                    <Ionicons name="camera" size={11} color="#fff" />
                  </View>
              }
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1, paddingLeft: 12 }}>
            <Text style={[es.heroLabel, { color: colors.textSecondary ?? colors.textSecondary }]}>
              {pet ? 'Editing pet' : 'New pet'}
            </Text>
            <Text style={[es.heroName, { color: name ? colors.textPrimary : colors.placeholder }]} numberOfLines={1}>
              {name || 'Their name'}
            </Text>
            <Text style={[es.heroBreed, { color: breed ? colors.textSecondary : colors.placeholder }]} numberOfLines={1}>
              {breed || 'Breed'}
            </Text>
          </View>

          <TouchableOpacity onPress={() => router.back()} style={[es.closeBtn, { borderColor: colors.border }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Scrollable form ── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>

          <Section title="Basic info" colors={colors}>
            <FieldRow label="Name *" colors={colors}>
              <TextInput style={[inputStyle, errors.name && { borderColor: '#DC2626' }]}
                placeholder="e.g. Luna, Max, Coco"
                placeholderTextColor={colors.placeholder}
                value={name}
                onChangeText={t => { setName(sanitizeName(t)); clearErr('name'); }}
                maxLength={25}
                autoCapitalize="words"
                returnKeyType="done" />
              {!!errors.name && <Text style={errTxt}>{errors.name}</Text>}
            </FieldRow>

            <FieldRow label="Species (fixed)" colors={colors} borderTop>
              <View style={[es.chip, { backgroundColor: colors.inputBg, borderColor: colors.border, opacity: 0.7 }]}>
                <Text style={{ fontSize: TYPO.subheading }}>{SPECIES_EMOJI[species]}</Text>
                <Text style={[es.chipText, { color: colors.textSecondary }]}>
                  {species.charAt(0).toUpperCase() + species.slice(1)}
                </Text>
              </View>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 8 }}>
                Species cannot be changed after creation
              </Text>
            </FieldRow>

            <FieldRow label="Breed *" colors={colors} borderTop>
              <BreedSelector
                species={species}
                breed={breed}
                onBreedChange={(b) => { setBreed(b); clearErr('breed'); }}
                breedError={errors.breed}
                colors={colors}
                accentColor={ac}
              />
            </FieldRow>

            <FieldRow label="Gender" colors={colors} borderTop>
              <View style={es.segRow}>
                {[{ k: 'male', l: '♂  Male' }, { k: 'female', l: '♀  Female' }, { k: 'unknown', l: '○  Unknown' }].map(g => {
                  const active = gender === g.k;
                  return (
                    <TouchableOpacity key={g.k} onPress={() => setGender(g.k)} activeOpacity={0.7}
                      style={[es.seg, { flex: 1, backgroundColor: active ? ac : (colors.inputBg ?? colors.card), borderColor: active ? ac : colors.border }]}>
                      <Text style={[es.chipText, { color: active ? '#fff' : colors.textSecondary, fontWeight: active ? '700' : '500' }]}>{g.l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </FieldRow>
          </Section>

          <Section title="Theme color" colors={colors}>
            <View style={{ padding: 16 }}>
              <View style={es.colorGrid}>
                {ACCENTS.map(c => {
                  const sel = accentColor === c;
                  return (
                    <TouchableOpacity key={c} onPress={() => setAccent(c)} activeOpacity={0.75}
                      style={[es.colorWrap, sel && { borderColor: c, borderWidth: 2.5 }]}>
                      <View style={[es.colorSwatch, { backgroundColor: c }]}>
                        {sel && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Section>

          <Section title="Details" colors={colors}>
            <FieldRow label="Coat colour" colors={colors} borderTop>
              <View style={{ gap: 8 }}>
                <TextInput style={inputStyle} placeholder="e.g. Golden, Black & white, Tabby"
                  placeholderTextColor={colors.placeholder} value={coatColor}
                  onChangeText={t => setCoatColor(sanitizeCoat(t))}
                  autoCapitalize="words" returnKeyType="done" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {['Black', 'White', 'Brown', 'Golden', 'Grey', 'Cream', 'Orange', 'Tabby', 'Tri-colour', 'Brindle', 'Spotted', 'Merle'].map(c => (
                    <TouchableOpacity key={c} onPress={() => setCoatColor(c)} activeOpacity={0.7}
                      style={[es.chip, {
                        backgroundColor: coatColor === c ? ac : (colors.inputBg ?? colors.card),
                        borderColor: coatColor === c ? ac : colors.border,
                        paddingHorizontal: 10, paddingVertical: 6,
                      }]}>
                      <Text style={{ fontSize: TYPO.body, color: coatColor === c ? '#fff' : colors.textSecondary,
                        fontWeight: coatColor === c ? '700' : '500' }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </FieldRow>

            <FieldRow label="Birthday" colors={colors} borderTop>
              <DatePickerField
                value={birthday} onChange={setBirthday}
                placeholder="Select birthday"
                ac={ac}
                maxDate={today}
              />
            </FieldRow>

            <FieldRow label="Homecoming date" colors={colors} borderTop>
              <View style={{ gap: 4 }}>
                <DatePickerField
                  value={adoptionDate} onChange={d => { setAdoption(d); clearErr('dates'); }}
                  placeholder="Select homecoming date"
                  ac={ac}
                  maxDate={today}
                  minDate={birthday ? new Date(birthday) : undefined}
                />
                {!!errors.dates && <Text style={errTxt}>{errors.dates}</Text>}
              </View>
            </FieldRow>
          </Section>

          <Section title="Identity" colors={colors}>
            <View style={[fr.wrap, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 }]}>
              <View>
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>Neutered / spayed</Text>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary, marginTop: 2 }}>
                  {neutered ? 'Yes, already done' : 'Not yet'}
                </Text>
              </View>
              <Switch value={neutered} onValueChange={setNeutered}
                trackColor={{ false: colors.border, true: `${ac}80` }}
                thumbColor={neutered ? ac : (colors.textTertiary ?? '#999')} />
            </View>
          </Section>

          {/* ── Danger zone ── */}
          {pet && perms.canDeletePet && (
            <View style={{ marginTop: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#DC2626',
                textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 4, marginBottom: 8 }}>
                Danger zone
              </Text>
              <TouchableOpacity
                onPress={() => { setDeleteReason(''); setConfirmName(''); setConfirmDob(''); setShowDeleteSheet(true); }}
                style={{ backgroundColor: isDark ? 'rgba(220,38,38,0.1)' : '#FEF2F2', borderRadius: 16, borderWidth: 1.5,
                  borderColor: isDark ? 'rgba(220,38,38,0.35)' : '#FECACA', paddingVertical: 16, paddingHorizontal: 18,
                  flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? 'rgba(220,38,38,0.2)' : '#FEE2E2',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#DC2626' }}>Remove pet</Text>
                  <Text style={{ fontSize: TYPO.body, color: '#EF4444', marginTop: 2 }}>
                    Permanently delete {pet.name}'s profile
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Floating Save FAB ── */}
      <View style={[es.fabWrap, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity onPress={handleSave} disabled={saving || avatarBusy} activeOpacity={0.88}
          style={[es.fab, { backgroundColor: ac, opacity: (saving || avatarBusy) ? 0.75 : 1 }]}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={es.fabText}>{pet ? 'Save changes' : 'Bring them home 🏠'}</Text>
              </>
          }
        </TouchableOpacity>
      </View>

      {/* ── Remove pet bottom sheet ── */}
      <BottomSheet visible={showDeleteSheet} onClose={() => setShowDeleteSheet(false)} title={`Remove ${pet?.name ?? 'pet'}`}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{
          flexDirection: 'row', alignItems: 'flex-start', gap: 10,
          backgroundColor: isDark ? 'rgba(220,38,38,0.12)' : '#FEF2F2',
          borderWidth: 1, borderColor: isDark ? 'rgba(220,38,38,0.35)' : '#FECACA',
          borderRadius: 12, padding: 12, marginBottom: 16,
        }}>
          <Ionicons name="warning-outline" size={18} color="#DC2626" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#DC2626', marginBottom: 2 }}>
              This action is irreversible
            </Text>
            <Text style={{ fontSize: TYPO.body, color: isDark ? '#FCA5A5' : '#991B1B', lineHeight: 18 }}>
              All of {pet?.name}'s photos, health records, memories, and data will be permanently erased.
              There is no way to recover this information once deleted. Please make this decision carefully.
            </Text>
          </View>
        </View>

        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>
          Select a reason, then confirm {pet?.name}'s name and date of birth to proceed.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {DELETE_REASONS.map(r => {
            const active = deleteReason === r.key;
            return (
              <TouchableOpacity
                key={r.key}
                onPress={() => setDeleteReason(r.key)}
                activeOpacity={0.75}
                style={{
                  width: '47%',
                  alignItems: 'center',
                  paddingVertical: 18,
                  paddingHorizontal: 8,
                  borderRadius: 16,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? '#DC2626' : colors.border,
                  backgroundColor: active
                    ? (isDark ? 'rgba(220,38,38,0.15)' : '#FEF2F2')
                    : colors.card,
                }}
              >
                <Text style={{ fontSize: TYPO.hero, marginBottom: 8 }}>{r.icon}</Text>
                <Text style={{
                  fontSize: TYPO.body, fontWeight: active ? '700' : '500',
                  color: active ? '#EF4444' : colors.textPrimary,
                  textAlign: 'center', lineHeight: 17,
                }}>
                  {r.label}
                </Text>
                {active && (
                  <Ionicons name="checkmark-circle" size={16} color="#EF4444" style={{ marginTop: 6 }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ gap: 12, marginBottom: 20 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>
            To confirm, type {pet?.name}'s name and date of birth
          </Text>

          <TextInput
            value={confirmName}
            onChangeText={setConfirmName}
            placeholder={`Enter ${pet?.name ?? 'pet name'} exactly`}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="words"
            style={{
              height: 48, borderRadius: 12, paddingHorizontal: 14,
              fontSize: TYPO.body, borderWidth: 1,
              borderColor: confirmName.trim().toLowerCase() === (pet?.name ?? '').trim().toLowerCase() && confirmName.length > 0
                ? '#22C55E' : colors.inputBorder,
              backgroundColor: colors.inputBg, color: colors.textPrimary,
            }}
          />

          {!!pet?.birthday && (
            <DatePickerField
              value={confirmDob}
              onChange={setConfirmDob}
              placeholder="Select date of birth"
              ac={confirmDob === pet.birthday ? '#22C55E' : '#DC2626'}
              maxDate={new Date()}
            />
          )}
        </View>

        {(() => {
          const nameOk = confirmName.trim().toLowerCase() === (pet?.name ?? '').trim().toLowerCase() && confirmName.length > 0;
          const dobOk  = !pet?.birthday || confirmDob === pet.birthday;
          const canDelete = !!deleteReason && nameOk && dobOk;
          return (
            <TouchableOpacity
              onPress={handleDeleteConfirm}
              disabled={!canDelete || deleting}
              style={{
                height: 52, borderRadius: 16, alignItems: 'center',
                justifyContent: 'center', flexDirection: 'row', gap: 8,
                backgroundColor: canDelete ? '#DC2626' : colors.inputBg,
                opacity: deleting ? 0.7 : 1, marginBottom: 8,
              }}>
              {deleting
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="trash-outline" size={18} color={canDelete ? '#fff' : colors.textTertiary} />
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: canDelete ? '#fff' : colors.textTertiary }}>
                      Confirm removal
                    </Text>
                  </>
              }
            </TouchableOpacity>
          );
        })()}

        <TouchableOpacity onPress={() => setShowDeleteSheet(false)}
          style={[es.sheetCancel, { borderColor: colors.border, marginTop: 4 }]}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
        </TouchableOpacity>
        </ScrollView>
      </BottomSheet>

      {/* ── Photo picker bottom sheet ── */}
      <BottomSheet visible={showPhotoPicker} onClose={() => setShowPhotoPicker(false)} title="Pet photo">
            <TouchableOpacity style={[es.sheetBtn, { backgroundColor: ac }]} onPress={() => pickAndUpload(true)}>
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={es.sheetBtnText}>Take a photo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[es.sheetBtn, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: ac }]} onPress={() => pickAndUpload(false)}>
              <Ionicons name="images-outline" size={20} color={ac} />
              <Text style={[es.sheetBtnText, { color: ac }]}>Choose from library</Text>
            </TouchableOpacity>

            {(localAvatar || uploadedUrl) && (
              <TouchableOpacity style={[es.sheetBtn, { backgroundColor: '#FEE2E2' }]} onPress={removePhoto}>
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
                <Text style={[es.sheetBtnText, { color: '#DC2626' }]}>Remove photo</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[es.sheetCancel, { borderColor: colors.border }]} onPress={() => setShowPhotoPicker(false)}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
      </BottomSheet>
    </View>
  );
}

const es = StyleSheet.create({
  breedDropdown: { borderWidth: 1, borderRadius: 10, marginTop: 4, overflow: 'hidden',
                   shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  breedOption:   { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  header:       { paddingHorizontal: 16 },
  heroRow:      { flexDirection: 'row', alignItems: 'center' },
  closeBtn:     { width: 34, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth,
                  alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  avatarThumb:  { width: 72, height: 72, borderRadius: 22, borderWidth: 2.5, padding: 2.5, position: 'relative' },
  avatarImg:    { width: '100%', height: '100%', borderRadius: 18 },
  avatarOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 18,
                  alignItems: 'center', justifyContent: 'center' },
  cameraBadge:  { position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: 11,
                  alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  heroLabel:    { fontSize: TYPO.body, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  heroName:     { fontSize: TYPO.heading, fontWeight: '800', letterSpacing: -0.3 },
  heroBreed:    { fontSize: TYPO.body, marginTop: 3, fontWeight: '500' },
  accentDot:    { width: 10, height: 10, borderRadius: 5, marginLeft: 10 },

  input:        { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: TYPO.body },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5 },
  chipText:     { fontSize: TYPO.body },
  segRow:       { flexDirection: 'row', gap: 8 },
  seg:          { paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  colorGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorWrap:    { width: 44, height: 44, borderRadius: 22, padding: 3, borderWidth: 0, borderColor: 'transparent' },
  colorSwatch:  { flex: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  fabWrap:      { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12 },
  fab:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: 28,
                  shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabText:      { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },

  sheetBtn:     { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, paddingHorizontal: 18, borderRadius: 16, marginBottom: 10 },
  sheetBtnText: { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
  sheetCancel:  { height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
