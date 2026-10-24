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
import type { Choice } from "./kudos.ts";

type Interaction = APIChatInputApplicationCommandGuildInteraction;
type Handler = (
  interaction: Interaction,
  env: KudosEnv,
  ctx: ExecutionContext,
) => Promise<APIInteractionResponse>;

function option(interaction: Interaction, name: string): string | undefined {
  for (const o of interaction.data.options ?? []) {
    if (
      o.name === name &&
      (o.type === ApplicationCommandOptionType.String ||
        o.type === ApplicationCommandOptionType.Channel)
    ) {
      return o.value;
    }
  }
  return undefined;
}

/** A member's mention becomes `<@id>`; anything else is a name, as typed. */
export function parseUser(value: string) {
  const mention = /^<@!?(\d+)>$/.exec(value.trim());
  if (mention) return { user: `<@${mention[1]}>`, id: mention[1] };
  return { user: value.trim().replace(/\s+/g, " "), id: undefined };
}

const PERIODS = {
  week: { seconds: 7 * 86400, label: "in the last 7 days" },
  month: { seconds: 30 * 86400, label: "in the last 30 days" },
  all: { seconds: Infinity, label: "of all time" },
} as const;
const isPeriod = (value: string): value is keyof typeof PERIODS => Object.hasOwn(PERIODS, value);

const kudos = (env: KudosEnv, guild: string) => env.KUDOS.getByName(guild);

const give: Handler = async (interaction, env, ctx) => {
  const channel = interaction.channel.id;
  const from = interaction.member.user.id;
  const to = parseUser(option(interaction, "user") ?? "");
  const reason = option(interaction, "reason");

  if (!to.user || !reason) return reply("Who, and what for?", { ephemeral: true });
  if (to.id === from) return reply("You can't give yourself kudos.", { ephemeral: true });

  const kudosChannel = await kudos(env, interaction.guild_id).give(channel, from, to.user, reason);

  const content = `${to.user} from <@${from}>\n> ${reason}`;
  if (kudosChannel && kudosChannel !== channel) {
    ctx.waitUntil(
      postMessage(env.DISCORD_BOT_TOKEN, kudosChannel, `${content}\nin <#${channel}>`).catch((e) =>
        console.error(`Posting to the kudos channel failed: ${e}`),
      ),
    );
  }
  return reply(content, { mentions: { users: to.id ? [to.id] : [] } });
};

const leaderboard: Handler = async (interaction, env) => {
  const requested = option(interaction, "period") ?? "all";
  const period = PERIODS[isPeriod(requested) ? requested : "all"];
  const since = Number.isFinite(period.seconds)
    ? Math.floor(Date.now() / 1000) - period.seconds
    : 0;
  const rows = await kudos(env, interaction.guild_id).leaderboard(since);

  if (!rows.length) return reply(`No kudos ${period.label} yet.`);
  const lines = rows.map((r, i) => `${i + 1}. ${r.to_user} · ${r.n} kudos`);
  return reply(`**Kudos leaderboard ${period.label}**\n${lines.join("\n")}`);
};

const history: Handler = async (interaction, env) => {
  const { user } = parseUser(option(interaction, "user") ?? `<@${interaction.member.user.id}>`);
  const { total, recent } = await kudos(env, interaction.guild_id).history(user);
  if (!total) return reply(`${user} has no kudos yet.`, { ephemeral: true });

  const lines = recent.map((r) => `- ${r.reason} (from <@${r.from_user}>, <t:${r.created_at}:R>)`);
  return reply(`${user} has ${total} kudos. Most recent:\n${lines.join("\n")}`, {
    ephemeral: true,
  });
};

const setChannel: Handler = async (interaction, env) => {
  const channel = option(interaction, "channel") ?? null;
  if (channel) {
    // A test post now catches a channel the bot can't post in.
    try {
      await postMessage(env.DISCORD_BOT_TOKEN, channel, "Kudos will be posted here. 🙏");
    } catch (e) {
      console.error(`Test post to the kudos channel failed: ${e}`);
      return reply(
        `I can't post in <#${channel}>. Give me View Channel and Send Messages there, then try again.`,
        { ephemeral: true },
      );
    }
  }
  await kudos(env, interaction.guild_id).setKudosChannel(channel);
  return reply(
    channel ? `Every kudos will also be posted in <#${channel}>.` : "Kudos channel turned off.",
    { ephemeral: true },
  );
};

export const handlers = {
  kudos: give,
  leaderboard,
  "kudos-history": history,
  "kudos-channel": setChannel,
} satisfies Record<string, Handler>;

export const isCommand = (name: string): name is keyof typeof handlers =>
  Object.hasOwn(handlers, name);

/** Suggests matching members, then past recipients, then the typed text itself. */
export async function autocomplete(
  interaction: APIApplicationCommandAutocompleteInteraction,
  env: KudosEnv,
  ctx: ExecutionContext,
): Promise<APIApplicationCommandAutocompleteResponse> {
  const guild = interaction.guild_id ?? "";
  const focused = interaction.data.options.find(
    (o) => o.type === ApplicationCommandOptionType.String && o.focused,
  );
  const typed = focused?.type === ApplicationCommandOptionType.String ? focused.value.trim() : "";
  const stub = kudos(env, guild);

  const [found, past] = await Promise.all([
    typed
      ? searchMembers(env.DISCORD_BOT_TOKEN, guild, typed).catch((e) => {
          console.error(`Member search failed: ${e}`);
          return [];
        })
      : [],
    stub.autocomplete(typed),
  ]);

  // Shown like Discord's member list: display name, then @username.
  const members: Choice[] = found.map(({ nick, user }) => {
    const display = nick ?? user.global_name ?? user.username;
    return {
      value: `<@${user.id}>`,
      name: display === user.username ? `@${user.username}` : `${display} · @${user.username}`,
    };
  });
  if (members.length) ctx.waitUntil(stub.saveMemberNames(members));

  // A name that matches a member's is the member, so it isn't offered twice.
  const taken = new Set(
    found
      .flatMap(({ nick, user }) => [nick, user.global_name, user.username])
      .map((n) => n?.toLowerCase()),
  );
  const choices = new Map<string, string>();
  for (const { value, name } of [...members, ...past]) {
    if (choices.has(value) || (value === name && taken.has(name.toLowerCase()))) continue;
    choices.set(value, name);
    taken.add(name.toLowerCase());
  }
  if (typed && !taken.has(typed.toLowerCase())) choices.set(typed, typed);

  return {
    type: InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: {
      choices: [...choices]
        .slice(0, 25)
        .map(([value, name]) => ({ value, name: name.slice(0, 100) })),
    },
  };
}
