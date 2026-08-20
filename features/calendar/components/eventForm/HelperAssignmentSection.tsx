import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { TYPO } from '@/constants/theme';
import MemberPicker from './MemberPicker';
import PickerOverlay from './PickerOverlay';
import { f } from './styles';
import { EventCategory, fmtDisplay, fmtTimeDisplay } from './types';

// ─── Helper assignment (parent only; kid sees "Parent will assign") ───────────
// Kid mode: ride-needed toggle → drop-off/pickup sub-toggles each with their
// own date/time picker, plus a note that a parent will review & assign.
// Parent/senior mode: adult MemberPicker + free-text fallback name entry.
export default function HelperAssignmentSection({
  isKid, category, catColor, colors, isDark, siblings, adults,
  eventDate,
  kidRideNeeded, setKidRideNeeded,
  kidDropoffOn, setKidDropoffOn, kidDropoffDate, setKidDropoffDate,
  kidPickupOn, setKidPickupOn, kidPickupDate, setKidPickupDate,
  showKidDropDate, setShowKidDropDate, showKidDropTime, setShowKidDropTime,
  showKidPickDate, setShowKidPickDate, showKidPickTime, setShowKidPickTime,
  helperId, handleHelperSelect, helperName, setHelperName, setHelperId,
}: {
  isKid: boolean; category: EventCategory; catColor: string; colors: any; isDark: boolean; siblings: string[]; adults: any[];
  eventDate: Date;
  kidRideNeeded: boolean; setKidRideNeeded: React.Dispatch<React.SetStateAction<boolean>>;
  kidDropoffOn: boolean; setKidDropoffOn: React.Dispatch<React.SetStateAction<boolean>>;
  kidDropoffDate: Date | null; setKidDropoffDate: (d: Date | null) => void;
  kidPickupOn: boolean; setKidPickupOn: React.Dispatch<React.SetStateAction<boolean>>;
  kidPickupDate: Date | null; setKidPickupDate: (d: Date | null) => void;
  showKidDropDate: boolean; setShowKidDropDate: React.Dispatch<React.SetStateAction<boolean>>;
  showKidDropTime: boolean; setShowKidDropTime: React.Dispatch<React.SetStateAction<boolean>>;
  showKidPickDate: boolean; setShowKidPickDate: React.Dispatch<React.SetStateAction<boolean>>;
  showKidPickTime: boolean; setShowKidPickTime: React.Dispatch<React.SetStateAction<boolean>>;
  helperId: string | undefined; handleHelperSelect: (id: string) => void;
  helperName: string; setHelperName: (v: string) => void; setHelperId: (id: string | undefined) => void;
}) {
  return (
    <>
      {isKid ? (
        <View style={{ gap: 10 }}>
          {/* ── Ride needed toggle ── */}
          <TouchableOpacity
            onPress={() => { setKidRideNeeded(r => !r); if (kidRideNeeded) { setKidDropoffOn(false); setKidPickupOn(false); } }}
            activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5,
              borderColor: kidRideNeeded ? catColor : (isDark ? colors.border : '#E2E8F0'),
              backgroundColor: kidRideNeeded ? catColor + '18' : (isDark ? colors.surface : '#F9FAFB') }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: kidRideNeeded ? catColor : colors.textPrimary }}>
                🚗 Ride needed?
              </Text>
              <Text style={{ fontSize: TYPO.label, color: kidRideNeeded ? catColor : colors.textSecondary }}>
                {kidRideNeeded ? 'Yes — set drop-off / pickup below' : 'Off · I have my own way there'}
              </Text>
            </View>
            <View style={{ width: 44, height: 26, borderRadius: 13,
              backgroundColor: kidRideNeeded ? catColor : (isDark ? '#334155' : '#CBD5E1'),
              justifyContent: 'center', paddingHorizontal: 3 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textInverse,
                alignSelf: kidRideNeeded ? 'flex-end' : 'flex-start' }} />
            </View>
          </TouchableOpacity>

          {kidRideNeeded && (
            <View style={{ gap: 10, paddingLeft: 8 }}>

              {/* ── Drop-off toggle + date/time ── */}
              <TouchableOpacity
                onPress={() => { setKidDropoffOn(d => !d); if (kidDropoffOn) setKidDropoffDate(null); }}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5,
                  borderColor: kidDropoffOn ? colors.success : (isDark ? colors.border : '#E2E8F0'),
                  backgroundColor: kidDropoffOn ? colors.success + '12' : (isDark ? colors.surface : '#F9FAFB') }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: kidDropoffOn ? colors.success : colors.textPrimary }}>
                  📍 Drop-off needed
                </Text>
                <View style={{ width: 40, height: 24, borderRadius: 12,
                  backgroundColor: kidDropoffOn ? colors.success : (isDark ? '#334155' : '#CBD5E1'),
                  justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textInverse,
                    alignSelf: kidDropoffOn ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>

              {kidDropoffOn && (
                <View style={{ gap: 6, paddingLeft: 6 }}>
                  <Text style={[f.label, { color: colors.textSecondary }]}>📅 Drop-off date &amp; time</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => { setShowKidDropDate(p => !p); setShowKidDropTime(false); setShowKidPickDate(false); setShowKidPickTime(false); if (!kidDropoffDate) setKidDropoffDate(new Date(eventDate)); }}
                      style={[f.dateBtn, { flex: 3, borderColor: showKidDropDate ? colors.success : (kidDropoffDate ? colors.success + '80' : colors.border), backgroundColor: showKidDropDate ? colors.success + '15' : colors.surface }]}>
                      <Text style={{ fontSize: 13 }}>📅</Text>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showKidDropDate ? colors.success : (kidDropoffDate ? colors.textPrimary : colors.textTertiary) }}>
                        {kidDropoffDate ? fmtDisplay(kidDropoffDate) : 'Pick date'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setShowKidDropTime(p => !p); setShowKidDropDate(false); setShowKidPickDate(false); setShowKidPickTime(false); if (!kidDropoffDate) setKidDropoffDate(new Date(eventDate)); }}
                      style={[f.dateBtn, { flex: 2, borderColor: showKidDropTime ? colors.success : (kidDropoffDate ? colors.success + '80' : colors.border), backgroundColor: showKidDropTime ? colors.success + '15' : colors.surface }]}>
                      <Text style={{ fontSize: 13 }}>🕐</Text>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showKidDropTime ? colors.success : (kidDropoffDate ? colors.textPrimary : colors.textTertiary) }}>
                        {kidDropoffDate ? fmtTimeDisplay(kidDropoffDate) : 'Time'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <PickerOverlay
                    showDate={showKidDropDate} showTime={showKidDropTime}
                    value={kidDropoffDate ?? eventDate}
                    onChangeDate={d => { const m = kidDropoffDate ? new Date(kidDropoffDate) : new Date(eventDate); m.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setKidDropoffDate(m); }}
                    onChangeTime={d => { const m = kidDropoffDate ? new Date(kidDropoffDate) : new Date(eventDate); m.setHours(d.getHours(), d.getMinutes()); setKidDropoffDate(m); }}
                    onDone={() => { setShowKidDropDate(false); setShowKidDropTime(false); }}
                    accentColor={colors.success} colors={colors}
                    dateLabel="📅 Drop-off Date" timeLabel="🕐 Drop-off Time"
                    minimumDate={new Date()}
                  />
                </View>
              )}

              {/* ── Pickup toggle + date/time ── */}
              <TouchableOpacity
                onPress={() => { setKidPickupOn(p => !p); if (kidPickupOn) setKidPickupDate(null); }}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5,
                  borderColor: kidPickupOn ? '#6366F1' : (isDark ? colors.border : '#E2E8F0'),
                  backgroundColor: kidPickupOn ? '#6366F112' : (isDark ? colors.surface : '#F9FAFB') }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: kidPickupOn ? '#4F46E5' : colors.textPrimary }}>
                  🏁 Pickup needed
                </Text>
                <View style={{ width: 40, height: 24, borderRadius: 12,
                  backgroundColor: kidPickupOn ? '#6366F1' : (isDark ? '#334155' : '#CBD5E1'),
                  justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textInverse,
                    alignSelf: kidPickupOn ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>

              {kidPickupOn && (
                <View style={{ gap: 6, paddingLeft: 6 }}>
                  <Text style={[f.label, { color: colors.textSecondary }]}>📅 Pickup date &amp; time</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => { setShowKidPickDate(p => !p); setShowKidPickTime(false); setShowKidDropDate(false); setShowKidDropTime(false); if (!kidPickupDate) setKidPickupDate(kidDropoffDate ? new Date(kidDropoffDate) : new Date(eventDate)); }}
                      style={[f.dateBtn, { flex: 3, borderColor: showKidPickDate ? '#6366F1' : (kidPickupDate ? '#6366F180' : colors.border), backgroundColor: showKidPickDate ? '#6366F115' : colors.surface }]}>
                      <Text style={{ fontSize: 13 }}>📅</Text>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showKidPickDate ? '#4F46E5' : (kidPickupDate ? colors.textPrimary : colors.textTertiary) }}>
                        {kidPickupDate ? fmtDisplay(kidPickupDate) : 'Pick date'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setShowKidPickTime(p => !p); setShowKidPickDate(false); setShowKidDropDate(false); setShowKidDropTime(false); if (!kidPickupDate) setKidPickupDate(kidDropoffDate ? new Date(kidDropoffDate) : new Date(eventDate)); }}
                      style={[f.dateBtn, { flex: 2, borderColor: showKidPickTime ? '#6366F1' : (kidPickupDate ? '#6366F180' : colors.border), backgroundColor: showKidPickTime ? '#6366F115' : colors.surface }]}>
                      <Text style={{ fontSize: 13 }}>🕐</Text>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showKidPickTime ? '#4F46E5' : (kidPickupDate ? colors.textPrimary : colors.textTertiary) }}>
                        {kidPickupDate ? fmtTimeDisplay(kidPickupDate) : 'Time'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <PickerOverlay
                    showDate={showKidPickDate} showTime={showKidPickTime}
                    value={kidPickupDate ?? (kidDropoffDate ?? eventDate)}
                    onChangeDate={d => { const m = kidPickupDate ? new Date(kidPickupDate) : (kidDropoffDate ? new Date(kidDropoffDate) : new Date(eventDate)); m.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setKidPickupDate(m); }}
                    onChangeTime={d => { const m = kidPickupDate ? new Date(kidPickupDate) : (kidDropoffDate ? new Date(kidDropoffDate) : new Date(eventDate)); m.setHours(d.getHours(), d.getMinutes()); setKidPickupDate(m); }}
                    onDone={() => { setShowKidPickDate(false); setShowKidPickTime(false); }}
                    accentColor="#6366F1" colors={colors}
                    dateLabel="📅 Pickup Date" timeLabel="🕐 Pickup Time"
                    minimumDate={new Date()}
                  />
                </View>
              )}
            </View>
          )}

          <View style={[f.kidNote, { backgroundColor: isDark ? '#1C1700' : colors.warningLight, borderColor: colors.warning + '40', marginTop: 4 }]}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.amber }}>
              👋 Parent will review &amp; assign a driver
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.amber, opacity: 0.8, marginTop: 2 }}>
              {!kidRideNeeded        ? 'No ride requested — you have your own way there.' :
               kidDropoffOn && kidPickupOn ? '2 events will be created (drop-off + pickup) — parent assigns each.' :
               kidDropoffOn          ? 'A drop-off event will be created for parent to assign.' :
               kidPickupOn           ? 'A pickup event will be created for parent to assign.' :
                                      'Toggle drop-off or pickup below.'}
            </Text>
          </View>
        </View>
      ) : (
        <MemberPicker
          label={
            category === 'Medical'  ? '🏥 Accompanied by (adult)' :
            category === 'Study'    ? '📚 Or pick a family tutor' :
            category === 'Sports'   ? '🚗 Drop-off by (adult)' :
            category === 'Birthday' ? '🚗 Driven by / accompanying' :
            '🚗 Driven by (adult)'
          }
          selectedIds={helperId ? [helperId] : []}
          members={adults}
          onToggle={handleHelperSelect}
          colors={colors} isDark={isDark} siblings={siblings}
        />
      )}
      {/* Manual name entry for external helpers (coaches, escorts, etc.) —
          Study skips this: its dedicated "Tutor name" field above is the
          single source of truth, synced into `helper` at submit time. */}
      {!isKid && category !== 'Study' && (
        <TextInput
          style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed, marginTop: -8 }]}
          placeholder="Or type name (e.g. Grandma Mary)"
          placeholderTextColor={colors.textTertiary}
          value={helperName}
          onChangeText={t => { setHelperName(t); if (!t) setHelperId(undefined); }}
        />
      )}
    </>
  );
}
