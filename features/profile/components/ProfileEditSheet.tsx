/**
 * ProfileEditSheet — bundles three related bottom sheets into one component:
 *  1. Edit name / phone (showEdit)
 *  2. Avatar photo picker (showPhotoPicker)
 *  3. User emoji picker (showEmojiPicker)
 *
 * All internal form state lives here so ProfileScreen stays thin. Side-effectful
 * operations (DB writes, avatar upload) are handled via the injected callbacks.
 */

import React, { memo, useState } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BottomSheet from '@/components/BottomSheet';
import LazyImage from '@/components/LazyImage';
import * as ImagePicker from 'expo-image-picker';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import { supabase, uploadUserAvatar } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { mdl } from '@/features/profile/styles';

interface Props {
  /** Controlled by parent — opens/closes the edit-name sheet */
  showEdit: boolean;
  onCloseEdit: () => void;
  /** Controlled by parent — opens/closes the photo picker sheet */
  showPhotoPicker: boolean;
  onClosePhotoPicker: () => void;
  /** Controlled by parent — opens/closes the emoji picker sheet */
  showEmojiPicker: boolean;
  onCloseEmojiPicker: () => void;
  /** Initial values populated when the sheet opens */
  initialName: string;
  initialPhone: string;
  /** Current avatar URL (CDN or local preview URI) */
  avatarUri: string | null;
  /** Initials fallback when there is no avatar photo */
  avatarInit: string;
  /** Displayed in the photo picker header */
  profileName: string | undefined;
  /** Currently selected user emoji */
  userEmoji: string;
  onEmojiChange: (emoji: string) => void;
  /** Callbacks for side effects */
  onSave: (name: string, phone: string) => Promise<void>;
  onAvatarUriChange: (uri: string | null) => void;
  userId: string | undefined;
  accent: string;
  colors: any;
}

