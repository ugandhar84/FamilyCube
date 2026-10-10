/**
 * MemberEditScreen — full-page edit form (replaces the old
 * MemberProfileSheet's 'edit' AppBottomSheet section). Carried over
 * verbatim from MemberProfileSheet.tsx's EditSection — same avatar/color/
 * name/role/relationship/can-drive/whose-parent/what-do-the-kids-call-them
 * fields, same validation, same Save/Cancel — just rendered as its own
 * FullPageOverlay screen instead of swapping content inside a bottom sheet.
 *
 * EditBody (the actual form) is exported separately so
 * MemberProfileSheet.tsx's kiosk renderShell path can reuse the exact same
 * implementation — one fewer place behavior could drift between mobile's
 * full-page screen and kiosk's own KioskFormDrawer shell.
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator, Image,
  InteractionManager, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import FullPageOverlay from '@/components/FullPageOverlay';
import { showAlert } from '@/components/AppAlert';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import { uploadMemberAvatar } from '@/lib/supabase';
import { Car } from 'lucide-react-native';
import { PhotoPickerSheet } from '../RosterTab';
import { RELATIONSHIPS_BY_ROLE, useFamilyStore, type MemberRole } from '@/store/familyStore';
import { PALETTE_ORDER, MEMBER_COLORS, type MemberColorKey } from '@/constants/memberColors';

const AVATAR_EMOJIS = ['🧒','👦','👧','🧑','👩','👨','🧓','👴','👵','🦸','🧙','🧜','🦊','🐶','🐱','⭐'];
const ROLES = ['parent', 'child', 'teenager', 'senior'];

export function MemberEditScreen({
  visible, member, allMembers, onClose, onSave, onLinkParent, restrictToRelationship,
  colors, isDark, zIndex = 50,
}: {
  visible: boolean;
  member: any;
  allMembers: any[];
  onClose: () => void;
  onSave: (memberId: string, name: string, role: string, hasCar: boolean, rideEarnings: number, groceryEarnings: number, subRole?: string, relationship?: string, avatarEmoji?: string, avatarUrl?: string) => Promise<void>;
  onLinkParent?: (memberId: string, parentId: string) => void;
  /** Senior/GP — deliberately narrow: relationship + "what do the kids call
   * them" only, everything else stays untouched and un-editable from here. */
  restrictToRelationship?: boolean;
  colors: any; isDark: boolean; zIndex?: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <FullPageOverlay visible={visible} onDismiss={onClose} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.primary }}>‹ {member.name}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: 8 }}>
            Edit Member
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 40 }}>
          <EditBody member={member} allMembers={allMembers} onCancel={onClose} onSave={onSave}
            onLinkParent={onLinkParent} restrictToRelationship={restrictToRelationship}
            colors={colors} isDark={isDark} />
        </ScrollView>
      </View>
    </FullPageOverlay>
  );
}

// ─── Edit form body — carried over from the old EditMemberModal/
// MemberProfileSheet EditSection unchanged. Exported so
// MemberProfileSheet.tsx's kiosk renderShell path can reuse the exact same
// implementation instead of duplicating it. ─────────────────────────────────

