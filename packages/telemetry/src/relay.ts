import { WebSocketServer, type WebSocket } from 'ws'
import { decode, encode } from './protocol'

/**
 * C-06 relay: the server side of transport v1. Pairs clients into rooms by
 * matchId and relays opaque data frames between them. It never parses
 * payloads, keeps no game state, and fits a tiny node process (or a
 * WebSocket-capable serverless runtime) unchanged.
 */
export interface RelayOptions {
  port: number
  /** Max sockets per room; a 1v1 match needs 2. */
  roomCap?: number
  onMetrics?: (matchId: string, items: { name: string; value: number }[]) => void
}

export interface Relay {
  port: number
  rooms(): Map<string, number>
  /** Test and admin hook: drop every socket in a room. */
  kick(matchId: string): void
  close(): Promise<void>
}

export function createRelay(opts: RelayOptions): Promise<Relay> {
  const roomCap = opts.roomCap ?? 2
  const rooms = new Map<string, Set<WebSocket>>()

  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: opts.port }, () => {
      const address = wss.address()
      const port = typeof address === 'object' && address ? address.port : opts.port

      resolve({
        port,
        rooms: () => new Map([...rooms.entries()].map(([id, set]) => [id, set.size])),
        kick(matchId) {
          for (const socket of rooms.get(matchId) ?? []) socket.close()
        },
        close: () =>
          new Promise<void>((done) => {
            for (const set of rooms.values()) for (const socket of set) socket.terminate()
            wss.close(() => done())
          }),
      })
    })

    wss.on('connection', (socket: WebSocket) => {
      let room: string | null = null

      socket.on('message', (raw) => {
        const frame = decode(raw.toString())
        if (!frame) return

        if (frame.kind === 'hello') {
          let set = rooms.get(frame.matchId)
          if (!set) {
            set = new Set()
            rooms.set(frame.matchId, set)
          }
          if (set.size >= roomCap && !set.has(socket)) {
            socket.close()
            return
          }
          set.add(socket)
          room = frame.matchId
          return
        }

        if (frame.kind === 'ping') {
          socket.send(encode({ kind: 'pong', t: frame.t }))
          return
        }

        if (frame.kind === 'metrics') {
          if (room) opts.onMetrics?.(room, frame.items)
          return
        }

        if (frame.kind === 'data' && room) {
          for (const peer of rooms.get(room) ?? []) {
            if (peer !== socket && peer.readyState === peer.OPEN) peer.send(raw.toString())
          }
        }
      })

      socket.on('close', () => {
        if (!room) return
        const set = rooms.get(room)
        set?.delete(socket)
        if (set && set.size === 0) rooms.delete(room)
      })
    })
  })
}
