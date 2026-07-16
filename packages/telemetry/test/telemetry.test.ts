import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket as NodeWebSocket } from 'ws'
import { connect, type Channel, type WebSocketLike } from '@opticone/telemetry'
import { createRelay, type Relay } from '@opticone/telemetry/relay'

const wsFactory = (url: string) => new NodeWebSocket(url) as unknown as WebSocketLike

const FAST = { wsFactory, pingIntervalMs: 40, metricsFlushMs: 30, reconnectBaseMs: 30, reconnectMaxMs: 60 }

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for condition')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('C-06 telemetry: channel and relay end to end', () => {
  let relay: Relay
  const channels: Channel[] = []

  function open(matchId: string): Channel {
    const ch = connect(`ws://127.0.0.1:${relay.port}`, matchId, undefined, FAST)
    channels.push(ch)
    return ch
  }

  afterEach(async () => {
    channels.splice(0).forEach((c) => c.close())
    await relay?.close()
  })

  it('two clients in the same match exchange opaque payloads', async () => {
    relay = await createRelay({ port: 0 })
    const a = open('m-1')
    const b = open('m-1')
    const gotByB: unknown[] = []
    b.onMessage((p) => gotByB.push(p))
    await until(() => (relay.rooms().get('m-1') ?? 0) === 2)

    a.send({ type: 'move', droneIds: ['e1'] })
    a.send([1, 2, 3])
    await until(() => gotByB.length === 2)
    expect(gotByB[0]).toEqual({ type: 'move', droneIds: ['e1'] })
    expect(gotByB[1]).toEqual([1, 2, 3])
    expect(b.stats().dropRate).toBe(0)
  })

  it('messages sent before the socket opens are queued, not lost', async () => {
    relay = await createRelay({ port: 0 })
    const b = open('m-q')
    const got: unknown[] = []
    b.onMessage((p) => got.push(p))
    await until(() => (relay.rooms().get('m-q') ?? 0) === 1)

    const a = open('m-q')
    a.send('early-bird') // fired while a is still connecting
    await until(() => got.includes('early-bird'))
  })

  it('rooms are isolated: no cross-match leakage', async () => {
    relay = await createRelay({ port: 0 })
    const a = open('m-a')
    const stranger = open('m-b')
    const overheard: unknown[] = []
    stranger.onMessage((p) => overheard.push(p))
    const b = open('m-a')
    const got: unknown[] = []
    b.onMessage((p) => got.push(p))
    await until(() => (relay.rooms().get('m-a') ?? 0) === 2 && (relay.rooms().get('m-b') ?? 0) === 1)

    a.send('secret')
    await until(() => got.length === 1)
    await new Promise((r) => setTimeout(r, 100))
    expect(overheard).toEqual([])
  })

  it('measures rtt through ping frames', async () => {
    relay = await createRelay({ port: 0 })
    const a = open('m-rtt')
    await until(() => a.stats().rttMs !== null)
    expect(a.stats().rttMs!).toBeGreaterThanOrEqual(0)
    expect(a.stats().rttMs!).toBeLessThan(1000)
  })

  it('reconnects after the server drops the room and traffic resumes', async () => {
    relay = await createRelay({ port: 0 })
    const a = open('m-r')
    const b = open('m-r')
    const got: unknown[] = []
    b.onMessage((p) => got.push(p))
    await until(() => (relay.rooms().get('m-r') ?? 0) === 2)

    a.send('before')
    await until(() => got.length === 1)

    relay.kick('m-r')
    await until(() => relay.rooms().get('m-r') === undefined || relay.rooms().get('m-r') === 0)
    // Both channels reconnect and re-join on their own.
    await until(() => (relay.rooms().get('m-r') ?? 0) === 2)

    a.send('after')
    await until(() => got.length === 2)
    expect(got[1]).toBe('after')
  })

  it('batches metrics to the relay without touching the data path', async () => {
    const collected: { matchId: string; items: { name: string; value: number }[] }[] = []
    relay = await createRelay({ port: 0, onMetrics: (matchId, items) => collected.push({ matchId, items }) })
    const a = open('m-m')
    a.emitMetric('fps', 60)
    a.emitMetric('tickDriftMs', 2)
    await until(() => collected.length > 0)
    const items = collected.flatMap((c) => c.items)
    expect(items).toContainEqual({ name: 'fps', value: 60 })
    expect(items).toContainEqual({ name: 'tickDriftMs', value: 2 })
    expect(collected.every((c) => c.matchId === 'm-m')).toBe(true)
  })

  it('a third client cannot join a full 1v1 room', async () => {
    relay = await createRelay({ port: 0 })
    open('m-full')
    open('m-full')
    await until(() => (relay.rooms().get('m-full') ?? 0) === 2)
    open('m-full')
    await new Promise((r) => setTimeout(r, 150))
    expect(relay.rooms().get('m-full')).toBe(2)
  })
})
