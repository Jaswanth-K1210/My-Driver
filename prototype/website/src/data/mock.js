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

export const VEHICLE_TYPES = [
  { id: 'car', label: 'Car', icon: 'Car', available: true, description: 'Hatchbacks, Sedans, SUVs & Luxury Cars' },
  { id: 'bus', label: 'Bus', icon: 'Bus', available: false, badge: 'COMING SOON', description: 'Minibuses & Luxury Coaches' },
  { id: 'caravan', label: 'Caravan', icon: 'Tent', available: false, badge: 'COMING SOON', description: 'Motorhomes & Camper Vans' },
]

export const CAR_BRANDS = [
  {
    company: 'Maruti Suzuki',
    models: ['Swift', 'Baleno', 'Dzire', 'Brezza', 'Ertiga', 'Grand Vitara', 'Fronx', 'Jimny'],
  },
  {
    company: 'Hyundai',
    models: ['Creta', 'i20', 'Venue', 'Verna', 'Tucson', 'Alcazar', 'Exter', 'Ioniq 5'],
  },
  {
    company: 'Tata',
    models: ['Nexon', 'Punch', 'Harrier', 'Safari', 'Altroz', 'Tiago EV', 'Curvv'],
  },
  {
    company: 'Mahindra',
    models: ['XUV700', 'Scorpio-N', 'Thar', 'XUV300', 'Bolero Neo', 'XUV400 EV'],
  },
  {
    company: 'Toyota',
    models: ['Innova Crysta', 'Innova Hycross', 'Fortuner', 'Urban Cruiser Hyryder', 'Glanza', 'Camry', 'Vellfire'],
  },
  {
    company: 'Honda',
    models: ['City', 'Elevate', 'Amaze'],
  },
  {
    company: 'Kia',
    models: ['Seltos', 'Sonet', 'Carens', 'EV6'],
  },
  {
    company: 'MG',
    models: ['Hector', 'ZS EV', 'Astor', 'Comet EV', 'Gloster'],
  },
  {
    company: 'Skoda',
    models: ['Kushaq', 'Slavia', 'Kodiaq', 'Superb'],
  },
  {
    company: 'Volkswagen',
    models: ['Taigun', 'Virtus', 'Tiguan'],
  },
  {
    company: 'BMW',
    models: ['3 Series', '5 Series', 'X1', 'X3', 'X5', '7 Series', 'iX'],
  },
  {
    company: 'Mercedes-Benz',
    models: ['C-Class', 'E-Class', 'GLC', 'GLE', 'S-Class', 'EQE'],
  },
  {
    company: 'Audi',
    models: ['A4', 'A6', 'Q3', 'Q5', 'Q7', 'e-tron'],
  },
  {
    company: 'Other / Custom',
    models: ['Custom Model'],
  },
]

export const ENGINE_TYPES = ['Petrol', 'Diesel', 'Electric (EV)', 'Hybrid', 'CNG']

export const TRANSMISSIONS = ['Manual', 'Automatic']

export const SAVED_GARAGE = [
  {
    id: 'v1',
    company: 'Maruti Suzuki',
    model: 'Swift',
    engineType: 'Petrol',
    transmission: 'Manual',
    plate: 'TS09 EA 4120',
    isDefault: true,
  },
  {
    id: 'v2',
    company: 'Hyundai',
    model: 'Creta',
    engineType: 'Diesel',
    transmission: 'Automatic',
    plate: 'TS08 FG 9901',
    isDefault: false,
  },
  {
    id: 'v3',
    company: 'BMW',
    model: '5 Series',
    engineType: 'Petrol',
    transmission: 'Automatic',
    plate: 'TS10 MX 0007',
    isDefault: false,
  },
]

