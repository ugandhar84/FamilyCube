import { showAlert } from '@/components/AppAlert';
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLogo from '@/components/PawBondLogo';
import { RADIUS, SPACING , TYPO } from '@/constants/theme';

const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 18);
}

function makeSuggestions(name: string): string[] {
  const base = slugify(name) || 'pawfriend';
  const adjectives = ['swift', 'lucky', 'cozy', 'bold', 'sunny'];
  const animals    = ['pup', 'paw', 'tail', 'fur', 'snout'];
  const n1 = Math.floor(Math.random() * 90 + 10);
  const n2 = Math.floor(Math.random() * 900 + 100);
  return [
    `${base}${n1}`,
    `${adjectives[0]}_${base}`,
    `${base}_${animals[Math.floor(Math.random() * animals.length)]}`,
    `${adjectives[Math.floor(Math.random() * adjectives.length)]}_${animals[Math.floor(Math.random() * animals.length)]}${n1}`,
    `${base}${n2}`,
  ].map(s => s.slice(0, 24));
}

export default function HandlePickerScreen() {
  const { colors, isDark } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [handle, setHandle]           = useState('');
  const [status, setStatus]           = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [saving, setSaving]           = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      const name = profile?.full_name ?? user.email?.split('@')[0] ?? 'friend';
      setFirstName(name.split(' ')[0]);
      setSuggestions(makeSuggestions(name));
    })();
  }, []);

  const checkHandle = (raw: string) => {
    const val = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setHandle(val);
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!val) { setStatus('idle'); return; }
    if (!HANDLE_RE.test(val)) { setStatus('invalid'); return; }
    setStatus('checking');
    checkTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .ilike('handle', val)
        .maybeSingle();
      setStatus(data ? 'taken' : 'ok');
    }, 400);
  };

  const save = async () => {
    if (status !== 'ok' || saving) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase.from('profiles').update({ handle }).eq('id', user.id);
    setSaving(false);
    if (error) {
      showAlert('Error', 'Could not save your handle. Please try again.');
      return;
    }
    router.replace('/(tabs)');
  };

  const statusColor = status === 'ok' ? '#22c55e' : status === 'taken' ? '#ef4444' : '#f59e0b';
  const statusMsg   = status === 'ok' ? '✓ Available'
    : status === 'taken'   ? '✗ Already taken'
    : status === 'invalid' ? '3–24 chars, letters, numbers & underscores only'
    : status === 'checking' ? 'Checking…' : '';

  const s = makeStyles(colors, isDark);
  const canSave = status === 'ok' && !saving;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Hero header */}
          <LinearGradient
            colors={isDark ? ['#1C0A3A', '#0D1F1E'] : ['#6B2FD4', '#1DC8BC']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.hero}
          >
            <PawBondLogo size={64} animated isDark={isDark} />
            <Text style={s.heroTitle}>Choose your handle</Text>
            <Text style={s.heroSub}>
              {firstName ? `Hi ${firstName}! ` : ''}Pick a unique @handle — how others find and tag you.
            </Text>
          </LinearGradient>

          <View style={s.body}>
            {/* Suggestions */}
            <Text style={s.label}>Suggestions</Text>
            <View style={s.suggestionsRow}>
              {suggestions.map(sg => {
                const isSelected = handle === sg && status === 'ok';
                return (
                  <TouchableOpacity
                    key={sg}
                    style={[s.chip, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => checkHandle(sg)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, isSelected && { color: '#fff' }]}>@{sg}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom input */}
            <Text style={[s.label, { marginTop: SPACING.xl }]}>Or enter your own</Text>
            <View style={[s.inputRow, status === 'ok' && { borderColor: '#22c55e' }, status === 'taken' && { borderColor: '#ef4444' }]}>
              <Text style={s.atSign}>@</Text>
              <TextInput
                style={s.input}
                placeholder="your_handle"
                placeholderTextColor={colors.placeholder}
                value={handle}
                onChangeText={checkHandle}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={24}
              />
              {status === 'checking' && <ActivityIndicator size="small" color={colors.primaryText ?? colors.primary} />}
            </View>
            {statusMsg ? (
              <Text style={[s.statusMsg, { color: statusColor }]}>{statusMsg}</Text>
            ) : null}

            {/* Confirm button */}
            <TouchableOpacity
              style={[s.btn, !canSave && s.btnDisabled]}
              onPress={save}
              disabled={!canSave}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Confirm handle</Text>
              }
            </TouchableOpacity>

            <Text style={s.hint}>You can change this later in your profile settings.</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof import('@/lib/ThemeContext').useTheme>['colors'], isDark: boolean) =>
  StyleSheet.create({
    safe:   { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1 },
    hero: {
      alignItems: 'center',
      paddingTop: SPACING.xl,
      paddingBottom: SPACING.xxl,
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.sm,
    },
    heroTitle: { fontSize: TYPO.hero, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginTop: SPACING.sm },
    heroSub:   { fontSize: TYPO.body, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 20 },
    body: { padding: SPACING.xxl, gap: 0 },
    label: {
      fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.sm,
    },
    suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1.5, borderColor: colors.borderMed,
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.md, paddingVertical: 9,
      backgroundColor: colors.card,
    },
    chipText: { fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary },
    inputRow: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1.5, borderColor: colors.inputBorder,
      borderRadius: RADIUS.md, backgroundColor: colors.inputBg,
      paddingHorizontal: SPACING.md, height: 52,
    },
    atSign: { fontSize: TYPO.heading, color: colors.textSecondary, marginRight: 4 },
    input:  { flex: 1, fontSize: TYPO.subheading, color: colors.textPrimary },
    statusMsg: { fontSize: TYPO.caption, marginTop: 6, marginLeft: 2 },
    btn: {
      height: 54, backgroundColor: colors.primary,
      borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
      marginTop: SPACING.xl,
      shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    btnDisabled: { opacity: 0.4, shadowOpacity: 0 },
    btnText: { color: '#fff', fontSize: TYPO.subheading, fontWeight: '700' },
    hint: { fontSize: TYPO.caption, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.lg },
  });
