import { useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator,
  Keyboard, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useGroceryStore, GroceryRun, GroceryItem } from '@/store/groceryStore';
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';

// ─── Create Run Sheet — Figma "Start shopping run" ───────────────────────────

function fmtPlannedStart(d: Date) {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${weekday} ${day} ${month} ${year} · ${time}`;
}

export function CreateRunSheet({ visible, onClose, familyId, memberId, colors, isDark, onCreated, pendingItems, members, onPinStore }: {
  visible: boolean; onClose: () => void;
  familyId: string; memberId: string;
  colors: any; isDark: boolean;
  onCreated: (run: GroceryRun) => void;
  pendingItems?: GroceryItem[];
  members?: any[];
  onPinStore?: (storeName: string) => void;
}) {
  const createRun = useGroceryStore(s => s.createRun);
  const pastStores = useGroceryStore(s => s.pastStores);
  const pinnedStoresMap = useGroceryStore(s => s.pinnedStores);
  const pinnedStoreNames = Object.keys(pinnedStoresMap);
  const [store, setStore]   = useState('');
  const [name, setName]     = useState('');
  const [saving, setSaving] = useState(false);
  const [plannedAt, setPlannedAt] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<'none' | 'date' | 'time'>('none');

  const DEFAULT_SUGGESTIONS = ['Costco', 'Walmart', 'Whole Foods', "Trader Joe's", 'Patel Brothers', 'Aldi', 'Target', 'Kroger', 'Sprouts'];
  const STORE_SUGGESTIONS = [...new Set([...pastStores, ...DEFAULT_SUGGESTIONS])].slice(0, 9);

  const savingRef = useRef(false);
  const handleSave = async () => {
    if (!store.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const run = await createRun({
      familyId,
      name: name.trim() || `${store.trim()} trip`,
      store: store.trim(),
      createdBy: memberId,
      shopperId: memberId,
      plannedAt: plannedAt?.toISOString(),
    });
    savingRef.current = false;
    setSaving(false);
    if (run) { setName(''); setStore(''); setPlannedAt(null); onCreated(run); }
  };

  const insets = useSafeAreaInsets();
  const P = colors.primary;
  const dismiss = () => { Keyboard.dismiss(); onClose(); };

  // Item summary for the Figma "items · estimated" card
  const approvedItems = (pendingItems ?? []).filter(i => !i.isBought);
  const kidPendingCount = (pendingItems ?? []).filter(i => {
    const requester = (members ?? []).find((m: any) => m.id === i.addedBy);
    return requester?.role === 'kid' && !i.isBought;
  }).length;

  // Active member for shopper card
  const activeMember = (members ?? []).find((m: any) => m.id === memberId);

  if (!visible) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>

      {/* Header — ReviewInbox pattern */}
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: '#FFFFFF', gap: 8 }}>
        <View style={{ gap: 4 }}>
          <Pressable onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Groceries</Text>
          </Pressable>
          <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
            Start shopping run
          </Text>
        </View>
        {/* Figma subtitle */}
        <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary, lineHeight: 20 }}>
          Choose a store and a time. Pending Kid requests stay out of the run.
        </Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 48 }}>

        {/* Figma: "Planned start" labeled field card */}
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#DFE5EF', padding: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#657185', marginBottom: 4 }}>Planned start</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setPickerMode('date')} style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: plannedAt ? colors.textPrimary : colors.textTertiary }}>
                {plannedAt ? fmtPlannedStart(plannedAt) : 'Wed 7 Oct · tap to set'}
              </Text>
            </Pressable>
            {plannedAt && (
              <Pressable onPress={() => setPlannedAt(null)}>
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>
          {/* Date/time tap targets */}
          {!plannedAt && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Pressable onPress={() => setPickerMode('date')}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#DFE5EF', padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: P }}>📅 Date</Text>
              </Pressable>
              <Pressable onPress={() => setPickerMode('time')}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#DFE5EF', padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: P }}>🕐 Time</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Figma: "Choose your branch" card with store rows + pin link */}
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#DFE5EF',
          padding: 20, gap: 14,
          shadowColor: '#172337', shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>Choose your branch</Text>

          {/* Pinned store rows */}
          {pinnedStoreNames.length > 0 ? (
            pinnedStoreNames.map((storeName, i) => (
              <Pressable key={storeName} onPress={() => setStore(storeName)}
                style={{ gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: store === storeName ? '700' : '600', color: colors.textPrimary }}>
                  {store === storeName ? 'Selected · ' : ''}{storeName}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#657185' }}>
                  Pinned branch{store !== storeName ? ' · not selected' : ''}
                </Text>
                {i < pinnedStoreNames.length - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: '#DFE5EF', marginTop: 10 }} />}
              </Pressable>
            ))
          ) : (
            STORE_SUGGESTIONS.slice(0, 3).map((s, i) => (
              <Pressable key={s} onPress={() => setStore(s)} style={{ gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: store === s ? '700' : '600', color: colors.textPrimary }}>
                  {store === s ? 'Selected · ' : ''}{s}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#657185' }}>
                  {store === s ? 'Selected store' : 'not selected'}
                </Text>
                {i < 2 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: '#DFE5EF', marginTop: 10 }} />}
              </Pressable>
            ))
          )}

          {/* Type custom store */}
          <View style={{ borderRadius: 10, borderWidth: 1, borderColor: store ? P : '#DFE5EF',
            padding: 12, backgroundColor: '#FFFFFF' }}>
            <TextInput
              style={{ fontSize: 14, color: colors.textPrimary }}
              placeholder="Or type store name…"
              placeholderTextColor={colors.textTertiary}
              value={store} onChangeText={setStore}
            />
          </View>

          {/* Figma: "Pin a specific store location →" link */}
          <Pressable
            onPress={() => onPinStore?.(store.trim() || 'Store')}
            style={{ borderRadius: 14, borderWidth: 1, borderColor: '#DFE5EF', padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: P }}>Pin a specific store location →</Text>
          </Pressable>
        </View>

        {/* Figma: Shopper member card (pinkLight bg) */}
        {activeMember && (
          <View style={{ backgroundColor: colors.pinkLight, borderRadius: 14, padding: 16,
            flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: P,
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                {activeMember.name?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                {activeMember.name} · Selected
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#657185' }}>
                Run owner · shopper · drives
              </Text>
            </View>
          </View>
        )}

        {/* Figma: Items summary card (amberLight bg) */}
        {approvedItems.length > 0 && (
          <View style={{ backgroundColor: colors.amberLight, borderRadius: 14, padding: 16, gap: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
              {approvedItems.length} item{approvedItems.length !== 1 ? 's' : ''} ready to shop
            </Text>
            {kidPendingCount > 0 && (
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#657185' }}>
                {kidPendingCount} kid request{kidPendingCount !== 1 ? 's' : ''} excluded (pending approval).
              </Text>
            )}
          </View>
        )}

        {/* Figma: footer note */}
        <Text style={{ fontSize: 13, fontWeight: '500', color: '#657185', lineHeight: 18 }}>
          Starts a shared shopping run only. It does not purchase items or dispatch a ride.
        </Text>

        {/* Optional trip name */}
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#DFE5EF', padding: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#657185', marginBottom: 4 }}>Trip name (optional)</Text>
          <TextInput
            style={{ fontSize: 14, color: colors.textPrimary }}
            placeholder={store ? `${store} trip` : 'e.g. Diwali party groceries'}
            placeholderTextColor={colors.textTertiary}
            value={name} onChangeText={setName}
          />
        </View>

        {/* Start button */}
        <Pressable onPress={handleSave} disabled={!store.trim() || saving}
          style={{ borderRadius: 14, paddingVertical: 16, alignItems: 'center',
            backgroundColor: (!store.trim() || saving) ? colors.surface : P }}>
          {saving
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={{ fontSize: 16, fontWeight: '700', color: (!store.trim() || saving) ? colors.textTertiary : '#FFFFFF' }}>
                Start Trip{store ? ` · ${store}` : ''}
              </Text>}
        </Pressable>

      </ScrollView>

      <PickerOverlay
        showDate={pickerMode === 'date'}
        showTime={pickerMode === 'time'}
        value={plannedAt ?? new Date()}
        onChangeDate={(d) => setPlannedAt(prev => {
          const next = prev ? new Date(prev) : new Date();
          next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
          return next;
        })}
        onChangeTime={(d) => setPlannedAt(prev => {
          const next = prev ? new Date(prev) : new Date();
          next.setHours(d.getHours(), d.getMinutes(), 0, 0);
          return next;
        })}
        onDone={() => setPickerMode('none')}
        accentColor={P}
        colors={colors}
        dateLabel="📅 When are you going?"
        timeLabel="🕐 What time?"
      />
    </View>
  );
}
