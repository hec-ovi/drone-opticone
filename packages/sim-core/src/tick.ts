import {
  DT,
  FOG_EXPLORED,
  FOG_GRID,
  FOG_UNSEEN,
  FOG_VISIBLE,
  rngRange,
  terrainHeight,
  type DroneSpec,
  type DroneState,
  type IssuedCommand,
  type MatchState,
  type SimEvent,
  type StructureState,
  type Vec3,
} from '@opticone/shared'
import { dist2D, dist3D, stepToward, stepToward2D } from './geometry'
import { makeDrone } from './match'
import { TUNING, buildCost, buildTimeS, cruisePowerW } from './tuning'

export interface TickResult {
  state: MatchState
  events: SimEvent[]
}

function spec(s: MatchState, d: DroneState): DroneSpec {
  return s.catalog[d.specId]!
}

function ground(s: MatchState, x: number, z: number): number {
  return terrainHeight(s.mapSizeM, s.terrainSeed, x, z)
}

/** Target altitude above ground level (AGL) per class. */
function targetAltitude(sp: DroneSpec): number {
  return TUNING.hoverAltM[sp.class] ?? TUNING.cruiseAltM[sp.class] ?? 60
}

function isKamikaze(sp: DroneSpec): boolean {
  return sp.class === 'loitering-munition' || (sp.class === 'multirotor' && sp.payloadKg > 0)
}

function isWinged(sp: DroneSpec): boolean {
  return sp.class === 'fixed-wing' || sp.class === 'loitering-munition'
}

function findEntity(s: MatchState, id: string): DroneState | StructureState | undefined {
  return s.drones.find((d) => d.id === id) ?? s.structures.find((st) => st.id === id)
}

function entityRadius(s: MatchState, id: string): number {
  return s.structures.some((st) => st.id === id) ? TUNING.structureRadiusM : TUNING.droneRadiusM
}

/** A drone is linked while within controlRangeM of an own centcomm or relay. */
function hasControlLink(s: MatchState, d: DroneState): boolean {
  const range = spec(s, d).controlRangeM
  if (range <= 0) return false
  return s.structures.some(
    (st) =>
      st.playerId === d.playerId &&
      (st.kind === 'centcomm' || st.kind === 'relay') &&
      dist2D(st.pos, d.pos) <= range,
  )
}

