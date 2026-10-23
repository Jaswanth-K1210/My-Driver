# User app: how to test the Phase 1 to-do items on a real phone

Written 2026-10-11, updated 2026-10-24 for the amount-due payment, "driver
arrived", customer location and the arrival cancellation fee. Everything below was built, linted and bundled on a laptop;
**none of it has been run on a phone or an emulator yet**. Each section says
what to do and what you should see.

## Before you start

1. **Delete the old native project.** `prototype/mobile/user/android` was
   generated for Expo SDK 54 and the app is now SDK 57. While it exists, EAS
   builds use it and ignore the icon, permissions and every plugin in
   `app.json` (`npx expo-doctor` reports this). From the repo root:

   ```powershell
   git rm -r prototype/mobile/user/android
   ```

2. Push, the map on Android and the volume-button SOS do not work in Expo Go.
   Make a development build:

   ```powershell
   cd prototype\mobile\user
   npm install
   npx eas-cli login
   npx eas-cli build --profile development --platform android
   ```

   Install the APK, then `npx expo start --dev-client` and open the app from it.

3. The build needs `google-services.json` next to `app.config.js` (a Firebase
   Android app for `com.mydriver.user.dev`) and `GOOGLE_MAPS_API_KEY_ANDROID`.
   Without the first the app gets no push token. Without the second the trip
   screens show the addresses and "The map is not available in this build".

4. Backend on the laptop: `npm run infra:up; npm run db:migrate; npm run dev`
   in `prototype\backend`. Phone and laptop on the same Wi-Fi.

5. You need a driver to accept trips: the driver app on a second phone.

## 1. Driver tiers and prices from the server

1. Open the Book tab. Step 4 lists the tiers with a price per km and per hour.
   There is no "ETA" line any more.
2. In the console, Pricing, change the Standard per-km rate. Put the app in the
   background and bring it back (the server caches prices for 60 seconds, so
   wait a minute first). The new rate should show, and the estimated total
   should change.
3. In the database, `UPDATE rate_cards SET active = false WHERE skill_id = 'MD-Lux';`
   then background and reopen the app after a minute: Lux should be gone. If it
   was selected, another tier becomes selected.
4. Turn on aeroplane mode, force-stop and reopen the app: step 4 shows "Could
   not load driver tiers and prices" with Try again, and the Find button is
   disabled. Turn the network on and tap Try again.

## 2. Real map

1. Book a trip and pay. The "Finding a driver" screen shows a map with a dark
   pin at the pickup and a red pin at the drop.
2. Accept on the driver's phone. The live trip screen shows the same pins and,
   once the driver's phone sends its position, a car marker that moves.
3. Drag the map: it stops re-centring and a button appears bottom right. Tap it
   to follow the trip again.
4. The badge top right reads "Driver about N min away" before pickup and "About
   N min to go" after the trip starts.
5. After the trip, the completion screen shows the pickup and drop on the map.

## 3. Push notifications

Needs `PUSH_PROVIDER=fcm` and `FCM_SERVICE_ACCOUNT_JSON` on the backend. With
the default `PUSH_PROVIDER=console` the backend only prints each push to its
log, which is still enough to check the wording and timing.

1. Sign in and allow notifications. In Android Settings > Apps > MyDriver >
   Notifications there should be a "Trip updates" category.
2. Book a trip, then press the home button. Each of these should arrive as a
   notification:
   - the driver accepts: "Your driver is on the way"
   - the driver comes within 150 m of the pickup: "Your driver has arrived"
   - the handshake completes: "Trip started"
   - the driver ends the trip: "Trip ended"
3. Tap a notification: the app opens on that trip's current screen.
4. Book again and have the driver cancel from the handshake screen: "Trip
   cancelled". Cancel one yourself: no notification.
5. Book with no driver online: "No driver available".
6. Payment due: complete a trip, then in the database
   `UPDATE payments SET amount_due = 50 WHERE trip_id = '<id>';` is too late to
   trigger the push (it is sent at completion). To see it, run a trip whose
   final fare is above the hold. The automated test covers this case.
7. Log out, then book as the same customer on the website: the signed-out phone
   must not get notifications.
   `SELECT count(*) FROM device_tokens WHERE user_id = '<customer id>';` is 0.

"Driver arrived" was added to the backend on 2026-10-21. It is detected from
the driver's position, so the driver's phone has to be near the pickup.

## 4. Pickup code and silent SOS

1. After the driver accepts, a red "Pickup code" card shows a 4-digit code.
   Enter it on the driver's phone: the trip starts. The card then disappears,
   and so does the X (cancel) button, because a started trip cannot be
   cancelled.
2. Tap "Get a new code": the number changes and the old one stops working.
3. Hold the SOS button for a second: a 5-second countdown, then "Sending SOS",
   then "SOS sent". The console's Safety Desk should show an L4 escalation.
   The app must stay on the live trip screen afterwards (the trip is now
   `ESCALATED`), and survive a force-stop and reopen.
4. Repeat in aeroplane mode: "The SOS did not reach us" with Call 112 and Try
   the SOS again.
5. Volume button: Profile > Safety > switch on "SOS with the volume button".
   During a trip, with the trip screen open, press volume down three times
   about half a second apart: the same countdown starts. Check that:
   - holding the button down does not start it;
   - it does nothing with the switch off;
   - it does nothing on other screens.

   Known limits, by design of what the phone lets an app see: it does not work
   with the screen off or the app in the background, and a press is not seen
   when the volume is already at its highest or lowest.

