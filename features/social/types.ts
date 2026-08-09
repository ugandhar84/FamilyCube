/**
 * types — shared data shapes and constants for the Social feature.
 *
 * All interfaces and union types consumed by SocialScreen, its sub-components,
 * and the Nearby / Family tabs live here so they can be imported without pulling
 * in any React or UI code.  Constants that belong logically with these types
 * (distance options, species chips, cancel-reason strings) are co-located for
 * the same reason.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PostComment {
  id: string;
  author_id: string;
  body: string;                                          // raw text, may contain @handles
  created_at: string;
  author?: { full_name: string; handle?: string | null; avatar_url?: string | null };
  pet?: { name: string; emoji: string; accent_color?: string; avatar_url?: string | null };
}

export interface Post {
  id: string;
  pet_id: string;
  author_id: string;
  caption: string | null;
  photo_url: string | null;                              // legacy single-photo field
  photo_urls?: string[] | null;                          // multi-photo grid (up to 4)
  media_type?: 'photo' | 'video' | null;
  video_url?: string | null;
  video_thumbnail_url?: string | null;
  likes_count: number;
  comments_count: number;
  is_public: boolean;
  created_at: string;
  updated_at?: string | null;
  is_edited?: boolean;
  edited_at?: string | null;
  pet?: { id?: string; name: string; emoji: string; accent_color?: string; species?: string; breed?: string | null; followers_count?: number; avatar_url?: string | null; owner_id?: string; interests?: string[] | null };
  author?: { full_name: string; handle?: string | null; avatar_url: string | null };
  owner_tier?: string | null;
  caption_overlay?: boolean;                              // true = overlay_caption shown on photo
  overlay_caption?: string | null;                        // text shown on photo (max 250), separate from caption
  fit_frame?: boolean;                                    // true = photo shown with letterbox bars (contain), not cropped (cover)
  is_media_blocked?: boolean;                            // true when a moderator removed the media
  liked?: boolean;                                       // whether the current user has liked this post
  showComments?: boolean;                                // UI-only: controls inline comment expansion
  comments?: PostComment[];
  commentsLoaded?: boolean;                              // true once the comment thread has been fetched
}

export interface FamilyMember {
  id: string; user_id: string; role: string; joined_at: string;
  profiles: { full_name: string; handle?: string | null; avatar_url: string | null };
}

export interface NearbyPet {
  id: string; name: string; species: string; breed: string | null;
  gender: string | null; status?: string | null;
  emoji: string; accent_color: string | null; avatar_url: string | null;
  birthday: string | null; latitude: number; longitude: number;
  owner_id: string; distanceKm: number;                  // pre-computed by haversine at query time
  location_area?: string | null;
  age?: { years: number; months: number } | null;
  owner?: { full_name: string; handle?: string | null; avatar_url?: string | null; user_emoji?: string | null; profile_show_photo?: boolean | null };
  owner_tier?: string | null;
  requested?: boolean;                                   // true if the current user already sent a playdate request
  avg_rating?: number | null;
  total_ratings?: number | null;
}

export type GenderFilter = 'any' | 'male' | 'female' | 'unknown';

export interface IncomingRequest {
  id: string;
  from_pet_id: string;
  to_pet_id: string;
  status: string;
  created_at: string;
  responder_user_id?: string | null;
  proposed_date?: string | null;
  proposed_time?: string | null;
  proposed_end_time?: string | null;
  proposed_location?: string | null;
  message?: string | null;
  from_pet: { id?: string; name: string; emoji: string; accent_color: string | null; breed?: string | null; birthday?: string | null; avatar_url?: string | null };
  to_pet:   { name: string; emoji: string; avatar_url?: string | null };
}

export interface CommunityEvent {
  id: string; organizer_id: string; title: string; description: string | null;
  event_type: string; event_date: string; event_time: string | null;
  location_name: string | null; is_public: boolean; created_at: string;
  rsvp_count: number;
  user_rsvpd: boolean;                                   // whether the current user has RSVPed
  organizer?: { full_name: string; handle?: string | null; avatar_url: string | null };
}

export type MainTab  = 'Feed' | 'Nearby' | 'Family';
export type SpeciesFilter = 'all' | 'dog' | 'cat' | 'rabbit' | 'bird' | 'other';

// ── Constants ──────────────────────────────────────────────────────────────────

// Shown in the distance-radius picker; separate lists so labels match the user's locale
export const DISTANCE_OPTS_METRIC   = [{ km: 1, label: '1 km' }, { km: 5, label: '5 km' }, { km: 15, label: '15 km' }, { km: 25, label: '25 km' }] as const;
export const DISTANCE_OPTS_IMPERIAL = [{ km: 1.6, label: '1 mi' }, { km: 4.8, label: '3 mi' }, { km: 16.1, label: '10 mi' }, { km: 24.1, label: '15 mi' }] as const;
export const KM_PER_MILE = 1.60934;
export const KG_PER_LB   = 0.453592;

// Quick-filter chips shown above the Nearby carousel
export const SPECIES_CHIPS: { key: SpeciesFilter; label: string; emoji: string }[] = [
  { key: 'all',    label: 'All',     emoji: '🐾' },
  { key: 'dog',    label: 'Dogs',    emoji: '🐶' },
  { key: 'cat',    label: 'Cats',    emoji: '🐱' },
  { key: 'rabbit', label: 'Rabbits', emoji: '🐰' },
  { key: 'bird',   label: 'Birds',   emoji: '🦜' },
  { key: 'other',  label: 'Other',   emoji: '🐟' },
];

// Canned reasons presented in the cancel-playdate action sheet
export const CANCEL_REASONS = [
  "Something came up 🙁",
  "Bad weather ⛈️",
  "My pet isn't feeling well 🐾",
  "Schedule conflict 📅",
  "Change of plans",
];

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB — enforced before upload

// Lookup table for converting full US state names to two-letter abbreviations
// (used when shortening location strings shown on NearbyPetCards)
export const US_STATE_ABBR: Record<string, string> = {
  Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',
  Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',
  Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',
  Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',
  Mississippi:'MS',Missouri:'MO',Montana:'MT',Nebraska:'NE',Nevada:'NV',
  'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
  'North Carolina':'NC','North Dakota':'ND',Ohio:'OH',Oklahoma:'OK',Oregon:'OR',
  Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',
  Tennessee:'TN',Texas:'TX',Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA',
  'West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY','District of Columbia':'DC',
};
