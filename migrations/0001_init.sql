-- One row per kudos given. Counts and leaderboards are derived from this log.
CREATE TABLE kudos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX kudos_guild_to ON kudos (guild_id, to_user, created_at);
CREATE INDEX kudos_guild_time ON kudos (guild_id, created_at);

-- Per-server settings.
CREATE TABLE guilds (
  guild_id TEXT PRIMARY KEY,
  kudos_channel_id TEXT
);
