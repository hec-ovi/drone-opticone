import * as THREE from 'three/webgpu'
import type { DroneSpec } from '@opticone/shared'
import { droneMarkerSize } from './visuals'

/**
 * Procedural drone models, one recognizable silhouette per airframe.
 * Built nose along +X at roughly unit size, then scaled to the class marker
 * size. Every model returns animation hooks: spinning rotors, hover bob,
 * banking into turns, loss-of-control flutter.
 */

export const TEAM_ACCENT = { own: 0x3ec6ff, enemy: 0xff4a4a }

export interface DroneAnimOpts {
  moving: boolean
  uncontrolled: boolean
}

export interface DroneModel {
  root: THREE.Group
  /** Parts that spin each frame (rotors, props). */
  spinners: { node: THREE.Object3D; rate: number }[]
  /** Inner airframe used for bob / bank / flutter so heading stays on root. */
  airframe: THREE.Group
  /** true for multirotors (bob + pitch), false for winged types (bank). */
  hovers: boolean
  animate(dt: number, elapsed: number, opts: DroneAnimOpts): void
}

function std(color: number, opts: { metal?: number; rough?: number; emissive?: number; flat?: boolean } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metal ?? 0.25,
    roughness: opts.rough ?? 0.65,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissive ? 0.9 : 0,
    flatShading: opts.flat ?? false,
  })
}

function box(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
}

function cyl(rTop: number, rBot: number, h: number, seg: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material)
}

/** Two-blade rotor with a faint spin-blur disc; spins about local Y. */
function makeRotor(radius: number, bladeMat: THREE.Material, blurColor: number): THREE.Group {
  const g = new THREE.Group()
  const hub = cyl(radius * 0.08, radius * 0.08, radius * 0.12, 6, bladeMat)
  g.add(hub)
  for (const side of [1, -1]) {
    const blade = box(radius * 0.95, radius * 0.02, radius * 0.11, bladeMat)
    blade.position.x = side * radius * 0.5
    blade.rotation.y = side === 1 ? 0.08 : Math.PI + 0.08
    g.add(blade)
  }
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 18),
    new THREE.MeshBasicMaterial({ color: blurColor, transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
  )
  blur.rotation.x = -Math.PI / 2
  g.add(blur)
  return g
}

/** Rear pusher propeller spinning about local X (flight axis). */
function makePusherProp(radius: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  for (const a of [0, Math.PI / 2]) {
    const blade = box(radius * 0.05, radius * 1.9, radius * 0.16, mat)
    blade.rotation.x = a
    g.add(blade)
  }
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 16),
    new THREE.MeshBasicMaterial({ color: 0x99a4b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
  )
  blur.rotation.y = Math.PI / 2
  g.add(blur)
  return g
}

interface Built {
  airframe: THREE.Group
  spinners: { node: THREE.Object3D; rate: number }[]
  /** multirotors bob and tilt into motion; winged types bank in turns */
  hovers: boolean
}

function buildQuad(accent: number, opts: { sleek: boolean }): Built {
  const airframe = new THREE.Group()
  const spinners: Built['spinners'] = []
  const bodyMat = std(opts.sleek ? 0x9aa4ad : 0x23262b, { rough: 0.5 })
  const darkMat = std(0x2e3238, { rough: 0.8 })
  const accentMat = std(accent, { emissive: accent })

  const body = box(0.62, 0.16, 0.3, bodyMat)
  body.position.y = 0.05
  airframe.add(body)
  if (opts.sleek) {
    // Recon quad: camera gimbal under the nose.
    const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), darkMat)
    gimbal.position.set(0.28, -0.05, 0)
    airframe.add(gimbal)
  } else {
    // FPV strike quad: top battery pack and a nose warhead.
    const pack = box(0.3, 0.1, 0.2, accentMat)
    pack.position.y = 0.17
    airframe.add(pack)
    const charge = cyl(0.07, 0.07, 0.3, 8, darkMat)
    charge.rotation.z = Math.PI / 2
    charge.position.set(0.3, -0.02, 0)
    airframe.add(charge)
  }
  const tail = box(0.1, 0.04, 0.06, accentMat)
  tail.position.set(-0.32, 0.08, 0)
  airframe.add(tail)

  for (const [ax, az] of [
    [0.3, 0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [-0.3, -0.3],
  ] as const) {
    const arm = box(0.34, 0.04, 0.07, darkMat)
    arm.position.set(ax * 0.55, 0.08, az * 0.55)
    arm.rotation.y = Math.atan2(-az, ax)
    airframe.add(arm)
    const rotor = makeRotor(0.22, darkMat, accent)
    rotor.position.set(ax, 0.14, az)
    airframe.add(rotor)
    spinners.push({ node: rotor, rate: 34 + (ax > 0 ? 3 : 0) })
  }
  return { airframe, spinners, hovers: true }
}

