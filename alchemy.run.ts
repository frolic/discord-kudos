import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

// The resolved D1 database resource (what `yield*`ing the callable produces).
type Database =
  ReturnType<typeof Cloudflare.D1.Database> extends Effect.Effect<infer A, infer _E, infer _R>
    ? A
    : never;

// Prod only: a Discord app has a single interactions endpoint, so previews
// would never receive traffic.
const makeWorker = (db: Database) =>
  Cloudflare.Worker("KudosWorker", {
    name: "kudos",
    main: "./src/worker.ts",
    env: {
      DB: db,
      DISCORD_PUBLIC_KEY: Config.string("DISCORD_PUBLIC_KEY"),
      DISCORD_BOT_TOKEN: Config.redacted("DISCORD_BOT_TOKEN"),
    },
  });

/** Typed env for the worker, inferred from the Worker's config. */
export type KudosEnv = Cloudflare.InferEnv<ReturnType<typeof makeWorker>>;

export default Alchemy.Stack(
  "Kudos",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.Database("KudosDB", { migrations: "./migrations" });
    const worker = yield* makeWorker(db);

    return {
      // Paste this into the Discord app's "Interactions endpoint URL".
      url: worker.url.as<string>(),
      databaseName: db.databaseName,
    };
  }),
);
