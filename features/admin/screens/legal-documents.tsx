// Admin legal-documents screen — edit the live Terms of Service text (and
// any future doc keyed by slug) at runtime instead of it being hardcoded
// in app source [live-requested: "i want this terms to be in the DB.. not
// in the UI itself so i can modify whenever is required"]. Every real
// Terms render site (TermsScreen.tsx's onboarding accept-flow,
// TermsViewerScreen.tsx, ProfileSettingsScreen's TermsContentBody) reads
// this same legal_documents row via useTermsContent(), so a save here is
// immediately live everywhere.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { getAllLegalDocuments, updateLegalDocument, type LegalDocumentRow } from '@/lib/db/admin';
import { showAlert } from '@/components/AppAlert';

export default function LegalDocumentsScreen() {
  const { colors } = useTheme();
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const [docs, setDocs] = useState<LegalDocumentRow[] | null>(null);
  const [selected, setSelected] = useState<LegalDocumentRow | null>(null);
  const [contentDraft, setContentDraft] = useState('');
  const [versionDraft, setVersionDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await getAllLegalDocuments();
      setDocs(rows);
    } catch (e: any) {
      showAlert("Couldn't load legal documents", e?.message ?? 'Something went wrong.');
      setDocs([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEditor = (doc: LegalDocumentRow) => {
    setSelected(doc);
    setContentDraft(doc.content);
    setVersionDraft(doc.version);
  };

  const dirty = selected != null && (contentDraft !== selected.content || versionDraft !== selected.version);

  const onSave = async () => {
    if (!selected || saving) return;
    if (!contentDraft.trim()) {
      showAlert('Content required', 'The document body cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateLegalDocument(
        selected.slug,
        { content: contentDraft, version: versionDraft.trim() || selected.version },
        activeMemberId ?? null,
      );
      setDocs(prev => (prev ?? []).map(d => d.slug === updated.slug ? updated : d));
      setSelected(updated);
      showAlert('Saved', `${updated.title} is now live for every user.`);
    } catch (e: any) {
      showAlert("Couldn't save", e?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (selected) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{selected.title}</Text>
            <TouchableOpacity onPress={onSave} disabled={!dirty || saving}>
              {saving ? <ActivityIndicator size="small" color={colors.primary} /> : (
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: dirty ? colors.primary : colors.textTertiary }}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Version
              </Text>
              <TextInput
                value={versionDraft}
                onChangeText={setVersionDraft}
                placeholder="e.g. 2.2"
                placeholderTextColor={colors.textTertiary}
                style={{
                  borderWidth: 1.5, borderColor: colors.border, borderRadius: RADIUS.md,
                  paddingHorizontal: 14, paddingVertical: 10, color: colors.textPrimary, fontSize: TYPO.body,
                  backgroundColor: colors.card,
                }}
              />
            </View>

            <View>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Document body
              </Text>
              <TextInput
                value={contentDraft}
                onChangeText={setContentDraft}
                multiline
                textAlignVertical="top"
                style={{
                  borderWidth: 1.5, borderColor: colors.border, borderRadius: RADIUS.md,
                  paddingHorizontal: 14, paddingVertical: 12, color: colors.textPrimary, fontSize: TYPO.caption,
                  backgroundColor: colors.card, minHeight: 480, lineHeight: 19,
                }}
              />
            </View>

            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>
              Last updated {new Date(selected.updated_at).toLocaleString()}. Saving here goes live for every user immediately — there's no separate publish step.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {docs === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : docs.length === 0 ? (
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginTop: 24 }}>
            No legal documents found.
          </Text>
        ) : docs.map(doc => (
          <TouchableOpacity
            key={doc.slug}
            onPress={() => openEditor(doc)}
            style={{
              borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border,
              backgroundColor: colors.card, padding: 14, marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{doc.title}</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 4 }}>
              v{doc.version} · updated {new Date(doc.updated_at).toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
