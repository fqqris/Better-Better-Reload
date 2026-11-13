const XMLBuilder = require("xmlbuilder");
const uuid = require("uuid");
const bcrypt = require("bcrypt");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const log = require("./log.js");

const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const profileManager = require("../structs/profile.js");
const Friends = require("../model/friends.js");
const SaCCodes = require("../model/saccodes.js");
const Arena = require("../model/arena.js");
const _fileCache = {};
function readFileCached(filePath) {
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    if (_fileCache[filePath] && _fileCache[filePath].mtime === mtime) {
      return _fileCache[filePath].data;
    }
    const data = JSON.parse(fs.readFileSync(filePath).toString());
    _fileCache[filePath] = { mtime, data };
    return data;
  } catch (err) {
    log.error(`Failed to read/cache file: ${filePath}`, err);
    return null;
  }
}

async function sleep(ms) {
  await new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
}

function GetVersionInfo(req) {
  let memory = {
    season: 0,
    build: 0.0,
    CL: "0",
    lobby: "",
  };

  if (req.headers["user-agent"]) {
    let CL = "";

    try {
      let BuildID = req.headers["user-agent"].split("-")[3].split(",")[0];

      if (!Number.isNaN(Number(BuildID))) CL = BuildID;
      else {
        BuildID = req.headers["user-agent"].split("-")[3].split(" ")[0];

        if (!Number.isNaN(Number(BuildID))) CL = BuildID;
      }
    } catch {
      try {
        let BuildID = req.headers["user-agent"].split("-")[1].split("+")[0];

        if (!Number.isNaN(Number(BuildID))) CL = BuildID;
      } catch {}
    }

    try {
      let Build = req.headers["user-agent"].split("Release-")[1].split("-")[0];

      if (Build.split(".").length == 3) {
        let Value = Build.split(".");
        Build = Value[0] + "." + Value[1] + Value[2];
      }

      memory.season = Number(Build.split(".")[0]);
      memory.build = Number(Build);
      memory.CL = CL;
      memory.lobby = `LobbySeason${memory.season}`;

      if (Number.isNaN(memory.season)) throw new Error();
    } catch {
      if (Number(memory.CL) < 3724489) {
        memory.season = 0;
        memory.build = 0.0;
        memory.CL = CL;
        memory.lobby = "LobbySeason0";
      } else if (Number(memory.CL) <= 3790078) {
        memory.season = 1;
        memory.build = 1.0;
        memory.CL = CL;
        memory.lobby = "LobbySeason1";
      } else {
        memory.season = 2;
        memory.build = 2.0;
        memory.CL = CL;
        memory.lobby = "LobbyWinterDecor";
      }
    }
  }

  return memory;
}

