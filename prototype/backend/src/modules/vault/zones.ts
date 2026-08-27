/**
 * The 8-point inspection, from mobile_app_spec.md:
 * Front, Rear, Left, Right, Dashboard, Seats, Fuel/Odometer, Boot.
 */
export const INSPECTION_ZONES = [
  'FRONT',
  'REAR',
  'LEFT',
  'RIGHT',
  'DASHBOARD',
  'SEATS',
  'FUEL_ODOMETER',
  'BOOT',
] as const

export type InspectionZone = (typeof INSPECTION_ZONES)[number]
export type InspectionPhase = 'PRE' | 'POST'

export const ZONE_LABEL: Record<InspectionZone, string> = {
  FRONT: 'Front',
  REAR: 'Rear',
  LEFT: 'Left side',
  RIGHT: 'Right side',
  DASHBOARD: 'Dashboard',
  SEATS: 'Seats',
  FUEL_ODOMETER: 'Fuel / odometer',
  BOOT: 'Boot',
}

/** Which of the eight are still outstanding. */
export function missingZones(captured: readonly string[]): InspectionZone[] {
  const seen = new Set(captured)
  return INSPECTION_ZONES.filter((z) => !seen.has(z))
}

export const isComplete = (captured: readonly string[]): boolean =>
  missingZones(captured).length === 0
