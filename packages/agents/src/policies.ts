import type { DroneState, IssuedCommand, PlayerView, Vec3 } from '@opticone/shared'

function d2(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function nearest<T extends { pos: Vec3 }>(from: Vec3, items: T[]): T | undefined {
  let best: T | undefined
  let bestD = Infinity
  for (const item of items) {
    const dd = d2(from, item.pos)
    if (dd < bestD) {
      bestD = dd
      best = item
    }
  }
  return best
}

function batteryPct(view: PlayerView, d: DroneState): number {
  const spec = view.catalog[d.specId]
  if (!spec || spec.batteryWh === null || spec.batteryWh === 0) return 100
  return (d.batteryWh / spec.batteryWh) * 100
}

/**
 * C-07 evaluatePolicies. Onboard autonomy: turns each drone's standing policy
 * into commands with origin 'policy', which the sim honors even outside
 * control range. Pure, reads only the fog-filtered PlayerView. No cheating.
 */
export function evaluatePolicies(view: PlayerView): IssuedCommand[] {
  const commands: IssuedCommand[] = []
  const home = view.structures.find((s) => s.playerId === view.playerId && s.kind === 'centcomm')

  for (const d of view.ownDrones) {
    if (!d.policy) continue
    const p = d.policy

    // Safety policy wins over everything else.
    if (p.kind === 'returnAtBatteryPct') {
      if (batteryPct(view, d) <= p.pct && home && d2(d.pos, home.pos) > 100) {
        commands.push({
          type: 'move',
          playerId: view.playerId,
          droneIds: [d.id],
          to: { x: home.pos.x + 40, y: 0, z: home.pos.z + 40 },
          origin: 'policy',
        })
      }
      continue
    }

    if (p.kind === 'patrolArea') {
      if (d.mode === 'idle') {
        commands.push({ type: 'patrol', playerId: view.playerId, droneIds: [d.id], a: p.a, b: p.b, origin: 'policy' })
      }
      continue
    }

    if (p.kind === 'mineNode') {
      if (d.mode === 'idle') {
        commands.push({ type: 'mine', playerId: view.playerId, droneIds: [d.id], nodeId: p.nodeId, origin: 'policy' })
      }
      continue
    }

    if (p.kind === 'huntClass') {
      if (d.mode === 'attacking') continue
      const prey = nearest(
        d.pos,
        view.enemyDrones.filter((e) => view.catalog[e.specId]?.class === p.droneClass),
      )
      if (prey) {
        commands.push({ type: 'attack', playerId: view.playerId, droneIds: [d.id], targetId: prey.id, origin: 'policy' })
      }
      continue
    }

    if (p.kind === 'kamikazeOn') {
      if (d.mode === 'attacking') continue
      const enemies = [
        ...view.enemyDrones,
        ...view.structures.filter((s) => s.playerId !== view.playerId),
      ].filter((e) => d2(d.pos, e.pos) <= p.radiusM)
      const target = nearest(d.pos, enemies)
      if (target) {
        commands.push({ type: 'attack', playerId: view.playerId, droneIds: [d.id], targetId: target.id, origin: 'policy' })
      }
    }
  }
  return commands
}
