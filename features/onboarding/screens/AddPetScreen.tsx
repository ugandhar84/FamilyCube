import { showAlert } from '@/components/AppAlert';
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView, Modal, Switch, Animated, InteractionManager,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { Ionicons } from '@expo/vector-icons';
import { todayLocal } from '@/lib/dates';
import { format, parseISO, isValid } from 'date-fns';
import { supabase, uploadPetAvatar } from '@/lib/supabase';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/lib/ThemeContext';
import { SPECIES_EMOJI, SPECIES_EMOJIS, BREED_EMOJI_MAP , TYPO } from '@/constants/theme';
import { PetSvg, SPECIES_COLORS } from '@/components/ui/PetSvg';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { usePaywallSheetStore } from '@/store/paywallSheetStore';
import { isRevenueCatReady, hasRealOfferings } from '@/lib/subscription';
import { getSpeciesEnabled } from '@/lib/db/admin';
import { GroomScheduleStep } from '@/features/onboarding/components/GroomScheduleStep';
import { PetQuizStep } from '@/features/onboarding/components/PetQuizStep';
import { ProcessingAnimation } from '@/features/onboarding/components/ProcessingAnimation';
import { DatePickerField } from '@/features/onboarding/components/DatePickerField';
import { SectionCard } from '@/features/onboarding/components/SectionCard';
import { FieldRow } from '@/features/onboarding/components/FieldRow';
import { BreedSelector } from '@/features/pet/components/BreedSelector';

// ── Screen-level constants ────────────────────────────────────────────────────

const ALL_SPECIES_LIST = [
  { value: 'dog',     label: 'Dog' },
  { value: 'cat',     label: 'Cat' },
  { value: 'rabbit',  label: 'Rabbit' },
  { value: 'horse',   label: 'Horse' },
  { value: 'bird',    label: 'Bird' },
  { value: 'fish',    label: 'Fish' },
  { value: 'hamster', label: 'Hamster' },
  { value: 'turtle',  label: 'Turtle' },
  { value: 'other',   label: 'Other' },
];

const GENDER_OPTIONS = [
  { value: 'male',    label: '♂  Male' },
  { value: 'female',  label: '♀  Female' },
  { value: 'unknown', label: '○  Unknown' },
] as const;

