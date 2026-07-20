import type { DroneSpec, NodeKind, StructureKind } from '@opticone/shared'

/**
 * Animated unit portraits, StarCraft style: every airframe gets a drawn
 * hero-shot SVG with live parts: spinning rotors, blinking nav lights,
 * airflow streaks, plus a scanline sweep from the CSS layer. Animation
 * classes (p-rotor, p-led, p-stream, p-bob, p-scan) are driven by app CSS.
 */

const HULL = '#8d97a1'
const HULL_DARK = '#3a4148'
const HULL_LIGHT = '#b7c0c8'

/** A spinning rotor disc at (cx, cy): blade pair + blur ring. */
function rotor(cx: number, cy: number, r: number, delay = 0): string {
  return `
  <g class="p-rotorwrap">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${HULL_DARK}" stroke-width="1" opacity="0.6"/>
    <g class="p-rotor" style="transform-origin:${cx}px ${cy}px;animation-delay:${delay}s">
      <rect x="${cx - r}" y="${cy - 1.4}" width="${2 * r}" height="2.8" rx="1.4" fill="${HULL_DARK}"/>
      <rect x="${cx - 1.4}" y="${cy - r}" width="2.8" height="${2 * r}" rx="1.4" fill="${HULL_DARK}" opacity="0.5"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="2.4" fill="${HULL_LIGHT}"/>
  </g>`
}

function led(cx: number, cy: number, color: string, delay = 0): string {
  return `<circle class="p-led" style="animation-delay:${delay}s" cx="${cx}" cy="${cy}" r="2.2" fill="${color}"/>`
}

/** Airflow streaks behind winged airframes. */
function streams(): string {
  let s = ''
  for (const [x, y, len] of [
    [16, 30, 26],
    [12, 60, 34],
    [18, 90, 26],
  ] as const) {
    s += `<line class="p-stream" x1="${x}" y1="${y}" x2="${x + len}" y2="${y}" stroke="var(--accent,#3ec6ff)" stroke-width="1.2" stroke-dasharray="6 10" opacity="0.35"/>`
  }
  return s
}

function quadPortrait(strike: boolean): string {
  const center = strike
    ? `<rect x="48" y="48" width="24" height="24" rx="3" fill="${HULL_DARK}" stroke="${HULL}" stroke-width="1.5"/>
       <rect x="52" y="42" width="16" height="8" rx="2" fill="var(--accent,#3ec6ff)" opacity="0.85"/>
       <circle cx="60" cy="60" r="6" fill="#1c2026" stroke="var(--accent,#3ec6ff)" stroke-width="1.4"/>
       <circle cx="60" cy="60" r="2.2" fill="var(--accent,#3ec6ff)"/>`
    : `<rect x="46" y="50" width="28" height="20" rx="6" fill="${HULL}" stroke="${HULL_LIGHT}" stroke-width="1.2"/>
       <circle cx="60" cy="72" r="5.5" fill="${HULL_DARK}"/>
       <circle cx="60" cy="72" r="2.6" fill="#141a20"/>
       <circle cx="61.4" cy="70.8" r="1" fill="#9fd6e8"/>`
  const arms = [
    [36, 36],
    [84, 36],
    [36, 84],
    [84, 84],
  ]
    .map(([x, y]) => `<line x1="60" y1="60" x2="${x}" y2="${y}" stroke="${HULL_DARK}" stroke-width="4.4" stroke-linecap="round"/>`)
    .join('')
  return `
  ${arms}
  ${center}
  ${rotor(36, 36, 13)}
  ${rotor(84, 36, 13, 0.07)}
  ${rotor(36, 84, 13, 0.11)}
  ${rotor(84, 84, 13, 0.05)}
  ${led(46, 46, '#ff5b5b', 0)}
  ${led(74, 46, '#57e389', 0.5)}`
}

function switchbladePortrait(): string {
  return `
  ${streams()}
  <rect x="34" y="55" width="54" height="10" rx="5" fill="${HULL}" stroke="${HULL_LIGHT}" stroke-width="1"/>
  <path d="M88 55 96 60l-8 5Z" fill="${HULL_LIGHT}"/>
  <rect x="70" y="26" width="5" height="68" rx="2.5" fill="${HULL_DARK}"/>
  <rect x="42" y="38" width="4" height="44" rx="2" fill="${HULL_DARK}"/>
  <rect x="63" y="52" width="10" height="16" rx="2" fill="var(--accent,#3ec6ff)" opacity="0.8"/>
  ${rotor(34, 60, 9)}
  ${led(92, 60, '#ff5b5b')}`
}

