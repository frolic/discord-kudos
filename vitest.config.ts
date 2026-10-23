import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // discord-api-types is CommonJS; prebundle it so workerd can import it.
    deps: { optimizer: { ssr: { enabled: true, include: ["discord-api-types/v10"] } } },
  },
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.test.jsonc" } })],
});