function getContentPages(req) {
  const memory = GetVersionInfo(req);

  const contentpages = JSON.parse(JSON.stringify(
    readFileCached(path.join(__dirname, "..", "responses", "contentpages.json"))
  ));

  let Language = "en";

  try {
    if (req.headers["accept-language"]) {
      if (
        req.headers["accept-language"].includes("-") &&
        req.headers["accept-language"] != "es-419"
      ) {
        Language = req.headers["accept-language"].split("-")[0];
      } else {
        Language = req.headers["accept-language"];
      }
    }
  } catch {}

  const modes = [
    "saveTheWorldUnowned",
    "battleRoyale",
    "creative",
    "saveTheWorld",
  ];
  const news = ["savetheworldnews", "battleroyalenews"];

  try {
    modes.forEach((mode) => {
      contentpages.subgameselectdata[mode].message.title =
        contentpages.subgameselectdata[mode].message.title[Language];
      contentpages.subgameselectdata[mode].message.body =
        contentpages.subgameselectdata[mode].message.body[Language];
    });
  } catch {}

  try {
    if (memory.build < 5.3) {
      news.forEach((mode) => {
        contentpages[mode].news.messages[0].image =
          "https://cdn.discordapp.com/attachments/927739901540188200/930879507496308736/discord.png";
        contentpages[mode].news.messages[1].image =
          "https://i.imgur.com/ImIwpRm.png";
      });
    }
  } catch {}

  try {
    contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = `season${memory.season}`;
    contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage = `season${memory.season}`;

    if (memory.season == 10) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
        "seasonx";
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage =
        "seasonx";
    }

    if (memory.build == 11.31 || memory.build == 11.4) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
        "Winter19";
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage =
        "Winter19";
    }

    if (memory.build == 19.01) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
        "winter2021";
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn.discordapp.com/attachments/927739901540188200/930880158167085116/t-bp19-lobby-xmas-2048x1024-f85d2684b4af.png";
      contentpages.subgameinfo.battleroyale.image =
        "https://cdn.discordapp.com/attachments/927739901540188200/930880421514846268/19br-wf-subgame-select-512x1024-16d8bb0f218f.jpg";
      contentpages.specialoffervideo.bSpecialOfferEnabled = "true";
    }

    if (memory.season == 20) {
      if (memory.build == 20.4) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-bp20-40-armadillo-glowup-lobby-2048x2048-2048x2048-3b83b887cc7f.jpg";
      } else {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-bp20-lobby-2048x1024-d89eb522746c.png";
      }
    }

    if (memory.season == 21) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn2.unrealengine.com/s21-lobby-background-2048x1024-2e7112b25dc3.jpg";

      if (memory.build == 21.1) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
          "season2100";
      }
      if (memory.build == 21.3) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/nss-lobbybackground-2048x1024-f74a14565061.jpg";
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
          "season2130";
      }
    }

    if (memory.season == 22) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn2.unrealengine.com/t-bp22-lobby-square-2048x2048-2048x2048-e4e90c6e8018.jpg";
    }

    if (memory.season == 23) {
      if (memory.build == 23.1) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-bp23-winterfest-lobby-square-2048x2048-2048x2048-277a476e5ca6.png";
        contentpages.specialoffervideo.bSpecialOfferEnabled = "true";
      } else {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-bp20-lobby-2048x1024-d89eb522746c.png";
      }
    }

    if (memory.season == 24) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn2.unrealengine.com/t-ch4s2-bp-lobby-4096x2048-edde08d15f7e.jpg";
    }

    if (memory.season == 25) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn2.unrealengine.com/s25-lobby-4k-4096x2048-4a832928e11f.jpg";
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
        "https://cdn2.unrealengine.com/fn-shop-ch4s3-04-1920x1080-785ce1d90213.png";

      if (memory.build == 25.11) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-s25-14dos-lobby-4096x2048-2be24969eee3.jpg";
      }
    }

    if (memory.season == 27) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
        "rufus";
    }
  } catch {}
  try {
    const configPath = path.join(__dirname, "..", "Config", "catalog_config.json");
    const CatalogConfig = readFileCached(configPath) || {};
    const sectionSettings = CatalogConfig.sectionSettings || {};
    const builtinSectionSettings = CatalogConfig.builtinSectionSettings || {};
    const CORE_SECTION_DEFAULTS = {
      ThanksForPlayingReload: { displayName: "Thanks For Playing Reload!", landingPriority: 30 },
      LimitedTimeOffers: { displayName: "Limited Time Offers", landingPriority: 25 },
      Featured: { displayName: "Featured", landingPriority: 20 },
      Daily: { displayName: "Daily", landingPriority: 10 },
    };

    const usedSectionIds = new Set(Object.keys(CORE_SECTION_DEFAULTS));
    Object.keys(sectionSettings).forEach((id) => usedSectionIds.add(id));
    if (Array.isArray(CatalogConfig.bundles)) {
      CatalogConfig.bundles.forEach((b) => {
        if (b && b.sectionId) usedSectionIds.add(String(b.sectionId));
      });
    }
    for (let value in CatalogConfig) {
      if (!Array.isArray(CatalogConfig[value]?.itemGrants)) continue;
      if (CatalogConfig[value].sectionId) usedSectionIds.add(String(CatalogConfig[value].sectionId));
    }

    if (!contentpages.shopSections) {
      contentpages.shopSections = {
        _title: "shop-sections",
        sectionList: { _type: "ShopSectionList", sections: [] },
        _noIndex: false,
        _activeDate: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        _locale: "en-US",
        _templateName: "FortniteGameShopSections",
      };
    }
    if (!contentpages.shopSections.sectionList) {
      contentpages.shopSections.sectionList = { _type: "ShopSectionList", sections: [] };
    }
    if (!Array.isArray(contentpages.shopSections.sectionList.sections)) {
      contentpages.shopSections.sectionList.sections = [];
    }

    let sections = contentpages.shopSections.sectionList.sections;
    if (sections.length > 1) {
      const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const byNameKey = new Map();
      for (const s of sections) {
        const nameKey = norm(s.sectionDisplayName || s.sectionId);
        if (!byNameKey.has(nameKey)) byNameKey.set(nameKey, []);
        byNameKey.get(nameKey).push(s);
      }
      const deduped = [];
      for (const group of byNameKey.values()) {
        if (group.length === 1) { deduped.push(group[0]); continue; }
        group.sort((a, b) => {
          const aUsed = usedSectionIds.has(a.sectionId) ? 1 : 0;
          const bUsed = usedSectionIds.has(b.sectionId) ? 1 : 0;
          if (aUsed !== bUsed) return bUsed - aUsed;
          return (b.landingPriority || 0) - (a.landingPriority || 0);
        });
        deduped.push(group[0]);
      }
      sections = deduped;
      contentpages.shopSections.sectionList.sections = sections;
    }

    const existingIds = new Set(sections.map((s) => s.sectionId));
    let nextPriority = sections.reduce((max, s) => Math.max(max, typeof s.landingPriority === "number" ? s.landingPriority : 0), 0);

    for (let sectionId of usedSectionIds) {
      const coreDefault = CORE_SECTION_DEFAULTS[sectionId] || {};
      const builtinKey = sectionId === "Featured" ? "featured" : sectionId === "Daily" ? "daily" : null;
      const builtinOverride = builtinKey ? (builtinSectionSettings[builtinKey] || {}) : {};
      const override = { ...coreDefault, ...builtinOverride, ...(sectionSettings[sectionId] || {}) };

      if (existingIds.has(sectionId)) {
        const entry = sections.find((s) => s.sectionId === sectionId);
        if (override.displayName) entry.sectionDisplayName = override.displayName;
        if (typeof override.hidden === "boolean") entry.bHidden = override.hidden;
        if (typeof override.landingPriority === "number") entry.landingPriority = override.landingPriority;
        if (override.backgroundKey) entry.background = { stage: "default", _type: "DynamicBackground", key: override.backgroundKey };
        if (typeof override.showTimer === "boolean") entry.bShowTimer = override.showTimer;
        continue;
      }

      nextPriority -= 5;
      sections.push({
        bSortOffersByOwnership: false,
        bShowIneligibleOffersIfGiftable: false,
        bEnableToastNotification: true,
        background: { stage: "default", _type: "DynamicBackground", key: override.backgroundKey || "vault" },
        _type: "ShopSection",
        landingPriority: typeof override.landingPriority === "number" ? override.landingPriority : nextPriority,
        bHidden: typeof override.hidden === "boolean" ? override.hidden : false,
        sectionId: sectionId,
        bShowTimer: typeof override.showTimer === "boolean" ? override.showTimer : true,
        sectionDisplayName: override.displayName || sectionId,
        bShowIneligibleOffers: true,
      });
    }
    contentpages.shopSections.sectionList.sections = [...contentpages.shopSections.sectionList.sections]
      .sort((a, b) => (b.landingPriority || 0) - (a.landingPriority || 0));
    try {
      const summary = [...contentpages.shopSections.sectionList.sections]
        .sort((a, b) => (b.landingPriority || 0) - (a.landingPriority || 0))
        .map((x) => `${x.sectionId}:${x.landingPriority}${x.bShowTimer ? "(timer)" : ""}`)
        .join(" > ");
      const logKey = `${memory.season}|${summary}`;
      if (global.__lastShopSectionsLog !== logKey) {
        global.__lastShopSectionsLog = logKey;
        console.log(`[shop-sections] season=${memory.season} ua="${String((req.headers && req.headers["user-agent"]) || "").slice(0, 80)}" order: ${summary}`);
      }
    } catch {}
  } catch (e) {
    console.warn("[shop-sections] failed to build section headers:", e.message);
  }

  return contentpages;
}
function getTournamentInformation() {
  const list = readFileCached(path.join(__dirname, "..", "Config", "tournaments.json")) || [];

  const tournaments = (Array.isArray(list) ? list : [])
    .filter((t) => t.imageUrl)
    .map((t) => ({
      tournament_display_id: t.displayDataId,
      title_line_1: t.displayDataId,
      short_format_title: t.displayDataId,
      long_format_title: t.displayDataId,
      playlist_tile_image: t.imageUrl,
      poster_front_image: t.imageUrl,
      poster_back_image: t.imageUrl,
      loading_screen_image: t.imageUrl,
    }));

  return { tournament_info: { tournaments } };
}

