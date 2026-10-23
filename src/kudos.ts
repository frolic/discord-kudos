import {
  ApplicationCommandOptionType,
  InteractionResponseType,
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandAutocompleteResponse,
  type APIChatInputApplicationCommandGuildInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { KudosEnv } from "../alchemy.run.ts";
import { postMessage, reply, searchMembers } from "./discord.ts";

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

/**
 * Who a `user` option names: a member (picked from autocomplete, or a pasted
 * mention) becomes their mention `<@id>`; anything else is a name, as typed.
 */
export function recipient(raw: string) {
  const mention = /^<@!?(\d+)>$/.exec(raw.trim());
  if (mention) return { token: `<@${mention[1]}>`, userId: mention[1] };
  return { token: raw.trim().replace(/\s+/g, " "), userId: undefined };
}

const give: Handler = async (interaction, env, ctx) => {
  const channel = interaction.channel.id;
  const from = interaction.member.user.id;
  const to = recipient(option(interaction, "user") ?? "");
  const reason = option(interaction, "reason");

  if (!to.token || !reason) return reply("Who, and what for?", { ephemeral: true });
  if (to.userId === from) return reply("You can't give yourself kudos.", { ephemeral: true });

  const { total, kudosChannel } = await server(interaction, env).give({
    channel,
    from,
    to: to.token,
    reason,
  });

  const content = `Kudos to ${to.token} from <@${from}> 🙏 (${total} total)\n> ${reason}`;
  if (kudosChannel && kudosChannel !== channel) {
    ctx.waitUntil(
      postMessage(env.DISCORD_BOT_TOKEN, kudosChannel, `${content}\nin <#${channel}>`).catch((e) =>
        console.error("[kudos] broadcast failed", e),
      ),
    );
  }
  return reply(content, { mentions: { users: to.userId ? [to.userId] : [] } });
};

const leaderboard: Handler = async (interaction, env) => {
  const requested = option(interaction, "period") ?? "all";
  const period = PERIODS[isPeriod(requested) ? requested : "all"];
  const since = Number.isFinite(period.seconds)
    ? Math.floor(Date.now() / 1000) - period.seconds
    : 0;
  const results = await server(interaction, env).leaderboard(since);

  if (!results.length) return reply(`No kudos ${period.label} yet.`);
  const lines = results.map((r, i) => `${i + 1}. ${r.to_user} · ${r.n} kudos`);
  return reply(`**Kudos leaderboard ${period.label}**\n${lines.join("\n")}`);
};

const history: Handler = async (interaction, env) => {
  const { token: user } = recipient(
    option(interaction, "user") ?? `<@${interaction.member.user.id}>`,
  );
  const { total, recent } = await server(interaction, env).history(user);
  if (!total) return reply(`${user} has no kudos yet.`, { ephemeral: true });

  const lines = recent.map((r) => `- ${r.reason} (from <@${r.from_user}>, <t:${r.created_at}:R>)`);
  return reply(`${user} has ${total} kudos. Most recent:\n${lines.join("\n")}`, {
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

/**
 * Suggestions for a `user` option as it's typed: matching members, then past
 * recipients, then the typed text itself, since any name is accepted.
 */
export async function suggestRecipients(
  interaction: APIApplicationCommandAutocompleteInteraction,
  env: KudosEnv,
  ctx: ExecutionContext,
): Promise<APIApplicationCommandAutocompleteResponse> {
  const guild = interaction.guild_id ?? "";
  const focused = interaction.data.options.find(
    (o) => o.type === ApplicationCommandOptionType.String && o.focused,
  );
  const typed = focused?.type === ApplicationCommandOptionType.String ? focused.value.trim() : "";
  const stub = env.KUDOS.getByName(guild);

  const [members, past] = await Promise.all([
    typed
      ? searchMembers(env.DISCORD_BOT_TOKEN, guild, typed, 10).catch((e) => {
          console.error("[autocomplete] member search failed", e);
          return [];
        })
      : [],
    stub.suggest(typed),
  ]);

  const seen = members.map((m) => ({
    token: `<@${m.user.id}>`,
    name: m.nick ?? m.user.global_name ?? m.user.username,
  }));
  if (seen.length) ctx.waitUntil(stub.rememberNames(seen));

  const choices = new Map<string, string>();
  for (const { token, name } of [...seen, ...past])
    if (!choices.has(token)) choices.set(token, name);
  if (typed && !choices.has(typed)) choices.set(typed, typed);

  return {
    type: InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: {
      choices: [...choices]
        .slice(0, 25)
        .map(([value, name]) => ({ name: name.slice(0, 100), value })),
    },
  };
}
