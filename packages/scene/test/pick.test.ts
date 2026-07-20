import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three/webgpu'
import { classifyPick, ndcToGround, nearestPickable } from '@opticone/scene'
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
