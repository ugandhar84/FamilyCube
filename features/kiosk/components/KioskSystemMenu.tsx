/**
 * KioskSystemMenu — replaces the old top header. A Windows-style menu that
 * opens upward from the avatar at the left of the bottom tab bar:
 *   · every profile in the family, one tap to switch (a member with a PIN
 *     still goes through PinEntryModal, exactly as the old header did)
 *   · the actions the header used to carry — Notifications, Announcement,
 *     Ask Cube (parent), theme, Edit my profile
 *   · Lock, bottom-right like a power button
 * Not a native Modal (so touches count as activity for the idle lock); the PIN
 * and notification sheets it opens ARE Modals and hold the lock off themselves.
 */
import { needsPinToSwitch, markEnteredByParent, clearEnteredByParent } from '@/lib/pinPolicy';
import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Lock, Megaphone, Bell, Sun, MoonStar, MonitorSmartphone, Sparkles, UserCircle2, PanelLeft } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';
import { useTheme, type ThemeMode } from '@/lib/ThemeContext';
import { useNotifStore } from '@/store/notifStore';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { useKioskLockSuspended } from '../KioskActivityContext';
import type { KioskTabKey } from '../kioskTabs';
import { useKioskPrefsStore } from '@/store/kioskPrefsStore';
import { KioskAvatar } from './KioskAvatar';
import { KioskNotificationPanel } from './KioskNotificationPanel';

