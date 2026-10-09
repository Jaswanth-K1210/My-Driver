import { env } from '../../config/env.js'
import { GooglePlacesProvider } from './google.js'

export type Place = { id: string; name: string; address: string; lat: number; lng: number }

export interface MapsProvider {
  readonly name: 'mock' | 'google'
  search(query: string, near?: { lat: number; lng: number }): Promise<Place[]>
}

/** Well-known Hyderabad places, so search works locally with no API key. */
const PLACES: Place[] = [
  { id: 'mock:cyber-towers', name: 'Cyber Towers', address: 'HITEC City, Madhapur, Hyderabad', lat: 17.4504, lng: 78.3808 },
  { id: 'mock:inorbit', name: 'Inorbit Mall', address: 'Mindspace, Madhapur, Hyderabad', lat: 17.434, lng: 78.3868 },
  { id: 'mock:financial-district', name: 'Financial District', address: 'Nanakramguda, Gachibowli, Hyderabad', lat: 17.4256, lng: 78.332 },
  { id: 'mock:jubilee-checkpost', name: 'Jubilee Hills Check Post', address: 'Road No. 36, Jubilee Hills, Hyderabad', lat: 17.4319, lng: 78.4073 },
  { id: 'mock:banjara-hills', name: 'Banjara Hills Road No. 12', address: 'Banjara Hills, Hyderabad', lat: 17.4126, lng: 78.4392 },
  { id: 'mock:kphb', name: 'KPHB Colony', address: 'Kukatpally, Hyderabad', lat: 17.4849, lng: 78.4138 },
  { id: 'mock:begumpet', name: 'Begumpet', address: 'Prakash Nagar, Begumpet, Hyderabad', lat: 17.4447, lng: 78.4664 },
  { id: 'mock:secunderabad-station', name: 'Secunderabad Railway Station', address: 'Station Road, Secunderabad', lat: 17.4344, lng: 78.5015 },
  { id: 'mock:botanical-garden', name: 'Botanical Garden', address: 'Kondapur, Hyderabad', lat: 17.4587, lng: 78.3582 },
  { id: 'mock:charminar', name: 'Charminar', address: 'Ghansi Bazaar, Hyderabad', lat: 17.3616, lng: 78.4747 },
  { id: 'mock:rgia', name: 'Rajiv Gandhi International Airport', address: 'Shamshabad, Hyderabad', lat: 17.2403, lng: 78.4294 },
  { id: 'mock:ameerpet', name: 'Ameerpet Metro Station', address: 'Ameerpet, Hyderabad', lat: 17.4375, lng: 78.4482 },
]

export class MockMapsProvider implements MapsProvider {
  readonly name = 'mock' as const
  calls = 0

  async search(query: string): Promise<Place[]> {
    this.calls++
    const q = query.toLowerCase()
    return PLACES.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(q)).slice(0, 8)
  }
}

let instance: MapsProvider | undefined

export function getMapsProvider(): MapsProvider {
  if (!instance) instance = env.MAPS_PROVIDER === 'google' ? new GooglePlacesProvider() : new MockMapsProvider()
  return instance
}

/** Test-only: force a specific provider instance. */
export function setMapsProvider(provider: MapsProvider | undefined): void {
  instance = provider
}
