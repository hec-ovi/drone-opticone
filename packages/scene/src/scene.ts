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
import { droneColor, droneMarkerSize, nodeColor, structureColor } from './visuals'

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
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 1, 40000)

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const sun = new THREE.DirectionalLight(0xffffff, 1.2)
  sun.position.set(1500, 3000, 800)
  scene.add(sun)

  let mapSize = 4000
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: 0x18222b }),
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)
  const grid = new THREE.GridHelper(1, 32, 0x2c3b4a, 0x22303c)
  scene.add(grid)

  // Fog overlay: one canvas pixel per fog cell.
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
  fogPlane.position.y = 12
  fogPlane.renderOrder = 10
  scene.add(fogPlane)

  const focus = { x: 500, z: 500 }
  let camDist = 1400
  let focused = false

  const droneMeshes = new Map<string, THREE.Mesh>()
  const structureMeshes = new Map<string, THREE.Mesh>()
  const nodeMeshes = new Map<string, THREE.Mesh>()
  const projectileMeshes = new Map<string, THREE.Mesh>()
  const selectionRings = new Map<string, THREE.Mesh>()
  const selected = new Set<string>()

  let lastView: PlayerView | null = null
  let mode: SceneInteractionMode = 'normal'
  let commandCb: (cmd: IssuedCommand) => void = () => {}
  let selectionCb: (drones: DroneState[]) => void = () => {}

  function emitSelection(): void {
    if (!lastView) return
    selectionCb(lastView.ownDrones.filter((d) => selected.has(d.id)))
  }

  function sync<T extends { id: string }>(
    map: Map<string, THREE.Mesh>,
    items: T[],
    create: (item: T) => THREE.Mesh,
    update: (item: T, mesh: THREE.Mesh) => void,
  ): void {
    const seen = new Set<string>()
    for (const item of items) {
      seen.add(item.id)
      let mesh = map.get(item.id)
      if (!mesh) {
        mesh = create(item)
        map.set(item.id, mesh)
        scene.add(mesh)
      }
      update(item, mesh)
    }
    for (const [id, mesh] of map) {
      if (!seen.has(id)) {
        scene.remove(mesh)
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
        // Canvas rows run down the screen, world z runs the same way here.
        const o = (j * FOG_GRID + i) * 4
        img.data[o + 3] = v === FOG_VISIBLE ? 0 : v === FOG_EXPLORED ? 110 : 217
      }
    }
    fogCtx.putImageData(img, 0, 0)
    fogTexture.needsUpdate = true
  }

  function applyView(view: PlayerView): void {
    lastView = view
    if (view.mapSizeM !== mapSize || ground.scale.x === 1) {
      mapSize = view.mapSizeM
      ground.geometry.dispose()
      ground.geometry = new THREE.PlaneGeometry(mapSize, mapSize)
      ground.position.set(mapSize / 2, 0, mapSize / 2)
      grid.scale.set(mapSize, 1, mapSize)
      grid.position.set(mapSize / 2, 1, mapSize / 2)
      fogPlane.geometry.dispose()
      fogPlane.geometry = new THREE.PlaneGeometry(mapSize, mapSize)
      fogPlane.position.set(mapSize / 2, 12, mapSize / 2)
    }
    if (!focused) {
      const base = view.structures.find((s) => s.playerId === view.playerId && s.kind === 'centcomm')
      if (base) {
        focus.x = base.pos.x
        focus.z = base.pos.z
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
        return mesh
      },
      (d, mesh) => {
        mesh.position.set(d.pos.x, Math.max(d.pos.y, 18), d.pos.z)
        mesh.rotation.z = d.mode === 'terminal' ? Math.PI : 0
        const mat = mesh.material as THREE.MeshLambertMaterial
        mat.opacity = d.uncontrolled ? 0.55 : 1
        mat.transparent = d.uncontrolled
      },
    )

    sync(
      structureMeshes,
      view.structures,
      (s) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(40, 24, 40),
          new THREE.MeshLambertMaterial({ color: structureColor(s.kind, s.playerId === view.playerId) }),
        )
        return mesh
      },
      (s, mesh) => mesh.position.set(s.pos.x, 12, s.pos.z),
    )

    sync(
      nodeMeshes,
      view.nodes,
      (n) =>
        new THREE.Mesh(
          new THREE.CylinderGeometry(22, 26, 10, 8),
          new THREE.MeshLambertMaterial({ color: nodeColor(n.kind) }),
        ),
      (n, mesh) => {
        mesh.position.set(n.pos.x, 5, n.pos.z)
        const f = Math.max(0.25, Math.min(1, n.remainingKg / 1500))
        mesh.scale.set(f, 1, f)
      },
    )

    sync(
      projectileMeshes,
      view.projectiles,
      () => new THREE.Mesh(new THREE.SphereGeometry(4, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffe066 })),
      (p, mesh) => mesh.position.set(p.pos.x, p.pos.y, p.pos.z),
    )

    // Selection rings track their drones; drop rings for dead drones.
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
      (d, mesh) => mesh.position.set(d.pos.x, 3, d.pos.z),
    )

    drawFog(view.fog)
  }

  // Camera rig and input.
  const keys = new Set<string>()
  function updateCamera(): void {
    const panSpeed = camDist * 0.02
    if (keys.has('KeyW') || keys.has('ArrowUp')) focus.z -= panSpeed
    if (keys.has('KeyS') || keys.has('ArrowDown')) focus.z += panSpeed
    if (keys.has('KeyA') || keys.has('ArrowLeft')) focus.x -= panSpeed
    if (keys.has('KeyD') || keys.has('ArrowRight')) focus.x += panSpeed
    focus.x = Math.max(0, Math.min(mapSize, focus.x))
    focus.z = Math.max(0, Math.min(mapSize, focus.z))
    camera.position.set(focus.x, camDist * 0.85, focus.z + camDist * 0.6)
    camera.lookAt(focus.x, 0, focus.z)
  }

  function pickPoint(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect()
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1)
    camera.updateMatrixWorld()
    return ndcToGround(camera, ndcX, ndcY)
  }

  function onPointerDown(ev: PointerEvent): void {
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

  function onWheel(ev: WheelEvent): void {
    ev.preventDefault()
    camDist = Math.max(400, Math.min(6000, camDist * (ev.deltaY > 0 ? 1.1 : 0.9)))
  }

  const onKeyDown = (ev: KeyboardEvent) => keys.add(ev.code)
  const onKeyUp = (ev: KeyboardEvent) => keys.delete(ev.code)
  const onContext = (ev: Event) => ev.preventDefault()

  canvas.addEventListener('pointerdown', onPointerDown)
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
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContext)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('resize', resize)
      renderer.dispose()
    },
  }
}
