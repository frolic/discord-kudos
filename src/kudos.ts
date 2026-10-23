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

/** This server's Durable Object: all of its kudos and settings live there. */
const server = (interaction: Interaction, env: KudosEnv) =>
  env.KUDOS.getByName(interaction.guild_id);

const give: Handler = async (interaction, env, ctx) => {
  const channel = interaction.channel.id;
  const from = interaction.member.user.id;
  const to = option(interaction, "user");
  const reason = option(interaction, "reason");

  if (!to || !reason) return reply("Who, and what for?", { ephemeral: true });
  if (to === from) return reply("You can't give yourself kudos.", { ephemeral: true });

  const { total, kudosChannel } = await server(interaction, env).give({
    channel,
    from,
    to,
    reason,
  });

  const content = `Kudos to <@${to}> from <@${from}> 🙏 (${total} total)\n> ${reason}`;
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
  const results = await server(interaction, env).leaderboard(since);

  if (!results.length) return reply(`No kudos ${period.label} yet.`);
  const lines = results.map((r, i) => `${i + 1}. <@${r.to_user}> · ${r.n} kudos`);
  return reply(`**Kudos leaderboard ${period.label}**\n${lines.join("\n")}`);
};

const history: Handler = async (interaction, env) => {
  const user = option(interaction, "user") ?? interaction.member.user.id;
  const { total, recent } = await server(interaction, env).history(user);
  if (!total) return reply(`<@${user}> has no kudos yet.`, { ephemeral: true });

  const lines = recent.map((r) => `- ${r.reason} (from <@${r.from_user}>, <t:${r.created_at}:R>)`);
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
  await server(interaction, env).setKudosChannel(channel);
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
