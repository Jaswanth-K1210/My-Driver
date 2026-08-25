/* ── Marketing ─────────────────────────────────────────────────────────── */

export const NAV_LINKS = [
  { label: 'Skills', href: '#skills' },
  { label: 'Safety', href: '#safety' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

export const HERO_WORDS = ['daily commute', 'airport run', 'late night', 'family trip']

export const TRUST_MARKS = [
  'Police-verified drivers',
  'Speed ceiling on every trip',
  'Guardian live tracking',
]

export const STATS = [
  { value: '12,400+', label: 'Certified drivers' },
  { value: '98.7%', label: 'On-time pickup' },
  { value: '3.2L+', label: 'Safe trips completed' },
  { value: '24x7', label: 'Safety desk monitoring' },
]

/* ── Booking ───────────────────────────────────────────────────────────── */

export const PICKUP = {
  id: 'current',
  name: 'Current location',
  address: 'Cyber Towers, HITEC City',
  lat: 17.4399,
  lng: 78.3813,
}

// Coordinates are real Hyderabad locations: the backend prices and dispatches
// on lat/lng, so these must be genuine. distanceKm stays only as the offline
// fallback estimate shown before the server quote returns.
export const DROPS = [
  { id: 'gachibowli', name: 'Gachibowli', address: 'Financial District Road, Gachibowli', distanceKm: 7.2, lat: 17.4256, lng: 78.3320 },
  { id: 'airport', name: 'RGIA Airport', address: 'Terminal 1 Departures, Shamshabad', distanceKm: 31.8, lat: 17.2403, lng: 78.4294 },
  { id: 'banjara', name: 'Banjara Hills', address: 'Road No. 12, Banjara Hills', distanceKm: 5.4, lat: 17.4126, lng: 78.4392 },
  { id: 'kukatpally', name: 'Kukatpally', address: 'KPHB Phase 3 Main Road', distanceKm: 9.6, lat: 17.4849, lng: 78.4138 },
]

/** Hourly hire packages — the "by hour" half of the booking widget. */
export const HOUR_PACKAGES = [
  { id: 'h2', hours: 2, includedKm: 20, label: '2 hours' },
  { id: 'h4', hours: 4, includedKm: 40, label: '4 hours' },
  { id: 'h8', hours: 8, includedKm: 80, label: '8 hours' },
  { id: 'h12', hours: 12, includedKm: 120, label: '12 hours' },
]

export const PICKUP_TIMES = ['Now', 'In 30 min', 'In 1 hour', 'Schedule later']

export const SKILLS = [
  { id: 'MD-Standard', label: 'Standard', rate: 16, hourlyRate: 240, eta: '3 min away', tagline: 'Everyday certified', description: 'Background-verified professional drivers for daily commutes, school runs and errands.' },
  { id: 'MD-Auto', label: 'Auto', rate: 12, hourlyRate: 180, eta: '2 min away', tagline: 'Auto rickshaw hires', description: 'Metered auto rides with the same verification, speed ceiling and guardian tracking.' },
  { id: 'MD-SUV', label: 'SUV', rate: 22, hourlyRate: 330, eta: '6 min away', tagline: 'Family sized', description: '6-seater SUVs with luggage space, child-seat options and top-rated drivers.' },
  { id: 'MD-Lux', label: 'Lux', rate: 35, hourlyRate: 520, eta: '8 min away', tagline: 'Executive class', description: 'Luxury sedans with hospitality-trained chauffeurs for business and events.' },
  { id: 'MD-Night', label: 'Night', rate: 19, hourlyRate: 280, eta: '4 min away', tagline: '10 PM – 5 AM', description: 'Night-specialist drivers with mandatory Safety Desk live monitoring on every trip.' },
]

export const VISION_MODES = [
  { id: 'R', name: 'Road', desc: 'Road & traffic recording' },
  { id: 'D', name: 'Driver', desc: 'Driver-focused cabin cam' },
  { id: 'F', name: 'Full cabin', desc: 'Complete interior coverage' },
]

export const PLATFORM_FEE = 19
export const NIGHT_FEE = 30

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
  { id: 'TRP-8492', date: 'Aug 14, 2026 · 9:42 PM', from: 'Jubilee Hills', to: 'Gachibowli', skill: 'MD-Night', driver: 'Ramesh K.', fare: 342, maxSpeed: 62, ceiling: 60, visionMode: 'F', breaches: 1, certId: 'MV-2026-08492', preInspection: '9:18 PM', postInspection: '10:31 PM' },
  { id: 'TRP-8461', date: 'Aug 11, 2026 · 8:05 AM', from: 'HITEC City', to: 'Banjara Hills', skill: 'MD-Lux', driver: 'Vikram R.', fare: 512, maxSpeed: 58, ceiling: 70, visionMode: 'R', breaches: 0, certId: 'MV-2026-08461', preInspection: '7:41 AM', postInspection: '8:39 AM' },
  { id: 'TRP-8433', date: 'Aug 8, 2026 · 6:30 PM', from: 'Gachibowli', to: 'Kukatpally', skill: 'MD-Standard', driver: 'Imran S.', fare: 186, maxSpeed: 51, ceiling: 60, visionMode: 'D', breaches: 0, certId: 'MV-2026-08433', preInspection: '6:04 PM', postInspection: '7:02 PM' },
]

/* ── Marketing sections ────────────────────────────────────────────────── */

export const SAFETY_FEATURES = [
  { title: 'Speed Ceiling', icon: 'gauge', description: 'You set the limit before the trip starts. The vehicle alerts and logs every breach past your chosen ceiling — default 60 km/h in city.' },
  { title: 'VisionCam Modes', icon: 'camera', description: 'Choose Mode R (road), Mode D (driver) or Mode F (full cabin) recording before every ride. Footage is sealed into the Trip Vault.' },
  { title: 'Guardian Link', icon: 'users', description: 'Share a live trip link with up to 3 emergency contacts over SMS or WhatsApp. They see route, speed and stops in real time.' },
  { title: 'Silent SOS', icon: 'siren', description: 'Triple-press the volume button to silently alert our 24x7 Safety Desk, stream location and notify guardians — without the driver knowing.' },
  { title: '8-Point Inspection', icon: 'clipboard', description: 'Drivers capture watermarked photos of 8 car zones before engine start. Pre and post-ride condition is timestamped and immutable.' },
  { title: 'Trip Vault', icon: 'archive', description: 'Every trip is archived with route, telematics, inspection photos and an exportable certificate for insurance or legal use.' },
]

export const STEPS = [
  { step: '01', title: 'Book & configure', description: 'Pick a skill certification, set your speed ceiling and choose a VisionCam mode. Fare is locked upfront.' },
  { step: '02', title: 'Verified pickup', description: 'Your driver passes a live face-match check and enters your OTP before the engine can start. Car condition is photographed.' },
  { step: '03', title: 'Monitored ride', description: 'Telematics score the drive while guardians track live. The Safety Desk escalates any anomaly from L0 to L5 within minutes.' },
]

export const PRICING = [
  { name: 'Essential', price: '₹16', unit: '/km', blurb: 'Daily commutes with full safety stack.', features: ['MD-Standard drivers', 'Speed ceiling control', 'Guardian link (2 contacts)', 'Trip Vault 30-day archive'], cta: 'Ride Essential', featured: false },
  { name: 'Comfort+', price: '₹22', unit: '/km', blurb: 'Family rides with priority response.', features: ['MD-SUV & MD-Night access', 'VisionCam all modes', 'Guardian link (3 contacts)', 'Priority Safety Desk SLA', 'Trip Vault 1-year archive'], cta: 'Ride Comfort+', featured: true },
  { name: 'Corporate', price: 'Custom', unit: '', blurb: 'Employee transport with compliance.', features: ['Dedicated account manager', 'Policy-based speed ceilings', 'Consolidated billing & GST', 'Audit-grade Trip Vault export', 'API & SSO integration'], cta: 'Talk to sales', featured: false },
]

export const TESTIMONIALS = [
  { quote: 'My daughter travels back from college at night. The speed ceiling and guardian link mean I can finally sleep before she is home.', name: 'Lakshmi Narayanan', role: 'Parent, Jubilee Hills' },
  { quote: 'The Trip Vault certificate settled an insurance claim in days instead of months. The photo evidence was undeniable.', name: 'Arjun Mehta', role: 'MD-Lux subscriber, Banjara Hills' },
  { quote: 'We moved 400 employee pickups to MyDriver. Policy ceilings and audit exports made our compliance team very happy.', name: 'Sravani Reddy', role: 'Admin Head, IT park, Gachibowli' },
]

export const FAQS = [
  { q: 'How are MyDriver drivers verified?', a: 'Every driver clears a police background check, licence validation, in-person driving assessment and psychometric screening before earning any MD certification. Re-certification happens every 6 months.' },
  { q: 'What happens when the speed ceiling is breached?', a: 'The driver gets an in-cab alert instantly, the event is logged to the immutable trip ledger, guardians are notified, and repeated breaches trigger L1 escalation to the Safety Desk which can pause the trip.' },
  { q: 'Is my trip footage private?', a: 'Yes. VisionCam footage is encrypted and sealed into your Trip Vault. It is only released to you, or to law enforcement through a documented evidence packet that is itself audit-logged.' },
  { q: 'Does Silent SOS work without internet?', a: 'The triple volume-press queues the alert locally and sends it over SMS fallback if data is unavailable, so the Safety Desk still receives it.' },
  { q: 'Which cities is MyDriver available in?', a: 'We currently operate across Hyderabad with Chennai, Bengaluru and Pune launching next quarter.' },
]
