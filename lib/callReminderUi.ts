import { Platform } from 'react-native';

/**
 * Whether forms show the "Call to remind" control. On iPhone/iPad the call-style ring (VoIP/CallKit) is switched off for App Review (2.5.4),
 * so the control is hidden there: reminders are delivered as time-sensitive push notifications instead, and the setting stays at its default.
 * Android keeps the control. Set EXPO_PUBLIC_FC_VOIP=1 (with the build flag FC_ENABLE_VOIP=1) to show it on iOS again.
 */
export const SHOW_CALL_REMINDER = Platform.OS !== 'ios' || process.env.EXPO_PUBLIC_FC_VOIP === '1';
