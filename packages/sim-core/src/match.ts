import {
  FOG_GRID,
  FOG_UNSEEN,
  rngRange,
  type DroneSpec,
  type DroneState,
  type MatchState,
  type NodeKind,
  type PlayerState,
  type StructureKind,
  type Vec3,
} from '@opticone/shared'
import { TUNING, droneHp } from './tuning'

export interface MatchOptions {
  /** Freeze wind for deterministic physics tests. */
  fixedWind?: { dirRad: number; speedMps: number }
}

function structure(id: string, kind: StructureKind, playerId: string, pos: Vec3) {
  return { id, kind, playerId, pos, hp: TUNING.structureHp[kind] }
}

export function makeDrone(spec: DroneSpec, playerId: string, pos: Vec3, id: string): DroneState {
  return {
    id,
    specId: spec.id,
    playerId,
    pos: { ...pos },
    heading: 0,
    batteryWh: spec.batteryWh ?? 0,
    fuelKg: spec.batteryWh === null ? (spec.fuelKg ?? 0) : 0,
    hp: droneHp(spec),
    // winged bombers carry their munition mass as cargo; miners start empty
    cargoKg: spec.class === 'fixed-wing' ? spec.payloadKg : 0,
    cargoKind: null,
    mode: 'idle',
    dest: null,
    targetId: null,
    nodeId: null,
    patrol: null,
    policy: null,
    uncontrolled: false,
    cooldownUntilTick: 0,
  }
}

export function createMatch(
  seed: number,
  mapId: string,
  playerIds: [string, string],
  catalog: Record<string, DroneSpec>,
  opts: MatchOptions = {},
): MatchState {
  let rngState = seed >>> 0
  const mapSizeM = TUNING.mapSizeM

  const players: PlayerState[] = playerIds.map((id) => ({
    id,
    economy: { ...TUNING.startEconomy },
    satellite: { energy: TUNING.satellite.energyMax, sweeps: [] },
  }))

  const basePos: Vec3[] = [
    { x: 500, y: 0, z: 500 },
    { x: mapSizeM - 500, y: 0, z: mapSizeM - 500 },
  ]

  const structures = playerIds.flatMap((pid, i) => {
    const b = basePos[i]!
    return [
      structure(`s-${pid}-centcomm`, 'centcomm', pid, b),
      structure(`s-${pid}-refinery`, 'refinery', pid, { x: b.x + 90, y: 0, z: b.z }),
      structure(`s-${pid}-factory`, 'factory', pid, { x: b.x, y: 0, z: b.z + 90 }),
      structure(`s-${pid}-uplink`, 'satellite-uplink', pid, { x: b.x - 90, y: 0, z: b.z }),
    ]
  })

  // Resource nodes: two guaranteed near each base, the rest seeded mid-map.
  const nodes: MatchState['nodes'] = []
  let nodeSeq = 0
  const addNode = (kind: NodeKind, pos: Vec3, kg: number) => {
    nodes.push({ id: `n${nodeSeq++}`, kind, pos, remainingKg: kg })
  }
  for (const b of basePos) {
    const sign = b.x < mapSizeM / 2 ? 1 : -1
    addNode('lithium', { x: b.x + sign * 400, y: 0, z: b.z + sign * 150 }, 800)
    addNode('oil', { x: b.x + sign * 150, y: 0, z: b.z + sign * 400 }, 1200)
  }
  for (let i = 0; i < 8; i++) {
    const rx = rngRange(rngState, mapSizeM * 0.25, mapSizeM * 0.75)
    rngState = rx.state
    const rz = rngRange(rngState, mapSizeM * 0.25, mapSizeM * 0.75)
    rngState = rz.state
    addNode(i % 2 === 0 ? 'lithium' : 'oil', { x: rx.value, y: 0, z: rz.value }, 1500)
  }

  const drones: DroneState[] = []
  let entitySeq = 0
  playerIds.forEach((pid, i) => {
    const b = basePos[i]!
    for (const specId of TUNING.startingDroneIds) {
      const spec = catalog[specId]
      if (!spec) continue
      const alt = TUNING.hoverAltM[spec.class] ?? 60
      drones.push(makeDrone(spec, pid, { x: b.x + 30 + entitySeq * 10, y: alt, z: b.z - 40 }, `e${entitySeq++}`))
    }
  })

  const windDir = rngRange(rngState, 0, Math.PI * 2)
  rngState = windDir.state
  const windSpeed = rngRange(rngState, 2, 8)
  rngState = windSpeed.state

  return {
    tick: 0,
    rngState,
    mapId,
    mapSizeM,
    wind: opts.fixedWind ? { ...opts.fixedWind } : { dirRad: windDir.value, speedMps: windSpeed.value },
    windLocked: Boolean(opts.fixedWind),
    players,
    drones,
    structures,
    nodes,
    projectiles: [],
    builds: [],
    fog: Object.fromEntries(playerIds.map((pid) => [pid, new Array(FOG_GRID * FOG_GRID).fill(FOG_UNSEEN)])),
    catalog,
    nextEntityId: entitySeq,
    winner: null,
  }
}
