/**
 * smartHubStore — parent-only smart-home devices (thermostats today,
 * device_type is deliberately open-ended for more later): connected
 * vendor accounts, per-device live state/program, filter-change tracking,
 * and general manual maintenance reminders.
 *
 * All writes go through edge functions (smart-device-connect/-sync/
 * -control/-program) which enforce parent-only + call the vendor adapter;
 * this store only reads tables directly and calls those functions —
 * see docs/smart-hub-mock-adapter.md for the adapter design.
 */
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SmartHubProgramPeriod = {
  id: string;
  name: string;
  days: string[];
  startTime: string;
  endTime: string;
  targetTempHeatF: number | null;
  targetTempCoolF: number | null;
  fanMode: 'auto' | 'on';
};

export type SmartHubHold = {
  id: string;
  type: 'temporary' | 'until_next_period' | 'indefinite' | 'vacation';
  targetTempHeatF: number | null;
  targetTempCoolF: number | null;
  startsAt: string;
  endsAt: string | null;
};

export type SmartHubProgram = {
  periods: SmartHubProgramPeriod[];
  holds: SmartHubHold[];
};

export type SmartDeviceState = {
  mode: 'heat' | 'cool' | 'auto' | 'off';
  currentTempF: number;
  targetTempHeatF: number | null;
  targetTempCoolF: number | null;
  humidityPct: number | null;
  fanRunning: boolean;
};

export interface SmartDeviceAccount {
  id: string;
  familyId: string;
  vendor: string;
  connectedBy: string;
  vendorAccountLabel?: string;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  lastError?: string;
  createdAt: string;
}

export interface SmartDevice {
  id: string;
  accountId: string;
  familyId: string;
  vendorDeviceId: string;
  deviceType: string;
  displayName: string;
  lastState?: SmartDeviceState;
  lastSyncedAt?: string;
}

export interface SmartDeviceFilterTracking {
  deviceId: string;
  familyId: string;
  source: 'vendor' | 'manual';
  manualIntervalDays?: number;
  nextDueDate?: string;
  vendorRuntimeData?: Record<string, unknown>;
}

export interface SmartDeviceMaintenanceReminder {
  id: string;
  deviceId: string;
  familyId: string;
  title: string;
  notes?: string;
  dueDate: string;
  recurEveryDays?: number;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
}

interface SmartHubState {
  accounts: SmartDeviceAccount[];
  devices: SmartDevice[];
  programs: Record<string, SmartHubProgram>; // deviceId -> program
  filterTracking: Record<string, SmartDeviceFilterTracking>; // deviceId -> tracking
  reminders: SmartDeviceMaintenanceReminder[];
  isLoading: boolean;
  isSyncing: boolean;

  loadAll: (familyId: string) => Promise<void>;
  connectAccount: (params: { memberId: string; vendor?: string; label?: string }) => Promise<{ error?: string }>;
  syncNow: (familyId: string) => Promise<{ error?: string }>;
  setHold: (params: {
    memberId: string;
    deviceId: string;
    hold: { type: SmartHubHold['type']; targetTempHeatF: number | null; targetTempCoolF: number | null; startsAt: string; endsAt: string | null };
  }) => Promise<{ error?: string }>;
  cancelHold: (params: { memberId: string; deviceId: string; holdId: string }) => Promise<{ error?: string }>;
  saveProgram: (params: { memberId: string; deviceId: string; program: SmartHubProgram }) => Promise<{ error?: string }>;

  setManualFilterInterval: (params: { familyId: string; deviceId: string; intervalDays: number }) => Promise<{ error?: string }>;

  addMaintenanceReminder: (params: Omit<SmartDeviceMaintenanceReminder, 'id' | 'createdAt' | 'completedAt'>) => Promise<{ error?: string }>;
  updateMaintenanceReminder: (id: string, patch: Partial<Pick<SmartDeviceMaintenanceReminder, 'title' | 'notes' | 'dueDate' | 'recurEveryDays'>>) => Promise<{ error?: string }>;
  completeMaintenanceReminder: (id: string) => Promise<{ error?: string }>;
  deleteMaintenanceReminder: (id: string) => Promise<{ error?: string }>;
}