function applyCommands(s: MatchState, commands: IssuedCommand[], events: SimEvent[]): void {
  for (const cmd of commands) {
    const player = s.players.find((p) => p.id === cmd.playerId)
    if (!player) continue

    if (cmd.type === 'build') {
      const factory = s.structures.find(
        (st) => st.id === cmd.structureId && st.playerId === cmd.playerId && st.kind === 'factory',
      )
      const sp = s.catalog[cmd.specId]
      if (!factory || !sp) continue
      const cost = buildCost(sp)
      const eco = player.economy
      if (eco.lithiumKg < cost.lithiumKg || eco.plasticKg < cost.plasticKg || eco.credits < cost.credits) continue
      eco.lithiumKg -= cost.lithiumKg
      eco.plasticKg -= cost.plasticKg
      eco.credits -= cost.credits
      events.push({
        type: 'resourceDelta',
        playerId: player.id,
        delta: { lithiumKg: -cost.lithiumKg, plasticKg: -cost.plasticKg, credits: -cost.credits },
      })
      s.builds.push({
        id: `b${s.nextEntityId++}`,
        playerId: player.id,
        structureId: factory.id,
        specId: sp.id,
        readyAtTick: s.tick + Math.round(buildTimeS(sp) / DT),
      })
      continue
    }

    if (cmd.type === 'satelliteSweep') {
      const uplink = s.structures.find((st) => st.playerId === player.id && st.kind === 'satellite-uplink')
      if (!uplink) continue
      if (player.satellite.energy < TUNING.satellite.sweepCost) continue
      player.satellite.energy -= TUNING.satellite.sweepCost
      player.satellite.sweeps.push({
        center: { x: cmd.center.x, z: cmd.center.z },
        radius: TUNING.satellite.sweepRadiusM,
        untilTick: s.tick + Math.round(TUNING.satellite.sweepDurationS / DT),
      })
      continue
    }

    // Per-drone commands. Player-origin commands need an active control link;
    // policy-origin commands are onboard autonomy and always apply.
    for (const droneId of cmd.droneIds) {
      const d = s.drones.find((dr) => dr.id === droneId && dr.playerId === cmd.playerId)
      if (!d) continue
      const sp = spec(s, d)
      if ((cmd.origin ?? 'player') === 'player' && !hasControlLink(s, d)) continue

      switch (cmd.type) {
        case 'move': {
          // Formation fan-out: a group ordered to one point spreads over a
          // deterministic golden-angle disc so drones never stack.
          const idx = cmd.droneIds.indexOf(droneId)
          const angle = idx * 2.399963
          const radius = TUNING.formationSpacingM * Math.sqrt(idx)
          d.mode = 'moving'
          d.dest = {
            x: cmd.to.x + Math.cos(angle) * radius,
            y: targetAltitude(sp),
            z: cmd.to.z + Math.sin(angle) * radius,
          }
          d.targetId = null
          d.nodeId = null
          d.patrol = null
          break
        }
        case 'patrol':
          d.mode = 'patrol'
          d.patrol = {
            a: { x: cmd.a.x, y: targetAltitude(sp), z: cmd.a.z },
            b: { x: cmd.b.x, y: targetAltitude(sp), z: cmd.b.z },
            leg: 0,
          }
          d.dest = { ...d.patrol.a }
          d.targetId = null
          d.nodeId = null
          break
        case 'attack':
          if (!findEntity(s, cmd.targetId)) break
          if (!isKamikaze(sp) && !(sp.class === 'fixed-wing' && sp.payloadKg > 0)) break
          d.mode = 'attacking'
          d.targetId = cmd.targetId
          d.dest = null
          d.nodeId = null
          d.patrol = null
          break
        case 'mine': {
          const node = s.nodes.find((n) => n.id === cmd.nodeId)
          if (!node) break
          if (sp.class !== 'mining' && sp.class !== 'cargo') break
          d.mode = 'mining'
          d.nodeId = node.id
          d.targetId = null
          d.patrol = null
          d.dest = { x: node.pos.x, y: targetAltitude(sp), z: node.pos.z }
          break
        }
        case 'assignPolicy':
          d.policy = cmd.policy ? structuredClone(cmd.policy) : null
          break
        case 'selfDestruct':
          detonate(s, d, d.pos, spec(s, d).payloadKg, events, 'selfDestruct')
          break
      }
    }
  }
}

function detonate(
  s: MatchState,
  source: DroneState,
  at: Vec3,
  warheadKg: number,
  events: SimEvent[],
  cause: 'collision' | 'selfDestruct' | 'munition',
): void {
  const damage = warheadKg * TUNING.damagePerPayloadKg
  const splash = TUNING.munitionSplashM
  for (const st of s.structures) {
    if (dist3D(st.pos, at) <= splash + TUNING.structureRadiusM) st.hp -= damage
  }
  for (const d of s.drones) {
    if (d.id === source.id) continue
    if (dist3D(d.pos, at) <= splash + TUNING.droneRadiusM) d.hp -= damage
  }
  source.hp = 0
  events.push({ type: 'destroyed', entityId: source.id, playerId: source.playerId, cause })
}

function releaseMunition(s: MatchState, d: DroneState, target: Vec3): void {
  const dist = dist2D(d.pos, target)
  const fallT = Math.sqrt((2 * Math.max(1, d.pos.y - target.y)) / 9.81)
  const vx = (target.x - d.pos.x) / Math.max(0.1, fallT)
  const vz = (target.z - d.pos.z) / Math.max(0.1, fallT)
  const jitter = rngRange(s.rngState, -8, 8)
  s.rngState = jitter.state
  s.projectiles.push({
    id: `p${s.nextEntityId++}`,
    playerId: d.playerId,
    pos: { ...d.pos },
    vel: { x: vx + jitter.value * 0.1, y: 0, z: vz - jitter.value * 0.1 },
    payloadKg: TUNING.munitionMassKg,
  })
  d.cargoKg = Math.max(0, d.cargoKg - TUNING.munitionMassKg)
  d.cooldownUntilTick = s.tick + Math.round(TUNING.munitionCooldownS / DT)
  void dist
}

