# drone-opticone: 1 vs AI drone strategy game

**Play it in the browser: <https://hec-ovi.github.io/drone-opticone/>** (static build, nothing to install).

![Gameplay: base building, mining, missile defense and drone strikes](media/gameplay.gif)

![Missile defense battery intercepting a drone wave](media/missile-defense.gif)

Real-time strategy with zero humans on the battlefield: you command an AI overlord (a CENTCOM base) against another, mining lithium and oil, building drones from real-world specs and hunting the enemy base, from the start menu to the victory screen. Warcraft-style economy loop, Command & Conquer construction and satellite recon, and every unit is a real drone modeled 1:1: real mass, battery capacity, wind limits, ballistics.

## What's in the box

- **Real drone catalog** (`packages/registry`). 8 airframes from public spec sheets: Mavic 3, FPV strike quad, Switchblade 300, Shahed-136, Bayraktar TB2, XQ-58 Valkyrie, FlyCart 30 and an ore miner on Agras T40 physics. Validation rejects physically impossible specs (10..500 W/kg band).
- **Deterministic sim** (`packages/sim-core`). Headless 20 Hz tick: batteries drain at endurance-derived wattage and a dead cell is a crash, wind over an airframe's limit means storm drift (the weather mean-reverts to a 6 m/s breeze, capped at 12), ballistic munitions, terrain-authoritative flight, fog of war, satellite sweeps. Same seed, same match, on any machine.
- **A full base game.** C&C-style construction from the CENTCOM: factory, refinery, power plants, relays, satellite uplink, missile defense, market and storehouses, placed with a green/red ghost and rising over their build time. A power grid caps what runs (brownouts freeze the factory line, the refinery and satellite charge). Miners deposit at the nearest drop-off and every delivery pays credits; the market sells stockpiles at posted rates and rents out grid surplus as exported power. SAM batteries light 800 m of fog and fire homing interceptors from an auto-reloading 8-round rack, munitions first.
- **An opponent that plays** (`packages/agents`). The deterministic overlord builds its economy, rebuilds lost structures, raises power plants when browned out, stands up air defense and masses kamikaze strikes; it wins a full match end to end and the e2e test proves it. Standing policies (patrol, mine, hunt, kamikaze guard, return at low battery) keep any drone autonomous outside control range.
- **A real RTS interface** (`packages/scene`, `packages/ui`). three.js r185 WebGPU (WebGL2 fallback): animated procedural models, damage states, explosions, an offscreen rig that renders every model into the UI's thumbnails. StarCraft-style console: live unit plate with activity-colored frame and target line, per-unit order card, factory and construction tiles with need/have info cards, market panel, minimap with right-click orders and armed-sweep clicks, cursor tooltips on everything, hover rings for valid targets, fixed-width readouts so nothing shifts. The client plays 4 sim-seconds per wall second so real-spec speeds feel like an RTS.

Architecture: five sealed contracts over a typed bus, one package each, documented in [contracts.md](contracts.md).

## Run it

```
npm install
npm test          # 194 tests: determinism, physics, economy, construction, air defense, UI, e2e AI match
npm run dev       # open the printed URL, pick a difficulty, Deploy
npm run build     # static bundle, CDN-ready
```

Controls: left-click selects units, buildings or resource nodes, drag for box select (shift adds), right-click move / attack / mine, right-drag pans (also WASD, arrows, the screen edge, or hold left+right and drag), middle-drag to rotate and tilt, wheel zoom. Shift+1..9 stores a control group, 1..9 recalls it, double tap centers the camera on it. On the minimap: left-click or drag moves the camera (or fires the sweep while armed), right-click sends the selected drones there. Edge pan also works across the console: push the cursor to the physical screen edge and the map keeps scrolling. Satellite sweep is an order on the selected uplink; construction tiles live on the selected CENTCOM (click a tile, then click the field; right-click or Esc cancels). URL params `?seed=123&difficulty=easy|normal|hard` prefill the menu.

The published build lives on GitHub Pages (no CI): build locally and push the bundle to the `gh-pages` branch:

```
cd apps/client && npx vite build --base=/drone-opticone/
cd dist && touch .nojekyll && git init -b gh-pages && git add -A \
  && git commit -m "Deploy" && git push -f git@github.com:hec-ovi/drone-opticone.git gh-pages && rm -rf .git
```

## Stack

three.js r185 (WebGPU renderer, WebGL2 fallback), TypeScript, Vite. Fonts bundled via @fontsource, sound effects synthesized in WebAudio, so the built site makes zero runtime asset fetches. Tests run on Vitest, with Testing Library (jsdom) for the UI panels.
