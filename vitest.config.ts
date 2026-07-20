import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/{shared,registry,sim-core,agents,scene}/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.dom.ts'],
          include: ['packages/ui/test/**/*.test.ts', 'apps/client/test/**/*.test.ts'],
        },
      },
    ],
  },
})
