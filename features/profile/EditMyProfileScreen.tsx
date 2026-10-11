/**
 * EditMyProfileScreen — full-page "edit my own profile" sub-page, same
 * standalone-file pattern as every other module's sub-page (InvitePage.tsx,
 * CalendarSyncScreen.tsx, DataRecoveryScreen.tsx) instead of being defined
 * inline inside ProfileSettingsScreen.tsx [live-requested: "do one thing
 * instead patching.. lets write a new overlay page like any other module
 * sub page"]. Name/DOB/email/avatar for the CURRENTLY ACTIVE member only,
 * available to everyone regardless of role — distinct from the unified
 * MemberProfileSheet's edit section, which is the parent-edits-someone-ELSE
 * flow.
 *
 * Page shell is byte-for-byte InvitePage.tsx's own pattern: plain View +
 * useSafeAreaInsets() manual top padding (NOT a nested SafeAreaView), same
 * header block (breadcrumb → eyebrow → 29px title → subtitle), same
 * ScrollView padding numbers, same card/field language (one bordered
 * card, uppercase SectionLabel, GEMINI.blue accent) — kept in sync
 * deliberately so every "edit something about yourself/family" sub-page
 * looks identical.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput,
  Platform, Image, InteractionManager, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { supabase, uploadMemberAvatar } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import { localDateStr, fmtDate } from '@/lib/dates';
import FullPageOverlay from '@/components/FullPageOverlay';
import { GEMINI } from '@/constants/geminiRhythm';

const AVATAR_EMOJIS = ['🧒','👦','👧','🧑','👩','👨','🧓','👴','👵','🦸','🧙','🧜','🦊','🐶','🐱','⭐'];

export function EditMyProfileScreen({
  visible, onClose, member, colors, isDark, renderShell,
}: {
  visible: boolean; onClose: () => void; member: FamilyMember; colors: any; isDark: boolean;
  /** Kiosk-only — swaps this screen's own FullPageOverlay for kiosk's real
   * side-sheet form [live-requested: "edit my profile also side form" /
   * "i need all these to be side bar forms"], same renderShell pattern
   * used by ProfileSettingsScreen's other shells — wraps this component's
   * real body/state, nothing forked. Mobile never passes this, so its own
   * full-page screen (opened from the tappable identity card) is
   * completely unchanged. */
  renderShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const updateMember = useFamilyStore(s => s.updateMember);
  // Family Name editing — moved here from its own standalone section on
  // ProfileSettingsScreen (parent/admin only), per explicit request:
  // "Family name we can plug in to the Parent Admin.. Edit profile Page."
  const familyName = useFamilyStore(s => s.familyName);
  const renameFamily = useFamilyStore(s => s.renameFamily);
  const isParentAdmin = member.role === 'parent';
  const [familyNameInput, setFamilyNameInput] = useState(familyName);
  const [savingFamilyName, setSavingFamilyName] = useState(false);
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email ?? '');
  const [dob, setDob] = useState<Date | null>(member.dateOfBirth ? new Date(member.dateOfBirth + 'T00:00:00') : null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [pickedEmoji, setPickedEmoji] = useState<string | undefined>(undefined);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Same fix as InviteMemberSheet's identical showDobPicker — closing this
  // screen while the DOB picker was still open left its native inline
  // DateTimePicker mounted underneath the closing overlay, freezing all touch.
  useEffect(() => {
    if (!visible) setShowDobPicker(false);
  }, [visible]);

  // On kiosk this component's instance survives an active-profile switch
  // (KioskScreen.tsx renders it under `{active && ...}`, not
  // `{showEditMyProfile && ...}` — some member is always active, so it
  // never unmounts). The useState initializers below only ever run on
  // first mount, so without this the form kept showing whichever member
  // was active the FIRST time it was ever opened — live-reproduced:
  // editing Jak, switching to Jessica, then reopening still showed Jak's
  // name and his real auth email. Re-seed every field whenever the screen
  // opens, keyed on member.id, so a stale profile can never be shown.
  useEffect(() => {
    if (!visible) return;
    setName(member.name);
    setEmail(member.email ?? '');
    setDob(member.dateOfBirth ? new Date(member.dateOfBirth + 'T00:00:00') : null);
    setPickedEmoji(undefined);
    setPhotoUri(null);
    setTouched({});
    setFamilyNameInput(familyName);
  }, [visible, member.id, familyName]);

  // A member with a real Supabase Auth account (signed up themselves,
  // rather than a PIN-only profile someone else created) already has a
  // verified email on file in auth.users — pull it in instead of asking
  // them to retype it, and don't let it be hand-edited into something that
  // no longer matches their actual login. PIN-only members (kids/seniors
  // with no auth_user_id) have no auth.users row at all, so they keep the
  // plain editable field below.
  const hasRealAuth = !!member.authUserId;
  useEffect(() => {
    if (!hasRealAuth) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user && data.user.id === member.authUserId && data.user.email) setEmail(data.user.email);
    });
  }, [hasRealAuth, member.authUserId]);

  const MAX_DOB = new Date();
  const MIN_DOB = new Date(Date.now() - 110 * 365.25 * 24 * 3600_000);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const nameError = !name.trim() ? 'Name is required.' : name.trim().length > 60 ? 'Name is too long.' : undefined;
  const emailError = email.trim() && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : undefined;
  const dobError = dob && (dob > MAX_DOB ? 'Date of birth can\'t be in the future.' : dob < MIN_DOB ? 'That date seems too far in the past.' : undefined);
  const formValid = !nameError && !emailError && !dobError;

  const currentAvatarPreview = photoUri ?? (pickedEmoji ? undefined : member.avatarUrl);
  const currentEmojiPreview = pickedEmoji ?? (member.avatarUrl ? undefined : member.emoji);

  const pickPhoto = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      showAlert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to change your photo.`);
      return;
    }
    try {
      await showPickerLoading(fromCamera ? 'Waiting for camera…' : 'Opening library…');
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      hidePickerLoading();
      if (!result.canceled && result.assets[0]) { setPhotoUri(result.assets[0].uri); setPickedEmoji(undefined); }
    } catch (e: any) {
      hidePickerLoading();
      showAlert(`Could not open ${fromCamera ? 'camera' : 'library'}`, e?.message);
    }
  };

  const handleSave = async () => {
    setTouched({ name: true, email: true });
    if (!formValid) return;
    setSaving(true);
    let avatarUrl: string | undefined;
    if (photoUri && member.familyId) {
      setUploading(true);
      try {
        avatarUrl = await uploadMemberAvatar(member.familyId, member.id, photoUri);
      } catch (e: any) {
        showAlert('Photo upload failed', "Couldn't upload the photo — other changes will still be saved.");
      }
      setUploading(false);
    }
    // Dismiss FIRST, defer the store write (updateMember) until after the
    // dismiss animation settles — same fix as RosterTab.tsx's EditMemberModal
    // Save handler: this member's card renders in multiple places on the
    // parent screen, so updateMember here re-renders more than almost any
    // other save path in the app.
    const patch = {
      name: name.trim(),
      email: email.trim() ? email.trim().toLowerCase() : undefined,
      dateOfBirth: dob ? localDateStr(dob) : undefined,
      ...(avatarUrl ? { avatarUrl, emoji: undefined } : {}),
      ...(pickedEmoji ? { emoji: pickedEmoji, avatarUrl: undefined } : {}),
    };
    onClose();
    InteractionManager.runAfterInteractions(() => {
      setSaving(false);
      updateMember(member.id, patch);
    });
  };

  const familyNameValid = !!familyNameInput.trim();
  const handleSaveFamilyName = async () => {
    if (!familyNameValid || familyNameInput.trim() === familyName) return;
    setSavingFamilyName(true);
    const ok = await renameFamily(familyNameInput.trim());
    setSavingFamilyName(false);
    if (!ok) showAlert("Couldn't rename family", 'Something went wrong. Please try again.');
  };

  // Same card/field language as InvitePage.tsx's "Add Someone New" card —
  // uppercase section label, one bordered white/dark card wrapping the
  // whole form, GEMINI.blue accent (brand accent, not gated by isDark —
  // same as InvitePage's own BLUE = GEMINI.blue).
  const fieldLabelClr = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const inputBg = isDark ? colors.surface : GEMINI.canvas;
  const inputBorder = isDark ? colors.border : GEMINI.border;
  const titleClr = isDark ? colors.textPrimary : GEMINI.titleColor;
  const blue = GEMINI.blue;

  // Photo section matches the Figma "Choose a profile photo" mockup's own
  // language: a prominent circular preview card with a pastel "Selected"
  // badge pill, outlined pill action buttons (Take a photo / Choose from
  // photos), and an emoji-picker grid as the "preview choices" row
  // [live-provided Figma: breadcrumb → big circular photo → pastel status
  // pill → caption → outlined action rows]. The actual Name/DOB/Email
  // fields stay in the card below, per explicit instruction to keep them
  // ("keep those fields also here") rather than replace the whole page
  // with just a photo picker.
  const hasPickedPhoto = !!(photoUri || pickedEmoji || currentAvatarPreview || currentEmojiPreview);

  const body = (
    <>
      <View style={{
        borderRadius: 22, borderWidth: 1, padding: 20, alignItems: 'center',
        backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderColor: inputBorder,
        marginBottom: 14,
      }}>
        <View style={{ width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center',
          backgroundColor: blue + '14', overflow: 'hidden', marginBottom: 14 }}>
          {currentAvatarPreview ? (
            <Image source={{ uri: currentAvatarPreview }} style={{ width: 140, height: 140 }} />
          ) : (
            <Text style={{ fontSize: 64 }}>{currentEmojiPreview ?? '👤'}</Text>
          )}
        </View>

        {hasPickedPhoto && (
          <View style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: blue + '14', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: blue }}>
              {photoUri || pickedEmoji ? 'Selected · not saved yet' : 'Current photo'}
            </Text>
          </View>
        )}

        <Text style={{ fontSize: 13, color: fieldLabelClr, textAlign: 'center', marginBottom: 16 }}>
          Center your face within the circular crop.
        </Text>

        <TouchableOpacity onPress={() => pickPhoto(true)}
          style={{ width: '100%', borderRadius: 14, borderWidth: 1.5, borderColor: inputBorder,
            paddingVertical: 13, alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: blue }}>Take a photo</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => pickPhoto(false)}
          style={{ width: '100%', borderRadius: 14, borderWidth: 1.5, borderColor: inputBorder,
            paddingVertical: 13, alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: blue }}>Choose from photos</Text>
        </TouchableOpacity>

        <Text style={{ alignSelf: 'flex-start', fontSize: 13, color: fieldLabelClr, marginTop: 4, marginBottom: 10 }}>
          Or pick an emoji avatar
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: (photoUri || pickedEmoji) ? 4 : 0 }}>
          {AVATAR_EMOJIS.map(e => (
            <TouchableOpacity key={e}
              onPress={() => { setPickedEmoji(e); setPhotoUri(null); }}
              style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                backgroundColor: pickedEmoji === e ? blue + '14' : 'transparent',
                borderWidth: pickedEmoji === e ? 1.5 : 0, borderColor: blue }}>
              <Text style={{ fontSize: 18 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {(photoUri || pickedEmoji) && (
          <TouchableOpacity onPress={() => { setPhotoUri(null); setPickedEmoji(undefined); }} style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: fieldLabelClr }}>Remove · use initial instead</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{
        borderRadius: 22, borderWidth: 1, padding: 20,
        backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderColor: inputBorder,
      }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: fieldLabelClr, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Your Details
        </Text>

        <Text style={{ fontSize: 13, color: fieldLabelClr, marginBottom: 8 }}>Name</Text>
        <TextInput
          value={name} onChangeText={setName} onBlur={() => setTouched(t => ({ ...t, name: true }))}
          placeholder="e.g. Emma" maxLength={60} placeholderTextColor={isDark ? colors.textTertiary : GEMINI.bodyColorLight}
          style={{
            borderWidth: 1.5, borderColor: (touched.name && nameError) ? colors.danger : inputBorder, borderRadius: 10,
            paddingHorizontal: 12, paddingVertical: 11, fontSize: 15,
            color: titleClr, backgroundColor: inputBg,
          }}
        />
        {touched.name && nameError ? (
          <Text style={{ fontSize: 12, fontWeight: '500', color: colors.danger, marginTop: 4 }}>{nameError}</Text>
        ) : null}

        <Text style={{ fontSize: 13, color: fieldLabelClr, marginBottom: 8, marginTop: 14 }}>
          Date of birth <Text style={{ fontWeight: '400' }}>(optional)</Text>
        </Text>
        <TouchableOpacity
          onPress={() => setShowDobPicker(v => !v)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            borderWidth: 1.5, borderColor: dobError ? colors.danger : (showDobPicker ? blue : inputBorder),
            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
            backgroundColor: inputBg,
          }}>
          <Ionicons name="calendar-outline" size={15} color={fieldLabelClr} />
          <Text style={{ fontSize: 15, color: dob ? titleClr : (isDark ? colors.textTertiary : GEMINI.bodyColorLight) }}>
            {dob ? fmtDate(localDateStr(dob)) : 'Tap to choose a date'}
          </Text>
        </TouchableOpacity>
        {dobError ? (
          <Text style={{ fontSize: 12, fontWeight: '500', color: colors.danger, marginTop: 4 }}>{dobError}</Text>
        ) : null}
        {showDobPicker && (
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: inputBorder, backgroundColor: isDark ? colors.card : GEMINI.cardBg, marginTop: 8 }}>
            <DateTimePicker
              value={dob ?? MAX_DOB}
              mode="date"
              display="spinner"
              minimumDate={MIN_DOB}
              maximumDate={MAX_DOB}
              onChange={(_e, d) => { if (d) setDob(d); }}
              textColor={titleClr}
              style={{ height: 180, width: '100%' }}
            />
            <TouchableOpacity onPress={() => setShowDobPicker(false)} style={{ alignSelf: 'flex-end', padding: 12 }}>
              <Text style={{ color: blue, fontWeight: '900', fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={{ fontSize: 13, color: fieldLabelClr, marginBottom: 8, marginTop: 14 }}>
          Email {hasRealAuth ? <Text style={{ fontWeight: '400' }}>(from your sign-in, can't be edited here)</Text> : <Text style={{ fontWeight: '400' }}>(optional)</Text>}
        </Text>
        <TextInput
          value={email} onChangeText={setEmail} onBlur={() => setTouched(t => ({ ...t, email: true }))}
          placeholder="e.g. you@example.com" placeholderTextColor={isDark ? colors.textTertiary : GEMINI.bodyColorLight}
          autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
          editable={!hasRealAuth}
          style={{
            borderWidth: 1.5, borderColor: (touched.email && emailError) ? colors.danger : inputBorder, borderRadius: 10,
            paddingHorizontal: 12, paddingVertical: 11, fontSize: 15,
            color: hasRealAuth ? fieldLabelClr : titleClr,
            backgroundColor: hasRealAuth ? (isDark ? colors.border + '30' : GEMINI.border + '30') : inputBg,
          }}
        />
        {touched.email && emailError ? (
          <Text style={{ fontSize: 12, fontWeight: '500', color: colors.danger, marginTop: 4 }}>{emailError}</Text>
        ) : null}

        {member.createdAt ? (
          <Text style={{ fontSize: 12, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, marginTop: 14 }}>
            Member since {new Date(member.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !formValid}
          activeOpacity={0.82}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            height: 50, borderRadius: 14, marginTop: 20,
            backgroundColor: blue, opacity: (saving || !formValid) ? 0.6 : 1,
          }}>
          {saving ? <ActivityIndicator color="#fff" /> : (
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>{uploading ? 'Uploading…' : 'Save Changes'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {isParentAdmin && (
        <View style={{
          borderRadius: 22, borderWidth: 1, padding: 20,
          backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderColor: inputBorder,
          marginTop: 14,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: fieldLabelClr, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Family
          </Text>
          <Text style={{ fontSize: 13, color: fieldLabelClr, marginBottom: 8 }}>Family name</Text>
          <TextInput
            value={familyNameInput} onChangeText={setFamilyNameInput}
            placeholder="e.g. The Parkers" maxLength={60} placeholderTextColor={isDark ? colors.textTertiary : GEMINI.bodyColorLight}
            style={{
              borderWidth: 1.5, borderColor: inputBorder, borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 11, fontSize: 15,
              color: titleClr, backgroundColor: inputBg,
            }}
          />
          <TouchableOpacity
            onPress={handleSaveFamilyName}
            disabled={savingFamilyName || !familyNameValid || familyNameInput.trim() === familyName}
            activeOpacity={0.82}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              height: 44, borderRadius: 12, marginTop: 14,
              backgroundColor: blue, opacity: (savingFamilyName || !familyNameValid || familyNameInput.trim() === familyName) ? 0.5 : 1,
            }}>
            {savingFamilyName ? <ActivityIndicator color="#fff" /> : (
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Save Family Name</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  if (renderShell) return <>{renderShell(visible, onClose, body)}</>;

  // Full-page screen instead of a bottom sheet — this app's "no bottom
  // sheets" rule (CLAUDE.md): every new/converted flow is a full-page
  // replacement, not a Modal/AppBottomSheet/drawer. Shell is byte-for-byte
  // InvitePage.tsx's own pattern — see file header comment.
  return (
    <FullPageOverlay visible={visible} onDismiss={onClose} zIndex={60} backgroundColor={isDark ? colors.background : GEMINI.canvas}>
      <View style={{ flex: 1, backgroundColor: isDark ? colors.background : GEMINI.canvas }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 4 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: GEMINI.blue }}>← Profile</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 13, fontWeight: '500', color: GEMINI.blue, marginTop: 12 }}>Your account</Text>
          <Text style={{ fontSize: 29, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor, marginTop: 4, lineHeight: 36 }}>
            Edit my profile
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginTop: 6, lineHeight: 18, marginBottom: 4 }}>
            Your own name, photo, birthday, and email.
          </Text>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: insets.bottom + 4 }}
          >
            {body}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </FullPageOverlay>
  );
}