export function EditBody({ member, allMembers, onCancel, onSave, onLinkParent, restrictToRelationship, colors, isDark }: {
  member: any; allMembers: any[];
  onCancel: () => void;
  onSave: (memberId: string, name: string, role: string, hasCar: boolean, rideEarnings: number, groceryEarnings: number, subRole?: string, relationship?: string, avatarEmoji?: string, avatarUrl?: string) => Promise<void>;
  onLinkParent?: (memberId: string, parentId: string) => void;
  restrictToRelationship?: boolean;
  colors: any; isDark: boolean;
}) {
  const [name, setName] = useState(member.name ?? '');
  const [pickedEmoji, setPickedEmoji] = useState<string | undefined>(undefined);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const currentAvatarPreview = photoUri ?? member.avatarUrl;
  const currentEmojiPreview = pickedEmoji ?? (member.avatarUrl ? undefined : member.emoji);

  // Personal color — saved immediately on tap (own updateMember call, not
  // bundled into the Save button below) since it's a standalone preference
  // with no other field depending on it, same as a toggle.
  const familyMembers = useFamilyStore(s => s.members);
  const updateMemberColor = useFamilyStore(s => s.updateMember);
  const [colorDraft, setColorDraft] = useState<MemberColorKey | undefined>(member.color);
  const [savingColor, setSavingColor] = useState(false);
  const takenColors = new Set(
    familyMembers.filter(m => m.id !== member.id && m.color).map(m => m.color as MemberColorKey)
  );
  const handlePickColor = async (key: MemberColorKey) => {
    if (key === colorDraft || savingColor) return;
    const prev = colorDraft;
    setColorDraft(key);
    setSavingColor(true);
    try {
      await updateMemberColor(member.id, { color: key });
    } catch {
      setColorDraft(prev);
    } finally {
      setSavingColor(false);
    }
  };

  const initialRole = member.role === 'kid' ? 'child' : member.role === 'teen' ? 'teenager' : (member.role ?? 'child');
  const [role, setRole] = useState(initialRole);
  const [hasCar, setHasCar] = useState(member.hasCar ?? (initialRole === 'parent'));
  const [rideEarnings, setRideEarnings] = useState(String(member.rideEarningsPerRun ?? 50));
  const [groceryEarnings, setGroceryEarnings] = useState(String(member.groceryEarningsPerRun ?? 30));
  const [linkedParentId, setLinkedParentId] = useState(member.linkedParentId as string | undefined);
  const [subRole, setSubRole] = useState(member.subRole as string | undefined);
  const [relationship, setRelationship] = useState(member.relationship as string | undefined);
  const [saving, setSaving] = useState(false);
  const parentOptions = allMembers.filter(m => m.role === 'parent');

  const roleForRelationships: MemberRole = role === 'child' ? 'kid' : role === 'teenager' ? 'teen' : (role as MemberRole);
  const relationshipOptions = RELATIONSHIPS_BY_ROLE[roleForRelationships] ?? [];

  const pickPhoto = async (fromCamera: boolean) => {
    setShowPhotoPicker(false);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      showAlert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to change this photo.`);
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

  const inp = {
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 13, paddingVertical: 11, textAlign: 'left' as const,
    fontSize: 15, letterSpacing: 0, color: colors.textPrimary,
    backgroundColor: isDark ? colors.card : '#F5F3FF',
  };

  const roleChip = (active: boolean, activeColor: string = colors.accent) => ({
    borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: active ? activeColor : 'transparent',
    borderColor: active ? activeColor : colors.border,
  });

  const handleSave = async () => {
    setSaving(true);
    let uploadedUrl: string | undefined;
    if (photoUri && member.familyId) {
      setUploadingPhoto(true);
      try {
        uploadedUrl = await uploadMemberAvatar(member.familyId, member.id, photoUri);
      } catch (e: any) {
        console.error('[MemberEditScreen] avatar upload failed', e?.message, e);
        showAlert('Photo upload failed', e?.message ? `${e.message} — other changes will still be saved.` : "Couldn't upload the photo — other changes will still be saved.");
      }
      setUploadingPhoto(false);
    }
    const finalUploadedUrl = uploadedUrl;
    InteractionManager.runAfterInteractions(() => {
      setSaving(false);
      onSave(member.id, name, role, hasCar, parseInt(rideEarnings) || 50, parseInt(groceryEarnings) || 30, subRole, relationship, pickedEmoji, finalUploadedUrl);
    });
  };

  return (
    <View>
      {!restrictToRelationship && (
        <>
          {/* Avatar — emoji or photo, same choice CompleteProfileScreen offers
              at onboarding. */}
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Photo</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <TouchableOpacity
              onPress={() => setShowPhotoPicker(true)}
              style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.accent + '18', borderWidth: 2, borderColor: colors.accent, overflow: 'hidden' }}>
              {currentAvatarPreview ? (
                <Image source={{ uri: currentAvatarPreview }} style={{ width: 60, height: 60 }} />
              ) : (
                <Text style={{ fontSize: 28 }}>{currentEmojiPreview ?? '👤'}</Text>
              )}
            </TouchableOpacity>
            {(photoUri || pickedEmoji) && (
              <TouchableOpacity onPress={() => { setPhotoUri(null); setPickedEmoji(undefined); }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
            {AVATAR_EMOJIS.map(e => (
              <TouchableOpacity key={e}
                onPress={() => { setPickedEmoji(e); setPhotoUri(null); }}
                style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: pickedEmoji === e ? colors.accent + '30' : 'transparent',
                  borderWidth: pickedEmoji === e ? 1.5 : 0, borderColor: colors.accent }}>
                <Text style={{ fontSize: 18 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Personal color — tints this member's own events/chores on
              Calendar, Agenda, and Hub. */}
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 10, marginBottom: 6 }}>Color</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            {PALETTE_ORDER.map(key => {
              const swatch = MEMBER_COLORS[key];
              const hex = isDark ? swatch.dark : swatch.light;
              const takenByOther = takenColors.has(key);
              const selected = colorDraft === key;
              return (
                <TouchableOpacity
                  key={key}
                  disabled={takenByOther || savingColor}
                  onPress={() => handlePickColor(key)}
                  accessibilityLabel={`${swatch.label}${takenByOther ? ', already used by another member' : ''}`}
                  style={{
                    width: 30, height: 30, borderRadius: 15, backgroundColor: hex,
                    opacity: takenByOther ? 0.25 : 1,
                    borderWidth: selected ? 3 : 0, borderColor: colors.textPrimary,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 10, marginBottom: 6 }}>Name</Text>
          <TextInput value={name} onChangeText={setName} style={inp} placeholderTextColor={colors.textTertiary} />

          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, marginBottom: 6 }}>Role</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            {ROLES.map(r => (
              <TouchableOpacity key={r} onPress={() => {
                setRole(r);
                const nextRole: MemberRole = r === 'child' ? 'kid' : r === 'teenager' ? 'teen' : (r as MemberRole);
                if (relationship && !RELATIONSHIPS_BY_ROLE[nextRole]?.includes(relationship)) setRelationship(undefined);
              }} style={roleChip(role === r)}>
                <Text style={{ fontSize: 13, fontWeight: '700', textTransform: 'capitalize',
                  color: role === r ? '#fff' : colors.textSecondary }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Relationship — purely descriptive, scoped to options that make
          sense for the selected role. Never gates permissions. */}
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, marginBottom: 6 }}>Relationship</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        {relationshipOptions.map(opt => {
          const picked = relationship === opt;
          return (
            <TouchableOpacity key={opt} onPress={() => setRelationship(picked ? undefined : opt)}
              style={roleChip(picked, colors.teal)}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: picked ? '#fff' : colors.textSecondary }}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Can Drive — controls whether this member shows up as pickable in
          ride reassignment (InlineReassignPanel). */}
      {(role === 'parent' || role === 'teenager') && (
        <View style={{ marginTop: 14, gap: 10 }}>
          <TouchableOpacity
            onPress={() => setHasCar((v: boolean) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              padding: 12, borderRadius: 12, borderWidth: 1.5,
              borderColor: hasCar ? colors.amber : colors.border,
              backgroundColor: hasCar ? colors.amber + '12' : 'transparent' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Car size={16} color={hasCar ? colors.amber : colors.textSecondary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: hasCar ? colors.amber : colors.textPrimary }}>
                Can Drive
              </Text>
            </View>
            <View style={{ width: 38, height: 22, borderRadius: 11,
              backgroundColor: hasCar ? colors.amber : colors.border,
              justifyContent: 'center', paddingHorizontal: 2 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                alignSelf: hasCar ? 'flex-end' : 'flex-start' }} />
            </View>
          </TouchableOpacity>
          {role === 'teenager' && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Ride earnings (coins)</Text>
                <TextInput value={rideEarnings} onChangeText={setRideEarnings} keyboardType="number-pad" style={inp} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Grocery earnings (coins)</Text>
                <TextInput value={groceryEarnings} onChangeText={setGroceryEarnings} keyboardType="number-pad" style={inp} />
              </View>
            </View>
          )}
        </View>
      )}

      {/* Senior-specific: which parent this GP belongs to. */}
      {role === 'senior' && parentOptions.length > 1 && (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Whose parent?</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            {parentOptions.map(par => {
              const picked = linkedParentId === par.id;
              return (
                <TouchableOpacity key={par.id} onPress={() => { setLinkedParentId(par.id); onLinkParent?.(member.id, par.id); }}
                  style={roleChip(picked, colors.info)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: picked ? '#fff' : colors.textSecondary }}>{par.name.split(' ')[0]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* How the kids address them. */}
      {role === 'senior' && (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>What do the kids call them?</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            {['Grandma', 'Grandpa'].map(opt => {
              const picked = subRole === opt;
              return (
                <TouchableOpacity key={opt} onPress={() => setSubRole(picked ? undefined : opt)}
                  style={roleChip(picked)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: picked ? '#fff' : colors.textSecondary }}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <TouchableOpacity onPress={onCancel}
          style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} disabled={saving}
          style={{ flex: 2, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.accent }}>
          {saving ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>{uploadingPhoto ? 'Uploading…' : 'Save'}</Text>}
        </TouchableOpacity>
      </View>

      <PhotoPickerSheet
        visible={showPhotoPicker} onClose={() => setShowPhotoPicker(false)}
        onTakePhoto={() => pickPhoto(true)} onChooseLibrary={() => pickPhoto(false)}
        onRemove={currentAvatarPreview ? () => { setShowPhotoPicker(false); setPhotoUri(null); setPickedEmoji(undefined); } : undefined}
        avatarUri={currentAvatarPreview} avatarEmoji={currentEmojiPreview} name={member.name}
        colors={colors} isDark={isDark} />
    </View>
  );
}
