const { MessageEmbed } = require("discord.js");
const config = require("../../../Config/config.json");
const {
    PACK_DESCRIPTIONS,
    PACK_COLORS,
    grantPack,
    revokePack,
    getUserPack,
} = require("../../../structs/permstore.js");

module.exports = {
    commandInfo: {
        name: "permission",
        description: "grant a permission tier for a user.",
        options: [
            {
                name: "user",
                description: "User to update.",
                required: true,
                type: 6,
            },
            {
                name: "pack",
                description: "The permission tier to give.",
                required: true,
                type: 3,
                choices: [
                    { name: "permission.staff",      value: "Staff" },
                    { name: "permission.admin",      value: "Admin" },
                    { name: "permission.owner",      value: "Owner" },
                    { name: "revoke_all", value: "None"  },
                ],
            },
        ],
    },

    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({
                content: "Needed permissions: \`administrator\`.",
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser("user");
        const pack       = interaction.options.get("pack")?.value;

        if (!targetUser) {
            return interaction.editReply({
                content: "Could not resolve that user.",
                ephemeral: true,
            });
        }

        if (targetUser.bot) {
            return interaction.editReply({
                content: "You cannot assign permissions to a bot.",
                ephemeral: true,
            });
        }

        const previousPack = getUserPack(targetUser.id) ?? "None";

        if (previousPack === pack) {
            return interaction.editReply({
                content: `<@${targetUser.id}> already has the \`${pack}\` permission set.`,
                ephemeral: true,
            });
        }

        if (pack === "None") {
            revokePack(targetUser.id);
        } else {
            grantPack(targetUser.id, pack);
        }

        const PACK_COMMANDS = {
            Staff: "\`who\`, \`ban\`, \`unban\`",
            Admin: "\`who\`, \`ban\`, \`unban\`, \`backendkick\`, \`leveladd\`, \`hypeadd\`, \`itemsadd\`, \`itemsfill\`, \`clear\`, \`delete\`, \`hostcreate\`, \`forcerotate\`, \`embedsend\`",
            Owner: "\`who\`, \`ban\`, \`unban\`, \`backendkick\`, \`leveladd\`, \`hypeadd\`, \`itemsadd\`, \`itemsfill\`, \`clear\`, \`delete\`, \`hostcreate\`, \`forcerotate\`, \`embedsend\`, \`permissionadd\`",
            None:  "None",
        };

        const embed = new MessageEmbed()
            .setTitle("Permissions Updated")
            .setColor(PACK_COLORS[pack] ?? 0x95a5a6)
            .addFields(
                { name: "User",                 value: `<@${targetUser.id}>`,         inline: true  },
                { name: "Previous Permissions", value: `\`${previousPack}\``,         inline: true  },
                { name: "Permissions",          value: `\`${pack}\``,                 inline: true  },
                { name: "Commands Available",   value: PACK_COMMANDS[pack] ?? "None", inline: false },
            )
            .setTimestamp()
            .setFooter({ text: "Backend" });

        return interaction.editReply({ embeds: [embed], ephemeral: true });
    },
};