function updateDrone(s: MatchState, d: DroneState, events: SimEvent[]): void {
  const sp = spec(s, d)
  const windBlown = s.wind.speedMps > sp.windLimitMps
  d.uncontrolled = windBlown || !hasControlLink(s, d)

  let speedFactor = 1

  if (windBlown) {
    // Above the spec wind limit the aircraft cannot hold position: it drifts
    // downwind and burns extra power fighting the gusts.
    const drift = (s.wind.speedMps - sp.windLimitMps) * DT
    d.pos.x += Math.cos(s.wind.dirRad) * drift
    d.pos.z += Math.sin(s.wind.dirRad) * drift
    speedFactor = 1.5
    if (
      d.pos.x < 0 ||
      d.pos.z < 0 ||
      d.pos.x > s.mapSizeM ||
      d.pos.z > s.mapSizeM
    ) {
      d.hp = 0
      events.push({ type: 'destroyed', entityId: d.id, playerId: d.playerId, cause: 'wind' })
      return
    }
  } else {
    switch (d.mode) {
      case 'idle':
        if (isWinged(sp)) {
          // Fixed wings stall below cruise: orbit instead of hovering.
          d.heading += 0.4 * DT
          d.pos.x += Math.cos(d.heading) * sp.cruiseMps * DT
          d.pos.z += Math.sin(d.heading) * sp.cruiseMps * DT
        }
        break
      case 'moving':
        if (d.dest && stepToward2D(d.pos, d.dest, sp.cruiseMps * DT, TUNING.arriveDistM)) {
          d.mode = 'idle'
          d.dest = null
        }
        break
      case 'patrol':
        if (d.patrol) {
          const goal = d.patrol.leg === 0 ? d.patrol.a : d.patrol.b
          if (stepToward2D(d.pos, goal, sp.cruiseMps * DT, TUNING.arriveDistM)) {
            d.patrol.leg = d.patrol.leg === 0 ? 1 : 0
          }
        }
        break
      case 'attacking': {
        const target = d.targetId ? findEntity(s, d.targetId) : undefined
        if (!target) {
          d.mode = 'idle'
          d.targetId = null
          break
        }
        speedFactor = (sp.maxMps / sp.cruiseMps) ** 2
        if (isKamikaze(sp)) {
          const trigger = TUNING.kamikazeTriggerM + entityRadius(s, target.id)
          stepToward(d.pos, target.pos, sp.maxMps * DT, 1)
          if (dist3D(d.pos, target.pos) <= trigger) {
            detonate(s, d, target.pos, sp.payloadKg, events, 'collision')
            events.push({ type: 'collided', aId: d.id, bId: target.id })
          }
        } else {
          // Winged bomber: close to release range, drop, then hold the circle.
          if (dist2D(d.pos, target.pos) > TUNING.munitionReleaseRangeM) {
            stepToward2D(d.pos, target.pos, sp.cruiseMps * DT, 1)
            speedFactor = 1
          } else if (s.tick >= d.cooldownUntilTick && d.cargoKg >= TUNING.munitionMassKg) {
            releaseMunition(s, d, target.pos)
            speedFactor = 1
          } else {
            d.heading += 0.3 * DT
            d.pos.x += Math.cos(d.heading) * sp.cruiseMps * DT
            d.pos.z += Math.sin(d.heading) * sp.cruiseMps * DT
            speedFactor = 1
            if (d.cargoKg < TUNING.munitionMassKg) {
              d.mode = 'idle'
              d.targetId = null
            }
          }
        }
        break
      }
      case 'mining': {
        const node = d.nodeId ? s.nodes.find((n) => n.id === d.nodeId) : undefined
        if (!node || node.remainingKg <= 0) {
          d.mode = 'idle'
          d.nodeId = null
          break
        }
        if (dist2D(d.pos, node.pos) > TUNING.miningRangeM) {
          stepToward2D(d.pos, node.pos, sp.cruiseMps * DT, TUNING.miningRangeM / 2)
        } else {
          const take = Math.min(TUNING.miningRateKgPerS * DT, node.remainingKg, sp.payloadKg - d.cargoKg)
          node.remainingKg -= take
          d.cargoKg += take
          d.cargoKind = node.kind
          if (d.cargoKg >= sp.payloadKg) d.mode = 'returning'
        }
        break
      }
      case 'returning': {
        const home = s.structures.find(
          (st) => st.playerId === d.playerId && (st.kind === 'refinery' || st.kind === 'centcomm'),
        )
        if (!home) {
          d.mode = 'idle'
          break
        }
        if (dist2D(d.pos, home.pos) > TUNING.depositRangeM) {
          stepToward2D(d.pos, home.pos, sp.cruiseMps * DT, TUNING.depositRangeM / 2)
        } else if (d.cargoKg > 0 && d.cargoKind) {
          const player = s.players.find((p) => p.id === d.playerId)!
          const delta =
            d.cargoKind === 'lithium' ? { lithiumKg: d.cargoKg } : { oilKg: d.cargoKg }
          if (d.cargoKind === 'lithium') player.economy.lithiumKg += d.cargoKg
          else player.economy.oilKg += d.cargoKg
          events.push({ type: 'resourceDelta', playerId: d.playerId, delta })
          d.cargoKg = 0
          d.cargoKind = null
          const node = d.nodeId ? s.nodes.find((n) => n.id === d.nodeId) : undefined
          d.mode = node && node.remainingKg > 0 ? 'mining' : 'idle'
        }
        break
      }
    }
  }

  if (d.hp <= 0) return

  // Terrain following: hold the class AGL above the relief, limited by the
  // climb rate and the service ceiling. Kamikaze dives own their altitude;
  // wind-blown drones have no altitude authority at all.
  const groundHere = ground(s, d.pos.x, d.pos.z)
  const diving = d.mode === 'attacking' && isKamikaze(sp)
  if (!windBlown && !diving) {
    const targetY = Math.min(groundHere + targetAltitude(sp), sp.ceilingM)
    const climb = TUNING.climbRateMps * DT
    d.pos.y += Math.max(-climb, Math.min(climb, targetY - d.pos.y))
  }
  d.pos.y = Math.min(d.pos.y, sp.ceilingM)

  // Flying into a hillside is fatal.
  if (d.pos.y < groundHere - 0.5) {
    d.hp = 0
    events.push({ type: 'destroyed', entityId: d.id, playerId: d.playerId, cause: 'terrain' })
    return
  }

  // Energy drain, self-consistent with the published endurance.
  if (sp.batteryWh !== null) {
    const before = d.batteryWh
    d.batteryWh = Math.max(0, d.batteryWh - (cruisePowerW(sp) * speedFactor * DT) / 3600)
    const lowWh = (sp.batteryWh * TUNING.batteryLowPct) / 100
    if (before > lowWh && d.batteryWh <= lowWh && d.batteryWh > 0) {
      events.push({ type: 'batteryLow', droneId: d.id, playerId: d.playerId, pct: TUNING.batteryLowPct })
    }
    if (d.batteryWh <= 0) {
      d.hp = 0
      events.push({ type: 'destroyed', entityId: d.id, playerId: d.playerId, cause: 'battery' })
    }
  } else {
    d.fuelKg = Math.max(0, d.fuelKg - ((sp.burnKgPerH ?? 0) * speedFactor * DT) / 3600)
    if (d.fuelKg <= 0) {
      d.hp = 0
      events.push({ type: 'destroyed', entityId: d.id, playerId: d.playerId, cause: 'battery' })
    }
  }
}

