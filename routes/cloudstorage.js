const express = require("express");
const app = express.Router();
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");
const functions = require("../structs/functions.js");

let seasons = [];
for (let i = 0; i <= 100; i++) seasons.push(i);
const _hashCache = {};
function getFileMetaCached(filePath) {
    const stats = fs.statSync(filePath);
    const mtime = stats.mtimeMs;
    const cached = _hashCache[filePath];

    if (cached && cached.mtime === mtime) {
        return { hash: cached.hash, hash256: cached.hash256, length: cached.length, mtime: stats.mtime };
    }

    const data = fs.readFileSync(filePath);
    const meta = {
        mtime,
        hash: crypto.createHash('sha1').update(data).digest('hex'),
        hash256: crypto.createHash('sha256').update(data).digest('hex'),
        length: data.length
    };

    _hashCache[filePath] = meta;

    return { hash: meta.hash, hash256: meta.hash256, length: meta.length, mtime: stats.mtime };
}

app.get("/fortnite/api/cloudstorage/system", (req, res) => {
    const dir = path.join(__dirname, "..", "CloudStorage");

    let CloudFiles = [];

    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    fs.readdirSync(dir).forEach(name => {
        if (name.toLowerCase().endsWith(".ini")) {
            const filePath = path.join(dir, name);
            const meta = getFileMetaCached(filePath);

            CloudFiles.push({
                "uniqueFilename": name,
                "filename": name,
                "hash": meta.hash,
                "hash256": meta.hash256,
                "length": meta.length,
                "contentType": "application/octet-stream",
                "uploaded": meta.mtime,
                "storageType": "S3",
                "storageIds": {},
                "doNotCache": true
            });
        }
    });

    res.json(CloudFiles);
});

app.get("/fortnite/api/cloudstorage/system/:file", (req, res) => {
    if (req.params.file.includes("..")) return res.status(404).end();
    if (req.params.file.includes("~")) return res.status(404).end();

    const file = path.join(__dirname, "..", "CloudStorage", path.basename(req.params.file));

    if (fs.existsSync(file)) return res.status(200).send(fs.readFileSync(file));

    res.status(200).end();
});

app.get("/fortnite/api/cloudstorage/user/*/:file", verifyToken, (req, res) => {
    let clientSettingsPath = path.join(__dirname, "..", "ClientSettings", req.user.accountId);
    if (!fs.existsSync(clientSettingsPath)) fs.mkdirSync(clientSettingsPath, { recursive: true });

    if (req.params.file.toLowerCase() !== "clientsettings.sav") return res.status(200).end();

    let file = path.join(clientSettingsPath, "ClientSettings.Sav");

    
    if (!fs.existsSync(file)) {
        const memory = functions.GetVersionInfo(req);
        let seasonFile = path.join(clientSettingsPath, `ClientSettings-${memory.season}.Sav`);
        if (fs.existsSync(seasonFile)) {
            fs.copyFileSync(seasonFile, file);
        }
    }

    if (fs.existsSync(file)) return res.status(200).send(fs.readFileSync(file));
    
    res.status(200).end();
});

app.get("/fortnite/api/cloudstorage/user/:accountId", verifyToken, (req, res) => {
    let clientSettingsPath = path.join(__dirname, "..", "ClientSettings", req.user.accountId);
    if (!fs.existsSync(clientSettingsPath)) fs.mkdirSync(clientSettingsPath, { recursive: true });

    let file = path.join(clientSettingsPath, "ClientSettings.Sav");

    
    if (!fs.existsSync(file)) {
        const memory = functions.GetVersionInfo(req);
        let seasonFile = path.join(clientSettingsPath, `ClientSettings-${memory.season}.Sav`);
        if (fs.existsSync(seasonFile)) file = seasonFile;
    }

    if (fs.existsSync(file)) {
        const meta = getFileMetaCached(file);

        return res.json([{
            "uniqueFilename": "ClientSettings.Sav",
            "filename": "ClientSettings.Sav",
            "hash": meta.hash,
            "hash256": meta.hash256,
            "length": meta.length,
            "contentType": "application/octet-stream",
            "uploaded": meta.mtime,
            "storageType": "S3",
            "storageIds": {},
            "accountId": req.user.accountId,
            "doNotCache": false
        }]);
    }
    
    res.json([]);
});

app.put("/fortnite/api/cloudstorage/user/*/:file", verifyToken, getRawBody, (req, res) => {
    if (!req.rawBody || req.rawBody.length === 0) return res.status(204).end();
    if (req.rawBody.length >= 400000) return res.status(403).json({ "error": "File size must be less than 400kb." });

    let clientSettingsPath = path.join(__dirname, "..", "ClientSettings", req.user.accountId);
    if (!fs.existsSync(clientSettingsPath)) fs.mkdirSync(clientSettingsPath, { recursive: true });

    if (req.params.file.toLowerCase() !== "clientsettings.sav") return res.status(204).end();

    let file = path.join(clientSettingsPath, "ClientSettings.Sav");
    fs.writeFileSync(file, req.rawBody);

    res.status(204).end();
});

function getRawBody(req, res, next) {
    if (req.headers["content-length"]) {
        if (Number(req.headers["content-length"]) >= 400000) return res.status(403).json({ "error": "File size must be less than 400kb." });
    }

    try {
        let chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            req.rawBody = Buffer.concat(chunks);
            next();
        });
    } catch {
        res.status(400).json({ "error": "Something went wrong while trying to access the request body." });
    }
}

module.exports = app;