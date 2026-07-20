import type { Bus, ClientTopics, DroneSpec, PlayerView, Selection, ThumbnailSet } from '@opticone/shared'
import { ICONS, droneClassIcon, iconEl } from '../icons'
import { button, el, img } from '../dom'
import { buildInfoCard, type CardData } from '../build-card'
import { displayBuildCost, displayBuildTimeS } from '../display'
import { droneRole } from '../roles'
import { attachTooltip } from '../tooltip'

/** The short reason a tile is locked: which resource is short. */
function shortfall(eco: { lithiumKg: number; plasticKg: number; credits: number }, cost: { lithiumKg: number; plasticKg: number; credits: number }): string | null {
  if (eco.lithiumKg < cost.lithiumKg) return 'NEED LITHIUM'
  if (eco.plasticKg < cost.plasticKg) return 'NEED PLASTIC'
  if (eco.credits < cost.credits) return 'NEED CREDITS'
  return null
}

/**
 * Factory panel: square build tiles showing the rendered model of each
 * airframe (class silhouette until thumbnails arrive), role-colored frames,
 * a hover info strip with full specs and costs. Queued builds show as a
 * count badge on their tile plus a progress fill for the job on the line.
 * A tile you cannot afford stays hoverable and says why on its bottom band.
 * Contextual like any RTS production building: it only appears while the
 * player's own factory is selected.
 */
export function buildMenu(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel build-menu', root)
  panel.style.display = 'none'
  const grid = el('div', 'build-grid', panel)
  const card = buildInfoCard(panel)
  const tiles = new Map<
    string,
    {
      btn: HTMLButtonElement
      image: HTMLImageElement
      count: HTMLElement
      progress: HTMLElement
      tag: HTMLElement
      roleTag: string
    }
  >()
  let thumbs: ThumbnailSet | null = null
  let lastView: PlayerView | null = null
  // Sticky card: it always shows the last hovered airframe (first tile as
  // the default) so the area under the tiles never blanks or jumps.
  let shownSpecId: string | null = null

  const cardFor = (spec: DroneSpec, view: PlayerView): CardData => {
    const cost = displayBuildCost(spec)
    return {
      name: spec.name,
      desc: droneRole(spec).text,
      costs: [
        {
          icon: ICONS.lithium,
          label: 'Lithium',
          need: cost.lithiumKg,
          have: view.economy.lithiumKg,
          hint: 'Miners harvest it from crystal nodes.',
        },
        {
          icon: ICONS.plastic,
          label: 'Plastic',
          need: cost.plasticKg,
          have: view.economy.plasticKg,
          hint: 'The refinery cracks it from stored oil.',
        },
        {
          icon: ICONS.credits,
          label: 'Credits',
          need: cost.credits,
          have: view.economy.credits,
          hint: 'Credits do not regenerate.',
        },
      ],
      timeS: displayBuildTimeS(spec),
      deps: [
        { icon: ICONS.factory, title: 'Built at the Factory.' },
        { icon: ICONS.power, title: 'The factory line needs grid power.' },
      ],
    }
  }

  const offThumbs = bus.on('thumbnails', (t: ThumbnailSet) => {
    thumbs = t
    for (const [specId, tile] of tiles) {
      const src = t.drones[specId]
      if (src) {
        tile.image.src = src
        tile.image.style.display = ''
        tile.btn.querySelector('.tile-fallback')?.remove()
      }
    }
  })

  const offView = bus.on('view', (view: PlayerView) => {
    lastView = view
    for (const spec of Object.values(view.catalog)) {
      let tile = tiles.get(spec.id)
      if (!tile) {
        const role = droneRole(spec)
        const btn = button(`build-tile role-border-${role.tag.toLowerCase()}`, grid)
        btn.setAttribute('aria-label', `Build ${spec.name}`)
        const image = img('tile-img', btn, thumbs?.drones[spec.id])
        if (!thumbs?.drones[spec.id]) {
          image.style.display = 'none'
          btn.appendChild(iconEl(droneClassIcon(spec.class), 'icon tile-fallback'))
        }
        const tag = el('span', `tile-tag role-${role.tag.toLowerCase()}`, btn)
        tag.textContent = role.tag
        const count = el('span', 'tile-count', btn)
        count.style.display = 'none'
        const progress = el('span', 'tile-progress', btn)
        progress.style.width = '0%'
        const show = () => {
          shownSpecId = spec.id
          if (lastView) card.show(cardFor(spec, lastView))
        }
        btn.addEventListener('mouseenter', show)
        btn.addEventListener('focus', show)
        attachTooltip(btn, () => {
          const missing = lastView ? shortfall(lastView.economy, displayBuildCost(spec)) : null
          return `${spec.name} · ${role.text}${missing ? ` · ${missing}` : ''}`
        })
        btn.addEventListener('click', () => {
          if (btn.classList.contains('locked')) return
          bus.emit('intent:build', { specId: spec.id })
        })
        tile = { btn, image, count, progress, tag, roleTag: role.tag }
        tiles.set(spec.id, tile)
      }
      // Locked tiles stay hoverable and say why on their bottom band.
      const missing = shortfall(view.economy, displayBuildCost(spec))
      tile.btn.classList.toggle('locked', missing !== null)
      tile.btn.setAttribute('aria-disabled', String(missing !== null))
      tile.tag.textContent = missing ?? tile.roleTag
      tile.tag.classList.toggle('warn', missing !== null)
    }

    // Queue on the tiles themselves: a count badge plus a progress fill for
    // the job currently on the line (queued jobs sit at 0 until they start).
    const queued = new Map<string, { count: number; nextReady: number }>()
    for (const job of view.builds) {
      const q = queued.get(job.specId) ?? { count: 0, nextReady: Infinity }
      q.count++
      q.nextReady = Math.min(q.nextReady, job.readyAtTick)
      queued.set(job.specId, q)
    }
    for (const [specId, tile] of tiles) {
      const q = queued.get(specId)
      tile.count.style.display = q ? '' : 'none'
      tile.count.textContent = q ? String(q.count) : ''
      tile.btn.classList.toggle('queued', Boolean(q))
      let pct = 0
      if (q) {
        const spec = view.catalog[specId]
        const total = spec ? displayBuildTimeS(spec) * 20 : 0
        if (total > 0) pct = Math.max(0, Math.min(1, 1 - (q.nextReady - view.tick) / total)) * 100
      }
      tile.progress.style.width = `${pct.toFixed(0)}%`
    }

    // Keep the card filled and its have/need numbers live: last hovered
    // airframe, or the first one before any hover.
    const spec = (shownSpecId ? view.catalog[shownSpecId] : undefined) ?? Object.values(view.catalog)[0]
    if (spec) {
      shownSpecId = spec.id
      card.show(cardFor(spec, view))
    }
  })

  let playerId = ''
  const offPid = bus.on('view', (view: PlayerView) => (playerId = view.playerId))
  const offSel = bus.on('selection', (sel: Selection) => {
    const factorySelected = sel.structures.some((s) => s.kind === 'factory' && s.playerId === playerId)
    panel.style.display = factorySelected ? '' : 'none'
  })

  return () => {
    offView()
    offThumbs()
    offPid()
    offSel()
  }
}
