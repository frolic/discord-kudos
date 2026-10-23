import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  type RESTPutAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";

// Server installs only, and never in DMs: counts are per server.
const scope = {
  integration_types: [ApplicationIntegrationType.GuildInstall],
  contexts: [InteractionContextType.Guild],
};

/** Every slash command, as registered with Discord by scripts/register.ts. */
export const commands: RESTPutAPIApplicationCommandsJSONBody = [
  {
    ...scope,
    name: "kudos",
    description: "Give someone kudos",
    options: [
      {
        // Text with autocomplete rather than a User option, so it suggests
        // members but also takes any name ("the ops team").
        type: ApplicationCommandOptionType.String,
        name: "user",
        description: "Who are you thanking? Pick a member or type any name",
        required: true,
        autocomplete: true,
        max_length: 100,
      },
      {
        type: ApplicationCommandOptionType.String,
        name: "reason",
        description: "What for?",
        required: true,
        min_length: 1,
        max_length: 300,
      },
    ],
  },
  {
    ...scope,
    name: "leaderboard",
    description: "Who has received the most kudos",
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "period",
        description: "Time window (default: all time)",
        choices: [
          { name: "Last 7 days", value: "week" },
          { name: "Last 30 days", value: "month" },
          { name: "All time", value: "all" },
        ],
      },
    ],
  },
  {
    ...scope,
    name: "kudos-history",
    description: "Someone's kudos total and recent reasons",
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "user",
        description: "Whose history: a member or any name (default: yours)",
        autocomplete: true,
        max_length: 100,
      },
    ],
  },
  {
    ...scope,
    name: "kudos-channel",
    description: "Set the channel every kudos is also posted to (leave empty to turn off)",
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    options: [
      {
        type: ApplicationCommandOptionType.Channel,
        name: "channel",
        description: "Kudos channel",
        channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      },
    ],
  },
];
