const { MessageEmbed } = require("discord.js");
const functions = require("../../../structs/functions.js");
const User = require("../../../model/user.js");
const log = require("../../../structs/log.js");
const { hasPermission } = require("../../../structs/permstore.js");

module.exports = {
    commandInfo: {
        name: "hostcreate",
        description: "create a temporary host account for the gameserver."
    },

    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!hasPermission(interaction.user.id, "createhostaccount")) {
            return interaction.editReply({
                content: "Needed permissions: \`administrator\`.",
                ephemeral: true
            });
        }

        const existingHostAccount = await User.findOne({ email: "hostaccount@server.com" });
        if (existingHostAccount) {
            return interaction.editReply({
                content: "a host account already exists",
                ephemeral: true
            });
        }

        const username = "hostaccount";
        const email    = "hostaccount@server.com";
        const password = generateRandomPassword(12);

        try {
            await functions.registerUser(null, username, email, password).then(async (resp) => {
                const embed = new MessageEmbed()
                    .setColor(resp.status >= 400 ? "#ff0000" : "#56ff00")
                    .addFields(
                        { name: "Message",  value: resp.message              },
                        { name: "Username", value: `\`\`\`${username}\`\`\`` },
                        { name: "Email",    value: `\`\`\`${email}\`\`\``    },
                        { name: "Password", value: `\`\`\`${password}\`\`\`` },
                    )
                    .setTimestamp()
                    .setFooter({ text: "Backend", iconURL: "" });

                return interaction.editReply({ embeds: [embed], ephemeral: true });
            });
        } catch (error) {
            log.error(error);
            return interaction.editReply({
                content: "An error occurred while creating the host account.",
                ephemeral: true
            });
        }
    }
};

function generateRandomPassword(length) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+<>?";
    let password  = "";
    for (let i = 0; i < length; i++) {
        password += charset[Math.floor(Math.random() * charset.length)];
    }
    return password;
}
