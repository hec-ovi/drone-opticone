import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/{shared,registry,sim-core,agents}/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['packages/{ui,scene}/test/**/*.test.ts', 'apps/client/test/**/*.test.ts'],
        },
      },
    ],
  },
})