export const REQUIREMENTS = [
  {
    id: 'within_city',
    label: 'Within City',
    tagline: 'Point-to-point & errands',
    badge: 'Local',
    description: 'Hourly or multi-stop city transfers with real-time tracking.',
  },
  {
    id: 'inter_city',
    label: 'Inter City',
    tagline: 'Outstation trips & tours',
    badge: 'Highway',
    description: 'Highway-certified chauffeurs for multi-day outstation travel.',
  },
  {
    id: 'airport',
    label: 'Airport',
    tagline: 'Transfers & flight tracking',
    badge: 'Airport',
    description: 'Guaranteed on-time arrivals & departure pickups with luggage assist.',
  },
  {
    id: 'full_time',
    label: 'Full Time',
    tagline: 'Dedicated private chauffeur',
    badge: 'Contract',
    description: 'Standard 12h/day dedicated private chauffeur for executive or family use.',
  },
]

export const AIRPORT_LOCATIONS = [
  { id: 'rgia_t1_dep', name: 'RGIA Shamshabad · Terminal 1 (Departures)', address: 'Airport Approach Road, Shamshabad', distanceKm: 32.4, lat: 17.2403, lng: 78.4294 },
  { id: 'rgia_t1_arr', name: 'RGIA Shamshabad · Terminal 1 (Arrivals)', address: 'Pillar B4, Arrival Gate, Shamshabad', distanceKm: 32.4, lat: 17.2403, lng: 78.4294 },
  { id: 'rgia_gen_av', name: 'RGIA General Aviation (Private Jet Terminal)', address: 'North Apron, Shamshabad', distanceKm: 34.1, lat: 17.2355, lng: 78.4350 },
]

