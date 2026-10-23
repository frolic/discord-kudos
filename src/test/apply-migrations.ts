import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      DISCORD_PUBLIC_KEY: string;
      DISCORD_BOT_TOKEN: string;
      TEST_MIGRATIONS?: D1Migration[];
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS!);
