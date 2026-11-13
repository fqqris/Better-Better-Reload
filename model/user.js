const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        created: { type: Date, required: true },
        lastLogin: { type: Date, default: null },
        banned: { type: Boolean, default: false },
        bannedUntil: { type: Date, default: null },
        banReason: { type: String, default: null },
        discordId: { type: String, default: null, unique: true, sparse: true },
        accountId: { type: String, required: true, unique: true },
        username: { type: String, required: true, unique: true },
        username_lower: { type: String, required: true, unique: true },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        matchmakingId: { type: String, required: true, unique: true },
        isServer: { type: Boolean, default: false },
        currentSACCode: { type: String, default: null },
        lastUsernameChange: { type: Date, default: null },
        grantedPackages: { type: [String], default: [] },
        receivedGrants: { type: [mongoose.Schema.Types.Mixed], default: [] },
        perks: { type: mongoose.Schema.Types.Mixed, default: {} },
        ipHashes: { type: [String], default: [], index: true }
    },
    {
        collection: "users"
    }
)

const model = mongoose.model('UserSchema', UserSchema);

module.exports = model;