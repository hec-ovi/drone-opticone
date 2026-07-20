import '@fontsource/rajdhani/500.css'
import '@fontsource/rajdhani/600.css'
import '@fontsource/rajdhani/700.css'
import '@fontsource/share-tech-mono'
import { Bus, SIM_SPEED, TICK_RATE, type ClientTopics } from '@opticone/shared'
import { generateThumbnails, mountScene } from '@opticone/scene'
import { getCatalog } from '@opticone/registry'
import { mountUI } from '@opticone/ui'
import { GameShell } from './shell'
import { SoundEngine } from './sound'

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement
  const uiRoot = document.getElementById('ui') as HTMLElement

  const bus = new Bus<ClientTopics>()
  const scene = await mountScene(canvas)
  mountUI(uiRoot, bus)

  const sound = new SoundEngine()
  const wake = () => sound.resume()
  window.addEventListener('pointerdown', wake, { once: true })
  window.addEventListener('keydown', wake, { once: true })

  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31)
  const difficulty = (params.get('difficulty') as 'easy' | 'normal' | 'hard') || 'normal'
  const shell = new GameShell(bus, scene, seed, difficulty, sound)

  // Terrain and base visible behind the start menu; the match itself waits
  // for the Deploy button (intent:startMatch).
  shell.publishView()

  // Rendered model thumbnails for the UI (C-04 -> bus -> C-05).
  void generateThumbnails(getCatalog()).then((thumbs) => bus.emit('thumbnails', thumbs))

  // SIM_SPEED sim-seconds per wall second: real-spec physics, playable pace.
  // Fixed-timestep accumulator so a starved timer catches up instead of
  // silently slowing the game down.
  const STEP_MS = 1000 / (TICK_RATE * SIM_SPEED)
  const MAX_CATCHUP_STEPS = 12
  let last = performance.now()
  let acc = 0
  setInterval(() => {
    const now = performance.now()
    acc += now - last
    last = now
    if (!shell.running) {
      acc = 0
      return
    }
    let steps = 0
    while (acc >= STEP_MS && steps < MAX_CATCHUP_STEPS) {
      shell.step()
      acc -= STEP_MS
      steps++
    }
    if (steps === MAX_CATCHUP_STEPS) acc = 0 // machine cannot keep up; drop the backlog
  }, STEP_MS)
}

void boot()
