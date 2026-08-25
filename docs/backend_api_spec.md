# MyDriver Backend API & Data Interfaces Specification

## 1. Authentication & Session Management

### `POST /v1/auth/otp/request`
Request 4-digit SMS OTP for phone verification.
- **Body**: `{ "phone_number": "+919876543210", "role": "CUSTOMER" }`
- **Response**: `{ "status": "OTP_SENT", "expires_in": 300 }`

### `POST /v1/auth/otp/verify`
Verify OTP and receive JWT bearer tokens.
- **Body**: `{ "phone_number": "+919876543210", "otp": "4921" }`
- **Response**: `{ "access_token": "eyJhb...", "refresh_token": "d92f...", "user": { "id": "uuid", "role": "CUSTOMER" } }`

---

## 2. Trip Lifecycle & Handshake APIs

### `POST /v1/trips/book`
Create a new booking request.
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "pickup_location": { "lat": 17.4399, "lng": 78.3813 },
    "drop_location": { "lat": 17.4483, "lng": 78.3915 },
    "required_certification": "MD_NIGHT",
    "speed_ceiling_kmh": 60,
    "guardian_contacts": ["+919876543211", "+919876543212"]
  }
  ```

### `POST /v1/trips/:id/handshake`
Verify Pickup Handshake at vehicle entry.
- **Body**: `{ "driver_selfie_base64": "data:image/jpeg;base64,...", "otp": "8391" }`
- **Response**: `{ "status": "HANDSHAKE_PASSED", "trip_state": "IN_TRIP" }`

---

## 3. Real-Time Telematics WebSocket Protocol

### Connection URL: `wss://stream.mydriver.in/v1/integrity`

#### Payload: Driver Location Broadcast (`type: DRIVER_TELEMETRY`)
```json
{
  "trip_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": 1787305851236,
  "coords": { "lat": 17.4399, "lng": 78.3813, "speed": 48.5, "heading": 182.4 },
  "sensors": { "accel_z": 0.12, "gyro_z": 0.04 }
}
```

#### Payload: Anomaly Alert Push (`type: ANOMALY_TRIGGERED`)
```json
{
  "trip_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "level": "L1",
  "reason": "ROUTE_DEVIATION_EXCEEDED",
  "deviation_distance_meters": 240
}
```
