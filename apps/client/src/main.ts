import '@fontsource/rajdhani/500.css'
import '@fontsource/rajdhani/600.css'
import '@fontsource/rajdhani/700.css'
import '@fontsource/share-tech-mono'
import { Bus, TICK_RATE, type ClientTopics } from '@opticone/shared'
import { mountScene } from '@opticone/scene'
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

  setInterval(() => {
    if (shell.running) shell.step()
  }, 1000 / TICK_RATE)
}

void boot()
