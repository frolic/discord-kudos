import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import type { Kudos } from "./src/kudos.ts";

const Worker = Cloudflare.Worker("Kudos", {
  name: "kudos",
  main: "./src/worker.ts",
  env: {
    KUDOS: Cloudflare.DurableObject<Kudos>("Kudos"),
    DISCORD_PUBLIC_KEY: Config.String("DISCORD_PUBLIC_KEY"),
    DISCORD_BOT_TOKEN: Config.Redacted("DISCORD_BOT_TOKEN"),
  },
});

export type KudosEnv = Cloudflare.InferEnv<typeof Worker>;

export default Alchemy.Stack(
  "Kudos",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const worker = yield* Worker;
    return { url: worker.url.as<string>() };
  }),
);
