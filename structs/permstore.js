const fs   = require("fs");
const path = require("path");

const SAVE_PATH = path.join(__dirname, "../Config/permpacks.json");

const PERM_PACKS = {
    Staff: ["ban", "unban", "who"],
    Admin: ["*"],
    Owner: ["*"],
};

const PACK_DESCRIPTIONS = {
    Staff: "`ban`, `unban`, `who`",
    Admin: "`ban`, `unban`, `who`, `itemsadd`, `itemsfill`, `package`, `clear`, `delete`, `createhostaccount`, `hypeadd`, `leveladd`, `kick`",
    Owner: "`ban`, `unban`, `who`, `itemsadd`, `itemsfill`, `package`, `clear`, `delete`, `createhostaccount`, `hypeadd`, `leveladd`, `kick`",
    None:  "No permissions",
};

const PACK_COLORS = {
    Staff: 0x3498db,
    Admin: 0xe67e22,
    Owner: 0xe74c3c,
    None:  0x95a5a6,
};

let userPermissions = {};

try {
    if (fs.existsSync(SAVE_PATH)) {
        userPermissions = JSON.parse(fs.readFileSync(SAVE_PATH, "utf8"));
        console.log(`Permissions: Loaded ${Object.keys(userPermissions).length} permission pack(s) from disk.`);
    }
} catch (err) {
    console.error("Permissions: Failed to load permpacks.json.", err);
    userPermissions = {};
}

function save() {
    try {
        fs.writeFileSync(SAVE_PATH, JSON.stringify(userPermissions, null, 2), "utf8");
    } catch (err) {
        console.error("Permissions: Failed to save permpacks.json.", err);
    }
}

function grantPack(userId, pack) {
    userPermissions[userId] = pack;
    save();
}

function revokePack(userId) {
    delete userPermissions[userId];
    save();
}

function getUserPack(userId) {
    return userPermissions[userId] ?? null;
}

function hasPermission(userId, command) {
    const pack = userPermissions[userId];
    if (!pack || !PERM_PACKS[pack]) return false;
    const allowed = PERM_PACKS[pack];
    return allowed.includes("*") || allowed.includes(command);
}

module.exports = {
    PERM_PACKS,
    PACK_DESCRIPTIONS,
    PACK_COLORS,
    grantPack,
    revokePack,
    getUserPack,
    hasPermission,
};