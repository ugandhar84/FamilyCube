import { useState } from 'react';
import { View, Text, Pressable, Alert, TextInput } from 'react-native';
import {
  AlertOctagon, Car, ChevronDown, ChevronUp, Hand, Star,
  Pill, CheckCircle, Leaf, Camera, Heart, MapPin,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import HelpQueueSection from '@/components/HelpQueueSection';
import { useEventStore } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { SectionCard, CollapsibleCard, SubCard } from './hubComponents';
import { localToday, fmtTime, isWorkEvent, hoursUntilEvent } from './hubUtils';

const DECLINE_PRESETS = ['Schedule conflict', 'Vehicle unavailable', 'Feeling unwell', 'Work commitment'];

export function SeniorView({ active, members, colors, isDark, onHelpRequest, onEnRoute }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onHelpRequest: () => void;
  onEnRoute: () => void;
}) {
  const { events, updateEvent } = useEventStore();
  const { awardCoins } = useFamilyStore();
  const kids    = members.filter(m => m.role === 'kid');
  const allNames = members.map(m => m.name);
  const today   = localToday();

  const [sosActive, setSosActive]   = useState(false);
  const [declineId,  setDeclineId]  = useState<string | null>(null);
  const [declineText, setDeclineText] = useState('');
  const [gpKid, setGpKid]           = useState<FamilyMember | null>(null);
  const [gpAmount, setGpAmount]   = useState<15 | 25 | 50>(25);
  const [gpNote, setGpNote]       = useState('');
  const [gpSent, setGpSent]       = useState(false);
  const [medsTaken, setMedsTaken] = useState<Record<string, boolean>>({});

  const MEDS = [
    { id: 'med1', name: 'Blood pressure pill', time: '8:00 AM',  Icon: Pill },
    { id: 'med2', name: 'Vitamin D',           time: '8:00 AM',  Icon: Star },
    { id: 'med3', name: 'Omega-3',             time: '12:00 PM', Icon: Heart },
  ];

  const myDrivingToday = events.filter(e =>
    e.date === today && e.helper === active.name &&
    e.helperStatus === 'confirmed' && !isWorkEvent(e)
  );
  // Assigned to me but I haven't replied yet — not Work events
  const myPendingAssignments = events.filter(e =>
    e.date === today && e.helper === active.name &&
    e.helperStatus === 'pending' && !e.approvalPending && !isWorkEvent(e)
  );
  // Kid-initiated requests that need a volunteer (no helper yet, family approval pending) — not Work
  const openRequests = events.filter(e =>
    e.date === today && e.approvalPending && !e.helper && !isWorkEvent(e)
  );
  // Urgent pending: I still haven't replied and < 1 hr to go
  const urgentPending = myPendingAssignments.filter(e =>
    hoursUntilEvent(e.date, e.time) < 1 && hoursUntilEvent(e.date, e.time) >= 0
  );

  // GP volunteer pool: someone else is assigned (pending, not me) within 0–4 hrs
  // Exclude events where I'm already confirmed as driver within 30 min (would create a conflict)
  const myConfirmedTimes = myDrivingToday
    .filter(e => !!e.time)
    .map(e => { const [h, m] = e.time!.split(':').map(Number); return h * 60 + m; });

  const volunteerPool = events.filter(e => {
    if (!e.date || e.date !== today) return false;
    if (isWorkEvent(e)) return false;
    if (!e.helper || e.helperStatus !== 'pending') return false;
    if (e.helper === active.name) return false;      // already assigned to me
    if (e.approvalPending) return false;             // kid-initiated, parent hasn't approved
    const hrs = hoursUntilEvent(e.date, e.time);
    if (hrs < 0 || hrs > 4) return false;            // only 0–4 hr window
    // Don't offer if I'd create a driver conflict with my confirmed drives
    if (e.time) {
      const [h, m] = e.time.split(':').map(Number);
      const evMin = h * 60 + m;
      if (myConfirmedTimes.some(ct => Math.abs(ct - evMin) < 30)) return false;
    }
    return true;
  });

  const pad = { paddingHorizontal: 16 };
  const driveAlerts = myDrivingToday.length + myPendingAssignments.length + openRequests.length + volunteerPool.length;

  const handleSendBonus = () => {
    if (!gpKid) return;
    awardCoins(gpKid.id, gpAmount, 'gpCoins');
    setGpSent(true);
    setTimeout(() => { setGpSent(false); setGpKid(null); setGpNote(''); }, 2500);
  };

  return (
    <>
      {/* Emergency SOS */}
      <View style={[pad, { marginBottom: 14 }]}>
        {sosActive ? (
          <View style={{ borderRadius: 20, backgroundColor: '#450A0A', borderWidth: 2, borderColor: '#EF4444', padding: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <AlertOctagon size={16} color="#EF4444" />
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#FCA5A5', flex: 1 }}>SOS Alert Sent to Family</Text>
              <Pressable onPress={() => setSosActive(false)} style={{ backgroundColor: '#EF444430', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#EF4444' }}>Cancel</Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: 13, color: '#F87171', lineHeight: 19 }}>
              Parents have been notified with your location. Help is on the way.{'\n'}Stay where you are.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => router.push('/(tabs)/chat')} style={{ flex: 1, borderRadius: 12, backgroundColor: '#EF4444', paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Call Family</Text>
              </Pressable>
              <Pressable onPress={() => setSosActive(false)} style={{ flex: 1, borderRadius: 12, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', paddingVertical: 11, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#F87171' }}>I'm OK Now</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => Alert.alert(
            'Send Emergency SOS?',
            'This will immediately alert all family members with your location.',
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Send SOS', style: 'destructive', onPress: () => setSosActive(true) }]
          )} style={{ borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: isDark ? '#1A0000' : '#FFF1F1', borderWidth: 2, borderColor: '#EF444450' }}>
            <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
              <AlertOctagon size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#EF4444' }}>Emergency SOS</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Alert family + share location instantly</Text>
            </View>
            <View style={{ backgroundColor: '#EF444420', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#EF4444' }}>Hold</Text>
            </View>
          </Pressable>
        )}
      </View>

      {/* GP Bonus Dispenser */}
      <View style={pad}>
        <SectionCard
          icon={<Star size={16} color={BRAND.purple} />}
          title="Send Grandparent Bonus"
          badge={kids.length || undefined} badgeColor={BRAND.purple}
          colors={colors} isDark={isDark}>
          {kids.length === 0 ? (
            <SubCard colors={colors} isDark={isDark} style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>No grandchildren added yet.</Text>
            </SubCard>
          ) : gpSent ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
              <Star size={40} color="#10B981" />
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#10B981' }}>Bonus sent!</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>{gpAmount} coins delivered</Text>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Select grandchild</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {kids.map(kid => (
                  <Pressable key={kid.id} onPress={() => setGpKid(gpKid?.id === kid.id ? null : kid)}
                    style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: gpKid?.id === kid.id ? BRAND.purple : (isDark ? colors.surface : '#F5F0FF'), borderWidth: 1.5, borderColor: gpKid?.id === kid.id ? BRAND.purple : BRAND.purple + '30' }}>
                    <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} siblings={allNames} size={26} ringColor={gpKid?.id === kid.id ? '#fff' : BRAND.purple} ringWidth={1} />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: gpKid?.id === kid.id ? '#fff' : BRAND.purple }}>
                      {kid.name.split(' ')[0]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Amount</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {([15, 25, 50] as const).map(amt => (
                  <Pressable key={amt} onPress={() => setGpAmount(amt)} style={{ flex: 1, borderRadius: 14, paddingVertical: 11, alignItems: 'center', backgroundColor: gpAmount === amt ? BRAND.amber : (isDark ? colors.surface : '#FFF8E8'), borderWidth: 1.5, borderColor: gpAmount === amt ? BRAND.amber : BRAND.amber + '40' }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: gpAmount === amt ? '#0C0B14' : BRAND.amber }}>{amt}</Text>
                    <Text style={{ fontSize: 10, color: gpAmount === amt ? '#0C0B14' : colors.textTertiary, fontWeight: '600' }}>${(amt * 0.10).toFixed(2)}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Add a note (optional)</Text>
              <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E8E8F0', backgroundColor: isDark ? colors.surface : '#FAFAFA', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 }}>
                <TextInput value={gpNote} onChangeText={setGpNote} placeholder="Great job on your test!" placeholderTextColor={colors.textTertiary} style={{ fontSize: 13, color: colors.textPrimary, minHeight: 36 }} multiline />
              </View>
              <Pressable onPress={handleSendBonus} disabled={!gpKid} style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: gpKid ? BRAND.purple : (isDark ? colors.surface : '#EEE'), opacity: gpKid ? 1 : 0.5 }}>
                <Star size={18} color={gpKid ? '#fff' : colors.textTertiary} />
                <Text style={{ fontSize: 14, fontWeight: '900', color: gpKid ? '#fff' : colors.textTertiary }}>
                  Send {gpAmount} GP Coins{gpKid ? ` to ${gpKid.name.split(' ')[0]}` : ''}
                </Text>
              </Pressable>
            </>
          )}
        </SectionCard>
      </View>

      {/* Medication Tracker */}
      <View style={pad}>
        <SectionCard
          icon={<Pill size={16} color="#EF4444" />}
          title="Today's Medications"
          badge={MEDS.filter(m => !medsTaken[m.id]).length || undefined} badgeColor="#EF4444"
          colors={colors} isDark={isDark}>
          {MEDS.map((med, i) => {
            const taken = !!medsTaken[med.id];
            return (
              <View key={med.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: i < MEDS.length - 1 ? 1 : 0, borderBottomColor: isDark ? colors.border : '#F1F5F9' }}>
                <med.Icon size={22} color={taken ? colors.textTertiary : BRAND.teal} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: taken ? colors.textTertiary : colors.textPrimary, textDecorationLine: taken ? 'line-through' : 'none' }}>{med.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary }}>{med.time}</Text>
                </View>
                <Pressable onPress={() => setMedsTaken(prev => ({ ...prev, [med.id]: !taken }))} style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: taken ? '#10B98120' : BRAND.teal, borderWidth: taken ? 1 : 0, borderColor: '#10B98140' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: taken ? '#10B981' : '#fff' }}>
                    {taken ? 'Taken' : 'Mark Taken'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {MEDS.every(m => medsTaken[m.id]) && (
            <View style={{ alignItems: 'center', paddingVertical: 10, gap: 4 }}>
              <CheckCircle size={26} color="#10B981" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>All done for today!</Text>
            </View>
          )}
        </SectionCard>
      </View>

      {/* Driving Duty */}
      <View style={pad}>
        <SectionCard
          icon={<Car size={16} color="#10B981" />}
          title="Driving Duty"
          badge={driveAlerts || undefined} badgeColor="#10B981"
          colors={colors} isDark={isDark}>
          {myPendingAssignments.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            const isUrgent = urgentPending.some(u => u.id === ev.id);
            return (
              <CollapsibleCard key={ev.id} accent={isUrgent ? '#EF4444' : BRAND.amber} colors={colors} isDark={isDark} defaultExpanded
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Car size={16} color={BRAND.amber} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.amber }} numberOfLines={1}>{ev.title}</Text>
                      <Text style={{ fontSize: TYPO.label, color: BRAND.amber, opacity: 0.75 }}>{kid?.name.split(' ')[0] ?? 'Kid'} · {fmtTime(ev.time)}</Text>
                    </View>
                    <View style={{ backgroundColor: (isUrgent ? '#EF4444' : BRAND.amber) + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: isUrgent ? '#EF4444' : BRAND.amber }}>
                        {isUrgent ? '🚨 Urgent' : 'Needs Reply'}
                      </Text>
                    </View>
                  </View>
                }>
                {ev.location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <MapPin size={12} color={colors.textSecondary} />
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{ev.location}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => updateEvent(ev.id, { helperStatus: 'confirmed' })}
                    style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Car size={14} color="#fff" />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>Accept Drive</Text>
                  </Pressable>
                  <Pressable onPress={() => { setDeclineId(ev.id); setDeclineText(''); }}
                    style={{ flex: 1, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>Decline</Text>
                  </Pressable>
                </View>
                {declineId === ev.id && (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>Reason for declining *</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {DECLINE_PRESETS.map(p => (
                        <Pressable key={p} onPress={() => setDeclineText(p)}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
                            backgroundColor: declineText === p ? '#EF4444' : (isDark ? colors.card : '#fff'),
                            borderColor: declineText === p ? '#EF4444' : '#FCA5A5' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: declineText === p ? '#fff' : '#EF4444' }}>{p}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput value={declineText} onChangeText={setDeclineText} maxLength={120} multiline
                      placeholder="Or type your reason…" placeholderTextColor={colors.textTertiary}
                      style={{ borderWidth: 1, borderColor: declineText.trim() ? '#EF444460' : colors.border,
                        borderRadius: 10, padding: 10, fontSize: TYPO.label, color: colors.textPrimary,
                        backgroundColor: isDark ? colors.card : '#FEF2F2', minHeight: 36 }} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={() => setDeclineId(null)}
                        style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        disabled={!declineText.trim()}
                        onPress={() => {
                          updateEvent(ev.id, { helperStatus: 'rejected', declinedBy: active.name, declineReason: declineText.trim() });
                          setDeclineId(null); setDeclineText('');
                        }}
                        style={{ flex: 2, backgroundColor: declineText.trim() ? '#EF4444' : colors.border,
                          borderRadius: 12, paddingVertical: 10, alignItems: 'center', opacity: declineText.trim() ? 1 : 0.5 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Confirm Decline</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </CollapsibleCard>
            );
          })}
          {myDrivingToday.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            return (
              <CollapsibleCard key={ev.id} accent="#10B981" colors={colors} isDark={isDark} defaultExpanded={false}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Car size={16} color="#10B981" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#10B981' }} numberOfLines={1}>{ev.title}</Text>
                      <Text style={{ fontSize: TYPO.label, color: '#10B981', opacity: 0.75 }}>{kid?.name.split(' ')[0] ?? 'Kid'} · {fmtTime(ev.time)}</Text>
                    </View>
                    <View style={{ backgroundColor: '#10B98120', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#10B981' }}>Assigned</Text>
                    </View>
                  </View>
                }>
                {ev.location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} color={colors.textSecondary} />
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{ev.location}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={onEnRoute} style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Car size={14} color="#fff" />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>I'm En Route</Text>
                  </Pressable>
                  <Pressable onPress={() => { setDeclineId(ev.id); setDeclineText(''); }}
                    style={{ flex: 1, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>Can't Make It</Text>
                  </Pressable>
                </View>
                {declineId === ev.id && (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>Reason for declining *</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {DECLINE_PRESETS.map(p => (
                        <Pressable key={p} onPress={() => setDeclineText(p)}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
                            backgroundColor: declineText === p ? '#EF4444' : (isDark ? colors.card : '#fff'),
                            borderColor: declineText === p ? '#EF4444' : '#FCA5A5' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: declineText === p ? '#fff' : '#EF4444' }}>{p}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput value={declineText} onChangeText={setDeclineText} maxLength={120} multiline
                      placeholder="Or type your reason…" placeholderTextColor={colors.textTertiary}
                      style={{ borderWidth: 1, borderColor: declineText.trim() ? '#EF444460' : colors.border,
                        borderRadius: 10, padding: 10, fontSize: TYPO.label, color: colors.textPrimary,
                        backgroundColor: isDark ? colors.card : '#FEF2F2', minHeight: 36 }} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={() => setDeclineId(null)}
                        style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        disabled={!declineText.trim()}
                        onPress={() => {
                          updateEvent(ev.id, { helperStatus: 'rejected', declinedBy: active.name, declineReason: declineText.trim() });
                          setDeclineId(null); setDeclineText('');
                        }}
                        style={{ flex: 2, backgroundColor: declineText.trim() ? '#EF4444' : colors.border,
                          borderRadius: 12, paddingVertical: 10, alignItems: 'center', opacity: declineText.trim() ? 1 : 0.5 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Confirm Decline</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </CollapsibleCard>
            );
          })}
          {openRequests.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            return (
              <CollapsibleCard key={ev.id} accent={BRAND.amber} colors={colors} isDark={isDark} defaultExpanded={false}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Hand size={16} color={BRAND.amber} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.amber }} numberOfLines={1}>{ev.title}</Text>
                      <Text style={{ fontSize: TYPO.label, color: BRAND.amber, opacity: 0.75 }}>{fmtTime(ev.time)}{ev.location ? ` · ${ev.location}` : ''}</Text>
                    </View>
                    <View style={{ backgroundColor: BRAND.amber + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.amber }}>Open</Text>
                    </View>
                  </View>
                }>
                {kid && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} siblings={allNames} size={26} ringColor={BRAND.amber} />
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>For <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{kid.name.split(' ')[0]}</Text></Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false, helper: active.name, helperStatus: 'confirmed' })}
                    style={{ flex: 1, backgroundColor: BRAND.purple, paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Car size={14} color="#fff" />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>I'll Drive</Text>
                  </Pressable>
                  <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false })}
                    style={{ flex: 1, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>Pass</Text>
                  </Pressable>
                </View>
              </CollapsibleCard>
            );
          })}
          {volunteerPool.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            const hrs = hoursUntilEvent(ev.date, ev.time);
            const isReallyUrgent = hrs < 1;
            return (
              <CollapsibleCard key={`vol-${ev.id}`} accent={isReallyUrgent ? '#EF4444' : BRAND.teal}
                colors={colors} isDark={isDark} defaultExpanded={isReallyUrgent}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Car size={16} color={isReallyUrgent ? '#EF4444' : BRAND.teal} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isReallyUrgent ? '#EF4444' : BRAND.teal }} numberOfLines={1}>
                        {ev.title}
                      </Text>
                      <Text style={{ fontSize: TYPO.label, color: isReallyUrgent ? '#EF4444' : BRAND.teal, opacity: 0.75 }}>
                        {kid?.name.split(' ')[0] ?? 'Kid'} · {fmtTime(ev.time)} · {ev.helper} hasn't replied
                      </Text>
                    </View>
                    <View style={{ backgroundColor: (isReallyUrgent ? '#EF4444' : BRAND.teal) + '25', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: isReallyUrgent ? '#EF4444' : BRAND.teal }}>
                        {isReallyUrgent ? '🚨 Step In' : 'Volunteer?'}
                      </Text>
                    </View>
                  </View>
                }>
                {ev.location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                    <MapPin size={12} color={colors.textSecondary} />
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{ev.location}</Text>
                  </View>
                )}
                <View style={{ backgroundColor: isDark ? '#1e2540' : '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                    <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{ev.helper}</Text> was asked but hasn't replied.
                    {' '}If you step in, they'll be notified they're no longer needed.
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      'Step In as Driver?',
                      `You'll replace ${ev.helper} and be confirmed immediately. ${ev.helper} will be notified they're off the hook.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: "Yes, I'll Drive",
                          onPress: () => updateEvent(ev.id, {
                            helper: active.name,
                            helperStatus: 'confirmed',
                          }),
                        },
                      ]
                    )
                  }
                  style={{ backgroundColor: BRAND.teal, borderRadius: 12, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Car size={15} color="#fff" />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>I'll Step In — Confirm Drive</Text>
                </Pressable>
              </CollapsibleCard>
            );
          })}

          {myDrivingToday.length === 0 && myPendingAssignments.length === 0 && openRequests.length === 0 && volunteerPool.length === 0 && (
            <SubCard colors={colors} isDark={isDark} style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Leaf size={26} color={colors.textTertiary} />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary, marginTop: 8 }}>No driving duties today</Text>
            </SubCard>
          )}
        </SectionCard>
      </View>

      {/* Family Help Queue */}
      <View style={pad}>
        <SectionCard
          icon={<Hand size={16} color={BRAND.amber} />}
          title="Family Help Queue"
          subtitle="Kids ask for help · parents assign or self-assign"
          actionBtn={{ label: '+ Ask', onPress: onHelpRequest }}
          colors={colors} isDark={isDark}>
          <HelpQueueSection onRequestHelp={onHelpRequest} hideAskButton />
        </SectionCard>
      </View>

      {/* Family Memories */}
      <View style={pad}>
        <SectionCard icon={<Camera size={16} color={BRAND.pink} />} title="Family Memories" colors={colors} isDark={isDark}>
          <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
            <Heart size={32} color={BRAND.pink} />
            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, textAlign: 'center', fontStyle: 'italic' }}>
              Share photos with the family to see them here
            </Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/chat')} style={{ borderRadius: 12, backgroundColor: BRAND.pink, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Camera size={15} color="#fff" />
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Share in Family Chat</Text>
          </Pressable>
        </SectionCard>
      </View>
    </>
  );
}
