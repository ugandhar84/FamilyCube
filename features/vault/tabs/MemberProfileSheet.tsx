/**
 * MemberProfileSheet — the ONE tap-to-open destination for any member card
 * (Profile's carousel, RosterTab's FamilyTreeView both wire tap → this).
 * Used to be a 3-modal chain (this read-only sheet → a separate
 * EditMemberModal, which itself had ANOTHER internal view/edit toggle → a
 * third separate PinModal for changing a PIN) — too many stacked taps to
 * reach anything actionable. Now it's ONE AppBottomSheet instance per
 * member with an internal `section` state ('view' | 'edit' | 'pin' |
 * 'confirmRemove') that swaps content in place; nothing here ever mounts a
 * second top-level Modal except the photo-picker sub-sheet, which is a
 * deliberate, narrow exception (native camera/library presentation needs
 * its own sheet). "Minimal" here is about interaction depth — fewer taps,
 * everything consolidated into one place — not visual styling; the badge
 * row / role chips / bordered cards / theme colors below are carried over
 * from the old MemberProfileSheet + EditMemberModal + PinModal unchanged.
 *
 * Role-gating is unchanged from the old 3-modal version: kid/teen/parent
 * get a full edit form; senior/grandparent get a narrow surface (PIN
 * reset + resend invite only, no name/avatar/relationship/role editing).
 * "Change PIN" is available to more people (self or parent) than full
 * editing (parent only) — isParentViewer gates the Edit entry point,
 * canChangePin gates the PIN entry point, same split as before.
 *
 * Removing a member now requires typing their name to confirm (matches
 * ProfileSettingsScreen.tsx's own danger-zone TypeToConfirmRow pattern)
 * instead of a plain Alert.alert Cancel/Remove pair — still genuinely
 * destructive/confirm-worthy, so the extra step is deliberate friction,
 * not something the "fewer taps" goal is asking to remove.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator, Image,
  StyleSheet, InteractionManager, Share,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import AppBottomSheet from '@/components/AppBottomSheet';
import FamilyAvatar from '@/components/FamilyAvatar';
import { showAlert } from '@/components/AppAlert';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import { uploadMemberAvatar } from '@/lib/supabase';
import { Coins, Flame, Star, Car, Clock, Lock, Pencil, ChevronRight, Mail, RefreshCw, Trash2, KeyRound } from 'lucide-react-native';
import { fmtTime } from '@/lib/dates';
import { roleColor } from './MemberCard';
import { PhotoPickerSheet } from './RosterTab';
import { RELATIONSHIPS_BY_ROLE, type MemberRole, type FamilyMember } from '@/store/familyStore';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Same avatar-emoji set used at onboarding (CompleteProfileScreen/
// JoinFamilyScreen) — reused here so editing someone's avatar later shows
// the identical picker.
const AVATAR_EMOJIS = ['🧒','👦','👧','🧑','👩','👨','🧓','👴','👵','🦸','🧙','🧜','🦊','🐶','🐱','⭐'];
const ROLES = ['parent', 'child', 'teenager', 'senior'];

function StatTile({ Icon, label, value, colors, accent }: { Icon: any; label: string; value: string; colors: any; accent: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4, borderRadius: 14, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.surface, paddingVertical: 12 }}>
      <Icon size={16} color={accent} />
      <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>{value}</Text>
      <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

export function MemberProfileSheet({ member, siblings, allMembers, visible, onClose, onSave, onLinkParent, onDelete, onSavePin, onResetPin, onResendInvite, isParentViewer, canChangePin, initialSection, colors, isDark }: {
  member: FamilyMember; siblings: string[]; visible: boolean; onClose: () => void;
  /** All members — needed for the edit section's "whose parent?" picker. */
  allMembers?: any[];
  /** Persists the full edit form. Omit (along with isParentViewer=false)
   * to hide the Edit entry point entirely. */
  onSave?: (memberId: string, name: string, role: string, hasCar: boolean, rideEarnings: number, groceryEarnings: number, subRole?: string, relationship?: string, avatarEmoji?: string, avatarUrl?: string) => Promise<void>;
  onLinkParent?: (memberId: string, parentId: string) => void;
  onDelete?: (memberId: string) => Promise<void>;
  /** Persists a new PIN. Omit to hide the "Change PIN" row entirely. */
  onSavePin?: (memberId: string, pin: string) => Promise<void>;
  /** Senior/grandparent-only actions, rendered in the view section instead
   * of a full edit form. */
  onResetPin?: (member: FamilyMember) => void;
  /** Generates a fresh invite code and returns it (or an error) instead of
   * alerting directly — the view section renders the result inline with
   * copy/share actions. A native Alert.alert fired here while this sheet's
   * Modal is still visible was the exact freeze already found and fixed
   * once this session for the photo picker; this avoids the same bug. */
  onResendInvite?: (member: FamilyMember) => Promise<{ ok: true; code: string; emailSent?: boolean; emailError?: string | null } | { ok: false; error: string }>;
  /** Gates the Edit entry point — parent-only, same as before. */
  isParentViewer?: boolean;
  /** Gates the Change PIN entry point — parent or the member themself. */
  canChangePin?: boolean;
  /** Which section to land on when the sheet opens — defaults to the
   * read-only 'view'. Long-press-to-edit (parents, FamilyTreeView) and
   * tap-the-key-icon-for-PIN both still work as direct one-tap shortcuts
   * INTO this same single sheet instance, just landing on a different
   * initial section instead of opening a second Modal. Re-derived from
   * the member id below so re-opening for a different member (or
   * re-opening the same member a second time) always respects the
   * caller's latest intent rather than getting stuck on whatever section
   * was showing when the sheet last closed. */
  initialSection?: 'view' | 'edit' | 'pin';
  colors: any; isDark: boolean;
}) {
  const [section, setSection] = useState<'view' | 'edit' | 'pin' | 'confirmRemove'>(initialSection ?? 'view');
  // The useState initializer above only runs on first mount — this sheet
  // never unmounts between opens (same MemberProfileSheet instance stays
  // rendered, `visible` just toggles), so a tap that changes initialSection
  // while the sheet is ALREADY open (e.g. "Reset PIN" from inside the view
  // section, which calls openMember(m, 'pin') on an already-mounted sheet)
  // silently did nothing — section never re-synced. Re-derive it any time
  // the caller's intent changes: a new initialSection, a different member,
  // or the sheet re-opening (visible flipping back to true).
  useEffect(() => {
    if (visible) setSection(initialSection ?? 'view');
  }, [visible, initialSection, member.id]);
  const rc = roleColor(member.role, colors);
  const isKidOrTeen = member.role === 'kid' || member.role === 'teen';
  const isSenior = member.role === 'senior';
  const roleLabel = member.role === 'senior' ? 'Grandparent' : member.role.charAt(0).toUpperCase() + member.role.slice(1);

  const close = () => { setSection('view'); onClose(); };

  return (
    <AppBottomSheet visible={visible} onClose={close}
      title={section === 'edit' ? 'Edit Member' : section === 'pin' ? (member.pin ? 'Change PIN' : 'Set PIN') : section === 'confirmRemove' ? 'Remove Member' : member.name}
      subtitle={section === 'view' ? (member.relationship ?? roleLabel) : undefined}
      accentColor={rc} minHeight="40%" maxHeight="85%">
      {section === 'view' && (
        <ViewSection member={member} siblings={siblings} rc={rc} isKidOrTeen={isKidOrTeen} isSenior={isSenior}
          isParentViewer={isParentViewer} canChangePin={canChangePin} onSave={onSave} onDelete={onDelete}
          onResetPin={onResetPin} onResendInvite={onResendInvite}
          onEdit={() => setSection('edit')} onChangePin={() => setSection('pin')}
          onRequestRemove={() => setSection('confirmRemove')}
          colors={colors} isDark={isDark} />
      )}
      {section === 'confirmRemove' && onDelete && (
        <ConfirmRemoveSection member={member} rc={rc}
          onCancel={() => setSection('view')}
          onConfirm={async (id) => { await onDelete(id); close(); }}
          colors={colors} isDark={isDark} />
      )}
      {section === 'edit' && onSave && (
        <EditSection member={member} allMembers={allMembers ?? []} rc={rc}
          onCancel={() => setSection('view')} onLinkParent={onLinkParent}
          restrictToRelationship={isSenior}
          onSave={async (...args) => { await onSave(...args); close(); }}
          colors={colors} isDark={isDark} />
      )}
      {section === 'pin' && onSavePin && (
        <PinSection member={member} rc={rc}
          onCancel={() => setSection('view')}
          onSave={async (id, pin) => { await onSavePin(id, pin); close(); }}
          colors={colors} isDark={isDark} />
      )}
    </AppBottomSheet>
  );
}

