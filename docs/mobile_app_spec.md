# MyDriver Mobile Applications Technical Specification

## 1. Overview & Technology Stack

The mobile application ecosystem consists of two primary cross-platform apps targeting **iOS** and **Android**:
1. **MyDriver Customer App**: Passenger interface focused on booking, live guardian tracking, speed ceiling controls, and Trip Vault archives.
2. **MyDriver Driver App**: Professional driver interface handling trip execution, pickup handshakes, car condition photo captures, and telematics scoring.

### Recommended Technology Choice: React Native / Expo Enterprise
- **Cross-Platform Parity**: 95%+ shared codebase between iOS and Android.
- **Native Modules Required**: Background Location Tracking (`react-native-background-geolocation`), Accelerometer/Gyroscope Sensor APIs (`react-native-sensors`), Camera (`react-native-vision-camera`), and Secure Storage.

---

## 2. Customer Mobile App Architecture

### Core Feature Modules & UI Flows
- **Smart Booking Flow**:
  - Filter by driver skill certification (`MD-Standard`, `MD-Auto`, `MD-SUV`, `MD-Lux`, `MD-Night`).
  - Speed Ceiling configuration slider (e.g., 60 km/h city limit).
  - Pre-trip VisionCam mode selection (`Mode R`, `Mode D`, `Mode F`).
- **Live Trip Screen**:
  - Mapbox GL integrated map displaying real-time vehicle polyline.
  - "Share Guardian Link" button auto-pusthing SMS/WhatsApp updates to up to 3 emergency contacts.
  - Silent SOS trigger via 3x volume button press hardware listener.
- **Trip Vault**:
  - Timestamped inspection photos pre- and post-ride.
  - Exportable trip certificate PDF.

---

## 3. Driver Mobile App Architecture

### Core Feature Modules & Background Services
- **Foreground & Background Location Tracking**:
  - Persistent background geolocation task configured with `HighAccuracy` mode and `Always` location permission.
  - Sends high-frequency coordinate payloads to `wss://stream.mydriver.in` even when screen is off or app is minimized.
- **Pickup Handshake Protocol**:
  - Live camera liveness check (face match against onboarding master profile).
  - Customer OTP entry gate before engine start allowed.
- **8-Point Car Condition Inspection**:
  - Mandatory camera capture step (Front, Rear, Left, Right, Dashboard, Seats, Fuel/Odometer, Boot).
  - Watermarked with location metadata and immutable timestamp.
- **Telematics Data Collector**:
  - Samples 50Hz accelerometer and gyroscope motion vectors.
  - Calculates g-force spikes indicative of harsh braking ($>0.4\text{g}$) or aggressive swerving ($>0.35\text{g}$).

---

## 4. Mobile Technical Requirements Checklist

| Requirement | iOS Implementation | Android Implementation |
| :--- | :--- | :--- |
| **Background Location** | CoreLocation (`UIBackgroundModes: location`) | Foreground Service with persistent notification |
| **Silent SOS Listener** | `AVAudioSession` keypress hook / Volume change notification | `KeyEvent` broadcast receiver for volume key sequence |
| **Biometric / Liveness** | LocalAuthentication framework + TrueDepth camera | Android BiometricPrompt API + CameraX MLKit |
| **Offline Buffering** | WatermelonDB / SQLite local queue | Room Database / SQLite local queue |
