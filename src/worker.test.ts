import { afterEach, describe, expect, it, vi } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionType,
  type APIInteractionResponseChannelMessageWithSource,
} from "discord-api-types/v10";
import worker from "./worker.ts";

// Private half of the test keypair in wrangler.test.jsonc (PKCS#8, hex).
const PRIVATE_KEY =
  "302e020100300506032b657004220420a9c9f0572ab7fc6ec05eab0a76115ed2d7f5579dd7e41a3c6e81dc32b40993ee";
const toHex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (s: string) => Uint8Array.from(s.match(/../g)!, (b) => parseInt(b, 16));

/** The parts of a Discord interaction payload the worker reads. */
interface TestInteraction {
  type: InteractionType;
  guild_id?: string;
  channel?: { id: string };
  member?: { user: { id: string } };
  data?: {
    type: ApplicationCommandType;
    name: string;
    options: Opt[];
    resolved: { users: Record<string, { id: string; bot: boolean }> };
  };
}

async function send(body: TestInteraction, sign = true) {
  const text = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = new Headers({ "X-Signature-Timestamp": timestamp });
  if (sign) {
    const key = await crypto.subtle.importKey("pkcs8", fromHex(PRIVATE_KEY), "Ed25519", false, [
      "sign",
    ]);
    const sig = await crypto.subtle.sign(
      "Ed25519",
      key,
      new TextEncoder().encode(timestamp + text),
    );
    headers.set("X-Signature-Ed25519", toHex(sig));
  }
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request("https://kudos.test/", { method: "POST", headers, body: text }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

type Opt = { name: string; type: ApplicationCommandOptionType; value: string };
const user = (name: string, value: string): Opt => ({
  name,
  type: ApplicationCommandOptionType.User,
  value,
});
const str = (name: string, value: string): Opt => ({
  name,
  type: ApplicationCommandOptionType.String,
  value,
});
const chan = (name: string, value: string): Opt => ({
  name,
  type: ApplicationCommandOptionType.Channel,
  value,
});

async function command(
  guild: string,
  from: string,
  name: string,
  options: Opt[] = [],
  bots: string[] = [],
) {
  const res = await send({
    type: InteractionType.ApplicationCommand,
    guild_id: guild,
    channel: { id: "general" },
    member: { user: { id: from } },
    data: {
      type: ApplicationCommandType.ChatInput,
      name,
      options,
      resolved: { users: Object.fromEntries(bots.map((id) => [id, { id, bot: true }])) },
    },
  });
  expect(res.status).toBe(200);
  return (await res.json<APIInteractionResponseChannelMessageWithSource>()).data;
}

afterEach(() => vi.restoreAllMocks());

describe("interactions endpoint", () => {
  it("rejects unsigned requests and answers pings", async () => {
    expect((await send({ type: InteractionType.Ping }, false)).status).toBe(401);
    const res = await send({ type: InteractionType.Ping });
    expect(await res.json()).toEqual({ type: 1 });
  });
});

describe("/kudos", () => {
  it("counts per user per server and pings only the receiver", async () => {
    const first = await command("g1", "alice", "kudos", [
      user("user", "bob"),
      str("reason", "shipped it"),
    ]);
    expect(first.content).toBe("Kudos to <@bob> from <@alice> 🙏 (1 total)\n> shipped it");
    expect(first.allowed_mentions).toEqual({ users: ["bob"] });

    const second = await command("g1", "carol", "kudos", [
      user("user", "bob"),
      str("reason", "reviews"),
    ]);
    expect(second.content).toContain("(2 total)");

    const otherServer = await command("g2", "carol", "kudos", [
      user("user", "bob"),
      str("reason", "hi"),
    ]);
    expect(otherServer.content).toContain("(1 total)");
  });

  it("refuses self and bot kudos", async () => {
    const self = await command("g3", "alice", "kudos", [
      user("user", "alice"),
      str("reason", "me"),
    ]);
    expect(self.content).toMatch(/yourself/);
    expect(self.flags).toBe(64);

    const bot = await command(
      "g3",
      "alice",
      "kudos",
      [user("user", "robo"), str("reason", "beep")],
      ["robo"],
    );
    expect(bot.content).toMatch(/Bots/);
    const { n } = (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM kudos WHERE guild_id = 'g3'",
    ).first<{ n: number }>())!;
    expect(n).toBe(0);
  });

  it("broadcasts to the kudos channel once one is set", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    const set = await command("g4", "admin", "kudos-channel", [chan("channel", "shoutouts")]);
    expect(set.content).toContain("<#shoutouts>");
    expect(fetch).toHaveBeenCalledTimes(1); // the test post

    await command("g4", "alice", "kudos", [user("user", "bob"), str("reason", "pairing")]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1]!;
    expect(String(url)).toBe("https://discord.com/api/v10/channels/shoutouts/messages");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bot test-token");
    const body = JSON.parse(String(init?.body));
    expect(body.content).toContain("pairing");
    expect(body.allowed_mentions).toEqual({ parse: [] });

    await command("g4", "admin", "kudos-channel");
    await command("g4", "alice", "kudos", [user("user", "bob"), str("reason", "again")]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("won't set a kudos channel the bot can't post in", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Missing Access", { status: 403 }),
    );
    const res = await command("g5", "admin", "kudos-channel", [chan("channel", "locked")]);
    expect(res.content).toMatch(/can't post/);
    expect(await env.DB.prepare("SELECT * FROM guilds WHERE guild_id = 'g5'").first()).toBeNull();
  });
});

describe("/leaderboard and /kudos-history", () => {
  it("ranks by kudos received and lists recent reasons", async () => {
    for (const [to, reason] of [
      ["bob", "a"],
      ["bob", "b"],
      ["dan", "c"],
    ] as const) {
      await command("g6", "alice", "kudos", [user("user", to), str("reason", reason)]);
    }
    // An old kudos only counts toward all time.
    await env.DB.prepare(
      "INSERT INTO kudos (guild_id, channel_id, from_user, to_user, reason, created_at) VALUES ('g6', 'c', 'x', 'eve', 'old', 0)",
    ).run();

    const all = await command("g6", "alice", "leaderboard");
    expect(all.content).toBe(
      "**Kudos leaderboard of all time**\n1. <@bob> · 2 kudos\n2. <@dan> · 1 kudos\n3. <@eve> · 1 kudos",
    );
    expect(all.allowed_mentions).toEqual({ parse: [] });

    const week = await command("g6", "alice", "leaderboard", [str("period", "week")]);
    expect(week.content).not.toContain("eve");

    const history = await command("g6", "alice", "kudos-history", [user("user", "bob")]);
    expect(history.flags).toBe(64);
    expect(history.content).toMatch(/^<@bob> has 2 kudos\. Most recent:\n- b \(from <@alice>/);

    const empty = await command("g6", "zed", "kudos-history");
    expect(empty.content).toBe("<@zed> has no kudos yet.");
  });
});
