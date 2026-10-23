import { DurableObject } from "cloudflare:workers";
import type { KudosEnv } from "../alchemy.run.ts";

// One instance per Discord server, each with its own SQLite database.
// `to_user` is a member's mention (`<@id>`) or any other name as typed.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kudos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL COLLATE NOCASE,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS member_names (user TEXT PRIMARY KEY, name TEXT NOT NULL);
`;

export type Choice = { value: string; name: string };

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
    return { total: this.total(to), kudosChannel: this.kudosChannel() };
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

  /** Past recipients whose name starts with `prefix`, most recent first. */
  autocomplete(prefix: string) {
    return this.sql
      .exec<Choice>(
        `SELECT k.to_user AS value, COALESCE(m.name, k.to_user) AS name FROM kudos k
         LEFT JOIN member_names m ON m.user = k.to_user
         WHERE (m.name IS NOT NULL OR k.to_user NOT LIKE '<@%')
           AND COALESCE(m.name, k.to_user) LIKE ? ESCAPE '\\'
         GROUP BY k.to_user ORDER BY MAX(k.id) DESC LIMIT 25`,
        `${prefix.replace(/[\\%_]/g, "\\$&")}%`,
      )
      .toArray();
  }

  saveMemberNames(members: Choice[]) {
    for (const { value, name } of members) {
      this.sql.exec(
        "INSERT INTO member_names (user, name) VALUES (?, ?) ON CONFLICT (user) DO UPDATE SET name = excluded.name",
        value,
        name,
      );
    }
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
