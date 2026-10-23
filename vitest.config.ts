import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // discord-api-types is CommonJS; prebundle it so workerd can import it.
    deps: { optimizer: { ssr: { enabled: true, include: ["discord-api-types/v10"] } } },
  },
  plugins: [
    cloudflareTest({
      main: "./src/worker.ts",
      miniflare: {
        compatibilityDate: "2026-05-01",
        durableObjects: { KUDOS: { className: "Kudos", useSQLite: true } },
        bindings: {
          // The private key is in src/worker.test.ts.
          DISCORD_PUBLIC_KEY: "ffc89ef05be8b4a183614377b7a07efce98f6ae1e4f1d7db33302c9056bf5ee7",
          DISCORD_BOT_TOKEN: "test-token",
        },
      },
    }),
  ],
});
