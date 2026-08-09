// ── Auth ──────────────────────────────────────
export interface Profile {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  phone: string | null;
  timezone: string | null;
  bio: string | null;
  notification_enabled: boolean;
  ai_mood_consent: boolean;
  ai_mood_consent_date: string | null;
  created_at: string;
  updated_at: string | null;
}

// ── Pet ───────────────────────────────────────
export interface Pet {
  id: string;
  owner_id: string;
  name: string;
  species: 'dog' | 'cat' | 'rabbit' | 'bird' | 'fish' | 'hamster' | 'turtle' | 'other';
  breed: string | null;
  birthday: string | null;
  adoption_date: string | null;
  emoji: string;
  accent_color: string;
  avatar_url: string | null;
  is_active: boolean;
  status: 'active' | 'memorial';
  memorial_reason: string | null;
  memorial_at: string | null;
  // New fields from schema_v2
  gender: 'male' | 'female' | 'unknown' | null;
  weight_kg: number | null;
  microchip_id: string | null;
  insurance_policy: string | null;
  neutered: boolean;
  color_coat: string | null;
  temperament: string[] | null;
  diet_type: string | null;
  notes: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_updated_at: string | null;
  created_at: string;
}

export interface PetFamily {
  id: string;
  pet_id: string;
  user_id: string;
  role: 'owner' | 'caretaker' | 'caregiver' | 'viewer';
  joined_at: string;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'handle' | 'avatar_url'>;
}

// ── Invitations ───────────────────────────────
export interface FamilyInvitation {
  id: string;
  pet_id: string;
  invited_by: string;
  email: string;  // DB column name (schema uses 'email', not 'invited_email')
  role: 'caretaker' | 'caregiver' | 'viewer';
  message: string | null;
  token: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  pets?: Pick<Pet, 'name' | 'emoji' | 'species'>;
  inviter?: Pick<Profile, 'full_name' | 'handle' | 'avatar_url'>;
}

// ── Push tokens ───────────────────────────────
export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android';
  last_used: string | null;
  created_at: string;
}

// ── Mood ──────────────────────────────────────
export type MoodLabel = 'happy' | 'grumpy' | 'tired' | 'playful' | 'anxious' | 'calm';

export interface MoodLog {
  id: string;
  pet_id: string;
  scanned_by: string | null;
  mood_label: MoodLabel;
  mood_score: number;
  happy_pct: number;
  playful_pct: number;
  tired_pct: number;
  anxious_pct: number;
  photo_url: string | null;
  notes: string | null;
  situation: string | null;
  advice: string[] | null;
  date: string;
  created_at: string;
}

// ── Health ────────────────────────────────────
export type VaccineStatus = 'overdue' | 'due_soon' | 'up_to_date';

export interface Vaccine {
  id: string;
  pet_id: string;
  name: string;
  last_given: string | null;
  next_due: string | null;
  vet_name: string | null;
  clinic: string | null;
  notes: string | null;
  created_at: string;
  status?: VaccineStatus;
  days_until_due?: number;
}

export interface Appointment {
  id: string;
  pet_id: string;
  type: string;            // 'checkup'|'vaccine'|'grooming'|'dental'|'surgery'|'follow_up'|'other'
  title: string;
  scheduled_at: string;    // ISO timestamp — matches DB column name
  duration_minutes: number;
  vet_name: string | null;
  vet_phone: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  notes: string | null;
  status: 'upcoming' | 'completed' | 'cancelled' | 'no_show';
  reminder_sent: boolean;
  reminder_at: string | null;
  remind_before_minutes: number | null;  // 15, 30, 60, 120, 1440 (day before)
  recurrence: 'none' | 'monthly' | 'yearly' | null;
  cost: number | null;
  visit_summary: string | null;
  created_at: string;
}

export interface VetVisit {
  id: string;
  pet_id: string;
  visit_date: string;
  vet_name: string | null;
  clinic_name: string | null;
  reason: string | null;
  diagnosis: string | null;
  prescription: string | null;
  weight_kg: number | null;
  notes: string | null;
  created_at: string;
}

export interface WeightLog {
  id: string;
  pet_id: string;
  weight_kg: number;
  logged_at: string;
  notes: string | null;
}

