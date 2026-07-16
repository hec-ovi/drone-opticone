import { Bus, TICK_RATE, type ClientTopics } from '@opticone/shared'
import { mountScene } from '@opticone/scene'
import { mountUI } from '@opticone/ui'
import { GameShell } from './shell'

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement
  const uiRoot = document.getElementById('ui') as HTMLElement

  const bus = new Bus<ClientTopics>()
  const scene = await mountScene(canvas)
  mountUI(uiRoot, bus)

  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31)
  const difficulty = (params.get('difficulty') as 'easy' | 'normal' | 'hard') || 'normal'
  const shell = new GameShell(bus, scene, seed, difficulty)

  setInterval(() => shell.step(), 1000 / TICK_RATE)
}

void boot()
