import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type EventType = 'event' | 'reminder' | 'appointment' | 'birthday';

export type DriverStatus = 'pending' | 'confirmed' | 'rejected';

export interface FamilyEvent {
  id: string;
  title: string;
  date: string;           // YYYY-MM-DD
  time?: string;          // HH:MM (24h)
  endTime?: string;
  memberId?: string;      // whose event (undefined = whole family)
  type: EventType;
  color?: string;
  location?: string;
  notes?: string;
  allDay?: boolean;
  category?: string;      // Medical | Work | Sports | School | Study | Event
  driver?: string;        // display name of assigned driver/tutor
  driverStatus?: DriverStatus;
  declineReason?: string;
  declinedBy?: string;
  driverRequestedBy?: string; // who originally requested the ride (display name)
  taskOwner?: string;         // display name of person who owns this task
  conflict?: boolean;         // scheduling conflict flag
  approvalPending?: boolean;  // kid-requested, awaiting parent approval
}

interface EventState {
  events: FamilyEvent[];
  loaded: boolean;
  loadFromStorage: () => Promise<void>;
  addEvent: (e: Omit<FamilyEvent, 'id'>) => void;
  updateEvent: (id: string, updates: Partial<FamilyEvent>) => void;
  deleteEvent: (id: string) => void;
}

const KEY = '@familycube_events_v5';

// Use local date components to avoid UTC-shift timezone bugs
function localDateStr(offset: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Called fresh each time so dates are always relative to "now", never stale
function makeSeed(): FamilyEvent[] {
  const d = localDateStr;
  return [
    { id: 'e1',  title: 'Dentist appointment', date: d(0), time: '10:00', memberId: 'kid-1',    type: 'appointment', color: '#EF4444', category: 'Medical',  location: 'Dr. Smith Clinic' },
    { id: 'e2',  title: 'Soccer practice',     date: d(0), time: '15:30', memberId: 'kid-1',    type: 'event',       color: '#10B981', category: 'Sports',   driver: 'Priya (Mom)', driverStatus: 'confirmed', location: 'Riverside Park' },
    { id: 'e3',  title: 'Math tutoring',       date: d(0), time: '17:00', memberId: 'kid-2',    type: 'event',       color: '#6C5CE7', category: 'School',   location: 'Home — zoom with Mr. Kumar', conflict: true },
    { id: 'e4',  title: 'Family game night',   date: d(0), time: '19:00',                        type: 'event',       color: '#6C5CE7', category: 'Event' },
    { id: 'e5',  title: 'Grocery run',         date: d(1), time: '11:00', memberId: 'parent-1', type: 'reminder',    color: '#3B82F6', category: 'Work' },
    { id: 'e6',  title: 'Soccer tournament',   date: d(1), time: '09:00', memberId: 'kid-1',    type: 'event',       color: '#10B981', category: 'Sports',   driver: 'Alex (Dad)',  driverStatus: 'confirmed', location: 'City Stadium' },
    { id: 'e7',  title: "Leo's Birthday 🎂",   date: d(3), allDay: true,  memberId: 'kid-1',    type: 'birthday',    color: '#F59E0B', category: 'Event' },
    { id: 'e8',  title: 'Work presentation',   date: d(2), time: '09:30', memberId: 'parent-1', type: 'appointment', color: '#9D4EDD', category: 'Work',     location: 'Office HQ' },
    { id: 'e9',  title: "Maya's Piano lesson", date: d(2), time: '16:00', memberId: 'kid-2',    type: 'event',       color: '#F59E0B', category: 'School',   driver: 'Grandma Mary', driverStatus: 'confirmed', location: 'Music Academy' },
    { id: 'e10', title: 'Vaccine checkup',     date: d(4), time: '11:00', memberId: 'kid-3',    type: 'appointment', color: '#EF4444', category: 'Medical',  location: 'Pediatric Center' },
    { id: 'e11', title: 'Ride to chess club',  date: d(0), time: '14:00', memberId: 'kid-1',    type: 'event',       color: '#F59E0B', category: 'School',   driver: 'Grandma Mary', driverStatus: 'rejected', declineReason: 'Vehicle unavailable today', declinedBy: 'Grandma Mary', driverRequestedBy: 'Priya (Mom)' },
    { id: 'e12', title: 'Ride to art class',   date: d(0), time: '16:30', memberId: 'kid-2',    type: 'event',       color: '#EC4899', category: 'School',   approvalPending: true, driverRequestedBy: 'Maya (Kid)' , location: 'Arts Center', notes: 'Please pick me up after school' },
  ];
}

const save = (events: FamilyEvent[]) => AsyncStorage.setItem(KEY, JSON.stringify(events));

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  loaded: false,

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const seed = makeSeed();
      const events = raw ? JSON.parse(raw) as FamilyEvent[] : seed;
      if (!raw) save(seed);
      set({ events, loaded: true });
    } catch { set({ events: makeSeed(), loaded: true }); }
  },

  addEvent: (e) => {
    const event: FamilyEvent = { ...e, id: 'ev' + Date.now() };
    const next = [...get().events, event].sort((a, b) => a.date.localeCompare(b.date));
    set({ events: next }); save(next);
  },

  updateEvent: (id, updates) => {
    const next = get().events.map(e => e.id === id ? { ...e, ...updates } : e);
    set({ events: next }); save(next);
  },

  deleteEvent: (id) => {
    const next = get().events.filter(e => e.id !== id);
    set({ events: next }); save(next);
  },
}));
