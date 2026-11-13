const express = require("express");
const app = express.Router();
const fs = require("fs");
const path = require("path");
const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const Bans = require("../model/bans.js");
const Arena = require("../model/arena.js");
const UserStats = require("../model/userstats.js");
const Reports = require("../model/reports.js");
const Matches = require("../model/matches.js");
const profileCache = require("../structs/profileCache.js");
const functions = require("../structs/functions.js");
const matchTracker = require("../structs/matchtracker.js");
const matchmaker = require("../matchmaker/matchmaker.js");
const { equippedCharacters, permissionPack, botPermissions } = require("../structs/playerinfo.js");
let adminAuth, logAudit, getAdminName, atomicWrite;
try {
    ({ adminAuth, logAudit, getAdminName, atomicWrite } = require("./admin.js"));
} catch (err) {
    if (err.code !== "MODULE_NOT_FOUND" || !String(err.message).includes("admin.js")) throw err;
    adminAuth = (req, res) => res.status(503).json({ ok: false, error: "Admin panel is disabled (Api/admin.js not found)." });
    logAudit = () => {};
    getAdminName = () => "unknown";
    atomicWrite = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
const PURCHASE_NOTES_PATH = path.join(__dirname, "..", "Config", "purchase_notes.json");

const REPORT_STATUSES = ["unreviewed", "action_taken", "dismissed"];
const HISTORY_PATH = "profiles.common_core.stats.attributes.mtx_purchase_history.purchases";
const fail = (res, status, error) => res.status(status).json({ ok: false, error });
const escRx = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const onlineIds = () => new Set((global.Clients || []).map(c => c.accountId));

function paging(req, def, max) {
    const limit = Math.min(max, Math.max(1, parseInt(req.query.limit, 10) || def));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    return { limit, page, skip: (page - 1) * limit };
}
async function findUser(id, select = "-password") {
    id = String(id || "");
    if (/^[a-f0-9]{24}$/i.test(id)) {
        const byId = await User.findById(id).select(select).lean();
        if (byId) return byId;
    }
    return id ? User.findOne({ accountId: id }).select(select).lean() : null;
}
function brief(u, skins, online) {
    if (!u) return null;
    return {
        _id: String(u._id), accountId: u.accountId, username: u.username,
        discordId: u.discordId || null, banned: !!u.banned,
        online: online ? online.has(u.accountId) : false,
        lastLogin: u.lastLogin || null, created: u.created || null,
        equippedCharacter: (skins && skins.get(u.accountId)) || null,
        role: permissionPack(u.discordId),
    };
}
async function briefsByAccountId(accountIds) {
    const ids = [...new Set(accountIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const [users, skins] = await Promise.all([
        User.find({ accountId: { $in: ids } }).select("_id accountId username discordId banned lastLogin created").lean(),
        equippedCharacters(ids),
    ]);
    const online = onlineIds();
    return new Map(users.map(u => [u.accountId, brief(u, skins, online)]));
}

function equippedFromAthena(athena) {
    const fav = athena?.stats?.attributes?.favorite_character;
    if (typeof fav !== "string" || !fav) return null;
    return fav.includes(":") ? fav : (athena.items?.[fav]?.templateId || null);
}
function loadNotes() {
    try { return JSON.parse(fs.readFileSync(PURCHASE_NOTES_PATH, "utf8")); } catch { return {}; }
}
function saveNotes(notes) { atomicWrite(PURCHASE_NOTES_PATH, notes); }

function purchaseOut(p, owner, note) {
    const fake = p.offerId === `v2:/${p.purchaseId}`;
    return {
        _id: p.purchaseId,
        accountId: owner ? owner.accountId : undefined,
        user: owner || undefined,
        offerId: p.metadata?.offerId || (fake ? "" : p.offerId || ""),
        grants: (p.lootResult || []).map(l => ({ templateId: l.itemType, quantity: l.quantity || 1 })),
        totalPrice: typeof p.totalMtxPaid === "number" ? p.totalMtxPaid : null,
        currency: "MtxCurrency",
        createdAt: p.purchaseDate || null,
        status: p.refundDate ? "refunded" : "completed",
        refundedAt: p.refundDate || null,
        refundedBy: note?.refundedBy || (p.refundDate ? "Player (in-game return)" : ""),
        flagged: !!note?.flagged,
        flagNote: note?.flagNote || "",
        flaggedBy: note?.flaggedBy || "",
    };
}

function historyOf(profileDoc) {
    const list = profileDoc?.profiles?.common_core?.stats?.attributes?.mtx_purchase_history?.purchases;
    return (Array.isArray(list) ? list : [])
        .filter(p => p && p.purchaseId)
        .sort((a, b) => String(b.purchaseDate || "").localeCompare(String(a.purchaseDate || "")));
}
const BUILTIN_PERKS = {
    currency:         { min: 0, max: 1e9,  int: true },
    level:            { min: 1, max: 1e5,  int: true },
    "pass.purchased": { min: 0, max: 1,    int: true },
    receive_gifts:    { min: 0, max: 1,    int: true },
    refunds_left:     { min: 0, max: 1000, int: true },
};
const PERK_KEY = /^[A-Za-z0-9_:-]+(\.[A-Za-z0-9_:-]+)*$/;
const BAD_SEGMENT = /^(__proto__|constructor|prototype)$/;

function flatten(obj, prefix = "", out = {}) {
    if (!obj || typeof obj !== "object") return out;
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? prefix + "." + k : k;
        if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
        else out[key] = v;
    }
    return out;
}

function mtxQuantity(section) {
    const item = Object.values(section?.items || {}).find(i => i.templateId === "Currency:MtxPurchased");
    return item ? item.quantity || 0 : 0;
}
function setMtx(section, amount) {
    if (!section) return false;
    section.items = section.items || {};
    const entry = Object.entries(section.items).find(([, i]) => i.templateId === "Currency:MtxPurchased");
    if (entry) section.items[entry[0]].quantity = amount;
    else section.items[functions.MakeID()] = { templateId: "Currency:MtxPurchased", attributes: { platform: "EpicPC" }, quantity: amount };
    return true;
}
const bump = p => { p.rvn = (p.rvn || 0) + 1; p.commandRevision = (p.commandRevision || 0) + 1; };

function builtinPerks(profileDoc) {
    const athena = profileDoc?.profiles?.athena, cc = profileDoc?.profiles?.common_core;
    const out = {};
    if (cc) {
        out.currency = mtxQuantity(cc);
        out.receive_gifts = cc.stats?.attributes?.allowed_to_receive_gifts === false ? 0 : 1;
        const credits = cc.stats?.attributes?.mtx_purchase_history?.refundCredits;
        if (typeof credits === "number") out.refunds_left = credits;
    }
    if (athena) {
        out.level = athena.stats?.attributes?.level || 1;
        out["pass.purchased"] = athena.stats?.attributes?.book_purchased ? 1 : 0;
    }
    return out;
}
const INVENTORY_SKIP = /^(CosmeticLocker|Quest|ChallengeBundle|ChallengeBundleSchedule|AthenaRewardGraph|AthenaRewardEventGraph|AthenaRewardEventGraphCosmetic|AthenaSeason|Token|BannerToken|AccountResource|Currency)$/i;
const INVENTORY_ORDER = ["AthenaCharacter", "AthenaBackpack", "AthenaPickaxe", "AthenaGlider", "AthenaSkyDiveContrail", "AthenaDance", "AthenaItemWrap", "AthenaMusicPack", "AthenaLoadingScreen"];

function inventoryOf(athena) {
    const rank = t => { const i = INVENTORY_ORDER.indexOf(t); return i === -1 ? INVENTORY_ORDER.length : i; };
    return Object.entries(athena?.items || {})
        .filter(([, it]) => it && typeof it.templateId === "string" && !INVENTORY_SKIP.test(it.templateId.split(":")[0]))
        .map(([itemId, it]) => ({ itemId, templateId: it.templateId, quantity: it.quantity || 1 }))
        .sort((a, b) => rank(a.templateId.split(":")[0]) - rank(b.templateId.split(":")[0]) || a.templateId.localeCompare(b.templateId));
}

async function matchScores(accountId) {
    const [agg] = await Matches.aggregate([
        { $match: { accountId, state: { $ne: "in_progress" } } },
        { $group: {
            _id: null,
            played: { $sum: 1 },
            wins: { $sum: { $cond: [{ $eq: ["$placement", 1] }, 1, 0] } },
            kills: { $sum: { $ifNull: ["$reportedKills", { $max: ["$killEvents", "$presenceKills"] }] } },
            points: { $sum: { $ifNull: ["$points", 0] } },
        } },
    ]);
    return agg || { played: 0, wins: 0, kills: 0, points: 0 };
}

app.get("/admin/api/users/:id/details", adminAuth, async (req, res) => {
    try {
        const user = await findUser(req.params.id);
        if (!user) return fail(res, 404, "User not found");
        const accountId = user.accountId;
        const hashes = Array.isArray(user.ipHashes) ? user.ipHashes : [];

        const [profileDoc, bans, reportCount, arena, stats, mscore, relatedUsers] = await Promise.all([
            Profile.findOne({ accountId }).lean(),
            Bans.find({ accountId }).sort({ bannedAt: -1 }).lean(),
            Reports.countDocuments({ reportedId: accountId }),
            Arena.findOne({ accountId }).lean(),
            UserStats.findOne({ accountId }).lean(),
            matchScores(accountId),
            hashes.length
                ? User.find({ _id: { $ne: user._id }, ipHashes: { $in: hashes } }).select("_id accountId username discordId banned lastLogin created").limit(50).lean()
                : [],
        ]);
        const now = Date.now();
        const staleAccountBans = [];
        const banList = bans.map(b => {
            const out = { ...b, expired: b.isActive && b.expiresAt ? new Date(b.expiresAt).getTime() <= now : false };
            if (b.banType === "account" && b.isActive && !user.banned) {
                out.isActive = false;
                staleAccountBans.push(b._id);
            }
            return out;
        });
        if (staleAccountBans.length) Bans.updateMany({ _id: { $in: staleAccountBans } }, { $set: { isActive: false } }).catch(() => {});

        const athena = profileDoc?.profiles?.athena;
        const cc = profileDoc?.profiles?.common_core;
        const online = onlineIds();

        const scores = {
            "arena.hype": arena?.hype ?? 0,
            "arena.division": arena?.division ?? 0,
            "matches.played": mscore.played,
            "matches.wins": mscore.wins,
            "matches.kills": mscore.kills,
        };
        if (mscore.points) scores["matches.points"] = mscore.points;
        for (const mode of ["solo", "duo", "trio", "squad", "ltm"]) {
            for (const [k, v] of Object.entries(stats?.[mode] || {})) if (typeof v === "number") scores[`${mode}.${k}`] = v;
        }

        const skins = await equippedCharacters(relatedUsers.map(u => u.accountId));
        const related = relatedUsers.map(u => ({ ...brief(u, skins, online), relation: "Shared login IP" }));

        const notes = loadNotes();
        const owner = brief(user, new Map([[accountId, equippedFromAthena(athena)]]), online);
        const purchases = historyOf(profileDoc).map(p => purchaseOut(p, owner, notes[p.purchaseId]));

        const profilePermissions = Array.isArray(cc?.stats?.attributes?.permissions) ? cc.stats.attributes.permissions.map(String) : [];
        const { password, ipHashes, ...safeUser } = user;

        return res.json({
            ok: true,
            user: {
                ...safeUser,
                online: online.has(accountId),
                role: permissionPack(user.discordId),
                equippedCharacter: equippedFromAthena(athena),
            },
            permissions: [...botPermissions(user.discordId), ...profilePermissions],
            bans: banList,
            inventory: inventoryOf(athena),
            perks: { ...flatten(user.perks), ...builtinPerks(profileDoc) },
            scores,
            related,
            purchases,
            reportCount,
            packages: Array.isArray(user.grantedPackages) ? user.grantedPackages : [],
            bundles: (Array.isArray(user.receivedGrants) ? user.receivedGrants : [])
                .map(g => ({ grantId: g.grantId, bundleName: g.bundleName || "", grantedAt: g.grantedAt })),
        });
    } catch (err) { return fail(res, 500, err.message); }
})
app.get("/admin/api/users/:id/matches", adminAuth, async (req, res) => {
    try {
        const user = await findUser(req.params.id, "accountId");
        if (!user) return fail(res, 404, "User not found");
        const { limit, page, skip } = paging(req, 25, 100);
        const filter = { accountId: user.accountId, state: { $ne: "in_progress" } };
        const [total, rows] = await Promise.all([
            Matches.countDocuments(filter),
            Matches.find(filter).sort({ startedAt: -1 }).skip(skip).limit(limit).lean(),
        ]);
        return res.json({ ok: true, matches: rows.map(matchTracker.matchOut), total, page, limit });
    } catch (err) { return fail(res, 500, err.message); }
});
app.put("/admin/api/users/:id/perks", adminAuth, async (req, res) => {
    try {
        const input = req.body && req.body.perks;
        if (!input || typeof input !== "object" || Array.isArray(input) || !Object.keys(input).length)
            return fail(res, 400, "perks must be an object of key: value");
        const builtin = {}, custom = {};
        for (const [key, raw] of Object.entries(input)) {
            if (key.length > 64 || !PERK_KEY.test(key) || key.split(".").some(s => BAD_SEGMENT.test(s)))
                return fail(res, 400, `"${key}" isn't a valid perk key`);
            const spec = BUILTIN_PERKS[key];
            if (spec) {
                const n = Number(raw);
                if (raw === "" || raw === null || typeof raw === "boolean" || !Number.isFinite(n) || n < spec.min || n > spec.max || (spec.int && !Number.isInteger(n)))
                    return fail(res, 400, `${key} must be a whole number from ${spec.min} to ${spec.max}`);
                builtin[key] = n;
            } else if (typeof raw === "number" ? Number.isFinite(raw) : typeof raw === "boolean" || (typeof raw === "string" && raw.length <= 200)) {
                custom[key] = raw;
            } else {
                return fail(res, 400, `${key} must be a number, true/false or short text`);
            }
        }

        const user = await findUser(req.params.id);
        if (!user) return fail(res, 404, "User not found");

        if (Object.keys(builtin).length) {
            const profiles = await profileCache.getProfile(user.accountId);
            if (!profiles) return fail(res, 404, "Profile not found");
            const athena = profiles.profiles.athena, cc = profiles.profiles.common_core, p0 = profiles.profiles.profile0;
            const update = {};
            if ("currency" in builtin) {
                if (!cc) return fail(res, 404, "common_core profile not found");
                setMtx(cc, builtin.currency); bump(cc); update["profiles.common_core"] = cc;
                if (p0 && p0 !== cc) { setMtx(p0, builtin.currency); bump(p0); update["profiles.profile0"] = p0; }
            }
            if ("receive_gifts" in builtin || "refunds_left" in builtin) {
                if (!cc) return fail(res, 404, "common_core profile not found");
                cc.stats = cc.stats || {}; cc.stats.attributes = cc.stats.attributes || {};
                if ("receive_gifts" in builtin) cc.stats.attributes.allowed_to_receive_gifts = builtin.receive_gifts === 1;
                if ("refunds_left" in builtin) {
                    const h = cc.stats.attributes.mtx_purchase_history || (cc.stats.attributes.mtx_purchase_history = { refundsUsed: 0, refundCredits: 0, purchases: [] });
                    h.refundCredits = builtin.refunds_left;
                }
                if (!update["profiles.common_core"]) { bump(cc); update["profiles.common_core"] = cc; }
            }
            if ("level" in builtin || "pass.purchased" in builtin) {
                if (!athena) return fail(res, 404, "athena profile not found");
                const attrs = athena.stats.attributes;
                if ("level" in builtin) {
                    attrs.level = builtin.level;
                    attrs.accountLevel = builtin.level;
                    if (attrs.book_level !== undefined) attrs.book_level = builtin.level;
                    attrs.xp = 0;
                    if (attrs.book_xp !== undefined) attrs.book_xp = 0;
                }
                if ("pass.purchased" in builtin) attrs.book_purchased = builtin["pass.purchased"] === 1;
                bump(athena); update["profiles.athena"] = athena;
            }
            await profiles.updateOne({ $set: update });
        }

        if (Object.keys(custom).length) {
            const set = {};
            for (const [k, v] of Object.entries(custom)) set["perks." + k] = v;
            await User.updateOne({ _id: user._id }, { $set: set });
        }

        for (const [k, v] of Object.entries({ ...builtin, ...custom }))
            logAudit(req, { action: "Updated perk", category: "Users", targetId: String(user._id), targetLabel: user.username, details: `${k}: ${v}` });
        return res.json({ ok: true, perks: { ...builtin, ...custom } });
    } catch (err) { return fail(res, 500, err.message); }
});

app.delete("/admin/api/users/:id/perks/:key", adminAuth, async (req, res) => {
    try {
        const key = String(req.params.key);
        if (BUILTIN_PERKS[key]) return fail(res, 400, `${key} is a game value and can't be deleted. Set it to 0 instead.`);
        if (!PERK_KEY.test(key) || key.split(".").some(s => BAD_SEGMENT.test(s))) return fail(res, 400, "Invalid perk key");
        const user = await findUser(req.params.id, "_id username perks");
        if (!user) return fail(res, 404, "User not found");
        if (!(key in flatten(user.perks))) return fail(res, 404, `${key} isn't set on this account`);
        await User.updateOne({ _id: user._id }, { $unset: { ["perks." + key]: "" } });
        logAudit(req, { action: "Removed perk", category: "Users", targetId: String(user._id), targetLabel: user.username, details: key });
        return res.json({ ok: true });
    } catch (err) { return fail(res, 500, err.message); }
});
const SCORE_MODES = ["solo", "duo", "trio", "squad", "ltm"];
const ARENA_SCORE_LIMITS = { "arena.hype": [0, 10000000], "arena.division": [0, 100] };

app.put("/admin/api/users/:id/scores", adminAuth, async (req, res) => {
    try {
        const input = req.body && req.body.scores;
        if (!input || typeof input !== "object" || Array.isArray(input) || !Object.keys(input).length)
            return fail(res, 400, "scores must be an object of key: value");

        const arenaSet = {}, statSet = {};
        for (const [key, raw] of Object.entries(input)) {
            if (key.length > 64 || !PERK_KEY.test(key) || key.split(".").some(sg => BAD_SEGMENT.test(sg)))
                return fail(res, 400, `"${key}" isn't a valid score key`);
            const n = Number(raw);
            if (raw === "" || raw === null || typeof raw === "boolean" || !Number.isFinite(n))
                return fail(res, 400, `${key} must be a number`);
            if (key.startsWith("matches."))
                return fail(res, 400, `${key} is calculated from match history and can't be edited`);
            if (ARENA_SCORE_LIMITS[key]) {
                const [min, max] = ARENA_SCORE_LIMITS[key];
                if (!Number.isInteger(n) || n < min || n > max) return fail(res, 400, `${key} must be a whole number from ${min} to ${max}`);
                arenaSet[key.slice("arena.".length)] = n;
                continue;
            }
            const [mode, ...rest] = key.split(".");
            if (!SCORE_MODES.includes(mode) || !rest.length) return fail(res, 400, `"${key}" can't be edited`);
            if (n < 0 || n > 1e12) return fail(res, 400, `${key} must be between 0 and 1e12`);
            statSet[key] = n;
        }

        const user = await findUser(req.params.id, "_id username accountId");
        if (!user) return fail(res, 404, "User not found");

        if (Object.keys(statSet).length) {
            const stats = await UserStats.findOne({ accountId: user.accountId }).lean();
            for (const key of Object.keys(statSet)) {
                const cur = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), stats);
                if (typeof cur !== "number") return fail(res, 400, `${key} isn't a stat on this account`);
            }
            await UserStats.updateOne({ accountId: user.accountId }, { $set: statSet });
        }
        if (Object.keys(arenaSet).length) {
            await Arena.updateOne({ accountId: user.accountId }, { $set: arenaSet }, { upsert: true, setDefaultsOnInsert: true });
        }

        for (const [k, v] of Object.entries(input))
            logAudit(req, { action: "Updated score", category: "Users", targetId: String(user._id), targetLabel: user.username, details: `${k}: ${v}` });
        return res.json({ ok: true, scores: input });
    } catch (err) { return fail(res, 500, err.message); }
});
app.post("/admin/api/users/:id/kick-match", adminAuth, async (req, res) => {
    try {
        const user = await findUser(req.params.id, "_id accountId username");
        if (!user) return fail(res, 404, "User not found");
        const removedFromQueue = matchmaker.kickFromQueue(user.accountId);
        const match = await matchTracker.kick(user.accountId, getAdminName(req));
        if (!removedFromQueue && !match) return fail(res, 404, "Player isn't in matchmaking or a match");
        logAudit(req, {
            action: "Kicked player from match", category: "Users", targetId: String(user._id), targetLabel: user.username,
            details: [removedFromQueue && "removed from matchmaking queue", match && "match ended"].filter(Boolean).join(", "),
        });
        return res.json({ ok: true, removedFromQueue, endedMatch: match ? matchTracker.matchOut(match) : null });
    } catch (err) { return fail(res, 500, err.message); }
});
app.get("/admin/api/purchases", adminAuth, async (req, res) => {
    try {
        const { limit, page, skip } = paging(req, 50, 200);
        const notes = loadNotes();
        const match = {};
        const status = String(req.query.status || "").toLowerCase();
        if (status === "refunded") match["p.refundDate"] = { $nin: [null, ""], $exists: true };
        else if (status === "completed") match["p.refundDate"] = { $in: [null, ""] };
        if (req.query.flagged === "true") match["p.purchaseId"] = { $in: Object.keys(notes).filter(id => notes[id].flagged) };

        const q = String(req.query.search || "").trim().slice(0, 100);
        if (q) {
            const rx = new RegExp(escRx(q), "i");
            const users = await User.find({ $or: [{ username: rx }, { accountId: rx }, { discordId: rx }] }).select("accountId").limit(500).lean();
            match.$or = [
                { accountId: { $in: users.map(u => u.accountId) } },
                { "p.purchaseId": rx }, { "p.metadata.offerId": rx }, { "p.lootResult.itemType": rx },
            ];
        }

        const [out] = await Profile.aggregate([
            { $match: { [HISTORY_PATH + ".0"]: { $exists: true } } },
            { $project: { _id: 0, accountId: 1, p: "$" + HISTORY_PATH } },
            { $unwind: "$p" },
            { $match: match },
            { $sort: { "p.purchaseDate": -1 } },
            { $facet: { total: [{ $count: "n" }], rows: [{ $skip: skip }, { $limit: limit }] } },
        ]);
        const rows = out ? out.rows : [];
        const owners = await briefsByAccountId(rows.map(r => r.accountId));
        return res.json({
            ok: true,
            purchases: rows.map(r => purchaseOut(r.p, owners.get(r.accountId) || { accountId: r.accountId, username: "Deleted account" }, notes[r.p.purchaseId])),
            total: out && out.total[0] ? out.total[0].n : 0,
            page, limit,
        });
    } catch (err) { return fail(res, 500, err.message); }
});

