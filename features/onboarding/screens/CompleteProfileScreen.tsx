/**
 * CompleteProfileScreen — one-time, skippable prompt shown right after
 * onboarding finishes (from both JoinFamilyScreen's "You're in!" and
 * SetupFamilyScreen's "Family Created!" steps), NOT during the join/setup
 * flow itself. Collects a real photo + date of birth — deliberately kept
 * out of the flow that gets someone INTO the family, since neither is
 * needed to function and a brand-new member shouldn't have to hand over a
 * birth date before they've even seen the app.
 *
 * Fully skippable — "Skip for now" and the real form both land on
 * /(tabs). Revisitable later from Family Settings / the roster editor
 * (RosterTab already has its own relationship/DOB-adjacent editing UI).
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  Platform, KeyboardAvoidingView, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, SPACING, RADIUS } from '@/constants/theme';
import { BRAND, AnimatedCubeMark } from '@/components/FamilyCubeLogo';
import { uploadMemberAvatar } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { fmtDate, localDateStr } from '@/lib/dates';
import { showAlert } from '@/components/AppAlert';

export default function CompleteProfileScreen() {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const updateMember = useFamilyStore(s => s.updateMember);
  const active = members.find(m => m.id === activeMemberId);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Pre-fill from whatever the parent already entered when creating this
  // pending member (addPendingMember's own DOB field) — was always blank
  // here, forcing a re-entry of data that already exists on the row
  // (live-reported gap). Still fully editable — this is just a starting
  // point, not a lock.
  const [dob, setDob] = useState<Date | null>(active?.dateOfBirth ? new Date(active.dateOfBirth) : null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const MIN_DOB = new Date(Date.now() - 120 * 365.25 * 24 * 3600_000);
  const MAX_DOB = new Date();

  const pickPhoto = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      showAlert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to add a profile photo.`);
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  const handleSave = async () => {
    if (!active) { router.replace('/(tabs)'); return; }
    setSaving(true);
    try {
      let avatarUrl: string | undefined;
      if (photoUri) {
        if (!active.familyId) {
          showAlert('Photo upload failed', "Couldn't find your family — your other changes will still be saved.");
        } else {
          setUploading(true);
          try {
            avatarUrl = await uploadMemberAvatar(active.familyId, active.id, photoUri);
          } catch (e: any) {
            console.warn('[CompleteProfileScreen] avatar upload failed', e?.message);
            showAlert('Photo upload failed', "Couldn't upload the photo — your other changes will still be saved.");
          }
          setUploading(false);
        }
      }
      await updateMember(active.id, {
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(dob ? { dateOfBirth: localDateStr(dob) } : {}),
      });
    } finally {
      setSaving(false);
      router.replace('/(tabs)');
    }
  };

  const s = makeStyles(colors, isDark);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <AnimatedCubeMark size={64} />
            <Text style={s.title}>Complete your profile</Text>
            <Text style={s.sub}>Optional — add a photo and birthday so the family can recognize you and see age-appropriate chores.</Text>
          </View>

          {/* Photo */}
          <View style={s.photoWrap}>
            <TouchableOpacity
              style={[s.photoCircle, { borderColor: BRAND.purple }]}
              onPress={() => showAlert('Add a photo', undefined, [
                { text: 'Take Photo', onPress: () => pickPhoto(true) },
                { text: 'Choose from Library', onPress: () => pickPhoto(false) },
                { text: 'Cancel', style: 'cancel' },
              ])}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={s.photoImg} />
              ) : (
                <View style={[s.photoPlaceholder, { backgroundColor: BRAND.purple + '18' }]}>
                  <Text style={{ fontSize: 32 }}>{active?.emoji ?? '🧑'}</Text>
                </View>
              )}
              <View style={[s.photoBadge, { backgroundColor: BRAND.purple }]}>
                <Text style={{ fontSize: 13 }}>📷</Text>
              </View>
            </TouchableOpacity>
            {photoUri && (
              <TouchableOpacity onPress={() => setPhotoUri(null)}>
                <Text style={[s.removeText, { color: colors.textTertiary }]}>Remove photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Date of birth */}
          <Text style={s.label}>Date of birth</Text>
          <TouchableOpacity
            style={[s.dobBtn, { borderColor: showDobPicker ? BRAND.purple : colors.border, backgroundColor: colors.card }]}
            onPress={() => setShowDobPicker(p => !p)}
          >
            <Text style={{ fontSize: 16 }}>🎂</Text>
            <Text style={[s.dobText, { color: dob ? colors.textPrimary : colors.textTertiary }]}>
              {dob ? fmtDate(localDateStr(dob)) : 'Tap to choose a date'}
            </Text>
          </TouchableOpacity>

          {showDobPicker && (
            <View style={[s.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <DateTimePicker
                value={dob ?? new Date(MIN_DOB.getFullYear() + 30, 0, 1)}
                mode="date"
                display="spinner"
                minimumDate={MIN_DOB}
                maximumDate={MAX_DOB}
                onChange={(_, d) => { if (d) setDob(d); }}
                textColor={colors.textPrimary}
                style={{ height: 180, width: '100%' }}
              />
              <TouchableOpacity onPress={() => setShowDobPicker(false)} style={{ alignSelf: 'flex-end', padding: 12 }}>
                <Text style={{ color: BRAND.purple, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: BRAND.purple, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.saveBtnText}>{uploading ? 'Uploading…' : 'Save & Continue'}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.skipBtn} onPress={() => router.replace('/(tabs)')} disabled={saving}>
            <Text style={[s.skipText, { color: colors.textSecondary }]}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, padding: SPACING.xxl, alignItems: 'center' },

  header: { alignItems: 'center', marginBottom: SPACING.xl },
  title: { fontSize: TYPO.hero, fontWeight: '800', color: colors.textPrimary, marginTop: SPACING.md, letterSpacing: -0.5 },
  sub: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.xs, lineHeight: 20, maxWidth: 300 },

  photoWrap: { alignItems: 'center', marginBottom: SPACING.xl, gap: 8 },
  photoCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  photoImg: { width: 94, height: 94, borderRadius: 47 },
  photoPlaceholder: { width: 94, height: 94, borderRadius: 47, alignItems: 'center', justifyContent: 'center' },
  photoBadge: { position: 'absolute', bottom: -2, right: -2, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  removeText: { fontSize: TYPO.caption, fontWeight: '600' },

  label: { fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, alignSelf: 'flex-start', marginBottom: 8 },
  dobBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', height: 52, borderWidth: 1.5, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  dobText: { fontSize: TYPO.body, fontWeight: '600' },

  pickerCard: { width: '100%', borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md, overflow: 'hidden' },

  saveBtn: { width: '100%', height: 54, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.lg },
  saveBtnText: { color: '#fff', fontSize: TYPO.subheading, fontWeight: '700' },
  skipBtn: { marginTop: SPACING.md, padding: SPACING.sm },
  skipText: { fontSize: TYPO.body, fontWeight: '500' },
});
