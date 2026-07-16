/**
 * Typed pub/sub bus. The only client-side channel between contracts
 * (scene, UI, telemetry, app shell). No box imports another box.
 */
export type Handler<T> = (payload: T) => void

export class Bus<Topics extends Record<string, unknown>> {
  private handlers = new Map<keyof Topics, Set<Handler<never>>>()

  on<K extends keyof Topics>(topic: K, handler: Handler<Topics[K]>): () => void {
    let set = this.handlers.get(topic)
    if (!set) {
      set = new Set()
      this.handlers.set(topic, set)
    }
    set.add(handler as Handler<never>)
    return () => set.delete(handler as Handler<never>)
  }

  emit<K extends keyof Topics>(topic: K, payload: Topics[K]): void {
    const set = this.handlers.get(topic)
    if (!set) return
    for (const handler of [...set]) (handler as Handler<Topics[K]>)(payload)
  }
}
