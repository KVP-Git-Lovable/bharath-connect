// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "path";
import fs from "fs";
import type { Plugin } from "vite";

// Carried over from the Classic config: build id used by the client-side
// cache-busting / version-sync logic (src/utils/cacheVersion.ts).
const buildId = `${Date.now()}`;

function buildMetaPlugin(id: string): Plugin {
  return {
    name: "build-meta",
    writeBundle(options) {
      const outDir = options.dir || "dist";
      fs.writeFileSync(
        path.resolve(outDir, "build-meta.json"),
        JSON.stringify({ buildId: id }),
      );
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [buildMetaPlugin(buildId)],
  },
});
