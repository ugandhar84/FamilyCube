// Smart Hub — mock vendor adapter. Stands in for a real vendor (Ecobee's
// developer program is closed to new registrations; Honeywell/Resideo is
// the planned real vendor once wired up — see docs/smart-hub-mock-adapter.md)
// so the rest of the feature (schema, edge functions, UI, program editing,
// filter/maintenance reminders) is fully built and testable today.
//
// Deterministic, in-memory, per-Deno-isolate state — good enough to drive
// the UI end to end and demo the full flow, but state does NOT persist
// across edge function cold starts (a fresh isolate re-seeds from
// DEFAULT_DEVICES below). This is expected and documented; the mock's job
// is to prove the adapter interface and UI, not to be a real backing store.

import type {
  SmartHubAdapter, SmartHubTokens, SmartHubDeviceState, SmartHubProgram,
  SmartHubHold, SmartHubFilterInfo, SmartHubVendorDevice,
} from './adapter.ts';

const DEFAULT_DEVICES: SmartHubVendorDevice[] = [
  { vendorDeviceId: 'mock-thermostat-1', displayName: 'Downstairs Thermostat', deviceType: 'thermostat' },
];

const DEFAULT_STATE: SmartHubDeviceState = {
  mode: 'auto',
  currentTempF: 71,
  targetTempHeatF: 68,
  targetTempCoolF: 74,
  humidityPct: 45,
  fanRunning: false,
};

const DEFAULT_PROGRAM: SmartHubProgram = {
  periods: [
    { id: 'wake', name: 'Wake', days: ['mon', 'tue', 'wed', 'thu', 'fri'], startTime: '06:00', endTime: '08:30', targetTempHeatF: 70, targetTempCoolF: 74, fanMode: 'auto' },
    { id: 'away', name: 'Away', days: ['mon', 'tue', 'wed', 'thu', 'fri'], startTime: '08:30', endTime: '17:00', targetTempHeatF: 65, targetTempCoolF: 78, fanMode: 'auto' },
    { id: 'home', name: 'Home', days: ['mon', 'tue', 'wed', 'thu', 'fri'], startTime: '17:00', endTime: '22:00', targetTempHeatF: 70, targetTempCoolF: 74, fanMode: 'auto' },
    { id: 'sleep', name: 'Sleep', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], startTime: '22:00', endTime: '06:00', targetTempHeatF: 66, targetTempCoolF: 76, fanMode: 'auto' },
    { id: 'weekend', name: 'Weekend', days: ['sat', 'sun'], startTime: '06:00', endTime: '22:00', targetTempHeatF: 70, targetTempCoolF: 74, fanMode: 'auto' },
  ],
  holds: [],
};

// Per-Deno-isolate mock state, keyed by vendorDeviceId — see this file's
// own header comment on why this doesn't persist across cold starts.
const stateByDevice = new Map<string, SmartHubDeviceState>();
const programByDevice = new Map<string, SmartHubProgram>();

function seedDevice(vendorDeviceId: string) {
  if (!stateByDevice.has(vendorDeviceId)) stateByDevice.set(vendorDeviceId, structuredClone(DEFAULT_STATE));
  if (!programByDevice.has(vendorDeviceId)) programByDevice.set(vendorDeviceId, structuredClone(DEFAULT_PROGRAM));
}

export class MockSmartHubAdapter implements SmartHubAdapter {
  readonly vendor = 'mock';

  async refreshTokens(_refreshToken: string): Promise<SmartHubTokens> {
    // Mock tokens are never actually expired — always return a fresh-looking pair.
    return {
      accessToken: `mock-access-${crypto.randomUUID()}`,
      refreshToken: `mock-refresh-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  }

  async listDevices(): Promise<SmartHubVendorDevice[]> {
    for (const d of DEFAULT_DEVICES) seedDevice(d.vendorDeviceId);
    return DEFAULT_DEVICES;
  }

  async getDeviceState(vendorDeviceId: string): Promise<SmartHubDeviceState> {
    seedDevice(vendorDeviceId);
    return structuredClone(stateByDevice.get(vendorDeviceId)!);
  }

  async getProgram(vendorDeviceId: string): Promise<SmartHubProgram> {
    seedDevice(vendorDeviceId);
    return structuredClone(programByDevice.get(vendorDeviceId)!);
  }

  async setProgram(vendorDeviceId: string, program: SmartHubProgram): Promise<void> {
    seedDevice(vendorDeviceId);
    programByDevice.set(vendorDeviceId, structuredClone(program));
  }

  async setHold(vendorDeviceId: string, hold: Omit<SmartHubHold, 'id'>): Promise<SmartHubHold> {
    seedDevice(vendorDeviceId);
    const full: SmartHubHold = { ...hold, id: crypto.randomUUID() };
    const program = programByDevice.get(vendorDeviceId)!;
    program.holds.push(full);
    // A hold also updates the device's live target temps immediately —
    // matches a real thermostat's own behavior (setting a hold takes
    // effect right away, not just in the schedule).
    const state = stateByDevice.get(vendorDeviceId)!;
    if (hold.targetTempHeatF !== null) state.targetTempHeatF = hold.targetTempHeatF;
    if (hold.targetTempCoolF !== null) state.targetTempCoolF = hold.targetTempCoolF;
    return full;
  }

  async cancelHold(vendorDeviceId: string, holdId: string): Promise<void> {
    seedDevice(vendorDeviceId);
    const program = programByDevice.get(vendorDeviceId)!;
    program.holds = program.holds.filter(h => h.id !== holdId);
  }

  async getFilterInfo(vendorDeviceId: string): Promise<SmartHubFilterInfo> {
    seedDevice(vendorDeviceId);
    // Mock reports vendor-supported filter data so the "vendor" source
    // path (not just the manual fallback) is exercisable end to end —
    // a fixed 62% remaining, deterministic rather than random, so repeat
    // test runs behave consistently.
    return { supported: true, lifeRemainingPct: 62, raw: { runtimeHours: 1850, ratedHours: 3000 } };
  }
}
