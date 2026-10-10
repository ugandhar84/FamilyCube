/**
 * HealthRecordsScreen — ground-up rebuild of mobile's Health & Records
 * screen, replacing the old version that rendered HealthTab.tsx (a
 * ScrollView child) as its list content. That nesting was the root cause
 * of a real stacking bug: HealthTab.tsx's own AddMedModal/AddVaxModal/
 * ScanReviewSheet/HealthFilterSheet were rendered from INSIDE HealthTab,
 * which itself lived inside THIS screen's ScrollView — so any
 * FullPageOverlay among them only ever escaped to the ScrollView's own
 * clip boundary, painting as a block UNDER this screen's header instead of
 * a true full-screen cover (live-reported with a screenshot).
 *
 * Fix, per the same pattern features/grocery/GroceryScreen.tsx already
 * uses: THIS top-level component owns every overlay-trigger boolean/value
 * (showMedModal/editMed/showVaxModal/editVax/showFilter/showPdfExport),
 * and renders every overlay-wrapped sub-screen as a direct sibling of its
 * OWN ScrollView — never nested inside another component that itself
 * lives inside a ScrollView.
 *
 * features/vault/tabs/HealthTab.tsx (and all its Supabase/business logic)
 * is completely untouched — Kiosk (KioskHealthTab.tsx/
 * KioskHealthAiWidget.tsx) keeps using it exactly as before. This screen
 * instead consumes the NEW, net-new features/vault/tabs/health/
 * useHealthRecords.ts hook, which holds the same logic extracted for
 * mobile's own use.
 *
 * Reachable the same two ways as before:
 * - As a FamilyScreen-owned FullPageOverlay via the '__overlay:health'
 *   sentinel (FamilyScreen.tsx already wraps this component in its own
 *   FullPageOverlay — so THIS component does not wrap itself in one; it's
 *   already a child of one).
 * - Via the legacy app/(tabs)/family-health.tsx route (thin re-export),
 *   which has no FullPageOverlay ancestor — falls back to router.back()
 *   when no onClose is supplied, same as before.
 *
 * Presentational list content is features/vault/tabs/health/
 * HealthFigmaList.tsx (pre-existing, sound, flat-Figma shell — kept as-is,
 * just now driven by useHealthRecords.ts's state instead of HealthTab's).
 */
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Pill, Syringe, FolderOpen, ScanLine, FileDown, Shield } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import FullPageOverlay from '@/components/FullPageOverlay';
import HealthFigmaList from './health/HealthFigmaList';
import HealthFilterScreen from './health/HealthFilterScreen';
import HealthPdfExportReview from './health/HealthPdfExportReview';
import AddMedModal from './health/AddMedModal';
import AddVaxModal from './health/AddVaxModal';
import ScanReviewSheet from './health/ScanReviewSheet';
import RecordsTabComp from './RecordsTab';
import { useHealthRecords } from './health/useHealthRecords';
import { shareVaccineRecordsPdf } from './health/vaxPdfExport';
import type { Medication, Vaccine } from './health/types';
import { showAlert } from '@/components/AppAlert';

type Segment = 'meds' | 'vax' | 'records';

const PAGE_BG   = '#F5F7FB';
const TITLE_CLR = '#172337';
const BODY_CLR  = '#657185';
const BLUE      = '#345DE3';
const LINK_BLUE = '#294FC7';
const BORDER    = '#DFE5EF';
const CARD_BG   = '#FFFFFF';

