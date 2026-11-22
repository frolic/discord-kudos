# Kudos

Thank people in public. Each server keeps a count of kudos per person and can collect every kudos in one channel.

## Commands

| Who    | Command                       | Result                                                                       |
| ------ | ----------------------------- | ---------------------------------------------------------------------------- |
| Anyone | `/kudos for`                  | One field: @mention one or more people, then say what for. +1 for each.      |
| Anyone | `/kudos-leaderboard [period]` | Top 10 for the last 7 days, last 30 days, or all time (default).             |
| Anyone | `/kudos-history [user]`       | Total and five most recent reasons, visible only to you. Defaults to you.    |
| Admin  | `/kudos-channel [channel]`    | Sets the kudos channel and posts a test message there. No channel clears it. |

If a kudos channel is set, every kudos is also posted there, without pinging again.

## Rules

- Servers only, no DMs. Each server's data is stored separately.
- You can't give yourself kudos.

## `/kudos for`

A single text field. You @mention who you're thanking (Discord autocompletes
mentions as you type) and write the reason after them:

```
/kudos for: @alice @bob thanks for the review
```

- Every distinct person mentioned gets +1, so one command can thank several
  people at once.
- The mentions are removed from the reason, which is everything else you wrote.
- Mentioning yourself is ignored; mentioning only yourself is an error.
- A mention is required, and so is a reason. The reason is at most 1000
  characters, mentions included.

## How it works

- A Cloudflare Worker receives Discord's requests and checks their signature.
- Each server gets its own Durable Object with a SQLite database.
- GitHub Actions tests every PR and deploys `main`, then registers the commands. There are no PR previews because a Discord app has one URL.

## Not yet

- Importing counts from the old version.
- Kudos by emoji reaction.
- Weekly summaries.
