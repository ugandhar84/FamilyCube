import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Pressable, Alert, TextInput, Modal, Image, ScrollView } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as ImagePicker from 'expo-image-picker';
import {
  AlertOctagon, Car, ChevronDown, ChevronUp, Hand, Star,
  Pill, CheckCircle, Leaf, Camera, Heart, MapPin, Coins,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import HelpQueueSection from '@/components/HelpQueueSection';
import { useEventStore } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useGroceryStore } from '@/store/groceryStore';
import { ShoppingCart } from 'lucide-react-native';
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
  const { awardCoins, updateMember } = useFamilyStore();
  const {
    chores, updateChore, grandparentMatches, grandparentApproveAndCheer, createGrandparentQuest,
    addGrandparentMatch, startGrandparentQuest, submitGrandparentQuest,
    claimGPErrand, submitGPErrandReceipt, acknowledgeGPReimbursement,
  } = useChoreStore();
  const { requests: kidRequests, assignRequest } = useKidRequestStore();
  const gpWelcomeRequests = kidRequests.filter(r =>
    r.openToGP && r.status === 'approved' && !r.assignedHelper
  );
  // Partner chores flagged openToGP — GP can buy supplies + scan receipt
  const gpWelcomeChores = chores.filter(c =>
    (c as any).openToGP && (c.status === 'todo' || c.status === 'in_progress')
  );

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
  const [meds, setMeds] = useState<{ id: string; name: string; time: string }[]>([]);
  const MEDS_KEY = `@familycube_meds_${active.id}`;
  const MEDS_TAKEN_KEY = `@familycube_meds_taken_${active.id}_${today}`;

  useEffect(() => {
    AsyncStorage.multiGet([MEDS_KEY, MEDS_TAKEN_KEY]).then(([[, medsJson], [, takenJson]]) => {
      if (medsJson) setMeds(JSON.parse(medsJson));
      else setMeds([
        { id: 'med1', name: 'Blood pressure pill', time: '8:00 AM' },
        { id: 'med2', name: 'Vitamin D',           time: '8:00 AM' },
        { id: 'med3', name: 'Omega-3',             time: '12:00 PM' },
      ]);
      if (takenJson) setMedsTaken(JSON.parse(takenJson));
    });
  }, [active.id]);

  const toggleMed = useCallback(async (id: string) => {
    const next = (prev: Record<string, boolean>) => ({ ...prev, [id]: !prev[id] });
    setMedsTaken(prev => {
      const updated = next(prev);
      AsyncStorage.setItem(MEDS_TAKEN_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [MEDS_TAKEN_KEY]);

  // Grandparent chore actions
  const { items: groceryItems, load: loadGrocery, addItem: addGroceryItem } = useGroceryStore();
  const familyId = (active as any).familyId ?? 'family-1';
  useEffect(() => { loadGrocery(familyId); }, [familyId]);
  const [newGroceryItem, setNewGroceryItem] = useState('');
  const [groceryExpanded, setGroceryExpanded] = useState(false);

  const pendingGpApproval = chores.filter(c => c.status === 'pending_grandparent_approval' && c.sponsorUserId === active.id);
  const [cheerSticker, setCheerSticker] = useState('⭐');
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchKidId, setMatchKidId] = useState('');
  const [matchType, setMatchType] = useState<'FIXED_PERCENTAGE' | 'FIXED_AMOUNT'>('FIXED_PERCENTAGE');
  const [matchValue, setMatchValue] = useState('10');
  const [showCreateQuestModal, setShowCreateQuestModal] = useState(false);
  const [newQuestTitle,  setNewQuestTitle]  = useState('');
  const [newQuestDesc,   setNewQuestDesc]   = useState('');
  const [newQuestPoints, setNewQuestPoints] = useState('350');
  const [newQuestKidId,  setNewQuestKidId]  = useState('');
  const [newQuestMode,   setNewQuestMode]   = useState<'local' | 'virtual'>('local');
  const [newQuestPhoto,  setNewQuestPhoto]  = useState(true);

  const CHEER_STICKERS = ['⭐', '🏆', '🎉', '💪', '🌟', '❤️'];

  // ── Receipt submission modal ───────────────────────────────────────────────
  const [receiptChoreId,   setReceiptChoreId]   = useState<string | null>(null);
  const [receiptPhotoUri,  setReceiptPhotoUri]  = useState<string | null>(null);
  const [receiptAmountStr, setReceiptAmountStr] = useState('');
  const [receiptNote,      setReceiptNote]      = useState('');

  const openReceiptModal = (choreId: string) => {
    setReceiptChoreId(choreId);
    setReceiptPhotoUri(null);
    setReceiptAmountStr('');
    setReceiptNote('');
  };
  const closeReceiptModal = () => setReceiptChoreId(null);

  const pickReceiptFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to attach a receipt.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]) setReceiptPhotoUri(result.assets[0].uri);
  };

  const takeReceiptPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to scan a receipt.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]) setReceiptPhotoUri(result.assets[0].uri);
  };

  const handleSubmitReceipt = () => {
    if (!receiptChoreId) return;
    const amount = parseFloat(receiptAmountStr);
    submitGPErrandReceipt(receiptChoreId, {
      receiptPhotoUrl: receiptPhotoUri ?? undefined,
      receiptAmount:   isNaN(amount) ? undefined : amount,
      receiptNote:     receiptNote.trim() || undefined,
    });
    closeReceiptModal();
    Alert.alert('Receipt submitted!', 'Parents will see your receipt and reimburse you shortly. Thank you! 💙');
  };

  // GP-claimed errands currently in progress (inviteGrandparents tasks assigned to this GP)
  const myActiveErrands = chores.filter(c =>
    c.inviteGrandparents &&
    c.status === 'in_progress' &&
    c.assignedToId === active.id
  );

  // ── Helper Dispatch / Availability (persisted in FamilyMember) ──────────────
  const cheerleaderMode  = active.gpCheerleaderMode  ?? false;
  const driveWindowDays  = active.gpDriveWindowDays  ?? [2, 4];
  const driveWindowStart = active.gpDriveWindowStart ?? '14:00';
  const driveWindowEnd   = active.gpDriveWindowEnd   ?? '17:30';
  const weeklyRideCap    = active.gpWeeklyRideCap    ?? 2;

  const setCheerleaderMode  = (v: boolean | ((prev: boolean) => boolean)) =>
    updateMember(active.id, { gpCheerleaderMode: typeof v === 'function' ? v(cheerleaderMode) : v });
  const setDriveWindowDays  = (v: number[] | ((prev: number[]) => number[])) =>
    updateMember(active.id, { gpDriveWindowDays: typeof v === 'function' ? v(driveWindowDays) : v });
  const setDriveWindowStart = (v: string) => updateMember(active.id, { gpDriveWindowStart: v });
  const setDriveWindowEnd   = (v: string) => updateMember(active.id, { gpDriveWindowEnd: v });
  const setWeeklyRideCap    = (v: number) => updateMember(active.id, { gpWeeklyRideCap: v });
  const [availSettingsOpen, setAvailSettingsOpen] = useState(false);

  // Quests parents have flagged as open for grandparent to claim (Workflow 2)
  const gpInvitations = chores.filter(c =>
    c.inviteGrandparents && c.status === 'todo' && !c.sponsorUserId
  );
  const [passedInvitations, setPassedInvitations] = useState<string[]>([]);

  const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Checks whether an event falls inside the GP's configured drive window
  const withinDriveWindow = useCallback((ev: typeof events[0]): boolean => {
    if (!ev.date) return true; // no date set — show it
    const evDayOfWeek = new Date(ev.date + 'T12:00').getDay();
    if (!driveWindowDays.includes(evDayOfWeek)) return false;
    if (!ev.time) return true; // no time — day matches, show it
    const [evH, evM] = ev.time.split(':').map(Number);
    const evMins = evH * 60 + evM;
    const [startH, startM] = driveWindowStart.split(':').map(Number);
    const [endH, endM]     = driveWindowEnd.split(':').map(Number);
    return evMins >= startH * 60 + startM && evMins <= endH * 60 + endM;
  }, [driveWindowDays, driveWindowStart, driveWindowEnd]);

  // Events open to grandparents that this senior hasn't passed, hasn't claimed,
  // and fall within their configured availability window
  const openRides = events.filter(e =>
    e.isOpenToGrandparents &&
    e.helperStatus !== 'confirmed' &&
    !(e.grandparentPassedIds ?? []).includes(active.id) &&
    !cheerleaderMode &&
    withinDriveWindow(e)
  );

  // Rides this senior has already claimed (confirmed helper)
  const myClaimedRides = events.filter(e =>
    e.isOpenToGrandparents &&
    e.helper && (e.helper.includes(active.name) || active.name.includes(e.helper.split(' ')[0])) &&
    e.helperStatus === 'confirmed'
  );

  // Weekly claim count (current calendar week)
  const weekStart = (() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10);
  })();
  const weekEnd = (() => {
    const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().slice(0, 10);
  })();
  const ridesThisWeek = myClaimedRides.filter(e => e.date >= weekStart && e.date <= weekEnd).length;
  const atWeeklyCap   = ridesThisWeek >= weeklyRideCap;

  // Expand Helper Dispatch when there's anything actionable
  const hasDispatchItems = (openRides.length > 0 || gpInvitations.filter(c => !passedInvitations.includes(c.id)).length > 0) && !cheerleaderMode;
  const [helperDispatchExpanded, setHelperDispatchExpanded] = useState(hasDispatchItems);

  // Adds the ride to the GP's device calendar (best-effort, silent on failure)
  const addToDeviceCalendar = useCallback(async (ev: typeof events[0]) => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') return;

      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      // Prefer a writable default; fall back to first writable calendar
      const target = cals.find(c => c.allowsModifications && c.isPrimary)
        ?? cals.find(c => c.allowsModifications);
      if (!target) return;

      const kid = members.find(m => m.id === ev.memberId);
      const [y, mo, d] = (ev.date ?? today).split('-').map(Number);
      const [h, mi]    = (ev.time ?? '12:00').split(':').map(Number);
      const start = new Date(y, mo - 1, d, h, mi);
      const end   = new Date(start.getTime() + 60 * 60 * 1000); // default 1-hr slot

      await Calendar.createEventAsync(target.id, {
        title:    `🚗 ${ev.title}${kid ? ` — ${kid.name.split(' ')[0]}` : ''}`,
        startDate: start,
        endDate:   end,
        notes:    [ev.notes, ev.pickupLocation && `From: ${ev.pickupLocation}`, ev.dropLocation && `To: ${ev.dropLocation}`].filter(Boolean).join('\n'),
        alarms:   [{ relativeOffset: -30 }],
      });
    } catch {
      // calendar sync is best-effort; never block the claim flow
    }
  }, [events, members, today]);

  const handleClaimRide = (evId: string) => {
    if (atWeeklyCap) {
      Alert.alert('Weekly cap reached', `You've set a limit of ${weeklyRideCap} rides/week. Update your availability settings to take more.`);
      return;
    }
    updateEvent(evId, { helper: active.name, helperStatus: 'confirmed' });
    const ev = events.find(e => e.id === evId);
    if (ev) addToDeviceCalendar(ev);
  };

  const handlePassRide = (evId: string) => {
    const ev = events.find(e => e.id === evId);
    if (!ev) return;
    updateEvent(evId, { grandparentPassedIds: [...(ev.grandparentPassedIds ?? []), active.id] });
  };

  const handleApproveAndCheer = (choreId: string) => {
    grandparentApproveAndCheer(choreId, active.id, cheerSticker);
  };

  const handleSaveMatch = () => {
    if (!matchKidId) return;
    addGrandparentMatch({
      familyId:        (active as any).familyId ?? 'family-1',
      grandparentId:   active.id,
      childId:         matchKidId,
      matchType,
      matchValue:      parseFloat(matchValue) || 10,
      matchJar:        'SAVE',
      maxMonthlyContribution: 500,
      isActive:        true,
    });
    setShowMatchModal(false);
  };

  const handleCreateQuest = () => {
    if (!newQuestTitle.trim()) return;
    createGrandparentQuest({
      title:         newQuestTitle.trim(),
      description:   newQuestDesc.trim() || undefined,
      basePoints:    parseInt(newQuestPoints, 10) || 350,
      childIds:      newQuestKidId ? [newQuestKidId] : kids.map(k => k.id),
      sponsorId:     active.id,
      mode:          newQuestMode,
      requiresPhoto: newQuestPhoto,
    });
    setNewQuestTitle('');
    setNewQuestDesc('');
    setNewQuestPoints('350');
    setNewQuestKidId('');
    setNewQuestMode('local');
    setNewQuestPhoto(true);
    setShowCreateQuestModal(false);
  };


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

      {/* ── Helper Dispatch — Voluntary Assistance Pool ── */}
      <View style={pad}>
        <View style={{
          backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1,
          borderColor: isDark ? colors.border : '#E8E8F0',
          overflow: 'hidden', marginBottom: 12,
        }}>
          {/* Header — tap to expand/collapse the dispatch list */}
          <Pressable
            onPress={() => setHelperDispatchExpanded(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20,
              backgroundColor: '#F59E0B20', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={20} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
                  Helper Dispatch
                </Text>
                {hasDispatchItems && (
                  <View style={{ backgroundColor: '#F59E0B', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>
                      {openRides.length + gpInvitations.filter(c => !passedInvitations.includes(c.id)).length}
                    </Text>
                  </View>
                )}
                {cheerleaderMode && (
                  <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: BRAND.purple + '40' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>Cheerleader Mode</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                {cheerleaderMode
                  ? 'Driving requests hidden — enjoy the cheer feed'
                  : hasDispatchItems
                  ? `${ridesThisWeek}/${weeklyRideCap} rides claimed this week`
                  : 'No open requests right now'}
              </Text>
            </View>
            <Pressable onPress={(e) => { e.stopPropagation(); setAvailSettingsOpen(o => !o); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {availSettingsOpen ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
            </Pressable>
          </Pressable>

          {/* Availability Settings (collapsible) */}
          {availSettingsOpen && (
            <View style={{ marginHorizontal: 14, marginBottom: 14, padding: 14, borderRadius: 16,
              backgroundColor: isDark ? colors.surface : '#F8FAFC',
              borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 14 }}>

              {/* Cheerleader Mode toggle */}
              <Pressable onPress={() => setCheerleaderMode(m => !m)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  padding: 12, borderRadius: 12, borderWidth: 1.5,
                  borderColor: cheerleaderMode ? BRAND.purple : (isDark ? colors.border : '#E2E8F0'),
                  backgroundColor: cheerleaderMode ? BRAND.purple + '12' : 'transparent' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800',
                    color: cheerleaderMode ? BRAND.purple : colors.textPrimary }}>
                    🎉 Cheerleader Mode
                  </Text>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary, marginTop: 2 }}>
                    Hide all driving requests — I only want the celebration feed
                  </Text>
                </View>
                <View style={{ width: 40, height: 24, borderRadius: 12,
                  backgroundColor: cheerleaderMode ? BRAND.purple : (isDark ? '#334155' : '#CBD5E1'),
                  justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                    alignSelf: cheerleaderMode ? 'flex-end' : 'flex-start' }} />
                </View>
              </Pressable>

              {/* Drive window days */}
              {!cheerleaderMode && (
                <>
                  <View>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>
                      Drive Days
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {DAY_LABELS.map((d, i) => (
                        <Pressable key={i}
                          onPress={() => setDriveWindowDays(prev =>
                            prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                          )}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                            borderWidth: 1.5,
                            borderColor: driveWindowDays.includes(i) ? '#F59E0B' : (isDark ? colors.border : '#E2E8F0'),
                            backgroundColor: driveWindowDays.includes(i) ? '#FEF3C7' : 'transparent' }}>
                          <Text style={{ fontSize: TYPO.micro, fontWeight: '800',
                            color: driveWindowDays.includes(i) ? '#92400E' : colors.textSecondary }}>{d}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* Time window */}
                  <View>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>
                      Available Hours
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TextInput
                        style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, padding: 9, textAlign: 'center',
                          fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
                          borderColor: isDark ? colors.border : '#E2E8F0',
                          backgroundColor: isDark ? colors.card : '#fff' }}
                        value={driveWindowStart} onChangeText={setDriveWindowStart}
                        placeholder="14:00" placeholderTextColor={colors.textTertiary}
                      />
                      <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontWeight: '700' }}>to</Text>
                      <TextInput
                        style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, padding: 9, textAlign: 'center',
                          fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
                          borderColor: isDark ? colors.border : '#E2E8F0',
                          backgroundColor: isDark ? colors.card : '#fff' }}
                        value={driveWindowEnd} onChangeText={setDriveWindowEnd}
                        placeholder="17:30" placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                  </View>

                  {/* Weekly cap */}
                  <View>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>
                      Max Rides / Week ({ridesThisWeek} taken this week)
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <Pressable key={n} onPress={() => setWeeklyRideCap(n)}
                          style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                            borderWidth: 1.5,
                            borderColor: weeklyRideCap === n ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                            backgroundColor: weeklyRideCap === n ? BRAND.teal + '18' : 'transparent' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '900',
                            color: weeklyRideCap === n ? BRAND.teal : colors.textSecondary }}>{n}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Collapsible dispatch content */}
          {helperDispatchExpanded && <>

          {/* Open ride requests */}
          {!cheerleaderMode && openRides.length > 0 && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
              {openRides.map(ev => {
                const kid = members.find(m => m.id === ev.memberId);
                const evDay = ev.date ? new Date(ev.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ev.date;
                return (
                  <View key={ev.id} style={{ borderRadius: 16, borderWidth: 1,
                    borderColor: isDark ? '#854D0E30' : '#FDE68A',
                    backgroundColor: isDark ? '#2D1800' : '#FFFBEB',
                    overflow: 'hidden' }}>
                    {/* Header */}
                    <View style={{ backgroundColor: atWeeklyCap ? '#6B7280' : '#F59E0B',
                      paddingHorizontal: 14, paddingVertical: 10,
                      flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 15 }}>🚗</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                          {evDay}{ev.time ? ` · ${ev.time}` : ''}
                        </Text>
                        <Text style={{ fontSize: TYPO.micro, color: '#ffffffCC', marginTop: 1 }}>
                          {atWeeklyCap ? 'Weekly cap reached · update settings to accept' : 'First to claim wins 🏁'}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: '#fff3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#fff' }}>Open</Text>
                      </View>
                    </View>
                    {/* Content */}
                    <View style={{ padding: 14, gap: 7 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? '#FCD34D' : '#78350F' }}>
                        {kid?.name.split(' ')[0] ?? 'Child'} · {ev.title}
                      </Text>
                      {(ev.pickupLocation || ev.dropLocation) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                          backgroundColor: isDark ? '#2D1800' : '#FEF3C7', borderRadius: 8, padding: 8 }}>
                          <MapPin size={12} color="#F59E0B" />
                          <Text style={{ fontSize: TYPO.label, color: isDark ? '#FCD34D' : '#92400E', fontWeight: '600', flex: 1 }}>
                            {[ev.pickupLocation, ev.dropLocation].filter(Boolean).join(' → ')}
                          </Text>
                        </View>
                      )}
                      {ev.notes && (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>
                          "{ev.notes}"
                        </Text>
                      )}
                      <Text style={{ fontSize: TYPO.micro, color: '#F59E0B', fontWeight: '700' }}>
                        👴👵 Grandparents Welcome · no obligation to accept
                      </Text>
                    </View>
                    {/* Action buttons */}
                    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: isDark ? '#854D0E30' : '#FDE68A' }}>
                      <Pressable
                        onPress={() => handleClaimRide(ev.id)}
                        disabled={atWeeklyCap}
                        style={{ flex: 2, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 2,
                          backgroundColor: atWeeklyCap ? (isDark ? '#374151' : '#E5E7EB') : '#F59E0B' }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '900',
                          color: atWeeklyCap ? (isDark ? '#9CA3AF' : '#6B7280') : '#fff' }}>
                          ✋ I'll Drive
                        </Text>
                        <Text style={{ fontSize: TYPO.micro, color: atWeeklyCap ? '#9CA3AF' : '#ffffffCC' }}>
                          {atWeeklyCap ? 'cap reached' : 'syncs to your calendar'}
                        </Text>
                      </Pressable>
                      <View style={{ width: 1, backgroundColor: isDark ? '#854D0E30' : '#FDE68A' }} />
                      <Pressable
                        onPress={() => handlePassRide(ev.id)}
                        style={{ flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                          Pass
                        </Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>no guilt 💙</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* My confirmed rides */}
          {myClaimedRides.length > 0 && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                textTransform: 'uppercase', letterSpacing: 0.8 }}>My Confirmed Rides</Text>
              {myClaimedRides.map(ev => {
                const kid = members.find(m => m.id === ev.memberId);
                const evDay = ev.date ? new Date(ev.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ev.date;
                return (
                  <View key={ev.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 10, borderRadius: 12,
                    backgroundColor: isDark ? BRAND.teal + '15' : BRAND.teal + '12',
                    borderWidth: 1, borderColor: BRAND.teal + '30' }}>
                    <CheckCircle size={16} color={BRAND.teal} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>
                        {kid?.name.split(' ')[0] ?? 'Child'} · {ev.title}
                      </Text>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>
                        {evDay}{ev.time ? ` · ${ev.time}` : ''}
                      </Text>
                    </View>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: BRAND.teal }}>Confirmed</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Grandparent Quest Invitations (Workflow 2 — parent proposed) */}
          {!cheerleaderMode && (() => {
            const visibleInvites = gpInvitations.filter(c => !passedInvitations.includes(c.id));
            if (!visibleInvites.length) return null;
            return (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple,
                  textTransform: 'uppercase', letterSpacing: 0.8 }}>Quest Invitations</Text>
                {visibleInvites.map(c => {
                  const kid = members.find(m => m.id === c.assignedToId);
                  return (
                    <View key={c.id} style={{ borderRadius: 16, borderWidth: 1,
                      borderColor: isDark ? BRAND.purple + '40' : BRAND.purple + '30',
                      backgroundColor: isDark ? '#1a0a2e' : '#FAF5FF',
                      overflow: 'hidden' }}>
                      <View style={{ backgroundColor: BRAND.purple, paddingHorizontal: 14, paddingVertical: 8,
                        flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 14 }}>👴👵</Text>
                        <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                          QUEST INVITATION
                        </Text>
                        <View style={{ backgroundColor: '#fff3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#fff' }}>+{c.basePoints} pts</Text>
                        </View>
                      </View>
                      <View style={{ padding: 14, gap: 4 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? '#C4B5FD' : '#5B21B6' }}>
                          {c.title}
                        </Text>
                        {kid && (
                          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                            For {kid.name.split(' ')[0]}
                          </Text>
                        )}
                        {c.description && (
                          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>{c.description}</Text>
                        )}
                        <Text style={{ fontSize: TYPO.micro, color: BRAND.purple, fontWeight: '700', marginTop: 4 }}>
                          Invited by parent · no pressure to accept
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: isDark ? BRAND.purple + '30' : BRAND.purple + '20' }}>
                        <Pressable
                          onPress={() => {
                            // inviteGrandparents errand → claimGPErrand; grandparent_quest → startGrandparentQuest
                            if (c.inviteGrandparents && c.categoryType !== 'grandparent_quest') {
                              claimGPErrand(c.id, active.id);
                            } else {
                              useChoreStore.getState().startGrandparentQuest(c.id, active.id);
                            }
                          }}
                          style={({ pressed }) => ({ flex: 2, paddingVertical: 14, alignItems: 'center',
                            backgroundColor: BRAND.purple, opacity: pressed ? 0.8 : 1 })}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                            ❤️ I'd Love To Help
                          </Text>
                        </Pressable>
                        <View style={{ width: 1, backgroundColor: isDark ? BRAND.purple + '30' : BRAND.purple + '20' }} />
                        <Pressable
                          onPress={() => setPassedInvitations(p => [...p, c.id])}
                          style={({ pressed }) => ({ flex: 1, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                            Pass
                          </Text>
                          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>No guilt 💙</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          {/* My active errands (GP claimed, in progress) */}
          {myActiveErrands.length > 0 && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.teal,
                textTransform: 'uppercase', letterSpacing: 0.8 }}>My Active Errands 🛍️</Text>
              {myActiveErrands.map(c => (
                <View key={c.id} style={{ borderRadius: 16, borderWidth: 1.5,
                  borderColor: BRAND.teal + '40',
                  backgroundColor: isDark ? BRAND.teal + '10' : '#ECFDF5',
                  overflow: 'hidden' }}>
                  <View style={{ backgroundColor: BRAND.teal, paddingHorizontal: 14, paddingVertical: 10,
                    flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>🛒</Text>
                    <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                      {c.title}
                    </Text>
                    <View style={{ backgroundColor: '#fff3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#fff' }}>In Progress</Text>
                    </View>
                  </View>
                  {c.description ? (
                    <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{c.description}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => openReceiptModal(c.id)}
                    style={{ margin: 12, backgroundColor: BRAND.teal, borderRadius: 12,
                      paddingVertical: 13, alignItems: 'center', flexDirection: 'row',
                      justifyContent: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>✅</Text>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                      Done · Submit Receipt
                    </Text>
                    <Text style={{ fontSize: 16 }}>📷</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          </> /* end helperDispatchExpanded */}
        </View>
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
          badge={meds.filter(m => !medsTaken[m.id]).length || undefined} badgeColor="#EF4444"
          colors={colors} isDark={isDark}>
          {meds.map((med, i) => {
            const taken = !!medsTaken[med.id];
            return (
              <View key={med.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: i < meds.length - 1 ? 1 : 0, borderBottomColor: isDark ? colors.border : '#F1F5F9' }}>
                <Pill size={22} color={taken ? colors.textTertiary : BRAND.teal} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: taken ? colors.textTertiary : colors.textPrimary, textDecorationLine: taken ? 'line-through' : 'none' }}>{med.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary }}>{med.time}</Text>
                </View>
                <Pressable onPress={() => toggleMed(med.id)} style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: taken ? '#10B98120' : BRAND.teal, borderWidth: taken ? 1 : 0, borderColor: '#10B98140' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: taken ? '#10B981' : '#fff' }}>
                    {taken ? 'Taken' : 'Mark Taken'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {meds.length > 0 && meds.every(m => medsTaken[m.id]) && (
            <View style={{ alignItems: 'center', paddingVertical: 10, gap: 4 }}>
              <CheckCircle size={26} color="#10B981" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>All done for today!</Text>
            </View>
          )}
        </SectionCard>
      </View>

      {/* Grocery List */}
      <View style={pad}>
        <SectionCard
          icon={<ShoppingCart size={16} color={BRAND.teal} />}
          title="Family Grocery List"
          badge={groceryItems.length || undefined} badgeColor={BRAND.teal}
          colors={colors} isDark={isDark}>
          <Pressable onPress={() => setGroceryExpanded(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: groceryExpanded ? 10 : 0 }}>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
              {groceryItems.length === 0 ? 'List is empty' : `${groceryItems.length} item${groceryItems.length !== 1 ? 's' : ''} needed`}
            </Text>
            {groceryItems.length > 0 && (groceryExpanded ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />)}
          </Pressable>
          {groceryExpanded && groceryItems.map((item, i) => (
            <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7,
              borderTopWidth: i === 0 ? 1 : 0, borderTopColor: isDark ? colors.border : '#F1F5F9' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.teal }} />
              <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.textPrimary }}>{item.name}</Text>
              {item.quantity ? <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{item.quantity}</Text> : null}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TextInput
              style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                backgroundColor: isDark ? colors.surface : '#F8FAFC', paddingHorizontal: 10,
                paddingVertical: 7, fontSize: TYPO.label, color: colors.textPrimary }}
              placeholder="Add item…" placeholderTextColor={colors.textTertiary}
              value={newGroceryItem} onChangeText={setNewGroceryItem}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (newGroceryItem.trim()) {
                  addGroceryItem({ name: newGroceryItem.trim(), familyId, addedBy: active.id });
                  setNewGroceryItem('');
                }
              }}
            />
            <Pressable
              onPress={() => {
                if (newGroceryItem.trim()) {
                  addGroceryItem({ name: newGroceryItem.trim(), familyId, addedBy: active.id });
                  setNewGroceryItem('');
                }
              }}
              style={{ backgroundColor: BRAND.teal, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, justifyContent: 'center' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Add</Text>
            </Pressable>
          </View>
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
          {/* Parent-flagged requests GP can take */}
          {gpWelcomeRequests.map(req => {
            const kid = members.find(m => m.id === req.fromMemberId);
            const typeEmoji = req.type === 'ride' ? '🚗' : req.type === 'tutor' ? '📚' : '🎉';
            return (
              <CollapsibleCard key={`gp-${req.id}`} accent="#22c55e" colors={colors} isDark={isDark} defaultExpanded={true}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>{typeEmoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#22c55e' }} numberOfLines={1}>
                        {kid?.name.split(' ')[0] ?? 'Kid'} — {req.detail}
                      </Text>
                      {req.scheduledDate || req.scheduledTime ? (
                        <Text style={{ fontSize: TYPO.label, color: '#22c55e', opacity: 0.75 }}>
                          {req.scheduledDate ?? ''}{req.scheduledTime ? ` at ${req.scheduledTime}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ backgroundColor: '#22c55e30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#22c55e' }}>GP Invited</Text>
                    </View>
                  </View>
                }>
                {kid && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} siblings={allNames} size={26} ringColor="#22c55e" />
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>For <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{kid.name.split(' ')[0]}</Text></Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => { assignRequest(req.id, active.id); }}
                    style={{ flex: 1, backgroundColor: '#22c55e', paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Hand size={14} color="#fff" />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>I'll Help</Text>
                  </Pressable>
                  <Pressable onPress={() => {/* just close/ignore — GP passes */ }}
                    style={{ flex: 1, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>Pass</Text>
                  </Pressable>
                </View>
              </CollapsibleCard>
            );
          })}

          {/* Partner chores flagged for GP — buy supplies + scan receipt */}
          {gpWelcomeChores.map(c => {
            const assignee = members.find(m => m.id === c.assignedToId);
            const si = c.shoppingItems;
            return (
              <CollapsibleCard key={`gpc-${c.id}`} accent="#22c55e" colors={colors} isDark={isDark} defaultExpanded={true}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>{si?.length ? '🛍️' : '📋'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#22c55e' }} numberOfLines={1}>{c.title}</Text>
                      <Text style={{ fontSize: TYPO.label, color: '#22c55e', opacity: 0.75 }}>
                        {assignee ? `Assigned to ${assignee.name.split(' ')[0]}` : 'Unassigned'}{si?.length ? ` · ${si.length} items` : ''}{c.shoppingStore ? ` · ${c.shoppingStore}` : ''}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#22c55e30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#22c55e' }}>GP Welcome</Text>
                    </View>
                  </View>
                }>
                {si && si.length > 0 && (
                  <View style={{ marginBottom: 10, gap: 4 }}>
                    {si.map((item, i) => (
                      <Text key={i} style={{ fontSize: TYPO.label, color: colors.textSecondary }}>• {item}</Text>
                    ))}
                    {c.shoppingBudget != null && (
                      <Text style={{ fontSize: TYPO.label, color: '#22c55e', fontWeight: '700', marginTop: 4 }}>Budget: ${c.shoppingBudget}</Text>
                    )}
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => updateChore(c.id, { assignedToId: active.id, status: 'in_progress', openToGP: false })}
                    style={{ flex: 1, backgroundColor: '#22c55e', paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Hand size={14} color="#fff" />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>I'll Handle It</Text>
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

      {/* Family Kudos Feed */}
      <View style={pad}>
        <SectionCard
          icon={<Heart size={16} color="#F04E98" />}
          title="Family Kudos Feed"
          subtitle="Your grandkids' recent wins"
          colors={colors} isDark={isDark}>
          {(() => {
            const kidTeenIds = new Set(members.filter(m => m.role === 'kid' || m.role === 'teen').map(m => m.id));
            const recentWins = chores
              .filter(c => !c.isPrivateParent &&
                ['approved', 'auto_approved', 'completed'].includes(c.status) &&
                c.assignedToId && kidTeenIds.has(c.assignedToId))
              .sort((a, b) => (b.approvedAt ?? b.reviewedAt ?? b.createdAt)
                .localeCompare(a.approvedAt ?? a.reviewedAt ?? a.createdAt))
              .slice(0, 8);

            if (recentWins.length === 0) {
              return (
                <View style={{ alignItems: 'center', paddingVertical: 16, gap: 6 }}>
                  <Text style={{ fontSize: 28 }}>🌱</Text>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center' }}>
                    No completions yet — quests will appear here!
                  </Text>
                </View>
              );
            }

            return (
              <View style={{ gap: 8 }}>
                {recentWins.map(chore => {
                  const kid = kids.find(k => k.id === chore.assignedToId);
                  const isGP = chore.categoryType === 'grandparent_quest';
                  const isAuto = chore.status === 'auto_approved';
                  const when = chore.approvedAt ?? chore.reviewedAt ?? chore.createdAt;
                  const daysAgo = Math.floor((Date.now() - new Date(when).getTime()) / 86400000);
                  const whenLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;

                  const accentColor = isGP ? BRAND.teal : chore.categoryType === 'bounty' ? BRAND.amber : '#059669';

                  return (
                    <View key={chore.id} style={{
                      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                      paddingVertical: 10, paddingHorizontal: 12,
                      backgroundColor: isDark ? colors.surface : '#FAFAFE',
                      borderRadius: 12, borderWidth: 1, borderColor: accentColor + '30',
                    }}>
                      {kid && (
                        <FamilyAvatar
                          name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
                          siblings={allNames} size={32}
                          ringColor={accentColor} ringWidth={1.5}
                        />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                          {chore.title}
                        </Text>
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                          {kid?.name.split(' ')[0] ?? 'Grandchild'}
                          {chore.basePoints > 0 ? ` · +${chore.basePoints} pts` : ''}
                          {isAuto ? ' · auto-approved' : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 3 }}>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{whenLabel}</Text>
                        <Text style={{ fontSize: 16 }}>
                          {isGP ? '⭐' : chore.categoryType === 'bounty' ? '💎' : '✅'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()}
        </SectionCard>
      </View>

      {/* ── Grandparent Quest Hub ── */}
      <View style={pad}>
        <SectionCard
          icon={<Star size={16} color={BRAND.teal} />}
          title="Sponsor & Connect Hub"
          badge={(pendingGpApproval.length) || undefined} badgeColor={BRAND.teal}
          actionBtn={{ label: '✨ New Quest', onPress: () => setShowCreateQuestModal(true) }}
          colors={colors} isDark={isDark}>

          {/* Match Setup shortcut */}
          <Pressable onPress={() => setShowMatchModal(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11,
              borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : '#F1F5F9', marginBottom: 4 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Coins size={16} color={BRAND.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>Set up Savings Match</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Match a % or fixed amount when kids save</Text>
            </View>
            <ChevronDown size={14} color={colors.textTertiary} />
          </Pressable>

          {/* Active match rules */}
          {(() => {
            const myMatches = grandparentMatches.filter(m => m.grandparentId === active.id && m.isActive);
            if (myMatches.length === 0) return null;
            return (
              <View style={{ marginBottom: 10, gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 }}>
                  Your active match rules
                </Text>
                {myMatches.map(m => {
                  const kid = kids.find(k => k.id === m.childId);
                  const pctUsed = m.maxMonthlyContribution
                    ? Math.min((m.monthlyContributedYtd / m.maxMonthlyContribution) * 100, 100)
                    : 0;
                  return (
                    <View key={m.id} style={{
                      borderRadius: 10, borderWidth: 1, borderColor: BRAND.purple + '30',
                      backgroundColor: isDark ? BRAND.purple + '10' : BRAND.purple + '06',
                      padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10,
                    }}>
                      <Text style={{ fontSize: 18 }}>💜</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                          {kid?.name.split(' ')[0] ?? 'Grandchild'} ·{' '}
                          {m.matchType === 'FIXED_PERCENTAGE'
                            ? `${m.matchValue}% match`
                            : `${m.matchValue} pts/earn`}
                          {' '}→ Save Jar
                        </Text>
                        {m.maxMonthlyContribution ? (
                          <>
                            <View style={{ height: 4, backgroundColor: BRAND.purple + '30', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                              <View style={{ height: '100%', width: `${pctUsed}%`, backgroundColor: BRAND.purple, borderRadius: 2 }} />
                            </View>
                            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
                              {m.monthlyContributedYtd} of {m.maxMonthlyContribution} pts this month
                            </Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          {/* My quests pending parent safety gate */}
          {(() => {
            const awaitingParent = chores.filter(c =>
              c.categoryType === 'grandparent_quest' &&
              c.sponsorUserId === active.id &&
              c.status === 'pending_parent_approval'
            );
            if (!awaitingParent.length) return null;
            return (
              <View style={{ gap: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                  textTransform: 'uppercase', letterSpacing: 0.8 }}>Awaiting Parent Approval</Text>
                {awaitingParent.map(c => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 12, borderRadius: 12,
                    backgroundColor: isDark ? BRAND.amber + '12' : '#FFFBEB',
                    borderWidth: 1, borderColor: '#F59E0B40' }}>
                    <Text style={{ fontSize: 18 }}>{c.questMode === 'virtual' ? '💻' : '🌿'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>{c.basePoints} pts · sent to parents for review</Text>
                    </View>
                    <View style={{ backgroundColor: '#F59E0B20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#92400E' }}>Pending</Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })()}

          {/* My quests approved — awaiting kid claim */}
          {(() => {
            const approved = chores.filter(c =>
              c.categoryType === 'grandparent_quest' &&
              c.sponsorUserId === active.id &&
              c.status === 'todo'
            );
            if (!approved.length) return null;
            return (
              <View style={{ gap: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                  textTransform: 'uppercase', letterSpacing: 0.8 }}>Waiting for Kid to Claim</Text>
                {approved.map(c => {
                  const kid = kids.find(k => k.id === c.assignedToId);
                  return (
                    <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 12, borderRadius: 12,
                      backgroundColor: isDark ? BRAND.purple + '12' : BRAND.purple + '08',
                      borderWidth: 1, borderColor: BRAND.purple + '30' }}>
                      <Text style={{ fontSize: 18 }}>{c.questMode === 'virtual' ? '💻' : '🌿'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>
                          {kid ? kid.name.split(' ')[0] : 'Any grandchild'} · {c.basePoints} pts
                        </Text>
                      </View>
                      <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>Approved ✓</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          {/* In-progress — kid working on it */}
          {(() => {
            const inProg = chores.filter(c =>
              c.categoryType === 'grandparent_quest' &&
              c.sponsorUserId === active.id &&
              c.status === 'in_progress'
            );
            if (!inProg.length) return null;
            return (
              <View style={{ gap: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                  textTransform: 'uppercase', letterSpacing: 0.8 }}>In Progress 🔥</Text>
                {inProg.map(c => {
                  const kid = kids.find(k => k.id === c.assignedToId);
                  return (
                    <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 12, borderRadius: 12,
                      backgroundColor: isDark ? '#10B98115' : '#ECFDF5',
                      borderWidth: 1, borderColor: '#10B98130' }}>
                      <Text style={{ fontSize: 18 }}>{c.questMode === 'virtual' ? '💻' : '🌿'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>
                          {kid?.name.split(' ')[0] ?? 'Grandchild'} is working on it · {c.basePoints} pts
                        </Text>
                      </View>
                      {c.questMode === 'virtual' && (
                        <Pressable style={{ backgroundColor: '#10B981', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                          onPress={() => router.push('/(tabs)/chat')}>
                          <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>📞 Join</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })()}

          {/* Pending grandparent verification (child submitted photo) */}
          {pendingGpApproval.length > 0 && (
            <View style={{ gap: 10, marginBottom: 12 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                textTransform: 'uppercase', letterSpacing: 0.8 }}>Verify & Cheer 🎉</Text>
              {/* Sticker picker */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {CHEER_STICKERS.map(s => (
                  <Pressable key={s} onPress={() => setCheerSticker(s)}
                    style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: cheerSticker === s ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                      backgroundColor: cheerSticker === s ? BRAND.teal + '20' : 'transparent' }}>
                    <Text style={{ fontSize: 18 }}>{s}</Text>
                  </Pressable>
                ))}
              </View>

              {pendingGpApproval.map(chore => {
                const kid = kids.find(k => chore.assignedToId === k.id) ?? kids[0];
                const pts = chore.basePoints;
                const spend = Math.floor(pts * 0.50);
                const save  = Math.floor(pts * 0.40);
                const give  = pts - spend - save;
                return (
                  <View key={chore.id} style={{
                    borderRadius: 16, borderWidth: 1.5, borderColor: BRAND.teal + '40',
                    backgroundColor: isDark ? BRAND.teal + '10' : BRAND.teal + '06',
                    overflow: 'hidden',
                  }}>
                    <View style={{ backgroundColor: BRAND.teal, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 16 }}>📸</Text>
                      <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                        {chore.title}
                      </Text>
                    </View>
                    <View style={{ padding: 14, gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <FamilyAvatar name={kid?.name ?? '?'} emoji={kid?.emoji} avatarUrl={kid?.avatarUrl} siblings={allNames} size={30} />
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                          {kid?.name.split(' ')[0] ?? 'Grandchild'} submitted for your review
                        </Text>
                      </View>
                      {chore.submissionNote ? (
                        <View style={{ borderRadius: 10, backgroundColor: isDark ? '#1e293b' : '#fff',
                          padding: 10, borderLeftWidth: 3, borderLeftColor: BRAND.teal }}>
                          <Text style={{ fontSize: TYPO.label, color: colors.textPrimary, fontStyle: 'italic' }}>
                            "{chore.submissionNote}"
                          </Text>
                        </View>
                      ) : null}
                      {/* Points split preview */}
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {[
                          { label: '💸 Spend', val: spend, color: BRAND.amber },
                          { label: '🏦 Save',  val: save,  color: '#10B981' },
                          { label: '🤲 Give',  val: give,  color: BRAND.purple },
                        ].map(j => (
                          <View key={j.label} style={{ flex: 1, alignItems: 'center', borderRadius: 10,
                            borderWidth: 1, borderColor: j.color + '30',
                            backgroundColor: j.color + '10', paddingVertical: 8 }}>
                            <Text style={{ fontSize: TYPO.label }}>{j.label}</Text>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: j.color }}>{j.val}</Text>
                          </View>
                        ))}
                      </View>
                      <Pressable onPress={() => handleApproveAndCheer(chore.id)}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                          backgroundColor: BRAND.teal, borderRadius: 12, paddingVertical: 13 }}>
                        <Text style={{ fontSize: 20 }}>{cheerSticker}</Text>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                          APPROVE & CHEER · {pts} pts
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* G4 — Completed: kid did it and parent approved */}
          {(() => {
            const done = chores.filter(c =>
              c.categoryType === 'grandparent_quest' &&
              c.sponsorUserId === active.id &&
              (c.status === 'approved' || c.status === 'auto_approved')
            );
            if (!done.length) return null;
            return (
              <View style={{ gap: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                  textTransform: 'uppercase', letterSpacing: 0.8 }}>Completed ✅</Text>
                {done.map(c => {
                  const kid = kids.find(k => k.id === c.assignedToId);
                  return (
                    <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 12, borderRadius: 12,
                      backgroundColor: isDark ? '#14291a' : '#F0FDF4',
                      borderWidth: 1, borderColor: '#22c55e40' }}>
                      <Text style={{ fontSize: 18 }}>🏅</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>
                          {kid?.name.split(' ')[0] ?? 'Grandchild'} completed it
                        </Text>
                      </View>
                      <View style={{ backgroundColor: '#22c55e20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#22c55e' }}>Done ✓</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          {/* Empty state */}
          {chores.filter(c => c.categoryType === 'grandparent_quest' && c.sponsorUserId === active.id).length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 18, gap: 8 }}>
              <Text style={{ fontSize: 32 }}>🌟</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Sponsor a Connection Quest</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                Create in-person or virtual quests — cook together, tell family stories, quiz them before exams.
              </Text>
            </View>
          )}
        </SectionCard>
      </View>

      {/* Grandparent Match setup modal */}
      <Modal visible={showMatchModal} transparent animationType="slide" onRequestClose={() => setShowMatchModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#00000060' }} onPress={() => setShowMatchModal(false)} />
        <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 }}>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>Set Up Savings Match</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            You'll automatically add a match to their Save Jar when they earn points.
          </Text>
          {/* Kid selector */}
          <View>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>For grandchild</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {kids.map(k => (
                <Pressable key={k.id} onPress={() => setMatchKidId(k.id)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                    borderColor: matchKidId === k.id ? BRAND.purple : colors.border,
                    backgroundColor: matchKidId === k.id ? BRAND.purple + '15' : 'transparent' }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: matchKidId === k.id ? BRAND.purple : colors.textPrimary }}>
                    {k.name.split(' ')[0]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {/* Match type */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(['FIXED_PERCENTAGE', 'FIXED_AMOUNT'] as const).map(t => (
              <Pressable key={t} onPress={() => setMatchType(t)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1.5,
                  borderColor: matchType === t ? BRAND.purple : colors.border,
                  backgroundColor: matchType === t ? BRAND.purple + '12' : 'transparent' }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: matchType === t ? BRAND.purple : colors.textSecondary }}>
                  {t === 'FIXED_PERCENTAGE' ? '% Match' : 'Fixed Amount'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TextInput
              style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
                backgroundColor: isDark ? colors.surface : '#F8FAFC',
                padding: 12, fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }}
              keyboardType="numeric"
              value={matchValue}
              onChangeText={setMatchValue}
            />
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
              {matchType === 'FIXED_PERCENTAGE' ? '% of each earn' : 'pts per earn'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setShowMatchModal(false)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSaveMatch}
              style={{ flex: 2, alignItems: 'center', paddingVertical: 13, borderRadius: 14,
                backgroundColor: matchKidId ? BRAND.purple : (isDark ? '#374151' : '#D1D5DB') }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>Save Match Rule</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Create Grandparent Quest modal — full spec lifecycle */}
      <Modal visible={showCreateQuestModal} transparent animationType="slide" onRequestClose={() => setShowCreateQuestModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#00000060' }} onPress={() => setShowCreateQuestModal(false)} />
        <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, flex: 1 }}>
              ✨ Sponsor a Quest
            </Text>
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>→ Parent reviews → Kid claims</Text>
          </View>

          {/* Mode: Local vs Virtual */}
          <View style={{ flexDirection: 'row', gap: 0, borderRadius: 14, overflow: 'hidden',
            borderWidth: 1.5, borderColor: isDark ? colors.border : '#E2E8F0' }}>
            {([
              { key: 'local',   emoji: '🌿', label: 'In-Person',  hint: 'Cook, garden, craft together' },
              { key: 'virtual', emoji: '💻', label: 'Video Call',  hint: 'Flashcards, story, quiz' },
            ] as const).map(({ key, emoji, label }, i) => (
              <Pressable key={key} onPress={() => setNewQuestMode(key)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12,
                  borderRightWidth: i === 0 ? 1 : 0, borderRightColor: isDark ? colors.border : '#E2E8F0',
                  backgroundColor: newQuestMode === key ? (key === 'local' ? '#ECFDF5' : BRAND.purple + '12') : 'transparent',
                  ...(isDark && newQuestMode === key && { backgroundColor: key === 'local' ? '#0a2018' : BRAND.purple + '20' }),
                }}>
                <Text style={{ fontSize: 20, marginBottom: 2 }}>{emoji}</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '900',
                  color: newQuestMode === key ? (key === 'local' ? '#059669' : BRAND.purple) : colors.textSecondary }}>
                  {label}
                </Text>
                {newQuestMode === key && <View style={{ height: 2, width: 28, borderRadius: 1,
                  backgroundColor: key === 'local' ? '#059669' : BRAND.purple, marginTop: 4 }} />}
              </Pressable>
            ))}
          </View>

          {/* Title */}
          <TextInput
            style={{ borderRadius: 12, borderWidth: 1.5, borderColor: newQuestTitle.trim() ? colors.border : '#EF444460',
              backgroundColor: isDark ? colors.surface : '#F8FAFC',
              padding: 12, fontSize: TYPO.caption, color: colors.textPrimary }}
            placeholder={newQuestMode === 'local'
              ? 'e.g. Help weed the flower garden, Paneer recipe together…'
              : 'e.g. 15-min bedtime story call, State capitals quiz…'}
            placeholderTextColor={colors.textTertiary}
            value={newQuestTitle}
            onChangeText={setNewQuestTitle}
          />
          <TextInput
            style={{ borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
              backgroundColor: isDark ? colors.surface : '#F8FAFC',
              padding: 12, fontSize: TYPO.caption, color: colors.textPrimary, minHeight: 56 }}
            placeholder="Describe what the child will do step by step (optional)…"
            placeholderTextColor={colors.textTertiary}
            value={newQuestDesc}
            onChangeText={setNewQuestDesc}
            multiline
          />

          {/* Points + photo row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                Points you're sponsoring
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['200', '350', '400', '500'].map(p => (
                  <Pressable key={p} onPress={() => setNewQuestPoints(p)}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: newQuestPoints === p ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                      backgroundColor: newQuestPoints === p ? BRAND.teal + '18' : 'transparent' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900',
                      color: newQuestPoints === p ? BRAND.teal : colors.textSecondary }}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* 50/40/10 split preview */}
          {(() => {
            const pts = parseInt(newQuestPoints) || 0;
            return (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  { label: '💸 Spend', val: Math.floor(pts * 0.5),  color: BRAND.amber },
                  { label: '🏦 Save',  val: Math.floor(pts * 0.4),  color: '#10B981' },
                  { label: '🤲 Give',  val: pts - Math.floor(pts * 0.5) - Math.floor(pts * 0.4), color: BRAND.purple },
                ].map(j => (
                  <View key={j.label} style={{ flex: 1, alignItems: 'center', borderRadius: 10,
                    borderWidth: 1, borderColor: j.color + '30',
                    backgroundColor: j.color + '10', paddingVertical: 8 }}>
                    <Text style={{ fontSize: TYPO.label }}>{j.label}</Text>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: j.color }}>{j.val}</Text>
                  </View>
                ))}
              </View>
            );
          })()}

          {/* Kid selector */}
          {kids.length > 1 && (
            <View>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                For (blank = all grandkids)
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {kids.map(k => (
                  <Pressable key={k.id} onPress={() => setNewQuestKidId(newQuestKidId === k.id ? '' : k.id)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                      borderColor: newQuestKidId === k.id ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                      backgroundColor: newQuestKidId === k.id ? BRAND.teal + '15' : 'transparent' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '600',
                      color: newQuestKidId === k.id ? BRAND.teal : colors.textPrimary }}>
                      {k.name.split(' ')[0]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Photo proof toggle */}
          <Pressable onPress={() => setNewQuestPhoto(p => !p)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2,
              borderColor: newQuestPhoto ? BRAND.teal : (isDark ? colors.border : '#CBD5E1'),
              backgroundColor: newQuestPhoto ? BRAND.teal : 'transparent',
              alignItems: 'center', justifyContent: 'center' }}>
              {newQuestPhoto && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
            </View>
            <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary }}>
              📸 Child must submit photo proof
            </Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setShowCreateQuestModal(false)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14,
                borderWidth: 1.5, borderColor: isDark ? colors.border : '#E2E8F0' }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleCreateQuest}
              style={{ flex: 2, alignItems: 'center', paddingVertical: 13, borderRadius: 14,
                backgroundColor: newQuestTitle.trim() ? BRAND.teal : (isDark ? '#374151' : '#D1D5DB') }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                Send to Parent for Review
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Receipt Submission Modal ── */}
      <Modal visible={!!receiptChoreId} transparent animationType="slide" onRequestClose={closeReceiptModal}>
        <Pressable style={{ flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end' }} onPress={closeReceiptModal}>
          <Pressable onPress={e => e.stopPropagation()}
            style={{ backgroundColor: isDark ? '#1E293B' : '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: 24, gap: 16, maxHeight: '90%' }}>

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 22 }}>🧾</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>Submit Receipt</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                  Snap or upload your receipt — parents will reimburse you
                </Text>
              </View>
              <Pressable onPress={closeReceiptModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 20, color: colors.textTertiary }}>✕</Text>
              </Pressable>
            </View>

            {/* Receipt photo area */}
            {receiptPhotoUri ? (
              <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: BRAND.teal + '60' }}>
                <Image source={{ uri: receiptPhotoUri }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
                <Pressable onPress={() => setReceiptPhotoUri(null)}
                  style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#000a', borderRadius: 20,
                    paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ color: '#fff', fontSize: TYPO.label, fontWeight: '700' }}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={takeReceiptPhoto}
                  style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
                    borderColor: BRAND.teal + '60', paddingVertical: 20, alignItems: 'center', gap: 6,
                    backgroundColor: isDark ? BRAND.teal + '10' : '#F0FDF4' }}>
                  <Text style={{ fontSize: 24 }}>📷</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal }}>Camera</Text>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>Scan receipt</Text>
                </Pressable>
                <Pressable onPress={pickReceiptFromGallery}
                  style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
                    borderColor: BRAND.teal + '40', paddingVertical: 20, alignItems: 'center', gap: 6,
                    backgroundColor: isDark ? BRAND.teal + '08' : '#F0FDF4' }}>
                  <Text style={{ fontSize: 24 }}>🖼️</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal }}>Gallery</Text>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>From photos</Text>
                </Pressable>
              </View>
            )}

            {/* Amount */}
            <View>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                Amount spent (optional)
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5,
                borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                paddingHorizontal: 14, gap: 6 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>$</Text>
                <TextInput
                  value={receiptAmountStr}
                  onChangeText={setReceiptAmountStr}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textTertiary}
                  style={{ flex: 1, fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, paddingVertical: 12 }}
                />
              </View>
            </View>

            {/* Note */}
            <View>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                Note for parents (optional)
              </Text>
              <TextInput
                value={receiptNote}
                onChangeText={setReceiptNote}
                placeholder="e.g. bought the bread and milk, couldn't find the cereal brand"
                placeholderTextColor={colors.textTertiary}
                multiline numberOfLines={2}
                style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isDark ? '#334155' : '#E2E8F0',
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC', padding: 12,
                  fontSize: TYPO.label, color: colors.textPrimary, minHeight: 72, textAlignVertical: 'top' }}
              />
            </View>

            {/* Submit */}
            <Pressable
              onPress={handleSubmitReceipt}
              style={{ backgroundColor: BRAND.teal, borderRadius: 14, paddingVertical: 15,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                opacity: (!receiptPhotoUri && !receiptAmountStr.trim()) ? 0.5 : 1 }}
              disabled={!receiptPhotoUri && !receiptAmountStr.trim()}>
              <Text style={{ fontSize: 16 }}>📤</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                Send to Parents
                {receiptAmountStr.trim() ? ` · $${receiptAmountStr}` : ''}
              </Text>
            </Pressable>
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center' }}>
              At least a photo or amount is required
            </Text>

          </Pressable>
        </Pressable>
      </Modal>

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
