import type { IssuedCommand, PlayerView, Vec2 } from '@opticone/shared'

export type Difficulty = 'easy' | 'normal' | 'hard'

const STRIKE_FORCE: Record<Difficulty, number> = { easy: 3, normal: 5, hard: 8 }
const MINERS: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 2 }

/**
 * C-07 overlord: the computer opponent. Deterministic (no randomness, paced
 * by view.tick), honest (sees only its fog-filtered PlayerView; the enemy
 * base guess is map knowledge, both spawn corners are public).
 * Strategy: secure mining, refit economy, mass FPV strikes, then commit.
 */
export function overlordAct(view: PlayerView, difficulty: Difficulty = 'normal'): IssuedCommand[] {
  if (view.winner) return []
  const commands: IssuedCommand[] = []
  const me = view.playerId
  const own = (kind: string) => view.structures.find((s) => s.playerId === me && s.kind === kind)
  const base = own('centcomm')
  const factory = own('factory')
  if (!base || !factory) return []

  const enemyCorner: Vec2 =
    base.pos.x < view.mapSizeM / 2
      ? { x: view.mapSizeM - 500, z: view.mapSizeM - 500 }
      : { x: 500, z: 500 }

  const drones = view.ownDrones
  const byClass = (c: string) => drones.filter((d) => view.catalog[d.specId]?.class === c)
  const miners = byClass('mining')
  const strikers = drones.filter((d) => d.specId === 'fpv-strike')
  const scouts = byClass('multirotor').filter((d) => (view.catalog[d.specId]?.payloadKg ?? 0) === 0)

  const queued = (specId: string) => view.builds.filter((b) => b.specId === specId).length

  // 1. Economy: keep miners alive and mining.
  if (miners.length + queued('ore-miner') < MINERS[difficulty]) {
    commands.push({ type: 'build', playerId: me, structureId: factory.id, specId: 'ore-miner' })
  }
  const lithiumNodes = view.nodes.filter((n) => n.kind === 'lithium')
  const oilNodes = view.nodes.filter((n) => n.kind === 'oil')
  miners.forEach((m, i) => {
    if (m.policy) return
    const node = (i % 2 === 0 ? lithiumNodes : oilNodes)[0] ?? lithiumNodes[0] ?? oilNodes[0]
    if (node) {
      commands.push({ type: 'assignPolicy', playerId: me, droneIds: [m.id], policy: { kind: 'mineNode', nodeId: node.id } })
    }
  })

  // 2. Recon: one scout patrols toward mid-map, everyone comes home at 20%.
  for (const scout of scouts) {
    if (!scout.policy) {
      commands.push({
        type: 'assignPolicy',
        playerId: me,
        droneIds: [scout.id],
        policy: {
          kind: 'patrolArea',
          a: { x: base.pos.x, y: 0, z: base.pos.z },
          b: { x: view.mapSizeM / 2, y: 0, z: view.mapSizeM / 2 },
        },
      })
    }
  }

  // 3. Military: mass cheap FPV strikers.
  if (strikers.length + queued('fpv-strike') < STRIKE_FORCE[difficulty]) {
    commands.push({ type: 'build', playerId: me, structureId: factory.id, specId: 'fpv-strike' })
  }

  // 4. Intel: periodic satellite sweep of the enemy corner once energy allows.
  if (view.tick % 600 === 0 && view.tick > 0 && view.satellite.energy >= 30) {
    commands.push({ type: 'satelliteSweep', playerId: me, center: enemyCorner })
  }

  // 5. Commit: full strike force attacks the enemy centcomm when we see it,
  // otherwise pushes toward the enemy corner to force contact.
  if (strikers.length >= STRIKE_FORCE[difficulty]) {
    const enemyBase = view.structures.find((s) => s.playerId !== me && s.kind === 'centcomm')
    const idleStrikers = strikers.filter((d) => d.mode === 'idle' || d.mode === 'patrol')
    if (idleStrikers.length > 0) {
      if (enemyBase) {
        commands.push({
          type: 'attack',
          playerId: me,
          droneIds: idleStrikers.map((d) => d.id),
          targetId: enemyBase.id,
        })
      } else if (view.tick % 100 === 0) {
        commands.push({
          type: 'move',
          playerId: me,
          droneIds: idleStrikers.map((d) => d.id),
          to: { x: enemyCorner.x, y: 0, z: enemyCorner.z },
        })
        for (const d of idleStrikers) {
          if (!d.policy) {
            commands.push({
              type: 'assignPolicy',
              playerId: me,
              droneIds: [d.id],
              policy: { kind: 'kamikazeOn', radiusM: 600 },
            })
          }
        }
      }
    }
  }

  return commands
}
