import {
  FOG_EXPLORED,
  FOG_GRID,
  FOG_VISIBLE,
  type MatchState,
  type PlayerView,
  type Vec3,
} from '@opticone/shared'

function cellIndex(mapSizeM: number, pos: Vec3): number {
  const cell = mapSizeM / FOG_GRID
  const i = Math.min(FOG_GRID - 1, Math.max(0, Math.floor(pos.x / cell)))
  const j = Math.min(FOG_GRID - 1, Math.max(0, Math.floor(pos.z / cell)))
  return j * FOG_GRID + i
}

/**
 * C-03 snapshot. The fog-filtered view for one player: the ONLY state
 * clients, UIs and agents are allowed to read. Enemy units appear only in
 * currently visible cells; enemy structures and nodes in explored ones.
 */
export function snapshot(s: MatchState, playerId: string): PlayerView {
  const player = s.players.find((p) => p.id === playerId)
  if (!player) throw new Error(`unknown player ${playerId}`)
  const fog = s.fog[playerId]!

  const visible = (pos: Vec3) => fog[cellIndex(s.mapSizeM, pos)] === FOG_VISIBLE
  const explored = (pos: Vec3) => {
    const v = fog[cellIndex(s.mapSizeM, pos)]
    return v === FOG_VISIBLE || v === FOG_EXPLORED
  }

  return structuredClone({
    tick: s.tick,
    playerId,
    mapSizeM: s.mapSizeM,
    wind: s.wind,
    economy: player.economy,
    satellite: player.satellite,
    ownDrones: s.drones.filter((d) => d.playerId === playerId),
    enemyDrones: s.drones.filter((d) => d.playerId !== playerId && visible(d.pos)),
    structures: s.structures.filter((st) => st.playerId === playerId || explored(st.pos)),
    nodes: s.nodes.filter((n) => explored(n.pos)),
    projectiles: s.projectiles.filter((p) => p.playerId === playerId || visible(p.pos)),
    builds: s.builds.filter((b) => b.playerId === playerId),
    fog,
    catalog: s.catalog,
    winner: s.winner,
  })
}
