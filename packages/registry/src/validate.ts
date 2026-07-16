import type { DroneClass, DroneSpec } from '@opticone/shared'

const CLASSES: DroneClass[] = ['multirotor', 'fixed-wing', 'loitering-munition', 'cargo', 'mining']

export type ValidationResult = { ok: true } | { ok: false; errors: string[] }

/**
 * C-01 validateSpec. Enforces the contract schema plus physical plausibility
 * so store uploads cannot smuggle in impossible drones:
 * specific power (W/kg at cruise, derived from battery and endurance) must
 * land in the 10..500 W/kg band that covers every real electric aircraft.
 */
export function validateSpec(spec: DroneSpec): ValidationResult {
  const errors: string[] = []
  const pos = (v: unknown, field: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) errors.push(`${field} must be a positive number`)
  }
  const nonNeg = (v: unknown, field: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`${field} must be a non-negative number`)
  }

  if (!spec.id || !/^[a-z0-9-]+$/.test(spec.id)) errors.push('id must be kebab-case')
  if (!spec.name) errors.push('name is required')
  if (!CLASSES.includes(spec.class)) errors.push(`class must be one of ${CLASSES.join(', ')}`)

  pos(spec.massKg, 'massKg')
  pos(spec.dimensionsM?.x, 'dimensionsM.x')
  pos(spec.dimensionsM?.y, 'dimensionsM.y')
  pos(spec.dimensionsM?.z, 'dimensionsM.z')
  pos(spec.enduranceS, 'enduranceS')
  pos(spec.cruiseMps, 'cruiseMps')
  pos(spec.maxMps, 'maxMps')
  pos(spec.ceilingM, 'ceilingM')
  nonNeg(spec.windLimitMps, 'windLimitMps')
  nonNeg(spec.payloadKg, 'payloadKg')
  nonNeg(spec.controlRangeM, 'controlRangeM')
  pos(spec.costCredits, 'costCredits')

  if (spec.cruiseMps > spec.maxMps) errors.push('cruiseMps must not exceed maxMps')

  if (spec.batteryWh === null) {
    if (!spec.fuelKg || !spec.burnKgPerH) errors.push('combustion drones need fuelKg and burnKgPerH')
    else if (spec.fuelKg >= spec.massKg) errors.push('fuelKg must be below massKg')
  } else {
    pos(spec.batteryWh, 'batteryWh')
    if (spec.fuelKg || spec.burnKgPerH) errors.push('battery drones must not set fuelKg or burnKgPerH')
    if (typeof spec.batteryWh === 'number' && spec.batteryWh > 0) {
      const wattsPerKg = (spec.batteryWh * 3600) / spec.enduranceS / spec.massKg
      if (wattsPerKg < 10 || wattsPerKg > 500) {
        errors.push(`implausible specific power ${wattsPerKg.toFixed(0)} W/kg (allowed 10..500)`)
      }
    }
  }

  if (!/^https:\/\//.test(spec.sourceUrl ?? '')) errors.push('sourceUrl must be a public https URL')

  if (spec.payloadKg > spec.massKg) errors.push('payloadKg must not exceed massKg')

  return errors.length ? { ok: false, errors } : { ok: true }
}
