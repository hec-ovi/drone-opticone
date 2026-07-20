import * as THREE from 'three/webgpu'
import type { PlayerView, Vec3 } from '@opticone/shared'
import { glowSpriteMaterial } from './glowtex'

/**
 * Battle effects: explosions with debris and smoke, order markers, mining
 * beams, satellite sweep radar rings, floating health bars, scorch marks.
 * Pure scene-side cosmetics driven by view diffs; owns no game state.
 */

export type OrderKind = 'move' | 'attack' | 'mine' | 'sweep'

const ORDER_COLOR: Record<OrderKind, number> = {
  move: 0x53e079,
  attack: 0xff5044,
  mine: 0x53d8e0,
  sweep: 0x9a7bff,
}

interface Burst {
  points: THREE.Points
  vel: Float32Array
  life: number
  t: number
}

interface Timed {
  obj: THREE.Object3D
  life: number
  t: number
  tick(k: number, self: Timed): void
}

export interface Effects {
  group: THREE.Group
  explosion(at: Vec3, radius: number): void
  orderMarker(at: Vec3, kind: OrderKind): void
  scorch(at: Vec3, radius: number): void
  /** Diff-driven per-snapshot effects: beams, sweeps, health bars. */
  syncView(view: PlayerView): void
  update(dt: number, elapsed: number, camera: THREE.Camera): void
  /** number of live one-shot effects, for tests */
  liveCount(): number
}

