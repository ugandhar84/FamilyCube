/**
 * ProfilePrivacySheet — controls what other users see on the owner's public profile.
 *
 * Three toggles: full name, email, and profile photo. Each toggle fires an
 * immediate DB write (no save button) so the setting takes effect right away.
 */

import React, { memo } from 'react';
import { Switch } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import SettingRow from '@/features/profile/components/SettingRow';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Current visibility states */
  showName:  boolean;
  showEmail: boolean;
  showPhoto: boolean;
  /** Setters — component calls both the setter and the DB writer */
  onChangeName:  (v: boolean) => void;
  onChangeEmail: (v: boolean) => void;
  onChangePhoto: (v: boolean) => void;
  accent: string;
  colors: any;
}

const ProfilePrivacySheet = memo(function ProfilePrivacySheet({
  visible, onClose,
  showName, showEmail, showPhoto,
  onChangeName, onChangeEmail, onChangePhoto,
  accent, colors,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="My public profile">
      {([
        { label: 'Full name', sub: 'Show your display name',    value: showName,  onChange: onChangeName  },
        { label: 'Email',     sub: 'Show your email address',   value: showEmail, onChange: onChangeEmail },
        { label: 'Photo',     sub: 'Show your profile picture', value: showPhoto, onChange: onChangePhoto },
      ] as const).map(({ label, sub, value, onChange }, i) => (
        <SettingRow key={label} icon="person-outline" label={label} sub={sub} colors={colors} borderTop={i > 0}
          right={
            <Switch value={value} onValueChange={onChange}
              trackColor={{ false: colors.border, true: `${accent}80` }}
              thumbColor={value ? accent : (colors.textTertiary ?? '#999')} />
          } />
      ))}
    </BottomSheet>
  );
});

export default ProfilePrivacySheet;
