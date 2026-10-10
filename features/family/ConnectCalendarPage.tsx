/**
 * ConnectCalendarPage — Figma-styled full-page entry point into the real
 * calendar sync system. All connect/disconnect/cleanup logic comes from
 * lib/useCalendarSync.ts — the same hook ProfileSettingsScreen's "Calendar
 * Sync" row and kiosk's side-drawer use — so this page shares one
 * implementation instead of re-deriving OAuth/EventKit logic that has a
 * documented history of real two-way-sync bugs (stale sync_token on
 * reconnect, duplicate pushed events, silent Apple failures).
 */
import { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Animated, PanResponder,
  Dimensions, ActivityIndicator, Switch, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar, CheckCircle2, Info, RefreshCw, AlertCircle,
} from 'lucide-react-native';
import { useCalendarSync, PROVIDER_LABEL } from '@/lib/useCalendarSync';
import type { CalendarProvider, CalendarPurpose } from '@/lib/calendarOAuth';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';

// ── Figma tokens (matches family-roster / InvitePage palette) ────────────────
const PAGE_BG   = '#F3F5F2';
const CARD_BG   = '#FFFFFF';
const TITLE_CLR = '#172337';
const BODY_CLR  = '#657185';
const BLUE      = '#294FC7';
const BORDER    = '#DFE5EF';
const GREEN     = '#3D7A5A';
const RED       = '#C54A27';
const AMBER     = '#D97706';

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

// ── Animated press tile ───────────────────────────────────────────────────────

function PressCard({ children, onPress, disabled }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 4 }).start();
  if (!onPress) return <View style={styles.card}>{children}</View>;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}
        disabled={disabled} activeOpacity={0.9} style={styles.card}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function PillButton({ label, onPress, disabled, loading, tone = 'solid', color = BLUE }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean;
  tone?: 'solid' | 'outline'; color?: string;
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

function LinkButton({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading} style={{ paddingVertical: 8, alignItems: 'center' }}>
      {loading
        ? <ActivityIndicator size="small" color={BODY_CLR} />
        : <Text style={{ fontSize: 12, fontWeight: '700', color: BODY_CLR, textDecorationLine: 'underline' }}>{label}</Text>}
    </TouchableOpacity>
  );
}

