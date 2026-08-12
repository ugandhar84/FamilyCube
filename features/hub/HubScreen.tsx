/**
 * HubScreen — 100% port of gemini-code HubView / KidView / SeniorView.
 * Parent: action bar, carpool requests, help queue, dual wallet, en route, chore approvals, timeline.
 * Kid:    conflict alert, help queue, quick launcher, dual wallet strip.
 * Senior: SOS, driving assignments, GP coin tip dispenser, medication, memories.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
  TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useQuestStore } from '@/store/questStore';
import AppHeader from '@/components/AppHeader';
import { BRAND } from '@/components/FamilyCubeLogo';
import HelpDispatchQueue from './HelpDispatchQueue';
import RequestHelpModal from './RequestHelpModal';

// ─── Inline Icons ─────────────────────────────────────────────────────────────

const Icon = {
  Sparkles: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" stroke={c} strokeWidth={1.5} fill={c} strokeLinejoin="round" />
    </Svg>
  ),
  PlusCircle: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12,8 L12,16 M8,12 L16,12" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Calendar: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Rect x={3} y={4} width={18} height={18} rx={2} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M16,2 L16,6 M8,2 L8,6 M3,10 L21,10" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Wallet: ({ c }: { c: string }) => (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M20,7 H4 C2.9,7 2,7.9 2,9 V20 C2,21.1 2.9,22 4,22 H20 C21.1,22 22,21.1 22,20 V9 C22,7.9 21.1,7 20,7 Z" stroke={c} strokeWidth={2} fill="none" />
      <Path d="M16,2 L4,7" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={17} cy={15} r={1.5} fill={c} />
    </Svg>
  ),
  ArrowRight: ({ c }: { c: string }) => (
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Path d="M5,12 L19,12 M13,6 L19,12 L13,18" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Navigation: ({ c }: { c: string }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M3,11 L22,2 L13,21 L11,13 Z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  Clock: ({ c }: { c: string }) => (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12,7 L12,12 L16,14" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  HelpCircle: ({ c }: { c: string }) => (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M9,9 C9,6.2 15,6.2 15,9 C15,11 13,11.5 12,13" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={12} cy={17} r={1} fill={c} />
    </Svg>
  ),
  AlertTriangle: ({ c }: { c: string }) => (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M10.3,3 L1,21 H23 Z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Path d="M12,10 L12,14 M12,17 L12,18" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Zap: ({ c }: { c: string }) => (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M13,2 L3,14 H12 L11,22 L21,10 H12 Z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  MessageSquare: ({ c }: { c: string }) => (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M21,15 C21,15.5 20.5,16 20,16 H8 L4,20 V6 C4,5.5 4.5,5 5,5 H20 C20.5,5 21,5.5 21,6 Z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  Car: ({ c }: { c: string }) => (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M5,11 L7,6 L17,6 L19,11" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Rect x={2} y={11} width={20} height={7} rx={2} stroke={c} strokeWidth={1.5} fill="none" />
      <Circle cx={7} cy={18} r={2} fill={c} />
      <Circle cx={17} cy={18} r={2} fill={c} />
    </Svg>
  ),
  BookOpen: ({ c }: { c: string }) => (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M2,3 H8 C9.7,3 11,4.3 11,6 V20 C11,18.3 9.7,17 8,17 H2 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M22,3 H16 C14.3,3 13,4.3 13,6 V20 C13,18.3 14.3,17 16,17 H22 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  ThumbsUp: ({ c }: { c: string }) => (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M14,9 V5 C14,3.3 12.7,2 11,2 L7,13 V22 H18.3 C19.3,22 20.1,21.3 20.3,20.3 L21.7,12.3 C21.9,11 20.9,10 19.6,10 H14 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M7,13 H4 C2.9,13 2,13.9 2,15 V20 C2,21.1 2.9,22 4,22 H7" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Award: ({ c }: { c: string }) => (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={6} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M8.2,14.2 L6,22 L12,19 L18,22 L15.8,14.2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
};

// ─── Category chip colors ─────────────────────────────────────────────────────

const CAT_CHIP: Record<string, { bg: string; text: string }> = {
  Sports:    { bg: '#D1FAE5', text: '#065F46' },
  Medical:   { bg: '#FEE2E2', text: '#991B1B' },
  School:    { bg: '#EEF2FF', text: '#3730A3' },
  Work:      { bg: '#EDE9FE', text: '#5B21B6' },
  Event:     { bg: '#FEF3C7', text: '#92400E' },
  Birthday:  { bg: '#FCE7F3', text: '#9D174D' },
};

// ─── PARENT VIEW ──────────────────────────────────────────────────────────────

function ParentView({ activeMemberId, colors, isDark, onHelpOpen }: {
  activeMemberId: string; colors: any; isDark: boolean; onHelpOpen: () => void;
}) {
  const members = useFamilyStore(s => s.members);
  const events  = useEventStore(s => s.events);
  const quests  = useQuestStore(s => s.quests);
  const { approveQuest } = useQuestStore();

  const today = new Date().toISOString().split('T')[0];

  const familyEventsToday = events.filter(e => e.date === today && e.category !== 'Work');
  const pendingKidRequests = events.filter(e => e.approvalPending);
  const pendingReviews = quests.filter(q => q.status === 'pending_approval');

  // Kids for wallet display
  const kids = members.filter(m => m.role === 'kid');

  const cardBg    = isDark ? '#131927' : '#FFFFFF';
  const cardBord  = isDark ? '#1E293B' : '#E2E8F0';
  const subText   = isDark ? '#94A3B8' : '#64748B';
  const divColor  = isDark ? 'rgba(255,255,255,0.07)' : '#F1F5F9';

  const timeStr = (t?: string) => {
    if (!t) return '';
    try { return new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
    catch { return t; }
  };

  return (
    <>
      {/* ── Quick Action Bar ── */}
      <View style={[p.actionBar, { backgroundColor: cardBg, borderColor: cardBord }]}>
        <TouchableOpacity style={[p.actionBtn, { backgroundColor: BRAND.purple }]}>
          <Icon.Sparkles c="#fff" />
          <Text style={p.actionBtnText}>Scan Flyer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[p.actionBtn, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
          <Icon.PlusCircle c="#10B981" />
          <Text style={[p.actionBtnText, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>+ Quest</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[p.actionBtn, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
          <Icon.Calendar c={BRAND.purple} />
          <Text style={[p.actionBtnText, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>+ Event</Text>
        </TouchableOpacity>
      </View>

      {/* ── Pending Kid Schedule / Carpool Requests ── */}
      {pendingKidRequests.length > 0 && (
        <View style={[p.card, { backgroundColor: isDark ? '#1C1000' : '#FFFBEB', borderColor: isDark ? '#78350F' : '#FCD34D', marginHorizontal: 14, marginBottom: 12 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon.HelpCircle c={isDark ? '#FCD34D' : '#D97706'} />
              <Text style={[p.sectionTitle, { color: isDark ? '#FCD34D' : '#92400E' }]}>Kid Schedule / Carpool Request</Text>
            </View>
            <View style={[p.statusPill, { backgroundColor: isDark ? '#78350F' : '#FEF3C7' }]}>
              <Text style={[p.statusPillText, { color: isDark ? '#FCD34D' : '#92400E' }]}>Needs Approval</Text>
            </View>
          </View>
          {pendingKidRequests.map(kr => (
            <View key={kr.id} style={[p.carPoolRow, { backgroundColor: isDark ? '#0F172A' : '#fff', borderColor: isDark ? '#78350F' : '#FDE68A' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[p.carPoolTitle, { color: colors.textPrimary }]}>{kr.memberId}: {kr.title}</Text>
                <Text style={[p.carPoolSub, { color: subText }]}>Time: {timeStr(kr.time)} ({kr.category})</Text>
              </View>
              <TouchableOpacity style={[p.claimBtn, { backgroundColor: BRAND.purple }]}>
                <Text style={p.claimBtnText}>✓ Claim Duty</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* ── Help Queue ── */}
      <HelpDispatchQueue onRequestHelpOpen={onHelpOpen} />

      {/* ── Dual-Wallet Balances ── */}
      <View style={[p.card, { backgroundColor: cardBg, borderColor: cardBord, marginHorizontal: 14, marginBottom: 12 }]}>
        <View style={[p.cardHeaderRow, { borderBottomColor: divColor }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon.Wallet c="#10B981" />
            <Text style={[p.sectionTitle, { color: colors.textPrimary }]}>Family Dual-Wallet Balances</Text>
          </View>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 10, color: BRAND.purple, fontWeight: '700' }}>Full Audit Ledger</Text>
            <Icon.ArrowRight c={BRAND.purple} />
          </TouchableOpacity>
        </View>
        <View style={{ gap: 8, marginTop: 10 }}>
          {kids.map(k => (
            <View key={k.id} style={[p.walletRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: cardBord }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 18 }}>{k.emoji ?? '👦'}</Text>
                <Text style={[p.walletName, { color: colors.textPrimary }]}>{k.name}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[p.walletMain, { color: isDark ? '#FCD34D' : '#D97706' }]}>
                  Store Wallet: {k.mainCoins}🪙 (${(k.mainCoins * 0.1).toFixed(2)})
                </Text>
                <Text style={[p.walletGP, { color: isDark ? '#C4B5FD' : '#7C3AED' }]}>
                  GP Gift Bonus: {k.gpCoins}🪙 (${(k.gpCoins * 0.1).toFixed(2)})
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* ── En Route Dispatcher ── */}
      <View style={[p.card, { backgroundColor: isDark ? '#052E16' : '#F0FDF4', borderColor: isDark ? '#14532D' : '#BBF7D0', marginHorizontal: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }]}>
        <View style={[p.navIconWrap, { backgroundColor: isDark ? '#14532D' : '#D1FAE5' }]}>
          <Icon.Navigation c={isDark ? '#6EE7B7' : '#065F46'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[p.enRouteTitle, { color: colors.textPrimary }]}>Start Pickup / Trip</Text>
          <Text style={[p.enRouteSub, { color: subText }]}>Broadcast "En Route" with ETA to family chat</Text>
        </View>
        <TouchableOpacity style={p.enRouteBtn}>
          <Text style={p.enRouteBtnText}>En Route</Text>
        </TouchableOpacity>
      </View>

      {/* ── Chore Approval Center ── */}
      {pendingReviews.length > 0 && (
        <View style={[p.card, { backgroundColor: isDark ? '#1E0D3D' : '#FAF5FF', borderColor: isDark ? '#4C1D95' : '#DDD6FE', marginHorizontal: 14, marginBottom: 12 }]}>
          <View style={[p.cardHeaderRow, { borderBottomColor: isDark ? '#4C1D95' : '#EDE9FE' }]}>
            <Text style={[p.sectionLabelUpper, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>Action Center: Chore Approvals</Text>
            <View style={[p.statusPill, { backgroundColor: isDark ? '#4C1D95' : '#EDE9FE' }]}>
              <Text style={[p.statusPillText, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>{pendingReviews.length} Awaiting Clearance</Text>
            </View>
          </View>
          <View style={{ gap: 10, marginTop: 10 }}>
            {pendingReviews.map(pr => {
              const assignee = members.find(m => m.id === pr.assignedToId);
              return (
                <View key={pr.id} style={[p.choreRow, { backgroundColor: isDark ? '#0F172A' : '#fff', borderColor: isDark ? '#4C1D95' : '#DDD6FE' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={[p.photoThumb, { backgroundColor: isDark ? '#4C1D95' : '#EDE9FE' }]}>
                      <Text style={{ fontSize: 20 }}>📷</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[p.choreSubmitter, { color: subText }]}>{assignee?.name ?? 'Member'} submitted:</Text>
                      <Text style={[p.choreTitle, { color: colors.textPrimary }]}>{pr.title}</Text>
                      <Text style={[p.choreCoin, { color: BRAND.amber }]}>+{pr.coins} 🪙 (${(pr.coins * 0.1).toFixed(2)})</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[p.payBtn, { backgroundColor: BRAND.purple }]}
                    onPress={() => approveQuest(pr.id, activeMemberId)}
                  >
                    <Text style={p.payBtnText}>✓ Pay {pr.coins}🪙</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Today's Family Timeline ── */}
      <View style={[p.card, { backgroundColor: cardBg, borderColor: cardBord, marginHorizontal: 14, marginBottom: 20 }]}>
        <View style={[p.cardHeaderRow, { borderBottomColor: divColor }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon.Clock c={BRAND.purple} />
            <Text style={[p.sectionTitle, { color: colors.textPrimary }]}>Today's Family Timeline</Text>
          </View>
          <TouchableOpacity>
            <Text style={{ fontSize: 11, color: BRAND.purple, fontWeight: '700' }}>Full Schedule →</Text>
          </TouchableOpacity>
        </View>
        <View style={{ gap: 8, marginTop: 10 }}>
          {familyEventsToday.length === 0 ? (
            <Text style={[p.emptyTimeline, { color: subText }]}>No events today 🎉</Text>
          ) : (
            familyEventsToday.map(ev => {
              const cat  = ev.category ?? 'Event';
              const chip = CAT_CHIP[cat] ?? { bg: '#E2E8F0', text: '#475569' };
              return (
                <View key={ev.id} style={[p.tlRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: cardBord }]}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[p.tlTime, { color: isDark ? '#C4B5FD' : '#7C3AED' }]}>{timeStr(ev.time)}</Text>
                    <Text style={[p.tlTitle, { color: colors.textPrimary }]}>{ev.title}</Text>
                  </View>
                  <View style={[p.tlChip, { backgroundColor: ev.conflict ? (isDark ? '#451A03' : '#FEF3C7') : chip.bg }]}>
                    <Text style={[p.tlChipText, { color: ev.conflict ? '#D97706' : chip.text }]}>
                      {ev.driver ? ev.driver.split(' ')[0] : 'No Driver'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    </>
  );
}

// ─── KID VIEW ─────────────────────────────────────────────────────────────────

function KidView({ activeMember, colors, isDark, onHelpOpen }: {
  activeMember: any; colors: any; isDark: boolean; onHelpOpen: () => void;
}) {
  const events = useEventStore(s => s.events);
  const today  = new Date().toISOString().split('T')[0];

  const parentWorkConflicts = events.filter(e => e.date === today && e.category === 'Work' && e.conflict);

  const cardBg   = isDark ? '#131927' : '#FFFFFF';
  const cardBord = isDark ? '#1E293B' : '#E2E8F0';

  return (
    <>
      {/* ── Parent Conflict Alert ── */}
      {parentWorkConflicts.length > 0 && (
        <View style={[k.card, { backgroundColor: isDark ? '#1C1000' : '#FFFBEB', borderColor: isDark ? '#78350F' : '#FCD34D', marginHorizontal: 14, marginBottom: 12 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon.AlertTriangle c={isDark ? '#FCD34D' : '#D97706'} />
              <Text style={[k.alertTitle, { color: isDark ? '#FCD34D' : '#92400E' }]}>Parent Schedule Conflict Alert</Text>
            </View>
            <View style={[k.statusPill, { backgroundColor: isDark ? '#78350F' : '#FEF3C7' }]}>
              <Text style={[k.statusPillText, { color: isDark ? '#FCD34D' : '#92400E' }]}>Parent Busy</Text>
            </View>
          </View>
          <Text style={[k.alertBody, { color: isDark ? '#E2E8F0' : '#475569' }]}>
            Mom has a work call during afternoon activities. Dad or Grandma is covering pickups!
          </Text>
        </View>
      )}

      {/* ── Help Queue ── */}
      <HelpDispatchQueue onRequestHelpOpen={onHelpOpen} />

      {/* ── Kid Quick Launcher ── */}
      <View style={[k.card, { backgroundColor: cardBg, borderColor: cardBord, marginHorizontal: 14, marginBottom: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Icon.Zap c={BRAND.amber} />
          <Text style={[k.cardTitle, { color: colors.textPrimary }]}>Kid Quick Launcher</Text>
        </View>
        <View style={k.launcherGrid}>
          {[
            { icon: <Icon.MessageSquare c="#9333EA" />, label: 'Parent Chat',  color: '#9333EA' },
            { icon: <Icon.Car          c="#10B981" />, label: 'Ask Ride',     color: '#10B981' },
            { icon: <Icon.BookOpen     c={BRAND.amber} />, label: 'Ask Tutor', color: BRAND.amber },
            { icon: <Icon.ThumbsUp     c="#6366F1" />, label: 'Cheer',        color: '#6366F1' },
          ].map(item => (
            <TouchableOpacity
              key={item.label}
              style={[k.launcherBtn, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: cardBord }]}
            >
              {item.icon}
              <Text style={[k.launcherLabel, { color: colors.textPrimary }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Dual Sub-Wallets Strip ── */}
      <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 14, marginBottom: 20 }}>
        <View style={[k.walletCard, { backgroundColor: cardBg, borderColor: cardBord, flex: 1 }]}>
          <Text style={[k.walletLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Main Store Wallet</Text>
          <Text style={[k.walletAmount, { color: BRAND.amber }]}>{activeMember.mainCoins} Coins 🪙</Text>
          <Text style={[k.walletSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>Redeem Perks in Store</Text>
        </View>
        <View style={[k.walletCard, { backgroundColor: isDark ? '#1E0D3D' : '#FAF5FF', borderColor: isDark ? '#4C1D95' : '#DDD6FE', flex: 1 }]}>
          <Text style={[k.walletLabel, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>Grandparent Bonus</Text>
          <Text style={[k.walletAmount, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>{activeMember.gpCoins} Coins 🪙</Text>
          <Text style={[k.walletSub, { color: isDark ? '#C4B5FD' : '#7C3AED' }]}>Cash Out via Parents</Text>
        </View>
      </View>
    </>
  );
}

// ─── SENIOR VIEW ──────────────────────────────────────────────────────────────

function SeniorView({ activeMember, colors, isDark, onHelpOpen }: {
  activeMember: any; colors: any; isDark: boolean; onHelpOpen: () => void;
}) {
  const members    = useFamilyStore(s => s.members);
  const { requests, completeRequest } = useKidRequestStore();
  const events     = useEventStore(s => s.events);
  const today      = new Date().toISOString().split('T')[0];

  const [sosTriggered, setSosTriggered]   = useState(false);
  const [tipTargetKid, setTipTargetKid]   = useState('');
  const [tipCoins,     setTipCoins]       = useState(25);
  const [tipMessage,   setTipMessage]     = useState('Great job cleaning your bedroom, sweetheart!');
  const [isSendingTip, setIsSendingTip]   = useState(false);

  const kids       = members.filter(m => m.role === 'kid');
  const targetKid  = kids.find(k => k.id === tipTargetKid) ?? kids[0];

  // Today's events assigned to this senior as driver
  const gpName = activeMember?.name?.toLowerCase() ?? '';
  const pendingRides   = events.filter(e => e.driver && e.driver.toLowerCase().includes(gpName.split(' ')[0]) && e.date === today && !e.approvalPending);
  const myAssignedHelp = requests.filter(r => r.assignedHelper === activeMember?.id && r.status === 'approved');

  const doSendTip = async () => {
    if (isSendingTip || !targetKid) return;
    setIsSendingTip(true);
    await new Promise(r => setTimeout(r, 800));
    useFamilyStore.getState().awardCoins(targetKid.id, tipCoins, 'gpCoins');
    Alert.alert('🎉 Tip Sent!', `${tipCoins} bonus coins sent to ${targetKid.name}!`);
    setIsSendingTip(false);
  };

  const cardBg   = isDark ? '#131927' : '#FFFFFF';
  const cardBord = isDark ? '#1E293B' : '#E2E8F0';

  const timeStr = (t?: string) => {
    if (!t) return '';
    try { return new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
    catch { return t; }
  };

  return (
    <>
      {/* ── Senior Mode Banner ── */}
      <View style={[sv.banner, { backgroundColor: isDark ? '#0F0A1E' : '#1E0D3D', borderColor: isDark ? '#6D28D9' : '#7C3AED' }]}>
        <View style={{ flex: 1 }}>
          <Text style={sv.bannerName}>{activeMember?.name}</Text>
          <Text style={sv.bannerSub}>Welcome back! Here are your daily schedule items</Text>
        </View>
        <TouchableOpacity
          style={[sv.sosBtn, sosTriggered && { backgroundColor: '#7F1D1D' }]}
          onPress={() => setSosTriggered(t => !t)}
        >
          <Text style={sv.sosBtnText}>⚠️ Emergency SOS</Text>
        </TouchableOpacity>
      </View>

      {/* ── SOS Alert ── */}
      {sosTriggered && (
        <View style={[sv.sosAlert, { marginHorizontal: 14, marginBottom: 12 }]}>
          <Text style={sv.sosAlertTitle}>🆘 EMERGENCY SOS ALERT BROADCASTED</Text>
          <Text style={sv.sosAlertBody}>Alert sent to Parents! Live location shared & emergency response notified.</Text>
          <TouchableOpacity style={sv.sosCancelBtn} onPress={() => setSosTriggered(false)}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Cancel Alert</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Driving & Care Assignments ── */}
      <View style={[sv.card, { backgroundColor: cardBg, borderColor: cardBord }]}>
        <View style={[sv.cardHeader, { borderBottomColor: isDark ? 'rgba(255,255,255,0.07)' : '#F1F5F9' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon.Car c={BRAND.purple} />
            <Text style={[sv.cardTitle, { color: colors.textPrimary }]}>Your Driving & Care Assignments</Text>
          </View>
          <View style={[sv.countPill, { backgroundColor: isDark ? '#4C1D95' : '#EDE9FE' }]}>
            <Text style={[sv.countPillText, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
              {pendingRides.length} Active • {myAssignedHelp.length} Help
            </Text>
          </View>
        </View>

        {pendingRides.length === 0 && myAssignedHelp.length === 0 ? (
          <View style={sv.emptyAssignment}>
            <Text style={[sv.emptyText, { color: colors.textTertiary }]}>🎈 No scheduled trips or care duties today! Relax and enjoy.</Text>
          </View>
        ) : (
          <View style={{ gap: 8, marginTop: 10 }}>
            {pendingRides.map(ev => (
              <View key={ev.id} style={[sv.dutyRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: cardBord }]}>
                <View style={{ flex: 1 }}>
                  <View style={sv.dutyChips}>
                    <View style={[sv.dutyBadge, { backgroundColor: isDark ? '#14532D' : '#D1FAE5' }]}>
                      <Text style={[sv.dutyBadgeText, { color: isDark ? '#6EE7B7' : '#065F46' }]}>✓ Confirmed Ride</Text>
                    </View>
                    <Text style={[sv.dutyTime, { color: colors.textTertiary }]}>{timeStr(ev.time)}</Text>
                  </View>
                  <Text style={[sv.dutyTitle, { color: colors.textPrimary }]}>{ev.title}</Text>
                  {ev.location && <Text style={[sv.dutySub, { color: colors.textSecondary }]}>📍 {ev.location}</Text>}
                </View>
              </View>
            ))}
            {myAssignedHelp.map(req => {
              const requester = members.find(m => m.id === req.fromMemberId);
              return (
                <View key={req.id} style={[sv.dutyRow, { backgroundColor: isDark ? '#1E0D3D' : '#FAF5FF', borderColor: isDark ? '#4C1D95' : '#DDD6FE' }]}>
                  <View style={{ flex: 1 }}>
                    <View style={[sv.dutyBadge, { backgroundColor: isDark ? '#4C1D95' : '#EDE9FE', alignSelf: 'flex-start', marginBottom: 4 }]}>
                      <Text style={[sv.dutyBadgeText, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>📚 Tutor / Care Duty</Text>
                    </View>
                    <Text style={[sv.dutyTitle, { color: colors.textPrimary }]}>{req.detail}</Text>
                    <Text style={[sv.dutySub, { color: colors.textSecondary }]}>Requester: {requester?.name ?? 'Member'}</Text>
                  </View>
                  <TouchableOpacity
                    style={[sv.completeBtn, { backgroundColor: BRAND.purple }]}
                    onPress={() => completeRequest(req.id, activeMember.id)}
                  >
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>Complete Support</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Grandparent Bonus Coin Dispenser ── */}
      <View style={[sv.gpCard, { marginHorizontal: 14, marginBottom: 12 }]}>
        <View style={[sv.cardHeader, { borderBottomColor: 'rgba(167,139,250,0.3)' }]}>
          <Text style={sv.gpTitle}>🎁 Send Grandparent Bonus Coins to Grandkids</Text>
          <View style={[sv.matchPill]}>
            <Text style={sv.matchPillText}>100% Matching</Text>
          </View>
        </View>

        <View style={{ gap: 10, marginTop: 10 }}>
          {/* Kid selector */}
          <Text style={sv.gpLabel}>Select Grandchild:</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {kids.map(k => (
              <TouchableOpacity
                key={k.id}
                style={[sv.kidChip, (tipTargetKid || kids[0]?.id) === k.id && sv.kidChipActive]}
                onPress={() => setTipTargetKid(k.id)}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: (tipTargetKid || kids[0]?.id) === k.id ? '#0F172A' : '#C4B5FD' }}>
                  {k.emoji ?? '🧒'} {k.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Amount selector */}
          <Text style={sv.gpLabel}>Bonus Amount:</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[15, 25, 50].map(amt => (
              <TouchableOpacity
                key={amt}
                style={[sv.amtChip, tipCoins === amt && sv.amtChipActive]}
                onPress={() => setTipCoins(amt)}
              >
                <Text style={{ fontSize: 11, fontWeight: '900', color: tipCoins === amt ? '#fff' : '#C4B5FD' }}>+{amt} 🪙</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Note */}
          <Text style={sv.gpLabel}>Encouragement Note:</Text>
          <TextInput
            style={sv.gpInput}
            value={tipMessage}
            onChangeText={setTipMessage}
            placeholderTextColor="#7C3AED"
          />

          {/* Send button */}
          <TouchableOpacity
            style={[sv.sendTipBtn, { opacity: isSendingTip ? 0.6 : 1 }]}
            onPress={doSendTip}
            disabled={isSendingTip}
          >
            {isSendingTip
              ? <><ActivityIndicator color="#0F172A" size="small" /><Text style={sv.sendTipText}>Tip Dispenser syncing...</Text></>
              : <Text style={sv.sendTipText}>🪙 Send +{tipCoins} Bonus Coins to {targetKid?.name ?? 'Grandkid'}</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Senior Caregiver HQ Info ── */}
      <View style={[sv.card, { backgroundColor: isDark ? '#1E0D3D' : '#FAF5FF', borderColor: isDark ? '#4C1D95' : '#DDD6FE' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Icon.Award c={isDark ? '#C4B5FD' : '#6D28D9'} />
          <Text style={[sv.cardTitle, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>Senior Caregiver & Driver HQ</Text>
        </View>
        <Text style={{ fontSize: 12, color: isDark ? '#A78BFA' : '#7C3AED', lineHeight: 18 }}>
          Grandparents have exclusive permissions to send Grandparent Bonus Tips into grandchildren's sub-wallets and assist with carpool schedules.
        </Text>
      </View>
    </>
  );
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────

export default function HubScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const unreadCount = useKidRequestStore(s => s.getUnread().length);
  const [helpModalVisible, setHelpModalVisible] = useState(false);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members.find(m => m.role === 'parent') ?? members[0];
  const role = activeMember?.role ?? 'parent';

  const switchMember = () => {
    const idx  = members.findIndex(m => m.id === activeMember?.id);
    const next = members[(idx + 1) % members.length];
    if (next) setActiveMember(next.id);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name}
        memberRole={role === 'kid' ? 'kid' : role === 'senior' ? 'senior' : 'parent'}
        notifCount={unreadCount}
        onPersonaPress={switchMember}
        onBellPress={() => {}}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>

        {role === 'parent' && (
          <ParentView
            activeMemberId={activeMember?.id ?? ''}
            colors={colors}
            isDark={isDark}
            onHelpOpen={() => setHelpModalVisible(true)}
          />
        )}

        {role === 'kid' && (
          <KidView
            activeMember={activeMember}
            colors={colors}
            isDark={isDark}
            onHelpOpen={() => setHelpModalVisible(true)}
          />
        )}

        {role === 'senior' && (
          <SeniorView
            activeMember={activeMember}
            colors={colors}
            isDark={isDark}
            onHelpOpen={() => setHelpModalVisible(true)}
          />
        )}
      </ScrollView>

      <RequestHelpModal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        activeMemberId={activeMember?.id ?? ''}
      />
    </SafeAreaView>
  );
}

// ─── Parent styles ────────────────────────────────────────────────────────────

const p = StyleSheet.create({
  actionBar:       { flexDirection: 'row', gap: 6, borderRadius: 24, borderWidth: 1, padding: 10, marginHorizontal: 14, marginBottom: 12 },
  actionBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 18 },
  actionBtnText:   { fontSize: 10, fontWeight: '900', color: '#fff' },
  card:            { borderRadius: 24, borderWidth: 1, padding: 14 },
  cardHeaderRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 10, marginBottom: 4 },
  sectionTitle:    { fontSize: 12, fontWeight: '700' },
  sectionLabelUpper: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  statusPill:      { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText:  { fontSize: 9, fontWeight: '700' },
  carPoolRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 10, gap: 10, marginTop: 8 },
  carPoolTitle:    { fontSize: 12, fontWeight: '900' },
  carPoolSub:      { fontSize: 10, fontWeight: '600', marginTop: 2 },
  claimBtn:        { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  claimBtnText:    { color: '#fff', fontSize: 10, fontWeight: '900' },
  walletRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 10 },
  walletName:      { fontSize: 12, fontWeight: '700' },
  walletMain:      { fontSize: 11, fontWeight: '900' },
  walletGP:        { fontSize: 10, fontWeight: '700', marginTop: 1 },
  navIconWrap:     { width: 40, height: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  enRouteTitle:    { fontSize: 12, fontWeight: '900' },
  enRouteSub:      { fontSize: 10, marginTop: 2 },
  enRouteBtn:      { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  enRouteBtnText:  { color: '#fff', fontSize: 12, fontWeight: '900' },
  choreRow:        { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 10, gap: 10 },
  photoThumb:      { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  choreSubmitter:  { fontSize: 10, fontWeight: '600' },
  choreTitle:      { fontSize: 12, fontWeight: '900', marginTop: 2 },
  choreCoin:       { fontSize: 10, fontWeight: '900', marginTop: 2 },
  payBtn:          { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  payBtnText:      { color: '#fff', fontSize: 11, fontWeight: '700' },
  tlRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: 1, padding: 10 },
  tlTime:          { fontSize: 11, fontWeight: '700' },
  tlTitle:         { fontSize: 12, fontWeight: '600' },
  tlChip:          { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tlChipText:      { fontSize: 10, fontWeight: '600' },
  emptyTimeline:   { fontSize: 12, textAlign: 'center', padding: 10 },
});

// ─── Kid styles ───────────────────────────────────────────────────────────────

const k = StyleSheet.create({
  card:          { borderRadius: 24, borderWidth: 1, padding: 14 },
  cardTitle:     { fontSize: 12, fontWeight: '700' },
  alertTitle:    { fontSize: 12, fontWeight: '900' },
  alertBody:     { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  statusPill:    { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText:{ fontSize: 9, fontWeight: '700' },
  launcherGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  launcherBtn:   { width: '22%', flex: 1, borderRadius: 16, borderWidth: 1, padding: 10, alignItems: 'center', gap: 4 },
  launcherLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
  walletCard:    { borderRadius: 16, borderWidth: 1, padding: 14 },
  walletLabel:   { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  walletAmount:  { fontSize: 18, fontWeight: '900', marginTop: 4 },
  walletSub:     { fontSize: 10, marginTop: 2 },
});

// ─── Senior styles ────────────────────────────────────────────────────────────

const sv = StyleSheet.create({
  banner:        { flexDirection: 'row', alignItems: 'center', borderRadius: 24, borderWidth: 1, padding: 16, marginHorizontal: 14, marginBottom: 12 },
  bannerName:    { fontSize: 18, fontWeight: '900', color: '#fff' },
  bannerSub:     { fontSize: 11, color: '#A78BFA', fontWeight: '600', marginTop: 2 },
  sosBtn:        { backgroundColor: '#DC2626', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  sosBtnText:    { color: '#fff', fontSize: 11, fontWeight: '900' },
  sosAlert:      { backgroundColor: '#450A0A', borderWidth: 2, borderColor: '#EF4444', borderRadius: 24, padding: 16, gap: 10 },
  sosAlertTitle: { color: '#FCA5A5', fontSize: 14, fontWeight: '900' },
  sosAlertBody:  { color: '#FEE2E2', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  sosCancelBtn:  { backgroundColor: '#7F1D1D', borderRadius: 12, padding: 10, alignItems: 'center' },
  card:          { borderRadius: 24, borderWidth: 1, padding: 14, marginHorizontal: 14, marginBottom: 12 },
  cardHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 10 },
  cardTitle:     { fontSize: 13, fontWeight: '900' },
  countPill:     { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  countPillText: { fontSize: 10, fontWeight: '700' },
  emptyAssignment: { padding: 24, alignItems: 'center' },
  emptyText:     { fontSize: 12, textAlign: 'center' },
  dutyRow:       { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 12, gap: 10 },
  dutyChips:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  dutyBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  dutyBadgeText: { fontSize: 10, fontWeight: '900' },
  dutyTime:      { fontSize: 11, fontWeight: '600' },
  dutyTitle:     { fontSize: 13, fontWeight: '900' },
  dutySub:       { fontSize: 11, marginTop: 2 },
  completeBtn:   { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  gpCard:        { backgroundColor: '#1E0D3D', borderRadius: 24, borderWidth: 1, borderColor: '#4C1D95', padding: 14 },
  gpTitle:       { fontSize: 12, fontWeight: '900', color: '#C4B5FD', flex: 1 },
  matchPill:     { backgroundColor: BRAND.amber, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  matchPillText: { fontSize: 9, fontWeight: '900', color: '#0F172A' },
  gpLabel:       { fontSize: 11, fontWeight: '700', color: '#A78BFA' },
  kidChip:       { borderRadius: 16, borderWidth: 1, borderColor: '#4C1D95', backgroundColor: '#4C1D95', paddingHorizontal: 12, paddingVertical: 8 },
  kidChipActive: { backgroundColor: BRAND.amber, borderColor: BRAND.amber },
  amtChip:       { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: '#4C1D95', backgroundColor: '#1E0D3D', padding: 10, alignItems: 'center' },
  amtChipActive: { backgroundColor: '#059669', borderColor: '#059669' },
  gpInput:       { backgroundColor: 'rgba(109,40,217,0.4)', borderRadius: 12, borderWidth: 1, borderColor: '#4C1D95', padding: 10, color: '#E9D5FF', fontSize: 12 },
  sendTipBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, padding: 14, backgroundColor: BRAND.amber },
  sendTipText:   { fontSize: 12, fontWeight: '900', color: '#0F172A' },
});
