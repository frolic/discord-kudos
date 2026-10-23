import { DurableObject } from "cloudflare:workers";
import type { KudosEnv } from "../alchemy.run.ts";

// Each Discord server gets its own object (and its own SQLite database), so
// one server's data never shares storage with another's. Row shapes are
// `type`s, not interfaces, because sql.exec<T> needs an index signature.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kudos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS kudos_to ON kudos (to_user, created_at);
  CREATE INDEX IF NOT EXISTS kudos_time ON kudos (created_at);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`;

export interface Kudos {
  channel: string;
  from: string;
  to: string;
  reason: string;
}

export type Ranked = {
  to_user: string;
  n: number;
};

export type Received = {
  from_user: string;
  reason: string;
  created_at: number;
};

type Count = {
  n: number;
};

type Setting = {
  value: string | null;
};

export class KudosServer extends DurableObject<KudosEnv> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: KudosEnv) {
    super(ctx, env);
    this.sql.exec(SCHEMA);
  }

  /** Records a kudos. Returns the receiver's new total and the kudos channel, if any. */
  give(kudos: Kudos) {
    this.sql.exec(
      "INSERT INTO kudos (channel_id, from_user, to_user, reason) VALUES (?, ?, ?, ?)",
      kudos.channel,
      kudos.from,
      kudos.to,
      kudos.reason,
    );
    return { total: this.total(kudos.to), kudosChannel: this.kudosChannel() };
  }

  /** Top 10 receivers since a unix time; ties go to whoever was thanked most recently. */
  leaderboard(since: number): Ranked[] {
    return this.sql
      .exec<Ranked>(
        `SELECT to_user, COUNT(*) AS n FROM kudos WHERE created_at >= ?
         GROUP BY to_user ORDER BY n DESC, MAX(created_at) DESC LIMIT 10`,
        since,
      )
      .toArray();
  }

  /** A user's total and their five most recent kudos. */
  history(user: string) {
    const recent = this.sql
      .exec<Received>(
        `SELECT from_user, reason, created_at FROM kudos
         WHERE to_user = ? ORDER BY id DESC LIMIT 5`,
        user,
      )
      .toArray();
    return { total: this.total(user), recent };
  }

  /** Sets the channel every kudos is echoed to, or turns it off with null. */
  setKudosChannel(channel: string | null) {
    this.sql.exec(
      "INSERT INTO settings (key, value) VALUES ('kudos_channel', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      channel,
    );
  }

  private total(user: string) {
    return this.sql.exec<Count>("SELECT COUNT(*) AS n FROM kudos WHERE to_user = ?", user).one().n;
  }

  private kudosChannel() {
    const [row] = this.sql
      .exec<Setting>("SELECT value FROM settings WHERE key = 'kudos_channel'")
      .toArray();
    return row?.value ?? null;
  }
}
