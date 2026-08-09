import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { parseISO, getDate, getDaysInMonth } from 'date-fns';
import { s } from './expensesStyles';
import { TYPO } from '@/constants/theme';
import type { PetExpense } from '@/lib/db/expenses';

const SPARK_H = 44;

function Sparkline({ expenses, monthStart, monthOffset, width }: {
  expenses: PetExpense[]; monthStart: Date; monthOffset: number; width: number;
}) {
  const points = useMemo(() => {
    const totalDays = getDaysInMonth(monthStart);
    const today = monthOffset === 0 ? new Date().getDate() : totalDays;
    // per-day totals
    const byDay = Array(totalDays + 1).fill(0);
    for (const e of expenses) {
      const d = getDate(parseISO(e.expense_date));
      if (d >= 1 && d <= totalDays) byDay[d] += Number(e.amount);
    }
    // cumulative
    const cum: number[] = [];
    let running = 0;
    for (let d = 1; d <= today; d++) { running += byDay[d]; cum.push(running); }
    return { cum, today, totalDays };
  }, [expenses, monthStart, monthOffset]);

  if (points.cum.length < 2) return null;
  const max = Math.max(...points.cum, 1);
  const W = width - 2;
  const pts = points.cum.map((v, i) => ({
    x: (i / (points.today - 1)) * W,
    y: SPARK_H - 4 - ((v / max) * (SPARK_H - 8)),
  }));
  // smooth path
  const d = pts.map((p, i) =>
    i === 0
      ? `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
      : `L${p.x.toFixed(1)},${p.y.toFixed(1)}`
  ).join(' ');
  const area = `${d} L${pts[pts.length-1].x.toFixed(1)},${SPARK_H} L0,${SPARK_H} Z`;

  return (
    <Svg width={W} height={SPARK_H} style={{ marginTop: 12 }}>
      <Defs>
        <SvgGrad id="sg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity={0.28} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </SvgGrad>
      </Defs>
      <Path d={area} fill="url(#sg)" />
      <Path d={d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

interface Props {
  accent: string;
  monthTotal: number;
  monthLabel: string;
  monthOffset: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  ytdTotal: number;
  monthlyAvg: number;
  dailyAvg: number;
  monthExpenses: PetExpense[];
  monthStart: Date;
}

const ExpenseHeroCard = memo(function ExpenseHeroCard({
  accent, monthTotal, monthLabel, monthOffset, onPrevMonth, onNextMonth,
  ytdTotal, monthlyAvg, dailyAvg, monthExpenses, monthStart,
}: Props) {
  const { width } = useWindowDimensions();
  return (
    <LinearGradient colors={[accent, accent + 'DD', accent + '88', accent + '55']}
      style={{ paddingBottom: 20, paddingTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 }}>
        <TouchableOpacity onPress={onPrevMonth} style={s.navBtn}>
          <Ionicons name="chevron-back" size={18} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: -1 }}>
            ${monthTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: 'rgba(255,255,255,0.82)', marginTop: 2 }}>{monthLabel}</Text>
        </View>
        <TouchableOpacity onPress={onNextMonth} style={s.navBtn} disabled={monthOffset === 0}>
          <Ionicons name="chevron-forward" size={18} color={monthOffset === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 10, justifyContent: 'center' }}>
        <View style={s.heroChip}>
          <Text style={s.heroChipLabel}>YTD</Text>
          <Text style={s.heroChipVal}>${ytdTotal.toFixed(0)}</Text>
        </View>
        <View style={s.heroChip}>
          <Text style={s.heroChipLabel}>Avg / mo</Text>
          <Text style={s.heroChipVal}>${monthlyAvg.toFixed(0)}</Text>
        </View>
        <View style={s.heroChip}>
          <Text style={s.heroChipLabel}>Per day</Text>
          <Text style={s.heroChipVal}>${dailyAvg.toFixed(1)}</Text>
        </View>
      </View>
      {monthExpenses.length >= 2 && (
        <View style={{ paddingHorizontal: 20 }}>
          <Sparkline expenses={monthExpenses} monthStart={monthStart} monthOffset={monthOffset} width={width - 40} />
        </View>
      )}
    </LinearGradient>
  );
});

export default ExpenseHeroCard;
