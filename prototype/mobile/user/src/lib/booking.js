import {
  AIRPORT_LOCATIONS,
  CITY_LOCATIONS,
  DROPS,
  HOUR_PACKAGES,
  INTERCITY_DESTINATIONS,
  NIGHT_FEE,
  PICKUP,
  PLATFORM_FEE,
  SAVED_GARAGE,
  SKILLS,
  START_LOCATIONS,
} from '../data/mock.js'

export const ROAD_FACTOR = 1.35
const EARTH_RADIUS_M = 6_371_008.8
const toRad = (deg) => (deg * Math.PI) / 180

export function haversineDistanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return 5
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
  return Math.max(1, (meters / 1000) * ROAD_FACTOR)
}

export function getLocationById(id) {
  if (!id || id === 'same_as_pickup') return null
  return (
    CITY_LOCATIONS.find((l) => l.id === id) ||
    INTERCITY_DESTINATIONS.find((l) => l.id === id) ||
    AIRPORT_LOCATIONS.find((l) => l.id === id) ||
    DROPS.find((l) => l.id === id) ||
    START_LOCATIONS.find((l) => l.id === id) ||
    null
  )
}

export const DEFAULT_CONFIG = {
  vehicleType: 'car', // 'car' | 'bus' | 'caravan'
  carDetails: {
    company: SAVED_GARAGE[0].company,
    model: SAVED_GARAGE[0].model,
    engineType: SAVED_GARAGE[0].engineType,
    transmission: SAVED_GARAGE[0].transmission,
    plate: SAVED_GARAGE[0].plate,
    isCustom: false,
    savedVehicleId: SAVED_GARAGE[0].id,
  },
  requirement: 'within_city', // 'within_city' | 'inter_city' | 'airport' | 'full_time'
  tripType: 'one_way', // 'one_way' | 'two_way'
  
  // Within-city Route Planner State
  pickupId: 'start_hitec',
  stops: [], // [{ id: 'stop_1', locationId: '' }]
  dropId: 'gachibowli',
  returnStops: [], // [{ id: 'ret_stop_1', locationId: '' }]
  returnDropId: 'same_as_pickup', // 'same_as_pickup' or a location id

  // Outstation / Inter City State
  interCityDetails: {
    startLocationId: 'start_hitec',
    stops: [],
    destinationId: 'vijayawada',
    returnStops: [],
    returnDropId: 'same_as_pickup',
    durationUnit: 'days', // 'days' | 'hours'
    days: 1,
    hours: 12,
  },
  interCityDestination: 'vijayawada',
  interCityDays: 1,
  
  // Airport State
  airportDetails: {
    terminalId: 'rgia_t1_dep',
    flow: 'departure', // 'departure' | 'arrival'
    flightNumber: '',
  },
  
  // Full-time State
  durationHours: 1,
  fullTimeDetails: {
    locality: 'HITEC City & Gachibowli',
    durationUnit: 'months', // 'days' | 'weeks' | 'months'
    durationCount: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    workingHoursPerDay: 12,
    overtimeRatePerHour: 150,
  },
  pickupDate: 'Today',
  pickupTime: 'Now',
  skillId: 'MD-Standard',
  ceiling: 60,
  visionMode: 'R',
}

/** Determines the most suitable driver certification for given car specs and requirement. */
export function getRecommendedSkillId(carDetails = {}, requirement = 'within_city') {
  if (requirement === 'inter_city') {
    return 'MD-Night' // Outstation / Highway specialist
  }
  if (['BMW', 'Mercedes-Benz', 'Audi'].includes(carDetails.company)) {
    return 'MD-Lux'
  }
  if (
    ['Innova Crysta', 'Innova Hycross', 'Fortuner', 'XUV700', 'Scorpio-N', 'Harrier', 'Safari', 'Hector'].includes(
      carDetails.model,
    )
  ) {
    return 'MD-SUV'
  }
  if (carDetails.transmission === 'Automatic') {
    return 'MD-Auto'
  }
  return 'MD-Standard'
}

export function skillFor(skillId, skills = SKILLS) {
  return skills.find((s) => s.id === skillId) ?? skills[0]
}

export function dropFor(dropId) {
  return DROPS.find((d) => d.id === dropId) || CITY_LOCATIONS.find((d) => d.id === dropId) || DROPS[0]
}

