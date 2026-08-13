import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  Image, Heart, Plus, Trash2, Waves, Trophy, Gamepad2, FlaskConical,
  Star, Camera, X, BookOpen, Smile, Calendar,
} from 'lucide-react-native';
import { LucideIcon } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { SCard, CardHeader, AddBtn, EmptyState, BRAND } from './shared';

interface Memory {
  id: string; family_id: string; title: string; description: string | null;
  date: string; icon_name: string; icon_color: string; tag: string | null;
  hearts: number; hearted_by: string[]; created_by: string | null;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Waves: Waves, Trophy: Trophy, Gamepad2: Gamepad2,
  FlaskConical: FlaskConical, Star: Star, Camera: Camera,
  BookOpen: BookOpen, Smile: Smile, Image: Image, Heart: Heart,
};

const PALETTE = [
  { name: 'Waves', color: BRAND.teal },
  { name: 'Trophy', color: BRAND.amber },
  { name: 'Gamepad2', color: BRAND.purple },
  { name: 'FlaskConical', color: BRAND.emerald },
  { name: 'Star', color: '#F59E0B' },
  { name: 'Camera', color: BRAND.blue },
  { name: 'BookOpen', color: BRAND.rose },
  { name: 'Smile', color: BRAND.teal },
];

const TAGS = ['vacation', 'milestone', 'birthday', 'achievement', 'school', 'family', 'sports', 'art'];

