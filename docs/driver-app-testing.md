# Driver app: how to test the Phase 1 to-do items on a real phone

Written 2026-10-10, sections 12 and 13 added 2026-10-11, section 14 added 2026-10-24. Everything below was built and bundled on a laptop; **none of
it has been run on a phone yet**. Each section says what to do and what you
should see.

## Before you start

Push, background location and the map on Android do not work in Expo Go. You
need a development build:

```powershell
cd prototype\mobile\driver
npm install
npx eas-cli login
npx eas-cli build --profile development --platform android
```

Install the APK it produces, then `npx expo start --dev-client` and open the
app from the dev build. (`expo-dev-client` is installed as of 2026-10-11.)

The build needs two things from Jaswanth (see "Needs from Jaswanth" at the end):
`google-services.json` next to `app.config.js`, and `GOOGLE_MAPS_API_KEY_ANDROID`.
Without the first, the app builds but gets no push token. Without the second,
map cards show the address and the Navigate button but no map.

Backend on the laptop: `npm run infra:up; npm run db:migrate; npm run dev` in
`prototype\backend`. The phone and laptop must be on the same Wi-Fi.

You also need a customer to book trips: the user app on a second phone, or the
website.

Since 2026-10-18 an approved driver must also fill in their name, vehicle model
and plate before Home appears (section 14), and the app checks approval with
the server before going online or taking a trip.

## 1. Push notifications for offers

1. Sign in as an approved driver, allow notifications, go online.
2. In Android Settings > Apps > MyDriver Partner > Notifications there should
   be a "Trip requests" category.
3. Book a trip as the customer. The phone should ring and vibrate, and the
   offer card should appear on Home.
4. Press the home button, book again. A notification should arrive; tapping
   it opens the app on the offer.

With `PUSH_PROVIDER=console` on the backend (the default) the alert in step 3
comes from the app's own poll, not from a push. To prove a real push arrived,
set `PUSH_PROVIDER=fcm`, then repeat step 4 with the app in the background for
more than a minute: only a real push can ring then.

