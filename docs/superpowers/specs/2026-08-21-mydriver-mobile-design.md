# MyDriver Mobile App — Design

Date: 2026-08-21
Status: Approved, in implementation

## Goal

Build the MyDriver customer and driver apps as a single React Native (Expo)
prototype with full feature parity to the existing web prototype at
`prototype/app`, and re-theme the whole ecosystem to a red-and-white palette.

Like the web prototype, this is **frontend-only**. Every camera, GPS, sensor and
network interaction is simulated. No backend, no persistence, no real device
permissions.

## Scope

| Surface | Change |
| --- | --- |
| `prototype/mobile` | New: 12-screen React Native app, both roles |
| `prototype/app` | Bug fixes + red/white reskin |
| `prototype/website` | Red/white reskin |
| `presentation` | Red/white reskin |

## Technology decisions

**Expo Go, everything mocked.** No `expo-camera`, `expo-location` or
`expo-sensors`. The app runs by scanning a QR code — no dev build, no Xcode, no
Android Studio. This matches the web prototype's "no backend" framing and keeps
the demo one command away.

**`StyleSheet` + a theme module, not NativeWind.** NativeWind would make the port
mechanical, but Expo 57 / RN 0.86 are new and NativeWind couples to Metro and
Babel — exactly the class of build-config coupling that silently broke the web
app (see Bug 2 below). A theme module has no build step, is guaranteed to work in
Expo Go, and makes the palette a single file that every screen reads from.

**React Navigation, not a bare state machine.** The web prototype drives screens
off a `phase` string. On mobile that would break Android's hardware back button
and lose swipe-back gestures. `@react-navigation/native-stack` and
`bottom-tabs` both run in Expo Go.

**Animations via RN core `Animated`.** The four CSS keyframe animations
(pulse ring, scan line, shutter flash, shake) are simple enough that Reanimated
is not worth the dependency.

### Dependencies

```
@react-navigation/native, @react-navigation/native-stack,
@react-navigation/bottom-tabs, react-native-screens,
react-native-safe-area-context, react-native-svg,
lucide-react-native, @react-native-community/slider
```

All installed via `expo install` so versions match the SDK.

## Palette

The system is **strictly red + white + neutral**. Red is the only chromatic
colour. This is a deliberate constraint: the previous design used emerald for
"safe" and rose for "breach", and once red becomes the brand colour, red can no
longer signal danger without every primary button reading as an alarm.

Instead, danger is distinguished from primary by **treatment, not hue**:

- Primary action → solid red fill, white label
- Danger / breach → red-tinted surface + red border + a warning icon
- Safe / clean → graphite with a check icon (not green)

### Tokens

```js
brand: {
  red:        '#E01E26',  // brand, primary CTA
  redPressed: '#B0161C',  // pressed / hover
  redDeep:    '#8A1015',  // critical, SOS fired
  redSoft:    '#FDECEC',  // alert surface tint
  redSofter:  '#FEF6F6',  // subtle tint
  onRed:      '#FFFFFF',
},
neutral: {
  bg:            '#FFFFFF',
  surface:       '#FFFFFF',
  surfaceAlt:    '#F6F6F8',
  surfaceSunken: '#F0F0F3',
  border:        '#E5E5EA',
  borderStrong:  '#D0D0D8',
  graphite:      '#16161C',  // the "safe / verified" signal
  text:          '#0C0C10',
  textMuted:     '#62626E',
  textFaint:     '#8A8A96',  // decorative and large text only
}
```

### Contrast

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `red` on white | 4.79 : 1 | AA normal text |
| white on `red` | 4.79 : 1 | AA normal text — CTA labels safe |
| `redPressed` on white | 7.13 : 1 | AAA |
| `textMuted` on white | 6.19 : 1 | AA |
| `textFaint` on white | 2.99 : 1 | **Decorative / large text only** |

`textFaint` must never carry information a user needs to read.

## Architecture

```
prototype/mobile/src/
  theme/tokens.js       the single palette file
  data/mock.js          same shape as the web prototype's mock data
  lib/utils.js          clamp, formatINR, maskPhone  (cn is dropped)
  components/           Toast, BottomSheet, MapCanvas, Segmented,
                        Toggle, StatusBar, Card, ScoreRing
  screens/customer/     Home, Matching, LiveTrip, TripComplete,
                        Vault, TripDetail, Profile
  screens/driver/       DriverHome, Handshake, Inspection,
                        DriveActive, TripSummary
  navigation/           RootNavigator, CustomerTabs, DriverStack
```

### Component notes

- **MapCanvas** ports directly to `react-native-svg`; the existing SVG is already
  declarative. The `<animate>` element has no RN equivalent, so the vehicle
  pulse becomes an `Animated` radius.
- **BottomSheet** replaces the web `Sheet`, built on RN `Modal` with a
  translucent backdrop, so it composes with the navigator instead of relying on
  an `absolute inset-0` inside a fake phone frame.
- **Toast** keeps the same context API (`toast(message, kind, duration)`) so the
  screen code ports unchanged. Unlike the web version it clears its timers on
  unmount.

### Mobile-specific decisions

- The **role switcher** lives outside the phone frame on web. On mobile there is
  no frame, so it becomes a labelled prototype toggle in each home screen's
  header.
- The **speed ceiling slider** uses `@react-native-community/slider`
  (40–120 km/h, step 5), clamped identically to the web version.

## State

State stays local to the flow controllers, exactly as on web — `CustomerTabs`
owns booking config, trip and vault; `DriverStack` owns the request and result.
No global store. The prototype has no persistence, so there is nothing for a
store to buy us.

## Bugs being fixed in the web prototype

1. **`CustomerApp.jsx:20`** references `DRIVERS`, which is never imported.
   Confirmed as a bare global in the production bundle — a hard `ReferenceError`
   the moment matching completes, killing the entire customer flow.
2. **`prototype/app` has no `postcss.config.js`**, so Tailwind never runs. The
   built CSS contains zero utility classes; all 3,300 lines of `className` are
   inert. The app ships completely unstyled.
3. **`index.css:8`** — `body { @apply bg-slate-950 text-slate-900 }` is emitted
   literally into `dist` (a dead rule) and is self-contradictory anyway:
   near-black text on a near-black background.
4. **`LiveTripScreen.jsx:83-90`** — the completion effect lists `maxSpeed` and
   `breaches` in its deps. The speed simulator fires every 1600 ms; if it updates
   state inside the 900 ms completion delay, cleanup clears the timeout and the
   `completedRef` guard blocks rescheduling. The trip hangs at 100% forever.
5. **`Toast.jsx:27`** — `window.setTimeout` is never cleared on unmount.

## Security review of the existing prototype

Clean. No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no
`target="_blank"`, no network calls, no storage, no secrets. Phone numbers are
masked through `maskPhone`. `DEMO_OTP` is intentional and documented. The same
properties must hold for the React Native app.

## Out of scope

Real device APIs, backend integration, auth, persistence, offline buffering, and
the native modules listed in `docs/mobile_app_spec.md`
(`react-native-background-geolocation`, `react-native-vision-camera`, volume-button
SOS listeners). Those belong to the production build, not this prototype.
