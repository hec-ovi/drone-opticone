export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Vec2 {
  x: number
  z: number
}

export type DroneClass = 'multirotor' | 'fixed-wing' | 'loitering-munition' | 'cargo' | 'mining'

/** C-01 contract schema. All SI units, 1:1 scale, sourceUrl mandatory. */
export interface DroneSpec {
  id: string
  name: string
  class: DroneClass
  massKg: number
  dimensionsM: Vec3
  /** null for combustion types, which must then set fuelKg + burnKgPerH */
  batteryWh: number | null
  fuelKg?: number
  burnKgPerH?: number
  enduranceS: number
  cruiseMps: number
  maxMps: number
  ceilingM: number
  windLimitMps: number
  payloadKg: number
  controlRangeM: number
  costCredits: number
  sourceUrl: string
}

export type StructureKind = 'centcomm' | 'refinery' | 'factory' | 'relay' | 'satellite-uplink' | 'power-plant'
export type NodeKind = 'lithium' | 'oil'

export type DroneMode = 'idle' | 'moving' | 'patrol' | 'attacking' | 'mining' | 'returning' | 'terminal'

export interface DroneState {
  id: string
  specId: string
  playerId: string
  pos: Vec3
  heading: number
  batteryWh: number
  fuelKg: number
  hp: number
  hpMax: number
  cargoKg: number
  cargoKind: NodeKind | null
  mode: DroneMode
  dest: Vec3 | null
  targetId: string | null
  nodeId: string | null
  patrol: { a: Vec3; b: Vec3; leg: 0 | 1 } | null
  policy: PolicySpec | null
  /** true when wind exceeds the spec limit or the drone is outside control range */
  uncontrolled: boolean
  /** next tick this drone may release a munition */
  cooldownUntilTick: number
}

export interface StructureState {
  id: string
  kind: StructureKind
  playerId: string
  pos: Vec3
  hp: number
  hpMax: number
  /** set while under construction; the structure does nothing until this tick */
  readyAtTick?: number
}

export interface ResourceNodeState {
  id: string
  kind: NodeKind
  pos: Vec3
  remainingKg: number
}

export interface ProjectileState {
  id: string
  playerId: string
  pos: Vec3
  vel: Vec3
  payloadKg: number
}

export interface PlayerEconomy {
  credits: number
  lithiumKg: number
  oilKg: number
  plasticKg: number
}

export interface SatelliteSweep {
  center: Vec2
  radius: number
  untilTick: number
}

export interface SatelliteState {
  energy: number
  sweeps: SatelliteSweep[]
}

export interface BuildJob {
  id: string
  playerId: string
  structureId: string
  specId: string
  readyAtTick: number
}

export interface PlayerState {
  id: string
  economy: PlayerEconomy
  satellite: SatelliteState
}

/** Fog cell values per player grid. */
export const FOG_UNSEEN = 0
export const FOG_EXPLORED = 1
export const FOG_VISIBLE = 2

export interface MatchState {
  tick: number
  rngState: number
  mapId: string
  mapSizeM: number
  /** seed of the authoritative terrain heightfield (derived from mapId) */
  terrainSeed: number
  wind: { dirRad: number; speedMps: number }
  /** true in physics tests with a fixed wind; the per-tick wind walk is skipped */
  windLocked: boolean
  players: PlayerState[]
  drones: DroneState[]
  structures: StructureState[]
  nodes: ResourceNodeState[]
  projectiles: ProjectileState[]
  builds: BuildJob[]
  /** per player id, FOG_GRID*FOG_GRID cells */
  fog: Record<string, number[]>
  catalog: Record<string, DroneSpec>
  nextEntityId: number
  winner: string | null
}

export type PolicySpec =
  | { kind: 'patrolArea'; a: Vec3; b: Vec3 }
  | { kind: 'huntClass'; droneClass: DroneClass }
  | { kind: 'mineNode'; nodeId: string }
  | { kind: 'kamikazeOn'; radiusM: number }
  | { kind: 'returnAtBatteryPct'; pct: number }

/**
 * origin 'policy' marks onboard autonomy (C-07 standing policies), which keeps
 * working outside control range; 'player' commands need an active control link.
 */
export type CommandOrigin = 'player' | 'policy'

export type Command =
  | { type: 'move'; playerId: string; droneIds: string[]; to: Vec3 }
  | { type: 'patrol'; playerId: string; droneIds: string[]; a: Vec3; b: Vec3 }
  | { type: 'attack'; playerId: string; droneIds: string[]; targetId: string }
  | { type: 'mine'; playerId: string; droneIds: string[]; nodeId: string }
  | { type: 'build'; playerId: string; structureId: string; specId: string }
  | { type: 'construct'; playerId: string; kind: StructureKind; at: Vec2 }
  | { type: 'assignPolicy'; playerId: string; droneIds: string[]; policy: PolicySpec | null }
  | { type: 'satelliteSweep'; playerId: string; center: Vec2 }
  | { type: 'selfDestruct'; playerId: string; droneIds: string[] }

export type IssuedCommand = Command & { origin?: CommandOrigin }

export type SimEvent =
  | { type: 'spawned'; entityId: string; playerId: string; specId: string }
  | { type: 'destroyed'; entityId: string; playerId: string; cause: 'battery' | 'collision' | 'munition' | 'selfDestruct' | 'wind' | 'terrain' }
  | { type: 'collided'; aId: string; bId: string }
  | { type: 'batteryLow'; droneId: string; playerId: string; pct: number }
  | { type: 'resourceDelta'; playerId: string; delta: Partial<PlayerEconomy> }
  | { type: 'visibilityChanged'; playerId: string; newCells: number }
  | { type: 'matchEnded'; winner: string }

/** Fog-filtered view. The only thing clients (and agents) may see. */
export interface PlayerView {
  tick: number
  playerId: string
  mapSizeM: number
  terrainSeed: number
  wind: { dirRad: number; speedMps: number }
  economy: PlayerEconomy
  satellite: SatelliteState
  /** power grid load vs capacity; used > cap means the base is browned out */
  power: { used: number; cap: number }
  ownDrones: DroneState[]
  enemyDrones: DroneState[]
  structures: StructureState[]
  nodes: ResourceNodeState[]
  projectiles: ProjectileState[]
  builds: BuildJob[]
  fog: number[]
  catalog: Record<string, DroneSpec>
  winner: string | null
}
