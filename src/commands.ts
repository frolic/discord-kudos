import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  type RESTPutAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";

// Servers only, never DMs.
const scope = {
  integration_types: [ApplicationIntegrationType.GuildInstall],
  contexts: [InteractionContextType.Guild],
};

export const commands: RESTPutAPIApplicationCommandsJSONBody = [
  {
    ...scope,
    name: "kudos",
    description: "Give someone kudos",
    options: [
      {
        type: ApplicationCommandOptionType.User,
        name: "user",
        description: "Who are you thanking?",
        required: true,
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
        type: ApplicationCommandOptionType.User,
        name: "user",
        description: "Whose history (default: yours)",
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
