module.exports = {
    commandInfo: {
        name: "latency",
        description: "check the bot's latency.",
        options: [],
    },

    execute: async (interaction) => {
        const latency = Math.round(interaction.client.ws.ping);

        await interaction.reply({
            content: `\`${latency}ms\``,
            ephemeral: false
        });
    }
};