function buildSwitchblade(accent: number): Built {
  const airframe = new THREE.Group()
  const spinners: Built['spinners'] = []
  const bodyMat = std(0x8b9184, { rough: 0.55 })
  const wingMat = std(0x767c70, { rough: 0.6 })

  const tube = cyl(0.09, 0.09, 0.95, 10, bodyMat)
  tube.rotation.z = Math.PI / 2
  airframe.add(tube)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 10), bodyMat)
  nose.rotation.z = -Math.PI / 2
  nose.position.x = 0.57
  airframe.add(nose)
  // Tandem pop-out wings: long front pair, short rear pair.
  const front = box(0.09, 0.02, 1.15, wingMat)
  front.position.set(0.22, 0.05, 0)
  airframe.add(front)
  const rear = box(0.08, 0.02, 0.6, wingMat)
  rear.position.set(-0.32, 0.05, 0)
  airframe.add(rear)
  const fin = box(0.08, 0.16, 0.02, wingMat)
  fin.position.set(-0.4, 0.1, 0)
  airframe.add(fin)
  const stripe = box(0.06, 0.02, 0.2, std(accent, { emissive: accent }))
  stripe.position.set(0, 0.09, 0)
  airframe.add(stripe)

  const prop = makePusherProp(0.16, wingMat)
  prop.position.x = -0.52
  airframe.add(prop)
  spinners.push({ node: prop, rate: 30 })
  return { airframe, spinners, hovers: false }
}

function buildDeltaWing(accent: number): Built {
  const airframe = new THREE.Group()
  const spinners: Built['spinners'] = []
  const bodyMat = std(0x9aa0a6, { rough: 0.6, flat: true })

  // Delta planform: swept triangle, clipped trailing edge.
  const shape = new THREE.Shape()
  shape.moveTo(0.55, 0)
  shape.lineTo(-0.45, 0.62)
  shape.lineTo(-0.45, -0.62)
  shape.closePath()
  const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }), bodyMat)
  wing.rotation.x = Math.PI / 2
  wing.position.y = 0.02
  airframe.add(wing)

  // Center pod and nose.
  const pod = box(0.7, 0.12, 0.14, bodyMat)
  pod.position.set(0.05, 0.03, 0)
  airframe.add(pod)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), bodyMat)
  nose.rotation.z = -Math.PI / 2
  nose.position.set(0.48, 0.03, 0)
  airframe.add(nose)

  // Wingtip stabilizers above and below, the Shahed signature.
  for (const side of [1, -1]) {
    const stab = box(0.16, 0.22, 0.02, bodyMat)
    stab.position.set(-0.42, 0.06, side * 0.58)
    airframe.add(stab)
    const below = box(0.16, 0.1, 0.02, bodyMat)
    below.position.set(-0.42, -0.08, side * 0.58)
    airframe.add(below)
  }
  const stripe = box(0.3, 0.015, 0.5, std(accent, { emissive: accent }))
  stripe.position.set(-0.2, 0.06, 0)
  airframe.add(stripe)

  const prop = makePusherProp(0.14, bodyMat)
  prop.position.set(-0.5, 0.03, 0)
  airframe.add(prop)
  spinners.push({ node: prop, rate: 26 })
  return { airframe, spinners, hovers: false }
}

