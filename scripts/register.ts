/// <reference types="node" />
// Replaces the app's slash commands with src/commands.ts.
import { RouteBases, Routes } from "discord-api-types/v10";
import { commands } from "../src/commands.ts";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {}

const { DISCORD_APPLICATION_ID: appId, DISCORD_BOT_TOKEN: token } = process.env;
if (!appId || !token) throw new Error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required");

const res = await fetch(RouteBases.api + Routes.applicationCommands(appId), {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
console.log(
  `Registered ${commands.length} commands: ${commands.map((c) => `/${c.name}`).join(", ")}`,
);