function updateProjectiles(s: MatchState, events: SimEvent[]): void {
  const alive: MatchState['projectiles'] = []
  for (const p of s.projectiles) {
    p.vel.y -= 9.81 * DT
    p.pos.x += p.vel.x * DT
    p.pos.y += p.vel.y * DT
    p.pos.z += p.vel.z * DT
    const impactY = ground(s, p.pos.x, p.pos.z)
    if (p.pos.y > impactY) {
      alive.push(p)
      continue
    }
    const at = { x: p.pos.x, y: impactY, z: p.pos.z }
    for (const st of s.structures) {
      if (dist2D(st.pos, at) <= TUNING.munitionSplashM + TUNING.structureRadiusM) st.hp -= TUNING.munitionDamage
    }
    for (const d of s.drones) {
      if (dist3D(d.pos, at) <= TUNING.munitionSplashM) d.hp -= TUNING.munitionDamage
    }
  }
  s.projectiles = alive
  void events
}

function updateCollisions(s: MatchState, events: SimEvent[]): void {
  for (let i = 0; i < s.drones.length; i++) {
    for (let j = i + 1; j < s.drones.length; j++) {
      const a = s.drones[i]!
      const b = s.drones[j]!
      if (a.hp <= 0 || b.hp <= 0) continue
      const d = dist3D(a.pos, b.pos)
      if (d > TUNING.collisionDistM) continue
      if (a.playerId === b.playerId) {
        // Own drones run collision avoidance: push apart, no damage.
        const dx = b.pos.x - a.pos.x
        const dz = b.pos.z - a.pos.z
        const len = Math.hypot(dx, dz) || 1
        const push = (TUNING.collisionDistM - d) / 2 + 0.5
        a.pos.x -= (dx / len) * push
        a.pos.z -= (dz / len) * push
        b.pos.x += (dx / len) * push
        b.pos.z += (dz / len) * push
        continue
      }
      a.hp = 0
      b.hp = 0
      events.push({ type: 'collided', aId: a.id, bId: b.id })
      events.push({ type: 'destroyed', entityId: a.id, playerId: a.playerId, cause: 'collision' })
      events.push({ type: 'destroyed', entityId: b.id, playerId: b.playerId, cause: 'collision' })
    }
  }
}