let _itemShopCache = null;
const VIOLATOR_DEFAULTS = {
  "NEW!":                        { value: "New",                       intensity: "High" },
  "V-BUCKS OFF":                 { value: "AmountOff",                 intensity: "Low"  },
  "REACTIVE":                    { value: "Reactive",                  intensity: "High" },
  "REACTS TO ELIMINATIONS":      { value: "ReactElim",                 intensity: "High" },
  "REACTS TO MUSIC":             { value: "MusicianPickaxe",           intensity: "High" },
  "INCLUDES REACTIVE BACKBLING": { value: "IncludesReactiveBackbling", intensity: "High" },
  "CUSTOMIZABLE":                { value: "Customizable",              intensity: "High" },
  "CUSTOMIZE COLORS":            { value: "CustomizeColors",           intensity: "High" },
  "LAST CHANCE":                 { value: "LastChance",                intensity: "High" },
  "LIMITED TIME":                { value: "LimitedTime",               intensity: "High" },
  "EXCLUSIVE":                   { value: "Exclusive",                 intensity: "High" },
  "FREE":                        { value: "Free",                      intensity: "High" },
};

function loadViolatorConfig() {
  const tags = { ...VIOLATOR_DEFAULTS };
  let defaultIntensity = "High";
  try {
    const pathMod = require("path");
    const fs = require("fs");
    const p = ["violators.json", "violator_map.json", "violator_map.example.json"]
      .map((f) => pathMod.join(__dirname, "..", "Config", f))
      .find((f) => fs.existsSync(f));
    if (p) {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      if (j && typeof j.intensity === "string") defaultIntensity = j.intensity;
      if (j && j.tags && typeof j.tags === "object") {
        for (const [k, v] of Object.entries(j.tags)) {
          const key = String(k).trim().toUpperCase();
          if (typeof v === "string") tags[key] = { value: v, intensity: defaultIntensity };
          else if (v && typeof v.value === "string") tags[key] = { value: v.value, intensity: v.intensity || defaultIntensity };
        }
      }
    }
  } catch (e) {
    console.log("violator_map.json could not be read, using defaults:", e.message);
  }
  return { tags };
}

function resolveBannerOverride(tag, cfg = loadViolatorConfig()) {
  if (typeof tag !== "string") return null;
  const t = tag.trim();
  if (!t) return null;
  if (cfg.tags[t.toUpperCase()]) return cfg.tags[t.toUpperCase()];
  const strip = (x) => String(x).trim().toUpperCase().replace(/!+$/, "").trim();
  const wanted = strip(t);
  for (const [k, v] of Object.entries(cfg.tags)) if (strip(k) === wanted) return v;
  return Object.values(cfg.tags).find((x) => x.value.toLowerCase() === t.toLowerCase()) || null;
}

function applyBannerOverride(entry, tag) {
  const hit = resolveBannerOverride(tag);
  if (!hit) return;
  const fields = { ViolatorTag: hit.value, ViolatorIntensity: hit.intensity, BannerOverride: hit.value };
  entry.meta = entry.meta || {};
  entry.metaInfo = Array.isArray(entry.metaInfo) ? entry.metaInfo : [];
  for (const [k, v] of Object.entries(fields)) {
    entry.meta[k] = v;
    entry.metaInfo = entry.metaInfo.filter((m) => m.key !== k);
    entry.metaInfo.push({ key: k, value: v });
  }
}

