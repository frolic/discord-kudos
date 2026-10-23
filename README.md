# discord-kudos

A small Discord bot for thanking people in public. `/kudos @someone reason` keeps a per-server count, and every kudos can also be echoed to one channel.

It runs on one Cloudflare Worker with a D1 database, deployed with [Alchemy](https://alchemy.run). What it does and why: [SPEC.md](./SPEC.md).

## Commands

| Command | What it does |
|-|-|
| `/kudos user reason` | +1 for `user`, posted in the channel (and in the kudos channel, if one is set) |
| `/leaderboard [period]` | Top 10 for the last 7 days, the last 30 days, or all time |
| `/kudos-history [user]` | Someone's total and their five most recent reasons (only you see it) |
| `/kudos-channel [channel]` | Admins: set the channel every kudos is echoed to. No channel turns it off |

## Deploy your own

1. Create an app at https://discord.com/developers/applications. Note its application ID and public key, and generate a bot token (Bot → Reset Token).
2. Create a Cloudflare API token that can edit Workers and D1.
3. Add these GitHub Actions secrets to your fork: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`.
4. Push to `main`. CI deploys the Worker and D1 database, then registers the slash commands.
5. In the Discord app, set "Interactions endpoint URL" to the Worker URL printed by the deploy (`https://kudos.<your-subdomain>.workers.dev`).
6. Invite the bot: `https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=3072` (View Channel and Send Messages, for the kudos channel).

To deploy from your machine instead, copy `.env.example` to `.env`, fill it in along with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and run `pnpm run deploy`.

## Development

```bash
pnpm install
pnpm test        # vitest in workerd, against a local D1
pnpm typecheck
pnpm lint && pnpm format:check
```

```
src/worker.ts     verify the Discord signature, route to a command
src/kudos.ts      the four command handlers
src/commands.ts   slash command definitions (registered by scripts/register.ts)
src/discord.ts    signature check, replies, posting to a channel
migrations/       D1 schema
alchemy.run.ts    Worker + D1, as code
```
