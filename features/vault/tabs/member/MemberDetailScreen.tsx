/**
 * MemberDetailScreen — full-page read-only member profile (replaces the old
 * MemberProfileSheet's 'view' + 'confirmRemove' AppBottomSheet sections).
 *
 * Rebuilt to match a supplied "Ruth Parker" mockup: grouped white cards
 * ("Profile details", "Sharing boundaries", "Driving permission",
 * "Invitation status") instead of the previous stat-tile layout, with
 * each action (Edit, Reset PIN, Generate recovery code, Remove) as its
 * own full-width row button rather than small inline icon buttons
 * [live-requested: "match 100% figma page" -> "i think we can remove
 * this profile page directly we can use this" — the earlier in-progress
 * "your place" relationship screen was dropped in favor of reskinning
 * THIS screen, which tapping a tree card already opens directly].
 *
 * "Sharing boundaries" and "Driving permission" show this app's real
 * rules/data (health ownership is CLAUDE.md's own documented policy —
 * "Kids own their own health records; parents may review"; driving
 * shows the real hasCar/GP drive-window fields already on FamilyMember)
 * rather than the mockup's own fictional demo copy, since there's no
 * backing field for invented per-member permission text in this schema.
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
import { Coins, Flame, Star, Lock, ChevronRight } from 'lucide-react-native';
import { fmtTime } from '@/lib/dates';
import { roleColor } from '../MemberCard';
import type { FamilyMember } from '@/store/familyStore';
import { GEMINI } from '@/constants/geminiRhythm';

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

function InfoCard({ title, children, colors, isDark }: { title?: string; children: React.ReactNode; colors: any; isDark: boolean }) {
  return (
    <View style={{
      backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderRadius: 18,
      borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
      padding: 18, gap: 14,
    }}>
      {title && <Text style={{ fontSize: 18, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{title}</Text>}
      {children}
    </View>
  );
}

function InfoRow({ title, lines, colors, isDark }: { title: string; lines: string[]; colors: any; isDark: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 15, color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{title}</Text>
      {lines.map((l, i) => (
        <Text key={i} style={{ fontSize: 13, color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>{l}</Text>
      ))}
    </View>
  );
}

/** Full-width action row button, matching the mockup's "Edit basic
 * details" / "Reset PIN" / "Generate recovery code" / "Review family
 * removal" row style — plain bordered pill with centered link-blue text,
 * or filled blue for the single primary action. */
