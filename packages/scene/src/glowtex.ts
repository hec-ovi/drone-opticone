import * as THREE from 'three/webgpu'

/**
 * Shared radial glow texture for every Sprite in the scene. A Sprite with no
 * map renders as a hard square; this soft falloff makes glows, flashes and
 * smoke read as light, not geometry. Returns null headless (no 2d canvas),
 * where sprites are never rendered anyway.
 */
let cached: THREE.CanvasTexture | null | undefined

export function glowTexture(): THREE.CanvasTexture | null {
  if (cached !== undefined) return cached
  try {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      cached = null
      return cached
    }
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.7, 'rgba(255,255,255,0.16)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    cached = new THREE.CanvasTexture(canvas)
  } catch {
    cached = null
  }
  return cached
}

export function glowSpriteMaterial(color: number, opacity: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    color,
    map: glowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
  })
}