function getItemShop(ownedTemplateIds, bypassOwnership = false) {
  const owned = ownedTemplateIds instanceof Set ? ownedTemplateIds : new Set();
  const catalogPath = path.join(__dirname, "..", "responses", "catalog.json");
  const configPath = path.join(__dirname, "..", "Config", "catalog_config.json");

  let catalogMtime, configMtime;
  try {
    catalogMtime = fs.statSync(catalogPath).mtimeMs;
    configMtime = fs.existsSync(configPath) ? fs.statSync(configPath).mtimeMs : 0;
  } catch (err) {
    catalogMtime = null;
    configMtime = null;
  }
  const ownedKey = owned.size ? Array.from(owned).sort().join(",") : "";
  if (
    _itemShopCache &&
    _itemShopCache.catalogMtime === catalogMtime &&
    _itemShopCache.configMtime === configMtime &&
    _itemShopCache.ownedKey === ownedKey
  ) {
    return _itemShopCache.result;
  }

  let catalog;
  let CatalogConfig;

  try {
    const rawCatalog = readFileCached(catalogPath);
    if (rawCatalog) catalog = JSON.parse(JSON.stringify(rawCatalog));
    const rawConfig = readFileCached(configPath);
    CatalogConfig = rawConfig ? JSON.parse(JSON.stringify(rawConfig)) : {};
  } catch (error) {
    log.error("Failed to read catalog files:", error);
    if (!catalog) {
      log.error("CRITICAL: Failed to read base catalog.json");
      return { storefronts: [] };
    }
    CatalogConfig = {};
  }

  const todayAtMidnight = new Date();
  todayAtMidnight.setHours(24, 0, 0, 0);
  const todayOneMinuteBeforeMidnight = new Date(
    todayAtMidnight.getTime() - 60000,
  );
  const isoDate = todayOneMinuteBeforeMidnight.toISOString();
  const usedSectionIds = new Set();
  const curatedSectionRank = {};
  const nextSectionRank = (isDaily, sectionId) => {
    const key = (isDaily ? "d:" : "f:") + sectionId;
    const rank = curatedSectionRank[key] || 0;
    curatedSectionRank[key] = rank + 1;
    return rank;
  };
  try {
    if (Array.isArray(CatalogConfig.bundles)) {
      const weeklyIdx = catalog.storefronts.findIndex(
        (p) => p.name == "BRWeeklyStorefront",
      );
      const dailyIdx = catalog.storefronts.findIndex(
        (p) => p.name == "BRDailyStorefront",
      );

      if (weeklyIdx !== -1 || dailyIdx !== -1) {
        for (let bundle of CatalogConfig.bundles) {
          if (!bundle || !Array.isArray(bundle.itemGrants) || bundle.itemGrants.length == 0) continue;
          const isDaily = bundle.section === "daily";
          const targetIdx = isDaily ? dailyIdx : weeklyIdx;
          if (targetIdx === -1) continue;

          const bundleSectionId = bundle.sectionId || (isDaily ? "Daily" : "Featured");
          const bundlePosition =
            typeof bundle.position === "number" && bundle.position >= 0
              ? bundle.position
              : 0;
          const bundleRank = nextSectionRank(isDaily, bundleSectionId);
          const bundleSortPriority = isDaily
            ? -0.5 - bundlePosition - bundleRank * 0.0001
            : 0.5 - bundlePosition - bundleRank * 0.0001;


          const validItemGrants = bundle.itemGrants.filter(
            (id) => typeof id === "string" && id.length > 0,
          );
          const itemPrices = bundle.itemPrices || {};
          const realRegularPrices = validItemGrants.map((id) =>
            typeof itemPrices[id] === "number" ? itemPrices[id] : 0,
          );
          const realSum = realRegularPrices.reduce((sum, p) => sum + p, 0);
          const ownedItemCount = validItemGrants.filter((id) =>
            owned.has(String(id).toLowerCase()),
          ).length;
          const tierPrices = bundle.tierPrices && typeof bundle.tierPrices === "object"
            ? bundle.tierPrices
            : {};
          const customTierPrice =
            ownedItemCount > 0 && typeof tierPrices[ownedItemCount] === "number"
              ? tierPrices[ownedItemCount]
              : null;
          const customOriginalPrice =
            typeof bundle.originalPrice === "number" && bundle.originalPrice > 0
              ? bundle.originalPrice
              : null;
          const sumRegularPrice = customOriginalPrice !== null ? customOriginalPrice : realSum;
          const scaledPrices = realRegularPrices.slice();
          if (customOriginalPrice !== null && validItemGrants.length) {
            for (let i = 0; i < scaledPrices.length; i++) {
              scaledPrices[i] = realSum > 0
                ? Math.round((realRegularPrices[i] / realSum) * customOriginalPrice)
                : Math.round(customOriginalPrice / validItemGrants.length);
            }
            const drift = customOriginalPrice - scaledPrices.reduce((a, b) => a + b, 0);
            if (drift !== 0) {
              let big = 0;
              for (let i = 1; i < scaledPrices.length; i++) {
                if (scaledPrices[i] > scaledPrices[big]) big = i;
              }
              scaledPrices[big] += drift;
            }
          }

          const bundleItems = validItemGrants.map((id, idx) => {
            const regularPrice = scaledPrices[idx];
            return {
              bCanOwnMultiple: false,
              regularPrice,
              discountedPrice: regularPrice,
              alreadyOwnedPriceReduction: customTierPrice !== null ? 0 : regularPrice,
              item: { templateId: id, quantity: 1 },
            };
          });

          const targetPrice = customTierPrice !== null
            ? customTierPrice
            : (typeof bundle.price === "number" ? bundle.price : 0);
          const sentSum = bundleItems.reduce((sum, it) => sum + it.regularPrice, 0);
          const discountedBasePrice = Math.round(targetPrice - sentSum);
          const tierPriceValues = Object.values(tierPrices).filter((v) => typeof v === "number");
          const floorPrice = (typeof bundle.floorPrice === "number" && bundle.floorPrice > 0)
            ? bundle.floorPrice
            : (tierPriceValues.length
                ? Math.max(0, Math.min(typeof bundle.price === "number" ? bundle.price : Infinity, ...tierPriceValues))
                : Math.max(0, Math.round((targetPrice * 0.15) / 50) * 50));

          usedSectionIds.add(bundleSectionId);

          const BundleEntry = {
            devName: bundle.bundleName || "",
            title: bundle.bundleName || "",
            offerId: "",
            fulfillmentIds: [],
            dailyLimit: -1,
            weeklyLimit: -1,
            monthlyLimit: -1,
            categories: [],
            prices: [],
            dynamicBundleInfo: {
              discountedBasePrice,
              regularBasePrice: 0,
              floorPrice,
              currencyType: "MtxCurrency",
              currencySubType: "",
              displayType: "AmountOff",
              bundleItems,
            },
            meta: {
              SectionId: bundleSectionId,
              TileSize: bundle.largeTile ? "DoubleWide" : "Normal",
              NewDisplayAssetPath: bundle.newDisplayAssetPath || "",
            },
            matchFilter: "",
            filterWeight: 0,
            appStoreId: [],
            requirements: [],
            offerType: "DynamicBundle",
            giftInfo: {
              bIsEnabled: bundle.giftable !== false,
              forcedGiftBoxTemplateId: "",
              purchaseRequirements: [],
              giftRecordIds: [],
            },
            refundable: true,
            metaInfo: [
              { key: "SectionId", value: bundleSectionId },
              { key: "TileSize", value: bundle.largeTile ? "DoubleWide" : "Normal" },
              { key: "NewDisplayAssetPath", value: bundle.newDisplayAssetPath || "" },
            ],
            displayAssetPath: bundle.displayAssetPath || bundle.newDisplayAssetPath || "",
            itemGrants: validItemGrants.map((id) => ({ templateId: id, quantity: 1 })),
            sortPriority: bundleSortPriority,
            catalogGroupPriority: 0,
          };

          let uniqueIdentifier = crypto
            .createHash("sha1")
            .update(
              `${JSON.stringify(validItemGrants)}_${discountedBasePrice}_${bundle.bundleName || ""}`,
            )
            .digest("hex");

          BundleEntry.devName = uniqueIdentifier;
          BundleEntry.offerId = uniqueIdentifier;

          applyBannerOverride(BundleEntry, bundle.tag);

          catalog.storefronts[targetIdx].catalogEntries.push(BundleEntry);
        }
      }
    }
  } catch {}

  try {
    const itemSectionSettings = CatalogConfig.sectionSettings || {};
    const CORE_SECTION_PRIORITIES = { ThanksForPlayingSnow: 30, LimitedTimeOffers: 25, Featured: 20, Daily: 10 };
    const resolveItemSectionPriority = (id) => {
      const cfg = itemSectionSettings[id] || {};
      if (typeof cfg.landingPriority === "number") return cfg.landingPriority;
      return CORE_SECTION_PRIORITIES[id] || 0;
    };
    const orderedConfigKeys = Object.keys(CatalogConfig)
      .filter(
        (value) =>
          Array.isArray(CatalogConfig[value]?.itemGrants) &&
          CatalogConfig[value].itemGrants.length > 0 &&
          !CatalogConfig[value].bundleName,
      )
      .sort((a, b) => {
        const aId =
          CatalogConfig[a].sectionId || (a.toLowerCase().startsWith("daily") ? "Daily" : "Featured");
        const bId =
          CatalogConfig[b].sectionId || (b.toLowerCase().startsWith("daily") ? "Daily" : "Featured");
        return resolveItemSectionPriority(bId) - resolveItemSectionPriority(aId);
      });

    for (let value of orderedConfigKeys) {
      if (!Array.isArray(CatalogConfig[value].itemGrants)) continue;
      if (CatalogConfig[value].itemGrants.length == 0) continue;
      if (CatalogConfig[value].bundleName) continue;

      const CatalogEntry = {
        devName: "",
        offerId: "",
        fulfillmentIds: [],
        dailyLimit: -1,
        weeklyLimit: -1,
        monthlyLimit: -1,
        categories: [],
        prices: [
          {
            currencyType: "MtxCurrency",
            currencySubType: "",
            regularPrice: 0,
            finalPrice: 0,
            saleExpiration: "9999-12-02T01:12:00Z",
            basePrice: 0,
          },
        ],
        meta: { SectionId: "Featured", TileSize: "Small" },
        matchFilter: "",
        filterWeight: 0,
        appStoreId: [],
        requirements: [],
        offerType: "StaticPrice",
        giftInfo: {
          bIsEnabled: CatalogConfig[value].giftable !== false,
          forcedGiftBoxTemplateId: "",
          purchaseRequirements: [],
          giftRecordIds: [],
        },
        refundable: true,
        metaInfo: [
          { key: "SectionId", value: "Featured" },
          { key: "TileSize", value: "Small" },
        ],
        displayAssetPath: "",
        itemGrants: [],
        sortPriority: 0,
        catalogGroupPriority: 0,
      };

      let i = catalog.storefronts.findIndex(
        (p) =>
          p.name ==
          (value.toLowerCase().startsWith("daily")
            ? "BRDailyStorefront"
            : "BRWeeklyStorefront"),
      );
      if (i == -1) continue;

      const isDailyEntry = value.toLowerCase().startsWith("daily");
      const entrySectionId = CatalogConfig[value].sectionId || (isDailyEntry ? "Daily" : "Featured");
      CatalogEntry.meta.SectionId = entrySectionId;
      CatalogEntry.metaInfo[0].value = entrySectionId;
      usedSectionIds.add(entrySectionId);

      if (CatalogConfig[value].newDisplayAssetPath) {
        CatalogEntry.meta.NewDisplayAssetPath = CatalogConfig[value].newDisplayAssetPath;
        CatalogEntry.metaInfo.push({ key: "NewDisplayAssetPath", value: CatalogConfig[value].newDisplayAssetPath });
      }
      if (CatalogConfig[value].displayAssetPath) {
        CatalogEntry.displayAssetPath = CatalogConfig[value].displayAssetPath;
      }

      const tileSizeOverride =
        CatalogConfig[value].tileSize === "Normal" || CatalogConfig[value].tileSize === "Small" || CatalogConfig[value].tileSize === "DoubleWide"
          ? CatalogConfig[value].tileSize
          : null;

      if (isDailyEntry) {
        CatalogEntry.sortPriority = -1 - nextSectionRank(true, entrySectionId);
        if (tileSizeOverride) {
          CatalogEntry.meta.TileSize = tileSizeOverride;
          CatalogEntry.metaInfo[1].value = tileSizeOverride;
        }
      } else {
        CatalogEntry.sortPriority = -nextSectionRank(false, entrySectionId);
        CatalogEntry.meta.TileSize = tileSizeOverride || "Normal";
        CatalogEntry.metaInfo[1].value = tileSizeOverride || "Normal";
      }

      for (let itemGrant of CatalogConfig[value].itemGrants) {
        if (typeof itemGrant != "string") continue;
        if (itemGrant.length == 0) continue;

        CatalogEntry.requirements.push({
          requirementType: "DenyOnItemOwnership",
          requiredId: itemGrant,
          minQuantity: 1,
        });
        CatalogEntry.itemGrants.push({ templateId: itemGrant, quantity: 1 });
      }

      CatalogEntry.prices = [
        {
          currencyType: "MtxCurrency",
          currencySubType: "",
          regularPrice: CatalogConfig[value].price,
          finalPrice: CatalogConfig[value].price,
          saleExpiration: isoDate,
          basePrice: CatalogConfig[value].price,
        },
      ];

      if (CatalogEntry.itemGrants.length > 0) {
        let uniqueIdentifier = crypto
          .createHash("sha1")
          .update(
            `${JSON.stringify(CatalogConfig[value].itemGrants)}_${CatalogConfig[value].price}`,
          )
          .digest("hex");

        CatalogEntry.devName = uniqueIdentifier;
        CatalogEntry.offerId = uniqueIdentifier;

        applyBannerOverride(CatalogEntry, CatalogConfig[value].tag);

        catalog.storefronts[i].catalogEntries.push(CatalogEntry);
      }
    }
  } catch {}
  try {
    usedSectionIds.add("Featured");
    usedSectionIds.add("Daily");

    const sectionsIdx = catalog.storefronts.findIndex(
      (p) => p.name == "BRShopSections",
    );

    if (sectionsIdx !== -1) {
      const CORE_SECTION_DEFAULTS = {
        ThanksForPlayingSnow: { landingPriority: 30 },
        LimitedTimeOffers: { landingPriority: 25 },
        Featured: { landingPriority: 20 },
        Daily: { landingPriority: 10 },
      };
      const sectionSettings = CatalogConfig.sectionSettings || {};
      const resolvePriority = (id) => {
        const cfg = sectionSettings[id] || {};
        if (typeof cfg.landingPriority === "number") return cfg.landingPriority;
        const core = CORE_SECTION_DEFAULTS[id];
        return core ? core.landingPriority : 0;
      };
      const orderedSectionIds = Array.from(usedSectionIds)
        .filter((id) => !(sectionSettings[id] && sectionSettings[id].hidden))
        .sort((a, b) => resolvePriority(b) - resolvePriority(a));
      const sectionCount = orderedSectionIds.length;
      let sectionRank = sectionCount - 1;
      for (let sectionId of orderedSectionIds) {
        const SectionEntry = {
          devName: `Section:${sectionId}`,
          offerId: `Section:${sectionId}`,
          fulfillmentIds: [],
          dailyLimit: -1,
          weeklyLimit: -1,
          monthlyLimit: -1,
          categories: [],
          prices: [],
          meta: {
            SectionId: sectionId,
            NewDisplayAssetPath: CatalogConfig.sectionDisplayAssets?.[sectionId] || "",
          },
          matchFilter: "",
          filterWeight: 0,
          appStoreId: [],
          requirements: [],
          offerType: "StaticPrice",
          giftInfo: {
            bIsEnabled: false,
            forcedGiftBoxTemplateId: "",
            purchaseRequirements: [],
            giftRecordIds: [],
          },
          refundable: false,
          metaInfo: [
            { key: "SectionId", value: sectionId },
            { key: "SortOrder", value: String(sectionRank) },
          ],
          displayAssetPath: "",
          itemGrants: [],
          sortPriority: sectionRank,
          catalogGroupPriority: 0,
        };

        catalog.storefronts[sectionsIdx].catalogEntries.push(SectionEntry);
        sectionRank--;
      }
    }
  } catch {}

  _itemShopCache = { catalogMtime, configMtime, result: catalog };

  return catalog;
}

