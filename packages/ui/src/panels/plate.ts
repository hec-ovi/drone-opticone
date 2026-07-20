import {
  AIR_DEFENSE_AMMO_MAX,
  type Bus,
  type ClientTopics,
  type DroneMode,
  type DroneState,
  type PlayerView,
  type Selection,
  type ThumbnailSet,
} from '@opticone/shared'
import { ICONS, droneClassIcon, iconEl } from '../icons'
import { el, fmt, img } from '../dom'
import { STRUCTURE_NAME } from '../display'
import { droneRole } from '../roles'
import { nodePortraitEl, portraitEl, structurePortraitEl } from '../portraits'

const MODE_LABEL: Record<DroneMode, string> = {
  idle: 'IDLE',
  moving: 'MOVING',
  patrol: 'PATROL',
  attacking: 'ATTACKING',
  mining: 'MINING',
  returning: 'RETURNING',
  terminal: 'TERMINAL',
}

/**
 * Unit plate: the selected unit, building or node as a rendered portrait
 * with centered name, numeric hull, battery and cargo. The frame is colored
 * by what the unit is doing and a target line names what it works on; the
 * whole plate refreshes live from the view. Enemy selections show the same
 * plate in hostile red, intel only.
 */
export function selectionPanel(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel selection-panel', root)
  const plate = el('div', 'plate', panel)
  const portraitSlot = el('div', 'plate-portrait', plate)
  const infoCol = el('div', 'plate-info', plate)
  const empty = el('p', 'selection-empty', plate)
  empty.textContent = 'Nothing selected'

  let catalog: PlayerView['catalog'] = {}
  let playerId = ''
  let thumbs: ThumbnailSet | null = null
  let lastSel: Selection = { drones: [], structures: [], nodes: [] }
  let lastView: PlayerView | null = null

  const pct = (v: number, max: number) => (max > 0 ? Math.round((v / max) * 100) : 0)

  /** What of the selection's live state the plate actually shows. */
  const liveSig = (sel: Selection): string =>
    JSON.stringify([
      sel.drones.map((d) => {
        const spec = catalog[d.specId]
        return [
          d.id,
          d.mode,
          pct(d.hp, d.hpMax),
          spec?.batteryWh ? pct(d.batteryWh, spec.batteryWh) : -1,
          spec?.payloadKg ? pct(d.cargoKg, spec.payloadKg) : -1,
          d.targetId,
          d.nodeId,
          d.policy?.kind ?? null,
          d.uncontrolled,
          d.dest ? Math.round(Math.hypot(d.dest.x - d.pos.x, d.dest.z - d.pos.z) / 50) : -1,
        ]
      }),
      sel.structures.map((s) => [s.id, pct(s.hp, s.hpMax), s.readyAtTick !== undefined, s.ammo ?? -1]),
      sel.nodes.map((n) => [n.id, Math.round(n.remainingKg / 20)]),
    ])

  const offView = bus.on('view', (view: PlayerView) => {
    catalog = view.catalog
    playerId = view.playerId
    lastView = view
    if (lastSel.drones.length + lastSel.structures.length + lastSel.nodes.length === 0) return
    // Live plate: re-resolve the selected ids against the fresh view and
    // re-render only when something the plate shows actually changed.
    const fresh: Selection = {
      drones: lastSel.drones
        .map((d) => [...view.ownDrones, ...view.enemyDrones].find((x) => x.id === d.id))
        .filter((x): x is Selection['drones'][number] => x !== undefined),
      structures: lastSel.structures
        .map((s) => view.structures.find((x) => x.id === s.id))
        .filter((x): x is Selection['structures'][number] => x !== undefined),
      nodes: lastSel.nodes
        .map((n) => view.nodes.find((x) => x.id === n.id))
        .filter((x): x is Selection['nodes'][number] => x !== undefined),
    }
    if (liveSig(fresh) !== liveSig(lastSel)) render(fresh)
  })
  const offThumbs = bus.on('thumbnails', (t: ThumbnailSet) => {
    thumbs = t
    render(lastSel)
  })

  const setPortrait = (
    src: string | undefined,
    fallback: () => HTMLElement,
    hostile: boolean,
    modeClass = '',
  ) => {
    portraitSlot.textContent = ''
    if (src) {
      const holder = el('div', `portrait${hostile ? ' hostile' : ''}${modeClass ? ` ${modeClass}` : ''}`, portraitSlot)
      img('portrait-img', holder, src)
      el('div', 'p-scan', holder)
      el('div', 'p-frame', holder)
    } else {
      const fb = fallback()
      if (hostile) fb.classList.add('hostile')
      if (modeClass) fb.classList.add(modeClass)
      portraitSlot.appendChild(fb)
    }
  }

  /** One line naming what the selected unit is working on right now. */
  const targetRow = (d: DroneState): void => {
    if (!lastView) return
    const row = el('p', 'plate-target', infoCol)
    const chip = (thumbSrc: string | undefined, icon: string, text: string, hostileTarget = false) => {
      if (thumbSrc) img('', row, thumbSrc)
      else row.appendChild(iconEl(icon, 'icon icon-s'))
      row.appendChild(document.createTextNode(text))
      if (hostileTarget) row.classList.add('hostile-target')
    }
    switch (d.mode) {
      case 'mining': {
        const node = lastView.nodes.find((n) => n.id === d.nodeId)
        if (node) {
          chip(
            thumbs?.nodes[node.kind],
            node.kind === 'lithium' ? ICONS.lithium : ICONS.oil,
            node.kind === 'lithium' ? 'Lithium crystals' : 'Oil seep',
          )
        } else row.remove()
        break
      }
      case 'attacking': {
        const t = [...lastView.enemyDrones, ...lastView.ownDrones].find((x) => x.id === d.targetId)
        const st = t ? undefined : lastView.structures.find((x) => x.id === d.targetId)
        if (t) chip(thumbs?.drones[t.specId], ICONS.attack, catalog[t.specId]?.name ?? t.specId, t.playerId !== playerId)
        else if (st) chip(thumbs?.structures[st.kind], ICONS.attack, STRUCTURE_NAME[st.kind], st.playerId !== playerId)
        else row.remove()
        break
      }
      case 'returning':
        chip(undefined, ICONS.home, 'Returning to base')
        break
      case 'moving':
        if (d.dest) chip(undefined, ICONS.move, `${fmt(Math.hypot(d.dest.x - d.pos.x, d.dest.z - d.pos.z))} m to go`)
        else row.remove()
        break
      case 'patrol':
        chip(undefined, ICONS.policy, 'Patrolling')
        break
      default:
        row.remove()
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
        hostile ? '' : `mode-${primary.mode}`,
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
        const mode = el('span', `tag mode-tag mode-${primary.mode}`, sub)
        mode.textContent = MODE_LABEL[primary.mode]
        if (primary.policy) {
          const pol = el('span', 'tag tag-policy', sub)
          pol.textContent = primary.policy.kind
        }
        if (primary.uncontrolled) {
          const warn = el('span', 'tag tag-warn', sub)
          warn.appendChild(iconEl(ICONS.nolink, 'icon icon-s'))
          warn.appendChild(document.createTextNode('NO LINK'))
        }
        targetRow(primary)
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
      if (!hostile && structure.kind === 'air-defense' && structure.ammo !== undefined) {
        numbers(
          infoCol,
          ICONS.attack,
          `missiles ${structure.ammo}/${AIR_DEFENSE_AMMO_MAX}`,
          (structure.ammo / AIR_DEFENSE_AMMO_MAX) * 100,
        )
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
    }
  }

  const offSel = bus.on('selection', render)
  return () => {
    offView()
    offSel()
    offThumbs()
  }
}
