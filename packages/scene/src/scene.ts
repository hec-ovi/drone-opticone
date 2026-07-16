import * as THREE from 'three/webgpu'
import {
  FOG_EXPLORED,
  FOG_GRID,
  FOG_VISIBLE,
  type DroneState,
  type IssuedCommand,
  type PlayerView,
  type SceneInteractionMode,
  type ScenePort,
} from '@opticone/shared'
import { classifyPick, ndcToGround } from './pick'
import { droneColor, droneMarkerSize } from './visuals'
import { CameraRig } from './camera'
import { makeTerrain, type Terrain } from './terrain'
import { makeNodeObject, makeStructureObject } from './props'

const PICK_TOLERANCE_M = 60

/**
 * C-04 mountScene. Renders a PlayerView and turns raw input into commands.
 * No game rules in here: every action is sent as a Command and the sim
 * decides if it is legal.
 */
export async function mountScene(canvas: HTMLCanvasElement): Promise<ScenePort> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
  await renderer.init() // WebGPU when available, otherwise automatic WebGL2 fallback

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b1016)
  scene.fog = new THREE.Fog(0x0b1016, 3500, 14000)
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 1, 40000)

  scene.add(new THREE.HemisphereLight(0xbdd2e8, 0x3a3226, 0.75))
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.4)
  sun.position.set(1500, 3000, 800)
  scene.add(sun)

  let mapSize = 4000
  let terrain: Terrain | null = null

  // Fog overlay: one canvas pixel per fog cell, floating above the relief.
  const fogCanvas = document.createElement('canvas')
  fogCanvas.width = FOG_GRID
  fogCanvas.height = FOG_GRID
  const fogCtx = fogCanvas.getContext('2d')
  const fogTexture = new THREE.CanvasTexture(fogCanvas)
  fogTexture.magFilter = THREE.LinearFilter
  const fogPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: fogTexture, transparent: true, depthWrite: false }),
  )
  fogPlane.rotation.x = -Math.PI / 2
  fogPlane.renderOrder = 10
  scene.add(fogPlane)

  const rig = new CameraRig(mapSize)
  let focused = false

  const droneMeshes = new Map<string, THREE.Object3D>()
  const structureMeshes = new Map<string, THREE.Object3D>()
  const nodeMeshes = new Map<string, THREE.Object3D>()
  const projectileMeshes = new Map<string, THREE.Object3D>()
  const selectionRings = new Map<string, THREE.Object3D>()
  const selected = new Set<string>()

  let lastView: PlayerView | null = null
  let mode: SceneInteractionMode = 'normal'
  let commandCb: (cmd: IssuedCommand) => void = () => {}
  let selectionCb: (drones: DroneState[]) => void = () => {}

  const groundY = (x: number, z: number) => terrain?.heightAt(x, z) ?? 0

  function emitSelection(): void {
    if (!lastView) return
    selectionCb(lastView.ownDrones.filter((d) => selected.has(d.id)))
  }

  function sync<T extends { id: string }>(
    map: Map<string, THREE.Object3D>,
    items: T[],
    create: (item: T) => THREE.Object3D,
    update: (item: T, obj: THREE.Object3D) => void,
  ): void {
    const seen = new Set<string>()
    for (const item of items) {
      seen.add(item.id)
      let obj = map.get(item.id)
      if (!obj) {
        obj = create(item)
        map.set(item.id, obj)
        scene.add(obj)
      }
      update(item, obj)
    }
    for (const [id, obj] of map) {
      if (!seen.has(id)) {
        scene.remove(obj)
        map.delete(id)
      }
    }
  }

  function drawFog(fog: number[]): void {
    if (!fogCtx) return
    const img = fogCtx.createImageData(FOG_GRID, FOG_GRID)
    for (let j = 0; j < FOG_GRID; j++) {
      for (let i = 0; i < FOG_GRID; i++) {
        const v = fog[j * FOG_GRID + i]
        const o = (j * FOG_GRID + i) * 4
        img.data[o + 3] = v === FOG_VISIBLE ? 0 : v === FOG_EXPLORED ? 110 : 217
      }
    }
    fogCtx.putImageData(img, 0, 0)
    fogTexture.needsUpdate = true
  }

  function applyView(view: PlayerView): void {
    lastView = view
    if (!terrain || view.mapSizeM !== mapSize) {
      mapSize = view.mapSizeM
      rig.setMapSize(mapSize)
      if (terrain) scene.remove(terrain.mesh)
      terrain = makeTerrain(mapSize, view.terrainSeed)
      scene.add(terrain.mesh)
      fogPlane.geometry.dispose()
      fogPlane.geometry = new THREE.PlaneGeometry(mapSize, mapSize)
      fogPlane.position.set(mapSize / 2, 56, mapSize / 2)
    }
    if (!focused) {
      const base = view.structures.find((s) => s.playerId === view.playerId && s.kind === 'centcomm')
      if (base) {
        rig.focus.x = base.pos.x
        rig.focus.z = base.pos.z
        focused = true
      }
    }

    const drones = [...view.ownDrones, ...view.enemyDrones]
    sync(
      droneMeshes,
      drones,
      (d) => {
        const spec = view.catalog[d.specId]!
        const size = droneMarkerSize(spec.class)
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(size / 2, size, 6),
          new THREE.MeshLambertMaterial({ color: droneColor(d.playerId === view.playerId, spec.class) }),
        )
        if (spec.class === 'fixed-wing' || spec.class === 'loitering-munition') {
          mesh.scale.set(1.6, 0.5, 1)
        }
        return mesh
      },
      (d, obj) => {
        obj.position.set(d.pos.x, Math.max(d.pos.y, groundY(d.pos.x, d.pos.z) + 16), d.pos.z)
        obj.rotation.y = -d.heading
        const mesh = obj as THREE.Mesh
        const mat = mesh.material as THREE.MeshLambertMaterial
        mat.opacity = d.uncontrolled ? 0.55 : 1
        mat.transparent = d.uncontrolled
      },
    )

    sync(
      structureMeshes,
      view.structures,
      (s) => makeStructureObject(s.kind, s.playerId === view.playerId),
      (s, obj) => obj.position.set(s.pos.x, groundY(s.pos.x, s.pos.z), s.pos.z),
    )

    sync(
      nodeMeshes,
      view.nodes,
      (n) => makeNodeObject(n.kind),
      (n, obj) => {
        obj.position.set(n.pos.x, groundY(n.pos.x, n.pos.z), n.pos.z)
        const f = Math.max(0.3, Math.min(1, n.remainingKg / 1500))
        obj.scale.set(f, Math.max(0.5, f), f)
      },
    )

    sync(
      projectileMeshes,
      view.projectiles,
      () => new THREE.Mesh(new THREE.SphereGeometry(4, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffe066 })),
      (p, obj) => obj.position.set(p.pos.x, p.pos.y, p.pos.z),
    )

    for (const id of [...selected]) {
      if (!view.ownDrones.some((d) => d.id === id)) selected.delete(id)
    }
    sync(
      selectionRings,
      view.ownDrones.filter((d) => selected.has(d.id)),
      () => {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(14, 18, 24),
          new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
        )
        ring.rotation.x = -Math.PI / 2
        return ring
      },
      (d, obj) => obj.position.set(d.pos.x, groundY(d.pos.x, d.pos.z) + 2.5, d.pos.z),
    )

    drawFog(view.fog)
  }

  // Input: keys, wheel zoom, edge pan, middle-mouse orbit, L+R grab pan.
  const keys = new Set<string>()
  const pointer = { x: -1, y: -1, inside: false }
  let rotating = false
  let dragPanning = false
  let suppressClick = false
  let downPos = { x: 0, y: 0 }
  let movedPx = 0
  const clock = new THREE.Clock()

  function updateCamera(): void {
    const dt = Math.min(clock.getDelta(), 0.1)
    rig.panFromKeys(keys, dt)
    if (pointer.inside && !rotating) {
      rig.panFromEdge(pointer.x, pointer.y, canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height, dt)
    }
    const pose = rig.pose()
    camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z)
  }

  function pickPoint(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect()
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1)
    camera.updateMatrixWorld()
    return ndcToGround(camera, ndcX, ndcY)
  }

  function onPointerDown(ev: PointerEvent): void {
    if (ev.button === 1) {
      ev.preventDefault()
      rotating = true
      canvas.setPointerCapture(ev.pointerId)
      return
    }
    if ((ev.buttons & 3) === 3) {
      // Both mouse buttons held: grab-pan. No selection or order fires.
      dragPanning = true
      suppressClick = true
      canvas.setPointerCapture(ev.pointerId)
      return
    }
    downPos = { x: ev.clientX, y: ev.clientY }
    movedPx = 0
  }

  function onPointerMove(ev: PointerEvent): void {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ev.clientX - rect.left
    pointer.y = ev.clientY - rect.top
    pointer.inside = true
    movedPx = Math.max(movedPx, Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y))
    if (dragPanning && (ev.buttons & 3) === 3) {
      rig.dragPan(ev.movementX, ev.movementY)
      return
    }
    if (rotating) rig.rotate(ev.movementX, ev.movementY)
  }

  function onPointerUp(ev: PointerEvent): void {
    if (ev.button === 1) {
      rotating = false
      canvas.releasePointerCapture(ev.pointerId)
      return
    }
    if ((ev.buttons & 3) !== 3) dragPanning = false
    if (ev.buttons === 0) {
      const wasSuppressed = suppressClick
      suppressClick = false
      if (wasSuppressed) return
    } else if (suppressClick) {
      return
    }
    if (movedPx > 6) return // drag, not a click
    if (!lastView) return
    const point = pickPoint(ev.clientX, ev.clientY)
    if (!point) return

    if (mode === 'sweep' && ev.button === 0) {
      commandCb({ type: 'satelliteSweep', playerId: lastView.playerId, center: { x: point.x, z: point.z } })
      return
    }

    const target = classifyPick(lastView, point, PICK_TOLERANCE_M)

    if (ev.button === 0) {
      if (!ev.shiftKey) selected.clear()
      if (target.kind === 'ownDrone' && target.id) selected.add(target.id)
      emitSelection()
      return
    }

    if (ev.button === 2 && selected.size > 0) {
      const droneIds = [...selected]
      if (target.kind === 'enemy' && target.id) {
        commandCb({ type: 'attack', playerId: lastView.playerId, droneIds, targetId: target.id })
      } else if (target.kind === 'node' && target.id) {
        commandCb({ type: 'mine', playerId: lastView.playerId, droneIds, nodeId: target.id })
      } else {
        commandCb({ type: 'move', playerId: lastView.playerId, droneIds, to: point })
      }
    }
  }

  function onPointerLeave(): void {
    pointer.inside = false
  }

  function onWheel(ev: WheelEvent): void {
    ev.preventDefault()
    rig.zoom(ev.deltaY)
  }

  const onKeyDown = (ev: KeyboardEvent) => keys.add(ev.code)
  const onKeyUp = (ev: KeyboardEvent) => keys.delete(ev.code)
  const onContext = (ev: Event) => ev.preventDefault()

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContext)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  function resize(): void {
    const w = canvas.clientWidth || canvas.width
    const h = canvas.clientHeight || canvas.height
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()

  renderer.setAnimationLoop(() => {
    updateCamera()
    renderer.render(scene, camera)
  })

  return {
    applyView,
    onCommand: (cb) => (commandCb = cb),
    onSelection: (cb) => (selectionCb = cb),
    setInteractionMode: (m) => (mode = m),
    dispose: () => {
      renderer.setAnimationLoop(null)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContext)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('resize', resize)
      renderer.dispose()
    },
  }
}
