import { create } from 'zustand';
import { todayLocal, localDateStr } from '@/lib/dates';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type LunchPeriod = 'A' | 'B' | 'C' | 'D';
export type Semester    = 'Fall' | 'Spring' | 'Summer' | 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4';
export type DayType     = 'Regular' | 'Block-A' | 'Block-B' | 'Half-Day' | 'No School' | 'Early Release' | 'Late Start';
export type HomeworkStatus = 'todo' | 'in_progress' | 'done' | 'overdue';
export type HomeworkPriority = 'low' | 'medium' | 'high';

export interface ClassPeriod {
  id:         string;
  period:     number;      // 0 = lunch/break, 1–8 = period numbers
  subject:    string;
  room:       string;
  teacher?:   string;
  startTime:  string;      // 'HH:MM' 24h
  endTime:    string;
  isLunch?:   boolean;
  isBreak?:   boolean;
  gradeLevel?: string;     // e.g. '7th Grade', 'AP'
  notes?:     string;
}

export interface Homework {
  id:                  string;
  memberId:            string;
  subject:             string;
  title:               string;
  description?:        string;
  dueDate:             string;   // ISO date YYYY-MM-DD
  estimatedMinutes?:   number;
  priority:            HomeworkPriority;
  status:              HomeworkStatus;
  createdAt:           string;
  startedAt?:          string;
  completedAt?:        string;
  periodId?:           string;   // link to the class period for context
  questId?:            string;   // if linked to a homework quest
  attachmentUrls?:     string[];
}

