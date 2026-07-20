import type { Bus, ClientTopics, PlayerView, Selection, ThumbnailSet } from '@opticone/shared'
import { ICONS, droneClassIcon, iconEl } from '../icons'
import { el, fmt, img } from '../dom'
import { STRUCTURE_NAME } from '../display'
import { droneRole } from '../roles'
import { nodePortraitEl, portraitEl, structurePortraitEl } from '../portraits'

/**
 * Unit plate: the selected unit, building or node as a rendered portrait
 * with centered name, numeric hull, battery and cargo. Enemy selections show
 * the same plate in hostile red, intel only.
 */
export function selectionPanel(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel selection-panel', root)
  const heading = el('h2', '', panel)
  heading.textContent = 'Selection'
  const plate = el('div', 'plate', panel)
  const portraitSlot = el('div', 'plate-portrait', plate)
  const infoCol = el('div', 'plate-info', plate)
  const empty = el('p', 'selection-empty', plate)
  empty.textContent = 'Nothing selected. Factory builds drones; CENTCOM constructs buildings.'

  let catalog: PlayerView['catalog'] = {}
  let playerId = ''
  let thumbs: ThumbnailSet | null = null
  let lastSel: Selection = { drones: [], structures: [], nodes: [] }

  const offView = bus.on('view', (view: PlayerView) => {
    catalog = view.catalog
    playerId = view.playerId
  })
  const offThumbs = bus.on('thumbnails', (t: ThumbnailSet) => {
    thumbs = t
    render(lastSel)
  })

  const setPortrait = (src: string | undefined, fallback: () => HTMLElement, hostile: boolean) => {
    portraitSlot.textContent = ''
    if (src) {
      const holder = el('div', `portrait${hostile ? ' hostile' : ''}`, portraitSlot)
      img('portrait-img', holder, src)
      el('div', 'p-scan', holder)
      el('div', 'p-frame', holder)
    } else {
      const fb = fallback()
      if (hostile) fb.classList.add('hostile')
      portraitSlot.appendChild(fb)
    }
  }

  const numbers = (parent: HTMLElement, icon: string, text: string, pct: number) => {
    const row = el('div', 'plate-stat', parent)
    row.appendChild(iconEl(icon, 'icon icon-s'))
    const track = el('span', 'stat-track', row)
    const fill = el('span', `stat-fill${pct <= 30 ? ' low' : ''}`, track)
    fill.style.width = `${Math.max(2, Math.min(100, pct))}%`
    const value = el('span', 'stat-value', row)
    value.textContent = text
  }

  function render(sel: Selection): void {
    lastSel = sel
    const primary = sel.drones[0]
    const structure = sel.structures[0]
    const node = sel.nodes[0]
    infoCol.textContent = ''

    if (!primary && !structure && !node) {
      portraitSlot.textContent = ''
      empty.style.display = ''
      plate.classList.remove('active')
      return
    }
    empty.style.display = 'none'
    plate.classList.add('active')

    if (primary) {
      const spec = catalog[primary.specId]
      const hostile = primary.playerId !== playerId
      plate.classList.toggle('hostile', hostile)
      setPortrait(
        thumbs?.drones[primary.specId],
        () => (spec ? portraitEl(spec) : document.createElement('div')),
        hostile,
      )
      const name = el('p', 'plate-name', infoCol)
      name.textContent = spec?.name ?? primary.specId
      const sub = el('p', 'plate-sub', infoCol)
      if (spec) {
        const role = droneRole(spec)
        const tag = el('span', `role-tag role-${role.tag.toLowerCase()}`, sub)
        tag.textContent = role.tag
      }
      if (hostile) {
        const tag = el('span', 'tag tag-hostile', sub)
        tag.textContent = 'HOSTILE'
      } else {
        const mode = el('span', 'tag', sub)
        mode.textContent = primary.mode
        if (primary.policy) {
          const pol = el('span', 'tag tag-policy', sub)
          pol.textContent = primary.policy.kind
        }
        if (primary.uncontrolled) {
          const warn = el('span', 'tag tag-warn', sub)
          warn.appendChild(iconEl(ICONS.nolink, 'icon icon-s'))
          warn.appendChild(document.createTextNode('NO LINK'))
        }
      }

      numbers(
        infoCol,
        ICONS.hp,
        `${Math.ceil(primary.hp)}/${Math.ceil(primary.hpMax)}`,
        (primary.hp / primary.hpMax) * 100,
      )
      if (!hostile && spec?.batteryWh) {
        const pct = Math.round((primary.batteryWh / spec.batteryWh) * 100)
        numbers(infoCol, ICONS.battery, `battery ${pct}%`, pct)
      }
      if (!hostile && spec && spec.payloadKg > 0 && (spec.class === 'mining' || spec.class === 'cargo')) {
        numbers(
          infoCol,
          ICONS.cargo,
          `cargo ${primary.cargoKg.toFixed(0)}/${spec.payloadKg} kg`,
          (primary.cargoKg / spec.payloadKg) * 100,
        )
      }

      if (sel.drones.length > 1) {
        const grouped = new Map<string, number>()
        for (const d of sel.drones) grouped.set(d.specId, (grouped.get(d.specId) ?? 0) + 1)
        const groupRow = el('p', 'sel-group', infoCol)
        for (const [specId, count] of grouped) {
          const chip = el('span', 'group-chip', groupRow)
          const src = thumbs?.drones[specId]
          if (src) img('', chip, src)
          else if (catalog[specId]) chip.appendChild(iconEl(droneClassIcon(catalog[specId]!.class), 'icon icon-s'))
          chip.appendChild(document.createTextNode(`x${count}`))
        }
      }
      return
    }

    if (structure) {
      const hostile = structure.playerId !== playerId
      plate.classList.toggle('hostile', hostile)
      setPortrait(thumbs?.structures[structure.kind], () => structurePortraitEl(structure.kind), hostile)
      const name = el('p', 'plate-name', infoCol)
      name.textContent = STRUCTURE_NAME[structure.kind]
      const sub = el('p', 'plate-sub', infoCol)
      const tag = el('span', `tag${hostile ? ' tag-hostile' : ''}`, sub)
      tag.textContent = hostile ? 'HOSTILE' : 'structure'
      if (structure.readyAtTick !== undefined) {
        const building = el('span', 'tag tag-policy', sub)
        building.textContent = 'CONSTRUCTING'
      }
      numbers(
        infoCol,
        ICONS.hp,
        `${Math.ceil(structure.hp)}/${Math.ceil(structure.hpMax)}`,
        (structure.hp / structure.hpMax) * 100,
      )
      if (!hostile) {
        const hint = el('p', 'sel-hint', infoCol)
        hint.textContent =
          structure.kind === 'factory'
            ? 'Queue drones from the Factory tiles.'
            : structure.kind === 'satellite-uplink'
              ? 'Arm a sweep from the order grid.'
              : structure.kind === 'refinery'
                ? 'Cracks stored oil into plastic.'
                : structure.kind === 'relay'
                  ? 'Extends the control link.'
                  : structure.kind === 'power-plant'
                    ? 'Feeds the power grid.'
                    : 'Constructs buildings; lose it and the match is over.'
      }
      return
    }

    if (node) {
      plate.classList.remove('hostile')
      setPortrait(thumbs?.nodes[node.kind], () => nodePortraitEl(node.kind), false)
      const name = el('p', 'plate-name', infoCol)
      name.textContent = node.kind === 'lithium' ? 'Lithium crystals' : 'Oil seep'
      const sub = el('p', 'plate-sub', infoCol)
      const tag = el('span', 'tag', sub)
      tag.textContent = 'resource'
      numbers(
        infoCol,
        node.kind === 'lithium' ? ICONS.lithium : ICONS.oil,
        `${fmt(node.remainingKg)} kg left`,
        (node.remainingKg / 1500) * 100,
      )
      const hint = el('p', 'sel-hint', infoCol)
      hint.textContent = 'Right-click with miners selected to harvest.'
    }
  }

  const offSel = bus.on('selection', render)
  return () => {
    offView()
    offSel()
    offThumbs()
  }
}