const ProfileEditSheet = memo(function ProfileEditSheet({
  showEdit, onCloseEdit,
  showPhotoPicker, onClosePhotoPicker,
  showEmojiPicker, onCloseEmojiPicker,
  initialName, initialPhone,
  avatarUri, avatarInit, profileName, userEmoji, onEmojiChange,
  onSave, onAvatarUriChange, userId, accent, colors,
}: Props) {
  // ─── Edit name/phone form state ───────────────────────────────────────────
  const [editName,  setEditName]  = useState(initialName);
  const [editPhone, setEditPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);

  // Re-seed when the sheet opens (initialName/Phone change)
  React.useEffect(() => { if (showEdit) { setEditName(initialName); setEditPhone(initialPhone); } }, [showEdit]);

  const handleSave = async () => {
    const trimName  = editName.trim();
    const trimPhone = editPhone.trim();
    if (trimName && trimName.length < 2) { showAlert('Name too short', 'Name must be at least 2 characters.'); return; }
    if (trimName.length > 60)            { showAlert('Name too long', 'Name must be 60 characters or fewer.'); return; }
    if (trimPhone) {
      const digits = trimPhone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) { showAlert('Invalid phone', 'Phone number must be 7–15 digits.'); return; }
    }
    setSaving(true);
    try { await onSave(trimName, trimPhone); onCloseEdit(); }
    catch (e: any) { showAlert('Error', e?.message ?? 'Could not save profile.'); }
    finally { setSaving(false); }
  };

  // ─── Avatar upload ────────────────────────────────────────────────────────
  const [avatarUploading, setAvatarUploading] = useState(false);

  const pickAndUpload = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { onClosePhotoPicker(); showAlert('Permission needed', 'Please allow access in Settings.'); return; }
    let result: ImagePicker.ImagePickerResult;
    try {
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'] as any, allowsEditing: true, aspect: [1, 1], quality: 0.85, base64: true,
      };
      await showPickerLoading(fromCamera ? 'Waiting for camera…' : 'Opening Gallery…');
      result = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      hidePickerLoading();
    } catch (e: any) {
      hidePickerLoading();
      onClosePhotoPicker();
      showAlert('Could not open ' + (fromCamera ? 'camera' : 'library'), e?.message);
      return;
    }
    onClosePhotoPicker();
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    onAvatarUriChange(asset.uri); // optimistic preview
    setAvatarUploading(true);
    try {
      const url = await uploadUserAvatar(asset.uri, asset.base64 || null, asset.mimeType ?? 'image/jpeg');
      onAvatarUriChange(url);
    } catch (e: any) {
      onAvatarUriChange(null);
      showAlert('Upload failed', e?.message ?? 'Could not save photo. Check your connection.');
    } finally { setAvatarUploading(false); }
  };

  const removeAvatar = () => {
    onClosePhotoPicker();
    showAlert('Remove photo', 'Are you sure you want to remove your profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const prev = avatarUri;
          onAvatarUriChange(null);
          try { await onSave('', ''); /* triggers updateProfile with avatar_url: null via parent */ }
          catch { onAvatarUriChange(prev); showAlert('Error', 'Could not remove photo. Please try again.'); }
        },
      },
    ]);
  };

  return (
    <>
      {/* ── Edit name / phone ── */}
      <BottomSheet visible={showEdit} onClose={onCloseEdit} title="Edit profile">
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          <Text style={[mdl.fieldLabel, { color: colors.textSecondary }]}>Full name</Text>
          <TextInput
            style={[mdl.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
            placeholder="Your full name" placeholderTextColor={colors.placeholder}
            value={editName} onChangeText={t => setEditName(t.replace(/[^a-zA-Z\s\-'.]/g, ''))}
            returnKeyType="next" maxLength={60} autoCapitalize="words" autoCorrect={false} />
          <Text style={[mdl.fieldLabel, { color: colors.textSecondary }]}>Phone (optional)</Text>
          <TextInput
            style={[mdl.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
            placeholder="+1 555 000 0000" placeholderTextColor={colors.placeholder}
            value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" returnKeyType="done" maxLength={20} />
        </ScrollView>
        <View style={[mdl.footer, { borderTopColor: colors.border }]}>
          <TouchableOpacity style={[mdl.secBtn, { borderColor: colors.border }]} onPress={onCloseEdit}>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[mdl.primBtn, { backgroundColor: accent, opacity: saving ? 0.75 : 1 }]}
            onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: TYPO.body, color: '#fff', fontWeight: '700' }}>Save changes</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Photo picker ── */}
      <BottomSheet visible={showPhotoPicker} onClose={onClosePhotoPicker}>
        <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 20 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, overflow: 'hidden' }}>
            {avatarUri
              ? <LazyImage key={avatarUri} uri={avatarUri} style={{ width: 84, height: 84 }} />
              : <LinearGradient colors={[accent + 'DD', accent + '99']}
                  style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: TYPO.hero, fontWeight: '800', color: '#fff' }}>{avatarInit}</Text>
                </LinearGradient>
            }
          </View>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary, marginTop: 12 }}>{profileName ?? 'Profile photo'}</Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 }}>Choose how to update your photo</Text>
        </View>
        <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 12 }}>
          {[
            { icon: 'camera' as const, label: 'Take a photo', sub: 'Use your camera', fromCamera: true },
            { icon: 'images' as const, label: 'Choose from library', sub: 'Pick from your photos', fromCamera: false },
          ].map((opt, i) => (
            <React.Fragment key={opt.label}>
              {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
              <TouchableOpacity onPress={() => pickAndUpload(opt.fromCamera)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.card }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={opt.icon} size={19} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{opt.label}</Text>
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }}>{opt.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary ?? colors.textSecondary} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
          {avatarUri && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
              <TouchableOpacity onPress={removeAvatar}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.card }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trash" size={18} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#DC2626' }}>Remove photo</Text>
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }}>Revert to initials avatar</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>
        <TouchableOpacity onPress={onClosePhotoPicker}
          style={{ height: 50, borderRadius: 14, backgroundColor: colors.card,
            borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
            alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* ── Emoji picker ── */}
      <BottomSheet visible={showEmojiPicker} onClose={onCloseEmojiPicker} title="Choose your emoji">
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginBottom: 16 }}>
          This emoji appears next to your handle across the app.
        </Text>
        {[
          { label: 'People', emojis: ['🧑','👤','🙂','😊','😎','🥳','🤩','🧙','🦸','🧚','🧜','🧛','🧑‍🚀','🧑‍🍳','🧑‍🎨','👷'] },
          { label: 'Animals', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐸','🐵','🦆','🦉','🦋','🐝','🦄','🐉','🐺','🐾','🐠','🦜','🐢'] },
          { label: 'Nature & Vibes', emojis: ['🌟','⭐','🌈','☀️','🌙','🌊','🌺','🌸','🌻','🍀','🌿','🍁','🌴','🔥','💫','⚡','🎯','🎨','🎸','🎠'] },
        ].map(({ label, emojis }) => (
          <View key={label} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>{label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {emojis.map(e => (
                <TouchableOpacity key={e} onPress={async () => {
                  onEmojiChange(e);
                  onCloseEmojiPicker();
                  // Persist immediately — no need to wait for a save button
                  if (userId) await supabase.from('profiles').update({ user_emoji: e }).eq('id', userId);
                }}
                  style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: e === userEmoji ? accent + '28' : colors.inputBg,
                    borderWidth: 2, borderColor: e === userEmoji ? accent : 'transparent' }}>
                  <Text style={{ fontSize: TYPO.title }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </BottomSheet>
    </>
  );
});

export default ProfileEditSheet;
