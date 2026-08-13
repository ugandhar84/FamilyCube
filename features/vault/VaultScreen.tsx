import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  Alert, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Radio, Pill, Stethoscope, ChefHat, Image as ImageIcon, ScrollText, Users,
  Heart, Mail, ShoppingCart, Battery, Zap, Check, CheckSquare, Square,
  Key, Lock, LockOpen, Trophy, Waves, Gamepad2, FlaskConical, Leaf,
  Beef, Wheat, Package, LogOut, Plus, X, ChevronRight, Coins, Syringe,
  MapPin, Star, Clock, User, Send, CheckCircle, Soup, UtensilsCrossed,
  Signal, LucideIcon,
} from 'lucide-react-native';
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
  id: string; member: string; title: string; date: string; done: boolean;
}
interface Memory {
  id: string; title: string; date: string;
  Icon: LucideIcon; iconColor: string; hearts: number;
}
interface Meal {
  day: string; name: string; Icon: LucideIcon; prep: number; kidRating: number;
  ingredients: string[]; steps: string[];
}
interface GroceryItem { name: string; aisle: string; checked: boolean }

const BRAND = {
  purple:  '#7C3AED',
  teal:    '#14B8A6',
  amber:   '#F59E0B',
  emerald: '#10B981',
  rose:    '#F43F5E',
  blue:    '#3B82F6',
};

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function SCard({ children, colors, isDark, style }: {
  children: React.ReactNode; colors: any; isDark: boolean; style?: any;
}) {
  return (
    <View style={[s.scard, {
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderColor: isDark ? colors.border : '#EDE9FE',
      shadowColor: BRAND.purple, ...style,
    }]}>
      {children}
    </View>
  );
}

