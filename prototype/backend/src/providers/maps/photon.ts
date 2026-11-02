import { pinnedPlace, type MapsProvider, type Place } from './index.js'

const BASE = 'https://photon.komoot.io'
// Results outside India are never a pickup or drop.
const INDIA_BBOX = '68.1,6.5,97.4,35.7'
const HEADERS = { 'user-agent': 'MyDriver/1.0 (development; place search)' }

type Feature = {
  properties: Record<string, string | undefined>
  geometry: { coordinates: [number, number] }
}

/**
 * Photon (komoot): OpenStreetMap search built for search-as-you-type, with
 * no key. For development and testing without a Google key. The public
 * instance is fair-use only; production should run MAPS_PROVIDER=google or a
 * self-hosted Photon. Every call is cached in locations/service.ts.
 */
export class PhotonMapsProvider implements MapsProvider {
  readonly name = 'photon' as const

  async search(query: string, near?: { lat: number; lng: number }): Promise<Place[]> {
    const url = new URL(`${BASE}/api/`)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '8')
    url.searchParams.set('lang', 'en')
    url.searchParams.set('bbox', INDIA_BBOX)
    if (near) {
      url.searchParams.set('lat', String(near.lat))
      url.searchParams.set('lon', String(near.lng))
    }
    const json = await this.get(url)
    // OSM splits one road into several ways, often with conflicting
    // postcodes: same name and address but for the postcode, shown once.
    const seen = new Set<string>()
    return json.features.map(toPlace).filter((p) => {
      const key = `${p.name}|${p.address.replace(/,?\s*\d{6}$/, '')}`
      return !seen.has(key) && Boolean(seen.add(key))
    })
  }

  async reverse(at: { lat: number; lng: number }): Promise<Place> {
    const url = new URL(`${BASE}/reverse`)
    url.searchParams.set('lat', String(at.lat))
    url.searchParams.set('lon', String(at.lng))
    url.searchParams.set('lang', 'en')
    const top = (await this.get(url)).features[0]
    // The pin keeps its own coordinates; the nearest feature only names it.
    return top ? { ...toPlace(top), id: pinnedPlace(at).id, lat: at.lat, lng: at.lng } : pinnedPlace(at)
  }

  private async get(url: URL): Promise<{ features: Feature[] }> {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new Error(`Photon ${url.pathname} failed: ${res.status}`)
    return (await res.json()) as { features: Feature[] }
  }
}

function toPlace(f: Feature): Place {
  const p = f.properties
  const [lng, lat] = f.geometry.coordinates
  const street = [p.housenumber, p.street].filter(Boolean).join(' ')
  const name = p.name ?? (street || p.locality || p.city || 'Unnamed place')
  const address = [street !== name ? street : null, p.locality, p.district, p.city, p.state, p.postcode]
    .filter((part, i, all) => part && part !== name && all.indexOf(part) === i)
    .join(', ')
  return { id: `osm:${p.osm_type ?? ''}${p.osm_id ?? `${lat},${lng}`}`, name, address, lat, lng }
}