function markCircle(fog: number[], mapSizeM: number, cx: number, cz: number, radius: number): number {
  const cell = mapSizeM / FOG_GRID
  let newlyExplored = 0
  const minI = Math.max(0, Math.floor((cx - radius) / cell))
  const maxI = Math.min(FOG_GRID - 1, Math.ceil((cx + radius) / cell))
  const minJ = Math.max(0, Math.floor((cz - radius) / cell))
  const maxJ = Math.min(FOG_GRID - 1, Math.ceil((cz + radius) / cell))
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const px = (i + 0.5) * cell
      const pz = (j + 0.5) * cell
      if (Math.hypot(px - cx, pz - cz) > radius) continue
      const idx = j * FOG_GRID + i
      if (fog[idx] === FOG_UNSEEN) newlyExplored++
      fog[idx] = FOG_VISIBLE
    }
  }
  return newlyExplored
}

function updateFog(s: MatchState, events: SimEvent[]): void {
  for (const player of s.players) {
    const fog = s.fog[player.id]!
    for (let i = 0; i < fog.length; i++) {
      if (fog[i] === FOG_VISIBLE) fog[i] = FOG_EXPLORED
    }
    let newCells = 0
    for (const d of s.drones) {
      if (d.playerId !== player.id || d.hp <= 0) continue
      newCells += markCircle(fog, s.mapSizeM, d.pos.x, d.pos.z, TUNING.sensorRangeM[spec(s, d).class])
    }
    for (const st of s.structures) {
      if (st.playerId !== player.id || st.hp <= 0) continue
      newCells += markCircle(fog, s.mapSizeM, st.pos.x, st.pos.z, TUNING.structureSightM)
    }
    for (const sweep of player.satellite.sweeps) {
      newCells += markCircle(fog, s.mapSizeM, sweep.center.x, sweep.center.z, sweep.radius)
    }
    if (newCells > 0) events.push({ type: 'visibilityChanged', playerId: player.id, newCells })
  }
}

/**
 * C-03 tick. Pure: clones the state, applies one fixed 50 ms step, returns
 * the new state plus the events of this step. No I/O, no wall clock, no
 * unseeded randomness anywhere in here.
 */
