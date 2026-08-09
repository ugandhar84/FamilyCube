/**
 * PetPrivacySheet — controls what visitors see when they view any of the owner's pets.
 *
 * Six toggles, each writing immediately to the DB so there's no Save button.
 * The fields live on `profiles` (not per-pet) because the privacy setting applies
 * uniformly across all of the owner's babies.
 */

import React, { memo } from 'react';
import { Switch } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import SettingRow from '@/features/profile/components/SettingRow';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Visibility toggles */
  showAbout:      boolean;
  showVaccines:   boolean;
  showAllergies:  boolean;
  showVetVisits:  boolean;
  showWeight:     boolean;
  showMilestones: boolean;
  /** Callbacks — parent writes DB + updates state */
  onChangeAbout:      (v: boolean) => void;
  onChangeVaccines:   (v: boolean) => void;
  onChangeAllergies:  (v: boolean) => void;
  onChangeVetVisits:  (v: boolean) => void;
  onChangeWeight:     (v: boolean) => void;
  onChangeMilestones: (v: boolean) => void;
  accent: string;
  colors: any;
}

const PetPrivacySheet = memo(function PetPrivacySheet({
  visible, onClose,
  showAbout, showVaccines, showAllergies, showVetVisits, showWeight, showMilestones,
  onChangeAbout, onChangeVaccines, onChangeAllergies, onChangeVetVisits, onChangeWeight, onChangeMilestones,
  accent, colors,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="My babies' profiles">
      {([
        { label: 'About',           sub: 'Breed, birthday, gender…', value: showAbout,      onChange: onChangeAbout      },
        { label: 'Vaccines',        sub: 'Vaccination records',       value: showVaccines,   onChange: onChangeVaccines   },
        { label: 'Known allergies', sub: 'Allergy list',              value: showAllergies,  onChange: onChangeAllergies  },
        { label: 'Vet visits',      sub: 'Visit history',             value: showVetVisits,  onChange: onChangeVetVisits  },
        { label: 'Weight history',  sub: 'Weight chart',              value: showWeight,     onChange: onChangeWeight     },
        { label: 'Milestones',      sub: 'Trophy moments',            value: showMilestones, onChange: onChangeMilestones },
      ] as const).map(({ label, sub, value, onChange }, i) => (
        <SettingRow key={label} icon="eye-outline" label={label} sub={sub} colors={colors} borderTop={i > 0}
          right={
            <Switch value={value} onValueChange={onChange}
              trackColor={{ false: colors.border, true: `${accent}80` }}
              thumbColor={value ? accent : (colors.textTertiary ?? '#999')} />
          } />
      ))}
    </BottomSheet>
  );
});

export default PetPrivacySheet;
