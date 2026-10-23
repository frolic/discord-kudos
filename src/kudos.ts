import {
  ApplicationCommandOptionType,
  type APIChatInputApplicationCommandGuildInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { KudosEnv } from "../alchemy.run.ts";
import { postMessage, reply } from "./discord.ts";

type Interaction = APIChatInputApplicationCommandGuildInteraction;
type Handler = (
  interaction: Interaction,
  env: KudosEnv,
  ctx: ExecutionContext,
) => Promise<APIInteractionResponse>;

interface Count {
  n: number;
}
interface GuildSettings {
  kudos_channel_id: string | null;
}
interface Ranked {
  to_user: string;
  n: number;
}
interface Received {
  from_user: string;
  reason: string;
  created_at: number;
}

/** A string, user, or channel option's value (users and channels arrive as ids). */
function option(interaction: Interaction, name: string): string | undefined {
  for (const o of interaction.data.options ?? []) {
    if (o.name !== name) continue;
    if (
      o.type === ApplicationCommandOptionType.String ||
      o.type === ApplicationCommandOptionType.User ||
      o.type === ApplicationCommandOptionType.Channel
    ) {
      return o.value;
    }
  }
  return undefined;
}

const PERIODS = {
  week: { seconds: 7 * 86400, label: "in the last 7 days" },
  month: { seconds: 30 * 86400, label: "in the last 30 days" },
  all: { seconds: Infinity, label: "of all time" },
} as const;
const isPeriod = (value: string): value is keyof typeof PERIODS => Object.hasOwn(PERIODS, value);

const countReceived = (env: KudosEnv, guild: string, user: string) =>
  env.DB.prepare("SELECT COUNT(*) AS n FROM kudos WHERE guild_id = ?1 AND to_user = ?2")
    .bind(guild, user)
    .first<Count>()
    .then((row) => row?.n ?? 0);

const give: Handler = async (interaction, env, ctx) => {
  const guild = interaction.guild_id;
  const channel = interaction.channel.id;
  const from = interaction.member.user.id;
  const to = option(interaction, "user");
  const reason = option(interaction, "reason");

  if (!to || !reason) return reply("Who, and what for?", { ephemeral: true });
  if (to === from) return reply("You can't give yourself kudos.", { ephemeral: true });
  if (interaction.data.resolved?.users?.[to]?.bot) {
    return reply("Bots don't collect kudos.", { ephemeral: true });
  }

  await env.DB.prepare(
    "INSERT INTO kudos (guild_id, channel_id, from_user, to_user, reason) VALUES (?1, ?2, ?3, ?4, ?5)",
  )
    .bind(guild, channel, from, to, reason)
    .run();
  const [total, settings] = await Promise.all([
    countReceived(env, guild, to),
    env.DB.prepare("SELECT kudos_channel_id FROM guilds WHERE guild_id = ?1")
      .bind(guild)
      .first<GuildSettings>(),
  ]);

  const content = `Kudos to <@${to}> from <@${from}> 🙏 (${total} total)\n> ${reason}`;
  const kudosChannel = settings?.kudos_channel_id;
  if (kudosChannel && kudosChannel !== channel) {
    ctx.waitUntil(
      postMessage(env.DISCORD_BOT_TOKEN, kudosChannel, `${content}\nin <#${channel}>`).catch((e) =>
        console.error("[kudos] broadcast failed", e),
      ),
    );
  }
  return reply(content, { mentions: { users: [to] } });
};

const leaderboard: Handler = async (interaction, env) => {
  const requested = option(interaction, "period") ?? "all";
  const period = PERIODS[isPeriod(requested) ? requested : "all"];
  const since = Number.isFinite(period.seconds)
    ? Math.floor(Date.now() / 1000) - period.seconds
    : 0;
  const { results } = await env.DB.prepare(
    `SELECT to_user, COUNT(*) AS n FROM kudos
     WHERE guild_id = ?1 AND created_at >= ?2
     GROUP BY to_user ORDER BY n DESC, MAX(created_at) DESC LIMIT 10`,
  )
    .bind(interaction.guild_id, since)
    .all<Ranked>();

  if (!results.length) return reply(`No kudos ${period.label} yet.`);
  const lines = results.map((r, i) => `${i + 1}. <@${r.to_user}> · ${r.n} kudos`);
  return reply(`**Kudos leaderboard ${period.label}**\n${lines.join("\n")}`);
};

const history: Handler = async (interaction, env) => {
  const guild = interaction.guild_id;
  const user = option(interaction, "user") ?? interaction.member.user.id;
  const [total, { results }] = await Promise.all([
    countReceived(env, guild, user),
    env.DB.prepare(
      `SELECT from_user, reason, created_at FROM kudos
       WHERE guild_id = ?1 AND to_user = ?2 ORDER BY id DESC LIMIT 5`,
    )
      .bind(guild, user)
      .all<Received>(),
  ]);
  if (!total) return reply(`<@${user}> has no kudos yet.`, { ephemeral: true });

  const lines = results.map((r) => `- ${r.reason} (from <@${r.from_user}>, <t:${r.created_at}:R>)`);
  return reply(`<@${user}> has ${total} kudos. Most recent:\n${lines.join("\n")}`, {
    ephemeral: true,
  });
};

const setChannel: Handler = async (interaction, env) => {
  const channel = option(interaction, "channel") ?? null;
  if (channel) {
    // Post first, so a channel the bot can't write to is caught now rather
    // than silently on every kudos.
    try {
      await postMessage(env.DISCORD_BOT_TOKEN, channel, "Kudos will be posted here. 🙏");
    } catch (e) {
      console.error("[kudos-channel] test post failed", e);
      return reply(
        `I can't post in <#${channel}>. Give me View Channel and Send Messages there, then try again.`,
        { ephemeral: true },
      );
    }
  }
  await env.DB.prepare(
    `INSERT INTO guilds (guild_id, kudos_channel_id) VALUES (?1, ?2)
     ON CONFLICT (guild_id) DO UPDATE SET kudos_channel_id = excluded.kudos_channel_id`,
  )
    .bind(interaction.guild_id, channel)
    .run();
  return reply(
    channel ? `Every kudos will also be posted in <#${channel}>.` : "Kudos channel turned off.",
    { ephemeral: true },
  );
};

/** One handler per slash command in commands.ts. */
export const handlers = {
  kudos: give,
  leaderboard,
  "kudos-history": history,
  "kudos-channel": setChannel,
} satisfies Record<string, Handler>;

export const isCommand = (name: string): name is keyof typeof handlers =>
  Object.hasOwn(handlers, name);