export interface Allergy {
  id: string;
  pet_id: string;
  allergen: string;
  category: string | null;  // 'food'|'environmental'|'medication'|'other'
  symptoms: string | null;  // DB column name (not 'reaction')
  severity: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  diagnosed_by: string | null;
  diagnosed_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface LabResult {
  id: string;
  pet_id: string;
  visit_id: string | null;
  test_name: string;
  result_value: string | null;  // DB column name (not 'value')
  unit: string | null;
  reference_range: string | null;
  is_abnormal: boolean;         // DB column name (not 'is_normal' — logic is inverted!)
  tested_at: string;            // DB column name (not 'collected_at')
  lab_name: string | null;
  file_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface DietPlan {
  id: string;
  pet_id: string;
  created_by: string;
  diet_type: string;
  daily_calories: number | null;
  meals_per_day: number;
  foods: string[];
  restrictions: string[];
  notes: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TrainingLog {
  id: string;
  pet_id: string;
  logged_by: string;
  skill: string;
  duration_minutes: number | null;
  result: 'success' | 'partial' | 'needs_work';
  notes: string | null;
  logged_at: string;
}

export interface InsurancePolicy {
  id: string;
  pet_id: string;
  provider_name: string;
  policy_number: string;
  coverage_type: string | null;
  monthly_premium: number | null;
  deductible: number | null;
  coverage_limit: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface Medication {
  id: string;
  pet_id: string;
  name: string;
  dosage: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'as_needed';
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Daily Care ────────────────────────────────
export interface FeedingLog {
  id: string;
  pet_id: string;
  fed_by: string | null;
  meal_type: 'meal' | 'treat' | 'water';
  amount_grams: number | null;
  food_type: string | null;
  date: string;
  fed_at: string;
  created_at?: string;
  profiles?: Pick<Profile, 'full_name' | 'handle' | 'avatar_url'>;
}

export interface GroomingLog {
  id: string;
  pet_id: string;
  type: string;
  done_at: string;
  done_at_time?: string | null;
  done_by?: string | null;
  notes: string | null;
}

export interface ChecklistItem {
  id: string;
  pet_id: string;
  date: string;
  type: 'walk' | 'water' | 'medicine' | 'play' | 'training';
  label: string;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  due_time: string | null;
  created_at: string;
}

// ── Social ────────────────────────────────────
export interface Milestone {
  id: string;
  pet_id: string;
  day_count: number;
  title: string;
  achieved_at: string;
  shared: boolean;
}

export interface LostAlert {
  id: string;
  pet_id: string;
  reported_by: string | null;
  last_seen_address: string | null;
  last_seen_lat: number | null;
  last_seen_lng: number | null;
  description: string | null;
  contact_phone: string | null;
  reward_amount: number | null;
  radius_km: number;
  photo_url: string | null;
  is_found: boolean;
  found_at: string | null;
  notification_sent: boolean;
  view_count: number;
  created_at: string;
  pets?: Pick<Pet, 'name' | 'emoji' | 'species' | 'breed'>;
}

export interface SocialPost {
  id: string;
  pet_id: string;
  author_id: string;
  type: string;           // 'moment'|'milestone'|'tip'|'lost_found'
  caption: string | null; // DB column name (not 'content')
  photo_url: string | null;
  location_name: string | null;
  likes_count: number;
  comments_count: number;
  is_public: boolean;
  created_at: string;
  updated_at?: string | null;
  pet?: Pick<Pet, 'name' | 'emoji'>;
  author?: Pick<Profile, 'full_name' | 'handle' | 'avatar_url'>;
}

// ── Notifications ─────────────────────────────
export interface NotificationLog {
  id: string;
  user_id: string;
  type:
    | 'lost_alert' | 'pet_found' | 'appointment_reminder' | 'reminder' | 'medication_reminder'
    | 'invite' | 'family_update' | 'system' | 'broadcast'
    | 'post_like' | 'post_comment' | 'follow'
    | 'playdate_request' | 'playdate_accepted' | 'playdate_declined' | 'playdate_confirmed'
    | 'playdate_resend' | 'playdate_withdrawal' | 'playdate_reminder'
    | 'playdate_proposal' | 'playdate_proposal_declined' | 'playdate_proposal_cancelled'
    | 'chat_message'
    | (string & {});
  title: string;
  body: string;
  data: Record<string, any>;
  read: boolean;
  created_at: string;
}

// ── Vet / Services ────────────────────────────
export interface VetClinic {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  is_emergency: boolean;
  is_24h: boolean;          // DB column name (not 'open_24h')
  specialties: string[] | null;
  rating: number | null;
  created_at: string;
}

// ── UI helpers ────────────────────────────────
export interface NearbyPet {
  pet: Pet;
  distance_km: number;
  tags: string[];
}