async function findPurchaseOwner(purchaseId) {
    return Profile.findOne({ [HISTORY_PATH + ".purchaseId"]: String(purchaseId) }).select("accountId").lean();
}
app.post("/admin/api/purchases/:id/refund", adminAuth, async (req, res) => {
    try {
        const purchaseId = String(req.params.id);
        const ownerDoc = await findPurchaseOwner(purchaseId);
        if (!ownerDoc) return fail(res, 404, "Purchase not found");
        const profiles = await profileCache.getProfile(ownerDoc.accountId);
        if (!profiles) return fail(res, 404, "Profile not found");
        const cc = profiles.profiles.common_core, p0 = profiles.profiles.profile0, athena = profiles.profiles.athena;
        const purchase = (cc.stats.attributes.mtx_purchase_history.purchases || []).find(p => p.purchaseId === purchaseId);
        if (!purchase) return fail(res, 404, "Purchase not found");
        if (purchase.refundDate) return fail(res, 409, "This purchase was already refunded");

        const refundedAt = new Date().toISOString();
        const paid = Number(purchase.totalMtxPaid) || 0;
        purchase.refundDate = refundedAt;
        if (paid) setMtx(cc, mtxQuantity(cc) + paid);
        const mirror = p0 && p0 !== cc ? (p0.stats?.attributes?.mtx_purchase_history?.purchases || []).find(p => p.purchaseId === purchaseId) : null;
        if (mirror) mirror.refundDate = refundedAt;
        if (p0 && p0 !== cc && paid) setMtx(p0, mtxQuantity(p0) + paid);

        let removed = 0;
        for (const loot of purchase.lootResult || []) {
            if (loot.itemProfile && loot.itemProfile !== "athena") continue;
            if (athena.items && athena.items[loot.itemGuid]) { delete athena.items[loot.itemGuid]; removed++; }
        }

        bump(cc);
        const update = { "profiles.common_core": cc };
        if (p0 && p0 !== cc) { bump(p0); update["profiles.profile0"] = p0; }
        if (removed) { bump(athena); update["profiles.athena"] = athena; }
        await profiles.updateOne({ $set: update });

        const notes = loadNotes();
        notes[purchaseId] = { ...(notes[purchaseId] || {}), refundedBy: getAdminName(req), refundedAt };
        saveNotes(notes);

        const owner = await User.findOne({ accountId: ownerDoc.accountId }).select("_id accountId username discordId banned lastLogin created").lean();
        logAudit(req, { action: "Refunded purchase", category: "Users", targetId: owner ? String(owner._id) : ownerDoc.accountId, targetLabel: owner ? owner.username : ownerDoc.accountId, details: `${paid} V-Bucks, ${removed} item${removed === 1 ? "" : "s"} removed (${purchaseId})` });
        return res.json({ ok: true, purchase: purchaseOut(purchase, brief(owner, null, onlineIds()), notes[purchaseId]), removed });
    } catch (err) { return fail(res, 500, err.message); }
});
app.post("/admin/api/purchases/:id/regrant", adminAuth, async (req, res) => {
    try {
        const purchaseId = String(req.params.id);
        const ownerDoc = await findPurchaseOwner(purchaseId);
        if (!ownerDoc) return fail(res, 404, "Purchase not found");
        const profiles = await profileCache.getProfile(ownerDoc.accountId);
        if (!profiles) return fail(res, 404, "Profile not found");
        const athena = profiles.profiles.athena;
        if (!athena) return fail(res, 404, "athena profile not found");
        const purchase = (profiles.profiles.common_core?.stats?.attributes?.mtx_purchase_history?.purchases || []).find(p => p.purchaseId === purchaseId);
        if (!purchase) return fail(res, 404, "Purchase not found");

        athena.items = athena.items || {};
        const owned = new Set(Object.values(athena.items).map(i => String(i && i.templateId || "").toLowerCase()));
        const granted = [];
        let alreadyOwned = 0;
        for (const loot of purchase.lootResult || []) {
            if (loot.itemProfile && loot.itemProfile !== "athena") continue;
            const templateId = loot.itemType;
            if (!templateId) continue;
            if (owned.has(String(templateId).toLowerCase())) { alreadyOwned++; continue; }
            const guid = loot.itemGuid && !athena.items[loot.itemGuid] ? loot.itemGuid : functions.MakeID();
            athena.items[guid] = { templateId, attributes: { item_seen: false, variants: [] }, quantity: Math.max(1, Number(loot.quantity) || 1) };
            owned.add(String(templateId).toLowerCase());
            granted.push(templateId);
        }

        if (granted.length) {
            bump(athena);
            await profiles.updateOne({ $set: { "profiles.athena": athena } });
        }

        const owner = await User.findOne({ accountId: ownerDoc.accountId }).select("_id username").lean();
        logAudit(req, { action: "Regranted purchase items", category: "Users", targetId: owner ? String(owner._id) : ownerDoc.accountId, targetLabel: owner ? owner.username : ownerDoc.accountId, details: `${granted.length} granted, ${alreadyOwned} already owned (${purchaseId})` });
        return res.json({ ok: true, granted: granted.length, alreadyOwned, items: granted });
    } catch (err) { return fail(res, 500, err.message); }
});
app.post("/admin/api/purchases/:id/flag", adminAuth, async (req, res) => {
    try {
        const purchaseId = String(req.params.id);
        const flagged = req.body && req.body.flagged !== false;
        if (!(await findPurchaseOwner(purchaseId))) return fail(res, 404, "Purchase not found");
        const notes = loadNotes();
        const entry = { ...(notes[purchaseId] || {}) };
        if (flagged) Object.assign(entry, { flagged: true, flagNote: String(req.body.note || "").slice(0, 300), flaggedBy: getAdminName(req), flaggedAt: Date.now() });
        else { delete entry.flagged; delete entry.flagNote; delete entry.flaggedBy; delete entry.flaggedAt; }
        if (Object.keys(entry).length) notes[purchaseId] = entry; else delete notes[purchaseId];
        saveNotes(notes);
        logAudit(req, { action: flagged ? "Flagged purchase" : "Removed purchase flag", category: "Users", targetLabel: purchaseId, details: flagged ? entry.flagNote : "" });
        return res.json({ ok: true, flagged, note: entry.flagNote || "" });
    } catch (err) { return fail(res, 500, err.message); }
});
function reportOut(r, people) {
    const person = (id, name) => people.get(id) || { accountId: id, username: name || "Unknown" };
    return {
        _id: String(r._id),
        reason: r.reason,
        description: r.details || "",
        createdAt: r.createdAt,
        status: r.status,
        reporter: person(r.reporterId, r.reporterName),
        reported: person(r.reportedId, r.reportedName),
        reviewedBy: r.reviewedBy || "",
        reviewedAt: r.reviewedAt || null,
        note: r.note || "",
        matchId: r.gameSessionId || "",
        playlist: r.playlistName || "",
    };
}

