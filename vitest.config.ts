import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.spec.{ts,tsx}'],
    // DOM-heavy suites can exhaust memory when every logical CPU gets a worker.
    maxWorkers: 4,
  },
})
