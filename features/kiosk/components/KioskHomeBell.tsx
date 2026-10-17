/**
 * KioskHomeBell — the notification bell on the kiosk Home, with the unread count. Opens the same
 * notification panel the system menu uses.
 */
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useNotifStore } from '@/store/notifStore';
import { useKioskColors } from '../kioskPalette';
import { KioskNotificationPanel } from './KioskNotificationPanel';
import type { KioskTabKey } from '../kioskTabs';

export function KioskHomeBell({ onNavigate }: { onNavigate: (t: KioskTabKey) => void }) {
  const { k } = useKioskColors();
  const unread = useNotifStore(st => st.unreadCount);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        style={[s.btn, { backgroundColor: k.goldSoft }]}>
        <Bell size={22} color={k.gold} />
        {unread > 0 && (
          <View style={[s.badge, { backgroundColor: k.primary, borderColor: k.goldSoft }]}>
            <Text style={[s.badgeT, { color: k.onPrimary }]}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </Pressable>
      <KioskNotificationPanel visible={open} onClose={() => setOpen(false)} onNavigate={(t) => { setOpen(false); onNavigate(t); }} k={k} />
    </>
  );
}

const s = StyleSheet.create({
  btn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  badgeT: { fontSize: 11, fontWeight: '800' },
});
