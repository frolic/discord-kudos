import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import type { KudosServer } from "./src/server.ts";

// Prod only: a Discord app has a single interactions endpoint, so previews
// would never receive traffic.
const Worker = Cloudflare.Worker("KudosWorker", {
  name: "kudos",
  main: "./src/worker.ts",
  env: {
    // One SQLite-backed Durable Object per Discord server (src/server.ts).
    KUDOS: Cloudflare.DurableObject<KudosServer>("KudosServer"),
    DISCORD_PUBLIC_KEY: Config.string("DISCORD_PUBLIC_KEY"),
    DISCORD_BOT_TOKEN: Config.redacted("DISCORD_BOT_TOKEN"),
  },
});

/** Typed env for the worker, inferred from the Worker's config. */
export type KudosEnv = Cloudflare.InferEnv<typeof Worker>;

export default Alchemy.Stack(
  "Kudos",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const worker = yield* Worker;
    // Paste this into the Discord app's "Interactions endpoint URL".
    return { url: worker.url.as<string>() };
  }),
);
