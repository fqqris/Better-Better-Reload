const mongoose = require("mongoose");
const matchesSchema = new mongoose.Schema(
  {
    accountId: { type: String, required: true, index: true },
    matchId: { type: String, default: null },
    sessionId: { type: String, default: null, index: true },
    playlist: { type: String, default: null },
    server: { type: String, default: null },
    skin: { type: String, default: null }, 
    killEvents: { type: Number, default: 0 },
    presenceKills: { type: Number, default: 0 },
    reportedKills: { type: Number, default: null }, 
    placement: { type: Number, default: null },
    players: { type: Number, default: null },
    points: { type: Number, default: null },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    state: { type: String, enum: ["in_progress", "finished", "kicked", "abandoned"], default: "in_progress", index: true },
    source: { type: String, default: "matchmaker" },
  },
  { timestamps: true, collection: "matches" }
);

matchesSchema.index({ accountId: 1, startedAt: -1 });

module.exports = mongoose.models.Matches || mongoose.model("Matches", matchesSchema);
