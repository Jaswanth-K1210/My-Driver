// Guards the bug where every booking was sent with the default pickup.
// Run: npm run check
import assert from 'node:assert/strict'
const lib = await import(new URL('../src/lib/booking.js', import.meta.url))
const { DEFAULT_CONFIG, bookingPayloadFor, registerPlace, getLocationById } = lib
const jubilee = getLocationById('jubilee')
let p = bookingPayloadFor({ ...DEFAULT_CONFIG, pickupId: 'jubilee' })
assert.deepEqual(p.pickup, { lat: jubilee.lat, lng: jubilee.lng }, 'within-city pickup follows the choice')
p = bookingPayloadFor({ ...DEFAULT_CONFIG, pickupId: 'jubilee', durationHours: 10 })
assert.equal(p.booking_type, 'HOURLY'); assert.equal(p.pickup.lat, jubilee.lat, 'hourly pickup follows the choice')
if (registerPlace) {
  registerPlace({ id: 'mock:charminar', name: 'Charminar', address: 'Ghansi Bazaar, Hyderabad', lat: 17.3616, lng: 78.4747 })
  p = bookingPayloadFor({ ...DEFAULT_CONFIG, pickupId: 'mock:charminar' })
  assert.equal(p.pickup.lat, 17.3616); assert.equal(p.pickup_address, 'Ghansi Bazaar, Hyderabad')
  p = bookingPayloadFor({ ...DEFAULT_CONFIG, requirement: 'inter_city', interCityDetails: { ...DEFAULT_CONFIG.interCityDetails, destinationId: 'mock:charminar' } })
  assert.equal(p.drop.lat, 17.3616, 'searched outstation destination is used')
}
console.log('booking payload checks passed')
