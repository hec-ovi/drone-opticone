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

Playable 1 vs AI game, start menu to victory screen. The system is split into 13 isolated contracts in [contracts.md](contracts.md); built so far:

- C-01 registry (`packages/registry`): 8 seed drones from public spec sheets, from a Mavic recon quad up to a jet-powered XQ-58 Valkyrie strike wing, plus validation that rejects physically impossible uploads (10..500 W/kg specific power band).
- C-03 sim core (`packages/sim-core`): deterministic 20 Hz headless tick. Wind above a drone's spec limit makes it drift uncontrolled, batteries drain at the endurance-derived wattage and a dead battery is a crash, kamikazes detonate on proximity, bombers lob ballistic munitions, miners haul lithium and oil, refineries crack oil into plastic, fog of war plus satellite sweeps, centcomm kill wins. Terrain elevation is authoritative: drones hold altitude above ground level, wind-blown drones fly into hillsides, munitions impact on the relief. Group orders fan out over a formation disc, own drones run collision avoidance instead of dying on the spawn pad, enemy midair contact is still fatal for both.
- C-07 agents (`packages/agents`): standing policies (patrol, mine, hunt, kamikaze trigger, return at low battery) that keep working outside control range, and a deterministic overlord AI opponent that builds an economy, keeps a kamikaze guard on every striker, waits out gales, and wins a full match end to end (the test proves it).
- C-04 scene (`packages/scene`): three.js r185 WebGPU renderer (WebGL2 fallback). Every airframe is a modeled, animated unit: spinning rotors with blur discs, banking into turns, hover bob, loss-of-control flutter, blob shadows. Structures live too: rotating CENTCOM radar, refinery flare burning, factory crane sliding, uplink dish tracking, pumpjacks nodding, lithium crystals pulsing. Explosions with debris and smoke, mining beams, order markers, floating health bars, satellite sweep radar rings. Terrain with generated texture, scattered rocks and shrubs, sky dome, sun shadows. RTS camera with edge pan, right-drag and grab pan, middle-drag orbit, box select, Shift+1..9 control groups. Units, buildings and resource nodes are all selectable, enemies included (intel only). Anything under 75% hull smokes through four damage states up to open flame. An offscreen studio rig renders every model once into thumbnails the UI uses everywhere. The client plays 4 sim-seconds per wall second (fixed-timestep accumulator), so the real-spec speeds feel like an RTS instead of a ferry schedule.
- C-05 UI (`packages/ui`): one command console docked at the bottom, every panel its own module. Resource strip with badges and a satellite energy bar, canvas minimap (terrain, fog, units, camera viewport, click or drag to move the camera), a unit plate showing the rendered model with scanline overlay, centered name, role tag and numeric hull (hostile plates go red), a fixed 3x3 icon-only order grid whose slots light up per unit type (stop, mine, kamikaze guard, return, hunt, clear, sweep, self-destruct) with a tooltip strip, factory build tiles showing each airframe's rendered model with role-colored frames and a specs strip (shown only while your factory is selected, RTS style; the satellite sweep is likewise an order on the uplink), build queue with progress, battle log. Start menu, victory/defeat screen, field manual.
- C-06 telemetry (`packages/telemetry`): reconnecting WebSocket channel (sequence numbers, rtt pings, batched metrics) plus a tiny room relay server that pairs two clients per match and never reads payloads. The transport behind the upcoming 1v1 mode.
- App shell (`apps/client`): Vite app wiring it all together, plus procedural WebAudio sound effects (explosions, alerts, victory sting; no audio assets) with a mute toggle.

Not built yet: 1v1 wiring on top of C-06, C-02 asset pipeline, C-08..C-12 backend services, C-13 AI dialog and TTS.

## Run it

```
npm install
npm test          # 144 tests: determinism, physics, economy, combat, UI, e2e AI match
npm run dev       # then open the printed URL, pick a difficulty, Deploy
npm run build     # static bundle, CDN-ready
```

Controls: left-click selects units, buildings or resource nodes, drag for box select (shift adds), right-click move / attack / mine, right-drag pans (also WASD, arrows, the screen edge, or hold left+right and drag), middle-drag to rotate and tilt, wheel zoom. Shift+1..9 stores a control group, 1..9 recalls it, double tap centers the camera on it. Satellite sweep arms on the tactical map, then click the field. URL params `?seed=123&difficulty=easy|normal|hard` prefill the menu.

## Stack

- Client: three.js r185 (WebGPU renderer, WebGL2 fallback), TypeScript, Vite, static files servable from a CDN. Fonts bundled via @fontsource, sounds synthesized in WebAudio, so there are no runtime asset fetches.
- Tests: Vitest, Testing Library (jsdom) for UI panels.
- Telemetry and match transport: plain WebSocket, isolated behind its own contract.
- Backend: serverless functions plus a small database for accounts, store, wallet, leaderboard (not started).