export const INTERCITY_DESTINATIONS = [
  { id: 'vijayawada', name: 'Vijayawada', state: 'Andhra Pradesh', distanceKm: 275, estHours: 5, lat: 16.5062, lng: 80.6480 },
  { id: 'warangal', name: 'Warangal', state: 'Telangana', distanceKm: 148, estHours: 3, lat: 17.9689, lng: 79.5941 },
  { id: 'nagarjuna_sagar', name: 'Nagarjuna Sagar', state: 'Telangana', distanceKm: 165, estHours: 3.5, lat: 16.5745, lng: 79.3173 },
  { id: 'srisailam', name: 'Srisailam', state: 'Andhra Pradesh', distanceKm: 215, estHours: 5, lat: 16.0718, lng: 78.8666 },
  { id: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', distanceKm: 570, estHours: 9, lat: 12.9716, lng: 77.5946 },
  { id: 'chennai', name: 'Chennai', state: 'Tamil Nadu', distanceKm: 630, estHours: 11, lat: 13.0827, lng: 80.2707 },
  { id: 'pune', name: 'Pune', state: 'Maharashtra', distanceKm: 560, estHours: 10, lat: 18.5204, lng: 73.8567 },
  { id: 'tirupati', name: 'Tirupati', state: 'Andhra Pradesh', distanceKm: 550, estHours: 9.5, lat: 13.6288, lng: 79.4192 },
]

export const CITY_LOCATIONS = [
  { id: 'start_hitec', name: 'Cyber Towers, HITEC City', area: 'HITEC City', address: 'Cyber Towers, Madhapur', lat: 17.4399, lng: 78.3813 },
  { id: 'gachibowli', name: 'Financial District, Gachibowli', area: 'Gachibowli', address: 'Financial District Road, Gachibowli', lat: 17.4256, lng: 78.3320 },
  { id: 'jubilee', name: 'Jubilee Hills Check Post', area: 'Jubilee Hills', address: 'Road No. 36, Jubilee Hills', lat: 17.4319, lng: 78.4073 },
  { id: 'banjara', name: 'Banjara Hills', area: 'Banjara Hills', address: 'Road No. 12, Banjara Hills', lat: 17.4126, lng: 78.4392 },
  { id: 'kukatpally', name: 'KPHB Colony, Kukatpally', area: 'Kukatpally', address: 'Phase 3, Kukatpally', lat: 17.4849, lng: 78.4138 },
  { id: 'begumpet', name: 'Begumpet / Punjagutta', area: 'Begumpet', address: 'Prakash Nagar, Begumpet', lat: 17.4447, lng: 78.4664 },
  { id: 'secunderabad', name: 'Secunderabad Railway Station', area: 'Secunderabad', address: 'Station Road, Secunderabad', lat: 17.4344, lng: 78.5015 },
  { id: 'inorbit', name: 'Inorbit Mall, Mindspace', area: 'Madhapur', address: 'Mindspace IT Park, Madhapur', lat: 17.4340, lng: 78.3868 },
  { id: 'kondapur', name: 'Botanical Garden, Kondapur', area: 'Kondapur', address: 'Botanical Garden Road, Kondapur', lat: 17.4587, lng: 78.3582 },
  { id: 'airport', name: 'RGIA Shamshabad (T1)', area: 'Airport', address: 'Airport Approach Road, Shamshabad', lat: 17.2403, lng: 78.4294 },
]

export const START_LOCATIONS = CITY_LOCATIONS

export const PICKUP = {
  id: 'start_hitec',
  name: 'Cyber Towers, HITEC City',
  address: 'Cyber Towers, Madhapur',
  lat: 17.4399,
  lng: 78.3813,
}

export const DROPS = [
  { id: 'gachibowli', name: 'Financial District, Gachibowli', address: 'Financial District Road, Gachibowli', distanceKm: 7.2, lat: 17.4256, lng: 78.3320 },
  { id: 'jubilee', name: 'Jubilee Hills Check Post', address: 'Road No. 36, Jubilee Hills', distanceKm: 5.8, lat: 17.4319, lng: 78.4073 },
  { id: 'banjara', name: 'Banjara Hills', address: 'Road No. 12, Banjara Hills', distanceKm: 5.4, lat: 17.4126, lng: 78.4392 },
  { id: 'kukatpally', name: 'KPHB Colony, Kukatpally', address: 'KPHB Phase 3 Main Road', distanceKm: 9.6, lat: 17.4849, lng: 78.4138 },
  { id: 'inorbit', name: 'Inorbit Mall, Mindspace', address: 'Mindspace IT Park, Madhapur', distanceKm: 3.2, lat: 17.4340, lng: 78.3868 },
  { id: 'airport', name: 'RGIA Airport Shamshabad', address: 'Terminal 1 Departures, Shamshabad', distanceKm: 31.8, lat: 17.2403, lng: 78.4294 },
]

/** Hourly hire packages — the "by hour" half of the booking widget. */
export const HOUR_PACKAGES = [
  { id: 'h1', hours: 1, includedKm: 10, label: '1 hour' },
  { id: 'h2', hours: 2, includedKm: 20, label: '2 hours' },
  { id: 'h4', hours: 4, includedKm: 40, label: '4 hours' },
  { id: 'h8', hours: 8, includedKm: 80, label: '8 hours' },
  { id: 'h12', hours: 12, includedKm: 120, label: '12 hours' },
]

export const PICKUP_TIMES = ['Now', 'In 30 min', 'In 1 hour', 'Schedule later']

export const SKILLS = [
  { id: 'MD-Standard', label: 'Standard', rate: 16, hourlyRate: 240, eta: '3 min away', tagline: 'Everyday certified', description: 'Background-verified professional drivers for daily commutes, school runs and errands.' },
  { id: 'MD-Auto', label: 'Auto Spec.', rate: 18, hourlyRate: 260, eta: '2 min away', tagline: 'Automatic Expert', description: 'Specialized in automatic transmission, dual-clutch, and hybrid/EV vehicle dynamics.' },
  { id: 'MD-SUV', label: 'SUV Pro', rate: 22, hourlyRate: 330, eta: '6 min away', tagline: 'Large SUVs & 4x4', description: 'Certified for 6/7-seater SUVs, hill driving, heavy traffic, and highway dynamics.' },
  { id: 'MD-Lux', label: 'Lux Chauffeur', rate: 35, hourlyRate: 520, eta: '8 min away', tagline: 'Executive class', description: 'Hospitality-trained executive chauffeurs for luxury sedans (Mercedes, BMW, Audi).' },
  { id: 'MD-Night', label: 'Highway & Night', rate: 19, hourlyRate: 280, eta: '4 min away', tagline: 'Outstation & Night', description: 'Night and long-distance highway specialists with 24x7 Safety Desk live monitoring.' },
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
