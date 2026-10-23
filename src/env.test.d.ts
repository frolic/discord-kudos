import type { Kudos } from "./kudos.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      KUDOS: DurableObjectNamespace<Kudos>;
      DISCORD_PUBLIC_KEY: string;
      DISCORD_BOT_TOKEN: string;
    }
  }
}
