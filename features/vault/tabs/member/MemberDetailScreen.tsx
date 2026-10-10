/**
 * MemberDetailScreen — full-page read-only member profile (replaces the old
 * MemberProfileSheet's 'view' + 'confirmRemove' AppBottomSheet sections).
 * Carried over verbatim from MemberProfileSheet.tsx's ViewSection/
 * ConfirmRemoveSection — same badge row / stat tiles / role chips / theme
 * colors, same actions (edit, delete, resend invite, generate recovery
 * code, reset PIN, change PIN) — just rendered as its own FullPageOverlay
 * screen with a header instead of swapping content inside a bottom sheet.
 *
 * Opened from FamilyTreePage (and RosterTab/ProfileSettingsScreen's roster
 * cards) via a tap; "Edit" navigates to MemberEditScreen, "Change PIN"/
 * "Reset PIN" navigate to MemberPinScreen, "Remove from Family" opens this
 * screen's own inline confirm step (same type-to-confirm pattern
 * ProfileSettingsScreen.tsx's danger zone uses) rather than a second Modal.
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import FullPageOverlay from '@/components/FullPageOverlay';
import FamilyAvatar from '@/components/FamilyAvatar';
import { Coins, Flame, Star, Car, Clock, Lock, Pencil, ChevronRight, Mail, RefreshCw, Trash2, KeyRound } from 'lucide-react-native';
import { fmtTime } from '@/lib/dates';
import { roleColor } from '../MemberCard';
import type { FamilyMember } from '@/store/familyStore';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export function MemberDetailScreen({
  visible, member, siblings, onClose, onEdit, onChangePin,
  isParentViewer, canChangePin, onDelete, onResetPin, onResendInvite, onGenerateRecoveryCode,
  colors, isDark, zIndex = 50,
}: {
  visible: boolean;
  member: FamilyMember;
  siblings: string[];
  onClose: () => void;
  onEdit: () => void;
  onChangePin: () => void;
  isParentViewer?: boolean;
  canChangePin?: boolean;
  onDelete?: (memberId: string) => Promise<void>;
  onResetPin?: (member: FamilyMember) => void;
  onResendInvite?: (member: FamilyMember) => Promise<{ ok: true; code: string; emailSent?: boolean; emailError?: string | null } | { ok: false; error: string }>;
  onGenerateRecoveryCode?: (member: FamilyMember) => Promise<{ ok: true; code: string } | { ok: false; error: string }>;
  colors: any; isDark: boolean; zIndex?: number;
}) {
  const insets = useSafeAreaInsets();
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const roleLabel = member.role === 'senior' ? 'Grandparent' : member.role.charAt(0).toUpperCase() + member.role.slice(1);
  const subtitle = member.relationship ?? roleLabel;

  const close = () => { setConfirmingRemove(false); onClose(); };

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.primary }}>‹ Family</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: 8 }}>
            {confirmingRemove ? 'Remove Member' : member.name}
          </Text>
          {!confirmingRemove && (
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 2 }}>
              {subtitle}
            </Text>
          )}
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 24 }}>
          {confirmingRemove ? (
            <ConfirmRemoveBody
              member={member}
              onCancel={() => setConfirmingRemove(false)}
              onConfirm={async (id) => { await onDelete!(id); close(); }}
              colors={colors} isDark={isDark}
            />
          ) : (
            <MemberDetailBody
              member={member} siblings={siblings} isParentViewer={isParentViewer} canChangePin={canChangePin}
              onDelete={onDelete} onResetPin={onResetPin} onResendInvite={onResendInvite} onGenerateRecoveryCode={onGenerateRecoveryCode}
              onEdit={onEdit} onChangePin={onChangePin}
              onRequestRemove={() => setConfirmingRemove(true)}
              colors={colors} isDark={isDark}
            />
          )}
        </View>
      </View>
    </FullPageOverlay>
  );
}

// ─── View section body (read-only summary — carried over from the old
// MemberProfileSheet's badge/stat-tile layout unchanged). Exported so
// MemberProfileSheet.tsx's kiosk renderShell path can reuse the exact same
// implementation instead of duplicating it. ─────────────────────────────────

export function MemberDetailBody({ member, siblings, isParentViewer, canChangePin, onDelete, onResetPin, onResendInvite, onGenerateRecoveryCode, onEdit, onChangePin, onRequestRemove, colors, isDark }: {
  member: FamilyMember; siblings: string[];
  isParentViewer?: boolean; canChangePin?: boolean;
  onDelete?: (memberId: string) => Promise<void>;
  onResetPin?: (member: FamilyMember) => void;
  onResendInvite?: (member: FamilyMember) => Promise<{ ok: true; code: string; emailSent?: boolean; emailError?: string | null } | { ok: false; error: string }>;
  onGenerateRecoveryCode?: (member: FamilyMember) => Promise<{ ok: true; code: string } | { ok: false; error: string }>;
  onEdit: () => void; onChangePin: () => void; onRequestRemove: () => void;
  colors: any; isDark: boolean;
}) {
  const rc = roleColor(member.role, colors);
  const isKidOrTeen = member.role === 'kid' || member.role === 'teen';
  const isSenior = member.role === 'senior';
  const [inviteResult, setInviteResult] = useState<{ code: string; emailSent?: boolean; emailError?: string | null } | { error: string } | null>(null);
  const [resending, setResending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<{ code: string } | { error: string } | null>(null);
  const [generatingRecovery, setGeneratingRecovery] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);

  const handleResendInvite = async () => {
    if (!onResendInvite || resending) return;
    setResending(true);
    setInviteResult(null);
    const result = await onResendInvite(member);
    setResending(false);
    setInviteResult(result.ok ? { code: result.code, emailSent: result.emailSent, emailError: result.emailError } : { error: result.error });
  };

  const handleGenerateRecoveryCode = async () => {
    if (!onGenerateRecoveryCode || generatingRecovery) return;
    setGeneratingRecovery(true);
    setRecoveryResult(null);
    const result = await onGenerateRecoveryCode(member);
    setGeneratingRecovery(false);
    setRecoveryResult(result.ok ? { code: result.code } : { error: result.error });
  };

  const copyRecoveryCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setRecoveryCopied(true);
    setTimeout(() => setRecoveryCopied(false), 2000);
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
        {isParentViewer && (
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
          set — one tap straight into MemberPinScreen, no Edit detour. Falls
          back to a plain, non-interactive status row when the viewer has no
          PIN rights. */}
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

      {/* "Lost this device?" — for a member who's already joined (has a PIN
          and an existing session), not the pending-invite case above. */}
      {onGenerateRecoveryCode && isParentViewer && member.inviteStatus !== 'pending' && !!member.pin && (
        <View style={{ marginTop: 12, gap: 10 }}>
          <TouchableOpacity onPress={handleGenerateRecoveryCode} disabled={generatingRecovery}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
              borderWidth: 1.5, borderColor: colors.border, opacity: generatingRecovery ? 0.6 : 1 }}>
            <KeyRound size={16} color={colors.accent} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>Lost this device?</Text>
            {generatingRecovery ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <RefreshCw size={14} color={colors.textTertiary} />}
          </TouchableOpacity>

          {recoveryResult && 'code' in recoveryResult && (
            <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: colors.accent + '50',
              backgroundColor: colors.accent + '10', padding: 14, gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>
                Recovery code for {member.name.split(' ')[0]} — expires in 1 hour
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '900', letterSpacing: 2, color: colors.textPrimary }}>
                {recoveryResult.code}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                On their new device: Login screen → "Recovering a profile on a new device?" → enter this code + their PIN.
              </Text>
              <TouchableOpacity onPress={() => copyRecoveryCode(recoveryResult.code)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                  {recoveryCopied ? 'Copied!' : 'Copy code'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {recoveryResult && 'error' in recoveryResult && (
            <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600' }}>{recoveryResult.error}</Text>
          )}
        </View>
      )}

      {/* Senior/GP — Reset PIN / Resend Invite are still direct one-tap
          actions here (not folded into Edit). */}
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
// ProfileSettingsScreen.tsx's own danger-zone TypeToConfirmRow pattern).
// Exported so MemberProfileSheet.tsx's kiosk renderShell path can reuse the
// exact same implementation instead of duplicating it. ──────────────────────

export function ConfirmRemoveBody({ member, onCancel, onConfirm, colors, isDark }: {
  member: FamilyMember;
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
