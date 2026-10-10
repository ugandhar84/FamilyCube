/**
 * Hidden safety-net route — family tree is now reached as a FullPageOverlay
 * from FamilyScreen (see FamilyTreePage.tsx), not via this tab. Kept live
 * only so a stale deep link doesn't crash.
 */
import { router } from 'expo-router';
import { FamilyTreePage } from '@/features/family/FamilyTreePage';

export default function FamilyRosterTab() {
  return <FamilyTreePage onClose={() => router.replace('/(tabs)')} />;
}
