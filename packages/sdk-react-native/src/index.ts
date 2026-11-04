import { useEffect, useState } from 'react';

import { ThravicClient } from './client';
import { reactNativeEnvironment } from './react-native';

export { ThravicClient, assignVariant } from './client';
export type {
  CollectEvent,
  DeviceInfo,
  Environment,
  Experiment,
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
 * const version = await Thravic.variant('new-paywall');  // A/B tests
 * ```
 */
export const Thravic = new ThravicClient(reactNativeEnvironment);

/**
 * The version of A/B test `key` to show, for use in a component: `undefined`
 * while it loads, then a version id or null for the original.
 *
 * ```tsx
 * const version = useVariant('new-paywall');
 * if (version === undefined) return null;
 * return version === 'b' ? <NewPaywall /> : <Paywall />;
 * ```
 */
export function useVariant(key: string): string | null | undefined {
  const [version, setVersion] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setVersion(undefined);
    void Thravic.variant(key).then((id) => {
      if (live) setVersion(id);
    });
    return () => {
      live = false;
    };
  }, [key]);
  return version;
}

export default Thravic;
