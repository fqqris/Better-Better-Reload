const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express.Router();

const CATALOG_PATH = path.join(__dirname, "..", "Config", "catalog_config.json");

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function buildShop(cfg) {
    const builtin = cfg.builtinSectionSettings || {};
    const custom = cfg.sectionSettings || {};
    const sections = {};

    const section = id => {
        if (!sections[id]) {
            const s = custom[id] || builtin[id] || {};
            sections[id] = {
                id,
                name: s.displayName || s.title || cap(id),
                hidden: !!s.hidden,
                bundles: [],
                items: [],
            };
        }
        return sections[id];
    };
    section("featured");
    section("daily");
    for (const b of cfg.bundles || []) {
        const id = b.sectionId && !/^(featured|daily)$/i.test(b.sectionId)
            ? b.sectionId
            : (b.section === "daily" ? "daily" : "featured");
        section(id).bundles.push({
            kind: "bundle",
            name: b.bundleName || "Bundle",
            price: b.price || 0,
            originalPrice: b.originalPrice || 0,
            tag: b.tag || "",
            image: b.coverImage || "",
            largeTile: !!b.largeTile,
            tileSize: b.tileSize || "",
            items: b.itemGrants || [],
        });
    }
    for (const key of Object.keys(cfg)) {
        const m = key.match(/^([a-z_]+?)(\d+)$/i);
        const e = cfg[key];
        if (!m || !e || !Array.isArray(e.itemGrants)) continue;
        if (e.bundleName) continue;
        section(e.sectionId || m[1].toLowerCase()).items.push({
            num: parseInt(m[2], 10),
            offer: {
                kind: "item",
                name: e.itemName || e.name || "",
                price: e.price || 0,
                originalPrice: e.originalPrice || 0,
                tag: e.tag || "",
                image: e.imageOverride || "",
                largeTile: !!e.largeTile,
                tileSize: e.tileSize || "",
                items: e.itemGrants,
            },
        });
    }

    return Object.values(sections)
        .filter(s => !s.hidden)
        .map(s => ({
            id: s.id,
            name: s.name,
            offers: [...s.bundles, ...s.items.sort((a, b) => a.num - b.num).map(i => i.offer)],
        }))
        .filter(s => s.offers.length > 0);
}

app.get("/launcher/shop", (req, res) => {
    try {
        const cfg = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
        res.json({ sections: buildShop(cfg) });
    } catch (err) {
        console.error("GET /launcher/shop failed:", err);
        res.status(500).json({ error: "shop_unavailable" });
    }
});

module.exports = app;
module.exports.buildShop = buildShop;