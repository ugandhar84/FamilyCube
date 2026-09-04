/**
 * KioskChatTab — full channel/DM chat for kiosk mode, redesigned from the
 * original single-fixed-'all'-channel version (live-reported: "we missed
 * the tabs for the all chat channels and DM" + "it looks ugly... we dont
 * need such a wider screen"). Two panes instead of one full-width column:
 * a fixed-width channel/DM list on the left (mirrors the phone's own
 * channel strip — same buildGroupChannels/dmChannelId logic, same access
 * rules per role, just a vertical list instead of a horizontal scroll
 * strip, which suits a sidebar better than a phone-width chip row) and a
 * WIDTH-CAPPED message thread on the right, so a message never stretches
 * anywhere near kiosk's full landscape width the way the old single-column
 * layout did.
 *
 * Deliberately still simpler than the phone's ChatScreen (no attachments/
 * voice notes/reactions/replies/swipe gestures) — a shared wall tablet is
 * for reading and firing off quick texts, not composing rich media. Same
 * reasoning as the file this replaces.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ScrollView, StyleSheet } from 'react-native';
import { Send, Lock } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { fmtTime } from '@/lib/dates';
import { useChatStore, dmChannelId } from '@/store/chatStore';
import { buildGroupChannels } from '@/features/chat/components/constants';
import type { FamilyMember } from '@/store/familyStore';

interface ChannelEntry {
  id: string;
  label: string;
  isDM: boolean;
  lock: boolean;
  otherMember?: FamilyMember;
}

export function KioskChatTab({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const channels = useChatStore(s => s.channels);
  const unreadCounts = useChatStore(s => s.unreadCounts);
  const loadChannel = useChatStore(s => s.loadChannel);
  const loadUnreadCounts = useChatStore(s => s.loadUnreadCounts);
  const markChannelRead = useChatStore(s => s.markChannelRead);
  const sendMessage = useChatStore(s => s.sendMessage);

  const isParent = active.role === 'parent';
  const isSenior = active.role === 'senior';

  // Same access rules the phone's ChatScreen.tsx applies — reusing the
  // exact same buildGroupChannels() derivation (maternal/paternal/grand-
  // squad split) rather than re-deriving a second, possibly-drifting copy
  // of that logic here.
  const entries: ChannelEntry[] = useMemo(() => {
    const parents = members.filter(m => m.role === 'parent');
    const parentsCount = parents.length;
    const viewerGpSide: 'a' | 'b' | 'unlinked' | null = (() => {
      if (!isSenior) return null;
      if (!(active as any).linkedParentId) return 'unlinked';
      if ((active as any).linkedParentId === parents[0]?.id) return 'a';
      if ((active as any).linkedParentId === parents[1]?.id) return 'b';
      return 'unlinked';
    })();
    const groupChannels = buildGroupChannels(members)
      .filter(ch => ch.id !== 'all' || !isSenior)
      .filter(ch => ch.id !== 'parents' || parentsCount > 2)
      .filter(ch => !ch.seniorOnly || isSenior || isParent)
      .filter(ch => {
        if (!isSenior) return true;
        if (ch.id === 'seniors_a') return viewerGpSide === 'a' || viewerGpSide === 'unlinked';
        if (ch.id === 'seniors_b') return viewerGpSide === 'b';
        return true;
      })
      .map(ch => ({ id: ch.id, label: ch.label, isDM: false, lock: ch.lock }));

    const coParents = members.filter(m => m.role === 'parent' && m.id !== active.id);
    const kids = members.filter(m => (m.role === 'kid' || m.role === 'teen') && m.id !== active.id);
    const dmEntries: ChannelEntry[] = [...coParents, ...kids].map(m => ({
      id: dmChannelId(active.id, m.id),
      label: m.name.split(' ')[0],
      isDM: true,
      lock: false,
      otherMember: m,
    }));

    return [...groupChannels, ...dmEntries];
  }, [members, active, isParent, isSenior]);

  const [activeChannel, setActiveChannel] = useState<string>(entries[0]?.id ?? 'all');
  const listRef = useRef<FlatList>(null);
  const [text, setText] = useState('');

  // Keep activeChannel valid if the entry list changes (role switch, etc.)
  useEffect(() => {
    if (!entries.some(e => e.id === activeChannel) && entries.length > 0) {
      setActiveChannel(entries[0].id);
    }
  }, [entries, activeChannel]);

  useEffect(() => {
    if (entries.length === 0) return;
    loadUnreadCounts(entries.map(e => e.id), active.id);
  }, [entries, active.id, loadUnreadCounts]);

  useEffect(() => {
    if (!activeChannel) return;
    loadChannel(activeChannel);
    markChannelRead(activeChannel, active.id);
  }, [activeChannel, active.id, loadChannel, markChannelRead]);

  const messages = channels[activeChannel]?.messages ?? [];
  const memberName = (id: string) => members?.find(m => m.id === id)?.name?.split(' ')[0] ?? 'Someone';
  const memberEmoji = (id: string) => members?.find(m => m.id === id)?.emoji ?? '👤';
  const currentEntry = entries.find(e => e.id === activeChannel);

  const send = () => {
    const t = text.trim();
    if (!t || !activeChannel) return;
    setText('');
    sendMessage(activeChannel, active.id, t);
  };

  return (
    <View style={s.root}>
      {/* ── Channel/DM sidebar ── */}
      <View style={[s.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
        <Text style={[s.sidebarTitle, { color: colors.textSecondary }]}>CHANNELS</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sidebarList}>
          {entries.filter(e => !e.isDM).map(e => {
            const on = e.id === activeChannel;
            const unread = unreadCounts[e.id] ?? 0;
            return (
              <Pressable key={e.id} onPress={() => setActiveChannel(e.id)}
                style={[s.channelRow, on && { backgroundColor: colors.primaryLight }]}>
                {e.lock && <Lock size={13} color={on ? colors.primary : colors.textTertiary} />}
                <Text style={[s.channelLabel, { color: on ? colors.primary : colors.textPrimary, fontWeight: on ? '800' : '600' }]} numberOfLines={1}>
                  {e.label}
                </Text>
                {unread > 0 && (
                  <View style={[s.unreadDot, { backgroundColor: colors.danger }]}>
                    <Text style={s.unreadDotText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}

          {entries.some(e => e.isDM) && (
            <Text style={[s.sidebarTitle, { color: colors.textSecondary, marginTop: 18 }]}>DIRECT MESSAGES</Text>
          )}
          {entries.filter(e => e.isDM).map(e => {
            const on = e.id === activeChannel;
            const unread = unreadCounts[e.id] ?? 0;
            return (
              <Pressable key={e.id} onPress={() => setActiveChannel(e.id)}
                style={[s.channelRow, on && { backgroundColor: colors.primaryLight }]}>
                <Text style={s.dmEmoji}>{e.otherMember?.emoji ?? '👤'}</Text>
                <Text style={[s.channelLabel, { color: on ? colors.primary : colors.textPrimary, fontWeight: on ? '800' : '600' }]} numberOfLines={1}>
                  {e.label}
                </Text>
                {unread > 0 && (
                  <View style={[s.unreadDot, { backgroundColor: colors.danger }]}>
                    <Text style={s.unreadDotText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Message thread — width-capped, centered, not stretched ── */}
      <View style={s.threadOuter}>
        <View style={s.thread}>
          <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {currentEntry?.label ?? 'Chat'}
          </Text>

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            contentContainerStyle={s.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const mine = item.senderId === active.id;
              return (
                <View style={[s.row, mine && { flexDirection: 'row-reverse', alignSelf: 'flex-end' }]}>
                  <Text style={s.avatar}>{memberEmoji(item.senderId)}</Text>
                  <View style={[s.bubble, { backgroundColor: mine ? colors.primary : colors.card, borderColor: colors.border }]}>
                    {!mine && <Text style={[s.sender, { color: colors.teal }]}>{memberName(item.senderId)}</Text>}
                    {!!item.text && <Text style={[s.text, { color: mine ? '#fff' : colors.textPrimary }]}>{item.text}</Text>}
                    <Text style={[s.time, { color: mine ? 'rgba(255,255,255,0.75)' : colors.textTertiary }]}>
                      {fmtTime(new Date(item.timestamp).toTimeString().slice(0, 5))}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={[s.empty, { color: colors.textTertiary }]}>No messages yet — say hi 👋</Text>
            }
          />

          <View style={[s.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={currentEntry?.isDM ? `Message ${currentEntry.label}…` : 'Message the family…'}
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary }]}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <Pressable onPress={send} disabled={!text.trim()} style={[s.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.border }]}>
              <Send size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const SIDEBAR_WIDTH = 260;
const THREAD_MAX_WIDTH = 720;

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  sidebar: { width: SIDEBAR_WIDTH, borderRightWidth: StyleSheet.hairlineWidth, paddingTop: 20, paddingHorizontal: 14 },
  sidebarTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 6 },
  sidebarList: { gap: 4, paddingBottom: 20 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 11 },
  channelLabel: { flex: 1, fontSize: TYPO.body },
  dmEmoji: { fontSize: 17 },
  unreadDot: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadDotText: { fontSize: 10.5, fontWeight: '800', color: '#fff' },

  // Centers a max-width column inside whatever space is left after the
  // sidebar — this is the actual fix for "we dont need such a wider
  // screen": the thread never stretches past THREAD_MAX_WIDTH regardless
  // of how wide the kiosk display is.
  threadOuter: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  thread: { flex: 1, width: '100%', maxWidth: THREAD_MAX_WIDTH, paddingTop: 20 },

  title: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  list: { gap: 12, paddingBottom: 12, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '85%', alignSelf: 'flex-start' },
  avatar: { fontSize: 20 },
  bubble: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%', flexShrink: 1 },
  sender: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  text: { fontSize: TYPO.body, fontWeight: '600' },
  time: { fontSize: 9.5, fontWeight: '600', marginTop: 4, textAlign: 'right' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: TYPO.body, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 999, paddingLeft: 18, paddingRight: 6, paddingVertical: 6, marginBottom: 20 },
  input: { flex: 1, fontSize: TYPO.body, fontWeight: '600' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