function getOfferID(offerId, ownedTemplateIds) {
  const catalog = getItemShop(ownedTemplateIds);

  for (let storefront of catalog.storefronts) {
    let findOfferId = storefront.catalogEntries.find(
      (i) => i.offerId == offerId,
    );

    if (findOfferId)
      return {
        name: storefront.name,
        offerId: findOfferId,
      };
  }
}

function MakeID() {
  return uuid.v4();
}

function sendXmppMessageToAll(body) {
  if (!global.Clients) return;
  if (typeof body == "object") body = JSON.stringify(body);

  global.Clients.forEach((ClientData) => {
    ClientData.client.send(
      XMLBuilder.create("message")
        .attribute("from", `xmpp-admin@${global.xmppDomain}`)
        .attribute("xmlns", "jabber:client")
        .attribute("to", ClientData.jid)
        .element("body", `${body}`)
        .up()
        .toString(),
    );
  });
}

function sendXmppMessageToId(body, toAccountId) {
  if (!global.Clients) return;
  if (typeof body == "object") body = JSON.stringify(body);

  let receiver = global.Clients.find((i) => i.accountId == toAccountId);
  if (!receiver) return;

  receiver.client.send(
    XMLBuilder.create("message")
      .attribute("from", `xmpp-admin@${global.xmppDomain}`)
      .attribute("to", receiver.jid)
      .attribute("xmlns", "jabber:client")
      .element("body", `${body}`)
      .up()
      .toString(),
  );
}

