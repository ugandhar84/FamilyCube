import { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView,
  Modal, KeyboardAvoidingView, Platform, Keyboard, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Leaf, Laptop, HandCoins, Check, Camera } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GP } from './seniorTheme';
import { GP_QUEST_CATEGORIES, GP_QUEST_SUGGESTIONS, type GpQuestCategory } from './gpQuestSuggestions';
import type { FamilyMember } from '@/store/familyStore';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

// Create Grandparent Quest modal — full spec lifecycle: mode, title,
// description, points, Grandparent Bonus jar preview, kid targeting, photo
// proof. GP-funded coins are a single unsplit pool (product decision) —
// no Spend/Save/Give breakdown applies here, unlike household chores.
export function CreateQuestModal({
  visible, onClose, editing = false,
  kids, colors, isDark,
  newQuestMode, setNewQuestMode,
  newQuestTitle, setNewQuestTitle,
  newQuestDesc, setNewQuestDesc,
  newQuestPoints, setNewQuestPoints,
  newQuestKidIds, setNewQuestKidIds,
  newQuestPhoto, setNewQuestPhoto,
  onCreate,
}: {
  visible: boolean; onClose: () => void; editing?: boolean;
  kids: FamilyMember[]; colors: any; isDark: boolean;
  newQuestMode: 'local' | 'virtual'; setNewQuestMode: (v: 'local' | 'virtual') => void;
  newQuestTitle: string; setNewQuestTitle: (v: string) => void;
  newQuestDesc: string; setNewQuestDesc: (v: string) => void;
  newQuestPoints: string; setNewQuestPoints: (v: string) => void;
  newQuestKidIds: string[]; setNewQuestKidIds: (fn: (ids: string[]) => string[]) => void;
  newQuestPhoto: boolean; setNewQuestPhoto: (fn: (p: boolean) => boolean) => void;
  onCreate: () => void;
}) {
  const pts = parseInt(newQuestPoints) || 0;
  const [gpCategory, setGpCategory] = useState<GpQuestCategory | null>(null);
  const suggestions = gpCategory
    ? GP_QUEST_SUGGESTIONS.filter(s => s.category === gpCategory)
    : GP_QUEST_SUGGESTIONS;
  const applySuggestion = (s: (typeof GP_QUEST_SUGGESTIONS)[number]) => {
    setNewQuestTitle(s.title);
    setNewQuestDesc(s.desc);
    setNewQuestMode(s.mode);
  };

  const dismiss = () => { Keyboard.dismiss(); onClose(); };
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(90);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden',
            maxHeight: keyboardAwareMaxHeight ?? '90%', backgroundColor: colors.card }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>
                  {editing ? '✏️ Edit Sponsored Chore' : '👴 Sponsor a Chore'}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: BRAND.teal }}>
                  {editing ? 'Still awaiting parent review — free to change' : '→ Parent reviews → Kid claims'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>
      <View style={{ gap: 14 }}>
        {/* Mode: Local vs Virtual */}
        <View style={{ flexDirection: 'row', gap: 0, borderRadius: 14, overflow: 'hidden',
          borderWidth: 1.5, borderColor: isDark ? colors.border : '#E2E8F0' }}>
          {([
            { key: 'local',   Icon: Leaf,   label: 'In-Person',  hint: 'Cook, garden, craft together' },
            { key: 'virtual', Icon: Laptop, label: 'Video Call',  hint: 'Flashcards, story, quiz' },
          ] as const).map(({ key, Icon, label }, i) => (
            <Pressable key={key} onPress={() => setNewQuestMode(key)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 12,
                borderRightWidth: i === 0 ? 1 : 0, borderRightColor: isDark ? colors.border : '#E2E8F0',
                backgroundColor: newQuestMode === key ? (key === 'local' ? '#ECFDF5' : BRAND.purple + '12') : 'transparent',
                ...(isDark && newQuestMode === key && { backgroundColor: key === 'local' ? '#0a2018' : BRAND.purple + '20' }),
              }}>
              <Icon size={20} color={newQuestMode === key ? (key === 'local' ? '#059669' : BRAND.purple) : colors.textSecondary} style={{ marginBottom: 2 }} />
              <Text style={{ fontSize: GP.sub, fontWeight: '900',
                color: newQuestMode === key ? (key === 'local' ? '#059669' : BRAND.purple) : colors.textSecondary }}>
                {label}
              </Text>
              {newQuestMode === key && <View style={{ height: 2, width: 28, borderRadius: 1,
                backgroundColor: key === 'local' ? '#059669' : BRAND.purple, marginTop: 4 }} />}
            </Pressable>
          ))}
        </View>

        {/* Category — GP-relevant activities (cooking, garden, stories,
            skills), not the parent household-chore list. Picking one just
            narrows the suggestion pills below; tap a pill to fill title +
            description + mode all at once. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {GP_QUEST_CATEGORIES.map(c => {
              const active = gpCategory === c.key;
              return (
                <Pressable key={c.key} onPress={() => setGpCategory(active ? null : c.key)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8,
                    backgroundColor: active ? BRAND.purple + '18' : (isDark ? colors.surface : '#F5F4FA'),
                    borderColor: active ? BRAND.purple : (isDark ? colors.border : '#E2E8F0') }}>
                  <Text style={{ fontSize: GP.body }}>{c.emoji}</Text>
                  <Text style={{ fontSize: GP.sub, fontWeight: '700', color: active ? BRAND.purple : colors.textSecondary }}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Suggestions — tap to fill title/description/mode at once */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {suggestions.map((s, i) => (
              <Pressable key={i} onPress={() => applySuggestion(s)}
                style={{ borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8,
                  backgroundColor: newQuestTitle === s.title ? BRAND.teal + '18' : (isDark ? colors.surface : '#F8FAFC'),
                  borderColor: newQuestTitle === s.title ? BRAND.teal : (isDark ? colors.border : '#E2E8F0') }}>
                <Text style={{ fontSize: GP.sub, fontWeight: '700',
                  color: newQuestTitle === s.title ? BRAND.teal : colors.textSecondary }} numberOfLines={1}>
                  {s.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Title */}
        <TextInput
          style={{ borderRadius: 12, borderWidth: 1.5, borderColor: newQuestTitle.trim() ? colors.border : colors.danger + '60',
            backgroundColor: isDark ? colors.surface : '#F8FAFC',
            padding: 12, fontSize: GP.body, color: colors.textPrimary }}
          placeholder={newQuestMode === 'local'
            ? 'e.g. Help weed the flower garden, Paneer recipe together…'
            : 'e.g. 15-min bedtime story call, State capitals quiz…'}
          placeholderTextColor={colors.textTertiary}
          value={newQuestTitle}
          onChangeText={setNewQuestTitle}
        />
        <TextInput
          style={{ borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
            backgroundColor: isDark ? colors.surface : '#F8FAFC',
            padding: 12, fontSize: GP.body, color: colors.textPrimary, minHeight: 56 }}
          placeholder="Describe what the child will do step by step (optional)…"
          placeholderTextColor={colors.textTertiary}
          value={newQuestDesc}
          onChangeText={setNewQuestDesc}
          multiline
        />

        {/* Points + photo row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
              Points you're sponsoring
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['200', '350', '400', '500'].map(p => (
                <Pressable key={p} onPress={() => setNewQuestPoints(p)}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: newQuestPoints === p ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                    backgroundColor: newQuestPoints === p ? BRAND.teal + '18' : 'transparent' }}>
                  <Text style={{ fontSize: GP.tiny, fontWeight: '900',
                    color: newQuestPoints === p ? BRAND.teal : colors.textSecondary }}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Grandparent Bonus jar preview — GP-funded coins are a single,
            deliberately unsplit pool (product decision), not run through
            the household's Spend/Save/Give financial-literacy split, so
            this just confirms the full amount lands in one jar rather than
            implying a 50/40/10 breakdown that doesn't apply to GP money. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          borderRadius: 10, borderWidth: 1, borderColor: BRAND.purple + '30',
          backgroundColor: BRAND.purple + '10', paddingVertical: 10 }}>
          <HandCoins size={14} color={BRAND.purple} />
          <Text style={{ fontSize: GP.sub, color: BRAND.purple }}>Goes to Grandparent Bonus jar</Text>
          <Text style={{ fontSize: GP.body, fontWeight: '900', color: BRAND.purple }}>{pts}</Text>
        </View>

        {/* Kid selector — pick none, one, or several; each means something different */}
        {kids.length > 1 && (
          <View>
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 }}>
              Who's this for?
            </Text>
            <Text style={{ fontSize: GP.tiny, color: colors.textTertiary, marginBottom: 6 }}>
              {newQuestKidIds.length === 0
                ? 'Nobody picked — goes to the bounty pool, first to claim it wins'
                : newQuestKidIds.length === 1
                ? `Goes straight to ${kids.find(k => k.id === newQuestKidIds[0])?.name.split(' ')[0]}`
                : `Bounty for ${newQuestKidIds.length} — each of them earns the full ${newQuestPoints || 350} pts, independently`}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {kids.map(k => {
                const picked = newQuestKidIds.includes(k.id);
                return (
                  <Pressable key={k.id}
                    onPress={() => setNewQuestKidIds(ids => picked ? ids.filter(id => id !== k.id) : [...ids, k.id])}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                      borderColor: picked ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                      backgroundColor: picked ? BRAND.teal + '15' : 'transparent' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {picked && <Check size={13} color={BRAND.teal} />}
                      <Text style={{ fontSize: GP.body, fontWeight: '600',
                        color: picked ? BRAND.teal : colors.textPrimary }}>
                        {k.name.split(' ')[0]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Photo proof toggle */}
        <Pressable onPress={() => setNewQuestPhoto(p => !p)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2,
            borderColor: newQuestPhoto ? BRAND.teal : (isDark ? colors.border : '#CBD5E1'),
            backgroundColor: newQuestPhoto ? BRAND.teal : 'transparent',
            alignItems: 'center', justifyContent: 'center' }}>
            {newQuestPhoto && <Check size={14} color="#fff" strokeWidth={3} />}
          </View>
          <Camera size={16} color={colors.textPrimary} />
          <Text style={{ fontSize: GP.body, color: colors.textPrimary }}>
            Child must submit photo proof
          </Text>
        </Pressable>
      </View>
            </ScrollView>

            {/* Sticky footer — was inside the ScrollView, could end up
                below the keyboard while typing the quest title/description. */}
            <View style={{ flexDirection: 'row', gap: 10, padding: 20, paddingTop: 14,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Pressable onPress={onClose}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14,
                  borderWidth: 1.5, borderColor: isDark ? colors.border : '#E2E8F0' }}>
                <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={onCreate}
                style={{ flex: 2, alignItems: 'center', paddingVertical: 13, borderRadius: 14,
                  backgroundColor: newQuestTitle.trim() ? BRAND.teal : (isDark ? '#374151' : '#D1D5DB') }}>
                <Text style={{ fontSize: GP.body, fontWeight: '900', color: '#fff' }}>
                  {editing ? 'Save Changes' : 'Send to Parent for Review'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