export function makeEffects(groundY: (x: number, z: number) => number): Effects {
  const group = new THREE.Group()
  const bursts: Burst[] = []
  const timed: Timed[] = []
  const beams = new Map<string, { beam: THREE.Mesh; spark: THREE.Sprite }>()
  const sweeps = new Map<string, { ring: THREE.Mesh; wedge: THREE.Mesh; until: number }>()
  const bars = new Map<string, { holder: THREE.Group; fill: THREE.Mesh; bg: THREE.Mesh }>()

  const spriteMat = (color: number, opacity: number) => glowSpriteMaterial(color, opacity)

  function addTimed(obj: THREE.Object3D, life: number, tick: Timed['tick']): void {
    group.add(obj)
    timed.push({ obj, life, t: 0, tick })
  }

  function explosion(at: Vec3, radius: number): void {
    // Flash.
    const flash = new THREE.Sprite(spriteMat(0xffe9b0, 0.95))
    flash.position.set(at.x, at.y + 2, at.z)
    addTimed(flash, 0.3, (k, self) => {
      self.obj.scale.setScalar(radius * (1.5 + k * 5))
      ;(flash.material as THREE.SpriteMaterial).opacity = 0.95 * (1 - k)
    })
    // Fireball.
    const ball = new THREE.Sprite(spriteMat(0xff8a3d, 0.85))
    ball.position.set(at.x, at.y + 3, at.z)
    addTimed(ball, 0.55, (k) => {
      ball.scale.setScalar(radius * (1 + k * 2.6))
      ;(ball.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - k * k)
    })
    // Debris burst.
    const n = 42
    const positions = new Float32Array(n * 3)
    const vel = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      positions[i * 3] = at.x
      positions[i * 3 + 1] = at.y + 2
      positions[i * 3 + 2] = at.z
      const a = Math.random() * Math.PI * 2
      const up = Math.random()
      const speed = radius * (2 + Math.random() * 6)
      vel[i * 3] = Math.cos(a) * speed * (1 - up * 0.6)
      vel[i * 3 + 1] = up * speed * 1.4
      vel[i * 3 + 2] = Math.sin(a) * speed * (1 - up * 0.6)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffb066,
        size: Math.max(1.6, radius * 0.16),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    )
    group.add(points)
    bursts.push({ points, vel, life: 1.15, t: 0 })
    // Smoke.
    for (let i = 0; i < 3; i++) {
      const smoke = new THREE.Sprite(spriteMat(0x2c2c30, 0.5))
      smoke.position.set(at.x + (Math.random() - 0.5) * radius, at.y + 4, at.z + (Math.random() - 0.5) * radius)
      const drift = (Math.random() - 0.5) * 8
      addTimed(smoke, 2.4 + i * 0.5, (k) => {
        smoke.scale.setScalar(radius * (1.2 + k * 3.2))
        smoke.position.y += 0.35
        smoke.position.x += drift * 0.016
        ;(smoke.material as THREE.SpriteMaterial).opacity = 0.5 * (1 - k)
      })
    }
  }

  function orderMarker(at: Vec3, kind: OrderKind): void {
    const y = groundY(at.x, at.z) + 2
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1, 28),
      new THREE.MeshBasicMaterial({
        color: ORDER_COLOR[kind],
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(at.x, y, at.z)
    addTimed(ring, 0.7, (k) => {
      const s = 34 * (1 - k * 0.75)
      ring.scale.setScalar(Math.max(0.01, s))
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k)
    })
  }

  function scorch(at: Vec3, radius: number): void {
    const mark = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 20),
      new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false }),
    )
    mark.rotation.x = -Math.PI / 2
    mark.position.set(at.x, groundY(at.x, at.z) + 0.6, at.z)
    addTimed(mark, 40, (k) => {
      ;(mark.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k)
    })
  }

  const up = new THREE.Vector3(0, 1, 0)

  function pointBeam(beam: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
    const mid = from.clone().add(to).multiplyScalar(0.5)
    const dir = to.clone().sub(from)
    const len = dir.length()
    beam.position.copy(mid)
    beam.scale.set(1, len, 1)
    beam.quaternion.setFromUnitVectors(up, dir.normalize())
  }

  function syncView(view: PlayerView): void {
    // Mining beams for any visible miner actively working a node.
    const nodeById = new Map(view.nodes.map((n) => [n.id, n]))
    const wanted = new Set<string>()
    for (const d of [...view.ownDrones, ...view.enemyDrones]) {
      if (d.mode !== 'mining' || !d.nodeId) continue
      const node = nodeById.get(d.nodeId)
      if (!node) continue
      if (Math.hypot(node.pos.x - d.pos.x, node.pos.z - d.pos.z) > 90) continue
      wanted.add(d.id)
      let entry = beams.get(d.id)
      if (!entry) {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.8, 2.2, 1, 6, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0x59f2c4,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        )
        const spark = new THREE.Sprite(spriteMat(0x9ffbe2, 0.7))
        spark.scale.setScalar(14)
        entry = { beam, spark }
        beams.set(d.id, entry)
        group.add(beam)
        group.add(spark)
      }
      pointBeam(
        entry.beam,
        new THREE.Vector3(d.pos.x, d.pos.y - 2, d.pos.z),
        new THREE.Vector3(node.pos.x, node.pos.y + 6, node.pos.z),
      )
      entry.spark.position.set(node.pos.x, node.pos.y + 8, node.pos.z)
    }
    for (const [id, entry] of beams) {
      if (!wanted.has(id)) {
        group.remove(entry.beam)
        group.remove(entry.spark)
        beams.delete(id)
      }
    }

    // Satellite sweep rings.
    const activeSweeps = new Set<string>()
    for (const sweep of view.satellite.sweeps) {
      const key = `${sweep.center.x.toFixed(0)}:${sweep.center.z.toFixed(0)}:${sweep.untilTick}`
      activeSweeps.add(key)
      if (!sweeps.has(key)) {
        const y = groundY(sweep.center.x, sweep.center.z) + 4
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(sweep.radius * 0.97, sweep.radius, 64),
          new THREE.MeshBasicMaterial({
            color: 0x9a7bff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.set(sweep.center.x, y, sweep.center.z)
        const wedge = new THREE.Mesh(
          new THREE.CircleGeometry(sweep.radius, 24, 0, 0.5),
          new THREE.MeshBasicMaterial({
            color: 0x9a7bff,
            transparent: true,
            opacity: 0.16,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        )
        wedge.rotation.x = -Math.PI / 2
        wedge.position.set(sweep.center.x, y + 1, sweep.center.z)
        group.add(ring)
        group.add(wedge)
        sweeps.set(key, { ring, wedge, until: sweep.untilTick })
      }
    }
    for (const [key, s] of sweeps) {
      if (!activeSweeps.has(key)) {
        group.remove(s.ring)
        group.remove(s.wedge)
        sweeps.delete(key)
      }
    }

    // Health bars over anything damaged.
    const entities: { id: string; pos: Vec3; hp: number; hpMax: number; lift: number }[] = []
    for (const d of [...view.ownDrones, ...view.enemyDrones]) {
      if (d.hp < d.hpMax) entities.push({ id: d.id, pos: d.pos, hp: d.hp, hpMax: d.hpMax, lift: 22 })
    }
    for (const st of view.structures) {
      if (st.hp < st.hpMax) entities.push({ id: st.id, pos: st.pos, hp: st.hp, hpMax: st.hpMax, lift: 64 })
    }
    const wantedBars = new Set<string>()
    for (const e of entities) {
      wantedBars.add(e.id)
      let bar = bars.get(e.id)
      if (!bar) {
        const holder = new THREE.Group()
        const bg = new THREE.Mesh(
          new THREE.PlaneGeometry(30, 3.4),
          new THREE.MeshBasicMaterial({ color: 0x10151b, transparent: true, opacity: 0.85, depthWrite: false }),
        )
        const fill = new THREE.Mesh(
          new THREE.PlaneGeometry(28, 1.9),
          new THREE.MeshBasicMaterial({ color: 0x53e079, transparent: true, opacity: 0.95, depthWrite: false }),
        )
        fill.position.z = 0.1
        holder.add(bg)
        holder.add(fill)
        bar = { holder, fill, bg }
        bars.set(e.id, bar)
        group.add(holder)
      }
      const pct = Math.max(0, Math.min(1, e.hp / e.hpMax))
      bar.fill.scale.x = Math.max(0.02, pct)
      bar.fill.position.x = -14 * (1 - pct)
      ;(bar.fill.material as THREE.MeshBasicMaterial).color.setHex(
        pct > 0.55 ? 0x53e079 : pct > 0.25 ? 0xe0c453 : 0xe05353,
      )
      bar.holder.position.set(e.pos.x, Math.max(e.pos.y, groundY(e.pos.x, e.pos.z)) + e.lift, e.pos.z)
    }
    for (const [id, bar] of bars) {
      if (!wantedBars.has(id)) {
        group.remove(bar.holder)
        bars.delete(id)
      }
    }
  }

  function update(dt: number, elapsed: number, camera: THREE.Camera): void {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]!
      b.t += dt
      const pos = b.points.geometry.attributes.position as THREE.BufferAttribute
      for (let p = 0; p < pos.count; p++) {
        b.vel[p * 3 + 1]! -= 90 * dt
        pos.setX(p, pos.getX(p) + b.vel[p * 3]! * dt)
        pos.setY(p, pos.getY(p) + b.vel[p * 3 + 1]! * dt)
        pos.setZ(p, pos.getZ(p) + b.vel[p * 3 + 2]! * dt)
      }
      pos.needsUpdate = true
      ;(b.points.material as THREE.PointsMaterial).opacity = 0.95 * (1 - b.t / b.life)
      if (b.t >= b.life) {
        group.remove(b.points)
        b.points.geometry.dispose()
        bursts.splice(i, 1)
      }
    }
    for (let i = timed.length - 1; i >= 0; i--) {
      const e = timed[i]!
      e.t += dt
      e.tick(Math.min(1, e.t / e.life), e)
      if (e.t >= e.life) {
        group.remove(e.obj)
        timed.splice(i, 1)
      }
    }
    // Beams shimmer; sweep wedges rotate; bars face the camera.
    for (const { beam } of beams.values()) {
      ;(beam.material as THREE.MeshBasicMaterial).opacity = 0.38 + Math.sin(elapsed * 14) * 0.14
    }
    for (const s of sweeps.values()) {
      s.wedge.rotation.z = elapsed * 1.7
    }
    for (const bar of bars.values()) {
      bar.holder.quaternion.copy(camera.quaternion)
    }
  }

  return {
    group,
    explosion,
    orderMarker,
    scorch,
    syncView,
    update,
    liveCount: () => bursts.length + timed.length,
  }
}