function ProviderCard({
  provider, purpose, connectionFor, connecting,
  cleaningConnectionId, cleaningInboundConnectionId,
  handleConnect, handleDisconnect, handleCleanupExternal, handleCleanupInbound,
}: {
  provider: CalendarProvider; purpose: CalendarPurpose;
  connectionFor: ReturnType<typeof useCalendarSync>['connectionFor'];
  connecting: ReturnType<typeof useCalendarSync>['connecting'];
  cleaningConnectionId: string | null; cleaningInboundConnectionId: string | null;
  handleConnect: ReturnType<typeof useCalendarSync>['handleConnect'];
  handleDisconnect: ReturnType<typeof useCalendarSync>['handleDisconnect'];
  handleCleanupExternal: ReturnType<typeof useCalendarSync>['handleCleanupExternal'];
  handleCleanupInbound: ReturnType<typeof useCalendarSync>['handleCleanupInbound'];
}) {
  const connection = connectionFor(provider, purpose);
  const isConnecting = connecting === `${provider}:${purpose}`;
  const accent = PROVIDER_ACCENT[provider];
  const hasError = connection?.status === 'error';
  const features = purpose === 'work' ? WORK_FEATURES[provider] : PERSONAL_FEATURES[provider];

  return (
    <PressCard>
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
            <Text style={{ fontSize: 16, fontWeight: '700', color: TITLE_CLR }}>{PROVIDER_LABEL[provider]}</Text>
            <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: accent + '18' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: accent }}>{PROVIDER_BADGE[provider]}</Text>
            </View>
          </View>
          {connection ? (
            hasError ? (
              <Text style={{ fontSize: 13, color: RED, marginTop: 1 }}>Connection error — reconnect to fix</Text>
            ) : (
              <Text style={{ fontSize: 13, color: BODY_CLR, marginTop: 1 }}>
                Connected{connection.connected_account_email ? ` as ${connection.connected_account_email}` : ''}
              </Text>
            )
          ) : (
            <Text style={{ fontSize: 13, color: BODY_CLR, marginTop: 1 }}>Not connected</Text>
          )}
        </View>

        {connection && !hasError && <CheckCircle2 size={20} color={GREEN} strokeWidth={2} />}
        {hasError && <AlertCircle size={20} color={RED} strokeWidth={2} />}
      </View>

      {connection?.last_synced_at && (
        <Text style={{ fontSize: 11, color: BODY_CLR, marginTop: 10 }}>
          Last checked {new Date(connection.last_synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </Text>
      )}

      {provider === 'google' && purpose === 'personal' && !hasError && connection?.tasks_scope_missing && (
        <Text style={{ fontSize: 11, color: AMBER, marginTop: 6, fontWeight: '600' }}>
          Reconnect to also sync Google Tasks into Chores
        </Text>
      )}

      {/* Feature bullet list */}
      <View style={{ marginTop: 14, gap: 6 }}>
        {features.map((f, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: accent, marginTop: 5 }} />
            <Text style={{ fontSize: 13, color: BODY_CLR, flex: 1, lineHeight: 18 }}>{f}</Text>
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
        <Text style={{ fontSize: 12, color: BODY_CLR, flex: 1, lineHeight: 17 }}>
          {connection ? PROVIDER_HOWTO[provider] : `Connecting shares your ${PROVIDER_LABEL[provider]} events with Family Cube so they appear on your shared family calendar, and syncs family events back out. You can disconnect anytime.`}
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <PillButton
          label={connection ? 'Disconnect' : 'Connect'}
          onPress={() => connection ? handleDisconnect(connection) : handleConnect(provider, purpose)}
          loading={isConnecting}
          tone={connection ? 'outline' : 'solid'}
          color={connection ? RED : accent}
        />
      </View>

      {connection && !hasError && purpose === 'personal' && (
        <>
          <LinkButton
            label={`Remove synced events from ${PROVIDER_LABEL[provider]}`}
            onPress={() => handleCleanupExternal(connection)}
            loading={cleaningConnectionId === connection.id}
          />
          <LinkButton
            label="Remove synced events from FamilyCube"
            onPress={() => handleCleanupInbound(connection)}
            loading={cleaningInboundConnectionId === connection.id}
          />
        </>
      )}
    </PressCard>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ConnectCalendarPage({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const sync = useCalendarSync();
  const {
    activeMember, connections, loading, connecting,
    cleaningConnectionId, appleCleaning, cleaningInboundConnectionId,
    appleInboundCleaning, appleToggling, appleLastError,
    connectionFor, handleConnect, handleDisconnect,
    handleCleanupExternal, handleCleanupInbound,
    handleToggleApple, handleCleanupApple, handleCleanupInboundApple,
  } = sync;

  // Slide-in from right on mount; slide-out on dismiss
  const { width: SCREEN_W } = Dimensions.get('window');
  const slideX = useRef(new Animated.Value(SCREEN_W)).current;
  useEffect(() => {
    hideTabBar();
    Animated.spring(slideX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
    return () => showTabBar();
  }, []);

  const dismiss = () => {
    Animated.timing(slideX, { toValue: SCREEN_W, duration: 260, useNativeDriver: true }).start(onClose);
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: (e) => e.nativeEvent.pageX < 60,
    onMoveShouldSetPanResponder: (_, gs) => gs.dx > 8 && Math.abs(gs.dy) < 30,
    onPanResponderMove: (_, gs) => { if (gs.dx > 0) slideX.setValue(gs.dx); },
    onPanResponderRelease: (_, gs) => {
      if (gs.dx > SCREEN_W / 3 || gs.vx > 0.8) {
        Animated.timing(slideX, { toValue: SCREEN_W, duration: 220, useNativeDriver: true }).start(onClose);
      } else {
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
      }
    },
  })).current;

  const connectedCount = connections.filter(c => c.status !== 'error').length + (activeMember?.appleCalendarSyncEnabled ? 1 : 0);

  return (
    <Animated.View style={{ flex: 1, transform: [{ translateX: slideX }] }} {...panResponder.panHandlers}>
      <View style={{ flex: 1, backgroundColor: PAGE_BG }}>

        {/* ── Header ── */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8, backgroundColor: PAGE_BG }}>
          <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: BLUE }}>← Family</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 13, fontWeight: '500', color: BLUE, marginTop: 12 }}>Family tools</Text>
          <Text style={{ fontSize: 29, fontWeight: '700', color: TITLE_CLR, marginTop: 4, lineHeight: 36 }}>
            Calendars
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: BODY_CLR, marginTop: 4, lineHeight: 18 }}>
            Connect work, personal, and Apple calendars so the whole family sees everything in one place.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={BLUE} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 60, gap: 12 }}
          >
            {/* ── Status banner ── */}
            {connectedCount > 0 ? (
              <View style={{
                borderRadius: 14, borderWidth: 1, borderColor: GREEN + '30',
                backgroundColor: GREEN + '0C', padding: 14,
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <CheckCircle2 size={18} color={GREEN} strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: GREEN, flex: 1 }}>
                  {connectedCount} calendar{connectedCount > 1 ? 's' : ''} connected
                </Text>
              </View>
            ) : (
              <View style={{
                borderRadius: 14, borderWidth: 1, borderColor: BLUE + '25',
                backgroundColor: BLUE + '08', padding: 14,
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
              }}>
                <Calendar size={16} color={BLUE} strokeWidth={2} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 13, color: BODY_CLR, flex: 1, lineHeight: 18 }}>
                  No calendars connected yet. Each family member's personal calendar stays private — you choose what syncs.
                </Text>
              </View>
            )}

            {/* ── Work calendar section ── */}
            <Text style={styles.sectionLabel}>Work calendar</Text>
            <Text style={styles.sectionIntro}>
              FamilyCube only checks busy/free times — no event details (titles, locations, notes) are ever read, stored, or shared. Used to flag when a ride or family plan overlaps your real work schedule.
            </Text>
            {(['google', 'outlook'] as const).map(p => (
              <ProviderCard
                key={`${p}:work`} provider={p} purpose="work"
                connectionFor={connectionFor} connecting={connecting}
                cleaningConnectionId={cleaningConnectionId} cleaningInboundConnectionId={cleaningInboundConnectionId}
                handleConnect={handleConnect} handleDisconnect={handleDisconnect}
                handleCleanupExternal={handleCleanupExternal} handleCleanupInbound={handleCleanupInbound}
              />
            ))}

            {/* ── Personal calendar section ── */}
            <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Personal calendar</Text>
            <Text style={styles.sectionIntro}>
              Full 2-way sync — FamilyCube events are added to this calendar, and this calendar's own events are brought into FamilyCube's Schedule. For Google, tasks from your Google Tasks list also come in as Quests.
            </Text>
            {(['google', 'outlook'] as const).map(p => (
              <ProviderCard
                key={`${p}:personal`} provider={p} purpose="personal"
                connectionFor={connectionFor} connecting={connecting}
                cleaningConnectionId={cleaningConnectionId} cleaningInboundConnectionId={cleaningInboundConnectionId}
                handleConnect={handleConnect} handleDisconnect={handleDisconnect}
                handleCleanupExternal={handleCleanupExternal} handleCleanupInbound={handleCleanupInbound}
              />
            ))}

            {/* ── Apple Calendar section ── */}
            <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Apple Calendar</Text>
            <Text style={styles.sectionIntro}>
              No sign-in needed — FamilyCube writes events straight into a dedicated "FamilyCube" calendar on this device (which iOS keeps in sync with iCloud on its own), and checks for anything added there directly whenever the app is opened.
            </Text>
            <PressCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{
                  width: 48, height: 48, borderRadius: 14,
                  backgroundColor: TITLE_CLR + '10', borderWidth: 1, borderColor: TITLE_CLR + '20',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 24 }}>🍎</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: TITLE_CLR }}>Sync with Apple Calendar</Text>
                    <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: BODY_CLR + '18' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: BODY_CLR }}>iOS only</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: BODY_CLR, marginTop: 1 }}>
                    {activeMember?.appleCalendarSyncEnabled ? 'On for this device' : 'Off'}
                  </Text>
                </View>
                {appleToggling ? (
                  <ActivityIndicator size="small" color={BLUE} />
                ) : (
                  <Switch
                    value={!!activeMember?.appleCalendarSyncEnabled}
                    onValueChange={handleToggleApple}
                    trackColor={{ false: BORDER, true: BLUE }}
                    thumbColor="#fff"
                  />
                )}
              </View>

              <View style={{ marginTop: 14, gap: 6 }}>
                {['Reads & writes iCloud calendars', 'Dedicated "FamilyCube" calendar on-device', 'No account sign-in needed', 'Checked every time the app opens'].map((f, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: TITLE_CLR, marginTop: 5 }} />
                    <Text style={{ fontSize: 13, color: BODY_CLR, flex: 1, lineHeight: 18 }}>{f}</Text>
                  </View>
                ))}
              </View>

              {appleLastError && (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: BORDER }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: RED }}>
                    Last sync attempt failed ({appleLastError.context === 'push' ? 'sending to device' : 'checking device'})
                  </Text>
                  <Text style={{ fontSize: 12, color: BODY_CLR, marginTop: 2 }}>{appleLastError.message}</Text>
                </View>
              )}

              {activeMember?.appleCalendarSyncEnabled && (
                <>
                  <LinkButton label="Remove synced events from Apple Calendar" onPress={handleCleanupApple} loading={appleCleaning} />
                  <LinkButton label="Remove synced events from FamilyCube" onPress={handleCleanupInboundApple} loading={appleInboundCleaning} />
                </>
              )}
            </PressCard>

            {/* ── Privacy note ── */}
            <View style={styles.card}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: TITLE_CLR, marginBottom: 6 }}>Your privacy, your rules</Text>
              <Text style={{ fontSize: 13, color: BODY_CLR, lineHeight: 18 }}>
                Family Cube never shares your personal calendar data with other family members without your approval. Each member controls which of their own calendars are visible on the family schedule.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    backgroundColor: CARD_BG, padding: 16,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6,
    color: BODY_CLR, marginTop: 4,
  },
  sectionIntro: {
    fontSize: 13, color: BODY_CLR, lineHeight: 18, marginBottom: 2,
  },
});
