import { View, Text, TouchableOpacity } from 'react-native';
import { TYPO } from '@/constants/theme';
import PickerOverlay from './PickerOverlay';
import { f } from './styles';
import { fmtDisplay, fmtTimeDisplay } from './types';

// ─── Kid ride request — one self-contained block ───────────────────────────
// Everything a kid needs to ask for a ride lives together: the yes/no
// toggle, drop-off (silently pre-filled to the event's own time — a kid
// only sees it as something to CONFIRM or ADJUST, never a blank field to
// fill in), and pickup (the one genuinely different time, since it's when
// the event ENDS — always its own explicit choice). Previously the toggle
// lived up near Date & Time while its own drop-off/pickup fields sat far
// below, past Repeats/Call Reminder/category details — a kid turning the
// toggle on had to scroll past several unrelated sections to find what it
// actually revealed (user feedback: "drop off and pickup should be
// underneath ride needed"). Rendered as one block, directly under the
// toggle, right above Date & Time.
export function KidRideSection({
  catColor, colors, isDark, eventDate,
  kidRideNeeded, setKidRideNeeded,
  kidDropoffOn, setKidDropoffOn, kidDropoffDate, setKidDropoffDate,
  kidPickupOn, setKidPickupOn, kidPickupDate, setKidPickupDate,
  showKidDropDate, setShowKidDropDate, showKidDropTime, setShowKidDropTime,
  showKidPickDate, setShowKidPickDate, showKidPickTime, setShowKidPickTime,
}: {
  catColor: string; colors: any; isDark: boolean; eventDate: Date;
  kidRideNeeded: boolean; setKidRideNeeded: React.Dispatch<React.SetStateAction<boolean>>;
  kidDropoffOn: boolean; setKidDropoffOn: React.Dispatch<React.SetStateAction<boolean>>;
  kidDropoffDate: Date | null; setKidDropoffDate: (d: Date | null) => void;
  kidPickupOn: boolean; setKidPickupOn: React.Dispatch<React.SetStateAction<boolean>>;
  kidPickupDate: Date | null; setKidPickupDate: (d: Date | null) => void;
  showKidDropDate: boolean; setShowKidDropDate: React.Dispatch<React.SetStateAction<boolean>>;
  showKidDropTime: boolean; setShowKidDropTime: React.Dispatch<React.SetStateAction<boolean>>;
  showKidPickDate: boolean; setShowKidPickDate: React.Dispatch<React.SetStateAction<boolean>>;
  showKidPickTime: boolean; setShowKidPickTime: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const toggleRide = () => {
    setKidRideNeeded(r => {
      const next = !r;
      if (next) { setKidDropoffOn(true); setKidDropoffDate(new Date(eventDate)); }
      else { setKidDropoffOn(false); setKidDropoffDate(null); setKidPickupOn(false); setKidPickupDate(null); }
      return next;
    });
  };

  return (
    <View style={{ marginBottom: 14 }}>
      {/* ── Ride needed? ── */}
      <TouchableOpacity
        onPress={toggleRide}
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
            {kidRideNeeded ? 'Yes — see below' : 'Off · I have my own way there'}
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
        <View style={{ gap: 10, marginTop: 10, paddingLeft: 8 }}>

          {/* Drop-off — pre-filled to the event's own time the moment the
              toggle above turned on, so this reads as a CONFIRMATION
              ("dropped off at 4:00 PM ✓"), not a field to fill in. Tapping
              it opens the picker to adjust; the switch is only there for
              the rarer case a kid needs pickup but genuinely not drop-off
              (already there, has their own way in). */}
          <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: kidDropoffOn ? colors.success + '50' : (isDark ? colors.border : '#E2E8F0'),
            backgroundColor: kidDropoffOn ? colors.success + '0C' : (isDark ? colors.surface : '#F9FAFB'), overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: kidDropoffOn ? colors.success : colors.textPrimary }}>
                📍 Drop-off
              </Text>
              <TouchableOpacity
                onPress={() => { setKidDropoffOn(d => !d); if (kidDropoffOn) setKidDropoffDate(null); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <View style={{ width: 40, height: 24, borderRadius: 12,
                  backgroundColor: kidDropoffOn ? colors.success : (isDark ? '#334155' : '#CBD5E1'),
                  justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textInverse,
                    alignSelf: kidDropoffOn ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>
            </View>
            {kidDropoffOn && (
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 10 }}>
                <TouchableOpacity
                  onPress={() => { setShowKidDropDate(p => !p); setShowKidDropTime(false); setShowKidPickDate(false); setShowKidPickTime(false); if (!kidDropoffDate) setKidDropoffDate(new Date(eventDate)); }}
                  style={[f.dateBtn, { flex: 3, borderColor: showKidDropDate ? colors.success : colors.success + '60', backgroundColor: showKidDropDate ? colors.success + '15' : colors.surface }]}>
                  <Text style={{ fontSize: 13 }}>📅</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showKidDropDate ? colors.success : colors.textPrimary }}>
                    {kidDropoffDate ? fmtDisplay(kidDropoffDate) : 'Pick date'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowKidDropTime(p => !p); setShowKidDropDate(false); setShowKidPickDate(false); setShowKidPickTime(false); if (!kidDropoffDate) setKidDropoffDate(new Date(eventDate)); }}
                  style={[f.dateBtn, { flex: 2, borderColor: showKidDropTime ? colors.success : colors.success + '60', backgroundColor: showKidDropTime ? colors.success + '15' : colors.surface }]}>
                  <Text style={{ fontSize: 13 }}>🕐</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showKidDropTime ? colors.success : colors.textPrimary }}>
                    {kidDropoffDate ? fmtTimeDisplay(kidDropoffDate) : 'Time'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {kidDropoffOn && (
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
          )}

          {/* Pickup — genuinely a different moment (when the event ENDS),
              so this is the one real yes/no decision left, unlike drop-off
              above which starts pre-answered. */}
          <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: kidPickupOn ? '#6366F150' : (isDark ? colors.border : '#E2E8F0'),
            backgroundColor: kidPickupOn ? '#6366F10C' : (isDark ? colors.surface : '#F9FAFB'), overflow: 'hidden' }}>
            <TouchableOpacity
              onPress={() => { setKidPickupOn(p => !p); if (kidPickupOn) setKidPickupDate(null); }}
              activeOpacity={0.8}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10 }}>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: kidPickupOn ? '#4F46E5' : colors.textPrimary }}>
                  🏁 Pickup needed
                </Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>When the event ends</Text>
              </View>
              <View style={{ width: 40, height: 24, borderRadius: 12,
                backgroundColor: kidPickupOn ? '#6366F1' : (isDark ? '#334155' : '#CBD5E1'),
                justifyContent: 'center', paddingHorizontal: 3 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textInverse,
                  alignSelf: kidPickupOn ? 'flex-end' : 'flex-start' }} />
              </View>
            </TouchableOpacity>
            {kidPickupOn && (
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 10 }}>
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
            )}
          </View>
          {kidPickupOn && (
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
          )}

          <View style={[f.kidNote, { backgroundColor: isDark ? '#1C1700' : colors.warningLight, borderColor: colors.warning + '40' }]}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.amber }}>
              👋 Parent will review &amp; assign a driver
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.amber, opacity: 0.8, marginTop: 2 }}>
              {kidDropoffOn && kidPickupOn ? 'One request for both legs — parent splits it into drop-off + pickup when assigning drivers.' :
               kidDropoffOn          ? 'A drop-off event will be created for parent to assign.' :
               kidPickupOn           ? 'A pickup event will be created for parent to assign.' :
                                      'Turn drop-off or pickup back on above if you do need a ride.'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
