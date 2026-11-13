const jwt = require("jsonwebtoken");

const User = require("../model/user.js");
const functions = require("../structs/functions.js");
const error = require("../structs/error.js");
const userCache = require("../structs/userCache.js");
function getUserWithTimeout(accountId) {
    return Promise.race([
        userCache.getUser(accountId),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("userCache.getUser timed out after 5000ms")), 5000),
        ),
    ]);
}

async function verifyToken(req, res, next) {
    let authErr = () => error.createError(
        "errors.com.epicgames.common.authorization.authorization_failed",
        `Authorization failed for ${req.originalUrl}`, 
        [req.originalUrl], 1032, undefined, 401, res
    );

    if (!req.headers["authorization"] || !req.headers["authorization"].startsWith("bearer eg1~")) return authErr();

    const token = req.headers["authorization"].replace("bearer eg1~", "");

    try {
        const decodedToken = jwt.decode(token);

        if (!global.accessTokens.find(i => i.token == `eg1~${token}`)) throw new Error("Invalid token.");

        if (DateAddHours(new Date(decodedToken.creation_date), decodedToken.hours_expire).getTime() <= new Date().getTime()) {
            throw new Error("Expired access token.");
        }

        req.user = await getUserWithTimeout(decodedToken.sub);

        if (req.user.banned) return error.createError(
            "manual_ban",
            "This account is locked", 
            [], -1, undefined, 400, res
        );

        next();
    } catch {
        let accessIndex = global.accessTokens.findIndex(i => i.token == `eg1~${token}`);
        if (accessIndex != -1) {
            global.accessTokens.splice(accessIndex, 1);

            functions.UpdateTokens();
        }
        
        return authErr();
    }
}

async function verifyClient(req, res, next) {
    let authErr = () => error.createError(
        "errors.com.epicgames.common.authorization.authorization_failed",
        `Authorization failed for ${req.originalUrl}`, 
        [req.originalUrl], 1032, undefined, 401, res
    );

    if (!req.headers["authorization"] || !req.headers["authorization"].startsWith("bearer eg1~")) return authErr();

    const token = req.headers["authorization"].replace("bearer eg1~", "");

    try {
        const decodedToken = jwt.decode(token);

        let findAccess = global.accessTokens.find(i => i.token == `eg1~${token}`);

        if (!findAccess && !global.clientTokens.find(i => i.token == `eg1~${token}`)) throw new Error("Invalid token.");

        if (DateAddHours(new Date(decodedToken.creation_date), decodedToken.hours_expire).getTime() <= new Date().getTime()) {
            throw new Error("Expired access/client token.");
        }

        if (findAccess) {
            req.user = await getUserWithTimeout(decodedToken.sub);

            if (req.user.banned) return error.createError(
                "manual_ban",
                "This account is locked", 
                [], -1, undefined, 400, res
            );
        }

        next();
    } catch (err) {
        let accessIndex = global.accessTokens.findIndex(i => i.token == `eg1~${token}`);
        if (accessIndex != -1) global.accessTokens.splice(accessIndex, 1);

        let clientIndex = global.clientTokens.findIndex(i => i.token == `eg1~${token}`);
        if (clientIndex != -1) global.clientTokens.splice(clientIndex, 1);

        if (accessIndex != -1 || clientIndex != -1) functions.UpdateTokens();
        
        return authErr();
    }
}

function DateAddHours(pdate, number) {
    let date = pdate;
    date.setHours(date.getHours() + number);

    return date;
}

module.exports = {
    verifyToken,
    verifyClient
}