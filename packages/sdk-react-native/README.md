# @thravic/react-native

Thravic analytics for React Native and Expo apps. Track screens, sessions, versions and devices, plus your own events, in the same dashboard as your website.

## Install

```bash
npm install @thravic/react-native @react-native-async-storage/async-storage
```

With Expo, use `npx expo install @thravic/react-native @react-native-async-storage/async-storage`. You don't need any other native modules or a config plugin, and it works in Expo Go.

On bare React Native, run `npx pod-install` after installing.

## Start tracking

Add the app in your Thravic dashboard (**Add property → Mobile app**) to get its tracking ID. Then call `init` once, as early as you can:

```ts
import { Thravic } from '@thravic/react-native';

Thravic.init('TF-1A2B3C4D', {
  bundleId: 'com.acme.shop',
  appVersion: '1.4.0',
});
```

| Option | Default | |
| --- | --- | --- |
| `bundleId` | `'app'` | The host of screen URLs (`app://com.acme.shop/Home`). |
| `appVersion` | none | Shown under **Versions**. In Expo, use `Application.nativeApplicationVersion` from `expo-application`. |
| `apiUrl` | `https://api.thravic.com` | |
| `sessionTimeoutMinutes` | `30` | Time in the background after which the next open starts a new session. |
| `flushIntervalSeconds` | `10` | How often queued events are sent. |
| `debug` | `false` | Log every event to the console. |

## Screens

### React Navigation

```tsx
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { Thravic } from '@thravic/react-native';

const navigationRef = createNavigationContainerRef();

export default function App() {
  return (
    <NavigationContainer ref={navigationRef} onReady={() => Thravic.trackNavigation(navigationRef)}>
      {/* ... */}
    </NavigationContainer>
  );
}
```

### Expo Router

```tsx
// app/_layout.tsx
import { Stack, useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';
import { Thravic } from '@thravic/react-native';

Thravic.init('TF-1A2B3C4D', { bundleId: 'com.acme.shop' });

export default function Layout() {
  const ref = useNavigationContainerRef();
  useEffect(() => Thravic.trackNavigation(ref), [ref]);
  return <Stack />;
}
```

### By hand

```ts
Thravic.screen('Checkout');
```

## Events and users

```ts
Thravic.track('purchase', { amount: 49, currency: 'USD' });
Thravic.identify('user-42');
```

## A/B tests

Create a test under Experiments in the dashboard (Pro plan), start it, then ask for the user's version where the screen changes:

```tsx
import { Thravic, useVariant } from '@thravic/react-native';

function Paywall() {
  const version = useVariant('new-paywall'); // undefined while loading
  if (version === undefined) return null;
  return version === 'b' ? <NewPaywall /> : <OldPaywall />;
}

// when the user reaches the test's goal
Thravic.track('signup');
```

Outside a component, `await Thravic.variant('new-paywall')` gives the same answer. You get a version id from the dashboard, or `null` for the original: the user isn't in the test, the test isn't running, the user opted out, or the tests couldn't load within 3 seconds. A user always gets the same version, on the app and on your website. The first answer in each session records that the user saw the test, and the dashboard counts the goals they reach after it.

## Privacy

```ts
Thravic.optOut(); // stops tracking and drops unsent events; remembered across launches
Thravic.optIn();
Thravic.isOptedOut();
```

The SDK stores a random visitor ID in AsyncStorage. It doesn't read the advertising ID, contacts, location or any other permissioned data. The dashboard gets the country from the request IP and then throws the IP away.

## How it works

- Screen views are sent as page views on `app://<bundleId>/<Screen>`, so Pages (shown as Screens), paths and funnels work the same way they do for a website.
- A session starts when the app opens (`app_open`). It ends when the app goes to the background (`session_end`, with the duration and the last screen). Coming back within `sessionTimeoutMinutes` continues the same session.
- Events are queued on the device and sent in batches of up to 50. They are sent every `flushIntervalSeconds`, when 10 are waiting, and when the app goes to the background. If a send fails, it is retried with backoff, including after a restart. Up to 1,000 events are kept offline.
- Every event carries the OS, OS version, device model (manufacturer and model on Android; iPhone or iPad on iOS), app version, screen size and language.
