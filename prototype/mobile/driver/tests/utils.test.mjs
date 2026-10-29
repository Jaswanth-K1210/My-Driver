import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isDriverProfileComplete, offerTags, placeCoords, placeText } from '../src/lib/utils.js'

describe('placeText', () => {
  it('skips {lat,lng} objects and falls back to readable text', () => {
    assert.equal(placeText(null, { lat: 17.4, lng: 78.5 }, 'Pickup point on map'), 'Pickup point on map')
  })

  it('returns the first non-empty string', () => {
    assert.equal(placeText(undefined, '  ', 'Hitech City', 'fallback'), 'Hitech City')
  })

  it('returns null when nothing is text', () => {
    assert.equal(placeText(undefined, { lat: 1, lng: 2 }), null)
  })
})

describe('placeCoords', () => {
  it('returns the first point with finite lat/lng', () => {
    const point = { lat: 17.4, lng: 78.5 }
    assert.equal(placeCoords('Hitech City', { lat: 'x', lng: 1 }, point), point)
  })

  it('never returns a string as coordinates', () => {
    assert.equal(placeCoords('Hitech City', undefined), null)
  })
})

describe('offerTags', () => {
  it('builds the car, airport, round-trip, stops and requirement tags from app values', () => {
    const tags = offerTags({
      vehicleSpecs: { company: 'Maruti', model: 'Swift', transmission: 'Automatic' },
      requirement: 'airport',
      flightNumber: 'AI 544',
      tripType: 'two_way',
      stops: [{}, {}],
    })
    assert.deepEqual(tags.map((t) => t.label), ['Maruti Swift', 'Automatic', 'Flight AI 544', 'Round Trip', '2 Stops', 'Airport'])
  })

  it('accepts upper-case values and a car with no company', () => {
    const tags = offerTags({
      vehicleSpecs: { model: 'Toyota Innova', transmission: 'MANUAL' },
      requirement: 'AIRPORT',
      flightNumber: 'AI 544',
      tripType: 'ROUND_TRIP',
      stops: [{}],
    })
    assert.deepEqual(tags.map((t) => t.label), ['Toyota Innova', 'Manual', 'Flight AI 544', 'Round Trip', '1 Stop', 'Airport'])
    assert.ok(!tags.some((t) => t.label.includes('undefined')))
  })

  it('replaces every underscore in the requirement and returns nothing for a bare offer', () => {
    assert.deepEqual(offerTags({ requirement: 'within_city' }).map((t) => t.label), ['Within City'])
    assert.deepEqual(offerTags({ tripType: 'one_way', stops: null, vehicleSpecs: null }), [])
    assert.deepEqual(offerTags(null), [])
  })
})

describe('isDriverProfileComplete (D-3)', () => {
  it('needs only a name; vehicle model and plate are optional', () => {
    assert.equal(isDriverProfileComplete({ full_name: 'Ramesh', vehicle_model: null, vehicle_plate: null }), true)
  })

  it('ignores the server flag that still counts the vehicle fields', () => {
    assert.equal(isDriverProfileComplete({ full_name: 'Ramesh', profile_complete: false }), true)
  })

  it('is incomplete without a name, unless the signed-in user has one', () => {
    assert.equal(isDriverProfileComplete({ full_name: '  ', vehicle_model: 'Swift', vehicle_plate: 'TS09' }), false)
    assert.equal(isDriverProfileComplete({ full_name: null }, 'Ramesh'), true)
  })

  it('does not block before the summary has loaded', () => {
    assert.equal(isDriverProfileComplete(null), true)
  })
})
