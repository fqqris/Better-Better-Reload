const Profile = require("../model/profiles.js");
const permstore = require("./permstore.js");
const FAV = "profiles.athena.stats.attributes.favorite_character";
async function equippedCharacters(accountIds) {
    const out = new Map();
    const ids = [...new Set(accountIds.filter(Boolean))];
    if (!ids.length) return out;
    const docs = await Profile.find({ accountId: { $in: ids } }).select({ accountId: 1, [FAV]: 1 }).lean();
    const guids = [];
    for (const d of docs) {
        const fav = d.profiles?.athena?.stats?.attributes?.favorite_character;
        if (typeof fav !== "string" || !fav) continue;
        if (fav.includes(":")) out.set(d.accountId, fav);
        else if (/^[\w-]{1,64}$/.test(fav)) guids.push([d.accountId, fav]);
    }
    await Promise.all(guids.map(async ([accountId, guid]) => {
        const path = `profiles.athena.items.${guid}.templateId`;
        const d = await Profile.findOne({ accountId }).select({ [path]: 1 }).lean();
        const tid = d?.profiles?.athena?.items?.[guid]?.templateId;
        if (tid) out.set(accountId, tid);
    }));
    return out;
}

function permissionPack(discordId) {
    if (!discordId) return null;
    const pack = permstore.getUserPack(String(discordId));
    return pack && permstore.PERM_PACKS[pack] ? pack : null;
}
function botPermissions(discordId) {
    const pack = permissionPack(discordId);
    if (!pack) return [];
    const cmds = permstore.PERM_PACKS[pack];
    return [`${pack} permission`, ...(cmds.includes("*") ? ["command.all"] : cmds.map(c => "/" + c))];
}

module.exports = { equippedCharacters, permissionPack, botPermissions };