function deltaPortrait(): string {
  return `
  ${streams()}
  <path d="M92 60 36 32v56Z" fill="${HULL}" stroke="${HULL_LIGHT}" stroke-width="1.4"/>
  <path d="M92 60 60 44v32Z" fill="${HULL_DARK}" opacity="0.5"/>
  <rect x="33" y="26" width="5" height="18" rx="2" fill="${HULL_DARK}"/>
  <rect x="33" y="76" width="5" height="18" rx="2" fill="${HULL_DARK}"/>
  <circle cx="88" cy="60" r="4" fill="${HULL_DARK}"/>
  ${rotor(31, 60, 8)}
  ${led(60, 60, 'var(--accent,#3ec6ff)', 0.3)}`
}

function tb2Portrait(): string {
  return `
  ${streams()}
  <rect x="40" y="55" width="52" height="10" rx="5" fill="${HULL_LIGHT}" stroke="${HULL}" stroke-width="1"/>
  <circle cx="90" cy="60" r="5.5" fill="${HULL_LIGHT}"/>
  <circle cx="84" cy="66" r="3.4" fill="${HULL_DARK}"/>
  <rect x="60" y="18" width="7" height="84" rx="3.5" fill="${HULL}"/>
  <path d="M40 60 30 44l4 16-4 16Z" fill="${HULL}"/>
  <rect x="36" y="40" width="3.6" height="40" rx="1.8" fill="${HULL_DARK}"/>
  ${rotor(34, 60, 8)}
  ${led(63, 22, '#ff5b5b', 0.2)}
  ${led(63, 98, '#57e389', 0.7)}`
}

function cargoPortrait(): string {
  const arms = [
    [32, 32],
    [88, 32],
    [32, 88],
    [88, 88],
  ]
    .map(([x, y]) => `<line x1="60" y1="60" x2="${x}" y2="${y}" stroke="${HULL_DARK}" stroke-width="5" stroke-linecap="round"/>`)
    .join('')
  return `
  ${arms}
  <rect x="44" y="46" width="32" height="24" rx="4" fill="${HULL_DARK}" stroke="${HULL}" stroke-width="1.4"/>
  <rect x="50" y="52" width="20" height="16" rx="2" fill="#8a6d3b" stroke="#b28e50" stroke-width="1.2"/>
  <path d="M50 60h20M60 52v16" stroke="#b28e50" stroke-width="1.2"/>
  ${rotor(32, 32, 12)}
  ${rotor(88, 32, 12, 0.06)}
  ${rotor(32, 88, 12, 0.1)}
  ${rotor(88, 88, 12, 0.03)}
  ${led(60, 42, 'var(--accent,#3ec6ff)', 0.4)}`
}

function minerPortrait(): string {
  const arms = [
    [30, 30],
    [90, 30],
    [30, 90],
    [90, 90],
  ]
    .map(([x, y]) => `<line x1="60" y1="60" x2="${x}" y2="${y}" stroke="${HULL_DARK}" stroke-width="5" stroke-linecap="round"/>`)
    .join('')
  return `
  ${arms}
  <circle cx="60" cy="60" r="16" fill="#2d5c48" stroke="#63e6c4" stroke-width="1.6" opacity="0.9"/>
  <path d="M50 56c4-4 16-4 20 0" stroke="#63e6c4" stroke-width="1.4" fill="none" opacity="0.7"/>
  <rect x="52" y="72" width="16" height="6" rx="3" fill="#d9a520"/>
  <path d="M56 78l4 8 4-8" fill="#d9a520"/>
  ${rotor(30, 30, 12)}
  ${rotor(90, 30, 12, 0.08)}
  ${rotor(30, 90, 12, 0.04)}
  ${rotor(90, 90, 12, 0.12)}
  ${led(60, 40, '#57e389', 0.6)}`
}

function artFor(spec: DroneSpec): string {
  switch (spec.id) {
    case 'mavic3':
      return quadPortrait(false)
    case 'fpv-strike':
      return quadPortrait(true)
    case 'switchblade300':
      return switchbladePortrait()
    case 'shahed136':
      return deltaPortrait()
    case 'tb2':
      return tb2Portrait()
    case 'flycart30':
      return cargoPortrait()
    case 'ore-miner':
      return minerPortrait()
  }
  switch (spec.class) {
    case 'multirotor':
      return quadPortrait(spec.payloadKg > 0)
    case 'loitering-munition':
      return spec.massKg > 20 ? deltaPortrait() : switchbladePortrait()
    case 'fixed-wing':
      return tb2Portrait()
    case 'cargo':
      return cargoPortrait()
    case 'mining':
      return minerPortrait()
  }
}

