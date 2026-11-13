const mongoose = require("mongoose");
const reportsSchema = new mongoose.Schema(
  {
    reporterId: { type: String, required: true, index: true }, 
    reportedId: { type: String, required: true, index: true }, 
    reporterName: { type: String, default: "" },
    reportedName: { type: String, default: "" },
    reason: { type: String, default: "No reason provided" },
    details: { type: String, default: "" },
    gameSessionId: { type: String, default: null },
    playlistName: { type: String, default: null },
    status: { type: String, enum: ["unreviewed", "action_taken", "dismissed"], default: "unreviewed", index: true },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    note: { type: String, default: "" },
  },
  { timestamps: true, collection: "reports" }
);

reportsSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Reports || mongoose.model("Reports", reportsSchema);
