import { ThravicClient } from './client';
import { reactNativeEnvironment } from './react-native';

export { ThravicClient } from './client';
export type {
  CollectEvent,
  DeviceInfo,
  Environment,
  NavigationRefLike,
  Storage,
  ThravicOptions,
} from './types';

/**
 * Thravic for React Native.
 *
 * ```ts
 * import { Thravic } from '@thravic/react-native';
 *
 * Thravic.init('TF-1A2B3C4D', { appVersion: '1.4.0', bundleId: 'com.acme.shop' });
 * Thravic.trackNavigation(navigationRef);     // screen views, automatically
 * Thravic.track('purchase', { amount: 49 });  // your own events
 * ```
 */
export const Thravic = new ThravicClient(reactNativeEnvironment);

export default Thravic;
