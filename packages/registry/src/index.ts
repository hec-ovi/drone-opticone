import type { DroneSpec } from '@opticone/shared'
import { SEED_DRONES } from './seeds'

export { SEED_DRONES } from './seeds'
export { validateSpec, type ValidationResult } from './validate'

/** Module API; the HTTP surface (GET /drones) wraps these in the backend phase. */
export function getDrones(): DroneSpec[] {
  return SEED_DRONES.map((d) => structuredClone(d))
}

export function getDrone(id: string): DroneSpec | undefined {
  const found = SEED_DRONES.find((d) => d.id === id)
  return found ? structuredClone(found) : undefined
}

export function getCatalog(): Record<string, DroneSpec> {
  return Object.fromEntries(getDrones().map((d) => [d.id, d]))
}
