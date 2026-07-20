import { describe, expect, it } from 'vitest'
import { damageStateFor, makeDamageFx } from '../src/damage'

describe('C-04 damage states', () => {
  it('maps hull ratio to the four visual states', () => {
    expect(damageStateFor(100, 100)).toBe(0) // pristine
    expect(damageStateFor(76, 100)).toBe(0)
    expect(damageStateFor(70, 100)).toBe(1) // light smoke
    expect(damageStateFor(50, 100)).toBe(2) // heavy smoke
    expect(damageStateFor(25, 100)).toBe(3) // burning
    expect(damageStateFor(1, 100)).toBe(3)
  })

  it('spawns, upgrades and clears plumes as hull changes', () => {
    const fx = makeDamageFx()
    const at = { x: 100, y: 30, z: 100 }
    fx.sync([{ id: 'a', pos: at, hp: 100, hpMax: 100, size: 20 }])
    expect(fx.count()).toBe(0) // pristine, nothing burns

    fx.sync([{ id: 'a', pos: at, hp: 60, hpMax: 100, size: 20 }])
    expect(fx.count()).toBe(1)
    const lightChildren = fx.group.children.length

    fx.sync([{ id: 'a', pos: at, hp: 10, hpMax: 100, size: 20 }])
    expect(fx.group.children.length).toBeGreaterThan(lightChildren) // more smoke + flame

    fx.update(0.016, 1)
    fx.sync([]) // entity gone
    expect(fx.count()).toBe(0)
    expect(fx.group.children.length).toBe(0)
  })
})
