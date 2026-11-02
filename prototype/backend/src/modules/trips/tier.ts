/**
 * Which driver tier a car needs. The customer no longer picks a tier: the car
 * decides, here, for every client. At night dispatch separately insists on a
 * Night Shield driver and the night fee applies; the tier does not change.
 *
 * Car names follow the apps' CAR_BRANDS list.
 */
const LUXURY_BRANDS = ['BMW', 'Mercedes-Benz', 'Audi', 'Volvo', 'Jaguar', 'Land Rover', 'Lexus', 'Porsche']
const SUV_MODELS = ['Innova Crysta', 'Innova Hycross', 'Fortuner', 'XUV700', 'Scorpio-N', 'Harrier', 'Safari', 'Hector']

export type CarForTier = { company?: unknown; model?: unknown; transmission?: unknown } | null | undefined

export function tierForCar(car: CarForTier): string {
  if (LUXURY_BRANDS.includes(String(car?.company ?? ''))) return 'MD-Lux'
  if (SUV_MODELS.includes(String(car?.model ?? ''))) return 'MD-SUV'
  if (car?.transmission === 'Automatic') return 'MD-Auto'
  return 'MD-Standard'
}
