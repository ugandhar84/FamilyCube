/**
 * useCalendarSync — all state + handlers for connecting/disconnecting
 * Google, Outlook, and Apple calendars. Extracted from
 * features/profile/CalendarSyncScreen.tsx's CalendarSyncBody so a second
 * UI (the Figma-styled ConnectCalendarPage full-page entry point reached
 * from Family → Calendars) can render the exact same connect/disconnect/
 * cleanup behavior without re-deriving it — this system has a documented
 * history of real two-way-sync bugs (stale sync_token on reconnect,
 * duplicate pushed events, silent Apple failures), so every call site
 * shares one implementation instead of drifting.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { supabase } from '@/lib/supabase';
import { connectCalendar, type CalendarProvider, type CalendarPurpose } from '@/lib/calendarOAuth';
import { showAlert } from '@/components/AppAlert';
import { showToast } from '@/components/AppToast';

export interface ConnectionRow {
  id: string;
  provider: CalendarProvider;
  purpose: CalendarPurpose;
  status: 'active' | 'error' | 'disconnected';
  connected_account_email: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  tasks_scope_missing: boolean | null;
}

export const PROVIDER_LABEL: Record<CalendarProvider, string> = { google: 'Google Calendar', outlook: 'Outlook Calendar' };

export function useCalendarSync() {
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const activeMember = useFamilyStore(s => s.members.find(m => m.id === s.activeMemberId));
  const updateMember = useFamilyStore(s => s.updateMember);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<`${CalendarProvider}:${CalendarPurpose}` | null>(null);
  const [cleaningConnectionId, setCleaningConnectionId] = useState<string | null>(null);
  const [appleCleaning, setAppleCleaning] = useState(false);
  const [cleaningInboundConnectionId, setCleaningInboundConnectionId] = useState<string | null>(null);
  const [appleInboundCleaning, setAppleInboundCleaning] = useState(false);
  const [appleToggling, setAppleToggling] = useState(false);
  const [appleLastError, setAppleLastError] = useState<{ context: string; message: string; at: string } | null>(null);

  const load = useCallback(async () => {
    if (!activeMemberId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('calendar_connections_public')
      .select('id, provider, purpose, status, connected_account_email, last_synced_at, last_error, tasks_scope_missing')
      .eq('member_id', activeMemberId);
    if (error) console.warn('[useCalendarSync] load failed', error.message);
    setConnections((data ?? []) as ConnectionRow[]);
    setLoading(false);
  }, [activeMemberId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useFocusEffect(useCallback(() => {
    if (!activeMemberId) return;
    import('@/lib/calendarSync2Way').then(({ getLastAppleSyncError }) =>
      getLastAppleSyncError(activeMemberId).then(setAppleLastError)
    ).catch(() => {});
  }, [activeMemberId]));

  const connectionFor = (provider: CalendarProvider, purpose: CalendarPurpose) =>
    connections.find(c => c.provider === provider && c.purpose === purpose);

  const handleConnect = async (provider: CalendarProvider, purpose: CalendarPurpose) => {
    if (!activeMemberId) return;
    setConnecting(`${provider}:${purpose}`);
    try {
      const { email } = await connectCalendar(provider, activeMemberId, purpose);
      showToast(email ? `Connected as ${email}` : 'Connected');
      await load();
      if (purpose === 'work') {
        supabase.functions.invoke('calendar-freebusy-sync', { body: { memberId: activeMemberId } })
          .catch(e => console.warn('[useCalendarSync] initial freebusy sync failed', e?.message));
      } else {
        supabase.functions.invoke('calendar-channel-renewal', { body: {} })
          .catch(e => console.warn('[useCalendarSync] initial channel registration failed', e?.message));
        const familyId = (activeMember as any)?.familyId;
        if (familyId) {
          supabase.functions.invoke('calendar-backfill-sync', { body: { memberId: activeMemberId, familyId } })
            .catch(e => console.warn('[useCalendarSync] initial backfill failed', e?.message));
        }
        supabase.functions.invoke('calendar-sync-clean-slate', { body: { memberId: activeMemberId, provider } })
          .then(({ data: cleanSlate }) => {
            if (cleanSlate?.ok && cleanSlate.deletedIds?.length) {
              useEventStore.getState().removeEventsLocally(cleanSlate.deletedIds);
            }
            if (provider === 'google') {
              return supabase.functions.invoke('calendar-google-poll', { body: { memberId: activeMemberId } });
            }
          })
          .catch(e => console.warn('[useCalendarSync] clean-slate resync failed', e?.message));
      }
    } catch (e: any) {
      if (e?.message !== 'Connection cancelled.') {
        showAlert("Couldn't connect", e?.message ?? 'Please try again.');
      }
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = (connection: ConnectionRow) => {
    const isWork = connection.purpose === 'work';
    showAlert(
      `Disconnect ${PROVIDER_LABEL[connection.provider]}?`,
      isWork
        ? 'FamilyCube will stop checking this calendar for scheduling conflicts.'
        : 'FamilyCube will stop syncing with this calendar. Events FamilyCube added to this calendar will be deleted there, and events pulled in from it will be removed here in FamilyCube.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect', style: 'destructive', onPress: async () => {
            if (!activeMemberId) return;
            if (!isWork) {
              try {
                await supabase.functions.invoke('calendar-sync-cleanup-external', {
                  body: { connectionId: connection.id, memberId: activeMemberId },
                });
              } catch (e: any) {
                console.warn('[useCalendarSync] external cleanup on disconnect failed', e?.message);
              }
              try {
                const { data: cleanup } = await supabase.functions.invoke('calendar-sync-cleanup-inbound', {
                  body: { connectionId: connection.id, memberId: activeMemberId },
                });
                if (cleanup?.ok && cleanup.deletedIds?.length) {
                  useEventStore.getState().removeEventsLocally(cleanup.deletedIds);
                }
              } catch (e: any) {
                console.warn('[useCalendarSync] inbound cleanup on disconnect failed', e?.message);
              }
            }
            const { data, error } = await supabase.functions.invoke('calendar-disconnect', {
              body: { connectionId: connection.id, memberId: activeMemberId },
            });
            if (error || !data?.ok) { showAlert('Could not disconnect', data?.error ?? error?.message ?? 'Please try again.'); return; }
            setConnections(prev => prev.filter(c => c.id !== connection.id));
            showToast('Disconnected');
          },
        },
      ],
    );
  };

  const handleCleanupExternal = (connection: ConnectionRow) => {
    showAlert(
      `Remove synced events from ${PROVIDER_LABEL[connection.provider]}?`,
      'Events already added to this calendar from FamilyCube will be deleted there. Nothing in FamilyCube itself changes, and anything you edit afterward will sync back out again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            if (!activeMemberId) return;
            setCleaningConnectionId(connection.id);
            try {
              const { data, error } = await supabase.functions.invoke('calendar-sync-cleanup-external', {
                body: { connectionId: connection.id, memberId: activeMemberId },
              });
              if (error || !data?.ok) { showAlert('Could not remove events', data?.error ?? error?.message ?? 'Please try again.'); return; }
              showToast(data.deleted > 0 ? `Removed ${data.deleted} synced event${data.deleted === 1 ? '' : 's'}` : 'Nothing to remove');
            } finally {
              setCleaningConnectionId(null);
            }
          },
        },
      ],
    );
  };

  const handleCleanupInbound = (connection: ConnectionRow) => {
    showAlert(
      `Remove synced events from FamilyCube?`,
      `Events pulled in from ${PROVIDER_LABEL[connection.provider]} will be deleted here in FamilyCube. Nothing on ${PROVIDER_LABEL[connection.provider]} itself changes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            if (!activeMemberId) return;
            setCleaningInboundConnectionId(connection.id);
            try {
              const { data, error } = await supabase.functions.invoke('calendar-sync-cleanup-inbound', {
                body: { connectionId: connection.id, memberId: activeMemberId },
              });
              if (error || !data?.ok) { showAlert('Could not remove events', data?.error ?? error?.message ?? 'Please try again.'); return; }
              if (data.deletedIds?.length) useEventStore.getState().removeEventsLocally(data.deletedIds);
              showToast(data.deleted > 0 ? `Removed ${data.deleted} synced event${data.deleted === 1 ? '' : 's'}` : 'Nothing to remove');
            } finally {
              setCleaningInboundConnectionId(null);
            }
          },
        },
      ],
    );
  };

  const handleToggleApple = async (next: boolean) => {
    if (!activeMemberId) return;
    setAppleToggling(true);
    try {
      if (next) {
        const { requestCalendarPermissionsAsync } = await import('expo-calendar');
        const { status } = await requestCalendarPermissionsAsync();
        if (status !== 'granted') {
          showAlert('Calendar access needed', 'Allow calendar access in Settings to sync with your device calendar.');
          return;
        }
      }
      if (next) {
        const { recreateSyncCalendarIdForUI } = await import('@/lib/calendarSync2Way');
        const calendarId = await recreateSyncCalendarIdForUI();
        if (!calendarId) {
          showAlert(
            "Couldn't set up Apple Calendar sync",
            'FamilyCube could not create its calendar on this device. Make sure you have at least one calendar account set up (iCloud, or another account) in the iOS Settings app, then try again.',
          );
          return;
        }
      }
      if (!next) {
        try {
          const { clearAppleSyncedEvents, clearInboundAppleEvents } = await import('@/lib/calendarSync2Way');
          await clearAppleSyncedEvents(activeMemberId);
          await clearInboundAppleEvents(activeMemberId);
        } catch (e: any) {
          console.warn('[useCalendarSync] Apple cleanup on toggle-off failed', e?.message);
        }
      }
      await updateMember(activeMemberId, { appleCalendarSyncEnabled: next });
      showToast(next ? 'Apple Calendar sync on' : 'Apple Calendar sync off');
      if (next) {
        const { reconcileAppleCalendar, getLastAppleSyncError } = await import('@/lib/calendarSync2Way');
        const familyId = (activeMember as any)?.familyId;
        if (familyId) {
          const { events, addEvent, updateEvent, deleteEvent } = useEventStore.getState();
          reconcileAppleCalendar(activeMemberId, familyId, events, { addEvent, updateEvent, deleteEvent }, { force: true })
            .catch(e => console.warn('[useCalendarSync] initial Apple reconcile failed', e?.message))
            .finally(() => { getLastAppleSyncError(activeMemberId).then(setAppleLastError); });
        }
      }
    } catch (e: any) {
      showAlert("Couldn't update", e?.message ?? 'Please try again.');
    } finally {
      setAppleToggling(false);
    }
  };

  const handleCleanupApple = () => {
    showAlert(
      'Remove synced events from Apple Calendar?',
      'Events FamilyCube added to the "FamilyCube" calendar on this device will be deleted there. Nothing in FamilyCube itself changes, and anything you edit afterward will sync back out again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            if (!activeMemberId) return;
            setAppleCleaning(true);
            try {
              const { clearAppleSyncedEvents } = await import('@/lib/calendarSync2Way');
              const { deleted } = await clearAppleSyncedEvents(activeMemberId);
              showToast(deleted > 0 ? `Removed ${deleted} synced event${deleted === 1 ? '' : 's'}` : 'Nothing to remove');
            } catch (e: any) {
              showAlert('Could not remove events', e?.message ?? 'Please try again.');
            } finally {
              setAppleCleaning(false);
            }
          },
        },
      ],
    );
  };

  const handleCleanupInboundApple = () => {
    showAlert(
      'Remove synced events from FamilyCube?',
      "Events pulled in from your device's Calendar app will be deleted here in FamilyCube. Nothing on your device calendar itself changes.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            if (!activeMemberId) return;
            setAppleInboundCleaning(true);
            try {
              const { clearInboundAppleEvents } = await import('@/lib/calendarSync2Way');
              const { deleted } = await clearInboundAppleEvents(activeMemberId);
              showToast(deleted > 0 ? `Removed ${deleted} synced event${deleted === 1 ? '' : 's'}` : 'Nothing to remove');
            } catch (e: any) {
              showAlert('Could not remove events', e?.message ?? 'Please try again.');
            } finally {
              setAppleInboundCleaning(false);
            }
          },
        },
      ],
    );
  };

  return {
    activeMember, connections, loading, connecting,
    cleaningConnectionId, appleCleaning, cleaningInboundConnectionId,
    appleInboundCleaning, appleToggling, appleLastError,
    connectionFor, handleConnect, handleDisconnect,
    handleCleanupExternal, handleCleanupInbound,
    handleToggleApple, handleCleanupApple, handleCleanupInboundApple,
  };
}
