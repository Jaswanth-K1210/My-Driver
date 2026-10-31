import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_CONFIG,
  bookingPayloadFor,
  carDetailsFrom,
  getLocationById,
  getMinDurationForConfig,
  getRecommendedSkillId,
  getRouteLegTelemetry,
  haversineDistanceKm,
  quoteFor,
  registerPlace,
  resolveReturnDrop,
  resolveStopList,
  serverQuote,
} from '../src/lib/booking.js'

const TEST_SKILLS = [
  { id: 'MD-Standard', label: 'Standard', rate: 22, hourlyRate: 180 },
  { id: 'MD-Auto', label: 'Automatic', rate: 25, hourlyRate: 210 },
  { id: 'MD-SUV', label: 'SUV & MPV', rate: 28, hourlyRate: 240 },
  { id: 'MD-Lux', label: 'Luxury', rate: 36, hourlyRate: 320 },
  { id: 'MD-Night', label: 'Night Shield', rate: 30, hourlyRate: 260 },
]

describe('Customer App · src/lib/booking.js', () => {
  it('computes road-factored haversine distance with a 1 km floor', () => {
    const same = haversineDistanceKm({ lat: 17.4504, lng: 78.3808 }, { lat: 17.4504, lng: 78.3808 })
    assert.equal(same, 1)

    const hitecToGachibowli = haversineDistanceKm(
      { lat: 17.4504, lng: 78.3808 },
      { lat: 17.4401, lng: 78.3489 },
    )
    assert.ok(hitecToGachibowli > 3 && hitecToGachibowli < 10)
  })

  it('registers live-searched places and resolves them by id', () => {
    const id = registerPlace({
      id: 'place_custom_1',
      name: 'Inorbit Mall',
      address: 'Madhapur, Hyderabad',
      lat: 17.4344,
      lng: 78.3866,
    })
    assert.equal(id, 'place_custom_1')
    const resolved = getLocationById('place_custom_1')
    assert.equal(resolved.name, 'Inorbit Mall')
    assert.equal(resolved.lat, 17.4344)
  })

  it('maps saved garage vehicles to booking carDetails (carDetailsFrom)', () => {
    const details = carDetailsFrom({
      id: 'veh-1',
      company: 'Hyundai',
      model: 'Creta',
      engine_type: 'Diesel',
      transmission: 'Automatic',
      plate: 'TS09AB1234',
    })
    assert.deepEqual(details, {
      company: 'Hyundai',
      model: 'Creta',
      engineType: 'Diesel',
      transmission: 'Automatic',
      plate: 'TS09AB1234',
      isCustom: false,
      savedVehicleId: 'veh-1',
    })
  })

  it('recommends the appropriate certification tier for car specs and requirement', () => {
    assert.equal(getRecommendedSkillId({ company: 'BMW', model: '3 Series' }, 'within_city'), 'MD-Lux')
    assert.equal(getRecommendedSkillId({ company: 'Toyota', model: 'Fortuner' }, 'within_city'), 'MD-SUV')
    assert.equal(
      getRecommendedSkillId({ company: 'Honda', model: 'City', transmission: 'Automatic' }, 'within_city'),
      'MD-Auto',
    )
    assert.equal(
      getRecommendedSkillId({ company: 'Maruti Suzuki', model: 'Swift', transmission: 'Manual' }, 'within_city'),
      'MD-Standard',
    )
    assert.equal(getRecommendedSkillId({ company: 'Maruti Suzuki', model: 'Swift' }, 'inter_city'), 'MD-Night')
  })

  it('CR-1: resolves intermediate stops with {lat, lng} coordinates and preserves duration hours', () => {
    const config = {
      ...DEFAULT_CONFIG,
      requirement: 'within_city',
      tripType: 'two_way',
      pickupId: 'start_hitec',
      dropId: 'banjara',
      stops: [{ id: 's1', locationId: 'jubilee' }],
      returnStops: [{ id: 'rs1', locationId: 'kondapur' }],
      returnDropId: 'same_as_pickup',
      durationHours: 6,
    }

    const payload = bookingPayloadFor(config)
    assert.equal(payload.booking_type, 'POINT_TO_POINT')
    assert.equal(payload.hours, 6)
    assert.equal(payload.stops.length, 1)
    assert.equal(typeof payload.stops[0].lat, 'number')
    assert.equal(typeof payload.stops[0].lng, 'number')
    assert.equal(payload.return_stops.length, 1)
    assert.equal(typeof payload.return_stops[0].lat, 'number')
    assert.equal(typeof payload.return_stops[0].lng, 'number')
    assert.deepEqual(payload.return_drop, {
      lat: payload.pickup.lat,
      lng: payload.pickup.lng,
    })
  })

  it('M-2: keeps Within City trips > 8 hours as POINT_TO_POINT and populates inter_city return_drop', () => {
    const withinCityLong = bookingPayloadFor({
      ...DEFAULT_CONFIG,
      requirement: 'within_city',
      durationHours: 10,
    })
    assert.equal(withinCityLong.booking_type, 'POINT_TO_POINT')
    assert.equal(withinCityLong.hours, 10)

    const outstationRoundTrip = bookingPayloadFor({
      ...DEFAULT_CONFIG,
      requirement: 'inter_city',
      tripType: 'two_way',
      interCityDetails: {
        ...DEFAULT_CONFIG.interCityDetails,
        startLocationId: 'start_hitec',
        destinationId: 'vijayawada',
        returnDropId: 'same_as_pickup',
      },
    })
    assert.equal(outstationRoundTrip.booking_type, 'POINT_TO_POINT')
    assert.deepEqual(outstationRoundTrip.return_drop, {
      lat: outstationRoundTrip.pickup.lat,
      lng: outstationRoundTrip.pickup.lng,
    })
  })

  it('builds airport arrival and departure payloads with swap of pickup and terminal', () => {
    const departure = bookingPayloadFor({
      ...DEFAULT_CONFIG,
      requirement: 'airport',
      dropId: 'gachibowli',
      airportDetails: {
        terminalId: 'rgia_t1_dep',
        flow: 'departure',
        flightNumber: '6E-204',
      },
    })
    assert.equal(departure.flight_number, '6E-204')
    assert.match(departure.drop_address, /RGIA|Airport|Departure/i)

    const arrival = bookingPayloadFor({
      ...DEFAULT_CONFIG,
      requirement: 'airport',
      dropId: 'gachibowli',
      airportDetails: {
        terminalId: 'rgia_t1_arr',
        flow: 'arrival',
        flightNumber: 'AI-542',
      },
    })
    assert.equal(arrival.flight_number, 'AI-542')
    assert.match(arrival.pickup_address, /RGIA|Airport|Arrival/i)
  })

  it('strips booking-only fields when calling serverQuote', async () => {
    let capturedBody = null
    const mockApi = {
      trips: {
        quote: async (body) => {
          capturedBody = body
          return {
            distance_km: 6.4,
            required_certification: 'MD-Standard',
            tier_label: 'Standard',
            fare: { total: 420 },
          }
        },
      },
    }

    const res = await serverQuote(mockApi, {
      ...DEFAULT_CONFIG,
      ceiling: 65,
      preferFemaleDriver: true,
      shareWithGuardians: true,
    })
    assert.equal(res.fare.total, 420)
    assert.equal('speed_ceiling_kmh' in capturedBody, false)
    assert.equal('prefer_female_driver' in capturedBody, false)
    assert.equal('share_with_guardians' in capturedBody, false)
  })

  it('computes local quote breakdown including stops convenience fee', () => {
    const q = quoteFor(
      {
        ...DEFAULT_CONFIG,
        requirement: 'within_city',
        stops: [{ id: 's1', locationId: 'jubilee' }],
      },
      TEST_SKILLS,
      { platformFee: 19, nightFee: 30 },
    )
    assert.equal(q.ready, true)
    assert.ok(q.total > q.base)
    assert.ok(q.lines.some((l) => l.label.startsWith('Stops convenience fee') && l.value === '₹60'))
  })

  it('enforces minimum 2-hour floor on getMinDurationForConfig for short city trips', () => {
    const min = getMinDurationForConfig(DEFAULT_CONFIG)
    assert.ok(min.minHours >= 2)
    const leg = getRouteLegTelemetry('start_hitec', [], 'gachibowli', false)
    assert.ok(leg.distanceKm >= 1)
    assert.equal(leg.tag, 'Direct route')
  })

  it('resolveStopList and resolveReturnDrop handle custom coordinate stops and one-way trips', () => {
    const stops = resolveStopList([
      { id: 'custom', name: 'Custom Pin', lat: 17.42, lng: 78.39 },
      { id: 'invalid', locationId: 'non_existent' },
    ])
    assert.equal(stops.length, 1)
    assert.equal(stops[0].lat, 17.42)
    assert.equal(resolveReturnDrop('same_as_pickup', { lat: 17.45, lng: 78.38 }, false), null)
  })
})
