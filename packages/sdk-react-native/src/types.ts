/** Options for `Thravic.init`. */
export interface ThravicOptions {
  /** Where the Thravic API lives. The dashboard's install snippet fills this in. */
  apiUrl?: string;
  /** Your app's version, e.g. `Application.nativeApplicationVersion` (Expo) or
   *  `DeviceInfo.getVersion()` (react-native-device-info). Shown under Versions. */
  appVersion?: string;
  /** Your app's bundle ID, used as the host of screen URLs (`app://<bundleId>/Home`). */
  bundleId?: string;
  /** Minutes in the background after which the next open starts a new session. */
  sessionTimeoutMinutes?: number;
  /** Seconds between automatic sends of queued events. */
  flushIntervalSeconds?: number;
  /** Log what the SDK does to the console. */
  debug?: boolean;
}

/** One event as `POST /api/collect/{trackingId}/batch` takes it. */
export interface CollectEvent {
  eventId: string;
  type: 'pageview' | 'custom' | 'session_end';
  url: string;
  visitorId: string;
  sessionId: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  os?: string;
  osVersion?: string;
  appVersion?: string;
  deviceModel?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  data?: Record<string, unknown>;
}

/** What the device reports about itself. */
export interface DeviceInfo {
  os: string;
  osVersion?: string;
  deviceModel?: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
}

/** Key-value storage that survives app restarts (AsyncStorage's shape). */
export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Everything the client needs from its platform, so it can run outside React Native. */
export interface Environment {
  storage: Storage;
  device: () => DeviceInfo;
  fetch: typeof fetch;
  now: () => number;
  /** Calls `listener(true)` when the app comes to the foreground and `listener(false)`
   *  when it leaves; returns an unsubscribe. */
  onAppStateChange: (listener: (active: boolean) => void) => () => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
  log: (...args: unknown[]) => void;
}

/** The parts of a React Navigation container ref the screen tracker uses. Expo
 *  Router's `useNavigationContainerRef()` returns one too. */
export interface NavigationRefLike {
  addListener(event: 'state', listener: () => void): () => void;
  getCurrentRoute(): { name: string; params?: object } | undefined;
  isReady?(): boolean;
}
