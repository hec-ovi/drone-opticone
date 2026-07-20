import * as THREE from 'three/webgpu'
import type { NodeKind, StructureKind } from '@opticone/shared'
import { glowSpriteMaterial } from './glowtex'

/**
 * Structures and resource nodes. Each group may carry
 * userData.animate(dt, elapsed) which the scene loop calls every frame:
 * radar dishes rotate, flare stacks burn, pumpjacks nod, crystals pulse.
 */

const TEAM = { own: 0x3ec6ff, enemy: 0xff4a4a }

function std(color: number, opts: { metal?: number; rough?: number; emissive?: number; flat?: boolean } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metal ?? 0.2,
    roughness: opts.rough ?? 0.75,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissive ? 0.85 : 0,
    flatShading: opts.flat ?? false,
  })
}

function box(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function cyl(rT: number, rB: number, h: number, seg: number, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, seg), material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** Soft additive glow billboard used for beacons and crystals. */
function glowSprite(color: number, size: number): THREE.Sprite {
  const sprite = new THREE.Sprite(glowSpriteMaterial(color, 0.35))
  sprite.scale.setScalar(size)
  return sprite
}

export function makeNodeObject(kind: NodeKind): THREE.Group {
  const group = new THREE.Group()
  if (kind === 'lithium') {
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x63e6c4,
      emissive: 0x2fbf95,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.1,
      flatShading: true,
    })
    const rockMat = std(0x4a5258, { flat: true })
    const shards = [
      { x: 0, z: 0, h: 34, r: 8, tilt: 0 },
      { x: 14, z: 6, h: 24, r: 6, tilt: 0.35 },
      { x: -13, z: 10, h: 19, r: 5, tilt: -0.3 },
      { x: 7, z: -15, h: 27, r: 7, tilt: 0.22 },
      { x: -9, z: -9, h: 15, r: 4, tilt: -0.45 },
      { x: 18, z: -6, h: 12, r: 3.5, tilt: 0.5 },
      { x: -18, z: -2, h: 10, r: 3, tilt: -0.55 },
    ]
    for (const s of shards) {
      const shard = new THREE.Mesh(new THREE.ConeGeometry(s.r, s.h, 5), crystalMat)
      shard.position.set(s.x, s.h / 2 - 1, s.z)
      shard.rotation.z = s.tilt
      shard.rotation.y = s.x * 0.7
      shard.castShadow = true
      group.add(shard)
      const base = new THREE.Mesh(new THREE.IcosahedronGeometry(s.r * 1.1, 0), rockMat)
      base.position.set(s.x, 1.5, s.z)
      group.add(base)
    }
    const glow = glowSprite(0x63e6c4, 60)
    glow.position.y = 12
    group.add(glow)
    group.userData.animate = (_dt: number, elapsed: number) => {
      crystalMat.emissiveIntensity = 0.55 + Math.sin(elapsed * 1.6) * 0.25
      ;(glow.material as THREE.SpriteMaterial).opacity = 0.25 + Math.sin(elapsed * 1.6) * 0.1
    }
  } else {
    // Oil seep: dark pool plus a working pumpjack.
    const steel = std(0x6b7076, { metal: 0.5, rough: 0.5 })
    const rust = std(0x8a5a30, { rough: 0.85 })
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(28, 32, 2.5, 20),
      new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.15, metalness: 0.7 }),
    )
    pool.position.y = 1.2
    pool.receiveShadow = true
    group.add(pool)

    const base = box(26, 3, 10, std(0x3d4248))
    base.position.set(6, 1.5, 0)
    group.add(base)
    // Samson post (A-frame).
    for (const side of [1, -1]) {
      const leg = box(2.2, 26, 2.2, steel)
      leg.position.set(6, 13, side * 4)
      leg.rotation.x = side * -0.14
      group.add(leg)
    }
    // Walking beam with horsehead, rocking around the post top.
    const beamPivot = new THREE.Group()
    beamPivot.position.set(6, 26, 0)
    group.add(beamPivot)
    const beam = box(30, 2.4, 2.4, rust)
    beamPivot.add(beam)
    const horsehead = box(4, 8, 5, rust)
    horsehead.position.set(-15, -2, 0)
    beamPivot.add(horsehead)
    // Crank wheel.
    const wheel = cyl(4.5, 4.5, 1.4, 14, steel)
    wheel.rotation.x = Math.PI / 2
    wheel.position.set(16, 6, 0)
    group.add(wheel)
    const pitman = box(1.2, 18, 1.2, steel)
    pitman.position.set(15, 15, 0)
    group.add(pitman)
    const barrel1 = cyl(3, 3, 8, 10, rust)
    barrel1.position.set(-6, 4, 14)
    group.add(barrel1)
    const barrel2 = cyl(3, 3, 8, 10, steel)
    barrel2.position.set(-12, 4, 11)
    group.add(barrel2)

    group.userData.animate = (_dt: number, elapsed: number) => {
      beamPivot.rotation.z = Math.sin(elapsed * 1.3) * 0.16
      wheel.rotation.y = elapsed * 1.3
    }
  }
  return group
}

