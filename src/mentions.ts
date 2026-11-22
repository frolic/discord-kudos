/**
 * Mention parsing for `/kudos for:<text>`.
 *
 * Discord renders a user mention as `<@123>` or, when the mention has a
 * nickname, `<@!123>`. A message may mention several people, and the same
 * person twice. Everything that isn't a mention is the reason.
 *
 * Pure functions, no discord.js or discord-api-types import, so the cases
 * that matter — no mentions, duplicates, nicknamed mentions, a reason that
 * survives the strip — are unit-tested without a client.
 */

// `<@123>` and `<@!123>`. Discord snowflakes are 17-20 digits today, but the
// format is "one or more digits" and pinning a length would silently drop a
// mention if Discord ever widens the id space.
const USER_MENTION = /<@!?(\d+)>/g;

/**
 * Distinct user ids mentioned in `text`, in first-appearance order.
 *
 * Deduplicated so mentioning the same person twice is one kudos, and
 * ordered so the reply lists them the way the author wrote them.
 */
export function parseMentions(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(USER_MENTION)) {
    const id = match[1];
    if (id !== undefined) ids.push(id);
  }
  return [...new Set(ids)];
}

/**
 * The reason: the text with every user mention removed.
 *
 * Collapses the whitespace a removal leaves behind ("> <@1> <@2> shipped it"
 * → "shipped it") and trims the ends. Returns an empty string when the text
 * was nothing but mentions, which the handler treats as "no reason given".
 */
export function stripMentions(text: string): string {
  return text.replace(USER_MENTION, " ").replace(/\s+/g, " ").trim();
}
