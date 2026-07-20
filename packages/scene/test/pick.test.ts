import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three/webgpu'
import { classifyPick, hoverIntent, ndcToGround, nearestPickable, targetMarkers } from '@opticone/scene'
import { snapshot, createMatch, tick } from '@opticone/sim-core'
import { getCatalog } from '@opticone/registry'
import type { PlayerView } from '@opticone/shared'

describe('C-04 picking math', () => {
  function rigCamera(): PerspectiveCamera {
    const camera = new PerspectiveCamera(55, 16 / 9, 1, 40000)
    camera.position.set(1000, 1200, 1800)
    camera.lookAt(1000, 0, 1000)
    camera.updateMatrixWorld()
    return camera
  }

  it('the screen center ray hits the ground at the look-at point', () => {
    const point = ndcToGround(rigCamera(), 0, 0)
    expect(point).not.toBeNull()
    expect(point!.x).toBeCloseTo(1000, 0)
    expect(point!.z).toBeCloseTo(1000, 0)
    expect(point!.y).toBe(0)
  })

  it('a ray pointing at the sky misses the ground', () => {
    const camera = new PerspectiveCamera(55, 16 / 9, 1, 40000)
    camera.position.set(0, 100, 0)
    camera.lookAt(0, 200, -100)
    camera.updateMatrixWorld()
    expect(ndcToGround(camera, 0, 0)).toBeNull()
  })

  it('nearestPickable respects the tolerance radius', () => {
    const items = [
      { id: 'a', pos: { x: 0, y: 0, z: 0 } },
      { id: 'b', pos: { x: 100, y: 0, z: 0 } },
    ]
    expect(nearestPickable({ x: 10, y: 0, z: 0 }, items, 60)?.id).toBe('a')
    expect(nearestPickable({ x: 500, y: 0, z: 0 }, items, 60)).toBeUndefined()
  })

  it('classifyPick prefers own drones, then enemies, then nodes, then ground', () => {
    const s = tick(createMatch(5, 'map-1', ['p1', 'p2'], getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } }), []).state
    const view = snapshot(s, 'p1')
    const own = view.ownDrones[0]!
    expect(classifyPick(view, own.pos, 60)).toMatchObject({ kind: 'ownDrone', id: own.id })

    const node = view.nodes[0]!
    expect(classifyPick(view, node.pos, 60)).toMatchObject({ kind: 'node', id: node.id })

    expect(classifyPick(view, { x: 2000, y: 0, z: 2000 }, 60).kind).toBe('ground')
  })
})

describe('C-04 pick: own structures and nodes', () => {
  it('classifies clicks on own structures and nodes, with enemies taking priority', () => {
    const view = {
      playerId: 'me',
      ownDrones: [],
      enemyDrones: [],
      structures: [
        { id: 'mine-base', playerId: 'me', pos: { x: 1000, y: 0, z: 1000 } },
        { id: 'their-base', playerId: 'them', pos: { x: 2000, y: 0, z: 2000 } },
      ],
      nodes: [{ id: 'n1', pos: { x: 3000, y: 0, z: 3000 } }],
    } as unknown as PlayerView

    expect(classifyPick(view, { x: 1040, y: 0, z: 1000 }, 60)).toMatchObject({
      kind: 'ownStructure',
      id: 'mine-base',
    })
    expect(classifyPick(view, { x: 2040, y: 0, z: 2000 }, 60)).toMatchObject({
      kind: 'enemy',
      id: 'their-base',
    })
    expect(classifyPick(view, { x: 3050, y: 0, z: 3000 }, 60)).toMatchObject({ kind: 'node', id: 'n1' })
    expect(classifyPick(view, { x: 500, y: 0, z: 500 }, 60)).toMatchObject({ kind: 'ground', id: null })
  })
})

