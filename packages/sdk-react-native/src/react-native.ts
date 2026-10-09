import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Dimensions, Platform } from 'react-native';

import type { DeviceInfo, Environment } from './types';

type Constants = {
  Release?: string;
  Model?: string;
  Manufacturer?: string;
  osVersion?: string;
  interfaceIdiom?: string;
};

function language(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

/** What React Native itself knows about the device, with no native module to install. */
function device(): DeviceInfo {
  const constants = (Platform.constants || {}) as Constants;
  const screen = Dimensions.get('screen');
  const base = {
    screenWidth: Math.round(screen.width),
    screenHeight: Math.round(screen.height),
    language: language(),
  };

  if (Platform.OS === 'android') {
    return {
      ...base,
      os: 'Android',
      // `Platform.Version` is the API level on Android; Release is "14".
      osVersion: constants.Release || String(Platform.Version),
      deviceModel: [constants.Manufacturer, constants.Model].filter(Boolean).join(' ') || undefined,
    };
  }
  if (Platform.OS === 'ios') {
    return {
      ...base,
      os: 'iOS',
      osVersion: String(Platform.Version),
      // iOS does not expose the model without a native module.
      deviceModel: constants.interfaceIdiom === 'pad' ? 'iPad' : 'iPhone',
    };
  }
  return { ...base, os: Platform.OS };
}

export const reactNativeEnvironment: Environment = {
  storage: AsyncStorage,
  device,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  onAppStateChange(listener) {
    // 'inactive' is iOS passing through (Control Center, a call banner): not a
    // departure. Only 'background' ends the visit and only 'active' resumes it.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') listener(true);
      else if (state === 'background') listener(false);
    });
    return () => subscription.remove();
  },
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  log: (...args) => console.warn(...args),
};
