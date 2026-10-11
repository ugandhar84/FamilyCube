/**
 * ConnectCalendarPage — Figma-styled full-page entry point into the real
 * calendar sync system. All connect/disconnect/cleanup logic comes from
 * lib/useCalendarSync.ts — the same hook ProfileSettingsScreen's "Calendar
 * Sync" row and kiosk's side-drawer use — so this page shares one
 * implementation instead of re-deriving OAuth/EventKit logic that has a
 * documented history of real two-way-sync bugs (stale sync_token on
 * reconnect, duplicate pushed events, silent Apple failures).
 */
import { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Animated,
  ActivityIndicator, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar, CheckCircle2, Info, AlertCircle,
} from 'lucide-react-native';
import { useCalendarSync, PROVIDER_LABEL } from '@/lib/useCalendarSync';
import type { CalendarProvider, CalendarPurpose } from '@/lib/calendarOAuth';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useTheme } from '@/lib/ThemeContext';
import { PageHeading } from '@/components/PageHeading';

// This screen is NOT one of the named "Gemini rhythm" warm-cream exception
// screens (CLAUDE.md rule 6) — it follows the app-wide default: pure white
// canvas in light mode, near-black in dark mode, all colors from
// useTheme(). colors/isDark are threaded as props into each sub-component
// below rather than read as module-level constants, since this screen must
// adapt live to the device theme.

const PROVIDER_LOGO: Record<CalendarProvider, string> = { google: '📅', outlook: '📬' };
const PROVIDER_ACCENT: Record<CalendarProvider, string> = { google: '#4285F4', outlook: '#0078D4' };
const PROVIDER_BADGE: Record<CalendarProvider, string> = { google: 'OAuth 2.0', outlook: 'Microsoft OAuth' };

const WORK_FEATURES: Record<CalendarProvider, string[]> = {
  google: ['Checks busy/free time only', 'No event titles or details read', 'Flags ride & plan conflicts', 'Multiple Google accounts supported'],
  outlook: ['Checks busy/free time only', 'Works with Exchange & Microsoft 365', 'Flags ride & plan conflicts', 'No email access requested'],
};
const PERSONAL_FEATURES: Record<CalendarProvider, string[]> = {
  google: ['Two-way event sync', 'Dedicated "FamilyCube" calendar', 'Google Tasks sync into Chores', 'Real-time push updates'],
  outlook: ['Two-way event sync', 'Dedicated "FamilyCube" calendar', 'Great for work/school schedules', 'Personal & Microsoft 365 accounts'],
};
const PROVIDER_HOWTO: Record<CalendarProvider, string> = {
  google: 'Tap Connect and sign in with your Google account in a secure browser tab. Your password is never seen by Family Cube.',
  outlook: 'Tap Connect and sign in with your Microsoft account in a secure browser tab. Only calendar access is requested — never email.',
};

type Palette = {
  pageBg: string; cardBg: string; titleClr: string; bodyClr: string;
  blue: string; border: string; green: string; red: string; amber: string;
};

// ── Animated press tile ───────────────────────────────────────────────────────

function PressCard({ children, onPress, disabled, pal }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean; pal: Palette }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 4 }).start();
  const cardStyle = { borderRadius: 16, borderWidth: 1, borderColor: pal.border, backgroundColor: pal.cardBg, padding: 16 };
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}
        disabled={disabled} activeOpacity={0.9} style={cardStyle}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function PillButton({ label, onPress, disabled, loading, tone = 'solid', color }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean;
  tone?: 'solid' | 'outline'; color: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 4 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}
        disabled={disabled || loading} activeOpacity={0.85}
        style={{
          borderRadius: 12, paddingVertical: 12, alignItems: 'center',
          backgroundColor: tone === 'solid' ? color : 'transparent',
          borderWidth: tone === 'outline' ? 1.5 : 0, borderColor: color,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {loading
          ? <ActivityIndicator size="small" color={tone === 'solid' ? '#fff' : color} />
          : <Text style={{ fontSize: 14, fontWeight: '700', color: tone === 'solid' ? '#fff' : color }}>{label}</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
}

function LinkButton({ label, onPress, disabled, loading, pal }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; pal: Palette }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading} style={{ paddingVertical: 8, alignItems: 'center' }}>
      {loading
        ? <ActivityIndicator size="small" color={pal.bodyClr} />
        : <Text style={{ fontSize: 12, fontWeight: '700', color: pal.bodyClr, textDecorationLine: 'underline' }}>{label}</Text>}
    </TouchableOpacity>
  );
}

