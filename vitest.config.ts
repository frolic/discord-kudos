import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // discord-api-types ships CommonJS behind a thin ESM wrapper; prebundle it
    // so the Workers module runner sees its named exports.
    deps: { optimizer: { ssr: { enabled: true, include: ["discord-api-types/v10"] } } },
  },
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.test.jsonc" } })],
});