app.get("/admin/api/reports", adminAuth, async (req, res) => {
    try {
        const { limit, page, skip } = paging(req, 50, 200);
        const filter = {};
        for (const [param, field] of [["reportedId", "reportedId"], ["reporterId", "reporterId"]]) {
            if (!req.query[param]) continue;
            const u = await findUser(req.query[param], "accountId");
            filter[field] = u ? u.accountId : String(req.query[param]);
        }
        const status = String(req.query.status || "").toLowerCase();
        if (REPORT_STATUSES.includes(status)) filter.status = status;
        const q = String(req.query.search || "").trim().slice(0, 100);
        if (q) {
            const rx = new RegExp(escRx(q), "i");
            const users = await User.find({ $or: [{ username: rx }, { accountId: rx }] }).select("accountId").limit(500).lean();
            const ids = users.map(u => u.accountId);
            filter.$or = [
                { reason: rx }, { details: rx }, { reporterName: rx }, { reportedName: rx },
                { reportedId: { $in: ids } }, { reporterId: { $in: ids } },
            ];
            if (/^[a-f0-9]{24}$/i.test(q)) filter.$or.push({ _id: q });
        }
        const [total, rows] = await Promise.all([
            Reports.countDocuments(filter),
            Reports.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        ]);
        const people = await briefsByAccountId(rows.flatMap(r => [r.reporterId, r.reportedId]));
        return res.json({ ok: true, reports: rows.map(r => reportOut(r, people)), total, page, limit });
    } catch (err) { return fail(res, 500, err.message); }
});

