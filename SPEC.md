# Kudos: design spec

A Discord bot for thanking people in public. Each server keeps a running count of the kudos each member has received, and can collect every kudos in one channel.

## Use cases

| Who                   | Wants to                                             | Command                    | Result                                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anyone                | Thank someone                                        | `/kudos user reason`       | +1 for `user` in this server. Posts "Kudos to @user from @you (N total)" with the reason, in the current channel. `user` suggests members as you type but takes any name ("the ops team"); only members get pinged. |
| Anyone                | See every kudos in one place                         | (automatic)                | If the server has a kudos channel and the command ran elsewhere, the same message is also posted there, without a second ping.                                                                                      |
| Anyone                | See who's been thanked most                          | `/leaderboard [period]`    | Top 10 by kudos received. `period`: last 7 days, last 30 days, or all time (default).                                                                                                                               |
| Anyone                | See why someone was thanked                          | `/kudos-history [user]`    | Their total and the five most recent reasons, visible only to the caller. Defaults to the caller.                                                                                                                   |
| Admin (Manage Server) | Turn the kudos channel on, change it, or turn it off | `/kudos-channel [channel]` | Sets the channel and posts a test message there (fails loudly if the bot can't post). No channel turns it off.                                                                                                      |

## Rules

- Servers only: the commands don't appear in DMs.
- No kudos to yourself. Bots, and any free-text name, can collect kudos. Names count case-insensitively.
- Reason is required, 1 to 300 characters.
- Counts are per server. They're derived from the kudos log, so the log is the only source of truth.

## Shape

- One Cloudflare Worker is the Discord interactions endpoint. It checks Discord's Ed25519 signature with WebCrypto and answers each command synchronously.
- One Durable Object per server, each with its own SQLite database: `kudos` (the log) and `settings` (the kudos channel). Servers never share storage.
- The bot token is used only to post to the kudos channel and to register commands.
- Alchemy declares the Worker and the Durable Object binding. GitHub Actions tests every PR and deploys on push to `main`, then registers the commands with Discord. There are no PR previews, because a Discord app points at a single URL.
- No framework. `discord-api-types` provides the types.

## Not in scope (yet)

- Importing counts from the old Durable Object app.
- Giving kudos by emoji reaction or from a message's context menu.
- Scheduled digests ("top kudos this week").
