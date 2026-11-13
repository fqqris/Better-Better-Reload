const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const Bans = require("../model/bans.js");
const User = require("../model/user.js");
const matchTracker = require("../structs/matchtracker.js");

let queue = [];
// dumb shadow bans very shit :) - faris
let shadowQueue = [];
let matchTimer = null;
let countdown = 60;

module.exports = async (ws, req) => {
 const accountId = ws.accountId || (ws.accountId = await accountFromTicket(req));
    if (accountId) {
        const activeBan = await Bans.findOne({
            accountId,
            banType: "matchmaking",
            isActive: true,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        }).lean();
        if (activeBan) {
            log.debug(`Rejected matchmaking request from banned player (accountId: ${accountId}).`);
            MatchmakingBanned(ws, activeBan);
            ws.close();
            return;
        }
    }

    const ticketId = functions.MakeID().replace(/-/ig, "");
    const matchId = functions.MakeID().replace(/-/ig, "");
    const sessionId = functions.MakeID().replace(/-/ig, "");

    const player = {
        ws,
        accountId,
        ticketId,
        matchId,
        sessionId,
        state: "Connecting"
    };

    if (accountId) {
        const shadowBan = await Bans.findOne({
            accountId,
            banType: "shadow",
            isActive: true,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        }).lean();
        if (shadowBan) {
            log.debug(`Shadow-banned player queued, holding them in queue (accountId: ${accountId}).`);
            return holdInQueue(player);
        }
    }

    queue.push(player);
    log.debug(`Player joined matchmaking queue. Total: ${queue.length}`);

    if (queue.length === 1) {
        countdown = 60;
    } else {
        countdown = Math.max(0, countdown - 5);
    }

    ws.on('close', () => {
        queue = queue.filter(p => p.ws !== ws);
        log.debug(`Player left matchmaking queue. Total: ${queue.length}`);
        updateQueueConfigs();
    });

    Connecting(ws);
    await functions.sleep(800);
    Waiting(ws);
    await functions.sleep(1000);

    player.state = "Queued";
    updateQueueConfigs();

    startMatchmakingTimer();
};

function updateQueueConfigs() {
    queue.forEach(player => {
        if (player.state === "Queued") {
            Queued(player.ws, player.ticketId, queue.length, countdown);
        }
    });
}

function startMatchmakingTimer() {
    if (matchTimer) return;

    matchTimer = setInterval(() => {
        if (queue.length === 0) {
            clearInterval(matchTimer);
            matchTimer = null;
            return;
        }

        if (countdown > 0) {
            countdown--;

            queue.forEach(player => {
                if (player.state === "Queued") {
                    Queued(player.ws, player.ticketId, queue.length, countdown);
                }
            });
        } else {

            const matchPlayers = [...queue];
            queue = [];
            clearInterval(matchTimer);
            matchTimer = null;

            matchPlayers.forEach(async (player) => {
                SessionAssignment(player.ws, player.matchId);
                await functions.sleep(2000);
                Join(player.ws, player.matchId, player.sessionId);
                if (player.accountId && player.ws.readyState === 1) {
                    matchTracker.startMatch({ accountId: player.accountId, matchId: player.matchId, sessionId: player.sessionId, players: matchPlayers.length });
                }
            });
        }
    }, 1000);
}
async function accountFromTicket(req) {
    const auth = req && req.headers && req.headers.authorization;
    if (!auth) return null;
    const parts = String(auth).split(/\s+/).filter(p => p && p.length <= 128 && !/^(epic-signed|mms-player)$/i.test(p));
    if (!parts.length) return null;
    try {
        const user = await User.findOne({ matchmakingId: { $in: parts } }).select("accountId").lean();
        return user ? user.accountId : null;
    } catch { return null; }
}
async function holdInQueue(player) {
    let timer = null;
    shadowQueue.push(player);
    player.ws.on('close', () => {
        clearInterval(timer);
        shadowQueue = shadowQueue.filter(p => p !== player);
    });

    Connecting(player.ws);
    await functions.sleep(800);
    Waiting(player.ws);
    await functions.sleep(1000);
    if (player.ws.readyState !== 1) return;

    player.state = "Queued";
    const tick = () => {
        if (player.ws.readyState !== 1) return clearInterval(timer);
        Queued(player.ws, player.ticketId, queue.length + shadowQueue.length, Math.max(countdown, 30));
    };
    tick();
    timer = setInterval(tick, 5000);
}
function kickFromQueue(accountId) {
    if (!accountId) return false;
    const targets = [...queue, ...shadowQueue].filter(p => p.accountId === accountId);
    for (const p of targets) {
        try { p.ws.close(); } catch {}
    }
    return targets.length > 0;
}

function Connecting(ws) {
    ws.send(JSON.stringify({
        "payload": { "state": "Connecting" },
        "name": "StatusUpdate"
    }));
}

function MatchmakingBanned(ws, ban) {
    const reason = ban?.reason || "You have been banned from matchmaking.";
    const expiresAt = ban?.expiresAt ? new Date(ban.expiresAt).toISOString() : null;
    ws.send(JSON.stringify({
        "payload": {
            "state": "ErrorState",
            "error": "errors.com.epicgames.matchmaking.banned",
            "message": reason,
            "expiresAt": expiresAt
        },
        "name": "StatusUpdate"
    }));
}

function Waiting(ws) {
    ws.send(JSON.stringify({
        "payload": {
            "totalPlayers": 1,
            "connectedPlayers": 1,
            "state": "Waiting"
        },
        "name": "StatusUpdate"
    }));
}

function Queued(ws, ticketId, queuedCount, estimatedWait) {
    ws.send(JSON.stringify({
        "payload": {
            "ticketId": ticketId,
            "queuedPlayers": queuedCount,
            "estimatedWaitSec": estimatedWait,
            "status": {},
            "state": "Queued"
        },
        "name": "StatusUpdate"
    }));
}

function SessionAssignment(ws, matchId) {
    ws.send(JSON.stringify({
        "payload": {
            "matchId": matchId,
            "state": "SessionAssignment"
        },
        "name": "StatusUpdate"
    }));
}

function Join(ws, matchId, sessionId) {
    ws.send(JSON.stringify({
        "payload": {
            "matchId": matchId,
            "sessionId": sessionId,
            "joinDelaySec": 1
        },
        "name": "Play"
    }));
}

module.exports.kickFromQueue = kickFromQueue;
