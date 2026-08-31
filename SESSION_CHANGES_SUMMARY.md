# MyDriver — Session Development & Architecture Summary

**Date:** August 30, 2026  
**Focus:** Booking Component Modernization, Dynamic Minimum Engine, Multi-Stop/Round-Trip Telemetry, and Full Backend Schema & API Integration.

---

## 1. Executive Summary

In this development session, we engineered an end-to-end overhaul of the MyDriver booking flow—spanning frontend route configuration, interactive UI/UX polishing, live telemetry computations, strict duration clamping rules, and backend database persistence.

Prior to this session, the booking interface had placeholder multi-stop options, lacked automatic return route synchronization, allowed invalid duration selections (e.g., booking 1 hour for a 5-hour drive), and stripped advanced configuration details before hitting the backend.

We achieved:
1. **Intelligent Route Management:** Clean partitioned Outbound and Return route cards with automatic location binding and intermediate stop management (up to 3 stops per leg).
2. **Real-Time Telemetry & Distance Engine:** Live distance and travel duration calculations surfaced on the UI per leg and in aggregate.
3. **Dynamic Duration Clamping (+10 Min Buffer Rule):** Enforced that minimum selectable durations are always $\ge$ physical drive time $+ 10\text{ minutes}$.
4. **1-Hour Package Enablement:** Integrated a 1-hour package for short local city drives while maintaining strict guards against under-booking long trips.
5. **Full Backend Schema & API Upgrade:** Added a database migration (`0010_trips_telemetry.sql`), updated Fastify Zod schemas, updated the PostgreSQL query/service layer, and updated the frontend payload serializer to ensure zero data loss.

---

## 2. Frontend Engineering & UI/UX Enhancements

### 2.1 Visual Modernization & Requirement Cards
The core requirement selection matrix was completely redesigned from clumsy, cluttered elements into a polished, high-contrast dark theme interface:
- **Four Core Service Tiers:**
  1. **Within City:** Point-to-point and hourly city trips with custom stop routing.
  2. **Inter-City (Outstation):** Multi-day and long-distance highway travel with driver allowance/batta calculations.
  3. **Airport Transfer:** Dedicated terminal corridors (Departures/Arrivals) with integrated flight number monitoring.
  4. **Full-Time Dedicated:** Long-term chauffeur arrangements (daily 12-hour shifts across weeks/months).
- **Aesthetic Refinements:** Designed with high-contrast slate surfaces (`bg-neutral-900/80`), subtle amber/gold borders on active selections (`border-amber-500/50`), and crisp iconography paired with descriptive sub-labels to eliminate cognitive friction.

---

### 2.2 Partitioned Two-Card Route Planner Architecture (`BookingFields.jsx`)
The centerpiece of the frontend overhaul is the newly engineered **`RoutePlanner`**, which transitions the user experience from a generic point-to-point picker into an intelligent multi-leg journey builder:

```
┌─────────────────────────────────────────────────────────────┐
│ 📍 OUTBOUND JOURNEY                                         │
│  🟢 Pickup Location ──────────────────────── [Cyber Towers] │
│   │                                                         │
│  🟡 Stop 1 (Intermediate) ─────────────── [Inorbit Mall] ✕ │
│   │                                                         │
│  🔴 Destination ───────────────────────── [Gachibowli]     │
│  ⚡ ~18 km • ~43 mins • 1 stop • City transit                │
└─────────────────────────────────────────────────────────────┘
                              │
                    [ Round-Trip Toggle ]
                              │
┌─────────────────────────────────────────────────────────────┐
│ ↩️ RETURN JOURNEY (Auto-Linked)                             │
│  🟢 Return Origin ─────────────────────── [Gachibowli (🔒)] │
│   │                                                         │
│  🟡 Return Stop 1 ─────────────────────── [Kondapur]     ✕ │
│   │                                                         │
│  🔴 Return Drop ───────────────────────── [Cyber Towers (↺)]│
│  ⚡ ~18 km • ~43 mins • 1 stop • City transit                │
└─────────────────────────────────────────────────────────────┘
  🏷️ Combined Trip: ~36 km • ~1 hr 26 mins drive time
```

