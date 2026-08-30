/**
 * CalendarSyncScreen — "Connect your calendars" settings page.
 *
 * Two independent connection purposes, chosen by the user at connect time
 * (live direction: "when adding they should choose personal or work"):
 *
 *  - Work: FreeBusy-only — busy/free time blocks with no event content at
 *    all — used purely so FamilyCube can warn when a ride or family event
 *    overlaps a parent's real work schedule (see calendar-freebusy-sync
 *    and features/hub/lib/detectAssigneeConflicts.ts's detectWorkConflicts).
 *  - Personal: full 2-way event sync — FamilyCube events are pushed to
 *    this calendar, and the calendar's own events (with real titles/
 *    locations/notes) are pulled back into FamilyCube (see
 *    calendar-sync-push and calendar-webhook-google/outlook).
 *
 * A member can connect the SAME provider twice for two different real
 * accounts (e.g. a work Gmail and a separate personal Gmail) — each
 * (provider, purpose) pair is its own independent connection.
 */
import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { supabase } from '@/lib/supabase';
import { connectCalendar, type CalendarProvider, type CalendarPurpose } from '@/lib/calendarOAuth';
import { showAlert } from '@/components/AppAlert';
import { showToast } from '@/components/AppToast';

interface ConnectionRow {
  id: string;
  provider: CalendarProvider;
  purpose: CalendarPurpose;
  status: 'active' | 'error' | 'disconnected';
  connected_account_email: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

const PROVIDER_LABEL: Record<CalendarProvider, string> = { google: 'Google Calendar', outlook: 'Outlook Calendar' };
const PROVIDER_ICON: Record<CalendarProvider, keyof typeof Ionicons.glyphMap> = { google: 'logo-google', outlook: 'mail-outline' };

export default function CalendarSyncScreen() {
  const { colors, isDark } = useTheme();
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const activeMember = useFamilyStore(s => s.members.find(m => m.id === s.activeMemberId));
  const updateMember = useFamilyStore(s => s.updateMember);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<`${CalendarProvider}:${CalendarPurpose}` | null>(null);
  const [appleToggling, setAppleToggling] = useState(false);

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
      await updateMember(activeMemberId, { appleCalendarSyncEnabled: next });
      showToast(next ? 'Apple Calendar sync on' : 'Apple Calendar sync off');
      if (next) {
        // Kick an immediate reconciliation so events already on the device
        // calendar show up right away, same "don't make them wait" treatment
        // the work-calendar connect flow gets.
        const { reconcileAppleCalendar } = await import('@/lib/calendarSync2Way');
        const familyId = (activeMember as any)?.familyId;
        if (familyId) {
          const { events, addEvent, updateEvent, deleteEvent } = useEventStore.getState();
          reconcileAppleCalendar(activeMemberId, familyId, events, { addEvent, updateEvent, deleteEvent }, { force: true })
            .catch(e => console.warn('[CalendarSyncScreen] initial Apple reconcile failed', e?.message));
        }
      }
    } catch (e: any) {
      showAlert("Couldn't update", e?.message ?? 'Please try again.');
    } finally {
      setAppleToggling(false);
    }
  };

  const load = useCallback(async () => {
    if (!activeMemberId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('calendar_connections_public')
      .select('id, provider, purpose, status, connected_account_email, last_synced_at, last_error')
      .eq('member_id', activeMemberId);
    if (error) console.warn('[CalendarSyncScreen] load failed', error.message);
    setConnections((data ?? []) as ConnectionRow[]);
    setLoading(false);
  }, [activeMemberId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
        // Kick off an immediate FreeBusy sync so a conflict already on the
        // calendar shows up right away, rather than waiting for the next
        // time something triggers a refresh.
        supabase.functions.invoke('calendar-freebusy-sync', { body: { memberId: activeMemberId } })
          .catch(e => console.warn('[CalendarSyncScreen] initial freebusy sync failed', e?.message));
      } else {
        // Personal connections need a webhook channel registered before
        // inbound sync (an event added directly on Google/Outlook) works
        // at all — calendar-channel-renewal picks up any connection with
        // no channel yet (channel_expires_at is null), so calling it right
        // after connect registers the channel immediately instead of
        // leaving the member with no inbound sync until the next daily
        // cron pass.
        supabase.functions.invoke('calendar-channel-renewal', { body: {} })
          .catch(e => console.warn('[CalendarSyncScreen] initial channel registration failed', e?.message));
        // Outbound push only fires from addEvent/updateEvent/deleteEvent,
        // so anything created BEFORE this connection existed would
        // otherwise never reach the external calendar — one-time backfill
        // pushes the member's full existing event history now.
        const familyId = (activeMember as any)?.familyId;
        if (familyId) {
          supabase.functions.invoke('calendar-backfill-sync', { body: { memberId: activeMemberId, familyId } })
            .catch(e => console.warn('[CalendarSyncScreen] initial backfill failed', e?.message));
        }
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
        : 'FamilyCube will stop syncing events with this calendar. Events already pushed there will stay, but future changes won\'t sync either way.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect', style: 'destructive', onPress: async () => {
            if (!activeMemberId) return;
            // calendar_connections has no client-facing delete grant at all
            // (token columns are service-role-only) — a direct
            // supabase.from('calendar_connections').delete() always fails
            // here; calendar-disconnect does the deletion (and Work-event/
            // link cleanup) server-side after verifying ownership.
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

  const s = makeStyles(colors);

  const renderProviderRow = (provider: CalendarProvider, purpose: CalendarPurpose) => {
    const connection = connectionFor(provider, purpose);
    const isConnecting = connecting === `${provider}:${purpose}`;
    return (
      <View key={`${provider}:${purpose}`} style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={s.iconChip}>
            <Ionicons name={PROVIDER_ICON[provider]} size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{PROVIDER_LABEL[provider]}</Text>
            {connection ? (
              connection.status === 'error' ? (
                <Text style={[s.cardSubtitle, { color: colors.danger }]}>Connection error — reconnect to fix</Text>
              ) : (
                <Text style={s.cardSubtitle}>
                  Connected{connection.connected_account_email ? ` as ${connection.connected_account_email}` : ''}
                </Text>
              )
            ) : (
              <Text style={s.cardSubtitle}>Not connected</Text>
            )}
          </View>
        </View>
        {connection?.last_synced_at && (
          <Text style={s.lastSynced}>
            Last checked {new Date(connection.last_synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </Text>
        )}
        <TouchableOpacity
          onPress={() => connection ? handleDisconnect(connection) : handleConnect(provider, purpose)}
          disabled={isConnecting}
          style={[s.actionBtn, connection ? s.disconnectBtn : s.connectBtn]}>
          {isConnecting ? (
            <ActivityIndicator size="small" color={connection ? colors.danger : '#fff'} />
          ) : (
            <Text style={[s.actionBtnText, { color: connection ? colors.danger : '#fff' }]}>
              {connection ? 'Disconnect' : 'Connect'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Calendar Sync</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          <Text style={s.sectionLabel}>Work Calendar</Text>
          <Text style={s.intro}>
            FamilyCube only checks busy/free times — no event details (titles, locations, notes)
            are ever read, stored, or shared. Used to flag when a ride or family plan overlaps
            your real work schedule.
          </Text>
          <View style={{ gap: 12, marginBottom: 24 }}>
            {(['google', 'outlook'] as const).map(p => renderProviderRow(p, 'work'))}
          </View>

          <Text style={s.sectionLabel}>Personal Calendar</Text>
          <Text style={s.intro}>
            Full 2-way sync — FamilyCube events are added to this calendar, and this calendar's
            own events are brought into FamilyCube's Schedule.
          </Text>
          <View style={{ gap: 12, marginBottom: 24 }}>
            {(['google', 'outlook'] as const).map(p => renderProviderRow(p, 'personal'))}
          </View>

          <Text style={s.sectionLabel}>Apple Calendar</Text>
          <Text style={s.intro}>
            No sign-in needed — FamilyCube writes events straight into a dedicated "FamilyCube"
            calendar on this device (which iOS keeps in sync with iCloud on its own), and checks
            for anything added there directly whenever the app is opened.
          </Text>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={s.iconChip}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Sync with Apple Calendar</Text>
                <Text style={s.cardSubtitle}>
                  {activeMember?.appleCalendarSyncEnabled ? 'On for this device' : 'Off'}
                </Text>
              </View>
              {appleToggling ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Switch
                  value={!!activeMember?.appleCalendarSyncEnabled}
                  onValueChange={handleToggleApple}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: any) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
    headerTitle: { fontSize: TYPO.subheading, fontWeight: '900', color: colors.textPrimary },
    sectionLabel: { fontSize: TYPO.label, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, color: colors.textTertiary, marginTop: 8, marginBottom: 6 },
    intro: { fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 19, marginBottom: 12 },
    card: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 10 },
    iconChip: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary },
    cardSubtitle: { fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 },
    lastSynced: { fontSize: TYPO.micro, color: colors.textTertiary },
    actionBtn: { borderRadius: RADIUS.md, paddingVertical: 11, alignItems: 'center' },
    connectBtn: { backgroundColor: colors.primary },
    disconnectBtn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.danger },
    actionBtnText: { fontSize: TYPO.body, fontWeight: '800' },
  });
}
