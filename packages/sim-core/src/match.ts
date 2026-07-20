import {
  FOG_GRID,
  FOG_UNSEEN,
  mapTerrainSeed,
  rngRange,
  terrainHeight,
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
  return { id, kind, playerId, pos, hp: TUNING.structureHp[kind], hpMax: TUNING.structureHp[kind] }
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
    hpMax: droneHp(spec),
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
  const terrainSeed = mapTerrainSeed(mapId)
  const ground = (x: number, z: number) => terrainHeight(mapSizeM, terrainSeed, x, z)

  const players: PlayerState[] = playerIds.map((id) => ({
    id,
    economy: { ...TUNING.startEconomy },
    satellite: { energy: TUNING.satellite.energyMax, sweeps: [] },
  }))

  const basePos: Vec3[] = [
    { x: 500, y: 0, z: 500 },
    { x: mapSizeM - 500, y: 0, z: mapSizeM - 500 },
  ]

  const onGround = (x: number, z: number): Vec3 => ({ x, y: ground(x, z), z })

  // Buildings sit 180 m apart so each one reads as its own installation
  // instead of one merged blob (footprints are ~100 m at commander scale).
  const structures = playerIds.flatMap((pid, i) => {
    const b = basePos[i]!
    return [
      structure(`s-${pid}-centcomm`, 'centcomm', pid, onGround(b.x, b.z)),
      structure(`s-${pid}-refinery`, 'refinery', pid, onGround(b.x + 180, b.z)),
      structure(`s-${pid}-factory`, 'factory', pid, onGround(b.x, b.z + 180)),
      structure(`s-${pid}-uplink`, 'satellite-uplink', pid, onGround(b.x - 180, b.z)),
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
    addNode('lithium', onGround(b.x + sign * 400, b.z + sign * 150), 800)
    addNode('oil', onGround(b.x + sign * 150, b.z + sign * 400), 1200)
  }
  for (let i = 0; i < 8; i++) {
    const rx = rngRange(rngState, mapSizeM * 0.25, mapSizeM * 0.75)
    rngState = rx.state
    const rz = rngRange(rngState, mapSizeM * 0.25, mapSizeM * 0.75)
    rngState = rz.state
    addNode(i % 2 === 0 ? 'lithium' : 'oil', onGround(rx.value, rz.value), 1500)
  }

  // Starting drones hold an arc north of the base, clear of every building.
  const drones: DroneState[] = []
  let entitySeq = 0
  playerIds.forEach((pid, i) => {
    const b = basePos[i]!
    TUNING.startingDroneIds.forEach((specId, slot) => {
      const spec = catalog[specId]
      if (!spec) return
      const alt = TUNING.hoverAltM[spec.class] ?? 60
      const a = -Math.PI / 2 + (slot - (TUNING.startingDroneIds.length - 1) / 2) * 0.45
      const x = b.x + Math.cos(a) * 170
      const z = b.z + Math.sin(a) * 170
      drones.push(makeDrone(spec, pid, { x, y: ground(x, z) + alt, z }, `e${entitySeq++}`))
    })
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
    terrainSeed,
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
