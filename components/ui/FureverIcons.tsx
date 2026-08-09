/**
 * PawBond icon library — thin wrappers around @expo/vector-icons Ionicons.
 * Same props as before: color, size. Drop-in replacement for all import sites.
 */
import { Ionicons } from '@expo/vector-icons';

interface IconProps {
  color?: string;
  size?: number;
  strokeWidth?: number; // accepted for compat, ignored (Ionicons handles its own weight)
}

const ic = (name: React.ComponentProps<typeof Ionicons>['name'], displayName: string) => {
  const Comp = ({ color = '#7C5CBF', size = 24 }: IconProps) =>
    <Ionicons name={name} size={size} color={color} />;
  Comp.displayName = displayName;
  return Comp;
};

export const CameraIcon       = ic('camera-outline',          'CameraIcon');
export const FilmIcon         = ic('film-outline',            'FilmIcon');
export const ImagesIcon       = ic('images-outline',          'ImagesIcon');
export const SmileIcon        = ic('happy-outline',           'SmileIcon');
export const TrophyIcon       = ic('trophy-outline',          'TrophyIcon');
export const ActivityIcon     = ic('pulse-outline',           'ActivityIcon');
export const PlusIcon         = ic('add-outline',             'PlusIcon');
export const ArrowLeftIcon    = ic('arrow-back-outline',      'ArrowLeftIcon');
export const BrainIcon        = ic('bulb-outline',            'BrainIcon');
export const SaveIcon         = ic('save-outline',            'SaveIcon');
export const PlayCircleIcon   = ic('play-circle-outline',     'PlayCircleIcon');
export const StarIcon         = ic('star-outline',            'StarIcon');
export const CheckCircleIcon  = ic('checkmark-circle-outline','CheckCircleIcon');
export const LockIcon         = ic('lock-closed-outline',     'LockIcon');
export const CreditCardIcon   = ic('card-outline',            'CreditCardIcon');
export const DownloadIcon     = ic('download-outline',        'DownloadIcon');
export const SparklesIcon     = ic('sparkles-outline',        'SparklesIcon');
export const CalendarIcon     = ic('calendar-outline',        'CalendarIcon');
export const PawIcon          = ic('paw-outline',             'PawIcon');
export const MapPinIcon       = ic('location-outline',        'MapPinIcon');
export const UsersIcon        = ic('people-outline',          'UsersIcon');
export const ShareIcon        = ic('share-social-outline',    'ShareIcon');
export const WandIcon         = ic('color-wand-outline',      'WandIcon');
