import * as THREE from 'three/webgpu'
import type { NodeKind, StructureKind } from '@opticone/shared'
import { structureColor } from './visuals'

function lambert(color: number, emissive = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: emissive ? 0.6 : 0 })
}

/** Lithium: crystal cluster. Oil: dark pool with a derrick tower. */
export function makeNodeObject(kind: NodeKind): THREE.Group {
  const group = new THREE.Group()
  if (kind === 'lithium') {
    const mat = new THREE.MeshLambertMaterial({ color: 0x63e6c4, emissive: 0x1e8a70, emissiveIntensity: 0.55 })
    const shards = [
      { x: 0, z: 0, h: 34, r: 9, tilt: 0 },
      { x: 14, z: 6, h: 22, r: 6, tilt: 0.35 },
      { x: -12, z: 10, h: 18, r: 5, tilt: -0.3 },
      { x: 6, z: -14, h: 26, r: 7, tilt: 0.2 },
      { x: -8, z: -9, h: 14, r: 4, tilt: -0.45 },
    ]
    for (const s of shards) {
      const shard = new THREE.Mesh(new THREE.ConeGeometry(s.r, s.h, 5), mat)
      shard.position.set(s.x, s.h / 2, s.z)
      shard.rotation.z = s.tilt
      group.add(shard)
    }
  } else {
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(30, 34, 3, 20),
      new THREE.MeshLambertMaterial({ color: 0x0c0c10 }),
    )
    pool.position.y = 1.5
    group.add(pool)
    const towerMat = lambert(0x6b6f75)
    const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 42, 5), towerMat)
    tower.position.set(12, 21, 0)
    group.add(tower)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 4), towerMat)
    arm.position.set(4, 40, 0)
    group.add(arm)
  }
  return group
}

export function makeStructureObject(kind: StructureKind, own: boolean): THREE.Group {
  const group = new THREE.Group()
  const color = structureColor(kind, own)
  const bodyMat = lambert(color)
  const darkMat = lambert(0x3a4450)

  const add = (mesh: THREE.Mesh) => group.add(mesh)

  switch (kind) {
    case 'centcomm': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(52, 26, 52), bodyMat)
      body.position.y = 13
      add(body)
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 34, 6), darkMat)
      mast.position.set(14, 26 + 17, 14)
      add(mast)
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(4, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.9 }),
      )
      beacon.position.set(14, 26 + 34, 14)
      add(beacon)
      break
    }
    case 'refinery': {
      const hall = new THREE.Mesh(new THREE.BoxGeometry(40, 18, 28), bodyMat)
      hall.position.y = 9
      add(hall)
      for (const dx of [-10, 10]) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 26, 12), darkMat)
        tank.position.set(dx, 13, 22)
        add(tank)
      }
      break
    }
    case 'factory': {
      const hall = new THREE.Mesh(new THREE.BoxGeometry(48, 16, 36), bodyMat)
      hall.position.y = 8
      add(hall)
      const roof = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 36), darkMat)
      roof.position.set(-8, 16 + 5, 0)
      add(roof)
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 2, 16), darkMat)
      pad.position.set(30, 1, 0)
      add(pad)
      break
    }
    case 'relay': {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 40, 6), bodyMat)
      tower.position.y = 20
      add(tower)
      const ball = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 8), darkMat)
      ball.position.y = 44
      add(ball)
      break
    }
    case 'satellite-uplink': {
      const hut = new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24), bodyMat)
      hut.position.y = 6
      add(hut)
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(16, 4, 8, 14, 1, true), darkMat)
      dish.position.set(0, 22, 0)
      dish.rotation.z = 0.8
      add(dish)
      break
    }
  }
  return group
}
