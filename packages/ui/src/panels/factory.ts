import type { Bus, ClientTopics, DroneSpec, PlayerView, ThumbnailSet } from '@opticone/shared'
import { droneClassIcon, iconEl } from '../icons'
import { button, el, fmt, img } from '../dom'
import { displayBuildCost, displayBuildTimeS } from '../display'
import { droneRole } from '../roles'

/**
 * Factory panel: square build tiles showing the rendered model of each
 * airframe (class silhouette until thumbnails arrive), role-colored frames,
 * a hover info strip with full specs and costs, and the build queue.
 */
export function buildMenu(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel build-menu', root)
  const heading = el('h2', '', panel)
  heading.textContent = 'Factory'
  const grid = el('div', 'build-grid', panel)
  const info = el('p', 'build-info-strip', panel)
  info.textContent = 'Hover an airframe for specs. Click to build.'
  const queueWrap = el('div', 'build-queue', panel)
  const tiles = new Map<string, { btn: HTMLButtonElement; image: HTMLImageElement }>()
  let thumbs: ThumbnailSet | null = null
  let lastView: PlayerView | null = null

  const describe = (spec: DroneSpec, view: PlayerView): string => {
    const cost = displayBuildCost(spec)
    const role = droneRole(spec)
    const missing =
      view.economy.lithiumKg < cost.lithiumKg
        ? ' | NEED LITHIUM'
        : view.economy.plasticKg < cost.plasticKg
          ? ' | NEED PLASTIC'
          : view.economy.credits < cost.credits
            ? ' | NEED CREDITS'
            : ''
    return `${spec.name} | ${role.text} | ${fmt(cost.lithiumKg)} li + ${fmt(cost.plasticKg)} pl + ${fmt(cost.credits)} cr | ${displayBuildTimeS(spec)}s${missing}`
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
        btn.title = `${spec.name} - ${role.text}`
        const show = () => {
          if (lastView) info.textContent = describe(spec, lastView)
        }
        btn.addEventListener('mouseenter', show)
        btn.addEventListener('focus', show)
        btn.addEventListener('click', () => bus.emit('intent:build', { specId: spec.id }))
        tile = { btn, image }
        tiles.set(spec.id, tile)
      }
      const cost = displayBuildCost(spec)
      tile.btn.disabled =
        view.economy.lithiumKg < cost.lithiumKg ||
        view.economy.plasticKg < cost.plasticKg ||
        view.economy.credits < cost.credits
    }

    // Queue with live progress bars.
    queueWrap.textContent = ''
    for (const job of view.builds) {
      const spec = view.catalog[job.specId]
      if (!spec) continue
      const total = displayBuildTimeS(spec) * 20
      const progress = Math.max(0, Math.min(1, 1 - (job.readyAtTick - view.tick) / total))
      const row = el('div', 'queue-row', queueWrap)
      const mini = el('span', 'queue-mini', row)
      const src = thumbs?.drones[spec.id]
      if (src) img('', mini, src)
      else mini.appendChild(iconEl(droneClassIcon(spec.class), 'icon icon-s'))
      const label = el('span', 'queue-name', row)
      label.textContent = spec.name
      const barBg = el('span', 'queue-bar', row)
      const fill = el('span', 'queue-fill', barBg)
      fill.style.width = `${(progress * 100).toFixed(0)}%`
    }
  })

  return () => {
    offView()
    offThumbs()
  }
}
