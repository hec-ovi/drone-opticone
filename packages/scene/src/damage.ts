import * as THREE from 'three/webgpu'
import type { Vec3 } from '@opticone/shared'
import { glowSpriteMaterial } from './glowtex'

/**
 * Visual damage states for units and structures. Four stages driven by hp:
 * pristine, light smoke, heavy smoke with sparks, burning. Pure state math
 * exported for tests; sprite bookkeeping lives in the manager.
 */

export type DamageState = 0 | 1 | 2 | 3

export function damageStateFor(hp: number, hpMax: number): DamageState {
  const r = hpMax > 0 ? hp / hpMax : 0
  if (r > 0.75) return 0
  if (r > 0.5) return 1
  if (r > 0.25) return 2
  return 3
}

export interface DamagedEntity {
  id: string
  pos: Vec3
  hp: number
  hpMax: number
  /** rough visual radius, scales the plume */
  size: number
}

interface Fx {
  state: DamageState
  base: Vec3
  size: number
  smokes: { sprite: THREE.Sprite; phase: number; drift: number }[]
  flame: THREE.Sprite | null
}

export interface DamageFx {
  group: THREE.Group
  sync(entities: DamagedEntity[]): void
  update(dt: number, elapsed: number): void
  /** live fx count, for tests */
  count(): number
}

const SMOKES_PER_STATE: Record<DamageState, number> = { 0: 0, 1: 1, 2: 3, 3: 5 }

export function makeDamageFx(): DamageFx {
  const group = new THREE.Group()
  const fx = new Map<string, Fx>()

  function build(id: string, state: DamageState, base: Vec3, size: number): void {
    const smokes: Fx['smokes'] = []
    for (let i = 0; i < SMOKES_PER_STATE[state]; i++) {
      const sprite = new THREE.Sprite(glowSpriteMaterial(state >= 2 ? 0x1c1c20 : 0x3a3a40, 0.4))
      sprite.scale.setScalar(size * (0.5 + Math.random() * 0.4))
      group.add(sprite)
      smokes.push({ sprite, phase: Math.random(), drift: (Math.random() - 0.5) * size * 0.6 })
    }
    let flame: THREE.Sprite | null = null
    if (state === 3) {
      flame = new THREE.Sprite(glowSpriteMaterial(0xff8a3d, 0.8))
      flame.scale.setScalar(size * 0.7)
      group.add(flame)
    }
    fx.set(id, { state, base: { ...base }, size, smokes, flame })
  }

  function drop(id: string): void {
    const f = fx.get(id)
    if (!f) return
    for (const s of f.smokes) group.remove(s.sprite)
    if (f.flame) group.remove(f.flame)
    fx.delete(id)
  }

  return {
    group,
    sync(entities) {
      const seen = new Set<string>()
      for (const e of entities) {
        const state = damageStateFor(e.hp, e.hpMax)
        if (state === 0) continue
        seen.add(e.id)
        const existing = fx.get(e.id)
        if (!existing || existing.state !== state) {
          drop(e.id)
          build(e.id, state, e.pos, e.size)
        } else {
          existing.base = { ...e.pos }
        }
      }
      for (const id of [...fx.keys()]) {
        if (!seen.has(id)) drop(id)
      }
    },
    update(dt, elapsed) {
      void dt
      for (const f of fx.values()) {
        const rise = f.size * (f.state >= 2 ? 3.2 : 2.2)
        for (const s of f.smokes) {
          const t = (elapsed * 0.16 + s.phase) % 1
          s.sprite.position.set(
            f.base.x + s.drift * t,
            f.base.y + f.size * 0.4 + rise * t,
            f.base.z + s.drift * 0.4 * t,
          )
          ;(s.sprite.material as THREE.SpriteMaterial).opacity = 0.42 * (1 - t)
        }
        if (f.flame) {
          const flick = 0.75 + Math.sin(elapsed * 17) * 0.2 + Math.sin(elapsed * 41) * 0.08
          f.flame.position.set(f.base.x, f.base.y + f.size * 0.35, f.base.z)
          f.flame.scale.setScalar(f.size * 0.7 * flick)
          ;(f.flame.material as THREE.SpriteMaterial).opacity = 0.5 + flick * 0.25
        }
      }
    },
    count: () => fx.size,
  }
}