#### Key Architecture & Interaction Details:
1. **Two-Way / Round-Trip Route Flow:**
   - Toggling **Round Trip (Two-Way)** dynamically mounts two distinct, visually partitioned cards: **Outbound Journey** and **Return Journey**.
   - **Automatic State Linking & Inheritance:**
     - The **Return Origin** is automatically locked to the **Outbound Destination** selected by the user, preventing impossible return trajectories.
     - The **Return Drop** automatically defaults to `same_as_pickup` (the Outbound Pickup point), but provides a dedicated selector if the user wants to be dropped off at an alternate final location.
2. **Intermediate Stop Management & Validation Guards:**
   - Added a `+ Add Stop` button allowing up to **3 intermediate stops per leg** (`MAX_STOPS = 3`).
   - **Strict Anti-Dummy Stop Guards:** The UI prevents users from adding empty/unspecified stops in bulk. The `+ Add Stop` button is dynamically disabled until the most recently added stop has a valid location selected.
   - **Dynamic Stop Indexing & Instant Removal:** Each stop chip displays its sequential index (`Stop 1`, `Stop 2`, `Stop 3`) and features an instant delete button (`×`). Removing a stop automatically re-indexes succeeding stops and cleanses memory.
3. **Visual Timeline Connectors:**
   - Rendered vertical dotted connector lines with color-coded nodes:
     - 🟢 **Emerald Dot:** Departure/Origin point.
     - 🟡 **Amber Dot:** Intermediate stops.
     - 🔴 **Ruby Dot:** Final arrival destination.

---

### 2.3 Real-Time Telemetry & Distance Engine (`booking.js`)
To provide full transparency, we developed a telemetry engine (`getRouteLegTelemetry`) that computes real-time driving statistics as the user configures the route:

- **Road Curvature Distance Modeling:**
  - Standard straight-line distance is modified using an empirical Indian urban/highway road factor:
    $$\text{Road Distance (km)} = \text{Haversine}(A, B) \times 1.35$$
- **Transit Duration Heuristics:**
  - **City Routes:** Calibrated at an average speed of $25\text{ km/h}$, with a $+30\text{ minute}$ dwell buffer automatically allocated per intermediate stop for passenger pickup/drop tasks.
  - **Outstation/Highway Routes:** Calibrated at an average highway cruising speed of $55\text{ km/h}$, with a $+30\text{ minute}$ stop allowance.
- **Interactive Telemetry Footers:**
  - Displayed dynamically inside the footer of each route card with live badges (e.g., `⚡ ~18 km • ~43 mins • 1 stop • City transit`).
  - **Combined Aggregate Pill:** For round trips, an aggregate pill displays total round-trip distance and combined driving time.

---

### 2.4 Dynamic Duration Clamping Engine & The "+10-Minute Buffer" Rule
A major flaw in traditional booking UIs is allowing users to book short durations for long trips (e.g., booking a 1-hour package for a 3-hour journey). We resolved this with `getMinDurationForConfig(config)`:

#### 1. The Mathematical Buffer Model
For any route configuration, the system calculates the physical travel time and mandates a **minimum 10-minute buffer**:
$$\text{Required Minutes} = \text{Total Estimated Drive Minutes} + 10$$
$$\text{Minimum Allowed Hours} = \max(1, \lceil \text{Required Minutes} / 60 \rceil)$$

#### 2. Tier-Specific Duration Rules:
- **Within City:**
  - Example: A 17-minute direct drive requires $\lceil (17 + 10)/60 \rceil = 1\text{ hour}$ (allows the 1-hour package).
  - Example: Adding 2 stops increases drive time to 75 minutes $\implies \lceil (75 + 10)/60 \rceil = 2\text{ hours}$ minimum.
- **Inter-City / Outstation:**
  - Minimum hours are calculated strictly based on destination distance and return journey requirements (e.g., Vijayawada $275\text{ km} \implies 5\text{ hours}$ minimum; Bengaluru round trip $1140\text{ km} \implies 18\text{ hours}$ minimum).