// ─── View section (read-only summary — carried over from the old
// MemberProfileSheet's badge/stat-tile layout unchanged) ────────────────────

function ViewSection({ member, siblings, rc, isKidOrTeen, isSenior, isParentViewer, canChangePin, onSave, onDelete, onResetPin, onResendInvite, onEdit, onChangePin, onRequestRemove, colors, isDark }: {
  member: FamilyMember; siblings: string[]; rc: string; isKidOrTeen: boolean; isSenior: boolean;
  isParentViewer?: boolean; canChangePin?: boolean;
  onSave?: (...args: any[]) => Promise<void>;
  onDelete?: (memberId: string) => Promise<void>;
  onResetPin?: (member: FamilyMember) => void;
  onResendInvite?: (member: FamilyMember) => Promise<{ ok: true; code: string; emailSent?: boolean; emailError?: string | null } | { ok: false; error: string }>;
  onEdit: () => void; onChangePin: () => void; onRequestRemove: () => void;
  colors: any; isDark: boolean;
}) {
  const [inviteResult, setInviteResult] = useState<{ code: string; emailSent?: boolean; emailError?: string | null } | { error: string } | null>(null);
  const [resending, setResending] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleResendInvite = async () => {
    if (!onResendInvite || resending) return;
    setResending(true);
    setInviteResult(null);
    const result = await onResendInvite(member);
    setResending(false);
    setInviteResult(result.ok ? { code: result.code, emailSent: result.emailSent, emailError: result.emailError } : { error: result.error });
  };

  const copyInviteCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareInviteCode = async (code: string) => {
    try {
      await Share.share({ message: `Join our family on Family Cube! Use invite code ${code} to set up ${member.name}'s profile.` });
    } catch { /* user cancelled — no-op */ }
  };

  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <FamilyAvatar name={member.name} emoji={member.emoji} avatarUrl={member.avatarUrl}
          siblings={siblings} size={72} ringColor={rc} ringWidth={2.5} />
        {onSave && isParentViewer && (
          <TouchableOpacity onPress={onEdit}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: rc }}>
            <Pencil size={13} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {isKidOrTeen && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <StatTile Icon={Coins} label="Coins" value={String(member.coins)} colors={colors} accent={colors.amber} />
          <StatTile Icon={Star} label="Level" value={String(member.level)} colors={colors} accent={rc} />
          <StatTile Icon={Flame} label="Streak" value={`${member.streak}d`} colors={colors} accent={colors.danger} />
        </View>
      )}

      {member.role === 'teen' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
          borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
          padding: 12, marginBottom: 12 }}>
          <Car size={16} color={member.hasCar ? colors.amber : colors.textTertiary} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
            {member.hasCar ? 'Can drive — in the ride/pickup pool' : 'Not driving yet'}
          </Text>
        </View>
      )}

      {isSenior && (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
          padding: 12, marginBottom: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Clock size={14} color={colors.textSecondary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>
              {member.gpCheerleaderMode
                ? 'Cheerleader mode — not available to drive'
                : `Available ${fmtTime(member.gpDriveWindowStart)}–${fmtTime(member.gpDriveWindowEnd)}`}
            </Text>
          </View>
          {!member.gpCheerleaderMode && member.gpDriveWindowDays?.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginLeft: 22 }}>
              {[...member.gpDriveWindowDays].sort((a, b) => a - b).map(d => (
                <View key={d} style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
                  backgroundColor: rc + '14', borderWidth: 1, borderColor: rc + '30' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: rc }}>{DAY_SHORT[d]}</Text>
                </View>
              ))}
              {member.gpWeeklyRideCap ? (
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginLeft: 2 }}>
                  · up to {member.gpWeeklyRideCap}/week
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      {/* PIN status doubles as the "Change PIN" action when canChangePin is
          set — one tap straight into this same sheet's 'pin' section, no
          Edit detour and no separate PinModal. Falls back to a plain,
          non-interactive status row when the viewer has no PIN rights. */}
      {canChangePin ? (
        <TouchableOpacity onPress={onChangePin}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
            borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
            padding: 12 }}>
          <Lock size={14} color={member.pin ? colors.success : colors.textTertiary} />
          <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>
            {member.pin ? 'PIN set' : 'No PIN set'}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '800', color: rc }}>
            {member.pin ? 'Change' : 'Set PIN'}
          </Text>
          <ChevronRight size={14} color={colors.textTertiary} />
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
          borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
          padding: 12 }}>
          <Lock size={14} color={member.pin ? colors.success : colors.textTertiary} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>
            {member.pin ? 'PIN set' : 'No PIN set'}
          </Text>
        </View>
      )}

      {member.inviteStatus === 'pending' && (
        <View style={{ marginTop: 12, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
          backgroundColor: colors.amber + '18', alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.amber }}>Invite pending</Text>
        </View>
      )}

      {/* Senior/GP — Reset PIN / Resend Invite are still direct one-tap
          actions here (not folded into Edit); Edit itself now also opens
          for GPs above, but stays restricted to relationship only
          (EditSection's restrictToRelationship) — never name/avatar/role. */}
      {isSenior && isParentViewer && (
        <View style={{ marginTop: 12, gap: 10 }}>
          {onResetPin && (
            <TouchableOpacity onPress={() => onResetPin(member)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
                borderWidth: 1.5, borderColor: colors.border }}>
              <KeyRound size={16} color={colors.accent} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>Reset PIN</Text>
              <RefreshCw size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
          {onResendInvite && (
            <TouchableOpacity onPress={handleResendInvite} disabled={resending}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
                borderWidth: 1.5, borderColor: colors.border, opacity: resending ? 0.6 : 1 }}>
              <Mail size={16} color={colors.teal} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>Resend Invite</Text>
              {resending ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <RefreshCw size={14} color={colors.textTertiary} />}
            </TouchableOpacity>
          )}

          {inviteResult && 'code' in inviteResult && (
            <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: colors.teal + '50',
              backgroundColor: colors.teal + '10', padding: 14, gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>
                New code for {member.name.split(' ')[0]}
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '900', letterSpacing: 2, color: colors.textPrimary }}>
                {inviteResult.code}
              </Text>
              {inviteResult.emailSent && (
                <Text style={{ fontSize: 11, color: colors.teal, fontWeight: '700' }}>✓ Emailed to them</Text>
              )}
              {inviteResult.emailError && (
                <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                  Email couldn't be sent ({inviteResult.emailError}) — share the code directly instead.
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => copyInviteCode(inviteResult.code)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => shareInviteCode(inviteResult.code)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    borderRadius: 10, backgroundColor: colors.teal, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {inviteResult && 'error' in inviteResult && (
            <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600' }}>{inviteResult.error}</Text>
          )}
        </View>
      )}

      {onDelete && isParentViewer && (
        <TouchableOpacity onPress={onRequestRemove}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, paddingVertical: 10 }}>
          <Trash2 size={16} color={colors.danger} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger }}>Remove from Family</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Confirm-remove section (type-to-confirm, matches
// ProfileSettingsScreen.tsx's own danger-zone TypeToConfirmRow pattern) ──────

function ConfirmRemoveSection({ member, rc, onCancel, onConfirm, colors, isDark }: {
  member: FamilyMember; rc: string;
  onCancel: () => void;
  onConfirm: (memberId: string) => Promise<void>;
  colors: any; isDark: boolean;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [removing, setRemoving] = useState(false);
  const expected = member.name.toUpperCase();
  const matches = confirmText.trim().toUpperCase() === expected;

  return (
    <View>
      <View style={{
        padding: 14, borderRadius: 16, backgroundColor: isDark ? colors.card : '#fff',
        borderWidth: 1.5, borderColor: colors.danger + '50', marginBottom: 4,
      }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.danger, marginBottom: 6 }}>
          Remove {member.name}?
        </Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 }}>
          {member.name} will be removed from your family right away. Their profile is kept for 7 days in
          case you change your mind — switching back to them with their PIN restores everything. After 7
          days it's permanently deleted.
        </Text>

        <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>
          Type <Text style={{ fontWeight: '800', color: colors.textPrimary }}>{expected}</Text> to confirm.
        </Text>
        <TextInput
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={expected}
          placeholderTextColor={colors.textTertiary}
          style={{
            borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
            paddingHorizontal: 13, paddingVertical: 11, fontSize: 15,
            color: colors.textPrimary, backgroundColor: isDark ? colors.card : '#F5F3FF',
            marginBottom: 14,
          }}
        />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={onCancel}
            style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!matches || removing}
            onPress={async () => { setRemoving(true); await onConfirm(member.id); }}
            style={{ flex: 2, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
              backgroundColor: colors.danger, opacity: (!matches || removing) ? 0.4 : 1 }}>
            {removing ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Remove</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Edit section (full form — kid/teen/parent only; carried over from the
// old EditMemberModal's edit-mode content, styling unchanged) ───────────────

function EditSection({ member, allMembers, rc, onCancel, onSave, onLinkParent, restrictToRelationship, colors, isDark }: {
  member: any; allMembers: any[]; rc: string;
  onCancel: () => void;
  onSave: (memberId: string, name: string, role: string, hasCar: boolean, rideEarnings: number, groceryEarnings: number, subRole?: string, relationship?: string, avatarEmoji?: string, avatarUrl?: string) => Promise<void>;
  onLinkParent?: (memberId: string, parentId: string) => void;
  /** Senior/GP — deliberately narrow: relationship + "what do the kids call
   * them" only, everything else (name/avatar/role/Can-Drive/whose-parent)
   * stays untouched and un-editable from here. */
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

  // Same deliberate ordering as before: close the photo picker sheet fully
  // before ever launching the native camera/library UI — stacking a second
  // native presentation on top of a still-visible sheet is a known iOS
  // freeze/deadlock.
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
        console.error('[MemberProfileSheet] avatar upload failed', e?.message, e);
        showAlert('Photo upload failed', e?.message ? `${e.message} — other changes will still be saved.` : "Couldn't upload the photo — other changes will still be saved.");
      }
      setUploadingPhoto(false);
    }
    // Same freeze-avoidance ordering as the old EditMemberModal's Save
    // handler: the caller (onSave passed down from MemberProfileSheet)
    // closes the sheet first, then this defers the actual store write
    // until after the dismiss animation settles — onSave ultimately calls
    // familyStore's updateMember(), which triggers a big re-render (roster
    // list, Profile's carousel, FamilyTreeView, and a freshly changed
    // avatar Image needing to mount); running that in the same tick as the
    // dismiss is the freeze this ordering avoids.
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
          at onboarding. Picking a photo clears any just-picked emoji (and
          vice versa) so Save only ever sends one or the other. */}
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

// ─── PIN section (inline — ports PinModal's entry UI/logic, styling
// unchanged) ──────────────────────────────────────────────────────────────

function PinSection({ member, rc, onCancel, onSave, colors, isDark }: {
  member: any; rc: string;
  onCancel: () => void;
  onSave: (memberId: string, pin: string) => Promise<void>;
  colors: any; isDark: boolean;
}) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = () => {
    setError('');
    if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
    if (pin !== confirm) { setError('PINs do not match.'); return; }
    if (!/^\d+$/.test(pin)) { setError('PIN must be numbers only.'); return; }
    setSaving(true);
    // Same deferred-write pattern as the old PinModal: let the sheet's own
    // close/section-change settle before the store write lands.
    InteractionManager.runAfterInteractions(() => {
      setSaving(false);
      onSave(member.id, pin);
    });
  };

  const inp = {
    borderRadius: 12, borderWidth: 1.5,
    borderColor: error ? colors.danger : colors.border,
    backgroundColor: isDark ? colors.card : '#F5F3FF', color: colors.textPrimary,
    paddingHorizontal: 13, paddingVertical: 11, textAlign: 'center' as const,
    letterSpacing: 8, fontSize: 22,
  };

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 16 }}>
        {member.role === 'kid' ? `${member.name} uses this to unlock their profile.` : 'Used to confirm sensitive actions.'}
      </Text>

      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>New PIN (digits only)</Text>
      <TextInput value={pin} onChangeText={setPin} keyboardType="numeric" secureTextEntry maxLength={6}
        placeholder="••••" placeholderTextColor={colors.textTertiary} style={inp} />

      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, marginBottom: 6 }}>Confirm PIN</Text>
      <TextInput value={confirm} onChangeText={setConfirm} keyboardType="numeric" secureTextEntry maxLength={6}
        placeholder="••••" placeholderTextColor={colors.textTertiary} style={inp} />

      {error ? <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 6 }}>{error}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <TouchableOpacity onPress={onCancel}
          style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} disabled={saving}
          style={{ flex: 2, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.accent }}>
          {saving ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>{member.pin ? 'Update PIN' : 'Set PIN'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