export interface KidSchedule {
  memberId:    string;
  memberName:  string;
  semester:    Semester;
  year:        number;
  gradeYear?:  string;       // e.g. '7th Grade'
  school?:     string;       // school name
  lunchPeriod: LunchPeriod;
  dayType:     DayType;
  periods:     ClassPeriod[];
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface SchoolState {
  schedules:  KidSchedule[];
  homeworks:  Homework[];
  loaded:     boolean;

  loadFromStorage: () => Promise<void>;

  // Schedule CRUD
  addSchedule:    (schedule: KidSchedule) => void;
  updateSchedule: (memberId: string, updates: Partial<KidSchedule>) => void;
  removeSchedule: (memberId: string) => void;

  // Period CRUD
  addPeriod:      (memberId: string, period: Omit<ClassPeriod, 'id'>) => void;
  updatePeriod:   (memberId: string, periodId: string, updates: Partial<Omit<ClassPeriod, 'id'>>) => void;
  deletePeriod:   (memberId: string, periodId: string) => void;
  reorderPeriods: (memberId: string, periods: ClassPeriod[]) => void;

  // Homework CRUD
  addHomework:    (hw: Omit<Homework, 'id' | 'createdAt' | 'status'>) => Homework;
  updateHomework: (id: string, updates: Partial<Omit<Homework, 'id' | 'createdAt'>>) => void;
  deleteHomework: (id: string) => void;
  markHomeworkDone:   (id: string) => void;
  markHomeworkStarted:(id: string) => void;
  getHomeworkForMember: (memberId: string) => Homework[];
  getOverdueHomework: (memberId: string) => Homework[];
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const today    = todayLocal();
const tomorrow = localDateStr(new Date(Date.now() + 86400_000));

const SEED_SCHEDULES: KidSchedule[] = [
  {
    memberId: 'kid-1', memberName: 'Leo',
    semester: 'Fall', year: 2026, gradeYear: '7th Grade', school: 'Riverside Middle School',
    lunchPeriod: 'B', dayType: 'Regular',
    periods: [
      { id: 'p1', period: 1, subject: 'Math',       room: 'B-204', teacher: 'Mr. Thompson',  startTime: '08:00', endTime: '08:50', gradeLevel: '7th' },
      { id: 'p2', period: 2, subject: 'English',    room: 'A-112', teacher: 'Ms. Rivera',    startTime: '08:55', endTime: '09:45' },
      { id: 'p3', period: 3, subject: 'Science',    room: 'C-301', teacher: 'Dr. Patel',     startTime: '09:50', endTime: '10:40', gradeLevel: 'Advanced' },
      { id: 'p4', period: 0, subject: 'Lunch B',    room: 'Cafeteria',                        startTime: '10:45', endTime: '11:15', isLunch: true },
      { id: 'p5', period: 4, subject: 'History',    room: 'A-108', teacher: 'Mr. Davis',     startTime: '11:20', endTime: '12:10' },
      { id: 'p6', period: 5, subject: 'PE',         room: 'Gym',   teacher: 'Coach Kim',     startTime: '12:15', endTime: '13:05' },
      { id: 'p7', period: 6, subject: 'Spanish',    room: 'B-110', teacher: 'Señora Lopez',  startTime: '13:10', endTime: '14:00' },
      { id: 'p8', period: 7, subject: 'Study Hall', room: 'Library',                          startTime: '14:05', endTime: '14:55' },
    ],
  },
  {
    memberId: 'kid-2', memberName: 'Maya',
    semester: 'Fall', year: 2026, gradeYear: '5th Grade', school: 'Riverside Elementary',
    lunchPeriod: 'A', dayType: 'Regular',
    periods: [
      { id: 'm1', period: 1, subject: 'Art',            room: 'D-101', teacher: 'Ms. Chen',     startTime: '08:00', endTime: '08:50' },
      { id: 'm2', period: 2, subject: 'Math',           room: 'B-206', teacher: 'Ms. Williams', startTime: '08:55', endTime: '09:45' },
      { id: 'm3', period: 0, subject: 'Lunch A',        room: 'Cafeteria',                       startTime: '09:50', endTime: '10:20', isLunch: true },
      { id: 'm4', period: 3, subject: 'Reading',        room: 'A-114', teacher: 'Mr. Johnson',  startTime: '10:25', endTime: '11:15' },
      { id: 'm5', period: 4, subject: 'Science',        room: 'C-302', teacher: 'Dr. Patel',    startTime: '11:20', endTime: '12:10' },
      { id: 'm6', period: 5, subject: 'Music',          room: 'E-201', teacher: 'Mr. Garcia',   startTime: '12:15', endTime: '13:05' },
      { id: 'm7', period: 6, subject: 'Social Studies', room: 'A-110', teacher: 'Ms. Brown',    startTime: '13:10', endTime: '14:00' },
    ],
  },
];

const SEED_HOMEWORKS: Homework[] = [
  {
    id: 'hw1', memberId: 'kid-1', subject: 'Math', title: 'Chapter 4 Problems',
    description: 'Problems 1-20 on page 87', dueDate: today, estimatedMinutes: 30,
    priority: 'high', status: 'todo', createdAt: today, periodId: 'p1',
  },
  {
    id: 'hw2', memberId: 'kid-1', subject: 'Science', title: 'Lab Report Write-Up',
    description: 'Summarize the ecosystem experiment results', dueDate: tomorrow,
    estimatedMinutes: 45, priority: 'medium', status: 'in_progress', createdAt: today,
    startedAt: today, periodId: 'p3',
  },
  {
    id: 'hw3', memberId: 'kid-2', subject: 'Reading', title: 'Read Ch. 5-7',
    dueDate: today, estimatedMinutes: 20, priority: 'medium', status: 'todo', createdAt: today, periodId: 'm4',
  },
];

// ─── Persistence ──────────────────────────────────────────────────────────────

const SCHED_KEY = '@familycube_school_schedules_v2';
const HW_KEY    = '@familycube_school_homeworks_v2';

const save = (schedules: KidSchedule[], homeworks: Homework[]) => {
  AsyncStorage.setItem(SCHED_KEY, JSON.stringify(schedules));
  AsyncStorage.setItem(HW_KEY,    JSON.stringify(homeworks));
};

// ─── Subject color palette ────────────────────────────────────────────────────

const SUBJECT_COLORS: Record<string, string> = {
  Math:             '#6366F1',
  English:          '#3B82F6',
  Science:          '#10B981',
  History:          '#F59E0B',
  PE:               '#EF4444',
  Spanish:          '#EC4899',
  French:           '#F43F5E',
  German:           '#E879F9',
  Art:              '#8B5CF6',
  Music:            '#F97316',
  Reading:          '#14B8A6',
  'Social Studies': '#84CC16',
  'Study Hall':     '#94A3B8',
  Technology:       '#0EA5E9',
  Drama:            '#A855F7',
  'Lunch A':        '#F59E0B',
  'Lunch B':        '#F59E0B',
  'Lunch C':        '#F59E0B',
  'Lunch D':        '#F59E0B',
};

export function subjectColor(subject: string): string {
  return SUBJECT_COLORS[subject] ?? '#6366F1';
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSchoolStore = create<SchoolState>((set, get) => ({
  schedules: SEED_SCHEDULES,
  homeworks: SEED_HOMEWORKS,
  loaded:    false,

  loadFromStorage: async () => {
    try {
      const [sRaw, hwRaw] = await Promise.all([
        AsyncStorage.getItem(SCHED_KEY),
        AsyncStorage.getItem(HW_KEY),
      ]);
      const schedules = sRaw  ? (JSON.parse(sRaw)  as KidSchedule[]) : SEED_SCHEDULES;
      const homeworks = hwRaw ? (JSON.parse(hwRaw) as Homework[])    : SEED_HOMEWORKS;
      if (!sRaw)  AsyncStorage.setItem(SCHED_KEY, JSON.stringify(SEED_SCHEDULES));
      if (!hwRaw) AsyncStorage.setItem(HW_KEY,    JSON.stringify(SEED_HOMEWORKS));
      set({ schedules, homeworks, loaded: true });
    } catch {
      set({ schedules: SEED_SCHEDULES, homeworks: SEED_HOMEWORKS, loaded: true });
    }
  },

  // ─── Schedule CRUD ──────────────────────────────────────────────────────────

  addSchedule: (schedule) => {
    const next = [...get().schedules.filter(s => s.memberId !== schedule.memberId), schedule];
    set({ schedules: next }); save(next, get().homeworks);
  },

  updateSchedule: (memberId, updates) => {
    const next = get().schedules.map(s => s.memberId === memberId ? { ...s, ...updates } : s);
    set({ schedules: next }); save(next, get().homeworks);
  },

  removeSchedule: (memberId) => {
    const next = get().schedules.filter(s => s.memberId !== memberId);
    set({ schedules: next }); save(next, get().homeworks);
  },

  // ─── Period CRUD ────────────────────────────────────────────────────────────

  addPeriod: (memberId, period) => {
    const next = get().schedules.map(s =>
      s.memberId !== memberId ? s : {
        ...s,
        periods: [...s.periods, { ...period, id: 'p' + Date.now() }]
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }
    );
    set({ schedules: next }); save(next, get().homeworks);
  },

  updatePeriod: (memberId, periodId, updates) => {
    const next = get().schedules.map(s =>
      s.memberId !== memberId ? s : {
        ...s, periods: s.periods.map(p => p.id === periodId ? { ...p, ...updates } : p),
      }
    );
    set({ schedules: next }); save(next, get().homeworks);
  },

  deletePeriod: (memberId, periodId) => {
    const next = get().schedules.map(s =>
      s.memberId !== memberId ? s : { ...s, periods: s.periods.filter(p => p.id !== periodId) }
    );
    set({ schedules: next }); save(next, get().homeworks);
  },

  reorderPeriods: (memberId, periods) => {
    const next = get().schedules.map(s => s.memberId === memberId ? { ...s, periods } : s);
    set({ schedules: next }); save(next, get().homeworks);
  },

  // ─── Homework CRUD ──────────────────────────────────────────────────────────

  addHomework: (hw) => {
    const homework: Homework = {
      ...hw, id: 'hw' + Date.now(), createdAt: new Date().toISOString(), status: 'todo',
    };
    const next = [...get().homeworks, homework];
    set({ homeworks: next }); save(get().schedules, next);
    return homework;
  },

  updateHomework: (id, updates) => {
    const next = get().homeworks.map(h => h.id === id ? { ...h, ...updates } : h);
    set({ homeworks: next }); save(get().schedules, next);
  },

  deleteHomework: (id) => {
    const next = get().homeworks.filter(h => h.id !== id);
    set({ homeworks: next }); save(get().schedules, next);
  },

  markHomeworkDone: (id) => {
    const now = new Date().toISOString();
    const next = get().homeworks.map(h =>
      h.id === id ? { ...h, status: 'done' as HomeworkStatus, completedAt: now } : h
    );
    set({ homeworks: next }); save(get().schedules, next);
  },

  markHomeworkStarted: (id) => {
    const now = new Date().toISOString();
    const next = get().homeworks.map(h =>
      h.id === id ? { ...h, status: 'in_progress' as HomeworkStatus, startedAt: now } : h
    );
    set({ homeworks: next }); save(get().schedules, next);
  },

  getHomeworkForMember: (memberId) => get().homeworks.filter(h => h.memberId === memberId),

  getOverdueHomework: (memberId) => {
    const today    = todayLocal();
    return get().homeworks.filter(h =>
      h.memberId === memberId && h.status !== 'done' && h.dueDate < today
    );
  },
}));
