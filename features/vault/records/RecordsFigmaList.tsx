/**
 * RecordsFigmaList — flat "Figma" presentational reskin of the Health
 * Documents list, matching HealthFigmaList.tsx's exact established pattern
 * (PAGE_BG/TITLE_CLR/BODY_CLR/BLUE/LINK_BLUE/BORDER flat tokens, 22px-radius
 * white "content group" card, row-based entries with icon + title +
 * subtitle + "View record →" link, search bar, filter pill, member filter,
 * teal privacy footer). Replaces RecordsTab.tsx's old StyleSheet-based
 * glass/card chrome (RecordCard.tsx) for the list itself — every real
 * feature (search, category/member filter via RecordsFilterScreen,
 * download/export via recordsDownload.ts, delete, select mode, analyze)
 * keeps working through the exact same handlers RecordsTab.tsx already
 * owns; this component owns no business logic of its own.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import {
  Search, SlidersHorizontal, X, ChevronRight, ChevronUp, Lock, Sparkles,
  CheckSquare, Square, Download, Trash2, FileX, FolderOpen, Shield, FileText, Calendar, AlertCircle, RotateCcw,
} from 'lucide-react-native';
import { MemberAvatar } from '../tabs/shared';
import { fmtDate } from '@/lib/dates';
import { MedRecord, TAG_MAP, URGENCY_META, memberColor, fmtSize } from './types';
import { GEMINI } from '@/constants/geminiRhythm';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception) — imported from
// the shared module instead of redeclared locally
// [live-requested: "make modularize for simplicity"].
const PAGE_BG   = GEMINI.canvas;
const TITLE_CLR = GEMINI.titleColor;
const BODY_CLR  = GEMINI.bodyColor;
const BLUE      = GEMINI.blue;
const LINK_BLUE = GEMINI.linkBlue;
const BORDER    = GEMINI.border;
const CARD_BG   = GEMINI.cardBg;

export default function RecordsFigmaList({
  colors, isDark,
  records, filtered,
  search, setSearch,
  activeFilters, openFilterScreen,
  memberName, memberIndex,
  analyzingId, pending, notMedical, analyzeErrors,
  onAnalyze, onOpenReview, onDelete, onDownloadSingle,
  selectedIds, selectable, onToggleSelect, clearSelection,
  downloading, onDownload,
}: {
  colors: any; isDark: boolean;
  records: MedRecord[]; filtered: MedRecord[];
  search: string; setSearch: (v: string) => void;
  activeFilters: number; openFilterScreen: () => void;
  memberName: (id: string) => string; memberIndex: (id: string) => number;
  analyzingId: string | null;
  pending: Record<string, any>; notMedical: Record<string, string>; analyzeErrors: Record<string, string>;
  onAnalyze: (rec: MedRecord) => void;
  onOpenReview: (rec: MedRecord) => void;
  onDelete: (rec: MedRecord) => void;
  onDownloadSingle: (rec: MedRecord) => void;
  selectedIds: Set<string>; selectable: boolean;
  onToggleSelect: (id: string) => void; clearSelection: () => void;
  downloading: boolean; onDownload: () => void;
}) {
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  // Expand-in-place "View record" — same interaction model
  // HealthFigmaList.tsx's MedRow uses (tap toggles an expanded detail
  // section in place) rather than a dead link. A record has no separate
  // edit screen in the real app today (AddRecordModal.tsx only creates —
  // it has no `editing` prop at all, verified against its source), so
  // "View record" genuinely means "see this record's full detail," not
  // "edit it." If a record IS still pending AI review, tapping instead
  // opens that real review screen, since that's the more useful action.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function RecordRow({ rec, isLast }: { rec: MedRecord; isLast: boolean }) {
    const tag = TAG_MAP[rec.tag] ?? TAG_MAP.other;
    const mColor = memberColor(memberIndex(rec.member_id));
    const hasPending = !!pending[rec.id];
    const urgency = (rec.ai_analysis_json as any)?.urgency ?? 'routine';
    const urgMeta = URGENCY_META[urgency as keyof typeof URGENCY_META];
    const isSelected = selectedIds.has(rec.id);
    const notMedMsg = notMedical[rec.id];
    const analyzeErr = analyzeErrors[rec.id];
    const expanded = expandedId === rec.id;

    // rec.title is a real DB column distinct from the uploaded filename —
    // addRecord() always sets it from the form's title (falling back to
    // the stripped filename only when no title was typed, e.g. the new
    // Screen A flow when the user didn't rename it). Shown as-is; no
    // filename is substituted here by mistake.
    const subtitle = [
      fmtDate(rec.record_date),
      rec.file_size != null ? fmtSize(rec.file_size) : null,
    ].filter(Boolean).join(' · ');

    const onRowTap = () => {
      if (hasPending && !rec.ai_analyzed) { onOpenReview(rec); return; }
      setExpandedId(expanded ? null : rec.id);
    };

    return (
      <View style={{ borderTopWidth: isLast ? 0 : 1, borderTopColor: border, paddingTop: isLast ? 0 : 12, marginTop: isLast ? 0 : 12 }}>
        <TouchableOpacity
          onPress={() => selectable ? onToggleSelect(rec.id) : onRowTap()}
          onLongPress={() => onToggleSelect(rec.id)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            {selectable ? (
              <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                {isSelected ? <CheckSquare size={18} color={BLUE} /> : <Square size={18} color={bodyC} />}
              </View>
            ) : (
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tag.color + '18',
                alignItems: 'center', justifyContent: 'center' }}>
                <tag.Icon size={15} color={tag.color} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: titleC, flex: 1 }} numberOfLines={1}>{rec.title}</Text>
                {hasPending && !rec.ai_analyzed && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber }} />
                )}
                {rec.ai_analyzed && urgency !== 'routine' && (
                  <View style={{ backgroundColor: urgMeta.color + '18', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: urgMeta.color }}>{urgMeta.label}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 2 }}>{subtitle}</Text>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>{tag.label}</Text>

              {!selectable && (
                <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: LINK_BLUE }}>
                    {hasPending && !rec.ai_analyzed ? 'Review AI findings' : 'View record'}
                  </Text>
                  {expanded && !(hasPending && !rec.ai_analyzed)
                    ? <ChevronUp size={13} color={LINK_BLUE} />
                    : <ChevronRight size={13} color={LINK_BLUE} />}
                </View>
              )}
            </View>
            {!selectable && <MemberAvatar name={memberName(rec.member_id)} color={mColor} size={26} />}
          </View>
        </TouchableOpacity>

        {/* Expanded detail — file, notes, AI summary. Real "view this
            record" destination, not a dead link. */}
        {expanded && !selectable && (
          <View style={{ marginTop: 10, gap: 8, paddingTop: 10, borderTopWidth: 1, borderColor: border }}>
            {rec.file_name && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10,
                backgroundColor: isDark ? colors.surface : '#F1F5F9', padding: 10 }}>
                <FileText size={13} color={colors.teal} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: titleC, flex: 1 }} numberOfLines={1}>{rec.file_name}</Text>
                <Lock size={11} color={colors.teal} />
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Calendar size={12} color={bodyC} />
              <Text style={{ fontSize: 12, color: bodyC }}>Record date: {fmtDate(rec.record_date)}</Text>
            </View>
            {rec.notes ? (
              <Text style={{ fontSize: 12, color: titleC, lineHeight: 17 }}>{rec.notes}</Text>
            ) : null}
            {rec.ai_analyzed && rec.ai_summary && (
              <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.teal + '35', backgroundColor: colors.teal + '0F', padding: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.teal, letterSpacing: 0.4 }}>AI SUMMARY</Text>
                <Text style={{ fontSize: 12, color: titleC, marginTop: 3, lineHeight: 17 }}>{rec.ai_summary}</Text>
              </View>
            )}
          </View>
        )}

        {/* Inline action row — Analyze / review-pending / not-medical,
            same handlers as before, flat chrome. */}
        {!selectable && (
          <View style={{ marginTop: 10, gap: 8 }}>
            {!rec.file_name && !rec.file_path && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 10, borderWidth: 1,
                borderColor: colors.amber + '50', backgroundColor: colors.amber + '10', padding: 10 }}>
                <FileX size={13} color={colors.amber} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 12, color: titleC, flex: 1, lineHeight: 16 }}>
                  No file is attached to this record — AI analysis works best with a document attached.
                </Text>
              </View>
            )}
            {hasPending && !rec.ai_analyzed && (
              <TouchableOpacity onPress={() => onOpenReview(rec)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10,
                  borderWidth: 1, borderColor: colors.amber + '60', backgroundColor: colors.amber + '12',
                  paddingHorizontal: 12, paddingVertical: 9 }}>
                <Sparkles size={13} color={colors.amber} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.amber, flex: 1 }}>
                  AI findings ready — tap to review
                </Text>
                <ChevronRight size={13} color={colors.amber} />
              </TouchableOpacity>
            )}
            {notMedMsg && !rec.ai_analyzed && !hasPending && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 10, borderWidth: 1,
                borderColor: colors.amber + '50', backgroundColor: colors.amber + '10', padding: 10 }}>
                <FileX size={13} color={colors.amber} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 12, color: titleC, flex: 1, lineHeight: 16 }}>{notMedMsg}</Text>
              </View>
            )}
            {analyzeErr && !rec.ai_analyzed && !hasPending && (
              <TouchableOpacity onPress={() => onAnalyze(rec)} disabled={analyzingId === rec.id}
                style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 10, borderWidth: 1,
                  borderColor: colors.danger + '50', backgroundColor: colors.danger + '10', padding: 10 }}>
                <AlertCircle size={13} color={colors.danger} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 12, color: colors.danger, flex: 1, lineHeight: 16 }}>{analyzeErr}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <RotateCcw size={11} color={colors.danger} />
                  <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '600' }}>Retry</Text>
                </View>
              </TouchableOpacity>
            )}
            {!rec.ai_analyzed && !hasPending && !notMedMsg && (
              <TouchableOpacity onPress={() => onAnalyze(rec)} disabled={analyzingId === rec.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10,
                  borderWidth: 1, borderColor: BLUE + '50', backgroundColor: BLUE + '10',
                  paddingHorizontal: 12, paddingVertical: 9, opacity: analyzingId === rec.id ? 0.6 : 1 }}>
                <Sparkles size={13} color={BLUE} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: BLUE }}>
                  {analyzingId === rec.id ? 'Analyzing…'
                    : rec.tag === 'visit_recording' ? 'Submit visit for analysis'
                    : rec.tag === 'lab' ? 'Analyze lab results'
                    : rec.tag === 'imaging' ? 'Analyze imaging report'
                    : rec.tag === 'prescription' ? 'Analyze prescription'
                    : rec.tag === 'vaccination' ? 'Analyze vaccine record'
                    : 'Analyze with AI'}
                </Text>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4 }}>
              {rec.file_path && (
                <TouchableOpacity onPress={() => onDownloadSingle(rec)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10,
                    borderRadius: 8, borderWidth: 1, borderColor: colors.teal + '50', backgroundColor: colors.teal + '10' }}>
                  <Download size={12} color={colors.teal} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>Download</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => onDelete(rec)} style={{ paddingVertical: 5, paddingHorizontal: 8 }}>
                <Trash2 size={13} color={colors.danger + 'AA'} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {/* Search + filter pill */}
      <View style={{ gap: 8 }}>
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: border,
          backgroundColor: cardBg, paddingHorizontal: 14, paddingVertical: 12, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Search size={14} color={bodyC} />
            <TextInput
              value={search} onChangeText={setSearch}
              placeholder="Search records"
              placeholderTextColor={titleC}
              style={{ flex: 1, fontSize: 16, color: titleC, fontWeight: '600' }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={14} color={bodyC} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity onPress={openFilterScreen}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1,
              borderColor: activeFilters > 0 ? BLUE : border,
              backgroundColor: activeFilters > 0 ? BLUE + '12' : cardBg,
              paddingHorizontal: 12, paddingVertical: 9 }}>
            <SlidersHorizontal size={13} color={activeFilters > 0 ? BLUE : LINK_BLUE} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: activeFilters > 0 ? BLUE : LINK_BLUE }}>
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ''}
            </Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Lock size={10} color={colors.teal} />
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.teal }}>Encrypted</Text>
          </View>
        </View>
      </View>

      {/* Select-mode download/delete bar */}
      {selectable && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: 14, borderWidth: 1, borderColor: colors.teal + '40', backgroundColor: colors.teal + '12',
          paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>{selectedIds.size} selected</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={clearSelection} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.teal }}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDownload} disabled={downloading}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.teal,
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, opacity: downloading ? 0.6 : 1 }}>
              <Download size={13} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
                {downloading ? 'Downloading…' : selectedIds.size === 1 ? 'Download' : 'Download ZIP'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Current records — flat on the canvas, same rhythm as Home Care's
          task list (plain section label + hairline-divided rows directly
          on the page, no extra white card wrapping them)
          [live-requested: "this is home care tasks .. i want similar way
          for records" / "then why this is still like this" — the earlier
          fix only matched the row style, not the outer card chrome]. ── */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 4 }}>
          Current records · {filtered.length}
        </Text>
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
            <FolderOpen size={22} color={bodyC} />
            <Text style={{ fontSize: 13, color: bodyC, textAlign: 'center' }}>
              {records.length === 0
                ? 'No health documents yet — bring in your first one'
                : 'No records match your filters'}
            </Text>
          </View>
        ) : filtered.map((rec, i) => <RecordRow key={rec.id} rec={rec} isLast={i === 0} />)}
      </View>

      {/* Privacy footer — same rhythm as HealthFigmaList's vaccines disclaimer */}
      <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.tealLight, borderRadius: 14, padding: 14 }}>
        <Shield size={16} color={colors.teal} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 12, color: isDark ? colors.textSecondary : '#265C44', lineHeight: 17 }}>
          Every document is encrypted to your family's own devices. AI review is optional and requires your
          approval before anything is saved.
        </Text>
      </View>
    </View>
  );
}
