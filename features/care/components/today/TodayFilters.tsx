import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Keyboard, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

export type CategoryKey = 'all' | 'feeding' | 'meds' | 'grooming' | 'health' | 'mood' | 'tasks';

export const CATEGORIES: { key: CategoryKey; emoji: string; label: string }[] = [
  { key: 'all',      emoji: '🌟', label: 'All'       },
  { key: 'feeding',  emoji: '🍽️', label: 'Feeding'   },
  { key: 'meds',     emoji: '💊', label: 'Meds'      },
  { key: 'grooming', emoji: '🛁', label: 'Grooming'  },
  { key: 'health',   emoji: '🏥', label: 'Health'    },
  { key: 'mood',     emoji: '😊', label: 'Mood'      },
  { key: 'tasks',    emoji: '📋', label: 'Tasks'     },
];

interface Props {
  category: CategoryKey;
  search: string;
  onCategory: (k: CategoryKey) => void;
  onSearch: (s: string) => void;
  colors: any;
  isDark: boolean;
  hideSearch?: boolean;
}

export default function TodayFilters({ category, search, onCategory, onSearch, colors, isDark, hideSearch }: Props) {
  const [focused, setFocused] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const currentCategory = CATEGORIES.find(c => c.key === category);

  return (
    <View style={s.root}>
      {/* Filter dropdown + Search bar */}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        {/* Category dropdown */}
        <TouchableOpacity
          onPress={() => setDropdownOpen(!dropdownOpen)}
          style={[s.dropdown, {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
          }]}
        >
          <Text style={{ fontSize: TYPO.subheading }}>{currentCategory?.emoji}</Text>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary, flex: 1 }}>
            {currentCategory?.label}
          </Text>
          <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Search bar */}
        {!hideSearch && (
          <View style={[s.searchWrap, {
            flex: 1,
            backgroundColor: isDark ? colors.card : colors.inputBg ?? colors.card,
            borderColor: focused ? colors.primary : colors.border,
            borderWidth: focused ? 1.5 : StyleSheet.hairlineWidth,
          }]}>
            <Ionicons name="search" size={16} color={focused ? colors.primary : colors.textTertiary} />
            <TextInput
              style={[s.searchInput, { color: colors.textPrimary }]}
              placeholder="Search…"
              placeholderTextColor={colors.textTertiary}
              value={search}
              onChangeText={onSearch}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { onSearch(''); }} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Category dropdown menu */}
      {dropdownOpen && (
        <View style={[s.dropdownMenu, {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
        }]}>
          {CATEGORIES.map(({ key, emoji, label }) => {
            const active = category === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => {
                  onCategory(key);
                  setDropdownOpen(false);
                }}
                style={[s.dropdownItem, {
                  backgroundColor: active ? colors.primary + '15' : 'transparent',
                }]}
              >
                <Text style={{ fontSize: TYPO.subheading }}>{emoji}</Text>
                <Text style={[s.dropdownLabel, {
                  color: active ? colors.primary : colors.textPrimary,
                  fontWeight: active ? '700' : '500',
                }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:           { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  dropdown:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minWidth: 110 },
  searchWrap:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput:    { flex: 1, fontSize: TYPO.body, padding: 0 },
  dropdownMenu:   { marginTop: 8, borderRadius: 10, overflow: 'hidden' },
  dropdownItem:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.05)' },
  dropdownLabel:  { fontSize: TYPO.body },
});
