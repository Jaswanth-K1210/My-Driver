export type Role = 'CUSTOMER' | 'DRIVER' | 'AGENT' | 'ADMIN'

export type LatLng = { lat: number; lng: number }

export type TripStatus =
  | 'REQUESTED'
  | 'MATCHED'
  | 'HANDSHAKE_PENDING'
  | 'IN_TRIP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_DRIVERS_FOUND'
  | 'ESCALATED'

export type BookingType = 'POINT_TO_POINT' | 'HOURLY'
export type Availability = 'OFFLINE' | 'ONLINE' | 'ON_TRIP'

export type PublicUser = {
  id: string
  role: Role
  phone_number: string | null
  email: string | null
  full_name: string | null
}

export type Me = PublicUser & { roles: Role[] }

export type Guardian = {
  id: string
  name: string
  relation: string | null
  phone: string
  position: number
}

export type ConsentPurpose =
  | 'LOCATION_TRACKING'
  | 'TELEMATICS_COLLECTION'
  | 'GUARDIAN_SHARING'
  | 'BIOMETRIC_LIVENESS'

export type Consent = {
  id: string
  purpose: ConsentPurpose
  version: string
  granted_at: string
  revoked_at: string | null
}

export type Fare = {
  base: number
  platform_fee: number
  night_fee: number
  total: number
  driver_earnings: number
}

export type Quote = {
  distance_km: number
  required_certification: string
  fare: Fare
}

export type Trip = {
  id: string
  customer_id: string
  driver_id: string | null
  status: TripStatus
  booking_type: BookingType
  hourly_package_hours: number | null
  pickup: LatLng
  drop: LatLng | null
  required_certification: string
  speed_ceiling_kmh: number
  estimated_distance_km: number | null
  estimated_fare: number | null
  distance_km: number | null
  duration_min: number | null
  fare_amount: number | null
  driver_earnings: number | null
  requested_at: string
  completed_at: string | null
}

export type DriverSummary = {
  mydriver_score: number
  rating: number | null
  total_trips: number
  trips_today: number
  earnings_today: number
  availability: Availability
}

export type Tokens = {
  access_token: string
  refresh_token: string
  expires_in: number
}

/**
 * NOTE: there is deliberately no `mode` / VisionCam field anywhere in this
 * client. The backend rejects a booking that carries one. Route any dashcam
 * interface element out to the app website instead.
 */
export type BookRequest = {
  booking_type: BookingType
  hours?: 2 | 4 | 8 | 12
  pickup: LatLng
  drop?: LatLng
  pickup_address?: string
  drop_address?: string
  required_certification: string
  speed_ceiling_kmh: number
}

/* ── Realtime ─────────────────────────────────────────────────────────── */

export type ServerFrame =
  | { type: 'SUBSCRIBED'; trip_id: string }
  | { type: 'UNSUBSCRIBED'; trip_id: string }
  | {
      type: 'TRIP_OFFER'
      trip_id: string
      expires_at: string
      pickup: LatLng
      fare_estimate: number | null
    }
  | { type: 'TRIP_STATE_CHANGED'; trip_id: string; status: TripStatus }
  | {
      type: 'DRIVER_LOCATION'
      trip_id: string
      coords: { lat: number; lng: number; speed?: number; heading?: number }
    }
  | { type: 'PING' }
  | { type: 'ERROR'; code: string; message: string }
  // Emitted from Phase 2 onwards. Safe to switch on today.
  | {
      type: 'ANOMALY_TRIGGERED'
      trip_id: string
      level: string
      reason: string
      deviation_distance_meters?: number
    }

export type ServerFrameType = ServerFrame['type']
