import { View, Text, TouchableOpacity } from 'react-native';
import { TYPO } from '@/constants/theme';
import PickerOverlay from './PickerOverlay';
import { f } from './styles';
import { fmtDisplay, fmtTimeDisplay } from './types';

// ─── Kid ride request — one self-contained block ───────────────────────────
// Just the toggle + pickup now. Drop-off used to be its own separate
// toggle+card here, defaulting to the event's own date/time — but that
// meant the SAME value showed up twice on screen: once as the event's own
// "Date & Time" field just below this, once again as a "Drop-off"
// confirmation card up here. Removed entirely — the top Date & Time field
// (relabeled by EventFormModal when kidRideNeeded is true) now does double
// duty AS the drop-off time, with no separate field at all (user
// feedback: "when they need drop needed we can hide the date field and it
// becomes the drop off... time"). kidDropoffOn/kidDropoffDate are still
// kept in state (set true/synced to eventDate by the toggle below) purely
// because the submit encoding downstream reads them — no UI here for it.
// Pickup stays fully separate — genuinely a different moment, when the
// event ENDS, so it's the one real yes/no decision left.
export function KidRideSection({
  catColor, colors, isDark, eventDate,
  kidRideNeeded, setKidRideNeeded,
  setKidDropoffOn, setKidDropoffDate,
  kidPickupOn, setKidPickupOn, kidPickupDate, setKidPickupDate,
  showKidPickDate, setShowKidPickDate, showKidPickTime, setShowKidPickTime,
}: {
  catColor: string; colors: any; isDark: boolean; eventDate: Date;
  kidRideNeeded: boolean; setKidRideNeeded: React.Dispatch<React.SetStateAction<boolean>>;
  setKidDropoffOn: React.Dispatch<React.SetStateAction<boolean>>; setKidDropoffDate: (d: Date | null) => void;
  kidPickupOn: boolean; setKidPickupOn: React.Dispatch<React.SetStateAction<boolean>>;
  kidPickupDate: Date | null; setKidPickupDate: (d: Date | null) => void;
  showKidPickDate: boolean; setShowKidPickDate: React.Dispatch<React.SetStateAction<boolean>>;
  showKidPickTime: boolean; setShowKidPickTime: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const toggleRide = () => {
    setKidRideNeeded(r => {
      const next = !r;
      // Drop-off has no UI of its own anymore — it's always "on" and
      // always equal to the event's own date/time whenever a ride is
      // needed at all. Only pickup is ever a separate, kid-picked value.
      if (next) { setKidDropoffOn(true); setKidDropoffDate(new Date(eventDate)); }
      else { setKidDropoffOn(false); setKidDropoffDate(null); setKidPickupOn(false); setKidPickupDate(null); }
      return next;
    });
  };

  return (
    <View style={{ marginBottom: 14 }}>
      {/* ── Ride needed? ── */}
      <TouchableOpacity
        onPress={() => { console.log(`[UserAction] FORM screen=Schedule toggled "Ride needed?" on KidRideSection newValue=${!kidRideNeeded} [features/calendar/components/eventForm/KidRideSection.tsx:52]`); toggleRide(); }}
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
            {kidRideNeeded ? 'Yes — set the date & time below' : 'Off · I have my own way there'}
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

          {/* Pickup — genuinely a different moment (when the event ENDS),
              so this is the one real yes/no decision a kid makes here. */}
          <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: kidPickupOn ? '#6366F150' : (isDark ? colors.border : '#E2E8F0'),
            backgroundColor: kidPickupOn ? '#6366F10C' : (isDark ? colors.surface : '#F9FAFB'), overflow: 'hidden' }}>
            <TouchableOpacity
              onPress={() => { console.log(`[UserAction] FORM screen=Schedule toggled "Pickup needed" on KidRideSection newValue=${!kidPickupOn} [features/calendar/components/eventForm/KidRideSection.tsx:82]`); setKidPickupOn(p => !p); if (kidPickupOn) setKidPickupDate(null); }}
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
                  onPress={() => { console.log(`[UserAction] screen=Schedule tapped "Pickup date" field on KidRideSection [features/calendar/components/eventForm/KidRideSection.tsx:101]`); setShowKidPickDate(p => !p); setShowKidPickTime(false); if (!kidPickupDate) setKidPickupDate(new Date(eventDate)); }}
                  style={[f.dateBtn, { flex: 3, borderColor: showKidPickDate ? '#6366F1' : (kidPickupDate ? '#6366F180' : colors.border), backgroundColor: showKidPickDate ? '#6366F115' : colors.surface }]}>
                  <Text style={{ fontSize: 13 }}>📅</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showKidPickDate ? '#4F46E5' : (kidPickupDate ? colors.textPrimary : colors.textTertiary) }}>
                    {kidPickupDate ? fmtDisplay(kidPickupDate) : 'Pick date'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { console.log(`[UserAction] screen=Schedule tapped "Pickup time" field on KidRideSection [features/calendar/components/eventForm/KidRideSection.tsx:109]`); setShowKidPickTime(p => !p); setShowKidPickDate(false); if (!kidPickupDate) setKidPickupDate(new Date(eventDate)); }}
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
              value={kidPickupDate ?? eventDate}
              onChangeDate={d => { const m = kidPickupDate ? new Date(kidPickupDate) : new Date(eventDate); m.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setKidPickupDate(m); }}
              onChangeTime={d => { const m = kidPickupDate ? new Date(kidPickupDate) : new Date(eventDate); m.setHours(d.getHours(), d.getMinutes()); setKidPickupDate(m); }}
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
              {kidPickupOn
                ? 'One request for both legs — parent splits it into drop-off + pickup when assigning drivers.'
                : 'A drop-off event will be created for parent to assign.'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
