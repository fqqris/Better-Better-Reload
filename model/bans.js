const mongoose = require("mongoose");
const bansSchema = new mongoose.Schema(
  {
    accountId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    banType: { type: String, required: true, enum: ["matchmaking", "competitive", "shadow", "account"], index: true },
    reason: { type: String, default: "No reason provided" },
    reasonCode: { type: String, default: null },
    description: { type: String, default: "" },
    bannedBy: { type: String, default: "Unknown" },
    bannedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    clearedBy: { type: String, default: null },
    clearedAt: { type: Date, default: null },
    metadata: {
      discordUserId: { type: String, default: null },
      automatic: { type: Boolean, default: false },
      issuedFromPanel: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);
bansSchema.index({ accountId: 1, banType: 1, isActive: 1 });

module.exports = mongoose.models.Bans || mongoose.model("Bans", bansSchema);