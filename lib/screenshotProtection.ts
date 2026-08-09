import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenCapture from 'expo-screen-capture';

const KEY = 'screenshot_protection_enabled';

export async function isScreenshotProtectionEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEY);
  return val === 'true'; // default OFF (screenshots allowed)
}

export async function setScreenshotProtection(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, enabled ? 'true' : 'false');
  if (enabled) {
    await ScreenCapture.preventScreenCaptureAsync();
  } else {
    await ScreenCapture.allowScreenCaptureAsync();
  }
}

export async function applyScreenshotProtection(): Promise<void> {
  const enabled = await isScreenshotProtectionEnabled();
  if (enabled) {
    await ScreenCapture.preventScreenCaptureAsync();
  }
}