function getPresenceFromUser(fromId, toId, offline) {
  if (!global.Clients) return;

  let SenderData = global.Clients.find((i) => i.accountId == fromId);
  let ClientData = global.Clients.find((i) => i.accountId == toId);

  if (!SenderData || !ClientData) return;

  let xml = XMLBuilder.create("presence")
    .attribute("to", ClientData.jid)
    .attribute("xmlns", "jabber:client")
    .attribute("from", SenderData.jid)
    .attribute("type", offline ? "unavailable" : "available");

  if (SenderData.lastPresenceUpdate.away)
    xml = xml
      .element("show", "away")
      .up()
      .element("status", SenderData.lastPresenceUpdate.status)
      .up();
  else xml = xml.element("status", SenderData.lastPresenceUpdate.status).up();

  ClientData.client.send(xml.toString());
}

async function registerUser(discordId, username, email, plainPassword) {
  email = email.toLowerCase();

  if (!username || !email || !plainPassword) {
    return {
      message: "Username, email, or password is required.",
      status: 400,
    };
  }

  if (discordId && (await User.findOne({ discordId }))) {
    return { message: "You already created an account!", status: 400 };
  }

  if (await User.findOne({ email })) {
    return { message: "Email is already in use.", status: 400 };
  }

  const accountId = MakeID().replace(/-/gi, "");
  const matchmakingId = MakeID().replace(/-/gi, "");

  const emailFilter =
    /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
  if (!emailFilter.test(email)) {
    return {
      message: "You did not provide a valid email address.",
      status: 400,
    };
  }
  if (username.length >= 25) {
    return {
      message: "Your username must be less than 25 characters long.",
      status: 400,
    };
  }
  if (username.length < 3) {
    return {
      message: "Your username must be at least 3 characters long.",
      status: 400,
    };
  }
  if (plainPassword.length >= 128) {
    return {
      message: "Your password must be less than 128 characters long.",
      status: 400,
    };
  }
  if (plainPassword.length < 4) {
    return {
      message: "Your password must be at least 4 characters long.",
      status: 400,
    };
  }

  const allowedCharacters =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~".split(
      "",
    );
  for (let character of username) {
    if (!allowedCharacters.includes(character)) {
      return {
        message:
          "Your username has special characters, please remove them and try again.",
        status: 400,
      };
    }
  }

  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  try {
    await User.create({
      created: new Date().toISOString(),
      discordId: discordId || null,
      accountId,
      username,
      username_lower: username.toLowerCase(),
      email,
      password: hashedPassword,
      matchmakingId,
    }).then(async (i) => {
      await Profile.create({
        created: i.created,
        accountId: i.accountId,
        profiles: profileManager.createProfiles(i.accountId),
      });
      await Friends.create({ created: i.created, accountId: i.accountId });
      await Arena.create({ accountId: i.accountId, hype: 0, division: 0 });
    });
  } catch (err) {
    log.error("Error during user registration:", err);
    if (err.code == 11000) {
      return { message: `Username or email is already in use.`, status: 400 };
    }

    return {
      message: "An unknown error has occurred, please try again later.",
      status: 400,
    };
  }

  return {
    message: `Successfully created an account with the username **${username}**`,
    status: 200,
  };
}

