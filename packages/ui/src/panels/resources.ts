import type { Bus, ClientTopics, PlayerView } from '@opticone/shared'
import { ICONS, iconEl } from '../icons'
import { button, clockText, el, fmt } from '../dom'

/**
 * Top strip of the console: resource readouts, satellite energy bar, wind
 * compass, mission clock, sound and help buttons.
 */
export function resourceStrip(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const bar = el('div', 'console-top', root)

  const res = el('div', 'resource-bar', bar)
  res.setAttribute('role', 'status')
  res.setAttribute('aria-label', 'resources')
  const chip = (icon: string, cls: string) => {
    const c = el('span', `res ${cls}`, res)
    const badge = el('span', 'res-badge', c)
    badge.appendChild(iconEl(icon))
    return el('span', 'res-value', c)
  }
  const credits = chip(ICONS.credits, 'res-credits')
  const lithium = chip(ICONS.lithium, 'res-lithium')
  const oil = chip(ICONS.oil, 'res-oil')
  const plastic = chip(ICONS.plastic, 'res-plastic')
  const satWrap = el('span', 'res res-sat', res)
  const satBadge = el('span', 'res-badge', satWrap)
  satBadge.appendChild(iconEl(ICONS.satellite))
  const sat = el('span', 'res-value', satWrap)
  const satTrack = el('span', 'sat-track', satWrap)
  const satFill = el('span', 'sat-fill', satTrack)

  const status = el('div', 'console-status', bar)
  const wind = el('span', 'res wind-chip', status)
  const windArrow = iconEl(ICONS.wind, 'icon wind-arrow')
  wind.appendChild(windArrow)
  const windValue = el('span', 'res-value', wind)
  const clock = el('span', 'res clock-chip', status)
  clock.appendChild(iconEl(ICONS.clock))
  const clockValue = el('span', 'res-value', clock)

  const mute = button('sys-btn', status, 'toggle sound')
  mute.setAttribute('aria-pressed', 'false')
  mute.appendChild(iconEl(ICONS.sound))
  let muted = false
  mute.addEventListener('click', () => {
    muted = !muted
    mute.setAttribute('aria-pressed', String(muted))
    mute.replaceChildren(iconEl(muted ? ICONS.mute : ICONS.sound))
    bus.emit('intent:mute', muted)
  })

  const help = button('sys-btn', status, 'help')
  help.appendChild(iconEl(ICONS.help))
  const overlay = el('div', 'overlay help-overlay hidden', document.body)
  const card = el('div', 'overlay-card', overlay)
  const h = el('h1', '', card)
  h.textContent = 'Field manual'
  const body = el('div', 'help-body', card)
  body.innerHTML = `
    <p><strong>Goal.</strong> Destroy the enemy CENTCOM base before yours falls.</p>
    <p><strong>Economy.</strong> Ore miners harvest lithium crystals and oil seeps, the refinery cracks oil into airframe plastic, the factory turns lithium + plastic + credits into drones.</p>
    <p><strong>Combat.</strong> FPV quads and loitering munitions detonate on contact. Bombers and jets drop guided bombs from range. Watch the wind: over a drone's spec limit it drifts uncontrolled.</p>
    <p><strong>Control.</strong> Outside your CENTCOM/relay control range drones only follow standing orders (policies). Assign them from the order grid.</p>
    <p><strong>Recon.</strong> Fog hides everything. Scouts, structures and satellite sweeps reveal the field.</p>`
  const close = button('primary-btn', card)
  close.textContent = 'Close'
  const toggle = () => overlay.classList.toggle('hidden')
  help.addEventListener('click', toggle)
  close.addEventListener('click', toggle)

  const off = bus.on('view', (view: PlayerView) => {
    credits.textContent = `Credits ${fmt(view.economy.credits)}`
    lithium.textContent = `Lithium ${fmt(view.economy.lithiumKg)} kg`
    oil.textContent = `Oil ${fmt(view.economy.oilKg)} kg`
    plastic.textContent = `Plastic ${fmt(view.economy.plasticKg)} kg`
    sat.textContent = `Sat ${view.satellite.energy.toFixed(0)}`
    satFill.style.width = `${Math.round(view.satellite.energy)}%`
    windValue.textContent = `Wind ${view.wind.speedMps.toFixed(1)} m/s`
    wind.classList.toggle('warn', view.wind.speedMps > 9)
    windArrow.style.transform = `rotate(${(view.wind.dirRad * 180) / Math.PI}deg)`
    clockValue.textContent = clockText(view.tick)
  })
  return () => {
    off()
    overlay.remove()
  }
}
