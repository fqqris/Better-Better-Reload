const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const functions = require("../../../structs/functions.js");
const crypto = require("crypto");
const { applyPendingGrantsToNewUser } = require("../../../Api/admin.js");

module.exports = {
    commandInfo: {
        name: "create",
        description: "create an account.",
        options: [
            {
                name: "username",
                description: "select ur desired username.",
                required: true,
                type: 3
            }
        ],
    },

    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const { options } = interaction;

        const discordId = interaction.user.id;
        const username = options.get("username").value;
        const email = `${crypto.randomBytes(5).toString("hex")}@snow.xyz`.toLowerCase();
        const password = crypto.randomBytes(6).toString("hex");

        const existingEmail = await User.findOne({ email });
        const existingUser = await User.findOne({ username_lower: username.toLowerCase() });

        if (username.length < 3) {
            return interaction.editReply({ content: "username is too short", ephemeral: true });
        }

        if (username.length > 20) {
            return interaction.editReply({ content: "username is too long", ephemeral: true });
        }

        if (existingEmail || existingUser) {
            return interaction.editReply({
                content: "you already have an account.",
                ephemeral: true
            });
        }

        await functions.registerUser(discordId, username, email, password).then(async (resp) => {
            const isError = resp.status >= 400;

            let embed = new MessageEmbed()
                .setColor(isError ? "#ff0000" : "#56ff00")
                .setTitle(isError ? "Account creation failed" : "Account created successfully")
                .addFields(
                    { name: "username", value: username, inline: true },
                    { name: "email", value: email, inline: true },
                    { name: "password", value: password, inline: true }
                )
                .setTimestamp()
                .setFooter({
                    text: "Snowman",
                    iconURL: "https://cdn.discordapp.com/avatars/1505624702176071721/1b3e106cfa5b4710c522d2da5ce0de3e.webp?size=1024"
                });

            if (isError) {
                return interaction.editReply({
                    embeds: [embed],
                    ephemeral: true
                });
            }

            // Apply any still-active bulk grants (see Bulk Grant in the admin panel)
            // to this brand new account. Failures here never block account creation.
            try {
                const newUser = await User.findOne({ username_lower: username.toLowerCase() }).lean();
                if (newUser?.accountId) {
                    await applyPendingGrantsToNewUser(newUser.accountId);
                }
            } catch (grantErr) {
                console.warn("[create] applyPendingGrantsToNewUser failed:", grantErr.message);
            }

            let dmSent = true;

            await interaction.user.send({
                content: `Welcome to Snow, ${interaction.user.username}!`,
                embeds: [embed]
            }).catch(() => {
                dmSent = false;
            });

            const replyContent = dmSent
                ? "account registered, check your dms for your account info"
                : "account created but unable to send a dm";

            interaction.editReply({
                content: replyContent,
                ephemeral: true
            });
        });
    }
};