export function KioskSystemMenu({
  visible, onClose, members, activeId, onSwitch, onIntercom, onLock, onNavigate, onAskFam, onEditProfile,
}: {
  visible: boolean;
  onClose: () => void;
  members: FamilyMember[];
  activeId: string;
  onSwitch: (id: string) => void;
  onIntercom: () => void;
  onLock: () => void;
  onNavigate: (tab: KioskTabKey) => void;
  onAskFam?: () => void;
  onEditProfile: () => void;
}) {
  const { k, isDark } = useKioskColors();
  const pastels = kioskPastels(k);
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = useNotifStore(s => s.unreadCount);
  // Both are native Modals: their touches never reach the kiosk root, so hold
  // the idle lock off while either is up.
  useKioskLockSuspended(pinTarget !== null);
  const navSide = useKioskPrefsStore(st => st.navSide);
  const setNavSide = useKioskPrefsStore(st => st.setNavSide);
  useKioskLockSuspended(notifOpen);

  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const cycleTheme = () => {
    const next: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };
    setThemeMode(next[themeMode]);
  };
  const ThemeIcon = themeMode === 'light' ? Sun : themeMode === 'dark' ? MoonStar : MonitorSmartphone;
  const themeLabel = themeMode === 'light' ? 'Light' : themeMode === 'dark' ? 'Dark' : 'Auto';

  // Same filter the old header and the lock screen use: never switch into a
  // soft-deleted or not-yet-joined member.
  const switchable = useMemo(
    () => members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending'),
    [members],
  );
  const handleSwitch = (id: string) => {
    if (id === activeId) { onClose(); return; }
    const m = members.find(x => x.id === id);
    const me = members.find(x => x.id === activeId);
    if (m && m.pinEnabled && m.pin && needsPinToSwitch(me, m)) setPinTarget(m);
    else { if (m?.pinEnabled && m.pin) markEnteredByParent(m.id); onSwitch(id); onClose(); }
  };

  const tile = (label: string, Icon: typeof Lock, bg: string, fg: string, onPress: () => void, badge?: number) => (
    <Pressable
      key={label} onPress={onPress}
      style={({ pressed }) => [s.tile, { backgroundColor: bg }, pressed && { opacity: 0.75 }]}
      accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
    >
      <View>
        <Icon size={22} color={fg} />
        {!!badge && (
          <View style={[s.badge, { backgroundColor: k.primary, borderColor: bg }]}>
            <Text style={[s.badgeText, { color: k.onPrimary }]}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[s.tileText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      {visible && (
        <>
          {/* Tap anywhere outside to close. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
          <View style={[s.panel, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
            <Text style={[s.heading, { color: k.textFaint }]}>SWITCH PROFILE</Text>
            <View style={s.users}>
              {switchable.map((m, i) => {
                const on = m.id === activeId;
                const tone = pastels[i % pastels.length];
                const needsPin = !!m.pinEnabled && !!m.pin;
                const first = m.name?.trim().split(' ')[0] || 'Member';
                return (
                  <Pressable
                    key={m.id} onPress={() => handleSwitch(m.id)}
                    style={({ pressed }) => [s.user, { backgroundColor: tone.card, borderColor: on ? tone.fg : 'transparent' }, pressed && { opacity: 0.75 }]}
                    accessibilityRole="button" accessibilityState={{ selected: on }}
                    accessibilityLabel={first}
                    accessibilityHint={on ? 'Already the active profile' : needsPin ? 'Switch to this profile, PIN required' : 'Switch to this profile'}
                  >
                    <View>
                      <KioskAvatar
                        name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl}
                        siblings={members.filter(x => x.id !== m.id).map(x => x.name)}
                        size={46} bgColor={k.card} k={k}
                      />
                      {needsPin && (
                        <View style={[s.pin, { backgroundColor: k.card, borderColor: k.cardBorder }]}><Lock size={9} color={k.textMuted} /></View>
                      )}
                    </View>
                    <Text style={[s.userName, { color: tone.fg }]} numberOfLines={1}>{first}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[s.rule, { backgroundColor: k.cardBorder }]} />

            <View style={s.tiles}>
              {tile('Notifications', Bell, k.pastelPrimaryCard, k.terracotta, () => setNotifOpen(true), unread)}
              {tile('Announce', Megaphone, k.pastelAmberCard, k.gold, () => { onClose(); onIntercom(); })}
              {onAskFam && tile('Ask Cube', Sparkles, k.pastelLavCard, k.purple, () => { onClose(); onAskFam(); })}
              {tile(themeLabel, ThemeIcon, k.pastelSageCard, k.sage, cycleTheme)}
              {tile(navSide ? 'Nav: bottom' : 'Nav: side', PanelLeft, k.pastelLavCard, k.purple, () => { setNavSide(!navSide); onClose(); })}
              {tile('My profile', UserCircle2, k.well, k.textMuted, () => { onClose(); onEditProfile(); })}
            </View>

            <Pressable
              onPress={() => { onClose(); onLock(); }}
              style={({ pressed }) => [s.lock, { backgroundColor: k.pastelPrimaryCard }, pressed && { opacity: 0.75 }]}
              accessibilityRole="button" accessibilityLabel="Lock"
              accessibilityHint="Hide the current profile until someone signs back in"
            >
              <Lock size={20} color={k.danger} />
              <Text style={[s.lockText, { color: k.danger }]}>Lock</Text>
            </Pressable>
          </View>
        </>
      )}

      <PinEntryModal
        visible={pinTarget !== null}
        member={pinTarget}
        onSuccess={(member) => { onSwitch(member.id); setPinTarget(null); onClose(); }}
        onCancel={() => setPinTarget(null)}
      />
      <KioskNotificationPanel
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        onNavigate={(tab) => { onNavigate(tab); setNotifOpen(false); onClose(); }}
        k={k}
      />
    </>
  );
}

const s = StyleSheet.create({
  panel: {
    position: 'absolute', left: KIOSK_SPACE.md, bottom: 84, width: 420, zIndex: 30,
    borderRadius: KIOSK_RADIUS.xl, borderWidth: 1, padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  heading: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1.1 },
  users: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  user: { width: 92, alignItems: 'center', gap: 6, borderRadius: KIOSK_RADIUS.lg, paddingVertical: 10, borderWidth: 2 },
  userName: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  pin: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.5%', minHeight: 72, borderRadius: KIOSK_RADIUS.lg, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  tileText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  badge: { position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  lock: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 20 },
  lockText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
});