function mapAccount(row: any): SmartDeviceAccount {
  return {
    id: row.id,
    familyId: row.family_id,
    vendor: row.vendor,
    connectedBy: row.connected_by,
    vendorAccountLabel: row.vendor_account_label ?? undefined,
    status: row.status,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
  };
}

function mapDevice(row: any): SmartDevice {
  return {
    id: row.id,
    accountId: row.account_id,
    familyId: row.family_id,
    vendorDeviceId: row.vendor_device_id,
    deviceType: row.device_type,
    displayName: row.display_name,
    lastState: row.last_state ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
  };
}

function mapFilterTracking(row: any): SmartDeviceFilterTracking {
  return {
    deviceId: row.device_id,
    familyId: row.family_id,
    source: row.source,
    manualIntervalDays: row.manual_interval_days ?? undefined,
    nextDueDate: row.next_due_date ?? undefined,
    vendorRuntimeData: row.vendor_runtime_data ?? undefined,
  };
}

function mapReminder(row: any): SmartDeviceMaintenanceReminder {
  return {
    id: row.id,
    deviceId: row.device_id,
    familyId: row.family_id,
    title: row.title,
    notes: row.notes ?? undefined,
    dueDate: row.due_date,
    recurEveryDays: row.recur_every_days ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const useSmartHubStore = create<SmartHubState>((set, get) => ({
  accounts: [],
  devices: [],
  programs: {},
  filterTracking: {},
  reminders: [],
  isLoading: false,
  isSyncing: false,

  loadAll: async (familyId: string) => {
    set({ isLoading: true });
    try {
      const [accountsRes, devicesRes, programsRes, filterRes, remindersRes] = await Promise.all([
        supabase.from('smart_device_accounts').select('*').eq('family_id', familyId),
        supabase.from('smart_devices').select('*').eq('family_id', familyId),
        supabase.from('smart_device_programs').select('*').eq('family_id', familyId),
        supabase.from('smart_device_filter_tracking').select('*').eq('family_id', familyId),
        supabase.from('smart_device_maintenance_reminders').select('*').eq('family_id', familyId).order('due_date', { ascending: true }),
      ]);

      const programs: Record<string, SmartHubProgram> = {};
      for (const row of programsRes.data ?? []) programs[row.device_id] = row.program;

      const filterTracking: Record<string, SmartDeviceFilterTracking> = {};
      for (const row of filterRes.data ?? []) filterTracking[row.device_id] = mapFilterTracking(row);

      set({
        accounts: (accountsRes.data ?? []).map(mapAccount),
        devices: (devicesRes.data ?? []).map(mapDevice),
        programs,
        filterTracking,
        reminders: (remindersRes.data ?? []).map(mapReminder),
        isLoading: false,
      });
    } catch (e: any) {
      console.warn('[smartHubStore] loadAll failed:', e?.message);
      set({ isLoading: false });
    }
  },

  connectAccount: async ({ memberId, vendor, label }) => {
    const { data, error } = await supabase.functions.invoke('smart-device-connect', {
      body: { memberId, vendor, label },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    set(s => ({
      accounts: [...s.accounts, mapAccount(data.account)],
      devices: [...s.devices, ...((data.devices ?? []).map(mapDevice))],
    }));
    return {};
  },

  syncNow: async (familyId: string) => {
    set({ isSyncing: true });
    try {
      const { data, error } = await supabase.functions.invoke('smart-device-sync', { body: { familyId } });
      if (error) return { error: error.message };
      if (data?.error) return { error: data.error };
      await get().loadAll(familyId);
      return {};
    } finally {
      set({ isSyncing: false });
    }
  },

  setHold: async ({ memberId, deviceId, hold }) => {
    const { data, error } = await supabase.functions.invoke('smart-device-control', {
      body: { memberId, deviceId, action: 'set_hold', hold },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    set(s => ({
      devices: s.devices.map(d => d.id === deviceId ? { ...d, lastState: data.state } : d),
    }));
    return {};
  },

  cancelHold: async ({ memberId, deviceId, holdId }) => {
    const { data, error } = await supabase.functions.invoke('smart-device-control', {
      body: { memberId, deviceId, action: 'cancel_hold', holdId },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return {};
  },

  saveProgram: async ({ memberId, deviceId, program }) => {
    const { data, error } = await supabase.functions.invoke('smart-device-program', {
      body: { memberId, deviceId, program },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    set(s => ({ programs: { ...s.programs, [deviceId]: data.program.program } }));
    return {};
  },

  setManualFilterInterval: async ({ familyId, deviceId, intervalDays }) => {
    const nextDue = new Date(Date.now() + intervalDays * 24 * 3600_000).toISOString().slice(0, 10);
    const { data, error } = await supabase.from('smart_device_filter_tracking').upsert({
      device_id: deviceId, family_id: familyId,
      source: 'manual', manual_interval_days: intervalDays, next_due_date: nextDue,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'device_id' }).select().single();
    if (error) return { error: error.message };
    set(s => ({ filterTracking: { ...s.filterTracking, [deviceId]: mapFilterTracking(data) } }));
    return {};
  },

  addMaintenanceReminder: async (params) => {
    const { data, error } = await supabase.from('smart_device_maintenance_reminders').insert({
      device_id: params.deviceId, family_id: params.familyId,
      title: params.title, notes: params.notes ?? null,
      due_date: params.dueDate, recur_every_days: params.recurEveryDays ?? null,
      created_by: params.createdBy,
    }).select().single();
    if (error) return { error: error.message };
    set(s => ({ reminders: [...s.reminders, mapReminder(data)].sort((a, b) => a.dueDate.localeCompare(b.dueDate)) }));
    return {};
  },

  updateMaintenanceReminder: async (id, patch) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate;
    if (patch.recurEveryDays !== undefined) dbPatch.recur_every_days = patch.recurEveryDays;
    const { data, error } = await supabase.from('smart_device_maintenance_reminders').update(dbPatch).eq('id', id).select().single();
    if (error) return { error: error.message };
    set(s => ({ reminders: s.reminders.map(r => r.id === id ? mapReminder(data) : r) }));
    return {};
  },

  completeMaintenanceReminder: async (id: string) => {
    const reminder = get().reminders.find(r => r.id === id);
    if (!reminder) return { error: 'Reminder not found' };

    if (reminder.recurEveryDays) {
      // Recurring: push due_date forward and clear completedAt rather than
      // marking it done forever — matches how other recurring reminders in
      // this app behave (a completed one-off just gets completed_at set).
      const nextDue = new Date(new Date(reminder.dueDate).getTime() + reminder.recurEveryDays * 24 * 3600_000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from('smart_device_maintenance_reminders')
        .update({ due_date: nextDue, completed_at: null }).eq('id', id).select().single();
      if (error) return { error: error.message };
      set(s => ({ reminders: s.reminders.map(r => r.id === id ? mapReminder(data) : r) }));
      return {};
    }

    const { data, error } = await supabase.from('smart_device_maintenance_reminders')
      .update({ completed_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) return { error: error.message };
    set(s => ({ reminders: s.reminders.map(r => r.id === id ? mapReminder(data) : r) }));
    return {};
  },

  deleteMaintenanceReminder: async (id: string) => {
    const { error } = await supabase.from('smart_device_maintenance_reminders').delete().eq('id', id);
    if (error) return { error: error.message };
    set(s => ({ reminders: s.reminders.filter(r => r.id !== id) }));
    return {};
  },
}));
