import { env } from '../../config/env.js'
import type { MapsProvider, Place } from './index.js'

/**
 * Google Places API (New), Text Search. One call returns names, addresses and
 * coordinates, where Autocomplete would need a second Place Details call (and
 * a second charge) per result. The field mask keeps it on the cheapest SKU
 * that includes location.
 */
export class GooglePlacesProvider implements MapsProvider {
  readonly name = 'google' as const

  constructor() {
    if (!env.GOOGLE_MAPS_API_KEY) throw new Error('MAPS_PROVIDER=google requires GOOGLE_MAPS_API_KEY')
  }

  async search(query: string, near?: { lat: number; lng: number }): Promise<Place[]> {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': env.GOOGLE_MAPS_API_KEY!,
        'x-goog-fieldmask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: 8,
        regionCode: 'IN',
        languageCode: 'en',
        // Bias, not restrict: a search for "Vijayawada" from Hyderabad must still work.
        ...(near
          ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50_000 } } }
          : {}),
      }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`Places search failed: ${res.status}`)
    const json = (await res.json()) as { places?: Array<Record<string, any>> }
    return (json.places ?? [])
      .filter((p) => p.location)
      .map((p) => ({
        id: `google:${p.id}`,
        name: p.displayName?.text ?? p.formattedAddress ?? 'Unnamed place',
        address: p.formattedAddress ?? '',
        lat: p.location.latitude,
        lng: p.location.longitude,
      }))
  }
}
