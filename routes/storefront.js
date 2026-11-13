const express = require("express");
const app = express.Router();
const Profile = require("../model/profiles.js");
const Friends = require("../model/friends.js");
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");

const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");
const keychain = require("../responses/keychain.json");


app.get("/fortnite/api/storefront/v2/catalog", verifyToken, async (req, res) => {
    log.debug("Request to /fortnite/api/storefront/v2/catalog");
    if (req.headers["user-agent"] == undefined) return res.status(400).end();
    if (req.headers["user-agent"].includes("2870186")) {
        return res.status(404).end();
    }
    let ownedTemplateIds = new Set();
    try {
        const profile = await Promise.race([
            Profile.findOne({ accountId: req.user.accountId }).lean(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Profile lookup timed out after 5000ms")), 5000),
            ),
        ]);
        const athena = profile?.profiles?.athena;
        if (athena?.items) {
            for (let itemId in athena.items) {
                const tId = athena.items[itemId]?.templateId;
                if (tId) ownedTemplateIds.add(String(tId).toLowerCase());
            }
        }
    } catch (err) {
        log.error("Failed to load profile for catalog personalization:", err);
    }

    try {
        const shop = functions.getItemShop(ownedTemplateIds);
        if (!shop) {
            log.error("getItemShop returned undefined/null");
            return res.status(500).json({ error: "Failed to load catalog" });
        }
        res.json(shop);
    } catch (err) {
        log.error("getItemShop threw an exception:", err);
        return res.status(500).json({ error: "Failed to load catalog" });
    }
});

app.get("/fortnite/api/storefront/v2/gift/check_eligibility/recipient/:recipientId/offer/:offerId", verifyToken, async (req, res) => {
    log.debug(`Request to /fortnite/api/storefront/v2/gift/check_eligibility/recipient/${req.params.recipientId}/offer/${req.params.offerId}`);

    let recipientOwnedTemplateIds = new Set();
    try {
        const recipientProfile = await Profile.findOne({ accountId: req.params.recipientId }).lean();
        const recipientAthena = recipientProfile?.profiles?.athena;
        if (recipientAthena?.items) {
            for (let itemId in recipientAthena.items) {
                const tId = recipientAthena.items[itemId]?.templateId;
                if (tId) recipientOwnedTemplateIds.add(String(tId).toLowerCase());
            }
        }
    } catch (err) {
        log.error("Failed to load recipient profile for gift eligibility:", err);
    }

    const findOfferId = functions.getOfferID(req.params.offerId, recipientOwnedTemplateIds);
    if (!findOfferId) return error.createError(
        "errors.com.epicgames.fortnite.id_invalid",
        `Offer ID (id: "${req.params.offerId}") not found`,
        [req.params.offerId], 16027, undefined, 400, res
    );
    if (findOfferId.offerId.giftInfo && findOfferId.offerId.giftInfo.bIsEnabled === false) return error.createError(
        "errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed",
        `Catalog offer ${findOfferId.offerId.devName} cannot be gifted`,
        [findOfferId.offerId.devName], 28004, undefined, 403, res
    );

    let sender = await Friends.findOne({ accountId: req.user.accountId }).lean();
    if (!sender) return error.createError(
        "errors.com.epicgames.friends.no_relationship",
        `User ${req.user.accountId} has no friends list`,
        [req.user.accountId], 28004, undefined, 403, res
    );

    if (!sender.list.accepted.find(i => i.accountId == req.params.recipientId) && req.params.recipientId != req.user.accountId) return error.createError(
        "errors.com.epicgames.friends.no_relationship",
        `User ${req.user.accountId} is not friends with ${req.params.recipientId}`,
        [req.user.accountId, req.params.recipientId], 28004, undefined, 403, res
    );

    const profiles = await Profile.findOne({ accountId: req.params.recipientId });
    if (!profiles) return error.createError(
        "errors.com.epicgames.account.account_not_found",
        `User ${req.params.recipientId} not found`,
        [req.params.recipientId], 18007, undefined, 404, res
    );

    let athena = profiles.profiles["athena"];

    for (let itemGrant of findOfferId.offerId.itemGrants) {
        for (let itemId in athena.items) {
            if (itemGrant.templateId.toLowerCase() == athena.items[itemId].templateId.toLowerCase()) return error.createError(
                "errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed",
                `Could not purchase catalog offer ${findOfferId.offerId.devName}, item ${itemGrant.templateId}`,
                [findOfferId.offerId.devName, itemGrant.templateId], 28004, undefined, 403, res
            );
        }
    }

    res.json({
        price: findOfferId.offerId.prices[0],
        items: findOfferId.offerId.itemGrants
    });
});

app.get("/fortnite/api/storefront/v2/keychain", (req, res) => {
    log.debug("Request to /fortnite/api/storefront/v2/keychain");
    res.json(keychain);
});

app.get("/catalog/api/shared/bulk/offers", (req, res) => {
    log.debug("Request to /catalog/api/shared/bulk/offers");
    res.json({});
});

module.exports = app;