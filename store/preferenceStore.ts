import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export type PetSwitchStyle = 'bottom-sheet' | 'dropdown' | 'carousel';
export type NotificationRadius = 3 | 5 | 10;
export type Country = 'US' | 'IN';

interface PreferenceStore {
  petSwitchStyle: PetSwitchStyle;
  setPetSwitchStyle: (style: PetSwitchStyle) => void;
  sosNotificationRadius: NotificationRadius;
  setSOSNotificationRadius: (radius: NotificationRadius) => void;
  country: Country;
  setCountry: (country: Country) => void;
  // care
  notifDaily: boolean;
  setNotifDaily: (val: boolean) => void;
  notifHealth: boolean;
  setNotifHealth: (val: boolean) => void;
  notifAppointment: boolean;
  setNotifAppointment: (val: boolean) => void;
  // social
  notifLost: boolean;
  setNotifLost: (val: boolean) => void;
  notifFamily: boolean;
  setNotifFamily: (val: boolean) => void;
  notifPlaydate: boolean;
  setNotifPlaydate: (val: boolean) => void;
  notifChat: boolean;
  setNotifChat: (val: boolean) => void;
  notifEvent: boolean;
  setNotifEvent: (val: boolean) => void;
  // social feed
  notifPostLike: boolean;
  setNotifPostLike: (val: boolean) => void;
  notifPostComment: boolean;
  setNotifPostComment: (val: boolean) => void;
  notifFollow: boolean;
  setNotifFollow: (val: boolean) => void;
  notifMention: boolean;
  setNotifMention: (val: boolean) => void;
  // quiet hours
  quietHoursEnabled: boolean;
  setQuietHoursEnabled: (val: boolean) => void;
  quietHoursStart: string;
  setQuietHoursStart: (val: string) => void;
  quietHoursEnd: string;
  setQuietHoursEnd: (val: string) => void;
  loadPreferences: () => Promise<void>;
  reset: () => void;
}

async function saveToCache(key: string, value: string) {
  try { await AsyncStorage.setItem(key, value); } catch {}
}

async function saveToDB(patch: Record<string, string | number | boolean>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('profiles').update(patch).eq('id', user.id);
}

function makeBoolSetter(key: string, dbKey: string) {
  return async (val: boolean) => {
    usePreferenceStore.setState({ [key]: val } as any);
    saveToCache(key, String(val));
    saveToDB({ [dbKey]: val });
  };
}