app.post("/admin/api/reports/:id/review", adminAuth, async (req, res) => {
    try {
        if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return fail(res, 404, "Report not found");
        const status = String((req.body && req.body.status) || "").toLowerCase();
        if (!REPORT_STATUSES.includes(status)) return fail(res, 400, `status must be one of: ${REPORT_STATUSES.join(", ")}`);
        const note = String((req.body && req.body.note) || "").slice(0, 500);
        const reviewed = status !== "unreviewed";
        const r = await Reports.findByIdAndUpdate(req.params.id, { $set: {
            status, note,
            reviewedBy: reviewed ? getAdminName(req) : null,
            reviewedAt: reviewed ? new Date() : null,
        } }, { new: true }).lean();
        if (!r) return fail(res, 404, "Report not found");
        logAudit(req, { action: "Reviewed report", category: "Users", targetLabel: r.reportedName || r.reportedId, details: `${status.replace("_", " ")}${note ? " — " + note : ""}` });
        const people = await briefsByAccountId([r.reporterId, r.reportedId]);
        return res.json({ ok: true, report: reportOut(r, people) });
    } catch (err) { return fail(res, 500, err.message); }
});
function gameServerAuth(req, res, next) {
    const key = req.query.apikey || (req.body && req.body.apikey) || req.headers["x-api-key"];
    if (!config.Api || !config.Api.bApiKey || key !== config.Api.bApiKey)
        return res.status(401).json({ code: "401", error: "Invalid or missing API key." });
    next();
}

