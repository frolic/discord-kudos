import {
  InteractionResponseType,
  MessageFlags,
  RouteBases,
  Routes,
  type APIAllowedMentions,
  type APIInteractionResponse,
} from "discord-api-types/v10";

const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (b) => parseInt(b, 16));

/** Discord signs every interaction with the app's Ed25519 key; reject anything else. */
export async function verify(request: Request, body: string, publicKey: string) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp) return false;
  const key = await crypto.subtle.importKey("raw", hex(publicKey), "Ed25519", false, ["verify"]);
  return crypto.subtle.verify(
    "Ed25519",
    key,
    hex(signature),
    new TextEncoder().encode(timestamp + body),
  );
}

const NO_PINGS = { parse: [] } satisfies APIAllowedMentions;

interface ReplyOptions {
  ephemeral?: boolean;
  mentions?: APIAllowedMentions;
}

/** A channel message reply. Pings nobody unless `mentions` says so. */
export function reply(content: string, options: ReplyOptions = {}): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content,
      allowed_mentions: options.mentions ?? NO_PINGS,
      flags: options.ephemeral ? MessageFlags.Ephemeral : undefined,
    },
  };
}

/** Posts a message to a channel as the bot. Never pings anyone. */
export async function postMessage(token: string, channelId: string, content: string) {
  const res = await fetch(RouteBases.api + Routes.channelMessages(channelId), {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: NO_PINGS }),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
}
