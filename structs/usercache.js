const Redis = require("ioredis");
const User = require("../model/user.js");
const log = require("./log.js");

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const TTL_SECONDS = 30;

const redis = new Redis(REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 200, 2000),
  maxRetriesPerRequest: 1,
  connectTimeout: 2000, 
  enableOfflineQueue: false, 
});

let redisHealthy = false;

redis.on("error", (err) => {
  if (redisHealthy) {
    log.error(`UserCache: Redis error, falling back to MongoDB only - ${err.message}`);
  }
  redisHealthy = false;
});

redis.on("connect", () => {
  redisHealthy = true;
  log.backend("UserCache: Connected to Redis");
});

function cacheKey(accountId) {
  return `user:${accountId}`;
}
async function getUser(accountId) {
  if (!accountId) return null;
  const key = cacheKey(accountId);

  if (redisHealthy) {
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      log.error(`UserCache: Redis read failed for ${accountId} - ${err.message}`);
    }
  }

  const user = await User.findOne({ accountId }).lean();
  if (!user) return null;

  if (redisHealthy) {
    try {
      await redis.set(key, JSON.stringify(user), "EX", TTL_SECONDS);
    } catch (err) {
      log.error(`UserCache: Redis write failed for ${accountId} - ${err.message}`);
    }
  }

  return user;
}
async function invalidateUser(accountId) {
  if (!accountId || !redisHealthy) return;
  try {
    await redis.del(cacheKey(accountId));
  } catch (err) {
    log.error(`UserCache: Redis invalidate failed for ${accountId} - ${err.message}`);
  }
}

module.exports = { getUser, invalidateUser, redis };