function AddMemoryModal({ visible, onClose, onSave, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onSave: (form: { title: string; description: string; date: string; icon_name: string; icon_color: string; tag: string }) => Promise<void>;
  colors: any; isDark: boolean;
}) {
  const [title, setTitle]   = useState('');
  const [desc, setDesc]     = useState('');
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [icon, setIcon]     = useState('Trophy');
  const [iconColor, setIconColor] = useState(BRAND.amber);
  const [tag, setTag]       = useState('');
  const [saving, setSaving] = useState(false);

  const inp = [md.inp, {
    backgroundColor: isDark ? colors.card : '#F5F3FF',
    borderColor: colors.border, color: colors.textPrimary,
  }];

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), description: desc.trim(), date, icon_name: icon, icon_color: iconColor, tag });
    setSaving(false);
    setTitle(''); setDesc(''); setTag('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[md.modal, { backgroundColor: isDark ? colors.background : '#FAF8FF' }]}>
          <View style={md.header}>
            <Text style={[md.title, { color: colors.textPrimary }]}>Add Memory</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textSecondary} /></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
            <View>
              <Text style={[md.label, { color: colors.textSecondary }]}>Memory Title *</Text>
              <TextInput value={title} onChangeText={setTitle}
                placeholder="e.g. First Day of School" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>
            <View>
              <Text style={[md.label, { color: colors.textSecondary }]}>Description</Text>
              <TextInput value={desc} onChangeText={setDesc}
                placeholder="What made this moment special?" placeholderTextColor={colors.textTertiary}
                style={[inp, { height: 80 }]} multiline textAlignVertical="top" />
            </View>
            <View>
              <Text style={[md.label, { color: colors.textSecondary }]}>Date</Text>
              <TextInput value={date} onChangeText={setDate}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>

            {/* Icon picker */}
            <View>
              <Text style={[md.label, { color: colors.textSecondary }]}>Memory Icon</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {PALETTE.map(p => {
                  const Ic = ICON_MAP[p.name] ?? Image;
                  const sel = icon === p.name;
                  return (
                    <TouchableOpacity key={p.name} onPress={() => { setIcon(p.name); setIconColor(p.color); }}
                      style={[md.iconBtn, {
                        backgroundColor: sel ? p.color + '25' : 'transparent',
                        borderColor: sel ? p.color : colors.border,
                      }]}>
                      <Ic size={22} color={sel ? p.color : colors.textTertiary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Tag */}
            <View>
              <Text style={[md.label, { color: colors.textSecondary }]}>Tag</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {TAGS.map(t => (
                    <TouchableOpacity key={t} onPress={() => setTag(tag === t ? '' : t)}
                      style={[md.tagChip, {
                        backgroundColor: tag === t ? BRAND.purple : 'transparent',
                        borderColor: tag === t ? BRAND.purple : colors.border,
                      }]}>
                      <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'capitalize',
                        color: tag === t ? '#fff' : colors.textSecondary }}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </ScrollView>

          <View style={[md.footer, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={[md.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave}
              style={[md.saveBtn, { backgroundColor: BRAND.purple }]} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save Memory</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function MemoriesTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const familyId = (members[0] as any)?.familyId ?? 'family-1';

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('family_memories')
      .select('*').eq('family_id', familyId).order('date', { ascending: false });
    if (data) setMemories(data as Memory[]);
    setLoading(false);
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  const addMemory = async (form: any) => {
    const { data } = await supabase.from('family_memories').insert({
      family_id: familyId, created_by: activeMemberId ?? members[0]?.id,
      ...form, hearts: 0, hearted_by: [],
    }).select().single();
    if (data) setMemories(prev => [data as Memory, ...prev]);
  };

  const heartMemory = async (mem: Memory) => {
    const myId = activeMemberId ?? members[0]?.id ?? '';
    const alreadyHearted = mem.hearted_by?.includes(myId);
    const newHearts = alreadyHearted ? mem.hearts - 1 : mem.hearts + 1;
    const newHearted = alreadyHearted
      ? mem.hearted_by.filter(id => id !== myId)
      : [...(mem.hearted_by ?? []), myId];
    const { error } = await supabase.from('family_memories')
      .update({ hearts: newHearts, hearted_by: newHearted }).eq('id', mem.id);
    if (!error) {
      setMemories(prev => prev.map(m =>
        m.id === mem.id ? { ...m, hearts: newHearts, hearted_by: newHearted } : m
      ));
    }
  };

  const deleteMemory = async (id: string) => {
    await supabase.from('family_memories').delete().eq('id', id);
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  if (loading) return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={Image} iconColor={BRAND.purple} title="Family Memories" colors={colors} />
      <ActivityIndicator color={BRAND.purple} style={{ marginVertical: 24 }} />
    </SCard>
  );

  return (
    <>
      <SCard colors={colors} isDark={isDark}>
        <CardHeader Icon={Image} iconColor={BRAND.purple} title="Family Memories"
          badge={`${memories.length}`} badgeColor={BRAND.purple} colors={colors} />

        {memories.length === 0
          ? <EmptyState Icon={Image} label="Capture your first family memory" colors={colors} />
          : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
              {memories.map(mem => {
                const Ic = ICON_MAP[mem.icon_name] ?? Image;
                const myId = activeMemberId ?? members[0]?.id ?? '';
                const hearted = mem.hearted_by?.includes(myId);
                const heartColor = hearted ? BRAND.rose : colors.textTertiary;

                return (
                  <View key={mem.id} style={[me.card, {
                    backgroundColor: isDark ? colors.card : '#FAFAFA',
                    borderColor: colors.border,
                  }]}>
                    {/* Gradient-style thumbnail */}
                    <View style={[me.thumb, { backgroundColor: mem.icon_color + '25' }]}>
                      <Ic size={32} color={mem.icon_color} />
                    </View>

                    <View style={{ padding: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary }} numberOfLines={2}>
                        {mem.title}
                      </Text>
                      {mem.description && (
                        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 3 }} numberOfLines={2}>
                          {mem.description}
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                        <Calendar size={10} color={colors.textTertiary} />
                        <Text style={{ fontSize: 10, color: colors.textTertiary }}>{mem.date}</Text>
                        {mem.tag && (
                          <View style={[me.tag, { backgroundColor: BRAND.purple + '20' }]}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: BRAND.purple, textTransform: 'capitalize' }}>
                              {mem.tag}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                        <TouchableOpacity onPress={() => heartMemory(mem)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Heart size={16} color={heartColor} fill={hearted ? BRAND.rose : 'transparent'} />
                          <Text style={{ fontSize: 12, fontWeight: '800', color: heartColor }}>
                            {mem.hearts}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteMemory(mem.id)}>
                          <Trash2 size={13} color={BRAND.rose + 'AA'} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

        <AddBtn label="Add Memory" onPress={() => setShowModal(true)} color={BRAND.purple} />
      </SCard>

      <AddMemoryModal visible={showModal} onClose={() => setShowModal(false)}
        onSave={addMemory} colors={colors} isDark={isDark} />
    </>
  );
}

const me = StyleSheet.create({
  card:  { width: '47%', borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  thumb: { width: '100%', height: 100, alignItems: 'center', justifyContent: 'center' },
  tag:   { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
});

const md = StyleSheet.create({
  modal:     { flex: 1 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
               borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB' },
  title:     { fontSize: 18, fontWeight: '900' },
  label:     { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  inp:       { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 10,
               fontSize: 14, fontWeight: '600' },
  iconBtn:   { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5,
               alignItems: 'center', justifyContent: 'center' },
  tagChip:   { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6 },
  footer:    { flexDirection: 'row', gap: 10, padding: 20, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  saveBtn:   { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
});
