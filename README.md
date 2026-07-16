# drone-opticone

1v1 real-time strategy game with zero humans on the battlefield. Each player is an AI overlord (a CENTCOM base) that mines resources, builds drones from real-world specs, and fights with them. Think Warcraft 2 / StarCraft economy loop plus Command & Conquer satellite recon, but every unit is a real drone modeled 1:1: real weight, battery capacity, wind limits, ballistics, collision behavior.

Core ideas:

- **Real drone database.** Every drone in the game comes from public manufacturer or defense data (DJI Mavic class quads, FPV kamikazes, Switchblade loitering munitions, Shahed-style delta wings, Bayraktar-class fixed wings). No made-up stats.
- **Player-uploaded drones.** Users upload a drone as a GLB model (glTF 2.0, meters, 1:1 scale) plus a printable blueprint (3MF, STL accepted) and a spec sheet. Validated, then sold in the store.
- **Swarm agentic control.** You command groups and policies, not single units. Drones run agent behaviors.
- **Economy.** Lithium for batteries, oil for plastics, a few structures (refinery, mining drones). Fog of war, satellite passes for visibility.
- **Credits.** Simulated blockchain wallet, isolated so a real chain can replace it later. 1v1 matches can escrow a bet.
- **AI presence.** The overlords talk: LLM-driven dialog and TTS voices for your CENTCOM and the enemy AI, isolated behind its own contract with static fallbacks.

## Status

Playable 1 vs AI prototype. The system is split into 13 isolated contracts in [contracts.md](contracts.md); built so far:

- C-01 registry (`packages/registry`): 7 seed drones from public spec sheets, plus validation that rejects physically impossible uploads (10..500 W/kg specific power band).
- C-03 sim core (`packages/sim-core`): deterministic 20 Hz headless tick. Wind above a drone's spec limit makes it drift uncontrolled, batteries drain at the endurance-derived wattage and a dead battery is a crash, kamikazes detonate on proximity, bombers lob ballistic munitions, miners haul lithium and oil, refineries crack oil into plastic, fog of war plus satellite sweeps, centcomm kill wins.
- C-07 agents (`packages/agents`): standing policies (patrol, mine, hunt, kamikaze trigger, return at low battery) that keep working outside control range, and a deterministic overlord AI opponent.
- C-04 scene (`packages/scene`): three.js r185 WebGPU renderer (WebGL2 fallback), RTS camera, click select, right-click orders, fog overlay.
- C-05 UI (`packages/ui`): resource bar, factory build menu, satellite sweep toggle, selection panel, battle log, victory banner. DOM only, talks over the bus.
- App shell (`apps/client`): Vite app wiring it all together.

Not built yet: C-02 asset pipeline, C-06 telemetry (1v1 network play), C-08..C-12 backend services, C-13 AI dialog and TTS.

## Run it

```
npm install
npm test          # 56 tests: determinism, physics sanity, economy, combat, UI
npm run dev       # then open the printed URL, you play vs the overlord AI
npm run build     # static bundle, CDN-ready
```

Controls: left-click select (shift adds), right-click move / attack / mine, WASD or arrows pan, wheel zoom, satellite sweep via the toggle then click the map. URL params: `?seed=123&difficulty=easy|normal|hard`.

## Stack

- Client: three.js r185 (WebGPU renderer, WebGL2 fallback), TypeScript, Vite, static files servable from a CDN.
- Tests: Vitest, Testing Library (jsdom) for UI panels.
- Telemetry and match transport: plain WebSocket next, isolated behind its own contract.
- Backend: serverless functions plus a small database for accounts, store, wallet, leaderboard (not started).
