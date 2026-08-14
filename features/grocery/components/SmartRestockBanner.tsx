import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';

interface Staple {
  id: string;
  name: string;
  category: string;
  avg_days_between: number;
  last_bought_at: string;
  times_bought: number;
}

interface SmartRestockBannerProps {
  familyId: string;
  colors: any;
  isDark: boolean;
  onAddItem: (name: string, category: string) => void;
}

function daysAgo(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

export function SmartRestockBanner({ familyId, colors, isDark, onAddItem }: SmartRestockBannerProps) {
  const [staples, setStaples] = useState<Staple[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId) return;
    async function fetchStaples() {
      try {
        const { data } = await supabase
          .from('grocery_staples')
          .select('id,name,category,avg_days_between,last_bought_at,times_bought')
          .eq('family_id', familyId)
          .eq('auto_suggest', true)
          .order('times_bought', { ascending: false })
          .limit(10);
        const overdue = (data ?? []).filter((s: Staple) => {
          if (!s.last_bought_at || !s.avg_days_between) return false;
          return daysAgo(s.last_bought_at) >= s.avg_days_between;
        });
        setStaples(overdue.slice(0, 6));
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    }
    fetchStaples();
  }, [familyId]);

  if (loading || staples.length === 0) return null;

  const bg = isDark ? '#1E1A38' : '#F5F3FF';
  const border = isDark ? '#3B3063' : '#DDD6FE';

  return (
    <View style={{ marginHorizontal: 14, marginBottom: 10, borderRadius: 14, backgroundColor: bg, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 6 }}>
        <Text style={{ fontSize: 14 }}>🔮</Text>
        <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#A78BFA' : '#7C3AED', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Time to Restock
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}>
        {staples.map(staple => {
          const days = daysAgo(staple.last_bought_at);
          return (
            <Pressable
              key={staple.id}
              onPress={() => onAddItem(staple.name, staple.category)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: isDark ? '#2D2060' : '#EDE9FE',
                borderWidth: 1,
                borderColor: isDark ? '#4C3899' : '#C4B5FD',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{staple.name}</Text>
                <Text style={{ fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 2 }}>
                  Last bought {days}d ago · every {Math.round(staple.avg_days_between)}d
                </Text>
              </View>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: isDark ? '#7C3AED' : '#7C3AED', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 14, lineHeight: 16 }}>+</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
