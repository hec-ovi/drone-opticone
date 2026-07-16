/**
 * C-06 wire protocol, version 1: JSON text frames over one WebSocket.
 * Deliberately tiny so the client ships as a static CDN file. Payloads are
 * opaque envelopes; telemetry never interprets game data.
 */
export type Frame =
  | { kind: 'hello'; matchId: string; token?: string }
  | { kind: 'data'; seq: number; payload: unknown }
  | { kind: 'ping'; t: number }
  | { kind: 'pong'; t: number }
  | { kind: 'metrics'; items: { name: string; value: number }[] }

export function encode(frame: Frame): string {
  return JSON.stringify(frame)
}

export function decode(raw: string): Frame | null {
  try {
    const parsed = JSON.parse(raw) as Frame
    if (!parsed || typeof parsed !== 'object' || typeof parsed.kind !== 'string') return null
    return parsed
  } catch {
    return null
  }
}
