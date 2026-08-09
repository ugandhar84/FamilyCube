import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Switch,
  ScrollView, Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import { supabase, uploadUserAvatar } from '@/lib/supabase';
import { useAuthStore, invalidateProfileCache } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import { SPACING, RADIUS, TYPO} from '@/constants/theme';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Kolkata',
  'Australia/Sydney',
];

export default function ProfileEditScreen() {
  const { colors } = useTheme();
  const { profile, fetchProfile } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [handle, setHandle]   = useState('');
  const [handleError, setHandleError] = useState('');
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [timezone, setTimezone] = useState('');
  const [avatarUri, setAvatarUri]   = useState<string | null>(null);
  const [avatarB64, setAvatarB64]   = useState<{ data: string; mime: string } | null>(null);

  // Pet profile privacy toggles
  const [showAbout,     setShowAbout]     = useState(true);
  const [showVaccines,  setShowVaccines]  = useState(true);
  const [showAllergies, setShowAllergies] = useState(true);
  const [showVetVisits, setShowVetVisits] = useState(true);
  const [showWeight,    setShowWeight]    = useState(true);
  const [showMilestones,setShowMilestones]= useState(true);
  const [saving, setSaving] = useState(false);
  const [showTimezone, setShowTimezone] = useState(false);

  const s = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setHandle(profile.handle ?? '');
      setPhone(profile.phone ?? '');
      setBio(profile.bio ?? '');
      setTimezone(profile.timezone ?? '');
      setShowAbout(     (profile as any).pet_show_about      ?? true);
      setShowVaccines(  (profile as any).pet_show_vaccines   ?? true);
      setShowAllergies( (profile as any).pet_show_allergies  ?? true);
      setShowVetVisits( (profile as any).pet_show_vet_visits ?? true);
      setShowWeight(    (profile as any).pet_show_weight     ?? true);
      setShowMilestones((profile as any).pet_show_milestones ?? true);
    }
  }, [profile]);

  const checkHandleAvailability = async (raw: string) => {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || trimmed === (profile?.handle ?? '').toLowerCase()) {
      setHandleError('');
      return;
    }
    setCheckingHandle(true);
    const { data } = await supabase.from('profiles')
      .select('id').eq('handle', trimmed).maybeSingle();
    setCheckingHandle(false);
    setHandleError(data ? 'That handle is already taken.' : '');
  };

  const pickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission needed', 'Please allow access to your photo library in Settings.');
        return;
      }
      await showPickerLoading();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      hidePickerLoading();
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setAvatarUri(asset.uri);
        if (asset.base64) setAvatarB64({ data: asset.base64, mime: asset.mimeType ?? 'image/jpeg' });
      }
    } catch (e: any) {
      hidePickerLoading();
      if (e?.message?.includes('native module') || e?.message?.includes('ExponentImagePicker')) {
        showAlert('Dev build required', 'Run: npx expo run:ios to use photo features.');
      } else {
        showAlert('Error', e?.message ?? 'Could not open photo library.');
      }
    }
  };

  const handleSave = async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const trimName   = fullName.trim();
    const trimHandle = handle.trim().toLowerCase();
    const trimPhone  = phone.trim();
    if (trimName && trimName.length < 2) {
      showAlert('Name too short', 'Name must be at least 2 characters.');
      return;
    }
    if (trimName.length > 60) {
      showAlert('Name too long', 'Name must be 60 characters or fewer.');
      return;
    }
    if (trimHandle) {
      if (!/^[a-z0-9_]{3,30}$/.test(trimHandle)) {
        showAlert('Invalid handle', 'Handle must be 3–30 characters: letters, numbers, and underscores only.');
        return;
      }
      if (handleError) {
        showAlert('Handle taken', 'Please choose a different handle.');
        return;
      }
    }
    if (trimPhone) {
      const digits = trimPhone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        showAlert('Invalid phone', 'Phone number must be 7–15 digits (include country code for international numbers).');
        return;
      }
    }
    setSaving(true);

    let avatar_url = profile?.avatar_url ?? null;

    if (avatarUri) {
      try {
        avatar_url = await uploadUserAvatar(avatarUri, avatarB64?.data ?? null, avatarB64?.mime ?? 'image/jpeg');
      } catch (e: any) {
        setSaving(false);
        showAlert('Upload failed', e?.message ?? 'Could not upload photo.');
        return;
      }
    }

    const { error } = await supabase.from('profiles').update({
      full_name: fullName.trim() || null,
      handle: trimHandle || null,
      phone: phone.trim() || null,
      bio: bio.trim() || null,
      timezone: timezone || null,
      avatar_url,
      pet_show_about:      showAbout,
      pet_show_vaccines:   showVaccines,
      pet_show_allergies:  showAllergies,
      pet_show_vet_visits: showVetVisits,
      pet_show_weight:     showWeight,
      pet_show_milestones: showMilestones,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    setSaving(false);

    if (error) {
      showAlert('Error', error.message ?? 'Could not save profile.');
      return;
    }

    invalidateProfileCache(); // direct upsert above bypassed the store — force a fresh read
    await fetchProfile(user.id);
    router.back();
  };

  const displayAvatar = avatarUri ?? profile?.avatar_url;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.backBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color={colors.primaryText ?? colors.primary} size="small" />
              : <Text style={[s.backBtn, { color: colors.primaryText ?? colors.primary, fontWeight: '700' }]}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <View style={s.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
            <View style={[s.avatarWrap, { borderColor: colors.primary + '40' }]}>
              {displayAvatar
                ? <Image source={{ uri: displayAvatar }} cachePolicy="memory-disk" style={s.avatarImg} />
                : <Text style={{ fontSize: 52 }}>👤</Text>
              }
              <View style={[s.avatarCameraBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ fontSize: TYPO.body }}>📷</Text>
              </View>
            </View>
          </TouchableOpacity>
          <Text style={s.avatarHint}>Tap to change photo</Text>
        </View>

        {/* Fields */}
        <View style={s.formSection}>
          <Text style={s.label}>Full name</Text>
          <TextInput style={s.input} placeholder="Your name"
            placeholderTextColor={colors.placeholder}
            value={fullName} onChangeText={t => setFullName(t.replace(/[^a-zA-Z\s\-'.]/g, ''))} />
        </View>

        <View style={s.formSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={s.label}>Handle</Text>
            {checkingHandle && <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Checking…</Text>}
            {!checkingHandle && handle.trim() && !handleError && handle.trim() !== (profile?.handle ?? '') && (
              <Text style={{ fontSize: TYPO.body, color: '#22c55e' }}>✓ Available</Text>
            )}
          </View>
          <View style={[s.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }]}>
            <Text style={{ fontSize: TYPO.subheading, color: colors.textSecondary, marginRight: 2 }}>@</Text>
            <TextInput
              style={{ flex: 1, fontSize: TYPO.subheading, color: colors.textPrimary, paddingVertical: 0 }}
              placeholder="your_handle"
              placeholderTextColor={colors.placeholder}
              value={handle}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={t => {
                const clean = t.replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 30);
                setHandle(clean);
                setHandleError('');
              }}
              onBlur={() => checkHandleAvailability(handle)}
              maxLength={30}
            />
          </View>
          {handleError ? (
            <Text style={{ fontSize: TYPO.body, color: '#ef4444', marginTop: 4 }}>{handleError}</Text>
          ) : (
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 4 }}>
              3–30 chars · letters, numbers, underscores · shown instead of your real name
            </Text>
          )}
        </View>

        <View style={s.formSection}>
          <Text style={s.label}>Phone number</Text>
          <TextInput style={s.input} placeholder="+1 (555) 000-0000"
            placeholderTextColor={colors.placeholder}
            value={phone} onChangeText={setPhone}
            keyboardType="phone-pad" />
        </View>

        <View style={s.formSection}>
          <Text style={s.label}>Bio</Text>
          <TextInput style={[s.input, { height: 90, paddingTop: 12 }]} multiline
            placeholder="Tell the family a little about yourself…"
            placeholderTextColor={colors.placeholder}
            value={bio} onChangeText={setBio} maxLength={200} />
          <Text style={s.charCount}>{bio.length}/200</Text>
        </View>

        <View style={s.formSection}>
          <Text style={s.label}>Timezone</Text>
          <TouchableOpacity style={s.input} onPress={() => setShowTimezone(!showTimezone)}>
            <Text style={[s.timezoneText, { color: timezone ? colors.textPrimary : colors.placeholder }]}>
              {timezone || 'Select timezone'}
            </Text>
          </TouchableOpacity>
          {showTimezone && (
            <View style={s.timezoneDropdown}>
              {TIMEZONES.map((tz) => (
                <TouchableOpacity key={tz} style={[s.tzOption, tz === timezone && { backgroundColor: colors.primaryLight }]}
                  onPress={() => { setTimezone(tz); setShowTimezone(false); }}>
                  <Text style={[s.tzOptionText, tz === timezone && { color: colors.primaryText ?? colors.primary, fontWeight: '600' }]}>{tz}</Text>
                  {tz === timezone && <Text style={{ color: colors.primaryText ?? colors.primary }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Pet profile privacy */}
        <View style={[s.section, { marginTop: 24 }]}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Pet profile visibility</Text>
          <Text style={[s.sectionSub, { color: colors.textSecondary }]}>
            Choose what visitors can see on any of your pets' profiles.
          </Text>
          {([
            { label: 'About (breed, birthday, gender…)', value: showAbout,      set: setShowAbout },
            { label: 'Vaccines',                          value: showVaccines,   set: setShowVaccines },
            { label: 'Known allergies',                   value: showAllergies,  set: setShowAllergies },
            { label: 'Vet visits',                        value: showVetVisits,  set: setShowVetVisits },
            { label: 'Weight history',                    value: showWeight,     set: setShowWeight },
            { label: 'Milestones',                        value: showMilestones, set: setShowMilestones },
          ] as const).map(({ label, value, set }, i) => (
            <View key={label} style={[s.privacyRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <Text style={[s.privacyLabel, { color: colors.textPrimary }]}>{label}</Text>
              <Switch
                value={value}
                onValueChange={set}
                trackColor={{ false: colors.border, true: `${colors.primary}88` }}
                thumbColor={value ? colors.primary : colors.textSecondary}
              />
            </View>
          ))}
        </View>

        {/* Save button */}
        <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.saveBtnText}>Save changes</Text>
          }
        </TouchableOpacity>

        {/* Delete account */}
        <View style={s.dangerSection}>
          <Text style={[s.dangerTitle, { color: colors.danger }]}>Danger zone</Text>
          <TouchableOpacity style={[s.dangerBtn, { borderColor: colors.danger + '40', backgroundColor: colors.danger + '08' }]}
            onPress={() => {
              showAlert(
                'Delete account?',
                'Your account will be scheduled for deletion. All data is kept safely for 30 days — just log back in within that time and everything will be automatically restored. After 30 days, deletion is permanent.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete account',
                    style: 'destructive',
                    onPress: async () => {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) return;
                      const { error } = await supabase.functions.invoke('delete-account', { body: { user_id: user.id } });
                      if (error) {
                        showAlert('Error', 'Could not delete your account. Please try again or contact support.');
                        return;
                      }
                      await supabase.auth.signOut();
                    },
                  },
                ]
              );
            }}>
            <Text style={[s.dangerBtnText, { color: colors.danger }]}>Delete account & all data</Text>
          </TouchableOpacity>
          <Text style={[s.dangerNote, { color: colors.textSecondary }]}>
            Schedules deletion of your profile, pets, photos, logs, and memberships. Log back in within 30 days to restore everything.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.xl },
  backBtn: { fontSize: TYPO.body, color: colors.textSecondary },
  headerTitle: { fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary },

  avatarSection: { alignItems: 'center', paddingVertical: SPACING.xxl },
  avatarWrap: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.card, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  avatarImg: { width: 110, height: 110, borderRadius: 55 },
  avatarCameraBtn: { position: 'absolute', bottom: 4, right: 4, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarHint: { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 8 },

  formSection: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.lg },
  label: { fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, marginBottom: SPACING.sm },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: 14, fontSize: TYPO.body, color: colors.textPrimary, backgroundColor: colors.inputBg, justifyContent: 'center' },
  timezoneText: { fontSize: TYPO.body },
  charCount: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'right', marginTop: 4 },

  timezoneDropdown: { borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.md, backgroundColor: colors.card, marginTop: 4, overflow: 'hidden' },
  tzOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  tzOptionText: { fontSize: TYPO.body, color: colors.textPrimary },

  section:      { marginHorizontal: SPACING.xl },
  sectionTitle: { fontSize: TYPO.body, fontWeight: '700', marginBottom: 4 },
  sectionSub:   { fontSize: TYPO.body, lineHeight: 19, marginBottom: 12 },
  privacyRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  privacyLabel: { fontSize: TYPO.body, flex: 1, paddingRight: 12 },

  saveBtn: { marginHorizontal: SPACING.xl, height: 56, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xxl, marginTop: SPACING.xl },
  saveBtnText: { fontSize: TYPO.subheading, fontWeight: '700', color: '#fff' },

  dangerSection: { marginHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  dangerTitle: { fontSize: TYPO.body, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.md },
  dangerBtn: { borderWidth: 1, borderRadius: RADIUS.lg, paddingVertical: 16, alignItems: 'center', marginBottom: SPACING.sm },
  dangerBtnText: { fontSize: TYPO.body, fontWeight: '600' },
  dangerNote: { fontSize: TYPO.body, lineHeight: 16 },
});
