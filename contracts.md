# drone-opticone contracts

Every subsystem below is a contract: a sealed box with a public interface. A box may only talk to another box through that box's published interface, never by reaching into its internals, its storage, or its DOM. Any box can be rewritten from scratch without touching the others as long as its interface holds.

## Ground rules

1. **One directory per contract.** Target layout: `packages/<contract-id>/`. A contract's package never imports another contract's package except the shared types package (`packages/shared`).
2. **Communication is messages, not calls.** Client-side boxes talk over a typed event bus (commands in, events out). Server-side boxes talk over HTTP/WebSocket APIs. All message and API schemas live in `packages/shared` and are versioned.
3. **Semver per contract.** Breaking an interface bumps the major version of that contract only.
4. **Units are SI, scale is 1:1.** Meters, kilograms, seconds, watt-hours, m/s everywhere. No unit conversion inside boxes; conversion happens only at display time in the UI contract.
5. **Determinism where it matters.** The simulation core is deterministic and headless. Everything visual or networked lives outside it.

Contract index:

| ID | Name | Runs |
|----|------|------|
| C-01 | Drone Registry | server (data) |
| C-02 | Blueprint and Asset Pipeline | server |
| C-03 | Simulation Core | client and server (headless) |
| C-04 | Game Scene (three.js) | client |
| C-05 | UI Layer | client |
| C-06 | Telemetry | client and server |
| C-07 | Agents and Overlord AI | client and server |
| C-08 | Account Service | server |
| C-09 | Store / Marketplace | server |
| C-10 | Wallet and Credits | server |
| C-11 | Matchmaking and Leaderboard | server |
| C-12 | Backend Gateway | server |
| C-13 | AI Inference (dialog and voice) | server, streamed to client |

---

## C-01 Drone Registry

The single source of truth for what a drone IS. Real-world specs only, 1:1 scale, every field sourced from public data (manufacturer spec sheets, defense publications). Player-uploaded drones enter the same registry through C-09 after validation.

**Owns:** the drone spec schema, the seed dataset, spec validation rules.

**Exposes:**
- `GET /drones` , `GET /drones/{id}` : returns `DroneSpec` records.
- `validateSpec(spec) -> {ok} | {errors[]}` : used by the store pipeline.

**DroneSpec schema (all SI, all required unless marked):**

| Field | Type | Notes |
|-------|------|-------|
| `id`, `name`, `class` | string | class: `multirotor`, `fixed-wing`, `loitering-munition`, `cargo`, `mining` |
| `massKg` | number | all-up mass |
| `dimensionsM` | {x,y,z} | bounding box, must match the GLB within 2% tolerance |
| `batteryWh` | number | null for combustion types, then `fuelKg` + `burnKgPerH` |
| `enduranceS` | number | flight time at cruise |
| `cruiseMps`, `maxMps` | number | speeds |
| `ceilingM` | number | service ceiling |
| `windLimitMps` | number | max operating wind |
| `payloadKg` | number | 0 if none |
| `controlRangeM` | number | control link range, beyond it the drone is autonomous-only |
| `costCredits` | number | derived from real unit cost |
| `sourceUrl` | string | public source for the numbers, mandatory |

**Seed set (numbers to re-verify against `sourceUrl` at ingestion):**

| Drone | Class | Mass | Speed | Endurance | Notes |
|-------|-------|------|-------|-----------|-------|
| DJI Mavic 3 class quad | multirotor | 0.895 kg | 21 m/s | ~46 min | 77 Wh battery, 12 m/s wind limit, recon |
| FPV kamikaze quad | multirotor | ~1.5 kg | ~40 m/s | ~10 min | cheap, carries small charge |
| Switchblade 300 class | loitering-munition | ~2.5 kg | 44 m/s dash | ~15 min | tube-launched small plane |
| Shahed-136 class | loitering-munition | ~200 kg | 51 m/s | long range | delta wing, combustion engine |
| Bayraktar TB2 class | fixed-wing | 700 kg MTOW | 62 m/s | ~27 h | 150 kg payload, high ceiling |
| Lithium mining drone | mining | fictional but physically consistent | | | ground effect hover, slow |
| Cargo lifter | cargo | fictional but physically consistent | | | hauls raw materials to base |

