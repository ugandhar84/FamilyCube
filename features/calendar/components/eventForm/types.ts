// ─── Category definitions ──────────────────────────────────────────────────────
export type EventCategory = 'Medical' | 'Sports' | 'Study' | 'Ride' | 'Work' | 'Event' | 'Birthday' | 'Errand' | 'Other';

// 'Work' intentionally excluded — it's parent-personal, not family-facing
// (see isWorkEvent, which already filters it out of every family timeline).
// The EventCategory type value and its filter stay in place for any
// existing Work events already saved; this list is just what's offered
// going forward.
// Category swatches are intentionally hardcoded hex — this is a per-category
// color legend (8 distinct categories) with no matching semantic token in
// constants/colors.ts (only ~6 semantic tokens exist: danger/warning/success/
// info/primary/accent). Collapsing 8 categories onto 6 tokens would make two
// categories visually indistinguishable, so these stay as documented swatches
// rather than guessing a wrong semantic mapping. Module-level constant — can't
// call useTheme() here anyway.
export const CATEGORIES: { key: EventCategory; emoji: string; label: string; color: string }[] = [
  { key: 'Medical',  emoji: '🏥', label: 'Medical',  color: '#EF4444' },
  { key: 'Sports',   emoji: '🏅', label: 'Sports',   color: '#F59E0B' },
  { key: 'Study',    emoji: '📚', label: 'Study',    color: '#3B82F6' },
  { key: 'Ride',     emoji: '🚗', label: 'Ride',     color: '#10B981' },
  { key: 'Event',    emoji: '🎉', label: 'Event',    color: '#6C5CE7' },
  { key: 'Birthday', emoji: '🎂', label: 'Birthday', color: '#F59E0B' },
  { key: 'Errand',   emoji: '🛒', label: 'Errand',   color: '#0EA5E9' },
  { key: 'Other',    emoji: '✨', label: 'Other',    color: '#64748B' },
];

// ─── Smart suggestions ─────────────────────────────────────────────────────────
export const SUGGESTIONS: Record<EventCategory, { title: string; hint: string }[]> = {
  Medical:  [
    { title: 'Dentist appointment',   hint: '🦷 Routine checkup' },
    { title: 'Vaccine checkup',       hint: '💉 Immunisation' },
    { title: 'Eye exam',              hint: '👁️ Annual vision test' },
    { title: 'Pediatric checkup',     hint: '🩺 Annual well-child' },
    { title: 'Therapy session',       hint: '💙 Counselling' },
    { title: 'Orthodontist visit',    hint: '😬 Braces checkup' },
    { title: 'Allergy shot',          hint: '💊 Regular shot' },
  ],
  Sports:   [
    { title: 'Soccer practice',       hint: '⚽ Weekly training' },
    { title: 'Swimming lesson',       hint: '🏊 Coached session' },
    { title: 'Basketball game',       hint: '🏀 Match day' },
    { title: 'Tennis lesson',         hint: '🎾 Court session' },
    { title: 'Cricket match',         hint: '🏏 Tournament' },
    { title: 'Gymnastics class',      hint: '🤸 Skills training' },
    { title: 'Karate practice',       hint: '🥋 Belt training' },
  ],
  Study:    [
    { title: 'Math tutoring',         hint: '➕ Numbers session' },
    { title: 'Science study',         hint: '🔬 Lab review' },
    { title: 'English tutoring',      hint: '📖 Writing & reading' },
    { title: 'Hindi practice',        hint: '🪔 Language session' },
    { title: 'Coding lesson',         hint: '💻 Programming' },
    { title: 'SAT / exam prep',       hint: '📝 Test readiness' },
    { title: 'Music lesson',          hint: '🎵 Instrument practice' },
  ],
  Ride:     [
    { title: 'Ride to school',        hint: '🏫 Morning drop' },
    { title: 'Ride home from practice', hint: '🏠 After training' },
    { title: 'Pickup from chess club', hint: '♟️ Club pickup' },
    { title: 'Ride to friend\'s place', hint: '👫 Social trip' },
    { title: 'Airport pickup',        hint: '✈️ Terminal run' },
    { title: 'Library drop-off',      hint: '📚 Study session' },
  ],
  Work:     [
    { title: 'Team meeting',          hint: '👥 Office sync' },
    { title: 'Work presentation',     hint: '📊 Board deck' },
    { title: 'Conference call',       hint: '📞 Remote meeting' },
    { title: 'Office errand',         hint: '🏢 Quick run' },
    { title: 'Client visit',          hint: '🤝 Site meeting' },
    { title: 'Doctor visit',          hint: '🩺 Own health' },
  ],
  Event:    [
    { title: 'Family game night',     hint: '🎲 Board games' },
    { title: 'Movie night',           hint: '🎬 Film evening' },
    { title: 'Family dinner',         hint: '🍽️ Table time' },
    { title: 'Weekend outing',        hint: '🌳 Outside fun' },
    { title: 'House party',           hint: '🏠 Hosting guests' },
  ],
  Birthday: [
    { title: 'Birthday party',        hint: '🎁 Celebration' },
    { title: 'Birthday dinner',       hint: '🎂 Family meal' },
    { title: 'Friend\'s birthday',   hint: '🎊 Guest at party' },
  ],
  Errand: [
    { title: 'Grocery run',           hint: '🛒 Supermarket' },
    { title: 'Shopping trip',         hint: '🛍️ Mall / stores' },
    { title: 'Pharmacy pickup',       hint: '💊 Medicines' },
    { title: 'Bank errand',           hint: '🏦 Branch visit' },
    { title: 'Post office run',       hint: '📮 Drop / collect' },
    { title: 'Car service drop-off',  hint: '🔧 Garage' },
  ],
  Other: [],
};

// ─── Sport type chips ──────────────────────────────────────────────────────────
export const SPORT_TYPES = ['Soccer','Basketball','Swimming','Tennis','Cricket','Gymnastics','Karate','Rugby','Athletics','Badminton','Cycling'];
export const SUBJECTS    = ['Math','Science','English','Hindi','Coding','Music','Art','History','Geography','Economics'];
export const APPT_TYPES  = ['Routine checkup','Vaccine','Dental','Eye exam','Therapy','Ortho','Allergy','Blood test','Specialist'];

// ─── Date / time helpers ───────────────────────────────────────────────────────
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
export function fmtLocalDateTimeStamp(d: Date): string {
  return `${localDateStr(d)}T${fmtTime(d)}`;
}
export function fmtDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
export function fmtTimeDisplay(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
