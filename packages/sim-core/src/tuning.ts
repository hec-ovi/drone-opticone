import {
  AIR_DEFENSE_AMMO_MAX,
  AIR_DEFENSE_RANGE_M,
  type DroneClass,
  type DroneSpec,
  type StructureKind,
} from '@opticone/shared'

export { AIR_DEFENSE_AMMO_MAX }

/** All gameplay tuning in one place. Physics inputs come from DroneSpec, never from here. */
export const TUNING = {
  mapSizeM: 4000,
  structureHp: {
    centcomm: 12000,
    refinery: 3000,
    factory: 4000,
    relay: 1600,
    'satellite-uplink': 2000,
    'power-plant': 2400,
    'air-defense': 1800,
  } satisfies Record<StructureKind, number>,
  /**
   * SAM battery: radar sight while powered; fires homing interceptor
   * missiles from a finite rack, auto-reloaded from the bank.
   */
  airDefense: {
    rangeM: AIR_DEFENSE_RANGE_M,
    sightM: 800,
    cooldownS: 2.5,
    damage: 250,
    missileSpeedMps: 220,
    fuseM: 10,
    missileLifeS: 6,
    reloadS: 5,
    reloadCost: { plasticKg: 4, credits: 40 },
  },
  structureRadiusM: 20,
  droneRadiusM: 2,
  droneHpBase: 20,
  droneHpPerKg: 10,
  damagePerPayloadKg: 600,
  kamikazeTriggerM: 10,
  collisionDistM: 4,
  formationSpacingM: 22,
  spawnRingM: 55,
  /** fresh builds leave the pad this far beyond the factory, away from base */
  spawnOffsetM: 135,
  munitionMassKg: 25,
  munitionDamage: 1500,
  munitionSplashM: 20,
  munitionReleaseRangeM: 1500,
  munitionCooldownS: 5,
  sensorRangeM: {
    multirotor: 400,
    'fixed-wing': 1200,
    'loitering-munition': 300,
    cargo: 200,
    mining: 200,
  } satisfies Record<DroneClass, number>,
  structureSightM: 500,
  hoverAltM: { multirotor: 60, mining: 30, cargo: 50 } as Partial<Record<DroneClass, number>>,
  cruiseAltM: { 'fixed-wing': 1000, 'loitering-munition': 600 } as Partial<Record<DroneClass, number>>,
  orbitRadiusM: 150,
  arriveDistM: 8,
  climbRateMps: 8,
  miningRangeM: 40,
  depositRangeM: 60,
  miningRateKgPerS: 1,
  refineryOilKgPerS: 1,
  plasticPerOilKg: 0.5,
  startEconomy: { credits: 5000, lithiumKg: 50, oilKg: 0, plasticKg: 100 },
  batteryLowPct: 20,
  windMaxMps: 15,
  satellite: { energyMax: 100, regenPerS: 1, sweepCost: 30, sweepRadiusM: 500, sweepDurationS: 10 },
  startingDroneIds: ['ore-miner', 'mavic3'],
}

export function buildCost(spec: DroneSpec): { lithiumKg: number; plasticKg: number; credits: number } {
  return {
    lithiumKg: spec.batteryWh !== null ? spec.batteryWh * 0.02 : 5,
    plasticKg: spec.massKg * 0.6,
    credits: spec.costCredits * 0.05,
  }
}

export function buildTimeS(spec: DroneSpec): number {
  return Math.min(120, Math.max(5, spec.massKg))
}

export function droneHp(spec: DroneSpec): number {
  return TUNING.droneHpBase + TUNING.droneHpPerKg * spec.massKg
}

/** Watts drawn at cruise, self-consistent with the published endurance. */
export function cruisePowerW(spec: DroneSpec): number {
  if (spec.batteryWh === null) return 0
  return (spec.batteryWh * 3600) / spec.enduranceS
}
