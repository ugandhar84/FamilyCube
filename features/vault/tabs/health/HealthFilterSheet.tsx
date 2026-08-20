import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Check, MessageSquare, Share2, X } from 'lucide-react-native';
import { MemberAvatar, BRAND } from '../shared';
import { Medication, Vaccine, FREQ_LABELS, CAT_COLORS } from './types';
import { hf } from './styles';

export type MedFilters = {
  search: string; members: string[]; categories: string[];
  status: 'active' | 'taken' | 'pending' | 'overdue' | 'all'; ongoing: boolean;
  frequencies: string[]; refillSoon: boolean; escalationOnly: boolean;
};
export type VaxFilters = {
  search: string; members: string[];
  status: 'all' | 'done' | 'pending' | 'due_soon'; dueSoonDays: number;
};

export default function HealthFilterSheet({
  visible, onRequestClose,
  colors, isDark, members,
  healthTab,
  draftMed, setDraftMed, draftVax, setDraftVax,
  resetFilters, applyFilters,
  filteredMeds, filteredVaxes, meds, vaxes,
  memberName,
  activeMemberId, sendMessage,
  setShowFilterSheet,
}: {
  visible: boolean; onRequestClose: () => void;
  colors: any; isDark: boolean; members: any[];
  healthTab: 'meds' | 'vax';
  draftMed: MedFilters; setDraftMed: React.Dispatch<React.SetStateAction<MedFilters>>;
  draftVax: VaxFilters; setDraftVax: React.Dispatch<React.SetStateAction<VaxFilters>>;
  resetFilters: () => void; applyFilters: () => void;
  filteredMeds: Medication[]; filteredVaxes: Vaccine[]; meds: Medication[]; vaxes: Vaccine[];
  memberName: (id: string) => string;
  activeMemberId: string;
  sendMessage: (channel: string, memberId: string, msg: string) => void;
  setShowFilterSheet: (v: boolean) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onRequestClose}>
      <TouchableOpacity style={hf.sheetOverlay} activeOpacity={1} onPress={onRequestClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <View style={[hf.sheet, {
          backgroundColor: isDark ? colors.background : '#FAFAFA',
          borderColor: colors.border,
        }]}>
          {/* Handle */}
          <View style={hf.sheetHandle} />

          {/* Header */}
          <View style={hf.sheetHeader}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary }}>
              {healthTab === 'meds' ? 'Medication Filters' : 'Vaccine Filters'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={resetFilters}
                style={[hf.sheetHeaderBtn, { borderColor: colors.primary + '50', backgroundColor: colors.primary + '10' }]}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={applyFilters}
                style={[hf.sheetHeaderBtn, {
                  backgroundColor: healthTab === 'meds' ? colors.primary : BRAND.teal,
                  borderColor: 'transparent',
                }]}>
                <Text style={{ fontSize: 12, fontWeight: '900', color: colors.textInverse }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
            {healthTab === 'meds' ? (
              <>
                {/* Search */}
                <View style={hf.fsSection}>
                  <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Search</Text>
                  <View style={[hf.searchRow, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F5F3FF' }]}>
                    <TextInput value={draftMed.search} onChangeText={v => setDraftMed(d => ({ ...d, search: v }))}
                      placeholder="Medication name…" placeholderTextColor={colors.textTertiary}
                      style={[hf.searchInput, { color: colors.textPrimary }]} />
                    {draftMed.search.length > 0 && (
                      <TouchableOpacity onPress={() => setDraftMed(d => ({ ...d, search: '' }))}>
                        <X size={14} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Status */}
                <View style={hf.fsSection}>
                  <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Status</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {([
                      { id: 'active',  label: 'Active',   color: colors.primary },
                      { id: 'taken',   label: 'Taken Today', color: BRAND.emerald },
                      { id: 'pending', label: 'Pending',  color: colors.primary },
                      { id: 'overdue', label: 'Overdue',  color: BRAND.rose },
                      { id: 'all',     label: 'All',      color: BRAND.blue },
                    ] as const).map(opt => {
                      const sel = draftMed.status === opt.id;
                      return (
                        <TouchableOpacity key={opt.id}
                          onPress={() => setDraftMed(d => ({ ...d, status: opt.id }))}
                          style={[hf.fsPill, { backgroundColor: sel ? opt.color : 'transparent', borderColor: sel ? opt.color : colors.border }]}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Members */}
                <View style={hf.fsSection}>
                  <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>
                    Members {draftMed.members.length > 0 ? `(${draftMed.members.length} selected)` : '(all)'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {members.map(m => {
                      const mc = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? BRAND.blue : BRAND.emerald;
                      const sel = draftMed.members.includes(m.id);
                      return (
                        <TouchableOpacity key={m.id}
                          onPress={() => setDraftMed(d => ({
                            ...d,
                            members: sel ? d.members.filter(x => x !== m.id) : [...d.members, m.id],
                          }))}
                          style={[hf.fsMemberChip, { backgroundColor: sel ? mc + '20' : 'transparent', borderColor: sel ? mc : colors.border }]}>
                          <MemberAvatar name={m.name} color={sel ? mc : colors.textTertiary} size={28} />
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: sel ? mc : colors.textPrimary }}>
                              {m.name.split(' ')[0]}
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'capitalize' }}>{m.role}</Text>
                          </View>
                          {sel && <Check size={13} color={mc} style={{ marginLeft: 'auto' as any }} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Category */}
                <View style={hf.fsSection}>
                  <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Category</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(CAT_COLORS).map(([cat, color]) => {
                      const sel = draftMed.categories.includes(cat);
                      return (
                        <TouchableOpacity key={cat}
                          onPress={() => setDraftMed(d => ({
                            ...d,
                            categories: sel ? d.categories.filter(x => x !== cat) : [...d.categories, cat],
                          }))}
                          style={[hf.fsPill, { backgroundColor: sel ? color : 'transparent', borderColor: sel ? color : colors.border }]}>
                          <Text style={{ fontSize: 13, fontWeight: '700', textTransform: 'capitalize',
                            color: sel ? '#fff' : colors.textSecondary }}>{cat}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Frequency */}
                <View style={hf.fsSection}>
                  <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Frequency</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(FREQ_LABELS).map(([k, v]) => {
                      const sel = draftMed.frequencies.includes(k);
                      return (
                        <TouchableOpacity key={k}
                          onPress={() => setDraftMed(d => ({
                            ...d,
                            frequencies: sel ? d.frequencies.filter(x => x !== k) : [...d.frequencies, k],
                          }))}
                          style={[hf.fsPill, { backgroundColor: sel ? BRAND.teal : 'transparent', borderColor: sel ? BRAND.teal : colors.border }]}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>{v}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Toggles */}
                <View style={hf.fsSection}>
                  <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Options</Text>
                  {[
                    { key: 'ongoing',       label: 'Active / Ongoing only',          desc: 'Hide discontinued medications' },
                    { key: 'refillSoon',    label: 'Refill due within 7 days',       desc: 'Show only meds needing refill soon' },
                    { key: 'escalationOnly', label: 'Escalation alert enabled',      desc: 'Only meds with missed-dose alerts' },
                  ].map(opt => {
                    const val = draftMed[opt.key as keyof typeof draftMed] as boolean;
                    return (
                      <TouchableOpacity key={opt.key}
                        onPress={() => setDraftMed(d => ({ ...d, [opt.key]: !val }))}
                        style={[hf.fsToggleRow, { borderColor: val ? colors.primary + '40' : colors.border,
                          backgroundColor: val ? colors.primary + '08' : 'transparent' }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>{opt.label}</Text>
                          <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{opt.desc}</Text>
                        </View>
                        <View style={[hf.toggle, { backgroundColor: val ? colors.primary : colors.border }]}>
                          <View style={[hf.toggleThumb, { transform: [{ translateX: val ? 18 : 2 }] }]} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                {/* Vax Search */}
                <View style={hf.fsSection}>
                  <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Search</Text>
                  <View style={[hf.searchRow, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F0FDFA' }]}>
                    <TextInput value={draftVax.search} onChangeText={v => setDraftVax(d => ({ ...d, search: v }))}
                      placeholder="Vaccine name…" placeholderTextColor={colors.textTertiary}
                      style={[hf.searchInput, { color: colors.textPrimary }]} />
                  </View>
                </View>

                {/* Vax Status */}
                <View style={hf.fsSection}>
                  <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Status</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {([
                      { id: 'pending',  label: 'Pending',  color: BRAND.amber },
                      { id: 'done',     label: 'Done',     color: BRAND.emerald },
                      { id: 'due_soon', label: 'Due Soon', color: BRAND.rose },
                      { id: 'all',      label: 'All',      color: BRAND.teal },
                    ] as const).map(opt => {
                      const sel = draftVax.status === opt.id;
                      return (
                        <TouchableOpacity key={opt.id}
                          onPress={() => setDraftVax(d => ({ ...d, status: opt.id }))}
                          style={[hf.fsPill, { backgroundColor: sel ? opt.color : 'transparent', borderColor: sel ? opt.color : colors.border }]}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {draftVax.status === 'due_soon' && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700', marginBottom: 6 }}>
                        Due within: {draftVax.dueSoonDays} days
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[7, 14, 30, 60, 90].map(d => {
                          const sel = draftVax.dueSoonDays === d;
                          return (
                            <TouchableOpacity key={d} onPress={() => setDraftVax(v => ({ ...v, dueSoonDays: d }))}
                              style={[hf.fsPill, { backgroundColor: sel ? BRAND.teal : 'transparent', borderColor: sel ? BRAND.teal : colors.border }]}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>{d}d</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>

                {/* Vax Members */}
                <View style={hf.fsSection}>
                  <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>
                    Members {draftVax.members.length > 0 ? `(${draftVax.members.length} selected)` : '(all)'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {members.map(m => {
                      const mc = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? BRAND.blue : BRAND.emerald;
                      const sel = draftVax.members.includes(m.id);
                      return (
                        <TouchableOpacity key={m.id}
                          onPress={() => setDraftVax(d => ({
                            ...d,
                            members: sel ? d.members.filter(x => x !== m.id) : [...d.members, m.id],
                          }))}
                          style={[hf.fsMemberChip, { backgroundColor: sel ? mc + '20' : 'transparent', borderColor: sel ? mc : colors.border }]}>
                          <MemberAvatar name={m.name} color={sel ? mc : colors.textTertiary} size={28} />
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: sel ? mc : colors.textPrimary }}>
                              {m.name.split(' ')[0]}
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'capitalize' }}>{m.role}</Text>
                          </View>
                          {sel && <Check size={13} color={mc} style={{ marginLeft: 'auto' as any }} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            )}

            {/* ── Export Section (inside filter sheet) ───── */}
            <View style={[hf.fsSection, { borderTopWidth: 1, borderColor: colors.border, paddingTop: 20 }]}>
              <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Export Health Records</Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 12 }}>
                Generate a summary for the current filter selection and share it.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    setShowFilterSheet(false);
                    // Build text report for current filtered data
                    const targetMeds = healthTab === 'meds' ? filteredMeds : meds;
                    const targetVaxes = healthTab === 'vax' ? filteredVaxes : vaxes;
                    const selectedMemberIds = healthTab === 'meds'
                      ? (draftMed.members.length ? draftMed.members : members.map(m => m.id))
                      : (draftVax.members.length ? draftVax.members : members.map(m => m.id));

                    const selectedMembers = members.filter(m => selectedMemberIds.includes(m.id));

                    let report = `📋 FAMILY HEALTH RECORDS\nGenerated: ${new Date().toLocaleDateString()}\n`;
                    report += `Members: ${selectedMembers.map(m => m.name).join(', ')}\n\n`;

                    if (healthTab !== 'vax') {
                      report += `━━━ MEDICATIONS (${targetMeds.length}) ━━━\n\n`;
                      selectedMemberIds.forEach(mid => {
                        const mName = memberName(mid);
                        const mMeds = targetMeds.filter(m => m.member_id === mid);
                        if (!mMeds.length) return;
                        report += `👤 ${mName}\n`;
                        mMeds.forEach(m => {
                          report += `  • ${m.name} — ${m.dosage} ${m.dosage_unit}, ${FREQ_LABELS[m.frequency] ?? m.frequency}\n`;
                          if (m.prescribing_doctor) report += `    Dr. ${m.prescribing_doctor}\n`;
                          if (m.refill_date) report += `    Refill: ${m.refill_date}\n`;
                          if (m.instructions) report += `    Note: ${m.instructions}\n`;
                        });
                        report += '\n';
                      });
                    }

                    if (healthTab !== 'meds') {
                      report += `━━━ IMMUNIZATIONS (${targetVaxes.length}) ━━━\n\n`;
                      selectedMemberIds.forEach(mid => {
                        const mName = memberName(mid);
                        const mVax = targetVaxes.filter(v => v.member_id === mid);
                        if (!mVax.length) return;
                        report += `👤 ${mName}\n`;
                        mVax.forEach(v => {
                          const status = v.done ? '✓' : '○';
                          report += `  ${status} ${v.title}${v.vaccine_type ? ` (${v.vaccine_type})` : ''} — ${v.date}\n`;
                          if (v.next_due_date) report += `    Next due: ${v.next_due_date}\n`;
                          if (v.series_total > 1) report += `    Dose ${v.series_current}/${v.series_total}\n`;
                          if (v.administered_by) report += `    By: ${v.administered_by}\n`;
                        });
                        report += '\n';
                      });
                    }

                    report += '⚠️ This report is for personal reference only. Always consult a healthcare provider.';
                    sendMessage('all', activeMemberId ?? '', `📤 *Health Records Export*\n\n\`\`\`\n${report}\n\`\`\``);
                  }}
                  style={[hf.exportBtn, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '10', flex: 1 }]}>
                  <MessageSquare size={15} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>Share to Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    // Build plain text and use Share API
                    const { Share } = await import('react-native');
                    const selectedMemberIds = healthTab === 'meds'
                      ? (draftMed.members.length ? draftMed.members : members.map(m => m.id))
                      : (draftVax.members.length ? draftVax.members : members.map(m => m.id));
                    const selectedMembers = members.filter(m => selectedMemberIds.includes(m.id));
                    let report = `FAMILY HEALTH RECORDS\nGenerated: ${new Date().toLocaleDateString()}\nMembers: ${selectedMembers.map(m => m.name).join(', ')}\n\n`;
                    const targetMeds = filteredMeds.filter(m => selectedMemberIds.includes(m.member_id));
                    const targetVaxes = filteredVaxes.filter(v => selectedMemberIds.includes(v.member_id));
                    if (targetMeds.length) {
                      report += `MEDICATIONS (${targetMeds.length})\n`;
                      targetMeds.forEach(m => { report += `- ${m.name}: ${m.dosage} ${m.dosage_unit}, ${FREQ_LABELS[m.frequency] ?? m.frequency}\n`; });
                      report += '\n';
                    }
                    if (targetVaxes.length) {
                      report += `IMMUNIZATIONS (${targetVaxes.length})\n`;
                      targetVaxes.forEach(v => { report += `- ${v.done ? '✓' : '○'} ${v.title} (${v.date})${v.next_due_date ? ` | Next: ${v.next_due_date}` : ''}\n`; });
                    }
                    report += '\n⚠️ For personal reference only.';
                    Share.share({ message: report, title: 'Family Health Records' });
                    setShowFilterSheet(false);
                  }}
                  style={[hf.exportBtn, { borderColor: BRAND.teal + '60', backgroundColor: BRAND.teal + '10', flex: 1 }]}>
                  <Share2 size={15} color={BRAND.teal} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.teal }}>Export / Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
