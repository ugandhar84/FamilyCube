/**
 * MemberProfileSheet — thin orchestrator for the member profile flow.
 *
 * Used to be a single AppBottomSheet instance with an internal `section`
 * state ('view' | 'edit' | 'pin' | 'confirmRemove') that swapped content in
 * place inside one bottom sheet. Per this project's "no bottom sheets" rule
 * (CLAUDE.md) and the Home Care rhythm (a top-level owner + one
 * FullPageOverlay screen per step, detail-then-edit), the view/edit/pin
 * sections are now three separate full-page screens under
 * features/vault/tabs/member/: MemberDetailScreen (view + confirmRemove),
 * MemberEditScreen, MemberPinScreen. This component still owns which one is
 * "open" (`section` state) and still exposes the exact same props callers
 * already wire up (onSave, onSavePin, onDelete, onResendInvite,
 * onGenerateRecoveryCode, isParentViewer, canChangePin, initialSection,
 * renderShell) — FamilyTreePage/RosterTab/ProfileSettingsScreen needed no
 * changes beyond this file.
 *
 * Kiosk exception: `renderShell` (wired through ProfileSettingsScreen's
 * `memberSheetShell` from KioskProfileTab) swaps the WHOLE body for kiosk's
 * own right-side KioskFormDrawer, exactly as before — that drawer is
 * kiosk's native non-bottom-sheet container, not a phone AppBottomSheet, so
 * it's preserved unchanged here rather than also being split into 3 pages;
 * splitting would break the single dynamic-title drawer kiosk already
 * built around this prop. Mobile (no renderShell) never hits this path —
 * AppBottomSheet is no longer imported or used anywhere in this file.
 */
import { useState, useEffect } from 'react';
import { MemberDetailScreen, MemberDetailBody, ConfirmRemoveBody } from './member/MemberDetailScreen';
import { MemberEditScreen, EditBody } from './member/MemberEditScreen';
import { MemberPinScreen, PinBody } from './member/MemberPinScreen';
import type { FamilyMember } from '@/store/familyStore';

