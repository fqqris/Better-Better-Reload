const express = require("express");
const app = express.Router();

const { verifyToken } = require("../tokenManager/tokenVerify.js");
const Profiles = require("../model/profiles.js");
const UserStats = require("../model/userstats.js");
const Arena = require("../model/arena.js");
const Matches = require("../model/matches.js");

const MODES = ["solo", "duo", "trio", "squad", "ltm"];
function sumStat(stats, ...keys) {
    let total = 0;
    for (const mode of MODES) {
        const bucket = stats && stats[mode];
        if (!bucket) continue;
        for (const k of keys) {
            if (typeof bucket[k] === "number") { total += bucket[k]; break; }
        }
    }
    return total;
}

app.get("/launcher/stats", verifyToken, async (req, res) => {
    const accountId = req.user.accountId;

    try {
        const [profileDoc, statsDoc, arena, matchAgg] = await Promise.all([
            Profiles.findOne({ accountId }).lean(),
            UserStats.findOne({ accountId }).lean(),
            Arena.findOne({ accountId }).lean(),
            Matches.aggregate([
                { $match: { accountId, state: "finished", endedAt: { $ne: null } } },
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 },
                        ms: { $sum: { $subtract: ["$endedAt", "$startedAt"] } },
                        kills: { $sum: { $ifNull: ["$reportedKills", { $max: ["$killEvents", "$presenceKills"] }] } },
                        wins: { $sum: { $cond: [{ $eq: ["$placement", 1] }, 1, 0] } },
                    },
                },
            ]),
        ]);

        const m = matchAgg[0] || { count: 0, ms: 0, kills: 0, wins: 0 };
        const profiles = (profileDoc && profileDoc.profiles) || {};
        let vbucks = 0;
        const items = (profiles.common_core && profiles.common_core.items) || {};
        for (const item of Object.values(items)) {
            if (item && typeof item.templateId === "string" && item.templateId.startsWith("Currency:Mtx")) {
                vbucks += Number(item.quantity) || 0;
            }
        }

        const attrs = (profiles.athena && profiles.athena.stats && profiles.athena.stats.attributes) || {};
        const kills = sumStat(statsDoc, "kills");
        const wins = sumStat(statsDoc, "wins");
        const played = sumStat(statsDoc, "matchesplayed");
        const minutes = sumStat(statsDoc, "minutesplayed");
        let skin = attrs.favorite_character || null;
        if (skin) {
            const athenaItem = profiles.athena && profiles.athena.items && profiles.athena.items[skin];
            if (athenaItem && athenaItem.templateId) skin = athenaItem.templateId;
        } else {
            const last = await Matches.findOne({ accountId, skin: { $ne: null } }).sort({ startedAt: -1 }).lean();
            skin = last ? last.skin : null;
        }
        if (skin) skin = skin.replace(/^AthenaCharacter:/i, "");

        res.json({
            skin,
            vbucks,
            level: attrs.level ?? attrs.book_level ?? 0,
            hype: arena ? arena.hype : 0,
            eliminations: kills || m.kills,
            wins: wins || m.wins,
            matches: played || m.count,
            timeAlive: minutes ? minutes * 60 : Math.round(m.ms / 1000),
        });
    } catch (err) {
        console.error("GET /launcher/stats failed:", err);
        res.status(500).json({ error: "stats_unavailable" });
    }
});

module.exports = app;