export function packageFor(packageId) {
  return HOUR_PACKAGES.find((p) => p.id === packageId) ?? HOUR_PACKAGES[0]
}

/**
 * Computes the minimum physical/contractual duration required for a given booking config.
 * Prevents selecting durations that are shorter than the physical travel time.
 */
export function getMinDurationForConfig(config) {
  if (!config) return { minHours: 2, label: 'Minimum 2 hours' }

  // 1. Full-time
  if (config.requirement === 'full_time') {
    return {
      minHours: 12,
      minUnitCount: 1,
      label: 'Minimum 1 duration unit (12 hrs/day included)',
    }
  }

  // 2. Airport
  if (config.requirement === 'airport') {
    return {
      minHours: 3,
      label: 'Airport transfers require at least 3 hours buffer',
    }
  }

  // 3. Within City
  if (config.requirement === 'within_city') {
    const startLoc = getLocationById(config.pickupId || 'start_hitec') ?? CITY_LOCATIONS[0]
    const dest = getLocationById(config.dropId || 'gachibowli') ?? CITY_LOCATIONS[1]
    const isTwoWay = config.tripType === 'two_way'

    const validOutboundStops = (config.stops || [])
      .map((s) => getLocationById(s.locationId))
      .filter(Boolean)

    let outboundKm = 0
    let cur = startLoc
    for (const stop of validOutboundStops) {
      outboundKm += haversineDistanceKm(cur, stop)
      cur = stop
    }
    outboundKm += haversineDistanceKm(cur, dest)

    let returnKm = 0
    const validReturnStops = (config.returnStops || [])
      .map((s) => getLocationById(s.locationId))
      .filter(Boolean)

    if (isTwoWay) {
      const returnDrop = config.returnDropId === 'same_as_pickup' || !config.returnDropId
        ? startLoc
        : (getLocationById(config.returnDropId) ?? startLoc)
      let retCur = dest
      for (const stop of validReturnStops) {
        returnKm += haversineDistanceKm(retCur, stop)
        retCur = stop
      }
      returnKm += haversineDistanceKm(retCur, returnDrop)
    }

    const totalKm = outboundKm + returnKm
    const totalStops = validOutboundStops.length + (isTwoWay ? validReturnStops.length : 0)
    
    // Average city traffic speed ~25km/h, +30m per stop buffer
    const driveMinutes = Math.round((totalKm / 25) * 60) + (totalStops * 30)
    const requiredMinutes = driveMinutes + 10 // Minimum selected duration must be 10 min greater than travel time
    const minHours = Math.max(1, Math.ceil(requiredMinutes / 60))

    return {
      minHours,
      label: minHours > 1 
        ? `Travel time (~${driveMinutes} mins + 10 min buffer) requires min. ${minHours} hrs`
        : '1 hour minimum package',
    }
  }

  // 4. Inter-City (Outstation)
  if (config.requirement === 'inter_city') {
    const dest = getLocationById(config.interCityDetails?.destinationId || config.interCityDestination || 'vijayawada') ?? INTERCITY_DESTINATIONS[0]
    const isTwoWay = config.tripType === 'two_way'
    const baseEstHours = dest?.estHours || Math.ceil((dest?.distanceKm || 200) / 55)

    const validOutboundStops = (config.interCityDetails?.stops || [])
      .map((s) => getLocationById(s.locationId))
      .filter(Boolean)
    const validReturnStops = (config.interCityDetails?.returnStops || [])
      .map((s) => getLocationById(s.locationId))
      .filter(Boolean)

    const outboundHours = baseEstHours + (validOutboundStops.length * 0.5)
    const returnHours = isTwoWay ? (baseEstHours + (validReturnStops.length * 0.5)) : 0
    const totalEstDriveHours = Math.ceil(outboundHours + returnHours)

    return {
      minHours: totalEstDriveHours,
      minDays: totalEstDriveHours > 24 ? Math.ceil(totalEstDriveHours / 24) : 0,
      label: isTwoWay
        ? `${dest.name} Round Trip (~${(dest.distanceKm || 250) * 2}km) requires min. ${totalEstDriveHours} hrs driving time`
        : `${dest.name} (~${dest.distanceKm || 250}km) requires min. ${totalEstDriveHours} hrs driving time`,
    }
  }

  return { minHours: 2, label: 'Minimum 2 hours' }
}

