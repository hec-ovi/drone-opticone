import * as THREE from 'three/webgpu'
import {
  FOG_EXPLORED,
  FOG_GRID,
  FOG_VISIBLE,
  type CameraPose,
  type DroneState,
  type IssuedCommand,
  type PlayerView,
  type SceneInteractionMode,
  type ScenePort,
} from '@opticone/shared'
import { classifyPick, ndcToGround } from './pick'
import { CameraRig } from './camera'
import { makeTerrain, type Terrain } from './terrain'
import { makeNodeObject, makeStructureObject } from './props'
import { makeDroneModel, type DroneModel } from './models'
import { makeScatter, makeSky } from './environment'
import { makeEffects } from './effects'
import { glowSpriteMaterial } from './glowtex'

const PICK_TOLERANCE_M = 60

/**
 * C-04 mountScene. Renders a PlayerView and turns raw input into commands.
 * No game rules in here: every action is sent as a Command and the sim
 * decides if it is legal.
 */
export async function mountScene(canvas: HTMLCanvasElement): Promise<ScenePort> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
  await renderer.init() // WebGPU when available, otherwise automatic WebGL2 fallback
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b1016)
  scene.fog = new THREE.Fog(0x131a24, 3500, 16000)
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 1, 40000)

  scene.add(new THREE.HemisphereLight(0xbdd2e8, 0x3a3226, 0.9))
  const sun = new THREE.DirectionalLight(0xffe3b8, 1.6)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.bias = -0.0004
  sun.shadow.intensity = 0.65
  scene.add(sun)
  scene.add(sun.target)
  const sky = makeSky(18000)
  scene.add(sky)

  let mapSize = 4000
  let terrain: Terrain | null = null
  let scatter: THREE.Group | null = null

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
  let cameraPoseCb: (pose: CameraPose) => void = () => {}

  // Control groups: Shift+1..9 assigns the current selection, 1..9 recalls,
  // a quick double tap also centers the camera on the group.
  const controlGroups = new Map<number, string[]>()
  let lastRecall = { n: -1, at: 0 }

  // Marquee (drag box) selection.
  const marqueeEl = document.createElement('div')
  marqueeEl.style.cssText =
    'position:fixed;border:1px solid #5ee7c8;background:rgba(94,231,200,0.12);pointer-events:none;display:none;z-index:30'
  ;(canvas.parentElement ?? document.body).appendChild(marqueeEl)
  let marqueeActive = false
  let marqueeFrom = { x: 0, y: 0 }

  const groundY = (x: number, z: number) => terrain?.heightAt(x, z) ?? 0

  const fx = makeEffects(groundY)
  scene.add(fx.group)

  /** Is a world point inside the currently visible fog area of the view? */
  function visibleAt(view: PlayerView, x: number, z: number): boolean {
    const cell = view.mapSizeM / FOG_GRID
    const i = Math.min(FOG_GRID - 1, Math.max(0, Math.floor(x / cell)))
    const j = Math.min(FOG_GRID - 1, Math.max(0, Math.floor(z / cell)))
    return view.fog[j * FOG_GRID + i] === FOG_VISIBLE
  }

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
    // Capture positions before sync so anything that disappears can explode
    // where it was last seen.
    const prevDrones = new Map(
      [...droneMeshes].map(([id, o]) => [id, { x: o.position.x, y: o.position.y, z: o.position.z, r: o.scale.x }]),
    )
    const prevStructures = new Map(
      [...structureMeshes].map(([id, o]) => [id, { x: o.position.x, y: o.position.y, z: o.position.z }]),
    )
    const prevProjectiles = new Map(
      [...projectileMeshes].map(([id, o]) => [id, { x: o.position.x, y: o.position.y, z: o.position.z }]),
    )
    if (!terrain || view.mapSizeM !== mapSize) {
      mapSize = view.mapSizeM
      rig.setMapSize(mapSize)
      if (terrain) scene.remove(terrain.mesh)
      terrain = makeTerrain(mapSize, view.terrainSeed)
      scene.add(terrain.mesh)
      if (scatter) scene.remove(scatter)
      scatter = makeScatter({
        mapSize,
        seed: view.terrainSeed,
        heightAt: terrain.heightAt,
        avoid: [
          { x: 500, z: 500, r: 320 },
          { x: mapSize - 500, z: mapSize - 500, r: 320 },
          ...view.nodes.map((n) => ({ x: n.pos.x, z: n.pos.z, r: 70 })),
        ],
      })
      scene.add(scatter)
      sky.position.set(mapSize / 2, 0, mapSize / 2)
      sun.position.set(mapSize / 2 + mapSize, mapSize * 0.7, mapSize / 2 + mapSize * 0.5)
      sun.target.position.set(mapSize / 2, 0, mapSize / 2)
      const cam = sun.shadow.camera
      cam.left = -mapSize * 0.75
      cam.right = mapSize * 0.75
      cam.top = mapSize * 0.75
      cam.bottom = -mapSize * 0.75
      cam.near = 100
      cam.far = mapSize * 4
      cam.updateProjectionMatrix()
      fogPlane.geometry.dispose()
      fogPlane.geometry = new THREE.PlaneGeometry(mapSize, mapSize)
      fogPlane.position.set(mapSize / 2, 95, mapSize / 2)
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
    const makeDroneObj = (d: DroneState): THREE.Object3D => {
      const spec = view.catalog[d.specId]!
      const model = makeDroneModel(spec, d.playerId === view.playerId)
      const obj = model.root
      obj.userData.model = model
      obj.userData.specKey = `${d.specId}/${d.playerId === view.playerId}`
      obj.userData.heading = d.heading
      // Soft blob shadow projected on the terrain; repositioned every frame.
      const blob = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 16),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
      )
      blob.rotation.x = -Math.PI / 2
      obj.add(blob)
      obj.userData.blob = blob
      obj.position.set(d.pos.x, Math.max(d.pos.y, groundY(d.pos.x, d.pos.z) + 12), d.pos.z)
      return obj
    }
    sync(
      droneMeshes,
      drones,
      makeDroneObj,
      (d, obj) => {
        // Restart or respawned id with a different airframe: rebuild the model.
        if (obj.userData.specKey !== `${d.specId}/${d.playerId === view.playerId}`) {
          scene.remove(obj)
          const fresh = makeDroneObj(d)
          droneMeshes.set(d.id, fresh)
          scene.add(fresh)
          obj = fresh
        }
        obj.userData.target = {
          x: d.pos.x,
          y: Math.max(d.pos.y, groundY(d.pos.x, d.pos.z) + 12),
          z: d.pos.z,
          heading: d.heading,
        }
        obj.userData.moving = d.mode !== 'idle'
        obj.userData.uncontrolled = d.uncontrolled
      },
    )

    sync(
      structureMeshes,
      view.structures,
      (s) => {
        const obj = makeStructureObject(s.kind, s.playerId === view.playerId)
        // Commander-view scale: structures are map markers like drones.
        obj.scale.setScalar(1.5)
        return obj
      },
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
      () => {
        const g = new THREE.Group()
        const core = new THREE.Mesh(
          new THREE.CapsuleGeometry(1.6, 7, 3, 8),
          new THREE.MeshBasicMaterial({ color: 0xffd27a }),
        )
        g.add(core)
        const glow = new THREE.Sprite(glowSpriteMaterial(0xffb84d, 0.55))
        glow.scale.setScalar(12)
        g.add(glow)
        return g
      },
      (p, obj) => {
        obj.position.set(p.pos.x, p.pos.y, p.pos.z)
        const len = Math.hypot(p.vel.x, p.vel.y, p.vel.z)
        if (len > 0.01) {
          obj.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(p.vel.x / len, p.vel.y / len, p.vel.z / len),
          )
        }
      },
    )

    for (const id of [...selected]) {
      if (!view.ownDrones.some((d) => d.id === id)) selected.delete(id)
    }
    sync(
      selectionRings,
      view.ownDrones.filter((d) => selected.has(d.id)),
      (d) => {
        const size = (droneMeshes.get(d.id)?.scale.x ?? 12) * 1.1
        const g = new THREE.Group()
        const inner = new THREE.Mesh(
          new THREE.RingGeometry(size * 0.95, size * 1.02, 32),
          new THREE.MeshBasicMaterial({
            color: 0x5ee7c8,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          }),
        )
        inner.rotation.x = -Math.PI / 2
        g.add(inner)
        const outer = new THREE.Mesh(
          new THREE.RingGeometry(size * 1.18, size * 1.3, 6),
          new THREE.MeshBasicMaterial({
            color: 0x5ee7c8,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
          }),
        )
        outer.rotation.x = -Math.PI / 2
        g.userData.spinner = outer
        g.add(outer)
        return g
      },
      (d, obj) => obj.position.set(d.pos.x, groundY(d.pos.x, d.pos.z) + 2.5, d.pos.z),
    )

    // Anything gone from the view that was last seen in a lit cell blows up.
    for (const [id, p] of prevDrones) {
      if (!droneMeshes.has(id) && visibleAt(view, p.x, p.z)) {
        fx.explosion(p, Math.max(8, p.r))
        if (p.y - groundY(p.x, p.z) < 45) fx.scorch({ x: p.x, y: 0, z: p.z }, p.r * 1.4)
      }
    }
    for (const [id, p] of prevStructures) {
      if (!structureMeshes.has(id) && visibleAt(view, p.x, p.z)) {
        fx.explosion({ x: p.x, y: p.y + 10, z: p.z }, 40)
        fx.scorch({ x: p.x, y: 0, z: p.z }, 46)
      }
    }
    for (const [id, p] of prevProjectiles) {
      if (!projectileMeshes.has(id) && visibleAt(view, p.x, p.z)) {
        fx.explosion(p, 14)
        fx.scorch({ x: p.x, y: 0, z: p.z }, 17)
      }
    }
    fx.syncView(view)

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

  function updateCamera(dt: number): void {
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

  function updateMarqueeBox(ev: PointerEvent): void {
    const left = Math.min(marqueeFrom.x, ev.clientX)
    const top = Math.min(marqueeFrom.y, ev.clientY)
    marqueeEl.style.left = `${left}px`
    marqueeEl.style.top = `${top}px`
    marqueeEl.style.width = `${Math.abs(ev.clientX - marqueeFrom.x)}px`
    marqueeEl.style.height = `${Math.abs(ev.clientY - marqueeFrom.y)}px`
    marqueeEl.style.display = 'block'
  }

  function cancelMarquee(): void {
    marqueeActive = false
    marqueeEl.style.display = 'none'
  }

  function onPointerMove(ev: PointerEvent): void {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ev.clientX - rect.left
    pointer.y = ev.clientY - rect.top
    pointer.inside = true
    movedPx = Math.max(movedPx, Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y))
    if (dragPanning && (ev.buttons & 3) === 3) {
      cancelMarquee()
      rig.dragPan(ev.movementX, ev.movementY)
      return
    }
    if (rotating) {
      rig.rotate(ev.movementX, ev.movementY)
      return
    }
    // Left button alone dragging in normal mode: marquee selection box.
    if (ev.buttons === 1 && mode === 'normal' && movedPx > 8) {
      if (!marqueeActive) {
        marqueeActive = true
        marqueeFrom = { x: downPos.x, y: downPos.y }
      }
      updateMarqueeBox(ev)
    }
  }

  function selectInMarquee(toX: number, toY: number, additive: boolean): void {
    if (!lastView) return
    const rect = canvas.getBoundingClientRect()
    const minX = Math.min(marqueeFrom.x, toX)
    const maxX = Math.max(marqueeFrom.x, toX)
    const minY = Math.min(marqueeFrom.y, toY)
    const maxY = Math.max(marqueeFrom.y, toY)
    if (!additive) selected.clear()
    camera.updateMatrixWorld()
    const v = new THREE.Vector3()
    for (const d of lastView.ownDrones) {
      v.set(d.pos.x, d.pos.y, d.pos.z).project(camera)
      if (v.z >= 1) continue
      const sx = rect.left + ((v.x + 1) / 2) * rect.width
      const sy = rect.top + ((1 - v.y) / 2) * rect.height
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) selected.add(d.id)
    }
    emitSelection()
  }

  function onPointerUp(ev: PointerEvent): void {
    if (ev.button === 1) {
      rotating = false
      canvas.releasePointerCapture(ev.pointerId)
      return
    }
    if ((ev.buttons & 3) !== 3) dragPanning = false
    if (marqueeActive && ev.button === 0) {
      cancelMarquee()
      selectInMarquee(ev.clientX, ev.clientY, ev.shiftKey)
      return
    }
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
      fx.orderMarker(point, 'sweep')
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
        fx.orderMarker(point, 'attack')
        commandCb({ type: 'attack', playerId: lastView.playerId, droneIds, targetId: target.id })
      } else if (target.kind === 'node' && target.id) {
        fx.orderMarker(point, 'mine')
        commandCb({ type: 'mine', playerId: lastView.playerId, droneIds, nodeId: target.id })
      } else {
        fx.orderMarker(point, 'move')
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

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return
    const digit = /^Digit([1-9])$/.exec(ev.code)
    if (digit) {
      const n = Number(digit[1])
      if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
        // Assign the current selection to the group.
        controlGroups.set(n, [...selected])
        ev.preventDefault()
      } else if (lastView) {
        // Recall; a quick second tap centers the camera on the group.
        const members = (controlGroups.get(n) ?? []).filter((id) =>
          lastView!.ownDrones.some((d) => d.id === id),
        )
        selected.clear()
        for (const id of members) selected.add(id)
        emitSelection()
        const now = performance.now()
        if (lastRecall.n === n && now - lastRecall.at < 450 && members.length > 0) {
          let cx = 0
          let cz = 0
          for (const id of members) {
            const d = lastView.ownDrones.find((dd) => dd.id === id)!
            cx += d.pos.x
            cz += d.pos.z
          }
          rig.focus.x = cx / members.length
          rig.focus.z = cz / members.length
        }
        lastRecall = { n, at: now }
      }
      return
    }
    keys.add(ev.code)
  }
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

  /** Wrap an angle delta into [-PI, PI] for shortest-arc turns. */
  const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

  function animateDrones(dt: number, elapsed: number): void {
    const k = Math.min(1, dt * 10)
    for (const obj of droneMeshes.values()) {
      const model = obj.userData.model as DroneModel | undefined
      if (!model) continue
      const target = obj.userData.target as { x: number; y: number; z: number; heading: number } | undefined
      let turning = 0
      if (target) {
        obj.position.x += (target.x - obj.position.x) * k
        obj.position.y += (target.y - obj.position.y) * k
        obj.position.z += (target.z - obj.position.z) * k
        const delta = wrapAngle(target.heading - (obj.userData.heading as number))
        obj.userData.heading = (obj.userData.heading as number) + delta * Math.min(1, dt * 8)
        obj.rotation.y = -(obj.userData.heading as number)
        turning = delta
      }
      const uncontrolled = Boolean(obj.userData.uncontrolled)
      // Winged airframes bank into the turn.
      if (!model.hovers && !uncontrolled) {
        const bank = Math.max(-0.55, Math.min(0.55, turning * 4))
        model.airframe.rotation.x += (bank - model.airframe.rotation.x) * Math.min(1, dt * 6)
      }
      model.animate(dt, elapsed, {
        moving: Boolean(obj.userData.moving),
        uncontrolled,
      })
      // Keep the blob shadow pinned to the ground below the drone.
      const blob = obj.userData.blob as THREE.Mesh | undefined
      if (blob) {
        const scale = obj.scale.x || 1
        const ground = groundY(obj.position.x, obj.position.z)
        const agl = Math.max(0, obj.position.y - ground)
        blob.position.y = (ground + 0.8 - obj.position.y) / scale
        ;(blob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.06, 0.32 - (agl / 700) * 0.26)
      }
    }
  }

  function animateProps(dt: number, elapsed: number): void {
    for (const obj of structureMeshes.values()) obj.userData.animate?.(dt, elapsed)
    for (const obj of nodeMeshes.values()) obj.userData.animate?.(dt, elapsed)
    for (const obj of selectionRings.values()) {
      const spinner = obj.userData.spinner as THREE.Object3D | undefined
      if (spinner) spinner.rotation.z = elapsed * 1.4
    }
  }

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1)
    const elapsed = clock.elapsedTime
    updateCamera(dt)
    animateDrones(dt, elapsed)
    animateProps(dt, elapsed)
    fx.update(dt, elapsed, camera)
    cameraPoseCb({ x: rig.focus.x, z: rig.focus.z, yaw: rig.yaw, dist: rig.dist })
    renderer.render(scene, camera)
  })

  return {
    applyView,
    onCommand: (cb) => (commandCb = cb),
    onSelection: (cb) => (selectionCb = cb),
    onCameraPose: (cb) => (cameraPoseCb = cb),
    focusAt: (x, z) => {
      rig.focus.x = Math.max(0, Math.min(mapSize, x))
      rig.focus.z = Math.max(0, Math.min(mapSize, z))
    },
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
      marqueeEl.remove()
      renderer.dispose()
    },
  }
}
