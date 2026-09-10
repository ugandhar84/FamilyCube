// Smart Hub — vendor adapter interface. Every smart-device vendor
// (starting with a mock, then a real vendor like Honeywell/Resideo once
// credentials exist) implements this SAME interface, so no edge function
// or client code ever branches on which vendor a device belongs to —
// only the adapter registry (index.ts) picks the right implementation.
//
// See ../../../docs/smart-hub-mock-adapter.md for the full design write-up
// and how to add a real vendor adapter later.

export interface SmartHubTokens {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601 */
  expiresAt: string;
}

export interface SmartHubDeviceState {
  mode: 'heat' | 'cool' | 'auto' | 'off';
  currentTempF: number;
  targetTempHeatF: number | null;
  targetTempCoolF: number | null;
  humidityPct: number | null;
  fanRunning: boolean;
}

export interface SmartHubProgramPeriod {
  id: string;
  name: string;
  /** 'mon'..'sun' */
  days: string[];
  /** 24h "HH:MM" */
  startTime: string;
  endTime: string;
  targetTempHeatF: number | null;
  targetTempCoolF: number | null;
  fanMode: 'auto' | 'on';
}

export interface SmartHubHold {
  id: string;
  type: 'temporary' | 'until_next_period' | 'indefinite' | 'vacation';
  targetTempHeatF: number | null;
  targetTempCoolF: number | null;
  /** ISO 8601, null for indefinite */
  startsAt: string;
  endsAt: string | null;
}

export interface SmartHubProgram {
  periods: SmartHubProgramPeriod[];
  holds: SmartHubHold[];
}

export interface SmartHubFilterInfo {
  /** True when the vendor genuinely reports filter-life data (not every
   * vendor/device does — the caller falls back to a manual interval when
   * this is false). */
  supported: boolean;
  /** 0-100, only meaningful when supported is true. */
  lifeRemainingPct: number | null;
  /** Vendor's own raw runtime numbers, stored as-is for display/debugging
   * — never the field every reminder path reads (that's the
   * caller-computed next_due_date in smart_device_filter_tracking). */
  raw: Record<string, unknown>;
}

export interface SmartHubVendorDevice {
  vendorDeviceId: string;
  displayName: string;
  deviceType: string;
}

/**
 * One adapter instance per connected account (constructed with that
 * account's own tokens) — every method call is scoped to that account,
 * never takes a vendor/account identifier as a parameter.
 */
export interface SmartHubAdapter {
  readonly vendor: string;

  /** Exchanges a fresh refresh token for a new access token. */
  refreshTokens(refreshToken: string): Promise<SmartHubTokens>;

  /** Lists every device visible under this account. */
  listDevices(): Promise<SmartHubVendorDevice[]>;

  /** Current live state for one device. */
  getDeviceState(vendorDeviceId: string): Promise<SmartHubDeviceState>;

  /** Full normalized program/schedule for one device. */
  getProgram(vendorDeviceId: string): Promise<SmartHubProgram>;

  /** Replaces the ENTIRE program atomically — see
   * smart_device_programs' own migration comment on why this is a full
   * replace, not a per-period patch. */
  setProgram(vendorDeviceId: string, program: SmartHubProgram): Promise<void>;

  /** One-off setpoint/mode change, distinct from editing the program
   * itself — e.g. "make it 68 right now" without touching the schedule. */
  setHold(vendorDeviceId: string, hold: Omit<SmartHubHold, 'id'>): Promise<SmartHubHold>;

  /** Cancels an active hold, resuming the normal program. */
  cancelHold(vendorDeviceId: string, holdId: string): Promise<void>;

  /** Vendor-reported filter-life data, when the vendor/device supports it. */
  getFilterInfo(vendorDeviceId: string): Promise<SmartHubFilterInfo>;
}
