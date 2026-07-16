import { decode, encode, type Frame } from './protocol'

/** Minimal socket surface shared by the browser WebSocket and the ws package. */
export interface WebSocketLike {
  readyState: number
  send(data: string): void
  close(): void
  onopen: ((ev?: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: ((ev?: unknown) => void) | null
  onerror: ((ev?: unknown) => void) | null
}

const OPEN = 1

export interface ChannelOptions {
  /** Socket factory; defaults to the browser-native WebSocket. */
  wsFactory?: (url: string) => WebSocketLike
  pingIntervalMs?: number
  metricsFlushMs?: number
  reconnectBaseMs?: number
  reconnectMaxMs?: number
}

export interface ChannelStats {
  rttMs: number | null
  dropRate: number
}

export interface Channel {
  send(payload: unknown): void
  onMessage(cb: (payload: unknown) => void): void
  onStatus(cb: (status: 'connecting' | 'open' | 'closed') => void): void
  emitMetric(name: string, value: number): void
  stats(): ChannelStats
  close(): void
}

/**
 * C-06 connect. One reconnecting WebSocket per match: opaque data frames
 * with sequence numbers (drop detection), rtt pings, batched fire-and-forget
 * metrics. Transport v1 is plain WS; the Channel interface is the contract,
 * so a binary or QUIC transport can replace this file without callers
 * noticing.
 */
export function connect(url: string, matchId: string, token?: string, opts: ChannelOptions = {}): Channel {
  const wsFactory =
    opts.wsFactory ?? ((u: string) => new (globalThis as { WebSocket: new (u: string) => WebSocketLike }).WebSocket(u))
  const pingEvery = opts.pingIntervalMs ?? 5000
  const flushEvery = opts.metricsFlushMs ?? 2000
  const backoffBase = opts.reconnectBaseMs ?? 250
  const backoffMax = opts.reconnectMaxMs ?? 5000

  let ws: WebSocketLike | null = null
  let closedByUser = false
  let attempts = 0
  let seq = 0
  let lastRecvSeq = 0
  let received = 0
  let dropped = 0
  let rttMs: number | null = null
  const sendQueue: string[] = []
  const metricsBuffer: { name: string; value: number }[] = []
  let messageCb: (payload: unknown) => void = () => {}
  let statusCb: (status: 'connecting' | 'open' | 'closed') => void = () => {}
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let flushTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function rawSend(data: string): void {
    if (ws && ws.readyState === OPEN) ws.send(data)
    else sendQueue.push(data)
  }

  function flushMetrics(): void {
    if (metricsBuffer.length === 0 || !ws || ws.readyState !== OPEN) return
    rawSend(encode({ kind: 'metrics', items: metricsBuffer.splice(0, metricsBuffer.length) }))
  }

  function open(): void {
    if (closedByUser) return
    statusCb('connecting')
    const socket = wsFactory(url)
    ws = socket

    socket.onopen = () => {
      attempts = 0
      socket.send(encode({ kind: 'hello', matchId, token }))
      while (sendQueue.length > 0 && socket.readyState === OPEN) socket.send(sendQueue.shift()!)
      statusCb('open')
    }

    socket.onmessage = (ev) => {
      const frame = decode(String(ev.data))
      if (!frame) return
      if (frame.kind === 'data') {
        received++
        if (frame.seq > lastRecvSeq + 1) dropped += frame.seq - lastRecvSeq - 1
        lastRecvSeq = Math.max(lastRecvSeq, frame.seq)
        messageCb(frame.payload)
      } else if (frame.kind === 'pong') {
        rttMs = Date.now() - frame.t
      } else if (frame.kind === 'ping') {
        rawSend(encode({ kind: 'pong', t: frame.t }))
      }
    }

    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      if (closedByUser) {
        statusCb('closed')
        return
      }
      const delay = Math.min(backoffMax, backoffBase * 2 ** attempts++)
      reconnectTimer = setTimeout(open, delay)
      statusCb('connecting')
    }

    socket.onerror = () => {
      // onclose follows; nothing to do here.
    }
  }

  pingTimer = setInterval(() => {
    if (ws && ws.readyState === OPEN) ws.send(encode({ kind: 'ping', t: Date.now() }))
  }, pingEvery)
  flushTimer = setInterval(flushMetrics, flushEvery)

  open()

  return {
    send(payload) {
      rawSend(encode({ kind: 'data', seq: ++seq, payload }))
    },
    onMessage(cb) {
      messageCb = cb
    },
    onStatus(cb) {
      statusCb = cb
    },
    emitMetric(name, value) {
      metricsBuffer.push({ name, value })
      if (metricsBuffer.length >= 20) flushMetrics()
    },
    stats() {
      return { rttMs, dropRate: received + dropped === 0 ? 0 : dropped / (received + dropped) }
    },
    close() {
      closedByUser = true
      if (pingTimer) clearInterval(pingTimer)
      if (flushTimer) clearInterval(flushTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
      ws = null
    },
  }
}

export type { Frame }
