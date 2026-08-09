import { useState, useCallback, useEffect } from 'react';
import { showAlert } from '@/components/AppAlert';
import { supabase } from '@/lib/supabase';
import { removeFamilyMember, updateMemberRole, revokeInvite } from '@/lib/db';
import type { FamilyMember } from '@/features/social/types';

export function useSocialFamily(
  activePetId: string | null,
  petName: string | undefined,
) {
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<{ id: string; email: string; role: string; created_at: string }[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'caretaker' | 'caregiver' | 'viewer'>('caretaker');
  const [sending, setSending] = useState(false);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  useEffect(() => {
    setFamily([]);
    setPendingInvites([]);
  }, [activePetId]);

  const loadFamily = useCallback(async () => {
    if (!activePetId) return;
    const [membersRes, invitesRes] = await Promise.all([
      supabase.from('pet_family')
        .select('id, user_id, role, joined_at, profiles(full_name, handle, avatar_url)')
        .eq('pet_id', activePetId),
      supabase.from('family_invitations')
        .select('id, email, role, created_at')
        .eq('pet_id', activePetId).eq('status', 'pending'),
    ]);
    setFamily(membersRes.data as any ?? []);
    setPendingInvites(invitesRes.data as any ?? []);
  }, [activePetId]);

  const sendInvite = useCallback(async () => {
    if (!inviteEmail.trim() || !activePetId) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-family-invite', {
        body: { pet_id: activePetId, email: inviteEmail.trim().toLowerCase(), role: inviteRole },
      });
      if (error) {
        // Extract human-readable message from FunctionsHttpError response body
        let msg = 'Could not send invitation. Please try again.';
        try {
          const body = typeof (error as any).context?.json === 'function'
            ? await (error as any).context.json()
            : null;
          if (body?.error) msg = body.error;
          else if (body?.message) msg = body.message;
        } catch { /* use fallback msg */ }
        showAlert('Error', msg);
        return;
      }
      setShowInvite(false);
      setInviteEmail('');
      const emailSent: boolean = data?.email_sent ?? false;
      showAlert(
        'Invite sent! 🎉',
        emailSent
          ? `An invitation email was sent to ${inviteEmail.trim()}.`
          : `Invitation created. ${inviteEmail.trim()} will see it when they join PawBond.`,
      );
      loadFamily();
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  }, [inviteEmail, activePetId, inviteRole, loadFamily]);

  const removeFamily = useCallback((m: FamilyMember) => {
    showAlert('Remove member?', `Remove ${m.profiles?.handle ? `@${m.profiles.handle}` : 'this member'} from ${petName}'s care family?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await removeFamilyMember(m.id); loadFamily(); }
        catch (e: any) { showAlert('Error', e.message); }
      }},
    ]);
  }, [petName, loadFamily]);

  const updateRole = useCallback(async (memberId: string, role: string) => {
    setChangingRoleId(memberId);
    try {
      await updateMemberRole(memberId, role);
      loadFamily();
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setChangingRoleId(null);
    }
  }, [loadFamily]);

  const changeRole = useCallback((m: FamilyMember) => {
    showAlert(
      `Change ${m.profiles?.handle ? `@${m.profiles.handle}` : 'member'}'s role`,
      'Select a new role:',
      [
        { text: 'Caretaker — log health, post updates', onPress: () => updateRole(m.id, 'caretaker') },
        { text: 'Caregiver — daily care & feeding',     onPress: () => updateRole(m.id, 'caregiver') },
        { text: 'Viewer — read-only access',            onPress: () => updateRole(m.id, 'viewer') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [updateRole]);

  const cancelInvite = useCallback((inv: { id: string; email: string }) => {
    showAlert('Cancel invitation?', `Revoke the pending invite sent to ${inv.email}?`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel invite', style: 'destructive', onPress: async () => {
        try { await revokeInvite(inv.id); loadFamily(); }
        catch (e: any) { showAlert('Error', e.message); }
      }},
    ]);
  }, [loadFamily]);

  return {
    family, pendingInvites,
    showInvite, setShowInvite,
    inviteEmail, setInviteEmail,
    inviteRole, setInviteRole,
    sending, changingRoleId,
    loadFamily, sendInvite, removeFamily, changeRole, cancelInvite,
  };
}
