import type { DroneSpec, StructureKind } from './types'

/**
 * Construction and targeting rules shared by the sim (authoritative), the
 * scene (placement ghost, hover feedback) and the UI (tiles, power bar).
 * One table, three consumers, no display-side mirrors drifting out of sync.
 */

export interface StructureBuild {
  lithiumKg: number
  plasticKg: number
  credits: number
  timeS: number
}

/** Constructible structures and their price tags. The CENTCOM is never buildable. */
export const STRUCTURE_BUILD: Partial<Record<StructureKind, StructureBuild>> = {
  'power-plant': { lithiumKg: 40, plasticKg: 20, credits: 400, timeS: 30 },
  refinery: { lithiumKg: 5, plasticKg: 50, credits: 900, timeS: 45 },
  factory: { lithiumKg: 10, plasticKg: 60, credits: 1200, timeS: 60 },
  relay: { lithiumKg: 5, plasticKg: 15, credits: 250, timeS: 15 },
  'satellite-uplink': { lithiumKg: 20, plasticKg: 30, credits: 700, timeS: 40 },
  'air-defense': { lithiumKg: 15, plasticKg: 40, credits: 800, timeS: 35 },
}

/**
 * Power grid, C&C style: the CENTCOM and lithium power plants feed the cap,
 * working structures draw from it. Over the cap the base browns out: the
 * factory line freezes, the refinery stops cracking, satellite charge stalls.
 */
export const POWER_CAP: Partial<Record<StructureKind, number>> = { centcomm: 40, 'power-plant': 60 }
export const POWER_USE: Partial<Record<StructureKind, number>> = {
  factory: 30,
  refinery: 25,
  'satellite-uplink': 20,
  relay: 10,
  'air-defense': 15,
}

export interface PowerStatus {
  used: number
  cap: number
}

/** Missile rack size of the air-defense battery, shared with the UI. */
export const AIR_DEFENSE_AMMO_MAX = 8

/** Engagement radius of the air-defense battery, shared with the scene ring. */
export const AIR_DEFENSE_RANGE_M = 500

/** A structure under construction (readyAtTick in the future) does nothing yet. */
export function structureActive(tick: number, st: { readyAtTick?: number }): boolean {
  return st.readyAtTick === undefined || tick >= st.readyAtTick
}

export function powerStatus(
  structures: { kind: StructureKind; playerId: string; readyAtTick?: number }[],
  playerId: string,
  tick: number,
): PowerStatus {
  let used = 0
  let cap = 0
  for (const st of structures) {
    if (st.playerId !== playerId || !structureActive(tick, st)) continue
    used += POWER_USE[st.kind] ?? 0
    cap += POWER_CAP[st.kind] ?? 0
  }
  return { used, cap }
}

export const PLACEMENT = {
  /** new construction must stay near an own structure (base creep) */
  nearOwnM: 600,
  clearStructureM: 110,
  clearNodeM: 80,
  edgeM: 60,
}

export interface PlacementField {
  mapSizeM: number
  structures: { pos: { x: number; z: number }; playerId: string }[]
  nodes: { pos: { x: number; z: number } }[]
}

export function canPlaceStructure(field: PlacementField, playerId: string, x: number, z: number): boolean {
  const e = PLACEMENT.edgeM
  if (x < e || z < e || x > field.mapSizeM - e || z > field.mapSizeM - e) return false
  let nearOwn = false
  for (const st of field.structures) {
    const d = Math.hypot(st.pos.x - x, st.pos.z - z)
    if (d < PLACEMENT.clearStructureM) return false
    if (st.playerId === playerId && d <= PLACEMENT.nearOwnM) nearOwn = true
  }
  if (!nearOwn) return false
  for (const n of field.nodes) {
    if (Math.hypot(n.pos.x - x, n.pos.z - z) < PLACEMENT.clearNodeM) return false
  }
  return true
}

/** Airframes that ram and detonate on contact. */
export function isKamikazeSpec(spec: DroneSpec): boolean {
  return spec.class === 'loitering-munition' || (spec.class === 'multirotor' && spec.payloadKg > 0)
}

/** Anything that can take an attack order: rammers plus winged bombers. */
export function canAttack(spec: DroneSpec): boolean {
  return isKamikazeSpec(spec) || (spec.class === 'fixed-wing' && spec.payloadKg > 0)
}

/** Anything that can take a mine order. */
export function canMine(spec: DroneSpec): boolean {
  return spec.class === 'mining' || spec.class === 'cargo'
}
