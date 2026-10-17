import { Home, GraduationCap, Briefcase, MapPin, type LucideIcon } from 'lucide-react-native';
import type { PlaceKind } from '@/store/placesStore';

export const PLACE_KINDS: PlaceKind[] = ['home', 'school', 'work', 'other'];

/** Label, icon and pastel pair for each kind — same colour language as the Quick Actions tiles. */
export function placeKindMeta(kind: PlaceKind, colors: any): { label: string; Icon: LucideIcon; fg: string; bg: string; namePlaceholder: string } {
  switch (kind) {
    case 'home':   return { label: 'Home',   Icon: Home,          fg: colors.teal,  bg: colors.tealLight,  namePlaceholder: 'Home' };
    case 'school': return { label: 'School', Icon: GraduationCap, fg: colors.sky,   bg: colors.skyLight,   namePlaceholder: 'e.g. Westlake High' };
    case 'work':   return { label: 'Work',   Icon: Briefcase,     fg: colors.amber, bg: colors.amberLight, namePlaceholder: "e.g. Dad's office" };
    default:       return { label: 'Other',  Icon: MapPin,        fg: colors.pink,  bg: colors.pinkLight,  namePlaceholder: 'e.g. Grandma’s house' };
  }
}

export const RADIUS_OPTIONS: { m: number; label: string }[] = [
  { m: 100,  label: '100 m' },
  { m: 200,  label: '200 m' },
  { m: 500,  label: '500 m' },
  { m: 1000, label: '1 km' },
];
