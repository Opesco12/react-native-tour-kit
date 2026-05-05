# react-native-tour-kit

Guided product tours for React Native with spotlight overlays, route-aware steps, scroll/list reveal helpers, and optional seen-state persistence.

## Features

- Spotlight overlays with `rectangle`, `rounded-rectangle`, `circle`, or `oval` cutouts
- `TourProvider` + `TourTarget` API
- Programmatic tour control with `useTour()`
- Route-aware steps via navigation adapter support
- Built-in helpers for `ScrollView`, `FlatList`, and `SectionList`
- Optional prompt before tour starts
- Pluggable storage for tracking seen/completed tours
- Custom tooltip renderer support

## Installation

```bash
npm install react-native-tour-kit
npx expo install react-native-svg
```

Peer requirements:

- `react >= 18`
- `react-native >= 0.72`
- `react-native-svg >= 13`

## Quick Start

```tsx
import React from "react";
import { Button, Text, View } from "react-native";
import {
  TourProvider,
  TourTarget,
  defineTours,
  useTour,
} from "react-native-tour-kit";

const tours = defineTours({
  homeOnboarding: [
    {
      id: "welcome",
      target: "welcome-card",
      title: "Welcome",
      description: "This card gives you a quick overview.",
      placement: "bottom",
    },
    {
      id: "cta",
      target: "primary-cta",
      title: "Take action",
      description: "Tap here to continue.",
      placement: "top",
    },
  ],
});

function HomeScreen() {
  const { startTour } = useTour();

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <TourTarget id="welcome-card">
        <View
          style={{ padding: 16, borderRadius: 12, backgroundColor: "#eef2ff" }}
        >
          <Text>Welcome to the app</Text>
        </View>
      </TourTarget>

      <TourTarget id="primary-cta">
        <Button
          title="Continue"
          onPress={() => {}}
        />
      </TourTarget>

      <Button
        title="Start Tour"
        onPress={() => startTour("homeOnboarding")}
      />
    </View>
  );
}

export default function App() {
  return (
    <TourProvider tours={tours}>
      <HomeScreen />
    </TourProvider>
  );
}
```

## Important Layout Note (Spotlight + Margins)

If a spotlighted element has margins, those margins are included in the measured target area and can make the spotlight appear taller/larger than expected.

Use margins on a parent wrapper instead, and keep the actual `TourTarget` child margin-free for accurate spotlight sizing.

## API Overview

### Core exports

- `TourProvider`
- `TourTarget`
- `useTour`
- `defineTours`
- `TourScrollView`
- `TourFlatList`
- `TourSectionList`
- `createExpoRouterAdapter`

### Tour step shape

Each step includes:

- `target` (required): target id registered by `TourTarget`
- `title` (required)
- `description?`
- `placement?`: `top | bottom | left | right | auto`
- `allowInteractionWithTarget?`
- `route?` and `navigationMode?` for route-aware steps
- `readiness?` (`delayMs`, `isReady`, `waitFor`, `timeoutMs`, `pollIntervalMs`)
- `scrollToTarget?`, `scrollContainerId?`, `scrollTargetIndex?`, `scrollSectionIndex?`

### `useTour()` controller methods

- `startTour(stepsOrTourId, options?)`
- `stopTour()`
- `nextStep()`
- `previousStep()`
- `goToStep(idOrIndex)`
- `hasTour(id)` / `getTour(id)`
- `isTourSeen(id)` / `markTourSeen(id)` / `clearTourSeen(id)`
- `getState()`

## Scroll/List Helpers

Use the wrapped containers when a step may be off-screen.

- `TourScrollView` with `id="..."`
- `TourFlatList` with `id="..."`
- `TourSectionList` with `id="..."`

Then set in your step:

- `scrollToTarget: true`
- `scrollContainerId: "same-id-as-wrapper"`

For virtualized lists, optionally provide:

- `scrollTargetIndex` / `scrollSectionIndex`
- `getTourTargetId` prop on `TourFlatList`/`TourSectionList`

## Route-aware Tours (Expo Router)

Create a navigation adapter and pass it to `TourProvider`:

```tsx
import { usePathname, useLocalSearchParams, useRouter } from "expo-router";
import { TourProvider, createExpoRouterAdapter } from "react-native-tour-kit";

function TourRoot({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams();

  const navigation = createExpoRouterAdapter({
    push: router.push,
    replace: router.replace,
    back: router.back,
    getPathname: () => pathname,
    getParams: () => params,
  });

  return <TourProvider navigation={navigation}>{children}</TourProvider>;
}
```

## Customization

`TourProvider` supports customization props including:

- `renderTooltip`
- `spotlightShape`, `spotlightBorderRadius`, `spotlightPadding`
- `overlayOpacity`, `overlayColor`, `closeOnOverlayPress`
- `buttonColors`, `tooltipBackground`, `tooltipTextColor`
- `prompt` config for start prompt text/visibility
- lifecycle callbacks via individual props or `lifecycle`
- engine options via `engine` (`defaultReadiness`, `onFailure`)

## Persistence (Seen Tours)

Pass a storage adapter to `TourProvider`:

```tsx
const storage = {
  keyPrefix: "my-app-tour",
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};
```

Then use:

- `isTourSeen("tourId")`
- `markTourSeen("tourId")`
- `clearTourSeen("tourId")`

## Development

```bash
npm install
npm run build
npm run typecheck
```

## License

MIT
