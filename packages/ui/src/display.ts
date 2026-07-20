import type { DroneSpec, StructureKind } from '@opticone/shared'

/**
 * Display-level mirrors of C-03 tuning rules plus shared naming. The sim
 * stays authoritative; these only shape what the panels print.
 */

export const STRUCTURE_NAME: Record<StructureKind, string> = {
  centcomm: 'CENTCOM base',
  refinery: 'Refinery',
  factory: 'Factory',
  relay: 'Relay mast',
  'satellite-uplink': 'Satellite uplink',
  'power-plant': 'Power plant',
  'air-defense': 'Missile defense',
}

/** One line of what each structure does, for the build info card. */
export const STRUCTURE_DESC: Record<StructureKind, string> = {
  centcomm: 'Constructs buildings. Lose it, lose the match.',
  refinery: 'Cracks stored oil into airframe plastic.',
  factory: 'Builds drones, one at a time.',
  relay: 'Extends the control link.',
  'satellite-uplink': 'Enables satellite sweeps.',
  'power-plant': 'Feeds the power grid.',
  'air-defense': 'Detects and shoots down drones and munitions.',
}

export function displayBuildCost(spec: DroneSpec): { lithiumKg: number; plasticKg: number; credits: number } {
  return {
    lithiumKg: spec.batteryWh !== null ? spec.batteryWh * 0.02 : 5,
    plasticKg: spec.massKg * 0.6,
    credits: spec.costCredits * 0.05,
  }
}

export function displayBuildTimeS(spec: DroneSpec): number {
  return Math.min(120, Math.max(5, spec.massKg))
}

/** Kamikaze-capable airframes, display mirror of the C-03 rule. */
export function isWarhead(spec: DroneSpec): boolean {
  return spec.class === 'loitering-munition' || (spec.class === 'multirotor' && spec.payloadKg > 0)
}