async function createSAC(code, username, creator) {
  if (!code || !username)
    return {
      message: "**Code** or **Ingame Username** is required.",
      status: 400,
    };

  const account = await User.findOne({ username });

  if (account == null) return { message: `**${username}** doesnt exist!` };

  if (await SaCCodes.findOne({ code }))
    return { message: `**${code}** already exist!`, status: 400 };

  if (await SaCCodes.findOne({ owneraccountId: account.accountId }))
    return {
      message: `**${username}** already has an **Code** (**${code}**)!`,
      status: 400,
    };
  const creatorprofile = await User.findOne({ discordId: creator });

  const allowedCharacters =
    "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~".split(
      "",
    );
  for (let character of allowedCharacters) {
    if (!allowedCharacters.includes(character))
      return { message: "The Code has special Characters!", status: 400 };
  }

  try {
    await SaCCodes.create({
      created: new Date().toISOString(),
      createdby: creatorprofile.accountId,
      owneraccountId: account.accountId,
      code,
      code_lower: code.toLowerCase(),
      code_higher: code.toUpperCase(),
    });
  } catch (error) {
    return { message: error, status: 400 };
  }

  return {
    message: "You successfully created an **Support a Creator** Code!",
    status: 200,
  };
}

function DecodeBase64(str) {
  return Buffer.from(str, "base64").toString();
}
let _tokenWriteTimeout = null;
let _tokenWritePending = false;

function UpdateTokens() {
  _tokenWritePending = true;
  if (_tokenWriteTimeout) return;

  _tokenWriteTimeout = setTimeout(() => {
    _tokenWriteTimeout = null;
    if (!_tokenWritePending) return;
    _tokenWritePending = false;

    fs.writeFile(
      "./tokenManager/tokens.json",
      JSON.stringify(
        {
          accessTokens: global.accessTokens,
          refreshTokens: global.refreshTokens,
          clientTokens: global.clientTokens,
        },
        null,
        2,
      ),
      (err) => {
        if (err) log.error("Failed to persist tokens.json", err);
      },
    );
  }, 1000);
}

