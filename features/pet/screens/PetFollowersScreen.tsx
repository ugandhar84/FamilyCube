import { showAlert } from '@/components/AppAlert';
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Keyboard, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PawBondLoader from '@/components/PawBondLoader';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { unfollowPet } from '@/lib/db/follows';
import { usePetStore } from '@/shared/store';
import { TYPO } from '@/constants/theme';

type Tab = 'followers' | 'following';

type PetRow = {
  id: string;
  name: string;
  emoji: string;
  accent_color: string;
  avatar_url: string | null;
  owner_id: string;
  profiles: { id: string; full_name: string | null; handle: string | null; avatar_url: string | null } | null;
};

// Entry in the unified follows map
// relatedPetIds = which of MY pets are the "relationship" pet
// For following: which of my pets follow this target
// For followers: which of my pets this follower pet follows
type FollowEntry = { pet: PetRow; relatedPetIds: string[] };

const PET_SELECT = 'id, name, emoji, accent_color, avatar_url, owner_id, profiles(id, full_name, handle, avatar_url)';

export default function FollowersScreen() {
  const { petId, initialTab } = useLocalSearchParams<{
    petId?: string; initialTab?: Tab;
  }>();

  const insets     = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const myPets     = usePetStore(s => s.pets);

  // Is this viewing one of the current user's own pets?
  const isMyView = useMemo(
    () => !petId || myPets.some((p: any) => p.id === petId),
    [petId, myPets],
  );

  // Filter chips only if user has 2+ pets in their own unified view
  const showChips = isMyView && myPets.length > 1;

  const [filterPetId, setFilterPetId] = useState<string | null>(null);

  const activePet: any = useMemo(
    () => (filterPetId ? myPets.find((p: any) => p.id === filterPetId) : myPets[0]) ?? myPets[0] ?? null,
    [filterPetId, myPets],
  );
  const ac: string = activePet?.accent_color ?? '#7C5CBF';

  const [tab, setTab]         = useState<Tab>(initialTab ?? 'followers');
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  // Unified maps keyed by the "other" pet's ID
  const [followingMap, setFollowingMap] = useState<Record<string, FollowEntry>>({});
  const [followersMap, setFollowersMap] = useState<Record<string, FollowEntry>>({});

  // Multi-pet unfollow picker
  const [unfollowTarget, setUnfollowTarget] = useState<{
    target: PetRow;
    followerPets: any[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isMyView) {
        const myPetIds = myPets.map((p: any) => p.id);
        if (myPetIds.length === 0) { setLoading(false); return; }

        const [fwRes, flRes] = await Promise.all([
          supabase.from('pet_follows')
            .select(`follower_pet_id, following_pet:pets!following_pet_id(${PET_SELECT})`)
            .in('follower_pet_id', myPetIds).limit(1000),
          supabase.from('pet_follows')
            .select(`following_pet_id, follower_pet:pets!follower_pet_id(${PET_SELECT})`)
            .in('following_pet_id', myPetIds).limit(1000),
        ]);

        // Build following map: targets that any of my pets follow
        const fw: Record<string, FollowEntry> = {};
        for (const row of (fwRes.data ?? []) as any[]) {
          const t = row.following_pet as PetRow | null;
          if (!t) continue;
          if (!fw[t.id]) fw[t.id] = { pet: t, relatedPetIds: [] };
          if (!fw[t.id].relatedPetIds.includes(row.follower_pet_id))
            fw[t.id].relatedPetIds.push(row.follower_pet_id);
        }
        setFollowingMap(fw);

        // Build followers map: pets that follow any of mine (excluding my own pets)
        const fl: Record<string, FollowEntry> = {};
        for (const row of (flRes.data ?? []) as any[]) {
          const f = row.follower_pet as PetRow | null;
          if (!f || myPetIds.includes(f.id)) continue;
          if (!fl[f.id]) fl[f.id] = { pet: f, relatedPetIds: [] };
          if (!fl[f.id].relatedPetIds.includes(row.following_pet_id))
            fl[f.id].relatedPetIds.push(row.following_pet_id);
        }
        setFollowersMap(fl);
      } else {
        // Single-pet view (viewing someone else's pet)
        if (!petId) { setLoading(false); return; }
        const [fwRes, flRes] = await Promise.all([
          supabase.from('pet_follows')
            .select(`following_pet:pets!following_pet_id(${PET_SELECT})`)
            .eq('follower_pet_id', petId).limit(500),
          supabase.from('pet_follows')
            .select(`follower_pet:pets!follower_pet_id(${PET_SELECT})`)
            .eq('following_pet_id', petId).limit(500),
        ]);
        const fw: Record<string, FollowEntry> = {};
        for (const row of (fwRes.data ?? []) as any[]) {
          const t = row.following_pet as PetRow | null;
          if (t) fw[t.id] = { pet: t, relatedPetIds: [] };
        }
        const fl: Record<string, FollowEntry> = {};
        for (const row of (flRes.data ?? []) as any[]) {
          const f = row.follower_pet as PetRow | null;
          if (f) fl[f.id] = { pet: f, relatedPetIds: [] };
        }
        setFollowingMap(fw);
        setFollowersMap(fl);
      }
    } catch (e) {
      console.error('[PetFollowersScreen] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [isMyView, petId, myPets]);

  useEffect(() => { load(); }, [load]);

  const switchTab = (t: Tab) => { setTab(t); setSearch(''); };

  const q = search.trim().toLowerCase();

  const followingEntries = useMemo(() => {
    let entries = Object.values(followingMap);
    if (filterPetId) entries = entries.filter(e => e.relatedPetIds.includes(filterPetId));
    if (q) entries = entries.filter(e =>
      e.pet.name.toLowerCase().includes(q) ||
      e.pet.profiles?.handle?.toLowerCase().includes(q) ||
      e.pet.profiles?.full_name?.toLowerCase().includes(q),
    );
    return entries;
  }, [followingMap, filterPetId, q]);

  const followersEntries = useMemo(() => {
    let entries = Object.values(followersMap);
    if (filterPetId) entries = entries.filter(e => e.relatedPetIds.includes(filterPetId));
    if (q) entries = entries.filter(e =>
      e.pet.name.toLowerCase().includes(q) ||
      e.pet.profiles?.handle?.toLowerCase().includes(q) ||
      e.pet.profiles?.full_name?.toLowerCase().includes(q),
    );
    return entries;
  }, [followersMap, filterPetId, q]);

  const handleUnfollow = (entry: FollowEntry) => {
    if (!isMyView) return;
    // Which of MY pets are following this target?
    const followerPets = myPets.filter((p: any) => entry.relatedPetIds.includes(p.id));
    if (followerPets.length === 0) return;

    if (followerPets.length === 1) {
      // Only 1 pet follows — direct confirm, no picker needed
      showAlert('Unfollow?', `Stop following ${entry.pet.name}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow', style: 'destructive', onPress: async () => {
            try {
              await unfollowPet(followerPets[0].id, entry.pet.id);
              setFollowingMap(prev => {
                const next = { ...prev };
                delete next[entry.pet.id];
                return next;
              });
            } catch (e: any) {
              showAlert('Error', e.message ?? 'Could not unfollow.');
            }
          },
        },
      ]);
    } else {
      // 2+ of my pets follow this target — show picker
      setUnfollowTarget({ target: entry.pet, followerPets });
    }
  };

  const doUnfollowAs = async (followerPetId: string, targetPetId: string) => {
    try {
      await unfollowPet(followerPetId, targetPetId);
      setFollowingMap(prev => {
        const entry = prev[targetPetId];
        if (!entry) return prev;
        const updated = entry.relatedPetIds.filter(id => id !== followerPetId);
        if (updated.length === 0) {
          const next = { ...prev };
          delete next[targetPetId];
          return next;
        }
        return { ...prev, [targetPetId]: { ...entry, relatedPetIds: updated } };
      });
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Could not unfollow.');
    }
  };

  const openPet = (id: string) => router.push({ pathname: '/pet/[id]', params: { id } } as any);

  const renderRow = (entry: FollowEntry, showUnfollow: boolean) => {
    const p    = entry.pet;
    const pAc  = p.accent_color ?? '#7C5CBF';
    const owner = p.profiles;
    const ownerLabel = owner?.handle ? `@${owner.handle}` : 'PawBond user';

    return (
      <TouchableOpacity
        key={p.id}
        activeOpacity={0.75}
        onPress={() => openPet(p.id)}
        style={[s.row, { borderBottomColor: colors.border }]}>
        <View style={[s.avatar, { backgroundColor: `${pAc}18`, borderColor: `${pAc}50` }]}>
          {p.avatar_url
            ? <Image source={{ uri: p.avatar_url }} cachePolicy="memory-disk" style={s.avatarImg} />
            : <Text style={{ fontSize: TYPO.title }}>{p.emoji ?? '🐾'}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {p.emoji} {p.name}
          </Text>
          <Text style={[s.sub, { color: colors.textSecondary }]} numberOfLines={1}>{ownerLabel}</Text>
          {/* Show which of my pets have the relationship (multi-pet only) */}
          {showChips && entry.relatedPetIds.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
              {entry.relatedPetIds.map(id => {
                const mp: any = myPets.find((pp: any) => pp.id === id);
                if (!mp) return null;
                const mpAc = mp.accent_color ?? ac;
                return (
                  <View key={id} style={{ backgroundColor: `${mpAc}18`, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '600', color: mpAc }}>
                      {mp.emoji ?? '🐾'} {mp.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
        {showUnfollow && isMyView && (
          <TouchableOpacity
            onPress={() => handleUnfollow(entry)}
            style={[s.unfollowBtn, { borderColor: colors.border }]}>
            <Text style={[s.unfollowTxt, { color: colors.textSecondary }]}>Unfollow</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const totalFollowing = Object.keys(followingMap).length;
  const totalFollowers = Object.keys(followersMap).length;

  const headerChipLabel = isMyView
    ? (myPets.length > 1
        ? (filterPetId ? `${activePet?.emoji ?? '🐾'} ${activePet?.name}` : 'All Pets')
        : `${myPets[0]?.emoji ?? '🐾'} ${(myPets[0] as any)?.name ?? ''}`)
    : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>

        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => { Keyboard.dismiss(); router.back(); }}
            style={{ width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
              backgroundColor: colors.card, borderColor: colors.border,
              alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
            {tab === 'followers' ? 'Followers' : 'Following'}
          </Text>
          {headerChipLabel ? (
            <View style={{ backgroundColor: `${ac}18`, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: ac }}>{headerChipLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* Pet filter chips (multi-pet unified view only) */}
        {showChips && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
            style={{ maxHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <TouchableOpacity
              onPress={() => setFilterPetId(null)}
              style={[s.chip, { backgroundColor: !filterPetId ? ac : colors.inputBg, borderColor: !filterPetId ? ac : colors.border }]}>
              <Text style={[s.chipTxt, { color: !filterPetId ? '#fff' : colors.textSecondary }]}>All</Text>
            </TouchableOpacity>
            {myPets.map((p: any) => {
              const pAc = p.accent_color ?? ac;
              const sel = filterPetId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setFilterPetId(p.id)}
                  style={[s.chip, { backgroundColor: sel ? pAc : colors.inputBg, borderColor: sel ? pAc : colors.border }]}>
                  <Text style={[s.chipTxt, { color: sel ? '#fff' : colors.textSecondary }]}>
                    {p.emoji ?? '🐾'} {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Tabs */}
        <View style={[s.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {(['followers', 'following'] as Tab[]).map(t => {
            const active = tab === t;
            const count  = t === 'followers' ? totalFollowers : totalFollowing;
            return (
              <TouchableOpacity key={t} style={s.tabBtn} onPress={() => switchTab(t)} activeOpacity={0.75}>
                <Text style={[s.tabTxt, { color: active ? ac : colors.textTertiary, fontWeight: active ? '800' : '500' }]}>
                  {t === 'followers' ? 'Followers' : 'Following'}
                </Text>
                {!loading && (
                  <View style={[s.tabBadge, { backgroundColor: active ? ac : colors.inputBg }]}>
                    <Text style={[s.tabBadgeTxt, { color: active ? '#fff' : colors.textTertiary }]}>{count}</Text>
                  </View>
                )}
                {active && <View style={[s.tabLine, { backgroundColor: ac }]} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={s.loaderWrap}><PawBondLoader size={52} /></View>
        ) : (
          <>
            <View style={[s.searchRow, { backgroundColor: colors.inputBg, borderColor: (colors as any).inputBorder ?? colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={[s.searchInput, { color: colors.textPrimary }]}
                placeholder="Search by pet or owner name…"
                placeholderTextColor={(colors as any).placeholder ?? colors.textTertiary}
                value={search} onChangeText={setSearch}
                returnKeyType="search" autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              alwaysBounceVertical={false}
              overScrollMode="never"
              keyboardShouldPersistTaps="handled">
              {tab === 'followers'
                ? followersEntries.length === 0
                  ? <View style={s.empty}><Text style={{ fontSize: 40 }}>🐾</Text><Text style={[s.emptyTxt, { color: colors.textSecondary }]}>{q ? 'No matches' : 'No followers yet'}</Text></View>
                  : followersEntries.map(e => renderRow(e, false))
                : followingEntries.length === 0
                  ? <View style={s.empty}><Text style={{ fontSize: 40 }}>🐾</Text><Text style={[s.emptyTxt, { color: colors.textSecondary }]}>{q ? 'No matches' : 'Not following anyone yet'}</Text></View>
                  : followingEntries.map(e => renderRow(e, true))
              }
            </ScrollView>
          </>
        )}
      </View>

      {/* Multi-pet unfollow picker — only appears when 2+ of user's pets follow the same target */}
      <Modal
        visible={!!unfollowTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setUnfollowTarget(null)}>
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setUnfollowTarget(null)} />
          <View style={[s.sheet, { backgroundColor: colors.card }]}>
            <View style={s.handle} />
            <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>
              Unfollow {unfollowTarget?.target.name}?
            </Text>
            <Text style={[s.sheetSub, { color: colors.textSecondary }]}>
              Choose which of your pets to unfollow as:
            </Text>

            {unfollowTarget?.followerPets.map((p: any) => {
              const pAc = p.accent_color ?? ac;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={async () => {
                    const target = unfollowTarget.target;
                    setUnfollowTarget(null);
                    await doUnfollowAs(p.id, target.id);
                  }}
                  style={[s.pickerRow, { borderTopColor: colors.border }]}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${pAc}18`,
                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {p.avatar_url
                      ? <Image source={{ uri: p.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                      : <Text style={{ fontSize: TYPO.heading }}>{p.emoji ?? '🐾'}</Text>}
                  </View>
                  <Text style={[s.pickerName, { color: colors.textPrimary }]}>{p.emoji} {p.name}</Text>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#E53E3E' }}>Unfollow</Text>
                </TouchableOpacity>
              );
            })}

            {(unfollowTarget?.followerPets.length ?? 0) > 1 && (
              <TouchableOpacity
                onPress={async () => {
                  const target = unfollowTarget!.target;
                  const pets   = unfollowTarget!.followerPets;
                  setUnfollowTarget(null);
                  await Promise.all(pets.map((p: any) => doUnfollowAs(p.id, target.id)));
                }}
                style={[s.pickerRow, { borderTopColor: colors.border, backgroundColor: '#E53E3E0D', justifyContent: 'center' }]}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#E53E3E' }}>
                  Unfollow all ({unfollowTarget?.followerPets.length})
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => setUnfollowTarget(null)}
              style={[s.cancelRow, { borderTopColor: colors.border }]}>
              <Text style={[s.cancelTxt, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:  { fontSize: TYPO.subheading, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  chip:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipTxt:      { fontSize: TYPO.caption, fontWeight: '600' },
  tabs:         { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, paddingVertical: 12, position: 'relative' },
  tabTxt:       { fontSize: TYPO.body, letterSpacing: -0.2 },
  tabBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, minWidth: 22, alignItems: 'center' },
  tabBadgeTxt:  { fontSize: TYPO.body, fontWeight: '800' },
  tabLine:      { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2.5, borderRadius: 2 },
  loaderWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 14, marginBottom: 4,
                  borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput:  { flex: 1, fontSize: TYPO.body, paddingVertical: 0 },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 13,
                  paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar:       { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', borderWidth: 1.5 },
  avatarImg:    { width: 50, height: 50, borderRadius: 25 },
  name:         { fontSize: TYPO.body, fontWeight: '700' },
  sub:          { fontSize: TYPO.caption, marginTop: 2 },
  unfollowBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5 },
  unfollowTxt:  { fontSize: TYPO.caption, fontWeight: '700' },
  empty:        { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTxt:     { fontSize: TYPO.body, textAlign: 'center', paddingHorizontal: 32 },
  // Modal sheet
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 36 },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc',
                  alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  sheetTitle:   { fontSize: TYPO.subheading, fontWeight: '800', textAlign: 'center', paddingHorizontal: 20, marginBottom: 4 },
  sheetSub:     { fontSize: TYPO.caption, textAlign: 'center', paddingHorizontal: 20, marginBottom: 8 },
  pickerRow:    { flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  pickerName:   { flex: 1, fontSize: TYPO.body, fontWeight: '700' },
  cancelRow:    { paddingVertical: 16, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  cancelTxt:    { fontSize: TYPO.subheading, fontWeight: '600' },
});