function ActionRow({ label, onPress, primary, danger, disabled, colors, isDark }: {
  label: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean;
  colors: any; isDark: boolean;
}) {
  const linkC = isDark ? GEMINI.blue : GEMINI.linkBlue;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}
      style={{
        borderRadius: 14, paddingVertical: 15, alignItems: 'center',
        backgroundColor: primary ? GEMINI.blue : (isDark ? colors.card : GEMINI.cardBg),
        borderWidth: primary ? 0 : 1, borderColor: isDark ? colors.border : GEMINI.border,
        opacity: disabled ? 0.5 : 1,
      }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: primary ? '#FFFFFF' : (danger ? colors.danger : linkC) }}>
        {label}
      </Text>
    </TouchableOpacity>
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
  const canvas = isDark ? colors.background : GEMINI.canvas;
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC  = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const linkC  = isDark ? GEMINI.blue : GEMINI.linkBlue;

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: linkC }}>‹ People{!confirmingRemove ? ` / ${member.name.split(' ')[0]}` : ''}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 26, fontWeight: '800', color: titleC, marginTop: 8 }}>
            {confirmingRemove ? 'Remove Member' : member.name}
          </Text>
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

  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC  = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const linkC  = isDark ? GEMINI.blue : GEMINI.linkBlue;
  const roleLabel = member.role === 'senior' ? 'Grandparent' : member.role.charAt(0).toUpperCase() + member.role.slice(1);

  // Real driving-permission line, from the actual hasCar/GP drive-window
  // fields already on FamilyMember — not invented copy.
  const drivingLine = member.role === 'teen'
    ? (member.hasCar ? 'ON · in the ride/pickup pool' : 'OFF · not in the ride/pickup pool')
    : isSenior
      ? (member.gpCheerleaderMode
          ? 'OFF · cheerleader mode, not available to drive'
          : `ON · available ${fmtTime(member.gpDriveWindowStart)}–${fmtTime(member.gpDriveWindowEnd)}${member.gpWeeklyRideCap ? ` · up to ${member.gpWeeklyRideCap}/week` : ''}`)
      : 'Not applicable for this role';

  return (
    <View style={{ gap: 16 }}>
      <InfoCard colors={colors} isDark={isDark}>
        <View style={{ alignItems: 'center' }}>
          <FamilyAvatar name={member.name} emoji={member.emoji} avatarUrl={member.avatarUrl}
            siblings={siblings} size={88} ringWidth={0} shape="circle" />
          <View style={{ marginTop: 14, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5,
            backgroundColor: isDark ? colors.accent + '26' : '#E4E8FB' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.accent : GEMINI.blue }}>
              {member.inviteStatus === 'pending' ? 'Pending' : 'Active'} · {roleLabel}
            </Text>
          </View>
        </View>

        {isKidOrTeen && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatTile Icon={Coins} label="Coins" value={String(member.coins)} colors={colors} accent={colors.amber} />
            <StatTile Icon={Star} label="Level" value={String(member.level)} colors={colors} accent={rc} />
            <StatTile Icon={Flame} label="Streak" value={`${member.streak}d`} colors={colors} accent={colors.danger} />
          </View>
        )}

        {member.inviteStatus === 'pending' && (
          <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
            backgroundColor: colors.amber + '18', alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.amber }}>Invite pending</Text>
          </View>
        )}
      </InfoCard>

      {/* Profile details / Sharing boundaries / Driving permission —
          matches the mockup's grouped-card layout. */}
      <InfoCard title="Profile details" colors={colors} isDark={isDark}>
        <InfoRow title={member.name} lines={[
          `Display name: ${member.name.split(' ')[0]} · ${member.relationship ?? roleLabel}`,
        ]} colors={colors} isDark={isDark} />
        <InfoRow title="Sharing boundaries" lines={[
          isKidOrTeen || isSenior
            ? `${member.name.split(' ')[0]} owns their own health records. Parents may review, not edit.`
            : 'As a parent, full household visibility — kids/teens/seniors keep their own health records.',
        ]} colors={colors} isDark={isDark} />
        <InfoRow title="Driving permission" lines={[drivingLine]} colors={colors} isDark={isDark} />
      </InfoCard>

      {/* PIN status — tapping opens Change/Set PIN when the viewer has
          rights; otherwise a plain status line. */}
      <InfoCard colors={colors} isDark={isDark}>
        {canChangePin ? (
          <TouchableOpacity onPress={onChangePin} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Lock size={14} color={member.pin ? colors.success : colors.textTertiary} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: titleC }}>
              {member.pin ? 'PIN set' : 'No PIN set'}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: linkC }}>
              {member.pin ? 'Change' : 'Set PIN'}
            </Text>
            <ChevronRight size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Lock size={14} color={member.pin ? colors.success : colors.textTertiary} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: titleC }}>
              {member.pin ? 'PIN set' : 'No PIN set'}
            </Text>
          </View>
        )}
      </InfoCard>

      {/* Edit — primary action row. */}
      {isParentViewer && (
        <ActionRow label="Edit basic details" onPress={onEdit} primary colors={colors} isDark={isDark} />
      )}

      {/* Reset PIN / recovery — one row each, matching the mockup's
          "Reset PIN · verification required" / "Generate recovery code ·
          verify first" rows. */}
      {isSenior && isParentViewer && onResetPin && (
        <ActionRow label="Reset PIN · verification required" onPress={() => onResetPin(member)} colors={colors} isDark={isDark} />
      )}
      {onGenerateRecoveryCode && isParentViewer && member.inviteStatus !== 'pending' && !!member.pin && (
        <View style={{ gap: 10 }}>
          <ActionRow label="Generate recovery code · verify first" onPress={handleGenerateRecoveryCode} disabled={generatingRecovery} colors={colors} isDark={isDark} />
          {generatingRecovery && <ActivityIndicator size="small" color={colors.textTertiary} />}
          {recoveryResult && 'code' in recoveryResult && (
            <InfoCard colors={colors} isDark={isDark}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: bodyC }}>
                Recovery code for {member.name.split(' ')[0]} — expires in 1 hour
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '900', letterSpacing: 2, color: titleC }}>
                {recoveryResult.code}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                On their new device: Login screen → "Recovering a profile on a new device?" → enter this code + their PIN.
              </Text>
              <TouchableOpacity onPress={() => copyRecoveryCode(recoveryResult.code)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: titleC }}>
                  {recoveryCopied ? 'Copied!' : 'Copy code'}
                </Text>
              </TouchableOpacity>
            </InfoCard>
          )}
          {recoveryResult && 'error' in recoveryResult && (
            <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600' }}>{recoveryResult.error}</Text>
          )}
        </View>
      )}

      {/* Invitation status — matches the mockup's own card, describing
          the real resend-invite rule (pending accounts only). */}
      {isSenior && isParentViewer && (
        <InfoCard title="Invitation status" colors={colors} isDark={isDark}>
          <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18 }}>
            {member.inviteStatus === 'pending'
              ? `${member.name.split(' ')[0]}'s invite is pending. Resend it below to send a fresh code.`
              : `${member.name.split(' ')[0]}'s account is active. Resend invite is only available for pending accounts.`}
          </Text>
          {onResendInvite && member.inviteStatus === 'pending' && (
            <ActionRow label={resending ? 'Resending…' : 'Resend invite'} onPress={handleResendInvite} disabled={resending} colors={colors} isDark={isDark} />
          )}
          {inviteResult && 'code' in inviteResult && (
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: bodyC }}>
                New code for {member.name.split(' ')[0]}
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '900', letterSpacing: 2, color: titleC }}>
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
                  <Text style={{ fontSize: 13, fontWeight: '700', color: titleC }}>
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
        </InfoCard>
      )}

      {onDelete && isParentViewer && (
        <ActionRow label="Review family removal →" onPress={onRequestRemove} danger colors={colors} isDark={isDark} />
      )}

      <Text style={{ fontSize: 12, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, textAlign: 'center', lineHeight: 17 }}>
        Account help never bypasses {member.name.split(' ')[0]}'s own consent. Own-profile settings and record
        permissions remain {member.name.split(' ')[0]}'s choices.
      </Text>
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