describe('C-04 hover intent (target feedback)', () => {
  const catalog = getCatalog()
  const view = {
    playerId: 'me',
    catalog,
    ownDrones: [
      { id: 'miner', specId: 'ore-miner', playerId: 'me', pos: { x: 1000, y: 30, z: 1000 } },
      { id: 'fpv', specId: 'fpv-strike', playerId: 'me', pos: { x: 1100, y: 60, z: 1000 } },
      { id: 'scout', specId: 'mavic3', playerId: 'me', pos: { x: 1200, y: 60, z: 1000 } },
    ],
    enemyDrones: [{ id: 'bandit', specId: 'fpv-strike', playerId: 'them', pos: { x: 2000, y: 60, z: 2000 } }],
    structures: [],
    nodes: [{ id: 'n1', kind: 'lithium', pos: { x: 3000, y: 0, z: 3000 } }],
  } as unknown as PlayerView

  it('attackers over an enemy read attack; non-attackers read invalid', () => {
    const overEnemy = { x: 2010, y: 0, z: 2000 }
    expect(hoverIntent(view, new Set(['fpv']), overEnemy, 60).verb).toBe('attack')
    expect(hoverIntent(view, new Set(['fpv']), overEnemy, 60).targetId).toBe('bandit')
    expect(hoverIntent(view, new Set(['scout']), overEnemy, 60).verb).toBe('invalid')
    expect(hoverIntent(view, new Set(['miner']), overEnemy, 60).verb).toBe('invalid')
    // A mixed group attacks if anyone in it can.
    expect(hoverIntent(view, new Set(['miner', 'fpv']), overEnemy, 60).verb).toBe('attack')
  })

  it('miners over a node read mine; attackers read invalid', () => {
    const overNode = { x: 3010, y: 0, z: 3000 }
    expect(hoverIntent(view, new Set(['miner']), overNode, 60)).toMatchObject({ verb: 'mine', targetId: 'n1' })
    expect(hoverIntent(view, new Set(['fpv']), overNode, 60).verb).toBe('invalid')
  })

  it('plain ground reads move; empty selection reads none', () => {
    expect(hoverIntent(view, new Set(['fpv']), { x: 500, y: 0, z: 500 }, 60).verb).toBe('move')
    expect(hoverIntent(view, new Set(), { x: 2010, y: 0, z: 2000 }, 60).verb).toBe('none')
    // Enemy selected for intel only: nothing orderable, no false feedback.
    expect(hoverIntent(view, new Set(['bandit']), { x: 3010, y: 0, z: 3000 }, 60).verb).toBe('none')
  })
})

describe('C-04 target markers (what the selection works on)', () => {
  const view = {
    playerId: 'me',
    catalog: {},
    ownDrones: [
      { id: 'm1', playerId: 'me', mode: 'mining', nodeId: 'n1', pos: { x: 0, y: 30, z: 0 } },
      { id: 'm2', playerId: 'me', mode: 'mining', nodeId: 'n1', pos: { x: 10, y: 30, z: 0 } },
      { id: 'a1', playerId: 'me', mode: 'attacking', targetId: 'bandit', pos: { x: 0, y: 60, z: 0 } },
      { id: 'v1', playerId: 'me', mode: 'moving', dest: { x: 780, y: 0, z: 780 }, pos: { x: 0, y: 60, z: 0 } },
      { id: 'v2', playerId: 'me', mode: 'moving', dest: { x: 790, y: 0, z: 786 }, pos: { x: 0, y: 60, z: 0 } },
      { id: 'idle', playerId: 'me', mode: 'idle', pos: { x: 0, y: 60, z: 0 } },
    ],
    enemyDrones: [{ id: 'bandit', playerId: 'them', pos: { x: 500, y: 60, z: 500 } }],
    structures: [],
    nodes: [{ id: 'n1', kind: 'lithium', pos: { x: 300, y: 0, z: 300 } }],
  } as unknown as PlayerView

  it('marks the mined node once, the attack target red-style, and one move point', () => {
    const all = new Set(['m1', 'm2', 'a1', 'v1', 'v2', 'idle'])
    const markers = targetMarkers(view, all)
    const verbs = markers.map((m) => m.verb).sort()
    expect(verbs).toEqual(['attack', 'mine', 'move'])
    const mine = markers.find((m) => m.verb === 'mine')!
    expect(mine.x).toBe(300)
    const attack = markers.find((m) => m.verb === 'attack')!
    expect(attack.x).toBe(500)
  })

  it('only selected drones produce markers', () => {
    expect(targetMarkers(view, new Set(['idle']))).toEqual([])
    expect(targetMarkers(view, new Set(['m1'])).length).toBe(1)
  })
})
