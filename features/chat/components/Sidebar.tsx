import { View, Text, Pressable } from 'react-native';
import { X, MessageSquare, ShieldCheck } from 'lucide-react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { buildGroupChannels } from './constants';

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ colors, isDark, channelId, setChannelId, members, currentMemberId, isParent, onClose }: {
  colors: any; isDark: boolean; channelId: string; setChannelId: (id: string) => void;
  members: any[]; currentMemberId: string; isParent: boolean; onClose: () => void;
}) {
  const bg       = isDark ? '#0f172a' : '#1e1b4b';
  const headerBg = isDark ? '#1e293b' : '#312e81';
  const active   = isDark ? '#4f46e5' : '#4338ca';
  const isSenior = members.find(m => m.id === currentMemberId)?.role === 'senior';
  const groupChannels = buildGroupChannels(members).filter(ch => ch.id !== 'all' || !isSenior);
  return (
    <View style={{ width: 220, backgroundColor: bg, position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 50 }}>
      <View style={{ backgroundColor: headerBg, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#e2e8f0' }}>💬 Family Chat</Text>
        <Pressable onPress={onClose} style={{ padding: 4 }}><X size={18} color="#818cf8" /></Pressable>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 10, paddingTop: 14 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#818cf8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Channels</Text>
        {groupChannels.map(ch => {
          if (ch.lock && !isParent) return null;
          const isAct = channelId === ch.id;
          return (
            <Pressable key={ch.id} onPress={() => { setChannelId(ch.id); onClose(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, marginBottom: 2, backgroundColor: isAct ? active : 'transparent' }}>
              <MessageSquare size={14} color={isAct ? '#fff' : '#818cf8'} />
              <Text style={{ fontSize: 13, fontWeight: isAct ? '700' : '500', color: isAct ? '#fff' : '#e2e8f0' }}>{ch.label}</Text>
            </Pressable>
          );
        })}
        <View style={{ height: 1, backgroundColor: '#1e3a8a', marginVertical: 14 }} />
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#818cf8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Direct Messages</Text>
        {members.filter(m => m.id !== currentMemberId).map(m => {
          const isAct = channelId === m.id;
          return (
            <Pressable key={m.id} onPress={() => { setChannelId(m.id); onClose(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, marginBottom: 2, backgroundColor: isAct ? '#4f46e5' : 'transparent' }}>
              <Text style={{ fontSize: 18 }}>{m.emoji ?? '👤'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: isAct ? '#fff' : '#e2e8f0' }} numberOfLines={1}>{m.name.split(' ')[0]}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' }} />
                  <Text style={{ fontSize: 9, color: '#818cf8' }}>Online</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ margin: 10, padding: 10, backgroundColor: isDark ? '#1e293b' : '#312e81', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={16} color="#10b981" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>E2E Encrypted</Text>
          <Text style={{ fontSize: 10, color: '#818cf8' }}>AES-256-GCM · passcode-wrapped key</Text>
        </View>
      </View>
    </View>
  );
}