export function MemberProfileSheet({ member, siblings, allMembers, visible, onClose, onSave, onLinkParent, onDelete, onSavePin, onResetPin, onResendInvite, onGenerateRecoveryCode, isParentViewer, canChangePin, initialSection, colors, isDark, renderShell }: {
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
   * copy/share actions. */
  onResendInvite?: (member: FamilyMember) => Promise<{ ok: true; code: string; emailSent?: boolean; emailError?: string | null } | { ok: false; error: string }>;
  /** Generates a short-lived device-recovery code for an already-ACTIVE
   * member whose original device was lost/wiped. Omit to hide "Lost this
   * device?" entirely. */
  onGenerateRecoveryCode?: (member: FamilyMember) => Promise<{ ok: true; code: string } | { ok: false; error: string }>;
  /** Gates the Edit entry point — parent-only, same as before. */
  isParentViewer?: boolean;
  /** Gates the Change PIN entry point — parent or the member themself. */
  canChangePin?: boolean;
  /** Which section to land on when this opens — defaults to the read-only
   * 'view'. Re-derived below any time the caller's intent changes: a new
   * initialSection, a different member, or this re-opening (visible
   * flipping back to true) — same re-sync fix the old sheet needed, since
   * a tap that changes initialSection while already open (e.g. "Reset PIN"
   * from inside the view screen) must still take effect. */
  initialSection?: 'view' | 'edit' | 'pin';
  colors: any; isDark: boolean;
  /** Kiosk-only: swaps the whole flow for kiosk's own right-side
   *  KioskFormDrawer around the same real view/edit/pin/confirmRemove body
   *  [live-requested: "the family memeber edit shoud also open the side
   *  bar"]. Receives the computed title/subtitle too, since this title
   *  changes per-section. Mobile never passes this, so it gets the 3
   *  separate FullPageOverlay screens below instead. */
  renderShell?: (visible: boolean, onClose: () => void, title: string, subtitle: string | undefined, children: React.ReactNode) => React.ReactNode;
}) {
  const [section, setSection] = useState<'view' | 'edit' | 'pin' | 'confirmRemove'>(initialSection ?? 'view');
  useEffect(() => {
    if (visible) setSection(initialSection ?? 'view');
  }, [visible, initialSection, member.id]);
  const isSenior = member.role === 'senior';
  const roleLabel = member.role === 'senior' ? 'Grandparent' : member.role.charAt(0).toUpperCase() + member.role.slice(1);

  const close = () => { setSection('view'); onClose(); };

  // ── Kiosk path: unchanged combined-body + renderShell swap ─────────────
  if (renderShell) {
    const title = section === 'edit' ? 'Edit Member' : section === 'pin' ? (member.pin ? 'Change PIN' : 'Set PIN') : section === 'confirmRemove' ? 'Remove Member' : member.name;
    const subtitle = section === 'view' ? (member.relationship ?? roleLabel) : undefined;
    const body = (
      <>
        {section === 'view' && (
          <MemberDetailBody member={member} siblings={siblings} isParentViewer={isParentViewer} canChangePin={canChangePin}
            onDelete={onDelete} onResetPin={onResetPin} onResendInvite={onResendInvite} onGenerateRecoveryCode={onGenerateRecoveryCode}
            onEdit={() => setSection('edit')} onChangePin={() => setSection('pin')}
            onRequestRemove={() => setSection('confirmRemove')} colors={colors} isDark={isDark} />
        )}
        {section === 'confirmRemove' && onDelete && (
          <ConfirmRemoveBody member={member} onCancel={() => setSection('view')}
            onConfirm={async (id) => { await onDelete(id); close(); }} colors={colors} isDark={isDark} />
        )}
        {section === 'edit' && onSave && (
          <EditBody member={member} allMembers={allMembers ?? []} onCancel={() => setSection('view')} onLinkParent={onLinkParent}
            restrictToRelationship={isSenior}
            onSave={async (...args: any[]) => { await (onSave as any)(...args); close(); }}
            colors={colors} isDark={isDark} />
        )}
        {section === 'pin' && onSavePin && (
          <PinBody member={member} onCancel={() => setSection('view')}
            onSave={async (id, pin) => { await onSavePin(id, pin); close(); }} colors={colors} isDark={isDark} />
        )}
      </>
    );
    return <>{renderShell(visible, close, title, subtitle, body)}</>;
  }

  // ── Mobile path: 3 separate full-page screens ───────────────────────────
  return (
    <>
      <MemberDetailScreen
        visible={visible && section === 'view'}
        member={member} siblings={siblings} onClose={close}
        onEdit={() => setSection('edit')} onChangePin={() => setSection('pin')}
        isParentViewer={isParentViewer} canChangePin={canChangePin}
        onDelete={onDelete} onResetPin={onResetPin} onResendInvite={onResendInvite} onGenerateRecoveryCode={onGenerateRecoveryCode}
        colors={colors} isDark={isDark} zIndex={50}
      />
      {onSave && (
        <MemberEditScreen
          visible={visible && section === 'edit'}
          member={member} allMembers={allMembers ?? []}
          onClose={() => setSection('view')}
          onSave={async (...args: any[]) => { await (onSave as any)(...args); close(); }}
          onLinkParent={onLinkParent}
          restrictToRelationship={isSenior}
          colors={colors} isDark={isDark} zIndex={51}
        />
      )}
      {onSavePin && (
        <MemberPinScreen
          visible={visible && section === 'pin'}
          member={member}
          onClose={() => setSection('view')}
          onSave={async (id, pin) => { await onSavePin(id, pin); close(); }}
          colors={colors} isDark={isDark} zIndex={51}
        />
      )}
    </>
  );
}
