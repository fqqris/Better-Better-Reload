const path = require("path");
const fs = require("fs");
const Users = require("../../../model/user.js");
const Profiles = require("../../../model/profiles.js");
const log = require("../../../structs/log.js");
const { hasPermission } = require("../../../structs/permstore.js");
const destr = require("destr");

function markItemsAsNew(items) {
    const marked = {};
    for (const key in items) {
        marked[key] = {
            ...items[key],
            attributes: {
                ...items[key].attributes,
                item_seen: false
            }
        };
    }
    return marked;
}

module.exports = {
    commandInfo: {
        name: "itemsfill",
        description: "grant a user all items. ",
        options: [
            {
                name: "user",
                description: "The user you want to grant items to",
                required: true,
                type: 6
            }
        ]
    },

    execute: async (interaction) => {
        if (!hasPermission(interaction.user.id, "itemsfill")) {
            return interaction.reply({
                content: "Needed permissions: \`manage_roles\`.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: false });

        const selectedUser   = interaction.options.getUser("user");
        const selectedUserId = selectedUser?.id;

        try {
            const targetUser = await Users.findOne({ discordId: selectedUserId });
            if (!targetUser) {
                return interaction.editReply({ content: "That user does not own an account.", ephemeral: true });
            }

            const profile = await Profiles.findOne({ accountId: targetUser.accountId });
            if (!profile) {
                return interaction.editReply({ content: "That user does not have an account.", ephemeral: true });
            }

            const allItems = destr(fs.readFileSync(path.join(__dirname, "../../../Config/DefaultProfiles/allathena.json"), "utf8"));
            if (!allItems) {
                return interaction.editReply({ content: "Failed to parse allathena.json.", ephemeral: true });
            }

            let itemsToGive    = { ...allItems.items };
            let loadouts       = {};
            const currentItems = profile.profiles.athena.items || {};

            for (const key in currentItems) {
                if (
                    key.includes("loadout") ||
                    (currentItems[key].templateId && currentItems[key].templateId.startsWith("CosmeticLocker:"))
                ) {
                    loadouts[key] = currentItems[key];
                }
            }

            if (Object.keys(loadouts).length === 0) {
                try {
                    const defaultAthena = destr(fs.readFileSync(path.join(__dirname, "../../../Config/DefaultProfiles/athena.json"), "utf8"));
                    if (defaultAthena?.items) {
                        for (const key in defaultAthena.items) {
                            if (
                                key.includes("loadout") ||
                                (defaultAthena.items[key].templateId && defaultAthena.items[key].templateId.startsWith("CosmeticLocker:"))
                            ) {
                                loadouts[key] = defaultAthena.items[key];
                            }
                        }
                    }
                } catch (e) {
                    log.error("Failed to read default athena.json for loadout restoration", e);
                }
            }

            itemsToGive = { ...markItemsAsNew(itemsToGive), ...loadouts };

            const athena           = profile.profiles.athena;
            athena.items           = itemsToGive;
            athena.rvn            += 1;
            athena.commandRevision += 1;

            await Profiles.updateOne(
                { accountId: targetUser.accountId },
                { $set: { "profiles.athena": athena } }
            );

            return interaction.editReply({ content: `${targetUser.username} has been given all items.` });

        } catch (error) {
            log.error("An error occurred in itemsfill:", error);
            return interaction.editReply({ content: "An error occurred while processing the request. ERROR-01", ephemeral: true });
        }
    }
};