function ProviderCard({
  provider, purpose, connectionFor, connecting,
  cleaningConnectionId, cleaningInboundConnectionId,
  handleConnect, handleDisconnect, handleCleanupExternal, handleCleanupInbound,
  pal,
}: {
  provider: CalendarProvider; purpose: CalendarPurpose;
  connectionFor: ReturnType<typeof useCalendarSync>['connectionFor'];
  connecting: ReturnType<typeof useCalendarSync>['connecting'];
  cleaningConnectionId: string | null; cleaningInboundConnectionId: string | null;
  handleConnect: ReturnType<typeof useCalendarSync>['handleConnect'];
  handleDisconnect: ReturnType<typeof useCalendarSync>['handleDisconnect'];
  handleCleanupExternal: ReturnType<typeof useCalendarSync>['handleCleanupExternal'];
  handleCleanupInbound: ReturnType<typeof useCalendarSync>['handleCleanupInbound'];
  pal: Palette;
}) {
  const connection = connectionFor(provider, purpose);
  const isConnecting = connecting === `${provider}:${purpose}`;
  const accent = PROVIDER_ACCENT[provider];
  const hasError = connection?.status === 'error';
  const features = purpose === 'work' ? WORK_FEATURES[provider] : PERSONAL_FEATURES[provider];

  return (
    <PressCard pal={pal}>
      {/* Logo + name row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{
          width: 48, height: 48, borderRadius: 14,
          backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '25',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 24 }}>{PROVIDER_LOGO[provider]}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: pal.titleClr }}>{PROVIDER_LABEL[provider]}</Text>
            <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: accent + '18' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: accent }}>{PROVIDER_BADGE[provider]}</Text>
            </View>
          </View>
          {connection ? (
            hasError ? (
              <Text style={{ fontSize: 13, color: pal.red, marginTop: 1 }}>Connection error — reconnect to fix</Text>
            ) : (
              <Text style={{ fontSize: 13, color: pal.bodyClr, marginTop: 1 }}>
                Connected{connection.connected_account_email ? ` as ${connection.connected_account_email}` : ''}
              </Text>
            )
          ) : (
            <Text style={{ fontSize: 13, color: pal.bodyClr, marginTop: 1 }}>Not connected</Text>
          )}
        </View>

        {connection && !hasError && <CheckCircle2 size={20} color={pal.green} strokeWidth={2} />}
        {hasError && <AlertCircle size={20} color={pal.red} strokeWidth={2} />}
      </View>

      {connection?.last_synced_at && (
        <Text style={{ fontSize: 11, color: pal.bodyClr, marginTop: 10 }}>
          Last checked {new Date(connection.last_synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </Text>
      )}

      {provider === 'google' && purpose === 'personal' && !hasError && connection?.tasks_scope_missing && (
        <Text style={{ fontSize: 11, color: pal.amber, marginTop: 6, fontWeight: '600' }}>
          Reconnect to also sync Google Tasks into Chores
        </Text>
      )}

      {/* Feature bullet list */}
      <View style={{ marginTop: 14, gap: 6 }}>
        {features.map((f, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: accent, marginTop: 5 }} />
            <Text style={{ fontSize: 13, color: pal.bodyClr, flex: 1, lineHeight: 18 }}>{f}</Text>
          </View>
        ))}
      </View>

      {/* How-to / consent banner */}
      <View style={{
        marginTop: 12, borderRadius: 10, borderWidth: 1,
        borderColor: accent + '25', backgroundColor: accent + '08',
        padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      }}>
        <Info size={13} color={accent} strokeWidth={2} style={{ marginTop: 1 }} />
        <Text style={{ fontSize: 12, color: pal.bodyClr, flex: 1, lineHeight: 17 }}>
          {connection ? PROVIDER_HOWTO[provider] : `Connecting shares your ${PROVIDER_LABEL[provider]} events with Family Cube so they appear on your shared family calendar, and syncs family events back out. You can disconnect anytime.`}
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <PillButton
          label={connection ? 'Disconnect' : 'Connect'}
          onPress={() => connection ? handleDisconnect(connection) : handleConnect(provider, purpose)}
          loading={isConnecting}
          tone={connection ? 'outline' : 'solid'}
          color={connection ? pal.red : accent}
        />
      </View>

      {connection && !hasError && purpose === 'personal' && (
        <>
          <LinkButton
            label={`Remove synced events from ${PROVIDER_LABEL[provider]}`}
            onPress={() => handleCleanupExternal(connection)}
            loading={cleaningConnectionId === connection.id}
            pal={pal}
          />
          <LinkButton
            label="Remove synced events from FamilyCube"
            onPress={() => handleCleanupInbound(connection)}
            loading={cleaningInboundConnectionId === connection.id}
            pal={pal}
          />
        </>
      )}
    </PressCard>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ConnectCalendarPage({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const sync = useCalendarSync();
  const {
    activeMember, connections, loading, connecting,
    cleaningConnectionId, appleCleaning, cleaningInboundConnectionId,
    appleInboundCleaning, appleToggling, appleLastError,
    connectionFor, handleConnect, handleDisconnect,
    handleCleanupExternal, handleCleanupInbound,
    handleToggleApple, handleCleanupApple, handleCleanupInboundApple,
  } = sync;

  const pal: Palette = {
    pageBg: colors.background,
    cardBg: colors.card,
    titleClr: colors.textPrimary,
    bodyClr: colors.textSecondary,
    blue: colors.primary,
    border: colors.border,
    green: colors.success,
    red: colors.danger,
    amber: isDark ? colors.amber : '#D97706',
  };

  // FullPageOverlay (the caller's wrapper) already owns entrance/exit
  // animation and edge-swipe-to-dismiss — this screen used to hand-roll
  // both itself (Animated slideX + PanResponder), which is no longer
  // needed now that every full-page screen in this app shares one shell.
  useEffect(() => {
    hideTabBar();
    return () => showTabBar();
  }, []);

  const connectedCount = connections.filter(c => c.status !== 'error').length + (activeMember?.appleCalendarSyncEnabled ? 1 : 0);

  return (
      <View style={{ flex: 1, backgroundColor: pal.pageBg }}>

        {/* ── Header — same PageHeading shell as Groceries/Generations/
            Family Invite (accent bar + eyebrow + title + subtitle + pastel
            icon badge). ── */}
        <View style={{ backgroundColor: pal.pageBg }}>
          <PageHeading
            eyebrow="FAMILY CUBE · CALENDARS"
            title="Calendars"
            subtitle="Connect work, personal, and Apple calendars so the whole family sees everything in one place."
            accent="sky"
            Icon={Calendar}
            onTitlePress={onClose}
            topInset={insets.top}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={pal.blue} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 60, gap: 12 }}
          >
            {/* ── Status banner ── */}
            {connectedCount > 0 ? (
              <View style={{
                borderRadius: 14, borderWidth: 1, borderColor: pal.green + '30',
                backgroundColor: pal.green + '0C', padding: 14,
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <CheckCircle2 size={18} color={pal.green} strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: pal.green, flex: 1 }}>
                  {connectedCount} calendar{connectedCount > 1 ? 's' : ''} connected
                </Text>
              </View>
            ) : (
              <View style={{
                borderRadius: 14, borderWidth: 1, borderColor: pal.blue + '25',
                backgroundColor: pal.blue + '08', padding: 14,
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
              }}>
                <Calendar size={16} color={pal.blue} strokeWidth={2} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 13, color: pal.bodyClr, flex: 1, lineHeight: 18 }}>
                  No calendars connected yet. Each family member's personal calendar stays private — you choose what syncs.
                </Text>
              </View>
            )}

            {/* ── Work calendar section ── */}
            <Text style={{ fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, color: pal.bodyClr, marginTop: 4 }}>Work calendar</Text>
            <Text style={{ fontSize: 13, color: pal.bodyClr, lineHeight: 18, marginBottom: 2 }}>
              FamilyCube only checks busy/free times — no event details (titles, locations, notes) are ever read, stored, or shared. Used to flag when a ride or family plan overlaps your real work schedule.
            </Text>
            {(['google', 'outlook'] as const).map(p => (
              <ProviderCard
                key={`${p}:work`} provider={p} purpose="work"
                connectionFor={connectionFor} connecting={connecting}
                cleaningConnectionId={cleaningConnectionId} cleaningInboundConnectionId={cleaningInboundConnectionId}
                handleConnect={handleConnect} handleDisconnect={handleDisconnect}
                handleCleanupExternal={handleCleanupExternal} handleCleanupInbound={handleCleanupInbound}
                pal={pal}
              />
            ))}

            {/* ── Personal calendar section ── */}
            <Text style={{ fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, color: pal.bodyClr, marginTop: 8 }}>Personal calendar</Text>
            <Text style={{ fontSize: 13, color: pal.bodyClr, lineHeight: 18, marginBottom: 2 }}>
              Full 2-way sync — FamilyCube events are added to this calendar, and this calendar's own events are brought into FamilyCube's Schedule. For Google, tasks from your Google Tasks list also come in as Quests.
            </Text>
            {(['google', 'outlook'] as const).map(p => (
              <ProviderCard
                key={`${p}:personal`} provider={p} purpose="personal"
                connectionFor={connectionFor} connecting={connecting}
                cleaningConnectionId={cleaningConnectionId} cleaningInboundConnectionId={cleaningInboundConnectionId}
                handleConnect={handleConnect} handleDisconnect={handleDisconnect}
                handleCleanupExternal={handleCleanupExternal} handleCleanupInbound={handleCleanupInbound}
                pal={pal}
              />
            ))}

            {/* ── Apple Calendar section ── */}
            <Text style={{ fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, color: pal.bodyClr, marginTop: 8 }}>Apple Calendar</Text>
            <Text style={{ fontSize: 13, color: pal.bodyClr, lineHeight: 18, marginBottom: 2 }}>
              No sign-in needed — FamilyCube writes events straight into a dedicated "FamilyCube" calendar on this device (which iOS keeps in sync with iCloud on its own), and checks for anything added there directly whenever the app is opened.
            </Text>
            <PressCard pal={pal}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{
                  width: 48, height: 48, borderRadius: 14,
                  backgroundColor: pal.titleClr + '10', borderWidth: 1, borderColor: pal.titleClr + '20',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 24 }}>🍎</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: pal.titleClr }}>Sync with Apple Calendar</Text>
                    <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: pal.bodyClr + '18' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: pal.bodyClr }}>iOS only</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: pal.bodyClr, marginTop: 1 }}>
                    {activeMember?.appleCalendarSyncEnabled ? 'On for this device' : 'Off'}
                  </Text>
                </View>
                {appleToggling ? (
                  <ActivityIndicator size="small" color={pal.blue} />
                ) : (
                  <Switch
                    value={!!activeMember?.appleCalendarSyncEnabled}
                    onValueChange={handleToggleApple}
                    trackColor={{ false: pal.border, true: pal.blue }}
                    thumbColor="#fff"
                  />
                )}
              </View>

              <View style={{ marginTop: 14, gap: 6 }}>
                {['Reads & writes iCloud calendars', 'Dedicated "FamilyCube" calendar on-device', 'No account sign-in needed', 'Checked every time the app opens'].map((f, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: pal.titleClr, marginTop: 5 }} />
                    <Text style={{ fontSize: 13, color: pal.bodyClr, flex: 1, lineHeight: 18 }}>{f}</Text>
                  </View>
                ))}
              </View>

              {appleLastError && (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: pal.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: pal.red }}>
                    Last sync attempt failed ({appleLastError.context === 'push' ? 'sending to device' : 'checking device'})
                  </Text>
                  <Text style={{ fontSize: 12, color: pal.bodyClr, marginTop: 2 }}>{appleLastError.message}</Text>
                </View>
              )}

              {activeMember?.appleCalendarSyncEnabled && (
                <>
                  <LinkButton label="Remove synced events from Apple Calendar" onPress={handleCleanupApple} loading={appleCleaning} pal={pal} />
                  <LinkButton label="Remove synced events from FamilyCube" onPress={handleCleanupInboundApple} loading={appleInboundCleaning} pal={pal} />
                </>
              )}
            </PressCard>

            {/* ── Privacy note ── */}
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: pal.border, backgroundColor: pal.cardBg, padding: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: pal.titleClr, marginBottom: 6 }}>Your privacy, your rules</Text>
              <Text style={{ fontSize: 13, color: pal.bodyClr, lineHeight: 18 }}>
                Family Cube never shares your personal calendar data with other family members without your approval. Each member controls which of their own calendars are visible on the family schedule.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
  );
}