function buildTb2(accent: number): Built {
  const airframe = new THREE.Group()
  const spinners: Built['spinners'] = []
  const bodyMat = std(0xb9c0c7, { rough: 0.5 })
  const darkMat = std(0x3a4046, { rough: 0.7 })

  const fuselage = box(0.7, 0.13, 0.14, bodyMat)
  fuselage.position.y = 0.04
  airframe.add(fuselage)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), bodyMat)
  nose.position.set(0.36, 0.04, 0)
  airframe.add(nose)
  // Chin sensor turret.
  const turret = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), darkMat)
  turret.position.set(0.28, -0.04, 0)
  airframe.add(turret)
  // Long straight wing with slight dihedral.
  for (const side of [1, -1]) {
    const wing = box(0.16, 0.02, 0.62, bodyMat)
    wing.position.set(0.05, 0.11, side * 0.32)
    wing.rotation.x = side * -0.05
    airframe.add(wing)
    const stripe = box(0.16, 0.015, 0.1, std(accent, { emissive: accent }))
    stripe.position.set(0.05, 0.125, side * 0.55)
    airframe.add(stripe)
    // Twin tail booms into the inverted-V tail.
    const boom = box(0.6, 0.035, 0.035, bodyMat)
    boom.position.set(-0.32, 0.08, side * 0.16)
    airframe.add(boom)
    const vtail = box(0.16, 0.02, 0.24, bodyMat)
    vtail.position.set(-0.6, 0.16, side * 0.09)
    vtail.rotation.x = side * 0.85
    airframe.add(vtail)
  }
  const prop = makePusherProp(0.15, darkMat)
  prop.position.set(-0.44, 0.06, 0)
  airframe.add(prop)
  spinners.push({ node: prop, rate: 24 })
  return { airframe, spinners, hovers: false }
}

function buildCargoLifter(accent: number): Built {
  const airframe = new THREE.Group()
  const spinners: Built['spinners'] = []
  const bodyMat = std(0x2c2f33, { rough: 0.6 })
  const accentMat = std(accent, { emissive: accent })

  const body = box(0.5, 0.18, 0.34, bodyMat)
  body.position.y = 0.22
  airframe.add(body)
  const top = box(0.3, 0.06, 0.2, accentMat)
  top.position.y = 0.34
  airframe.add(top)
  // Landing skids.
  for (const side of [1, -1]) {
    const skid = box(0.55, 0.025, 0.03, bodyMat)
    skid.position.set(0, 0.02, side * 0.2)
    airframe.add(skid)
    for (const lx of [0.18, -0.18]) {
      const leg = box(0.025, 0.2, 0.03, bodyMat)
      leg.position.set(lx, 0.12, side * 0.2)
      airframe.add(leg)
    }
  }
  // Slung cargo crate on cables.
  const crate = box(0.22, 0.16, 0.22, std(0x8a6d3b, { rough: 0.9 }))
  crate.position.y = -0.18
  airframe.add(crate)
  for (const [cx, cz] of [
    [0.09, 0.09],
    [0.09, -0.09],
    [-0.09, 0.09],
    [-0.09, -0.09],
  ] as const) {
    const cable = cyl(0.004, 0.004, 0.28, 4, bodyMat)
    cable.position.set(cx, -0.03, cz)
    airframe.add(cable)
  }
  // Four arms, coaxial twin rotors per arm.
  for (const [ax, az] of [
    [0.42, 0.42],
    [0.42, -0.42],
    [-0.42, 0.42],
    [-0.42, -0.42],
  ] as const) {
    const arm = box(0.5, 0.045, 0.07, bodyMat)
    arm.position.set(ax * 0.5, 0.3, az * 0.5)
    arm.rotation.y = Math.atan2(-az, ax)
    airframe.add(arm)
    for (const [dy, rate] of [
      [0.38, 26],
      [0.24, -26],
    ] as const) {
      const rotor = makeRotor(0.3, bodyMat, accent)
      rotor.position.set(ax, dy, az)
      airframe.add(rotor)
      spinners.push({ node: rotor, rate })
    }
  }
  return { airframe, spinners, hovers: true }
}