**Must not:** know about rendering, matches, prices beyond `costCredits`, or users.

---

## C-02 Blueprint and Asset Pipeline

Turns an upload into game-ready and printer-ready artifacts. This is the "friendly most common way" for user drones: one visual model plus one printable blueprint.

**Owns:** upload validation, asset conversion, asset storage layout, scale enforcement.

**Formats (checked 2026):**
- **Engine model: GLB (glTF 2.0), authored in meters, 1:1 scale.** glTF is the industry interchange standard ("the JPEG of 3D") and three.js loads it natively.
- **Print blueprint: 3MF preferred** (units and metadata embedded, current industry standard), **STL accepted** as the legacy fallback (unitless, assumed millimeters at 1:1).

**Exposes:**
- `POST /assets` : {glb, blueprint(3mf|stl), droneSpecId} -> `AssetBundle{glbUrl, blueprintUrl, thumbUrl, lodUrls[]}`
- Validation: GLB bounding box must match `DroneSpec.dimensionsM` within 2%; triangle budget per class; single mesh hierarchy; no external texture references (GLB must be self-contained); blueprint watertight check.

**Must not:** decide gameplay stats (that is C-01), render anything, know about the store or prices.

---

## C-03 Simulation Core

The authoritative game state. A headless, deterministic, fixed-tick (suggested 20 Hz) simulation that runs identically on the client (prediction, 1 vs AI offline) and on a server or host peer (1v1 authority). Pure data in, pure data out. This is the contract everything else orbits.

**Owns:** match state, physics, economy, fog of war, win conditions.

**Simulated per tick, from C-01 specs:**
- Flight envelope: mass, thrust class, cruise and max speed, service ceiling, wind vector field (drones with `windLimitMps` below current wind drift or ground).
- Battery and fuel drain as a function of speed, payload, wind; dead battery means crash where it flies.
- Ballistics for munitions: gravity, drag, release velocity inheritance; impact and collision resolution (drone vs drone, drone vs terrain, drone vs structure).
- Control range: outside `controlRangeM` of the base or a relay, a drone only executes its standing agent policy (ties into C-07).
- Economy: lithium nodes (batteries), oil nodes (plastics for airframes), refinery converts, factory consumes {lithium, plastic, credits} to spawn a drone from a `DroneSpec`.
- Structures (few, fixed set): CENTCOM base (the player), refinery, factory, relay mast, satellite uplink.
- Fog of war grid; visibility comes only from drone sensors and satellite passes. The satellite uplink structure grants a Command & Conquer style sweep: a controllable reveal window on a cooldown, powered by energy.
- Win condition: destroy the enemy CENTCOM base.

**Exposes (pure functions and messages, no I/O):**
- `createMatch(seed, mapId, players[], droneCatalog) -> MatchState`
- `tick(MatchState, Command[]) -> {MatchState, Event[]}`
- `Command`: move, patrol, attack, mine, build, assignPolicy, satelliteSweep, selfDestruct.
- `Event`: spawned, destroyed, collided, batteryLow, resourceDelta, visibilityChanged, matchEnded.
- `snapshot(MatchState, playerId) -> PlayerView` (fog-filtered view, the only thing clients may see).

**Must not:** import three.js or any DOM API, produce or consume network traffic, read the clock (`tick` receives dt implicitly by fixed step), use `Math.random` (seeded RNG passed in).

---

## C-04 Game Scene

The three.js view of a `PlayerView`. Renders, and captures raw input into `Command` messages. Nothing else.

**Owns:** rendering, cameras, terrain and unit visuals, selection and input mapping, GLB loading (from C-02 URLs), LOD.

**Stack (checked 2026):** three.js r185+, `WebGPURenderer` with automatic WebGL fallback. Ships as static JS from a CDN, no build-time server dependency.