/**
 * Calculates road distance, estimated drive duration, and stop info for a single route leg.
 */
export function getRouteLegTelemetry(startId, stops = [], destId, isInterCity = false) {
  const startLoc = getLocationById(startId) ?? (isInterCity ? START_LOCATIONS[0] : CITY_LOCATIONS[0])
  const destLoc = getLocationById(destId) ?? (isInterCity ? INTERCITY_DESTINATIONS[0] : CITY_LOCATIONS[1])

  const validStops = (stops || [])
    .map((s) => (typeof s === 'string' ? getLocationById(s) : getLocationById(s?.locationId)))
    .filter(Boolean)

  let legKm = 0
  let cur = startLoc

  for (const stop of validStops) {
    legKm += haversineDistanceKm(cur, stop)
    cur = stop
  }

  if (isInterCity && destLoc?.distanceKm && validStops.length === 0) {
    legKm = destLoc.distanceKm
  } else {
    legKm += destLoc?.distanceKm ? destLoc.distanceKm : haversineDistanceKm(cur, destLoc)
  }

  const roundedKm = Math.max(1, Math.round(legKm))
  
  // Driving duration in minutes
  // Outstation highway: ~55km/h; Within city: ~25km/h
  const avgSpeedKmH = isInterCity ? 55 : 25
  const baseMinutes = Math.round((roundedKm / avgSpeedKmH) * 60)
  const stopMinutes = validStops.length * 30 // 30m buffer per stop
  const totalMinutes = Math.max(15, baseMinutes + stopMinutes)

  let formattedDuration = ''
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60

  if (hours > 0 && mins > 0) {
    formattedDuration = `${hours} hr${hours > 1 ? 's' : ''} ${mins} min${mins > 1 ? 's' : ''}`
  } else if (hours > 0) {
    formattedDuration = `${hours} hr${hours > 1 ? 's' : ''}`
  } else {
    formattedDuration = `${mins} mins`
  }

  return {
    distanceKm: roundedKm,
    durationMinutes: totalMinutes,
    formattedDuration,
    stopsCount: validStops.length,
    tag: validStops.length > 0 ? `via ${validStops.length} stop${validStops.length > 1 ? 's' : ''}` : isInterCity ? 'Direct highway' : 'Direct route',
  }
}

/**
 * Local fare estimate, shown instantly while typing.
 * Supports Within City, Inter City, Airport, and Full Time contracts.
 * Accurately handles multi-stop waypoints and round-trip return legs.
 */
