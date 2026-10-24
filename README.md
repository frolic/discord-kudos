# discord-kudos

A Discord bot for thanking people in public. Runs on Cloudflare Workers, deployed with [Alchemy](https://alchemy.run). See [SPEC.md](./SPEC.md).

## Install

Add the bot to a server: `https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=3072`

Use your app's Application ID, from its General Information page. The bot needs the `bot` scope (View Channels and Send Messages) to post in the kudos channel.

## Commands

| Command                       | What it does                                              |
| ----------------------------- | --------------------------------------------------------- |
| `/kudos user reason`          | +1 for a member. Also posted in the kudos channel, if set |
| `/kudos-leaderboard [period]` | Top 10 for the last 7 days, last 30 days, or all time     |
| `/kudos-history [user]`       | Total and five most recent reasons (only you see it)      |
| `/kudos-channel [channel]`    | Admins: set or clear the kudos channel                    |

## Deploy your own

1. Create a Discord app at https://discord.com/developers/applications. Copy its application ID and public key, and create a bot token (Bot → Reset Token).
2. Add GitHub secrets: `CLOUDFLARE_API_TOKEN` (with Workers edit access), `CLOUDFLARE_ACCOUNT_ID`, `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`.
3. Push to `main`. CI deploys and registers the commands.
4. Set the Discord app's "Interactions endpoint URL" to the deployed URL (`https://kudos.<your-subdomain>.workers.dev`).
5. Invite the bot with the [install link](#install).

To deploy locally, copy `.env.example` to `.env`, add the Cloudflare values, and run `pnpm run deploy`.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint && pnpm format:check
```

| File              | Contents                                           |
| ----------------- | -------------------------------------------------- |
| `src/worker.ts`   | Checks Discord's signature and routes each request |
| `src/handlers.ts` | Command handlers                                   |
| `src/commands.ts` | Command definitions                                |
| `src/kudos.ts`    | Durable Object, one per server, with SQLite        |
| `src/discord.ts`  | Discord API helpers                                |
| `alchemy.run.ts`  | Infrastructure                                     |
