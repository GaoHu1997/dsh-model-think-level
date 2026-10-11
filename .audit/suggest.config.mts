import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['.audit/suggest-probe.spec.ts'],
  },
})