export function quoteFor(config, skills = SKILLS) {
  const skill = skillFor(config.skillId, skills)
  const nightFee = config.skillId === 'MD-Night' ? NIGHT_FEE : 0

  // 1. Full Time Contract
  if (config.requirement === 'full_time') {
    const { durationUnit, durationCount } = config.fullTimeDetails
    let unitRate = 26000
    let unitLabel = 'month'
    if (durationUnit === 'days') {
      unitRate = 1400
      unitLabel = 'day'
    } else if (durationUnit === 'weeks') {
      unitRate = 8500
      unitLabel = 'week'
    }

    const base = unitRate * durationCount
    const gst = Math.round(base * 0.05)
    return {
      skill,
      nightFee: 0,
      ready: true,
      lines: [
        { label: 'Contract duration', value: `${durationCount} ${unitLabel}${durationCount > 1 ? 's' : ''}` },
        { label: 'Base daily hours', value: '12 hrs/day included' },
        { label: 'Overtime rate', value: '₹150 / additional hour' },
        { label: 'Driver tier', value: skill.label },
        { label: 'GST (5%)', value: `₹${gst}` },
      ],
      base,
      total: base + gst,
      distanceKm: 0,
      note: 'Regular full-time includes 12 hours/day. Extra hours billed at ₹150/hr.',
    }
  }

  // 2. Inter City (Outstation) with Multi-stop & Round-trip
  if (config.requirement === 'inter_city') {
    const startLoc = getLocationById(config.interCityDetails?.startLocationId || 'start_hitec') ?? CITY_LOCATIONS[0]
    const dest = getLocationById(config.interCityDetails?.destinationId || config.interCityDestination || 'vijayawada') ?? INTERCITY_DESTINATIONS[0]
    
    // Outbound stops
    const validOutboundStops = (config.interCityDetails?.stops || [])
      .map((s) => getLocationById(s.locationId))
      .filter(Boolean)

    // Calculate outbound distance
    let outboundKm = 0
    let curPoint = startLoc
    for (const stop of validOutboundStops) {
      outboundKm += haversineDistanceKm(curPoint, stop)
      curPoint = stop
    }
    outboundKm += dest.distanceKm ? dest.distanceKm : haversineDistanceKm(curPoint, dest)

    // Return leg
    const isTwoWay = config.tripType === 'two_way'
    let returnKm = 0
    let returnDropName = startLoc.name
    const validReturnStops = (config.interCityDetails?.returnStops || [])
      .map((s) => getLocationById(s.locationId))
      .filter(Boolean)

    if (isTwoWay) {
      const returnDropLoc = config.interCityDetails?.returnDropId === 'same_as_pickup' || !config.interCityDetails?.returnDropId
        ? startLoc
        : (getLocationById(config.interCityDetails.returnDropId) ?? startLoc)
      returnDropName = returnDropLoc.name

      let retCur = dest
      for (const stop of validReturnStops) {
        returnKm += haversineDistanceKm(retCur, stop)
        retCur = stop
      }
      returnKm += dest.distanceKm ? dest.distanceKm : haversineDistanceKm(retCur, returnDropLoc)
    }

    const totalKm = Math.round(outboundKm + returnKm)
    const totalStopsCount = validOutboundStops.length + (isTwoWay ? validReturnStops.length : 0)
    const stopsAllowance = totalStopsCount * 100 // ₹100 per outstation stop

    const days = Math.max(0, config.interCityDetails?.days ?? config.interCityDays ?? 1)
    const hours = Math.max(0, config.interCityDetails?.hours ?? 0)
    const totalHours = (days * 24) + hours

    let durationText = ''
    if (days > 0 && hours > 0) {
      durationText = `${days} Day${days > 1 ? 's' : ''} ${hours} Hr${hours > 1 ? 's' : ''} (${totalHours}h)`
    } else if (days > 0) {
      durationText = `${days} Day${days > 1 ? 's' : ''} (${totalHours}h)`
    } else {
      durationText = `${Math.max(4, hours)} Hours`
    }

    const dailyBatta = days > 0 ? (350 * days) + (hours >= 6 ? 200 : 0) : 250
    const kmFare = Math.round(totalKm * skill.rate * 0.85)
    const timeBase = (days * 1800) + (hours * 85)
    const base = Math.max(timeBase, kmFare) + dailyBatta + stopsAllowance

    const lines = [
      { label: 'Start location', value: startLoc.name },
      { label: 'Outbound destination', value: dest.name },
    ]

    if (validOutboundStops.length > 0) {
      lines.push({ label: 'Outbound stops', value: `${validOutboundStops.length} stop(s) (${validOutboundStops.map(s => s.name.split(',')[0]).join(' ➔ ')})` })
    }

    if (isTwoWay) {
      lines.push({ label: 'Return route', value: `${dest.name} ➔ ${validReturnStops.length > 0 ? validReturnStops.map(s => s.name.split(',')[0]).join(' ➔ ') + ' ➔ ' : ''}${returnDropName}` })
    }

    lines.push(
      { label: 'Route type', value: isTwoWay ? 'Round Trip (Two-way)' : 'One Way' },
      { label: 'Est. total distance', value: `~${totalKm} km` },
      { label: 'Total duration', value: durationText },
      { label: 'Driver allowance / batta', value: `₹${dailyBatta}` },
      { label: 'Platform & safety fee', value: `₹${PLATFORM_FEE}` },
    )

    return {
      skill,
      nightFee,
      ready: true,
      lines,
      base,
      total: base + PLATFORM_FEE + nightFee,
      distanceKm: totalKm,
      durationLabel: durationText,
    }
  }

  // 3. Airport Transfer
  if (config.requirement === 'airport') {
    const airportLoc = AIRPORT_LOCATIONS.find((a) => a.id === config.airportDetails.terminalId) ?? AIRPORT_LOCATIONS[0]
    const isTwoWay = config.tripType === 'two_way'
    const distanceKm = Math.round(airportLoc.distanceKm * (isTwoWay ? 1.8 : 1.0))
    const baseCorridorFare = 749 + (skill.rate * 12)
    const tollAllowance = 140
    const base = Math.round(baseCorridorFare * (isTwoWay ? 1.75 : 1.0)) + tollAllowance

    return {
      skill,
      nightFee,
      ready: true,
      lines: [
        { label: 'Corridor', value: `${airportLoc.name}` },
        { label: 'Transfer type', value: isTwoWay ? 'Round-trip' : (config.airportDetails.flow === 'arrival' ? 'Airport Pickup' : 'Airport Drop') },
        { label: 'Estimated distance', value: `${distanceKm} km` },
        { label: 'Toll & parking allowance', value: `₹${tollAllowance}` },
        { label: 'Platform fee', value: `₹${PLATFORM_FEE}` },
      ],
      base,
      total: base + PLATFORM_FEE + nightFee,
      distanceKm,
    }
  }

  // 4. Within City with Multi-Stops & Round-Trip
  const pickupLoc = getLocationById(config.pickupId || 'start_hitec') ?? CITY_LOCATIONS[0]
  const dropLoc = getLocationById(config.dropId || 'gachibowli') ?? DROPS[0]
  
  // Calculate outbound multi-stop distance
  const validOutboundStops = (config.stops || [])
    .map((s) => getLocationById(s.locationId))
    .filter(Boolean)

  let outboundDistanceKm = 0
  let currentLoc = pickupLoc
  for (const stop of validOutboundStops) {
    outboundDistanceKm += haversineDistanceKm(currentLoc, stop)
    currentLoc = stop
  }
  outboundDistanceKm += haversineDistanceKm(currentLoc, dropLoc)

  // Calculate return leg multi-stop distance if round trip
  const isTwoWay = config.tripType === 'two_way'
  let returnDistanceKm = 0
  let returnDropName = pickupLoc.name
  const validReturnStops = (config.returnStops || [])
    .map((s) => getLocationById(s.locationId))
    .filter(Boolean)

  if (isTwoWay) {
    const returnDropLoc = config.returnDropId === 'same_as_pickup' || !config.returnDropId
      ? pickupLoc
      : (getLocationById(config.returnDropId) ?? pickupLoc)
    returnDropName = returnDropLoc.name

    let returnCurrentLoc = dropLoc
    for (const stop of validReturnStops) {
      returnDistanceKm += haversineDistanceKm(returnCurrentLoc, stop)
      returnCurrentLoc = stop
    }
    returnDistanceKm += haversineDistanceKm(returnCurrentLoc, returnDropLoc)
  }

  const totalKm = Math.max(3, Math.round(outboundDistanceKm + returnDistanceKm))
  const totalStopsCount = validOutboundStops.length + (isTwoWay ? validReturnStops.length : 0)
  const stopsAllowance = totalStopsCount * 60 // ₹60 per city intermediate stop

  const durationAddon = Math.max(0, (config.durationHours - 2) * 60)
  const base = Math.round(totalKm * skill.rate) + durationAddon + stopsAllowance

  const lines = [
    { label: 'Trip type', value: isTwoWay ? 'Round-trip (Two-way)' : 'One-way' },
    { label: 'Pickup', value: pickupLoc.name },
    { label: 'Destination', value: dropLoc.name },
  ]

  if (validOutboundStops.length > 0) {
    lines.push({
      label: 'Outbound stops',
      value: `${validOutboundStops.length} stop(s) (${validOutboundStops.map(s => s.name.split(',')[0]).join(' ➔ ')})`,
    })
  }

  if (isTwoWay) {
    lines.push({
      label: 'Return route',
      value: `${dropLoc.name.split(',')[0]} ➔ ${validReturnStops.length > 0 ? validReturnStops.map(s => s.name.split(',')[0]).join(' ➔ ') + ' ➔ ' : ''}${returnDropName.split(',')[0]}`,
    })
  }

  lines.push(
    { label: 'Total distance', value: `~${totalKm} km` },
    { label: 'Duration estimate', value: `${config.durationHours} hrs` },
    { label: `${skill.label} rate`, value: `₹${skill.rate}/km` },
  )

  if (stopsAllowance > 0) {
    lines.push({ label: 'Stops convenience fee', value: `₹${stopsAllowance}` })
  }

  lines.push({ label: 'Platform fee', value: `₹${PLATFORM_FEE}` })

  return {
    skill,
    nightFee,
    ready: true,
    lines,
    base,
    total: base + PLATFORM_FEE + nightFee,
    distanceKm: totalKm,
  }
}