6. Customer location (added 2026-10-21): when the trip starts the app asks for
   location "while using the app". Allow it: the server compares the
   customer's position with the driver's. Deny it: the trip goes on normally.
   This uses `expo-location`, a native module, so it needs the development
   build.
7. Cancelling after arrival (added 2026-10-24): once the driver has arrived,
   tap X. The confirmation says the driver is already at the pickup and shows
   the cancellation fee (set in the console's Pricing page). Confirm: the
   fee is taken from the hold and the rest is released. Before arrival the
   confirmation says cancelling is free.

## 5. Garage

1. Profile > My garage > Add a car. Pick a make and model, add a registration
   number, save. The first car shows DEFAULT.
2. Add a second car with "Use this car by default" on: DEFAULT moves to it.
3. Tap Make default on the first: it moves back.
4. Edit a car and change the gearbox: the row updates.
5. Add a car with a registration number that is already saved: "A car with this
   registration is already in your garage".
6. Remove a car, confirm. Open the Book tab: it is gone from Saved Garage too.
7. Sign out and in again: the Book tab starts with the default car selected.
8. Choose "Other / Custom", type a make and model, save, then edit it: the
   typed make and model are still there.

## 6. Amount due after a trip

Built by Jaswanth on 2026-10-21: a second order on the same checkout page.
Only run against the mock payment provider so far.

1. Run a trip that ends above its hold (a long detour, or a low hold set in
   the database). The completion screen shows a red "₹N still to pay" card
   with a "Pay ₹N" button.
2. Tap it. The checkout page says "Pay the amount due" with the amount. With
   the mock provider, approve the test payment and close the page: the card
   disappears.
3. Trips tab, open that trip: before paying, the receipt has a red "Still to
   pay" line. There is no Pay button there yet (open gap).
4. In the database, `SELECT amount_due, amount_due_paid FROM payments WHERE trip_id = '<id>';`
   shows 0 and the amount paid.

## 7. Trip history and receipts

1. The Trips tab lists every trip, newest first, including cancelled ones and
   ones where no driver was found, each with a status.
2. Pull down to refresh. With more than 20 trips, "Show older trips" loads the
   next page with no duplicates.
3. Open a completed trip: date, route, driver, distance, duration, then the
   receipt (final fare, held, charged, any refund or amount due, payment
   status and reference), then the inspection photos grouped before and after
   the trip, then the certificate.
4. Open a cancelled trip: the receipt shows "Hold released, nothing charged"
   and there are no photos or certificate.
5. Share receipt opens the share sheet with the receipt as text. Check the
   lines add up. Emailing a receipt is not built (no backend support).

## 8. Empty, error and offline states

1. First launch with a new account: Trips says "No trips yet", Profile says "No
   guardians yet" and "No cars saved yet".
2. Aeroplane mode, then open each tab: Trips, the garage and guardians each say
   they could not load, with Try again. None of them shows an empty list as if
   there were nothing.
3. Book tab offline: the price shows "Could not get a price" with Try again and
   the Find button is disabled.
4. During a trip, aeroplane mode for a minute: the map badge shows
   "reconnecting". Have the driver end the trip meanwhile. Turn the network on:
   within a few seconds the app moves to the completion screen.
5. On "Finding a driver", turn on aeroplane mode and tap Cancel request: an
   alert says it could not cancel, and the trip stays on screen.
6. With the driver's phone, cancel a trip the customer is waiting on: the
   customer sees a "Trip cancelled" alert and returns to the Book tab.
7. Book with no driver online: a "No driver available" alert.

## 9. Accessibility and small screens

1. Turn on TalkBack. Every button is announced as a button with a name. The
   tier cards, saved cars and star ratings say whether they are selected. The
   pickup code is read digit by digit. The code boxes at sign-in read "Code
   digit 1" to "6".
2. Settings > Display > Font size to the largest. Walk every screen and note
   any text that is cut off or overlaps. This could not be checked without a
   phone and is the most likely place for problems.
3. Repeat on the smallest phone available (around 5 inches / 360 dp wide).
4. Colours are red, white and neutral. Text that used the faint grey (2.99:1
   on white) now uses the muted grey, which meets 4.5:1.

## 10. Icons and splash

The launcher icon is a red M on white (the Partner app is white on red, so the
two are easy to tell apart). The splash is the red tile on white; the
notification icon is a white M. Store text is in `docs/store-listing-user.md`.
Screenshots still have to be taken from a phone.

## 11. Builds

```powershell
npx eas-cli build --profile preview --platform android      # internal test APK
npx eas-cli build --profile production --platform android   # Play Store bundle
npx eas-cli build --profile production --platform ios       # needs an Apple Developer account
```

The three profiles install side by side (`.dev`, `.preview` and the plain
package name). Set the values in `.env.production.example` as EAS environment
variables before a production build. No build has been run.

## Needs from Jaswanth

1. Android apps in the Firebase project for `com.mydriver.user`,
   `com.mydriver.user.preview` and `com.mydriver.user.dev`, and the
   `google-services.json` that covers them.
2. A Maps SDK for Android key that allows those three package names.
3. The same iOS push decision as the driver app: the backend sends through
   FCM, which cannot use the raw APNs token the iOS app registers.

Since 2026-10-24 the website lets the server choose the driver tier from the
car. The user app still shows its tier picker and sends the chosen tier,
which the server still accepts. Whether the app should follow the website is
an open question.
