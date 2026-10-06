import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // config/env.ts validates process.env at import time, so the variables it
    // requires must exist before any test module imports it. This used to
    // come from a developer's local `.env`, which meant a fresh checkout
    // could not run the suite. Conditional assignment only — a real env wins.
    setupFiles: ['./test/helpers/env.setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    // Run test files sequentially. RLS relies on per-async-chain context set
    // via AsyncLocalStorage; the shared Prisma client + `enterUserContext` in
    // setup make parallel file execution race on the ambient store and cause
    // intermittent policy violations. Serial tests keep the context model
    // deterministic at the (small) cost of wall-clock time.
    fileParallelism: false,
  },
});