**Exposes:**
- `mountScene(canvas, assetResolver) -> SceneHandle`
- `SceneHandle.applyView(PlayerView)` : idempotent, interpolates between snapshots.
- `SceneHandle.onCommand(cb)` : emits `Command[]` from user input.
- `SceneHandle.setOverlay(fogTexture | satelliteSweepArea)` for C-05 driven modes.

**Must not:** mutate game state, know rules (it cannot tell a legal move from an illegal one), talk to the network, own any UI chrome (menus, HUD text are C-05).

---

## C-05 UI Layer

Every interface that loads over or around the scene: HUD (resources, battery bars, minimap), build menu, satellite control panel, hangar/gallery browser, store browser, match end screen, settings. Each panel is its own isolated component; panels do not import each other.

**Owns:** all DOM, all user-facing text and unit formatting, panel lifecycle.

**Exposes:**
- `mountUI(root, bus) -> UIHandle` : panels subscribe to bus topics (`playerView`, `wallet`, `storeCatalog`, `leaderboard`, `dialog`) and publish `Command` and app intents (`openStore`, `startMatch`, `buyDrone`).

**Must not:** touch the three.js scene graph, compute game logic, call backend endpoints directly (it publishes intents; the app shell wires them to C-12).

---

## C-06 Telemetry

Isolated transport for live match data and metrics. Version 1 is deliberately tiny so the whole game ships as static files on a CDN: one plain WebSocket JavaScript module, no framework, no native deps. The interface is transport-agnostic so v2 can swap in something robust (binary protocol, QUIC, rooms infra) without touching any other box.

**Owns:** connection lifecycle, reconnect and backoff, message framing, sequence numbers, metrics batching.

**Exposes:**
- `connect(url, matchId, authToken) -> Channel`
- `Channel.send(Command[] | Ack)` , `Channel.onMessage(cb)` : delivers opponent commands or authoritative snapshots.
- `Channel.stats() -> {rttMs, dropRate}`
- `emitMetric(name, value)` : fire-and-forget gameplay metrics, batched.

**Must not:** interpret payloads (opaque envelopes only), hold game state, be imported by C-03 or C-04 directly (the app shell owns the wiring).

---

## C-07 Agents and Overlord AI

Swarm agentic control plus the computer opponent. Players do not micro individual drones; they assign policies to groups. Outside control range (C-03) the policy is all a drone has.

**Owns:** agent policy definitions, swarm coordination (formation, spacing, target allocation), the 1 vs AI opponent overlord, game theory layer (bluffing with cheap decoys, resource denial, bet-aware risk profiles).

**Exposes:**
- `PolicySpec` catalog: `patrolArea`, `escort`, `huntClass(class)`, `mineNode`, `kamikazeOn(trigger)`, `returnAtBatteryPct(n)`.
- `evaluatePolicies(PlayerView, assignments) -> Command[]` : pure, runs inside the tick loop budget.
- `OverlordAI.act(PlayerView, difficulty) -> Command[]` : the full computer opponent.

**Must not:** read unfiltered `MatchState` (agents and AI see only fog-filtered `PlayerView`, no cheating), perform I/O, call C-13 (flavor dialog is triggered by events, not by the decision code).

---

## C-08 Account Service

Who the player is and what they own. Serverless functions plus a tiny database (single-table style, e.g. one KV/D1/DynamoDB class store).

**Owns:** auth (magic link or OAuth), profile, hangar (owned drone instances with wear/loss state if a mode consumes drones), gallery (uploaded creations), settings sync.

**Exposes:** `POST /auth/*`, `GET/PUT /me`, `GET /me/hangar`, `GET /me/gallery`.

**Must not:** hold balances (C-10), hold listings (C-09), hold ratings (C-11).

---

## C-09 Store / Marketplace

Upload, list, browse, buy. The pipeline for a user drone: spec sheet -> C-01 `validateSpec` -> assets -> C-02 validation -> listing pending -> moderation flag -> live.

**Owns:** listings, search and filters (class, mass, endurance, price), moderation queue, sales records, creator attribution and royalty split on each sale.

