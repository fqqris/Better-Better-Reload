const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const functions = require("../../../structs/functions.js");
const { hasPermission } = require("../../../structs/permstore.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

module.exports = {
    commandInfo: {
        name: "ban",
        description: "ban a user from Snow.",
        options: [
            {
                name: "reason",
                description: "Reason for the ban.",
                required: true,
                type: 3,
                choices: [
                    { name: "toxicity",   value: "toxicity"   },
                    { name: "cheating",   value: "cheating"   },
                    { name: "harassment", value: "harassment" },
                    { name: "racism",     value: "racism"     },
                    { name: "teaming",    value: "teaming"    },
                    { name: "exploiting", value: "exploiting" },
                ]
            },
            {
                name: "target",
                description: "target username.",
                required: false,
                type: 3
            },
            {
                name: "user",
                description: "target discord.",
                required: false,
                type: 6
            },
            {
                name: "duration",
                description: "duration of ban",
                required: false,
                type: 3
            }
        ]
    },

    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: false });

        if (!hasPermission(interaction.user.id, "ban")) {
            return interaction.editReply({
                content: "Needed permissions: \`ban_members\`.",
                ephemeral: true
            });
        }

        const { options } = interaction;

        const reason      = options.getString("reason");
        const username    = options.getString("target");
        const discordUser = options.getUser("user");
        const durationStr = options.getString("duration");

        if (!username && !discordUser) {
            return interaction.editReply({
                content: "please provide a username or discord to ban.",
                ephemeral: true
            });
        }

        let targetUser = null;

        if (discordUser) {
            targetUser = await User.findOne({ discordId: discordUser.id });
            if (!targetUser) {
                return interaction.editReply({
                    content: `no account was found for <@${discordUser.id}>.`,
                    ephemeral: true
                });
            }
        } else {
            targetUser = await User.findOne({ username_lower: username.toLowerCase() });
            if (!targetUser) {
                return interaction.editReply({
                    content: "no account was found.",
                    ephemeral: true
                });
            }
        }

        let banExpires      = null;
        let durationDisplay = "Permanently";

        if (durationStr) {
            const match = durationStr.match(/^(\d+)([hdm])$/);
            if (!match) {
                return interaction.editReply({
                    content: "invalid duration (1d, 1h)",
                    ephemeral: true
                });
            }

            const amount = parseInt(match[1]);
            const unit   = match[2];

            banExpires = new Date();

            if (unit === "h") {
                banExpires.setHours(banExpires.getHours() + amount);
                durationDisplay = `for ${amount} hour(s)`;
            } else if (unit === "d") {
                banExpires.setDate(banExpires.getDate() + amount);
                durationDisplay = `for ${amount} day(s)`;
            } else if (unit === "m") {
                banExpires.setMinutes(banExpires.getMinutes() + amount);
                durationDisplay = `for ${amount} minute(s)`;
            }
        }
        if (targetUser.banned) {
            if (!targetUser.banExpires) {
                return interaction.editReply({
                    content: `\`${targetUser.username}\` is already banned.`,
                    ephemeral: true
                });
            }

            if (targetUser.banExpires > new Date()) {
                return interaction.editReply({
                    content: `\`${targetUser.username}\` is already banned until \`${targetUser.banExpires.toUTCString()}\`.`,
                    ephemeral: true
                });
            }
        }

        await targetUser.updateOne({
            $set: {
                banned:     true,
                banExpires: banExpires,
                banReason:  reason
            }
        });

        let refreshToken = global.refreshTokens.findIndex(i => i.accountId == targetUser.accountId);

        if (refreshToken != -1) {
            global.refreshTokens.splice(refreshToken, 1);
        }

        let accessToken = global.accessTokens.findIndex(i => i.accountId == targetUser.accountId);

        if (accessToken != -1) {
            global.accessTokens.splice(accessToken, 1);

            let xmppClient = global.Clients.find(
                client => client.accountId == targetUser.accountId
            );

            if (xmppClient) {
                xmppClient.client.close();
            }
        }

        if (accessToken != -1 || refreshToken != -1) {
            functions.UpdateTokens();
        }

        let dmStatus = "";

        if (targetUser.discordId) {
            try {
                const bannedDiscordUser = await interaction.client.users.fetch(
                    targetUser.discordId
                );

                const banEmbed = new MessageEmbed()
                    .setTitle("Ban Notification")
                    .setDescription("Your account has been banned.")
                    .setColor("#ff0000")
                    .addFields(
                        { name: "Reason", value: reason, inline: true },
                        { name: "Duration", value: durationDisplay, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: "Ban Notify" });

                if (banExpires) {
                    banEmbed.addFields({
                        name: "Expires on",
                        value: banExpires.toUTCString()
                    });
                }

                banEmbed.addFields({
                    name: "Note",
                    value: "This ban is permanent do not ask for a unban"
                });

                await bannedDiscordUser.send({ embeds: [banEmbed] });

                dmStatus = "DM sent successfully.";
            } catch (err) {
                console.error(err);
                dmStatus = "Failed to send DM.";
            }
        } else {
            dmStatus = "No Discord account linked.";
        }

        return interaction.editReply({
            content: `\`${targetUser.username}\` has been banned for \`${reason}\`.`,
            ephemeral: false
        });
    }
};