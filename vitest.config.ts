import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // The component tests do ~1s of real work each, but jsdom workers running
    // in parallel stretch that four- to fivefold on a loaded machine. Against
    // the 5s default that made NotificationCenterTab fail in a full run and
    // pass on its own -- a timeout, never a wrong assertion. The budget is
    // raised rather than the tests trimmed, since the work they do is the
    // point; a genuinely hung test still fails, just later.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // date-fns ships ~1,500 single-function files, and parallel jsdom workers
    // resolving them at once make Windows return UNKNOWN/lstat errors for
    // files that are plainly there -- a different file each run, always inside
    // node_modules, never in our own code. Pre-bundling it collapses those
    // thousands of reads into one.
    deps: {
      optimizer: {
        web: { enabled: true, include: ["date-fns"] },
      },
    },
    // Pre-bundling cut the reads but did not stop them colliding: files still
    // failed to load, a different one each run. Capping the workers bounds how
    // many of them touch node_modules at once, which is the thing Windows
    // cannot take. Slower than an unbounded pool, and it actually finishes.
    poolOptions: {
      threads: { maxThreads: 4, minThreads: 1 },
    },
  },
});
