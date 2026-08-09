import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { filterBreeds } from '@/lib/breeds';
import { TYPO } from '@/constants/theme';

interface BreedSelectorProps {
  species: string;
  breed: string;
  onBreedChange: (breed: string) => void;
  breedError?: string;
  colors: any;
  accentColor: string;
}

export const BreedSelector = ({
  species,
  breed,
  onBreedChange,
  breedError,
  colors,
  accentColor,
}: BreedSelectorProps) => {
  const [breedFocused, setBreedFocused] = useState(false);
  const breedBlurTimer = useRef<any>(undefined);

  useEffect(() => () => {
    if (breedBlurTimer.current) clearTimeout(breedBlurTimer.current);
  }, []);

  const handleBreedChange = (text: string) => {
    onBreedChange(text.replace(/[^a-zA-Z\s\-'./&]/g, ''));
  };

  return (
    <View>
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
