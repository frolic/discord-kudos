# Kudos

Thank people in public. Each server keeps a count of kudos per person and can collect every kudos in one channel.

## Commands

| Who    | Command                    | Result                                                                                    |
| ------ | -------------------------- | ----------------------------------------------------------------------------------------- |
| Anyone | `/kudos user [reason]`     | +1 for `user`. Posts "Kudos to @user 👏" and the reason, if given. Only `user` is pinged. |
| Anyone | `/leaderboard [period]`    | Top 10 for the last 7 days, last 30 days, or all time (default).                          |
| Anyone | `/kudos-history [user]`    | Total and five most recent kudos, visible only to you. Defaults to you.                   |
| Admin  | `/kudos-channel [channel]` | Sets the kudos channel and posts a test message there. No channel clears it.              |

If a kudos channel is set, every kudos is also posted there, without pinging again.

## Rules

- `user` is any member of the server, bots included, picked with Discord's member picker.
- You can't give yourself kudos.
- Reasons are optional, up to 1900 characters, so the whole message fits in one Discord message.
- Servers only, no DMs. Each server's data is stored separately.

## How it works

- A Cloudflare Worker receives Discord's requests and checks their signature.
- Each server gets its own Durable Object with a SQLite database.
- GitHub Actions tests every PR and deploys `main`, then registers the commands. There are no PR previews because a Discord app has one URL.

## Not yet

- Importing counts from the old version.
- Kudos by emoji reaction.
- Weekly summaries.
