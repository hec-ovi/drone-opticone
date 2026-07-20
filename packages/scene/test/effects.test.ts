import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three/webgpu'
import { createMatch, snapshot, tick } from '@opticone/sim-core'
import { getCatalog } from '@opticone/registry'
import { makeEffects } from '../src/effects'

function freshView() {
  const s = tick(createMatch(3, 'map-1', ['a', 'b'], getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } }), [])
  return snapshot(s.state, 'a')
}

describe('C-04 effects', () => {
  it('an explosion spawns transient objects that expire on their own', () => {
    const fx = makeEffects(() => 0)
    fx.explosion({ x: 100, y: 50, z: 100 }, 12)
    expect(fx.liveCount()).toBeGreaterThan(0)
    expect(fx.group.children.length).toBeGreaterThan(0)
    const cam = new PerspectiveCamera()
    for (let i = 0; i < 400; i++) fx.update(0.016, i * 0.016, cam)
    expect(fx.liveCount()).toBe(0)
  })

  it('order markers fade out quickly', () => {
    const fx = makeEffects(() => 0)
    fx.orderMarker({ x: 10, y: 0, z: 10 }, 'move')
    expect(fx.liveCount()).toBe(1)
    const cam = new PerspectiveCamera()
    for (let i = 0; i < 60; i++) fx.update(0.016, i * 0.016, cam)
    expect(fx.liveCount()).toBe(0)
  })

  it('a damaged drone gets a health bar, a healthy one does not', () => {
    const fx = makeEffects(() => 0)
    const view = freshView()
    const before = fx.group.children.length
    fx.syncView(view)
    expect(fx.group.children.length).toBe(before) // everyone at full hp

    view.ownDrones[0]!.hp = view.ownDrones[0]!.hpMax * 0.4
    fx.syncView(view)
    expect(fx.group.children.length).toBe(before + 1)

    view.ownDrones[0]!.hp = view.ownDrones[0]!.hpMax
    fx.syncView(view)
    expect(fx.group.children.length).toBe(before)
  })

  it('a miner working a node projects a mining beam, removed when it stops', () => {
    const fx = makeEffects(() => 0)
    const view = freshView()
    const node = view.nodes[0]!
    const miner = view.ownDrones.find((d) => d.specId === 'ore-miner')!
    miner.mode = 'mining'
    miner.nodeId = node.id
    miner.pos = { x: node.pos.x + 10, y: node.pos.y + 30, z: node.pos.z }
    const before = fx.group.children.length
    fx.syncView(view)
    expect(fx.group.children.length).toBe(before + 2) // beam + spark

    miner.mode = 'idle'
    miner.nodeId = null
    fx.syncView(view)
    expect(fx.group.children.length).toBe(before)
  })

  it('satellite sweeps draw a radar ring while active', () => {
    const fx = makeEffects(() => 0)
    const view = freshView()
    view.satellite.sweeps = [{ center: { x: 2000, z: 2000 }, radius: 500, untilTick: 100 }]
    const before = fx.group.children.length
    fx.syncView(view)
    expect(fx.group.children.length).toBe(before + 2) // ring + wedge
    view.satellite.sweeps = []
    fx.syncView(view)
    expect(fx.group.children.length).toBe(before)
  })
})
