const fs = require("fs");
const Matches = require("../model/matches.js");
const log = require("./log.js");
const { equippedCharacters } = require("./playerinfo.js");

const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
const live = new Map();

const pendingKicks = new Map();

const STALE_MS = 3 * 60 * 60 * 1000; 

function quiet(p, what) {
    Promise.resolve(p).catch(err => log.debug(`matchtracker: ${what} failed - ${err.message}`));
}

async function serverFor(accountId, playlist) {
    try {
        const custom = await global.kv.get(`playerCustomKey:${accountId}`);
        if (custom) {
            const c = JSON.parse(custom);
            if (c && c.ip) return `${c.ip}:${c.port}`;
        }
    } catch {}
    if (!playlist) return null;
    const s = (config.gameServerIP || []).find(x => String(x).split(":")[2]?.toLowerCase() === playlist.toLowerCase());
    return s ? s.split(":").slice(0, 2).join(":") : null;
}


async function openMatchId(accountId) {
    const mem = live.get(accountId);
    if (mem) return mem.id;
    const doc = await Matches.findOne({ accountId, state: "in_progress", startedAt: { $gt: new Date(Date.now() - STALE_MS) } })
        .sort({ startedAt: -1 }).select("_id").lean();
    return doc ? doc._id : null;
}
async function finishOpen(accountId, { state = "finished", set = {}, knownEnd = true } = {}) {
    const mem = live.get(accountId);
    live.delete(accountId);
    const id = mem ? mem.id : await openMatchId(accountId);
    let doc = null;
    if (id) {
        const endedAt = knownEnd ? new Date() : (mem && mem.seen ? new Date(mem.lastActivity) : null);
        const finalState = endedAt ? state : "abandoned";
        doc = await Matches.findOneAndUpdate(
            { _id: id, state: "in_progress" },
            { $set: { state: finalState, endedAt, ...set } },
            { new: true }
        ).lean();
    }

    await Matches.updateMany({ accountId, state: "in_progress" }, { $set: { state: "abandoned" } });
    return doc;
}

async function startMatch({ accountId, matchId, sessionId, players }) {
    if (!accountId) return;
    try {
        await finishOpen(accountId, { knownEnd: false });
        const playlist = (await global.kv.get(`playerPlaylist:${accountId}`)) || null;
        const [server, skins] = await Promise.all([serverFor(accountId, playlist), equippedCharacters([accountId])]);
        const doc = await Matches.create({
            accountId, matchId, sessionId, playlist, server,
            skin: skins.get(accountId) || null,
            players: players || null,
            startedAt: new Date(),
        });
        live.set(accountId, { id: doc._id, sawPlaying: false, seen: false, lastActivity: Date.now(), presenceKills: 0, maxAlive: 0 });
    } catch (err) {
        log.debug(`matchtracker: startMatch failed for ${accountId} - ${err.message}`);
    }
}

function addKill(accountId) {
    quiet((async () => {
        const id = await openMatchId(accountId);
        if (!id) return;
        const mem = live.get(accountId);
        if (mem) { mem.seen = true; mem.lastActivity = Date.now(); }
        await Matches.updateOne({ _id: id }, { $inc: { killEvents: 1 } });
    })(), "addKill");
}

function recordWin(accountId) {
    quiet(finishOpen(accountId, { set: { placement: 1 } }), "recordWin");
}

function parseJ(v) {
    if (v && typeof v === "object") return v;
    if (typeof v !== "string") return null;
    try { return JSON.parse(v); } catch { return null; }
}

