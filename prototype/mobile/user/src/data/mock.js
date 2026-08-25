export const CUSTOMER = {
  name: 'Priya Sharma',
  initials: 'PS',
  memberSince: '2024',
  rating: 4.9,
}

export const PICKUP = {
  id: 'current',
  name: 'Current location',
  address: 'Cyber Towers, HITEC City',
  lat: 17.4399,
  lng: 78.3813,
}

// Real Hyderabad coordinates: the backend prices and dispatches on lat/lng.
// distanceKm remains only as the offline estimate shown before the server quote.
export const DROPS = [
  { id: 'gachibowli', name: 'Gachibowli', address: 'Financial District Road, Gachibowli', distanceKm: 7.2, lat: 17.4256, lng: 78.3320 },
  { id: 'airport', name: 'RGIA Airport', address: 'Terminal 1 Departures, Shamshabad', distanceKm: 31.8, lat: 17.2403, lng: 78.4294 },
  { id: 'banjara', name: 'Banjara Hills', address: 'Road No. 12, Banjara Hills', distanceKm: 5.4, lat: 17.4126, lng: 78.4392 },
  { id: 'kukatpally', name: 'Kukatpally', address: 'KPHB Phase 3 Main Road', distanceKm: 9.6, lat: 17.4849, lng: 78.4138 },
]

export const SKILLS = [
  { id: 'MD-Standard', label: 'Standard', rate: 16, eta: '3 min away' },
  { id: 'MD-Auto', label: 'Auto', rate: 12, eta: '2 min away' },
  { id: 'MD-SUV', label: 'SUV', rate: 22, eta: '6 min away' },
  { id: 'MD-Lux', label: 'Lux', rate: 35, eta: '8 min away' },
  { id: 'MD-Night', label: 'Night', rate: 19, eta: '4 min away' },
]

export const VISION_MODES = [
  { id: 'R', name: 'Road', desc: 'Road & traffic recording' },
  { id: 'D', name: 'Driver', desc: 'Driver-focused cabin cam' },
  { id: 'F', name: 'Full cabin', desc: 'Complete interior coverage' },
]

export const DRIVERS = [
  { name: 'Ramesh K.', initials: 'RK', vehicle: 'Toyota Innova', plate: 'TS09 EZ 4412', rating: 4.9, trips: 3820, score: 96 },
  { name: 'Imran S.', initials: 'IS', vehicle: 'Maruti Ertiga', plate: 'TS07 UA 8871', rating: 4.8, trips: 2140, score: 93 },
  { name: 'Vikram R.', initials: 'VR', vehicle: 'Hyundai Aura', plate: 'TS11 FJ 1209', rating: 4.9, trips: 1560, score: 97 },
  { name: 'Anil T.', initials: 'AT', vehicle: 'MG Hector', plate: 'TS04 KC 5523', rating: 4.7, trips: 990, score: 91 },
  { name: 'Suresh B.', initials: 'SB', vehicle: 'Auto Rickshaw', plate: 'TS03 EE 7745', rating: 4.8, trips: 5230, score: 95 },
]

export const DEFAULT_GUARDIANS = [
  { id: 'g1', name: 'Rajesh Sharma', relation: 'Father', phone: '9848012345' },
  { id: 'g2', name: 'Meera Sharma', relation: 'Sister', phone: '9701023456' },
]

export const MAX_GUARDIANS = 3

export const PAST_TRIPS = [
  {
    id: 'TRP-8492',
    date: 'Aug 14, 2026 · 9:42 PM',
    from: 'Jubilee Hills',
    to: 'Gachibowli',
    skill: 'MD-Night',
    driver: 'Ramesh K.',
    fare: 342,
    maxSpeed: 62,
    ceiling: 60,
    visionMode: 'F',
    breaches: 1,
    certId: 'MV-2026-08492',
    preInspection: '9:18 PM',
    postInspection: '10:31 PM',
  },
  {
    id: 'TRP-8461',
    date: 'Aug 11, 2026 · 8:05 AM',
    from: 'HITEC City',
    to: 'Banjara Hills',
    skill: 'MD-Lux',
    driver: 'Vikram R.',
    fare: 512,
    maxSpeed: 58,
    ceiling: 70,
    visionMode: 'R',
    breaches: 0,
    certId: 'MV-2026-08461',
    preInspection: '7:41 AM',
    postInspection: '8:39 AM',
  },
  {
    id: 'TRP-8433',
    date: 'Aug 8, 2026 · 6:30 PM',
    from: 'Gachibowli',
    to: 'Kukatpally',
    skill: 'MD-Standard',
    driver: 'Imran S.',
    fare: 186,
    maxSpeed: 51,
    ceiling: 60,
    visionMode: 'D',
    breaches: 0,
    certId: 'MV-2026-08433',
    preInspection: '6:04 PM',
    postInspection: '7:02 PM',
  },
]