export default function HealthRecordsScreen({ hideHeader = false, onClose, initialMemberId }: {
  hideHeader?: boolean;
  // Present when reached via FamilyScreen's own FullPageOverlay — falls
  // back to router.back() for the legacy app/(tabs)/family-health.tsx
  // route, which has no FullPageOverlay ancestor of its own.
  onClose?: () => void;
  // Scopes the list to one family member on open — set once on mount, seeds
  // useHealthRecords' own medMemberFilter/vaxMemberFilter instead of the
  // normal "[] = all members" default. Used by the new person-picker
  // landing page (HealthPeoplePage.tsx) so tapping a person's card lands
  // directly on their own records instead of the whole family's list.
  initialMemberId?: string;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Segment>('meds');

  // kidView also covers teens and seniors/grandparents — all three only
  // ever see their OWN medications (matches HealthTab.tsx's identical
  // restriction, same live-reported history). Computed directly from the
  // family store BEFORE calling useHealthRecords, since the hook's own
  // `load()`/realtime subscription needs the real kidView value to scope
  // its query (kids/teens/seniors only ever load their own records).
  const { members: storeMembers, activeMemberId } = useFamilyStore();
  const storeActiveMember = storeMembers.find(m => m.id === activeMemberId) ?? storeMembers[0];
  const kidView = storeActiveMember?.role === 'kid' || storeActiveMember?.role === 'teen' || storeActiveMember?.role === 'senior';

  const hr = useHealthRecords({ kidView });
  const { members, activeMember, familyName } = hr;

  // Seed once on mount only — the member pill/Filters screen can still
  // change this afterward, same as any other initial-state seed.
  useEffect(() => {
    if (!initialMemberId) return;
    hr.setMedMemberFilter([initialMemberId]);
    hr.setVaxMemberFilter([initialMemberId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMemberId]);

  const familySurname = familyName?.replace(/^the\s+/i, '').replace(/\s+family$/i, '').trim();

  // ── Overlay-trigger state — ALL owned here, rendered as siblings of
  // this screen's own ScrollView below (never nested inside a child that's
  // itself inside a ScrollView) — see module header for the bug this fixes. ──
  const [showMedModal, setShowMedModal] = useState(false);
  const [showVaxModal, setShowVaxModal] = useState(false);
  const [editMed, setEditMed] = useState<Medication | null>(null);
  const [editVax, setEditVax] = useState<Vaccine | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showPdfExport, setShowPdfExport] = useState(false);
  // Documents page — RecordsTab.tsx's encrypted/AI-reviewed visit-record
  // storage, reached via the "Health documents" banner instead of a 3rd
  // segment tab (see that banner's own comment). Rendered as a true
  // sibling of this screen's own ScrollView, same containment rule as
  // every other overlay here.
  const [showDocuments, setShowDocuments] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const pageBg = isDark ? colors.background : PAGE_BG;

  const handleClose = () => { onClose ? onClose() : router.back(); };

  useEffect(() => {
    if (hideHeader) return;
    hideTabBar();
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => {
      showTabBar();
      useUIStore.getState().setFullBleedScreenActive(false);
    };
  }, [hideHeader]);

  useEffect(() => {
    useUIStore.getState().setHealthRecordsActiveSegment(
      tab === 'vax' ? 'immunizations' : 'health'
    );
  }, [tab]);

  // Shared FAB's "+" one-shot flag (same pattern TasksScreen.tsx/
  // MemoriesTab.tsx use) — opens Add medication/vaccine directly.
  const openHealthRecordsComposerRequested = useUIStore(s => s.openHealthRecordsComposerRequested);
  useEffect(() => {
    if (openHealthRecordsComposerRequested) {
      useUIStore.getState().setOpenHealthRecordsComposerRequested(false);
      if (kidView) return;
      if (tab === 'vax') setShowVaxModal(true); else setShowMedModal(true);
    }
  }, [openHealthRecordsComposerRequested, tab, kidView]);

  const openHealthScanRequested = useUIStore(s => s.openHealthScanRequested);
  const [showScanSheet, setShowScanSheet] = useState(false);
  const [scanMode, setScanMode] = useState<'rx' | 'vaccine'>('rx');
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    if (openHealthScanRequested) {
      useUIStore.getState().setOpenHealthScanRequested(undefined);
      if (kidView) return;
      setScanMode(openHealthScanRequested);
      setShowScanSheet(true);
    }
  }, [openHealthScanRequested, kidView]);

  const openHealthPdfExportRequested = useUIStore(s => s.openHealthPdfExportRequested);
  useEffect(() => {
    if (openHealthPdfExportRequested) {
      useUIStore.getState().setOpenHealthPdfExportRequested(false);
      if (kidView) return;
      setShowPdfExport(true);
    }
  }, [openHealthPdfExportRequested, kidView]);

  // Two segments only, per the mockup and live confirmation ("we suppose
  // to have 2 tabs only") — Records (RecordsTab.tsx, encrypted document/
  // AI-reviewed visit records) is a distinct feature from meds/vaccines
  // and is no longer reachable from this screen's segmented switch.
  const SEGMENTS: { key: Segment; label: string; Icon: any }[] = kidView
    ? [{ key: 'meds', label: 'Medications', Icon: Pill }]
    : [
        { key: 'meds', label: 'Medications', Icon: Pill },
        { key: 'vax',  label: 'Vaccines',    Icon: Syringe },
      ];

  // Honest ownership/visibility line — this app has no per-member consent
  // model (family_medications/family_vaccines are family-wide, RLS at the
  // family level), just the kidView restriction.
  const recordOwnerLine = kidView ? 'Your own health records' : 'Shared with your family';

  const primaryLabel = tab === 'vax' ? 'Add vaccine from document' : 'Add medication';
  const openComposer = () => {
    if (kidView) return;
    if (tab === 'vax') setShowVaxModal(true); else setShowMedModal(true);
  };
  const openScan = () => {
    if (kidView) return;
    setScanMode(tab === 'vax' ? 'vaccine' : 'rx');
    setShowScanSheet(true);
  };
  const onExportPdf = () => {
    if (kidView) return;
    setShowPdfExport(true);
  };

  const memberColor = (id: string) => hr.memberColor(id, colors);

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      {!hideHeader && (
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8, backgroundColor: pageBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: bodyC, textTransform: 'uppercase' }}>
              Family Cube{familySurname ? ` / ${familySurname}` : ''}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? bodyC : LINK_BLUE }}>
              {activeMember?.name ?? 'You'} · {kidView ? 'Your records' : 'Permitted review'}
            </Text>
          </View>
          <Pressable onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Family</Text>
          </Pressable>
          <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 4, lineHeight: 36 }}>
            Health records
          </Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 24, gap: 14 }}>

        {/* ── Health documents banner ── */}
        {!kidView && (
          <TouchableOpacity onPress={() => setShowDocuments(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: cardBg, borderRadius: 16, borderWidth: 1, borderColor: border, padding: 16 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: BLUE + '15',
              alignItems: 'center', justifyContent: 'center' }}>
              <FolderOpen size={22} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Health documents</Text>
              <Text style={{ fontSize: 12, fontWeight: '500', color: bodyC, marginTop: 2 }}>
                Visit summaries, lab results and scanned records — AI-reviewed, privately stored
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Medications / Vaccines tab switcher ── */}
        {SEGMENTS.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {SEGMENTS.map(seg => {
              const active = tab === seg.key;
              return (
                <TouchableOpacity key={seg.key} onPress={() => setTab(seg.key)} activeOpacity={0.85}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    borderRadius: 12, paddingVertical: 10,
                    backgroundColor: active ? BLUE : cardBg,
                    borderWidth: 1, borderColor: active ? BLUE : border,
                  }}>
                  <seg.Icon size={14} color={active ? '#FFFFFF' : bodyC} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : bodyC }}>
                    {seg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {(
          <HealthFigmaList
            colors={colors} isDark={isDark} kidView={kidView}
            meds={hr.meds} vaxes={hr.vaxes}
            filteredMeds={hr.filteredMeds} filteredVaxes={hr.filteredVaxes}
            healthTab={tab === 'vax' ? 'vax' : 'meds'}
            medSearch={hr.medSearch} setMedSearch={hr.setMedSearch}
            vaxSearch={hr.vaxSearch} setVaxSearch={hr.setVaxSearch}
            openFilterSheet={() => { hr.openFilterSheet(); setShowFilter(true); }}
            medMemberFilter={hr.medMemberFilter} vaxMemberFilter={hr.vaxMemberFilter}
            members={members}
            familyName={familyName}
            memberName={hr.memberName} memberColor={memberColor}
            isOverdue={hr.isOverdue}
            expandedId={expandedId} setExpandedId={setExpandedId}
            markTaken={hr.markTaken} toggleMedActive={hr.toggleMedActive}
            deleteMed={hr.deleteMed} deleteMedsBulk={hr.deleteMedsBulk}
            toggleVax={hr.toggleVax} deleteVax={hr.deleteVax} deleteVaxesBulk={hr.deleteVaxesBulk}
            onEditMed={setEditMed} onEditVax={setEditVax}
            load={hr.load}
            recordOwnerLine={recordOwnerLine}
          />
        )}

        {!kidView && tab !== 'records' && (
          <View style={{ gap: 10, marginTop: 4 }}>
            <TouchableOpacity onPress={openComposer}
              style={{ backgroundColor: BLUE, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{primaryLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openScan}
              style={{ borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ScanLine size={15} color={isDark ? BLUE : LINK_BLUE} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>{tab === 'vax' ? 'Scan vaccine record →' : 'Scan prescription →'}</Text>
              </View>
            </TouchableOpacity>
            {tab === 'vax' && (
              <TouchableOpacity onPress={onExportPdf}
                style={{ borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <FileDown size={15} color={isDark ? BLUE : LINK_BLUE} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>Export vaccine PDF →</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ backgroundColor: colors.tealLight, borderRadius: 16, padding: 16, marginTop: 4, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Shield size={13} color={colors.teal} />
            <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: colors.teal, textTransform: 'uppercase' }}>
              Private · Family Cube
            </Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? colors.textPrimary : '#1D3B2E', marginTop: 2 }}>
            {recordOwnerLine}
          </Text>
          <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : '#3E5A4D', marginTop: 1 }}>
            {kidView
              ? 'Other family members cannot see this from your device.'
              : 'Kids, teens and seniors only ever see their own medications and vaccines — never the full family list.'}
          </Text>
        </View>
      </ScrollView>

      {/* ── Every overlay below is a direct sibling of this screen's own
          ScrollView — none is nested inside HealthFigmaList or any other
          child that itself lives inside a ScrollView. This is the exact
          fix for the stacking bug described in the module header. ── */}

      <AddMedModal
        visible={showMedModal || !!editMed}
        onClose={() => { setShowMedModal(false); setEditMed(null); }}
        onSave={hr.addMed}
        members={members}
        colors={colors}
        isDark={isDark}
        lockedMemberId={initialMemberId}
        editing={editMed ? {
          medId: editMed.id, memberId: editMed.member_id, refillDate: editMed.refill_date,
          form: {
            name: editMed.name, dosage: editMed.dosage, dosage_unit: editMed.dosage_unit,
            frequency: editMed.frequency, category: editMed.category,
            prescribing_doctor: editMed.prescribing_doctor ?? '', pharmacy: editMed.pharmacy ?? '',
            refill_date: editMed.refill_date ?? '', pills_remaining: editMed.pills_remaining != null ? String(editMed.pills_remaining) : '',
            instructions: editMed.instructions ?? '', notes: editMed.notes ?? '',
            escalation_enabled: editMed.escalation_enabled, escalation_after_min: String(editMed.escalation_after_min),
            start_date: editMed.start_date ?? '',
            end_date: editMed.end_date ?? '',
            reminder_times: editMed.frequency_times?.length ? editMed.frequency_times : ['08:00'],
            alert_call: false,
            source_note: editMed.source_note ?? '',
            dosage_count: 1, frequency_days: [],
          },
        } : undefined}
      />

      <AddVaxModal
        visible={showVaxModal || !!editVax}
        onClose={() => { setShowVaxModal(false); setEditVax(null); }}
        onSave={hr.addVax}
        members={members}
        colors={colors}
        isDark={isDark}
        lockedMemberId={initialMemberId}
        editing={editVax ? {
          vaxId: editVax.id, memberId: editVax.member_id,
          form: {
            title: editVax.title, vaccine_type: editVax.vaccine_type ?? '', date: editVax.date,
            next_due_date: editVax.next_due_date ?? '',
            series_current: String(editVax.series_current), series_total: String(editVax.series_total),
            administered_by: editVax.administered_by ?? '', location: editVax.location ?? '',
            notes: editVax.notes ?? '',
          },
        } : undefined}
      />

      {/* ── Health documents — RecordsTab.tsx's existing encrypted/AI-
          reviewed visit-record storage, wrapped in a minimal pinned Figma
          header for now (full flat-token reskin of RecordsTab.tsx itself,
          matching the "Bring in a document"/"Hide private details"/"Check
          the findings" mockup, is a larger follow-up task). ── */}
      <FullPageOverlay visible={showDocuments} onDismiss={() => setShowDocuments(false)} zIndex={49}>
        <View style={{ flex: 1, backgroundColor: pageBg }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8 }}>
            <TouchableOpacity onPress={() => setShowDocuments(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Health records</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 10, lineHeight: 36 }}>
              Health documents
            </Text>
          </View>
          <RecordsTabComp colors={colors} isDark={isDark} />
        </View>
      </FullPageOverlay>

      <FullPageOverlay visible={showFilter} onDismiss={() => setShowFilter(false)} zIndex={50}>
        <HealthFilterScreen
          colors={colors} isDark={isDark} members={members}
          healthTab={tab === 'vax' ? 'vax' : 'meds'}
          draftMed={hr.draftMed} setDraftMed={hr.setDraftMed}
          draftVax={hr.draftVax} setDraftVax={hr.setDraftVax}
          resetFilters={hr.resetFilters}
          applyFilters={hr.applyFilters}
          meds={hr.meds} vaxes={hr.vaxes}
          memberName={hr.memberName}
          onClose={() => setShowFilter(false)}
          lockedMemberId={initialMemberId}
        />
      </FullPageOverlay>

      <FullPageOverlay visible={showPdfExport} onDismiss={() => setShowPdfExport(false)} zIndex={51}>
        <HealthPdfExportReview
          visible={showPdfExport}
          onClose={() => setShowPdfExport(false)}
          vaxes={hr.vaxes}
          familyName={familyName}
          memberName={hr.memberName}
          colors={colors} isDark={isDark}
          onGenerate={async (memberIds) => {
            try {
              const byMember = new Map<string, Vaccine[]>();
              for (const v of hr.vaxes) {
                if (!memberIds.includes(v.member_id)) continue;
                const list = byMember.get(v.member_id) ?? [];
                list.push(v);
                byMember.set(v.member_id, list);
              }
              await shareVaccineRecordsPdf({
                familyName: familyName ?? 'Family Cube',
                members: Array.from(byMember.entries()).map(([memberId, vaccines]) => ({
                  memberId, memberName: hr.memberName(memberId), vaccines,
                })),
              });
            } catch (e: any) {
              showAlert('Could not share PDF', e?.message ?? 'Something went wrong generating the file.');
            }
          }}
        />
      </FullPageOverlay>

      {/* Scan Rx / Vaccine — still its own internal Modal (ScanReviewSheet
          owns a camera/redaction/AI-review flow with real gesture/ViewShot
          state); left exactly as-is per the task's risk guidance. */}
      <ScanReviewSheet
        visible={showScanSheet}
        scanMode={scanMode}
        activeMemberId={activeMember?.id ?? ''}
        members={members}
        colors={colors}
        isDark={isDark}
        onClose={() => setShowScanSheet(false)}
        onSaveMed={hr.saveScannedMed}
        onSaveVax={hr.saveScannedVax}
        onScanningChange={setScanning}
      />
    </View>
  );
}