**Exposes:** `POST /listings` (spec + assetBundle), `GET /listings?query`, `POST /listings/{id}/buy` (orchestrates: C-10 debit, C-08 hangar credit, sale record).

**Must not:** validate specs or assets itself (delegates to C-01 and C-02), move credits itself (asks C-10), bypass moderation.

---

## C-10 Wallet and Credits

Simulated blockchain, real isolation. Double-entry ledger behind a chain-shaped API so a real chain can replace the implementation later without any caller changing. Also holds match escrow: 1v1 matches may lock a bet from both wallets and pay out on the signed match result. Simulated credits only for now; the escrow interface is where real money would land later, so it stays behind this one contract.

**Owns:** addresses, balances, transactions, escrow lifecycle (lock, release, refund), faucet for new accounts.

**Exposes:**
- `POST /wallet` -> {address}, `GET /wallet/{address}` -> {balance, txs[]}
- `POST /tx` {from, to, amount, memo} -> {txId} (atomic, idempotency key required)
- `POST /escrow` {matchId, players[], amount} , `POST /escrow/{id}/settle` {signedResult}
- Every mutation is an append-only ledger entry; balances are derived, never stored as the source of truth.

**Must not:** trust any caller about outcomes (settle requires the C-11 signed result), be called by client code directly (only through C-12), mint outside the faucet rules.

---

## C-11 Matchmaking and Leaderboard

Pairs players (1v1 or 1 vs AI), issues match tickets, records results, ranks.

**Owns:** queue, Elo-style rating, seasons, leaderboard, match result signing (the authority key that C-10 escrow trusts).

**Exposes:** `POST /queue` {betAmount?}, `GET /leaderboard`, `POST /results` {matchId, winner, telemetryDigest} -> {signedResult}.

**Must not:** run simulations, touch wallets beyond passing the signed result forward.

---

## C-12 Backend Gateway

The only door. Client code calls exactly one origin; the gateway authenticates, rate-limits, and routes to C-01, C-02, C-08, C-09, C-10, C-11, C-13. Serverless, stateless.

**Owns:** session token verification, routing table, rate limits, CORS, request validation against shared schemas.

**Must not:** contain business logic, keep state beyond token cache.

---

## C-13 AI Inference (dialog and voice)

LLM and TTS presence inside the game: the player's own CENTCOM overlord speaks, taunts, reports ("lithium node depleted", "swarm two is outside control range"), the enemy AI has a personality, drones can emit chatter. Isolated so models, providers, and voices can change freely, and so the game runs fine with this box turned off (every message has a static text fallback).

**Owns:** prompt templates per persona (player overlord, enemy overlord, unit chatter), provider adapters (LLM and TTS), response cache for common lines, content filter, voice profiles.

**Exposes:**
- `POST /dialog` {persona, gameEvent, context} -> streamed text.
- `POST /speak` {persona, text} -> streamed audio (opus), plus prefetch for cached lines.
- Client side: `DialogFeed` bus topic consumed by C-05 (subtitles) and an audio sink in the app shell.

**Rules:** never set an output token, word, or length cap on LLM calls; shape responses by instructing content, not length. Latency budget: dialog is flavor, so it must never block the tick loop or the UI; everything is fire-and-forget with timeout-based fallback to static lines.

**Must not:** influence game state or agent decisions (strictly cosmetic in v1), be called from C-03 or C-07 code paths.

---

## Cross-cutting

- **`packages/shared`:** message schemas (`Command`, `Event`, `PlayerView`, `DroneSpec`, `AssetBundle`, API DTOs), the seeded RNG, unit constants. The only package every contract may import.
- **App shell:** a thin composition root (not a contract, it owns no logic) that wires C-04, C-05, C-06, C-07, C-13 audio, and C-12 calls together on the client.
- **Testing:** each contract ships its own tests against its public interface only. C-03 additionally ships determinism tests (same seed and commands, bit-identical state hash) and physics sanity tests against C-01 seed specs (a Mavic-class quad cannot fly in 15 m/s wind, a Shahed-class cannot hover).
