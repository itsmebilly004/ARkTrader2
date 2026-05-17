// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const here = path.dirname(fileURLToPath(import.meta.url));
const shim = (rel: string) => path.resolve(here, "src/external/shims", rel);

export default defineConfig({
  cloudflare: false,
  vite: {
    resolve: {
      // NOTE: Vite resolves aliases top-to-bottom; specific patterns MUST come before
      // the generic `@` alias supplied by @lovable.dev/vite-tanstack-config.
      alias: [
        { find: /^@deriv-com\/translations$/, replacement: shim("translations.tsx") },
        { find: /^@deriv-com\/ui$/, replacement: shim("ui.tsx") },
        { find: /^@\/components\/shared$/, replacement: shim("deriv-shared.ts") },
        { find: /^@\/components\/bot-notification\/bot-notification$/, replacement: shim("bot-notification.tsx") },
        { find: /^@\/components\/bot-notification\/bot-notification-utils$/, replacement: shim("bot-notification-utils.ts") },
      ],
    },
    ssr: {
      // Keep ws as a runtime require() — its native deps (node:net, node:tls)
      // can't be statically bundled by Rollup.
      external: ["ws"],
    },
  },
});
