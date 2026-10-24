import { DurableObject } from "cloudflare:workers";
import type { KudosEnv } from "../alchemy.run.ts";

// One instance per Discord server, each with its own SQLite database.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kudos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`;

export class Kudos extends DurableObject<KudosEnv> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: KudosEnv) {
    super(ctx, env);
    this.sql.exec(SCHEMA);
  }

  give(channel: string, from: string, to: string, reason: string) {
    this.sql.exec(
      "INSERT INTO kudos (channel_id, from_user, to_user, reason) VALUES (?, ?, ?, ?)",
      channel,
      from,
      to,
      reason,
    );
    return this.kudosChannel();
  }

  leaderboard(since: number) {
    return this.sql
      .exec<{ to_user: string; n: number }>(
        `SELECT to_user, COUNT(*) AS n FROM kudos WHERE created_at >= ?
         GROUP BY to_user ORDER BY n DESC, MAX(created_at) DESC, MAX(id) DESC LIMIT 10`,
        since,
      )
      .toArray();
  }

  history(user: string) {
    const recent = this.sql
      .exec<{ from_user: string; reason: string; created_at: number }>(
        "SELECT from_user, reason, created_at FROM kudos WHERE to_user = ? ORDER BY id DESC LIMIT 5",
        user,
      )
      .toArray();
    return { total: this.total(user), recent };
  }

  setKudosChannel(channel: string | null) {
    this.sql.exec(
      "INSERT INTO settings (key, value) VALUES ('kudos_channel', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      channel,
    );
  }

  private total(user: string) {
    return this.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM kudos WHERE to_user = ?", user)
      .one().n;
  }

  private kudosChannel() {
    const [row] = this.sql
      .exec<{ value: string | null }>("SELECT value FROM settings WHERE key = 'kudos_channel'")
      .toArray();
    return row?.value ?? null;
  }
}
