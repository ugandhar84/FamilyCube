import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Alert, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useAuthStore } from '@/store/authStore';
import AppHeader from '@/components/AppHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type VaultTab = 'gps' | 'health' | 'aiDoc' | 'meals' | 'memories' | 'ledger' | 'roster';

interface Medication {
  id: string; name: string; dosage: string;
  recipient: string; time: string; takenToday: boolean;
}
interface Vaccine {
  id: string; member: string; title: string; date: string; status: string;
}
interface Memory {
  id: string; title: string; date: string; emoji: string; hearts: number;
}

const BRAND = {
  purple: '#7C3AED',
  teal:   '#14B8A6',
  amber:  '#F59E0B',
  emerald:'#10B981',
  rose:   '#F43F5E',
};

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function SCard({ children, colors, isDark, style }: {
  children: React.ReactNode; colors: any; isDark: boolean; style?: any;
}) {
  return (
    <View style={[s.scard, {
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderColor: isDark ? colors.border : '#EDE9FE',
      shadowColor: BRAND.purple,
      ...style,
    }]}>
      {children}
    </View>
  );
}

function CardHeader({ icon, title, badge, badgeColor, colors }: {
  icon: string; title: string; badge?: string; badgeColor?: string; colors: any;
}) {
  return (
    <View style={s.cardHeaderRow}>
      <Text style={s.cardHeaderIcon}>{icon}</Text>
      <Text style={[s.cardHeaderTitle, { color: colors.textPrimary }]}>{title}</Text>
      {badge ? (
        <View style={[s.badge, { backgroundColor: (badgeColor ?? BRAND.purple) + '20',
          borderColor: (badgeColor ?? BRAND.purple) + '50' }]}>
          <Text style={[s.badgeText, { color: badgeColor ?? BRAND.purple }]}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.statusPill, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      <Text style={[s.statusPillText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── GPS tab ─────────────────────────────────────────────────────────────────

function GpsTab({ members, colors, isDark }: { members: any[]; colors: any; isDark: boolean }) {
  const pins = [
    { name: 'Alex (Dad)',    emoji: '👨', location: 'Home HQ 🏠',        battery: 94, safe: true,  charging: true },
    { name: 'Priya (Mom)',   emoji: '👩', location: 'Home HQ 🏠',        battery: 72, safe: true,  charging: false },
    { name: 'Leo',           emoji: '🦁', location: 'Oak Elementary 🎒', battery: 88, safe: true,  charging: false },
    { name: 'Maya',          emoji: '🌸', location: 'Drama Club 🎭',     battery: 91, safe: true,  charging: true },
    { name: 'Grandma Mary',  emoji: '👵', location: 'Senior Center 🏛️',  battery: 65, safe: true,  charging: false },
  ];

  // Map live members → overlay pins
  const livePins = pins.filter(p => members.some(m => m.name.includes(p.name.split(' ')[0]) || p.name.startsWith(m.name.split(' ')[0])));

  return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader icon="📡" title="Household Safety Radar" badge="● Live" badgeColor={BRAND.teal} colors={colors} />

      {/* Dark radar map */}
      <View style={s.radarMap}>
        <View style={[s.radarGrid]} />
        <View style={[s.radarRing, { width: 210, height: 210, borderColor: BRAND.teal + '18' }]} />
        <View style={[s.radarRing, { width: 140, height: 140, borderColor: BRAND.teal + '28' }]} />
        <View style={[s.radarRing, { width: 70, height: 70, borderColor: BRAND.teal + '40' }]} />
        <View style={s.radarCrossH} />
        <View style={s.radarCrossV} />

        {/* Member pins scattered at fixed positions */}
        {[
          { top: 16,  left: 16  },
          { top: 16,  right: 20 },
          { top: '40%' as any, left: '35%' as any },
          { bottom: 20, right: 16 },
          { bottom: 24, left: 24 },
        ].map((pos, i) => {
          const pin = livePins[i] ?? pins[i];
          if (!pin) return null;
          return (
            <View key={i} style={[s.radarPin, pos]}>
              <View style={[s.radarPinDot, { borderColor: BRAND.teal }]}>
                <Text style={{ fontSize: 16 }}>{pin.emoji}</Text>
              </View>
              <View style={s.radarPinLabel}>
                <Text style={s.radarPinName}>{pin.name.split(' ')[0]}</Text>
                <Text style={[s.radarPinBatt, { color: pin.battery > 80 ? BRAND.teal : BRAND.amber }]}>
                  {pin.charging ? '⚡' : '🔋'}{pin.battery}%
                </Text>
              </View>
            </View>
          );
        })}

        <Text style={s.radarFootnote}>GPS Geofence Active · 5 members tracked</Text>
      </View>

      {/* Member telemetry list */}
      <View style={{ gap: 8, marginTop: 4 }}>
        {pins.map((p, i) => (
          <View key={i} style={[s.telemetryRow, {
            backgroundColor: isDark ? colors.surface : '#F0FDF9',
            borderColor: isDark ? colors.border : BRAND.teal + '30',
          }]}>
            <Text style={{ fontSize: 22, marginRight: 10 }}>{p.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                {p.name.split(' ')[0]}
                {p.name.includes('(') ? <Text style={{ fontWeight: '500', color: colors.textSecondary }}> · {p.name.match(/\((.+)\)/)?.[1]}</Text> : null}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>{p.location}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <StatusPill label="✓ Safe" color={BRAND.teal} />
              <Text style={{ fontSize: 10, color: p.battery > 75 ? BRAND.teal : BRAND.amber, fontWeight: '700' }}>
                {p.charging ? '⚡' : ''}{p.battery}%
              </Text>
            </View>
          </View>
        ))}
      </View>
    </SCard>
  );
}

// ─── Health tab ───────────────────────────────────────────────────────────────

function HealthTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [meds, setMeds] = useState<Medication[]>([
    { id: '1', name: 'Vitamin D', dosage: '1000 IU', recipient: 'Leo',  time: '8:00 AM', takenToday: false },
    { id: '2', name: 'Omega 3',   dosage: '500 mg',  recipient: 'Maya', time: '8:00 AM', takenToday: true  },
    { id: '3', name: 'Melatonin', dosage: '1 mg',    recipient: 'Sam',  time: '8:00 PM', takenToday: false },
  ]);

  const vaccines: Vaccine[] = [
    { id: '1', member: 'Leo',  title: 'Flu Shot 2026', date: '2026-09-15', status: 'Scheduled' },
    { id: '2', member: 'Maya', title: 'MMR Booster',   date: '2026-06-01', status: 'Completed ✓' },
    { id: '3', member: 'Sam',  title: 'DTaP',          date: '2026-03-20', status: 'Completed ✓' },
  ];

  const markTaken = (id: string) =>
    setMeds(prev => prev.map(m => m.id === id ? { ...m, takenToday: true } : m));

  return (
    <>
      <SCard colors={colors} isDark={isDark}>
        <CardHeader icon="💊" title="Daily Medication Log" colors={colors} />
        <View style={{ marginTop: 12, gap: 10 }}>
          {meds.map(med => (
            <View key={med.id} style={[s.medRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                  {med.name}
                  <Text style={{ fontWeight: '500' }}> ({med.dosage})</Text>
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                  For: {med.recipient} · {med.time}
                </Text>
              </View>
              {med.takenToday ? (
                <StatusPill label="Taken ✓" color={BRAND.teal} />
              ) : (
                <TouchableOpacity onPress={() => markTaken(med.id)}
                  style={[s.markBtn, { backgroundColor: BRAND.purple }]}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Mark Taken</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </SCard>

      <SCard colors={colors} isDark={isDark}>
        <CardHeader icon="💉" title="Immunization Tracking" colors={colors} />
        <View style={{ marginTop: 12, gap: 10 }}>
          {vaccines.map(v => {
            const done = v.status.includes('✓');
            return (
              <View key={v.id} style={[s.medRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                    {v.member}: {v.title}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                    Date: {v.date}
                  </Text>
                </View>
                <StatusPill label={v.status} color={done ? BRAND.teal : BRAND.amber} />
              </View>
            );
          })}
        </View>
      </SCard>
    </>
  );
}

// ─── AI Health tab ────────────────────────────────────────────────────────────

function AiDocTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [prompt, setPrompt]   = useState('');
  const [result, setResult]   = useState('');
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult('');
    await new Promise(r => setTimeout(r, 1500));
    setResult('✨ AI Health Assessment\n\nBased on your description, this sounds like a mild seasonal symptom. Ensure adequate rest, hydration, and monitor for 24–48 hours.\n\n⚕️ Disclaimer: This is not medical advice. Consult a physician for persistent or severe symptoms.');
    setLoading(false);
  };

  return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader icon="🏥" title="AI Symptom Analyzer" badge="Gemini AI" badgeColor={BRAND.teal} colors={colors} />
      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8, marginBottom: 12, lineHeight: 17 }}>
        Describe family health symptoms or paste medical queries for instant AI analysis.
      </Text>
      <TextInput
        value={prompt} onChangeText={setPrompt}
        placeholder="e.g. Maya has a mild throat tickle and 99.8°F temperature…"
        placeholderTextColor={colors.placeholder}
        multiline numberOfLines={3}
        style={[s.textarea, { color: colors.textPrimary, borderColor: colors.border,
          backgroundColor: colors.surface }]}
      />
      <TouchableOpacity onPress={analyze}
        style={[s.submitBtn, { backgroundColor: prompt.trim() ? BRAND.teal : colors.border }]}>
        <Text style={[s.submitBtnText, { color: prompt.trim() ? '#fff' : colors.textTertiary }]}>
          {loading ? '✨ Analyzing…' : 'Analyze Symptoms'}
        </Text>
      </TouchableOpacity>
      {result ? (
        <View style={{ marginTop: 12, padding: 14, borderRadius: 16,
          backgroundColor: BRAND.teal + '15', borderWidth: 1, borderColor: BRAND.teal + '40' }}>
          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>{result}</Text>
        </View>
      ) : null}
    </SCard>
  );
}

// ─── Memories tab ─────────────────────────────────────────────────────────────

const MEMORY_PALETTE = [
  ['#7C3AED', '#6D28D9'],
  ['#0EA5E9', '#0284C7'],
  ['#10B981', '#059669'],
  ['#F59E0B', '#D97706'],
];

function MemoriesTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [items, setItems] = useState<Memory[]>([
    { id: '1', title: 'Beach Day 🌊',         date: 'July 4, 2026',   emoji: '🏖️', hearts: 12 },
    { id: '2', title: "Leo's Soccer Trophy",   date: 'June 15, 2026',  emoji: '🏆', hearts: 8  },
    { id: '3', title: 'Family Game Night',     date: 'May 28, 2026',   emoji: '🎲', hearts: 15 },
    { id: '4', title: "Maya's Science Fair",   date: 'April 10, 2026', emoji: '🔬', hearts: 6  },
  ]);

  const addHeart = (id: string) =>
    setItems(prev => prev.map(m => m.id === id ? { ...m, hearts: m.hearts + 1 } : m));

  return (
    <>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
        <Text style={[s.sectionLabel, { color: colors.textPrimary }]}>🖼️ Family Memories & Milestones</Text>
        <Text style={{ fontSize: 12, color: BRAND.purple, fontWeight: '700' }}>Photo Timeline</Text>
      </View>
      {items.map((m, i) => {
        const [fromC, toC] = MEMORY_PALETTE[i % MEMORY_PALETTE.length];
        return (
          <SCard key={m.id} colors={colors} isDark={isDark}>
            {/* Illustrated thumbnail */}
            <View style={[s.memoryThumb, { backgroundColor: fromC }]}>
              <Text style={{ fontSize: 60 }}>{m.emoji}</Text>
              {/* subtle shimmer overlay */}
              <View style={[StyleSheet.absoluteFill, { borderRadius: 16,
                backgroundColor: toC, opacity: 0.4 }]} pointerEvents="none" />
            </View>
            <View style={[s.row, { justifyContent: 'space-between', marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>{m.title}</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{m.date}</Text>
              </View>
              <TouchableOpacity onPress={() => addHeart(m.id)}
                style={[s.heartBtn, { backgroundColor: BRAND.purple + '15',
                  borderColor: BRAND.purple + '40' }]}>
                <Text style={{ fontSize: 14 }}>❤️</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.purple }}>{m.hearts}</Text>
              </TouchableOpacity>
            </View>
          </SCard>
        );
      })}
    </>
  );
}

// ─── Ledger tab ───────────────────────────────────────────────────────────────

function LedgerTab({ members, colors, isDark }: { members: any[]; colors: any; isDark: boolean }) {
  const kids = members.filter(m => m.role === 'kid');

  return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader icon="📜" title="Dual Wallet Ledger" badge="Parent Audit" badgeColor={BRAND.teal} colors={colors} />

      {kids.length === 0 ? (
        <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
          No kids in the family yet.
        </Text>
      ) : kids.map(k => {
        const mainCoins = (k as any).mainCoins ?? (k as any).coins ?? 0;
        const gpCoins   = (k as any).gpCoins ?? 0;
        return (
          <View key={k.id} style={[s.kidLedgerCard, {
            backgroundColor: isDark ? colors.surface : '#F5F3FF',
            borderColor: isDark ? colors.border : '#DDD6FE',
          }]}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
              <View style={s.row}>
                <Text style={{ fontSize: 26, marginRight: 8 }}>{k.emoji ?? '👤'}</Text>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>
                    {k.name.split(' ')[0]}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Kid Wallet</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: BRAND.amber }}>
                  {mainCoins}🪙
                </Text>
                <Text style={{ fontSize: 10, color: colors.textTertiary }}>GP Bonus: {gpCoins}🪙</Text>
              </View>
            </View>

            {/* Coin bar */}
            <View style={[s.coinBar, { backgroundColor: isDark ? colors.border : '#EDE9FE' }]}>
              <View style={[s.coinBarFill, {
                width: `${Math.min(100, (mainCoins / 200) * 100)}%` as any,
                backgroundColor: BRAND.purple,
              }]} />
            </View>

            <View style={[s.row, { gap: 8, marginTop: 10 }]}>
              <TouchableOpacity
                onPress={() => Alert.alert('Pay Main Wallet', `Pay out ${k.name.split(' ')[0]}'s ${mainCoins} store coins?`)}
                style={[s.walletBtn, { backgroundColor: BRAND.teal }]}>
                <Text style={s.walletBtnText}>💸 Pay Main</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert('Reimburse GP', `Reimburse ${k.name.split(' ')[0]}'s ${gpCoins} GP bonus?`)}
                style={[s.walletBtn, { backgroundColor: BRAND.purple }]}>
                <Text style={s.walletBtnText}>🍪 GP Bonus</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </SCard>
  );
}

// ─── Meals tab ────────────────────────────────────────────────────────────────

interface Meal { day: string; name: string; emoji: string; prep: number; kidRating: number; ingredients: string[]; steps: string[] }
interface GroceryItem { name: string; aisle: string; checked: boolean }

const DEMO_MEALS: Meal[] = [
  { day: 'Mon', name: 'Sheet-Pan Chicken Tacos',  emoji: '🌮', prep: 25, kidRating: 5,
    ingredients: ['Chicken thighs', 'Flour tortillas', 'Salsa', 'Cheddar', 'Lime', 'Cumin'],
    steps: ['Preheat oven 425°F.', 'Season chicken, roast 20 min.', 'Shred & serve in tortillas with toppings.'] },
  { day: 'Tue', name: 'Pasta Primavera',           emoji: '🍝', prep: 20, kidRating: 4,
    ingredients: ['Penne pasta', 'Zucchini', 'Cherry tomatoes', 'Parmesan', 'Olive oil', 'Garlic'],
    steps: ['Boil pasta al dente.', 'Sauté veggies in olive oil 5 min.', 'Toss together, top with Parmesan.'] },
  { day: 'Wed', name: 'Turkey Meatball Bowls',     emoji: '🍲', prep: 30, kidRating: 5,
    ingredients: ['Ground turkey', 'Breadcrumbs', 'Egg', 'Rice', 'Marinara', 'Mozzarella'],
    steps: ['Mix turkey, breadcrumbs, egg; form balls.', 'Bake 20 min at 400°F.', 'Serve over rice with marinara.'] },
];

const GROCERY_AISLES: { label: string; emoji: string; keywords: string[] }[] = [
  { label: 'Produce',        emoji: '🥦', keywords: ['Zucchini','Lime','Cherry tomatoes','Garlic','Lemon'] },
  { label: 'Meat & Poultry', emoji: '🥩', keywords: ['Chicken','Turkey','Beef','Pork'] },
  { label: 'Dairy & Cheese', emoji: '🧀', keywords: ['Cheddar','Parmesan','Mozzarella','Egg','Milk'] },
  { label: 'Grains & Pasta', emoji: '🍞', keywords: ['Penne','Tortillas','Breadcrumbs','Rice','Pasta'] },
  { label: 'Pantry',         emoji: '🥫', keywords: ['Salsa','Olive oil','Cumin','Marinara'] },
];

function MealsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [pref, setPref]                       = useState('Kid-friendly, high-protein, 30 min max');
  const [loading, setLoading]                 = useState(false);
  const [meals, setMeals]                     = useState<Meal[]>([]);
  const [activeRecipe, setActiveRecipe]       = useState<Meal | null>(null);
  const [grocery, setGrocery]                 = useState<GroceryItem[]>([]);
  const [customItem, setCustomItem]           = useState('');

  const generate = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setMeals(DEMO_MEALS);
    // build grocery list from all meals
    const allIngredients = DEMO_MEALS.flatMap(m => m.ingredients);
    const unique = [...new Set(allIngredients)];
    setGrocery(unique.map(name => ({ name, aisle: aisleFor(name), checked: false })));
    setLoading(false);
  };

  const aisleFor = (item: string) => {
    for (const a of GROCERY_AISLES) {
      if (a.keywords.some(k => item.toLowerCase().includes(k.toLowerCase()))) return a.label;
    }
    return 'Pantry';
  };

  const toggleItem = (name: string) =>
    setGrocery(prev => prev.map(g => g.name === name ? { ...g, checked: !g.checked } : g));

  const addCustom = () => {
    if (!customItem.trim()) return;
    setGrocery(prev => [...prev, { name: customItem.trim(), aisle: 'Extra', checked: false }]);
    setCustomItem('');
  };

  return (
    <>
      {/* Meal generator */}
      <SCard colors={colors} isDark={isDark}>
        <CardHeader icon="🍳" title="AI Meal Planner" badge="3-Day Menu" badgeColor={BRAND.amber} colors={colors} />
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8, marginBottom: 10, lineHeight: 17 }}>
          Generate kid-approved meal plans with step-by-step recipes and a store-ready grocery list.
        </Text>
        <TextInput
          value={pref} onChangeText={setPref}
          style={[s.textarea, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 44 }]}
          placeholderTextColor={colors.placeholder}
          placeholder="e.g. vegetarian, high-protein, 20 min prep…"
        />
        <TouchableOpacity onPress={generate}
          style={[s.submitBtn, { backgroundColor: loading ? BRAND.amber + '80' : BRAND.amber }]}>
          <Text style={[s.submitBtnText, { color: '#1C1917' }]}>
            {loading ? '✨ Generating Menu…' : 'Generate 3-Day Meal Plan'}
          </Text>
        </TouchableOpacity>
      </SCard>

      {/* Meal cards */}
      {meals.length > 0 && (
        <SCard colors={colors} isDark={isDark}>
          <CardHeader icon="📅" title="This Week's Menu" colors={colors} />
          <View style={{ gap: 10, marginTop: 12 }}>
            {meals.map((meal, i) => (
              <TouchableOpacity key={i} onPress={() => setActiveRecipe(meal)}
                style={[s.mealCard, {
                  backgroundColor: isDark ? colors.surface : '#FFFBEB',
                  borderColor: isDark ? colors.border : BRAND.amber + '50',
                }]}>
                <Text style={{ fontSize: 28, marginRight: 12 }}>{meal.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary }}>
                    {meal.day}: {meal.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                    ⏱ {meal.prep} min · {'⭐'.repeat(meal.kidRating)} kid approved
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={BRAND.amber} />
              </TouchableOpacity>
            ))}
          </View>
        </SCard>
      )}

      {/* Grocery list */}
      {grocery.length > 0 && (
        <SCard colors={colors} isDark={isDark} style={{ backgroundColor: isDark ? '#0A1628' : '#0F172A' }}>
          <CardHeader icon="🛒" title="Smart Grocery List" badge="Aisle-Sorted" badgeColor={BRAND.emerald} colors={{ textPrimary: '#E2E8F0' }} />

          {/* Custom item entry */}
          <View style={[s.row, { gap: 8, marginTop: 12, marginBottom: 14 }]}>
            <TextInput
              value={customItem} onChangeText={setCustomItem}
              placeholder="Add extra item…"
              placeholderTextColor="#475569"
              style={[s.groceryInput]}
              onSubmitEditing={addCustom}
            />
            <TouchableOpacity onPress={addCustom} style={s.groceryAddBtn}>
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {GROCERY_AISLES.map(aisle => {
            const items = grocery.filter(g => g.aisle === aisle.label);
            if (!items.length) return null;
            return (
              <View key={aisle.label} style={{ marginBottom: 14 }}>
                <Text style={s.aisleLabel}>{aisle.emoji} {aisle.label.toUpperCase()}</Text>
                <View style={{ gap: 6 }}>
                  {items.map(item => (
                    <TouchableOpacity key={item.name} onPress={() => toggleItem(item.name)}
                      style={[s.groceryRow, {
                        backgroundColor: item.checked ? '#1E293B' : '#1E2D45',
                        borderColor: item.checked ? '#334155' : BRAND.emerald + '40',
                        opacity: item.checked ? 0.6 : 1,
                      }]}>
                      <Ionicons
                        name={item.checked ? 'checkbox' : 'square-outline'}
                        size={18} color={item.checked ? BRAND.teal : '#64748B'}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={[{ fontSize: 13, color: '#E2E8F0', fontWeight: '600', flex: 1 },
                        item.checked && { textDecorationLine: 'line-through', color: '#64748B' }]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}

          {/* Custom extras */}
          {grocery.filter(g => g.aisle === 'Extra').length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={[s.aisleLabel, { color: BRAND.emerald }]}>🛒 CUSTOM EXTRAS</Text>
              <View style={{ gap: 6 }}>
                {grocery.filter(g => g.aisle === 'Extra').map(item => (
                  <TouchableOpacity key={item.name} onPress={() => toggleItem(item.name)}
                    style={[s.groceryRow, {
                      backgroundColor: '#0D2215', borderColor: BRAND.emerald + '40',
                      opacity: item.checked ? 0.6 : 1,
                    }]}>
                    <Ionicons name={item.checked ? 'checkbox' : 'square-outline'} size={18}
                      color={BRAND.emerald} style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 13, color: '#A7F3D0', fontWeight: '600', flex: 1 }}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </SCard>
      )}

      {/* Recipe modal */}
      {activeRecipe && (
        <View style={s.recipeOverlay}>
          <View style={[s.recipeCard, { backgroundColor: isDark ? colors.card : '#fff' }]}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12,
              paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <View style={s.row}>
                <Text style={{ fontSize: 24, marginRight: 8 }}>{activeRecipe.emoji}</Text>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>{activeRecipe.name}</Text>
                  <Text style={{ fontSize: 11, color: BRAND.amber, fontWeight: '700' }}>
                    {activeRecipe.day} · ⏱ {activeRecipe.prep} min
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setActiveRecipe(null)}
                style={{ padding: 6, borderRadius: 20, backgroundColor: colors.surface }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[s.recipeSection, { color: colors.textPrimary }]}>Ingredients</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {activeRecipe.ingredients.map((ing, i) => (
                <View key={i} style={[s.ingPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '600' }}>{ing}</Text>
                </View>
              ))}
            </View>

            <Text style={[s.recipeSection, { color: colors.textPrimary }]}>Steps</Text>
            {activeRecipe.steps.map((step, i) => (
              <View key={i} style={[s.row, { alignItems: 'flex-start', marginBottom: 8 }]}>
                <View style={[s.stepNum, { backgroundColor: BRAND.amber }]}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>{i + 1}</Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 19 }}>{step}</Text>
              </View>
            ))}

            <TouchableOpacity onPress={() => setActiveRecipe(null)}
              style={[s.submitBtn, { backgroundColor: BRAND.amber, marginTop: 8 }]}>
              <Text style={[s.submitBtnText, { color: '#1C1917' }]}>Done Cooking 🍽️</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}

// ─── Roster tab ───────────────────────────────────────────────────────────────

function RosterTab({ members, colors, isDark }: { members: any[]; colors: any; isDark: boolean }) {
  const { updateMember, setMemberPin, removeMember } = useFamilyStore();
  const [pinTarget, setPinTarget]   = useState<string | null>(null);
  const [pinInput, setPinInput]     = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSent, setInviteSent] = useState(false);

  const roleColor = (role: string) =>
    role === 'parent' ? BRAND.purple : role === 'senior' ? BRAND.teal : BRAND.emerald;
  const roleLabel = (role: string, subRole?: string) =>
    subRole ?? (role === 'kid' ? 'Kid' : role === 'senior' ? 'Senior' : 'Parent');

  const savePin = async (id: string) => {
    if (pinInput.length < 4) { Alert.alert('PIN must be at least 4 digits'); return; }
    await setMemberPin(id, pinInput);
    setPinTarget(null);
    setPinInput('');
  };

  const clearPin = async (id: string) => {
    Alert.alert('Remove PIN', 'Remove PIN lock for this member?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setMemberPin(id, null) },
    ]);
  };

  const sendInvite = () => {
    if (!inviteEmail.trim()) return;
    setInviteSent(true);
    setInviteEmail('');
    setTimeout(() => setInviteSent(false), 3000);
  };

  return (
    <>
      {/* Invite card */}
      <SCard colors={colors} isDark={isDark}>
        <CardHeader icon="✉️" title="Invite Family Member" badge="Link via Email" badgeColor={BRAND.purple} colors={colors} />
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8, marginBottom: 12, lineHeight: 17 }}>
          Send an invite link so a parent, kid, or senior can join your Family Cube household.
        </Text>
        <View style={[s.row, { gap: 8 }]}>
          <TextInput
            value={inviteEmail} onChangeText={setInviteEmail}
            placeholder="family@example.com"
            placeholderTextColor={colors.placeholder}
            keyboardType="email-address" autoCapitalize="none"
            style={[s.inviteInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
          <TouchableOpacity onPress={sendInvite}
            style={[s.inviteBtn, { backgroundColor: BRAND.purple }]}>
            <Ionicons name="paper-plane" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
        {inviteSent && (
          <View style={[s.row, { marginTop: 10, gap: 6 }]}>
            <Ionicons name="checkmark-circle" size={16} color={BRAND.teal} />
            <Text style={{ fontSize: 12, color: BRAND.teal, fontWeight: '700' }}>Invite sent!</Text>
          </View>
        )}

        {/* Role legend */}
        <View style={[s.row, { gap: 8, marginTop: 14, flexWrap: 'wrap' }]}>
          {[['Parent', BRAND.purple], ['Senior', BRAND.teal], ['Kid', BRAND.emerald]].map(([label, color]) => (
            <View key={label} style={[s.statusPill, { backgroundColor: color + '20', borderColor: color + '50' }]}>
              <Text style={[s.statusPillText, { color }]}>{label}</Text>
            </View>
          ))}
        </View>
      </SCard>

      {/* Member roster */}
      <SCard colors={colors} isDark={isDark}>
        <CardHeader icon="👨‍👩‍👧‍👦" title="Family Members" badge={`${members.length} members`} badgeColor={BRAND.purple} colors={colors} />
        <View style={{ gap: 12, marginTop: 14 }}>
          {members.map(m => {
            const rc = roleColor(m.role);
            const isPinSet = m.pinEnabled || !!m.pin;
            return (
              <View key={m.id}>
                <View style={[s.rosterRow, {
                  backgroundColor: isDark ? colors.surface : '#F5F3FF',
                  borderColor: isDark ? colors.border : rc + '30',
                }]}>
                  {/* Avatar */}
                  <View style={[s.rosterAvatar, { backgroundColor: rc + '20', borderColor: rc + '40' }]}>
                    <Text style={{ fontSize: 22 }}>{m.emoji ?? '👤'}</Text>
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                      {m.name}
                    </Text>
                    <View style={[s.row, { gap: 6, marginTop: 3 }]}>
                      <View style={[s.statusPill, { backgroundColor: rc + '20', borderColor: rc + '40', paddingHorizontal: 7, paddingVertical: 2 }]}>
                        <Text style={[s.statusPillText, { color: rc, fontSize: 10 }]}>{roleLabel(m.role, m.subRole)}</Text>
                      </View>
                      {isPinSet && (
                        <View style={[s.statusPill, { backgroundColor: BRAND.amber + '20', borderColor: BRAND.amber + '50', paddingHorizontal: 7, paddingVertical: 2 }]}>
                          <Text style={[s.statusPillText, { color: BRAND.amber, fontSize: 10 }]}>🔒 PIN set</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                      {m.coins ?? 0}🪙 · Lv {m.level ?? 1} · {m.questsCompleted ?? 0} quests
                    </Text>
                  </View>

                  {/* Actions */}
                  <View style={{ gap: 6, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => { setPinTarget(m.id); setPinInput(''); }}
                      style={[s.rosterActionBtn, { borderColor: BRAND.amber + '60' }]}>
                      <Ionicons name="key-outline" size={13} color={BRAND.amber} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.amber }}>
                        {isPinSet ? 'Change PIN' : 'Set PIN'}
                      </Text>
                    </TouchableOpacity>
                    {isPinSet && (
                      <TouchableOpacity onPress={() => clearPin(m.id)}
                        style={[s.rosterActionBtn, { borderColor: BRAND.rose + '50' }]}>
                        <Ionicons name="lock-open-outline" size={13} color={BRAND.rose} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.rose }}>Remove PIN</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Inline PIN input */}
                {pinTarget === m.id && (
                  <View style={[s.pinBox, { backgroundColor: isDark ? '#1E1130' : '#FAF5FF', borderColor: BRAND.purple + '40' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.purple, marginBottom: 8 }}>
                      🔐 Set PIN for {m.name.split(' ')[0]}
                    </Text>
                    <View style={[s.row, { gap: 8 }]}>
                      <TextInput
                        value={pinInput} onChangeText={setPinInput}
                        placeholder="4-digit PIN"
                        placeholderTextColor={colors.placeholder}
                        keyboardType="numeric" secureTextEntry maxLength={6}
                        style={[s.pinInput, { color: colors.textPrimary, borderColor: BRAND.purple + '60', backgroundColor: colors.surface }]}
                      />
                      <TouchableOpacity onPress={() => savePin(m.id)}
                        style={[s.markBtn, { backgroundColor: BRAND.purple }]}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setPinTarget(null)}
                        style={[s.markBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </SCard>
    </>
  );
}

// ─── VaultScreen ─────────────────────────────────────────────────────────────

const SUBTABS: { id: VaultTab; label: string; icon: string }[] = [
  { id: 'gps',      label: 'Radar',    icon: '📡' },
  { id: 'health',   label: 'Health',   icon: '💊' },
  { id: 'aiDoc',    label: 'AI Doc',   icon: '🏥' },
  { id: 'meals',    label: 'Meals',    icon: '🍳' },
  { id: 'memories', label: 'Memories', icon: '🖼️' },
  { id: 'ledger',   label: 'Ledger',   icon: '📜' },
  { id: 'roster',   label: 'Roster',   icon: '👨‍👩‍👧' },
];

export default function VaultScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { signOut } = useAuthStore();

  const [activeTab, setActiveTab] = useState<VaultTab>('gps');

  const scrollRef = useRef<ScrollView>(null);
  const prevMemberRef = useRef(activeMemberId);
  useEffect(() => {
    if (prevMemberRef.current === activeMemberId) return;
    prevMemberRef.current = activeMemberId;
    setActiveTab('gps');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeMemberId]);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const bg = isDark ? '#0B0F1A' : '#F3F0FB';

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name?.split(' ')[0] ?? 'Member'}
        memberRole={activeMember?.role as 'parent' | 'kid' | 'senior' ?? 'parent'}
        onBellPress={() => {}}
        onPersonaPress={() => {}}
      />

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 52 }}>

        {/* Title bar */}
        <View style={[s.titleBar]}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 }}>
              Family Vault
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>
              GPS · Health · Memories · Ledger
            </Text>
          </View>
          <TouchableOpacity onPress={() => Alert.alert('Sign Out', 'Sign out of Family Cube?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
          ])}>
            <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Scrollable pill sub-tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabScrollContent}
          style={{ marginHorizontal: 14, marginBottom: 14 }}>
          {SUBTABS.map(t => {
            const active = activeTab === t.id;
            return (
              <TouchableOpacity key={t.id} onPress={() => setActiveTab(t.id)}
                style={[s.tabPill, {
                  backgroundColor: active ? BRAND.purple : isDark ? colors.surface : '#EDE9FE',
                  borderColor: active ? BRAND.purple : isDark ? colors.border : '#DDD6FE',
                }]}>
                <Text style={{ fontSize: 15 }}>{t.icon}</Text>
                <Text style={[s.tabPillText, { color: active ? '#fff' : colors.textSecondary }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 14, gap: 12 }}>
          {activeTab === 'gps'      && <GpsTab members={members} colors={colors} isDark={isDark} />}
          {activeTab === 'health'   && <HealthTab colors={colors} isDark={isDark} />}
          {activeTab === 'aiDoc'    && <AiDocTab colors={colors} isDark={isDark} />}
          {activeTab === 'meals'    && <MealsTab colors={colors} isDark={isDark} />}
          {activeTab === 'memories' && <MemoriesTab colors={colors} isDark={isDark} />}
          {activeTab === 'ledger'   && <LedgerTab members={members} colors={colors} isDark={isDark} />}
          {activeTab === 'roster'   && <RosterTab members={members} colors={colors} isDark={isDark} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:     { flex: 1 },
  titleBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 14 },

  // Tab bar
  tabScrollContent: { gap: 8, paddingRight: 4 },
  tabPill:          { flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingVertical: 8, paddingHorizontal: 14,
                      borderRadius: 22, borderWidth: 1.5 },
  tabPillText:      { fontSize: 13, fontWeight: '800' },

  // Section card
  scard:     { borderRadius: 22, borderWidth: 1.5, padding: 16,
               shadowOpacity: 0.06, shadowRadius: 12,
               shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  sectionLabel: { fontSize: 14, fontWeight: '800' },

  // Card header
  cardHeaderRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeaderIcon:  { fontSize: 18 },
  cardHeaderTitle: { fontSize: 14, fontWeight: '900', flex: 1 },

  badge:     { borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '800' },

  statusPill:     { borderRadius: 99, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '800' },

  row: { flexDirection: 'row', alignItems: 'center' },

  // GPS
  radarMap: {
    height: 180, borderRadius: 18, marginVertical: 14,
    backgroundColor: '#030712', borderWidth: 1, borderColor: '#14B8A620',
    position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  radarGrid: {
    ...StyleSheet.absoluteFillObject,
    // simple grid pattern simulation via background tiling isn't in RN, use opacity
    opacity: 0.15,
  },
  radarRing: { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  radarCrossH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth,
                 backgroundColor: '#14B8A620', top: '50%' },
  radarCrossV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth,
                 backgroundColor: '#14B8A620', left: '50%' },
  radarPin:   { position: 'absolute', alignItems: 'center' },
  radarPinDot:{ width: 34, height: 34, borderRadius: 17, borderWidth: 2,
               backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  radarPinLabel: { backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 8,
                   paddingHorizontal: 6, paddingVertical: 2, marginTop: 2, alignItems: 'center' },
  radarPinName:  { fontSize: 9, fontWeight: '800', color: '#fff' },
  radarPinBatt:  { fontSize: 8, fontWeight: '700' },
  radarFootnote: { position: 'absolute', bottom: 8, fontSize: 9, color: '#14B8A680', fontWeight: '700' },

  telemetryRow: { flexDirection: 'row', alignItems: 'center', padding: 12,
                  borderRadius: 16, borderWidth: 1 },

  // Health
  medRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10,
            borderBottomWidth: StyleSheet.hairlineWidth },
  markBtn: { borderRadius: 12, paddingVertical: 7, paddingHorizontal: 14 },

  // AI Doc
  textarea:    { borderWidth: 1.5, borderRadius: 14, padding: 12, fontSize: 14,
                 minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
  submitBtn:   { borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  submitBtnText: { fontSize: 14, fontWeight: '800' },

  // Memories
  memoryThumb: { width: '100%', height: 130, borderRadius: 16,
                 alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heartBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5,
                 paddingHorizontal: 12, paddingVertical: 8,
                 borderRadius: 14, borderWidth: 1 },

  // Ledger
  kidLedgerCard: { borderRadius: 18, borderWidth: 1.5, padding: 14, marginTop: 14 },
  coinBar:       { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 2 },
  coinBarFill:   { height: '100%', borderRadius: 3 },
  walletBtn:     { flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  walletBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  // Meals
  mealCard:      { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1,
                   padding: 12 },
  groceryInput:  { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#334155',
                   backgroundColor: '#0F172A', color: '#E2E8F0', fontSize: 13,
                   paddingHorizontal: 12, paddingVertical: 9 },
  groceryAddBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#14B8A6',
                   alignItems: 'center', justifyContent: 'center' },
  aisleLabel:    { fontSize: 10, fontWeight: '900', color: '#64748B', letterSpacing: 1,
                   marginBottom: 6 },
  groceryRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1,
                   paddingHorizontal: 12, paddingVertical: 10 },
  recipeOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)',
                   justifyContent: 'center', padding: 16, zIndex: 99 },
  recipeCard:    { borderRadius: 24, padding: 20, maxHeight: '90%' },
  recipeSection: { fontSize: 13, fontWeight: '900', marginBottom: 8 },
  ingPill:       { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  stepNum:       { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                   marginRight: 10, flexShrink: 0 },

  // Roster
  inviteInput:   { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12,
                   paddingVertical: 10, fontSize: 13 },
  inviteBtn:     { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rosterRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18,
                   borderWidth: 1.5, padding: 12 },
  rosterAvatar:  { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                   borderWidth: 2 },
  rosterActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1,
                     borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  pinBox:        { marginTop: 6, borderRadius: 16, borderWidth: 1, padding: 14 },
  pinInput:      { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12,
                   paddingVertical: 9, fontSize: 16, letterSpacing: 4, textAlign: 'center' },
});
