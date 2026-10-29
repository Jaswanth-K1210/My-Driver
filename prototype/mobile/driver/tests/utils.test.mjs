import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { placeCoords, placeText } from '../src/lib/utils.js'

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
