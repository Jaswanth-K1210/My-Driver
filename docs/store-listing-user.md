# Store listing: MyDriver (customer app)

Draft text for Google Play and the App Store. Review the claims against what
is live before publishing.

## Names

- App name: **MyDriver**
- Android package / iOS bundle ID: `com.mydriver.user`
- Category: Travel & Local (Play), Travel (App Store)

## Short description (Play, 80 characters max)

Book a verified driver for your own car. Live tracking and a speed limit.

## Subtitle (App Store, 30 characters max)

A driver for your own car

## Full description

MyDriver sends a verified, trained driver to drive you in your own car: across
the city, to the airport, or out of town.

**Book in a minute**
Choose where you are going, pick your car from your garage, and choose a
driver tier. You see the price before you book.

**You set the speed limit**
Choose the top speed for your trip. You see the car's speed against it during
the trip, and you are told if it is crossed.

**Know who is driving**
Your driver confirms the pickup with a selfie check and a one-time code that
only you have. Share the code at the car to start the trip.

**Follow every trip live**
See your driver on the map on the way to you and during the trip. Share a live
link with the people you trust, so they can follow along.

**Help when you need it**
Hold the SOS button to alert the MyDriver Safety Desk and your guardians
without your driver being told. You can also switch on SOS by pressing a
volume button three times.

**A record of every trip**
Each trip keeps its receipt. A completed trip also keeps the photos of your
car taken before and after, and a signed certificate.

## Why the app asks for permissions

Use these in the Play Console declarations and App Store review notes.

- **Notifications.** To tell you when a driver accepts, when your trip starts
  and ends, and if a trip is cancelled.

The app does not ask for your location: pickup and drop are places you choose,
and the map shows the driver's position, not yours. It does not use the
camera, contacts or photos.

## Data safety (Play) / privacy labels (App Store)

- Collected and linked to you: name, phone number, email (optional), the cars
  you save, your guardians' names and phone numbers, trip history, and a
  device token for notifications.
- Optional identity check: PAN and Aadhaar are verified through a provider;
  only the last four characters are stored.
- Payments are taken by Razorpay on a hosted page. The app does not see or
  store card details.
- Check the final answers against the privacy policy before submitting.

## Screenshots to take (not taken yet)

1. Booking: route and car
2. Driver tiers and the price
3. Finding a driver, with the map
4. Live trip: map, speed against the limit, pickup code
5. Trip receipt with inspection photos
6. Profile: garage and guardians

## Before publishing

- The description says "verified, trained driver" and "selfie check": confirm
  the live liveness and KYC providers are switched on in production.
- "You are told if it is crossed" depends on the driver's phone sending its
  speed; confirm on a real trip.
- Remove the volume-button sentence if phone testing shows it is unreliable.