async function reportMatch(req, res) {
    try {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const list = Array.isArray(body.results) ? body.results.slice(0, 200) : [{ ...req.query, ...body }];
        const results = [];
        for (const r of list) {
            const user = r.accountId
                ? await User.findOne({ accountId: String(r.accountId) }).select("accountId username").lean()
                : r.username ? await User.findOne({ username_lower: String(r.username).trim().toLowerCase() }).select("accountId username").lean() : null;
            if (!user) { results.push({ ok: false, username: r.username || r.accountId || null, error: "User not found" }); continue; }
            const m = await matchTracker.report(user.accountId, r);
            results.push({ ok: true, username: user.username, match: m ? matchTracker.matchOut(m) : null });
        }
        if (!Array.isArray(body.results)) {
            const one = results[0];
            return one.ok ? res.json(one) : res.status(404).json({ code: "404", error: one.error });
        }
        return res.json({ ok: true, results });
    } catch (err) { return res.status(500).json({ code: "500", error: err.message }); }
}
app.get("/api/reload/match", gameServerAuth, reportMatch);
app.post("/api/reload/match", gameServerAuth, reportMatch);
app.get("/api/reload/match/kicks", gameServerAuth, (req, res) => {
    res.json({ ok: true, kicks: matchTracker.takePendingKicks() });
});

module.exports = app;