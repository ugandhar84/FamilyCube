import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { filterBreeds } from '@/lib/breeds';
import { SPECIES_EMOJI, TYPO} from '@/constants/theme';

interface SpeciesBreedSelectorProps {
  species: string;
  breed: string;
  speciesList: Array<{ value: string; label: string }> | string[];
  onSpeciesChange: (species: string) => void;
  onBreedChange: (breed: string) => void;
  breedError?: string;
  colors: any;
  accentColor: string;
}

export const SpeciesBreedSelector = ({
  species,
  breed,
  speciesList,
  onSpeciesChange,
  onBreedChange,
  breedError,
  colors,
  accentColor,
}: SpeciesBreedSelectorProps) => {
  const [breedFocused, setBreedFocused] = useState(false);
  const breedBlurTimer = useRef<any>(undefined);

  useEffect(() => () => {
    if (breedBlurTimer.current) clearTimeout(breedBlurTimer.current);
  }, []);

  const handleSpeciesChange = (sp: string) => {
    onSpeciesChange(sp);
    onBreedChange(''); // clear breed when species changes
  };

  const handleBreedChange = (text: string) => {
    onBreedChange(text.replace(/[^a-zA-Z\s\-'./&]/g, ''));
  };

  const getSpeciesLabel = (sp: string | { value: string; label: string }): string => {
    if (typeof sp === 'string') return sp.charAt(0).toUpperCase() + sp.slice(1);
    return sp.label;
  };

  const getSpeciesValue = (sp: string | { value: string; label: string }): string => {
    return typeof sp === 'string' ? sp : sp.value;
  };

  const getSpeciesEmoji = (sp: string | { value: string; label: string }): string => {
    const value = getSpeciesValue(sp);
    return SPECIES_EMOJI[value] || '🐾';
  };

  return (
    <View>
      {/* Species Selection */}
      <View style={[s.row, { marginBottom: 16 }]}>
        {speciesList.map(sp => {
          const value = getSpeciesValue(sp);
          const active = species === value;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => handleSpeciesChange(value)}
              activeOpacity={0.7}
              style={[
                s.chip,
                {
                  backgroundColor: active ? accentColor : colors.inputBg ?? colors.card,
                  borderColor: active ? accentColor : colors.border,
                },
              ]}
            >
              <Text style={{ fontSize: TYPO.subheading }}>{getSpeciesEmoji(sp)}</Text>
              <Text
                style={[
                  s.chipText,
                  { color: active ? '#fff' : colors.textSecondary, fontWeight: active ? '700' : '500' },
                ]}
              >
                {getSpeciesLabel(sp)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Breed Input */}
      <View style={{ position: 'relative' }}>
        <TextInput
          style={[
            s.input,
            {
              borderColor: breedError ? '#DC2626' : colors.border,
              backgroundColor: colors.inputBg,
              color: colors.textPrimary,
            },
          ]}
          placeholder="Type to search breed…"
          placeholderTextColor={colors.placeholder}
          value={breed}
          onChangeText={(text) => handleBreedChange(text)}
          onFocus={() => setBreedFocused(true)}
          onBlur={() => {
            breedBlurTimer.current = setTimeout(() => setBreedFocused(false), 150);
          }}
          autoCapitalize="words"
          returnKeyType="done"
        />

        {breedFocused && breed.length >= 1 && (
          <View
            style={[
              s.dropdown,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {filterBreeds(species, breed).map(b => (
              <TouchableOpacity
                key={b}
                style={[s.option, { borderBottomColor: colors.border }]}
                onPress={() => {
                  onBreedChange(b);
                  setBreedFocused(false);
                }}
              >
                <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>{b}</Text>
              </TouchableOpacity>
            ))}
            {filterBreeds(species, breed).length === 0 && (
              <Text style={[s.option, { color: colors.textSecondary, fontSize: TYPO.body }]}>
                No match — custom breed accepted
              </Text>
            )}
          </View>
        )}

        {breedError && (
          <Text style={{ fontSize: TYPO.caption, color: '#DC2626', marginTop: 6 }}>
            {breedError}
          </Text>
        )}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: TYPO.body,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: TYPO.body,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    zIndex: 10,
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
});
