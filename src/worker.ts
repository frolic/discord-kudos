import {
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  type APIChatInputApplicationCommandGuildInteraction,
  type APIInteraction,
} from "discord-api-types/v10";
import type { KudosEnv } from "../alchemy.run.ts";
import { reply, verify } from "./discord.ts";
import { handlers, isCommand } from "./handlers.ts";

const isGuildCommand = (
  interaction: APIInteraction,
): interaction is APIChatInputApplicationCommandGuildInteraction =>
  interaction.type === InteractionType.ApplicationCommand &&
  interaction.data.type === ApplicationCommandType.ChatInput &&
  interaction.guild_id !== undefined;

export default {
  async fetch(request: Request, env: KudosEnv, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") return new Response("Kudos bot");

    const body = await request.text();
    if (!(await verify(request, body, env.DISCORD_PUBLIC_KEY))) {
      return new Response("Bad signature", { status: 401 });
    }

    const interaction: APIInteraction = JSON.parse(body);
    if (interaction.type === InteractionType.Ping) {
      return Response.json({ type: InteractionResponseType.Pong });
    }
    if (isGuildCommand(interaction) && isCommand(interaction.data.name)) {
      return Response.json(await handlers[interaction.data.name](interaction, env, ctx));
    }

    return Response.json(reply("Sorry, I don't know that one.", { ephemeral: true }));
  },
} satisfies ExportedHandler<KudosEnv>;

export { Kudos } from "./kudos.ts";