- **Airport Transfers:**
  - Strict minimum **3 hours** to guarantee driver availability for terminal queues, flight delays, and baggage collection.
- **Full-Time Chauffeurs:**
  - Strict **12 hours/day** standard baseline.

#### 3. Reactive Auto-Clamping Hook
- An active `useEffect` hook in `BookingFields.jsx` continuously listens to route and stop mutations.
- If a user currently has 1 hour selected and adds stops that push the required travel time to 80 minutes, the engine **automatically elevates** `durationHours` to 2 hours and updates the UI helper text (e.g., *"Travel time (~75 mins + 10 min buffer) requires min. 2 hrs"*).
- **Preset Buttons (`[1, 2, 4, 8] hrs`):** Presets below the minimum threshold are dynamically rendered with disabled states and opacity reductions.

#### 4. 1-Hour Package Enablement (`h1`)
- Enabled a dedicated **1-Hour Package** (`h1`) in `mock.js` so local errand runners are not forced into 2-hour minimums when their trip is under 50 minutes total.

---

### 2.5 Mobile Screen Simulator Synchronization (`MobileBookScreen.jsx`)
To ensure full design parity across responsive viewports, the mobile device simulator was updated:
- Mirrors the partitioned Outbound and Return route cards with compact touch-friendly chips.
- Renders the real-time telemetry pills and stop count indicators directly inside the mobile preview viewport.

---

## 3. Backend Schema & API Integration

To prevent the backend from stripping or rejecting the new rich booking parameters, we updated all layers of the backend service:

```
[ Frontend: bookingPayloadFor() ]
               │
               ▼ (JSON HTTP POST /v1/trips/book)
[ Fastify Zod Validation: QuoteBody & BookBody ]
               │
               ▼ (BookInput interface)
[ Service Layer: bookTrip() in service.ts ]
               │
               ▼ (SQL INSERT)
[ PostgreSQL: trips table (Migration 0010) ]
```

### 3.1 Database Migration (`migrations/0010_trips_telemetry.sql`)
Created a non-destructive schema migration extending the `trips` table:
```sql
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS stops JSONB,
ADD COLUMN IF NOT EXISTS return_stops JSONB,
ADD COLUMN IF NOT EXISTS return_drop_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS return_drop_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS return_drop_address TEXT,
ADD COLUMN IF NOT EXISTS vehicle_specs JSONB,
ADD COLUMN IF NOT EXISTS vision_mode TEXT,
ADD COLUMN IF NOT EXISTS flight_number TEXT,
ADD COLUMN IF NOT EXISTS requirement TEXT,
ADD COLUMN IF NOT EXISTS trip_type TEXT;
```

### 3.2 Zod Schema Upgrades (`routes.ts`)
- Upgraded `QuoteBody` and `TripViewSchema` to accept and serialize the new fields.
- Relaxed the strict `hours` enum constraint (`[2, 4, 8, 12]`) to `z.number().int().min(1)` to officially support 1-hour bookings and custom multi-day durations.

### 3.3 Service Layer & Data Mapping (`service.ts`)
- Extended `BookInput` and `TripView` TypeScript interfaces.
- Updated `TRIP_SELECT` to query all new columns.
- Updated `toView()` mapper to deserialize coordinates and JSON structures.
- Updated `bookTrip()` SQL insertion to store all telemetry data into PostgreSQL.

### 3.4 Outgoing Payload Serializer (`booking.js`)
- Refactored `bookingPayloadFor(config)` to assemble and forward:
  - `stops` (Outbound stops array)
  - `return_stops` (Return stops array)
  - `return_drop` (Return destination coordinates)
  - `car_details` (Vehicle make, model, transmission, fuel, license plate)
  - `vision_mode` (`R`adar, `D`ashcam, `F`ull Telemetry)
  - `flight_number` (For airport arrival/departure monitoring)
  - `requirement` (`within_city`, `inter_city`, `airport`, `full_time`)
  - `trip_type` (`one_way`, `two_way`)

---