function flushTokensSync() {
  if (!_tokenWritePending) return;
  _tokenWritePending = false;
  if (_tokenWriteTimeout) {
    clearTimeout(_tokenWriteTimeout);
    _tokenWriteTimeout = null;
  }
  try {
    fs.writeFileSync(
      "./tokenManager/tokens.json",
      JSON.stringify(
        {
          accessTokens: global.accessTokens,
          refreshTokens: global.refreshTokens,
          clientTokens: global.clientTokens,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    log.error("Failed to flush tokens.json on shutdown", err);
  }
}

process.on("SIGINT", () => { flushTokensSync(); process.exit(0); });
process.on("SIGTERM", () => { flushTokensSync(); process.exit(0); });

async function getDivisionPoints(accountId, statType) {
  const eventListPath = path.join(
    __dirname,
    "./../responses/eventlistactive.json",
  );
  const eventList = JSON.parse(fs.readFileSync(eventListPath, "utf-8"));
  const playerData = await Arena.findOne({ accountId });
  const playerDivision = playerData ? playerData.division : 0;

  const eventWindow = eventList.events[0].eventWindows.find(
    (window) => window.metadata.divisionRank === playerDivision,
  );

  if (!eventWindow) {
    log.error("Division non trouvée dans la liste des événements.");
    throw new Error("Division non trouvée dans la liste des événements.");
  }

  const scoringRule = eventList.templates
    .find(
      (template) => template.eventTemplateId === eventWindow.eventTemplateId,
    )
    .scoringRules.find((rule) => rule.trackedStat === statType);

  if (scoringRule) {
    const pointsEarned = scoringRule.rewardTiers[0].pointsEarned;
    return pointsEarned;
  }

  return 0;
}

async function addEliminationHypePoints(user) {
  const points = await getDivisionPoints(
    user.account_id,
    "TEAM_ELIMS_STAT_INDEX",
  );
  return await updateHypePoints(user, points);
}

async function addVictoryHypePoints(user) {
  const points = await getDivisionPoints(
    user.account_id,
    "PLACEMENT_STAT_INDEX",
  );
  return await updateHypePoints(user, points);
}

async function deductBusFareHypePoints(user) {
  const points = await getDivisionPoints(user.account_id, "MATCH_PLAYED_STAT");
  return await updateHypePoints(user, -points);
}

async function updateHypePoints(user, points) {
  const accountId = user.account_id || user.accountId;

  let playerData = await Arena.findOne({ accountId });
  let currentHype = playerData ? playerData.hype : 0;
  let currentDivision = playerData ? playerData.division : 0;

  currentHype += points;

  const nextDivision = getNextDivision(currentHype, currentDivision);
  currentDivision = nextDivision;

  await Arena.updateOne(
    { accountId },
    {
      $set: {
        accountId: accountId,
        hype: currentHype,
        division: currentDivision,
      },
    },
    { upsert: true },
  );

  return {
    success: true,
    data: `Points mis à jour à ${currentHype}, Division actuelle : ${currentDivision}`,
  };
}

function getNextDivision(hypePoints, currentDivision) {
  const thresholds = [
    400, 800, 1200, 2000, 3000, 5000, 7500, 10000, 14999, 15000,
  ];
  for (let i = 0; i < thresholds.length; i++) {
    if (hypePoints < thresholds[i]) return i;
  }
  return currentDivision;
}

function getAccountIdData(UserID) {
  const account_id = UserID ? UserID.split("|")[1] : "";

  return account_id;
}

function PlaylistNames(playlist) {
  switch (playlist) {
    case "2":
      return "Playlist_DefaultSolo";
    case "10":
      return "Playlist_DefaultDuo";
    case "9":
      return "Playlist_DefaultSquad";
    case "50":
      return "Playlist_50v50";
    case "11":
      return "Playlist_50v50";
    case "13":
      return "Playlist_HighExplosives_Squads";
    case "22":
      return "Playlist_5x20";
    case "36":
      return "Playlist_Blitz_Solo";
    case "37":
      return "Playlist_Blitz_Duos";
    case "19":
      return "Playlist_Blitz_Squad";
    case "33":
      return "Playlist_Carmine";
    case "32":
      return "Playlist_Fortnite";
    case "23":
      return "Playlist_HighExplosives_Solo";
    case "24":
      return "Playlist_HighExplosives_Squads";
    case "44":
      return "Playlist_Impact_Solo";
    case "45":
      return "Playlist_Impact_Duos";
    case "46":
      return "Playlist_Impact_Squads";
    case "35":
      return "Playlist_Playground";
    case "30":
      return "Playlist_SkySupply";
    case "42":
      return "Playlist_SkySupply_Duos";
    case "43":
      return "Playlist_SkySupply_Squads";
    case "41":
      return "Playlist_Snipers";
    case "39":
      return "Playlist_Snipers_Solo";
    case "40":
      return "Playlist_Snipers_Duos";
    case "26":
      return "Playlist_SolidGold_Solo";
    case "27":
      return "Playlist_SolidGold_Squads";
    case "28":
      return "Playlist_ShowdownAlt_Solo";
    case "solo":
      return "2";
    case "duo":
      return "10";
    case "squad":
      return "9";
    default:
      return playlist;
  }
}

function GeneratePassword(length) {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}

function ParseDuration(duration) {
  const amount = parseInt(duration.slice(0, -1));
  const unit = duration.slice(-1).toLowerCase();

  if (isNaN(amount)) return null;

  const now = new Date();
  switch (unit) {
    case "h":
      return new Date(now.getTime() + amount * 60 * 60 * 1000);
    case "d":
      return new Date(now.getTime() + amount * 24 * 60 * 60 * 1000);
    case "w":
      return new Date(now.getTime() + amount * 7 * 24 * 60 * 60 * 1000);
    case "m":
      return new Date(now.getTime() + amount * 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

module.exports = {
  sleep,
  GetVersionInfo,
  getContentPages,
  getTournamentInformation,
  getItemShop,
  getOfferID,
  MakeID,
  sendXmppMessageToAll,
  sendXmppMessageToId,
  getPresenceFromUser,
  registerUser,
  createSAC,
  DecodeBase64,
  UpdateTokens,
  getAccountIdData,
  addEliminationHypePoints,
  addVictoryHypePoints,
  deductBusFareHypePoints,
  PlaylistNames,
  GeneratePassword,
  ParseDuration,
};