import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useChatStore } from '@/store/chatStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';
import { KID } from './kidTheme';

// Family chat preview — figma's "Family chat" section: avatar+message rows
// for the last couple messages in the family's main channel, plus an
// "X messages · Y people replied" status pill. Reads the already-loaded
// 'all' channel (app/(tabs)/_layout.tsx calls loadChannel('all') once
// family data is ready) rather than triggering a fresh load/decrypt pass
// from the Hub — this card is a preview, not the real chat surface.
export function KidChatPreviewCard({ members, colors, isDark }: {
  members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const messages = useChatStore(s => s.channels['all']?.messages) ?? [];
  if (messages.length === 0) return null;

  const recent = messages.slice(-2);
  const uniqueSenders = new Set(messages.slice(-20).map(m => m.senderId));

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Family Chat
      </Text>
      <Pressable onPress={() => router.push('/(tabs)/chat' as any)}
        style={{ borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 }}>
        {recent.map(m => {
          const sender = members.find(mem => mem.id === m.senderId);
          return (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <FamilyAvatar name={sender?.name ?? 'Family'} emoji={sender?.emoji} avatarUrl={sender?.avatarUrl} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: colors.textSecondary }}>{sender?.name?.split(' ')[0] ?? 'Family'}</Text>
                <Text style={{ fontSize: KID.sub, color: colors.textPrimary }} numberOfLines={1}>{m.text || '📎 Attachment'}</Text>
              </View>
            </View>
          );
        })}
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: colors.pinkLight, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, marginTop: 2 }}>
          <MessageCircle size={12} color={colors.pink} />
          <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: colors.pink }}>
            {messages.length} messages · {uniqueSenders.size} people replied
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