function buildMiner(accent: number): Built {
  const airframe = new THREE.Group()
  const spinners: Built['spinners'] = []
  const frameMat = std(0x37413a, { rough: 0.7 })
  const hazardMat = std(0xd9a520, { rough: 0.55 })

  // Translucent slurry tank.
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.26, 12),
    new THREE.MeshStandardMaterial({ color: 0x66d9a8, transparent: true, opacity: 0.55, roughness: 0.3 }),
  )
  tank.position.y = 0.2
  airframe.add(tank)
  const cap = cyl(0.21, 0.21, 0.05, 12, hazardMat)
  cap.position.y = 0.35
  airframe.add(cap)
  const chassis = box(0.55, 0.08, 0.4, frameMat)
  chassis.position.y = 0.05
  airframe.add(chassis)
  // Intake auger under the belly.
  const auger = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), hazardMat)
  auger.rotation.x = Math.PI
  auger.position.y = -0.12
  airframe.add(auger)

  for (const [ax, az] of [
    [0.45, 0.45],
    [0.45, -0.45],
    [-0.45, 0.45],
    [-0.45, -0.45],
  ] as const) {
    const arm = box(0.5, 0.045, 0.07, frameMat)
    arm.position.set(ax * 0.5, 0.28, az * 0.5)
    arm.rotation.y = Math.atan2(-az, ax)
    airframe.add(arm)
    const rotor = makeRotor(0.32, frameMat, accent)
    rotor.position.set(ax, 0.35, az)
    airframe.add(rotor)
    spinners.push({ node: rotor, rate: 22 })
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), std(accent, { emissive: accent }))
  beacon.position.y = 0.42
  airframe.add(beacon)
  return { airframe, spinners, hovers: true }
}

function buildFor(spec: DroneSpec, accent: number): Built {
  switch (spec.id) {
    case 'mavic3':
      return buildQuad(accent, { sleek: true })
    case 'fpv-strike':
      return buildQuad(accent, { sleek: false })
    case 'switchblade300':
      return buildSwitchblade(accent)
    case 'shahed136':
      return buildDeltaWing(accent)
    case 'tb2':
      return buildTb2(accent)
    case 'flycart30':
      return buildCargoLifter(accent)
    case 'ore-miner':
      return buildMiner(accent)
  }
  // Unknown (player-uploaded) specs fall back by class.
  switch (spec.class) {
    case 'multirotor':
      return buildQuad(accent, { sleek: spec.payloadKg === 0 })
    case 'loitering-munition':
      return spec.massKg > 20 ? buildDeltaWing(accent) : buildSwitchblade(accent)
    case 'fixed-wing':
      return buildTb2(accent)
    case 'cargo':
      return buildCargoLifter(accent)
    case 'mining':
      return buildMiner(accent)
  }
}

export function makeDroneModel(spec: DroneSpec, own: boolean): DroneModel {
  const accent = own ? TEAM_ACCENT.own : TEAM_ACCENT.enemy
  const built = buildFor(spec, accent)
  const root = new THREE.Group()
  root.add(built.airframe)
  const scale = droneMarkerSize(spec.class)
  root.scale.setScalar(scale)

  const phase = Math.random() * Math.PI * 2

  return {
    root,
    spinners: built.spinners,
    airframe: built.airframe,
    hovers: built.hovers,
    animate(dt, elapsed, opts) {
      for (const s of built.spinners) s.node.rotation.y += s.rate * dt
      if (built.hovers) {
        built.airframe.position.y = Math.sin(elapsed * 2.2 + phase) * 0.035
        // Multirotors nose down into forward flight.
        const targetPitch = opts.moving ? 0.16 : 0
        built.airframe.rotation.z += (targetPitch - built.airframe.rotation.z) * Math.min(1, dt * 5)
      }
      if (opts.uncontrolled) {
        built.airframe.rotation.x = Math.sin(elapsed * 11 + phase) * 0.22
        built.airframe.rotation.z = Math.cos(elapsed * 9 + phase) * 0.18
      } else if (!built.hovers) {
        built.airframe.rotation.x *= 1 - Math.min(1, dt * 3)
      }
    },
  }
}
