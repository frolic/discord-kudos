import type { KudosServer } from "./server.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      KUDOS: DurableObjectNamespace<KudosServer>;
      DISCORD_PUBLIC_KEY: string;
      DISCORD_BOT_TOKEN: string;
    }
  }
}
