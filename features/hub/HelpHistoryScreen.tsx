import React, { useState, useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView, SafeAreaView, TextInput, Modal,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useHelpStore, HelpRequest, HelpStatus } from '@/store/helpStore';
import { useFamilyStore } from '@/store/familyStore';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

// ─── Date picker (simple inline, no external lib) ────────────────────────────

function DateInput({
  label, value, onChange, colors,
}: { label: string; value: string; onChange: (v: string) => void; colors: any }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontSize: TYPO.label, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textTertiary}
        style={{
          fontSize: TYPO.body, color: colors.textPrimary,
          borderRadius: 10, borderWidth: 1.5, borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 12, paddingVertical: 8,
        }}
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
        maxLength={10}
        autoCorrect={false}
      />
    </View>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<HelpStatus, { label: string; color: string }> = {
  pending:             { label: 'Pending',   color: BRAND.amber },
  awaiting_acceptance: { label: 'Offered',   color: BRAND.purple },
  assigned:            { label: 'Assigned',  color: BRAND.teal },
  completed:           { label: 'Done ✓',    color: '#10B981' },
  rejected:            { label: 'Rejected',  color: '#EF4444' },
  withdrawn:           { label: 'Withdrawn', color: '#94A3B8' },
};

function StatusBadge({ status }: { status: HelpStatus }) {
  const { label, color } = STATUS_META[status] ?? { label: status, color: '#888' };
  return (
    <View style={{ backgroundColor: color + '22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </Text>
    </View>
  );
}

function CatChip({ cat }: { cat: string }) {
  return (
    <View style={{ backgroundColor: BRAND.purple + '18', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '600', color: BRAND.purple }}>
        {cat}
      </Text>
    </View>
  );
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ req, colors, isDark }: { req: HelpRequest; colors: any; isDark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(req.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Pressable
      onPress={() => setExpanded(v => !v)}
      style={{
        borderRadius: 14, borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: isDark ? colors.surface : '#FAFBFF',
        overflow: 'hidden',
      }}
    >
      {/* Summary row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
            {req.title}
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            {req.requesterName.split(' ')[0]} · {date}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <StatusBadge status={req.status} />
          <CatChip cat={req.category} />
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textTertiary} style={{ marginTop: 3 }} />
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 }}>
            "{req.description}"
          </Text>

          {req.assignedHelper && (
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
              Helper: <Text style={{ fontWeight: '700', color: BRAND.teal }}>{req.assignedHelper}</Text>
            </Text>
          )}

          {req.offeredByName && req.status === 'awaiting_acceptance' && (
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
              Offered by: <Text style={{ fontWeight: '700' }}>{req.offeredByName}</Text>
              {req.offeredToIds?.length ? ` → ${req.offeredToIds.join(', ')}` : ''}
            </Text>
          )}

          {req.status === 'rejected' && req.rejectionReason && (
            <View style={{ backgroundColor: '#EF444412', borderRadius: 10, padding: 10 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#EF4444' }}>Rejected by {req.rejectedByName}</Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>"{req.rejectionReason}"</Text>
            </View>
          )}

          {req.lastDeclineComment && (
            <View style={{ backgroundColor: BRAND.amber + '18', borderRadius: 10, padding: 10 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: BRAND.amber }}>Last decline: {req.lastDeclinedByName}</Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>"{req.lastDeclineComment}"</Text>
            </View>
          )}

          {req.offerNote && (
            <Text style={{ fontSize: TYPO.body, color: colors.textTertiary, fontStyle: 'italic' }}>
              Note: "{req.offerNote}"
            </Text>
          )}

          {(req.date || req.fromLoc) && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>
              {req.date ? `📅 ${req.date}` : ''}{req.time ? ` · ${req.time}` : ''}
              {req.fromLoc ? `\n📍 ${req.fromLoc}` : ''}{req.toLoc ? ` → ${req.toLoc}` : ''}
            </Text>
          )}

          {req.rewardCoins && req.status === 'completed' && (
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: BRAND.amber }}>
              +{req.rewardCoins} 🪙 reward
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

const ALL_STATUSES: Array<{ value: HelpStatus | 'all'; label: string }> = [
  { value: 'all',      label: 'All' },
  { value: 'completed', label: 'Done' },
  { value: 'rejected',  label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'assigned',  label: 'Assigned' },
  { value: 'pending',   label: 'Pending' },
  { value: 'awaiting_acceptance', label: 'Offered' },
];

function FilterPill({
  label, active, onPress, colors,
}: { label: string; active: boolean; onPress: () => void; colors: any }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
        backgroundColor: active ? BRAND.purple : colors.surface,
        borderWidth: 1.5,
        borderColor: active ? BRAND.purple : colors.border,
      }}
    >
      <Text style={{
        fontSize: TYPO.caption, fontWeight: '700',
        color: active ? '#fff' : colors.textSecondary,
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HelpHistoryScreen() {
  const { colors, isDark } = useTheme();
  const { requests } = useHelpStore();
  const { members, activeMemberId } = useFamilyStore();

  const active = members.find(m => m.id === activeMemberId) ?? members[0];
  const isAdult = active?.role === 'parent' || active?.role === 'senior';

  const [statusFilter, setStatusFilter]   = useState<HelpStatus | 'all'>('all');
  const [fromDate, setFromDate]           = useState('');
  const [toDate, setToDate]               = useState('');
  const [searchText, setSearchText]       = useState('');

  const filtered = useMemo(() => {
    let pool = [...requests];

    // Kids see only their own history
    if (!isAdult && active) {
      pool = pool.filter(r =>
        r.requesterId === active.id ||
        r.assignedHelperId === active.id ||
        (r.offeredToIds ?? []).includes(active.id)
      );
    }

    if (statusFilter !== 'all') {
      pool = pool.filter(r => r.status === statusFilter);
    }

    if (fromDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      pool = pool.filter(r => r.createdAt >= fromDate);
    }
    if (toDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      pool = pool.filter(r => r.createdAt <= toDate + 'T23:59:59');
    }

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      pool = pool.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.requesterName.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.assignedHelper?.toLowerCase().includes(q) ?? false)
      );
    }

    // Sort newest first
    return pool.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [requests, statusFilter, fromDate, toDate, searchText, isAdult, active]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>
          Help History
        </Text>
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>
          {filtered.length} request{filtered.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Search */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: colors.surface,
          borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
          paddingHorizontal: 12, paddingVertical: 8,
        }}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by title, name, category…"
            placeholderTextColor={colors.textTertiary}
            style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary }}
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>

        {/* Date range */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <DateInput label="From" value={fromDate} onChange={setFromDate} colors={colors} />
          <DateInput label="To"   value={toDate}   onChange={setToDate}   colors={colors} />
          {(fromDate || toDate) && (
            <Pressable onPress={() => { setFromDate(''); setToDate(''); }}
              style={{ justifyContent: 'flex-end', paddingBottom: 8 }}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>

        {/* Status filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {ALL_STATUSES.map(s => (
            <FilterPill
              key={s.value}
              label={s.label}
              active={statusFilter === s.value}
              onPress={() => setStatusFilter(s.value)}
              colors={colors}
            />
          ))}
        </ScrollView>

        {/* Results */}
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
            <Text style={{ fontSize: 32 }}>📂</Text>
            <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textTertiary }}>
              No requests match your filters
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {filtered.map(req => (
              <HistoryRow key={req.id} req={req} colors={colors} isDark={isDark} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