## 4. Smoke Test & Validation Suite

We built and executed a Node.js smoke testing harness (`test_booking_smoke.mjs`) auditing 6 distinct booking configurations:

| Scenario | Test Case | Duration Rule Validation | Payload Carry-Over Audit |
| :--- | :--- | :--- | :--- |
| **1** | Point-to-Point Local (15 mins) | ✅ Allowed 1-hour package | ✅ `car_details`, `vision_mode` captured |
| **2** | Within City Round-Trip Multi-Stop (45 mins drive) | ✅ Auto-enforced $\ge 2\text{ hrs}$ | ✅ `stops`, `return_stops`, `return_drop` captured |
| **3** | Intercity One-Way (Vijayawada 275 km) | ✅ Auto-enforced $\ge 5\text{ hrs}$ | ✅ Highway drop & night certification captured |
| **4** | Intercity Round-Trip (Bengaluru 1140 km) | ✅ Auto-enforced $\ge 18\text{ hrs}$ | ✅ Multi-day round-trip distance captured |
| **5** | Airport Transfer with Flight Tracking | ✅ Auto-enforced $\ge 3\text{ hrs}$ | ✅ `flight_number` (`6E-2415`) captured |
| **6** | Full-Time Private Chauffeur | ✅ Auto-enforced $\ge 12\text{ hrs}$ | ✅ `HOURLY` booking package captured |

---

## 5. Complete Inventory of Changed Files

Below is the directory map of all modified and newly created files in this session:

### 📁 Frontend (`prototype/website/`)
1. **`src/components/app/BookingFields.jsx`**
   - Refactored `RoutePlanner` component into partitioned Outbound and Return cards.
   - Added `+ Add Stop` controls with index tracking and validation guards.
   - Integrated live telemetry footer pills and dynamic duration clamp listeners.
2. **`src/components/app/mobile/MobileBookScreen.jsx`**
   - Synchronized mobile phone simulator to render round-trip legs and telemetry info.
3. **`src/lib/booking.js`**
   - Added `getMinDurationForConfig(config)` (+10 min buffer rule).
   - Added `getRouteLegTelemetry(startId, stops, destId, isInterCity)`.
   - Updated `DEFAULT_CONFIG` duration to 1 hour.
   - Refactored `bookingPayloadFor(config)` to serialize all advanced telemetry fields.
4. **`src/data/mock.js`**
   - Added 1-hour package definition (`h1`) to `HOUR_PACKAGES`.

### 📁 Backend (`prototype/backend/`)
5. **`migrations/0010_trips_telemetry.sql`** *(New File)*
   - SQL migration adding `stops`, `return_stops`, `return_drop_lat`, `return_drop_lng`, `vehicle_specs`, `vision_mode`, `flight_number`, `requirement`, and `trip_type` columns.
6. **`src/modules/trips/routes.ts`**
   - Updated Zod validation schemas (`QuoteBody` and `TripViewSchema`).
   - Extended `POST /v1/trips/book` route handler to pass all telemetry fields into `bookTrip`.
7. **`src/modules/trips/service.ts`**
   - Updated `BookInput` and `TripView` type contracts.
   - Updated `TRIP_SELECT` SQL query and `toView()` deserializer.
   - Updated `bookTrip()` `INSERT INTO trips` database query.

---

## 6. Downstream Areas to Update Next

With the booking engine and backend database now storing rich multi-stop and telemetry data, the following downstream surfaces are primed for integration:

1. **Trip Tracking & Live Radar Screen (`/app/track`)**:
   - Update the interactive map to plot intermediate stops and return route waypoints.
   - Connect live driver radar simulation to the selected `vision_mode` (`R`, `D`, `F`).
2. **Trip Vault (`/app/vault`)**:
   - Display complete trip route timelines (stops, departure/arrival timestamps).
   - Ingest vehicle specifications (`vehicle_specs`) and flight numbers for post-trip analytics.
3. **Driver Mobile Dispatch & Acceptance View**:
   - Surface the total stop count, return leg details, and customer vehicle specifications to the driver before accepting the trip offer.
