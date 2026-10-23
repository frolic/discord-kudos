import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createExecutionContext,
  runInDurableObject,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionType,
  type APIApplicationCommandAutocompleteResponse,
  type APIInteractionResponseChannelMessageWithSource,
} from "discord-api-types/v10";
import worker from "./worker.ts";
import type { KudosEnv } from "../alchemy.run.ts";

declare global {
  namespace Cloudflare {
    interface Env extends KudosEnv {}
  }
}

// Private key for DISCORD_PUBLIC_KEY in wrangler.test.jsonc.
const PRIVATE_KEY =
  "302e020100300506032b657004220420a9c9f0572ab7fc6ec05eab0a76115ed2d7f5579dd7e41a3c6e81dc32b40993ee";
const toHex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (s: string) => Uint8Array.from(s.match(/../g)!, (b) => parseInt(b, 16));

interface TestInteraction {
  type: InteractionType;
  guild_id?: string;
  channel?: { id: string };
  member?: { user: { id: string } };
  data?: {
    type: ApplicationCommandType;
    name: string;
    options: Opt[];
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

type Opt = { name: string; type: ApplicationCommandOptionType; value: string; focused?: boolean };
// A member picked from autocomplete arrives as a mention.
const user = (name: string, id: string): Opt => ({
  name,
  type: ApplicationCommandOptionType.String,
  value: `<@${id}>`,
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

async function command(guild: string, from: string, name: string, options: Opt[] = []) {
  const res = await send({
    type: InteractionType.ApplicationCommand,
    guild_id: guild,
    channel: { id: "general" },
    member: { user: { id: from } },
    data: {
      type: ApplicationCommandType.ChatInput,
      name,
      options,
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
    const first = await command("g1", "101", "kudos", [
      user("user", "102"),
      str("reason", "shipped it"),
    ]);
    expect(first.content).toBe("Kudos to <@102> from <@101> 🙏 (1 total)\n> shipped it");
    expect(first.allowed_mentions).toEqual({ users: ["102"] });

    const second = await command("g1", "103", "kudos", [
      user("user", "102"),
      str("reason", "reviews"),
    ]);
    expect(second.content).toContain("(2 total)");

    const otherServer = await command("g2", "103", "kudos", [
      user("user", "102"),
      str("reason", "hi"),
    ]);
    expect(otherServer.content).toContain("(1 total)");
  });

  it("refuses self kudos", async () => {
    const self = await command("g3", "101", "kudos", [user("user", "101"), str("reason", "me")]);
    expect(self.content).toMatch(/yourself/);
    expect(self.flags).toBe(64);
  });

  it("also posts to the kudos channel once one is set", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    const set = await command("g4", "108", "kudos-channel", [chan("channel", "shoutouts")]);
    expect(set.content).toContain("<#shoutouts>");
    expect(fetch).toHaveBeenCalledTimes(1); // the test post

    await command("g4", "101", "kudos", [user("user", "102"), str("reason", "pairing")]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1]!;
    expect(String(url)).toBe("https://discord.com/api/v10/channels/shoutouts/messages");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bot test-token");
    const body = JSON.parse(String(init?.body));
    expect(body.content).toContain("pairing");
    expect(body.allowed_mentions).toEqual({ parse: [] });

    await command("g4", "108", "kudos-channel");
    await command("g4", "101", "kudos", [user("user", "102"), str("reason", "again")]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("won't set a kudos channel the bot can't post in", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("Missing Access", { status: 403 }));
    const res = await command("g5", "108", "kudos-channel", [chan("channel", "locked")]);
    expect(res.content).toMatch(/can't post/);
    // Nothing was saved, so nothing else is posted.
    await command("g5", "101", "kudos", [user("user", "102"), str("reason", "hi")]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("/leaderboard and /kudos-history", () => {
  it("ranks by kudos received and lists recent reasons", async () => {
    for (const [to, reason] of [
      ["102", "a"],
      ["102", "b"],
      ["104", "c"],
    ] as const) {
      await command("g6", "101", "kudos", [user("user", to), str("reason", reason)]);
    }
    // An old kudos only counts toward all time.
    await runInDurableObject(env.KUDOS.getByName("g6"), (_server, state) => {
      state.storage.sql.exec(
        "INSERT INTO kudos (channel_id, from_user, to_user, reason, created_at) VALUES ('c', '110', '<@105>', 'old', 0)",
      );
    });

    const all = await command("g6", "101", "leaderboard");
    expect(all.content).toBe(
      "**Kudos leaderboard of all time**\n1. <@102> · 2 kudos\n2. <@104> · 1 kudos\n3. <@105> · 1 kudos",
    );
    expect(all.allowed_mentions).toEqual({ parse: [] });

    const week = await command("g6", "101", "leaderboard", [str("period", "week")]);
    expect(week.content).not.toContain("105");

    const history = await command("g6", "101", "kudos-history", [user("user", "102")]);
    expect(history.flags).toBe(64);
    expect(history.content).toMatch(/^<@102> has 2 kudos\. Most recent:\n- b \(from <@101>/);

    const empty = await command("g6", "107", "kudos-history");
    expect(empty.content).toBe("<@107> has no kudos yet.");
  });
});

describe("free-text names", () => {
  it("counts any name case-insensitively and pings nobody", async () => {
    const first = await command("g7", "101", "kudos", [
      str("user", "the ops team"),
      str("reason", "uptime"),
    ]);
    expect(first.content).toBe("Kudos to the ops team from <@101> 🙏 (1 total)\n> uptime");
    expect(first.allowed_mentions).toEqual({ users: [] });

    const second = await command("g7", "102", "kudos", [
      str("user", "  The  Ops Team "),
      str("reason", "again"),
    ]);
    expect(second.content).toContain("(2 total)");

    const history = await command("g7", "101", "kudos-history", [str("user", "the ops team")]);
    expect(history.content).toMatch(/has 2 kudos/);
  });
});

describe("autocomplete", () => {
  async function suggest(guild: string, typed: string) {
    const res = await send({
      type: InteractionType.ApplicationCommandAutocomplete,
      guild_id: guild,
      channel: { id: "general" },
      member: { user: { id: "101" } },
      data: {
        type: ApplicationCommandType.ChatInput,
        name: "kudos",
        options: [{ ...str("user", typed), focused: true }],
      },
    });
    return (await res.json<APIApplicationCommandAutocompleteResponse>()).data.choices;
  }

  it("suggests members, then past recipients, then the typed text", async () => {
    await command("g8", "101", "kudos", [str("user", "Pizza Friday"), str("reason", "yum")]);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        Response.json([{ nick: "Pat", user: { id: "120", username: "pat", global_name: null } }]),
      );

    expect(await suggest("g8", "p")).toEqual([
      { name: "Pat", value: "<@120>" },
      { name: "Pizza Friday", value: "Pizza Friday" },
      { name: "p", value: "p" },
    ]);
    expect(String(fetch.mock.calls[0]![0])).toBe(
      "https://discord.com/api/v10/guilds/g8/members/search?query=p&limit=10",
    );

    // Once thanked, a member is suggested by name with nothing typed.
    await command("g8", "101", "kudos", [user("user", "120"), str("reason", "help")]);
    expect(await suggest("g8", "")).toEqual([
      { name: "Pat", value: "<@120>" },
      { name: "Pizza Friday", value: "Pizza Friday" },
    ]);
  });
});