export function bookingPayloadFor(config, skills = SKILLS) {
  const skill = skillFor(config.skillId, skills)

  const basePayload = {
    stops: config.stops,
    return_stops: config.returnStops,
    return_drop: config.returnDropId && config.returnDropId !== 'same_as_pickup' 
        ? (() => { const d = getLocationById(config.returnDropId); return d ? {lat: d.lat, lng: d.lng} : null; })()
        : null,
    car_details: config.carDetails,
    vision_mode: config.visionMode,
    flight_number: config.flightNumber || config.airportDetails?.flightNumber,
    requirement: config.requirement,
    trip_type: config.tripType,
  }

  if (config.requirement === 'full_time' || config.durationHours > 8) {
    return {
      booking_type: 'HOURLY',
      hours: Math.min(12, config.durationHours || 4),
      pickup: { lat: PICKUP.lat, lng: PICKUP.lng },
      pickup_address: PICKUP.address,
      required_certification: skill.id,
      speed_ceiling_kmh: config.ceiling,
      ...basePayload,
    }
  }

  let pickup = { lat: PICKUP.lat, lng: PICKUP.lng }
  let pickup_address = PICKUP.address
  let drop = null
  let drop_address = ''

  if (config.requirement === 'inter_city') {
    const startLocId = config.interCityDetails?.startLocationId || 'start_hitec'
    const startLoc = START_LOCATIONS.find((s) => s.id === startLocId) ?? START_LOCATIONS[0]
    pickup = { lat: startLoc.lat, lng: startLoc.lng }
    pickup_address = startLoc.address || startLoc.name

    const destId = config.interCityDetails?.destinationId || config.interCityDestination || 'vijayawada'
    const dest = INTERCITY_DESTINATIONS.find((d) => d.id === destId) ?? INTERCITY_DESTINATIONS[0]
    drop = { lat: dest.lat, lng: dest.lng }
    drop_address = dest.name
    basePayload.stops = config.interCityDetails?.stops || config.stops
    basePayload.return_stops = config.interCityDetails?.returnStops || config.returnStops
  } else if (config.requirement === 'airport') {
    const airportLoc = AIRPORT_LOCATIONS.find((a) => a.id === config.airportDetails.terminalId) ?? AIRPORT_LOCATIONS[0]
    if (config.airportDetails.flow === 'arrival') {
      pickup = { lat: airportLoc.lat, lng: airportLoc.lng }
      pickup_address = airportLoc.address || airportLoc.name
      const defaultDrop = dropFor(config.dropId) || DROPS[0]
      drop = { lat: defaultDrop.lat, lng: defaultDrop.lng }
      drop_address = defaultDrop.address || defaultDrop.name
    } else { // departure
      const defaultDrop = dropFor(config.dropId) || DROPS[0]
      pickup = { lat: defaultDrop.lat, lng: defaultDrop.lng } // User is at drop (e.g. home/gachibowli) going to airport
      pickup_address = defaultDrop.address || defaultDrop.name
      drop = { lat: airportLoc.lat, lng: airportLoc.lng }
      drop_address = airportLoc.address || airportLoc.name
    }
  } else {
    // Within city point-to-point
    const dropData = dropFor(config.dropId)
    drop = { lat: dropData.lat, lng: dropData.lng }
    drop_address = dropData.address
  }

  return {
    booking_type: 'POINT_TO_POINT',
    pickup,
    pickup_address,
    drop,
    drop_address,
    required_certification: skill.id,
    speed_ceiling_kmh: config.ceiling,
    hours: config.durationHours,
    ...basePayload,
  }
}

/** Server quote for the current config. Falls back to the local estimate. */
export async function serverQuote(api, config, skills = SKILLS) {
  try {
    const payload = bookingPayloadFor(config, skills)
    const quoteBody = { ...payload }
    delete quoteBody.speed_ceiling_kmh
    return await api.trips.quote(quoteBody)
  } catch {
    return null
  }
}

