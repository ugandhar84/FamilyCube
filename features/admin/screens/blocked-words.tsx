import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text,  TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { CORE_BLOCKED_WORDS, reloadBlockedWords } from '@/lib/profanityFilter';
import { TYPO } from '@/constants/theme';

const SETTING_KEY = 'blocked_words_extra';

export default function BlockedWordsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const customListRef = useRef<FlashListRef<any>>(null);
  const coreListRef   = useRef<FlashListRef<any>>(null);
  const [showGoTop,  setShowGoTop]  = useState(false);

  const [extraWords, setExtraWords] = useState<string[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [input,      setInput]      = useState('');
  const [tab,        setTab]        = useState<'custom' | 'core'>('custom');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('app_settings').select('value').eq('key', SETTING_KEY).maybeSingle();
      setExtraWords(Array.isArray(data?.value) ? data!.value : []);
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const save = async (words: string[]) => {
    setSaving(true);
    try {
      await supabase.from('app_settings').upsert(
        { key: SETTING_KEY, value: words, updated_at: new Date().toISOString(), updated_by: user?.id ?? null },
        { onConflict: 'key' },
      );
      setExtraWords(words);
      await reloadBlockedWords();
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const addWord = async () => {
    const word = input.trim().toLowerCase();
    if (!word) return;
    if (extraWords.includes(word) || CORE_BLOCKED_WORDS.includes(word)) {
      showAlert('Already blocked', `"${word}" is already in the blocked list.`);
      return;
    }
    setInput('');
    await save([...extraWords, word]);
  };

  const removeWord = (word: string) => {
    showAlert('Remove word?', `"${word}" will no longer be blocked.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => save(extraWords.filter(w => w !== word)) },
    ]);
  };

  const displayList = tab === 'custom' ? extraWords : CORE_BLOCKED_WORDS;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{
        headerRight: () => saving ? <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} /> : null,
      }} />

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(['custom', 'core'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}>
            <Text style={[s.tabText, { color: tab === t ? colors.primary : colors.textSecondary }]}>
              {t === 'custom' ? `✏️ Custom (${extraWords.length})` : `🔒 Core (${CORE_BLOCKED_WORDS.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'custom' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* Add input */}
          <View style={[s.addRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <TextInput
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg ?? colors.background, borderColor: colors.border }]}
              placeholder="Add a word to block…"
              placeholderTextColor={colors.textTertiary}
              value={input}
              onChangeText={v => setInput(v.toLowerCase())}
              onSubmitEditing={addWord}
              returnKeyType="done"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={addWord}
              disabled={!input.trim() || saving}
              style={[s.addBtn, { backgroundColor: input.trim() ? colors.primary : colors.border }]}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : extraWords.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 36 }}>🤐</Text>
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>No custom blocked words yet</Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>Type a word above and tap + to add it</Text>
            </View>
          ) : (
            <FlashList
              ref={customListRef}
              data={extraWords}
              keyExtractor={w => w}
              style={{ flex: 1 }}
              bounces={false}
              overScrollMode="never"
              contentContainerStyle={{ padding: 12, gap: 8 }}
              onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)}
              scrollEventThrottle={16}
              renderItem={({ item }) => (
                <View style={[s.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.chipText, { color: colors.textPrimary }]}>{item}</Text>
                  <TouchableOpacity onPress={() => removeWord(item)} style={s.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color="#E24B4A" />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </KeyboardAvoidingView>
      )}

      {tab === 'core' && (
        <FlashList
          ref={coreListRef}
          data={CORE_BLOCKED_WORDS}
          keyExtractor={w => w}
          style={{ flex: 1 }}
          bounces={false}
          overScrollMode="never"
          onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)}
          scrollEventThrottle={16}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          ListHeaderComponent={
            <Text style={[s.coreNote, { color: colors.textSecondary }]}>
              These words are always blocked and cannot be removed. Add custom words in the Custom tab.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={[s.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.textTertiary} style={{ marginRight: 6 }} />
              <Text style={[s.chipText, { color: colors.textSecondary }]}>{item}</Text>
            </View>
          )}
        />
      )}
      {showGoTop && (
        <TouchableOpacity
          onPress={() => {
            customListRef.current?.scrollToOffset({ offset: 0, animated: true });
            coreListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: '#7C5CBF', alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tabs:      { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:       { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText:   { fontSize: TYPO.body, fontWeight: '700' },
  addRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  input:     { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: TYPO.body },
  addBtn:    { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chip:      { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  chipText:  { flex: 1, fontSize: TYPO.body, fontWeight: '500' },
  removeBtn: { padding: 2 },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 80 },
  emptyText: { fontSize: TYPO.subheading, fontWeight: '600' },
  emptySub:  { fontSize: TYPO.body, textAlign: 'center', paddingHorizontal: 32 },
  coreNote:  { fontSize: TYPO.body, lineHeight: 18, marginBottom: 8, paddingHorizontal: 4 },
});