const ACCENT_COLORS = [
  '#E8724A', '#F03E6E', '#C4647A', '#B85C8A',
  '#FF8C00', '#C47A2A', '#B8963C', '#6DB554',
  '#3D8B5E', '#2D9B8A', '#4896D8', '#6B8FCE',
];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AddPetScreen() {
  const insets = useSafeAreaInsets();
  const { fetchPets, setActivePet } = usePetStore(useShallow(s => ({ fetchPets: s.fetchPets, setActivePet: s.setActivePet })));
  const { colors, isDark } = useTheme();
  const { tier } = useSubscriptionStore();
  const { show: showPaywallSheet } = usePaywallSheetStore();

  // Multi-step flow: 0 = pet form, 1 = concerns quiz, 2 = groom schedule, 3 = processing
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  // True when paywall is shown mid-quiz so we advance to step 2 on close
  const pendingStep2 = useRef(false);
  const saveInProgress = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);

  const [rcAvailable, setRcAvailable] = useState(true);
  useEffect(() => {
    if (!isRevenueCatReady()) { setRcAvailable(false); return; }
    hasRealOfferings().then(ok => { if (!ok) setRcAvailable(false); });
  }, []);

  const [speciesList, setSpeciesList] = useState(ALL_SPECIES_LIST);
  useEffect(() => {
    getSpeciesEnabled().then(map => {
      setSpeciesList(ALL_SPECIES_LIST.filter(sp => map[sp.value] !== false));
    }).catch(() => {});
  }, []);

  const [name,          setName]          = useState('');
  const [species,       setSpecies]       = useState<string>('dog');
  const [breed,         setBreed]         = useState('');
  const [birthday,      setBirthday]      = useState('');
  const [adoptionDate,  setAdoptionDate]  = useState('');
  const [gender,        setGender]        = useState<string>('unknown');
  const [neutered,      setNeutered]      = useState(false);
  const [microchipId,   setMicrochipId]   = useState('');
  const [coatColor,     setCoatColor]     = useState('');
  const [accentColor,   setAccentColor]   = useState(SPECIES_COLORS['dog'] ?? ACCENT_COLORS[0]);
  const [photoUri,      setPhotoUri]      = useState<string | null>(null);
  const [photoMime,     setPhotoMime]     = useState<string>('image/jpeg');
  const [photoBase64,   setPhotoBase64]   = useState<string | null>(null);
  const [selectedEmoji, setSelectedEmoji] = useState<string>(SPECIES_EMOJI['dog']);
  const [quizConcerns,  setQuizConcerns]  = useState<string[]>([]);
  const [groomSchedule, setGroomSchedule] = useState<Record<string, number>>({});
  const [dateError,     setDateError]     = useState('');
  const [nameError,     setNameError]     = useState('');
  const [breedError,    setBreedError]    = useState('');

  // Restore scroll position after date picker closes — iOS resets scroll on state-triggered re-render
  useEffect(() => {
    if (scrollYRef.current > 10) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: scrollYRef.current, animated: false });
      });
    }
  }, [birthday, adoptionDate]);

  const speciesEmojis = SPECIES_EMOJIS[species] ?? ['🐾'];
  const today = new Date();

  // Breed-specific emoji suggestions — matches by keyword substring
  const breedSuggestions = useMemo(() => {
    const key = breed.toLowerCase().trim();
    if (!key) return null;
    for (const [k, emojis] of Object.entries(BREED_EMOJI_MAP)) {
      if (key === k || key.includes(k) || k.includes(key)) {
        return { label: breed.trim(), emojis };
      }
    }
    return null;
  }, [breed]);

  const handleSpeciesChange = (sp: string) => {
    setSpecies(sp);
    setBreed(''); // clear breed when species changes
    setSelectedEmoji(SPECIES_EMOJI[sp] ?? '🐾');
    setAccentColor(SPECIES_COLORS[sp] ?? ACCENT_COLORS[0]);
  };

  const inputStyle = [ap.input, {
    backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary,
  }];

  const openPhotoPicker = () => {
    // Use native Alert.alert here — custom showAlert (AppAlert modal) can be obscured
    // by the iOS sheet presentation layer and never appear above the modal.
    const buttons = [
      {
        text: 'Camera',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access in Settings.'); return; }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true,
            });
            if (!result.canceled && result.assets.length > 0) {
              const asset = result.assets[0];
              setPhotoUri(asset.uri);
              setPhotoMime(asset.mimeType ?? 'image/jpeg');
              setPhotoBase64(asset.base64 ?? null);
            }
          } catch (e: any) {
            console.error('[PhotoPicker] Camera error:', e);
            if (e?.message?.includes('native module') || e?.message?.includes('ExponentImagePicker')) {
              Alert.alert('Dev build required', 'Run: npx expo run:ios to use photo features.');
            } else {
              Alert.alert('Error', e?.message ?? 'Could not open camera.');
            }
          }
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access in Settings.'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true,
            });
            if (!result.canceled && result.assets.length > 0) {
              const asset = result.assets[0];
              setPhotoUri(asset.uri);
              setPhotoMime(asset.mimeType ?? 'image/jpeg');
              setPhotoBase64(asset.base64 ?? null);
            }
          } catch (e: any) {
            console.error('[PhotoPicker] Library error:', e);
            if (e?.message?.includes('native module') || e?.message?.includes('ExponentImagePicker')) {
              Alert.alert('Dev build required', 'Run: npx expo run:ios to use photo features.');
            } else {
              Alert.alert('Error', e?.message ?? 'Could not open photo library.');
            }
          }
        },
      },
      ...(photoUri ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => { setPhotoUri(null); setPhotoBase64(null); } }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert('Pet photo', 'Choose how to add a photo', buttons);
  };

  const handleBirthdayChange = (iso: string) => {
    setBirthday(iso);
    if (adoptionDate && iso && new Date(adoptionDate) < new Date(iso)) {
      setAdoptionDate('');
      setDateError('Homecoming date must be on or after the birthday — please pick again.');
    } else {
      setDateError('');
    }
  };

  const handleAdoptionDateChange = (iso: string) => {
    if (birthday && iso && new Date(iso) < new Date(birthday)) {
      setDateError('Homecoming date cannot be before the birthday.');
      // Don't set the date — keep field empty so the error is the only feedback
    } else {
      setDateError('');
      setAdoptionDate(iso);
    }
  };

  // Paywall shown after quiz (Continue or Skip) — messaging matches the next upgrade step
  const paywallAfterQuiz = async (nextStep: 0 | 1 | 2 | 3 = 2) => {
    pendingStep2.current = true;
    const isPro = tier === 'pro';
    const vetExamples = [
      { cost: '$180–$350', visit: 'limping leg at 11 pm' },
      { cost: '$200–$500', visit: 'vomiting episode on a Sunday' },
      { cost: '$150–$300', visit: '"is this lump serious?" check-up' },
      { cost: '$250–$600', visit: 'swallowed something unknown' },
      { cost: '$175–$400', visit: 'eye discharge at midnight' },
      { cost: '$120–$280', visit: 'not eating for two days' },
      { cost: '$300–$700', visit: 'skin rash that won\'t clear up' },
      { cost: '$160–$380', visit: 'coughing fit on a holiday' },
    ];
    const { cost, visit } = vetExamples[Math.floor(Math.random() * vetExamples.length)];
    showPaywallSheet(
      isPro
        ? {
            headline: "🩺 24/7 Virtual Vet Care For Every 'What If?' Moment",
            body: `A ${visit} costs ${cost} at the emergency clinic. PetDoc AI gives ${name.trim() || 'your baby'} expert triage in seconds — any time, any night.`,
            perks: ['Unlimited 24/7 PetDoc AI vet chat', 'AI Symptom Scanner — 3 photo scans/day', 'Upgrade from Pro · Apple credits unused Pro time'],
            onClose: () => { if (pendingStep2.current) { pendingStep2.current = false; setStep(nextStep); } },
          }
        : {
            headline: `🐾 Give ${name.trim() || 'Your Baby'} the Care They Deserve`,
            body: 'Unlock unlimited health records, up to 5 pet profiles, and full lifetime history — all in one place.',
            perks: ['Up to 5 pet profiles', 'Unlimited health records & history', 'Full expense tracking', 'Family & caretaker sharing', '7-day free trial — cancel anytime'],
            onClose: () => { if (pendingStep2.current) { pendingStep2.current = false; setStep(nextStep); } },
          },
    );
  };

  const handleSkipQuiz = () => {
    if (tier !== 'ultimate') {
      paywallAfterQuiz().catch(() => setStep(2));
    } else {
      setStep(2);
    }
  };

  // After paywall, go to groom schedule (not straight to processing)
  // Override pendingStep2 to advance to step 2 (groom) not 3 (processing)
  // We re-use paywallAfterQuiz but intercept via pendingStep2 flag behavior

  // Step 0 → Step 1: validate only, no DB write yet
  const handleNext = () => {
    setNameError('');
    setBreedError('');

    const trimmedName = name.trim();
    if (!trimmedName) { setNameError('Every baby deserves a name'); return; }
    if (trimmedName.length < 2) { setNameError('Name needs at least 2 characters'); return; }

    // For birds, default to "Other" if breed not filled; for others, require breed
    const finalBreed = species === 'bird' ? (breed.trim() || 'Other') : breed.trim();
    if (!finalBreed) { setBreedError('Adding a breed helps us find the right community'); return; }
    setBreed(finalBreed);

    if (dateError) return;
    if (birthday && adoptionDate && new Date(adoptionDate) < new Date(birthday)) {
      setDateError('Homecoming date cannot be before the birthday.');
      return;
    }
    setStep(1);
  };

  // Single DB write — called once from the processing animation
  const handleFinalSave = async (concerns: string[]) => {
    console.log('[AddPet] handleFinalSave start, saveInProgress:', saveInProgress.current);
    if (saveInProgress.current) return;
    saveInProgress.current = true;
    try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('[AddPet] auth user:', user?.id, 'authError:', authError?.message);
    if (authError || !user) {
      showAlert('Authentication error', authError?.message ?? 'Could not verify your session. Please sign in again.');
      router.dismissAll();
      return;
    }

    await supabase.from('profiles').upsert(
      { id: user.id, full_name: user.user_metadata?.full_name ?? null },
      { onConflict: 'id' }
    );

    let avatar_url: string | null = null;
    if (photoUri) {
      try { avatar_url = await uploadPetAvatar(photoUri, photoBase64, photoMime); }
      catch {}
    }

    const { data: pet, error } = await supabase.from('pets').insert({
      owner_id: user.id,
      name: name.trim(), species,
      breed: breed.trim() || null,
      birthday: birthday || null,
      adoption_date: adoptionDate || todayLocal(),
      gender, neutered,
      microchip_id: microchipId.trim() || null,
      color_coat: coatColor.trim() || null,
      accent_color: accentColor,
      avatar_url,
      emoji: selectedEmoji,
      quiz_concerns: concerns.length ? concerns : null,
    }).select().single();

    console.log('[AddPet] pet insert result — id:', pet?.id, 'error:', error?.message);
    if (error) { showAlert('Error', error.message ?? 'Could not save. Please try again.'); saveInProgress.current = false; return; }
    if (pet) {
      // Save groom schedule if user set it
      if (Object.keys(groomSchedule).length > 0) {
        const rows = Object.entries(groomSchedule).map(([type, interval_days]) => ({
          pet_id: pet.id, type, interval_days,
        }));
        await supabase.from('pet_groom_settings').upsert(rows, { onConflict: 'pet_id,type' });
      }
      // Dismiss first, then defer store updates until all dismiss animations
      // have fully settled — prevents touch-blocking on the home screen.
      router.dismissAll();
      InteractionManager.runAfterInteractions(() => {
        setActivePet(pet.id);
        fetchPets(user.id).catch(() => {});
      });
    }
    } catch (e: any) {
      saveInProgress.current = false;
      showAlert('Error', e?.message ?? 'Could not save your pet. Please try again.');
    }
  };

  const finishFlow = () => {
    console.log('[AddPet] finishFlow called, quizConcerns:', quizConcerns);
    handleFinalSave(quizConcerns).catch((e: any) => {
      showAlert('Error', e?.message ?? 'Could not save pet.');
    });
  };

  // Progress dot helper
  const ProgressDots = ({ current, total }: { current: number; total: number }) => (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{
          height: 4, borderRadius: 2,
          backgroundColor: i < current ? accentColor : accentColor + '30',
          width: i < current ? 28 : 14,
        }} />
      ))}
    </View>
  );

  // Step 1: Health concerns quiz
  if (step === 1) {
    return (
      <SafeAreaView style={[ap.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={[ap.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setStep(0)} style={[ap.closeBtn, { borderColor: colors.border }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <ProgressDots current={1} total={3} />
          </View>
          <TouchableOpacity onPress={handleSkipQuiz} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary, fontWeight: '500' }}>Skip</Text>
          </TouchableOpacity>
        </View>
        <PetQuizStep
          petName={name.trim()}
          species={species}
          accentColor={accentColor}
          btnLabel="Next →"
          onFinish={(concerns) => {
            setQuizConcerns(concerns);
            setStep(2); // always go to groom schedule next
          }}
          onSkip={handleSkipQuiz}
        />
      </SafeAreaView>
    );
  }

  // Step 2: Care schedule (groom intervals) — species-specific, always shown
  if (step === 2) {
    return (
      <SafeAreaView style={[ap.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={[ap.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setStep(1)} style={[ap.closeBtn, { borderColor: colors.border }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <ProgressDots current={2} total={3} />
          </View>
          <TouchableOpacity onPress={() => setStep(3)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary, fontWeight: '500' }}>Skip</Text>
          </TouchableOpacity>
        </View>
        <GroomScheduleStep
          petName={name.trim()}
          species={species}
          accentColor={accentColor}
          onFinish={(schedule) => {
            setGroomSchedule(schedule);
            setStep(3);
          }}
          onSkip={() => setStep(3)}
        />
      </SafeAreaView>
    );
  }

  // Step 3: Processing animation + save
  if (step === 3) {
    return (
      <SafeAreaView style={[ap.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <ProcessingAnimation petName={name.trim()} accentColor={accentColor} onDone={finishFlow} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[ap.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* ── Header ── */}
        <View style={[ap.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}
            style={[ap.closeBtn, { borderColor: colors.border }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[ap.headerTitle, { color: colors.textPrimary }]}>Add your baby</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        >
          {/* ── Avatar hero — gradient uses the live accent color ── */}
          <LinearGradient
            colors={[accentColor, accentColor + '99', colors.background]}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={ap.heroGrad}
          >
            <TouchableOpacity onPress={openPhotoPicker} activeOpacity={0.85} style={ap.avatarWrap}>
              {/* Separate relative container so the badge is anchored to the circle, not the hint text */}
              <View style={ap.avatarCircleWrap}>
                <View style={[ap.avatarCircle, { borderColor: 'rgba(255,255,255,0.6)' }]}>
                  {photoUri
                    ? <Image source={{ uri: photoUri }} cachePolicy="memory-disk" style={ap.avatarPhoto} />
                    : <LinearGradient colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']} style={ap.avatarGrad}>
                        <PetSvg species={species} size={64} color="#fff" />
                        <Text style={ap.avatarEmoji}>{selectedEmoji}</Text>
                      </LinearGradient>
                  }
                </View>
                <View style={[ap.cameraBadge, { backgroundColor: accentColor }]}>
                  <Ionicons name={photoUri ? 'pencil' : 'camera'} size={12} color="#fff" />
                </View>
              </View>
              <Text style={ap.avatarHint}>{photoUri ? 'Tap to change' : 'Add a photo'}</Text>
            </TouchableOpacity>

            <Text style={ap.heroName} numberOfLines={1}>
              {name.trim() || 'Your new baby'}
            </Text>
          </LinearGradient>

          {/* ── Form ── */}
          <View style={ap.formWrap}>

            {/* ── 1. Visual identity ── */}
            <SectionCard title="Visual identity" colors={colors}>

              {/* Species */}
              <FieldRow label="Species" colors={colors}>
                <View style={ap.speciesGrid}>
                  {speciesList.map((sp) => {
                    const sel = species === sp.value;
                    const spColor = SPECIES_COLORS[sp.value] ?? colors.primary;
                    return (
                      <TouchableOpacity key={sp.value}
                        style={[ap.speciesBtn, { borderColor: sel ? spColor : colors.border, backgroundColor: sel ? spColor + '18' : colors.inputBg }]}
                        onPress={() => handleSpeciesChange(sp.value)}>
                        <PetSvg species={sp.value} size={30} color={sel ? spColor : colors.textTertiary} />
                        <Text style={[ap.speciesBtnLabel, { color: sel ? spColor : colors.textTertiary, fontWeight: sel ? '700' : '500' }]}>
                          {sp.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </FieldRow>

              {/* Theme color — RIGHT after species so user sees it change */}
              <FieldRow label="Theme color" colors={colors} top>
                <View style={ap.colorGrid}>
                  {ACCENT_COLORS.map((c) => {
                    const sel = accentColor === c;
                    return (
                      <TouchableOpacity key={c} onPress={() => setAccentColor(c)} activeOpacity={0.75}
                        style={[ap.colorWrap, sel && { borderColor: c, borderWidth: 2.5 }]}>
                        <View style={[ap.colorSwatch, { backgroundColor: c }]}>
                          {sel && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </FieldRow>
            </SectionCard>

            {/* ── 2. About ── */}
            <SectionCard title="Tell us about them" colors={colors}>
              <FieldRow label="Their name *" colors={colors}>
                <View>
                  <TextInput style={[inputStyle, nameError ? { borderColor: '#E24B4A', borderWidth: 1.5 } : {}]}
                    placeholder="e.g. Luna, Max, Mochi"
                    placeholderTextColor={colors.placeholder}
                    value={name} onChangeText={t => { setName(t.replace(/[^a-zA-Z0-9\s\-'.]/g, '')); if (nameError) setNameError(''); }} maxLength={25} />
                  {nameError && <Text style={{ fontSize: TYPO.caption, color: '#E24B4A', marginTop: 4 }}>{nameError}</Text>}
                </View>
              </FieldRow>

              <FieldRow label="Breed *" colors={colors} top>
                <BreedSelector
                  species={species}
                  breed={breed}
                  onBreedChange={(text) => { setBreed(text); if (breedError) setBreedError(''); }}
                  breedError={breedError}
                  colors={colors}
                  accentColor={accentColor}
                />
              </FieldRow>

              {/* Coat / body color */}
              <FieldRow label="Body / coat color" colors={colors} top>
                <View style={{ gap: 8 }}>
                  <TextInput style={inputStyle}
                    placeholder="e.g. Golden, Black & white, Tabby"
                    placeholderTextColor={colors.placeholder}
                    value={coatColor} onChangeText={t => setCoatColor(t.replace(/[^a-zA-Z\s\-'./&]/g, ''))} />
                  <View style={ap.coatChipRow}>
                    {['Black','White','Brown','Golden','Grey','Cream','Orange','Tabby','Tri-colour','Brindle','Spotted','Merle'].map(c => {
                      const active = coatColor === c;
                      return (
                        <TouchableOpacity key={c} onPress={() => setCoatColor(active ? '' : c)} activeOpacity={0.7}
                          style={[ap.coatChip, {
                            backgroundColor: active ? accentColor : colors.inputBg,
                            borderColor:     active ? accentColor : colors.border,
                          }]}>
                          <Text style={{ fontSize: TYPO.body, fontWeight: active ? '700' : '500',
                            color: active ? '#fff' : colors.textSecondary }}>
                            {c}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </FieldRow>

              {/* Emoji picker — sits right after breed so suggestions are contextual */}
              <FieldRow label={`Pick an emoji${name.trim() ? ` for ${name.trim()}` : ''}`} colors={colors} top>
                <View style={{ gap: 10 }}>
                  {/* Breed-specific suggestions row */}
                  {breedSuggestions && (
                    <View>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: accentColor, marginBottom: 7 }}>
                        ✨ Suggested for {breedSuggestions.label}
                      </Text>
                      <View style={ap.emojiRow}>
                        {breedSuggestions.emojis.map((em) => {
                          const sel = selectedEmoji === em;
                          return (
                            <TouchableOpacity key={'s-' + em}
                              style={[ap.emojiBtn, {
                                backgroundColor: sel ? accentColor + '30' : accentColor + '12',
                                borderColor: sel ? accentColor : accentColor + '50',
                                borderWidth: sel ? 2 : 1.5,
                              }]}
                              onPress={() => setSelectedEmoji(em)}>
                              <Text style={{ fontSize: TYPO.title }}>{em}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 10 }} />
                    </View>
                  )}

                  {/* All species emojis */}
                  <View style={ap.emojiRow}>
                    {speciesEmojis.map((em, idx) => {
                      const sel = selectedEmoji === em;
                      return (
                        <TouchableOpacity key={`emoji-${idx}`}
                          style={[ap.emojiBtn, {
                            backgroundColor: sel ? accentColor + '22' : colors.inputBg,
                            borderColor: sel ? accentColor : colors.border,
                            borderWidth: sel ? 2 : 1.5,
                          }]}
                          onPress={() => setSelectedEmoji(em)}>
                          <Text style={{ fontSize: TYPO.title }}>{em}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </FieldRow>

              <FieldRow label="Gender" colors={colors} top>
                <View style={ap.segRow}>
                  {GENDER_OPTIONS.map((g) => {
                    const active = gender === g.value;
                    return (
                      <TouchableOpacity key={g.value}
                        style={[ap.seg, {
                          backgroundColor: active ? accentColor : colors.inputBg,
                          borderColor: active ? accentColor : colors.border,
                        }]}
                        onPress={() => setGender(g.value)}>
                        <Text style={[ap.segText, { color: active ? '#fff' : colors.textSecondary, fontWeight: active ? '700' : '500' }]}>
                          {g.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </FieldRow>
            </SectionCard>

            {/* ── 3. Life dates ── */}
            <SectionCard title="Their story" colors={colors}>
              <FieldRow label="Birthday 🎂" colors={colors}>
                <DatePickerField
                  value={birthday} onChange={handleBirthdayChange}
                  placeholder="When were they born?"
                  ac={accentColor} maxDate={today}
                />
              </FieldRow>

              <FieldRow label="Homecoming date" colors={colors} top>
                <DatePickerField
                  value={adoptionDate} onChange={handleAdoptionDateChange}
                  placeholder="When did they come home?"
                  ac={accentColor} maxDate={today}
                  minDate={birthday ? new Date(birthday) : undefined}
                />
                {dateError ? (
                  <Text style={{ fontSize: TYPO.caption, color: '#E53935', marginTop: 6, fontWeight: '600' }}>
                    ⚠️ {dateError}
                  </Text>
                ) : null}
              </FieldRow>
            </SectionCard>

            {/* ── 4. Health & identity ── */}
            <SectionCard title="Health & identity" colors={colors}>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between', paddingVertical: 14,
              }}>
                <View>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>Neutered / spayed</Text>
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary, marginTop: 2 }}>
                    {neutered ? '✅ Yes, all done' : 'Not yet — no worries'}
                  </Text>
                </View>
                <Switch
                  value={neutered} onValueChange={setNeutered}
                  trackColor={{ false: colors.border, true: accentColor + '80' }}
                  thumbColor={neutered ? accentColor : (colors.textTertiary ?? '#999')}
                />
              </View>

            </SectionCard>

          </View>
        </ScrollView>

        {/* ── Floating save button ── */}
        <View style={[ap.fabWrap, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={handleNext} activeOpacity={0.88}
            style={[ap.fab, { backgroundColor: accentColor }]}>
            <Ionicons name="arrow-forward-circle-outline" size={20} color="#fff" />
            <Text style={ap.fabText}>Meet the family →</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ap = StyleSheet.create({
  safe:         { flex: 1 },

  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderBottomWidth: StyleSheet.hairlineWidth },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
                  alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: TYPO.subheading, fontWeight: '700' },

  heroGrad:     { alignItems: 'center', paddingTop: 28, paddingBottom: 36 },
  avatarWrap:       { alignItems: 'center' },
  avatarCircleWrap: { position: 'relative', width: 100, height: 100 },
  avatarCircle:     { width: 100, height: 100, borderRadius: 50, borderWidth: 3,
                      overflow: 'hidden' },
  avatarGrad:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarPhoto:  { width: '100%', height: '100%' },
  avatarEmoji:  { fontSize: TYPO.heading, position: 'absolute', bottom: 2, right: 2 },
  cameraBadge:  { position: 'absolute', bottom: 0, right: -2, width: 28, height: 28, borderRadius: 14,
                  alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarHint:   { fontSize: TYPO.body, color: 'rgba(255,255,255,0.8)', marginTop: 8 },
  heroName:     { fontSize: TYPO.title, fontWeight: '800', color: '#fff', marginTop: 12,
                  letterSpacing: -0.3, maxWidth: '80%', textAlign: 'center',
                  textShadowColor: 'rgba(0,0,0,0.12)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  formWrap:     { paddingHorizontal: 16, paddingTop: 8 },

  input:        { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: TYPO.body },

  speciesGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  speciesBtn:   { width: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 14,
                  borderWidth: 1.5, gap: 5 },
  speciesBtnLabel: { fontSize: TYPO.body, textAlign: 'center' },

  colorGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorWrap:    { width: 40, height: 40, borderRadius: 20, padding: 3,
                  borderWidth: 0, borderColor: 'transparent' },
  colorSwatch:  { flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  breedDropdown: { borderWidth: 1, borderRadius: 10, marginTop: 4, overflow: 'hidden',
                   shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  breedOption:   { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },

  coatChipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  coatChip:     { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5 },

  emojiRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  emojiBtn:     { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  segRow:       { flexDirection: 'row', gap: 8 },
  seg:          { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  segText:      { fontSize: TYPO.body },

  fabWrap:      { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12 },
  fab:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                  height: 56, borderRadius: 28,
                  shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 16,
                  shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabText:      { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
});
