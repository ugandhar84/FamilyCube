import { useState, useRef } from 'react';
import { View, TextInput, TouchableOpacity, Animated } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';

// Collapsed by default to a single search icon — tapping it expands the
// query input inline (width animation, not a modal), mirroring
// features/quests/components/QuestSearchBar.tsx's collapse pattern. Filters
// events by title/notes; Calendar already has its own date navigation
// (Month/Week/Day/Agenda + prev/next), so no separate date-range picker
// is needed here.
export function CalendarSearchBar({ query, onQueryChange, colors, isDark }: {
  query: string; onQueryChange: (q: string) => void;
  colors: any; isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(!!query);
  const widthAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  const toggleExpanded = (next: boolean) => {
    setExpanded(next);
    Animated.timing(widthAnim, { toValue: next ? 1 : 0, duration: 220, useNativeDriver: false }).start();
  };

  const hasActiveFilter = !!query;

  return (
    <View style={expanded ? { flex: 1, minWidth: 160 } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity onPress={() => { console.log(`[UserAction] screen=Schedule tapped "search icon" on CalendarSearchBar newValue=${!expanded} [features/calendar/components/CalendarSearchBar.tsx:29]`); toggleExpanded(!expanded); }}
          style={{ width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: expanded || hasActiveFilter ? colors.primary : colors.border,
            backgroundColor: expanded || hasActiveFilter ? colors.primaryLight : colors.surface }}>
          <Search size={16} color={expanded || hasActiveFilter ? colors.primary : colors.textTertiary} />
          {hasActiveFilter && !expanded && (
            <View style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }} />
          )}
        </TouchableOpacity>

        {expanded && (
          <Animated.View style={{
            flex: 1, flexDirection: 'row', gap: 8,
            opacity: widthAnim,
            transform: [{ scaleX: widthAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
              borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
              backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 9 }}>
              <TextInput
                value={query}
                onChangeText={onQueryChange}
                onBlur={() => console.log(`[UserAction] FORM screen=Schedule field="Search events" on "CalendarSearchBar" newValue=${query} [features/calendar/components/CalendarSearchBar.tsx:50]`)}
                placeholder="Search events…"
                placeholderTextColor={colors.textTertiary}
                autoFocus
                style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, padding: 0 }}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => { console.log(`[UserAction] screen=Schedule tapped "clear" (inline X) on CalendarSearchBar query="${query}" [features/calendar/components/CalendarSearchBar.tsx:57]`); onQueryChange(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={15} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity onPress={() => { console.log(`[UserAction] screen=Schedule tapped "collapse search" (X) on CalendarSearchBar query="${query}" [features/calendar/components/CalendarSearchBar.tsx:63]`); onQueryChange(''); toggleExpanded(false); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
}