export function makeStructureObject(kind: StructureKind, own: boolean): THREE.Group {
  const group = new THREE.Group()
  const accent = own ? TEAM.own : TEAM.enemy
  const accentMat = std(accent, { emissive: accent })
  const hull = std(0x565e66, { rough: 0.7 })
  const hullDark = std(0x3a4148, { rough: 0.8 })
  const hullLight = std(0x7d868e, { rough: 0.6 })

  switch (kind) {
    case 'centcomm': {
      // Command bastion: octagonal platform, armored core, glass dome,
      // rotating long-range radar, corner pylons with running lights.
      const platform = cyl(38, 42, 6, 8, hullDark)
      platform.position.y = 3
      group.add(platform)
      const core = cyl(24, 28, 22, 8, hull)
      core.position.y = 17
      group.add(core)
      const trim = cyl(24.6, 24.6, 2.2, 8, accentMat)
      trim.position.y = 26
      group.add(trim)
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({
          color: 0x9fd6e8,
          emissive: accent,
          emissiveIntensity: 0.25,
          roughness: 0.15,
          metalness: 0.4,
          transparent: true,
          opacity: 0.85,
        }),
      )
      dome.position.y = 28
      group.add(dome)
      // Radar mast.
      const mast = cyl(1.6, 1.6, 26, 6, hullDark)
      mast.position.set(20, 41, 0)
      group.add(mast)
      const radar = new THREE.Group()
      radar.position.set(20, 54, 0)
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(9, 3, 4, 12, 1, true), hullLight)
      dish.rotation.z = 1.15
      dish.position.x = 2
      radar.add(dish)
      group.add(radar)
      // Corner pylons with beacons.
      const beacons: THREE.Mesh[] = []
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const pylon = box(3.5, 16, 3.5, hull)
        pylon.position.set(Math.cos(a) * 34, 8, Math.sin(a) * 34)
        group.add(pylon)
        const light = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), std(accent, { emissive: accent }))
        light.position.set(Math.cos(a) * 34, 17.5, Math.sin(a) * 34)
        group.add(light)
        beacons.push(light)
      }
      const glow = glowSprite(accent, 40)
      glow.position.y = 34
      group.add(glow)
      group.userData.animate = (_dt: number, elapsed: number) => {
        radar.rotation.y = elapsed * 0.9
        beacons.forEach((b, i) => {
          const m = b.material as THREE.MeshStandardMaterial
          m.emissiveIntensity = 0.4 + Math.max(0, Math.sin(elapsed * 3 + i * 1.57)) * 0.8
        })
      }
      break
    }
    case 'refinery': {
      // Cracking plant: twin distillation columns, pipe rack, storage tanks,
      // flare stack with a live flame.
      const slab = box(56, 3, 44, hullDark)
      slab.position.y = 1.5
      group.add(slab)
      const hall = box(26, 16, 20, hull)
      hall.position.set(-10, 11, -8)
      group.add(hall)
      // Trim band just under the roofline so only its edges show from above.
      const trim = box(26.8, 1.6, 20.8, accentMat)
      trim.position.set(-10, 17.4, -8)
      group.add(trim)
      for (const [dx, h] of [
        [8, 34],
        [18, 28],
      ] as const) {
        const column = cyl(4.5, 4.5, h, 12, hullLight)
        column.position.set(dx, h / 2 + 3, -10)
        group.add(column)
        for (let r = 1; r < 4; r++) {
          const ring = cyl(4.9, 4.9, 0.9, 12, hullDark)
          ring.position.set(dx, (h / 4) * r + 3, -10)
          group.add(ring)
        }
      }
      for (const [dx, dz] of [
        [-16, 12],
        [-4, 14],
      ] as const) {
        const tank = cyl(7, 7, 10, 14, hullLight)
        tank.position.set(dx, 8, dz)
        group.add(tank)
      }
      // Pipe rack between columns and hall.
      for (const dy of [6, 8.5]) {
        const pipe = cyl(0.8, 0.8, 24, 8, hullLight)
        pipe.rotation.z = Math.PI / 2
        pipe.position.set(-2, dy, -10)
        group.add(pipe)
      }
      // Flare stack.
      const stack = cyl(1.4, 2, 40, 8, hullDark)
      stack.position.set(24, 23, 8)
      group.add(stack)
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(2.6, 9, 8),
        new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 0.9 }),
      )
      flame.position.set(24, 47, 8)
      group.add(flame)
      const flameGlow = glowSprite(0xffa63d, 26)
      flameGlow.position.set(24, 48, 8)
      group.add(flameGlow)
      group.userData.animate = (_dt: number, elapsed: number) => {
        const f = 0.8 + Math.sin(elapsed * 9) * 0.2 + Math.sin(elapsed * 23) * 0.1
        flame.scale.set(f, 0.8 + f * 0.5, f)
        ;(flameGlow.material as THREE.SpriteMaterial).opacity = 0.2 + f * 0.15
      }
      break
    }
    case 'factory': {
      // Assembly works: sawtooth hall, gantry crane, lit landing pad.
      const slab = box(64, 2.5, 50, hullDark)
      slab.position.y = 1.25
      group.add(slab)
      const hall = box(34, 14, 34, hull)
      hall.position.set(-12, 9, 0)
      group.add(hall)
      for (let i = 0; i < 3; i++) {
        const tooth = box(10, 5, 34, hullLight)
        tooth.position.set(-24 + i * 12, 18.2, 0)
        tooth.rotation.z = 0.5
        group.add(tooth)
      }
      const door = box(1.5, 9, 14, accentMat)
      door.position.set(5.5, 5.5, 0)
      group.add(door)
      // Gantry crane sliding over the pad.
      const rails = new THREE.Group()
      for (const dz of [-14, 14]) {
        const rail = box(34, 1.2, 1.6, hullDark)
        rail.position.set(20, 12, dz)
        rails.add(rail)
      }
      group.add(rails)
      const crane = new THREE.Group()
      const beam = box(2.5, 1.8, 30, hullLight)
      beam.position.y = 12.8
      crane.add(beam)
      for (const dz of [-14, 14]) {
        const leg = box(2, 12, 2, hullLight)
        leg.position.set(0, 6.4, dz)
        crane.add(leg)
      }
      const hook = box(1, 5, 1, accentMat)
      hook.position.y = 9.5
      crane.add(hook)
      crane.position.x = 20
      group.add(crane)
      // Landing pad with running lights.
      const pad = cyl(13, 13, 1.8, 20, hullLight)
      pad.position.set(20, 2.6, 0)
      group.add(pad)
      const padRing = cyl(13.4, 13.4, 0.8, 20, accentMat)
      padRing.position.set(20, 2.4, 0)
      group.add(padRing)
      const lights: THREE.Mesh[] = []
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 6), std(accent, { emissive: accent }))
        l.position.set(20 + Math.cos(a) * 11.5, 3.6, Math.sin(a) * 11.5)
        group.add(l)
        lights.push(l)
      }
      group.userData.animate = (_dt: number, elapsed: number) => {
        crane.position.x = 20 + Math.sin(elapsed * 0.5) * 8
        lights.forEach((l, i) => {
          const m = l.material as THREE.MeshStandardMaterial
          m.emissiveIntensity = 0.3 + Math.max(0, Math.sin(elapsed * 4 - i * 1.05)) * 1.1
        })
      }
      break
    }
    case 'relay': {
      // Lattice comms mast with sector antennas.
      const base = box(10, 3, 10, hullDark)
      base.position.y = 1.5
      group.add(base)
      for (let s = 0; s < 3; s++) {
        const seg = cyl(2.4 - s * 0.6, 3 - s * 0.6, 16, 6, hull)
        seg.position.y = 3 + s * 16 + 8
        group.add(seg)
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        const panel = box(1, 8, 3, hullLight)
        panel.position.set(Math.cos(a) * 3.4, 44, Math.sin(a) * 3.4)
        panel.rotation.y = -a
        group.add(panel)
      }
      const tip = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), std(accent, { emissive: accent }))
      tip.position.y = 53
      group.add(tip)
      const tipGlow = glowSprite(accent, 14)
      tipGlow.position.y = 53
      group.add(tipGlow)
      group.userData.animate = (_dt: number, elapsed: number) => {
        const m = tip.material as THREE.MeshStandardMaterial
        const pulse = 0.3 + Math.max(0, Math.sin(elapsed * 2.4)) * 1.1
        m.emissiveIntensity = pulse
        ;(tipGlow.material as THREE.SpriteMaterial).opacity = 0.12 + pulse * 0.14
      }
      break
    }
    case 'satellite-uplink': {
      // Deep-space dish on a slewing yoke plus an equipment hut.
      const hut = box(20, 10, 16, hull)
      hut.position.set(-14, 5, 0)
      group.add(hut)
      const trim = box(20.8, 1.4, 16.8, accentMat)
      trim.position.set(-14, 8.6, 0)
      group.add(trim)
      const pedestal = cyl(5, 7, 10, 10, hullDark)
      pedestal.position.set(8, 5, 0)
      group.add(pedestal)
      const yoke = new THREE.Group()
      yoke.position.set(8, 12, 0)
      group.add(yoke)
      const dish = new THREE.Group()
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(16, 3, 7, 18, 1, true), hullLight)
      ;(bowl.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
      dish.add(bowl)
      const feed = cyl(0.5, 0.5, 12, 6, hullDark)
      feed.position.y = 8
      dish.add(feed)
      const horn = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), std(accent, { emissive: accent }))
      horn.position.y = 14
      dish.add(horn)
      dish.rotation.z = 0.7
      dish.position.y = 6
      yoke.add(dish)
      group.userData.animate = (_dt: number, elapsed: number) => {
        yoke.rotation.y = Math.sin(elapsed * 0.22) * 1.2
        dish.rotation.z = 0.65 + Math.sin(elapsed * 0.13) * 0.2
      }
      break
    }
    case 'power-plant': {
      // Lithium power plant: waisted cooling tower with drifting steam,
      // turbine hall, and a rack of glowing lithium cells feeding the grid.
      const slab = box(52, 3, 42, hullDark)
      slab.position.y = 1.5
      group.add(slab)
      const towerLower = cyl(12, 17, 26, 14, hullLight)
      towerLower.position.set(-12, 16, -4)
      group.add(towerLower)
      const towerUpper = cyl(14.5, 11.6, 14, 14, hull)
      towerUpper.position.set(-12, 36, -4)
      group.add(towerUpper)
      const steam = glowSprite(0xd7e2e8, 34)
      steam.position.set(-12, 48, -4)
      group.add(steam)
      const hall = box(24, 12, 16, hull)
      hall.position.set(12, 7.5, -8)
      group.add(hall)
      const trim = box(24.8, 1.6, 16.8, accentMat)
      trim.position.set(12, 13, -8)
      group.add(trim)
      // Lithium cell rack: the glow reads teal like the crystal nodes.
      const cellMat = new THREE.MeshStandardMaterial({
        color: 0x63e6c4,
        emissive: 0x2fbf95,
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.2,
      })
      const cells: THREE.Mesh[] = []
      for (let i = 0; i < 3; i++) {
        const frame = cyl(3.2, 3.2, 9, 10, hullDark)
        frame.position.set(4 + i * 8, 4.5, 12)
        group.add(frame)
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 7, 10), cellMat)
        cell.position.set(4 + i * 8, 9, 12)
        group.add(cell)
        cells.push(cell)
      }
      // Pylon carrying the feed to the base.
      const pylon = box(2, 18, 2, hullLight)
      pylon.position.set(24, 9, 8)
      group.add(pylon)
      const cross = box(10, 1.4, 1.4, hullLight)
      cross.position.set(24, 16, 8)
      group.add(cross)
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), std(accent, { emissive: accent }))
      beacon.position.set(24, 19, 8)
      group.add(beacon)
      group.userData.animate = (_dt: number, elapsed: number) => {
        cellMat.emissiveIntensity = 0.7 + Math.sin(elapsed * 2.2) * 0.35
        const puff = 0.9 + Math.sin(elapsed * 0.8) * 0.2
        steam.scale.setScalar(30 * puff)
        ;(steam.material as THREE.SpriteMaterial).opacity = 0.16 + Math.sin(elapsed * 0.8) * 0.05
        const m = beacon.material as THREE.MeshStandardMaterial
        m.emissiveIntensity = 0.4 + Math.max(0, Math.sin(elapsed * 2.6)) * 0.9
      }
      break
    }
    case 'air-defense': {
      // SAM battery: slewing quad missile rack on a turret ring plus a fast
      // search radar. The detector half of "missile defense".
      const slab = box(36, 3, 32, hullDark)
      slab.position.y = 1.5
      group.add(slab)
      const ring = cyl(11, 13, 4, 12, hullDark)
      ring.position.set(-4, 5, 2)
      group.add(ring)
      const turret = new THREE.Group()
      turret.position.set(-4, 7, 2)
      group.add(turret)
      const cradle = box(10, 3, 8, hull)
      cradle.position.y = 2
      turret.add(cradle)
      const rack = new THREE.Group()
      rack.position.y = 4
      rack.rotation.z = 0.6
      turret.add(rack)
      for (const [dy, dz] of [
        [1.6, 1.6],
        [1.6, -1.6],
        [-1.6, 1.6],
        [-1.6, -1.6],
      ] as const) {
        const tube = cyl(1.3, 1.3, 14, 8, hullLight)
        tube.rotation.z = Math.PI / 2
        tube.position.set(0, dy, dz)
        rack.add(tube)
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1.25, 8, 8), std(accent, { emissive: accent }))
        cap.position.set(7, dy, dz)
        rack.add(cap)
      }
      // Search radar on its own mast.
      const mast = cyl(1.2, 1.5, 12, 6, hullDark)
      mast.position.set(11, 8, -8)
      group.add(mast)
      const radar = new THREE.Group()
      radar.position.set(11, 14.5, -8)
      const panel = box(9, 4.5, 0.8, hullLight)
      panel.position.y = 1.5
      radar.add(panel)
      group.add(radar)
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        std(accent, { emissive: accent }),
      )
      dome.position.set(10, 3, 8)
      group.add(dome)
      group.userData.animate = (_dt: number, elapsed: number) => {
        radar.rotation.y = elapsed * 2.4
        turret.rotation.y = Math.sin(elapsed * 0.4) * 1.1
        const m = dome.material as THREE.MeshStandardMaterial
        m.emissiveIntensity = 0.35 + Math.max(0, Math.sin(elapsed * 5)) * 0.7
      }
      break
    }
    case 'market': {
      // Trade hub: exchange hall, antenna, and a spinning holo credit disc.
      const slab = box(44, 3, 36, hullDark)
      slab.position.y = 1.5
      group.add(slab)
      const hall = box(26, 13, 20, hull)
      hall.position.set(-4, 8, 0)
      group.add(hall)
      const awning = box(28, 1.5, 24, accentMat)
      awning.position.set(-4, 14.5, 0)
      group.add(awning)
      for (const [dx, dz] of [
        [14, 10],
        [17, 4],
        [14, -4],
      ] as const) {
        const crate = box(4.5, 4.5, 4.5, hullLight)
        crate.position.set(dx, 3.5, dz)
        crate.rotation.y = dx * 0.4
        group.add(crate)
      }
      const mast = cyl(0.9, 0.9, 16, 6, hullDark)
      mast.position.set(-14, 22, -6)
      group.add(mast)
      const holo = new THREE.Mesh(
        new THREE.CylinderGeometry(5, 5, 0.8, 18),
        new THREE.MeshStandardMaterial({
          color: 0xe0c453,
          emissive: 0xe0c453,
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.85,
        }),
      )
      holo.rotation.z = Math.PI / 2
      holo.position.set(-14, 32, -6)
      group.add(holo)
      const glow = glowSprite(0xe0c453, 22)
      glow.position.set(-14, 32, -6)
      group.add(glow)
      group.userData.animate = (_dt: number, elapsed: number) => {
        holo.rotation.y = elapsed * 1.6
        ;(holo.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + Math.sin(elapsed * 2) * 0.25
      }
      break
    }
    case 'storehouse': {
      // Forward depot: silo pair, crate rows, landing beacon for the haulers.
      const slab = box(40, 3, 34, hullDark)
      slab.position.y = 1.5
      group.add(slab)
      for (const dx of [-8, 4] as const) {
        const silo = cyl(6, 6, 18, 12, hullLight)
        silo.position.set(dx, 12, -6)
        group.add(silo)
        const cap = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hull)
        cap.position.set(dx, 21, -6)
        group.add(cap)
      }
      for (let i = 0; i < 4; i++) {
        const crate = box(4, 4, 4, i % 2 ? hull : hullLight)
        crate.position.set(-12 + i * 7, 5, 10)
        crate.rotation.y = i * 0.5
        group.add(crate)
      }
      const pad = cyl(8, 8, 1.4, 16, hullDark)
      pad.position.set(14, 2.4, 4)
      group.add(pad)
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 8), std(accent, { emissive: accent }))
      beacon.position.set(14, 5, 4)
      group.add(beacon)
      group.userData.animate = (_dt: number, elapsed: number) => {
        const m = beacon.material as THREE.MeshStandardMaterial
        m.emissiveIntensity = 0.4 + Math.max(0, Math.sin(elapsed * 3.2)) * 1
      }
      break
    }
  }
  return group
}
