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

Contracts phase. No code yet. The whole system is split into 13 isolated contracts in [contracts.md](contracts.md), each with its own interface, so every piece (three.js scene, UI, sim core, telemetry, store, wallet, backend) can be built and replaced independently.

## Stack targets

- Client: three.js r185+ (WebGPU renderer, WebGL fallback), static files served from a CDN.
- Telemetry and match transport: plain WebSocket for now, isolated behind its own contract.
- Backend: serverless functions plus a small database for accounts, store, wallet, leaderboard.
