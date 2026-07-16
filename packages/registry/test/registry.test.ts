import { describe, expect, it } from 'vitest'
import type { DroneSpec } from '@opticone/shared'
import { SEED_DRONES, getCatalog, getDrone, getDrones, validateSpec } from '@opticone/registry'

describe('seed dataset', () => {
  it('every seed drone passes its own validation', () => {
    for (const spec of SEED_DRONES) {
      const result = validateSpec(spec)
      expect(result, `${spec.id}: ${JSON.stringify(result)}`).toEqual({ ok: true })
    }
  })

  it('every seed has a public https source', () => {
    for (const spec of SEED_DRONES) {
      expect(spec.sourceUrl).toMatch(/^https:\/\//)
    }
  })

  it('covers the required classes: classic heli style and small planes', () => {
    const classes = new Set(SEED_DRONES.map((d) => d.class))
    expect(classes.has('multirotor')).toBe(true)
    expect(classes.has('fixed-wing')).toBe(true)
    expect(classes.has('loitering-munition')).toBe(true)
    expect(classes.has('mining')).toBe(true)
    expect(classes.has('cargo')).toBe(true)
  })

  it('getDrone returns copies, not shared references', () => {
    const a = getDrone('mavic3')!
    a.massKg = 999
    expect(getDrone('mavic3')!.massKg).toBe(0.895)
  })

  it('getCatalog is keyed by id and matches getDrones', () => {
    const catalog = getCatalog()
    expect(Object.keys(catalog).length).toBe(getDrones().length)
    expect(catalog['tb2']!.class).toBe('fixed-wing')
  })
})

describe('validateSpec', () => {
  const base = (): DroneSpec => structuredClone(SEED_DRONES.find((d) => d.id === 'mavic3')!)

  it('rejects missing source url', () => {
    const spec = base()
    spec.sourceUrl = 'http://insecure.example'
    const r = validateSpec(spec)
    expect(r.ok).toBe(false)
  })

  it('rejects cruise above max speed', () => {
    const spec = base()
    spec.cruiseMps = spec.maxMps + 5
    expect(validateSpec(spec).ok).toBe(false)
  })

  it('rejects battery drones with fuel fields and combustion without them', () => {
    const withFuel = base()
    withFuel.fuelKg = 10
    expect(validateSpec(withFuel).ok).toBe(false)

    const combustion = base()
    combustion.batteryWh = null
    expect(validateSpec(combustion).ok).toBe(false)
  })

  it('rejects physically implausible energy claims', () => {
    const spec = base()
    spec.batteryWh = 1
    spec.enduranceS = 360000
    const r = validateSpec(spec)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('specific power')
  })

  it('rejects payload heavier than the aircraft', () => {
    const spec = base()
    spec.payloadKg = spec.massKg * 2
    expect(validateSpec(spec).ok).toBe(false)
  })
})
