import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ACTIVE_STATUSES,
  paymentLabel,
  receiptLines,
  receiptText,
  shortTripId,
  toHistoryRow,
  toViewTrip,
} from '../src/lib/tripView.js'

describe('Customer App · src/lib/tripView.js', () => {
  it('formats shortTripId from UUIDs consistently', () => {
    assert.equal(shortTripId('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), 'TRP-A1B2C3')
  })

  it('CR-8: never uses transmission or fuel type as the vehicle plate when plate is empty', () => {
    const rawTrip = {
      id: '11223344-5566-7788-99aa-bbccddeeff00',
      status: 'HANDSHAKE_PENDING',
      booking_type: 'POINT_TO_POINT',
      pickup_address: 'Cyber Towers, HITEC City',
      drop_address: 'Financial District, Gachibowli',
      required_certification: 'MD-Standard',
      speed_ceiling_kmh: 60,
      estimated_fare: 350.5,
      fare_amount: null,
      estimated_distance_km: 6.2,
      distance_km: null,
      duration_min: null,
      pickup: { lat: 17.4504, lng: 78.3808 },
      drop: { lat: 17.4401, lng: 78.3489 },
      requested_at: '2026-10-30T10:00:00.000Z',
      completed_at: null,
      vehicle_specs: {
        company: 'Maruti Suzuki',
        model: 'Swift',
        engineType: 'Petrol',
        transmission: 'Manual',
        plate: '',
      },
      driver: {
        name: 'Raju Kumar',
        initials: 'RK',
        vehicle_model: null,
        vehicle_plate: null,
        rating: 4.9,
        mydriver_score: 94,
      },
    }

    const view = toViewTrip(rawTrip)
    assert.equal(view.id, 'TRP-112233')
    assert.equal(view.driver.vehicle, 'Maruti Suzuki Swift')
    assert.equal(view.driver.plate, null)
    assert.equal(view.fareIsFinal, false)
    assert.equal(view.fare, 351)
    assert.equal(view.fareExact, 350.5)
  })

  it('populates plate when driver or vehicle_specs provides a real registration plate', () => {
    const view = toViewTrip({
      id: 'abcdef12-3456-7890-abcd-ef1234567890',
      status: 'IN_TRIP',
      booking_type: 'POINT_TO_POINT',
      pickup_address: 'Banjara Hills',
      drop_address: 'RGIA T1',
      required_certification: 'MD-SUV',
      speed_ceiling_kmh: 80,
      estimated_fare: 890,
      fare_amount: null,
      vehicle_specs: { company: 'Toyota', model: 'Fortuner', plate: 'TS09EZ9999' },
      driver: { name: 'Kiran', initials: 'KR' },
    })
    assert.equal(view.driver.vehicle, 'Toyota Fortuner')
    assert.equal(view.driver.plate, 'TS09EZ9999')
    assert.ok(ACTIVE_STATUSES.includes(view.status))
  })

  it('builds history rows, receipt lines, and plain-text share receipts including amount_due', () => {
    const completedTrip = {
      id: '99887766-5544-3322-1100-ffeeddccbbaa',
      status: 'COMPLETED',
      booking_type: 'POINT_TO_POINT',
      pickup_address: 'Cyber Towers',
      drop_address: 'Banjara Hills',
      required_certification: 'MD-Standard',
      speed_ceiling_kmh: 60,
      estimated_fare: 300,
      fare_amount: 420.5,
      distance_km: 14.2,
      duration_min: 38,
      requested_at: '2026-10-30T11:00:00.000Z',
      completed_at: '2026-10-30T11:38:00.000Z',
      driver: { name: 'Suresh', initials: 'SR', rating: 5.0 },
    }

    const row = toHistoryRow(completedTrip)
    assert.equal(row.historyLabel, 'Completed')
    assert.equal(row.driverName, 'Suresh')

    const payment = {
      status: 'CAPTURED',
      amount_authorized: 300,
      amount_captured: 300,
      amount_refunded: 0,
      amount_due: 120.5,
      provider_payment_id: 'pay_mock_123',
    }
    assert.equal(paymentLabel(payment), 'Paid')

    const lines = receiptLines(row, payment)
    assert.ok(lines.some((l) => l.label === 'Final fare' && l.value === '₹420.50'))
    assert.ok(lines.some((l) => l.label === 'Still to pay' && l.value === '₹120.50' && l.alert === true))

    const text = receiptText(row, payment)
    assert.match(text, /MyDriver receipt · Trip TRP-998877/)
    assert.match(text, /Still to pay: ₹120\.50/)
    assert.match(text, /Payment reference: pay_mock_123/)
  })
})