/** Backdrop grid shared by all portraits. */
function backdrop(): string {
  let grid = ''
  for (let i = 1; i < 6; i++) {
    grid += `<line x1="${i * 20}" y1="0" x2="${i * 20}" y2="120" stroke="#20303c" stroke-width="0.6"/>`
    grid += `<line x1="0" y1="${i * 20}" x2="120" y2="${i * 20}" stroke="#20303c" stroke-width="0.6"/>`
  }
  return `<rect width="120" height="120" fill="#0c1319"/>${grid}<circle cx="60" cy="60" r="46" fill="none" stroke="#22384a" stroke-width="1" stroke-dasharray="4 6"/>`
}

export function portraitSvg(spec: DroneSpec): string {
  return `<svg viewBox="0 0 120 120" role="img" aria-label="${spec.name} portrait">
  ${backdrop()}
  <g class="p-bob">${artFor(spec)}</g>
</svg>`
}

/** Full portrait element: animated SVG plus scanline and frame overlays. */
export function portraitEl(spec: DroneSpec): HTMLElement {
  const div = document.createElement('div')
  div.className = 'portrait'
  div.dataset.spec = spec.id
  div.innerHTML = `${portraitSvg(spec)}<div class="p-scan"></div><div class="p-frame"></div>`
  return div
}

// ------------------------------------------------- structures and nodes --

function structureArt(kind: StructureKind): string {
  switch (kind) {
    case 'centcomm':
      return `
  <path d="M60 22 92 38v28L60 82 28 66V38Z" fill="${HULL_DARK}" stroke="${HULL}" stroke-width="1.6"/>
  <circle cx="60" cy="52" r="17" fill="#8ecbe4" opacity="0.85" stroke="var(--accent,#3ec6ff)" stroke-width="1.6"/>
  <circle cx="60" cy="52" r="17" fill="none" stroke="#dff3fb" stroke-width="1" opacity="0.5"/>
  <g class="p-rotor" style="transform-origin:60px 52px;animation-duration:2.6s">
    <line x1="60" y1="52" x2="60" y2="33" stroke="var(--accent,#3ec6ff)" stroke-width="2"/>
  </g>
  ${led(30, 40, 'var(--accent,#3ec6ff)', 0)}
  ${led(90, 40, 'var(--accent,#3ec6ff)', 0.4)}
  ${led(30, 64, 'var(--accent,#3ec6ff)', 0.8)}
  ${led(90, 64, 'var(--accent,#3ec6ff)', 1.2)}
  <rect x="52" y="82" width="16" height="14" fill="${HULL_DARK}"/>`
    case 'refinery':
      return `
  <rect x="24" y="58" width="34" height="30" fill="${HULL}" stroke="${HULL_LIGHT}" stroke-width="1.2"/>
  <rect x="64" y="36" width="10" height="52" rx="3" fill="${HULL_LIGHT}"/>
  <rect x="80" y="46" width="9" height="42" rx="3" fill="${HULL_LIGHT}"/>
  <rect x="63" y="48" width="12" height="3" fill="${HULL_DARK}"/>
  <rect x="63" y="62" width="12" height="3" fill="${HULL_DARK}"/>
  <line x1="96" y1="88" x2="96" y2="40" stroke="${HULL_DARK}" stroke-width="3.4"/>
  <g class="p-flame"><path d="M96 40c-4-7-2-11 0-15 2 4 4 8 0 15Z" fill="#ffa63d"/></g>
  ${led(41, 66, 'var(--accent,#3ec6ff)', 0.3)}
  <ellipse cx="41" cy="92" rx="26" ry="4" fill="${HULL_DARK}" opacity="0.6"/>`
    case 'factory':
      return `
  <path d="M24 88V56l12-10v10l12-10v10l12-10v42Z" fill="${HULL}" stroke="${HULL_LIGHT}" stroke-width="1.2"/>
  <rect x="66" y="62" width="30" height="4" fill="${HULL_LIGHT}"/>
  <g class="p-crane"><rect x="70" y="66" width="4" height="12" fill="var(--accent,#3ec6ff)"/></g>
  <circle cx="81" cy="86" r="13" fill="none" stroke="${HULL_LIGHT}" stroke-width="2"/>
  ${led(81, 73, 'var(--accent,#3ec6ff)', 0)}
  ${led(94, 86, 'var(--accent,#3ec6ff)', 0.5)}
  ${led(68, 86, 'var(--accent,#3ec6ff)', 1)}
  <rect x="30" y="64" width="10" height="24" fill="var(--accent,#3ec6ff)" opacity="0.7"/>`
    case 'relay':
      return `
  <path d="M56 92 60 26l4 66Z" fill="${HULL}" stroke="${HULL_LIGHT}" stroke-width="1"/>
  <line x1="48" y1="80" x2="72" y2="80" stroke="${HULL_DARK}" stroke-width="2"/>
  <line x1="52" y1="58" x2="68" y2="58" stroke="${HULL_DARK}" stroke-width="2"/>
  <rect x="52" y="34" width="5" height="12" fill="${HULL_LIGHT}"/>
  <rect x="63" y="34" width="5" height="12" fill="${HULL_LIGHT}"/>
  ${led(60, 24, '#ff5b5b', 0)}
  <circle cx="60" cy="24" r="8" fill="none" stroke="#ff5b5b" stroke-width="1" opacity="0.4" class="p-led" style="animation-delay:0.2s"/>`
    case 'satellite-uplink':
      return `
  <rect x="26" y="70" width="26" height="18" fill="${HULL}" stroke="${HULL_LIGHT}" stroke-width="1.2"/>
  <rect x="60" y="74" width="10" height="14" fill="${HULL_DARK}"/>
  <path d="M46 58A24 24 0 0 1 88 34" fill="none" stroke="${HULL_LIGHT}" stroke-width="6" stroke-linecap="round"/>
  <line x1="66" y1="46" x2="78" y2="30" stroke="${HULL_DARK}" stroke-width="2.4"/>
  ${led(80, 28, 'var(--accent,#3ec6ff)', 0.3)}
  <g class="p-rotor" style="transform-origin:67px 46px;animation-duration:4s">
    <line x1="67" y1="46" x2="67" y2="30" stroke="var(--accent,#3ec6ff)" stroke-width="1.4" opacity="0.6"/>
  </g>`
  }
}

