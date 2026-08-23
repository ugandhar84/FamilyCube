import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { TYPO } from '@/constants/theme';
import Chip from './Chip';
import MemberPicker from './MemberPicker';
import PickerOverlay from './PickerOverlay';
import GroceryLinkSection, { GroceryItem, NewGroceryLine } from './GroceryLinkSection';
import { f } from './styles';
import { EventCategory, APPT_TYPES, SPORT_TYPES, SUBJECTS, fmtDisplay, fmtTimeDisplay } from './types';

// ─── Category-specific fields block for AddEventModal ──────────────────────────
// Renders the Medical / Sports / Study / Ride / Event-Birthday / Errand / Other
// sections — exactly one shows at a time, gated on `category`. Kept as a single
// component (rather than split further) because Study/Ride/Birthday/Errand all
// share the same `returnDate`/`showReturnDatePick`/`showReturnTimePick` state
// and picker overlay, so splitting them further would require lifting that
// shared state back up anyway.
export default function CategoryFields({
  category, catColor, colors, isDark, siblings, adults, isKid,
  apptType, setApptType, doctorName, setDoctorName, clinicLocation, setClinicLocation,
  sportType, setSportType, coachName, setCoachName, venueLocation, setVenueLocation,
  pickupLocation, setPickupLocation, kitReminder, setKitReminder,
  subject, setSubject, tutorName, setTutorName, isOnline, setIsOnline, meetingUrl, setMeetingUrl,
  helperId, dropLocation, setDropLocation,
  driverId, driverName, setDriverName, setDriverId, handleDriverSelect,
  eventDate,
  returnDate, setReturnDate,
  showReturnDatePick, setShowReturnDatePick, showReturnTimePick, setShowReturnTimePick,
  showDatePick, setShowDatePick, showTimePick, setShowTimePick,
  isTeen, members, openToGrandparents, setOpenToGrandparents, openToTeens, setOpenToTeens,
  setGpTeenToggledByUser, rideCoinsTeen, setRideCoinsTeen,
  generalLocation, setGeneralLocation,
  linkGroceries, setLinkGroceries, loadingGroceries, groceryItems,
  selectedItemIds, setSelectedItemIds, newGroceryLines, setNewGroceryLines,
  focusedLineIdx, setFocusedLineIdx, focusedField, setFocusedField,
  cachedItemNames, cachedStores,
}: {
  category: EventCategory; catColor: string; colors: any; isDark: boolean; siblings: string[]; adults: any[]; isKid: boolean;
  apptType: string; setApptType: React.Dispatch<React.SetStateAction<string>>;
  doctorName: string; setDoctorName: (v: string) => void;
  clinicLocation: string; setClinicLocation: (v: string) => void;
  sportType: string; setSportType: React.Dispatch<React.SetStateAction<string>>;
  coachName: string; setCoachName: (v: string) => void;
  venueLocation: string; setVenueLocation: (v: string) => void;
  pickupLocation: string; setPickupLocation: (v: string) => void;
  kitReminder: boolean; setKitReminder: (v: boolean) => void;
  subject: string; setSubject: React.Dispatch<React.SetStateAction<string>>;
  tutorName: string; setTutorName: (v: string) => void;
  isOnline: boolean; setIsOnline: (v: boolean) => void;
  meetingUrl: string; setMeetingUrl: (v: string) => void;
  helperId: string | undefined; dropLocation: string; setDropLocation: (v: string) => void;
  driverId: string | undefined; driverName: string; setDriverName: (v: string) => void;
  setDriverId: (id: string | undefined) => void;
  handleDriverSelect: (id: string) => void;
  eventDate: Date;
  returnDate: Date | null; setReturnDate: (d: Date | null) => void;
  showReturnDatePick: boolean; setShowReturnDatePick: React.Dispatch<React.SetStateAction<boolean>>;
  showReturnTimePick: boolean; setShowReturnTimePick: React.Dispatch<React.SetStateAction<boolean>>;
  showDatePick: boolean; setShowDatePick: React.Dispatch<React.SetStateAction<boolean>>;
  showTimePick: boolean; setShowTimePick: React.Dispatch<React.SetStateAction<boolean>>;
  isTeen: boolean; members: any[];
  openToGrandparents: boolean; setOpenToGrandparents: React.Dispatch<React.SetStateAction<boolean>>;
  openToTeens: boolean; setOpenToTeens: React.Dispatch<React.SetStateAction<boolean>>;
  setGpTeenToggledByUser: (v: boolean) => void;
  rideCoinsTeen: string; setRideCoinsTeen: (v: string) => void;
  generalLocation: string; setGeneralLocation: (v: string) => void;
  linkGroceries: boolean; setLinkGroceries: (v: boolean) => void;
  loadingGroceries: boolean; groceryItems: GroceryItem[];
  selectedItemIds: Set<string>; setSelectedItemIds: (s: Set<string>) => void;
  newGroceryLines: NewGroceryLine[]; setNewGroceryLines: React.Dispatch<React.SetStateAction<NewGroceryLine[]>>;
  focusedLineIdx: number | null; setFocusedLineIdx: (i: number | null) => void;
  focusedField: 'name' | 'store' | null; setFocusedField: (f: 'name' | 'store' | null) => void;
  cachedItemNames: string[]; cachedStores: string[];
}) {
  return (
    <>
      {/* ── MEDICAL fields ── */}
      {category === 'Medical' && (
        <>
          <Text style={[f.sectionLabel, { color: catColor }]}>🏥 Medical details</Text>

          {/* Appointment type */}
          <Text style={[f.label, { color: colors.textSecondary }]}>Appointment type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {APPT_TYPES.map(t => <Chip key={t} label={t} active={apptType === t} color={catColor} onPress={() => setApptType(p => p === t ? '' : t)} small />)}
            </View>
          </ScrollView>

          {/* Doctor + clinic in one row */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[f.label, { color: colors.textSecondary }]}>🩺 Doctor</Text>
              <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                placeholder="Dr. Smith" placeholderTextColor={colors.textTertiary}
                value={doctorName} onChangeText={setDoctorName}
                onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Doctor" on "CategoryFields(${category})" newValue=${doctorName} [features/calendar/components/eventForm/CategoryFields.tsx:96]`)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[f.label, { color: colors.textSecondary }]}>📍 Clinic</Text>
              <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                placeholder="Clinic name" placeholderTextColor={colors.textTertiary}
                value={clinicLocation} onChangeText={setClinicLocation}
                onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Clinic" on "CategoryFields(${category})" newValue=${clinicLocation} [features/calendar/components/eventForm/CategoryFields.tsx:102]`)} />
            </View>
          </View>
        </>
      )}

      {/* ── SPORTS fields ── */}
      {category === 'Sports' && (
        <>
          <Text style={[f.sectionLabel, { color: catColor }]}>🏅 Sports details</Text>

          <Text style={[f.label, { color: colors.textSecondary }]}>Sport</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {SPORT_TYPES.map(t => <Chip key={t} label={t} active={sportType === t} color={catColor} onPress={() => setSportType(p => p === t ? '' : t)} small />)}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[f.label, { color: colors.textSecondary }]}>🏅 Coach</Text>
              <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                placeholder="Coach Williams" placeholderTextColor={colors.textTertiary}
                value={coachName} onChangeText={setCoachName}
                onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Coach" on "CategoryFields(${category})" newValue=${coachName} [features/calendar/components/eventForm/CategoryFields.tsx:125]`)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[f.label, { color: colors.textSecondary }]}>📍 Venue</Text>
              <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                placeholder="Riverside Park" placeholderTextColor={colors.textTertiary}
                value={venueLocation} onChangeText={setVenueLocation}
                onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Venue" on "CategoryFields(${category})" newValue=${venueLocation} [features/calendar/components/eventForm/CategoryFields.tsx:131]`)} />
            </View>
          </View>

          <Text style={[f.label, { color: colors.textSecondary }]}>📍 Pickup from</Text>
          <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
            placeholder="Home / School" placeholderTextColor={colors.textTertiary}
            value={pickupLocation} onChangeText={setPickupLocation}
            onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Pickup from" on "CategoryFields(${category})" newValue=${pickupLocation} [features/calendar/components/eventForm/CategoryFields.tsx:138]`)} />

          {/* Kit reminder */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 }}>
            <View>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>🎒 Kit reminder</Text>
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>Notify player to pack gear beforehand</Text>
            </View>
            <Switch value={kitReminder} onValueChange={(v) => { console.log(`[UserAction] FORM screen=Schedule toggled "Kit reminder" on CategoryFields(${category}) newValue=${v} [features/calendar/components/eventForm/CategoryFields.tsx:146]`); setKitReminder(v); }}
              trackColor={{ false: colors.border, true: catColor + '80' }}
              thumbColor={kitReminder ? catColor : colors.textTertiary} />
          </View>
        </>
      )}

      {/* ── STUDY fields ── */}
      {category === 'Study' && (
        <>
          <Text style={[f.sectionLabel, { color: catColor }]}>📚 Study details</Text>

          <Text style={[f.label, { color: colors.textSecondary }]}>Subject</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {SUBJECTS.map(s => <Chip key={s} label={s} active={subject === s} color={catColor} onPress={() => setSubject(p => p === s ? '' : s)} small />)}
            </View>
          </ScrollView>

          <Text style={[f.label, { color: colors.textSecondary }]}>📚 Tutor name</Text>
          <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
            placeholder="Mr. Kumar" placeholderTextColor={colors.textTertiary}
            value={tutorName} onChangeText={setTutorName}
            onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Tutor name" on "CategoryFields(${category})" newValue=${tutorName} [features/calendar/components/eventForm/CategoryFields.tsx:168]`)} />

          {/* Online toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>🖥️ Online session</Text>
            <Switch value={isOnline} onValueChange={(v) => { console.log(`[UserAction] FORM screen=Schedule toggled "Online session" on CategoryFields(${category}) newValue=${v} [features/calendar/components/eventForm/CategoryFields.tsx:173]`); setIsOnline(v); }}
              trackColor={{ false: colors.border, true: catColor + '80' }}
              thumbColor={isOnline ? catColor : colors.textTertiary} />
          </View>
          {isOnline ? (
            <>
              <Text style={[f.label, { color: colors.textSecondary }]}>🔗 Meeting link</Text>
              <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                placeholder="https://zoom.us/j/..." placeholderTextColor={colors.textTertiary}
                value={meetingUrl} onChangeText={setMeetingUrl} keyboardType="url" autoCapitalize="none"
                onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Meeting link" on "CategoryFields(${category})" newValue=${meetingUrl} [features/calendar/components/eventForm/CategoryFields.tsx:182]`)} />
            </>
          ) : (
            <>
              <Text style={[f.label, { color: colors.textSecondary }]}>📍 Location</Text>
              <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                placeholder="Home / Library" placeholderTextColor={colors.textTertiary}
                value={venueLocation} onChangeText={setVenueLocation}
                onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Location" on "CategoryFields(${category})" newValue=${venueLocation} [features/calendar/components/eventForm/CategoryFields.tsx:189]`)} />
              {/* External tutor + in-person → show drop & pickup */}
              {!helperId && tutorName.trim().length > 0 && (
                <>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[f.label, { color: colors.textSecondary }]}>📍 Pickup from</Text>
                      <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                        placeholder="Home / School" placeholderTextColor={colors.textTertiary}
                        value={pickupLocation} onChangeText={setPickupLocation}
                        onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Pickup from" on "CategoryFields(${category}) Study" newValue=${pickupLocation} [features/calendar/components/eventForm/CategoryFields.tsx:198]`)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[f.label, { color: colors.textSecondary }]}>🏁 Drop to</Text>
                      <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                        placeholder="Tutor's place / Library" placeholderTextColor={colors.textTertiary}
                        value={dropLocation} onChangeText={setDropLocation}
                        onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Drop to" on "CategoryFields(${category}) Study" newValue=${dropLocation} [features/calendar/components/eventForm/CategoryFields.tsx:204]`)} />
                    </View>
                  </View>
                  {/* Drive Assignment + return-pickup scheduling are both
                      parent-only — a kid can't pick who drives them, and
                      "Return pickup" is a driver-assignment concept that
                      makes no sense floating with no picker above it.
                      Previously only the MemberPicker was gated; the
                      return-pickup block right after it rendered
                      unconditionally, leaving a kid an orphaned date/time
                      field with no context (Round 12 follow-up — form
                      parity check). A kid's own pickup timing already
                      lives in HelperAssignmentSection's ride-needed
                      toggle. */}
                  {!isKid && (
                    <>
                      <View style={{ marginBottom: 14, gap: 8 }}>
                        <MemberPicker
                          label="🚗 Drive Assignment"
                          selectedIds={driverId ? [driverId] : []}
                          members={adults}
                          onToggle={handleDriverSelect}
                          colors={colors} isDark={isDark} siblings={siblings}
                        />
                        {!driverId && (
                          <TextInput
                            style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                            placeholder="Or type a name (e.g. external driver)"
                            placeholderTextColor={colors.textTertiary}
                            value={driverName}
                            onChangeText={t => { setDriverName(t); if (!t) setDriverId(undefined); }}
                            onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Driver name" on "CategoryFields(${category}) Study" newValue=${driverName} [features/calendar/components/eventForm/CategoryFields.tsx:244]`)}
                          />
                        )}
                      </View>
                      <Text style={[f.label, { color: colors.textSecondary }]}>🔁 Return pickup (optional)</Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                        <TouchableOpacity
                          style={[f.dateBtn, { flex: 3, backgroundColor: showReturnDatePick ? catColor + '20' : colors.surface, borderColor: showReturnDatePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                          onPress={() => { console.log(`[UserAction] screen=Schedule tapped "Return date" field on CategoryFields(${category}) Study [features/calendar/components/eventForm/CategoryFields.tsx:252]`); setShowReturnDatePick(p => !p); setShowReturnTimePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
                        >
                          <Text style={{ fontSize: 13 }}>📅</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnDatePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                            {returnDate ? fmtDisplay(returnDate) : 'Return date'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[f.dateBtn, { flex: 2, backgroundColor: showReturnTimePick ? catColor + '20' : colors.surface, borderColor: showReturnTimePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                          onPress={() => { console.log(`[UserAction] screen=Schedule tapped "Return time" field on CategoryFields(${category}) Study [features/calendar/components/eventForm/CategoryFields.tsx:261]`); setShowReturnTimePick(p => !p); setShowReturnDatePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
                        >
                          <Text style={{ fontSize: 13 }}>🕐</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnTimePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                            {returnDate ? fmtTimeDisplay(returnDate) : 'Time'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── RIDE fields ── */}
      {category === 'Ride' && (
        <>
          <Text style={[f.sectionLabel, { color: catColor }]}>🚗 Ride details</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[f.label, { color: colors.textSecondary }]}>📍 Pickup from</Text>
              <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                placeholder="Home / School" placeholderTextColor={colors.textTertiary}
                value={pickupLocation} onChangeText={setPickupLocation}
                onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Pickup from" on "CategoryFields(${category})" newValue=${pickupLocation} [features/calendar/components/eventForm/CategoryFields.tsx:287]`)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[f.label, { color: colors.textSecondary }]}>🏁 Drop to</Text>
              <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface,
                borderColor: dropLocation ? colors.borderMed : colors.warning + '60' }]}
                placeholder="Chess Club, Oak St" placeholderTextColor={colors.textTertiary}
                value={dropLocation} onChangeText={setDropLocation}
                onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Drop to" on "CategoryFields(${category})" newValue=${dropLocation} [features/calendar/components/eventForm/CategoryFields.tsx:296]`)} />
            </View>
          </View>
          <Text style={[f.label, { color: colors.textSecondary }]}>🔁 Return pickup (optional)</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <TouchableOpacity
              style={[f.dateBtn, { flex: 3, backgroundColor: showReturnDatePick ? catColor + '20' : colors.surface, borderColor: showReturnDatePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
              onPress={() => { console.log(`[UserAction] screen=Schedule tapped "Return date" field on CategoryFields(${category}) Ride [features/calendar/components/eventForm/CategoryFields.tsx:303]`); setShowReturnDatePick(p => !p); setShowReturnTimePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
            >
              <Text style={{ fontSize: 13 }}>📅</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnDatePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                {returnDate ? fmtDisplay(returnDate) : 'Return date'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[f.dateBtn, { flex: 2, backgroundColor: showReturnTimePick ? catColor + '20' : colors.surface, borderColor: showReturnTimePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
              onPress={() => { console.log(`[UserAction] screen=Schedule tapped "Return time" field on CategoryFields(${category}) Ride [features/calendar/components/eventForm/CategoryFields.tsx:312]`); setShowReturnTimePick(p => !p); setShowReturnDatePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
            >
              <Text style={{ fontSize: 13 }}>🕐</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnTimePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                {returnDate ? fmtTimeDisplay(returnDate) : 'Time'}
              </Text>
            </TouchableOpacity>
          </View>
          <PickerOverlay
            showDate={showReturnDatePick} showTime={showReturnTimePick}
            value={returnDate ?? eventDate}
            onChangeDate={d => { const m = returnDate ? new Date(returnDate) : new Date(eventDate); m.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setReturnDate(m); }}
            onChangeTime={d => { const m = returnDate ? new Date(returnDate) : new Date(eventDate); m.setHours(d.getHours(), d.getMinutes()); setReturnDate(m); }}
            onDone={() => { setShowReturnDatePick(false); setShowReturnTimePick(false); }}
            accentColor={catColor} colors={colors}
            dateLabel="📅 Return Date" timeLabel="🕐 Return Time"
            minimumDate={new Date()}
          />

          {/* ── GP + Teen toggles always shown for Ride (parent/senior only) ── */}
          {!isKid && !isTeen && (
            <View style={{ gap: 10, marginTop: 4, marginBottom: 14 }}>
              {/* Grandparents Welcome. Border/track/toggle fill use colors.warning
                  (closest token to the amber highlight). The darker on-tint text
                  shades (#92400E / #B45309) have no token equivalent — the
                  semantic palette only defines one amber value per mode, not a
                  separate darker "text on amber tint" shade — so those two stay
                  documented hardcoded hex rather than guessing a mismatched token. */}
              <TouchableOpacity
                onPress={() => { const v = !openToGrandparents; console.log(`[UserAction] FORM screen=Schedule toggled "Grandparents Welcome" on CategoryFields(${category}) Ride newValue=${v} [features/calendar/components/eventForm/CategoryFields.tsx:341]`); setGpTeenToggledByUser(true); setOpenToGrandparents(v); }}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: openToGrandparents ? colors.warning : (isDark ? colors.border : '#E2E8F0'),
                  backgroundColor: openToGrandparents ? (isDark ? '#2D1800' : colors.warningLight) : (isDark ? colors.surface : '#F9FAFB'),
                }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: openToGrandparents ? '#92400E' : colors.textPrimary }}>
                    👴👵 Grandparents Welcome
                  </Text>
                  <Text style={{ fontSize: TYPO.label, color: openToGrandparents ? '#B45309' : colors.textSecondary }}>
                    {openToGrandparents ? 'GPs can claim this ride or pass, no pressure' : 'Off · only visible to parents'}
                  </Text>
                </View>
                <View style={{ width: 44, height: 26, borderRadius: 13,
                  backgroundColor: openToGrandparents ? colors.warning : (isDark ? '#334155' : '#CBD5E1'),
                  justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textInverse,
                    alignSelf: openToGrandparents ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>

              {/* Teen driver — only if teens exist in family */}
              {/* Indigo (#6366F1 family) is the Teen-Welcome legend color used
                  throughout this file. constants/colors.ts has no indigo/violet
                  token — only 6 semantic tokens (danger/warning/success/info/
                  primary/accent), none of which is a close hue match — so this
                  stays a documented hardcoded swatch rather than guessing a
                  wrong semantic color onto it. */}
              {members.some(m => m.role === 'teen') && (
                <TouchableOpacity
                  onPress={() => { const v = !openToTeens; console.log(`[UserAction] FORM screen=Schedule toggled "Teen Driver Welcome" on CategoryFields(${category}) Ride newValue=${v} [features/calendar/components/eventForm/CategoryFields.tsx:374]`); setGpTeenToggledByUser(true); setOpenToTeens(v); }}
                  activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: openToTeens ? '#6366F1' : (isDark ? colors.border : '#E2E8F0'),
                    backgroundColor: openToTeens ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? colors.surface : '#F9FAFB'),
                  }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: openToTeens ? '#3730A3' : colors.textPrimary }}>
                      🚗 Teen Driver Welcome
                    </Text>
                    <Text style={{ fontSize: TYPO.label, color: openToTeens ? '#4338CA' : colors.textSecondary }}>
                      {openToTeens ? 'Teen can drive · set coins below' : 'Off · teen driver not offered'}
                    </Text>
                  </View>
                  <View style={{ width: 44, height: 26, borderRadius: 13,
                    backgroundColor: openToTeens ? '#6366F1' : (isDark ? '#334155' : '#CBD5E1'),
                    justifyContent: 'center', paddingHorizontal: 3 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textInverse,
                      alignSelf: openToTeens ? 'flex-end' : 'flex-start' }} />
                  </View>
                </TouchableOpacity>
              )}
              {openToTeens && members.some(m => m.role === 'teen') && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, flex: 1 }}>🪙 Coins for teen driver</Text>
                  <TextInput
                    style={[f.input, { flex: 0, width: 80, textAlign: 'center', color: colors.textPrimary, backgroundColor: colors.surface, borderColor: '#6366F1' }]}
                    keyboardType="numeric" maxLength={4}
                    placeholder="0" placeholderTextColor={colors.textTertiary}
                    value={rideCoinsTeen} onChangeText={setRideCoinsTeen}
                    onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Coins for teen driver" on "CategoryFields(${category}) Ride" newValue=${rideCoinsTeen} [features/calendar/components/eventForm/CategoryFields.tsx:405]`)}
                  />
                </View>
              )}
            </View>
          )}
        </>
      )}

      {/* ── EVENT / BIRTHDAY fields ── */}
      {(category === 'Event' || category === 'Birthday') && (
        <>
          <Text style={[f.sectionLabel, { color: catColor }]}>
            {category === 'Birthday' ? '🎂 Party details' : '🎉 Event details'}
          </Text>
          <Text style={[f.label, { color: colors.textSecondary }]}>📍 Location</Text>
          <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
            placeholder={category === 'Birthday' ? "Friend's house / venue" : 'Living Room / Park / Restaurant'}
            placeholderTextColor={colors.textTertiary}
            value={generalLocation} onChangeText={setGeneralLocation}
            onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Location" on "CategoryFields(${category})" newValue=${generalLocation} [features/calendar/components/eventForm/CategoryFields.tsx:426]`)} />
          {category === 'Birthday' && (
            <>
              <Text style={[f.label, { color: colors.textSecondary }]}>🔁 Return pickup (optional)</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <TouchableOpacity
                  style={[f.dateBtn, { flex: 3, backgroundColor: showReturnDatePick ? catColor + '20' : colors.surface, borderColor: showReturnDatePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                  onPress={() => { console.log(`[UserAction] screen=Schedule tapped "Pickup date" field on CategoryFields(${category}) Birthday [features/calendar/components/eventForm/CategoryFields.tsx:433]`); setShowReturnDatePick(p => !p); setShowReturnTimePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
                >
                  <Text style={{ fontSize: 13 }}>📅</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnDatePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                    {returnDate ? fmtDisplay(returnDate) : 'Pickup date'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[f.dateBtn, { flex: 2, backgroundColor: showReturnTimePick ? catColor + '20' : colors.surface, borderColor: showReturnTimePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                  onPress={() => { console.log(`[UserAction] screen=Schedule tapped "Pickup time" field on CategoryFields(${category}) Birthday [features/calendar/components/eventForm/CategoryFields.tsx:442]`); setShowReturnTimePick(p => !p); setShowReturnDatePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
                >
                  <Text style={{ fontSize: 13 }}>🕐</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnTimePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                    {returnDate ? fmtTimeDisplay(returnDate) : 'Time'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </>
      )}

      {/* ── ERRAND fields ── */}
      {category === 'Errand' && (
        <>
          <Text style={[f.sectionLabel, { color: catColor }]}>🛒 Errand details</Text>
          <Text style={[f.label, { color: colors.textSecondary }]}>📍 Where</Text>
          <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
            placeholder="Supermarket / Mall / Pharmacy" placeholderTextColor={colors.textTertiary}
            value={generalLocation} onChangeText={setGeneralLocation}
            onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Where" on "CategoryFields(${category})" newValue=${generalLocation} [features/calendar/components/eventForm/CategoryFields.tsx:462]`)} />
          <Text style={[f.label, { color: colors.textSecondary }]}>🔁 Expected return (optional)</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <TouchableOpacity
              style={[f.dateBtn, { flex: 3, backgroundColor: showReturnDatePick ? catColor + '20' : colors.surface, borderColor: showReturnDatePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
              onPress={() => { console.log(`[UserAction] screen=Schedule tapped "Return date" field on CategoryFields(${category}) Errand [features/calendar/components/eventForm/CategoryFields.tsx:467]`); setShowReturnDatePick(p => !p); setShowReturnTimePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
            >
              <Text style={{ fontSize: 13 }}>📅</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnDatePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                {returnDate ? fmtDisplay(returnDate) : 'Return date'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[f.dateBtn, { flex: 2, backgroundColor: showReturnTimePick ? catColor + '20' : colors.surface, borderColor: showReturnTimePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
              onPress={() => { console.log(`[UserAction] screen=Schedule tapped "Return time" field on CategoryFields(${category}) Errand [features/calendar/components/eventForm/CategoryFields.tsx:476]`); setShowReturnTimePick(p => !p); setShowReturnDatePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
            >
              <Text style={{ fontSize: 13 }}>🕐</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnTimePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                {returnDate ? fmtTimeDisplay(returnDate) : 'Time'}
              </Text>
            </TouchableOpacity>
          </View>

          <GroceryLinkSection
            colors={colors} isDark={isDark} catColor={catColor}
            linkGroceries={linkGroceries} setLinkGroceries={setLinkGroceries}
            loadingGroceries={loadingGroceries} groceryItems={groceryItems}
            selectedItemIds={selectedItemIds} setSelectedItemIds={setSelectedItemIds}
            newGroceryLines={newGroceryLines} setNewGroceryLines={setNewGroceryLines}
            focusedLineIdx={focusedLineIdx} setFocusedLineIdx={setFocusedLineIdx}
            focusedField={focusedField} setFocusedField={setFocusedField}
            generalLocation={generalLocation}
            cachedItemNames={cachedItemNames} cachedStores={cachedStores}
          />
        </>
      )}

      {/* ── OTHER fields ── */}
      {category === 'Other' && (
        <>
          <Text style={[f.sectionLabel, { color: catColor }]}>✨ Custom event</Text>
          <Text style={[f.label, { color: colors.textSecondary }]}>📍 Location (optional)</Text>
          <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
            placeholder="Where is this happening?" placeholderTextColor={colors.textTertiary}
            value={generalLocation} onChangeText={setGeneralLocation}
            onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Location" on "CategoryFields(${category}) Other" newValue=${generalLocation} [features/calendar/components/eventForm/CategoryFields.tsx:508]`)} />
        </>
      )}
    </>
  );
}
