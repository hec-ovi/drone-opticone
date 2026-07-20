import {
  FOG_EXPLORED,
  FOG_GRID,
  FOG_VISIBLE,
  terrainFbm,
  terrainNoiseScale,
  type Bus,
  type CameraPose,
  type ClientTopics,
  type PlayerView,
  type StructureKind,
} from '@opticone/shared'

export const MINIMAP_SIZE = 208

/** Pure pixel <-> world mapping, exported for tests. */
export function minimapToWorld(px: number, py: number, sizePx: number, mapSize: number): { x: number; z: number } {
  return { x: (px / sizePx) * mapSize, z: (py / sizePx) * mapSize }
}

export function worldToMinimap(x: number, z: number, sizePx: number, mapSize: number): { x: number; y: number } {
  return { x: (x / mapSize) * sizePx, y: (z / mapSize) * sizePx }
}

function renderTerrainBase(mapSize: number, seed: number): HTMLCanvasElement {
  const base = document.createElement('canvas')
  base.width = MINIMAP_SIZE
  base.height = MINIMAP_SIZE
  const ctx = base.getContext('2d')
  if (!ctx) return base
  const NOISE = terrainNoiseScale()
  const img = ctx.createImageData(MINIMAP_SIZE, MINIMAP_SIZE)
  for (let j = 0; j < MINIMAP_SIZE; j++) {
    for (let i = 0; i < MINIMAP_SIZE; i++) {
      const wx = (i / MINIMAP_SIZE) * mapSize
      const wz = (j / MINIMAP_SIZE) * mapSize
      const h = terrainFbm(wx * NOISE, wz * NOISE, seed)
      const o = (j * MINIMAP_SIZE + i) * 4
      const t = Math.max(0, Math.min(1, (h - 0.3) / 0.5))
      img.data[o] = 34 + t * 62
      img.data[o + 1] = 44 + t * 54
      img.data[o + 2] = 30 + t * 50
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return base
}

/**
 * C-05 minimap: terrain, fog, units, structures, nodes, sweeps and the
 * camera viewport. Click or drag to move the camera (intent:focus).
 */
export function minimapPanel(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = document.createElement('section')
  panel.className = 'panel minimap-panel'
  root.appendChild(panel)

  const head = document.createElement('div')
  head.className = 'minimap-head'
  const title = document.createElement('h2')
  title.textContent = 'Tactical map'
  head.appendChild(title)
  // Sweep status only; arming it is an order on the satellite uplink.
  const sweepState = document.createElement('span')
  sweepState.className = 'sweep-state'
  sweepState.textContent = ''
  head.appendChild(sweepState)
  panel.appendChild(head)

  const canvas = document.createElement('canvas')
  canvas.width = MINIMAP_SIZE
  canvas.height = MINIMAP_SIZE
  canvas.className = 'minimap-canvas'
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', 'minimap')
  panel.appendChild(canvas)

  let base: HTMLCanvasElement | null = null
  let baseSeed = -1
  let lastView: PlayerView | null = null
  let pose: CameraPose | null = null
  let lastDraw = 0

  function draw(): void {
    const view = lastView
    const ctx = canvas.getContext('2d')
    if (!view || !ctx) return
    const S = MINIMAP_SIZE
    if (!base || baseSeed !== view.terrainSeed) {
      base = renderTerrainBase(view.mapSizeM, view.terrainSeed)
      baseSeed = view.terrainSeed
    }
    ctx.drawImage(base, 0, 0)

    // Fog: unseen almost black, explored dimmed.
    const cell = S / FOG_GRID
    for (let j = 0; j < FOG_GRID; j++) {
      for (let i = 0; i < FOG_GRID; i++) {
        const v = view.fog[j * FOG_GRID + i]
        if (v === FOG_VISIBLE) continue
        ctx.fillStyle = v === FOG_EXPLORED ? 'rgba(5,8,12,0.45)' : 'rgba(4,6,10,0.88)'
        ctx.fillRect(i * cell, j * cell, cell + 0.5, cell + 0.5)
      }
    }

    const dot = (x: number, z: number, color: string, r: number) => {
      const p = worldToMinimap(x, z, S, view.mapSizeM)
      ctx.fillStyle = color
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2)
    }
    for (const n of view.nodes) dot(n.pos.x, n.pos.z, n.kind === 'lithium' ? '#63e6c4' : '#c9a34a', 2)
    for (const st of view.structures) {
      dot(st.pos.x, st.pos.z, st.playerId === view.playerId ? '#3ec6ff' : '#ff4a4a', 3)
    }
    for (const d of view.ownDrones) dot(d.pos.x, d.pos.z, '#8fe3ff', 1.6)
    for (const d of view.enemyDrones) dot(d.pos.x, d.pos.z, '#ff8a7a', 1.6)

    // Active sweeps.
    ctx.strokeStyle = 'rgba(154,123,255,0.9)'
    for (const sweep of view.satellite.sweeps) {
      const p = worldToMinimap(sweep.center.x, sweep.center.z, S, view.mapSizeM)
      ctx.beginPath()
      ctx.arc(p.x, p.y, (sweep.radius / view.mapSizeM) * S, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Camera viewport: a yaw-aligned box scaled with zoom.
    if (pose) {
      const p = worldToMinimap(pose.x, pose.z, S, view.mapSizeM)
      const w = Math.max(14, (pose.dist / view.mapSizeM) * S * 1.15)
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(-pose.yaw)
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1.2
      ctx.strokeRect(-w / 2, -w / 2.6, w, w / 1.3)
      ctx.restore()
    }
  }

  function requestDraw(): void {
    const now = Date.now()
    if (now - lastDraw < 40) return
    lastDraw = now
    draw()
  }

  function emitFocus(ev: MouseEvent): void {
    if (!lastView) return
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width > 0 ? MINIMAP_SIZE / rect.width : 1
    const px = (ev.clientX - rect.left) * scale
    const py = (ev.clientY - rect.top) * scale
    bus.emit('intent:focus', minimapToWorld(px, py, MINIMAP_SIZE, lastView.mapSizeM))
  }

  let dragging = false
  canvas.addEventListener('pointerdown', (ev) => {
    dragging = true
    emitFocus(ev)
  })
  canvas.addEventListener('pointermove', (ev) => {
    if (dragging && ev.buttons > 0) emitFocus(ev)
  })
  window.addEventListener('pointerup', () => (dragging = false))

  const offView = bus.on('view', (view: PlayerView) => {
    lastView = view
    requestDraw()
  })
  const offPose = bus.on('cameraPose', (p: CameraPose) => {
    pose = p
    requestDraw()
  })
  const offSweep = bus.on('sweepModeChanged', (on: boolean) => {
    sweepState.textContent = on ? 'SWEEP ARMED - CLICK THE FIELD' : ''
  })
  const offPlace = bus.on('placeModeChanged', (kind: StructureKind | null) => {
    sweepState.textContent = kind ? 'PLACING - CLICK THE FIELD' : ''
  })
  return () => {
    offView()
    offPose()
    offSweep()
    offPlace()
  }
}
