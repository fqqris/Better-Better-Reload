const Redis = require("ioredis");
const Profile = require("../model/profiles.js");
const log = require("./log.js");

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const TTL_SECONDS = 45; // short TTL as a safety net; invalidation does the real work

const redis = new Redis(REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 200, 2000),
  maxRetriesPerRequest: 1,
});

let redisHealthy = true;

redis.on("error", (err) => {
  if (redisHealthy) {
    log.error(`ProfileCache: Redis error, falling back to MongoDB only - ${err.message}`);
  }
  redisHealthy = false;
});

redis.on("connect", () => {
  redisHealthy = true;
  log.backend("ProfileCache: Connected to Redis");
});

function cacheKey(accountId) {
  return `profile:${accountId}`;
}
async function getProfile(accountId) {
  if (!accountId) return null;
  const key = cacheKey(accountId);

  if (redisHealthy) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        const doc = Profile.hydrate(data);
        return wrapWithInvalidation(doc, accountId);
      }
    } catch (err) {
      log.error(`ProfileCache: Redis read failed for ${accountId} - ${err.message}`);
    }
  }

  const doc = await Profile.findOne({ accountId });
  if (!doc) return null;

  if (redisHealthy) {
    try {
      await redis.set(key, JSON.stringify(doc.toObject()), "EX", TTL_SECONDS);
    } catch (err) {
      log.error(`ProfileCache: Redis write failed for ${accountId} - ${err.message}`);
    }
  }

  return wrapWithInvalidation(doc, accountId);
}
function wrapWithInvalidation(doc, accountId) {
  const originalUpdateOne = doc.updateOne.bind(doc);
  doc.updateOne = async (...args) => {
    const result = await originalUpdateOne(...args);
    await invalidateProfile(accountId);
    return result;
  };

  const originalSave = doc.save.bind(doc);
  doc.save = async (...args) => {
    const result = await originalSave(...args);
    await invalidateProfile(accountId);
    return result;
  };

  return doc;
}
async function invalidateProfile(accountId) {
  if (!accountId || !redisHealthy) return;
  try {
    await redis.del(cacheKey(accountId));
  } catch (err) {
    log.error(`ProfileCache: Redis invalidate failed for ${accountId} - ${err.message}`);
  }
}

module.exports = { getProfile, invalidateProfile, redis };