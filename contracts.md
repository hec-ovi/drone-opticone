# drone-opticone contracts

Every subsystem is a contract: a sealed box with a public interface. A box only talks to another box through that interface, never by reaching into its internals or its DOM. Any box can be rewritten from scratch without touching the others as long as its interface holds.

## Ground rules

1. **One directory per contract** (`packages/<name>`). A contract's package never imports another contract's package except the shared types package (`packages/shared`).
2. **Communication is messages, not calls.** Client-side boxes talk over a typed event bus (intents in, views and events out). All message shapes live in `packages/shared`.
3. **Units are SI, scale is 1:1.** Meters, kilograms, seconds, watt-hours, m/s everywhere. Conversion happens only at display time in the UI contract.
4. **Determinism where it matters.** The simulation core is deterministic and headless. Everything visual lives outside it.

| ID | Name | Package |
|----|------|---------|
| C-01 | Drone Registry | `packages/registry` |
| C-03 | Simulation Core | `packages/sim-core` |
| C-04 | Game Scene | `packages/scene` |
| C-05 | UI Layer | `packages/ui` |
| C-07 | Agents and Overlord AI | `packages/agents` |

The composition root is `apps/client`: it owns the match loop and wires the boxes together over the bus. `packages/shared` carries the types, the bus, the rng, terrain math and the gameplay rule tables (construction costs, power grid, market rates) that sim, scene and UI must agree on.

## C-01 Drone Registry

The single source of truth for what a drone IS. Real-world specs only, 1:1 scale, every field sourced from public data (`sourceUrl` is mandatory).

**Owns:** the `DroneSpec` schema (in shared), the 8-drone seed dataset, spec validation.

**Exposes:** `getCatalog()`, `getDrone(id)`, `SEED_DRONES`, `validateSpec(spec) -> {ok} | {errors[]}` (rejects physically impossible airframes: 10..500 W/kg specific power plus dimension and endurance sanity checks).

## C-03 Simulation Core

Pure, deterministic, headless 20 Hz tick. No I/O, no DOM, no wall clock, no unseeded randomness.

**Exposes:**
- `createMatch(seed, mapId, playerIds, catalog) -> MatchState`
- `tick(state, commands[]) -> {state, events[]}` : one fixed 50 ms step; clones the state, never mutates its input.
- `snapshot(state, playerId) -> PlayerView` : the fog-filtered view, the ONLY state clients and agents may read.

**Owns:** economy (mining, ore deposit credits, refinery cracking, market trades, power export), the power grid and brownouts, C&C-style construction with placement validation, sequential factory build queues, air defense (radar sight, interceptor missiles, ammo and auto-reload), combat (kamikaze, ballistic munitions, collisions), wind (mean-reverting walk) and control-link autonomy, terrain-authoritative flight, fog of war, satellite sweeps, the win condition.

**Invariant:** same seed plus same command stream gives identical states on any machine (the determinism test proves it).

## C-04 Game Scene

three.js r185 WebGPU renderer (WebGL2 fallback). Renders a `PlayerView` and turns raw input into `Command`s; the sim decides if they are legal. No game rules in here: placement ghosts and hover feedback consult the shared rule tables.

**Exposes:** `mountScene(canvas) -> ScenePort` (`applyView`, `onCommand`, `onSelection`, `onModeChange`, `onCameraPose`, `focusAt`, `setInteractionMode`, `dispose`), `generateThumbnails(catalog)` (offscreen studio rig, data URLs), and pure picking math (`classifyPick`, `hoverIntent`, `targetMarkers`) tested headless.

## C-05 UI Layer

The command console. Pure composition of panels; every panel reads bus topics and publishes intents, no sim access, no three.js.

**Exposes:** `mountUI(root, bus) -> {dispose}`. Panels: resource strip, minimap, unit plate, per-unit order card, factory build tiles, CENTCOM construction card, market panel, overlays (menu, banner, field manual).

## C-07 Agents and Overlord AI

Onboard autonomy and the computer opponent. Both read only the fog-filtered `PlayerView` (no cheating) and emit `Command`s.

**Exposes:** `evaluatePolicies(view)` (standing orders that keep working outside control range) and `overlordAct(view, difficulty)` (deterministic opponent: economy, base rebuilding, power management, air defense, massed strikes; wins a full match end to end, the e2e test proves it).