function nodeArt(kind: NodeKind): string {
  if (kind === 'lithium') {
    return `
  <g class="p-flame">
    <path d="M60 30 72 74l-12 8-12-8Z" fill="#63e6c4" opacity="0.9"/>
    <path d="M78 48l8 28-10 6-6-22Z" fill="#4fc9aa" opacity="0.85"/>
    <path d="M42 48l-8 28 10 6 6-22Z" fill="#4fc9aa" opacity="0.85"/>
  </g>
  <ellipse cx="60" cy="88" rx="34" ry="6" fill="#2b3f42"/>
  ${led(60, 42, '#9ffbe2', 0)}
  ${led(80, 58, '#9ffbe2', 0.6)}`
  }
  return `
  <ellipse cx="60" cy="86" rx="36" ry="8" fill="#0b0b10"/>
  <line x1="44" y1="86" x2="44" y2="52" stroke="#6b7076" stroke-width="4"/>
  <g class="p-rock" style="transform-origin:44px 52px">
    <rect x="24" y="49" width="46" height="6" rx="3" fill="#8a5a30"/>
    <rect x="20" y="52" width="8" height="12" rx="2" fill="#8a5a30"/>
  </g>
  <circle cx="78" cy="70" r="10" fill="none" stroke="#6b7076" stroke-width="3" class="p-rotor" style="transform-origin:78px 70px;animation-duration:2s;stroke-dasharray:8 6"/>
  ${led(44, 40, '#e0c453', 0.2)}`
}

export function structurePortraitSvg(kind: StructureKind): string {
  return `<svg viewBox="0 0 120 120" role="img" aria-label="${kind} portrait">
  ${backdrop()}
  <g class="p-bob" style="animation-duration:6s">${structureArt(kind)}</g>
</svg>`
}

export function nodePortraitSvg(kind: NodeKind): string {
  return `<svg viewBox="0 0 120 120" role="img" aria-label="${kind} node portrait">
  ${backdrop()}
  <g>${nodeArt(kind)}</g>
</svg>`
}

export function structurePortraitEl(kind: StructureKind): HTMLElement {
  const div = document.createElement('div')
  div.className = 'portrait'
  div.dataset.structure = kind
  div.innerHTML = `${structurePortraitSvg(kind)}<div class="p-scan"></div><div class="p-frame"></div>`
  return div
}

export function nodePortraitEl(kind: NodeKind): HTMLElement {
  const div = document.createElement('div')
  div.className = 'portrait'
  div.dataset.node = kind
  div.innerHTML = `${nodePortraitSvg(kind)}<div class="p-scan"></div><div class="p-frame"></div>`
  return div
}