export const usePreferenceStore = create<PreferenceStore>((set, get) => ({
  petSwitchStyle: 'bottom-sheet',
  sosNotificationRadius: 10,
  country: 'US',
  notifDaily: true,
  notifHealth: true,
  notifAppointment: true,
  notifLost: true,
  notifFamily: true,
  notifPlaydate: true,
  notifChat: true,
  notifEvent: true,
  notifPostLike: true,
  notifPostComment: true,
  notifFollow: true,
  notifMention: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',

  setPetSwitchStyle: async (style) => {
    set({ petSwitchStyle: style });
    saveToCache('petSwitchStyle', style);
    saveToDB({ pet_switch_style: style });
  },

  setSOSNotificationRadius: async (radius) => {
    set({ sosNotificationRadius: radius });
    saveToCache('sosNotificationRadius', String(radius));
    saveToDB({ sos_radius: radius });
  },

  setCountry: async (country) => {
    set({ country });
    saveToCache('country', country);
    saveToDB({ country });
  },

  setNotifDaily:       async (val) => { set({ notifDaily: val });       saveToCache('notifDaily', String(val));       saveToDB({ notif_daily: val }); },
  setNotifHealth:      async (val) => { set({ notifHealth: val });      saveToCache('notifHealth', String(val));      saveToDB({ notif_health: val }); },
  setNotifAppointment: async (val) => { set({ notifAppointment: val }); saveToCache('notifAppointment', String(val)); saveToDB({ notif_appointment: val }); },
  setNotifLost:        async (val) => { set({ notifLost: val });        saveToCache('notifLost', String(val));        saveToDB({ notif_lost: val }); },
  setNotifFamily:      async (val) => { set({ notifFamily: val });      saveToCache('notifFamily', String(val));      saveToDB({ notif_family: val }); },
  setNotifPlaydate:    async (val) => { set({ notifPlaydate: val });    saveToCache('notifPlaydate', String(val));    saveToDB({ notif_playdate: val }); },
  setNotifChat:        async (val) => { set({ notifChat: val });        saveToCache('notifChat', String(val));        saveToDB({ notif_chat: val }); },
  setNotifEvent:       async (val) => { set({ notifEvent: val });       saveToCache('notifEvent', String(val));       saveToDB({ notif_event: val }); },
  setNotifPostLike:    async (val) => { set({ notifPostLike: val });    saveToCache('notifPostLike', String(val));    saveToDB({ notif_post_like: val }); },
  setNotifPostComment: async (val) => { set({ notifPostComment: val }); saveToCache('notifPostComment', String(val)); saveToDB({ notif_post_comment: val }); },
  setNotifFollow:      async (val) => { set({ notifFollow: val });      saveToCache('notifFollow', String(val));      saveToDB({ notif_follow: val }); },
  setNotifMention:     async (val) => { set({ notifMention: val });     saveToCache('notifMention', String(val));     saveToDB({ notif_mention: val }); },

  setQuietHoursEnabled: async (val) => { set({ quietHoursEnabled: val }); saveToCache('quietHoursEnabled', String(val)); saveToDB({ quiet_hours_enabled: val }); },
  setQuietHoursStart:   async (val) => { set({ quietHoursStart: val });   saveToCache('quietHoursStart', val);           saveToDB({ quiet_hours_start: val }); },
  setQuietHoursEnd:     async (val) => { set({ quietHoursEnd: val });     saveToCache('quietHoursEnd', val);             saveToDB({ quiet_hours_end: val }); },

  reset: () => set({
    petSwitchStyle: 'bottom-sheet', sosNotificationRadius: 10, country: 'US',
    notifDaily: true, notifHealth: true, notifAppointment: true,
    notifLost: true, notifFamily: true, notifPlaydate: true, notifChat: true, notifEvent: true,
    notifPostLike: true, notifPostComment: true, notifFollow: true, notifMention: true,
    quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00',
  }),

  loadPreferences: async () => {
    const BOOL_KEYS = ['notifDaily','notifHealth','notifAppointment','notifLost','notifFamily','notifPlaydate','notifChat','notifEvent','notifPostLike','notifPostComment','notifFollow','notifMention','quietHoursEnabled'];
    const STR_KEYS  = ['petSwitchStyle','country','quietHoursStart','quietHoursEnd'];
    const INT_KEYS  = ['sosNotificationRadius'];

    // 1. Cache first (instant)
    try {
      const all = await AsyncStorage.multiGet([...BOOL_KEYS, ...STR_KEYS, ...INT_KEYS]);
      const patch: any = {};
      for (const [k, v] of all) {
        if (v == null) continue;
        if (BOOL_KEYS.includes(k)) patch[k] = v === 'true';
        else if (k === 'sosNotificationRadius' && ['3','5','10'].includes(v)) patch[k] = parseInt(v);
        else if (k === 'petSwitchStyle' && ['bottom-sheet','dropdown','carousel'].includes(v)) patch[k] = v;
        else if (k === 'country' && ['US','IN'].includes(v)) patch[k] = v;
        else if (['quietHoursStart','quietHoursEnd'].includes(k)) patch[k] = v;
      }
      if (Object.keys(patch).length) set(patch);
    } catch {}

    // 2. DB (source of truth) — reset to defaults first so a previous user's values never bleed in
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select(
        'pet_switch_style,sos_radius,country,notif_daily,notif_health,notif_appointment,notif_lost,notif_family,notif_playdate,notif_chat,notif_event,notif_post_like,notif_post_comment,notif_follow,notif_mention,quiet_hours_enabled,quiet_hours_start,quiet_hours_end'
      ).eq('id', user.id).single();
      if (!data) return;

      const map: [string, string, any][] = [
        ['petSwitchStyle',    'petSwitchStyle',    data.pet_switch_style],
        ['sosNotificationRadius', 'sosNotificationRadius', data.sos_radius],
        ['country',           'country',           data.country],
        ['notifDaily',        'notifDaily',        data.notif_daily],
        ['notifHealth',       'notifHealth',       data.notif_health],
        ['notifAppointment',  'notifAppointment',  data.notif_appointment],
        ['notifLost',         'notifLost',         data.notif_lost],
        ['notifFamily',       'notifFamily',       data.notif_family],
        ['notifPlaydate',     'notifPlaydate',     data.notif_playdate],
        ['notifChat',         'notifChat',         data.notif_chat],
        ['notifEvent',        'notifEvent',        data.notif_event],
        ['notifPostLike',     'notifPostLike',     data.notif_post_like],
        ['notifPostComment',  'notifPostComment',  data.notif_post_comment],
        ['notifFollow',       'notifFollow',       data.notif_follow],
        ['notifMention',      'notifMention',      data.notif_mention],
        ['quietHoursEnabled', 'quietHoursEnabled', data.quiet_hours_enabled],
        ['quietHoursStart',   'quietHoursStart',   data.quiet_hours_start],
        ['quietHoursEnd',     'quietHoursEnd',     data.quiet_hours_end],
      ];

      // Start from defaults, then overlay whatever the DB has for this user
      const patch: any = {
        petSwitchStyle: 'bottom-sheet', sosNotificationRadius: 10, country: 'US',
        notifDaily: true, notifHealth: true, notifAppointment: true,
        notifLost: true, notifFamily: true, notifPlaydate: true, notifChat: true, notifEvent: true,
        notifPostLike: true, notifPostComment: true, notifFollow: true, notifMention: true,
        quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00',
      };
      for (const [cacheKey, storeKey, val] of map) {
        if (val == null) continue;
        patch[storeKey] = val;
        saveToCache(cacheKey, String(val));
      }
      set(patch);
    } catch {}
  },
}));