function onPresence(accountId, status) {
    const mem = live.get(accountId);
    if (!mem) return;
    const s = parseJ(status);
    if (!s) return;
    if (s.bIsPlaying === true) {
        mem.sawPlaying = mem.seen = true;
        mem.lastActivity = Date.now();
        const props = s.Properties && typeof s.Properties === "object" ? s.Properties : {};
        const kills = Number(parseJ(props.FortGameplayStats_j)?.numKills);
        const alive = Number(props.Event_PlayersAlive_s);
        const set = {};
        if (Number.isFinite(kills) && kills > mem.presenceKills) { mem.presenceKills = kills; set.presenceKills = kills; }
        if (Number.isFinite(alive) && alive > mem.maxAlive) { mem.maxAlive = alive; set.players = alive; }
        if (Object.keys(set).length) quiet(Matches.updateOne({ _id: mem.id }, { $max: set }), "presence update");
    } else if (s.bIsPlaying === false && mem.sawPlaying) {
        quiet(finishOpen(accountId), "presence end");
    }
}
function onDisconnect(accountId) {
    const mem = live.get(accountId);
    if (mem && mem.sawPlaying) quiet(finishOpen(accountId), "disconnect end");
}
async function kick(accountId, by) {
    const id = await openMatchId(accountId);
    if (!id) return null;
    pendingKicks.set(accountId, { at: Date.now(), by: by || "Admin" });
    return finishOpen(accountId, { state: "kicked" });
}

function takePendingKicks() {
    const out = [...pendingKicks.entries()].map(([accountId, k]) => ({ accountId, kickedAt: new Date(k.at).toISOString(), kickedBy: k.by }));
    pendingKicks.clear();
    return out;
}
async function report(accountId, r) {
    const num = v => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
    const set = {};
    if (num(r.kills) !== undefined) set.reportedKills = num(r.kills);
    if (num(r.placement) !== undefined) set.placement = num(r.placement);
    if (num(r.players) !== undefined) set.players = num(r.players);
    if (num(r.points) !== undefined) set.points = num(r.points);
    if (r.playlist) set.playlist = String(r.playlist).slice(0, 100);
    const finished = !(r.finished === false || r.finished === "false");

    let id = null;
    const ref = r.sessionId || r.matchId;
    if (ref) {
        const byRef = await Matches.findOne({ accountId, $or: [{ sessionId: String(ref) }, { matchId: String(ref) }] }).sort({ startedAt: -1 }).select("_id").lean();
        id = byRef ? byRef._id : null;
    }
    if (!id) id = await openMatchId(accountId);

    if (!id) {
        const alive = num(r.timeAlive);
        const endedAt = new Date();
        const startedAt = alive !== undefined ? new Date(endedAt.getTime() - alive * 1000) : endedAt;
        const skins = await equippedCharacters([accountId]);
        const doc = await Matches.create({
            accountId, sessionId: ref ? String(ref) : null, skin: skins.get(accountId) || null,
            ...set, startedAt, endedAt: finished ? endedAt : null,
            state: finished ? "finished" : "in_progress", source: "gameserver",
        });
        return doc.toObject();
    }

    if (finished) {
        const mem = live.get(accountId);
        if (mem && String(mem.id) === String(id)) live.delete(accountId);
        const alive = num(r.timeAlive);
        if (alive !== undefined) {
            const cur = await Matches.findById(id).select("startedAt").lean();
            if (cur && cur.startedAt) set.endedAt = new Date(new Date(cur.startedAt).getTime() + alive * 1000);
        }
        if (!set.endedAt) set.endedAt = new Date();
        set.state = "finished";
    }
    return Matches.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
}
function matchOut(m) {
    const kills = m.reportedKills != null ? m.reportedKills : Math.max(m.killEvents || 0, m.presenceKills || 0);
    return {
        _id: String(m._id),
        name: playlistName(m.playlist),
        playlist: m.playlist || "",
        kills,
        placement: m.placement,
        players: m.players,
        points: m.points,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        state: m.state,
        skin: m.skin || null,
        server: m.server || "",
        sessionId: m.sessionId || "",
    };
}
const PLAYLIST_NAMES = {
    defaultsolo: "Solo", defaultduo: "Duos", trios: "Trios", defaultsquad: "Squads",
    showdownalt_solo: "Arena Solo", showdownalt_duos: "Arena Duos", showdownalt_trios: "Arena Trios", showdownalt_squads: "Arena Squads",
    playground: "Playground", creative_playlist: "Creative",
};
function playlistName(p) {
    if (!p) return "Unknown playlist";
    const key = String(p).toLowerCase().replace(/^playlist_/, "");
    if (PLAYLIST_NAMES[key]) return PLAYLIST_NAMES[key];
    return key.split("_").filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

module.exports = { startMatch, addKill, recordWin, onPresence, onDisconnect, kick, takePendingKicks, report, matchOut, playlistName };