export function tick(input: MatchState, commands: IssuedCommand[]): TickResult {
  if (input.winner) return { state: input, events: [] }
  const s = structuredClone(input)
  const events: SimEvent[] = []
  s.tick++

  // Wind random walk.
  if (!s.windLocked) {
    const dv = rngRange(s.rngState, -0.05, 0.05)
    s.rngState = dv.state
    const dd = rngRange(s.rngState, -0.02, 0.02)
    s.rngState = dd.state
    s.wind.speedMps = Math.min(TUNING.windMaxMps, Math.max(0, s.wind.speedMps + dv.value))
    s.wind.dirRad = (s.wind.dirRad + dd.value) % (Math.PI * 2)
  }

  applyCommands(s, commands, events)

  // Finished builds spawn at their factory.
  const pending: MatchState['builds'] = []
  for (const job of s.builds) {
    if (s.tick < job.readyAtTick) {
      pending.push(job)
      continue
    }
    const factory = s.structures.find((st) => st.id === job.structureId && st.hp > 0)
    const sp = s.catalog[job.specId]
    if (!factory || !sp) continue
    const id = `e${s.nextEntityId++}`
    const alt = targetAltitude(sp)
    // Spawn ring beyond the factory on the side away from the centcomm, so
    // fresh drones appear next to the base, never on top of it, and
    // consecutive builds fan over different bearings instead of stacking.
    const centcomm = s.structures.find((st) => st.playerId === job.playerId && st.kind === 'centcomm')
    let awayX = 0
    let awayZ = 1
    if (centcomm) {
      const dx = factory.pos.x - centcomm.pos.x
      const dz = factory.pos.z - centcomm.pos.z
      const len = Math.hypot(dx, dz) || 1
      awayX = dx / len
      awayZ = dz / len
    }
    const spawnAngle = s.nextEntityId * 2.399963
    const cx = factory.pos.x + awayX * TUNING.spawnOffsetM
    const cz = factory.pos.z + awayZ * TUNING.spawnOffsetM
    const x = cx + Math.cos(spawnAngle) * TUNING.spawnRingM
    const z = cz + Math.sin(spawnAngle) * TUNING.spawnRingM
    s.drones.push(makeDrone(sp, job.playerId, { x, y: ground(s, x, z) + alt, z }, id))
    events.push({ type: 'spawned', entityId: id, playerId: job.playerId, specId: sp.id })
  }
  s.builds = pending

  for (const d of s.drones) {
    if (d.hp > 0) updateDrone(s, d, events)
  }
  updateProjectiles(s, events)
  updateCollisions(s, events)

  // Structures killed by damage this tick.
  for (const st of s.structures) {
    if (st.hp <= 0) events.push({ type: 'destroyed', entityId: st.id, playerId: st.playerId, cause: 'munition' })
  }
  s.structures = s.structures.filter((st) => st.hp > 0)
  s.drones = s.drones.filter((d) => d.hp > 0)
  s.nodes = s.nodes.filter((n) => n.remainingKg > 0)

  // Refinery converts oil to plastic.
  for (const player of s.players) {
    const hasRefinery = s.structures.some((st) => st.playerId === player.id && st.kind === 'refinery')
    if (!hasRefinery) continue
    const used = Math.min(player.economy.oilKg, TUNING.refineryOilKgPerS * DT)
    if (used > 0) {
      player.economy.oilKg -= used
      player.economy.plasticKg += used * TUNING.plasticPerOilKg
    }
  }

  // Satellite energy and sweep expiry.
  for (const player of s.players) {
    player.satellite.energy = Math.min(
      TUNING.satellite.energyMax,
      player.satellite.energy + TUNING.satellite.regenPerS * DT,
    )
    player.satellite.sweeps = player.satellite.sweeps.filter((sw) => sw.untilTick > s.tick)
  }

  updateFog(s, events)

  // Win condition: enemy centcomm destroyed.
  for (const player of s.players) {
    const baseAlive = s.structures.some((st) => st.playerId === player.id && st.kind === 'centcomm')
    if (!baseAlive) {
      const winner = s.players.find((p) => p.id !== player.id)!
      s.winner = winner.id
      events.push({ type: 'matchEnded', winner: winner.id })
      break
    }
  }

  return { state: s, events }
}
