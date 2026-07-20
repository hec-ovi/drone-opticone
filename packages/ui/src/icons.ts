import type { DroneClass } from '@opticone/shared'

/**
 * Inline SVG icon set. Every icon is a real drawn shape (no emoji, no font
 * glyphs), stroked in currentColor so CSS themes them. 24x24 viewBox.
 */

function svg(inner: string, viewBox = '0 0 24 24'): string {
  return `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
}

export const ICONS = {
  credits: svg(
    '<circle cx="12" cy="12" r="8.2"/><path d="M15 9.2c-.7-.8-1.8-1.3-3-1.3-2.3 0-4.1 1.8-4.1 4.1s1.8 4.1 4.1 4.1c1.2 0 2.3-.5 3-1.3"/><path d="M6.5 10.6h5M6.5 13.4h5"/>',
  ),
  lithium: svg('<path d="M12 2.8 5.2 8v8L12 21.2 18.8 16V8Z"/><path d="M12 2.8v18.4M5.2 8l13.6 8M18.8 8 5.2 16"/>'),
  oil: svg('<path d="M12 3.2c3.2 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.8-6.8 6-11Z"/><path d="M9.4 14.4a2.6 2.6 0 0 0 2.6 2.6"/>'),
  plastic: svg('<path d="M4 8.4 12 4.6l8 3.8v7.2L12 19.4 4 15.6Z"/><path d="M4 8.4l8 3.8 8-3.8M12 12.2v7.2"/>'),
  satellite: svg(
    '<rect x="9.2" y="9.2" width="5.6" height="5.6" transform="rotate(45 12 12)"/><path d="M4.2 7.4 7.4 4.2l3 3-3.2 3.2ZM16.6 13.6l3.2-3.2 3 3-3.2 3.2M13.4 13.4 17 17M17 17v3.4"/>',
    '0 0 26 24',
  ),
  wind: svg('<path d="M3.5 9h10a2.7 2.7 0 1 0-2.7-2.7M3.5 13.6h14.3a2.7 2.7 0 1 1-2.7 2.7M3.5 18h6.6"/>'),
  battery: svg('<rect x="3" y="8" width="15" height="8" rx="1.4"/><path d="M20.6 10.6v2.8"/><path d="M6 10.4v3.2M9 10.4v3.2M12 10.4v3.2"/>'),
  hp: svg('<path d="M12 20s-7.6-4.6-7.6-10A4.4 4.4 0 0 1 12 6.6 4.4 4.4 0 0 1 19.6 10c0 5.4-7.6 10-7.6 10Z"/>'),
  cargo: svg('<path d="M4.5 8.5h15v11h-15Z"/><path d="M4.5 8.5 7 4.5h10l2.5 4M12 4.5v4"/><path d="M9.5 12h5"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 2"/>'),
  attack: svg('<path d="m5 19 6.2-6.2M19 5l-6.2 6.2m0 0L5 5l2.4 5.6L5 19l8.4-2.4L19 19l-2.6-6.2L19 5Z"/>'),
  move: svg('<path d="M12 4v16M4 12h16"/><path d="m12 4-2.6 2.6M12 4l2.6 2.6M12 20l-2.6-2.6M12 20l2.6-2.6M4 12l2.6-2.6M4 12l2.6 2.6M20 12l-2.6-2.6M20 12l-2.6 2.6"/>'),
  mine: svg('<path d="m6 20 6-6"/><path d="M13.4 4.6c2.8-.6 5.6.4 7 2.4-1.6.2-3 .8-4.2 2l-2.4 2.4-2.6-2.6 2.2-2.2c.6-.6.6-1.4 0-2Z"/><path d="M9.2 8.8 4.6 13.4a1.8 1.8 0 0 0 0 2.6l1.4 1.4"/>'),
  policy: svg('<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="6.4"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3"/>'),
  home: svg('<path d="m4 11 8-6.6L20 11v8.4h-5.4v-5h-5.2v5H4Z"/>'),
  hunt: svg('<circle cx="12" cy="12" r="7.4"/><path d="M12 2.4v4M12 17.6v4M2.4 12h4M17.6 12h4"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'),
  cancel: svg('<circle cx="12" cy="12" r="8.4"/><path d="m8 8 8 8M16 8l-8 8"/>'),
  destruct: svg('<circle cx="12" cy="13.4" r="6.2"/><path d="M9.4 4.4h5.2M12 4.4v3M17.4 8l1.8-1.8M12 10.4v3.4l2.2 1.4"/>'),
  skull: svg('<path d="M12 3.5a7 7 0 0 0-7 7c0 2.6 1.4 4.4 3 5.6V19h8v-2.9c1.6-1.2 3-3 3-5.6a7 7 0 0 0-7-7Z"/><circle cx="9.2" cy="11" r="1.5" fill="currentColor"/><circle cx="14.8" cy="11" r="1.5" fill="currentColor"/><path d="M10.4 19v2M13.6 19v2"/>'),
  alert: svg('<path d="M12 3.6 21.4 20H2.6Z"/><path d="M12 9.6v4.6"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>'),
  spawn: svg('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6v8.8M7.6 12h8.8"/>'),
  link: svg('<path d="M9.4 14.6 14.6 9.4"/><path d="M11 6.8 13 4.8a3.6 3.6 0 0 1 5 5l-2 2M13 17.2l-2 2a3.6 3.6 0 0 1-5-5l2-2"/>'),
  nolink: svg('<path d="M11 6.8 13 4.8a3.6 3.6 0 0 1 5 5l-2 2M13 17.2l-2 2a3.6 3.6 0 0 1-5-5l2-2"/><path d="m4 4 16 16"/>'),
  sound: svg('<path d="M4 9.4v5.2h3.6L13 19V5L7.6 9.4Z"/><path d="M16 9a4.3 4.3 0 0 1 0 6M18.6 6.6a8 8 0 0 1 0 10.8"/>'),
  mute: svg('<path d="M4 9.4v5.2h3.6L13 19V5L7.6 9.4Z"/><path d="m16.4 9.6 4.8 4.8M21.2 9.6l-4.8 4.8"/>'),
  help: svg('<circle cx="12" cy="12" r="8.4"/><path d="M9.6 9.2A2.5 2.5 0 0 1 12 7.4c1.4 0 2.5 1 2.5 2.2 0 1.6-2.5 1.9-2.5 3.6"/><circle cx="12" cy="16.6" r="0.7" fill="currentColor"/>'),
  flag: svg('<path d="M6 21V4"/><path d="M6 5h11.4l-2.2 3.4 2.2 3.4H6"/>'),
}

/** Side-profile silhouettes per drone class for build cards and chips. */
export function droneClassIcon(cls: DroneClass): string {
  switch (cls) {
    case 'multirotor':
      return svg(
        '<path d="M9.4 13.6h5.2l1.2 1.8h-7.6Z"/><path d="M7 13.2 4.6 11m12.8 2.2L19.4 11"/><ellipse cx="4.6" cy="10.2" rx="3" ry="0.8"/><ellipse cx="19.4" cy="10.2" rx="3" ry="0.8"/><circle cx="12" cy="16.6" r="1"/>',
      )
    case 'fixed-wing':
      return svg(
        '<path d="M3 12.6h13.4l3.4-1.6v3.2l-3.4-1.6"/><path d="M8.8 12.6 7 9h2.6l1.8 3.6M8.8 12.6 7 16.2h2.6l1.8-3.6"/><circle cx="3.6" cy="12.6" r="1.2"/>',
      )
    case 'loitering-munition':
      return svg(
        '<path d="M4 12.4 20 9.6v5.6L4 12.4Z"/><path d="M13 10.8v3.2M17.4 8v7.6"/><circle cx="20.4" cy="12.4" r="1"/>',
      )
    case 'cargo':
      return svg(
        '<path d="M8.6 10.4h6.8v2.4H8.6Z"/><path d="M6.6 10 4.6 8m12.8 2 2-2"/><ellipse cx="4.6" cy="7.2" rx="2.6" ry="0.7"/><ellipse cx="19.4" cy="7.2" rx="2.6" ry="0.7"/><path d="M10.2 12.8v1.6h3.6v-1.6M10.2 17h3.6v-2.6h-3.6Z"/>',
      )
    case 'mining':
      return svg(
        '<path d="M8.6 10.8h6.8v2.8H8.6Z"/><path d="M6.6 10.4 4.6 8.4m12.8 2 2-2"/><ellipse cx="4.6" cy="7.6" rx="2.6" ry="0.7"/><ellipse cx="19.4" cy="7.6" rx="2.6" ry="0.7"/><path d="m10.8 13.6 1.2 3 1.2-3"/><path d="M12 16.6v2.6"/>',
      )
  }
}

/** Build an element from an icon string. */
export function iconEl(markup: string, className = 'icon'): HTMLElement {
  const span = document.createElement('span')
  span.className = className
  span.innerHTML = markup
  return span
}