After the first real push arrives, the app slows its offer poll from 2.5 s to
10 s. You can see this in the backend log as fewer `GET /v1/driver/offers`
lines (turn the route's `logLevel` back to `info` temporarily to watch).

## 2. Background location

1. Accept a trip, do the handshake and the pre-trip inspection.
2. When asked, choose "Allow all the time" for location.
3. On the drive screen, lock the phone and walk or drive for a few minutes.
4. A "MyDriver trip in progress" notification should stay in the status bar.
5. On the customer's live trip screen the car should keep moving while the
   driver's phone is locked.

If you choose "While using the app" instead, the drive screen shows "Keep this
screen open".

## 3. Offline buffering

1. On the drive screen, turn on aeroplane mode for two minutes while moving.
2. The screen should show "No connection" and a rising count of saved locations.
3. Turn aeroplane mode off. The count should fall to zero within about 15
   seconds.
4. Check the gap was filled:
   `SELECT count(*) FROM telematics_logs WHERE trip_id = '<id>' AND time > now() - interval '5 minutes';`
   should be close to one row per second, with no two-minute hole.
5. Repeat, but force-stop the app while offline, reopen it, then go online.
   At most the last 5 seconds before the force-stop should be missing.

## 4. Post-trip inspection

1. Tap End trip. The drop-off inspection opens; the trip is not completed yet.
2. Take 3 photos, turn on aeroplane mode, take a 4th. Its tile should turn to
   a dashed red border with "Not uploaded · tap to retry", and a "Retry 1
   failed upload" button appears.
3. The bottom button must stay disabled until all 8 show "Uploaded".
4. Turn aeroplane mode off, tap the tile (the camera must not reopen), finish
   the rest, tap "Seal and end trip". The trip summary appears.

## 5. Map and navigation

1. After accepting, the handshake screen shows a map with the red pickup pin
   and a dark dot for your own position, framed so both are visible.
2. Tap Navigate: Google Maps should open with directions to the pickup.
3. On the drive screen the same card points at the drop.

## 6. Earnings, 7. Tests, 8. Profile

Open the three new tabs with no trip in progress.

- Earnings: complete a trip, pull to refresh. Today, This week and "Not yet
  paid out" should all rise by your share, and the trip should be listed. A
  payout only appears after Finance generates one in the console.
- Tests: every active test with its status. To see other states, have an ops
  user grade an attempt in the console. To see a practical test date, set one
  on the driver's page in the console: the practical test shows "Scheduled"
  and "Your practical test is on <date>".
- Profile: score, rating, Night Shield, badges, documents. To test expiry
  reminders, set a licence expiry 20 days out in the database, reopen Profile:
  a red "document needs attention" card should appear, and reminders are
  scheduled for 7 days and 1 day before (30 days has already passed).

## 9. Battery and data over a 2-hour trip

This can only be measured on a phone. Suggested run, on a mid-range Android
phone on mobile data, not charging:

1. Charge to 100%, note it. Settings > Apps > MyDriver Partner > Mobile data:
   note the usage.
2. Start a trip and drive (or leave the phone on a dash mount in a moving car)
   for 2 hours: first hour screen on, second hour screen locked.
3. Note battery % at 60 and 120 minutes, and data used.
4. Record phone model, Android version, and the two battery figures in the
   table below.

| Phone | Android | Battery used, screen on (1 h) | Battery used, locked (1 h) | Data (2 h) |
|---|---|---|---|---|
| | | | | |

Rough expectation for data, from the frame size: one location a second is
about 200 bytes, so 2 hours is about 1.5 MB up, plus 16 inspection photos.
Battery is dominated by GPS at navigation accuracy and by the screen; there is
no figure to quote until it is measured.

## 10. Icons and splash

Install a development or preview build: the launcher shows a white M on red,
the splash is the red tile on white, and the notification icon is a white M.
The artwork follows `website/public/favicon.svg`; replace the files in
`assets/` if there is a final logo. Store text is in
`docs/store-listing-driver.md`. Screenshots still have to be taken from a phone.

## 11. Builds

```powershell
npx eas-cli build --profile preview --platform android      # internal test APK
npx eas-cli build --profile production --platform android   # Play Store bundle
npx eas-cli build --profile production --platform ios       # needs an Apple Developer account
```

The three profiles install side by side (`.dev`, `.preview`, and the plain
package name). Set the values in `.env.production.example` as EAS environment
variables before a production build.

## 12. Interrupted trips (added 2026-10-11)

1. Cancelled by the customer: accept a trip, then cancel it from the customer
   app while the driver is on the handshake screen. Within a few seconds the
   driver should see "This trip was cancelled" and be back on Home, and a new
   booking should be offered to them. Repeat with the driver's phone in
   aeroplane mode during the cancel: the message should appear when the
   network returns.
2. Cancelled by the driver: on the handshake screen tap the X, confirm. The
   customer's app should show the trip as cancelled.
3. Restart mid-drive: on the drive screen, force-stop the app and reopen it.
   It should return to the drive screen, not the pre-trip inspection, and the
   timer should show the time since the trip began, not 00:00. Since
   2026-10-21 the timer uses the server's `started_at`, so it is right even
   after clearing the app's storage.
4. Restart during an SOS: press SOS, force-stop, reopen. The drive screen with
   the "Safety Desk alerted" card should appear.
5. End trip by mistake: tap End trip, then the back arrow on the drop-off
   inspection. The drive screen returns with the timer still running.
6. Trip ended while the app was closed: start a drive, force-stop the app,
   and have the trip ended another way (ask Jaswanth to complete it in the
   database). Reopen the app: the "MyDriver trip in progress" notification
   should disappear within a few seconds.
7. Log out while online, then book a trip as the customer: the signed-out
   phone must not be offered it (the console should show the driver offline).
   With `PUSH_PROVIDER=fcm`, the signed-out phone must not ring either:
   `SELECT count(*) FROM device_tokens WHERE user_id = '<driver id>';` is 0.

## 13. Renewing a document (added 2026-10-11)

1. Set a verified licence to expire in 20 days:
   `UPDATE driver_documents SET expires_on = CURRENT_DATE + 20 WHERE driver_id = '<driver id>' AND kind = 'DRIVING_LICENCE';`
2. Open Profile. The licence shows "20 days left" and an "Upload renewed
   document" button.
3. Tap it. Type a past date or 31/02/2030: the field turns red and both photo
   buttons stay disabled. Type a real future date: they enable.
4. Take a photo. A "Uploaded. Our team will review it." message appears and
   the licence row changes to "Under review" with the new date.
5. Go online and book a trip as the customer: the driver must still be
   offered it, because the old licence is still valid.
6. In the console, open the driver: the new licence is listed for review.
   Verify it, pull to refresh Profile: the row shows "Verified".

## 14. Approval gate, profile setup, trip end (added 2026-10-24)

From `bd0d854` and `52c609f`. Not yet run on a phone.

1. Profile setup: sign in as an approved driver with no name. The app opens
   Profile in setup mode; Home appears after saving a name (2+ characters).
   Vehicle model and plate are optional (D-3, 29 Oct): leaving both blank
   still lets the driver go online and accept trips. If given, each needs 2+
   characters, and the plate is saved in capitals. A driver who has a name
   but no vehicle details goes straight to Home.
2. Not approved: set the driver's `onboarding_status` to `UNDER_REVIEW` in the
   database, reopen the app: the onboarding checklist shows, not Home.
3. Offline start, no trip: aeroplane mode, force-stop, reopen. "Could not
   verify your driver status" with Try again; going online is not possible.
4. Offline start mid-drive: start a drive, aeroplane mode, force-stop, reopen.
   The drive screen returns (the trip continues), and the location queue
   grows. Go online again: the queue drains.
5. Ending with a backlog: on the drive screen go offline for a minute, turn
   the network on and at once tap End trip and seal the drop-off photos. If
   fixes are still queued the app says "Some of the route has not uploaded
   yet"; try again once the count reaches zero.
6. After the trip: the summary shows the fare breakdown; tapping Done shows
   "Revalidating your driver status" briefly, then Home, still online.
7. Missed offers: go online, let two offers expire without answering. The
   server takes the driver offline and the app says "You are offline after
   missing trip requests".
8. Fake GPS: with a mock-location app on Android, drive a trip. The fixes are
   dropped and the Safety Desk shows an L1 `MOCK_LOCATION` flag.
9. Approval without push (added 2026-10-29): with notifications turned off
   for the app, leave a driver in `UNDER_REVIEW` on the onboarding screen.
   Approve them in the console: within about 10 seconds the app moves on to
   profile setup or Home without pulling to refresh. Verifying the licence in
   the console (status unchanged) updates the licence step the same way.
   With the app in the background nothing is fetched; in aeroplane mode the
   screen stays as it is and never shows Home.

## 15. Trips with no address text (CR-4, added 2026-10-29)

Before the fix, a trip whose pickup or drop had no address string showed the
server's `{lat,lng}` object as text, and React Native crashed on the trip
screens. Not yet run on a phone.

1. Book a trip whose pickup was chosen on the map (no address), or clear
   `pickup_address` / `drop_address` on a test trip in the database.
2. Accept the offer: the offer card shows "Pickup point on map" /
   "Destination on map", not an object, and nothing crashes.
3. Handshake, drive and trip summary screens show the same labels; the map
   still has the pickup/drop pins and Navigate opens Google Maps.
4. Force-stop and reopen the app mid-drive (trip comes back from the server
   without the offer's labels): the drive screen still opens without a crash.

## 16. Offer card details (M-1 follow-up, added 2026-10-29)

Needs a backend with `de8adf1` or later. Not yet run on a phone.

1. From the user app, book an airport trip with a saved car (company, model,
   transmission), a flight number, two stops and a round trip.
2. With the driver app online and push **on** (the offer arrives over the
   WebSocket), the card shows: "Maruti Swift" (company and model), the
   transmission, "Flight …", "Round Trip", "2 Stops" and "Airport". Nothing
   reads "undefined".
3. Repeat with push **off** and the app left open (the offer arrives by
   polling): the card is identical.
4. A plain within-city trip with no car shows only "Within City".
5. Accept: the trip continues as before (handshake, drive, summary).

## Needs from Jaswanth

1. A Firebase project with Android apps for `com.mydriver.driver`,
   `com.mydriver.driver.preview` and `com.mydriver.driver.dev`; send
   `google-services.json`.
2. The Firebase service account JSON in the server's `FCM_SERVICE_ACCOUNT_JSON`,
   with `PUSH_PROVIDER=fcm`.
3. A Maps SDK for Android key.
4. A decision for iOS push. The backend sends through FCM, but the app
   registers the raw APNs token on iOS, which FCM cannot use (and deletes it
   on the first send). Either the backend sends to APNs directly, or the iOS
   app adds the Firebase SDK.

Practical test dates were added on 2026-10-21 (`assessment_attempts.scheduled_at`).
