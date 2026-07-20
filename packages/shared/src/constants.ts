/** Fixed simulation step. 20 Hz per C-03. */
export const TICK_RATE = 20
export const DT = 1 / TICK_RATE

/**
 * Real-time pacing: the client runs SIM_SPEED sim-seconds per wall second.
 * Physics stays 1:1 in sim time (real specs), the world just plays out
 * faster than a 15 m/s quad crossing 4 km would feel.
 */
export const SIM_SPEED = 4

/** Fog grid resolution per player (FOG_GRID x FOG_GRID cells over mapSizeM). */
export const FOG_GRID = 64
