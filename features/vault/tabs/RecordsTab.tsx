import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, ScrollView, Alert,
} from 'react-native';
import {
  FolderOpen, Search, SlidersHorizontal, Lock, X, AlertCircle, RefreshCw,
  Download, CheckSquare,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { SCard, CardHeader, AddBtn, EmptyState, BRAND } from './shared';
import RecordCard    from '../records/RecordCard';
import AiReviewSheet from '../records/AiReviewSheet';
import AddRecordModal from '../records/AddRecordModal';
import { encryptAnalysis, decryptAnalysis, isEncryptedBlob } from '../records/recordsCrypto';
import { downloadSingle, downloadZip } from '../records/recordsDownload';
import { MedRecord, AiAnalysis, RecordForm, TAGS, memberColor } from '../records/types';
import type * as DocumentPicker from 'expo-document-picker';

// ─── RecordsTab ───────────────────────────────────────────────────────────────

export default function RecordsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = (activeMember as any)?.familyId ?? (members[0] as any)?.familyId ?? '';

  // ── List state ──────────────────────────────────────────────────────────────
  const [records,      setRecords]      = useState<MedRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [search,       setSearch]       = useState('');
  const [filterTag,    setFilterTag]    = useState<string>('all');
  const [filterMember, setFilterMember] = useState<string>('all');
  const [showFilter,   setShowFilter]   = useState(false);

  // ── Modal / action state ─────────────────────────────────────────────────────
  const [showAdd,     setShowAdd]     = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [pending,     setPending]     = useState<Record<string, AiAnalysis>>({});
  const [reviewRec,   setReviewRec]   = useState<MedRecord | null>(null);
  const [approving,   setApproving]   = useState(false);
  // Selection / download
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const selectable = selectedIds.size > 0;

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!familyId || familyId === 'family-1') return;
    setLoading(true); setLoadError(null);
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('family_id', familyId)
      .order('record_date', { ascending: false });
    if (error) {
      setLoadError('Could not load records. Tap to retry.');
    } else {
      // Decrypt any encrypted analysis blobs
      const rows = await Promise.all(
        (data ?? []).map(async (row: any) => {
          if (row.ai_analysis_json && isEncryptedBlob(row.ai_analysis_json)) {
            const dec = await decryptAnalysis<AiAnalysis>(familyId, row.ai_analysis_json);
            return { ...row, ai_analysis_json: dec };
          }
          return row;
        }),
      );
      setRecords(rows as MedRecord[]);
    }
    setLoading(false);
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  // ── Realtime ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!familyId || familyId === 'family-1') return;
    const ch = supabase.channel(`medrec-${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records',
        filter: `family_id=eq.${familyId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [familyId, load]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const memberName  = (id: string) => members.find(m => m.id === id)?.name ?? 'Unknown';
  const memberIndex = (id: string) => members.findIndex(m => m.id === id);

  const filtered = useMemo(() => {
    let list = records;
    if (filterMember !== 'all') list = list.filter(r => r.member_id === filterMember);
    if (filterTag    !== 'all') list = list.filter(r => r.tag === filterTag);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.ai_summary?.toLowerCase().includes(q) ||
        (r.ai_analysis_json as any)?.summary?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [records, filterMember, filterTag, search]);

  const activeFilters = (filterTag !== 'all' ? 1 : 0) + (filterMember !== 'all' ? 1 : 0);

  // ── Add ──────────────────────────────────────────────────────────────────────
  const addRecord = async (
    memberId: string,
    form: RecordForm,
    file: DocumentPicker.DocumentPickerAsset | null,
  ) => {
    let file_path: string | null = null;
    let file_name: string | null = null;
    let file_size: number | null = null;

    if (file) {
      const ext  = file.name.split('.').pop() ?? 'bin';
      const path = `${familyId}/${memberId}/${Date.now()}.${ext}`;
      const blob = await fetch(file.uri).then(r => r.blob());
      const { data: up, error: upErr } = await supabase.storage
        .from('medical-records')
        .upload(path, blob, { contentType: file.mimeType ?? 'application/octet-stream', upsert: false });
      if (!upErr && up) { file_path = up.path; file_name = file.name; file_size = file.size ?? null; }
    }

    const { data } = await supabase.from('medical_records').insert({
      family_id: familyId, member_id: memberId,
      uploaded_by: activeMember?.id ?? null,
      title: form.title.trim(), tag: form.tag,
      record_date: form.record_date, notes: form.notes.trim() || null,
      file_path, file_name, file_size,
      ai_analyzed: false, ai_tags: [],
    }).select().single();

    if (data) setRecords(prev => [data as MedRecord, ...prev]);
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const deleteRecord = (rec: MedRecord) => {
    Alert.alert('Remove record', `Remove "${rec.title}"? This permanently deletes the file from your vault.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        if (rec.file_path) await supabase.storage.from('medical-records').remove([rec.file_path]);
        await supabase.from('medical_records').delete().eq('id', rec.id);
        setRecords(prev => prev.filter(r => r.id !== rec.id));
        setPending(prev => { const c = { ...prev }; delete c[rec.id]; return c; });
      }},
    ]);
  };

  // ── AI Analyze ────────────────────────────────────────────────────────────────
  const analyzeRecord = async (rec: MedRecord) => {
    if (rec.ai_analyzed) return;
    setAnalyzingId(rec.id);
    try {
      const { data: fnData, error } = await supabase.functions.invoke('analyze-medical-record', {
        body: { record_id: rec.id, member_name: memberName(rec.member_id) },
      });
      if (error) throw new Error(error.message);
      if (fnData?.error) throw new Error(fnData.error);
      const analysis: AiAnalysis = fnData?.analysis;
      if (!analysis?.summary) throw new Error('Invalid AI response');
      setPending(prev => ({ ...prev, [rec.id]: analysis }));
      // Auto-open the review sheet
      setReviewRec(rec);
    } catch (err: any) {
      Alert.alert('Analysis failed', err.message ?? 'Could not analyze. Please try again.');
    } finally {
      setAnalyzingId(null);
    }
  };

  // ── Approve: encrypt then store ───────────────────────────────────────────────
  const approveAnalysis = async () => {
    if (!reviewRec) return;
    const analysis = pending[reviewRec.id];
    if (!analysis) return;
    setApproving(true);
    try {
      // Encrypt the full analysis JSON with the family's derived key
      const encryptedBlob = await encryptAnalysis(familyId, analysis);

      const { error } = await supabase.from('medical_records').update({
        ai_summary:       analysis.summary,
        ai_tags:          analysis.tags ?? [],
        ai_analysis_json: encryptedBlob,   // stored as AES-GCM ciphertext
        ai_analyzed:      true,
      }).eq('id', reviewRec.id);

      if (error) throw new Error(error.message);

      // Update local state with the decrypted object (display stays readable)
      setRecords(prev => prev.map(r =>
        r.id === reviewRec.id
          ? { ...r, ai_summary: analysis.summary, ai_tags: analysis.tags ?? [],
              ai_analysis_json: analysis, ai_analyzed: true }
          : r
      ));
      setPending(prev => { const c = { ...prev }; delete c[reviewRec.id]; return c; });
      setReviewRec(null);
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Could not save the analysis. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  const dismissReview = () => {
    if (reviewRec) {
      setPending(prev => { const c = { ...prev }; delete c[reviewRec.id]; return c; });
    }
    setReviewRec(null);
  };

  // ── Selection / download ──────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const clearSelection = () => setSelectedIds(new Set());

  const handleDownload = async () => {
    const toDownload = filtered.filter(r => selectedIds.has(r.id) && r.file_path);
    if (toDownload.length === 0) {
      Alert.alert('No files', 'None of the selected records have attached files.');
      return;
    }
    setDownloading(true);
    try {
      if (toDownload.length === 1) {
        await downloadSingle(toDownload[0]);
      } else {
        await downloadZip(toDownload);
      }
      clearSelection();
    } catch (err: any) {
      Alert.alert('Download failed', err.message ?? 'Could not download the file(s). Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────────
  if (!familyId || familyId === 'family-1') return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={FolderOpen} iconColor={BRAND.teal} title="Medical Records" colors={colors} />
      <EmptyState Icon={Lock} label="Sign in and join a family vault to access medical records" colors={colors} />
    </SCard>
  );

  if (loading) return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={FolderOpen} iconColor={BRAND.teal} title="Medical Records" colors={colors} />
      <ActivityIndicator color={BRAND.teal} style={{ marginVertical: 24 }} />
    </SCard>
  );

  if (loadError) return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={FolderOpen} iconColor={BRAND.teal} title="Medical Records" colors={colors} />
      <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
        <AlertCircle size={28} color={BRAND.rose} />
        <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>{loadError}</Text>
        <TouchableOpacity onPress={load}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.teal + '15',
            borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
          <RefreshCw size={13} color={BRAND.teal} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND.teal }}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SCard>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <SCard colors={colors} isDark={isDark}>
        <CardHeader Icon={FolderOpen} iconColor={BRAND.teal} title="Medical Records"
          badge={`${records.length}`} badgeColor={BRAND.teal} colors={colors} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginBottom: 2 }}>
          <Lock size={10} color={BRAND.teal} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.teal }}>
            AES-256 encrypted · per-member vault · analysis locked with family key
          </Text>
        </View>

        {/* Download / selection bar — appears when records are selected */}
        {selectable && (
          <View style={[r.downloadBar, { backgroundColor: BRAND.teal + '15', borderColor: BRAND.teal + '40' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CheckSquare size={14} color={BRAND.teal} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.teal }}>
                {selectedIds.size} selected
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={clearSelection}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                  borderWidth: 1, borderColor: BRAND.teal + '60' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.teal }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDownload} disabled={downloading}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
                  backgroundColor: BRAND.teal, opacity: downloading ? 0.65 : 1 }}>
                {downloading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Download size={13} color="#fff" />}
                <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>
                  {downloading ? 'Downloading…'
                    : selectedIds.size === 1 ? 'Download file'
                    : `Download ZIP (${selectedIds.size})`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Search + filter */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 4 }}>
          <View style={[r.searchBar, { backgroundColor: isDark ? colors.surface : '#F1F5F9',
            borderColor: colors.border, flex: 1 }]}>
            <Search size={14} color={colors.textTertiary} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search records…"
              placeholderTextColor={colors.textTertiary}
              style={{ flex: 1, fontSize: 13, color: colors.textPrimary, paddingVertical: 0 }} />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={13} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => setShowFilter(f => !f)}
            style={[r.filterBtn, {
              borderColor: activeFilters > 0 ? BRAND.teal : colors.border,
              backgroundColor: activeFilters > 0 ? BRAND.teal + '15' : (isDark ? colors.surface : '#F1F5F9'),
            }]}>
            <SlidersHorizontal size={15} color={activeFilters > 0 ? BRAND.teal : colors.textTertiary} />
            {activeFilters > 0 && (
              <View style={r.filterBadge}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff' }}>{activeFilters}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Filter panel */}
        {showFilter && (
          <View style={[r.filterPanel, { backgroundColor: isDark ? colors.surface : '#F8F5FF', borderColor: colors.border }]}>
            <Text style={[r.filterLabel, { color: colors.textTertiary }]}>MEMBER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 10 }}>
                {[{ id: 'all', name: 'All' }, ...members].map((m, i) => {
                  const sel = filterMember === m.id;
                  const c   = m.id === 'all' ? '#64748B' : memberColor(i - 1);
                  return (
                    <TouchableOpacity key={m.id} onPress={() => setFilterMember(m.id)}
                      style={[r.chip, { backgroundColor: sel ? c + '20' : 'transparent', borderColor: sel ? c : colors.border }]}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: sel ? c : colors.textTertiary }}>
                        {m.name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <Text style={[r.filterLabel, { color: colors.textTertiary }]}>CATEGORY</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {[{ id: 'all', label: 'All', color: '#64748B' }, ...TAGS].map(t => {
                const sel = filterTag === t.id;
                return (
                  <TouchableOpacity key={t.id} onPress={() => setFilterTag(t.id)}
                    style={[r.chip, { backgroundColor: sel ? t.color + '20' : 'transparent', borderColor: sel ? t.color : colors.border }]}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: sel ? t.color : colors.textTertiary }}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* List */}
        {filtered.length === 0 ? (
          <EmptyState Icon={FolderOpen}
            label={search || activeFilters > 0
              ? 'No records match your filters'
              : 'No medical records yet — upload your first document'}
            colors={colors} />
        ) : (
          <View style={{ gap: 10, marginTop: 12 }}>
            {filtered.map(rec => (
              <RecordCard
                key={rec.id}
                rec={rec}
                memberName={memberName(rec.member_id)}
                memberIdx={memberIndex(rec.member_id)}
                onDelete={() => deleteRecord(rec)}
                onAnalyze={() => analyzeRecord(rec)}
                onOpenReview={() => setReviewRec(rec)}
                analyzing={analyzingId === rec.id}
                hasPending={!!pending[rec.id]}
                selectable={selectable}
                selected={selectedIds.has(rec.id)}
                onToggleSelect={() => toggleSelect(rec.id)}
                colors={colors}
                isDark={isDark}
              />
            ))}
          </View>
        )}

        <AddBtn label="Upload Record" onPress={() => setShowAdd(true)} color={BRAND.teal} />
      </SCard>

      {/* Upload modal */}
      <AddRecordModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={addRecord}
        colors={colors} isDark={isDark}
        members={members} activeMemberId={activeMemberId}
      />

      {/* AI review sheet */}
      {reviewRec && pending[reviewRec.id] && (
        <AiReviewSheet
          rec={reviewRec}
          analysis={pending[reviewRec.id]}
          approving={approving}
          onApprove={approveAnalysis}
          onDismiss={dismissReview}
        />
      )}
    </>
  );
}

const r = StyleSheet.create({
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5,
                 paddingHorizontal: 12, paddingVertical: 9 },
  filterBtn:   { width: 42, height: 42, borderRadius: 12, borderWidth: 1.5, alignItems: 'center',
                 justifyContent: 'center', position: 'relative' },
  filterBadge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8,
                 backgroundColor: BRAND.teal, alignItems: 'center', justifyContent: 'center' },
  filterPanel: { borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 8 },
  filterLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginBottom: 7 },
  chip:        { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5 },
  downloadBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10,
                 marginTop: 8 },
});
