import { requireNativeModule } from 'expo-modules-core';

export interface WidgetPet {
  name: string;
  emoji: string;
  accentHex: string;
  streakDays: number;
  careProgress: number;   // 0.0 – 1.0
  nextApptTitle?: string | null;
  nextApptDate?: string | null;
  avatarFileName?: string | null; // local filename in App Group container
}

export interface WidgetPayload {
  enabled: boolean;
  pets: WidgetPet[];
  lastSyncedAt?: string; // ISO timestamp — lets widget show "Updated Xm ago"
}

let _mod: any = null;
let _loggedModuleWarning = false;
function mod() {
  if (!_mod) {
    try { _mod = requireNativeModule('WidgetData'); } catch (e) {
      _mod = null;
      if (!_loggedModuleWarning) {
        _loggedModuleWarning = true;
        console.error('[widget-data] ⚠️ Native module "WidgetData" not available:', (e as any)?.message);
      }
    }
  }
  return _mod;
}

/** Write pet data to App Group and reload widget timelines. No-ops on Android or simulator. */
export async function syncWidget(payload: WidgetPayload): Promise<void> {
  const m = mod();
  if (!m) {
    console.error('[widget-data] ❌ syncWidget: native module not loaded, cannot sync');
    return;
  }
  try {
    await m.syncWidget(JSON.stringify(payload));
    console.log('[widget-data] ✅ syncWidget: data written to App Group');
  } catch (e: any) {
    console.error('[widget-data] ❌ syncWidget native call failed:', {
      message: e?.message,
      code: e?.code,
      domain: e?.domain,
    });
  }
}

/** Clear the App Group and reset the widget to its disabled state. */
export async function clearWidget(): Promise<void> {
  const m = mod();
  if (!m) return;
  try { await m.clearWidget(); } catch {}
}

/** Download a pet avatar and save it to the App Group container. Returns the filename. */
export async function saveAvatarToGroup(petId: string, url: string): Promise<string | null> {
  const m = mod();
  if (!m) return null;
  try {
    return await m.saveAvatarToGroup(petId, url);
  } catch (e: any) {
    if (__DEV__) console.warn('[widget-data] saveAvatarToGroup failed:', e?.message);
    return null;
  }
}

/** Schedule a BGAppRefreshTask so the widget updates even when the app is in the background. */
export async function scheduleBackgroundRefresh(): Promise<void> {
  const m = mod();
  if (!m) return;
  try { await m.scheduleBackgroundRefresh(); } catch {}
}