function CardHeader({ Icon, iconColor, title, badge, badgeColor, colors }: {
  Icon: LucideIcon; iconColor?: string; title: string;
  badge?: string; badgeColor?: string; colors: any;
}) {
  const ic = iconColor ?? BRAND.purple;
  return (
    <View style={s.cardHeaderRow}>
      <View style={[s.cardHeaderIconBox, { backgroundColor: ic + '20' }]}>
        <Icon size={16} color={ic} />
      </View>
      <Text style={[s.cardHeaderTitle, { color: colors.textPrimary }]}>{title}</Text>
      {badge ? (
        <View style={[s.badge, { backgroundColor: (badgeColor ?? ic) + '20',
          borderColor: (badgeColor ?? ic) + '50' }]}>
          <Text style={[s.badgeText, { color: badgeColor ?? ic }]}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StatusPill({ label, color, Icon }: { label: string; color: string; Icon?: LucideIcon }) {
  return (
    <View style={[s.statusPill, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      {Icon && <Icon size={10} color={color} style={{ marginRight: 3 }} />}
      <Text style={[s.statusPillText, { color }]}>{label}</Text>
    </View>
  );
}

function MemberAvatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + '25', borderWidth: 2, borderColor: color + '50',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <User size={size * 0.5} color={color} />
      <Text style={{ position: 'absolute', bottom: -1, right: -1, fontSize: size * 0.28, lineHeight: size * 0.3 }}>
        {name[0]}
      </Text>
    </View>
  );
}

// ─── GPS tab ─────────────────────────────────────────────────────────────────

const GPS_MEMBERS = [
  { firstName: 'Alex',  role: 'parent', location: 'Home',           battery: 94, charging: true  },
  { firstName: 'Priya', role: 'parent', location: 'Home',           battery: 72, charging: false },
  { firstName: 'Leo',   role: 'kid',    location: 'Oak Elementary', battery: 88, charging: false },
  { firstName: 'Maya',  role: 'kid',    location: 'Drama Club',     battery: 91, charging: true  },
  { firstName: 'Mary',  role: 'senior', location: 'Senior Center',  battery: 65, charging: false },
];

const PIN_POSITIONS = [
  { top: 18, left: 18 },
  { top: 18, right: 22 },
  { top: '42%' as any, left: '36%' as any },
  { bottom: 22, right: 18 },
  { bottom: 26, left: 26 },
];

function GpsTab({ members, colors, isDark }: { members: any[]; colors: any; isDark: boolean }) {
  const roleColor = (role: string) =>
    role === 'parent' ? BRAND.purple : role === 'senior' ? BRAND.blue : BRAND.emerald;

  return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={Radio} iconColor={BRAND.teal} title="Household Safety Radar"
        badge="Live" badgeColor={BRAND.teal} colors={colors} />

      {/* Dark radar canvas */}
      <View style={s.radarMap}>
        <View style={[s.radarRing, { width: 210, height: 210, borderColor: BRAND.teal + '18' }]} />
        <View style={[s.radarRing, { width: 140, height: 140, borderColor: BRAND.teal + '28' }]} />
        <View style={[s.radarRing, { width:  70, height:  70, borderColor: BRAND.teal + '45' }]} />
        <View style={s.radarCrossH} />
        <View style={s.radarCrossV} />

        {GPS_MEMBERS.map((p, i) => {
          const rc = roleColor(p.role);
          return (
            <View key={i} style={[s.radarPin, PIN_POSITIONS[i]]}>
              <View style={[s.radarPinDot, { borderColor: rc, backgroundColor: rc + '30' }]}>
                <User size={14} color={rc} />
              </View>
              <View style={s.radarPinLabel}>
                <Text style={s.radarPinName}>{p.firstName}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  {p.charging
                    ? <Zap size={7} color={BRAND.amber} />
                    : <Battery size={7} color={p.battery > 75 ? BRAND.teal : BRAND.amber} />}
                  <Text style={[s.radarPinBatt, { color: p.battery > 75 ? BRAND.teal : BRAND.amber }]}>
                    {p.battery}%
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        <View style={s.radarFootnoteRow}>
          <Signal size={9} color={BRAND.teal + 'AA'} />
          <Text style={s.radarFootnote}>GPS Active · {GPS_MEMBERS.length} members</Text>
        </View>
      </View>

      {/* Telemetry list */}
      <View style={{ gap: 8 }}>
        {GPS_MEMBERS.map((p, i) => {
          const rc = roleColor(p.role);
          return (
            <View key={i} style={[s.telemetryRow, {
              backgroundColor: isDark ? colors.surface : '#F0FDF9',
              borderColor: isDark ? colors.border : BRAND.teal + '30',
            }]}>
              <MemberAvatar name={p.firstName} color={rc} size={38} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                  {p.firstName}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <MapPin size={10} color={colors.textTertiary} />
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>{p.location}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 5 }}>
                <StatusPill label="Safe" color={BRAND.teal} Icon={Check} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  {p.charging
                    ? <Zap size={11} color={BRAND.amber} />
                    : <Battery size={11} color={p.battery > 75 ? BRAND.teal : BRAND.amber} />}
                  <Text style={{ fontSize: 10, fontWeight: '700',
                    color: p.battery > 75 ? BRAND.teal : BRAND.amber }}>
                    {p.battery}%
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
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
    { id: '1', member: 'Leo',  title: 'Flu Shot 2026', date: '2026-09-15', done: false },
    { id: '2', member: 'Maya', title: 'MMR Booster',   date: '2026-06-01', done: true  },
    { id: '3', member: 'Sam',  title: 'DTaP',          date: '2026-03-20', done: true  },
  ];

  const markTaken = (id: string) =>
    setMeds(prev => prev.map(m => m.id === id ? { ...m, takenToday: true } : m));

  return (
    <>
      <SCard colors={colors} isDark={isDark}>
        <CardHeader Icon={Pill} iconColor={BRAND.purple} title="Daily Medication Log" colors={colors} />
        <View style={{ marginTop: 14, gap: 12 }}>
          {meds.map(med => (
            <View key={med.id} style={[s.medRow, { borderBottomColor: colors.border }]}>
              <View style={[s.medIconBox, { backgroundColor: BRAND.purple + '15' }]}>
                <Pill size={16} color={BRAND.purple} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                  {med.name}
                  <Text style={{ fontWeight: '500', color: colors.textSecondary }}> · {med.dosage}</Text>
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Clock size={10} color={colors.textTertiary} />
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    {med.recipient} · {med.time}
                  </Text>
                </View>
              </View>
              {med.takenToday ? (
                <StatusPill label="Taken" color={BRAND.teal} Icon={Check} />
              ) : (
                <TouchableOpacity onPress={() => markTaken(med.id)}
                  style={[s.markBtn, { backgroundColor: BRAND.purple }]}>
                  <Check size={12} color="#fff" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', marginLeft: 4 }}>
                    Mark Taken
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </SCard>

      <SCard colors={colors} isDark={isDark}>
        <CardHeader Icon={Syringe} iconColor={BRAND.blue} title="Immunization Tracking" colors={colors} />
        <View style={{ marginTop: 14, gap: 12 }}>
          {vaccines.map(v => (
            <View key={v.id} style={[s.medRow, { borderBottomColor: colors.border }]}>
              <View style={[s.medIconBox, { backgroundColor: (v.done ? BRAND.teal : BRAND.amber) + '15' }]}>
                <Syringe size={16} color={v.done ? BRAND.teal : BRAND.amber} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                  {v.member}: {v.title}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{v.date}</Text>
              </View>
              <StatusPill
                label={v.done ? 'Completed' : 'Scheduled'}
                color={v.done ? BRAND.teal : BRAND.amber}
                Icon={v.done ? Check : Clock}
              />
            </View>
          ))}
        </View>
      </SCard>
    </>
  );
}

// ─── AI Doc tab ───────────────────────────────────────────────────────────────

function AiDocTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [prompt, setPrompt]   = useState('');
  const [result, setResult]   = useState('');
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult('');
    await new Promise(r => setTimeout(r, 1500));
    setResult('AI Health Assessment\n\nBased on your description, this sounds like a mild seasonal symptom. Ensure adequate rest, hydration, and monitor for 24–48 hours.\n\nDisclaimer: This is not medical advice. Consult a physician for persistent or severe symptoms.');
    setLoading(false);
  };

  return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={Stethoscope} iconColor={BRAND.teal} title="AI Symptom Analyzer"
        badge="AI" badgeColor={BRAND.teal} colors={colors} />
      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 10, marginBottom: 12, lineHeight: 17 }}>
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
      <TouchableOpacity onPress={analyze} disabled={loading}
        style={[s.submitBtn, { backgroundColor: prompt.trim() && !loading ? BRAND.teal : colors.border,
          flexDirection: 'row', gap: 8 }]}>
        <Stethoscope size={16} color={prompt.trim() && !loading ? '#fff' : colors.textTertiary} />
        <Text style={[s.submitBtnText, { color: prompt.trim() && !loading ? '#fff' : colors.textTertiary }]}>
          {loading ? 'Analyzing…' : 'Analyze Symptoms'}
        </Text>
      </TouchableOpacity>
      {result ? (
        <View style={{ marginTop: 12, padding: 14, borderRadius: 16,
          backgroundColor: BRAND.teal + '12', borderWidth: 1, borderColor: BRAND.teal + '40' }}>
          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>{result}</Text>
        </View>
      ) : null}
    </SCard>
  );
}

// ─── Memories tab ─────────────────────────────────────────────────────────────

const MEMORY_PALETTE: [string, string][] = [
  ['#7C3AED', '#6D28D9'],
  ['#0EA5E9', '#0284C7'],
  ['#10B981', '#059669'],
  ['#F59E0B', '#D97706'],
];

const MEMORIES: Memory[] = [
  { id: '1', title: 'Beach Day',          date: 'July 4, 2026',   Icon: Waves,       iconColor: '#38BDF8', hearts: 12 },
  { id: '2', title: "Leo's Soccer Win",   date: 'June 15, 2026',  Icon: Trophy,      iconColor: '#F59E0B', hearts: 8  },
  { id: '3', title: 'Family Game Night',  date: 'May 28, 2026',   Icon: Gamepad2,    iconColor: '#A78BFA', hearts: 15 },
  { id: '4', title: "Maya's Science Fair",date: 'April 10, 2026', Icon: FlaskConical,iconColor: '#34D399', hearts: 6  },
];

function MemoriesTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [items, setItems] = useState<Memory[]>(MEMORIES);

  const addHeart = (id: string) =>
    setItems(prev => prev.map(m => m.id === id ? { ...m, hearts: m.hearts + 1 } : m));

  return (
    <>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
        <View style={s.row}>
          <ImageIcon size={16} color={BRAND.purple} style={{ marginRight: 6 }} />
          <Text style={[s.sectionLabel, { color: colors.textPrimary }]}>Family Memories</Text>
        </View>
        <Text style={{ fontSize: 12, color: BRAND.purple, fontWeight: '700' }}>Timeline</Text>
      </View>
      {items.map((m, i) => {
        const [bgFrom] = MEMORY_PALETTE[i % MEMORY_PALETTE.length];
        const MIcon = m.Icon;
        return (
          <SCard key={m.id} colors={colors} isDark={isDark}>
            <View style={[s.memoryThumb, { backgroundColor: bgFrom }]}>
              <MIcon size={56} color={m.iconColor} strokeWidth={1.5} />
            </View>
            <View style={[s.row, { justifyContent: 'space-between', marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>{m.title}</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{m.date}</Text>
              </View>
              <TouchableOpacity onPress={() => addHeart(m.id)}
                style={[s.heartBtn, { backgroundColor: BRAND.rose + '12', borderColor: BRAND.rose + '40' }]}>
                <Heart size={14} color={BRAND.rose} fill={BRAND.rose} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.rose, marginLeft: 4 }}>
                  {m.hearts}
                </Text>
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
      <CardHeader Icon={ScrollText} iconColor={BRAND.teal} title="Dual Wallet Ledger"
        badge="Parent Audit" badgeColor={BRAND.teal} colors={colors} />

      {kids.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
          <Users size={32} color={colors.textTertiary} />
          <Text style={{ color: colors.textTertiary, fontSize: 13 }}>No kids yet</Text>
        </View>
      ) : kids.map(k => {
        const mainCoins = (k as any).mainCoins ?? (k as any).coins ?? 0;
        const gpCoins   = (k as any).gpCoins ?? 0;
        const rc = BRAND.emerald;
        return (
          <View key={k.id} style={[s.kidLedgerCard, {
            backgroundColor: isDark ? colors.surface : '#F5F3FF',
            borderColor: isDark ? colors.border : '#DDD6FE',
          }]}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
              <View style={s.row}>
                <MemberAvatar name={k.name} color={rc} size={42} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>
                    {k.name.split(' ')[0]}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Kid Wallet</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <View style={s.row}>
                  <Coins size={14} color={BRAND.amber} style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 15, fontWeight: '900', color: BRAND.amber }}>{mainCoins}</Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>
                  GP Bonus: {gpCoins}
                </Text>
              </View>
            </View>

            <View style={[s.coinBar, { backgroundColor: isDark ? colors.border : '#EDE9FE' }]}>
              <View style={[s.coinBarFill, {
                width: `${Math.min(100, (mainCoins / 200) * 100)}%` as any,
                backgroundColor: BRAND.purple,
              }]} />
            </View>

            <View style={[s.row, { gap: 8, marginTop: 12 }]}>
              <TouchableOpacity
                onPress={() => Alert.alert('Pay Main Wallet', `Pay ${k.name.split(' ')[0]}'s ${mainCoins} coins?`)}
                style={[s.walletBtn, { backgroundColor: BRAND.teal, flexDirection: 'row', gap: 6 }]}>
                <Coins size={14} color="#fff" />
                <Text style={s.walletBtnText}>Pay Main</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert('Reimburse GP', `Reimburse ${k.name.split(' ')[0]}'s ${gpCoins} GP bonus?`)}
                style={[s.walletBtn, { backgroundColor: BRAND.purple, flexDirection: 'row', gap: 6 }]}>
                <Star size={14} color="#fff" />
                <Text style={s.walletBtnText}>GP Bonus</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </SCard>
  );
}

// ─── Meals tab ────────────────────────────────────────────────────────────────

interface GroceryAisle { label: string; Icon: LucideIcon; keywords: string[] }

const DEMO_MEALS: Meal[] = [
  { day: 'Mon', name: 'Sheet-Pan Chicken Tacos', Icon: UtensilsCrossed, prep: 25, kidRating: 5,
    ingredients: ['Chicken thighs', 'Flour tortillas', 'Salsa', 'Cheddar', 'Lime', 'Cumin'],
    steps: ['Preheat oven to 425°F.', 'Season chicken, roast 20 min.', 'Shred and serve in tortillas with toppings.'] },
  { day: 'Tue', name: 'Pasta Primavera',           Icon: ChefHat,          prep: 20, kidRating: 4,
    ingredients: ['Penne pasta', 'Zucchini', 'Cherry tomatoes', 'Parmesan', 'Olive oil', 'Garlic'],
    steps: ['Boil pasta al dente.', 'Sauté veggies in olive oil 5 min.', 'Toss together, top with Parmesan.'] },
  { day: 'Wed', name: 'Turkey Meatball Bowls',     Icon: Soup,             prep: 30, kidRating: 5,
    ingredients: ['Ground turkey', 'Breadcrumbs', 'Egg', 'Rice', 'Marinara', 'Mozzarella'],
    steps: ['Mix turkey, breadcrumbs, egg; form balls.', 'Bake 20 min at 400°F.', 'Serve over rice with marinara.'] },
];

const GROCERY_AISLES: GroceryAisle[] = [
  { label: 'Produce',        Icon: Leaf,     keywords: ['Zucchini','Lime','Cherry tomatoes','Garlic','Lemon'] },
  { label: 'Meat & Poultry', Icon: Beef,     keywords: ['Chicken','Turkey','Beef','Pork'] },
  { label: 'Dairy & Eggs',   Icon: Package,  keywords: ['Cheddar','Parmesan','Mozzarella','Egg','Milk'] },
  { label: 'Grains & Pasta', Icon: Wheat,    keywords: ['Penne','Tortillas','Breadcrumbs','Rice','Pasta'] },
  { label: 'Pantry',         Icon: Package,  keywords: ['Salsa','Olive oil','Cumin','Marinara'] },
];

function MealsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [pref, setPref]             = useState('Kid-friendly, high-protein, 30 min max');
  const [loading, setLoading]       = useState(false);
  const [meals, setMeals]           = useState<Meal[]>([]);
  const [activeRecipe, setActiveRecipe] = useState<Meal | null>(null);
  const [grocery, setGrocery]       = useState<GroceryItem[]>([]);
  const [customItem, setCustomItem] = useState('');

  const aisleFor = (item: string) => {
    for (const a of GROCERY_AISLES) {
      if (a.keywords.some(k => item.toLowerCase().includes(k.toLowerCase()))) return a.label;
    }
    return 'Pantry';
  };

  const generate = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setMeals(DEMO_MEALS);
    const all = [...new Set(DEMO_MEALS.flatMap(m => m.ingredients))];
    setGrocery(all.map(name => ({ name, aisle: aisleFor(name), checked: false })));
    setLoading(false);
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
      <SCard colors={colors} isDark={isDark}>
        <CardHeader Icon={ChefHat} iconColor={BRAND.amber} title="AI Meal Planner"
          badge="3-Day" badgeColor={BRAND.amber} colors={colors} />
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 10, marginBottom: 12, lineHeight: 17 }}>
          Generate kid-approved meal plans with step-by-step recipes and an aisle-sorted grocery list.
        </Text>
        <TextInput
          value={pref} onChangeText={setPref}
          style={[s.textarea, { color: colors.textPrimary, borderColor: colors.border,
            backgroundColor: colors.surface, minHeight: 44 }]}
          placeholderTextColor={colors.placeholder}
          placeholder="e.g. vegetarian, high-protein, 20 min prep…"
        />
        <TouchableOpacity onPress={generate} disabled={loading}
          style={[s.submitBtn, { backgroundColor: loading ? BRAND.amber + '80' : BRAND.amber,
            flexDirection: 'row', gap: 8 }]}>
          <ChefHat size={16} color="#1C1917" />
          <Text style={[s.submitBtnText, { color: '#1C1917' }]}>
            {loading ? 'Generating Menu…' : 'Generate 3-Day Meal Plan'}
          </Text>
        </TouchableOpacity>
      </SCard>

      {meals.length > 0 && (
        <SCard colors={colors} isDark={isDark}>
          <CardHeader Icon={UtensilsCrossed} iconColor={BRAND.amber} title="This Week's Menu" colors={colors} />
          <View style={{ gap: 10, marginTop: 12 }}>
            {meals.map((meal, i) => {
              const MIcon = meal.Icon;
              return (
                <TouchableOpacity key={i} onPress={() => setActiveRecipe(meal)}
                  style={[s.mealCard, {
                    backgroundColor: isDark ? colors.surface : '#FFFBEB',
                    borderColor: isDark ? colors.border : BRAND.amber + '50',
                  }]}>
                  <View style={[s.mealIconBox, { backgroundColor: BRAND.amber + '20' }]}>
                    <MIcon size={22} color={BRAND.amber} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary }}>
                      {meal.day}: {meal.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Clock size={10} color={colors.textTertiary} />
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>{meal.prep} min</Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>·</Text>
                      {Array.from({ length: meal.kidRating }).map((_, si) => (
                        <Star key={si} size={9} color={BRAND.amber} fill={BRAND.amber} />
                      ))}
                    </View>
                  </View>
                  <ChevronRight size={16} color={BRAND.amber} />
                </TouchableOpacity>
              );
            })}
          </View>
        </SCard>
      )}

      {grocery.length > 0 && (
        <SCard colors={colors} isDark={isDark} style={{ backgroundColor: '#0F172A', borderColor: '#1E293B' }}>
          <CardHeader Icon={ShoppingCart} iconColor={BRAND.emerald} title="Smart Grocery List"
            badge="Aisle-Sorted" badgeColor={BRAND.emerald} colors={{ textPrimary: '#E2E8F0' }} />

          <View style={[s.row, { gap: 8, marginTop: 12, marginBottom: 14 }]}>
            <TextInput
              value={customItem} onChangeText={setCustomItem}
              placeholder="Add extra item…" placeholderTextColor="#475569"
              style={s.groceryInput} onSubmitEditing={addCustom}
            />
            <TouchableOpacity onPress={addCustom} style={s.groceryAddBtn}>
              <Plus size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {GROCERY_AISLES.map(aisle => {
            const items = grocery.filter(g => g.aisle === aisle.label);
            if (!items.length) return null;
            const AIcon = aisle.Icon;
            return (
              <View key={aisle.label} style={{ marginBottom: 14 }}>
                <View style={[s.row, { marginBottom: 6, gap: 5 }]}>
                  <AIcon size={11} color="#64748B" />
                  <Text style={s.aisleLabel}>{aisle.label.toUpperCase()}</Text>
                </View>
                <View style={{ gap: 6 }}>
                  {items.map(item => (
                    <TouchableOpacity key={item.name} onPress={() => toggleItem(item.name)}
                      style={[s.groceryRow, {
                        backgroundColor: item.checked ? '#1E293B' : '#1E2D45',
                        borderColor: item.checked ? '#334155' : BRAND.emerald + '40',
                        opacity: item.checked ? 0.55 : 1,
                      }]}>
                      {item.checked
                        ? <CheckSquare size={16} color={BRAND.teal} style={{ marginRight: 10 }} />
                        : <Square size={16} color="#475569" style={{ marginRight: 10 }} />}
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

          {grocery.filter(g => g.aisle === 'Extra').length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <View style={[s.row, { marginBottom: 6, gap: 5 }]}>
                <Plus size={11} color={BRAND.emerald} />
                <Text style={[s.aisleLabel, { color: BRAND.emerald }]}>CUSTOM EXTRAS</Text>
              </View>
              {grocery.filter(g => g.aisle === 'Extra').map(item => (
                <TouchableOpacity key={item.name} onPress={() => toggleItem(item.name)}
                  style={[s.groceryRow, { backgroundColor: '#0D2215', borderColor: BRAND.emerald + '40',
                    marginBottom: 6, opacity: item.checked ? 0.55 : 1 }]}>
                  {item.checked
                    ? <CheckSquare size={16} color={BRAND.emerald} style={{ marginRight: 10 }} />
                    : <Square size={16} color={BRAND.emerald + '80'} style={{ marginRight: 10 }} />}
                  <Text style={{ fontSize: 13, color: '#A7F3D0', fontWeight: '600', flex: 1 }}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </SCard>
      )}

      {/* Recipe sheet */}
      {activeRecipe && (
        <View style={s.recipeOverlay}>
          <View style={[s.recipeCard, { backgroundColor: isDark ? colors.card : '#fff' }]}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 14,
              paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <View style={s.row}>
                <View style={[s.mealIconBox, { backgroundColor: BRAND.amber + '20', marginRight: 10 }]}>
                  <activeRecipe.Icon size={22} color={BRAND.amber} />
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>
                    {activeRecipe.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <Clock size={11} color={BRAND.amber} />
                    <Text style={{ fontSize: 11, color: BRAND.amber, fontWeight: '700' }}>
                      {activeRecipe.day} · {activeRecipe.prep} min
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => setActiveRecipe(null)}
                style={{ padding: 6, borderRadius: 20, backgroundColor: colors.surface }}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[s.recipeSection, { color: colors.textPrimary }]}>Ingredients</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {activeRecipe.ingredients.map((ing, i) => (
                <View key={i} style={[s.ingPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '600' }}>{ing}</Text>
                </View>
              ))}
            </View>

            <Text style={[s.recipeSection, { color: colors.textPrimary }]}>Steps</Text>
            {activeRecipe.steps.map((step, i) => (
              <View key={i} style={[s.row, { alignItems: 'flex-start', marginBottom: 10 }]}>
                <View style={[s.stepNum, { backgroundColor: BRAND.amber }]}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>{i + 1}</Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 20 }}>{step}</Text>
              </View>
            ))}

            <TouchableOpacity onPress={() => setActiveRecipe(null)}
              style={[s.submitBtn, { backgroundColor: BRAND.amber, marginTop: 8,
                flexDirection: 'row', gap: 8 }]}>
              <Check size={16} color="#1C1917" />
              <Text style={[s.submitBtnText, { color: '#1C1917' }]}>Done Cooking</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}

// ─── Roster tab ───────────────────────────────────────────────────────────────

function RosterTab({ members, colors, isDark }: { members: any[]; colors: any; isDark: boolean }) {
  const { setMemberPin } = useFamilyStore();
  const [pinTarget, setPinTarget]     = useState<string | null>(null);
  const [pinInput, setPinInput]       = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSent, setInviteSent]   = useState(false);

  const roleColor = (role: string) =>
    role === 'parent' ? BRAND.purple : role === 'senior' ? BRAND.blue : BRAND.emerald;
  const roleLabel = (role: string, subRole?: string) =>
    subRole ?? (role === 'kid' ? 'Kid' : role === 'senior' ? 'Senior' : 'Parent');

  const savePin = async (id: string) => {
    if (pinInput.length < 4) { Alert.alert('PIN must be at least 4 digits'); return; }
    await setMemberPin(id, pinInput);
    setPinTarget(null);
    setPinInput('');
  };

  const clearPin = (id: string) =>
    Alert.alert('Remove PIN', 'Remove PIN lock for this member?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setMemberPin(id, null) },
    ]);

  const sendInvite = () => {
    if (!inviteEmail.trim()) return;
    setInviteSent(true);
    setInviteEmail('');
    setTimeout(() => setInviteSent(false), 3000);
  };

  return (
    <>
      <SCard colors={colors} isDark={isDark}>
        <CardHeader Icon={Mail} iconColor={BRAND.purple} title="Invite Family Member"
          badge="Via Email" badgeColor={BRAND.purple} colors={colors} />
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 10, marginBottom: 12, lineHeight: 17 }}>
          Send an invite link so a parent, kid, or senior can join your Family Cube household.
        </Text>
        <View style={[s.row, { gap: 8 }]}>
          <TextInput
            value={inviteEmail} onChangeText={setInviteEmail}
            placeholder="family@example.com"
            placeholderTextColor={colors.placeholder}
            keyboardType="email-address" autoCapitalize="none"
            style={[s.inviteInput, { color: colors.textPrimary, borderColor: colors.border,
              backgroundColor: colors.surface }]}
          />
          <TouchableOpacity onPress={sendInvite}
            style={[s.inviteBtn, { backgroundColor: BRAND.purple }]}>
            <Send size={16} color="#fff" />
          </TouchableOpacity>
        </View>
        {inviteSent && (
          <View style={[s.row, { marginTop: 10, gap: 6 }]}>
            <CheckCircle size={15} color={BRAND.teal} />
            <Text style={{ fontSize: 12, color: BRAND.teal, fontWeight: '700' }}>Invite sent!</Text>
          </View>
        )}
        <View style={[s.row, { gap: 8, marginTop: 14, flexWrap: 'wrap' }]}>
          {([['Parent', BRAND.purple], ['Senior', BRAND.blue], ['Kid', BRAND.emerald]] as [string, string][]).map(([label, color]) => (
            <StatusPill key={label} label={label} color={color} />
          ))}
        </View>
      </SCard>

      <SCard colors={colors} isDark={isDark}>
        <CardHeader Icon={Users} iconColor={BRAND.purple} title="Family Members"
          badge={`${members.length}`} badgeColor={BRAND.purple} colors={colors} />
        <View style={{ gap: 10, marginTop: 14 }}>
          {members.map(m => {
            const rc = roleColor(m.role);
            const isPinSet = m.pinEnabled || !!m.pin;
            return (
              <View key={m.id}>
                <View style={[s.rosterRow, {
                  backgroundColor: isDark ? colors.surface : '#F5F3FF',
                  borderColor: isDark ? colors.border : rc + '30',
                }]}>
                  <MemberAvatar name={m.name} color={rc} size={44} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                      {m.name}
                    </Text>
                    <View style={[s.row, { gap: 6, marginTop: 4, flexWrap: 'wrap' }]}>
                      <StatusPill label={roleLabel(m.role, m.subRole)} color={rc} />
                      {isPinSet && <StatusPill label="PIN set" color={BRAND.amber} Icon={Lock} />}
                    </View>
                    <View style={[s.row, { gap: 6, marginTop: 4 }]}>
                      <Coins size={11} color={colors.textTertiary} />
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                        {m.coins ?? 0} · Lv {m.level ?? 1} · {m.questsCompleted ?? 0} quests
                      </Text>
                    </View>
                  </View>
                  <View style={{ gap: 6 }}>
                    <TouchableOpacity onPress={() => { setPinTarget(m.id); setPinInput(''); }}
                      style={[s.rosterActionBtn, { borderColor: BRAND.amber + '60' }]}>
                      <Key size={12} color={BRAND.amber} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.amber }}>
                        {isPinSet ? 'Change' : 'Set PIN'}
                      </Text>
                    </TouchableOpacity>
                    {isPinSet && (
                      <TouchableOpacity onPress={() => clearPin(m.id)}
                        style={[s.rosterActionBtn, { borderColor: BRAND.rose + '50' }]}>
                        <LockOpen size={12} color={BRAND.rose} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.rose }}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {pinTarget === m.id && (
                  <View style={[s.pinBox, { backgroundColor: isDark ? '#1E1130' : '#FAF5FF',
                    borderColor: BRAND.purple + '40' }]}>
                    <View style={[s.row, { gap: 6, marginBottom: 10 }]}>
                      <Lock size={13} color={BRAND.purple} />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.purple }}>
                        Set PIN for {m.name.split(' ')[0]}
                      </Text>
                    </View>
                    <View style={[s.row, { gap: 8 }]}>
                      <TextInput
                        value={pinInput} onChangeText={setPinInput}
                        placeholder="4-digit PIN"
                        placeholderTextColor={colors.placeholder}
                        keyboardType="numeric" secureTextEntry maxLength={6}
                        style={[s.pinInput, { color: colors.textPrimary,
                          borderColor: BRAND.purple + '60', backgroundColor: colors.surface }]}
                      />
                      <TouchableOpacity onPress={() => savePin(m.id)}
                        style={[s.markBtn, { backgroundColor: BRAND.purple }]}>
                        <Check size={14} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setPinTarget(null)}
                        style={[s.markBtn, { backgroundColor: colors.surface, borderWidth: 1,
                          borderColor: colors.border }]}>
                        <X size={14} color={colors.textSecondary} />
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

type TabDef = { id: VaultTab; label: string; Icon: LucideIcon };

const SUBTABS: TabDef[] = [
  { id: 'gps',      label: 'Radar',    Icon: Radio          },
  { id: 'health',   label: 'Health',   Icon: Pill           },
  { id: 'aiDoc',    label: 'AI Doc',   Icon: Stethoscope    },
  { id: 'meals',    label: 'Meals',    Icon: ChefHat        },
  { id: 'memories', label: 'Memories', Icon: ImageIcon      },
  { id: 'ledger',   label: 'Ledger',   Icon: ScrollText     },
  { id: 'roster',   label: 'Roster',   Icon: Users          },
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

        <View style={s.titleBar}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 }}>
              Family Vault
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>
              GPS · Health · Meals · Memories · Ledger · Roster
            </Text>
          </View>
          <TouchableOpacity onPress={() => Alert.alert('Sign Out', 'Sign out of Family Cube?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
          ])}>
            <LogOut size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Horizontal pill tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabScrollContent}
          style={{ marginHorizontal: 14, marginBottom: 14 }}>
          {SUBTABS.map(t => {
            const active = activeTab === t.id;
            const TIcon = t.Icon;
            return (
              <TouchableOpacity key={t.id} onPress={() => setActiveTab(t.id)}
                style={[s.tabPill, {
                  backgroundColor: active ? BRAND.purple : isDark ? colors.surface : '#EDE9FE',
                  borderColor: active ? BRAND.purple : isDark ? colors.border : '#DDD6FE',
                }]}>
                <TIcon size={15} color={active ? '#fff' : colors.textSecondary} />
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

  tabScrollContent: { gap: 8, paddingRight: 4 },
  tabPill:      { flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingVertical: 8, paddingHorizontal: 14,
                  borderRadius: 22, borderWidth: 1.5 },
  tabPillText:  { fontSize: 13, fontWeight: '800' },

  scard:        { borderRadius: 22, borderWidth: 1.5, padding: 16,
                  shadowOpacity: 0.06, shadowRadius: 12,
                  shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  sectionLabel: { fontSize: 14, fontWeight: '800' },

  cardHeaderRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeaderIconBox: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardHeaderTitle:   { fontSize: 14, fontWeight: '900', flex: 1 },

  badge:         { borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:     { fontSize: 11, fontWeight: '800' },
  statusPill:    { flexDirection: 'row', alignItems: 'center', borderRadius: 99, borderWidth: 1,
                   paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText:{ fontSize: 11, fontWeight: '800' },

  row: { flexDirection: 'row', alignItems: 'center' },

  // GPS
  radarMap: { height: 190, borderRadius: 18, marginVertical: 14, backgroundColor: '#030712',
              borderWidth: 1, borderColor: '#14B8A620', position: 'relative',
              overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  radarRing:    { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  radarCrossH:  { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth,
                  backgroundColor: '#14B8A620', top: '50%' },
  radarCrossV:  { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth,
                  backgroundColor: '#14B8A620', left: '50%' },
  radarPin:      { position: 'absolute', alignItems: 'center' },
  radarPinDot:   { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5,
                   alignItems: 'center', justifyContent: 'center' },
  radarPinLabel: { backgroundColor: 'rgba(15,23,42,0.88)', borderRadius: 8,
                   paddingHorizontal: 6, paddingVertical: 2, marginTop: 3, alignItems: 'center' },
  radarPinName:  { fontSize: 8, fontWeight: '800', color: '#fff' },
  radarPinBatt:  { fontSize: 7, fontWeight: '700' },
  radarFootnoteRow: { position: 'absolute', bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  radarFootnote: { fontSize: 9, color: '#14B8A680', fontWeight: '700' },
  telemetryRow:  { flexDirection: 'row', alignItems: 'center', padding: 12,
                   borderRadius: 16, borderWidth: 1 },

  // Health
  medIconBox: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  medRow:     { flexDirection: 'row', alignItems: 'center', paddingBottom: 12,
                borderBottomWidth: StyleSheet.hairlineWidth },
  markBtn:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12,
                paddingVertical: 7, paddingHorizontal: 12 },

  // AI Doc
  textarea:     { borderWidth: 1.5, borderRadius: 14, padding: 12, fontSize: 14,
                  minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
  submitBtn:    { borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  submitBtnText:{ fontSize: 14, fontWeight: '800' },

  // Memories
  memoryThumb: { width: '100%', height: 130, borderRadius: 16,
                 alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heartBtn:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
                 paddingVertical: 8, borderRadius: 14, borderWidth: 1 },

  // Ledger
  kidLedgerCard: { borderRadius: 18, borderWidth: 1.5, padding: 14, marginTop: 14 },
  coinBar:       { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 2 },
  coinBarFill:   { height: '100%', borderRadius: 3 },
  walletBtn:     { flex: 1, borderRadius: 14, paddingVertical: 10,
                   alignItems: 'center', justifyContent: 'center' },
  walletBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  // Meals
  mealIconBox:   { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mealCard:      { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 12 },
  groceryInput:  { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#334155',
                   backgroundColor: '#0F172A', color: '#E2E8F0', fontSize: 13,
                   paddingHorizontal: 12, paddingVertical: 9 },
  groceryAddBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: BRAND.emerald,
                   alignItems: 'center', justifyContent: 'center' },
  aisleLabel:    { fontSize: 10, fontWeight: '900', color: '#64748B', letterSpacing: 1 },
  groceryRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1,
                   paddingHorizontal: 12, paddingVertical: 10 },
  recipeOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)',
                   justifyContent: 'center', padding: 16, zIndex: 99 },
  recipeCard:    { borderRadius: 24, padding: 20, maxHeight: '90%' },
  recipeSection: { fontSize: 13, fontWeight: '900', marginBottom: 8 },
  ingPill:       { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  stepNum:       { width: 22, height: 22, borderRadius: 11, alignItems: 'center',
                   justifyContent: 'center', marginRight: 10, flexShrink: 0 },

  // Roster
  inviteInput:     { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  inviteBtn:       { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rosterRow:       { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1.5, padding: 12 },
  rosterActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1,
                     borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  pinBox:          { marginTop: 6, borderRadius: 16, borderWidth: 1, padding: 14 },
  pinInput:        { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12,
                     paddingVertical: 9, fontSize: 16, letterSpacing: 4, textAlign: 'center' },
});
