/**
 * features/profile — barrel export for the profile feature slice.
 *
 * Re-exports the default screen and all sub-pieces so consumers can import
 * from a single path: `import ProfileScreen from '@/features/profile'`.
 */

export { default } from '@/features/profile/screens/ProfileScreen';
export { default as SettingRow } from '@/features/profile/components/SettingRow';
export { default as ProfileSectionHeader } from '@/features/profile/components/ProfileSectionHeader';
export { default as ProfileCard } from '@/features/profile/components/ProfileCard';
export { hero, safety, petCard, thm, mdl } from '@/features/profile/styles';
export { initials, memberSince } from '@/features/profile/utils';
